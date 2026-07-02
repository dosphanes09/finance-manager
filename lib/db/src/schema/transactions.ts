import { pgTable, text, serial, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  merchant: text("merchant").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  accountId: integer("account_id").references(() => accountsTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  direction: text("direction").notNull().default("debit"),
  currency: text("currency").notNull().default("TRY"),
  transactionKind: text("transaction_kind").notNull().default("other"),
  transferGroupId: text("transfer_group_id"),
  matchedTransferId: integer("matched_transfer_id"),
  bank: text("bank").notNull().default("generic"),
  parser: text("parser"),
  balance: numeric("balance", { precision: 12, scale: 2 }),
  category: text("category").notNull().default("other"),
  categorizationConfidence: numeric("categorization_confidence", { precision: 5, scale: 4 }).notNull().default("0"),
  categorizationSource: text("categorization_source").notNull().default("built_in"),
  categorizationExplanation: text("categorization_explanation").notNull().default(""),
  importConfidence: numeric("import_confidence", { precision: 5, scale: 4 }).notNull().default("0"),
  month: text("month").notNull(),
  notes: text("notes"),
  reviewed: boolean("reviewed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
