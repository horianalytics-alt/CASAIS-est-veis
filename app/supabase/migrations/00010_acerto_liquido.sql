-- =============================================================================
-- 00010 — Acerto de contas LÍQUIDO: o acerto registrado abate a dívida
--
-- DEFEITO QUE ESTA MIGRATION CONSERTA, reproduzido no banco hospedado antes de
-- escrevê-la (tests/integration/acerto-liquido.mjs, execução vermelha: depois de
-- settle_up(B -> A, 150) e (B -> A, 250), o saldo continuou +400 / -400):
--
-- v_settlement (00004) calcula o saldo só com despesa/investimento. A
-- transferência que settle_up grava era ignorada inteira — o comentário da 00004
-- dizia que contá-la seria "contar duas vezes". Não seria: a transferência não é
-- gasto compartilhado (isso continua fora), mas ela PAGA a dívida, e a view
-- nunca descontava o que já foi pago. Resultado em produção: a tela /acerto
-- continuava pedindo o mesmo acerto, e o usuário acertou 3 vezes o mesmo valor.
--
-- A CORREÇÃO:
--   saldo = pago - cota + acertos_enviados - acertos_recebidos
-- Quem paga um acerto deixa de dever; quem recebe deixa de ter a receber. Cada
-- acerto entra +X num membro e -X no outro, então a soma da família segue zero.
--
-- COMO SE RECONHECE UM ACERTO: coluna nova e explícita,
-- transactions.settlement_to_member_id, gravada SÓ por settle_up. Não pelo texto
-- 'Acerto de contas' (o /lancar aceita transferência com qualquer descrição), nem
-- pelo dono da conta de destino (accounts_update deixa trocar o dono e mudaria
-- acertos antigos), nem por "toda transferência entre membros" (a família real
-- tem uma "Ajuda com o conserto" que não é acerto).
--
-- O que NÃO muda: total_paid e total_owed (seguem só despesas); a forma por
-- membro {member_id, balance} lida por resolveTransfer(); pay_invoice (a
-- transferência "Pagamento de fatura" continua fora do acerto — as compras do
-- cartão já entram quando viram is_paid).
--
-- 00001..00009 estão aplicadas e são IMUTÁVEIS: tudo aqui é statement novo.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — A coluna, a chave, a regra e o índice
-- -----------------------------------------------------------------------------

-- Nullable e sem default: só catálogo, sem reescrever a tabela.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS settlement_to_member_id uuid;

COMMENT ON COLUMN public.transactions.settlement_to_member_id IS
  'Destinatário de um acerto de contas (gravado só por settle_up). NULL = não é acerto. Quem paga é paid_by_member_id.';

-- FK composta com family_id, como todas as outras: o destinatário é sempre da
-- MESMA família. RESTRICT, igual a paid_by_member_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_family_id_settlement_to_member_id_fkey'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_family_id_settlement_to_member_id_fkey
      FOREIGN KEY (family_id, settlement_to_member_id)
      REFERENCES public.family_members (family_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Acerto só existe em transferência, e entre duas pessoas diferentes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tx_acerto_so_em_transferencia'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT tx_acerto_so_em_transferencia CHECK (
        settlement_to_member_id IS NULL OR (
          type = 'transferencia'
          AND settlement_to_member_id <> paid_by_member_id
        )
      );
  END IF;
END $$;

-- Índice da FK (RESTRICT consulta por ela ao apagar membro) e do agrupamento
-- da view. Parcial: quase toda linha é NULL.
CREATE INDEX IF NOT EXISTS idx_transactions_settlement_to
  ON public.transactions (settlement_to_member_id)
  WHERE settlement_to_member_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Backfill dos acertos que settle_up já gravou
--
-- Antes desta migration settle_up não guardava o destinatário. Ele é o dono da
-- conta de destino (settle_up escolhia a conta corrente do p_to_member_id). A
-- descrição 'Acerto de contas' é usada AQUI, UMA vez, para achar essas linhas;
-- dali em diante o critério é só a coluna.
--
-- O trigger de updated_at fica desligado durante o UPDATE: a linha ganha um
-- dado de esquema novo, não uma edição do usuário, e o updated_at real dela
-- não deve ser reescrito.
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions DISABLE TRIGGER trg_transactions_touch;

UPDATE public.transactions t
SET settlement_to_member_id = a.owner_member_id
FROM public.accounts a
WHERE a.id = t.to_account_id
  AND a.family_id = t.family_id
  AND t.type = 'transferencia'
  AND t.description = 'Acerto de contas'
  AND t.settlement_to_member_id IS NULL
  AND a.owner_member_id IS NOT NULL
  AND a.owner_member_id <> t.paid_by_member_id;

