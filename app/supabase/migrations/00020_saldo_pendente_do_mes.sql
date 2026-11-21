-- =============================================================================
-- 00020 — "A pagar / a receber" das contas só até o fim do mês atual
--
-- Decisão do Heitor (2026-11-20, plano docs/planos/estrutura-recorrencia.md §5
-- item 5): com a recorrência (00019) cada assinatura deixa 12 meses pendentes
-- gerados. v_account_balances (00004) somava em pending_inflow/pending_outflow
-- TODO lançamento não pago da conta, de qualquer data, e a Carteira mostra
-- esses dois números e o "saldo previsto" = atual + a receber - a pagar
-- (src/app/(app)/(principal)/carteira/page.tsx e
-- src/components/carteira/cartao-conta.tsx). Um salário recorrente apareceria
-- como 12 salários a receber.
--
-- A REGRA NOVA: conta o pendente com data até o último dia do mês ATUAL no fuso
-- America/Sao_Paulo. Atrasado de mês anterior continua contando; mês futuro
-- não. Vale também para as parcelas futuras de compras parceladas, que até
-- aqui entravam inteiras.
--
-- As colunas, a ordem, os nomes e os tipos são os de 00004 (exigência do
-- CREATE OR REPLACE VIEW e contrato do front). security_invoker repetido de
-- propósito: é ele que faz o RLS de transactions valer para quem consulta.
-- current_balance, entradas e saídas pagas: corpo idêntico ao de 00004.
--
-- Nenhum dado muda: é só a definição da view. Antes do push, em produção,
-- pending_inflow e pending_outflow eram 0 em todas as contas e não havia
-- lançamento pendente nenhum (saída colada no relatório da execução).
--
-- 00001..00019 estão aplicadas e são IMUTÁVEIS.
-- =============================================================================

CREATE OR REPLACE VIEW public.v_account_balances
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
FROM public.accounts a

-- Último dia do mês atual em São Paulo (o banco roda em UTC).
CROSS JOIN LATERAL (
  SELECT (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)
          + interval '1 month - 1 day')::date AS fim_do_mes
) corte

-- Entradas pagas: receitas na conta + transferências recebidas.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM public.transactions t
  WHERE t.is_paid = true
    AND (
      (t.account_id = a.id AND t.type = 'receita') OR
      (t.to_account_id = a.id AND t.type = 'transferencia')
    )
) entradas ON true

-- Saídas pagas: despesas e investimentos + transferências enviadas.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM public.transactions t
  WHERE t.is_paid = true
    AND t.account_id = a.id
    AND t.type IN ('despesa', 'investimento', 'transferencia')
) saidas ON true

-- Ainda a pagar nesta conta, até o fim do mês atual.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM public.transactions t
  WHERE t.is_paid = false
    AND t.account_id = a.id
    AND t.type IN ('despesa', 'investimento')
    AND t.date <= corte.fim_do_mes
) previsto_saidas ON true

-- Ainda a receber nesta conta, até o fim do mês atual.
LEFT JOIN LATERAL (
  SELECT sum(t.amount) AS total
  FROM public.transactions t
  WHERE t.is_paid = false
    AND t.account_id = a.id
    AND t.type = 'receita'
    AND t.date <= corte.fim_do_mes
) previsto_entradas ON true;

-- Rede de proteção: a view continua security_invoker.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.v_account_balances'::regclass
      AND 'security_invoker=true' = ANY (c.reloptions)
  ) THEN
    RAISE EXCEPTION 'Migration 00020 abortada: v_account_balances sem security_invoker';
  END IF;
END $$;
