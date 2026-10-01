import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
  smallint,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { terrainsTable } from "./terrains";

/**
 * Peak / off-peak pricing. A rule matches a slot when the slot's club-local weekday
 * is in daysOfWeek (0 = Sunday) and its local start time is in [startTime, endTime).
 * terrainId = null applies to every court. Highest priority wins; court-specific
 * rules beat club-wide rules at equal priority.
 */
export const pricingRulesTable = pgTable("pricing_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  terrainId: integer("terrain_id").references(() => terrainsTable.id, { onDelete: "cascade" }),
  daysOfWeek: smallint("days_of_week").array().notNull().default([0, 1, 2, 3, 4, 5, 6]),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  tokensPerSpot: integer("tokens_per_spot").notNull().default(1),
  pricePerPerson: real("price_per_person"),
  isPeak: boolean("is_peak").notNull().default(false),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pricingRulesRelations = relations(pricingRulesTable, ({ one }) => ({
  terrain: one(terrainsTable, {
    fields: [pricingRulesTable.terrainId],
    references: [terrainsTable.id],
  }),
}));

export type PricingRule = typeof pricingRulesTable.$inferSelect;
