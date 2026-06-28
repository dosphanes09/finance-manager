import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, categorizationRulesTable, transactionsTable } from "@workspace/db";
import {
  ListRulesResponse,
  CreateRuleBody,
  CreateRuleResponse,
  DeleteRuleParams,
  ListRuleSuggestionsResponse,
  CreateRuleDraftsFromTransactionsBody,
  CreateRuleDraftsFromTransactionsResponse,
  CreateRulesFromTransactionsBody,
  CreateRulesFromTransactionsResponse,
  ApplyRulesToExistingTransactionsResponse,
  ApplyRulesToSelectedTransactionsBody,
  ApplyRulesToSelectedTransactionsResponse,
} from "@workspace/api-zod";
import {
  buildRuleDraftsFromTransactions,
  buildRuleSuggestions,
  categorizeTransactionsWithRules,
  matchesRulePattern,
} from "../lib/rule-suggestions";
import { rememberMerchantsFromTransactions } from "../lib/merchant-memory";

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
        reviewed: transactionsTable.reviewed,
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

router.post("/rules/draft", async (req, res): Promise<void> => {
  const body = CreateRuleDraftsFromTransactionsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const transactionIds = [...new Set(body.data.transactionIds)];
  if (transactionIds.length === 0) {
    res.json(CreateRuleDraftsFromTransactionsResponse.parse([]));
    return;
  }

  const transactions = await db
    .select({
      id: transactionsTable.id,
      merchant: transactionsTable.merchant,
      description: transactionsTable.description,
      amount: transactionsTable.amount,
      category: transactionsTable.category,
      reviewed: transactionsTable.reviewed,
    })
    .from(transactionsTable)
    .where(inArray(transactionsTable.id, transactionIds));

  res.json(CreateRuleDraftsFromTransactionsResponse.parse(buildRuleDraftsFromTransactions(transactions)));
});

router.post("/rules/from-transactions", async (req, res): Promise<void> => {
  const body = CreateRulesFromTransactionsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.rules.length === 0) {
    res.status(400).json({ error: "At least one rule is required" });
    return;
  }

  const allTransactions = await db
    .select({
      id: transactionsTable.id,
      merchant: transactionsTable.merchant,
      description: transactionsTable.description,
      amount: transactionsTable.amount,
      category: transactionsTable.category,
      reviewed: transactionsTable.reviewed,
    })
    .from(transactionsTable);

  const createdRules: Array<typeof categorizationRulesTable.$inferSelect> = [];
  const updatesByCategory = new Map<string, Set<number>>();

  for (const rule of body.data.rules) {
    const pattern = rule.pattern.trim();
    if (!pattern || !rule.category.trim()) {
      res.status(400).json({ error: "Rule pattern and category are required" });
      return;
    }

    const [created] = await db
      .insert(categorizationRulesTable)
      .values({
        pattern,
        category: rule.category,
        priority: rule.priority ?? 30,
      })
      .returning();
    createdRules.push(created);

    const selectedIds = new Set(rule.transactionIds);
    const targetIds = rule.applyToMatches
      ? allTransactions
          .filter((transaction) => matchesRulePattern(transaction, pattern))
          .map((transaction) => transaction.id)
      : allTransactions
          .filter((transaction) => selectedIds.has(transaction.id))
          .map((transaction) => transaction.id);

    const ids = updatesByCategory.get(rule.category) ?? new Set<number>();
    for (const id of targetIds) ids.add(id);
    updatesByCategory.set(rule.category, ids);
  }

  const updatedIds = new Set<number>();
  const rememberedTransactions: Array<typeof transactionsTable.$inferSelect> = [];
  for (const [category, ids] of updatesByCategory.entries()) {
    const idList = Array.from(ids);
    if (idList.length === 0) continue;

    const rows = await db
      .update(transactionsTable)
      .set({
        category,
        reviewed: true,
        categorizationConfidence: "0.99",
        categorizationSource: "custom_rule",
        categorizationExplanation: "Category assigned by user-created rule; merchant memory updated for future imports.",
      })
      .where(inArray(transactionsTable.id, idList))
      .returning();

    for (const row of rows) updatedIds.add(row.id);
    rememberedTransactions.push(...rows);
  }

  await rememberUpdatedMerchants(rememberedTransactions);

  res.status(201).json(
    CreateRulesFromTransactionsResponse.parse({
      createdRules: createdRules.map(serializeRule),
      updated: updatedIds.size,
    }),
  );
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
        reviewed: transactionsTable.reviewed,
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
  const rememberedTransactions: Array<typeof transactionsTable.$inferSelect> = [];
  for (const [category, ids] of updatesByCategory.entries()) {
    const rows = await db
      .update(transactionsTable)
      .set({
        category,
        reviewed: true,
        categorizationConfidence: "0.99",
        categorizationSource: "custom_rule",
        categorizationExplanation: "Category assigned by custom rule application; merchant memory updated for future imports.",
      })
      .where(inArray(transactionsTable.id, ids))
      .returning();
    updated += rows.length;
    rememberedTransactions.push(...rows);
  }

  await rememberUpdatedMerchants(rememberedTransactions);

  res.json(
    ApplyRulesToExistingTransactionsResponse.parse({
      scanned: transactions.length,
      updated,
    }),
  );
});

router.post("/rules/apply-selected", async (req, res): Promise<void> => {
  const body = ApplyRulesToSelectedTransactionsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const transactionIds = [...new Set(body.data.transactionIds)];
  if (transactionIds.length === 0) {
    res.json(ApplyRulesToSelectedTransactionsResponse.parse({ scanned: 0, updated: 0 }));
    return;
  }

  const [transactions, rules] = await Promise.all([
    db
      .select({
        id: transactionsTable.id,
        merchant: transactionsTable.merchant,
        description: transactionsTable.description,
        amount: transactionsTable.amount,
        category: transactionsTable.category,
        reviewed: transactionsTable.reviewed,
      })
      .from(transactionsTable)
      .where(inArray(transactionsTable.id, transactionIds)),
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
  const rememberedTransactions: Array<typeof transactionsTable.$inferSelect> = [];
  for (const [category, ids] of updatesByCategory.entries()) {
    const rows = await db
      .update(transactionsTable)
      .set({
        category,
        reviewed: true,
        categorizationConfidence: "0.99",
        categorizationSource: "custom_rule",
        categorizationExplanation: "Category assigned by selected custom rule application; merchant memory updated for future imports.",
      })
      .where(inArray(transactionsTable.id, ids))
      .returning();
    updated += rows.length;
    rememberedTransactions.push(...rows);
  }

  await rememberUpdatedMerchants(rememberedTransactions);

  res.json(
    ApplyRulesToSelectedTransactionsResponse.parse({
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

async function rememberUpdatedMerchants(
  transactions: Array<typeof transactionsTable.$inferSelect>,
): Promise<void> {
  await rememberMerchantsFromTransactions(
    transactions.map((transaction) => ({
      merchant: transaction.merchant,
      description: transaction.description,
      category: transaction.category,
      confidence: 0.99,
    })),
    "custom_rule",
  );
}
