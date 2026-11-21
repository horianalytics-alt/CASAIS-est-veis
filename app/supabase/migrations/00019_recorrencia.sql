-- =============================================================================
-- 00019 — Recorrência mensal (assinaturas e fixos)
--
-- Plano: docs/planos/estrutura-recorrencia.md (decisões do Heitor de 2026-11-20).
-- Spec:  docs/superpowers/specs/2026-11-20-recorrencia-assinaturas-design.md.
-- Teste: tests/integration/recorrencia-rls.sql (runner recorrencia-rls.mjs).
--
-- O QUE ENTRA:
--   1. recurring_rules: a regra (por família). O cliente só LÊ; quem grava são
--      as RPCs recorrencia_* abaixo.
--   2. transactions ganha 3 colunas nulas:
--        recurring_rule_id     de qual regra a linha veio;
--        recurring_period      1º dia do mês de competência (não muda depois de
--                              gerada, mesmo se a data da linha for editada);
--        prompt_snoozed_until  o pop-up não pergunta antes deste dia.
--   3. Geração idempotente: a regra guarda até que mês já gerou
--      (generated_through) e o gerador só anda para frente; o índice único
--      (recurring_rule_id, recurring_period) é a segunda barreira.
--   4. Sem pg_cron: o horizonte (mês atual + 11) é renovado por
--      recorrencia_fila_de_cobranca(), que o app chama ao abrir (e por
--      recorrencia_alterar_valor), sempre para a família de quem chama.
--   5. Trigger tx_recorrencia_congela: as 3 colunas novas só são gravadas com a
--      chave de transação app.recorrencia_rpc (ligada só dentro de
--      recorrencia_gerar e recorrencia_responder) ou por service_role /
--      supabase_admin. Cliente por PostgREST não passa, e as outras RPCs
--      DEFINER (que rodam como postgres) também não.
--
-- Cartão (decisão do Heitor): lançamento recorrente em cartão nasce pendente,
-- NÃO entra na fila do pop-up, e as RPCs daqui nunca o marcam como pago: quem
-- quita é o pay_invoice. Marcar uma compra de cartão como paga fora do
-- pay_invoice a tiraria do total da fatura (00003, pay_invoice soma só
-- t.is_paid = false). As actions de edição já existentes continuam podendo
-- marcar qualquer compra de cartão como paga; isso é anterior a esta migration
-- e não muda aqui.
-- Conta arquivada: a assinatura pausa (não gera mês novo e sai da fila).
--
-- Valores em reais, numeric(14,2), como transactions.amount. "Hoje" é
-- public.carteira_hoje() (00016), no fuso America/Sao_Paulo.
--
-- 00001..00018 estão aplicadas e são IMUTÁVEIS: tudo aqui é objeto novo ou
-- ADD COLUMN nula. Nenhum dado existente muda.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — recurring_rules
-- -----------------------------------------------------------------------------
CREATE TABLE public.recurring_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id            uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  type                 text NOT NULL CHECK (type IN ('receita', 'despesa')),
  description          text NOT NULL CHECK (length(btrim(description)) > 0),
  amount               numeric(14,2) NOT NULL CHECK (amount > 0),
  account_id           uuid NOT NULL,
  category_id          uuid,
  payment_method_id    uuid,
  owner_member_id      uuid,
  owner_share          numeric(5,4) CHECK (owner_share BETWEEN 0 AND 1),
  paid_by_member_id    uuid NOT NULL,
  created_by_member_id uuid NOT NULL,
  notes                text,
  is_benefit           boolean NOT NULL DEFAULT false,
  is_futile            boolean NOT NULL DEFAULT false,
  futile_label         text,
  day_of_month         int  NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  start_period         date NOT NULL,
  end_period           date,
  generated_through    date NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (family_id, id),
  -- Conta e membros com NO ACTION (o padrão), e não RESTRICT, pelo motivo da
  -- 00016 bloco 1: apagar a família leva regra, conta e membros no MESMO
  -- comando, e NO ACTION só é conferido no fim do comando. Fora da cascata,
  -- os dois barram excluir a conta ou o membro que uma regra usa.
  FOREIGN KEY (family_id, account_id)
    REFERENCES public.accounts(family_id, id),
  FOREIGN KEY (family_id, category_id)
    REFERENCES public.categories(family_id, id) ON DELETE SET NULL (category_id),
  FOREIGN KEY (family_id, payment_method_id)
    REFERENCES public.payment_methods(family_id, id) ON DELETE SET NULL (payment_method_id),
  FOREIGN KEY (family_id, owner_member_id)
    REFERENCES public.family_members(family_id, id) ON DELETE SET NULL (owner_member_id),
  FOREIGN KEY (family_id, paid_by_member_id)
    REFERENCES public.family_members(family_id, id),
  FOREIGN KEY (family_id, created_by_member_id)
    REFERENCES public.family_members(family_id, id),

  CONSTRAINT rr_cota_exige_responsavel CHECK (owner_share IS NULL OR owner_member_id IS NOT NULL),
  CONSTRAINT rr_rotulo_exige_futil     CHECK (futile_label IS NULL OR is_futile = true),
  CONSTRAINT rr_inicio_e_mes           CHECK (start_period = date_trunc('month', start_period)::date),
  CONSTRAINT rr_fim_e_mes              CHECK (end_period IS NULL OR (
                                         end_period = date_trunc('month', end_period)::date
                                         AND end_period >= start_period)),
  -- Nasce em start_period - 1 mês ("nada gerado ainda"); só anda para frente.
  CONSTRAINT rr_gerado_e_mes           CHECK (
                                         generated_through = date_trunc('month', generated_through)::date
                                         AND generated_through >= (start_period - interval '1 month')::date)
);

