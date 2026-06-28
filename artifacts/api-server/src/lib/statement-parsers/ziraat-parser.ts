import {
  cleanDescription,
  detectTransactionTypeFromAmount,
  extractAmountCandidates,
  includesAny,
  normalizeForMatching,
  parseDate,
  splitPdfLines,
} from "./text-utils";
import { normalizeMerchant } from "./merchant-normalizer";
import { buildResult } from "./generic-parser";
import type {
  AmountCandidate,
} from "./text-utils";
import type {
  NormalizedTransaction,
  StatementParseResult,
  StatementParser,
  TransactionType,
} from "./types";

export class ZiraatParser implements StatementParser {
  readonly bank = "ziraat" as const;
  readonly name = "ZiraatParser";

  detect(rawText: string): number {
    const normalized = normalizeForMatching(rawText);
    let score = 0;
    if (normalized.includes("ziraat")) score += 0.35;
    if (normalized.includes("bankkart")) score += 0.3;
    if (normalized.includes("islem tarihi") && normalized.includes("islem aciklamasi") && normalized.includes("tl tutar")) score += 0.3;
    return Math.min(score, 0.98);
  }

  parse(rawText: string): StatementParseResult {
    const lines = splitPdfLines(rawText);
    const rowLines = extractZiraatRows(lines);
    const transactions = rowLines
      .map(parseZiraatRow)
      .filter((transaction): transaction is NormalizedTransaction => transaction !== null);

    return {
      ...buildResult(
        transactions,
        {
          transactionTable: "Ziraat Bankkart rows after 'Islem Tarihi Islem Aciklamasi TL Tutar USD Tutar Bankkart Lira'",
          dateFormats: ["dd.MM.yyyy"],
          amountFormats: ["1.250,75", "1.250,75+", "1.250,75 0,00"],
          debitCreditColumns: "Single TL amount column; credit inferred from plus suffix and refund/payment keywords",
          balanceColumns: "No row balance column in observed statements",
          multilineDescriptions: false,
          recurringPatterns: ["Same normalized merchant across monthly card statements"],
        },
        [],
      ),
      bank: "ziraat",
      parser: this.name,
      confidence: transactions.length > 0 ? 0.96 : 0,
    };
  }
}

function extractZiraatRows(lines: string[]): string[] {
  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeForMatching(line);
    return normalized.includes("islem tarihi") && normalized.includes("islem aciklamasi") && normalized.includes("tl tutar");
  });

  const candidateLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines;
  const rows: string[] = [];

  for (const line of candidateLines) {
    if (isZiraatFooter(line)) break;
    if (/^\d{1,2}\.\d{1,2}\.\d{4}\b/.test(line)) rows.push(line);
  }

  return rows;
}

function parseZiraatRow(line: string): NormalizedTransaction | null {
  const match = line.match(/^(\d{1,2}\.\d{1,2}\.\d{4})\s+(.+)$/);
  if (!match) return null;

  const date = parseDate(match[1]);
  if (!date) return null;

  const rest = match[2];
  const amounts = extractAmountCandidates(rest);
  if (amounts.length === 0) return null;

  const trailing = extractTrailingAmountColumns(rest, amounts);
  const picked = pickZiraatTlAmount(trailing);
  if (!picked || picked.absValue === 0) return null;

  const rawDescription = rest.slice(0, picked.index);
  const description = cleanDescription(rawDescription);
  if (!description) return null;

  const normalizedMerchant = normalizeMerchant(description);
  const transactionType = inferZiraatType(description, picked.raw);

  return {
    date,
    description,
    merchant: normalizedMerchant.merchant,
    amount: picked.absValue,
    currency: "TRY",
    transactionType,
    balance: null,
    category: normalizedMerchant.category,
    parser: "ziraat",
    confidence: Math.min(0.97, normalizedMerchant.confidence + 0.01),
  };
}

function extractTrailingAmountColumns(line: string, amounts: AmountCandidate[]): AmountCandidate[] {
  const trailing: AmountCandidate[] = [];
  let rightBoundary = line.length;

  for (let index = amounts.length - 1; index >= 0; index -= 1) {
    const candidate = amounts[index];
    const betweenCandidateAndRight = line.slice(candidate.end, rightBoundary);

    if (betweenCandidateAndRight.trim().length > 0) break;

    trailing.unshift(candidate);
    rightBoundary = candidate.index;
  }

  return trailing;
}

function pickZiraatTlAmount(trailing: AmountCandidate[]): AmountCandidate | null {
  if (trailing.length === 0) return null;
  if (trailing.length >= 2) return trailing[0];
  return trailing[0];
}

function inferZiraatType(description: string, rawAmount: string): TransactionType {
  const normalized = normalizeForMatching(description);
  if (detectTransactionTypeFromAmount(rawAmount) === "credit") return "credit";
  if (includesAny(normalized, ["iade", "refund", "odemetesekkur", "subehesaptan odeme"])) return "credit";
  return "debit";
}

function isZiraatFooter(line: string): boolean {
  const normalized = normalizeForMatching(line);
  return includesAny(normalized, [
    "devreden bakiye harcamalariniz",
    "ekstre ile ilgili",
    "sozlesme degisikligi",
    "bankkart lira",
    "donem borcu",
  ]);
}
