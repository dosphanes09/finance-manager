import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, categorizationRulesTable } from "@workspace/db";
import {
  ListRulesResponse,
  CreateRuleBody,
  CreateRuleResponse,
  DeleteRuleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeRule(r: typeof categorizationRulesTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/rules", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(categorizationRulesTable)
    .orderBy(desc(categorizationRulesTable.priority), desc(categorizationRulesTable.createdAt));

  res.json(ListRulesResponse.parse(rows.map(serializeRule)));
});

router.post("/rules", async (req, res): Promise<void> => {
  const body = CreateRuleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { pattern, category, priority = 0 } = body.data;

  const [row] = await db
    .insert(categorizationRulesTable)
    .values({ pattern, category, priority })
    .returning();

  res.status(201).json(CreateRuleResponse.parse(serializeRule(row)));
});

router.delete("/rules/:id", async (req, res): Promise<void> => {
  const params = DeleteRuleParams.safeParse({ id: parseInt(req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid rule id" });
    return;
  }

  await db
    .delete(categorizationRulesTable)
    .where(eq(categorizationRulesTable.id, params.data.id));

  res.sendStatus(204);
});

export default router;
