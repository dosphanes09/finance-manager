import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, transactionsTable } from "@workspace/db";
import { GetInsightsQueryParams, GetInsightsResponse } from "@workspace/api-zod";
import { formatCurrency } from "@workspace/finance-format";
import { getCategoryLabel } from "@workspace/finance-categories";

const router: IRouter = Router();

router.get("/insights", async (req, res): Promise<void> => {
  const params = GetInsightsQueryParams.safeParse(req.query);
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

  const prevMonth = getPreviousMonth(month);

  const [currentRows, previousRows, recurringRows] = await Promise.all([
    db
      .select({
        category: transactionsTable.category,
        expenses: sql<number>`coalesce(sum(case when type = 'debit' then amount::numeric else 0 end), 0)`,
        income: sql<number>`coalesce(sum(case when type = 'credit' then amount::numeric else 0 end), 0)`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.month, month!))
      .groupBy(transactionsTable.category),

    db
      .select({
        category: transactionsTable.category,
        expenses: sql<number>`coalesce(sum(case when type = 'debit' then amount::numeric else 0 end), 0)`,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.month, prevMonth))
      .groupBy(transactionsTable.category),

    db
      .select({
        merchant: transactionsTable.merchant,
        amount: sql<number>`round(avg(case when type = 'debit' then amount::numeric else null end), 2)`,
        count: sql<number>`count(distinct month)::int`,
      })
      .from(transactionsTable)
      .where(sql`month >= ${getSixMonthsAgo(month!)} and type = 'debit'`)
      .groupBy(transactionsTable.merchant)
      .having(sql`count(distinct month) >= 3`)
      .orderBy(sql`round(avg(case when type = 'debit' then amount::numeric else null end), 2) desc`)
      .limit(10),
  ]);

  const prevMap = new Map(previousRows.map((r) => [r.category, Number(r.expenses)]));

  const monthOverMonth = currentRows
    .filter((r) => r.category !== "income")
    .map((r) => {
      const current = Number(r.expenses);
      const previous = prevMap.get(r.category) ?? 0;
      const change = current - previous;
      const changePercent = previous > 0 ? Math.round((change / previous) * 100) : 0;
      return { category: r.category, current, previous, change, changePercent };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const totalIncome = currentRows.reduce((sum, r) => sum + Number(r.income), 0);
  const totalExpenses = currentRows
    .filter((r) => r.category !== "income")
    .reduce((sum, r) => sum + Number(r.expenses), 0);

  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
  const healthScore = Math.max(0, Math.min(100, Math.round(savingsRate * 1.5 + 20)));

  const savingsOpportunities = buildSavingsOpportunities(currentRows, previousRows);

  const summary = buildSummary(month!, totalIncome, totalExpenses, savingsRate, monthOverMonth);

  const unusualMerchants = await getUnusualMerchants(month!, prevMonth);

  res.json(
    GetInsightsResponse.parse({
      month: month!,
      healthScore,
      summary,
      monthOverMonth,
      recurringPayments: recurringRows.map((r) => ({
        merchant: r.merchant,
        amount: Number(r.amount),
        count: Number(r.count),
      })),
      unusualMerchants,
      savingsOpportunities,
    })
  );
});

function getPreviousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const prev = new Date(year, m - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

function getSixMonthsAgo(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const prev = new Date(year, m - 7, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

async function getUnusualMerchants(
  currentMonth: string,
  prevMonth: string
): Promise<{ merchant: string; amount: number; count: number }[]> {
  const currentMerchants = await db
    .select({
      merchant: transactionsTable.merchant,
      amount: sql<number>`sum(case when type = 'debit' then amount::numeric else 0 end)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.month, currentMonth))
    .groupBy(transactionsTable.merchant)
    .orderBy(sql`sum(case when type = 'debit' then amount::numeric else 0 end) desc`)
    .limit(20);

  const prevMerchantsResult = await db
    .selectDistinct({ merchant: transactionsTable.merchant })
    .from(transactionsTable)
    .where(eq(transactionsTable.month, prevMonth));

  const prevSet = new Set(prevMerchantsResult.map((r) => r.merchant));

  return currentMerchants
    .filter((r) => !prevSet.has(r.merchant) && Number(r.amount) > 50)
    .slice(0, 5)
    .map((r) => ({ merchant: r.merchant, amount: Number(r.amount), count: Number(r.count) }));
}

type CategoryRow = { category: string; expenses: number; income: number };
type PrevRow = { category: string; expenses: number };

function buildSavingsOpportunities(current: CategoryRow[], _previous: PrevRow[]): string[] {
  const tips: string[] = [];
  const expMap = Object.fromEntries(
    current.map((r) => [r.category, Number(r.expenses)])
  );

  if ((expMap.food ?? 0) > 400) tips.push("Yeme içme harcamalarınız yüksek; evde daha sık yemek yapmak önemli tasarruf sağlayabilir.");
  if ((expMap.subscriptions ?? 0) > 100) tips.push("Birden fazla aboneliğiniz var; gerçekten kullandıklarınızı gözden geçirmeyi düşünün.");
  if ((expMap.shopping ?? 0) > 300) tips.push("Alışveriş harcamaları yükselmiş; zorunlu olmayan harcamalar için 24 saat bekleme kuralını deneyin.");
  if ((expMap.entertainment ?? 0) > 150) tips.push("Eğlence giderleri ortalamanın üzerinde; ücretsiz veya daha düşük maliyetli alternatiflere bakın.");
  if ((expMap.transportation ?? 0) > 200) tips.push("Ulaşım giderleri yüksek; toplu taşıma veya yol paylaşımı seçeneklerini değerlendirin.");

  if (tips.length === 0) {
    tips.push("Bu ay harcamalarınız dengeli görünüyor. Böyle devam edin!");
  }

  return tips;
}

type MonthOverMonth = { category: string; current: number; previous: number; change: number; changePercent: number };

function buildSummary(
  month: string,
  income: number,
  expenses: number,
  savingsRate: number,
  mom: MonthOverMonth[]
): string {
  const fmt = (n: number) => formatCurrency(n);
  const biggestIncrease = mom.filter((m) => m.change > 0).sort((a, b) => b.change - a.change)[0];

  let summary = `${month} döneminde toplam geliriniz ${fmt(income)}, toplam gideriniz ${fmt(expenses)}.`;

  if (savingsRate > 20) {
    summary += ` ${fmt(income - expenses)} tasarruf ettiniz (%${savingsRate.toFixed(0)} tasarruf oranı). Harika!`;
  } else if (income > 0 && expenses > income) {
    summary += ` Gelirinizden ${fmt(expenses - income)} daha fazla harcadınız; bütçenizi gözden geçirmeyi düşünün.`;
  } else {
    summary += ` Net bakiyeniz ${fmt(income - expenses)}.`;
  }

  if (biggestIncrease) {
    summary += ` En büyük harcama artışı ${getCategoryLabel(biggestIncrease.category)} kategorisinde oldu (geçen aya göre +${fmt(biggestIncrease.change)}).`;
  }

  return summary;
}

export default router;
