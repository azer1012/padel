import { Router } from "express";
import {
  db,
  shopOrderItemsTable,
  shopOrdersTable,
  shopProductsTable,
  usersTable,
  type ShopOrderStatus,
  type Tx,
} from "@workspace/db";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { currentUser, requireAdmin, requireUser } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { fullName } from "../lib/members";
import { notifyLater } from "../lib/notify";
import { getSettings } from "../lib/settings";
import {
  HttpError,
  cleanImageUrl,
  cleanText,
  oneOf,
  paging,
  pgCode,
  requireId,
  toMoney,
  type Body,
} from "../lib/http";

const router = Router();

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
/** Same rule as a member's profile phone. */
const PHONE = /^[+\d][\d\s().-]{5,29}$/;
const MAX_LINES = 20;
const MAX_QUANTITY = 20;
/**
 * Orders waiting for the club's call that one member may have at once. An order takes
 * its articles out of stock before anybody has paid: without a limit, one account
 * could empty the shelves with orders nobody confirms.
 */
const MAX_PENDING_ORDERS = 3;

/** One line of text: what goes into an e-mail subject or a push never spans lines. */
const oneLine = (s: string | null) => (s === null ? null : s.replace(/\s+/g, " "));

/**
 * What staff may do with an order. The club first calls the member (pending →
 * confirmed), then sends the order or hands it over; a delivered or cancelled order
 * is closed.
 */
const NEXT: Record<ShopOrderStatus, ShopOrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "delivered", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

async function assertShopOpen() {
  if (!(await getSettings()).shopEnabled)
    throw new HttpError(403, "The shop is not available at this club", "FEATURE_DISABLED");
}

const round = (n: number) => Math.round(n * 100) / 100;

// ─── Catalogue (public) ──────────────────────────────────────────────────────

router.get("/shop/products", async (_req, res) => {
  if (!(await getSettings()).shopEnabled) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(shopProductsTable)
    .where(eq(shopProductsTable.isActive, true))
    .orderBy(asc(shopProductsTable.sortOrder), asc(shopProductsTable.name));
  res.json(
    rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      price: p.price,
      stock: p.stock,
      imageUrl: p.imageUrl,
    })),
  );
});

// ─── Orders of the signed-in member ──────────────────────────────────────────

