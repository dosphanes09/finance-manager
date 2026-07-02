import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { accountsTable, db } from "@workspace/db";
import {
  CreateAccountBody,
  CreateAccountResponse,
  ListAccountsResponse,
} from "@workspace/api-zod";
import { normalizeAccountType } from "../lib/transaction-classification";

const router: IRouter = Router();

function serializeAccount(account: typeof accountsTable.$inferSelect) {
  return {
    ...account,
    type: normalizeAccountType(account.type),
    createdAt: account.createdAt.toISOString(),
  };
}

router.get("/accounts", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(accountsTable)
    .orderBy(asc(accountsTable.name), asc(accountsTable.id));

  res.json(ListAccountsResponse.parse(rows.map(serializeAccount)));
});

router.post("/accounts", async (req, res): Promise<void> => {
  const body = CreateAccountBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const input = body.data;
  const normalizedType = normalizeAccountType(input.type);

  const [existing] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.name, input.name.trim()))
    .limit(1);

  if (existing && existing.type === normalizedType) {
    res.json(CreateAccountResponse.parse(serializeAccount(existing)));
    return;
  }

  const [created] = await db
    .insert(accountsTable)
    .values({
      name: input.name.trim(),
      type: normalizedType,
      currency: input.currency ?? "TRY",
      institution: input.institution?.trim() || null,
      last4: input.last4?.trim() || null,
    })
    .returning();

  res.status(201).json(CreateAccountResponse.parse(serializeAccount(created)));
});

export default router;
