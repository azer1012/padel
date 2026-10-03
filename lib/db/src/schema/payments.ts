import { pgTable, serial, text, integer, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";
import { tokenPackagesTable } from "./settings";
import { tokenTransactionsTable } from "./tokens";
import { shopOrdersTable } from "./shop";

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "expired",
  "refund_due",
  "refunded",
]);

/**
 * A payment asked through the club's gateway (Konnect or Flouci): tokens bought, or a
 * boutique order paid. It becomes `paid` only when the API has asked the gateway
 * itself and the gateway confirms the amount.
 */
export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  provider: text("provider", { enum: ["konnect", "flouci", "test"] }).notNull(),
  purpose: text("purpose", { enum: ["tokens", "shop_order"] }).notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  /** Tokens bought: a pack, or a number of tokens at the club's unit price. */
  tokens: integer("tokens"),
  packageId: integer("package_id").references(() => tokenPackagesTable.id, {
    onDelete: "set null",
  }),
  /** The boutique order paid. */
  shopOrderId: integer("shop_order_id").references(() => shopOrdersTable.id),
  /** The gateway's own reference, and the page the member pays on. */
  providerRef: text("provider_ref"),
  checkoutUrl: text("checkout_url"),
  /** The ledger entry that credited the tokens. */
  tokenTransactionId: integer("token_transaction_id").references(() => tokenTransactionsTable.id),
  failureReason: text("failure_reason"),
  paidAt: timestamp("paid_at"),
  refundedAt: timestamp("refunded_at"),
  refundedBy: integer("refunded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paymentsRelations = relations(paymentsTable, ({ one }) => ({
  user: one(usersTable, { fields: [paymentsTable.userId], references: [usersTable.id] }),
  order: one(shopOrdersTable, {
    fields: [paymentsTable.shopOrderId],
    references: [shopOrdersTable.id],
  }),
  package: one(tokenPackagesTable, {
    fields: [paymentsTable.packageId],
    references: [tokenPackagesTable.id],
  }),
}));

export type Payment = typeof paymentsTable.$inferSelect;
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
