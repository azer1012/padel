import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  smallint,
  numeric,
  date,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { terrainsTable } from "./terrains";

/**
 * Operational settings of this club installation (single row, id = 1). Edited by
 * admins in Réglages; read by the API on every booking decision. Branding is NOT
 * here — it's per-installation build configuration (VITE_CLUB_*).
 * Ranges are enforced by CHECK constraints (see migration 20261003000000).
 */
export const clubSettingsTable = pgTable(
  "club_settings",
  {
    id: smallint("id").primaryKey().default(1),

    bookingDurationMinutes: integer("booking_duration_minutes").notNull().default(90),
    minPlayers: integer("min_players").notNull().default(1),
    maxPlayers: integer("max_players").notNull().default(4),
    minAdvanceMinutes: integer("min_advance_minutes").notNull().default(30),
    maxAdvanceDays: integer("max_advance_days").notNull().default(14),

    cancellationNoticeHours: integer("cancellation_notice_hours").notNull().default(0),
    lateCancellation: text("late_cancellation", { enum: ["forbid", "no_refund"] })
      .notNull()
      .default("forbid"),

    currency: text("currency").notNull().default("TND"),
    playerPrice: numeric("player_price", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(25),
    fullCourtPrice: numeric("full_court_price", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(100),

    tokenCostPlayer: integer("token_cost_player").notNull().default(1),
    tokenCostFullCourt: integer("token_cost_full_court").notNull().default(4),
    tokenUnitPrice: numeric("token_unit_price", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(25),
    tokenMinPurchase: integer("token_min_purchase").notNull().default(1),

    openMatchesEnabled: boolean("open_matches_enabled").notNull().default(true),
    invitationsEnabled: boolean("invitations_enabled").notNull().default(true),
    cashPaymentEnabled: boolean("cash_payment_enabled").notNull().default(true),

    bookingConfirmationNotificationsEnabled: boolean("booking_confirmation_notifications_enabled")
      .notNull()
      .default(true),
    remindersEnabled: boolean("reminders_enabled").notNull().default(true),
    reminderLeadMinutes: integer("reminder_lead_minutes").notNull().default(120),
    cancellationNotificationsEnabled: boolean("cancellation_notifications_enabled")
      .notNull()
      .default(true),
    invitationNotificationsEnabled: boolean("invitation_notifications_enabled")
      .notNull()
      .default(true),
    tokenNotificationsEnabled: boolean("token_notifications_enabled").notNull().default(true),
    matchFinishedNotificationsEnabled: boolean("match_finished_notifications_enabled")
      .notNull()
      .default(true),

    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedBy: integer("updated_by").references(() => usersTable.id, { onDelete: "set null" }),
  },
  (t) => [check("club_settings_id_check", sql`${t.id} = 1`)],
);
export type ClubSettingsRow = typeof clubSettingsTable.$inferSelect;

/** Weekly opening hours, 0 = Sunday … 6 = Saturday. close_time may be "24:00". */
export const openingHoursTable = pgTable("opening_hours", {
  weekday: smallint("weekday").primaryKey(),
  isClosed: boolean("is_closed").notNull().default(false),
  openTime: text("open_time").notNull().default("08:00"),
  closeTime: text("close_time").notNull().default("23:00"),
});
export type OpeningHoursRow = typeof openingHoursTable.$inferSelect;

/** Holidays, exceptional hours and maintenance days. terrainId null = whole club. */
export const scheduleExceptionsTable = pgTable("schedule_exceptions", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  terrainId: integer("terrain_id").references(() => terrainsTable.id, { onDelete: "cascade" }),
  isClosed: boolean("is_closed").notNull().default(true),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type ScheduleException = typeof scheduleExceptionsTable.$inferSelect;

/** Token packs sold at the desk (e.g. 10 tokens = 250 TND). */
export const tokenPackagesTable = pgTable("token_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tokens: integer("tokens").notNull(),
  price: numeric("price", { precision: 10, scale: 2, mode: "number" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type TokenPackage = typeof tokenPackagesTable.$inferSelect;
