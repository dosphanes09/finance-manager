import {
  cleanDescription,
  detectTransactionTypeFromAmount,
  extractAmountCandidates,
  findDateTokens,
  includesAny,
  normalizeForMatching,
  parseDate,
  splitPdfLines,
} from "./text-utils";
import { normalizeMerchant } from "./merchant-normalizer";
import { buildResult } from "./generic-parser";
import type {
  NormalizedTransaction,
  StatementParseResult,
  StatementParser,
  TransactionType,
} from "./types";

export class EnparaParser implements StatementParser {
  readonly bank = "enpara" as const;
  readonly name = "EnparaParser";

  detect(rawText: string): number {
    const normalized = normalizeForMatching(rawText);
    let score = 0;
    if (normalized.includes("enpara")) score += 0.45;
    if (normalized.includes("kredi karti ekstresi")) score += 0.25;
    if (normalized.includes("islem tarihi") && normalized.includes("aciklama") && normalized.includes("tutar")) score += 0.25;
    return Math.min(score, 0.98);
  }

  parse(rawText: string): StatementParseResult {
    const lines = splitPdfLines(rawText);
    const transactionLines = extractTransactionBlocks(lines);
    const transactions = transactionLines
      .map(parseEnparaBlock)
      .filter((transaction): transaction is NormalizedTransaction => transaction !== null);

    return {
      ...buildResult(
        transactions,
        {
          transactionTable: "Enpara credit-card rows after 'Islem tarihi Aciklama Taksit Tutar'",
          dateFormats: ["dd/MM/yyyy"],
          amountFormats: ["1.250,75 TL", "-250,75 TL", "(6,00 USD) 280,37 TL"],
          debitCreditColumns: "Single amount column; payments/refunds detected from sign and keywords",
          balanceColumns: "Statement-level balance only; no row balance column",
          multilineDescriptions: true,
          recurringPatterns: ["Same normalized merchant across monthly card statements"],
        },
        [],
      ),
      bank: "enpara",
      parser: this.name,
      confidence: transactions.length > 0 ? 0.95 : 0,
    };
  }
}

function extractTransactionBlocks(lines: string[]): string[] {
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeForMatching(line);
    return normalized.includes("islem tarihi") && normalized.includes("aciklama") && normalized.includes("tutar");
  });

  const candidateLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
  const blocks: string[] = [];
  let current: string[] | null = null;

  for (const line of candidateLines) {
    if (isFooterOrMetadata(line)) {
      if (current) {
        blocks.push(current.join(" "));
        current = null;
      }
      if (isHardFooter(line)) break;
      continue;
    }

    const startsTransaction = /^\d{1,2}\/\d{1,2}\/\d{4}\b/.test(line);
    if (startsTransaction) {
      if (current) blocks.push(current.join(" "));
      current = [line];
      continue;
    }

    if (current) current.push(line);
  }

  if (current) blocks.push(current.join(" "));
  return blocks;
}

function parseEnparaBlock(blockText: string): NormalizedTransaction | null {
  const date = parseDate(blockText);
  if (!date) return null;

  const amounts = extractAmountCandidates(blockText);
  if (amounts.length === 0) return null;

  const signed = amounts.find((candidate) => candidate.hasExplicitSign);
  const localCurrencyAmounts = amounts.filter((candidate) => candidate.currency === "TRY" && candidate.absValue > 0);
  const picked = signed ?? localCurrencyAmounts[localCurrencyAmounts.length - 1] ?? amounts[amounts.length - 1];

  if (!picked || picked.absValue === 0) return null;

  const description = cleanDescription(blockText);
  if (!description) return null;

  const normalizedMerchant = normalizeMerchant(description);
  const transactionType = inferEnparaType(description, picked.raw);

  return {
    date,
    description,
    merchant: normalizedMerchant.merchant,
    amount: picked.absValue,
    currency: picked.currency ?? "TRY",
    transactionType,
    balance: null,
    category: normalizedMerchant.category,
    parser: "enpara",
    confidence: Math.min(0.97, normalizedMerchant.confidence + 0.02),
  };
}

function inferEnparaType(description: string, rawAmount: string): TransactionType {
  const normalized = normalizeForMatching(description);
  if (detectTransactionTypeFromAmount(rawAmount) === "credit") return "credit";
  if (includesAny(normalized, ["iade", "refund", "odeme - enpara.com cep"])) return "credit";
  return "debit";
}

function isFooterOrMetadata(line: string): boolean {
  const normalized = normalizeForMatching(line);
  return includesAny(normalized, [
    "bir onceki ekstre bakiyeniz",
    "bir sonraki ekstrenizin",
    "guncel akdi faiz",
    "faiz orani",
    "sayfa ",
    "kart sahibinin",
    "mersis no",
    "-- ",
  ]);
}

function isHardFooter(line: string): boolean {
  const normalized = normalizeForMatching(line);
  return includesAny(normalized, [
    "bir sonraki ekstrenizin",
    "guncel akdi faiz",
  ]);
}
