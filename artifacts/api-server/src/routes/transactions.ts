import { Router, type IRouter } from "express";
import { eq, desc, asc, and, like, sql, inArray } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    ...t,
    amount: parseFloat(t.amount),
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

  const { month, category, type, search, limit = 100, offset = 0, sortBy = "date", sortDir = "desc" } = params.data;

  const conditions = [];
  if (month) conditions.push(eq(transactionsTable.month, month));
  if (category) conditions.push(eq(transactionsTable.category, category));
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
    .set({ category })
    .where(inArray(transactionsTable.id, ids))
    .returning({ id: transactionsTable.id });

  res.json(BulkCategorizeResponse.parse({ updated: updated.length }));
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
  if (body.data.category !== undefined) update.category = body.data.category;
  if (body.data.notes !== undefined) update.notes = body.data.notes;

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
