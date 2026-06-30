import React, { useState } from "react";
import {
  useListCategories,
  useListRules,
  useCreateRule,
  useDeleteRule,
  useListRuleSuggestions,
  useApplyRulesToExistingTransactions,
  getListRulesQueryKey,
  getListRuleSuggestionsQueryKey,
  type RuleSuggestion,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Tag, Sparkles, Check, X, Wand2, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type SuggestionEdit = {
  pattern: string;
  category: string;
};

export default function Categories() {
  const { data: categories } = useListCategories();
  const { data: rules } = useListRules();
  const suggestionsQuery = useListRuleSuggestions();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const applyRules = useApplyRulesToExistingTransactions();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [pattern, setPattern] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [suggestionEdits, setSuggestionEdits] = useState<Record<string, SuggestionEdit>>({});
  const [rejectedSuggestions, setRejectedSuggestions] = useState<Set<string>>(new Set());

  const visibleSuggestions = (suggestionsQuery.data ?? []).filter(
    (suggestion) => !rejectedSuggestions.has(suggestion.id),
  );

  const getCategory = (categoryId: string) => (categories ?? []).find((c) => c.id === categoryId);
  const getSuggestionEdit = (suggestion: RuleSuggestion): SuggestionEdit =>
    suggestionEdits[suggestion.id] ?? { pattern: suggestion.pattern, category: suggestion.category };

  const updateSuggestionEdit = (suggestion: RuleSuggestion, patch: Partial<SuggestionEdit>) => {
    setSuggestionEdits((current) => ({
      ...current,
      [suggestion.id]: { ...getSuggestionEdit(suggestion), ...patch },
    }));
  };

  const refreshRules = () => {
    queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRuleSuggestionsQueryKey() });
  };

  const handleAddRule = () => {
    if (!pattern.trim() || !selectedCategory) {
      toast({ variant: "destructive", title: "İki alanı da doldurun" });
      return;
    }
    createRule.mutate(
      { data: { pattern: pattern.trim().toLowerCase(), category: selectedCategory, priority: 10 } },
      {
        onSuccess: () => {
          refreshRules();
          setPattern("");
          setSelectedCategory("");
          toast({ title: "Kural oluşturuldu", description: `"${pattern}" -> ${getCategory(selectedCategory)?.label ?? selectedCategory}` });
        },
        onError: () => toast({ variant: "destructive", title: "Kural oluşturulamadı" }),
      },
    );
  };

  const handleDeleteRule = (id: number) => {
    deleteRule.mutate(
      { id },
      {
        onSuccess: () => {
          refreshRules();
          toast({ title: "Kural silindi" });
        },
      },
    );
  };

  const handleApproveSuggestion = (suggestion: RuleSuggestion) => {
    const edit = getSuggestionEdit(suggestion);
    if (!edit.pattern.trim() || !edit.category) {
      toast({ variant: "destructive", title: "İki alanı da doldurun" });
      return;
    }

    createRule.mutate(
      { data: { pattern: edit.pattern.trim().toLowerCase(), category: edit.category, priority: 20 } },
      {
        onSuccess: () => {
          refreshRules();
          setRejectedSuggestions((current) => new Set(current).add(suggestion.id));
          toast({
            title: "Kural onaylandı",
            description: `${suggestion.merchant} -> ${getCategory(edit.category)?.label ?? edit.category}`,
          });
        },
        onError: () => toast({ variant: "destructive", title: "Kural onaylanamadı" }),
      },
    );
  };

  const handleRejectSuggestion = (suggestionId: string) => {
    setRejectedSuggestions((current) => new Set(current).add(suggestionId));
  };

  const handleApplyRules = () => {
    applyRules.mutate(undefined, {
      onSuccess: (result) => {
        queryClient.invalidateQueries();
        toast({
          title: "Kurallar uygulandı",
          description: `${result.scanned} işlem tarandı, ${result.updated} işlem güncellendi`,
        });
      },
      onError: () => toast({ variant: "destructive", title: "Kurallar uygulanamadı" }),
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kategoriler ve Kurallar</h1>
        <p className="text-muted-foreground mt-1">
          Harcama kategorilerini görüntüleyin ve özel otomatik kategorilendirme kurallarını yönetin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Kategoriler
          </CardTitle>
          <CardDescription>Otomatik sınıflandırmada kullanılan yerleşik harcama kategorileri.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {(categories ?? []).map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-sm font-medium truncate">{cat.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Kural Önerileri
            </CardTitle>
            <CardDescription>
              Diğer kategorisindeki veya deterministik iş yeri kurallarıyla uyuşmayan mevcut işlemlerden önerilir.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => suggestionsQuery.refetch()}
            disabled={suggestionsQuery.isFetching}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestionsQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
              İşlemler taranıyor...
            </div>
          ) : visibleSuggestions.length > 0 ? (
            visibleSuggestions.map((suggestion) => {
              const edit = getSuggestionEdit(suggestion);
              const cat = getCategory(edit.category);
              return (
                <div key={suggestion.id} className="rounded-lg border bg-card p-3 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">{suggestion.merchant}</span>
                        <span className="text-muted-foreground text-xs">-&gt;</span>
                        {cat && (
                          <Badge
                            style={{ backgroundColor: cat.color + "22", color: cat.color, borderColor: cat.color + "44" }}
                            variant="outline"
                            className="text-xs"
                          >
                            {cat.label}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(suggestion.confidence * 100)}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApproveSuggestion(suggestion)}
                        disabled={createRule.isPending}
                      >
                        <Check className="w-4 h-4" />
                        Onayla
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectSuggestion(suggestion.id)}
                      >
                        <X className="w-4 h-4" />
                        Reddet
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                        Kural deseni
                      </label>
                      <Input
                        value={edit.pattern}
                        onChange={(event) => updateSuggestionEdit(suggestion, { pattern: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                        Kategori
                      </label>
                      <Select value={edit.category} onValueChange={(value) => updateSuggestionEdit(suggestion, { category: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Kategori seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {(categories ?? []).filter((c) => c.id !== "other").map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{suggestion.transactionCount} işlem</span>
                    <span>toplam {suggestion.totalAmount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</span>
                    {suggestion.currentCategories.map((item) => (
                      <Badge key={item.category} variant="outline" className="text-xs">
                        {item.count} {getCategory(item.category)?.label ?? item.category}
                      </Badge>
                    ))}
                  </div>

                  {suggestion.sampleDescriptions.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate">
                      {suggestion.sampleDescriptions.slice(0, 2).join(" | ")}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
              Şu anda kural önerisi yok.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Özel Kurallar</CardTitle>
            <CardDescription>
              İşlem açıklaması belirlediğiniz anahtar kelimeyi içerirse içe aktarma sırasında otomatik olarak bu kategoriye atanır.
              Özel kurallar yerleşik kurallardan önce kontrol edilir.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleApplyRules}
            disabled={applyRules.isPending}
            className="w-full sm:w-auto whitespace-normal text-center sm:whitespace-nowrap"
          >
            <Wand2 className="w-4 h-4" />
            Kuralları mevcut işlemlere uygula
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Anahtar kelime / Desen
              </label>
              <Input
                placeholder="örn. migros, starbucks, kira..."
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              />
            </div>
            <div className="w-full sm:w-48">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Kategori
              </label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).filter((c) => c.id !== "other").map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddRule} disabled={createRule.isPending} className="w-full sm:w-auto">
                <Plus className="w-4 h-4 mr-1" />
                Kural ekle
              </Button>
            </div>
          </div>

          {rules && rules.length > 0 ? (
            <div className="space-y-2 mt-2">
              {rules.map((rule) => {
                const cat = getCategory(rule.category);
                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate">
                        {rule.pattern}
                      </code>
                      <span className="text-muted-foreground text-xs">-&gt;</span>
                      {cat && (
                        <Badge
                          style={{ backgroundColor: cat.color + "22", color: cat.color, borderColor: cat.color + "44" }}
                          variant="outline"
                          className="text-xs"
                        >
                          {cat.label}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteRule(rule.id)}
                      disabled={deleteRule.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
              Henüz özel kural yok. Yerleşik kategorilendirmeyi geçersiz kılmak için yukarıdan kural ekleyin.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
