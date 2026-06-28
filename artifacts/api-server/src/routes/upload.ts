import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { categorizationRulesTable, db, transactionsTable } from "@workspace/db";
import {
  parseCsv,
  parseExcel,
  parsePdf,
  StatementParseError,
  type PdfParseOptions,
} from "../lib/parsers";
import { categorize, matchCustomRule, type CustomRule } from "../lib/categorizer";
import {
  UploadStatementResponse,
  PreviewStatementResponse,
  ConfirmUploadBody,
} from "@workspace/api-zod";
import { desc, inArray } from "drizzle-orm";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `upload-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".csv", ".xlsx", ".xls", ".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Unsupported file type. Please upload CSV, Excel, or PDF."));
  },
});

const router: IRouter = Router();

async function parseFile(filePath: string, ext: string, options: PdfParseOptions = {}) {
  if (ext === ".csv") return parseCsv(filePath);
  if (ext === ".xlsx" || ext === ".xls") return parseExcel(filePath);
  if (ext === ".pdf") return parsePdf(filePath, options);
  throw new Error("Unsupported file type");
}

function isDebugValue(value: unknown): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return false;
  return ["1", "true", "yes", "pdf"].includes(raw.toLowerCase());
}

function shouldDebugPdf(req: Request, ext: string): boolean {
  if (ext !== ".pdf") return false;

  return (
    process.env.PDF_PARSE_DEBUG === "1" ||
    process.env.PDF_PARSE_DEBUG?.toLowerCase() === "true" ||
    isDebugValue(req.query["debug"]) ||
    isDebugValue(req.query["pdfDebug"]) ||
    isDebugValue(req.headers["x-pdf-debug"])
  );
}

function parseErrorPayload(err: unknown, fallback: string) {
  if (err instanceof StatementParseError) {
    return {
      error: err.message,
      details: err.details,
    };
  }

  if (isDatabaseConnectionError(err)) {
    return {
      error: "Database connection failed. PDF parsing may have succeeded, but duplicate detection or saving requires PostgreSQL.",
      details: {
        reason: "PostgreSQL connection was refused or unavailable.",
        suggestedFix: "Start PostgreSQL, verify DATABASE_URL, then run pnpm --filter @workspace/db run push.",
      },
    };
  }

  return { error: fallback };
}

function isDatabaseConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && "cause" in err ? String(err.cause) : "";
  const text = `${message} ${cause}`;

  return (
    text.includes("ECONNREFUSED") ||
    text.includes("Connection terminated") ||
    text.includes("DATABASE_URL") ||
    text.includes("Failed query")
  );
}

function logParseFailure(
  req: Request,
  err: unknown,
  message: string,
) {
  if (err instanceof StatementParseError) {
    req.log.warn({ details: err.details }, message);
    return;
  }

  req.log.error({ err }, message);
}

async function detectDuplicates(
  candidates: Array<{ date: string; merchant: string; amount: number }>,
  log?: Request["log"],
) {
  if (candidates.length === 0) return { existingKeys: new Set<string>(), errors: [] };

  const dates = [...new Set(candidates.map((c) => c.date))];
  try {
    const existing = await db
      .select({ date: transactionsTable.date, merchant: transactionsTable.merchant, amount: transactionsTable.amount })
      .from(transactionsTable)
      .where(inArray(transactionsTable.date, dates));

    const existingKeys = new Set(
      existing.map((e) => `${e.date}|${e.merchant.toLowerCase()}|${parseFloat(e.amount).toFixed(2)}`)
    );

    return { existingKeys, errors: [] };
  } catch (err) {
    log?.warn({ err }, "Duplicate detection skipped because the database is unavailable");
    return {
      existingKeys: new Set<string>(),
      errors: [
        "Duplicate detection was skipped because the database is unavailable. Parsed transactions are shown as new.",
      ],
    };
  }
}

async function loadCustomRules(log?: Request["log"]): Promise<CustomRule[]> {
  try {
    return await db
      .select({
        pattern: categorizationRulesTable.pattern,
        category: categorizationRulesTable.category,
      })
      .from(categorizationRulesTable)
      .orderBy(desc(categorizationRulesTable.priority), desc(categorizationRulesTable.createdAt));
  } catch (err) {
    log?.warn({ err }, "Custom categorization rules unavailable; falling back to built-in categorization");
    return [];
  }
}

function categorizeImportedTransaction(
  transaction: { merchant: string; description: string; category?: string | null },
  customRules: CustomRule[],
): string {
  return (
    matchCustomRule(transaction.merchant, transaction.description, customRules)?.category ??
    transaction.category ??
    categorize(transaction.merchant, transaction.description)
  );
}

router.post("/upload/preview", upload.single("file"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const filePath = file.path;
  const ext = path.extname(file.originalname).toLowerCase();
  const pdfOptions: PdfParseOptions = { debug: shouldDebugPdf(req, ext), logger: req.log };

  try {
    const parsed = await parseFile(filePath, ext, pdfOptions);

    if (parsed.length === 0) {
      res.status(400).json({ error: "No transactions could be parsed from this file. Please check the format." });
      return;
    }

    const [duplicateDetection, customRules] = await Promise.all([
      detectDuplicates(parsed, req.log),
      loadCustomRules(req.log),
    ]);
    const existingKeys = duplicateDetection.existingKeys;

    const preview = parsed.map((t) => ({
      date: t.date,
      merchant: t.merchant,
      description: t.description,
      amount: t.amount,
      type: t.type,
      currency: t.currency ?? "TRY",
      transactionType: t.transactionType ?? t.type,
      balance: t.balance ?? null,
      category: categorizeImportedTransaction(t, customRules),
      month: t.date.substring(0, 7),
      isDuplicate: existingKeys.has(
        `${t.date}|${t.merchant.toLowerCase()}|${t.amount.toFixed(2)}`
      ),
    }));

    const duplicateCount = preview.filter((p) => p.isDuplicate).length;

    res.json(
      PreviewStatementResponse.parse({ transactions: preview, duplicateCount, errors: duplicateDetection.errors })
    );
  } catch (err) {
    logParseFailure(req, err, "Failed to parse statement for preview");
    res.status(400).json(parseErrorPayload(err, "Failed to parse file. Please ensure it is a valid bank statement."));
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
});

router.post("/upload/confirm", async (req, res): Promise<void> => {
  try {
    const body = ConfirmUploadBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const toSave = body.data.transactions.filter((t) => !t.isDuplicate);

    if (toSave.length === 0) {
      res.json(UploadStatementResponse.parse({ count: 0, transactions: [], skipped: body.data.transactions.length }));
      return;
    }

    const toInsert = toSave.map((t) => ({
      date: t.date,
      merchant: t.merchant,
      description: t.description,
      amount: String(t.amount),
      type: t.type,
      category: t.category,
      month: t.month,
    }));

    const inserted = await db.insert(transactionsTable).values(toInsert).returning();

    res.json(
      UploadStatementResponse.parse({
        count: inserted.length,
        skipped: body.data.transactions.length - inserted.length,
        transactions: inserted.map((t) => ({
          ...t,
          amount: parseFloat(t.amount),
          createdAt: t.createdAt.toISOString(),
        })),
      })
    );
  } catch (err) {
    req.log.error({ err }, "Failed to confirm upload");
    res.status(500).json(parseErrorPayload(err, "Failed to save transactions."));
  }
});

router.post("/upload", upload.single("file"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const filePath = file.path;
  const ext = path.extname(file.originalname).toLowerCase();
  const pdfOptions: PdfParseOptions = { debug: shouldDebugPdf(req, ext), logger: req.log };

  try {
    const parsed = await parseFile(filePath, ext, pdfOptions);

    if (parsed.length === 0) {
      res.status(400).json({ error: "No transactions could be parsed from this file. Please check the format." });
      return;
    }

    const customRules = await loadCustomRules(req.log);
    const toInsert = parsed.map((t) => ({
      date: t.date,
      merchant: t.merchant,
      description: t.description,
      amount: String(t.amount),
      type: t.type,
      category: categorizeImportedTransaction(t, customRules),
      month: t.date.substring(0, 7),
    }));

    const inserted = await db.insert(transactionsTable).values(toInsert).returning();

    res.json(
      UploadStatementResponse.parse({
        count: inserted.length,
        skipped: parsed.length - inserted.length,
        transactions: inserted.map((t) => ({
          ...t,
          amount: parseFloat(t.amount),
          createdAt: t.createdAt.toISOString(),
        })),
      })
    );
  } catch (err) {
    logParseFailure(req, err, "Failed to parse statement");
    res.status(400).json(parseErrorPayload(err, "Failed to parse file. Please ensure it is a valid bank statement."));
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
});

export default router;
