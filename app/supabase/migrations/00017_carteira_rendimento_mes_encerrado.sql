-- =============================================================================
-- 00017 — Carteira: rendimento só de mês encerrado, com a taxa do fim do mês,
-- ordem que não fura, e trava mais estreita
--
-- Corrige achados aceitos de duas rodadas de code-review (nível high) sobre a
-- 00016, que já está aplicada e é imutável. Reproduzidos antes desta
-- migration por tests/integration/carteira-rls.sql:
--   contra a 00016 aplicada: placar 40 de 47, vermelhos R01, R05 (m2=2020),
--     R06, R09, R11, F04 e F05;
--   contra o 1º rascunho desta migration: R05 (m2=2020) e R09 vermelhos.
--
-- O QUE MUDA:
--   a) Só mês ENCERRADO (competência < mês corrente em São Paulo) aparece em
--      carteira_rendimentos_pendentes e pode ser confirmado. Antes, o mês
--      corrente era confirmável no dia 1 e resgatável antes de render.
--   b) A taxa de um mês é a que estava definida no FIM dele: histórico novo
--      investment_box_rates, gravado por carteira_criar_caixinha e
--      carteira_atualizar_taxa. Antes, mudar a taxa depois que o mês fechou
--      mudava o valor desse mês na confirmação.
--   c) Um mês anterior ao último confirmado da caixinha nunca mais é listado
--      nem confirmado. Com isso, uma mudança de taxa não reabre mês que ficou
--      para trás. A regra de quais meses estão abertos passa a existir num
--      lugar só: carteira_meses_pendentes_da_caixinha.
--   d) A receita E o movimento do rendimento são datados no último dia do mês
--      de competência, não no dia da confirmação.
--   e) Trava: escrita aninhada (pg_trigger_depth() > 1) em transactions só passa
--      para DELETE (a cascata de família apagada). Em accounts, postgres deixa
--      de passar: só a chave da carteira e service_role/supabase_admin.
--
-- Dados: nenhum rendimento confirmado existe (o bloco 0 aborta se existir,
-- porque seriam linhas datadas pela regra antiga). O histórico de taxa é
-- preenchido com uma linha por caixinha já existente (taxa atual, desde a
-- criação). Nenhuma outra tabela recebe dado.
-- 00001..00016 estão aplicadas e são IMUTÁVEIS. Roda inteira numa transação.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 0 — Pré-condição: nenhum rendimento confirmado pela regra da 00016
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.investment_box_movements WHERE kind = 'rendimento';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Migration 00017 abortada: % rendimento(s) já confirmado(s) pela regra da 00016. Revise antes.', v_n;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- BLOCO 1 — Histórico de taxa
--
-- Uma linha por definição de taxa. A taxa de um mês M é a da linha mais recente
-- com valid_from <= último dia de M. Mesma regra de acesso das outras tabelas
-- da carteira: leitura pela família, nenhuma escrita de cliente.
-- -----------------------------------------------------------------------------
CREATE TABLE public.investment_box_rates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  box_id     uuid NOT NULL,
  rate_bps   integer NOT NULL
             CONSTRAINT investment_box_rates_taxa_valida CHECK (rate_bps BETWEEN 0 AND 10000),
  valid_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (family_id, box_id) REFERENCES public.investment_boxes(family_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.investment_box_rates IS
  'Histórico das taxas de cada caixinha. A taxa de um mês é a vigente no último dia dele. Escrita só pelas RPCs carteira_*.';
COMMENT ON COLUMN public.investment_box_rates.valid_from IS
  'Data (America/Sao_Paulo) a partir da qual a taxa vale.';

CREATE INDEX idx_box_rates_box_valid
  ON public.investment_box_rates (box_id, valid_from DESC, created_at DESC);
CREATE INDEX idx_box_rates_family_box
  ON public.investment_box_rates (family_id, box_id);

ALTER TABLE public.investment_box_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY investment_box_rates_select ON public.investment_box_rates
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));
REVOKE ALL ON public.investment_box_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.investment_box_rates TO authenticated;
GRANT ALL ON public.investment_box_rates TO service_role;

