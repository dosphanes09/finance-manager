import { getDatabaseEnvironmentInfo } from "@workspace/db";

export interface UploadDbErrorDiagnostic {
  name: string;
  message: string;
  code?: string;
  detail?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
  database?: string | null;
}

export function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isDatabaseConnectionError(err: unknown): boolean {
  const diagnostic = getUploadDbErrorDiagnostic(err);
  const message = diagnostic.message.toLowerCase();
  const code = diagnostic.code;

  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03" ||
    message.includes("econnrefused") ||
    message.includes("connection terminated") ||
    message.includes("connection refused") ||
    message.includes("the database system is starting up") ||
    message.includes("database_url")
  );
}

export function getUploadDbErrorDiagnostic(err: unknown): UploadDbErrorDiagnostic {
  const error = err instanceof Error ? err : new Error(String(err));
  const cause = getErrorCause(err);
  const source = cause ?? error;
  const anySource = source as unknown as Record<string, unknown>;

  return {
    name: source.name || error.name,
    message: sanitizeDatabaseErrorMessage(String(source.message || error.message)),
    code: readString(anySource.code),
    detail: sanitizeOptionalMessage(readString(anySource.detail)),
    schema: readString(anySource.schema),
    table: readString(anySource.table),
    column: readString(anySource.column),
    constraint: readString(anySource.constraint),
    database: getDatabaseEnvironmentInfo().databaseUrl?.database ?? null,
  };
}

export function getUploadDbErrorLogFields(err: unknown) {
  return {
    database: getDatabaseEnvironmentInfo(),
    error: getUploadDbErrorDiagnostic(err),
  };
}

export function formatUploadDbDevError(prefix: string, err: unknown): string {
  const diagnostic = getUploadDbErrorDiagnostic(err);
  const parts = [
    prefix,
    diagnostic.code ? `code=${diagnostic.code}` : null,
    diagnostic.message,
    diagnostic.table ? `table=${diagnostic.table}` : null,
    diagnostic.column ? `column=${diagnostic.column}` : null,
  ].filter(Boolean);

  return parts.join(" ");
}

function getErrorCause(err: unknown): Error | null {
  if (!(err instanceof Error)) return null;
  const cause = (err as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? cause : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sanitizeOptionalMessage(value: string | undefined): string | undefined {
  return value ? sanitizeDatabaseErrorMessage(value) : undefined;
}

function sanitizeDatabaseErrorMessage(message: string): string {
  return message
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, "$1<redacted>$2")
    .replace(/params:[\s\S]*/gi, "params:<redacted>")
    .slice(0, 500);
}
