-- =============================================================================
-- 00013 — Progresso de orçamento e patrimônio mensal (Onda 2, PLANO.md 8.1/8.2)
--
-- O QUE ENTRA:
--   1. CHECK novo em category_budgets.month: só meses que existem
--      (2000-01..2199-12). O CHECK de 00001 (^\d{4}-\d{2}$) aceitava 2026-13 e
--      2026-00; a view do bloco 2 converte month em data, e uma linha com mês
--      impossível derrubaria a consulta da família INTEIRA, não só a linha.
--   2. v_orcamento_progresso: "gastei X de um orçamento de Y", por orçamento.
--   3. v_patrimonio_mensal: saldo somado de todas as contas, mês a mês.
--   4. Privilégios: só SELECT, só para authenticated.
--
-- As duas views são security_invoker = true: o RLS de category_budgets,
-- categories, accounts e transactions vale para QUEM CONSULTA. Sem isso a view
-- rodaria como o dono (postgres, rolbypassrls) e devolveria todas as famílias.
--
-- Plano: docs/planos/estrutura-metas-patrimonio-simulador.md.
-- 00001..00012 estão aplicadas e são IMUTÁVEIS: tudo aqui é statement novo.
-- Nenhum DDL em transactions, nenhum dado gravado, nada apagado.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — category_budgets.month só aceita mês que existe
--
-- Medido antes de escrever: 0 orçamentos no banco. A pré-checagem para AQUI com
-- mensagem clara se aparecer linha inválida até o deploy, em vez de falhar no
-- ADD CONSTRAINT com erro cru. Só contagem: nenhum dado sai na mensagem.
-- Mesmo intervalo de anos de transactions.invoice_year (2000..2200).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_invalidos int;
BEGIN
  SELECT count(*) INTO v_invalidos
  FROM public.category_budgets
  WHERE month !~ '^2[01][0-9]{2}-(0[1-9]|1[0-2])$';

  IF v_invalidos > 0 THEN
    RAISE EXCEPTION
      'Migration 00013 abortada: % orçamento(s) com mês fora de 2000-01..2199-12. Corrija antes.',
      v_invalidos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'category_budgets_mes_valido'
      AND conrelid = 'public.category_budgets'::regclass
  ) THEN
    ALTER TABLE public.category_budgets
      ADD CONSTRAINT category_budgets_mes_valido
      CHECK (month ~ '^2[01][0-9]{2}-(0[1-9]|1[0-2])$');
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — v_orcamento_progresso
--
-- Uma linha por linha de category_budgets (orçamento é POR MÊS, como a tabela).
-- SEM filtro de "mês corrente": o banco roda em UTC, e CURRENT_DATE viraria o
-- mês às 21h de Brasília do último dia. Quem consulta filtra .eq('month', mes)
-- com o mês de hojeEmSaoPaulo() (src/lib/hoje.ts).
--
-- Gasto = despesa + investimento da MESMA família e categoria, com date dentro
-- do mês, PAGO OU NÃO: compra no cartão fica is_paid = false até a fatura ser
-- paga, e sem ela o orçamento de quem usa cartão ficaria zerado. Receita e
-- transferência nunca contam. A data é a da compra (date), como em
-- v_monthly_summary — não paid_date nem o mês da fatura.
--
-- Filtro de mês por intervalo (date >= início AND date < início + 1 mês): usa o
-- índice idx_transactions_family_date (family_id, date DESC) de 00001.
-- used_ratio: budget_amount > 0 pelo CHECK de 00001, sem divisão por zero.
-- -----------------------------------------------------------------------------
CREATE VIEW public.v_orcamento_progresso
WITH (security_invoker = true) AS
SELECT
  b.id                                       AS budget_id,
  b.family_id,
  b.category_id,
  c.name                                     AS category_name,
  c.type                                     AS category_type,
  c.icon                                     AS category_icon,
  c.color                                    AS category_color,
  c.archived_at                              AS category_archived_at,
  b.month,
  b.amount                                   AS budget_amount,
  COALESCE(g.total, 0)                       AS spent_amount,
  b.amount - COALESCE(g.total, 0)            AS remaining_amount,
  round(COALESCE(g.total, 0) / b.amount, 4)  AS used_ratio,
  g.tx_count
