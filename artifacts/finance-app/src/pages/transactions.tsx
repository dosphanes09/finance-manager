import React, { useState, useCallback } from "react";
import {
  useListTransactions, getListTransactionsQueryKey,
  useUpdateTransaction, useDeleteTransaction, useListMonths,
  useListCategories, useBulkCategorize,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, Search, Download, ChevronUp, ChevronDown, ChevronsUpDown, Tag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type SortBy = "date" | "amount" | "category" | "merchant";
type SortDir = "asc" | "desc";

function SortIcon({ column, sortBy, sortDir }: { column: SortBy; sortBy: SortBy; sortDir: SortDir }) {
  if (sortBy !== column) return <ChevronsUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-primary" />
    : <ChevronDown className="w-3 h-3 ml-1 text-primary" />;
}

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [editingNote, setEditingNote] = useState<{ id: number; value: string } | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = {
    ...(search && { search }),
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

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  }, [queryClient]);

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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {data ? `${data.total} transactions` : "Loading..."}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(true)}>
              <Tag className="w-3.5 h-3.5 mr-1.5" />
              Categorize {selected.size}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!transactions.length}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 p-4 bg-card border rounded-lg shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search merchant or description..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {months?.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-28"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
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
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading…</TableCell>
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
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleSaveNote(t.id)}>✓</Button>
                      </div>
                    ) : (
                      <button className="text-xs text-muted-foreground hover:text-foreground text-left max-w-[130px] truncate block"
                        onClick={() => setEditingNote({ id: t.id, value: t.notes ?? "" })}
                        title={t.notes ?? "Click to add note"}>
                        {t.notes ?? <span className="italic opacity-40">Add note…</span>}
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Bulk categorize dialog */}
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
              {bulkMutation.isPending ? "Updating…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
