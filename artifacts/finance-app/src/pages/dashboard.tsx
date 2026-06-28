import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import type { GetDashboardParams, GetDashboardPeriod } from "@workspace/api-client-react";
import { getCategoryColor as getCanonicalCategoryColor, getCategoryLabel } from "@workspace/finance-categories";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon, ArrowUpIcon, Wallet, Activity, RefreshCcw, TrendingDown, ArrowRight } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

function getCategoryColor(category: string, index: number) {
  return getCanonicalCategoryColor(category) ?? `hsl(${(index * 47) % 360}, 70%, 55%)`;
}

const PERIOD_STORAGE_KEY = "finance-dashboard-period";
const CUSTOM_START_STORAGE_KEY = "finance-dashboard-custom-start";
const CUSTOM_END_STORAGE_KEY = "finance-dashboard-custom-end";

const PERIOD_OPTIONS: Array<{ value: GetDashboardPeriod; label: string }> = [
  { value: "this_month", label: "This month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "this_year", label: "This year" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthStart() {
  const now = new Date();
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function getToday() {
  return toDateInputValue(new Date());
}

function getStoredValue(key: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }

  return window.localStorage.getItem(key) || fallback;
}

function getStoredPeriod() {
  const stored = getStoredValue(PERIOD_STORAGE_KEY, "this_month");
  return PERIOD_OPTIONS.some((option) => option.value === stored) ? (stored as GetDashboardPeriod) : "this_month";
}

function SummaryCard({ title, amount, icon, isCurrency = false, subtitle }: {
  title: string; amount: number; icon: React.ReactNode; isCurrency?: boolean; subtitle?: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono">
          {isCurrency ? formatCurrency(amount) : amount.toLocaleString()}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState<GetDashboardPeriod>(getStoredPeriod);
  const [customStartDate, setCustomStartDate] = useState(() =>
    getStoredValue(CUSTOM_START_STORAGE_KEY, getCurrentMonthStart()),
  );
  const [customEndDate, setCustomEndDate] = useState(() => getStoredValue(CUSTOM_END_STORAGE_KEY, getToday()));

  useEffect(() => {
    window.localStorage.setItem(PERIOD_STORAGE_KEY, period);
  }, [period]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_START_STORAGE_KEY, customStartDate);
  }, [customStartDate]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_END_STORAGE_KEY, customEndDate);
  }, [customEndDate]);

  const isCustomRangeInvalid = period === "custom" && (!customStartDate || !customEndDate || customStartDate > customEndDate);
  const dashboardParams = useMemo<GetDashboardParams>(() => {
    if (period === "custom") {
      return { period, startDate: customStartDate, endDate: customEndDate };
    }

    return { period };
  }, [customEndDate, customStartDate, period]);

  const { data: d, isLoading } = useGetDashboard(
    dashboardParams,
    {
      query: {
        queryKey: getGetDashboardQueryKey(dashboardParams),
        enabled: !isCustomRangeInvalid,
      },
    },
  );

  const emptyState = (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
      <p className="text-muted-foreground text-sm">No data for this period.</p>
      <Link href="/upload">
        <Button variant="outline" size="sm">Upload a statement</Button>
      </Link>
    </div>
  );

  const selectedPeriodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "This month";
  const categoryBreakdown = d?.categoryBreakdown.map((row) => ({
    ...row,
    categoryLabel: getCategoryLabel(row.category),
  })) ?? [];
  const categoryTrendRows = d?.categoryMonthlyTrends.filter((row) => row.months.some((month) => month.amount > 0)).slice(0, 6) ?? [];
  const showCategoryTrend = (d?.monthlyTrends.length ?? 0) > 1 && categoryTrendRows.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {d ? `${selectedPeriodLabel}: ${formatDate(d.startDate)} - ${formatDate(d.endDate)}` : "Your financial overview"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Select value={period} onValueChange={(value) => setPeriod(value as GetDashboardPeriod)}>
            <SelectTrigger className="w-full sm:w-44" data-testid="period-selector">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="Custom start date"
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="w-full sm:w-36"
              />
              <Input
                aria-label="Custom end date"
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="w-full sm:w-36"
              />
            </div>
          )}
        </div>
      </div>

      {isCustomRangeInvalid && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Choose a valid custom date range.
          </CardContent>
        </Card>
      )}

      {isLoading || !d ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-72 w-full" />)}
          </div>
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="Net Balance" amount={d.netBalance} icon={<Wallet className="h-4 w-4 text-primary" />} isCurrency
              subtitle={d.netBalance >= 0 ? "You're in the green" : "Spending exceeds income"} />
            <SummaryCard title="Total Income" amount={d.totalIncome} icon={<ArrowUpIcon className="h-4 w-4 text-emerald-500" />} isCurrency />
            <SummaryCard title="Total Expenses" amount={d.totalExpenses} icon={<ArrowDownIcon className="h-4 w-4 text-rose-500" />} isCurrency
              subtitle={d.topCategory ? `Top: ${getCategoryLabel(d.topCategory)}` : undefined} />
            <SummaryCard title="Transactions" amount={d.transactionCount} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Spending by Category</CardTitle>
                <CardDescription>Total and share for the selected period</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                {categoryBreakdown.length > 0 ? (
                  <>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                            paddingAngle={2} dataKey="amount" nameKey="categoryLabel">
                            {categoryBreakdown.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={getCategoryColor(entry.category, index)} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            formatter={(value: number, name: string) => [formatCurrency(value), name]}
                            contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                          />
                          <Legend iconType="circle" iconSize={8} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {categoryBreakdown.slice(0, 7).map((row, index) => (
                        <div key={row.category} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(row.category, index) }} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{row.categoryLabel}</p>
                              <p className="text-xs text-muted-foreground">{row.percentage}% share</p>
                            </div>
                          </div>
                          <span className="shrink-0 text-sm font-mono">{formatCurrency(row.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="lg:col-span-2 h-[260px]">{emptyState}</div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader><CardTitle>Top Merchants</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                {d.topMerchants.filter((m) => m.amount > 0).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.topMerchants.filter((m) => m.amount > 0).slice(0, 8)}
                      layout="vertical" margin={{ top: 0, right: 20, left: 30, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatCurrency(Number(v))} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="merchant" type="category" width={85} tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(v: number) => formatCurrency(v)}
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : emptyState}
              </CardContent>
            </Card>

            <Card className="md:col-span-2 shadow-sm">
              <CardHeader>
                <CardTitle>Income vs Expenses Trend</CardTitle>
                <CardDescription>Empty months are shown as zero.</CardDescription>
              </CardHeader>
              <CardContent className="h-[220px]">
                {d.monthlyTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.monthlyTrends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => formatCurrency(Number(v))} tick={{ fontSize: 12 }} />
                      <RechartsTooltip formatter={(v: number) => formatCurrency(v)}
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                      <Legend />
                      <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : emptyState}
              </CardContent>
            </Card>

            {showCategoryTrend && (
              <Card className="md:col-span-2 shadow-sm">
                <CardHeader>
                  <CardTitle>Category Trend</CardTitle>
                  <CardDescription>Month-by-month spending for top categories</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Category</th>
                          {d.monthlyTrends.map((month) => (
                            <th key={month.month} className="px-3 py-2 text-right font-medium">{month.month}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {categoryTrendRows.map((row) => (
                          <tr key={row.category} className="border-b last:border-0">
                            <td className="py-2 pr-3 font-medium">{getCategoryLabel(row.category)}</td>
                            {row.months.map((month) => (
                              <td key={`${row.category}-${month.month}`} className="px-3 py-2 text-right font-mono">
                                {formatCurrency(month.amount)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Bottom Row */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Transactions</CardTitle>
                  <Link href="/transactions">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      View all <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {d.recentTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No transactions</p>
                ) : d.recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.merchant}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                    </div>
                    <span className={`text-sm font-mono font-medium ml-3 shrink-0 ${t.type === "credit" ? "text-emerald-600" : ""}`}>
                      {formatCurrency(t.type === "credit" ? t.amount : -t.amount, t.currency)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-rose-500" /> Biggest Expenses
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {d.biggestExpenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No expenses</p>
                ) : d.biggestExpenses.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.merchant}</p>
                      <Badge variant="outline" className="text-xs mt-0.5 py-0">{getCategoryLabel(t.category)}</Badge>
                    </div>
                    <span className="text-sm font-mono font-medium ml-3 shrink-0 text-rose-600">
                      {formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4 text-primary" /> Recurring Payments
                </CardTitle>
                <CardDescription className="text-xs">Charged across multiple months</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {d.recurringPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No patterns detected yet</p>
                ) : d.recurringPayments.slice(0, 5).map((r) => (
                  <div key={r.merchant} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.merchant}</p>
                      <p className="text-xs text-muted-foreground">{r.count} months</p>
                    </div>
                    <span className="text-sm font-mono font-medium ml-3 shrink-0">
                      {formatCurrency(r.amount)}/mo
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
