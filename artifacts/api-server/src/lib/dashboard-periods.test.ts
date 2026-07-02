import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DASHBOARD_PERIOD,
  filterTransactionsByDateRange,
  getDateRangeForPeriod,
  groupTransactionsByCategory,
  groupTransactionsByMonth,
  type DashboardTransactionLike,
} from "./dashboard-periods";

const fixedNow = new Date("2026-06-15T12:00:00Z");

const transactions: DashboardTransactionLike[] = [
  { date: "2026-01-05", amount: 1000, type: "income", direction: "credit", category: "income", merchant: "Salary" },
  { date: "2026-01-08", amount: 120, type: "expense", direction: "debit", category: "groceries", merchant: "Migros" },
  { date: "2026-03-12", amount: 80, type: "expense", direction: "debit", category: "transportation", merchant: "Obilet" },
  { date: "2026-04-10", amount: 50, type: "expense", direction: "debit", category: "subscriptions", merchant: "Spotify" },
  { date: "2026-05-15", amount: 200, type: "expense", direction: "debit", category: "groceries", merchant: "Migros" },
  { date: "2026-06-15", amount: 1250, type: "credit_card_payment", direction: "debit", category: "other", merchant: "Credit Card Payment" },
  { date: "2026-06-16", amount: 1250, type: "credit_card_payment", direction: "credit", category: "other", merchant: "Card Payment Received" },
  { date: "2026-06-17", amount: 400, type: "transfer", direction: "debit", category: "other", merchant: "Bank Transfer" },
  { date: "2026-06-18", amount: 700, type: "unknown_review", direction: "credit", category: "other", merchant: "FAST Incoming" },
  { date: "2026-06-20", amount: 300, type: "expense", direction: "debit", category: "shopping", merchant: "Trendyol" },
  { date: "2026-06-21", amount: 90, type: "expense", direction: "debit", category: "Food & Dining", merchant: "Starbucks" },
  { date: "2026-06-22", amount: 60, type: "expense", direction: "debit", category: "food_dining", merchant: "Yemeksepeti" },
  { date: "2026-06-23", amount: 25, type: "fee", direction: "debit", category: "bills", merchant: "BSMV" },
  { date: "2026-06-24", amount: 40, type: "refund", direction: "credit", category: "shopping", merchant: "Trendyol Refund" },
  { date: "2025-12-29", amount: 500, type: "expense", direction: "debit", category: "bills", merchant: "Utility" },
];

describe("dashboard periods", () => {
  it("defaults to a broad period so imported statements are visible after upload", () => {
    assert.equal(DEFAULT_DASHBOARD_PERIOD, "last_12_months");
  });

  it("returns the current month range for the 1 month filter", () => {
    assert.deepEqual(getDateRangeForPeriod("this_month", { now: fixedNow }), {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });

  it("returns a current-plus-previous 3 month range", () => {
    assert.deepEqual(getDateRangeForPeriod("last_3_months", { now: fixedNow }), {
      startDate: "2026-04-01",
      endDate: "2026-06-30",
    });
  });

  it("returns a current-plus-previous 6 month range", () => {
    assert.deepEqual(getDateRangeForPeriod("last_6_months", { now: fixedNow }), {
      startDate: "2026-01-01",
      endDate: "2026-06-30",
    });
  });

  it("returns the current year range", () => {
    assert.deepEqual(getDateRangeForPeriod("this_year", { now: fixedNow }), {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });

  it("returns and applies a custom date range", () => {
    const range = getDateRangeForPeriod("custom", {
      startDate: "2026-03-01",
      endDate: "2026-04-30",
      now: fixedNow,
    });

    assert.deepEqual(range, { startDate: "2026-03-01", endDate: "2026-04-30" });
    assert.deepEqual(
      filterTransactionsByDateRange(transactions, range.startDate, range.endDate).map((row) => row.merchant),
      ["Obilet", "Spotify"],
    );
  });

  it("groups category totals across multiple months using expense transactions", () => {
    const range = getDateRangeForPeriod("last_6_months", { now: fixedNow });
    const grouped = groupTransactionsByCategory(
      filterTransactionsByDateRange(transactions, range.startDate, range.endDate),
    );

    assert.deepEqual(grouped[0], {
      category: "groceries",
      amount: 320,
      count: 2,
      percentage: 36.2,
    });
    assert.equal(grouped.some((row) => row.category === "income"), false);
  });

  it("normalizes legacy category labels before dashboard aggregation", () => {
    const grouped = groupTransactionsByCategory([
      { date: "2026-06-01", amount: 100, type: "expense", category: "food", merchant: "Cafe" },
      { date: "2026-06-02", amount: 50, type: "expense", category: "Food & Dining", merchant: "Restaurant" },
      { date: "2026-06-03", amount: 25, type: "expense", category: "dining", merchant: "Bakery" },
    ]);

    assert.deepEqual(grouped, [{ category: "food", amount: 175, count: 3, percentage: 100 }]);
  });

  it("keeps empty months in monthly trends with zero totals", () => {
    const range = getDateRangeForPeriod("last_6_months", { now: fixedNow });
    const grouped = groupTransactionsByMonth(
      filterTransactionsByDateRange(transactions, range.startDate, range.endDate),
      range.startDate,
      range.endDate,
    );

    assert.deepEqual(
      grouped.map((row) => row.month),
      ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
    );
    assert.deepEqual(grouped[1], { month: "2026-02", expenses: 0, income: 0 });
  });

  it("excludes transfers and credit card payments while fees and refunds affect expenses", () => {
    const juneTransactions = filterTransactionsByDateRange(transactions, "2026-06-01", "2026-06-30");
    const grouped = groupTransactionsByMonth(juneTransactions, "2026-06-01", "2026-06-30");
    assert.deepEqual(grouped[0], { month: "2026-06", expenses: 435, income: 0 });

    const categories = groupTransactionsByCategory(juneTransactions);
    assert.equal(categories.some((row) => row.category === "other"), false);
    assert.equal(categories.find((row) => row.category === "shopping")?.amount, 260);
    assert.equal(categories.find((row) => row.category === "bills")?.amount, 25);
  });
});
