import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull().default("checking"),
    currency: text("currency").notNull().default("TRY"),
    institution: text("institution"),
    last4: text("last4"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    accountNameTypeUnique: uniqueIndex("accounts_name_type_unique").on(table.name, table.type),
  }),
);

export const insertAccountSchema = createInsertSchema(accountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
