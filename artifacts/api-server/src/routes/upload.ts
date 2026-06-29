import crypto from "crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { categorizationRulesTable, db, transactionsTable } from "@workspace/db";
import { normalizeCategoryId } from "@workspace/finance-categories";
import {
  parseCsv,
  parseExcel,
  parsePdf,
  type ParsedTransaction,
  StatementParseError,
  type PdfParseOptions,
} from "../lib/parsers";
import { type CustomRule } from "../lib/categorizer";
import { categorizeForImport } from "../lib/import-categorization";
import {
  loadMerchantMemory,
  rememberMerchantsFromTransactions,
} from "../lib/merchant-memory";
import {
  UploadStatementResponse,
  PreviewStatementResponse,
  ConfirmUploadBody,
} from "@workspace/api-zod";
import { desc, inArray } from "drizzle-orm";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  safeDeleteUpload,
  sanitizeStoredText,
  UploadValidationError,
  validateUploadContent,
  validateUploadMetadata,
  type SupportedUploadExtension,
} from "../lib/upload-security";
import {
  formatUploadDbDevError,
  getUploadDbErrorDiagnostic,
  getUploadDbErrorLogFields,
  isDatabaseConnectionError,
  isDevelopmentEnvironment,
} from "../lib/upload-db-errors";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = path.resolve(workspaceRoot, ".local/uploads");
const uploadRateLimitWindowMs = parsePositiveInteger(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS, 60_000);
const uploadRateLimitMax = parsePositiveInteger(process.env.UPLOAD_RATE_LIMIT_MAX, 8);

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `upload-${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    try {
      validateUploadMetadata(file);
      cb(null, true);
    } catch (err) {
      cb(err instanceof Error ? err : new Error("Invalid upload"));
    }
  },
});

const router: IRouter = Router();
const uploadRateLimit = createUploadRateLimit(uploadRateLimitWindowMs, uploadRateLimitMax);
const statementUpload = createStatementUploadMiddleware();

async function parseFile(filePath: string, ext: SupportedUploadExtension, options: PdfParseOptions = {}) {
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
  if (err instanceof UploadValidationError) {
    return { error: err.message };
  }

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

  if (isDatabaseQueryError(err)) {
    return {
      error: fallback,
      details: isDevelopmentEnvironment()
        ? {
            reason: "Database query failed while processing the upload.",
            database: getUploadDbErrorDiagnostic(err),
          }
        : undefined,
    };
  }

  return { error: fallback };
}

function logParseFailure(
  req: Request,
  err: unknown,
  message: string,
) {
  if (err instanceof UploadValidationError) {
    req.log.warn({ error: err.message, statusCode: err.statusCode }, message);
    return;
  }

  if (err instanceof StatementParseError) {
    req.log.warn({ details: err.details }, message);
    return;
  }

  req.log.error({ error: sanitizeErrorForLog(err) }, message);
}

function isDatabaseQueryError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const diagnostic = getUploadDbErrorDiagnostic(err);
  return Boolean(diagnostic.code) || err.message.includes("Failed query");
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
    log?.warn(getUploadDbErrorLogFields(err), "Duplicate detection query failed during upload preview");
    const errors = [
      "Duplicate detection was skipped because the database query failed. Parsed transactions are shown as new.",
    ];
    if (isDevelopmentEnvironment()) {
      errors.push(formatUploadDbDevError("Duplicate detection database diagnostic:", err));
    }

    return {
      existingKeys: new Set<string>(),
      errors,
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
    log?.warn(getUploadDbErrorLogFields(err), "Custom categorization rules query failed; falling back to built-in categorization");
    return [];
  }
}

async function loadMerchantMemoryForUpload(
  parsed: ParsedTransaction[],
  log?: Request["log"],
) {
  try {
    return {
      merchantMemory: await loadMerchantMemory(parsed),
      errors: [] as string[],
    };
  } catch (err) {
    log?.warn(getUploadDbErrorLogFields(err), "Merchant memory query failed during upload preview");
    const errors = [
      "Merchant memory was unavailable; continuing with deterministic categorization rules.",
    ];
    if (isDevelopmentEnvironment()) {
      errors.push(formatUploadDbDevError("Merchant memory database diagnostic:", err));
    }

    return {
      merchantMemory: new Map(),
      errors,
    };
  }
}

router.post("/upload/preview", uploadRateLimit, statementUpload, async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const filePath = file.path;

  try {
    const ext = validateUploadMetadata(file);
    const pdfOptions: PdfParseOptions = { debug: shouldDebugPdf(req, ext), logger: req.log };
    await validateUploadContent(filePath, ext);
    const parsed = await parseFile(filePath, ext, pdfOptions);

    if (parsed.length === 0) {
      res.status(400).json({ error: "No transactions could be parsed from this file. Please check the format." });
      return;
    }

    const [customRules, merchantMemoryResult] = await Promise.all([
      loadCustomRules(req.log),
      loadMerchantMemoryForUpload(parsed, req.log),
    ]);
    const merchantMemory = merchantMemoryResult.merchantMemory;

    const previewWithoutDuplicateFlags = await Promise.all(parsed.map(async (t) => {
      const merchant = sanitizeStoredText(t.merchant);
      const description = sanitizeStoredText(t.description);
      const sanitizedTransaction = { ...t, merchant, description };
      const categorization = await categorizeForImport(sanitizedTransaction, customRules, merchantMemory);

      return {
        date: t.date,
        merchant: sanitizeStoredText(categorization.merchant),
        description,
        amount: t.amount,
        type: t.type,
        currency: t.currency ?? "TRY",
        transactionType: t.transactionType ?? t.type,
        transactionKind: t.transactionKind ?? "other",
        balance: t.balance ?? null,
        category: normalizeCategoryId(categorization.category),
        bank: t.bank ?? "generic",
        parser: t.parser ?? "generic",
        confidence: t.confidence ?? categorization.confidence,
        categorizationConfidence: categorization.confidence,
        categorizationSource: categorization.source,
        categorizationExplanation: categorization.explanation,
        month: t.date.substring(0, 7),
      };
    }));

    const duplicateDetection = await detectDuplicates(previewWithoutDuplicateFlags, req.log);
    const existingKeys = duplicateDetection.existingKeys;
    const preview = previewWithoutDuplicateFlags.map((t) => ({
      ...t,
      isDuplicate: existingKeys.has(`${t.date}|${t.merchant.toLowerCase()}|${t.amount.toFixed(2)}`),
    }));

    const duplicateCount = preview.filter((p) => p.isDuplicate).length;

    res.json(
      PreviewStatementResponse.parse({
        transactions: preview,
        duplicateCount,
        errors: [...merchantMemoryResult.errors, ...duplicateDetection.errors],
      })
    );
  } catch (err) {
    logParseFailure(req, err, "Failed to parse statement for preview");
    res.status(err instanceof UploadValidationError ? err.statusCode : 400).json(parseErrorPayload(err, "Failed to parse file. Please ensure it is a valid bank statement."));
  } finally {
    await safeDeleteUpload(uploadsDir, filePath).catch((err) => req.log.warn({ error: sanitizeErrorForLog(err) }, "Failed to clean uploaded file"));
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
      merchant: sanitizeStoredText(t.merchant),
      description: sanitizeStoredText(t.description),
      amount: String(t.amount),
      type: t.type,
      currency: t.currency ?? "TRY",
      transactionKind: t.transactionKind ?? "other",
      bank: t.bank ?? "generic",
      parser: t.parser ?? null,
      balance: t.balance === null || t.balance === undefined ? null : String(t.balance),
      category: normalizeCategoryId(t.category),
      categorizationConfidence: String(t.categorizationConfidence ?? 1),
      categorizationSource: t.categorizationSource ?? "user_preview",
      categorizationExplanation: t.categorizationExplanation ?? "Category accepted from upload preview.",
      importConfidence: String(t.confidence ?? t.categorizationConfidence ?? 0),
      month: t.month,
    }));

    const inserted = await db.insert(transactionsTable).values(toInsert).returning();
    await rememberSavedMerchants(inserted, req.log, "import");

    res.json(
      UploadStatementResponse.parse({
        count: inserted.length,
        skipped: body.data.transactions.length - inserted.length,
        transactions: inserted.map(serializeUploadedTransaction),
      })
    );
  } catch (err) {
    req.log.error({ error: sanitizeErrorForLog(err) }, "Failed to confirm upload");
    res.status(500).json(parseErrorPayload(err, "Failed to save transactions."));
  }
});

router.post("/upload", uploadRateLimit, statementUpload, async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const filePath = file.path;

  try {
    const ext = validateUploadMetadata(file);
    const pdfOptions: PdfParseOptions = { debug: shouldDebugPdf(req, ext), logger: req.log };
    await validateUploadContent(filePath, ext);
    const parsed = await parseFile(filePath, ext, pdfOptions);

    if (parsed.length === 0) {
      res.status(400).json({ error: "No transactions could be parsed from this file. Please check the format." });
      return;
    }

    const [customRules, merchantMemoryResult] = await Promise.all([
      loadCustomRules(req.log),
      loadMerchantMemoryForUpload(parsed, req.log),
    ]);
    const merchantMemory = merchantMemoryResult.merchantMemory;

    const categorized = await Promise.all(parsed.map(async (t) => {
      const merchant = sanitizeStoredText(t.merchant);
      const description = sanitizeStoredText(t.description);
      const sanitizedTransaction = { ...t, merchant, description };
      const categorization = await categorizeForImport(sanitizedTransaction, customRules, merchantMemory);

      return {
        date: t.date,
        merchant: sanitizeStoredText(categorization.merchant),
        description,
        amount: String(t.amount),
        type: t.type,
        currency: t.currency ?? "TRY",
        transactionKind: t.transactionKind ?? "other",
        bank: t.bank ?? "generic",
        parser: t.parser ?? null,
        balance: t.balance === null || t.balance === undefined ? null : String(t.balance),
        category: normalizeCategoryId(categorization.category),
        categorizationConfidence: String(categorization.confidence),
        categorizationSource: categorization.source,
        categorizationExplanation: categorization.explanation,
        importConfidence: String(t.confidence ?? categorization.confidence),
        month: t.date.substring(0, 7),
      };
    }));

    const inserted = await db.insert(transactionsTable).values(categorized).returning();
    await rememberSavedMerchants(inserted, req.log, "import");

    res.json(
      UploadStatementResponse.parse({
        count: inserted.length,
        skipped: parsed.length - inserted.length,
        transactions: inserted.map(serializeUploadedTransaction),
      })
    );
  } catch (err) {
    logParseFailure(req, err, "Failed to parse statement");
    res.status(err instanceof UploadValidationError ? err.statusCode : 400).json(parseErrorPayload(err, "Failed to parse file. Please ensure it is a valid bank statement."));
  } finally {
    await safeDeleteUpload(uploadsDir, filePath).catch((err) => req.log.warn({ error: sanitizeErrorForLog(err) }, "Failed to clean uploaded file"));
  }
});

export default router;

function createStatementUploadMiddleware() {
  const single = upload.single("file");

  return (req: Request, res: Response, next: NextFunction) => {
    single(req, res, (err) => {
      if (!err) {
        next();
        return;
      }

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: `File is too large. Maximum size is ${MAX_UPLOAD_MB} MB.` });
        return;
      }

      if (err instanceof UploadValidationError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }

      req.log.warn({ error: sanitizeErrorForLog(err) }, "Rejected uploaded file");
      res.status(400).json({ error: "Invalid uploaded file." });
    });
  };
}

function createUploadRateLimit(windowMs: number, maxRequests: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many upload requests. Please wait and try again." });
      return;
    }

    next();
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeErrorForLog(err: unknown) {
  if (isDatabaseConnectionError(err) || isDatabaseQueryError(err)) {
    return getUploadDbErrorDiagnostic(err);
  }

  if (!(err instanceof Error)) return { message: String(err) };

  return {
    name: err.name,
    message: err.message,
    code: typeof err === "object" && "code" in err ? String(err.code) : undefined,
  };
}

function serializeUploadedTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    ...t,
    category: normalizeCategoryId(t.category),
    amount: parseFloat(t.amount),
    balance: t.balance === null ? null : parseFloat(t.balance),
    categorizationConfidence: parseFloat(t.categorizationConfidence),
    importConfidence: parseFloat(t.importConfidence),
    createdAt: t.createdAt.toISOString(),
  };
}

async function rememberSavedMerchants(
  transactions: Array<typeof transactionsTable.$inferSelect>,
  log?: Request["log"],
  source: "import" | "user_correction" | "custom_rule" = "import",
): Promise<void> {
  await rememberMerchantsFromTransactions(
    transactions.map((transaction) => ({
      merchant: transaction.merchant,
      description: transaction.description,
      category: transaction.category,
      confidence: Number(transaction.categorizationConfidence || transaction.importConfidence || 0),
    })),
    source,
  ).catch((err) => {
    log?.warn({ error: sanitizeErrorForLog(err) }, "Failed to update merchant memory");
  });
}
