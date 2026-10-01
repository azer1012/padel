import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { reservationsTable } from "./reservations";
import { usersTable } from "./users";

export const rentalStatusEnum = pgEnum("rental_status", [
  "reserved",
  "handed_out",
  "returned",
  "cancelled",
]);

export const equipmentItemsTable = pgTable("equipment_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("racket"),
  /** Price in the club currency (TND), paid at the front desk. */
  price: real("price").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reservationEquipmentTable = pgTable("reservation_equipment", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => reservationsTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id")
    .notNull()
    .references(() => equipmentItemsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  status: rentalStatusEnum("status").notNull().default("reserved"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reservationEquipmentRelations = relations(reservationEquipmentTable, ({ one }) => ({
  reservation: one(reservationsTable, {
    fields: [reservationEquipmentTable.reservationId],
    references: [reservationsTable.id],
  }),
  item: one(equipmentItemsTable, {
    fields: [reservationEquipmentTable.itemId],
    references: [equipmentItemsTable.id],
  }),
  user: one(usersTable, {
    fields: [reservationEquipmentTable.userId],
    references: [usersTable.id],
  }),
}));

export type EquipmentItem = typeof equipmentItemsTable.$inferSelect;
export type ReservationEquipment = typeof reservationEquipmentTable.$inferSelect;
