import {
  cleanDescription,
  detectTransactionTypeFromAmount,
  extractAmountCandidates,
  findDateTokens,
  inferTransactionKind,
  includesAny,
  normalizeForMatching,
  parseDate,
  splitPdfLines,
} from "./text-utils";
import {
  detectRecurringSubscriptions,
  detectSalaryTransactions,
  discoverMerchantRules,
  normalizeMerchant,
} from "./merchant-normalizer";
import type {
  NormalizedTransaction,
  StatementLayout,
  StatementParseResult,
  StatementParser,
  TransactionType,
} from "./types";

interface TransactionBlock {
  startLine: number;
  lines: string[];
}

interface ColumnLayout {
  hasBalanceColumn: boolean;
  hasDebitCreditColumns: boolean;
  debitBeforeCredit: boolean;
}

export class GenericParser implements StatementParser {
  readonly bank = "generic" as const;
  readonly name = "GenericParser";

  detect(rawText: string): number {
    const lines = splitPdfLines(rawText);
    const dateLines = lines.filter((line) => findDateTokens(line).length > 0).length;
    const amountLines = lines.filter((line) => extractAmountCandidates(line).length > 0).length;
    if (dateLines === 0 || amountLines === 0) return 0;
    return 0.35;
  }

  parse(rawText: string): StatementParseResult {
    const lines = splitPdfLines(rawText);
    const blocks = buildTransactionBlocks(lines);
    const layout = detectColumnLayout(lines);
    const transactions = blocks
      .map((block) => parseBlock(block, layout))
      .filter((transaction): transaction is NormalizedTransaction => transaction !== null);

    return buildResult(transactions, {
      transactionTable: "Generic date-plus-amount blocks",
      dateFormats: ["dd.MM.yyyy", "dd/MM/yyyy", "yyyy-MM-dd"],
      amountFormats: ["1.250,75 TL", "-250,75 TL", "250.75", "250,75"],
      debitCreditColumns: layout.hasDebitCreditColumns ? "Detected debit/credit labels" : "Inferred from signs and keywords",
      balanceColumns: layout.hasBalanceColumn ? "Last amount candidate treated as balance" : "Not detected",
      multilineDescriptions: true,
      recurringPatterns: ["Same normalized merchant across multiple months with stable amount"],
    });
  }
}

export function buildResult(
  transactions: NormalizedTransaction[],
  layout: StatementLayout,
  warnings: string[] = [],
): StatementParseResult {
  return {
    bank: transactions[0]?.parser ?? "generic",
    parser: transactions[0]?.parser === "ziraat" ? "ZiraatParser" : transactions[0]?.parser === "enpara" ? "EnparaParser" : "GenericParser",
    confidence: transactions.length > 0 ? average(transactions.map((transaction) => transaction.confidence)) : 0,
    layout,
    transactions,
    discoveredRules: discoverMerchantRules(transactions),
    recurringSubscriptions: detectRecurringSubscriptions(transactions),
    salarySignals: detectSalaryTransactions(transactions),
    warnings,
  };
}

function buildTransactionBlocks(lines: string[]): TransactionBlock[] {
  const blocks: TransactionBlock[] = [];
  let current: TransactionBlock | null = null;

  lines.forEach((line, index) => {
    if (isLikelyStatementNonTransactionLine(line)) {
      if (current) {
        blocks.push(current);
        current = null;
      }
      return;
    }

    const dateTokens = findDateTokens(line);
    const hasDate = dateTokens.length > 0;
    const hasAmount = extractAmountCandidates(line).length > 0;

    if (
      hasDate &&
      !isLikelyStatementPeriodLine(line) &&
      !isLikelyStatementMetadataDateLine(line) &&
      (dateTokens.length === 1 || hasAmount)
    ) {
      if (current) blocks.push(current);
      current = { startLine: index + 1, lines: [line] };
      return;
    }

    if (current) current.lines.push(line);
  });

  if (current) blocks.push(current);
  return blocks;
}

function parseBlock(block: TransactionBlock, layout: ColumnLayout): NormalizedTransaction | null {
  const blockText = block.lines.join(" ");
  const date = parseDate(blockText);
  if (!date) return null;

  const amounts = extractAmountCandidates(blockText);
  if (amounts.length === 0) return null;

  const picked = pickGenericAmount(amounts, layout);
  if (!picked || picked.candidate.absValue === 0) return null;

  const description = cleanDescription(blockText) || "Transaction";
  const normalizedMerchant = normalizeMerchant(description);
  const transactionType = picked.role ?? inferType(description, picked.candidate.raw);
  const transactionKind = inferTransactionKind(description, normalizedMerchant.merchant, transactionType);

  return {
    date,
    description,
    merchant: normalizedMerchant.merchant,
    amount: picked.candidate.absValue,
    currency: picked.candidate.currency ?? "TRY",
    transactionType,
    transactionKind,
    balance: picked.balance?.absValue ?? null,
    category: normalizedMerchant.category,
    parser: "generic",
    confidence: Math.min(0.82, normalizedMerchant.confidence),
    categorizationConfidence: normalizedMerchant.confidence,
    categorizationSource: normalizedMerchant.matchedPattern ? "merchant_rule" : "built_in",
    categorizationExplanation: normalizedMerchant.matchedPattern
      ? `Merchant matched deterministic pattern "${normalizedMerchant.matchedPattern}".`
      : "Category inferred from deterministic merchant and keyword rules.",
  };
}

