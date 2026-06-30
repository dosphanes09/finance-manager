import React, { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, FileText, AlertCircle, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useListCategories } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

type Step = "select" | "previewing" | "preview" | "importing" | "done";

interface PreviewTx {
  date: string;
  merchant: string;
  description: string;
  amount: number;
  type: string;
  currency: string;
  transactionType: string;
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
}

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

function confidenceClass(value: number) {
  if (value >= 0.9) return "text-emerald-600 border-emerald-300 bg-emerald-500/10";
  if (value >= 0.7) return "text-amber-600 border-amber-300 bg-amber-500/10";
  return "text-rose-600 border-rose-300 bg-rose-500/10";
}

export default function Upload() {
  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewTx[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; skipped: number } | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: categories } = useListCategories();

  const reset = () => {
    setStep("select");
    setFile(null);
    setPreview([]);
    setDuplicateCount(0);
    setErrors([]);
    setError(null);
    setResult(null);
    setIncludeDuplicates(false);
  };

  const handleFileSelect = (f: File) => {
    setFile(f);
    setError(null);
    doPreview(f);
  };

  const doPreview = async (f: File) => {
    setStep("previewing");
    const formData = new FormData();
    formData.append("file", f);
    try {
      const res = await fetch("/api/upload/preview", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Dosya ayrıştırılamadı");
      }
      const data = await res.json();
      setPreview(data.transactions);
      setDuplicateCount(data.duplicateCount);
      setErrors(data.errors ?? []);
      setStep("preview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Dosya ayrıştırılamadı";
      setError(msg);
      setStep("select");
    }
  };

  const handleConfirm = async () => {
    setStep("importing");
    const toSend = includeDuplicates
      ? preview.map((t) => ({ ...t, isDuplicate: false }))
      : preview;
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
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }, []);

  const nonDuplicates = preview.filter((t) => !t.isDuplicate);
  const duplicates = preview.filter((t) => t.isDuplicate);
  const toImport = includeDuplicates ? preview : nonDuplicates;
  const averageConfidence = preview.length
    ? preview.reduce((sum, transaction) => sum + (transaction.categorizationConfidence ?? 0), 0) / preview.length
    : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ekstre Yükle</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">Banka ekstrelerini içe aktarın; kaydetmeden önce gözden geçirin.</p>
      </div>

      {(step === "select" || step === "previewing") && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Dosya seçin</CardTitle>
            <CardDescription>CSV, Excel (.xlsx, .xls) veya PDF banka ekstresi.</CardDescription>
          </CardHeader>
          <CardContent>
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
                  <p className="font-medium">{file?.name} ayrıştırılıyor...</p>
                  <p className="text-sm text-muted-foreground">İşlemler çıkarılıyor ve kategorize ediliyor</p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4 text-center pointer-events-none">
                  <div className="bg-muted p-4 rounded-full">
                    <UploadCloud className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Sürükleyip bırakın veya seçmek için tıklayın</p>
                    <p className="text-sm text-muted-foreground mt-1">CSV, XLSX, XLS, PDF - en fazla 20 MB</p>
                  </div>
                </div>
              )}
              <input type="file" className="hidden" ref={fileInputRef}
                accept=".csv,.xlsx,.xls,.pdf"
                onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
            </div>

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
              <p className="font-medium text-sm truncate">{file?.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{preview.length} işlem okundu</Badge>
                {preview[0]?.bank && (
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
                    {errors.length} hata
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={reset}><X className="w-4 h-4" /></Button>
          </div>

          {duplicateCount > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-amber-800">
                {duplicateCount} işlem veritabanında zaten var.
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
              <div className="flex items-center justify-between">
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
            <CardContent className="p-0 overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="bg-muted/40">
                    <TableHead>Durum</TableHead>
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
                    <TableRow key={i} className={t.isDuplicate ? "opacity-50 bg-amber-50/50" : ""}>
                      <TableCell>
                        {t.isDuplicate
                          ? <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">mükerrer</Badge>
                          : <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-400">yeni</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">{t.date}</TableCell>
                      <TableCell className="text-sm font-medium">{t.merchant}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline" className={`text-xs ${t.type === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                            {formatDirection(t.type)}
                          </Badge>
                          <div className="text-[11px] text-muted-foreground">{formatKind(t.transactionKind)}</div>
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
                      <TableCell className={`text-right text-sm font-mono font-medium ${t.type === "credit" ? "text-emerald-600" : ""}`}>
                        {formatCurrency(t.type === "credit" ? t.amount : -t.amount, t.currency)}
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
