import React, { useState } from "react";
import {
  useListCategories,
  useListRules,
  useCreateRule,
  useDeleteRule,
  getListRulesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Tag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Categories() {
  const { data: categories } = useListCategories();
  const { data: rules } = useListRules();
  const createRule = useCreateRule();
  const deleteRule = useDeleteRule();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [pattern, setPattern] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  const handleAddRule = () => {
    if (!pattern.trim() || !selectedCategory) {
      toast({ variant: "destructive", title: "Fill in both fields" });
      return;
    }
    createRule.mutate(
      { data: { pattern: pattern.trim().toLowerCase(), category: selectedCategory, priority: 10 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });
          setPattern("");
          setSelectedCategory("");
          toast({ title: "Rule created", description: `"${pattern}" → ${selectedCategory}` });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to create rule" }),
      }
    );
  };

  const handleDeleteRule = (id: number) => {
    deleteRule.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });
          toast({ title: "Rule deleted" });
        },
      }
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
        <CardHeader>
          <CardTitle>Custom Rules</CardTitle>
          <CardDescription>
            If a transaction description contains your keyword, it will be assigned to that category automatically during import.
            Custom rules are checked before built-in ones.
          </CardDescription>
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
                const cat = (categories ?? []).find((c) => c.id === rule.category);
                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate">
                        {rule.pattern}
                      </code>
                      <span className="text-muted-foreground text-xs">→</span>
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
