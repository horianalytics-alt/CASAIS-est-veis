-- Views de agregação. Todas com security_invoker = true para que o RLS das
-- tabelas base seja aplicado como o usuário que consulta, não como o dono da
-- view. Sem isso, a view vazaria dados de outras famílias.

-- ---------------------------------------------------------------------------
-- v_account_balances — saldo REAL acumulado de cada conta
--
-- Corrige o bug da v1, que mostrava apenas o líquido do mês corrente:
-- aqui entra o saldo inicial e todo o histórico já pago.
-- ---------------------------------------------------------------------------
CREATE VIEW v_account_balances
WITH (security_invoker = true) AS
SELECT
  a.id              AS account_id,
  a.family_id,
  a.name,
  a.type,
  a.owner_member_id,
  a.initial_balance,
  a.closing_day,
  a.due_day,
  a.sort_order,
  a.archived_at,
  a.initial_balance
    + COALESCE(entradas.total, 0)
    - COALESCE(saidas.total, 0)
    AS current_balance,
  COALESCE(previsto_saidas.total, 0) AS pending_outflow,
  COALESCE(previsto_entradas.total, 0) AS pending_inflow
FROM accounts a

-- Entradas pagas: receitas na conta + transferências recebidas.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM transactions t
  WHERE t.is_paid = true
    AND (
      (t.account_id = a.id AND t.type = 'receita') OR
      (t.to_account_id = a.id AND t.type = 'transferencia')
    )
) entradas ON true

-- Saídas pagas: despesas e investimentos + transferências enviadas.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM transactions t
  WHERE t.is_paid = true
    AND t.account_id = a.id
    AND t.type IN ('despesa', 'investimento', 'transferencia')
) saidas ON true

-- Ainda a pagar nesta conta.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM transactions t
  WHERE t.is_paid = false
    AND t.account_id = a.id
    AND t.type IN ('despesa', 'investimento')
) previsto_saidas ON true

-- Ainda a receber nesta conta.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM transactions t
  WHERE t.is_paid = false
    AND t.account_id = a.id
    AND t.type = 'receita'
) previsto_entradas ON true;

-- ---------------------------------------------------------------------------
-- v_invoices — faturas por cartão e ciclo
-- ---------------------------------------------------------------------------
CREATE VIEW v_invoices
WITH (security_invoker = true) AS
SELECT
  t.family_id,
  t.account_id,
  a.name            AS account_name,
  a.closing_day,
  a.due_day,
  t.invoice_year,
  t.invoice_month,
  sum(t.amount)                                           AS total_amount,
  sum(t.amount) FILTER (WHERE t.is_paid = false)          AS open_amount,
  count(*)                                                AS tx_count,
  bool_and(t.is_paid)                                     AS is_paid,
  -- Dia do vencimento ajustado ao fim do mês (dia 30 em fevereiro vira 28).
  make_date(
    t.invoice_year,
    t.invoice_month,
    LEAST(
      a.due_day,
      EXTRACT(DAY FROM (
        make_date(t.invoice_year, t.invoice_month, 1) + interval '1 month - 1 day'
      ))::int
    )
  ) AS due_date
FROM transactions t
JOIN accounts a ON a.id = t.account_id AND a.family_id = t.family_id
WHERE a.type = 'cartao'
  AND t.invoice_year IS NOT NULL
  AND t.type IN ('despesa', 'investimento')
GROUP BY
  t.family_id, t.account_id, a.name, a.closing_day, a.due_day,
  t.invoice_year, t.invoice_month;

