import { Router, type IRouter } from "express";
import { db, transactionsTable, budgetsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/demo", async (_req, res): Promise<void> => {
  const rows = generateDemoTransactions();
  await db.insert(transactionsTable).values(rows);
  res.json({ count: rows.length });
});

router.delete("/data", async (_req, res): Promise<void> => {
  const [txResult, budgetResult] = await Promise.all([
    db.delete(transactionsTable).returning({ id: transactionsTable.id }),
    db.delete(budgetsTable).returning({ id: budgetsTable.id }),
  ]);
  res.json({ transactions: txResult.length, budgets: budgetResult.length });
});

function generateDemoTransactions() {
  const rows: {
    date: string;
    merchant: string;
    description: string;
    amount: string;
    type: "income" | "expense";
    direction: "debit" | "credit";
    category: string;
    month: string;
  }[] = [];

  const months = ["2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06"];

  const recurring = [
    { merchant: "RENT PAYMENT", description: "Monthly rent payment", amount: "1200.00", type: "debit" as const, category: "rent" },
    { merchant: "SPOTIFY", description: "Spotify Premium Monthly", amount: "9.99", type: "debit" as const, category: "subscriptions" },
    { merchant: "NETFLIX", description: "Netflix Subscription", amount: "15.99", type: "debit" as const, category: "subscriptions" },
    { merchant: "VODAFONE MONTHLY", description: "Mobile phone plan", amount: "35.00", type: "debit" as const, category: "bills" },
    { merchant: "EDF ENERGY", description: "Electricity and gas bill", amount: "84.50", type: "debit" as const, category: "bills" },
    { merchant: "VIRGIN MEDIA", description: "Broadband and TV", amount: "55.00", type: "debit" as const, category: "bills" },
    { merchant: "PUREGYM MONTHLY", description: "Gym membership", amount: "24.99", type: "debit" as const, category: "health" },
    { merchant: "GITHUB", description: "GitHub Pro subscription", amount: "4.00", type: "debit" as const, category: "subscriptions" },
  ];

  const salaries = [
    { merchant: "EMPLOYER LTD SALARY", description: "Monthly salary payment BACS", amount: "3800.00", type: "credit" as const, category: "income" },
    { merchant: "FREELANCE CLIENT", description: "Freelance project payment", amount: "450.00", type: "credit" as const, category: "income" },
  ];

  const variable: Array<{
    merchant: string;
    description: string;
    minAmount: number;
    maxAmount: number;
    type: "debit" | "credit";
    category: string;
    frequency: number;
  }> = [
    { merchant: "TESCO SUPERSTORE", description: "Weekly grocery shop", minAmount: 45, maxAmount: 90, type: "debit", category: "groceries", frequency: 4 },
    { merchant: "LIDL GB", description: "Grocery shopping", minAmount: 20, maxAmount: 55, type: "debit", category: "groceries", frequency: 3 },
    { merchant: "WAITROSE", description: "Top-up grocery shop", minAmount: 15, maxAmount: 40, type: "debit", category: "groceries", frequency: 2 },
    { merchant: "DELIVEROO ORDER", description: "Food delivery order", minAmount: 18, maxAmount: 40, type: "debit", category: "food", frequency: 3 },
    { merchant: "STARBUCKS", description: "Coffee shop", minAmount: 4, maxAmount: 8, type: "debit", category: "food", frequency: 5 },
    { merchant: "NANDOS RESTAURANT", description: "Restaurant meal", minAmount: 22, maxAmount: 45, type: "debit", category: "food", frequency: 1 },
    { merchant: "MCDONALDS", description: "Fast food", minAmount: 6, maxAmount: 15, type: "debit", category: "food", frequency: 2 },
    { merchant: "TFL TRAVEL", description: "Transport for London", minAmount: 30, maxAmount: 60, type: "debit", category: "transportation", frequency: 1 },
    { merchant: "SHELL PETROL", description: "Fuel purchase", minAmount: 40, maxAmount: 75, type: "debit", category: "transportation", frequency: 1 },
    { merchant: "AMAZON", description: "Online purchase", minAmount: 12, maxAmount: 80, type: "debit", category: "shopping", frequency: 2 },
    { merchant: "ASOS", description: "Online clothing order", minAmount: 35, maxAmount: 120, type: "debit", category: "shopping", frequency: 1 },
    { merchant: "JOHN LEWIS", description: "Department store", minAmount: 25, maxAmount: 150, type: "debit", category: "shopping", frequency: 1 },
    { merchant: "ODEON CINEMA", description: "Cinema tickets", minAmount: 15, maxAmount: 35, type: "debit", category: "entertainment", frequency: 1 },
    { merchant: "STEAM GAMES", description: "PC game purchase", minAmount: 5, maxAmount: 40, type: "debit", category: "entertainment", frequency: 1 },
    { merchant: "SPECSAVERS", description: "Eye test and glasses", minAmount: 45, maxAmount: 200, type: "debit", category: "health", frequency: 0 },
    { merchant: "BOOTS PHARMACY", description: "Pharmacy purchase", minAmount: 8, maxAmount: 25, type: "debit", category: "health", frequency: 1 },
    { merchant: "UDEMY COURSE", description: "Online course purchase", minAmount: 12, maxAmount: 45, type: "debit", category: "education", frequency: 0 },
    { merchant: "AMAZON PRIME", description: "Amazon Prime membership", minAmount: 8.99, maxAmount: 8.99, type: "debit", category: "subscriptions", frequency: 1 },
    { merchant: "PAYPAL TRANSFER", description: "Payment received", minAmount: 50, maxAmount: 200, type: "credit", category: "income", frequency: 0 },
    { merchant: "COUNCIL TAX", description: "Monthly council tax payment", minAmount: 95, maxAmount: 105, type: "debit", category: "bills", frequency: 1 },
  ];

  let seed = 42;
  function rand(min: number, max: number): number {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    const t = Math.abs(seed) / 0x7fffffff;
    return Math.round((min + t * (max - min)) * 100) / 100;
  }

  function randomDay(month: string, min = 1, max = 28): string {
    const day = Math.floor(rand(min, max));
    return `${month}-${String(day).padStart(2, "0")}`;
  }

  for (const month of months) {
    for (const s of salaries) {
      rows.push({ ...s, type: "income", direction: s.type, date: randomDay(month, 1, 5), month });
    }

    for (const r of recurring) {
      rows.push({ ...r, type: "expense", direction: r.type, date: randomDay(month, 1, 7), month });
    }

    for (const v of variable) {
      const count = v.frequency + (rand(0, 1) > 0.7 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        if (v.frequency === 0 && rand(0, 1) < 0.7) continue;
        const amount = rand(v.minAmount, v.maxAmount);
        rows.push({
          merchant: v.merchant,
          description: v.description,
          amount: amount.toFixed(2),
          type: v.type === "credit" ? "income" : "expense",
          direction: v.type,
          category: v.category,
          date: randomDay(month, 8, 28),
          month,
        });
      }
    }
  }

  return rows;
}

export default router;
