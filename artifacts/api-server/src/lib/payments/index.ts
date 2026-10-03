import {
  activityTable,
  db,
  paymentsTable,
  shopOrdersTable,
  tokenPackagesTable,
  usersTable,
  type Payment,
  type Tx,
} from "@workspace/db";
import { and, eq, gt, lt } from "drizzle-orm";
import { env } from "../../config/env";
import type { DbUser } from "../auth";
import { HttpError } from "../http";
import { moveTokens } from "../ledger";
import { logger } from "../logger";
import { fullName } from "../members";
import { notifyLater } from "../notify";
import type { ClubSettings } from "../settings";
import { flouci } from "./flouci";
import { konnect } from "./konnect";
import type { PaymentProvider, ProviderName } from "./provider";
import { testProvider } from "./test-provider";

/**
 * Online payment (docs/ONLINE_PAYMENT.md): tokens bought, or a boutique order paid,
 * through the club's own gateway account.
 *
 * What never changes, whatever the gateway:
 *  - the amount is decided here, from the club's packs, token price or the order;
 *  - a payment is settled only on the gateway's own answer to the API (`settle`),
 *    never on what a browser or a callback says;
 *  - the amount the gateway reports must be the amount asked;
 *  - tokens are credited once: the payment row is locked, and the ledger entry
 *    carries a key that can exist once.
 */

/** Both gateways charge in Tunisian dinars. */
const CURRENCY = "TND";
/** A payment the member never finished is closed after this long. */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
/** A page still open is offered again instead of opening a second payment. */
const REUSE_MS = 15 * 60 * 1000;

const providers = new Map<ProviderName, PaymentProvider>();
/** The gateway of a name. A payment keeps the gateway it was opened with. */
function providerOf(name: ProviderName, apiBase?: string): PaymentProvider {
  let p = providers.get(name);
  if (!p) {
    p =
      name === "konnect"
        ? konnect(env.konnect)
        : name === "flouci"
          ? flouci(env.flouci)
          : testProvider(apiBase ?? `http://127.0.0.1:${env.port ?? 3000}/api`);
    providers.set(name, p);
  }
  return p;
}

/** Whether members can pay online at this club, and through which gateway. */
export function onlinePayment(settings: ClubSettings) {
  const provider = env.paymentProvider;
  const enabled = !!provider && settings.onlinePaymentEnabled && settings.currency === CURRENCY;
  return { enabled, provider: enabled ? provider : null };
}

function assertOnline(settings: ClubSettings): ProviderName {
  const { enabled, provider } = onlinePayment(settings);
  if (!enabled || !provider)
    throw new HttpError(
      403,
      "Online payment is not available at this club: pay at the front desk",
      "FEATURE_DISABLED",
    );
  return provider;
}

/** What a member may know of their payment (never the gateway's reference). */
export function publicPayment(p: Payment) {
  return {
    id: p.id,
    purpose: p.purpose,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    tokens: p.tokens,
    shopOrderId: p.shopOrderId,
    checkoutUrl: p.status === "pending" ? p.checkoutUrl : null,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
  };
}

type What =
  | { purpose: "tokens"; tokens: number; packageId: number | null; amount: number; label: string }
  | { purpose: "shop_order"; shopOrderId: number; amount: number; label: string };

/** A pack on sale, at its price; or a number of tokens at the club's token price. */
export async function tokensToBuy(
  settings: ClubSettings,
  body: { packageId?: unknown; tokens?: unknown },
): Promise<What> {
  if (body.packageId !== undefined && body.packageId !== null && body.packageId !== "") {
    const id = Number(body.packageId);
    const [pack] = Number.isInteger(id)
      ? await db.select().from(tokenPackagesTable).where(eq(tokenPackagesTable.id, id))
      : [];
    if (!pack || !pack.isActive)
      throw new HttpError(400, "This pack is not on sale", "PACKAGE_UNAVAILABLE");
    return {
      purpose: "tokens",
      tokens: pack.tokens,
      packageId: pack.id,
      amount: pack.price,
      label: `${pack.name} (${pack.tokens} tokens)`,
    };
  }
  const tokens = Number(body.tokens);
  if (!Number.isInteger(tokens) || tokens < 1 || tokens > 1000)
    throw new HttpError(400, "Choose a pack or a number of tokens", "VALIDATION_ERROR");
  if (tokens < settings.tokenMinPurchase)
    throw new HttpError(
      400,
      `Minimum purchase is ${settings.tokenMinPurchase} tokens`,
      "BELOW_MIN_PURCHASE",
      { tokenMinPurchase: settings.tokenMinPurchase },
    );
  if (!(settings.tokenUnitPrice > 0))
    throw new HttpError(400, "Single tokens are not sold online at this club", "VALIDATION_ERROR");
  return {
    purpose: "tokens",
    tokens,
    packageId: null,
    amount: Math.round(tokens * settings.tokenUnitPrice * 100) / 100,
    label: `${tokens} tokens`,
  };
}

