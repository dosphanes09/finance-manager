import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categorizationRulesTable = pgTable("categorization_rules", {
  id: serial("id").primaryKey(),
  pattern: text("pattern").notNull(),
  category: text("category").notNull(),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRuleSchema = createInsertSchema(categorizationRulesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertRule = z.infer<typeof insertRuleSchema>;
export type CategorizationRule = typeof categorizationRulesTable.$inferSelect;