COMMENT ON TABLE public.recurring_rules IS
  'Regra de lançamento mensal sem fim conhecido (assinatura, salário). Gravada só pelas RPCs recorrencia_* (00019). generated_through = último mês já gerado em transactions.';

CREATE INDEX idx_recurring_rules_family ON public.recurring_rules (family_id);

CREATE TRIGGER trg_recurring_rules_touch
  BEFORE UPDATE ON public.recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_rules_select ON public.recurring_rules
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- Mesmo arranjo da carteira (00016): o cliente só lê. Sem policy de escrita e
-- sem grant de escrita.
REVOKE ALL ON public.recurring_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recurring_rules TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Colunas novas em transactions
--
-- Nullable e sem default: só catálogo. FK com NO ACTION (o padrão) pelo mesmo
-- motivo da 00016 bloco 1: apagar a família leva regra e lançamentos no mesmo
-- comando, e NO ACTION só é conferido no fim do comando.
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN recurring_rule_id    uuid,
  ADD COLUMN recurring_period     date,
  ADD COLUMN prompt_snoozed_until date;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_family_id_recurring_rule_id_fkey
  FOREIGN KEY (family_id, recurring_rule_id)
  REFERENCES public.recurring_rules (family_id, id);

ALTER TABLE public.transactions
  ADD CONSTRAINT tx_recorrencia_completa CHECK (
    (recurring_rule_id IS NULL AND recurring_period IS NULL AND prompt_snoozed_until IS NULL)
    OR (recurring_rule_id IS NOT NULL AND recurring_period IS NOT NULL
        AND recurring_period = date_trunc('month', recurring_period)::date)
  );

-- Recorrência não é parcela nem transferência (nem acerto, que é transferência).
ALTER TABLE public.transactions
  ADD CONSTRAINT tx_recorrencia_sem_parcela CHECK (
    recurring_rule_id IS NULL
    OR (type IN ('receita', 'despesa')
        AND recurrence_months IS NULL
        AND recurrence_parent_id IS NULL)
  );

-- Um lançamento por regra e mês. Serve também de índice da FK (coluna líder).
CREATE UNIQUE INDEX ux_transactions_recorrencia_periodo
  ON public.transactions (recurring_rule_id, recurring_period)
  WHERE recurring_rule_id IS NOT NULL;

