import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["admin", "player"]);
export const languageEnum = pgEnum("language", ["fr", "ar", "en"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  role: roleEnum("role").notNull().default("player"),
  avatarUrl: text("avatar_url"),
  tokenBalance: integer("token_balance").notNull().default(0),
  language: languageEnum("language").notNull().default("fr"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
