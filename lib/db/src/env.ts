import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface SanitizedDatabaseUrl {
  scheme: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: "<redacted>";
}

export interface DatabaseEnvironmentInfo {
  envFileLoaded: string | null;
  databaseUrl: SanitizedDatabaseUrl | null;
}

let loadedEnvPath: string | null = null;

export function loadDatabaseEnvironment(): DatabaseEnvironmentInfo {
  const envFile = findEnvFile();
  if (envFile) {
    loadEnvFile(envFile);
    loadedEnvPath = envFile;
  }

  return getDatabaseEnvironmentInfo();
}

export function getDatabaseEnvironmentInfo(): DatabaseEnvironmentInfo {
  return {
    envFileLoaded: loadedEnvPath,
    databaseUrl: sanitizeDatabaseUrl(process.env.DATABASE_URL),
  };
}

export function sanitizeDatabaseUrl(rawUrl: string | undefined): SanitizedDatabaseUrl | null {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    return {
      scheme: parsed.protocol.replace(":", ""),
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, ""),
      user: decodeURIComponent(parsed.username),
      password: "<redacted>",
    };
  } catch {
    return null;
  }
}

function loadEnvFile(envPath: string): void {
  const content = fs.readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

function findEnvFile(): string | null {
  const explicit = process.env.FINANCE_ANALYZER_ENV_FILE;
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);

  const startDirs = [
    process.cwd(),
    path.dirname(fileURLToPath(import.meta.url)),
  ];

  for (const startDir of startDirs) {
    const found = findUp(startDir, ".env");
    if (found) return found;
  }

  return null;
}

function findUp(startDir: string, fileName: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, fileName);
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
