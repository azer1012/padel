import { pgTable, serial, text, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "player"]);
export const languageEnum = pgEnum("language", ["fr", "ar", "en"]);
export const genderEnum = pgEnum("gender", ["male", "female"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  supabaseAuthId: text("supabase_auth_id").notNull().unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  gender: genderEnum("gender"),
  role: roleEnum("role").notNull().default("player"),
  avatarUrl: text("avatar_url"),
  tokenBalance: integer("token_balance").notNull().default(0),
  language: languageEnum("language").notNull().default("fr"),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  pushNotifications: boolean("push_notifications").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export type User = typeof usersTable.$inferSelect;
