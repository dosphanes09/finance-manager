import { pool } from "@workspace/db";

async function main() {
  await pool.query("begin");
  try {
    const accountResult = await pool.query<{ id: number }>(`
      insert into accounts (name, type, currency)
      values ('Geçmiş içe aktarımlar', 'other', 'TRY')
      on conflict (name, type) do update set updated_at = now()
      returning id
    `);
    const accountId = accountResult.rows[0]?.id;
    if (!accountId) throw new Error("Could not create or find legacy account");

    await pool.query("update transactions set account_id = $1 where account_id is null", [accountId]);

    await pool.query(`
      update transactions
      set direction = case
        when type = 'credit' then 'credit'
        when type = 'debit' then 'debit'
        when direction in ('credit', 'debit') then direction
        else 'debit'
      end
    `);

    await pool.query(`
      update transactions
      set type = case
        when transaction_kind = 'salary'
          or lower(description) similar to '%(maaş|maas|salary|payroll|ucret odemesi)%'
          then 'income'
        when transaction_kind = 'refund'
          or lower(description) similar to '%(iade|refund|ters ibraz|chargeback|reversal|iptal)%'
          then 'refund'
        when transaction_kind in ('credit_card_payment', 'transfer', 'eft', 'fast', 'atm_withdrawal', 'atm_deposit')
          or lower(description) similar to '%(kredi kartı ödemesi|kredi karti odeme|kart ödemesi|kart odemesi|ekstre ödemesi|ekstre odemesi|borç ödeme|borc odeme|virman|havale|eft|fast|atm|bankamatik)%'
          then 'transfer'
        when type in ('income', 'expense', 'transfer', 'refund') then type
        when direction = 'credit' then 'income'
        else 'expense'
      end
    `);

    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }

  const { rows } = await pool.query<{ type: string; count: number }>(`
    select type, count(*)::int as count
    from transactions
    group by type
    order by type
  `);

  console.log("Account/transfer migration complete");
  console.table(rows);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => {
  void pool.end();
});