COMMENT ON COLUMN public.transactions.recurring_rule_id IS
  'Regra de recorrência (00019) que gerou a linha. NULL = lançamento comum. Gravada só pelas RPCs recorrencia_*.';
COMMENT ON COLUMN public.transactions.recurring_period IS
  'Mês de competência da linha recorrente (1º dia do mês). Não muda quando a data da linha é editada.';
COMMENT ON COLUMN public.transactions.prompt_snoozed_until IS
  'O pop-up de cobrança não pergunta antes deste dia (resposta "ainda não"). Vale para a família inteira.';


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Trava das colunas novas para papel de cliente
--
-- A policy transactions_update (00006) deixa o cliente alterar qualquer coluna
-- de linha da própria família. Sem esta trava, um PATCH por REST poderia
-- "adotar" um lançamento comum numa regra, apagar o vínculo ou adiar o pop-up
-- sem passar pela RPC.
-- Quem passa: a chave de transação app.recorrencia_rpc, que só as funções
-- recorrencia_gerar e recorrencia_responder ligam (set_config(..., true)) e
-- desligam logo depois da escrita, e os papéis administrativos service_role e
-- supabase_admin. postgres NÃO passa por ser postgres: save_transactions,
-- pay_invoice e as outras RPCs DEFINER também rodam como postgres, e nenhuma
-- delas deve gravar estas colunas (mesmo arranjo de app.carteira_rpc, 00016/00017).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tx_recorrencia_congela()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('app.recorrencia_rpc', true) = 'on'
     OR current_user IN ('service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'Dados da recorrência só mudam pela tela de assinaturas.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tx_recorrencia_congela() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tx_recorrencia_congela_ins
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.recurring_rule_id IS NOT NULL
        OR NEW.recurring_period IS NOT NULL
        OR NEW.prompt_snoozed_until IS NOT NULL)
  EXECUTE FUNCTION public.tx_recorrencia_congela();

CREATE TRIGGER trg_tx_recorrencia_congela_upd
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (NEW.recurring_rule_id    IS DISTINCT FROM OLD.recurring_rule_id
        OR NEW.recurring_period     IS DISTINCT FROM OLD.recurring_period
        OR NEW.prompt_snoozed_until IS DISTINCT FROM OLD.prompt_snoozed_until)
  EXECUTE FUNCTION public.tx_recorrencia_congela();


-- -----------------------------------------------------------------------------
-- BLOCO 4 — Funções internas (sem EXECUTE para o cliente)
-- -----------------------------------------------------------------------------

-- Data do lançamento no mês: o dia da regra, ou o último dia do mês se ele não
-- existe (31 em fevereiro vira 28/29). Mesma regra de save_transactions (00003).
CREATE OR REPLACE FUNCTION public.recorrencia_data(p_period date, p_dia int)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_period + (LEAST(
    p_dia,
    EXTRACT(DAY FROM (p_period + interval '1 month - 1 day'))::int
  ) - 1);
$$;

REVOKE EXECUTE ON FUNCTION public.recorrencia_data(date, int) FROM PUBLIC, anon, authenticated;

