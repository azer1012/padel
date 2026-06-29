import { pgTable, serial, text, integer, boolean, timestamp, pgEnum, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const terrainTypeEnum = pgEnum("terrain_type", ["indoor", "outdoor"]);

export const terrainsTable = pgTable("terrains", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: terrainTypeEnum("type").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  pricePerPerson: real("price_per_person").notNull().default(25),
  capacity: integer("capacity").notNull().default(4),
  openingTime: text("opening_time").notNull().default("08:00"),
  closingTime: text("closing_time").notNull().default("23:00"),
  photos: text("photos").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTerrainSchema = createInsertSchema(terrainsTable).omit({ id: true, createdAt: true });
export type InsertTerrain = z.infer<typeof insertTerrainSchema>;
export type Terrain = typeof terrainsTable.$inferSelect;
