import { Router, type IRouter } from "express";
import { and, desc, gte, lte } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { GetDashboardQueryParams, GetDashboardResponse } from "@workspace/api-zod";
import {
  filterTransactionsByDateRange,
  getDateRangeForPeriod,
  getMonthDateRange,
  groupTransactionsByCategory,
  groupTransactionsByMonth,
  roundMoney,
  type DashboardPeriod,
} from "../lib/dashboard-periods";

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

function resolveDashboardRange(params: {
  period?: string;
  startDate?: string;
  endDate?: string;
  month?: string;
}) {
  if (params.month && !params.period) {
    return {
      period: "custom" as DashboardPeriod,
      ...getMonthDateRange(params.month),
    };
  }

  const period = (params.period ?? "this_month") as DashboardPeriod;

  return {
    period,
    ...getDateRangeForPeriod(period, {
      startDate: params.startDate,
      endDate: params.endDate,
    }),
  };
}

type DashboardTransaction = typeof transactionsTable.$inferSelect;

function getAmount(transaction: DashboardTransaction) {
  return Number(transaction.amount);
}

function groupTopMerchants(transactions: DashboardTransaction[]) {
  const byMerchant = new Map<string, { amount: number; count: number }>();

  for (const transaction of transactions) {
    if (transaction.type !== "debit") {
      continue;
    }

    const merchant = transaction.merchant || "Unknown";
    const current = byMerchant.get(merchant) ?? { amount: 0, count: 0 };
    current.amount += getAmount(transaction);
    current.count += 1;
    byMerchant.set(merchant, current);
  }

  return Array.from(byMerchant.entries())
    .map(([merchant, row]) => ({
      merchant,
      amount: roundMoney(row.amount),
      count: row.count,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 10);
}

function buildCategoryMonthlyTrends(
  transactions: DashboardTransaction[],
  categories: string[],
  months: string[],
) {
  const byCategoryMonth = new Map<string, number>();

  for (const category of categories) {
    for (const month of months) {
      byCategoryMonth.set(`${category}|${month}`, 0);
    }
  }

  for (const transaction of transactions) {
    if (transaction.type !== "debit") {
      continue;
    }

    const category = transaction.category || "other";
    if (!categories.includes(category)) {
      continue;
    }

    const month = transaction.date.substring(0, 7);
    const key = `${category}|${month}`;
    byCategoryMonth.set(key, (byCategoryMonth.get(key) ?? 0) + getAmount(transaction));
  }

  return categories.map((category) => ({
    category,
    months: months.map((month) => ({
      month,
      amount: roundMoney(byCategoryMonth.get(`${category}|${month}`) ?? 0),
    })),
  }));
}

function findRecurringPayments(transactions: DashboardTransaction[]) {
  const byMerchant = new Map<string, { total: number; months: Set<string>; count: number }>();

  for (const transaction of transactions) {
    if (transaction.type !== "debit") {
      continue;
    }

    const merchant = transaction.merchant || "Unknown";
    const current = byMerchant.get(merchant) ?? { total: 0, months: new Set<string>(), count: 0 };
    current.total += getAmount(transaction);
    current.months.add(transaction.date.substring(0, 7));
    current.count += 1;
    byMerchant.set(merchant, current);
  }

  return Array.from(byMerchant.entries())
    .filter(([, row]) => row.months.size >= 2)
    .map(([merchant, row]) => ({
      merchant,
      amount: roundMoney(row.total / row.months.size),
      count: row.months.size,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 8);
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const params = GetDashboardQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let range: ReturnType<typeof resolveDashboardRange>;
  try {
    range = resolveDashboardRange(params.data);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid dashboard period" });
    return;
  }

  const rows = await db
    .select()
    .from(transactionsTable)
    .where(and(gte(transactionsTable.date, range.startDate), lte(transactionsTable.date, range.endDate)))
    .orderBy(desc(transactionsTable.date), desc(transactionsTable.id));

  const transactions = filterTransactionsByDateRange(rows, range.startDate, range.endDate);
  const monthlyTrends = groupTransactionsByMonth(transactions, range.startDate, range.endDate);
  const totalExpensesNum = roundMoney(monthlyTrends.reduce((total, row) => total + row.expenses, 0));
  const totalIncomeNum = roundMoney(monthlyTrends.reduce((total, row) => total + row.income, 0));
  const categoryBreakdown = groupTransactionsByCategory(transactions);
  const months = monthlyTrends.map((row) => row.month);
  const categoryMonthlyTrends = buildCategoryMonthlyTrends(
    transactions,
    categoryBreakdown.slice(0, 8).map((row) => row.category),
    months,
  );

  const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0].category : null;
  const recentRows = transactions.slice(0, 5);
  const biggestRows = transactions
    .filter((transaction) => transaction.type === "debit")
    .sort((left, right) => getAmount(right) - getAmount(left))
    .slice(0, 5);

  const response = GetDashboardResponse.parse({
    month: range.endDate.substring(0, 7),
    period: range.period,
    startDate: range.startDate,
    endDate: range.endDate,
    totalExpenses: totalExpensesNum,
    totalIncome: totalIncomeNum,
    netBalance: roundMoney(totalIncomeNum - totalExpensesNum),
    transactionCount: transactions.length,
    topCategory,
    categoryBreakdown,
    topMerchants: groupTopMerchants(transactions),
    monthlyTrends,
    categoryMonthlyTrends,
    recentTransactions: recentRows.map(serializeTransaction),
    biggestExpenses: biggestRows.map(serializeTransaction),
    recurringPayments: findRecurringPayments(transactions),
  });

  res.json(response);
});

export default router;
