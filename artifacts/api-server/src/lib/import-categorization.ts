import {
  CATEGORIES,
  categorizeBuiltIn,
  matchCustomRule,
  type CustomRule,
} from "./categorizer";
import { normalizeCategoryId } from "@workspace/finance-categories";
import {
  buildMerchantMemoryKey,
  type MerchantMemoryRecord,
} from "./merchant-memory";
import { maskSensitiveData } from "./statement-parsers/text-utils";
import type { ParsedTransaction } from "./parsers";

export interface CategorizationDecision {
  merchant: string;
  category: string;
  confidence: number;
  source: "custom_rule" | "merchant_memory" | "merchant_rule" | "built_in" | "llm" | "fallback";
  explanation: string;
}

export async function categorizeForImport(
  transaction: ParsedTransaction,
  customRules: CustomRule[],
  merchantMemory: Map<string, MerchantMemoryRecord>,
): Promise<CategorizationDecision> {
  const customRule = matchCustomRule(transaction.merchant, transaction.description, customRules);
  if (customRule) {
    return {
      merchant: transaction.merchant,
      category: normalizeCategoryId(customRule.category),
      confidence: 0.99,
      source: "custom_rule",
      explanation: `Matched user rule "${customRule.pattern}".`,
    };
  }

  const memoryKey = buildMerchantMemoryKey(transaction.merchant, transaction.description);
  const remembered = merchantMemory.get(memoryKey);
  if (remembered) {
    return {
      merchant: remembered.displayName,
      category: normalizeCategoryId(remembered.category),
      confidence: Math.max(0.9, remembered.confidence),
      source: "merchant_memory",
      explanation: `Recognized merchant from persistent merchant database using key "${remembered.pattern}".`,
    };
  }

  const parserConfidence = Number(transaction.categorizationConfidence ?? transaction.confidence ?? 0);
  const parserCategory = normalizeCategoryId(transaction.category);
  if (parserCategory !== "other" && parserConfidence >= 0.74) {
    return {
      merchant: transaction.merchant,
      category: parserCategory,
      confidence: roundConfidence(parserConfidence),
      source: transaction.categorizationSource === "merchant_rule" ? "merchant_rule" : "built_in",
      explanation: transaction.categorizationExplanation ?? "Matched deterministic parser categorization rule.",
    };
  }

  const builtInCategory = categorizeBuiltIn(transaction.merchant, transaction.description);
  if (builtInCategory !== "other") {
    const deterministicDecision: CategorizationDecision = {
      merchant: transaction.merchant,
      category: builtInCategory,
      confidence: 0.78,
      source: "built_in",
      explanation: "Matched deterministic built-in category keywords.",
    };

    return (await maybeCategorizeWithLlm(transaction, deterministicDecision)) ?? deterministicDecision;
  }

  const fallbackDecision: CategorizationDecision = {
    merchant: transaction.merchant,
    category: "other",
    confidence: Math.max(0.2, roundConfidence(parserConfidence)),
    source: "fallback",
    explanation: "No user rule, merchant memory, or deterministic category rule matched.",
  };

  return (await maybeCategorizeWithLlm(transaction, fallbackDecision)) ?? fallbackDecision;
}

async function maybeCategorizeWithLlm(
  transaction: ParsedTransaction,
  current: CategorizationDecision,
): Promise<CategorizationDecision | null> {
  const threshold = Number(process.env.LLM_CATEGORIZATION_CONFIDENCE_THRESHOLD ?? "0.65");
  if (current.confidence >= threshold) return null;
  if (process.env.LLM_CATEGORIZATION_ENABLED?.toLowerCase() !== "true") return null;

  const endpoint = process.env.LLM_CATEGORIZATION_ENDPOINT;
  const apiKey = process.env.LLM_CATEGORIZATION_API_KEY;
  if (!endpoint || !apiKey) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      merchant: transaction.merchant,
      description: maskSensitiveData(transaction.description),
      direction: transaction.type,
      transactionKind: transaction.transactionKind ?? "other",
      categories: CATEGORIES.map((category) => category.id),
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);

  if (!response?.ok) return null;

  const body = (await response.json().catch(() => null)) as {
    category?: string;
    confidence?: number;
    explanation?: string;
  } | null;

  const normalizedCategory = normalizeCategoryId(body?.category);
  if (!body?.category || normalizedCategory === "other") return null;

  return {
    merchant: transaction.merchant,
    category: normalizedCategory,
    confidence: roundConfidence(Number(body.confidence ?? 0.66)),
    source: "llm",
    explanation: body.explanation
      ? `LLM low-confidence fallback: ${body.explanation}`
      : "LLM low-confidence fallback selected this category.",
  };
}

function roundConfidence(value: number): number {
  return Number(Math.min(0.99, Math.max(0, value)).toFixed(2));
}
