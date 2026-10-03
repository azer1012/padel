import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const activityTypeEnum = pgEnum("activity_type", [
  "reservation_created",
  "reservation_cancelled",
  "token_credited",
  "token_debited",
  "user_registered",
  "settings_updated",
  "payment_updated",
  "role_changed",
  "court_updated",
  "pricing_updated",
  "shop_updated",
  "order_updated",
  "member_updated",
  "tournament_updated",
  "payment_received",
]);

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  type: activityTypeEnum("type").notNull(),
  message: text("message").notNull(),
  userId: integer("user_id"),
  userName: text("user_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Activity = typeof activityTable.$inferSelect;