/** The lines of a cart: product ids and whole quantities, the same product once. */
function parseLines(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0)
    throw new HttpError(400, "The cart is empty", "VALIDATION_ERROR");
  const merged = new Map<number, number>();
  for (const line of raw as { productId?: unknown; quantity?: unknown }[]) {
    const productId = requireId(line?.productId, "product");
    const quantity = Number(line?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
      throw new HttpError(
        400,
        `Quantity must be between 1 and ${MAX_QUANTITY}`,
        "VALIDATION_ERROR",
      );
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  if (merged.size > MAX_LINES)
    throw new HttpError(400, "Too many different articles in one order", "VALIDATION_ERROR");
  for (const quantity of merged.values())
    if (quantity > MAX_QUANTITY)
      throw new HttpError(
        400,
        `Quantity must be between 1 and ${MAX_QUANTITY}`,
        "VALIDATION_ERROR",
      );
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

const withItems = { items: true } as const;

/**
 * Place an order. Prices, the total and the stock are decided here, never taken from
 * the request: the browser only says which articles and how many.
 */
router.post("/shop/orders", requireUser, async (req, res) => {
  await assertShopOpen();
  const member = currentUser(req);
  const b: Body = req.body ?? {};
  const lines = parseLines(b?.items);
  const deliveryMethod = oneOf(b?.deliveryMethod, ["delivery", "pickup"] as const);
  if (!deliveryMethod)
    throw new HttpError(400, "Choose delivery or pick-up at the club", "VALIDATION_ERROR");
  const contactPhone = oneLine(cleanText(b?.contactPhone, 30) ?? member.phone);
  if (!contactPhone || !PHONE.test(contactPhone))
    throw new HttpError(
      400,
      "A phone number is required: the club calls you to confirm the order",
      "PHONE_REQUIRED",
    );
  const contactName = oneLine(cleanText(b?.contactName, 120)) ?? fullName(member);
  const address = cleanText(b?.address, 300);
  const city = cleanText(b?.city, 80);
  if (deliveryMethod === "delivery" && !address)
    throw new HttpError(400, "A delivery address is required", "ADDRESS_REQUIRED");
  const notes = cleanText(b?.notes, 500);
  const idempotencyKey = cleanText(b?.idempotencyKey, 100);
  const { currency } = await getSettings();

  const mine = (key: string) =>
    db.query.shopOrdersTable.findFirst({
      where: and(eq(shopOrdersTable.idempotencyKey, key), eq(shopOrdersTable.userId, member.id)),
      with: withItems,
    });
  if (idempotencyKey) {
    const already = await mine(idempotencyKey);
    if (already) {
      res.json(already);
      return;
    }
  }

  let orderId: number;
  let total = 0;
  let units = 0;
  try {
    orderId = await db.transaction(async (tx: Tx) => {
      // The member's row is locked first: two checkouts of one member are counted in turn
      await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, member.id))
        .for("no key update");
      const [{ waiting }] = await tx
        .select({ waiting: count() })
        .from(shopOrdersTable)
        .where(and(eq(shopOrdersTable.userId, member.id), eq(shopOrdersTable.status, "pending")));
      if (Number(waiting) >= MAX_PENDING_ORDERS)
        throw new HttpError(
          409,
          `You already have ${MAX_PENDING_ORDERS} orders waiting for the club's call`,
          "TOO_MANY_PENDING_ORDERS",
          { limit: MAX_PENDING_ORDERS },
        );
      // Locked in id order: two members after the last unit are served one after the other
      const products = await tx
        .select()
        .from(shopProductsTable)
        .where(
          inArray(
            shopProductsTable.id,
            lines.map((l) => l.productId),
          ),
        )
        .orderBy(asc(shopProductsTable.id))
        .for("update");
      const priced = lines.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product || !product.isActive)
          throw new HttpError(409, "An article of your cart is no longer on sale", "PRODUCT_GONE", {
            productId: line.productId,
          });
        if (product.stock < line.quantity)
          throw new HttpError(
            409,
            `Only ${product.stock} left of ${product.name}`,
            "OUT_OF_STOCK",
            { productId: product.id, name: product.name, available: product.stock },
          );
        return { ...line, product };
      });
      total = round(priced.reduce((sum, l) => sum + l.product.price * l.quantity, 0));
      units = priced.reduce((sum, l) => sum + l.quantity, 0);

      const [order] = await tx
        .insert(shopOrdersTable)
        .values({
          userId: member.id,
          total,
          currency,
          deliveryMethod,
          contactName,
          contactPhone,
          address: deliveryMethod === "delivery" ? address : null,
          city: deliveryMethod === "delivery" ? city : null,
          notes,
          idempotencyKey,
        })
        .returning({ id: shopOrdersTable.id });
      await tx.insert(shopOrderItemsTable).values(
        priced.map((l) => ({
          orderId: order.id,
          productId: l.product.id,
          productName: l.product.name,
          unitPrice: l.product.price,
          quantity: l.quantity,
        })),
      );
      for (const l of priced)
        await tx
          .update(shopProductsTable)
          .set({ stock: sql`${shopProductsTable.stock} - ${l.quantity}`, updatedAt: new Date() })
          .where(eq(shopProductsTable.id, l.product.id));
      return order.id;
    });
  } catch (err) {
    // The same checkout sent twice at the same instant: the second insert lost the race
    if (pgCode(err) === "23505" && idempotencyKey) {
      const already = await mine(idempotencyKey);
      if (already) {
        res.json(already);
        return;
      }
      // The key belongs to an order of another account: never theirs, never a 500
      throw new HttpError(409, "This checkout was already used: try again", "DUPLICATE_REQUEST");
    }
    throw err;
  }

  await logActivity(
    req,
    "order_updated",
    `Shop order #${orderId} placed · ${units} article(s) · ${total} ${currency}`,
    member,
  );
  notifyLater(
    member,
    { kind: "order_update", orderId, status: "pending", total, currency },
    `order:${orderId}:pending`,
  );
  const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  for (const admin of admins)
    notifyLater(
      admin,
      {
        kind: "order_placed",
        orderId,
        customer: contactName,
        phone: contactPhone,
        total,
        currency,
        units,
      },
      `order:${orderId}`,
    );

  const order = await db.query.shopOrdersTable.findFirst({
    where: eq(shopOrdersTable.id, orderId),
    with: withItems,
  });
  res.status(201).json(order);
});

router.get("/shop/orders", requireUser, async (req, res) => {
  const member = currentUser(req);
  const orders = await db.query.shopOrdersTable.findMany({
    where: eq(shopOrdersTable.userId, member.id),
    with: withItems,
    orderBy: [desc(shopOrdersTable.createdAt), desc(shopOrdersTable.id)],
    limit: 50,
  });
  // Staff notes stay with staff
  res.json(orders.map(({ adminNotes: _staffOnly, handledBy: _admin, ...order }) => order));
});

