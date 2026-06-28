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
      toast({ variant: "destructive", title: "Fill in both fields" });
      return;
    }
    createRule.mutate(
      { data: { pattern: pattern.trim().toLowerCase(), category: selectedCategory, priority: 10 } },
      {
        onSuccess: () => {
          refreshRules();
          setPattern("");
          setSelectedCategory("");
          toast({ title: "Rule created", description: `"${pattern}" -> ${selectedCategory}` });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to create rule" }),
      },
    );
  };

  const handleDeleteRule = (id: number) => {
    deleteRule.mutate(
      { id },
      {
        onSuccess: () => {
          refreshRules();
          toast({ title: "Rule deleted" });
        },
      },
    );
  };

  const handleApproveSuggestion = (suggestion: RuleSuggestion) => {
    const edit = getSuggestionEdit(suggestion);
    if (!edit.pattern.trim() || !edit.category) {
      toast({ variant: "destructive", title: "Fill in both fields" });
      return;
    }

    createRule.mutate(
      { data: { pattern: edit.pattern.trim().toLowerCase(), category: edit.category, priority: 20 } },
      {
        onSuccess: () => {
          refreshRules();
          setRejectedSuggestions((current) => new Set(current).add(suggestion.id));
          toast({
            title: "Rule approved",
            description: `${suggestion.merchant} -> ${getCategory(edit.category)?.label ?? edit.category}`,
          });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to approve rule" }),
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
          title: "Rules applied",
          description: `${result.updated} of ${result.scanned} transactions updated`,
        });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to apply rules" }),
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categories & Rules</h1>
        <p className="text-muted-foreground mt-1">
          View spending categories and manage custom auto-categorization rules.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Categories
          </CardTitle>
          <CardDescription>Built-in spending categories used for automatic classification.</CardDescription>
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
              Rule Suggestions
            </CardTitle>
            <CardDescription>
              Suggested from existing transactions currently marked Other or mismatched with deterministic merchant rules.
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
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestionsQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg">
              Scanning transactions...
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
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectSuggestion(suggestion.id)}
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                        Rule pattern
                      </label>
                      <Input
                        value={edit.pattern}
                        onChange={(event) => updateSuggestionEdit(suggestion, { pattern: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                        Category
                      </label>
                      <Select value={edit.category} onValueChange={(value) => updateSuggestionEdit(suggestion, { category: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
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
                    <span>{suggestion.transactionCount} transactions</span>
                    <span>total {suggestion.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
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
              No rule suggestions right now.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Custom Rules</CardTitle>
            <CardDescription>
              If a transaction description contains your keyword, it will be assigned to that category automatically during import.
              Custom rules are checked before built-in ones.
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
            Apply rules to existing transactions
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Keyword / Pattern
              </label>
              <Input
                placeholder="e.g. migros, starbucks, kira..."
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              />
            </div>
            <div className="w-full sm:w-48">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 block">
                Category
              </label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
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
                Add Rule
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
              No custom rules yet. Add one above to override built-in categorization.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
