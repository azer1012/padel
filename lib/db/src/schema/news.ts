import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const newsTable = pgTable("news", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  category: text("category"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNewsSchema = createInsertSchema(newsTable).omit({ id: true, createdAt: true });
export type InsertNews = z.infer<typeof insertNewsSchema>;
export type NewsArticle = typeof newsTable.$inferSelect;
