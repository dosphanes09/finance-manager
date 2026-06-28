import React, { useState, useCallback } from "react";
import {
  useListTransactions, getListTransactionsQueryKey,
  useUpdateTransaction, useDeleteTransaction, useListMonths,
  useListCategories, useBulkCategorize,
  useCreateRuleDraftsFromTransactions,
  useCreateRulesFromTransactions,
  getListRulesQueryKey,
  getListRuleSuggestionsQueryKey,
  type RuleDraft,
  type Transaction,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, Search, Download, ChevronUp, ChevronDown, ChevronsUpDown, Tag, Wand2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type SortBy = "date" | "amount" | "category" | "merchant";
type SortDir = "asc" | "desc";

type RuleDraftEdit = {
  pattern: string;
  category: string;
};

function SortIcon({ column, sortBy, sortDir }: { column: SortBy; sortBy: SortBy; sortDir: SortDir }) {
  if (sortBy !== column) return <ChevronsUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-primary" />
    : <ChevronDown className="w-3 h-3 ml-1 text-primary" />;
}

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [month, setMonth] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft[]>([]);
  const [ruleDraftEdits, setRuleDraftEdits] = useState<Record<string, RuleDraftEdit>>({});
  const [ruleSourceTransactions, setRuleSourceTransactions] = useState<Transaction[]>([]);
  const [editingNote, setEditingNote] = useState<{ id: number; value: string } | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = {
    ...(search && { search }),
    ...(merchantFilter && { merchant: merchantFilter }),
    ...(needsReview && { needsReview: true }),
    ...(month !== "all" && { month }),
    ...(type !== "all" && { type }),
    ...(category !== "all" && { category }),
    sortBy,
    sortDir,
    limit: 200,
  };

  const { data, isLoading } = useListTransactions(queryParams, {
    query: { queryKey: getListTransactionsQueryKey(queryParams) },
  });
  const { data: months } = useListMonths();
  const { data: categories } = useListCategories();

  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();
  const bulkMutation = useBulkCategorize();
  const draftRuleMutation = useCreateRuleDraftsFromTransactions();
  const createRulesMutation = useCreateRulesFromTransactions();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  }, [queryClient]);

  const invalidateRuleData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRuleSuggestionsQueryKey() });
  }, [queryClient]);

  const getCategory = (categoryId: string) => categories?.find((c) => c.id === categoryId);

  const handleSort = (col: SortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
    setSelected(new Set());
  };

  const handleCategoryChange = (id: number, cat: string) => {
    updateMutation.mutate({ id, data: { category: cat } }, {
      onSuccess: () => { invalidate(); toast({ title: "Category updated" }); },
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    deleteMutation.mutate({ id }, { onSuccess: () => { invalidate(); toast({ title: "Deleted" }); } });
  };

  const handleSaveNote = (id: number) => {
    if (!editingNote) return;
    updateMutation.mutate({ id, data: { notes: editingNote.value } }, {
      onSuccess: () => { invalidate(); setEditingNote(null); toast({ title: "Note saved" }); },
    });
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data) return;
    if (selected.size === data.transactions.length) setSelected(new Set());
    else setSelected(new Set(data.transactions.map((t) => t.id)));
  };

  const handleBulkCategorize = () => {
    if (!bulkCategory || selected.size === 0) return;
    bulkMutation.mutate({ data: { ids: Array.from(selected), category: bulkCategory } }, {
      onSuccess: (result) => {
        invalidate();
        setSelected(new Set());
        setBulkDialogOpen(false);
        toast({ title: `Updated ${result.updated} transactions` });
      },
    });
  };

  const buildInitialRuleEdits = (drafts: RuleDraft[]): Record<string, RuleDraftEdit> => {
    return Object.fromEntries(
      drafts.map((draft) => {
        const currentNonOther = draft.currentCategories.find((item) => item.category !== "other")?.category;
        const categoryValue = draft.suggestedCategory !== "other"
          ? draft.suggestedCategory
          : currentNonOther ?? "";

        return [draft.groupKey, { pattern: draft.pattern, category: categoryValue }];
      }),
    );
  };

  const openRuleDialog = (transactionIds: number[]) => {
    const sourceTransactions = transactions.filter((transaction) => transactionIds.includes(transaction.id));
    draftRuleMutation.mutate(
      { data: { transactionIds } },
      {
        onSuccess: (drafts) => {
          if (drafts.length === 0) {
            toast({ variant: "destructive", title: "No transactions found" });
            return;
          }

          setRuleSourceTransactions(sourceTransactions);
          setRuleDrafts(drafts);
          setRuleDraftEdits(buildInitialRuleEdits(drafts));
          setRuleDialogOpen(true);
        },
        onError: () => toast({ variant: "destructive", title: "Failed to prepare rule" }),
      },
    );
  };

  const openSelectedRuleDialog = () => {
    if (selected.size === 0) return;
    openRuleDialog(Array.from(selected));
  };

  const updateDraftEdit = (draft: RuleDraft, patch: Partial<RuleDraftEdit>) => {
    setRuleDraftEdits((current) => ({
      ...current,
      [draft.groupKey]: { ...current[draft.groupKey], ...patch },
    }));
  };

  const canSaveRules = ruleDrafts.length > 0 && ruleDrafts.every((draft) => {
    const edit = ruleDraftEdits[draft.groupKey];
    return edit?.pattern.trim() && edit?.category;
  });

  const saveRulesFromDialog = (applyToMatches: boolean) => {
    if (!canSaveRules) {
      toast({ variant: "destructive", title: "Fill in every pattern and category" });
      return;
    }

    createRulesMutation.mutate(
      {
        data: {
          rules: ruleDrafts.map((draft) => ({
            transactionIds: draft.transactionIds,
            pattern: ruleDraftEdits[draft.groupKey].pattern.trim(),
            category: ruleDraftEdits[draft.groupKey].category,
            applyToMatches,
            priority: 30,
          })),
        },
      },
      {
        onSuccess: (result) => {
          invalidate();
          invalidateRuleData();
          setSelected(new Set());
          setRuleDialogOpen(false);
          toast({
            title: `${result.createdRules.length} rule${result.createdRules.length === 1 ? "" : "s"} created`,
            description: `${result.updated} transaction${result.updated === 1 ? "" : "s"} updated`,
          });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to create rule" }),
      },
    );
  };

  const handleExportCsv = () => {
    if (!data?.transactions.length) return;
    const headers = ["Date", "Merchant", "Description", "Type", "Category", "Amount", "Notes"];
    const rows = data.transactions.map((t) => [
      t.date, t.merchant, `"${t.description.replace(/"/g, '""')}"`,
      t.type, t.category, t.amount, t.notes ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${month !== "all" ? month : "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const transactions = data?.transactions ?? [];
  const allSelected = transactions.length > 0 && selected.size === transactions.length;
  const singleRuleTransaction = ruleSourceTransactions.length === 1 ? ruleSourceTransactions[0] : null;
  const singleRuleDraft = ruleDrafts.length === 1 ? ruleDrafts[0] : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {data ? `${data.total} transactions` : "Loading..."}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {selected.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(true)}>
                <Tag className="w-3.5 h-3.5 mr-1.5" />
                Categorize {selected.size}
              </Button>
              <Button variant="outline" size="sm" onClick={openSelectedRuleDialog} disabled={draftRuleMutation.isPending}>
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                Create rule from selected
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!transactions.length}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4 bg-card border rounded-lg shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search merchant or description..." value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }} className="pl-9" />
          </div>
          <Input
            value={merchantFilter}
            onChange={(e) => { setMerchantFilter(e.target.value); setSelected(new Set()); }}
            placeholder="Merchant filter"
            className="lg:w-56"
          />
          <Button
            variant={needsReview ? "default" : "outline"}
            onClick={() => { setNeedsReview((value) => !value); setSelected(new Set()); }}
            className="lg:w-auto"
          >
            Needs review
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={month} onValueChange={(value) => { setMonth(value); setSelected(new Set()); }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {months?.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(value) => { setType(value); setSelected(new Set()); }}>
            <SelectTrigger className="w-28"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(value) => { setCategory(value); setSelected(new Set()); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll}
                  aria-label="Select all" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("date")}>
                <span className="flex items-center">Date <SortIcon column="date" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("merchant")}>
                <span className="flex items-center">Merchant <SortIcon column="merchant" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("category")}>
                <span className="flex items-center">Category <SortIcon column="category" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("amount")}>
                <span className="flex items-center justify-end">Amount <SortIcon column="amount" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead className="min-w-[140px]">Notes</TableHead>
              <TableHead className="min-w-[150px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No transactions found.</TableCell>
              </TableRow>
            ) : (
              transactions.map((t) => (
                <TableRow key={t.id} className={selected.has(t.id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(t.date)}</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{t.merchant}</div>
                    {t.description !== t.merchant && (
                      <div className="text-xs text-muted-foreground truncate max-w-[180px]">{t.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${t.type === "credit" ? "text-emerald-600 bg-emerald-500/10 border-emerald-300" : "text-rose-600 bg-rose-500/10 border-rose-300"}`}>
                      {t.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select value={t.category} onValueChange={(val) => handleCategoryChange(t.id, val)}>
                      <SelectTrigger className="h-7 text-xs border-transparent bg-transparent hover:bg-muted/50 hover:border-input w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${t.type === "credit" ? "text-emerald-600" : ""}`}>
                    {t.type === "credit" ? "+" : ""}{formatCurrency(t.amount)}
                  </TableCell>
                  <TableCell>
                    {editingNote?.id === t.id ? (
                      <div className="flex gap-1">
                        <Input className="h-7 text-xs w-28" value={editingNote.value}
                          onChange={(e) => setEditingNote({ id: t.id, value: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(t.id); if (e.key === "Escape") setEditingNote(null); }}
                          autoFocus />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleSaveNote(t.id)}>OK</Button>
                      </div>
                    ) : (
                      <button className="text-xs text-muted-foreground hover:text-foreground text-left max-w-[130px] truncate block"
                        onClick={() => setEditingNote({ id: t.id, value: t.notes ?? "" })}
                        title={t.notes ?? "Click to add note"}>
                        {t.notes ?? <span className="italic opacity-40">Add note...</span>}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => openRuleDialog([t.id])}
                        disabled={draftRuleMutation.isPending}
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Create rule
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk Categorize {selected.size} transactions</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent>
                {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkCategorize} disabled={!bulkCategory || bulkMutation.isPending}>
              {bulkMutation.isPending ? "Updating..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create categorization rule</DialogTitle>
            <DialogDescription>
              Create one or more custom rules from existing transactions. Custom rules override built-in rules.
            </DialogDescription>
          </DialogHeader>

          {singleRuleTransaction && singleRuleDraft && (
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{formatDate(singleRuleTransaction.date)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Normalized merchant</span>
                <span className="font-medium">{singleRuleDraft.normalizedMerchant}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Current category</span>
                <span className="font-medium">{getCategory(singleRuleTransaction.category)?.label ?? singleRuleTransaction.category}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Original description</span>
                <div className="text-xs break-words">{singleRuleTransaction.description}</div>
              </div>
            </div>
          )}

          {ruleDrafts.length > 1 && (
            <div className="text-sm text-muted-foreground">
              Selected transactions have different merchants, so each merchant group can create its own rule.
            </div>
          )}

          <div className="max-h-[52vh] overflow-auto space-y-3 pr-1">
            {ruleDrafts.map((draft) => {
              const edit = ruleDraftEdits[draft.groupKey] ?? { pattern: draft.pattern, category: "" };
              return (
                <div key={draft.groupKey} className="rounded-lg border p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{draft.normalizedMerchant}</div>
                      <div className="text-xs text-muted-foreground">{draft.transactionCount} selected transaction{draft.transactionCount === 1 ? "" : "s"}</div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {draft.currentCategories.map((item) => (
                        <Badge key={item.category} variant="outline" className="text-xs">
                          {item.count} {getCategory(item.category)?.label ?? item.category}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                        Rule pattern
                      </label>
                      <Input
                        value={edit.pattern}
                        onChange={(event) => updateDraftEdit(draft, { pattern: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                        New category
                      </label>
                      <Select value={edit.category} onValueChange={(value) => updateDraftEdit(draft, { category: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories?.filter((c) => c.id !== "other").map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {draft.sampleDescriptions.length > 0 && (
                    <div className="text-xs text-muted-foreground truncate">
                      {draft.sampleDescriptions.join(" | ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
            <Button
              variant="outline"
              onClick={() => saveRulesFromDialog(false)}
              disabled={!canSaveRules || createRulesMutation.isPending}
            >
              Save rule only
            </Button>
            <Button
              onClick={() => saveRulesFromDialog(true)}
              disabled={!canSaveRules || createRulesMutation.isPending}
            >
              Save rule and apply to all matching
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
