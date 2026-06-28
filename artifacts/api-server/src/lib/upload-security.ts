import fs from "fs/promises";
import path from "path";
import { maskSensitiveData } from "./statement-parsers/text-utils";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

export type SupportedUploadExtension = ".csv" | ".xlsx" | ".xls" | ".pdf";

type UploadMetadata = {
  originalname: string;
  mimetype: string;
};

const ALLOWED_MIMES: Record<SupportedUploadExtension, Set<string>> = {
  ".pdf": new Set(["application/pdf"]),
  ".csv": new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"]),
  ".xlsx": new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ]),
  ".xls": new Set(["application/vnd.ms-excel", "application/octet-stream"]),
};

export class UploadValidationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "UploadValidationError";
    this.statusCode = statusCode;
  }
}

export function validateUploadMetadata(file: UploadMetadata): SupportedUploadExtension {
  const ext = path.extname(file.originalname).toLowerCase() as SupportedUploadExtension;
  const allowedMimes = ALLOWED_MIMES[ext];

  if (!allowedMimes) {
    throw new UploadValidationError("Unsupported file type. Please upload CSV, Excel, or PDF.");
  }

  const mime = file.mimetype.toLowerCase();
  if (!allowedMimes.has(mime)) {
    throw new UploadValidationError(
      `Unsupported file MIME type for ${ext}. Received ${file.mimetype || "unknown"}.`,
    );
  }

  return ext;
}

export async function validateUploadContent(
  filePath: string,
  ext: SupportedUploadExtension,
): Promise<void> {
  const header = await readFileHeader(filePath);

  if (header.length === 0) {
    throw new UploadValidationError("Uploaded file is empty.");
  }

  if (ext === ".pdf" && !startsWithAscii(header, "%PDF-")) {
    throw new UploadValidationError("Uploaded file is not a valid PDF.");
  }

  if (ext === ".xlsx" && !isZipFile(header)) {
    throw new UploadValidationError("Uploaded file is not a valid XLSX workbook.");
  }

  if (ext === ".xls" && !isOleCompoundFile(header)) {
    throw new UploadValidationError("Uploaded file is not a valid XLS workbook.");
  }

  if (ext === ".csv" && !isLikelyTextFile(header)) {
    throw new UploadValidationError("Uploaded file is not a valid text CSV file.");
  }
}

export async function safeDeleteUpload(uploadDir: string, filePath: string): Promise<void> {
  const root = `${path.resolve(uploadDir)}${path.sep}`;
  const target = path.resolve(filePath);

  if (!target.startsWith(root)) {
    throw new UploadValidationError("Refusing to delete a file outside the upload directory.");
  }

  await fs.unlink(target).catch(() => {});
}

export function sanitizeStoredText(value: string): string {
  return maskSensitiveData(value).slice(0, 2_000);
}

async function readFileHeader(filePath: string): Promise<Buffer> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function startsWithAscii(buffer: Buffer, expected: string): boolean {
  return buffer.subarray(0, expected.length).toString("ascii") === expected;
}

function isZipFile(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(buffer[2]) &&
    [0x04, 0x06, 0x08].includes(buffer[3])
  );
}

function isOleCompoundFile(buffer: Buffer): boolean {
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return ole.every((byte, index) => buffer[index] === byte);
}

function isLikelyTextFile(buffer: Buffer): boolean {
  if (buffer.includes(0x00)) return false;

  let suspicious = 0;
  for (const byte of buffer) {
    const isTabOrNewline = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    const isPrintableAscii = byte >= 0x20 && byte <= 0x7e;
    const isUtf8ContinuationOrNonAscii = byte >= 0x80;
    if (!isTabOrNewline && !isPrintableAscii && !isUtf8ContinuationOrNonAscii) suspicious += 1;
  }

  return suspicious / buffer.length < 0.05;
}