/** The member's own order, still to be paid. */
export async function orderToPay(member: DbUser, orderId: number): Promise<What> {
  const [order] = await db
    .select()
    .from(shopOrdersTable)
    .where(and(eq(shopOrdersTable.id, orderId), eq(shopOrdersTable.userId, member.id)));
  // Somebody else's order is answered like one that does not exist
  if (!order) throw new HttpError(404, "Order not found", "NOT_FOUND");
  if (order.paidOnlineAt) throw new HttpError(409, "This order is already paid", "ALREADY_PAID");
  if (order.status === "cancelled" || order.status === "delivered")
    throw new HttpError(400, "This order can no longer be paid online", "ORDER_CLOSED");
  return {
    purpose: "shop_order",
    shopOrderId: order.id,
    amount: order.total,
    label: `Order #${order.id}`,
  };
}

/**
 * Opens a payment page for the member and returns it. A page opened a moment ago
 * for the very same thing is given again: a double tap opens one payment.
 */
export async function startPayment(
  member: DbUser,
  settings: ClubSettings,
  what: What,
  opts: { returnPath: string; apiBase: string },
): Promise<Payment> {
  const name = assertOnline(settings);
  if (!(what.amount > 0)) throw new HttpError(400, "Nothing to pay", "VALIDATION_ERROR");

  const same = and(
    eq(paymentsTable.userId, member.id),
    eq(paymentsTable.status, "pending"),
    eq(paymentsTable.provider, name),
    eq(paymentsTable.purpose, what.purpose),
    eq(paymentsTable.amount, what.amount),
    gt(paymentsTable.createdAt, new Date(Date.now() - REUSE_MS)),
    what.purpose === "tokens"
      ? eq(paymentsTable.tokens, what.tokens)
      : eq(paymentsTable.shopOrderId, what.shopOrderId),
  );
  const [open] = await db.select().from(paymentsTable).where(same);
  if (open?.checkoutUrl) return open;

  const [row] = await db
    .insert(paymentsTable)
    .values({
      userId: member.id,
      provider: name,
      purpose: what.purpose,
      amount: what.amount,
      currency: CURRENCY,
      tokens: what.purpose === "tokens" ? what.tokens : null,
      packageId: what.purpose === "tokens" ? what.packageId : null,
      shopOrderId: what.purpose === "shop_order" ? what.shopOrderId : null,
    })
    .returning();

  const front = (env.frontendUrl ?? "").replace(/\/$/, "");
  const back = `${front}${opts.returnPath}${opts.returnPath.includes("?") ? "&" : "?"}payment=${row.id}`;
  try {
    const { ref, url } = await providerOf(name, opts.apiBase).init({
      paymentId: row.id,
      amount: what.amount,
      description: `${env.clubName} · ${what.label}`,
      successUrl: back,
      failUrl: back,
      webhookUrl: env.apiPublicUrl
        ? `${env.apiPublicUrl.replace(/\/$/, "")}/api/payments/webhook/${name}`
        : null,
      customer: {
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
      },
    });
    const [ready] = await db
      .update(paymentsTable)
      .set({ providerRef: ref, checkoutUrl: url, updatedAt: new Date() })
      .where(eq(paymentsTable.id, row.id))
      .returning();
    return ready;
  } catch (err) {
    // The gateway did not open a page: nothing can be paid on this row
    await db
      .update(paymentsTable)
      .set({ status: "failed", failureReason: "INIT_FAILED", updatedAt: new Date() })
      .where(eq(paymentsTable.id, row.id));
    if (err instanceof HttpError) throw err;
    logger.error({ err, provider: name }, "payment gateway refused to open a payment");
    throw new HttpError(
      502,
      "The payment service did not answer: nothing was charged, try again",
      "PAYMENT_PROVIDER_ERROR",
    );
  }
}

/** Credits the tokens of a paid payment, or marks its order paid (inside the settling transaction). */
async function fulfil(tx: Tx, p: Payment) {
  if (p.purpose === "tokens") {
    const [pack] = p.packageId
      ? await tx.select().from(tokenPackagesTable).where(eq(tokenPackagesTable.id, p.packageId))
      : [];
    const moved = await moveTokens(tx, {
      userId: p.userId,
      delta: p.tokens ?? 0,
      type: "credit",
      description: `Online purchase · ${pack ? `${pack.name} (${pack.tokens} tokens)` : `${p.tokens} tokens`}`,
      notes: `${p.provider} · ${p.amount} ${p.currency}`,
      // The ledger refuses a second entry with this key: paid once, credited once
      idempotencyKey: `payment:${p.id}`,
      packageId: p.packageId,
    });
    return {
      status: "paid" as const,
      tokenTransactionId: moved.row.id,
      balance: moved.balanceAfter,
    };
  }
  const [order] = await tx
    .select()
    .from(shopOrdersTable)
    .where(eq(shopOrdersTable.id, p.shopOrderId as number))
    .for("update");
  // Paid after the desk cancelled it, or paid a second time on another page: the money
  // is owed back
  if (!order || order.status === "cancelled" || order.paidOnlineAt)
    return { status: "refund_due" as const, tokenTransactionId: null, balance: null };
  await tx
    .update(shopOrdersTable)
    .set({ paidOnlineAt: new Date(), updatedAt: new Date() })
    .where(eq(shopOrdersTable.id, order.id));
  return { status: "paid" as const, tokenTransactionId: null, balance: null };
}

