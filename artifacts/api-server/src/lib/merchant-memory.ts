import { inArray, sql } from "drizzle-orm";
import { db, merchantsTable } from "@workspace/db";
import { normalizeCategoryId } from "@workspace/finance-categories";
import { normalizeMerchantKey } from "./statement-parsers/merchant-normalizer";

export interface MerchantMemoryInput {
  merchant: string;
  description: string;
  category?: string | null;
  confidence?: number | null;
}

export interface MerchantMemoryRecord {
  merchantKey: string;
  displayName: string;
  category: string;
  pattern: string;
  source: string;
  confidence: number;
}

export function buildMerchantMemoryKey(merchant: string, description = ""): string {
  const merchantKey = normalizeMerchantKey(merchant);
  if (merchantKey && !["transaction", "card payment", "payment", "odeme"].includes(merchantKey)) {
    return merchantKey;
  }

  return normalizeMerchantKey(description || merchant);
}

export async function loadMerchantMemory(
  transactions: MerchantMemoryInput[],
): Promise<Map<string, MerchantMemoryRecord>> {
  const keys = [
    ...new Set(
      transactions
        .map((transaction) => buildMerchantMemoryKey(transaction.merchant, transaction.description))
        .filter(Boolean),
    ),
  ];

  if (keys.length === 0) return new Map();

  const rows = await db
    .select({
      merchantKey: merchantsTable.merchantKey,
      displayName: merchantsTable.displayName,
      category: merchantsTable.category,
      pattern: merchantsTable.pattern,
      source: merchantsTable.source,
      confidence: merchantsTable.confidence,
    })
    .from(merchantsTable)
    .where(inArray(merchantsTable.merchantKey, keys));

  return new Map(
    rows.map((row) => [
      row.merchantKey,
      {
        ...row,
        category: normalizeCategoryId(row.category),
        confidence: Number(row.confidence),
      },
    ]),
  );
}

export async function rememberMerchantsFromTransactions(
  transactions: MerchantMemoryInput[],
  source: "import" | "user_correction" | "custom_rule" = "import",
): Promise<void> {
  const rows = transactions
    .map((transaction) => {
      const merchantKey = buildMerchantMemoryKey(transaction.merchant, transaction.description);
      const category = normalizeCategoryId(transaction.category);
      const confidence = source === "user_correction" ? 0.99 : Math.max(0.7, Number(transaction.confidence ?? 0.82));

      if (!merchantKey || category === "other") return null;

      return {
        merchantKey,
        displayName: transaction.merchant,
        category,
        pattern: merchantKey,
        source,
        confidence: String(confidence),
        timesSeen: 1,
        lastSeenAt: new Date(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return;

  for (const row of rows) {
    await db
      .insert(merchantsTable)
      .values(row)
      .onConflictDoUpdate({
        target: merchantsTable.merchantKey,
        set:
          source === "user_correction" || source === "custom_rule"
            ? {
                displayName: row.displayName,
                category: row.category,
                pattern: row.pattern,
                source,
                confidence: row.confidence,
                timesSeen: sql`${merchantsTable.timesSeen} + 1`,
                lastSeenAt: row.lastSeenAt,
              }
            : {
                displayName: row.displayName,
                timesSeen: sql`${merchantsTable.timesSeen} + 1`,
                confidence: sql`greatest(${merchantsTable.confidence}, ${row.confidence})`,
                lastSeenAt: row.lastSeenAt,
              },
      });
  }
}