/** Gives the stock of a cancelled order back (inside the caller's transaction). */
async function restock(tx: Tx, orderId: number) {
  const items = await tx
    .select()
    .from(shopOrderItemsTable)
    .where(eq(shopOrderItemsTable.orderId, orderId))
    .orderBy(asc(shopOrderItemsTable.productId));
  for (const item of items)
    await tx
      .update(shopProductsTable)
      .set({ stock: sql`${shopProductsTable.stock} + ${item.quantity}`, updatedAt: new Date() })
      .where(eq(shopProductsTable.id, item.productId));
}

/** A member may cancel their own order until the club has confirmed it. */
router.post("/shop/orders/:id/cancel", requireUser, async (req, res) => {
  const id = requireId(req.params.id);
  const member = currentUser(req);
  const order = await db.transaction(async (tx: Tx) => {
    const [locked] = await tx
      .select()
      .from(shopOrdersTable)
      .where(and(eq(shopOrdersTable.id, id), eq(shopOrdersTable.userId, member.id)))
      .for("update");
    // Somebody else's order is answered like one that does not exist
    if (!locked) throw new HttpError(404, "Order not found", "NOT_FOUND");
    if (locked.status === "cancelled")
      throw new HttpError(400, "This order is already cancelled", "ALREADY_CANCELLED");
    if (locked.status !== "pending")
      throw new HttpError(
        400,
        "The club has confirmed this order: call the club to change it",
        "ORDER_CONFIRMED",
      );
    await restock(tx, id);
    const [updated] = await tx
      .update(shopOrdersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(shopOrdersTable.id, id))
      .returning();
    return updated;
  });
  await logActivity(req, "order_updated", `Shop order #${id} cancelled by the member`, member);
  const { adminNotes: _staffOnly, handledBy: _admin, ...mine } = order;
  res.json(mine);
});

// ─── Admin: catalogue ────────────────────────────────────────────────────────

function parseProduct(body: Body, creating: boolean) {
  const out: Partial<typeof shopProductsTable.$inferInsert> = {};
  if (creating || body?.name !== undefined) {
    const name = cleanText(body?.name, 120);
    if (!name) throw new HttpError(400, "Name is required", "VALIDATION_ERROR");
    out.name = name;
  }
  if (body?.description !== undefined) out.description = cleanText(body.description, 2000);
  if (body?.category !== undefined) out.category = cleanText(body.category, 40) ?? "accessory";
  if (creating || body?.price !== undefined) {
    const price = toMoney(body?.price, 100_000);
    // An article at 0 would be given away by any member who orders it
    if (price === null || price <= 0) throw new HttpError(400, "Invalid price", "VALIDATION_ERROR");
    out.price = price;
  }
  if (body?.stock !== undefined) {
    const stock = Number(body.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100_000)
      throw new HttpError(400, "Stock must be a whole number", "VALIDATION_ERROR");
    out.stock = stock;
  }
  if (body?.imageUrl !== undefined) out.imageUrl = cleanImageUrl(body.imageUrl);
  if (typeof body?.isActive === "boolean") out.isActive = body.isActive;
  if (body?.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000)
      throw new HttpError(400, "Invalid display order", "VALIDATION_ERROR");
    out.sortOrder = sortOrder;
  }
  return out;
}

router.get("/admin/shop/products", requireAdmin, async (_req, res) => {
  res.json(
    await db
      .select()
      .from(shopProductsTable)
      .orderBy(asc(shopProductsTable.sortOrder), asc(shopProductsTable.name)),
  );
});

router.post("/admin/shop/products", requireAdmin, async (req, res) => {
  const [row] = await db
    .insert(shopProductsTable)
    .values(parseProduct(req.body, true) as typeof shopProductsTable.$inferInsert)
    .returning();
  await logActivity(req, "shop_updated", `Shop article "${row.name}" created`);
  res.status(201).json(row);
});

/**
 * `stockWas`: the stock the admin saw when they opened the article. Orders take stock
 * while the form is open; if it moved, the new figure would undo those orders (and
 * oversell), so the change is refused and the admin sees the current stock.
 */
router.patch("/admin/shop/products/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const patch = parseProduct(req.body, false);
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update", "VALIDATION_ERROR");
  const stockWas = req.body?.stockWas;
  const row = await db.transaction(async (tx: Tx) => {
    const [locked] = await tx
      .select({ stock: shopProductsTable.stock })
      .from(shopProductsTable)
      .where(eq(shopProductsTable.id, id))
      .for("update");
    if (!locked) throw new HttpError(404, "Article not found", "NOT_FOUND");
    if (patch.stock !== undefined && stockWas !== undefined && Number(stockWas) !== locked.stock)
      throw new HttpError(
        409,
        `The stock changed while you were editing: ${locked.stock} now`,
        "STOCK_CHANGED",
        { stock: locked.stock },
      );
    const [updated] = await tx
      .update(shopProductsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(shopProductsTable.id, id))
      .returning();
    return updated;
  });
  await logActivity(req, "shop_updated", `Shop article "${row.name}" updated`);
  res.json(row);
});