/**
 * Asks the gateway what became of a payment and applies it. Safe to call as often as
 * wanted (the member returning, the gateway's callback, the scheduler): a payment
 * already settled is returned as it is.
 */
export async function settle(paymentId: number): Promise<Payment> {
  const [p] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
  if (!p) throw new HttpError(404, "Payment not found", "NOT_FOUND");
  if (p.status !== "pending" || !p.providerRef) return p;

  const remote = await providerOf(p.provider).status(p.providerRef);
  const tooOld = Date.now() - p.createdAt.getTime() > PENDING_TTL_MS;
  if (remote.status === "pending" && !tooOld) return p;

  const result = await db.transaction(async (tx: Tx) => {
    const [locked] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, p.id))
      .for("update");
    if (!locked || locked.status !== "pending") return { payment: locked ?? p, credited: null };

    const close = async (status: Payment["status"], failureReason: string | null = null) => {
      const [row] = await tx
        .update(paymentsTable)
        .set({ status, failureReason, updatedAt: new Date() })
        .where(eq(paymentsTable.id, locked.id))
        .returning();
      return { payment: row, credited: null };
    };
    if (remote.status !== "paid")
      return close(remote.status === "failed" ? "failed" : "expired", null);
    // The gateway must have charged what was asked, to the millime
    if (remote.amount === null || Math.abs(remote.amount - locked.amount) > 0.0005) {
      logger.error(
        { paymentId: locked.id, asked: locked.amount, reported: remote.amount },
        "payment gateway reported another amount: nothing credited",
      );
      return close("failed", "AMOUNT_MISMATCH");
    }

    const done = await fulfil(tx, locked);
    const [row] = await tx
      .update(paymentsTable)
      .set({
        status: done.status,
        paidAt: new Date(),
        tokenTransactionId: done.tokenTransactionId,
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, locked.id))
      .returning();
    const [member] = await tx.select().from(usersTable).where(eq(usersTable.id, locked.userId));
    await tx.insert(activityTable).values({
      type: "payment_received",
      message:
        locked.purpose === "tokens"
          ? `Online payment · ${locked.tokens} token(s) · ${locked.amount} ${locked.currency} (${locked.provider})`
          : `Online payment · shop order #${locked.shopOrderId} · ${locked.amount} ${locked.currency} (${locked.provider})${done.status === "refund_due" ? " · to refund: the order was cancelled" : ""}`,
      userId: locked.userId,
      userName: member ? fullName(member) : null,
    });
    return { payment: row, credited: done.balance };
  });

  if (result.credited !== null && result.payment.tokens)
    notifyLater(
      result.payment.userId,
      {
        kind: "tokens_added",
        amount: result.payment.tokens,
        balance: result.credited,
        reason: "Online purchase",
      },
      `payment:${result.payment.id}`,
    );
  return result.payment;
}

/** The gateway calls back with its reference: an unknown one is answered like a known one. */
export async function settleByRef(provider: ProviderName, ref: string) {
  const [p] = await db
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.provider, provider), eq(paymentsTable.providerRef, ref)));
  if (p) await settle(p.id);
}

/**
 * Scheduler: payments left pending are asked again (a member who closed the tab, a
 * callback that never came), and closed after a day.
 */
export async function reconcilePayments(now = new Date()) {
  const pending = await db
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.status, "pending"),
        // Not the ones opened this very minute: the member is still on the payment page
        lt(paymentsTable.createdAt, new Date(now.getTime() - 60_000)),
      ),
    )
    .limit(100);
  let settled = 0;
  for (const p of pending) {
    try {
      if ((await settle(p.id)).status !== "pending") settled++;
    } catch (err) {
      logger.warn({ err: String(err), paymentId: p.id }, "payment could not be checked");
    }
  }
  return settled;
}

/**
 * A boutique order is cancelled (inside the desk's transaction): what was paid online
 * for it is owed back to the member. Returns the payment to refund, if any.
 */
export async function refundDueFor(tx: Tx, orderId: number): Promise<Payment | null> {
  const [paid] = await tx
    .update(paymentsTable)
    .set({ status: "refund_due", updatedAt: new Date() })
    .where(and(eq(paymentsTable.shopOrderId, orderId), eq(paymentsTable.status, "paid")))
    .returning();
  return paid ?? null;
}
