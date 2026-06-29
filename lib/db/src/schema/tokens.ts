import { pgTable, serial, integer, timestamp, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { reservationsTable } from "./reservations";
import { relations } from "drizzle-orm";

export const tokenTypeEnum = pgEnum("token_type", ["credit", "debit", "adjustment"]);

export const tokenTransactionsTable = pgTable("token_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  adminId: integer("admin_id").references(() => usersTable.id),
  reservationId: integer("reservation_id").references(() => reservationsTable.id),
  type: tokenTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  description: text("description").notNull(),
  notes: text("notes"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tokenTransactionsRelations = relations(tokenTransactionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [tokenTransactionsTable.userId],
    references: [usersTable.id],
  }),
  admin: one(usersTable, {
    fields: [tokenTransactionsTable.adminId],
    references: [usersTable.id],
  }),
}));

export const insertTokenTransactionSchema = createInsertSchema(tokenTransactionsTable).omit({ id: true, createdAt: true });
export type InsertTokenTransaction = z.infer<typeof insertTokenTransactionSchema>;
export type TokenTransaction = typeof tokenTransactionsTable.$inferSelect;
