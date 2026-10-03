import { Router } from "express";
import {
  db,
  paymentsTable,
  reservationPlayersTable,
  reservationsTable,
  shopOrdersTable,
  terrainsTable,
  tokenTransactionsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "../lib/auth";
import { addDays, clubInstant, clubParts, formatClubStamp, isClubDate } from "../lib/club-time";
import { HttpError } from "../lib/http";
import { fullName } from "../lib/members";
import { getSettings } from "../lib/settings";

const router = Router();

type Line = {
  /** When the desk took the money. */
  at: Date;
  kind: "tokens" | "spot" | "order" | "online";
  /** What was paid for, in the API's fixed wording (translated by the screen). */
  label: string;
  member: string;
  /** The admin who took it. */
  operator: string | null;
  amount: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The cash the desk took between two club dates (included): tokens sold, spots paid
 * at the club, boutique orders handed over. One line per payment, with the member
 * and the admin who took it, and the totals. Read from what was recorded when the
 * money was taken, never recomputed from today's prices.
 */
router.get("/admin/reports/cash", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const today = clubParts(new Date()).date;
  const from = isClubDate(q.from) ? q.from : today;
  const to = isClubDate(q.to) ? q.to : from;
  if (from > to || addDays(from, 366) < to)
    throw new HttpError(400, "Invalid date range", "VALIDATION_ERROR");
  const start = clubInstant(from, 0);
  const end = clubInstant(addDays(to, 1), 0);
  const { currency } = await getSettings();

  const operator = alias(usersTable, "operator");
  const [sales, spots, orders, online] = await Promise.all([
    db
      .select({ t: tokenTransactionsTable, member: usersTable, operator })
      .from(tokenTransactionsTable)
      .innerJoin(usersTable, eq(usersTable.id, tokenTransactionsTable.userId))
      .leftJoin(operator, eq(operator.id, tokenTransactionsTable.adminId))
      .where(
        and(
          isNotNull(tokenTransactionsTable.cashAmount),
          gte(tokenTransactionsTable.createdAt, start),
          lt(tokenTransactionsTable.createdAt, end),
        ),
      ),
    db
      .select({
        p: reservationPlayersTable,
        member: usersTable,
        operator,
        startTime: reservationsTable.startTime,
        court: terrainsTable.name,
      })
      .from(reservationPlayersTable)
      .innerJoin(usersTable, eq(usersTable.id, reservationPlayersTable.userId))
      .innerJoin(reservationsTable, eq(reservationsTable.id, reservationPlayersTable.reservationId))
      .innerJoin(terrainsTable, eq(terrainsTable.id, reservationsTable.terrainId))
      .leftJoin(operator, eq(operator.id, reservationPlayersTable.paidBy))
      .where(
        and(
          eq(reservationPlayersTable.paymentType, "cash_club"),
          eq(reservationPlayersTable.paymentStatus, "paid"),
          isNotNull(reservationPlayersTable.paidAt),
          gte(reservationPlayersTable.paidAt, start),
          lt(reservationPlayersTable.paidAt, end),
        ),
      ),
    db
      .select({ o: shopOrdersTable, member: usersTable, operator })
      .from(shopOrdersTable)
      .innerJoin(usersTable, eq(usersTable.id, shopOrdersTable.userId))
      .leftJoin(operator, eq(operator.id, shopOrdersTable.handledBy))
      .where(
        and(
          eq(shopOrdersTable.status, "delivered"),
          // An order paid online brought no cash to the desk: it is in the online lines
          isNull(shopOrdersTable.paidOnlineAt),
          isNotNull(shopOrdersTable.deliveredAt),
          gte(shopOrdersTable.deliveredAt, start),
          lt(shopOrdersTable.deliveredAt, end),
        ),
      ),
    // Paid through the gateway (kept apart: it never passed through the desk). A payment
    // owed back or refunded is no longer money the club keeps.
    db
      .select({ p: paymentsTable, member: usersTable })
      .from(paymentsTable)
      .innerJoin(usersTable, eq(usersTable.id, paymentsTable.userId))
      .where(
        and(
          eq(paymentsTable.status, "paid"),
          isNotNull(paymentsTable.paidAt),
          gte(paymentsTable.paidAt, start),
          lt(paymentsTable.paidAt, end),
        ),
      ),
  ]);

  const lines: Line[] = [
    ...sales.map((r) => ({
      at: r.t.createdAt,
      kind: "tokens" as const,
      label: `${r.t.amount} token(s) · ${r.t.description}`,
      member: fullName(r.member),
      operator: r.operator ? fullName(r.operator) : null,
      amount: r.t.cashAmount ?? 0,
    })),
    ...spots.map((r) => ({
      at: r.p.paidAt as Date,
      kind: "spot" as const,
      label: `${r.court} · ${formatClubStamp(r.startTime)}`,
      member: fullName(r.member),
      operator: r.operator ? fullName(r.operator) : null,
      amount: r.p.cashAmount ?? 0,
    })),
    ...orders.map((r) => ({
      at: r.o.deliveredAt as Date,
      kind: "order" as const,
      label: `Order #${r.o.id}`,
      member: r.o.contactName,
      operator: r.operator ? fullName(r.operator) : null,
      amount: r.o.total,
    })),
    ...online.map((r) => ({
      at: r.p.paidAt as Date,
      kind: "online" as const,
      label:
        r.p.purpose === "tokens" ? `${r.p.tokens} token(s) · Online` : `Order #${r.p.shopOrderId}`,
      member: fullName(r.member),
      operator: r.p.provider,
      amount: r.p.amount,
    })),
  ].sort((a, b) => +a.at - +b.at);

  const sum = (kind: Line["kind"]) =>
    round(lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount, 0));
  const totals = { tokens: sum("tokens"), spots: sum("spot"), orders: sum("order") };
  res.json({
    from,
    to,
    currency,
    totals: {
      ...totals,
      /** Cash taken at the desk */
      total: round(totals.tokens + totals.spots + totals.orders),
      /** Paid through the gateway: on the club's gateway account, not in the till */
      online: sum("online"),
    },
    lines,
  });
});

export default router;