FROM public.category_budgets b
JOIN public.categories c
  ON c.id = b.category_id
 AND c.family_id = b.family_id
CROSS JOIN LATERAL (
  SELECT make_date(split_part(b.month, '-', 1)::int, split_part(b.month, '-', 2)::int, 1) AS inicio
) m
CROSS JOIN LATERAL (
  SELECT sum(t.amount) AS total, count(*) AS tx_count
  FROM public.transactions t
  WHERE t.family_id   = b.family_id
    AND t.category_id = b.category_id
    AND t.type IN ('despesa', 'investimento')
    AND t.date >= m.inicio
    AND t.date <  (m.inicio + interval '1 month')::date
) g;

COMMENT ON VIEW public.v_orcamento_progresso IS
  'Progresso de cada orçamento mensal de categoria: gasto (despesa + investimento, pago ou não, '
  'pela data da compra) contra o limite. Uma linha por category_budgets. Filtre por month.';
COMMENT ON COLUMN public.v_orcamento_progresso.used_ratio IS
  'spent_amount / budget_amount, 4 casas (1.0000 = 100%). Passa de 1 quando estoura.';
COMMENT ON COLUMN public.v_orcamento_progresso.remaining_amount IS
  'budget_amount - spent_amount. Negativo quando estoura.';


