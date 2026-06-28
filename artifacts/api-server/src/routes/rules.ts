import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, categorizationRulesTable, transactionsTable } from "@workspace/db";
import {
  ListRulesResponse,
  CreateRuleBody,
  CreateRuleResponse,
  DeleteRuleParams,
  ListRuleSuggestionsResponse,
  ApplyRulesToExistingTransactionsResponse,
} from "@workspace/api-zod";
import {
  buildRuleSuggestions,
  categorizeTransactionsWithRules,
} from "../lib/rule-suggestions";

const router: IRouter = Router();

function serializeRule(r: typeof categorizationRulesTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/rules", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(categorizationRulesTable)
    .orderBy(desc(categorizationRulesTable.priority), desc(categorizationRulesTable.createdAt));

  res.json(ListRulesResponse.parse(rows.map(serializeRule)));
});

router.get("/rules/suggestions", async (_req, res): Promise<void> => {
  const [transactions, rules] = await Promise.all([
    db
      .select({
        id: transactionsTable.id,
        merchant: transactionsTable.merchant,
        description: transactionsTable.description,
        amount: transactionsTable.amount,
        category: transactionsTable.category,
      })
      .from(transactionsTable),
    db
      .select({
        pattern: categorizationRulesTable.pattern,
        category: categorizationRulesTable.category,
      })
      .from(categorizationRulesTable)
      .orderBy(desc(categorizationRulesTable.priority), desc(categorizationRulesTable.createdAt)),
  ]);

  res.json(ListRuleSuggestionsResponse.parse(buildRuleSuggestions(transactions, rules)));
});

router.post("/rules/apply", async (_req, res): Promise<void> => {
  const [transactions, rules] = await Promise.all([
    db
      .select({
        id: transactionsTable.id,
        merchant: transactionsTable.merchant,
        description: transactionsTable.description,
        amount: transactionsTable.amount,
        category: transactionsTable.category,
      })
      .from(transactionsTable),
    db
      .select({
        pattern: categorizationRulesTable.pattern,
        category: categorizationRulesTable.category,
      })
      .from(categorizationRulesTable)
      .orderBy(desc(categorizationRulesTable.priority), desc(categorizationRulesTable.createdAt)),
  ]);

  const updates = categorizeTransactionsWithRules(transactions, rules);
  const updatesByCategory = new Map<string, number[]>();

  for (const update of updates) {
    const ids = updatesByCategory.get(update.category) ?? [];
    ids.push(update.id);
    updatesByCategory.set(update.category, ids);
  }

  let updated = 0;
  for (const [category, ids] of updatesByCategory.entries()) {
    const rows = await db
      .update(transactionsTable)
      .set({ category })
      .where(inArray(transactionsTable.id, ids))
      .returning({ id: transactionsTable.id });
    updated += rows.length;
  }

  res.json(
    ApplyRulesToExistingTransactionsResponse.parse({
      scanned: transactions.length,
      updated,
    }),
  );
});

router.post("/rules", async (req, res): Promise<void> => {
  const body = CreateRuleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { pattern, category, priority = 0 } = body.data;

  const [row] = await db
    .insert(categorizationRulesTable)
    .values({ pattern, category, priority })
    .returning();

  res.status(201).json(CreateRuleResponse.parse(serializeRule(row)));
});

router.delete("/rules/:id", async (req, res): Promise<void> => {
  const params = DeleteRuleParams.safeParse({ id: parseInt(req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid rule id" });
    return;
  }

  await db
    .delete(categorizationRulesTable)
    .where(eq(categorizationRulesTable.id, params.data.id));

  res.sendStatus(204);
});

export default router;
