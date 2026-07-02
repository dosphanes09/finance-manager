import React, { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { UploadCloud, FileText, AlertCircle, Loader2, CheckCircle2, AlertTriangle, X, Files, Building2, Plus } from "lucide-react";
import { useCreateAccount, useListAccounts, useListCategories } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

type Step = "select" | "previewing" | "preview" | "importing" | "done";

interface PreviewTx {
  date: string;
  merchant: string;
  description: string;
  amount: number;
  accountId: number | null;
  accountName: string | null;
  accountType: "checking" | "credit_card" | "cash" | "other";
  type: string;
  direction: "debit" | "credit";
  currency: string;
  transactionType: "debit" | "credit";
  transactionKind: string;
  balance: number | null;
  category: string;
  bank: string;
  parser: string;
  confidence: number;
  categorizationConfidence: number;
  categorizationSource: string;
  categorizationExplanation: string;
  month: string;
  isDuplicate: boolean;
  sourceFile?: string;
  sourceFileIndex?: number;
}

interface PreviewFileSummary {
  name: string;
  status: "parsed" | "failed";
  transactionCount: number;
  duplicateCount: number;
  skippedRowCount: number;
  skipReasons: Array<{ rowNumber: number; reason: string; sample: string }>;
  bank: string | null;
  parser: string | null;
  errors: string[];
}

interface BatchPreviewResponse {
  transactions: PreviewTx[];
  duplicateCount: number;
  errors: string[];
  files: PreviewFileSummary[];
  parsedRowCount: number;
  skippedRowCount: number;
  skipReasons: Array<{ rowNumber: number; reason: string; sample: string; fileName?: string }>;
}

const MAX_SELECTED_FILES = 20;
const ACCOUNT_TYPE_OPTIONS = [
  { value: "checking", label: "Vadesiz / banka hesabı" },
  { value: "credit_card", label: "Kredi kartı" },
  { value: "cash", label: "Nakit" },
  { value: "other", label: "Diğer" },
] as const;

function formatConfidence(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value || 0)) * 100)}%`;
}

function formatSource(source: string) {
  const labels: Record<string, string> = {
    custom_rule: "özel kural",
    merchant_memory: "iş yeri hafızası",
    deterministic_rule: "deterministik kural",
    parser_rule: "parser kuralı",
    ai: "yapay zeka",
    unknown: "bilinmiyor",
  };
  return labels[source] ?? source.replace(/_/g, " ");
}

function formatKind(kind: string) {
  const labels: Record<string, string> = {
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
  return labels[kind] ?? kind.replace(/_/g, " ");
}

function formatDirection(type: string) {
  if (type === "credit") return "gelir";
  if (type === "debit") return "gider";
  return type;
}

function formatFinancialType(type: string) {
  const labels: Record<string, string> = {
    income: "gelir",
    expense: "gider",
    transfer: "transfer",
    refund: "iade",
    debit: "gider",
    credit: "gelir",
  };
  return labels[type] ?? type;
}

function amountSign(direction: string) {
  return direction === "credit" ? 1 : -1;
}

function confidenceClass(value: number) {
  if (value >= 0.9) return "text-emerald-600 border-emerald-300 bg-emerald-500/10";
  if (value >= 0.7) return "text-amber-600 border-amber-300 bg-amber-500/10";
  return "text-rose-600 border-rose-300 bg-rose-500/10";
}

function stripPreviewOnlyFields(transaction: PreviewTx): Omit<PreviewTx, "sourceFile" | "sourceFileIndex"> {
  const { sourceFile: _sourceFile, sourceFileIndex: _sourceFileIndex, ...payload } = transaction;
  return payload;
}

export default function Upload() {
  const [step, setStep] = useState<Step>("select");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<PreviewTx[]>([]);
  const [fileSummaries, setFileSummaries] = useState<PreviewFileSummary[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [skippedRowCount, setSkippedRowCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; skipped: number } | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<(typeof ACCOUNT_TYPE_OPTIONS)[number]["value"]>("credit_card");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: categories } = useListCategories();
  const { data: accounts } = useListAccounts();
  const createAccountMutation = useCreateAccount();

  useEffect(() => {
    if (!selectedAccountId && accounts?.length) {
      setSelectedAccountId(String(accounts[0].id));
    }
  }, [accounts, selectedAccountId]);

  const reset = () => {
    setStep("select");
    setFiles([]);
    setPreview([]);
    setFileSummaries([]);
    setDuplicateCount(0);
    setSkippedRowCount(0);
    setErrors([]);
    setError(null);
    setResult(null);
    setIncludeDuplicates(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFilesSelect = (selectedFiles: FileList | File[]) => {
    const nextFiles = Array.from(selectedFiles);
    if (nextFiles.length === 0) return;

    if (!selectedAccountId) {
      setError("Lütfen ekstre yüklemeden önce bir hesap seçin veya oluşturun.");
      return;
    }

    if (nextFiles.length > MAX_SELECTED_FILES) {
      setError(`Tek seferde en fazla ${MAX_SELECTED_FILES} dosya yükleyebilirsiniz.`);
      return;
    }

    setFiles(nextFiles);
    setError(null);
    void doPreview(nextFiles);
  };

  const doPreview = async (selectedFiles: File[]) => {
    setStep("previewing");
    setPreview([]);
    setFileSummaries([]);
    setErrors([]);

    const formData = new FormData();
    selectedFiles.forEach((selectedFile) => formData.append("files", selectedFile));
    formData.append("accountId", selectedAccountId);

    try {
      const res = await fetch("/api/upload/preview-batch", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFileSummaries(data.files ?? []);
        setErrors(data.errors ?? []);
        throw new Error(data.error || "Dosyalar ayrıştırılamadı");
      }

      const batch = data as BatchPreviewResponse;
      setPreview(batch.transactions ?? []);
      setDuplicateCount(batch.duplicateCount ?? 0);
      setSkippedRowCount(batch.skippedRowCount ?? 0);
      setErrors(batch.errors ?? []);
      setFileSummaries(batch.files ?? []);
      setStep("preview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Dosyalar ayrıştırılamadı";
      setError(msg);
      setStep("select");
    }
  };

  const handleCreateAccount = () => {
    const name = newAccountName.trim();
    if (!name) {
      setError("Hesap adı girin.");
      return;
    }

    createAccountMutation.mutate(
      { data: { name, type: newAccountType, currency: "TRY" } },
      {
        onSuccess: (account) => {
          setSelectedAccountId(String(account.id));
          setNewAccountName("");
          setError(null);
          toast({ title: "Hesap oluşturuldu", description: `${account.name} seçildi.` });
        },
        onError: () => setError("Hesap oluşturulamadı."),
      },
    );
  };

  const handleConfirm = async () => {
    setStep("importing");
    const prepared = includeDuplicates
      ? preview.map((t) => ({ ...t, isDuplicate: false }))
      : preview;
    const toSend = prepared.map(stripPreviewOnlyFields);

    try {
      const res = await fetch("/api/upload/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: toSend }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "İçe aktarma başarısız oldu");
      }
      const data = await res.json();
      setResult({ count: data.count, skipped: data.skipped });
      setStep("done");
      toast({ title: "İçe aktarma tamamlandı", description: `${data.count} işlem içe aktarıldı.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "İçe aktarma başarısız oldu";
      setError(msg);
      setStep("preview");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleFilesSelect(droppedFiles);
  }, []);

  const nonDuplicates = preview.filter((t) => !t.isDuplicate);
  const toImport = includeDuplicates ? preview : nonDuplicates;
  const averageConfidence = preview.length
    ? preview.reduce((sum, transaction) => sum + (transaction.categorizationConfidence ?? 0), 0) / preview.length
    : 0;
  const parsedFileCount = fileSummaries.filter((file) => file.status === "parsed").length;
  const failedFileCount = fileSummaries.filter((file) => file.status === "failed").length;
  const showFileColumn = fileSummaries.length > 1;
  const selectedFileLabel = files.length === 1 ? files[0]?.name : `${files.length} dosya seçildi`;
  const selectedAccount = accounts?.find((account) => String(account.id) === selectedAccountId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ekstre Yükle</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Bir veya birden fazla banka ekstresini içe aktarın; kaydetmeden önce topluca gözden geçirin.
        </p>
      </div>

      {(step === "select" || step === "previewing") && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Dosyaları seçin</CardTitle>
            <CardDescription>
              CSV, Excel (.xlsx, .xls) veya PDF banka ekstresi. Tek seferde en fazla {MAX_SELECTED_FILES} dosya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 rounded-lg border bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Bu dosyalar hangi hesaba ait?</p>
                  <p className="text-xs text-muted-foreground">
                    Kredi kartı ekstresi, banka hesabı hareketi veya nakit hesabı seçin. Transferler çift sayılmaz.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,240px)_auto]">
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Hesap seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name} - {ACCOUNT_TYPE_OPTIONS.find((option) => option.value === account.type)?.label ?? account.type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newAccountName}
                  onChange={(event) => setNewAccountName(event.target.value)}
                  placeholder="Yeni hesap adı"
                />
                <div className="flex gap-2">
                  <Select value={newAccountType} onValueChange={(value) => setNewAccountType(value as typeof newAccountType)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateAccount}
                    disabled={createAccountMutation.isPending}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Ekle
                  </Button>
                </div>
              </div>
              {selectedAccount && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Seçili hesap: {selectedAccount.name} ({ACCOUNT_TYPE_OPTIONS.find((option) => option.value === selectedAccount.type)?.label ?? selectedAccount.type})
                </p>
              )}
            </div>
            <div
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                isDragging ? "border-primary bg-primary/5" : "hover:bg-muted/40 bg-muted/20"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {step === "previewing" ? (
                <div className="flex flex-col items-center space-y-4 text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                  <p className="font-medium">{selectedFileLabel} ayrıştırılıyor...</p>
                  <p className="text-sm text-muted-foreground">
                    Dosyalar okunuyor, işlemler çıkarılıyor ve kategorize ediliyor.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4 text-center pointer-events-none">
                  <div className="bg-muted p-4 rounded-full">
                    <UploadCloud className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Sürükleyip bırakın veya dosya seçmek için tıklayın</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      CSV, XLSX, XLS, PDF - dosya başına en fazla 20 MB
                    </p>
                  </div>
                </div>
              )}
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                accept=".csv,.xlsx,.xls,.pdf"
                multiple
                onChange={(e) => { if (e.target.files?.length) handleFilesSelect(e.target.files); }}
              />
            </div>

            {fileSummaries.length > 0 && (
              <div className="mt-4 space-y-2">
                {fileSummaries.map((summary) => (
                  <div key={summary.name} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <Files className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{summary.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.status === "parsed"
                          ? `${summary.transactionCount} işlem okundu${summary.skippedRowCount > 0 ? `, ${summary.skippedRowCount} satır atlandı` : ""}`
                          : summary.errors.join(" ")}
                      </p>
                    </div>
                    <Badge variant="outline" className={summary.status === "parsed" ? "text-emerald-600 border-emerald-400" : "text-rose-600 border-rose-400"}>
                      {summary.status === "parsed" ? "başarılı" : "hatalı"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Hata</p>
                  <p className="text-sm opacity-90">{error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <>
          <div className="flex items-center gap-3 p-4 bg-card border rounded-lg shadow-sm">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{selectedFileLabel}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="outline">{preview.length} işlem okundu</Badge>
                {selectedAccount && <Badge variant="outline">{selectedAccount.name}</Badge>}
                <Badge variant="outline">{parsedFileCount}/{files.length} dosya başarılı</Badge>
                {skippedRowCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-400">
                    {skippedRowCount} satır atlandı
                  </Badge>
                )}
                {failedFileCount > 0 && (
                  <Badge variant="outline" className="text-rose-600 border-rose-400">
                    {failedFileCount} dosya hatalı
                  </Badge>
                )}
                {preview[0]?.bank && files.length === 1 && (
                  <Badge variant="outline">{preview[0].bank}</Badge>
                )}
                {preview.length > 0 && (
                  <Badge variant="outline">{formatConfidence(averageConfidence)} ortalama güven</Badge>
                )}
                {duplicateCount > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-400">
                    <AlertTriangle className="w-3 h-3 mr-1" /> {duplicateCount} mükerrer
                  </Badge>
                )}
                {errors.length > 0 && (
                  <Badge variant="outline" className="text-rose-600 border-rose-400">
                    {errors.length} uyarı
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={reset}><X className="w-4 h-4" /></Button>
          </div>

          {fileSummaries.length > 1 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dosya Özeti</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {fileSummaries.map((summary) => (
                  <div key={summary.name} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{summary.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.status === "parsed"
                          ? `${summary.transactionCount} işlem${summary.duplicateCount > 0 ? `, ${summary.duplicateCount} mükerrer` : ""}${summary.skippedRowCount > 0 ? `, ${summary.skippedRowCount} satır atlandı` : ""}`
                          : summary.errors.join(" ")}
                      </p>
                    </div>
                    {summary.bank && <Badge variant="outline">{summary.bank}</Badge>}
                    <Badge variant="outline" className={summary.status === "parsed" ? "text-emerald-600 border-emerald-400" : "text-rose-600 border-rose-400"}>
                      {summary.status === "parsed" ? "başarılı" : "hatalı"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {duplicateCount > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-amber-800">
                {duplicateCount} işlem veritabanında veya seçili dosyalar içinde zaten var.
              </span>
              <label className="flex items-center gap-1.5 ml-auto cursor-pointer shrink-0">
                <input type="checkbox" checked={includeDuplicates}
                  onChange={(e) => setIncludeDuplicates(e.target.checked)} />
                <span className="text-xs">Yine de içe aktar</span>
              </label>
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-2">
              {errors.map((message, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-amber-800">{message}</span>
                </div>
              ))}
            </div>
          )}

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">
                  Önizleme - {toImport.length} işlem içe aktarılacak
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>İptal</Button>
                  <Button size="sm" onClick={handleConfirm} disabled={toImport.length === 0}>
                    {toImport.length} işlemi içe aktar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[460px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="bg-muted/40">
                    <TableHead>Durum</TableHead>
                    {showFileColumn && <TableHead>Dosya</TableHead>}
                    <TableHead>Tarih</TableHead>
                    <TableHead>İş yeri</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Güven</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((t, i) => (
                    <TableRow key={`${t.sourceFile ?? "file"}-${i}`} className={t.isDuplicate ? "opacity-50 bg-amber-50/50" : ""}>
                      <TableCell>
                        {t.isDuplicate
                          ? <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">mükerrer</Badge>
                          : <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-400">yeni</Badge>}
                      </TableCell>
                      {showFileColumn && (
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={t.sourceFile}>
                          {t.sourceFile}
                        </TableCell>
                      )}
                      <TableCell className="text-sm">{t.date}</TableCell>
                      <TableCell className="text-sm font-medium">{t.merchant}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline" className={`text-xs ${t.type === "transfer" ? "text-sky-600" : t.direction === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                            {formatFinancialType(t.type)}
                          </Badge>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDirection(t.direction)} · {formatKind(t.transactionKind)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={t.category} onValueChange={(val) => {
                          setPreview((prev) => prev.map((p, j) => j === i ? { ...p, category: val } : p));
                        }}>
                          <SelectTrigger className="h-7 text-xs w-[120px] border-transparent bg-transparent hover:bg-muted/50 hover:border-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="space-y-1">
                          <Badge variant="outline" className={`text-xs ${confidenceClass(t.categorizationConfidence)}`}>
                            {formatConfidence(t.categorizationConfidence)}
                          </Badge>
                          <div className="text-[11px] text-muted-foreground">
                            {formatSource(t.categorizationSource)}
                          </div>
                          <div className="text-[11px] text-muted-foreground line-clamp-2" title={t.categorizationExplanation}>
                            {t.categorizationExplanation}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className={`text-right text-sm font-mono font-medium ${t.direction === "credit" ? "text-emerald-600" : t.type === "transfer" ? "text-sky-600" : ""}`}>
                        {formatCurrency(t.amount * amountSign(t.direction), t.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {step === "importing" && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="font-medium">İşlemler içe aktarılıyor...</p>
          </CardContent>
        </Card>
      )}

      {step === "done" && result && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 gap-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <div className="text-center">
              <p className="font-semibold text-lg">{result.count} işlem içe aktarıldı</p>
              {result.skipped > 0 && (
                <p className="text-sm text-muted-foreground">{result.skipped} mükerrer işlem atlandı</p>
              )}
            </div>
            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={reset}>Başka ekstre yükle</Button>
              <Button onClick={() => setLocation("/transactions")}>İşlemleri gör</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
