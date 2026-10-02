import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

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

export type NewsArticle = typeof newsTable.$inferSelect;