-- -----------------------------------------------------------------------------
-- BLOCO 3 — v_patrimonio_mensal
--
-- Uma linha por família por mês, SEM buraco: mês sem movimento repete o saldo
-- (net_change = 0) — num gráfico de linha, um mês faltando parece queda.
--
-- Mesma definição de saldo de v_account_balances (a única do projeto):
-- saldo = saldo inicial + tudo o que foi PAGO. Logo:
--   - todas as contas, inclusive cartão e arquivada (tirar a arquivada
--     reescreveria o passado no dia em que ela é arquivada);
--   - transferência soma zero: sai de uma conta da casa e entra em outra da
--     casa (FK composta com family_id garante as duas na mesma família);
--   - lançamento do tipo investimento SAI, como já sai do saldo da conta;
--   - initial_balance vale desde o primeiro mês da série (não tem data).
-- O último ponto é igual a sum(current_balance) de v_account_balances.
--
-- O mês do movimento é o de paid_date, não o de date: patrimônio é dinheiro que
-- se moveu. Compra no cartão baixa o patrimônio no dia em que a fatura é paga
-- (pay_invoice grava paid_date nas compras e a transferência na mesma data).
--
-- Série: do menor entre o 1º paid_date e a criação da 1ª conta, até o maior
-- entre o mês corrente EM SÃO PAULO e o último paid_date. generate_series em
-- timestamp SEM fuso (cast explícito): não depende do TimeZone da sessão.
-- -----------------------------------------------------------------------------
CREATE VIEW public.v_patrimonio_mensal
WITH (security_invoker = true) AS
WITH mes_corrente AS (
  SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date AS mes
),
contas AS (
  SELECT
    a.family_id,
    sum(a.initial_balance) AS saldo_inicial,
    min(date_trunc('month', a.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS primeiro_mes
  FROM public.accounts a
  GROUP BY a.family_id
),
fluxo AS (
  SELECT
    t.family_id,
    date_trunc('month', t.paid_date::timestamp)::date AS mes,
    sum(CASE t.type
          WHEN 'receita'       THEN  t.amount
          WHEN 'despesa'       THEN -t.amount
          WHEN 'investimento'  THEN -t.amount
          WHEN 'transferencia' THEN 0
        END) AS variacao
  FROM public.transactions t
  WHERE t.is_paid
  GROUP BY t.family_id, date_trunc('month', t.paid_date::timestamp)::date
),
limites AS (
  SELECT
    c.family_id,
    c.saldo_inicial,
    LEAST(c.primeiro_mes, min(f.mes))                    AS inicio,
    GREATEST((SELECT mes FROM mes_corrente), max(f.mes)) AS fim
  FROM contas c
  LEFT JOIN fluxo f ON f.family_id = c.family_id
  GROUP BY c.family_id, c.saldo_inicial, c.primeiro_mes
),
meses AS (
  SELECT l.family_id, l.saldo_inicial, s.mes::date AS mes
  FROM limites l
  CROSS JOIN LATERAL generate_series(l.inicio::timestamp, l.fim::timestamp, interval '1 month') AS s(mes)
)
SELECT
  m.family_id,
  to_char(m.mes, 'YYYY-MM') AS month,
  COALESCE(f.variacao, 0)   AS net_change,
  m.saldo_inicial
    + sum(COALESCE(f.variacao, 0)) OVER (PARTITION BY m.family_id ORDER BY m.mes)
                            AS total_balance
FROM meses m
LEFT JOIN fluxo f
  ON f.family_id = m.family_id
 AND f.mes = m.mes;

COMMENT ON VIEW public.v_patrimonio_mensal IS
  'Patrimônio da família mês a mês: soma do saldo de todas as contas (mesma regra de '
  'v_account_balances), sem mês faltando, até o mês corrente em America/Sao_Paulo.';
COMMENT ON COLUMN public.v_patrimonio_mensal.net_change IS
  'Receitas pagas - despesas e investimentos pagos no mês (pelo paid_date). Transferência = 0.';
COMMENT ON COLUMN public.v_patrimonio_mensal.total_balance IS
  'Saldo somado de todas as contas no fim do mês: saldos iniciais + net_change acumulado.';


-- -----------------------------------------------------------------------------
-- BLOCO 4 — Privilégios: só leitura, só para quem está logado
--
-- Mesmo padrão de 00010 em v_settlement. O GRANT explícito também cobre a
-- mudança da Supabase em que objetos novos deixam de ser expostos à Data API
-- automaticamente (changelog 2026-04-28).
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.v_orcamento_progresso, public.v_patrimonio_mensal FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_orcamento_progresso, public.v_patrimonio_mensal TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — Rede de proteção: a migration se recusa a terminar incompleta
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
BEGIN
  IF to_regclass('public.v_orcamento_progresso') IS NULL THEN
    v_erros := v_erros || ' v_orcamento_progresso ausente;';
  END IF;
  IF to_regclass('public.v_patrimonio_mensal') IS NULL THEN
    v_erros := v_erros || ' v_patrimonio_mensal ausente;';
  END IF;

  IF (SELECT count(*) FROM pg_class
      WHERE oid IN (to_regclass('public.v_orcamento_progresso'), to_regclass('public.v_patrimonio_mensal'))
        AND 'security_invoker=true' = ANY (reloptions)) <> 2 THEN
    v_erros := v_erros || ' alguma das 2 views sem security_invoker=true;';
  END IF;

  IF has_table_privilege('anon', 'public.v_orcamento_progresso', 'SELECT')
     OR has_table_privilege('anon', 'public.v_patrimonio_mensal', 'SELECT') THEN
    v_erros := v_erros || ' anon ainda lê alguma das views;';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.v_orcamento_progresso', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.v_patrimonio_mensal', 'SELECT') THEN
    v_erros := v_erros || ' authenticated sem SELECT em alguma das views;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'category_budgets_mes_valido'
      AND conrelid = 'public.category_budgets'::regclass
      AND convalidated
  ) THEN
    v_erros := v_erros || ' CHECK category_budgets_mes_valido ausente ou não validado;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00013 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00013: 2 views com security_invoker, privilégios e CHECK de month verificados.';
END $$;
