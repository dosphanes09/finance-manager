import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterTransactionsByDateRange,
  getDateRangeForPeriod,
  groupTransactionsByCategory,
  groupTransactionsByMonth,
  type DashboardTransactionLike,
} from "./dashboard-periods";

const fixedNow = new Date("2026-06-15T12:00:00Z");

const transactions: DashboardTransactionLike[] = [
  { date: "2026-01-05", amount: 1000, type: "credit", category: "income", merchant: "Salary" },
  { date: "2026-01-08", amount: 120, type: "debit", category: "groceries", merchant: "Migros" },
  { date: "2026-03-12", amount: 80, type: "debit", category: "transportation", merchant: "Obilet" },
  { date: "2026-04-10", amount: 50, type: "debit", category: "subscriptions", merchant: "Spotify" },
  { date: "2026-05-15", amount: 200, type: "debit", category: "groceries", merchant: "Migros" },
  { date: "2026-06-20", amount: 300, type: "debit", category: "shopping", merchant: "Trendyol" },
  { date: "2025-12-29", amount: 500, type: "debit", category: "bills", merchant: "Utility" },
];

describe("dashboard periods", () => {
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

  it("groups category totals across multiple months using debit transactions", () => {
    const range = getDateRangeForPeriod("last_6_months", { now: fixedNow });
    const grouped = groupTransactionsByCategory(
      filterTransactionsByDateRange(transactions, range.startDate, range.endDate),
    );

    assert.deepEqual(grouped[0], {
      category: "groceries",
      amount: 320,
      count: 2,
      percentage: 42.7,
    });
    assert.equal(grouped.some((row) => row.category === "income"), false);
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
});
