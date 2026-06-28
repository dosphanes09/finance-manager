import React, { useState } from "react";
import { Link } from "wouter";
import { useGetDashboard, getGetDashboardQueryKey, useListMonths } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon, ArrowUpIcon, Wallet, Activity, RefreshCcw, TrendingDown, ArrowRight } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  groceries: "#22c55e", food: "#f97316", transportation: "#3b82f6",
  bills: "#a855f7", subscriptions: "#06b6d4", shopping: "#ec4899",
  education: "#eab308", health: "#14b8a6", entertainment: "#f43f5e",
  rent: "#6366f1", income: "#10b981", other: "#94a3b8",
};

function getCategoryColor(category: string, index: number) {
  return CATEGORY_COLORS[category] ?? `hsl(${(index * 47) % 360}, 70%, 55%)`;
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
  const { data: months } = useListMonths();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const currentMonth = selectedMonth || (months && months.length > 0 ? months[0] : "");

  const { data: d, isLoading } = useGetDashboard(
    { month: currentMonth },
    { query: { queryKey: getGetDashboardQueryKey({ month: currentMonth }), enabled: !!currentMonth } }
  );

  const emptyState = (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
      <p className="text-muted-foreground text-sm">No data for this month.</p>
      <Link href="/upload">
        <Button variant="outline" size="sm">Upload a statement</Button>
      </Link>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Your financial overview</p>
        </div>
        {months && months.length > 0 && (
          <Select value={currentMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36" data-testid="month-selector">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

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
              subtitle={d.topCategory ? `Top: ${d.topCategory}` : undefined} />
            <SummaryCard title="Transactions" amount={d.transactionCount} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader><CardTitle>Spending by Category</CardTitle></CardHeader>
              <CardContent className="h-[280px]">
                {d.categoryBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={d.categoryBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                        paddingAngle={2} dataKey="amount" nameKey="category">
                        {d.categoryBreakdown.map((entry, index) => (
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
                ) : emptyState}
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
                      <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
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
              <CardHeader><CardTitle>Income vs Expenses Trend</CardTitle></CardHeader>
              <CardContent className="h-[220px]">
                {d.monthlyTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.monthlyTrends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 12 }} />
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
                      {t.type === "credit" ? "+" : ""}{formatCurrency(t.amount)}
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
                      <Badge variant="outline" className="text-xs mt-0.5 py-0">{t.category}</Badge>
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
