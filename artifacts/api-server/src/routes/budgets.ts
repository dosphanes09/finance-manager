import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, budgetsTable } from "@workspace/db";
import {
  ListBudgetsQueryParams,
  ListBudgetsResponse,
  UpsertBudgetParams,
  UpsertBudgetBody,
  UpsertBudgetResponse,
  DeleteBudgetParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeBudget(b: typeof budgetsTable.$inferSelect) {
  return {
    ...b,
    amount: parseFloat(b.amount),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

router.get("/budgets", async (req, res): Promise<void> => {
  const params = ListBudgetsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { month } = params.data;
  const rows = await db
    .select()
    .from(budgetsTable)
    .where(month ? eq(budgetsTable.month, month) : undefined);

  res.json(ListBudgetsResponse.parse(rows.map(serializeBudget)));
});

router.put("/budgets/:month/:category", async (req, res): Promise<void> => {
  const pathParams = UpsertBudgetParams.safeParse(req.params);
  if (!pathParams.success) {
    res.status(400).json({ error: "Invalid path parameters" });
    return;
  }

  const body = UpsertBudgetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { month, category } = pathParams.data;
  const { amount } = body.data;

  const [row] = await db
    .insert(budgetsTable)
    .values({ month, category, amount: String(amount) })
    .onConflictDoUpdate({
      target: [budgetsTable.category, budgetsTable.month],
      set: { amount: String(amount) },
    })
    .returning();

  res.json(UpsertBudgetResponse.parse(serializeBudget(row)));
});

router.delete("/budgets/:month/:category", async (req, res): Promise<void> => {
  const pathParams = DeleteBudgetParams.safeParse(req.params);
  if (!pathParams.success) {
    res.status(400).json({ error: "Invalid path parameters" });
    return;
  }

  const { month, category } = pathParams.data;

  await db
    .delete(budgetsTable)
    .where(and(eq(budgetsTable.month, month), eq(budgetsTable.category, category)));

  res.sendStatus(204);
});

export default router;
