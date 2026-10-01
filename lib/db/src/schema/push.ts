import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * One row per (user, kind, ref) ever notified. Inserting first with ON CONFLICT DO NOTHING
 * makes every email / push / scheduled reminder safe to retry and safe with several API instances.
 */
export const notificationLogTable = pgTable(
  "notification_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ref: text("ref").notNull().default(""),
    channels: text("channels").array().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("notification_log_user_id_kind_ref_key").on(t.userId, t.kind, t.ref)],
);

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