/** An article that was ever ordered is taken off sale instead of deleted: past orders stay readable. */
router.delete("/admin/shop/products/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const archive = async () => {
    const [row] = await db
      .update(shopProductsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(shopProductsTable.id, id))
      .returning();
    if (row) await logActivity(req, "shop_updated", `Shop article "${row.name}" archived`);
    res.json({ archived: true });
  };
  const [ordered] = await db
    .select({ id: shopOrderItemsTable.id })
    .from(shopOrderItemsTable)
    .where(eq(shopOrderItemsTable.productId, id))
    .limit(1);
  if (ordered) {
    await archive();
    return;
  }
  try {
    const [row] = await db
      .delete(shopProductsTable)
      .where(eq(shopProductsTable.id, id))
      .returning();
    if (row) await logActivity(req, "shop_updated", `Shop article "${row.name}" deleted`);
    res.status(204).end();
  } catch (err) {
    // Ordered between the check and the delete: the order keeps its article
    if (pgCode(err) !== "23503") throw err;
    await archive();
  }
});

// ─── Admin: orders ───────────────────────────────────────────────────────────

router.get("/admin/shop/orders", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = paging(q, 30, 100);
  const status = oneOf(q.status, STATUSES);
  // "open": every order the club still has something to do with
  const where =
    q.status === "open"
      ? inArray(shopOrdersTable.status, ["pending", "confirmed", "shipped"])
      : status
        ? eq(shopOrdersTable.status, status)
        : undefined;
  const [{ total }] = await db.select({ total: count() }).from(shopOrdersTable).where(where);
  const data = await db.query.shopOrdersTable.findMany({
    where,
    with: { items: true, user: true },
    orderBy: [desc(shopOrdersTable.createdAt), desc(shopOrdersTable.id)],
    limit,
    offset,
  });
  const [{ pending }] = await db
    .select({ pending: count() })
    .from(shopOrdersTable)
    .where(eq(shopOrdersTable.status, "pending"));
  res.json({
    data: data.map(({ user, ...order }) => ({
      ...order,
      member: user ? { id: user.id, name: fullName(user), email: user.email } : null,
    })),
    total: Number(total),
    pending: Number(pending),
    page,
    limit,
  });
});

/** Move an order on (after the phone call, when it leaves, when it arrives) or cancel it. */
router.patch("/admin/shop/orders/:id", requireAdmin, async (req, res) => {
  const id = requireId(req.params.id);
  const admin = currentUser(req);
  const status = req.body?.status === undefined ? undefined : oneOf(req.body.status, STATUSES);
  if (status === null) throw new HttpError(400, "Invalid status", "VALIDATION_ERROR");
  const adminNotes =
    req.body?.adminNotes === undefined ? undefined : cleanText(req.body.adminNotes, 1000);
  if (status === undefined && adminNotes === undefined)
    throw new HttpError(400, "Nothing to update", "VALIDATION_ERROR");

  const { order, moved } = await db.transaction(async (tx: Tx) => {
    const [locked] = await tx
      .select()
      .from(shopOrdersTable)
      .where(eq(shopOrdersTable.id, id))
      .for("update");
    if (!locked) throw new HttpError(404, "Order not found", "NOT_FOUND");
    const moving = status !== undefined && status !== locked.status;
    if (moving && !NEXT[locked.status].includes(status))
      throw new HttpError(
        400,
        `An order that is ${locked.status} cannot become ${status}`,
        "INVALID_TRANSITION",
        { from: locked.status, allowed: NEXT[locked.status] },
      );
    if (moving && status === "cancelled") await restock(tx, id);
    const [updated] = await tx
      .update(shopOrdersTable)
      .set({
        ...(moving ? { status, handledBy: admin.id } : {}),
        ...(adminNotes !== undefined ? { adminNotes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(shopOrdersTable.id, id))
      .returning();
    return { order: updated, moved: moving };
  });

  if (moved) {
    const [member] = await db.select().from(usersTable).where(eq(usersTable.id, order.userId));
    await logActivity(req, "order_updated", `Shop order #${id} is now ${order.status}`, member);
    if (member)
      notifyLater(
        member,
        {
          kind: "order_update",
          orderId: id,
          status: order.status,
          total: order.total,
          currency: order.currency,
        },
        `order:${id}:${order.status}`,
      );
  }
  res.json(order);
});

export default router;
