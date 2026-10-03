import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { usersTable } from "./users";

export const shopOrderStatusEnum = pgEnum("shop_order_status", [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
]);

const money = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });

/** The boutique catalogue: padel articles the club sells. */
export const shopProductsTable = pgTable("shop_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("accessory"),
  /** Price in the club currency. */
  price: money("price").notNull(),
  /** Units left to sell: taken when an order is placed, given back when it is cancelled. */
  stock: integer("stock").notNull().default(0),
  /** Photos of the article, the first one on its card. */
  imageUrls: text("image_urls").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * An order placed from the site. Nothing is paid online: the club calls the member
 * to confirm, then delivers the order or keeps it at the desk.
 */
export const shopOrdersTable = pgTable("shop_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  status: shopOrderStatusEnum("status").notNull().default("pending"),
  total: money("total").notNull(),
  currency: text("currency").notNull(),
  deliveryMethod: text("delivery_method", { enum: ["delivery", "pickup"] }).notNull(),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  address: text("address"),
  city: text("city"),
  notes: text("notes"),
  adminNotes: text("admin_notes"),
  idempotencyKey: text("idempotency_key"),
  /** The admin who last moved the order on. */
  handledBy: integer("handled_by").references(() => usersTable.id, { onDelete: "set null" }),
  /** When the order was handed over and paid (the day it counts in the cash report). */
  deliveredAt: timestamp("delivered_at"),
  /** Paid through the club's payment gateway: nothing left to collect on reception. */
  paidOnlineAt: timestamp("paid_online_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** A line of an order, with the name and price the member saw when ordering. */
export const shopOrderItemsTable = pgTable("shop_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => shopOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => shopProductsTable.id),
  productName: text("product_name").notNull(),
  unitPrice: money("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
});

export const shopOrdersRelations = relations(shopOrdersTable, ({ one, many }) => ({
  user: one(usersTable, { fields: [shopOrdersTable.userId], references: [usersTable.id] }),
  items: many(shopOrderItemsTable),
}));

export const shopOrderItemsRelations = relations(shopOrderItemsTable, ({ one }) => ({
  order: one(shopOrdersTable, {
    fields: [shopOrderItemsTable.orderId],
    references: [shopOrdersTable.id],
  }),
  product: one(shopProductsTable, {
    fields: [shopOrderItemsTable.productId],
    references: [shopProductsTable.id],
  }),
}));

export type ShopProduct = typeof shopProductsTable.$inferSelect;
export type ShopOrder = typeof shopOrdersTable.$inferSelect;
export type ShopOrderItem = typeof shopOrderItemsTable.$inferSelect;
export type ShopOrderStatus = (typeof shopOrderStatusEnum.enumValues)[number];
