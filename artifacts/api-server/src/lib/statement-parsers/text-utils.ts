import type { TransactionKind, TransactionType } from "./types";

export interface AmountCandidate {
  raw: string;
  value: number;
  absValue: number;
  index: number;
  end: number;
  currency?: string;
  hasExplicitSign: boolean;
}

export const DATE_PATTERN = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g;
export const AMOUNT_PATTERN = /(?<![\p{L}\d.,/])[-+]?\s*(?:\u20ba\s*)?(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.]\d{2})(?:\s*(?:TL|TRY|USD|EUR|GBP|\u20ba))?\+?(?![\d.,])/giu;

export function splitPdfLines(rawText: string): string[] {
  return rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function normalizeForMatching(value: string): string {
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

export function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function parseDate(raw: string): string | null {
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

export function findDateTokens(text: string): string[] {
  return Array.from(text.matchAll(DATE_PATTERN), (match) => match[0]);
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

export function parseSignedAmount(raw: string | number): number {
  if (typeof raw === "number") return raw;

  let value = String(raw)
    .replace(/\u00a0/g, " ")
    .replace(/TL|TRY|USD|EUR|GBP/gi, "")
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

export function parseAmount(raw: string | number): number {
  return Math.abs(parseSignedAmount(raw));
}

export function extractAmountCandidates(text: string): AmountCandidate[] {
  return Array.from(text.matchAll(AMOUNT_PATTERN), (match) => {
    const raw = match[0];
    const index = match.index ?? 0;
    const value = parseSignedAmount(raw);
    return {
      raw,
      value,
      absValue: Math.abs(value),
      index,
      end: index + raw.length,
      currency: detectAmountCurrency(text, raw, index),
      hasExplicitSign: hasExplicitAmountSign(raw),
    };
  });
}

export function detectTransactionTypeFromAmount(raw: string): TransactionType {
  const normalized = raw.replace(/TL|TRY|USD|EUR|GBP|\u20ba/gi, "").trim();
  if (normalized.startsWith("-") || normalized.startsWith("(")) return "credit";
  if (normalized.endsWith("+") || normalized.startsWith("+")) return "credit";
  return "debit";
}

function hasExplicitAmountSign(raw: string): boolean {
  const normalized = raw.replace(/TL|TRY|USD|EUR|GBP|\u20ba/gi, "").trim();
  return normalized.startsWith("-") || normalized.startsWith("+") || normalized.endsWith("+") || normalized.startsWith("(");
}

function detectAmountCurrency(
  text: string,
  raw: string,
  index: number,
): string | undefined {
  const end = index + raw.length;
  const aroundAmount = `${text.slice(Math.max(0, index - 2), index)}${raw}${text.slice(end, end + 8)}`;

  if (/(?:TL|TRY|\u20ba)/i.test(aroundAmount)) return "TRY";
  const foreignMatch = text.slice(end, end + 8).match(/\b(USD|EUR|GBP)\b/i);
  if (foreignMatch) return foreignMatch[1].toUpperCase();

  return undefined;
}

export function removeDatesAndAmounts(text: string): string {
  return text
    .replace(DATE_PATTERN, " ")
    .replace(AMOUNT_PATTERN, " ")
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/\b(?:tl|try|usd|eur|gbp)\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s*$/g, "")
    .trim();
}

export function maskSensitiveData(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g, "****")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "**** **** **** ****")
    .replace(/\b\d{8,12}\b/g, (m) => m.slice(0, 4) + "****")
    .replace(/IBAN[:\s]*[A-Z]{2}\d{2}[\w\s]{10,30}/gi, "IBAN: ****")
    .trim();
}

export function removeNoisyTokens(text: string): string {
  return text
    .replace(/\b\d{1,2}[:.]\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\b(?:pos|provizyon|authorization|auth|onay|referans|ref|rrn|stan|batch|terminal|terminal no|uye isyeri|is yeri no|islem no|dekont no|fis no|belge no)\b[:#-]?\s*[A-Z0-9-]{3,}/giu, " ")
    .replace(/\b(?:kart|card|masked|maskeli)\s*(?:no|numarasi|number)?\s*[:#-]?\s*(?:\*{2,}|X{2,}|x{2,})?\d{2,6}\b/giu, " ")
    .replace(/\b(?:\*{2,}|X{2,}|x{2,})\d{2,6}\b/g, " ")
    .replace(/\b[A-Z]{1,4}\d{5,}\b/g, " ")
    .replace(/\bP\d{5,}\b/gi, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\b\d{1,2}\.?\s*tak(?:sit)?\b/gi, " ")
    .replace(/\b(?:islemin|i\u015flemin)\s+\d+\s*\/\s*\d+\s+(?:taksidi|iadesi)\b/gi, " ")
    .replace(/\b\d+\s*\/\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanDescription(text: string): string {
  return maskSensitiveData(
    removeNoisyTokens(removeDatesAndAmounts(text))
      .replace(/\b(?:islem|i\u015flem|tarih|tarihi|aciklama|a\u00e7\u0131klama|borc|bor\u00e7|alacak|bakiye|debit|credit|balance|amount|tutar)\b/gi, " ")
      .replace(/\b\d{1,2}\.?\s*tak\b/gi, " ")
      .replace(/\b(?:islemin|i\u015flemin)\s+\d+\s*\/\s*\d+\s+(?:taksidi|iadesi)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function inferTransactionKind(
  description: string,
  merchant: string,
  direction: TransactionType,
): TransactionKind {
  const normalized = normalizeForMatching(`${merchant} ${description}`);

  if (includesAny(normalized, ["maas", "salary", "payroll", "ucret odemesi"])) return "salary";
  if (includesAny(normalized, ["iade", "refund", "ters ibraz", "chargeback"])) return "refund";
  if (includesAny(normalized, ["fast", "fonlarin anlik", "kolay adres"])) return "fast";
  if (includesAny(normalized, ["eft", "elektronik fon transferi"])) return "eft";
  if (includesAny(normalized, ["atm", "bankamatik"])) {
    return direction === "credit" ? "atm_deposit" : "atm_withdrawal";
  }
  if (includesAny(normalized, ["kredi karti odeme", "kredi karti borc", "kk odeme", "odemetesekkur", "subehesaptan odeme", "odeme enpara.com cep", "enpara.com cep subesi"])) {
    return "credit_card_payment";
  }
  if (includesAny(normalized, ["fatura", "abonelik", "otomatik odeme", "elektrik", "dogalgaz", "su faturasi", "gsm", "internet"])) return "bill";
  if (includesAny(normalized, ["spotify", "netflix", "youtube premium", "apple.com", "google", "amazon prime", "openai", "abonelik"])) return "subscription";
  if (includesAny(normalized, ["hisse", "fon", "repo", "tahvil", "viop", "yatirim", "menkul", "borsa"])) return "investment";
  if (includesAny(normalized, ["komisyon", "masraf", "ucret", "aidat"])) return "fee";
  if (includesAny(normalized, ["faiz", "interest"])) return "interest";
  if (includesAny(normalized, ["cashback", "para puan", "bankkart lira", "bonus", "chip para"])) return "cashback";
  if (includesAny(normalized, ["pos", "sanal pos", "alisveris", "harcama", "market", "restoran", "ticaret"])) return "pos";
  if (includesAny(normalized, ["havale", "virman", "transfer", "gonderen", "alici"])) return "transfer";

  return "other";
}
