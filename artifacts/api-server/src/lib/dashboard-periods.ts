export type DashboardPeriod =
  | "this_month"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "last_12_months"
  | "custom";

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface DashboardTransactionLike {
  date: string;
  amount: number | string;
  type: string;
  category?: string | null;
  merchant?: string | null;
}

export interface MonthlyTrendSummary {
  month: string;
  expenses: number;
  income: number;
}

export interface CategoryBreakdownSummary {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

interface DateRangeOptions {
  startDate?: string;
  endDate?: string;
  now?: Date;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatDateOnly(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonths(year: number, monthIndex: number, delta: number) {
  const absoluteMonth = year * 12 + monthIndex + delta;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonthIndex = absoluteMonth - nextYear * 12;
  return { year: nextYear, monthIndex: nextMonthIndex };
}

function monthKeyFromParts(year: number, monthIndex: number) {
  return `${year}-${pad(monthIndex + 1)}`;
}

function validateDateOnly(value: string, label: string) {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format`);
  }
  return value;
}

export function getMonthDateRange(month: string): DateRange {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("month must use YYYY-MM format");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;

  return {
    startDate: formatDateOnly(year, monthIndex, 1),
    endDate: formatDateOnly(year, monthIndex, daysInMonth(year, monthIndex)),
  };
}

export function getDateRangeForPeriod(period: DashboardPeriod, options: DateRangeOptions = {}): DateRange {
  const now = options.now ?? new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  if (period === "custom") {
    if (!options.startDate || !options.endDate) {
      throw new Error("custom period requires startDate and endDate");
    }

    const startDate = validateDateOnly(options.startDate, "startDate");
    const endDate = validateDateOnly(options.endDate, "endDate");

    if (startDate > endDate) {
      throw new Error("startDate must be before or equal to endDate");
    }

    return { startDate, endDate };
  }

  if (period === "this_year") {
    return {
      startDate: formatDateOnly(year, 0, 1),
      endDate: formatDateOnly(year, 11, 31),
    };
  }

  const periodMonths: Record<Exclude<DashboardPeriod, "custom" | "this_year">, number> = {
    this_month: 1,
    last_3_months: 3,
    last_6_months: 6,
    last_12_months: 12,
  };

  const numberOfMonths = periodMonths[period];
  const start = addMonths(year, monthIndex, -(numberOfMonths - 1));

  return {
    startDate: formatDateOnly(start.year, start.monthIndex, 1),
    endDate: formatDateOnly(year, monthIndex, daysInMonth(year, monthIndex)),
  };
}

export function filterTransactionsByDateRange<T extends { date: string }>(
  transactions: T[],
  startDate: string,
  endDate: string,
) {
  return transactions.filter((transaction) => transaction.date >= startDate && transaction.date <= endDate);
}

function getMonthKey(date: string) {
  return date.substring(0, 7);
}

function monthKeysBetween(startDate: string, endDate: string) {
  const [startYear, startMonth] = getMonthKey(startDate).split("-").map(Number);
  const [endYear, endMonth] = getMonthKey(endDate).split("-").map(Number);
  const keys: string[] = [];

  let cursorYear = startYear;
  let cursorMonthIndex = startMonth - 1;
  const endAbsoluteMonth = endYear * 12 + (endMonth - 1);

  while (cursorYear * 12 + cursorMonthIndex <= endAbsoluteMonth) {
    keys.push(monthKeyFromParts(cursorYear, cursorMonthIndex));
    const next = addMonths(cursorYear, cursorMonthIndex, 1);
    cursorYear = next.year;
    cursorMonthIndex = next.monthIndex;
  }

  return keys;
}

export function groupTransactionsByMonth<T extends DashboardTransactionLike>(
  transactions: T[],
  startDate?: string,
  endDate?: string,
): MonthlyTrendSummary[] {
  const seededMonths =
    startDate && endDate
      ? monthKeysBetween(startDate, endDate)
      : Array.from(new Set(transactions.map((transaction) => getMonthKey(transaction.date)))).sort();

  const byMonth = new Map<string, MonthlyTrendSummary>();

  for (const month of seededMonths) {
    byMonth.set(month, { month, expenses: 0, income: 0 });
  }

  for (const transaction of transactions) {
    const month = getMonthKey(transaction.date);
    const bucket = byMonth.get(month) ?? { month, expenses: 0, income: 0 };
    const amount = Number(transaction.amount);

    if (transaction.type === "credit") {
      bucket.income += amount;
    } else if (transaction.type === "debit") {
      bucket.expenses += amount;
    }

    byMonth.set(month, bucket);
  }

  return Array.from(byMonth.values())
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((row) => ({
      month: row.month,
      expenses: roundMoney(row.expenses),
      income: roundMoney(row.income),
    }));
}

export function groupTransactionsByCategory<T extends DashboardTransactionLike>(
  transactions: T[],
): CategoryBreakdownSummary[] {
  const byCategory = new Map<string, { amount: number; count: number }>();

  for (const transaction of transactions) {
    if (transaction.type !== "debit") {
      continue;
    }

    const category = transaction.category || "other";
    const current = byCategory.get(category) ?? { amount: 0, count: 0 };
    current.amount += Number(transaction.amount);
    current.count += 1;
    byCategory.set(category, current);
  }

  const totalExpenses = Array.from(byCategory.values()).reduce((total, row) => total + row.amount, 0);

  return Array.from(byCategory.entries())
    .map(([category, row]) => ({
      category,
      amount: roundMoney(row.amount),
      count: row.count,
      percentage: totalExpenses > 0 ? Math.round((row.amount / totalExpenses) * 1000) / 10 : 0,
    }))
    .sort((left, right) => right.amount - left.amount);
}

export function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}
