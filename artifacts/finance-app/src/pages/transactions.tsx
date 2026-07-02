import React, { useState, useCallback } from "react";
import {
  useListTransactions, getListTransactionsQueryKey,
  useUpdateTransaction, useDeleteTransaction, useListMonths,
  useListCategories, useBulkCategorize,
  useBulkReviewTransactions,
  useCreateRuleDraftsFromTransactions,
  useCreateRulesFromTransactions,
  useApplyRulesToSelectedTransactions,
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
import { Trash2, Search, Download, ChevronUp, ChevronDown, ChevronsUpDown, Tag, Wand2, CheckCircle2, ListChecks } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type SortBy = "date" | "amount" | "category" | "merchant";
type SortDir = "asc" | "desc";
type RuleDialogMode = "create" | "remember";

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

function formatConfidence(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value || 0)) * 100)}%`;
}

function confidenceClass(value: number) {
  if (value >= 0.9) return "text-emerald-600 bg-emerald-500/10 border-emerald-300";
  if (value >= 0.7) return "text-amber-600 bg-amber-500/10 border-amber-300";
  return "text-rose-600 bg-rose-500/10 border-rose-300";
}

function formatMetadata(value: string) {
  const labels: Record<string, string> = {
    custom_rule: "özel kural",
    merchant_memory: "iş yeri hafızası",
    deterministic_rule: "deterministik kural",
    parser_rule: "parser kuralı",
    ai: "yapay zeka",
    unknown: "bilinmiyor",
    pos: "POS",
    eft: "EFT",
    fast: "FAST",
    atm_withdrawal: "ATM para çekme",
    atm_deposit: "ATM para yatırma",
    credit_card_payment: "kredi kartı ödemesi",
    salary: "maaş",
    refund: "iade",
    bill: "fatura",
    subscription: "abonelik",
    investment: "yatırım",
    transfer: "transfer",
    fee: "ücret/komisyon",
    interest: "faiz",
    cashback: "para iadesi",
    other: "diğer",
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function formatDirection(type: string) {
  if (type === "credit") return "giriş";
  if (type === "debit") return "çıkış";
  return type;
}

function formatFinancialType(type: string) {
  const labels: Record<string, string> = {
    income: "gelir",
    expense: "gider",
    transfer: "transfer",
    credit_card_payment: "kredi kartı ödemesi",
    refund: "iade",
    fee: "ücret/komisyon",
    unknown_review: "inceleme gerekli",
    debit: "gider",
    credit: "gelir",
  };
  return labels[type] ?? type;
}

function getDirection(transaction: Pick<Transaction, "type"> & { direction?: string | null }) {
  if (transaction.direction === "credit" || transaction.direction === "debit") return transaction.direction;
  return transaction.type === "credit" ? "credit" : "debit";
}

function amountSign(direction: string) {
  return direction === "credit" ? 1 : -1;
}

function typeBadgeClass(type: string, direction: string) {
  if (type === "transfer" || type === "credit_card_payment") return "text-sky-600 bg-sky-500/10 border-sky-300";
  if (type === "fee") return "text-orange-600 bg-orange-500/10 border-orange-300";
  if (type === "unknown_review") return "text-amber-600 bg-amber-500/10 border-amber-300";
  if (type === "refund") return "text-amber-600 bg-amber-500/10 border-amber-300";
  if (direction === "credit") return "text-emerald-600 bg-emerald-500/10 border-emerald-300";
  return "text-rose-600 bg-rose-500/10 border-rose-300";
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
  const [ruleDialogMode, setRuleDialogMode] = useState<RuleDialogMode>("create");
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft[]>([]);
  const [ruleDraftEdits, setRuleDraftEdits] = useState<Record<string, RuleDraftEdit>>({});
  const [ruleSourceTransactions, setRuleSourceTransactions] = useState<Transaction[]>([]);
  const [editingNote, setEditingNote] = useState<{ id: number; value: string } | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  const [quickReviewOpen, setQuickReviewOpen] = useState(false);
  const [quickReviewIndex, setQuickReviewIndex] = useState(0);
  const [quickReviewCategory, setQuickReviewCategory] = useState("");

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
  const bulkReviewMutation = useBulkReviewTransactions();
  const draftRuleMutation = useCreateRuleDraftsFromTransactions();
  const createRulesMutation = useCreateRulesFromTransactions();
  const applySelectedRulesMutation = useApplyRulesToSelectedTransactions();

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
    const transaction = transactions.find((item) => item.id === id);
    if (transaction?.category === cat) return;

    updateMutation.mutate({ id, data: { category: cat } }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Kategori güncellendi" });
        openRuleDialog([id], { mode: "remember", categoryOverride: cat });
      },
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Bu işlemi silmek istiyor musunuz?")) return;
    deleteMutation.mutate({ id }, { onSuccess: () => { invalidate(); toast({ title: "Silindi" }); } });
  };

  const handleSaveNote = (id: number) => {
    if (!editingNote) return;
    updateMutation.mutate({ id, data: { notes: editingNote.value } }, {
      onSuccess: () => { invalidate(); setEditingNote(null); toast({ title: "Not kaydedildi" }); },
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
        toast({ title: `${result.updated} işlem güncellendi` });
      },
    });
  };

  const handleApplyRulesToSelected = () => {
    if (selected.size === 0) return;

    applySelectedRulesMutation.mutate(
      { data: { transactionIds: Array.from(selected) } },
      {
        onSuccess: (result) => {
          invalidate();
          setSelected(new Set());
          toast({
            title: `Kurallar ${result.updated} işleme uygulandı`,
            description: `${result.scanned} seçili işlem tarandı`,
          });
        },
        onError: () => toast({ variant: "destructive", title: "Kurallar uygulanamadı" }),
      },
    );
  };

  const handleMarkSelectedReviewed = () => {
    if (selected.size === 0) return;

    bulkReviewMutation.mutate(
      { data: { ids: Array.from(selected), reviewed: true } },
      {
        onSuccess: (result) => {
          invalidate();
          setSelected(new Set());
          toast({ title: `${result.updated} işlem incelendi olarak işaretlendi` });
        },
        onError: () => toast({ variant: "destructive", title: "İşlemler incelendi olarak işaretlenemedi" }),
      },
    );
  };

  const buildInitialRuleEdits = (drafts: RuleDraft[], categoryOverride?: string): Record<string, RuleDraftEdit> => {
    return Object.fromEntries(
      drafts.map((draft) => {
        const currentNonOther = draft.currentCategories.find((item) => item.category !== "other")?.category;
        const categoryValue = categoryOverride ?? (draft.suggestedCategory !== "other"
          ? draft.suggestedCategory
          : currentNonOther ?? "");

        return [draft.groupKey, { pattern: draft.pattern, category: categoryValue }];
      }),
    );
  };

  const openRuleDialog = (
    transactionIds: number[],
    options: { mode?: RuleDialogMode; categoryOverride?: string } = {},
  ) => {
    const sourceTransactions = transactions
      .filter((transaction) => transactionIds.includes(transaction.id))
      .map((transaction) => options.categoryOverride
        ? { ...transaction, category: options.categoryOverride }
        : transaction);

    draftRuleMutation.mutate(
      { data: { transactionIds } },
      {
        onSuccess: (drafts) => {
          if (drafts.length === 0) {
            toast({ variant: "destructive", title: "İşlem bulunamadı" });
            return;
          }

          setRuleSourceTransactions(sourceTransactions);
          setRuleDrafts(drafts);
          setRuleDraftEdits(buildInitialRuleEdits(drafts, options.categoryOverride));
          setRuleDialogMode(options.mode ?? "create");
          setRuleDialogOpen(true);
        },
        onError: () => toast({ variant: "destructive", title: "Kural hazırlanamadı" }),
      },
    );
  };

  const openSelectedRuleDialog = () => {
    if (selected.size === 0) return;
    openRuleDialog(Array.from(selected));
  };

  const handleRuleDialogOpenChange = (open: boolean) => {
    setRuleDialogOpen(open);
    if (!open) setRuleDialogMode("create");
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
      toast({ variant: "destructive", title: "Her desen ve kategori alanını doldurun" });
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
            title: `${result.createdRules.length} kural oluşturuldu`,
            description: `${result.updated} işlem güncellendi`,
          });
        },
        onError: () => toast({ variant: "destructive", title: "Kural oluşturulamadı" }),
      },
    );
  };

  const handleExportCsv = () => {
    if (!data?.transactions.length) return;
    const headers = ["Tarih", "Hesap", "İş Yeri", "Açıklama", "Finansal Tür", "Yön", "İşlem Türü", "Kategori", "Güven", "Kategori Kaynağı", "Tutar", "Notlar"];
    const rows = data.transactions.map((t) => [
      t.date, t.accountName ?? "", t.merchant, `"${t.description.replace(/"/g, '""')}"`,
      t.type, getDirection(t), t.transactionKind, t.category, t.categorizationConfidence, t.categorizationSource, t.amount, t.notes ?? "",
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
  const currentReviewTransaction = quickReviewOpen ? transactions[Math.min(quickReviewIndex, transactions.length - 1)] : undefined;

  const toggleDescription = (id: number) => {
    setExpandedDescriptions((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const setQuickReviewTransaction = (index: number) => {
    if (transactions.length === 0) return;
    const nextIndex = Math.min(Math.max(index, 0), transactions.length - 1);
    setQuickReviewIndex(nextIndex);
    setQuickReviewCategory(transactions[nextIndex]?.category ?? "");
  };

  const openQuickReview = () => {
    if (transactions.length === 0) {
      toast({ variant: "destructive", title: "İncelenecek işlem yok" });
      return;
    }

    setNeedsReview(true);
    setSelected(new Set());
    setQuickReviewIndex(0);
    setQuickReviewCategory(transactions[0]?.category ?? "");
    setQuickReviewOpen(true);
  };

  const advanceQuickReview = () => {
    if (quickReviewIndex < transactions.length - 1) {
      setQuickReviewTransaction(quickReviewIndex + 1);
    } else {
      setQuickReviewOpen(false);
      toast({ title: "İnceleme kuyruğu tamamlandı" });
    }
  };

  const handleQuickReviewSave = () => {
    if (!currentReviewTransaction || !quickReviewCategory) return;

    updateMutation.mutate(
      { id: currentReviewTransaction.id, data: { category: quickReviewCategory, reviewed: true } },
      {
        onSuccess: () => {
          invalidate();
          advanceQuickReview();
        },
        onError: () => toast({ variant: "destructive", title: "İşlem güncellenemedi" }),
      },
    );
  };

  const handleQuickReviewMarkReviewed = () => {
    if (!currentReviewTransaction) return;

    bulkReviewMutation.mutate(
      { data: { ids: [currentReviewTransaction.id], reviewed: true } },
      {
        onSuccess: () => {
          invalidate();
          advanceQuickReview();
        },
        onError: () => toast({ variant: "destructive", title: "İşlem incelendi olarak işaretlenemedi" }),
      },
    );
  };

  const handleQuickReviewRule = () => {
    if (!currentReviewTransaction) return;
    setQuickReviewOpen(false);
    openRuleDialog(
      [currentReviewTransaction.id],
      { mode: "remember", categoryOverride: quickReviewCategory || currentReviewTransaction.category },
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">İşlemler</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {data ? `${data.total} işlem` : "Yükleniyor..."}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {selected.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setBulkDialogOpen(true)}>
                <Tag className="w-3.5 h-3.5 mr-1.5" />
                {selected.size} işlemi kategorize et
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyRulesToSelected}
                disabled={applySelectedRulesMutation.isPending}
              >
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                Kuralları uygula
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkSelectedReviewed}
                disabled={bulkReviewMutation.isPending}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                İncelendi işaretle
              </Button>
              <Button variant="outline" size="sm" onClick={openSelectedRuleDialog} disabled={draftRuleMutation.isPending}>
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                Seçimden kural oluştur
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!transactions.length}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> CSV dışa aktar
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4 bg-card border rounded-lg shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="İş yeri veya açıklama ara..." value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }} className="pl-9" />
          </div>
          <Input
            value={merchantFilter}
            onChange={(e) => { setMerchantFilter(e.target.value); setSelected(new Set()); }}
            placeholder="İş yeri filtresi"
            className="lg:w-56"
          />
          <Button
            variant={needsReview ? "default" : "outline"}
            onClick={() => { setNeedsReview((value) => !value); setSelected(new Set()); }}
            className="lg:w-auto"
          >
            İnceleme gerekli
          </Button>
          <Button
            variant="outline"
            onClick={openQuickReview}
            disabled={!transactions.length}
            className="lg:w-auto"
          >
            <ListChecks className="w-4 h-4 mr-2" />
            Hızlı inceleme
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={month} onValueChange={(value) => { setMonth(value); setSelected(new Set()); }}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Ay" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm aylar</SelectItem>
              {months?.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(value) => { setType(value); setSelected(new Set()); }}>
            <SelectTrigger className="w-28"><SelectValue placeholder="Tür" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm türler</SelectItem>
              <SelectItem value="expense">Gider</SelectItem>
              <SelectItem value="income">Gelir</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="credit_card_payment">Kredi kartı ödemesi</SelectItem>
              <SelectItem value="refund">İade</SelectItem>
              <SelectItem value="fee">Ücret/komisyon</SelectItem>
              <SelectItem value="unknown_review">İnceleme gerekli</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(value) => { setCategory(value); setSelected(new Set()); }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kategoriler</SelectItem>
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
                  aria-label="Tümünü seç" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("date")}>
                <span className="flex items-center">Tarih <SortIcon column="date" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead>Hesap</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("merchant")}>
                <span className="flex items-center">İş yeri <SortIcon column="merchant" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead className="min-w-[180px]">Orijinal açıklama</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("category")}>
                <span className="flex items-center">Kategori <SortIcon column="category" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead className="min-w-[170px]">Güven</TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("amount")}>
                <span className="flex items-center justify-end">Tutar <SortIcon column="amount" sortBy={sortBy} sortDir={sortDir} /></span>
              </TableHead>
              <TableHead>Tür</TableHead>
              <TableHead className="min-w-[140px]">Notlar</TableHead>
              <TableHead className="min-w-[150px]">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">Yükleniyor...</TableCell>
              </TableRow>
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">İşlem bulunamadı.</TableCell>
              </TableRow>
            ) : (
              transactions.map((t) => (
                <TableRow key={t.id} className={selected.has(t.id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDate(t.date)}</TableCell>
                  <TableCell>
                    <div className="text-sm max-w-[140px] truncate" title={t.accountName ?? "Hesap belirtilmemiş"}>
                      {t.accountName ?? "Hesapsız"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm max-w-[160px] truncate" title={t.merchant}>
                      {t.merchant}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className={`text-left text-xs text-muted-foreground hover:text-foreground ${expandedDescriptions.has(t.id) ? "max-w-[320px] whitespace-normal break-words" : "block max-w-[240px] truncate"}`}
                      onClick={() => toggleDescription(t.id)}
                      title={t.description}
                    >
                      {t.description}
                    </button>
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
                  <TableCell>
                    <div className="space-y-1 max-w-[200px]">
                      <Badge variant="outline" className={`text-xs ${confidenceClass(t.categorizationConfidence)}`}>
                        {formatConfidence(t.categorizationConfidence)}
                      </Badge>
                      <div className="text-[11px] text-muted-foreground">{formatMetadata(t.categorizationSource)}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2" title={t.categorizationExplanation}>
                        {t.categorizationExplanation}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${t.type === "transfer" || t.type === "credit_card_payment" ? "text-sky-600" : getDirection(t) === "credit" ? "text-emerald-600" : ""}`}>
                    {formatCurrency(t.amount * amountSign(getDirection(t)), t.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${typeBadgeClass(t.type, getDirection(t))}`}>
                      {formatFinancialType(t.type)}
                    </Badge>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {formatDirection(getDirection(t))} · {formatMetadata(t.transactionKind)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {editingNote?.id === t.id ? (
                      <div className="flex gap-1">
                        <Input className="h-7 text-xs w-28" value={editingNote.value}
                          onChange={(e) => setEditingNote({ id: t.id, value: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(t.id); if (e.key === "Escape") setEditingNote(null); }}
                          autoFocus />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleSaveNote(t.id)}>Tamam</Button>
                      </div>
                    ) : (
                      <button className="text-xs text-muted-foreground hover:text-foreground text-left max-w-[130px] truncate block"
                        onClick={() => setEditingNote({ id: t.id, value: t.notes ?? "" })}
                        title={t.notes ?? "Not eklemek için tıklayın"}>
                        {t.notes ?? <span className="italic opacity-40">Not ekle...</span>}
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
                        Kural oluştur
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
            <DialogTitle>{selected.size} işlemi toplu kategorize et</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger><SelectValue placeholder="Kategori seçin" /></SelectTrigger>
              <SelectContent>
                {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>İptal</Button>
            <Button onClick={handleBulkCategorize} disabled={!bulkCategory || bulkMutation.isPending}>
              {bulkMutation.isPending ? "Güncelleniyor..." : "Uygula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ruleDialogOpen} onOpenChange={handleRuleDialogOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {ruleDialogMode === "remember"
                ? "Bu kategorilendirmeyi hatırlamak ister misiniz?"
                : "Kategorilendirme kuralı oluştur"}
            </DialogTitle>
            <DialogDescription>
              {ruleDialogMode === "remember"
                ? "Yalnızca bu işlemi kaydedebilir veya benzer işlemler için otomatik çalışan özel bir kural oluşturabilirsiniz."
                : "Mevcut işlemlerden bir veya daha fazla özel kural oluşturun. Özel kurallar yerleşik kuralların önüne geçer."}
            </DialogDescription>
          </DialogHeader>

          {singleRuleTransaction && singleRuleDraft && (
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Tarih</span>
                <span className="font-medium">{formatDate(singleRuleTransaction.date)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Normalize iş yeri</span>
                <span className="font-medium">{singleRuleDraft.normalizedMerchant}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Mevcut kategori</span>
                <span className="font-medium">{getCategory(singleRuleTransaction.category)?.label ?? singleRuleTransaction.category}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Orijinal açıklama</span>
                <div className="text-xs break-words">{singleRuleTransaction.description}</div>
              </div>
            </div>
          )}

          {ruleDrafts.length > 1 && (
            <div className="text-sm text-muted-foreground">
              Seçili işlemlerde farklı iş yerleri var; her iş yeri grubu için ayrı kural oluşturabilirsiniz.
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
                      <div className="text-xs text-muted-foreground">{draft.transactionCount} seçili işlem</div>
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
                        Kural deseni
                      </label>
                      <Input
                        value={edit.pattern}
                        onChange={(event) => updateDraftEdit(draft, { pattern: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                        Yeni kategori
                      </label>
                      <Select value={edit.category} onValueChange={(value) => updateDraftEdit(draft, { category: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Kategori seçin" />
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

          <DialogFooter className="flex-wrap gap-2 sm:gap-2">
            {ruleDialogMode === "remember" ? (
              <>
                <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
                  Hayır, sadece bu işlemi güncelle
                </Button>
                <Button
                  variant="outline"
                  onClick={() => saveRulesFromDialog(false)}
                  disabled={!canSaveRules || createRulesMutation.isPending}
                >
                  Evet, bu iş yeri için kural oluştur
                </Button>
                <Button
                  onClick={() => saveRulesFromDialog(true)}
                  disabled={!canSaveRules || createRulesMutation.isPending}
                >
                  Evet, kural oluştur ve geçmiş eşleşmelere uygula
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>İptal</Button>
                <Button
                  variant="outline"
                  onClick={() => saveRulesFromDialog(false)}
                  disabled={!canSaveRules || createRulesMutation.isPending}
                >
                  Sadece kuralı kaydet
                </Button>
                <Button
                  onClick={() => saveRulesFromDialog(true)}
                  disabled={!canSaveRules || createRulesMutation.isPending}
                >
                  Kuralı kaydet ve tüm eşleşmelere uygula
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickReviewOpen} onOpenChange={setQuickReviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Hızlı inceleme</DialogTitle>
            <DialogDescription>
              {currentReviewTransaction
                ? `Mevcut inceleme kuyruğunda ${quickReviewIndex + 1} / ${transactions.length} işlem`
                : "Mevcut inceleme kuyruğunda işlem yok."}
            </DialogDescription>
          </DialogHeader>

          {currentReviewTransaction && (
            <div className="space-y-4">
              <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Tarih</span>
                  <span className="font-medium">{formatDate(currentReviewTransaction.date)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">İş yeri</span>
                  <span className="font-medium text-right">{currentReviewTransaction.merchant}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Tutar</span>
                  <span className={`font-mono font-medium ${getDirection(currentReviewTransaction) === "credit" ? "text-emerald-600" : ""}`}>
                    {formatCurrency(
                      currentReviewTransaction.amount * amountSign(getDirection(currentReviewTransaction)),
                      currentReviewTransaction.currency,
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">Orijinal açıklama</span>
                  <div className="text-xs break-words">{currentReviewTransaction.description}</div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                  Kategori
                </label>
                <Select value={quickReviewCategory} onValueChange={setQuickReviewCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kategori seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setQuickReviewTransaction(quickReviewIndex - 1)}
              disabled={!currentReviewTransaction || quickReviewIndex === 0}
            >
              Önceki
            </Button>
            <Button
              variant="outline"
              onClick={handleQuickReviewMarkReviewed}
              disabled={!currentReviewTransaction || bulkReviewMutation.isPending}
            >
              İncelendi işaretle
            </Button>
            <Button
              variant="outline"
              onClick={handleQuickReviewRule}
              disabled={!currentReviewTransaction || draftRuleMutation.isPending}
            >
              Kural oluştur
            </Button>
            <Button
              onClick={handleQuickReviewSave}
              disabled={!currentReviewTransaction || !quickReviewCategory || updateMutation.isPending}
            >
              Kaydet ve sonraki
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
