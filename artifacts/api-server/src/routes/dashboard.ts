import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { GetDashboardQueryParams, GetDashboardResponse } from "@workspace/api-zod";

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

router.get("/dashboard", async (req, res): Promise<void> => {
  const params = GetDashboardQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let { month } = params.data;

  if (!month) {
    const [latest] = await db
      .selectDistinct({ month: transactionsTable.month })
      .from(transactionsTable)
      .orderBy(desc(transactionsTable.month))
      .limit(1);
    month = latest?.month ?? new Date().toISOString().substring(0, 7);
  }

  const [summary, categoryRows, merchantRows, trendRows, recentRows, biggestRows, recurringRows] = await Promise.all([
    db
      .select({
        totalExpenses: sql<number>`coalesce(sum(case when type = 'debit' then amount::numeric else 0 end), 0)`,
        totalIncome: sql<number>`coalesce(sum(case when type = 'credit' then amount::numeric else 0 end), 0)`,
        transactionCount: sql<number>`count(*)::int`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.month, month!)),

    db
      .select({
        category: transactionsTable.category,
        amount: sql<number>`sum(case when type = 'debit' then amount::numeric else 0 end)`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.month, month!))
      .groupBy(transactionsTable.category)
      .orderBy(sql`sum(case when type = 'debit' then amount::numeric else 0 end) desc`),

    db
      .select({
        merchant: transactionsTable.merchant,
        amount: sql<number>`sum(case when type = 'debit' then amount::numeric else 0 end)`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.month, month!))
      .groupBy(transactionsTable.merchant)
      .orderBy(sql`sum(case when type = 'debit' then amount::numeric else 0 end) desc`)
      .limit(10),

    db
      .select({
        month: transactionsTable.month,
        expenses: sql<number>`coalesce(sum(case when type = 'debit' then amount::numeric else 0 end), 0)`,
        income: sql<number>`coalesce(sum(case when type = 'credit' then amount::numeric else 0 end), 0)`,
      })
      .from(transactionsTable)
      .groupBy(transactionsTable.month)
      .orderBy(transactionsTable.month),

    db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.month, month!))
      .orderBy(desc(transactionsTable.date), desc(transactionsTable.id))
      .limit(5),

    db
      .select()
      .from(transactionsTable)
      .where(sql`month = ${month} and type = 'debit'`)
      .orderBy(sql`amount::numeric desc`)
      .limit(5),

    db
      .select({
        merchant: transactionsTable.merchant,
        amount: sql<number>`round(avg(case when type = 'debit' then amount::numeric else null end), 2)`,
        count: sql<number>`count(distinct month)::int`,
      })
      .from(transactionsTable)
      .where(sql`type = 'debit'`)
      .groupBy(transactionsTable.merchant)
      .having(sql`count(distinct month) >= 2`)
      .orderBy(sql`round(avg(case when type = 'debit' then amount::numeric else null end), 2) desc`)
      .limit(8),
  ]);

  const { totalExpenses, totalIncome, transactionCount } = summary[0] ?? {
    totalExpenses: 0,
    totalIncome: 0,
    transactionCount: 0,
  };

  const totalExpensesNum = Number(totalExpenses);

  const categoryBreakdown = categoryRows
    .filter((r) => r.category !== "income")
    .map((r) => ({
      category: r.category,
      amount: Number(r.amount),
      count: Number(r.count),
      percentage:
        totalExpensesNum > 0 ? Math.round((Number(r.amount) / totalExpensesNum) * 100 * 10) / 10 : 0,
    }));

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0].category : null;

  const response = GetDashboardResponse.parse({
    month: month!,
    totalExpenses: totalExpensesNum,
    totalIncome: Number(totalIncome),
    netBalance: Number(totalIncome) - totalExpensesNum,
    transactionCount: Number(transactionCount),
    topCategory,
    categoryBreakdown,
    topMerchants: merchantRows.map((r) => ({
      merchant: r.merchant,
      amount: Number(r.amount),
      count: Number(r.count),
    })),
    monthlyTrends: trendRows.map((r) => ({
      month: r.month,
      expenses: Number(r.expenses),
      income: Number(r.income),
    })),
    recentTransactions: recentRows.map(serializeTransaction),
    biggestExpenses: biggestRows.map(serializeTransaction),
    recurringPayments: recurringRows.map((r) => ({
      merchant: r.merchant,
      amount: Number(r.amount),
      count: Number(r.count),
    })),
  });

  res.json(response);
});

export default router;