ALTER TABLE public.transactions ENABLE TRIGGER trg_transactions_touch;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — settle_up grava o destinatário
--
-- Corpo idêntico ao de 00003, com UMA coluna a mais no INSERT. Assinatura
-- (uuid, uuid, numeric, date) igual: CREATE OR REPLACE é seguro e o tipo gerado
-- da função não muda.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_up(
  p_from_member_id uuid,
  p_to_member_id   uuid,
  p_amount         numeric,
  p_date           date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_family_id    uuid;
  v_member_id    uuid;
  v_from_account uuid;
  v_to_account   uuid;
  v_date         date;
  v_tx_id        uuid;
BEGIN
  SELECT m.family_id, m.id INTO v_family_id, v_member_id
  FROM family_members m WHERE m.user_id = v_uid;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do acerto precisa ser maior que zero';
  END IF;

  IF p_from_member_id = p_to_member_id THEN
    RAISE EXCEPTION 'O acerto precisa ser entre duas pessoas diferentes';
  END IF;

  v_date := COALESCE(p_date, CURRENT_DATE);

  -- As duas buscas filtram por v_family_id: membro de outra família não tem
  -- conta aqui, e o acerto é recusado abaixo.
  SELECT a.id INTO v_from_account
  FROM accounts a
  WHERE a.family_id = v_family_id
    AND a.owner_member_id = p_from_member_id
    AND a.type = 'corrente'
    AND a.archived_at IS NULL
  ORDER BY a.sort_order, a.created_at
  LIMIT 1;

  SELECT a.id INTO v_to_account
  FROM accounts a
  WHERE a.family_id = v_family_id
    AND a.owner_member_id = p_to_member_id
    AND a.type = 'corrente'
    AND a.archived_at IS NULL
  ORDER BY a.sort_order, a.created_at
  LIMIT 1;

  IF v_from_account IS NULL OR v_to_account IS NULL THEN
    RAISE EXCEPTION 'Cada pessoa precisa de uma conta corrente para acertar';
  END IF;

  INSERT INTO transactions (
    family_id, type, description, amount, date,
    account_id, to_account_id,
    created_by_member_id, paid_by_member_id,
    settlement_to_member_id,
    is_paid, paid_date
  ) VALUES (
    v_family_id, 'transferencia',
    'Acerto de contas', p_amount, v_date,
    v_from_account, v_to_account,
    v_member_id, p_from_member_id,
    p_to_member_id,
    true, v_date
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_up(uuid, uuid, numeric, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.settle_up(uuid, uuid, numeric, date) TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — v_settlement líquida
--
-- As 7 colunas de antes, na mesma ordem e com o mesmo tipo (exigência do
-- CREATE OR REPLACE VIEW), mais 2 no fim. security_invoker repetido de
-- propósito: é ele que faz o RLS de transactions valer para quem consulta.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_settlement
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
-- O que cada um desembolsou em gastos.
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
),
-- Acertos que o membro PAGOU (quem paga é paid_by_member_id).
settled_sent AS (
  SELECT t.paid_by_member_id AS member_id, sum(t.amount) AS total
  FROM transactions t
  WHERE t.is_paid = true
    AND t.type = 'transferencia'
    AND t.settlement_to_member_id IS NOT NULL
  GROUP BY t.paid_by_member_id
),
-- Acertos que o membro RECEBEU.
settled_received AS (
  SELECT t.settlement_to_member_id AS member_id, sum(t.amount) AS total
  FROM transactions t
  WHERE t.is_paid = true
    AND t.type = 'transferencia'
    AND t.settlement_to_member_id IS NOT NULL
  GROUP BY t.settlement_to_member_id
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
      - COALESCE(orm.total, 0)
      + COALESCE(ss.total, 0)
      - COALESCE(sr.total, 0),
    2
  ) AS balance,
  round(COALESCE(ss.total, 0), 2) AS total_settled_sent,
  round(COALESCE(sr.total, 0), 2) AS total_settled_received
FROM shares s
LEFT JOIN paid             p   ON p.member_id   = s.member_id
LEFT JOIN owed_shared      os  ON os.member_id  = s.member_id
LEFT JOIN owed_owner       oo  ON oo.member_id  = s.member_id
LEFT JOIN owed_remainder   orm ON orm.member_id = s.member_id
LEFT JOIN settled_sent     ss  ON ss.member_id  = s.member_id
LEFT JOIN settled_received sr  ON sr.member_id  = s.member_id;

-- Só leitura, só para quem está logado. A view é de agregação (não é
-- atualizável), mas os privilégios padrão do Supabase davam ALL a anon também.
REVOKE ALL ON public.v_settlement FROM anon, authenticated;
GRANT SELECT ON public.v_settlement TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — Rede de proteção: a migration se recusa a terminar incompleta
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros       text := '';
  v_backfill    int;
  v_orfaos      int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name = 'settlement_to_member_id'
  ) THEN
    v_erros := v_erros || ' coluna settlement_to_member_id ausente;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'transactions_family_id_settlement_to_member_id_fkey') THEN
    v_erros := v_erros || ' FK do destinatário ausente;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tx_acerto_so_em_transferencia') THEN
    v_erros := v_erros || ' CHECK tx_acerto_so_em_transferencia ausente;';
  END IF;

  IF to_regclass('public.idx_transactions_settlement_to') IS NULL THEN
    v_erros := v_erros || ' índice idx_transactions_settlement_to ausente;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.v_settlement'::regclass
      AND 'security_invoker=true' = ANY (c.reloptions)
  ) THEN
    v_erros := v_erros || ' v_settlement sem security_invoker;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_transactions_touch'
      AND tgrelid = 'public.transactions'::regclass
      AND tgenabled = 'O'
  ) THEN
    v_erros := v_erros || ' trigger trg_transactions_touch não foi religado;';
  END IF;

  SELECT count(*) INTO v_backfill
  FROM public.transactions WHERE settlement_to_member_id IS NOT NULL;

  -- Acerto antigo que o backfill não conseguiu atribuir (conta de destino sem
  -- dono). Não aborta — seria apagar história —, mas fica no log do push.
  SELECT count(*) INTO v_orfaos
  FROM public.transactions
  WHERE type = 'transferencia' AND description = 'Acerto de contas'
    AND settlement_to_member_id IS NULL;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00010 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00010: coluna, FK, CHECK, índice e view verificados; % acerto(s) com destinatário; % acerto(s) antigo(s) sem destinatário.',
    v_backfill, v_orfaos;
END $$;