function pickGenericAmount(
  candidates: ReturnType<typeof extractAmountCandidates>,
  layout: ColumnLayout,
): {
  candidate: ReturnType<typeof extractAmountCandidates>[number];
  balance?: ReturnType<typeof extractAmountCandidates>[number];
  role?: TransactionType;
} | null {
  const balance = layout.hasBalanceColumn && candidates.length > 1 ? candidates[candidates.length - 1] : undefined;
  const dataCandidates = balance ? candidates.slice(0, -1) : candidates;

  if (layout.hasDebitCreditColumns && dataCandidates.length >= 2) {
    const debitCandidate = layout.debitBeforeCredit ? dataCandidates[0] : dataCandidates[1];
    const creditCandidate = layout.debitBeforeCredit ? dataCandidates[1] : dataCandidates[0];

    if (debitCandidate.absValue > 0) return { candidate: debitCandidate, balance, role: "debit" };
    if (creditCandidate.absValue > 0) return { candidate: creditCandidate, balance, role: "credit" };
  }

  const signed = dataCandidates.find((candidate) => candidate.hasExplicitSign);
  if (signed) return { candidate: signed, balance, role: detectTransactionTypeFromAmount(signed.raw) };

  const localCurrencyCandidates = dataCandidates.filter((candidate) => candidate.currency === "TRY" && candidate.absValue > 0);
  if (localCurrencyCandidates.length > 0) return { candidate: localCurrencyCandidates[localCurrencyCandidates.length - 1], balance };

  const nonZeroCandidates = dataCandidates.filter((candidate) => candidate.absValue > 0);
  if (nonZeroCandidates.length > 0) return { candidate: nonZeroCandidates[nonZeroCandidates.length - 1], balance };

  return null;
}

function detectColumnLayout(lines: string[]): ColumnLayout {
  const headerLines = lines
    .slice(0, 100)
    .filter((line) => isLikelyColumnHeaderLine(line));
  const normalized = normalizeForMatching(headerLines.join(" "));
  const debitIndex = firstIndexOfAny(normalized, ["borc", "debit", "cekilen", "gider"]);
  const creditIndex = firstIndexOfAny(normalized, ["alacak", "credit", "yatan", "gelir"]);
  const balanceIndex = firstIndexOfAny(normalized, ["bakiye", "balance"]);

  return {
    hasBalanceColumn: balanceIndex >= 0,
    hasDebitCreditColumns: debitIndex >= 0 && creditIndex >= 0,
    debitBeforeCredit: debitIndex === -1 || creditIndex === -1 ? true : debitIndex < creditIndex,
  };
}

function inferType(description: string, rawAmount: string): TransactionType {
  const normalized = normalizeForMatching(description);
  if (includesAny(normalized, ["credit", "income", "alacak", "gelen", "yatan", "maas", "iade", "refund"])) return "credit";
  if (includesAny(normalized, ["debit", "out", "expense", "borc", "giden", "cekilen", "odeme", "harcama", "alisveris"])) return "debit";
  return detectTransactionTypeFromAmount(rawAmount);
}

function isLikelyColumnHeaderLine(line: string): boolean {
  if (isLikelyStatementNonTransactionLine(line)) return false;

  const normalized = normalizeForMatching(line);
  const hasDateOrDescriptionLabel = includesAny(normalized, [
    "islem tarihi",
    "tarih",
    "date",
    "aciklama",
    "description",
    "narration",
  ]);
  const hasMoneyColumnLabel = includesAny(normalized, [
    "tutar",
    "amount",
    "borc",
    "alacak",
    "debit",
    "credit",
    "bakiye",
    "balance",
  ]);

  return hasDateOrDescriptionLabel && hasMoneyColumnLabel;
}

function firstIndexOfAny(text: string, needles: string[]): number {
  const indexes = needles.map((needle) => text.indexOf(needle)).filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function isLikelyStatementPeriodLine(line: string): boolean {
  const normalized = normalizeForMatching(line);
  const dateCount = findDateTokens(line).length;
  return (
    dateCount > 1 &&
    includesAny(normalized, ["donem", "tarih araligi", "hesap ozeti", "statement period", "account statement"])
  );
}

function isLikelyStatementMetadataDateLine(line: string): boolean {
  const normalized = normalizeForMatching(line);
  return includesAny(normalized, [
    "ekstre tarihi",
    "ekstre borcu",
    "minimum odeme",
    "son odeme tarihi",
    "bir sonraki ekstrenizin",
    "statement date",
    "payment due date",
  ]);
}

function isLikelyStatementNonTransactionLine(line: string): boolean {
  const normalized = normalizeForMatching(line);
  return includesAny(normalized, [
    "ekstre tarihi",
    "ekstre borcu",
    "minimum odeme",
    "son odeme tarihi",
    "ad soyad",
    "kart numarasi",
    "kart limiti",
    "kullanilabilir kart limiti",
    "bir onceki ekstre bakiyeniz",
    "bir sonraki ekstrenizin",
    "guncel akdi faiz",
    "faiz orani",
    "sayfa ",
    "kart sahibinin",
    "seri-sira no",
    "mersis no",
    "kredi karti ekstresi",
    "-- ",
  ]);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
