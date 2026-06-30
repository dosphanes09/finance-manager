import React, { useState } from "react";
import {
  useGetInsights,
  useListMonths,
  getGetInsightsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { getCategoryColor, getCategoryLabel } from "@workspace/finance-categories";
import { TrendingUp, TrendingDown, Minus, RefreshCcw, Lightbulb, Heart } from "lucide-react";

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";
  const label = score >= 70 ? "Sağlıklı" : score >= 40 ? "Orta" : "Dikkat Gerekli";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold border-8"
        style={{ borderColor: color, color }}
      >
        {score}
      </div>
      <span className="text-sm font-medium" style={{ color }}>{label}</span>
      <span className="text-xs text-muted-foreground">Finansal sağlık skoru</span>
    </div>
  );
}

export default function Insights() {
  const { data: months } = useListMonths();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const currentMonth = selectedMonth || (months && months.length > 0 ? months[0] : "");

  const { data: insights, isLoading } = useGetInsights(
    { month: currentMonth },
    { query: { queryKey: getGetInsightsQueryKey({ month: currentMonth }), enabled: !!currentMonth } }
  );

  if (!currentMonth || isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">İçgörüler</h1>
          <p className="text-muted-foreground mt-1">Finansal sağlığınıza hızlı bir bakış.</p>
        </div>
        {months && months.length > 0 && (
          <Select value={currentMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {insights && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardContent className="flex flex-col items-center justify-center p-8">
                <ScoreRing score={insights.healthScore} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" /> Aylık Özet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{insights.summary}</p>

                {insights.savingsOpportunities.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" /> Tasarruf Fırsatları
                    </p>
                    {insights.savingsOpportunities.map((tip, i) => (
                      <div key={i} className="text-sm text-muted-foreground flex gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Aydan Aya Harcama</CardTitle>
              <CardDescription>Kategori bazında önceki ayla karşılaştırma.</CardDescription>
            </CardHeader>
            <CardContent>
              {insights.monthOverMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Karşılaştırma için henüz yeterli veri yok.</p>
              ) : (
                <div className="space-y-2">
                  {insights.monthOverMonth.map((row) => {
                    const color = getCategoryColor(row.category);
                    const isUp = row.change > 5;
                    const isDown = row.change < -5;
                    return (
                      <div key={row.category} className="flex items-center gap-3 py-2 border-b last:border-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-sm font-medium w-32 shrink-0">{getCategoryLabel(row.category)}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{formatCurrency(row.current)}</span>
                          <span className="text-xs text-muted-foreground">önceki {formatCurrency(row.previous)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isUp ? (
                            <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                          ) : isDown ? (
                            <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          <span className={`text-xs font-medium ${isUp ? "text-destructive" : isDown ? "text-emerald-500" : "text-muted-foreground"}`}>
                            {row.change >= 0 ? "+" : ""}{formatCurrency(row.change)}
                            {row.previous > 0 && (
                              <span className="ml-1 text-xs">({row.changePercent}%)</span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4 text-primary" /> Tekrarlayan Ödemeler
                </CardTitle>
                <CardDescription>3+ ay boyunca düzenli görünen iş yerleri.</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.recurringPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Henüz tekrarlayan ödeme deseni bulunamadı.</p>
                ) : (
                  <div className="space-y-2">
                    {insights.recurringPayments.map((r) => (
                      <div key={r.merchant} className="flex items-center justify-between py-1.5 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium">{r.merchant}</p>
                          <p className="text-xs text-muted-foreground">{r.count} ay</p>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(r.amount)}/ay</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bu Ay Yeni</CardTitle>
                <CardDescription>Önceki ay görünmeyen iş yerleri; beklenen işlemler mi kontrol edin.</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.unusualMerchants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Bu ay yeni iş yeri yok.</p>
                ) : (
                  <div className="space-y-2">
                    {insights.unusualMerchants.map((r) => (
                      <div key={r.merchant} className="flex items-center justify-between py-1.5 border-b last:border-0">
                        <div>
                          <p className="text-sm font-medium">{r.merchant}</p>
                          <p className="text-xs text-muted-foreground">{r.count} işlem</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{formatCurrency(r.amount)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
