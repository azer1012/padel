import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "upcoming",
  "open",
  "ongoing",
  "completed",
  "cancelled",
]);

export const tournamentsTable = pgTable("tournaments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: tournamentStatusEnum("status").notNull().default("upcoming"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  maxTeams: integer("max_teams"),
  registeredTeams: integer("registered_teams").notNull().default(0),
  prizeInfo: text("prize_info"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tournamentRegistrationsTable = pgTable("tournament_registrations", {
  id: serial("id").primaryKey(),
  tournamentId: integer("tournament_id")
    .notNull()
    .references(() => tournamentsTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  teamName: text("team_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tournamentRegistrationsRelations = relations(
  tournamentRegistrationsTable,
  ({ one }) => ({
    tournament: one(tournamentsTable, {
      fields: [tournamentRegistrationsTable.tournamentId],
      references: [tournamentsTable.id],
    }),
    user: one(usersTable, {
      fields: [tournamentRegistrationsTable.userId],
      references: [usersTable.id],
    }),
  }),
);

export type Tournament = typeof tournamentsTable.$inferSelect;
