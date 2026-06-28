import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs/promises";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parseStatementText, type NormalizedTransaction } from "./statement-parsers";

export interface ParsedTransaction {
  date: string;
  merchant: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  currency?: string;
  transactionType?: "debit" | "credit";
  balance?: number | null;
  category?: string;
  parser?: string;
  confidence?: number;
}

export interface PdfDiagnosticLine {
  lineNumber: number;
  text: string;
}

export interface PdfParseDiagnostics {
  reason: string;
  textExtractedSuccessfully: boolean;
  lineCount: number;
  transactionBlockCount: number;
  matchedTransactionCount: number;
  possibleDateLines: PdfDiagnosticLine[];
  possibleAmountLines: PdfDiagnosticLine[];
  possibleTransactionLineCandidates: PdfDiagnosticLine[];
  rejectedBlockSummary: Record<string, number>;
  suggestedBankFormatIssue: string;
  debugTextPath?: string;
}

export interface PdfParseOptions {
  debug?: boolean;
  debugDir?: string;
  debugTextPath?: string;
  logger?: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
}

interface TransactionBlock {
  startLine: number;
  lines: string[];
}

interface AmountCandidate {
  raw: string;
  value: number;
  index: number;
  currency?: "TRY" | "FOREIGN";
}

interface ColumnLayout {
  hasBalanceColumn: boolean;
  hasDebitCreditColumns: boolean;
  debitBeforeCredit: boolean;
}

interface RejectedBlock {
  startLine: number;
  reason: string;
  sample: string;
}

interface PickedAmount {
  candidate: AmountCandidate;
  role?: "debit" | "credit";
}

export class StatementParseError extends Error {
  readonly details: PdfParseDiagnostics;

  constructor(message: string, details: PdfParseDiagnostics) {
    super(message);
    this.name = "StatementParseError";
    this.details = details;
  }
}

const DATE_PATTERN = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g;
const AMOUNT_PATTERN = /(?<![\p{L}\d.,/])[-+]?\s*(?:\u20ba\s*)?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.]\d{2})(?:\s*(?:TL|TRY|\u20ba))?(?![\d.,])/giu;

function maskSensitiveData(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g, "****")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "**** **** **** ****")
    .replace(/\b\d{8,12}\b/g, (m) => m.slice(0, 4) + "****")
    .replace(/IBAN[:\s]*[A-Z]{2}\d{2}[\w\s]{10,30}/gi, "IBAN: ****")
    .trim();
}

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/\u011f/g, "g")
    .replace(/\u015f/g, "s")
    .replace(/\u00e7/g, "c")
    .replace(/\u00f6/g, "o")
    .replace(/\u00fc/g, "u");
}

function parseDate(raw: string): string | null {
  const token = raw.match(DATE_PATTERN)?.[0]?.trim();
  if (!token) return null;

  const ymd = token.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) return buildIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const dmy = token.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const year = normalizeYear(Number(dmy[3]));
    return buildIsoDate(year, Number(dmy[2]), Number(dmy[1]));
  }

  return null;
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSignedAmount(raw: string | number): number {
  if (typeof raw === "number") return raw;

  let value = String(raw)
    .replace(/\u00a0/g, " ")
    .replace(/TL|TRY/gi, "")
    .replace(/\u20ba/g, "")
    .trim();

  const isNegative = value.includes("(") || /^\s*-/.test(value);
  value = value.replace(/[()+-]/g, "").replace(/\s+/g, "");

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? "," : ".";

  const normalized =
    decimalSeparator === ","
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");

  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return 0;
  return isNegative ? -parsed : parsed;
}