-- Caixinhas já existentes: a taxa atual vale desde a criação.
INSERT INTO public.investment_box_rates (family_id, box_id, rate_bps, valid_from)
SELECT b.family_id, b.id, b.rate_bps, (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date
FROM public.investment_boxes b;

COMMENT ON COLUMN public.investment_box_movements.occurred_on IS
  'Data (America/Sao_Paulo) do movimento. Para kind=rendimento, o último dia do mês de competência (00017).';


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Cálculo do rendimento de um mês, com a taxa do fim do mês
--
-- base = entradas - saídas feitas ANTES do mês + rendimentos confirmados de
-- meses anteriores. rendimento = base * taxa / 10000, meio centavo para cima
-- (a mesma conta de arredondarMeioParaCima em src/lib/simulador.ts).
-- Taxa: a mais recente do histórico com valid_from <= último dia do mês. Sem
-- nenhuma assim, a mais antiga do histórico. Sem histórico, a taxa atual da
-- caixinha.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carteira_rendimento_calculado(p_caixinha_id uuid, p_competencia date)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_atual integer;
  v_taxa  integer;
  v_base  bigint;
BEGIN
  SELECT b.rate_bps INTO v_atual FROM public.investment_boxes b WHERE b.id = p_caixinha_id;
  IF v_atual IS NULL OR p_competencia IS NULL THEN
    RETURN 0;
  END IF;

  SELECT r.rate_bps INTO v_taxa
  FROM public.investment_box_rates r
  WHERE r.box_id = p_caixinha_id
    AND r.valid_from <= ((p_competencia + interval '1 month')::date - 1)
  ORDER BY r.valid_from DESC, r.created_at DESC
  LIMIT 1;
  IF v_taxa IS NULL THEN
    SELECT r.rate_bps INTO v_taxa
    FROM public.investment_box_rates r
    WHERE r.box_id = p_caixinha_id
    ORDER BY r.valid_from, r.created_at
    LIMIT 1;
  END IF;
  v_taxa := COALESCE(v_taxa, v_atual);

  SELECT COALESCE(sum(CASE
           WHEN m.kind = 'entrada'    AND m.occurred_on < p_competencia THEN  m.amount_cents
           WHEN m.kind = 'saida'      AND m.occurred_on < p_competencia THEN -m.amount_cents
           WHEN m.kind = 'rendimento' AND m.competencia < p_competencia THEN  m.amount_cents
           ELSE 0
         END), 0)::bigint
    INTO v_base
  FROM public.investment_box_movements m
  WHERE m.box_id = p_caixinha_id;

  IF v_base <= 0 THEN
    RETURN 0;
  END IF;

  RETURN (v_base * v_taxa * 2 + 10000) / 20000;
END;
$$;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Meses abertos de UMA caixinha: a regra num lugar só
--
-- De max(mês de criação, mês seguinte ao último confirmado) até o mês ANTERIOR
-- ao corrente, só os com rendimento > 0. Usado pela listagem
-- (carteira_rendimentos_pendentes) e pela confirmação. INVOKER: por cliente,
-- o RLS esconde caixinha de outra família (lista vazia).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carteira_meses_pendentes_da_caixinha(p_caixinha_id uuid)
RETURNS TABLE (competencia date, rendimento_cents bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.competencia, c.rendimento_cents
  FROM (
    SELECT
      s.mes::date                                                    AS competencia,
      public.carteira_rendimento_calculado(b.id, s.mes::date)        AS rendimento_cents
    FROM public.investment_boxes b
    LEFT JOIN LATERAL (
      SELECT max(m.competencia) AS ultimo
      FROM public.investment_box_movements m
      WHERE m.box_id = b.id AND m.kind = 'rendimento'
    ) u ON true
    CROSS JOIN LATERAL pg_catalog.generate_series(
      GREATEST(
        pg_catalog.date_trunc('month', b.created_at AT TIME ZONE 'America/Sao_Paulo'),
        (u.ultimo + interval '1 month')::timestamp
      ),
      pg_catalog.date_trunc('month', public.carteira_hoje()::timestamp) - interval '1 month',
      interval '1 month'
    ) AS s(mes)
    WHERE b.id = p_caixinha_id
  ) c
  WHERE c.rendimento_cents > 0
  ORDER BY c.competencia;
$$;

REVOKE EXECUTE ON FUNCTION public.carteira_meses_pendentes_da_caixinha(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.carteira_meses_pendentes_da_caixinha(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.carteira_rendimentos_pendentes()
RETURNS TABLE (caixinha_id uuid, competencia date, rendimento_cents bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT b.id, p.competencia, p.rendimento_cents
  FROM public.investment_boxes b
  CROSS JOIN LATERAL public.carteira_meses_pendentes_da_caixinha(b.id) p
  ORDER BY b.id, p.competencia;
$$;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — Criar caixinha e atualizar taxa gravam o histórico
--
-- Corpos iguais aos da 00016 mais o INSERT em investment_box_rates, que é a
-- última escrita. Assinaturas iguais: grants e tipos gerados não mudam.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carteira_criar_caixinha(
  p_nome             text,
  p_tipo             text,
  p_taxa_bps         integer,
  p_resgate_imediato boolean,
  p_data_vencimento  date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_member uuid;
  v_nome   text := pg_catalog.btrim(p_nome);
  v_hoje   date := public.carteira_hoje();
  v_conta  uuid;
  v_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;
  SELECT m.family_id, m.id INTO v_family, v_member
  FROM public.family_members m WHERE m.user_id = v_uid;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF v_nome IS NULL OR pg_catalog.char_length(v_nome) = 0 THEN
    RAISE EXCEPTION 'Informe o nome da caixinha.';
  END IF;
  IF pg_catalog.char_length(v_nome) > 60 THEN
    RAISE EXCEPTION 'Use no máximo 60 caracteres.';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('liquidez_diaria', 'pos_fixado', 'pre_fixado') THEN
    RAISE EXCEPTION 'Escolha um tipo de rendimento válido.';
  END IF;
  IF p_taxa_bps IS NULL OR p_taxa_bps < 0 OR p_taxa_bps > 10000 THEN
    RAISE EXCEPTION 'A taxa precisa estar entre 0%% e 100%% ao mês.';
  END IF;
  IF p_resgate_imediato IS NULL THEN
    RAISE EXCEPTION 'Informe se o resgate é imediato.';
  END IF;
  IF NOT p_resgate_imediato AND p_data_vencimento IS NULL THEN
    RAISE EXCEPTION 'Informe a data de vencimento.';
  END IF;
  IF NOT p_resgate_imediato
     AND (p_data_vencimento < DATE '2000-01-01' OR p_data_vencimento > DATE '2100-12-31') THEN
    RAISE EXCEPTION 'Data de vencimento inválida.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carteira:' || v_family::text, 0));

  -- Escritas.
  v_conta := public.carteira_garantir(v_family);

  INSERT INTO public.investment_boxes (
    family_id, account_id, name, rate_type, rate_bps, rate_defined_at,
    resgate_imediato, data_vencimento, balance_cents
  ) VALUES (
    v_family, v_conta, v_nome, p_tipo, p_taxa_bps, v_hoje,
    p_resgate_imediato, CASE WHEN p_resgate_imediato THEN NULL ELSE p_data_vencimento END, 0
  )
  RETURNING id INTO v_id;

  INSERT INTO public.investment_box_rates (family_id, box_id, rate_bps, valid_from)
  VALUES (v_family, v_id, p_taxa_bps, v_hoje);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carteira_atualizar_taxa(p_caixinha_id uuid, p_taxa_bps integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_member uuid;
  v_hoje   date := public.carteira_hoje();
  v_n      integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;
  SELECT m.family_id, m.id INTO v_family, v_member
  FROM public.family_members m WHERE m.user_id = v_uid;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_taxa_bps IS NULL OR p_taxa_bps < 0 OR p_taxa_bps > 10000 THEN
    RAISE EXCEPTION 'A taxa precisa estar entre 0%% e 100%% ao mês.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carteira:' || v_family::text, 0));

  -- Primeira escrita. Com 0 linhas, nada foi escrito.
  UPDATE public.investment_boxes
     SET rate_bps = p_taxa_bps, rate_defined_at = v_hoje
   WHERE id = p_caixinha_id AND family_id = v_family;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Caixinha não encontrada';
  END IF;

  INSERT INTO public.investment_box_rates (family_id, box_id, rate_bps, valid_from)
  VALUES (v_family, p_caixinha_id, p_taxa_bps, v_hoje);
END;
$$;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — Confirmação: mês encerrado, nunca atrás do último confirmado,
-- datada no fim da competência
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carteira_confirmar_rendimento(p_caixinha_id uuid, p_competencia date)
RETURNS TABLE (movimento_id uuid, lancamento_id uuid, valor_cents bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_family   uuid;
  v_member   uuid;
  v_hoje     date := public.carteira_hoje();
  v_box      public.investment_boxes;
  v_ultimo   date;
  v_pendente date;
  v_valor    bigint;
  v_fim_mes  date;
  v_tx       uuid;
  v_mov      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;
  SELECT m.family_id, m.id INTO v_family, v_member
  FROM public.family_members m WHERE m.user_id = v_uid;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_competencia IS NULL OR extract(day FROM p_competencia) <> 1 THEN
    RAISE EXCEPTION 'Mês de competência inválido';
  END IF;
  -- Mês corrente ou futuro: ainda não rendeu.
  IF p_competencia >= pg_catalog.date_trunc('month', v_hoje::timestamp)::date THEN
    RAISE EXCEPTION 'Ainda não é possível confirmar o rendimento deste mês';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carteira:' || v_family::text, 0));

  SELECT b.* INTO v_box
  FROM public.investment_boxes b
  WHERE b.id = p_caixinha_id AND b.family_id = v_family
  FOR UPDATE;
  IF v_box.id IS NULL THEN
    RAISE EXCEPTION 'Caixinha não encontrada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.investment_box_movements m
    WHERE m.box_id = p_caixinha_id AND m.kind = 'rendimento' AND m.competencia = p_competencia
  ) THEN
    RAISE EXCEPTION 'O rendimento deste mês já foi confirmado';
  END IF;

  SELECT max(m.competencia) INTO v_ultimo
  FROM public.investment_box_movements m
  WHERE m.box_id = p_caixinha_id AND m.kind = 'rendimento';
  IF v_ultimo IS NOT NULL AND p_competencia < v_ultimo THEN
    RAISE EXCEPTION 'Este mês já ficou para trás: há rendimento confirmado de um mês posterior';
  END IF;

  -- Pendente anterior: a MESMA lista que a tela vê.
  SELECT min(p.competencia) INTO v_pendente
  FROM public.carteira_meses_pendentes_da_caixinha(p_caixinha_id) p
  WHERE p.competencia < p_competencia;
  IF v_pendente IS NOT NULL THEN
    RAISE EXCEPTION 'Confirme antes o rendimento de %', pg_catalog.to_char(v_pendente, 'MM/YYYY');
  END IF;

  v_valor := public.carteira_rendimento_calculado(p_caixinha_id, p_competencia);
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'Não há rendimento a confirmar neste mês';
  END IF;

  -- Escritas, datadas no último dia do mês de competência. O INSERT do
  -- movimento vem antes do crédito: o índice único (box_id, competencia)
  -- derruba uma confirmação repetida antes do saldo mudar.
  v_fim_mes := ((p_competencia + interval '1 month')::date - 1);

  PERFORM pg_catalog.set_config('app.carteira_rpc', 'on', true);
  INSERT INTO public.transactions (
    family_id, type, description, amount, date,
    account_id,
    created_by_member_id, paid_by_member_id,
    is_paid, paid_date
  ) VALUES (
    v_family, 'receita',
    'Rendimento confirmado: ' || v_box.name || ' (' || pg_catalog.to_char(p_competencia, 'MM/YYYY') || ')',
    v_valor::numeric / 100, v_fim_mes,
    v_box.account_id,
    v_member, v_member,
    true, v_fim_mes
  )
  RETURNING id INTO v_tx;
  PERFORM pg_catalog.set_config('app.carteira_rpc', 'off', true);

  INSERT INTO public.investment_box_movements (
    family_id, box_id, kind, counterpart, amount_cents, competencia, transaction_id, occurred_on, created_by_member_id
  ) VALUES (
    v_family, p_caixinha_id, 'rendimento', NULL, v_valor, p_competencia, v_tx, v_fim_mes, v_member
  )
  RETURNING id INTO v_mov;

  UPDATE public.investment_boxes
     SET balance_cents = balance_cents + v_valor
   WHERE id = p_caixinha_id AND family_id = v_family;

  RETURN QUERY SELECT v_mov, v_tx, v_valor;
END;
$$;


-- -----------------------------------------------------------------------------
-- BLOCO 6 — Trava mais estreita
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tx_carteira_so_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Passam: a chave das RPCs da carteira, a operação administrativa e o
  -- DELETE em cascata (família apagada). UPDATE aninhado que muda dinheiro
  -- NÃO passa.
  IF pg_catalog.current_setting('app.carteira_rpc', true) = 'on'
     OR current_user IN ('service_role', 'supabase_admin')
     OR (TG_OP = 'DELETE' AND pg_catalog.pg_trigger_depth() > 1) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.type          IS NOT DISTINCT FROM OLD.type
     AND NEW.amount        IS NOT DISTINCT FROM OLD.amount
     AND NEW.date          IS NOT DISTINCT FROM OLD.date
     AND NEW.account_id    IS NOT DISTINCT FROM OLD.account_id
     AND NEW.to_account_id IS NOT DISTINCT FROM OLD.to_account_id
     AND NEW.is_paid       IS NOT DISTINCT FROM OLD.is_paid
     AND NEW.paid_date     IS NOT DISTINCT FROM OLD.paid_date
     AND NEW.family_id     IS NOT DISTINCT FROM OLD.family_id THEN
    RETURN NEW;
  END IF;

  IF (TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
        SELECT 1 FROM public.investment_wallets w
        WHERE w.account_id = OLD.account_id OR w.account_id = OLD.to_account_id))
     OR (TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
        SELECT 1 FROM public.investment_wallets w
        WHERE w.account_id = NEW.account_id OR w.account_id = NEW.to_account_id)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Movimentos da carteira de investimento só podem ser feitos pela área de Investimentos.';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounts_carteira_congela()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('app.carteira_rpc', true) = 'on'
     OR current_user IN ('service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.investment_wallets w WHERE w.account_id = OLD.id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'A conta da carteira de investimento não pode mudar de tipo nem de saldo inicial.';
  END IF;
  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- BLOCO 7 — Rede de proteção
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_src   text;
BEGIN
  -- Histórico de taxa: RLS, 1 policy de SELECT, sem escrita de cliente.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.investment_box_rates'::regclass) THEN
    v_erros := v_erros || ' RLS desligado em investment_box_rates;';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'investment_box_rates') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'investment_box_rates'
                    AND policyname = 'investment_box_rates_select' AND cmd = 'SELECT' AND roles = '{authenticated}') THEN
    v_erros := v_erros || ' policies de investment_box_rates fora do esperado;';
  END IF;
  IF has_table_privilege('authenticated', 'public.investment_box_rates', 'INSERT')
     OR has_table_privilege('authenticated', 'public.investment_box_rates', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.investment_box_rates', 'DELETE')
     OR has_table_privilege('anon', 'public.investment_box_rates', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.investment_box_rates', 'SELECT') THEN
    v_erros := v_erros || ' privilégios de investment_box_rates fora do esperado;';
  END IF;
  -- Toda caixinha tem histórico depois do preenchimento.
  IF EXISTS (SELECT 1 FROM public.investment_boxes b
             WHERE NOT EXISTS (SELECT 1 FROM public.investment_box_rates r WHERE r.box_id = b.id)) THEN
    v_erros := v_erros || ' caixinha sem histórico de taxa;';
  END IF;

  -- RPCs reescritas continuam DEFINER com search_path vazio; leitura INVOKER.
  IF (SELECT count(*) FROM pg_proc
      WHERE oid IN ('public.carteira_confirmar_rendimento(uuid, date)'::regprocedure,
                    'public.carteira_criar_caixinha(text, text, integer, boolean, date)'::regprocedure,
                    'public.carteira_atualizar_taxa(uuid, integer)'::regprocedure)
        AND prosecdef AND 'search_path=""' = ANY (proconfig)) <> 3 THEN
    v_erros := v_erros || ' alguma RPC reescrita deixou de ser DEFINER com search_path vazio;';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE oid IN ('public.carteira_rendimento_calculado(uuid, date)'::regprocedure,
                           'public.carteira_meses_pendentes_da_caixinha(uuid)'::regprocedure,
                           'public.carteira_rendimentos_pendentes()'::regprocedure,
                           'public.tx_carteira_so_por_rpc()'::regprocedure,
                           'public.accounts_carteira_congela()'::regprocedure)
               AND prosecdef) THEN
    v_erros := v_erros || ' função de leitura ou da trava virou DEFINER;';
  END IF;
  IF has_function_privilege('anon', 'public.carteira_meses_pendentes_da_caixinha(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.carteira_confirmar_rendimento(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.carteira_meses_pendentes_da_caixinha(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.carteira_rendimentos_pendentes()', 'EXECUTE') THEN
    v_erros := v_erros || ' EXECUTE das funções de rendimento fora do esperado;';
  END IF;

  -- Trava: aninhada só para DELETE; accounts sem postgres.
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.tx_carteira_so_por_rpc()'::regprocedure;
  IF v_src !~ '\(TG_OP = ''DELETE'' AND pg_catalog\.pg_trigger_depth\(\) > 1\)'
     OR v_src ~ 'OR pg_catalog\.pg_trigger_depth\(\) > 1 THEN' THEN
    v_erros := v_erros || ' tx_carteira_so_por_rpc ainda libera escrita aninhada que não é DELETE;';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.accounts_carteira_congela()'::regprocedure) ~ '''postgres''' THEN
    v_erros := v_erros || ' accounts_carteira_congela ainda libera postgres;';
  END IF;
  -- Listagem para no mês anterior ao corrente.
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.carteira_meses_pendentes_da_caixinha(uuid)'::regprocedure;
  IF v_src !~ 'carteira_hoje\(\)::timestamp\) - interval ''1 month''' THEN
    v_erros := v_erros || ' carteira_meses_pendentes_da_caixinha não para no mês anterior ao corrente;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00017 abortada:%', v_erros;
  END IF;
  RAISE NOTICE 'Migration 00017: histórico de taxa com RLS; rendimento só de mês encerrado, com a taxa do fim do mês; ordem a partir do último confirmado; trava mais estreita.';
END $$;
