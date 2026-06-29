import { pgTable, serial, text, boolean, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";

export const staffRoleTypeEnum = pgEnum("staff_role_type", ["manager", "coach", "receptionist", "maintenance"]);

export const staffRolesTable = pgTable("staff_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  roleType: staffRoleTypeEnum("role_type").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffRolesRelations = relations(staffRolesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [staffRolesTable.userId],
    references: [usersTable.id],
  }),
}));

export const insertStaffRoleSchema = createInsertSchema(staffRolesTable).omit({ id: true, createdAt: true });
export type InsertStaffRole = z.infer<typeof insertStaffRoleSchema>;
export type StaffRole = typeof staffRolesTable.$inferSelect;
