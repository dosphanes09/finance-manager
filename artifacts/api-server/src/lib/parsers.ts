import path from "path";
import fs from "fs/promises";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedTransaction {
  date: string;
  merchant: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
}

function maskSensitiveData(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/g, "****")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "**** **** **** ****")
    .replace(/\b\d{8,12}\b/g, (m) => m.slice(0, 4) + "****")
    .replace(/IBAN[:\s]*[A-Z]{2}\d{2}[\w\s]{10,30}/gi, "IBAN: ****")
    .trim();
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  raw = raw.trim();
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{2})-(\d{2})-(\d{4})$/,
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
  ];
  for (const fmt of formats) {
    const m = raw.match(fmt);
    if (m) {
      if (fmt === formats[0]) return `${m[1]}-${m[2]}-${m[3]}`;
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return null;
}

function parseAmount(raw: string | number): number {
  if (typeof raw === "number") return Math.abs(raw);
  const cleaned = String(raw).replace(/[^0-9.,\-]/g, "").replace(",", ".");
  return Math.abs(parseFloat(cleaned) || 0);
}

function detectType(amount: string | number, typeHint?: string): "debit" | "credit" {
  if (typeHint) {
    const t = String(typeHint).toLowerCase();
    if (t.includes("credit") || t.includes("in") || t.includes("income")) return "credit";
    if (t.includes("debit") || t.includes("out") || t.includes("expense")) return "debit";
  }
  const num = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/[^0-9.\-]/g, ""));
  return num < 0 ? "credit" : "debit";
}

function normalizeRows(rows: Record<string, string>[]): ParsedTransaction[] {
  if (rows.length === 0) return [];

  const keys = Object.keys(rows[0]).map((k) => k.trim().toLowerCase());

  const dateKey = keys.find((k) => k.includes("date") || k === "dt") ?? keys[0];
  const descKey = keys.find((k) =>
    k.includes("description") || k.includes("narration") || k.includes("merchant") ||
    k.includes("details") || k.includes("particulars") || k.includes("memo") || k.includes("reference")
  ) ?? keys[1];
  const amountKey = keys.find((k) =>
    k === "amount" || k === "value" || k === "debit" || k === "credit" ||
    k.includes("amount") || k.includes("sum")
  ) ?? keys[2];
  const typeKey = keys.find((k) => k === "type" || k === "dr/cr" || k === "debit/credit" || k.includes("transaction type"));
  const creditKey = keys.find((k) => k === "credit" || k === "credits" || k.includes("credit amount"));
  const debitKey = keys.find((k) => k === "debit" || k === "debits" || k.includes("debit amount"));

  const results: ParsedTransaction[] = [];

  for (const row of rows) {
    const rawKeys = Object.keys(row);
    const get = (key: string): string => {
      const found = rawKeys.find((k) => k.trim().toLowerCase() === key);
      return found ? String(row[found] ?? "").trim() : "";
    };

    const rawDate = get(dateKey);
    const date = parseDate(rawDate);
    if (!date) continue;

    const rawDesc = get(descKey);
    if (!rawDesc) continue;

    const description = maskSensitiveData(rawDesc);
    const merchant = description.split(/\s+/).slice(0, 4).join(" ");

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

export async function parsePdf(filePath: string): Promise<ParsedTransaction[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfParse: (buf: Buffer) => Promise<{ text: string }> = (await import("pdf-parse" as string)) as any;
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  const lines = data.text.split("\n").map((l: string) => l.trim()).filter(Boolean);

  const transactions: ParsedTransaction[] = [];
  const datePattern = /\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}|\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2})\b/;
  const amountPattern = /[-+]?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})/g;

  for (const line of lines) {
    const dateMatch = line.match(datePattern);
    if (!dateMatch) continue;
    const date = parseDate(dateMatch[0]);
    if (!date) continue;

    const amounts = line.match(amountPattern);
    if (!amounts || amounts.length === 0) continue;

    const rawAmount = amounts[amounts.length - 1];
    const amount = parseAmount(rawAmount);
    if (amount === 0) continue;

    const descPart = line.replace(dateMatch[0], "").replace(amountPattern, "").trim();
    const description = maskSensitiveData(descPart || "Transaction");
    const merchant = description.split(/\s+/).slice(0, 4).join(" ");
    const type = line.includes("-") ? "debit" : "credit";

    transactions.push({ date, merchant, description, amount, type });
  }

  return transactions;
}
