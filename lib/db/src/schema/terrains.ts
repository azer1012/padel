import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const terrainTypeEnum = pgEnum("terrain_type", ["indoor", "outdoor"]);

export const terrainsTable = pgTable("terrains", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: terrainTypeEnum("type").notNull(),
  /** Optional court number shown to players ("Terrain 3"). */
  number: integer("number"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  /** Temporarily not bookable (works, repairs). Kept visible with a notice. */
  isMaintenance: boolean("is_maintenance").notNull().default(false),
  maintenanceNote: text("maintenance_note"),
  /** Archived courts disappear from every list but keep their booking history. */
  archivedAt: timestamp("archived_at"),
  /** Optional per-court overrides; null = use the club settings / opening hours. */
  pricePerPerson: real("price_per_person"),
  capacity: integer("capacity").notNull().default(4),
  openingTime: text("opening_time"),
  closingTime: text("closing_time"),
  photos: text("photos").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTerrainSchema = createInsertSchema(terrainsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTerrain = z.infer<typeof insertTerrainSchema>;
export type Terrain = typeof terrainsTable.$inferSelect;
