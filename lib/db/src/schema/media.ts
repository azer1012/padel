import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * A photo uploaded by the desk (court, news, tournament, boutique article). The file
 * is in the private "media" storage bucket under `key`; the API serves it at
 * /api/media/<key> and removes the ones no page uses any more.
 */
export const mediaFilesTable = pgTable("media_files", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  contentType: text("content_type", { enum: ["image/jpeg", "image/png", "image/webp"] }).notNull(),
  bytes: integer("bytes").notNull(),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MediaFile = typeof mediaFilesTable.$inferSelect;
