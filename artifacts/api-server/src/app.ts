import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express, { type ErrorRequestHandler, type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const jsonBodyLimit = process.env.JSON_BODY_LIMIT ?? "5mb";
const urlencodedBodyLimit = process.env.URLENCODED_BODY_LIMIT ?? "256kb";
const allowedOrigins = buildAllowedOrigins();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(buildCorsOptions(allowedOrigins)));
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: urlencodedBodyLimit, parameterLimit: 1_000 }));

function buildAllowedOrigins(): Set<string> {
  const configured = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN;
  const origins = configured
    ? configured.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
      ];

  return new Set(origins);
}

function buildCorsOptions(origins: Set<string>): CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin || origins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-PDF-Debug"],
    credentials: false,
    maxAge: 600,
  };
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const statusCode = resolveStatusCode(err);
  const clientMessage = resolveClientMessage(err, statusCode);
  const logPayload = {
    error: {
      name: err instanceof Error ? err.name : "Error",
      message: err instanceof Error ? err.message : String(err),
      code: typeof err === "object" && err && "code" in err ? String(err.code) : undefined,
      statusCode,
    },
  };

  if (statusCode >= 500) req.log.error(logPayload, "Unhandled request error");
  else req.log.warn(logPayload, "Request rejected");

  res.status(statusCode).json({ error: clientMessage });
};

function resolveStatusCode(err: unknown): number {
  if (typeof err === "object" && err) {
    const candidate = "statusCode" in err ? Number(err.statusCode) : "status" in err ? Number(err.status) : NaN;
    if (Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) return candidate;

    if ("type" in err && err.type === "entity.too.large") return 413;
  }

  return 500;
}

function resolveClientMessage(err: unknown, statusCode: number): string {
  if (statusCode === 413) return "Request body is too large.";
  if (isJsonSyntaxError(err)) return "Malformed JSON request body.";
  if (statusCode >= 500) return "Internal server error.";
  if (err instanceof Error && err.message) return err.message;
  return "Request failed.";
}

function isJsonSyntaxError(err: unknown): boolean {
  return err instanceof SyntaxError && typeof err === "object" && err !== null && "body" in err;
}

app.use("/api", router);
configureFrontendStatic(app);
app.use(errorHandler);

export default app;

function configureFrontendStatic(server: Express): void {
  const frontendDistDir = resolveFrontendDistDir();
  const frontendIndexPath = path.join(frontendDistDir, "index.html");

  if (!fs.existsSync(frontendIndexPath)) {
    logger.info({ frontendDistDir }, "Frontend build not found; API-only mode enabled");
    return;
  }

  logger.info({ frontendDistDir }, "Serving frontend build");
  server.use(express.static(frontendDistDir, { index: false }));
  server.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    res.sendFile(frontendIndexPath);
  });
}

function resolveFrontendDistDir(): string {
  if (process.env.FRONTEND_DIST_DIR) return path.resolve(process.env.FRONTEND_DIST_DIR);

  const apiArtifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return path.resolve(apiArtifactDir, "..", "finance-app", "dist", "public");
}