function parseAmount(raw: string | number): number {
  return Math.abs(parseSignedAmount(raw));
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function detectType(amount: string | number, typeHint?: string): "debit" | "credit" {
  const hint = normalizeForMatching(`${typeHint ?? ""} ${typeof amount === "string" ? amount : ""}`);

  if (includesAny(hint, ["credit", "income", "alacak", "gelen", "yatan", "maas", "iade", "refund"])) {
    return "credit";
  }

  if (includesAny(hint, ["debit", "out", "expense", "borc", "giden", "cekilen", "odeme", "harcama", "alisveris"])) {
    return "debit";
  }

  if (typeof amount === "string") {
    const trimmed = amount.replace(/TL|TRY|\u20ba/gi, "").trim();
    if (trimmed.startsWith("-") || trimmed.startsWith("(")) return "debit";
    if (trimmed.startsWith("+")) return "credit";
  }

  return "debit";
}

function normalizeRows(rows: Record<string, string>[]): ParsedTransaction[] {
  if (rows.length === 0) return [];

  const keys = Object.keys(rows[0]).map((k) => normalizeForMatching(k.trim()));

  const dateKey = keys.find((k) => k.includes("date") || k.includes("tarih") || k === "dt") ?? keys[0];
  const descKey = keys.find((k) =>
    k.includes("description") || k.includes("narration") || k.includes("merchant") ||
    k.includes("details") || k.includes("particulars") || k.includes("memo") || k.includes("reference") ||
    k.includes("aciklama") || k.includes("islem")
  ) ?? keys[1];
  const amountKey = keys.find((k) =>
    k === "amount" || k === "value" || k === "debit" || k === "credit" ||
    k.includes("amount") || k.includes("sum") || k.includes("tutar") || k.includes("borc") || k.includes("alacak")
  ) ?? keys[2];
  const typeKey = keys.find((k) => k === "type" || k === "dr/cr" || k === "debit/credit" || k.includes("transaction type") || k.includes("islem tipi"));
  const creditKey = keys.find((k) => k === "credit" || k === "credits" || k.includes("credit amount") || k.includes("alacak"));
  const debitKey = keys.find((k) => k === "debit" || k === "debits" || k.includes("debit amount") || k.includes("borc"));

  const results: ParsedTransaction[] = [];

  for (const row of rows) {
    const rawKeys = Object.keys(row);
    const get = (key: string): string => {
      const found = rawKeys.find((k) => normalizeForMatching(k.trim()) === key);
      return found ? String(row[found] ?? "").trim() : "";
    };

    const rawDate = get(dateKey);
    const date = parseDate(rawDate);
    if (!date) continue;

    const rawDesc = get(descKey);
    if (!rawDesc) continue;

    const description = maskSensitiveData(rawDesc);
    const merchant = extractMerchant(description);

    let amount = 0;
    let type: "debit" | "credit" = "debit";

    if (creditKey && debitKey) {
      const creditVal = get(creditKey);
      const debitVal = get(debitKey);
      if (creditVal && parseAmount(creditVal) > 0) {
        amount = parseAmount(creditVal);
        type = "credit";
      } else if (debitVal) {
        amount = parseAmount(debitVal);
        type = "debit";
      }
    } else {
      const rawAmount = get(amountKey);
      amount = parseAmount(rawAmount);
      const rawType = typeKey ? get(typeKey) : "";
      type = detectType(rawAmount, rawType);
    }

    if (amount === 0) continue;

    results.push({ date, merchant, description, amount, type });
  }

  return results;
}

export async function parseCsv(filePath: string): Promise<ParsedTransaction[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return normalizeRows(result.data);
}

export async function parseExcel(filePath: string): Promise<ParsedTransaction[]> {
  const content = await fs.readFile(filePath);
  const workbook = XLSX.read(content, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  return normalizeRows(rows);
}

export async function parsePdf(filePath: string, options: PdfParseOptions = {}): Promise<ParsedTransaction[]> {
  const buffer = await fs.readFile(filePath);
  const { PDFParse } = (await import("pdf-parse" as string)) as {
    PDFParse: new (params: { data: Buffer }) => {
      getText: () => Promise<{ text: string }>;
      destroy: () => Promise<void>;
    };
  };

  const parser = new PDFParse({ data: buffer });
  let rawText = "";

  try {
    const data = await parser.getText();
    rawText = data.text ?? "";
  } finally {
    await parser.destroy().catch(() => {});
  }

  const lines = splitPdfLines(rawText);
  let debugTextPath = options.debugTextPath;

  if (options.debug) {
    debugTextPath = await writePdfDebugText(rawText, options.debugDir);
    options.logger?.info(
      {
        debugTextPath,
        lineCount: lines.length,
        first100Lines: lines.slice(0, 100),
      },
      "PDF parse debug: extracted selectable text",
    );
  }

  try {
    return parsePdfText(rawText, { ...options, debugTextPath });
  } catch (err) {
    if (err instanceof StatementParseError) {
      options.logger?.warn({ details: err.details }, "PDF parse diagnostics: no transaction rows matched");
    }
    throw err;
  }
}

export function parsePdfText(rawText: string, options: PdfParseOptions = {}): ParsedTransaction[] {
  const lines = splitPdfLines(rawText);

  if (rawText.trim().length === 0) {
    throw new StatementParseError(
      "PDF text extraction returned no selectable text.",
      buildPdfDiagnostics(lines, [], [], options.debugTextPath, "No selectable text was extracted from the PDF."),
    );
  }

  const parseResult = parseStatementText(rawText);
  const transactions = parseResult.transactions.map(toParsedTransaction);

  if (transactions.length === 0) {
    const blocks = buildTransactionBlocks(lines);
    throw new StatementParseError(
      "PDF text extracted successfully but no transaction rows matched.",
      buildPdfDiagnostics(lines, blocks, [], options.debugTextPath),
    );
  }

  return transactions;
}

function toParsedTransaction(transaction: NormalizedTransaction): ParsedTransaction {
  return {
    date: transaction.date,
    merchant: transaction.merchant,
    description: transaction.description,
    amount: transaction.amount,
    type: transaction.transactionType,
    currency: transaction.currency,
    transactionType: transaction.transactionType,
    balance: transaction.balance,
    category: transaction.category,
    parser: transaction.parser,
    confidence: transaction.confidence,
  };
}

function splitPdfLines(rawText: string): string[] {
  return rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findDateTokens(text: string): string[] {
  return Array.from(text.matchAll(DATE_PATTERN), (match) => match[0]);
}

function extractAmountCandidates(text: string): AmountCandidate[] {
  return Array.from(text.matchAll(AMOUNT_PATTERN), (match) => ({
    raw: match[0],
    value: parseSignedAmount(match[0]),
    index: match.index ?? 0,
    currency: detectAmountCurrency(text, match[0], match.index ?? 0),
  }));
}

function detectAmountCurrency(
  text: string,
  raw: string,
  index: number,
): AmountCandidate["currency"] {
  const end = index + raw.length;
  const aroundAmount = `${text.slice(Math.max(0, index - 2), index)}${raw}${text.slice(end, end + 8)}`;

  if (/(?:TL|TRY|\u20ba)/i.test(aroundAmount)) return "TRY";
  if (/\b(?:USD|EUR|GBP)\b/i.test(text.slice(end, end + 8))) return "FOREIGN";

  return undefined;
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

function parsePdfTransactionBlock(
  block: TransactionBlock,
  layout: ColumnLayout,
): { transaction: ParsedTransaction } | RejectedBlock {
  const blockText = block.lines.join(" ");
  const dateToken = findDateTokens(blockText)[0];
  const date = dateToken ? parseDate(dateToken) : null;

  if (!date) return rejectBlock(block, "invalid_or_missing_date");

  const amounts = extractAmountCandidates(blockText);
  if (amounts.length === 0) return rejectBlock(block, "missing_amount");

  const picked = pickTransactionAmount(amounts, layout);
  if (!picked) return rejectBlock(block, "only_zero_or_balance_amounts");

  const description = buildPdfDescription(blockText);
  if (!description) return rejectBlock(block, "missing_description");

  const type = picked.role ?? detectType(picked.candidate.raw, description);
  const amount = Math.abs(picked.candidate.value);

  if (amount === 0) return rejectBlock(block, "zero_amount");

  return {
    transaction: {
      date,
      merchant: extractMerchant(description),
      description,
      amount,
      type,
    },
  };
}

function rejectBlock(block: TransactionBlock, reason: string): RejectedBlock {
  return {
    startLine: block.startLine,
    reason,
    sample: block.lines.join(" ").slice(0, 240),
  };
}

function pickTransactionAmount(
  candidates: AmountCandidate[],
  layout: ColumnLayout,
): PickedAmount | null {
  const hasLikelyBalance = layout.hasBalanceColumn;
  const dataCandidates = hasLikelyBalance && candidates.length > 1
    ? candidates.slice(0, -1)
    : candidates;

  if (layout.hasDebitCreditColumns && dataCandidates.length >= 2) {
    const debitCandidate = layout.debitBeforeCredit ? dataCandidates[0] : dataCandidates[1];
    const creditCandidate = layout.debitBeforeCredit ? dataCandidates[1] : dataCandidates[0];

    if (Math.abs(debitCandidate.value) > 0) return { candidate: debitCandidate, role: "debit" };
    if (Math.abs(creditCandidate.value) > 0) return { candidate: creditCandidate, role: "credit" };
  }

  const signed = dataCandidates.find((candidate) => {
    const raw = candidate.raw.replace(/TL|TRY|\u20ba/gi, "").trim();
    return raw.startsWith("-") || raw.startsWith("+") || raw.startsWith("(");
  });

  if (signed && Math.abs(signed.value) > 0) {
    return { candidate: signed, role: signed.value < 0 ? "debit" : "credit" };
  }

  const localCurrencyCandidates = dataCandidates.filter(
    (candidate) => candidate.currency === "TRY" && Math.abs(candidate.value) > 0,
  );

  if (localCurrencyCandidates.length > 0) {
    return { candidate: localCurrencyCandidates[localCurrencyCandidates.length - 1] };
  }

  const nonZeroCandidates = dataCandidates.filter((candidate) => Math.abs(candidate.value) > 0);
  if (nonZeroCandidates.length > 0) return { candidate: nonZeroCandidates[nonZeroCandidates.length - 1] };

  return null;
}

function buildPdfDescription(blockText: string): string {
  const withoutDateOrAmounts = blockText
    .replace(DATE_PATTERN, " ")
    .replace(AMOUNT_PATTERN, " ")
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/\b(?:islem|i\u015flem|tarih|tarihi|aciklama|a\u00e7\u0131klama|borc|bor\u00e7|alacak|bakiye|debit|credit|balance|amount|tutar|tl|try|usd|eur|gbp)\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s*$/g, "")
    .trim();

  return maskSensitiveData(withoutDateOrAmounts || "Transaction");
}

function extractMerchant(description: string): string {
  const commonWords = new Set([
    "islem",
    "tarih",
    "tarihi",
    "aciklama",
    "borc",
    "alacak",
    "bakiye",
    "tutar",
    "transaction",
  ]);

  const words = description
    .split(/\s+/)
    .filter((word) => word && !commonWords.has(normalizeForMatching(word)));

  return words.slice(0, 4).join(" ") || "Transaction";
}

function buildPdfDiagnostics(
  lines: string[],
  blocks: TransactionBlock[],
  rejectedBlocks: RejectedBlock[],
  debugTextPath?: string,
  overrideReason?: string,
): PdfParseDiagnostics {
  const possibleDateLines = findDiagnosticLines(lines, (line) => findDateTokens(line).length > 0);
  const possibleAmountLines = findDiagnosticLines(lines, (line) => extractAmountCandidates(line).length > 0);
  const possibleTransactionLineCandidates = findDiagnosticLines(
    lines,
    (line) => findDateTokens(line).length > 0 && extractAmountCandidates(line).length > 0,
  );
  const rejectedBlockSummary = summarizeRejectedBlocks(rejectedBlocks);

  return {
    reason: overrideReason ?? "PDF text extracted successfully but no transaction rows matched.",
    textExtractedSuccessfully: lines.length > 0,
    lineCount: lines.length,
    transactionBlockCount: blocks.length,
    matchedTransactionCount: 0,
    possibleDateLines,
    possibleAmountLines,
    possibleTransactionLineCandidates,
    rejectedBlockSummary,
    suggestedBankFormatIssue: suggestBankFormatIssue(possibleDateLines, possibleAmountLines, possibleTransactionLineCandidates, rejectedBlockSummary),
    ...(debugTextPath ? { debugTextPath } : {}),
  };
}

function findDiagnosticLines(
  lines: string[],
  predicate: (line: string) => boolean,
): PdfDiagnosticLine[] {
  return lines
    .map((line, index) => ({ lineNumber: index + 1, text: line }))
    .filter((line) => predicate(line.text))
    .slice(0, 25);
}

function summarizeRejectedBlocks(rejectedBlocks: RejectedBlock[]): Record<string, number> {
  return rejectedBlocks.reduce<Record<string, number>>((summary, block) => {
    summary[block.reason] = (summary[block.reason] ?? 0) + 1;
    return summary;
  }, {});
}

function suggestBankFormatIssue(
  dateLines: PdfDiagnosticLine[],
  amountLines: PdfDiagnosticLine[],
  transactionLineCandidates: PdfDiagnosticLine[],
  rejectedSummary: Record<string, number>,
): string {
  if (dateLines.length === 0) {
    return "No supported transaction date pattern was detected. Expected dates like 01.06.2026, 01/06/2026, or 2026-06-01.";
  }

  if (amountLines.length === 0) {
    return "Dates were detected, but no supported money values were found. Check whether the bank exports amounts without decimal cents or with a custom currency layout.";
  }

  if (transactionLineCandidates.length === 0) {
    return "Dates and amounts were detected on separate lines. The parser grouped continuation lines, but no grouped block produced a valid transaction amount; check the bank's debit/credit/balance column order.";
  }

  if ((rejectedSummary.only_zero_or_balance_amounts ?? 0) > 0) {
    return "Candidate rows looked like balance-only rows or debit/credit columns containing zeroes. Check whether the transaction amount appears after the balance column or uses a bank-specific column order.";
  }

  return "Date and amount-like lines were detected, but no transaction row could be selected. This likely needs a bank-specific layout rule for debit, credit, and balance columns.";
}

async function writePdfDebugText(rawText: string, debugDir = os.tmpdir()): Promise<string> {
  await fs.mkdir(debugDir, { recursive: true });
  const filePath = path.join(
    debugDir,
    `financeanalyzerpro-pdf-debug-${Date.now()}-${crypto.randomUUID()}.txt`,
  );
  await fs.writeFile(filePath, rawText, "utf-8");
  return filePath;
}
