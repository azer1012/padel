import { Router, type Request } from "express";
import crypto from "node:crypto";
import { db, paymentsTable, usersTable, type Tx } from "@workspace/db";
import { and, count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { env } from "../config/env";
import { currentUser, requireAdmin, requireUser } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { HttpError, oneOf, paging, requireId } from "../lib/http";
import { fullName } from "../lib/members";
import {
  orderToPay,
  publicPayment,
  settle,
  settleByRef,
  startPayment,
  tokensToBuy,
} from "../lib/payments";
import { testGateway } from "../lib/payments/test-provider";
import { getSettings } from "../lib/settings";

const router = Router();

/** Where this API answers, as the browser reached it (the test gateway's page lives here). */
const apiBase = (req: Request) => `${req.protocol}://${req.get("host")}/api`;

// ─── A member pays ───────────────────────────────────────────────────────────

/**
 * Buys tokens: a pack on sale (`packageId`) or a number of tokens (`tokens`). The
 * amount is decided here; the answer carries the page to pay on.
 */
router.post("/payments/tokens", requireUser, async (req, res) => {
  const member = currentUser(req);
  const settings = await getSettings();
  const what = await tokensToBuy(settings, req.body ?? {});
  const payment = await startPayment(member, settings, what, {
    returnPath: "/wallet",
    apiBase: apiBase(req),
  });
  res.status(201).json(publicPayment(payment));
});

/** Pays one of the member's own boutique orders, for the order's total. */
router.post("/payments/orders/:orderId", requireUser, async (req, res) => {
  const member = currentUser(req);
  const settings = await getSettings();
  const what = await orderToPay(member, requireId(req.params.orderId, "order"));
  const payment = await startPayment(member, settings, what, {
    returnPath: "/boutique",
    apiBase: apiBase(req),
  });
  res.status(201).json(publicPayment(payment));
});

/** The member's own payment, as it stands. */
async function own(req: Request) {
  const member = currentUser(req);
  const [p] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(eq(paymentsTable.id, requireId(req.params.id)), eq(paymentsTable.userId, member.id)),
    );
  // Somebody else's payment is answered like one that does not exist
  if (!p) throw new HttpError(404, "Payment not found", "NOT_FOUND");
  return p;
}

router.get("/payments/:id", requireUser, async (req, res) => {
  res.json(publicPayment(await own(req)));
});

/** Back from the payment page: the gateway is asked what became of the payment. */
router.post("/payments/:id/verify", requireUser, async (req, res) => {
  const p = await own(req);
  res.json(publicPayment(await settle(p.id)));
});

// ─── The gateway calls back ──────────────────────────────────────────────────
// Nothing is believed from these calls: they only say "ask about this reference".
// The same answer is given whether the reference is known or not.

router.get("/payments/webhook/konnect", async (req, res) => {
  const ref = typeof req.query.payment_ref === "string" ? req.query.payment_ref : "";
  if (ref) await settleByRef("konnect", ref.slice(0, 200));
  res.json({ ok: true });
});

const flouciRef = (req: Request) => {
  const from = (o: unknown) => {
    const v = (o as Record<string, unknown> | undefined)?.payment_id;
    return typeof v === "string" ? v : "";
  };
  return (from(req.query) || from(req.body)).slice(0, 200);
};
router.get("/payments/webhook/flouci", async (req, res) => {
  const ref = flouciRef(req);
  if (ref) await settleByRef("flouci", ref);
  res.json({ ok: true });
});
router.post("/payments/webhook/flouci", async (req, res) => {
  const ref = flouciRef(req);
  if (ref) await settleByRef("flouci", ref);
  res.json({ ok: true });
});

// ─── The stand-in gateway of the test suites ─────────────────────────────────

