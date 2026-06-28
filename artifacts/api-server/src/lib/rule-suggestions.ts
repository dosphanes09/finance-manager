import {
  categorize,
  categorizeBuiltIn,
  matchCustomRule,
  normalizeCategorizationText,
  type CustomRule,
} from "./categorizer";
import { MERCHANT_RULES, normalizeMerchant } from "./statement-parsers/merchant-normalizer";
import { maskSensitiveData } from "./statement-parsers/text-utils";

export interface TransactionForRuleAnalysis {
  id: number;
  merchant: string;
  description: string;
  amount: string | number;
  category: string;
}

export interface RuleSuggestion {
  id: string;
  merchant: string;
  pattern: string;
  category: string;
  transactionCount: number;
  totalAmount: number;
  confidence: number;
  reason: string;
  sampleDescriptions: string[];
  currentCategories: Array<{ category: string; count: number }>;
}

interface SuggestionGroup {
  merchant: string;
  pattern: string;
  category: string;
  transactionCount: number;
  totalAmount: number;
  confidence: number;
  sampleDescriptions: Set<string>;
  currentCategories: Map<string, number>;
}

export function buildRuleSuggestions(
  transactions: TransactionForRuleAnalysis[],
  customRules: CustomRule[],
): RuleSuggestion[] {
  const groups = new Map<string, SuggestionGroup>();

  for (const transaction of transactions) {
    if (matchCustomRule(transaction.merchant, transaction.description, customRules)) {
      continue;
    }

    const normalized = normalizeMerchant(`${transaction.merchant} ${transaction.description}`);
    const builtInCategory = categorizeBuiltIn(transaction.merchant, transaction.description);
    const suggestedCategory = normalized.category !== "other" ? normalized.category : builtInCategory;
    if (suggestedCategory === "other") continue;

    const currentCategory = transaction.category || "other";
    const isOther = currentCategory === "other";
    const isPossiblyWrong = currentCategory !== suggestedCategory;
    if (!isOther && !isPossiblyWrong) continue;

    const pattern = chooseRulePattern(normalized.merchant, normalized.matchedPattern);
    if (hasEquivalentRule(pattern, customRules)) continue;

    const key = `${normalizeCategorizationText(pattern)}|${suggestedCategory}`;
    const group = groups.get(key) ?? {
      merchant: normalized.merchant,
      pattern,
      category: suggestedCategory,
      transactionCount: 0,
      totalAmount: 0,
      confidence: normalized.confidence,
      sampleDescriptions: new Set<string>(),
      currentCategories: new Map<string, number>(),
    };

    group.transactionCount += 1;
    group.totalAmount += Math.abs(Number(transaction.amount));
    group.confidence = Math.max(group.confidence, normalized.confidence);
    group.currentCategories.set(
      currentCategory,
      (group.currentCategories.get(currentCategory) ?? 0) + 1,
    );

    if (group.sampleDescriptions.size < 3) {
      group.sampleDescriptions.add(maskSensitiveData(transaction.description));
    }

    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const currentCategories = Array.from(group.currentCategories.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

      return {
        id: `${normalizeCategorizationText(group.pattern)}:${group.category}`,
        merchant: group.merchant,
        pattern: group.pattern,
        category: group.category,
        transactionCount: group.transactionCount,
        totalAmount: Number(group.totalAmount.toFixed(2)),
        confidence: scoreSuggestion(group.confidence, group.transactionCount, currentCategories.length),
        reason: buildReason(group.merchant, group.category, currentCategories),
        sampleDescriptions: Array.from(group.sampleDescriptions),
        currentCategories,
      };
    })
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.transactionCount !== a.transactionCount) return b.transactionCount - a.transactionCount;
      return a.merchant.localeCompare(b.merchant);
    });
}

export function categorizeTransactionsWithRules(
  transactions: TransactionForRuleAnalysis[],
  customRules: CustomRule[],
): Array<{ id: number; category: string }> {
  return transactions
    .map((transaction) => ({
      id: transaction.id,
      category: categorize(transaction.merchant, transaction.description, customRules),
      currentCategory: transaction.category,
    }))
    .filter((transaction) => transaction.category !== transaction.currentCategory)
    .map(({ id, category }) => ({ id, category }));
}

function chooseRulePattern(merchant: string, matchedPattern?: string): string {
  const merchantRule = MERCHANT_RULES.find((rule) => rule.merchant === merchant);
  const normalizedMerchant = normalizeCategorizationText(merchant).trim();
  const patterns = merchantRule?.patterns ?? [matchedPattern, merchant];

  const exact = patterns
    .filter((pattern): pattern is string => Boolean(pattern))
    .map(cleanPattern)
    .find((pattern) => normalizeCategorizationText(pattern) === normalizedMerchant);

  if (exact && normalizedMerchant.length > 2) return exact;

  const safePattern = patterns
    .filter((pattern): pattern is string => Boolean(pattern))
    .map(cleanPattern)
    .find((pattern) => normalizeCategorizationText(pattern).length >= Math.max(3, normalizedMerchant.length));

  return safePattern ?? cleanPattern(matchedPattern ?? merchant);
}

function cleanPattern(pattern: string): string {
  return normalizeCategorizationText(pattern)
    .replace(/[*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasEquivalentRule(pattern: string, customRules: CustomRule[]): boolean {
  const normalizedPattern = normalizeCategorizationText(pattern).trim();
  return customRules.some((rule) => normalizeCategorizationText(rule.pattern).trim() === normalizedPattern);
}

function scoreSuggestion(baseConfidence: number, transactionCount: number, categoryCount: number): number {
  const countBonus = transactionCount >= 5 ? 0.04 : transactionCount >= 3 ? 0.03 : transactionCount >= 2 ? 0.01 : 0;
  const mixedPenalty = categoryCount > 1 ? 0.04 : 0;
  return Number(Math.min(0.99, Math.max(0.5, baseConfidence + countBonus - mixedPenalty)).toFixed(2));
}

function buildReason(
  merchant: string,
  category: string,
  currentCategories: Array<{ category: string; count: number }>,
): string {
  const otherCount = currentCategories.find((item) => item.category === "other")?.count ?? 0;
  const total = currentCategories.reduce((sum, item) => sum + item.count, 0);

  if (otherCount === total) {
    return `${merchant} appears in ${total} imported transaction${total === 1 ? "" : "s"} categorized as Other.`;
  }

  const categorySummary = currentCategories
    .map((item) => `${item.count} ${item.category}`)
    .join(", ");

  return `${merchant} is stored as ${categorySummary}, but deterministic rules suggest ${category}.`;
}
