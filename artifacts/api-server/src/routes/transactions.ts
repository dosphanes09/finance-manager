import { Router, type IRouter } from "express";
import { eq, desc, asc, and, sql, inArray } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { needsRuleReview } from "../lib/rule-suggestions";
import { rememberMerchantsFromTransactions } from "../lib/merchant-memory";
import {
  ListTransactionsQueryParams,
  ListTransactionsResponse,
  UpdateTransactionParams,
  UpdateTransactionBody,
  UpdateTransactionResponse,
  DeleteTransactionParams,
  ListMonthsResponse,
  BulkCategorizeBody,
  BulkCategorizeResponse,
  BulkReviewTransactionsBody,
  BulkReviewTransactionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    ...t,
    amount: parseFloat(t.amount),
    balance: t.balance === null ? null : parseFloat(t.balance),
    categorizationConfidence: parseFloat(t.categorizationConfidence),
    importConfidence: parseFloat(t.importConfidence),
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/transactions/months", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ month: transactionsTable.month })
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.month));

  res.json(ListMonthsResponse.parse(rows.map((r) => r.month)));
});

router.get("/transactions", async (req, res): Promise<void> => {
  const params = ListTransactionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const {
    month,
    category,
    merchant,
    needsReview,
    type,
    search,
    limit = 100,
    offset = 0,
    sortBy = "date",
    sortDir = "desc",
  } = params.data;

  const conditions = [];
  if (month) conditions.push(eq(transactionsTable.month, month));
  if (category) conditions.push(eq(transactionsTable.category, category));
  if (merchant) conditions.push(sql`${transactionsTable.merchant} ilike ${"%" + merchant + "%"}`);
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (search) {
    conditions.push(
      sql`(${transactionsTable.merchant} ilike ${"%" + search + "%"} or ${transactionsTable.description} ilike ${"%" + search + "%"})`
    );
  }

  const sortColumn = {
    date: transactionsTable.date,
    merchant: transactionsTable.merchant,
    category: transactionsTable.category,
    amount: sql`amount::numeric`,
  }[sortBy] ?? transactionsTable.date;

  const orderBy = sortDir === "asc" ? asc(sortColumn as typeof transactionsTable.date) : desc(sortColumn as typeof transactionsTable.date);

  if (needsReview) {
    const allRows = await db
      .select()
      .from(transactionsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(orderBy);

    const filtered = allRows.filter((row) => needsRuleReview({
      id: row.id,
      merchant: row.merchant,
      description: row.description,
      amount: row.amount,
      type: row.type,
      category: row.category,
      reviewed: row.reviewed,
      categorizationConfidence: row.categorizationConfidence,
    }));

    res.json(
      ListTransactionsResponse.parse({
        transactions: filtered.slice(offset, offset + limit).map(serializeTransaction),
        total: filtered.length,
      })
    );
    return;
  }

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(transactionsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(conditions.length ? and(...conditions) : undefined),
  ]);

  res.json(
    ListTransactionsResponse.parse({
      transactions: rows.map(serializeTransaction),
      total: countRows[0]?.count ?? 0,
    })
  );
});

router.post("/transactions/bulk-categorize", async (req, res): Promise<void> => {
  const body = BulkCategorizeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { ids, category } = body.data;

  if (ids.length === 0) {
    res.json(BulkCategorizeResponse.parse({ updated: 0 }));
    return;
  }

  const updated = await db
    .update(transactionsTable)
    .set({
      category,
      reviewed: true,
      categorizationConfidence: "0.99",
      categorizationSource: "user_correction",
      categorizationExplanation: "User corrected category through bulk edit; merchant memory updated for future imports.",
    })
    .where(inArray(transactionsTable.id, ids))
    .returning();

  await rememberMerchantsFromTransactions(
    updated.map((transaction) => ({
      merchant: transaction.merchant,
      description: transaction.description,
      category: transaction.category,
      confidence: 0.99,
    })),
    "user_correction",
  );

  res.json(BulkCategorizeResponse.parse({ updated: updated.length }));
});

router.post("/transactions/bulk-review", async (req, res): Promise<void> => {
  const body = BulkReviewTransactionsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { ids, reviewed } = body.data;

  if (ids.length === 0) {
    res.json(BulkReviewTransactionsResponse.parse({ updated: 0 }));
    return;
  }

  const updated = await db
    .update(transactionsTable)
    .set({ reviewed })
    .where(inArray(transactionsTable.id, ids))
    .returning({ id: transactionsTable.id });

  res.json(BulkReviewTransactionsResponse.parse({ updated: updated.length }));
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateTransactionParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid transaction id" });
    return;
  }

  const body = UpdateTransactionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const update: Partial<typeof transactionsTable.$inferInsert> = {};
  if (body.data.category !== undefined) {
    update.category = body.data.category;
    update.reviewed = true;
    update.categorizationConfidence = "0.99";
    update.categorizationSource = "user_correction";
    update.categorizationExplanation = "User corrected category inline; merchant memory updated for future imports.";
  }
  if (body.data.notes !== undefined) update.notes = body.data.notes;
  if (body.data.reviewed !== undefined) update.reviewed = body.data.reviewed;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(transactionsTable)
    .set(update)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (body.data.category !== undefined) {
    await rememberMerchantsFromTransactions(
      [{
        merchant: updated.merchant,
        description: updated.description,
        category: updated.category,
        confidence: 0.99,
      }],
      "user_correction",
    );
  }

  res.json(UpdateTransactionResponse.parse(serializeTransaction(updated)));
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteTransactionParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid transaction id" });
    return;
  }

  const [deleted] = await db
    .delete(transactionsTable)
    .where(eq(transactionsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
