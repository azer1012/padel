import {
  pgTable,
  serial,
  integer,
  timestamp,
  text,
  pgEnum,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { terrainsTable } from "./terrains";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";
import { reservationEquipmentTable } from "./equipment";

export const reservationStatusEnum = pgEnum("reservation_status", [
  "confirmed",
  "cancelled",
  "pending",
]);
export const bookingTypeEnum = pgEnum("booking_type", ["online", "phone", "manual"]);
export const bookingModeEnum = pgEnum("booking_mode", ["full_court", "own_spot"]);
/** How a spot is paid: own token, cash at the club desk, or covered by the full-court booker. */
export const playerPaymentTypeEnum = pgEnum("player_payment_type", [
  "token",
  "cash_club",
  "invited_free",
]);
export const playerPaymentStatusEnum = pgEnum("player_payment_status", [
  "paid",
  "pending",
  "refunded",
]);
export const seriesStatusEnum = pgEnum("series_status", ["active", "cancelled"]);
export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
  "cancelled",
]);

export const reservationsTable = pgTable(
  "reservations",
  {
    id: serial("id").primaryKey(),
    terrainId: integer("terrain_id")
      .notNull()
      .references(() => terrainsTable.id),
    userId: integer("user_id").references(() => usersTable.id),
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    status: reservationStatusEnum("status").notNull().default("confirmed"),
    tokensCharged: integer("tokens_charged").notNull().default(1),
    bookingType: bookingTypeEnum("booking_type").notNull().default("online"),
    bookingMode: bookingModeEnum("booking_mode").notNull().default("full_court"),
    totalSpots: integer("total_spots").notNull().default(4),
    isPublic: boolean("is_public").notNull().default(false),
    publicDescription: text("public_description"),
    notes: text("notes"),
    seriesId: integer("series_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reservations_terrain_start_confirmed_idx")
      .on(table.terrainId, table.startTime)
      .where(sql`status = 'confirmed'`),
  ],
);

export const reservationsRelations = relations(reservationsTable, ({ one, many }) => ({
  terrain: one(terrainsTable, {
    fields: [reservationsTable.terrainId],
    references: [terrainsTable.id],
  }),
  user: one(usersTable, {
    fields: [reservationsTable.userId],
    references: [usersTable.id],
  }),
  players: many(reservationPlayersTable),
  invites: many(playerInvitesTable),
  series: one(reservationSeriesTable, {
    fields: [reservationsTable.seriesId],
    references: [reservationSeriesTable.id],
  }),
  equipment: many(reservationEquipmentTable),
}));

export type Reservation = typeof reservationsTable.$inferSelect;

// ─── Reservation Players ─────────────────────────────────────────────────────

export const reservationPlayersTable = pgTable("reservation_players", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => reservationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  paymentType: playerPaymentTypeEnum("payment_type").notNull().default("token"),
  paymentStatus: playerPaymentStatusEnum("payment_status").notNull().default("paid"),
  tokensCharged: integer("tokens_charged").notNull().default(1),
  notes: text("notes"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const reservationPlayersRelations = relations(reservationPlayersTable, ({ one }) => ({
  reservation: one(reservationsTable, {
    fields: [reservationPlayersTable.reservationId],
    references: [reservationsTable.id],
  }),
  user: one(usersTable, {
    fields: [reservationPlayersTable.userId],
    references: [usersTable.id],
  }),
}));

export type ReservationPlayer = typeof reservationPlayersTable.$inferSelect;

// ─── Player Invites ──────────────────────────────────────────────────────────

export const playerInvitesTable = pgTable("player_invites", {
  id: serial("id").primaryKey(),
  inviteToken: text("invite_token").notNull().unique(),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => reservationsTable.id, { onDelete: "cascade" }),
  invitedByUserId: integer("invited_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  invitedEmail: text("invited_email"),
  /** Set for an in-app invitation to a specific member (accept / decline). */
  invitedUserId: integer("invited_user_id").references(() => usersTable.id, {
    onDelete: "cascade",
  }),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at").notNull(),
  status: inviteStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const playerInvitesRelations = relations(playerInvitesTable, ({ one }) => ({
  reservation: one(reservationsTable, {
    fields: [playerInvitesTable.reservationId],
    references: [reservationsTable.id],
  }),
  invitedBy: one(usersTable, {
    fields: [playerInvitesTable.invitedByUserId],
    references: [usersTable.id],
  }),
}));

export type PlayerInvite = typeof playerInvitesTable.$inferSelect;

// ─── Recurring bookings ──────────────────────────────────────────────────────

export const reservationSeriesTable = pgTable("reservation_series", {
  id: serial("id").primaryKey(),
  terrainId: integer("terrain_id")
    .notNull()
    .references(() => terrainsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  guestName: text("guest_name"),
  guestPhone: text("guest_phone"),
  label: text("label"),
  firstStart: timestamp("first_start").notNull(),
  occurrences: integer("occurrences").notNull(),
  intervalWeeks: integer("interval_weeks").notNull().default(1),
  notes: text("notes"),
  status: seriesStatusEnum("status").notNull().default("active"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reservationSeriesRelations = relations(reservationSeriesTable, ({ one, many }) => ({
  terrain: one(terrainsTable, {
    fields: [reservationSeriesTable.terrainId],
    references: [terrainsTable.id],
  }),
  user: one(usersTable, { fields: [reservationSeriesTable.userId], references: [usersTable.id] }),
  reservations: many(reservationsTable),
}));

export type ReservationSeries = typeof reservationSeriesTable.$inferSelect;
