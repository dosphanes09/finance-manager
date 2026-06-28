import { integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const merchantsTable = pgTable(
  "merchants",
  {
    id: serial("id").primaryKey(),
    merchantKey: text("merchant_key").notNull(),
    displayName: text("display_name").notNull(),
    category: text("category").notNull().default("other"),
    pattern: text("pattern").notNull(),
    source: text("source").notNull().default("deterministic"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    timesSeen: integer("times_seen").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    merchantKeyUnique: uniqueIndex("merchants_merchant_key_unique").on(table.merchantKey),
  }),
);

export const insertMerchantSchema = createInsertSchema(merchantsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchantsTable.$inferSelect;