-- ---------------------------------------------------------------------------
-- v_settlement — o acerto entre os membros
--
-- Para cada membro: o que pagou, a cota que lhe cabia e o saldo.
-- A cota de um gasto compartilhado segue a regra da família (igual ou
-- proporcional à renda); um gasto com responsável nomeado usa a cota dele.
-- Transferência fica de fora: ela MOVE dinheiro, não gera dívida — e é o
-- próprio acerto, que seria contado duas vezes.
-- ---------------------------------------------------------------------------
CREATE VIEW v_settlement
WITH (security_invoker = true) AS
WITH family_income AS (
  SELECT
    m.family_id,
    sum(COALESCE(m.monthly_income, 0)) AS total_income,
    count(*)                           AS member_count
  FROM family_members m
  GROUP BY m.family_id
),
shares AS (
  SELECT
    m.id        AS member_id,
    m.family_id,
    m.display_name,
    CASE
      WHEN f.split_rule = 'proportional' AND fi.total_income > 0
        THEN COALESCE(m.monthly_income, 0) / fi.total_income
      ELSE 1.0 / fi.member_count
    END AS share
  FROM family_members m
  JOIN families f      ON f.id = m.family_id
  JOIN family_income fi ON fi.family_id = m.family_id
),
-- O que cada um desembolsou.
paid AS (
  SELECT t.paid_by_member_id AS member_id, sum(t.amount) AS total
  FROM transactions t
  WHERE t.is_paid = true
    AND t.type IN ('despesa', 'investimento')
  GROUP BY t.paid_by_member_id
),
-- A cota de cada um nos gastos compartilhados.
owed_shared AS (
  SELECT s.member_id, sum(t.amount * s.share) AS total
  FROM transactions t
  JOIN shares s ON s.family_id = t.family_id
  WHERE t.is_paid = true
    AND t.type IN ('despesa', 'investimento')
    AND t.owner_member_id IS NULL
  GROUP BY s.member_id
),
-- A cota de quem foi nomeado responsável.
owed_owner AS (
  SELECT t.owner_member_id AS member_id,
         sum(t.amount * COALESCE(t.owner_share, 1)) AS total
  FROM transactions t
  WHERE t.is_paid = true
    AND t.type IN ('despesa', 'investimento')
    AND t.owner_member_id IS NOT NULL
  GROUP BY t.owner_member_id
),
-- A parte que sobra quando a cota do responsável é menor que o total
-- fica com quem pagou.
owed_remainder AS (
  SELECT t.paid_by_member_id AS member_id,
         sum(t.amount * (1 - COALESCE(t.owner_share, 1))) AS total
  FROM transactions t
  WHERE t.is_paid = true
    AND t.type IN ('despesa', 'investimento')
    AND t.owner_member_id IS NOT NULL
    AND t.owner_member_id <> t.paid_by_member_id
  GROUP BY t.paid_by_member_id
)
SELECT
  s.family_id,
  s.member_id,
  s.display_name,
  s.share,
  round(COALESCE(p.total, 0), 2) AS total_paid,
  round(
    COALESCE(os.total, 0) + COALESCE(oo.total, 0) + COALESCE(orm.total, 0),
    2
  ) AS total_owed,
  round(
    COALESCE(p.total, 0)
      - COALESCE(os.total, 0)
      - COALESCE(oo.total, 0)
      - COALESCE(orm.total, 0),
    2
  ) AS balance
FROM shares s
LEFT JOIN paid           p   ON p.member_id   = s.member_id
LEFT JOIN owed_shared    os  ON os.member_id  = s.member_id
LEFT JOIN owed_owner     oo  ON oo.member_id  = s.member_id
LEFT JOIN owed_remainder orm ON orm.member_id = s.member_id;

-- ---------------------------------------------------------------------------
-- v_monthly_summary — totais por mês, para os indicadores do início
-- ---------------------------------------------------------------------------
CREATE VIEW v_monthly_summary
WITH (security_invoker = true) AS
SELECT
  t.family_id,
  to_char(t.date, 'YYYY-MM') AS month,
  sum(t.amount) FILTER (WHERE t.type = 'receita')                        AS income_total,
  sum(t.amount) FILTER (WHERE t.type = 'receita'      AND t.is_paid)     AS income_paid,
  sum(t.amount) FILTER (WHERE t.type = 'despesa')                        AS expense_total,
  sum(t.amount) FILTER (WHERE t.type = 'despesa'      AND t.is_paid)     AS expense_paid,
  sum(t.amount) FILTER (WHERE t.type = 'investimento')                   AS investment_total,
  sum(t.amount) FILTER (WHERE t.type = 'investimento' AND t.is_paid)     AS investment_paid,
  sum(t.amount) FILTER (WHERE t.type = 'despesa'      AND NOT t.is_paid) AS payable,
  sum(t.amount) FILTER (WHERE t.type = 'receita'      AND NOT t.is_paid) AS receivable,
  count(*)                                                               AS tx_count
FROM transactions t
GROUP BY t.family_id, to_char(t.date, 'YYYY-MM');

GRANT SELECT ON v_account_balances, v_invoices, v_settlement, v_monthly_summary
  TO authenticated;