/** Its "payment page": opening it pays (or fails) the payment and sends the member back. */
router.get("/internal/payments/test/pay", async (req, res) => {
  if (env.paymentProvider !== "test") throw new HttpError(404, "Not found", "NOT_FOUND");
  const q = req.query as Record<string, string>;
  if (!testGateway.open(String(q.ref ?? ""))) throw new HttpError(404, "Not found", "NOT_FOUND");
  const front = (env.frontendUrl ?? "").replace(/\/$/, "");
  const target = String(q.success ?? "");
  // Only back to the club's own site
  res.redirect(302, front && target.startsWith(`${front}/`) ? target : `${front}/`);
});

/** What the next payment opened on that page becomes (browser tests: a payment that fails). */
router.post("/internal/payments/test/next", async (req, res) => {
  if (env.paymentProvider !== "test") throw new HttpError(404, "Not found", "NOT_FOUND");
  const given = Buffer.from(String(req.headers["x-cron-secret"] ?? ""));
  const secret = Buffer.from(env.cronSecret ?? "");
  if (!secret.length || given.length !== secret.length || !crypto.timingSafeEqual(given, secret))
    throw new HttpError(401, "Unauthorized", "UNAUTHORIZED");
  const outcome = oneOf(req.body?.outcome, ["paid", "failed", "expired", "pending"] as const);
  if (!outcome) throw new HttpError(400, "Invalid outcome", "VALIDATION_ERROR");
  testGateway.next(outcome);
  res.json({ next: outcome });
});

// ─── Admin: what was paid online, and what is owed back ──────────────────────

const STATUSES = ["pending", "paid", "failed", "expired", "refund_due", "refunded"] as const;

router.get("/admin/payments", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = paging(q, 30, 100);
  const status = oneOf(q.status, STATUSES);
  const where = status ? eq(paymentsTable.status, status) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(paymentsTable).where(where);
  const refunder = alias(usersTable, "refunder");
  const rows = await db
    .select({ p: paymentsTable, member: usersTable, refunder })
    .from(paymentsTable)
    .innerJoin(usersTable, eq(usersTable.id, paymentsTable.userId))
    .leftJoin(refunder, eq(refunder.id, paymentsTable.refundedBy))
    .where(where)
    .orderBy(desc(paymentsTable.createdAt), desc(paymentsTable.id))
    .limit(limit)
    .offset(offset);
  const [{ due }] = await db
    .select({ due: count() })
    .from(paymentsTable)
    .where(eq(paymentsTable.status, "refund_due"));
  res.json({
    data: rows.map(({ p, member, refunder }) => ({
      ...publicPayment(p),
      provider: p.provider,
      providerRef: p.providerRef,
      failureReason: p.failureReason,
      refundedAt: p.refundedAt,
      refundedBy: refunder ? fullName(refunder) : null,
      member: { id: member.id, name: fullName(member), email: member.email, phone: member.phone },
    })),
    total: Number(total),
    refundDue: Number(due),
    page,
    limit,
  });
});

/**
 * The desk has refunded a payment in the gateway's back-office and says so here. The
 * API never sends money back by itself.
 */
router.post("/admin/payments/:id/refunded", requireAdmin, async (req, res) => {
  const admin = currentUser(req);
  const id = requireId(req.params.id);
  const row = await db.transaction(async (tx: Tx) => {
    const [locked] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, id))
      .for("update");
    if (!locked) throw new HttpError(404, "Payment not found", "NOT_FOUND");
    if (locked.status === "refunded") return { payment: locked, changed: false };
    if (locked.status !== "refund_due")
      throw new HttpError(400, "This payment has nothing to refund", "NOTHING_TO_REFUND");
    const [updated] = await tx
      .update(paymentsTable)
      .set({
        status: "refunded",
        refundedAt: new Date(),
        refundedBy: admin.id,
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, id))
      .returning();
    return { payment: updated, changed: true };
  });
  if (row.changed) {
    const [member] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, row.payment.userId));
    await logActivity(
      req,
      "payment_received",
      `Online payment #${id} refunded · ${row.payment.amount} ${row.payment.currency}`,
      member,
    );
  }
  res.json(publicPayment(row.payment));
});

export default router;
