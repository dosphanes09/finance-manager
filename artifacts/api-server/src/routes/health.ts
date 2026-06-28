import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkDatabaseConnection, getDatabaseEnvironmentInfo } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health/db", async (_req, res) => {
  try {
    const data = await checkDatabaseConnection();
    res.json(data);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const code = typeof err === "object" && err && "code" in err ? String(err.code) : undefined;

    res.status(503).json({
      connected: false,
      environment: getDatabaseEnvironmentInfo(),
      error: {
        name: error.name,
        code,
        message: "Database connection failed",
      },
    });
  }
});

export default router;
