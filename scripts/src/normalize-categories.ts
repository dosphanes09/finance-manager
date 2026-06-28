import { pool } from "@workspace/db";
import { CATEGORIES, normalizeCategoryId } from "@workspace/finance-categories";

type CategoryRow = {
  id: number;
  category: string;
};

type BudgetRow = CategoryRow & {
  month: string;
};

type TableName = "transactions" | "categorization_rules" | "merchants";

async function normalizeSimpleTable(table: TableName) {
  const { rows } = await pool.query<CategoryRow>(`select id, category from ${table}`);
  let updated = 0;

  for (const row of rows) {
    const normalized = normalizeCategoryId(row.category);
    if (normalized === row.category) continue;

    await pool.query(`update ${table} set category = $1 where id = $2`, [normalized, row.id]);
    updated += 1;
  }

  return updated;
}

async function normalizeBudgets() {
  const { rows } = await pool.query<BudgetRow>("select id, category, month from budgets order by id");
  let updated = 0;
  let deleted = 0;

  for (const row of rows) {
    const normalized = normalizeCategoryId(row.category);
    if (normalized === row.category) continue;

    const existing = rows.find(
      (candidate) =>
        candidate.id !== row.id &&
        candidate.month === row.month &&
        normalizeCategoryId(candidate.category) === normalized &&
        candidate.category === normalized,
    );

    if (existing) {
      await pool.query("delete from budgets where id = $1", [row.id]);
      deleted += 1;
      continue;
    }

    await pool.query("update budgets set category = $1 where id = $2", [normalized, row.id]);
    updated += 1;
    row.category = normalized;
  }

  return { updated, deleted };
}

async function printDiagnostics(label: string) {
  const { rows } = await pool.query(`
    select
      category,
      count(*)::int as transaction_count,
      coalesce(sum(case when type = 'debit' then amount::numeric else 0 end), 0)::numeric(14,2) as total_debit_amount,
      coalesce(sum(case when type = 'credit' then amount::numeric else 0 end), 0)::numeric(14,2) as total_credit_amount
    from transactions
    group by category
    order by transaction_count desc, category
  `);

  console.log(`\n${label}`);
  console.table(rows);
}

async function main() {
  console.log("Canonical categories:", CATEGORIES.map((category) => category.id).join(", "));
  await printDiagnostics("Before category cleanup");

  await pool.query("begin");
  try {
    const transactions = await normalizeSimpleTable("transactions");
    const rules = await normalizeSimpleTable("categorization_rules");
    const merchants = await normalizeSimpleTable("merchants");
    const budgets = await normalizeBudgets();

    await pool.query("commit");

    console.log("Category cleanup complete");
    console.table([{ transactions, rules, merchants, budgetsUpdated: budgets.updated, budgetsDeleted: budgets.deleted }]);
  } catch (error) {
    await pool.query("rollback");
    throw error;
  } finally {
    await printDiagnostics("After category cleanup");
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
