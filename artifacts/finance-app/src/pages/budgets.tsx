import React, { useState } from "react";
import {
  useListBudgets,
  useUpsertBudget,
  useDeleteBudget,
  useGetDashboard,
  useListMonths,
  getListBudgetsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Wallet, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

const CATEGORIES = [
  { id: "groceries", label: "Groceries", color: "#22c55e" },
  { id: "food", label: "Food & Dining", color: "#f97316" },
  { id: "transportation", label: "Transportation", color: "#3b82f6" },
  { id: "bills", label: "Bills & Utilities", color: "#a855f7" },
  { id: "subscriptions", label: "Subscriptions", color: "#06b6d4" },
  { id: "shopping", label: "Shopping", color: "#ec4899" },
  { id: "education", label: "Education", color: "#eab308" },
  { id: "health", label: "Health & Fitness", color: "#14b8a6" },
  { id: "entertainment", label: "Entertainment", color: "#f43f5e" },
  { id: "rent", label: "Rent & Housing", color: "#6366f1" },
  { id: "other", label: "Other", color: "#94a3b8" },
];

export default function Budgets() {
  const { data: months } = useListMonths();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const currentMonth = selectedMonth || (months && months.length > 0 ? months[0] : "");

  const { data: budgets, isLoading: budgetsLoading } = useListBudgets(
    { month: currentMonth },
    { query: { queryKey: getListBudgetsQueryKey({ month: currentMonth }), enabled: !!currentMonth } }
  );

  const { data: dashboard } = useGetDashboard(
    { month: currentMonth },
    { query: { queryKey: getGetDashboardQueryKey({ month: currentMonth }), enabled: !!currentMonth } }
  );

  const upsertBudget = useUpsertBudget();
  const deleteBudget = useDeleteBudget();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const budgetMap = new Map((budgets ?? []).map((b) => [b.category, b]));

  const spendingMap = new Map(
    (dashboard?.categoryBreakdown ?? []).map((c) => [c.category, c.amount])
  );

  const handleSave = (category: string) => {
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    upsertBudget.mutate(
      { month: currentMonth, category, data: { amount } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
          setEditingCategory(null);
          toast({ title: "Budget saved" });
        },
      }
    );
  };

  const handleDelete = (category: string) => {
    deleteBudget.mutate(
      { month: currentMonth, category },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
          toast({ title: "Budget removed" });
        },
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
          <p className="text-muted-foreground mt-1">Set monthly spending limits per category.</p>
        </div>
        {months && months.length > 0 && (
          <Select value={currentMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {budgetsLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {CATEGORIES.map((cat) => {
            const budget = budgetMap.get(cat.id);
            const spent = spendingMap.get(cat.id) ?? 0;
            const limit = budget ? budget.amount : 0;
            const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
            const isOver = spent > limit && limit > 0;
            const isWarning = pct >= 80 && pct <= 100;
            const isEditing = editingCategory === cat.id;

            return (
              <Card key={cat.id} className={isOver ? "border-destructive/50" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{cat.label}</span>
                        {isOver && (
                          <Badge variant="destructive" className="text-xs py-0">
                            <AlertTriangle className="w-3 h-3 mr-1" /> Over budget
                          </Badge>
                        )}
                        {isWarning && !isOver && (
                          <Badge variant="outline" className="text-xs py-0 border-amber-400 text-amber-600">
                            {pct}% used
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          {limit > 0 && (
                            <Progress
                              value={pct}
                              className={`h-2 ${isOver ? "[&>div]:bg-destructive" : isWarning ? "[&>div]:bg-amber-400" : "[&>div]:bg-primary"}`}
                            />
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground shrink-0 w-32 text-right">
                          {formatCurrency(spent)}
                          {limit > 0 && <span className="text-xs"> / {formatCurrency(limit)}</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        <>
                          <Input
                            type="number"
                            className="w-24 h-8 text-sm"
                            placeholder="Amount"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSave(cat.id);
                              if (e.key === "Escape") setEditingCategory(null);
                            }}
                            autoFocus
                          />
                          <Button size="sm" className="h-8" onClick={() => handleSave(cat.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingCategory(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              setEditingCategory(cat.id);
                              setEditAmount(limit > 0 ? String(limit) : "");
                            }}
                          >
                            <Wallet className="w-3 h-3 mr-1" />
                            {limit > 0 ? "Edit" : "Set budget"}
                          </Button>
                          {limit > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(cat.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
