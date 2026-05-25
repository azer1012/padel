import { pgTable, serial, integer, timestamp, text, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { terrainsTable } from "./terrains";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";

export const reservationStatusEnum = pgEnum("reservation_status", ["confirmed", "cancelled", "pending"]);
export const bookingTypeEnum = pgEnum("booking_type", ["online", "phone", "manual"]);

export const reservationsTable = pgTable("reservations", {
  id: serial("id").primaryKey(),
  terrainId: integer("terrain_id").notNull().references(() => terrainsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  guestName: text("guest_name"),
  guestPhone: text("guest_phone"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: reservationStatusEnum("status").notNull().default("confirmed"),
  tokensCharged: integer("tokens_charged").notNull().default(1),
  bookingType: bookingTypeEnum("booking_type").notNull().default("online"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("reservations_terrain_start_confirmed_idx")
    .on(table.terrainId, table.startTime)
    .where(sql`status = 'confirmed'`),
]);

export const reservationsRelations = relations(reservationsTable, ({ one }) => ({
  terrain: one(terrainsTable, {
    fields: [reservationsTable.terrainId],
    references: [terrainsTable.id],
  }),
  user: one(usersTable, {
    fields: [reservationsTable.userId],
    references: [usersTable.id],
  }),
}));

export const insertReservationSchema = createInsertSchema(reservationsTable).omit({ id: true, createdAt: true });
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservationsTable.$inferSelect;