-- Gera os meses que faltam, de generated_through + 1 até p_ate (ou até o fim da
-- regra), para UMA família; com p_regra, só para essa regra (recorrencia_criar
-- usa assim, para um início além do horizonte não arrastar as outras regras).
-- Recebe a família por parâmetro: por isso NÃO tem EXECUTE para authenticated.
-- Só é chamada pelas RPCs abaixo, com a família da sessão.
-- Fatura do cartão com a regra de save_transactions (00003): dia menor que o
-- fechamento = fatura do mês; senão, a seguinte.
-- Conta arquivada = assinatura pausada: não gera lançamento, e a marca d'água
-- só avança até o mês ATUAL (meses passados não renascem ao desarquivar; meses
-- futuros voltam a ser gerados normalmente).
CREATE OR REPLACE FUNCTION public.recorrencia_gerar(p_family uuid, p_ate date, p_regra uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ate  date := date_trunc('month', p_ate)::date;
  r      record;
  v_alvo date;
  v_p    date;
  v_d    date;
  v_y    int;
  v_m    int;
  v_k    int;
  v_n    int := 0;
BEGIN
  FOR r IN
    SELECT rr.*, a.closing_day, a.archived_at AS conta_arquivada
    FROM public.recurring_rules rr
    JOIN public.accounts a ON a.id = rr.account_id AND a.family_id = rr.family_id
    WHERE rr.family_id = p_family
      AND (p_regra IS NULL OR rr.id = p_regra)
      AND rr.generated_through < CASE
            WHEN a.archived_at IS NULL THEN LEAST(v_ate, COALESCE(rr.end_period, v_ate))
            ELSE LEAST(v_ate, COALESCE(rr.end_period, v_ate), date_trunc('month', public.carteira_hoje())::date)
          END
    ORDER BY rr.id
    FOR UPDATE OF rr
  LOOP
    v_alvo := LEAST(v_ate, COALESCE(r.end_period, v_ate));
    v_p := (r.generated_through + interval '1 month')::date;

    PERFORM pg_catalog.set_config('app.recorrencia_rpc', 'on', true);
    WHILE r.conta_arquivada IS NULL AND v_p <= v_alvo LOOP
      v_d := public.recorrencia_data(v_p, r.day_of_month);

      IF r.closing_day IS NULL THEN
        v_y := NULL; v_m := NULL;
      ELSIF EXTRACT(DAY FROM v_d)::int < r.closing_day THEN
        v_y := EXTRACT(YEAR FROM v_d)::int;  v_m := EXTRACT(MONTH FROM v_d)::int;
      ELSE
        v_y := EXTRACT(YEAR FROM (v_d + interval '1 month'))::int;
        v_m := EXTRACT(MONTH FROM (v_d + interval '1 month'))::int;
      END IF;

      INSERT INTO public.transactions (
        family_id, type, description, amount, date,
        account_id, owner_member_id, owner_share,
        created_by_member_id, paid_by_member_id,
        category_id, payment_method_id,
        is_paid, paid_date, notes,
        is_benefit, is_futile, futile_label,
        invoice_year, invoice_month,
        recurring_rule_id, recurring_period
      ) VALUES (
        r.family_id, r.type, r.description, r.amount, v_d,
        r.account_id, r.owner_member_id, r.owner_share,
        r.created_by_member_id, r.paid_by_member_id,
        r.category_id, r.payment_method_id,
        false, NULL, r.notes,
        r.is_benefit, r.is_futile, r.futile_label,
        v_y, v_m,
        r.id, v_p
      )
      ON CONFLICT (recurring_rule_id, recurring_period) WHERE recurring_rule_id IS NOT NULL
      DO NOTHING;

      GET DIAGNOSTICS v_k = ROW_COUNT;
      v_n := v_n + v_k;
      v_p := (v_p + interval '1 month')::date;
    END LOOP;
    PERFORM pg_catalog.set_config('app.recorrencia_rpc', 'off', true);

    UPDATE public.recurring_rules
       SET generated_through = CASE
             WHEN r.conta_arquivada IS NULL THEN v_alvo
             ELSE GREATEST(r.generated_through,
                           LEAST(v_alvo, date_trunc('month', public.carteira_hoje())::date))
           END
     WHERE id = r.id;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recorrencia_gerar(uuid, date, uuid) FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — RPCs do cliente
--
-- Todas: família e membro de auth.uid() dentro do corpo; trava por família
-- (pg_advisory_xact_lock) antes de ler estado nas que geram linhas; toda recusa
-- vem ANTES da primeira escrita (L-005).
-- -----------------------------------------------------------------------------

-- Cria a regra a partir de um item no formato de save_transactions e gera o
-- horizonte. Se o item vier pago, só o 1º mês nasce pago (como a 1ª parcela).
CREATE OR REPLACE FUNCTION public.recorrencia_criar(p_item jsonb)
RETURNS TABLE (regra_id uuid, lancamentos int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family    uuid;
  v_member    uuid;
  v_hoje      date := public.carteira_hoje();
  v_mes       date := date_trunc('month', public.carteira_hoje())::date;
  v_type      text;
  v_desc      text;
  v_amount    numeric;
  v_date      date;
  v_start     date;
  v_account   uuid;
  v_acc_type  text;
  v_acc_arch  timestamptz;
  v_is_paid   boolean;
  v_paid_date date;
  v_futil     boolean;
  v_regra     uuid;
  v_n         int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;
  SELECT m.family_id, m.id INTO v_family, v_member
  FROM public.family_members m WHERE m.user_id = v_uid;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
    RAISE EXCEPTION 'Nenhum lançamento recebido';
  END IF;

  v_type    := p_item->>'type';
  v_desc    := btrim(p_item->>'description');
  v_amount  := (p_item->>'amount')::numeric;
  v_date    := (p_item->>'date')::date;
  v_account := (p_item->>'account_id')::uuid;
  v_is_paid := COALESCE((p_item->>'is_paid')::boolean, false);
  v_futil   := COALESCE((p_item->>'is_futile')::boolean, false);

  IF v_type IS NULL OR v_type NOT IN ('receita', 'despesa') THEN
    RAISE EXCEPTION 'Recorrência só para entrada ou saída';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > 99999999.99 OR v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;
  v_start := date_trunc('month', v_date)::date;
  -- No máximo 120 lançamentos na criação (o teto de parcelas do projeto):
  -- início até 108 meses antes do mês atual + os 12 do horizonte.
  IF v_start < (v_mes - interval '108 months')::date THEN
    RAISE EXCEPTION 'A data de início pode ser no máximo 9 anos atrás';
  END IF;
  IF v_start > (v_mes + interval '24 months')::date THEN
    RAISE EXCEPTION 'A data de início pode ser no máximo 2 anos à frente';
  END IF;
  -- "Já pago" na criação: a mesma janela de recorrencia_responder.
  IF v_is_paid THEN
    -- Sem data informada: a do 1º lançamento, mas nunca depois de hoje.
    v_paid_date := COALESCE((p_item->>'paid_date')::date, LEAST(v_date, v_hoje));
    IF v_paid_date > v_hoje THEN
      RAISE EXCEPTION 'A data do pagamento não pode ser no futuro';
    END IF;
    IF v_paid_date < DATE '2000-01-01' THEN
      RAISE EXCEPTION 'Data do pagamento inválida';
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recorrencia:' || v_family::text, 0));

  SELECT a.type, a.archived_at INTO v_acc_type, v_acc_arch
  FROM public.accounts a
  WHERE a.id = v_account AND a.family_id = v_family;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada nesta família';
  END IF;
  IF EXISTS (SELECT 1 FROM public.investment_wallets w WHERE w.account_id = v_account) THEN
    RAISE EXCEPTION 'A carteira de investimento não aceita recorrência';
  END IF;
  IF v_acc_arch IS NOT NULL THEN
    RAISE EXCEPTION 'Esta conta está arquivada';
  END IF;
  IF v_acc_type = 'cartao' AND v_is_paid THEN
    RAISE EXCEPTION 'Assinatura no cartão é paga junto com a fatura';
  END IF;
  -- Receita no cartão nunca seria paga: fora do pop-up (cartão) e fora do
  -- pay_invoice (que só quita despesa/investimento, 00003).
  IF v_acc_type = 'cartao' AND v_type = 'receita' THEN
    RAISE EXCEPTION 'Receita recorrente não pode ser no cartão';
  END IF;

  INSERT INTO public.recurring_rules (
    family_id, type, description, amount, account_id,
    category_id, payment_method_id, owner_member_id, owner_share,
    paid_by_member_id, created_by_member_id, notes,
    is_benefit, is_futile, futile_label,
    day_of_month, start_period, end_period, generated_through
  ) VALUES (
    v_family, v_type, v_desc, v_amount, v_account,
    (p_item->>'category_id')::uuid,
    (p_item->>'payment_method_id')::uuid,
    (p_item->>'owner_member_id')::uuid,
    (p_item->>'owner_share')::numeric,
    COALESCE((p_item->>'paid_by_member_id')::uuid, v_member),
    v_member,
    p_item->>'notes',
    COALESCE((p_item->>'is_benefit')::boolean, false),
    v_futil,
    CASE WHEN v_futil THEN p_item->>'futile_label' ELSE NULL END,
    EXTRACT(DAY FROM v_date)::int,
    v_start, NULL, (v_start - interval '1 month')::date
  )
  RETURNING id INTO v_regra;

  -- Só a regra nova: as outras da família seguem no horizonte normal.
  v_n := public.recorrencia_gerar(v_family, GREATEST((v_mes + interval '11 months')::date, v_start), v_regra);

  IF v_is_paid THEN
    UPDATE public.transactions t
       SET is_paid = true,
           paid_date = v_paid_date
     WHERE t.recurring_rule_id = v_regra
       AND t.recurring_period = v_start
       AND t.family_id = v_family;
  END IF;

  RETURN QUERY SELECT v_regra, v_n;
END;
$$;

-- A fila do pop-up: renova o horizonte e devolve as cobranças vencidas e não
-- adiadas da família, fora as de cartão e as de conta arquivada, em ordem de data.
CREATE OR REPLACE FUNCTION public.recorrencia_fila_de_cobranca()
RETURNS TABLE (
  id uuid, recurring_rule_id uuid, type text, description text, amount numeric,
  date date, account_id uuid, recurring_period date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_family uuid := public.get_user_family_id_self();
  v_hoje   date := public.carteira_hoje();
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recorrencia:' || v_family::text, 0));
  PERFORM public.recorrencia_gerar(v_family, (date_trunc('month', v_hoje) + interval '11 months')::date);

  RETURN QUERY
  SELECT t.id, t.recurring_rule_id, t.type, t.description, t.amount,
         t.date, t.account_id, t.recurring_period
  FROM public.transactions t
  JOIN public.accounts a ON a.id = t.account_id AND a.family_id = t.family_id
  WHERE t.family_id = v_family
    AND t.recurring_rule_id IS NOT NULL
    AND t.is_paid = false
    AND t.date <= v_hoje
    AND COALESCE(t.prompt_snoozed_until, t.date) <= v_hoje
    AND a.type <> 'cartao'
    AND a.archived_at IS NULL
  ORDER BY t.date, t.id;
END;
$$;

-- Resposta ao pop-up. 'pago' grava a data escolhida; 'ainda_nao' adia até
-- amanhã para a família inteira. Nada a responder (o outro membro respondeu
-- antes, id de outra família, cartão, conta arquivada) devolve 'ja_respondida'
-- sem exceção: os casos são indistinguíveis de propósito.
-- Janela da data: não futura; não antes de 2000-01-01 (o piso que o schema já
-- usa em transactions.invoice_year, 00001).
CREATE OR REPLACE FUNCTION public.recorrencia_responder(
  p_lancamento_id   uuid,
  p_resposta        text,
  p_data_pagamento  date DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.get_user_family_id_self();
  v_hoje   date := public.carteira_hoje();
  v_k      int;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;
  IF p_resposta IS NULL OR p_resposta NOT IN ('pago', 'ainda_nao') THEN
    RAISE EXCEPTION 'Resposta inválida';
  END IF;

  IF p_resposta = 'pago' THEN
    IF p_data_pagamento IS NULL THEN
      RAISE EXCEPTION 'Informe a data do pagamento';
    END IF;
    IF p_data_pagamento > v_hoje THEN
      RAISE EXCEPTION 'A data do pagamento não pode ser no futuro';
    END IF;
    IF p_data_pagamento < DATE '2000-01-01' THEN
      RAISE EXCEPTION 'Data do pagamento inválida';
    END IF;

    PERFORM pg_catalog.set_config('app.recorrencia_rpc', 'on', true);
    UPDATE public.transactions t
       SET is_paid = true,
           paid_date = p_data_pagamento,
           prompt_snoozed_until = NULL
     WHERE t.id = p_lancamento_id
       AND t.family_id = v_family
       AND t.recurring_rule_id IS NOT NULL
       AND t.is_paid = false
       AND t.date <= v_hoje
       AND EXISTS (SELECT 1 FROM public.accounts a
                   WHERE a.id = t.account_id AND a.family_id = t.family_id
                     AND a.type <> 'cartao' AND a.archived_at IS NULL);
    GET DIAGNOSTICS v_k = ROW_COUNT;
    PERFORM pg_catalog.set_config('app.recorrencia_rpc', 'off', true);
    RETURN CASE WHEN v_k = 1 THEN 'pago' ELSE 'ja_respondida' END;
  END IF;

  PERFORM pg_catalog.set_config('app.recorrencia_rpc', 'on', true);
  UPDATE public.transactions t
     SET prompt_snoozed_until = v_hoje + 1
   WHERE t.id = p_lancamento_id
     AND t.family_id = v_family
     AND t.recurring_rule_id IS NOT NULL
     AND t.is_paid = false
     AND t.date <= v_hoje
     AND COALESCE(t.prompt_snoozed_until, t.date) <= v_hoje
     AND EXISTS (SELECT 1 FROM public.accounts a
                 WHERE a.id = t.account_id AND a.family_id = t.family_id
                     AND a.type <> 'cartao' AND a.archived_at IS NULL);
  GET DIAGNOSTICS v_k = ROW_COUNT;
  PERFORM pg_catalog.set_config('app.recorrencia_rpc', 'off', true);
  RETURN CASE WHEN v_k = 1 THEN 'adiado' ELSE 'ja_respondida' END;
END;
$$;

-- "Deste mês em diante": muda a regra e os pendentes a partir de p_a_partir.
-- Pagos e meses anteriores ficam. p_a_partir no máximo 1 mês depois do último
-- mês gerado (contando o horizonte que a própria função garante): os meses
-- ainda não gerados nascem com o valor da regra, e todos eles são >= p_a_partir
-- só nesse caso. Todas as recusas vêm antes de gerar (L-005).
CREATE OR REPLACE FUNCTION public.recorrencia_alterar_valor(
  p_regra_id  uuid,
  p_valor     numeric,
  p_a_partir  date
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.get_user_family_id_self();
  v_hoje   date := public.carteira_hoje();
  v_rr     public.recurring_rules;
  v_alvo   date;
  v_limite date;
  v_k      int;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor > 99999999.99 OR p_valor <> round(p_valor, 2) THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;
  IF p_a_partir IS NULL OR p_a_partir <> date_trunc('month', p_a_partir)::date THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recorrencia:' || v_family::text, 0));

  SELECT * INTO v_rr FROM public.recurring_rules rr
  WHERE rr.id = p_regra_id AND rr.family_id = v_family;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;
  -- Até onde a regra estará gerada depois do recorrencia_gerar abaixo.
  v_alvo   := (date_trunc('month', v_hoje) + interval '11 months')::date;
  v_limite := GREATEST(v_rr.generated_through, LEAST(v_alvo, COALESCE(v_rr.end_period, v_alvo)));
  -- Nunca antes do mês atual: "deste mês em diante" (spec §4.4) não reescreve
  -- mês passado, nem pendente atrasado (a cobrança real foi o valor antigo).
  IF p_a_partir < v_rr.start_period
     OR p_a_partir < date_trunc('month', v_hoje)::date
     OR p_a_partir > (v_limite + interval '1 month')::date THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;

  PERFORM public.recorrencia_gerar(v_family, v_alvo);

  UPDATE public.recurring_rules rr SET amount = p_valor
   WHERE rr.id = v_rr.id AND rr.family_id = v_family;

  UPDATE public.transactions t SET amount = p_valor
   WHERE t.family_id = v_family
     AND t.recurring_rule_id = v_rr.id
     AND t.recurring_period >= p_a_partir
     AND t.is_paid = false;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  RETURN v_k;
END;
$$;

-- Encerrar: o último mês passa a ser p_ultimo_mes. Pendentes depois dele são
-- apagados; pagos e passados ficam. Só encurta (estender = assinatura nova).
CREATE OR REPLACE FUNCTION public.recorrencia_encerrar(p_regra_id uuid, p_ultimo_mes date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_family uuid := public.get_user_family_id_self();
  v_rr     public.recurring_rules;
  v_k      int;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;
  IF p_ultimo_mes IS NULL OR p_ultimo_mes <> date_trunc('month', p_ultimo_mes)::date THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recorrencia:' || v_family::text, 0));

  SELECT * INTO v_rr FROM public.recurring_rules rr
  WHERE rr.id = p_regra_id AND rr.family_id = v_family;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;
  IF p_ultimo_mes < v_rr.start_period THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;
  IF v_rr.end_period IS NOT NULL AND p_ultimo_mes > v_rr.end_period THEN
    RAISE EXCEPTION 'Para estender, crie uma assinatura nova';
  END IF;

  UPDATE public.recurring_rules rr SET end_period = p_ultimo_mes
   WHERE rr.id = v_rr.id AND rr.family_id = v_family;

  DELETE FROM public.transactions t
   WHERE t.family_id = v_family
     AND t.recurring_rule_id = v_rr.id
     AND t.recurring_period > p_ultimo_mes
     AND t.is_paid = false;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  RETURN v_k;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recorrencia_criar(jsonb)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recorrencia_fila_de_cobranca()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recorrencia_responder(uuid, text, date)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recorrencia_alterar_valor(uuid, numeric, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recorrencia_encerrar(uuid, date)             FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recorrencia_criar(jsonb)                      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.recorrencia_fila_de_cobranca()               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.recorrencia_responder(uuid, text, date)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.recorrencia_alterar_valor(uuid, numeric, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.recorrencia_encerrar(uuid, date)             TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 6 — Rede de proteção: a migration se recusa a terminar incompleta
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_n     int;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.recurring_rules'::regclass) THEN
    v_erros := v_erros || ' RLS desligado em recurring_rules;';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'recurring_rules';
  IF v_n <> 1 OR NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recurring_rules'
      AND policyname = 'recurring_rules_select' AND cmd = 'SELECT') THEN
    v_erros := v_erros || ' esperada 1 policy (SELECT) em recurring_rules, achadas ' || v_n || ';';
  END IF;

  IF has_table_privilege('authenticated', 'public.recurring_rules', 'INSERT')
     OR has_table_privilege('authenticated', 'public.recurring_rules', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.recurring_rules', 'DELETE')
     OR has_table_privilege('anon', 'public.recurring_rules', 'SELECT') THEN
    v_erros := v_erros || ' privilégio de escrita (authenticated) ou leitura (anon) em recurring_rules;';
  END IF;

  IF has_function_privilege('authenticated', 'public.recorrencia_gerar(uuid, date, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.recorrencia_gerar(uuid, date, uuid)', 'EXECUTE') THEN
    v_erros := v_erros || ' recorrencia_gerar executável pelo cliente;';
  END IF;

  SELECT count(*) INTO v_n FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass
    AND tgname IN ('trg_tx_recorrencia_congela_ins', 'trg_tx_recorrencia_congela_upd')
    AND tgenabled = 'O';
  IF v_n <> 2 THEN
    v_erros := v_erros || ' esperados 2 triggers de congela ativos, achados ' || v_n || ';';
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('recorrencia_gerar', 'recorrencia_criar', 'recorrencia_fila_de_cobranca',
                      'recorrencia_responder', 'recorrencia_alterar_valor', 'recorrencia_encerrar')
    AND p.prosecdef
    AND pg_get_userbyid(p.proowner) = 'postgres'
    AND 'search_path=""' = ANY (p.proconfig);
  IF v_n <> 6 THEN
    v_erros := v_erros || ' esperadas 6 funções DEFINER de postgres com search_path vazio, achadas ' || v_n || ';';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00019 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00019: recurring_rules com RLS e 1 policy; escrita só por RPC; gerador sem EXECUTE do cliente; 2 triggers de congela; 6 funções DEFINER.';
END $$;
