-- =============================================================================
-- 00016 — Carteira de investimento: carteira, caixinhas, movimentos e
-- confirmação manual de rendimento
--
-- Plano: docs/planos/estrutura-carteira-investimento.md (com a revisão do Q2).
-- Spec:  docs/superpowers/specs/2026-10-16-carteira-investimento-design.md.
-- Teste: tests/integration/carteira-rls.sql (runner carteira-rls.mjs).
--
-- O QUE ENTRA:
--   1. investment_wallets: uma carteira por família, presa a uma conta
--      accounts(type='investimento') criada na primeira aplicação ou na
--      primeira caixinha. A carteira é marcada por esta tabela, NÃO pelo tipo da
--      conta: criarConta já aceita contas 'investimento' feitas à mão.
--   2. investment_boxes: as caixinhas. balance_cents é o saldo de verdade
--      (principal mais rendimento já CONFIRMADO).
--   3. investment_box_movements: histórico (entrada, saída e rendimento
--      confirmado) que o cliente não altera nem apaga.
--   4. v_carteira_resumo: total da conta-carteira, quanto está em caixinhas e
--      o não alocado (a diferença). O não alocado é DERIVADO, nunca gravado.
--   5. RPCs, as únicas portas de escrita do cliente: carteira_aplicar,
--      carteira_criar_caixinha, carteira_alocar, carteira_resgatar,
--      carteira_atualizar_taxa e carteira_confirmar_rendimento.
--   6. Leitura do rendimento ainda não confirmado: carteira_rendimentos_pendentes
--      e carteira_rendimento_calculado. Nada é gravado por tempo, e não há cron.
--   7. Trava: lançamento comum (/lancar, editar, excluir, pagar fatura) não mexe
--      na conta-carteira. Passam as RPCs desta migration, que ligam a chave de
--      sessão app.carteira_rpc, além de service_role/supabase_admin e de escrita
--      aninhada em outro gatilho (bloco 6).
--
-- Valores em centavos inteiros (bigint). transactions.amount continua em reais
-- (numeric(14,2)). A ponte é cents::numeric / 100, que é exata.
--
-- Concorrência: toda RPC de escrita pega pg_advisory_xact_lock por família
-- logo depois de resolver a sessão e validar os parâmetros, antes de ler
-- qualquer estado da carteira. Débito de caixinha é UPDATE condicional com
-- ROW_COUNT conferido. CHECK (balance_cents >= 0) é a última barreira.
-- Toda recusa vem antes da primeira escrita (lição L-005). A exceção é a
-- recusa por ROW_COUNT = 0, que vem de um UPDATE que não escreveu nada.
--
-- 00001..00015 estão aplicadas e são IMUTÁVEIS: tudo aqui é objeto novo. Nenhum
-- ALTER de coluna, nenhum DROP, nenhum dado gravado. Os triggers novos em
-- transactions/accounts só recusam linhas que tocam a conta-carteira, e no
-- momento do push nenhuma conta-carteira existe.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — Tabelas
--
-- FKs internas com NO ACTION (o padrão), e não RESTRICT: apagar a família leva
-- conta, carteira, caixinhas e movimentos no MESMO comando, e NO ACTION só é
-- conferido no fim do comando. Fora da cascata, as duas formas barram excluir a
-- conta-carteira ou uma caixinha com filhos.
-- -----------------------------------------------------------------------------
CREATE TABLE public.investment_wallets (
  family_id  uuid PRIMARY KEY REFERENCES public.families(id) ON DELETE CASCADE,
  account_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, account_id),
  FOREIGN KEY (family_id, account_id) REFERENCES public.accounts(family_id, id)
);

COMMENT ON TABLE public.investment_wallets IS
  'Carteira de investimento da família: a conta accounts(type=investimento) que guarda o total aplicado. Escrita só pelas RPCs carteira_*.';

CREATE TABLE public.investment_boxes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL,
  name             text NOT NULL
                   CONSTRAINT investment_boxes_nome_valido CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  rate_type        text NOT NULL
                   CONSTRAINT investment_boxes_tipo_valido CHECK (rate_type IN ('liquidez_diaria', 'pos_fixado', 'pre_fixado')),
  rate_bps         integer NOT NULL
                   CONSTRAINT investment_boxes_taxa_valida CHECK (rate_bps BETWEEN 0 AND 10000),
  rate_defined_at  date NOT NULL,
  resgate_imediato boolean NOT NULL,
  data_vencimento  date,
  balance_cents    bigint NOT NULL DEFAULT 0
                   CONSTRAINT investment_boxes_saldo_valido CHECK (balance_cents BETWEEN 0 AND 99999999999999),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investment_boxes_regra_resgate CHECK (
    (resgate_imediato AND data_vencimento IS NULL) OR
    (NOT resgate_imediato AND data_vencimento IS NOT NULL)
  ),
  UNIQUE (family_id, id),
  -- A caixinha só aponta para a carteira da PRÓPRIA família.
  FOREIGN KEY (family_id, account_id) REFERENCES public.investment_wallets(family_id, account_id)
);

COMMENT ON COLUMN public.investment_boxes.balance_cents IS
  'Saldo resgatável em centavos: entradas - saídas + rendimentos CONFIRMADOS. Rendimento estimado não entra aqui.';
COMMENT ON COLUMN public.investment_boxes.rate_bps IS
  'Taxa mensal estimada em pontos-base (100 = 1% a.m.), informada pelo usuário.';
COMMENT ON COLUMN public.investment_boxes.rate_defined_at IS
  'Data (America/Sao_Paulo) em que a taxa atual foi informada.';

CREATE TABLE public.investment_box_movements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id            uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  box_id               uuid NOT NULL,
  kind                 text NOT NULL
                       CONSTRAINT investment_box_movements_tipo_valido CHECK (kind IN ('entrada', 'saida', 'rendimento')),
  counterpart          text
                       CONSTRAINT investment_box_movements_contraparte_valida CHECK (counterpart IN ('nao_alocado', 'conta')),
  amount_cents         bigint NOT NULL
                       CONSTRAINT investment_box_movements_valor_valido CHECK (amount_cents BETWEEN 1 AND 99999999999999),
  competencia          date,
  transaction_id       uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  occurred_on          date NOT NULL,
  created_by_member_id uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- Rendimento tem competência (dia 1 do mês) e não tem contraparte;
  -- entrada e saída têm contraparte e não têm competência.
  CONSTRAINT investment_box_movements_forma CHECK (
    (kind = 'rendimento' AND counterpart IS NULL AND competencia IS NOT NULL
       AND extract(day FROM competencia) = 1) OR
    (kind <> 'rendimento' AND counterpart IS NOT NULL AND competencia IS NULL)
  ),
  -- Lançamento ligado só onde ele existe. Só nesta direção: o SET NULL da
  -- limpeza de teste não pode violar o CHECK.
  CONSTRAINT investment_box_movements_lancamento CHECK (
    transaction_id IS NULL OR kind = 'rendimento' OR counterpart = 'conta'
  ),
  FOREIGN KEY (family_id, box_id) REFERENCES public.investment_boxes(family_id, id),
  FOREIGN KEY (family_id, created_by_member_id) REFERENCES public.family_members(family_id, id)
);

COMMENT ON TABLE public.investment_box_movements IS
  'Histórico imutável das caixinhas. kind=rendimento é um rendimento mensal CONFIRMADO pelo usuário (competencia = dia 1 do mês). Escrita só pelas RPCs carteira_*.';
COMMENT ON COLUMN public.investment_box_movements.occurred_on IS
  'Data (America/Sao_Paulo) em que o movimento foi feito.';

-- Um rendimento confirmado por caixinha por mês. É a guarda atômica contra
-- confirmar o mesmo mês duas vezes, independente do lock.
CREATE UNIQUE INDEX investment_box_movements_rendimento_unico
  ON public.investment_box_movements (box_id, competencia)
  WHERE kind = 'rendimento';

-- Índices de FK e de RLS (family_id na frente).
CREATE INDEX idx_investment_boxes_family_account
  ON public.investment_boxes (family_id, account_id);
CREATE INDEX idx_box_movements_family_box_date
  ON public.investment_box_movements (family_id, box_id, occurred_on);
CREATE INDEX idx_box_movements_transaction
  ON public.investment_box_movements (transaction_id)
  WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_box_movements_member
  ON public.investment_box_movements (family_id, created_by_member_id);

CREATE TRIGGER trg_investment_boxes_touch
  BEFORE UPDATE ON public.investment_boxes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- BLOCO 2 — RLS e privilégios
--
-- Uma policy de SELECT por tabela. NENHUMA policy de INSERT/UPDATE/DELETE, de
-- propósito, e sem grant de escrita para cliente: se authenticated pudesse
-- fazer UPDATE em investment_boxes, qualquer membro mudaria balance_cents pelo
-- PostgREST, sem movimento e sem conferir o não alocado. Toda escrita de
-- cliente passa pelas RPCs do bloco 5.
-- GRANT explícito: desde 2026-04-28 tabela nova em public não é exposta à Data
-- API por padrão (changelog da Supabase).
-- -----------------------------------------------------------------------------
ALTER TABLE public.investment_wallets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_boxes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_box_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY investment_wallets_select ON public.investment_wallets
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

CREATE POLICY investment_boxes_select ON public.investment_boxes
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

CREATE POLICY investment_box_movements_select ON public.investment_box_movements
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

REVOKE ALL ON public.investment_wallets, public.investment_boxes, public.investment_box_movements
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.investment_wallets, public.investment_boxes, public.investment_box_movements
  TO authenticated;
GRANT ALL ON public.investment_wallets, public.investment_boxes, public.investment_box_movements
  TO service_role;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — View de resumo
--
-- security_invoker = true: o RLS de investment_wallets, investment_boxes,
-- accounts e transactions vale para QUEM CONSULTA. Sem isso a view rodaria
-- como o dono e devolveria todas as famílias. total_cents é o current_balance
-- da conta-carteira em v_account_balances (a única definição de saldo do
-- projeto).
-- -----------------------------------------------------------------------------
CREATE VIEW public.v_carteira_resumo
WITH (security_invoker = true) AS
SELECT
  w.family_id,
  w.account_id,
  (b.current_balance * 100)::bigint                                AS total_cents,
  COALESCE(x.alocado, 0)::bigint                                   AS alocado_cents,
  (b.current_balance * 100)::bigint - COALESCE(x.alocado, 0)::bigint AS nao_alocado_cents
FROM public.investment_wallets w
JOIN public.v_account_balances b ON b.account_id = w.account_id
LEFT JOIN LATERAL (
  SELECT sum(i.balance_cents) AS alocado
  FROM public.investment_boxes i
  WHERE i.family_id = w.family_id
) x ON true;

COMMENT ON VIEW public.v_carteira_resumo IS
  'Uma linha por família com carteira: total da conta-carteira, soma das caixinhas e não alocado (total - caixinhas), em centavos.';

REVOKE ALL ON public.v_carteira_resumo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_carteira_resumo TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — Funções auxiliares
-- -----------------------------------------------------------------------------

-- "Hoje" no fuso do casal, calculado NO BANCO: a RPC não aceita data do
-- cliente, senão um p_hoje forjado destravaria o resgate antes do vencimento.
-- Mesmo now() AT TIME ZONE 'America/Sao_Paulo' de v_patrimonio_mensal (00013).
CREATE OR REPLACE FUNCTION public.carteira_hoje()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

REVOKE EXECUTE ON FUNCTION public.carteira_hoje() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.carteira_hoje() TO authenticated;

-- Valor de uma operação: de 1 centavo a R$ 99.999.999,99 (o teto que os
-- esquemas Zod do projeto usam).
CREATE OR REPLACE FUNCTION public.carteira_validar_valor(p_valor_cents bigint)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_valor_cents IS NULL OR p_valor_cents <= 0 THEN
    RAISE EXCEPTION 'O valor precisa ser maior que zero.';
  END IF;
  IF p_valor_cents > 9999999999 THEN
    RAISE EXCEPTION 'Esse valor é alto demais.';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.carteira_validar_valor(bigint) FROM PUBLIC, anon, authenticated;

-- Garante a carteira da família. Só é segura chamada de dentro de uma RPC que
-- já pegou o lock da família (duas primeiras aplicações simultâneas criariam
-- duas contas). Sem EXECUTE para cliente.
CREATE OR REPLACE FUNCTION public.carteira_garantir(p_family_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_conta uuid;
BEGIN
  SELECT w.account_id INTO v_conta
  FROM public.investment_wallets w
  WHERE w.family_id = p_family_id;

  IF v_conta IS NOT NULL THEN
    RETURN v_conta;
  END IF;

  INSERT INTO public.accounts (family_id, owner_member_id, name, type, initial_balance, sort_order)
  VALUES (
    p_family_id, NULL, 'Carteira de investimento', 'investimento', 0,
    COALESCE((SELECT max(a.sort_order) FROM public.accounts a WHERE a.family_id = p_family_id), 0) + 1
  )
  RETURNING id INTO v_conta;

  INSERT INTO public.investment_wallets (family_id, account_id) VALUES (p_family_id, v_conta);

  RETURN v_conta;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.carteira_garantir(uuid) FROM PUBLIC, anon, authenticated;

-- Rendimento estimado de UMA competência (dia 1 do mês) de uma caixinha:
--   base = entradas - saídas feitas ANTES do mês + rendimentos confirmados de
--          meses anteriores;
--   rendimento = base * taxa / 10000, meio centavo para cima. É a mesma conta
--          de arredondarMeioParaCima em src/lib/simulador.ts:
--          (2 * num + den) / (2 * den), com num = base * taxa e den = 10000.
-- Usa a taxa ATUAL da caixinha: enquanto um mês não é confirmado, o valor dele
-- é estimativa e acompanha a taxa. Depois de confirmado, fica gravado.
-- SECURITY INVOKER: chamada por cliente, o RLS esconde caixinha de outra
-- família, e a função devolve 0.
CREATE OR REPLACE FUNCTION public.carteira_rendimento_calculado(p_caixinha_id uuid, p_competencia date)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_taxa integer;
  v_base bigint;
BEGIN
  SELECT b.rate_bps INTO v_taxa FROM public.investment_boxes b WHERE b.id = p_caixinha_id;
  IF v_taxa IS NULL OR p_competencia IS NULL THEN
    RETURN 0;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.carteira_rendimento_calculado(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.carteira_rendimento_calculado(uuid, date) TO authenticated;

-- Rendimentos estimados ainda não confirmados, por caixinha e mês, do mês de
-- criação da caixinha até o mês corrente (São Paulo). Mês com rendimento zero
-- (base zero, ou taxa que arredonda a zero) não aparece. INVOKER: o RLS
-- restringe às caixinhas da família de quem consulta.
CREATE OR REPLACE FUNCTION public.carteira_rendimentos_pendentes()
RETURNS TABLE (caixinha_id uuid, competencia date, rendimento_cents bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.caixinha_id, c.competencia, c.rendimento_cents
  FROM (
    SELECT
      b.id                                                      AS caixinha_id,
      s.mes::date                                               AS competencia,
      public.carteira_rendimento_calculado(b.id, s.mes::date)   AS rendimento_cents
    FROM public.investment_boxes b
    CROSS JOIN LATERAL pg_catalog.generate_series(
      pg_catalog.date_trunc('month', b.created_at AT TIME ZONE 'America/Sao_Paulo'),
      pg_catalog.date_trunc('month', public.carteira_hoje()::timestamp),
      interval '1 month'
    ) AS s(mes)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.investment_box_movements m
      WHERE m.box_id = b.id AND m.kind = 'rendimento' AND m.competencia = s.mes::date
    )
  ) c
  WHERE c.rendimento_cents > 0
  ORDER BY c.caixinha_id, c.competencia;
$$;

REVOKE EXECUTE ON FUNCTION public.carteira_rendimentos_pendentes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.carteira_rendimentos_pendentes() TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — RPCs de escrita
--
-- SECURITY DEFINER (escrevem em tabelas sem grant de escrita para cliente),
-- com as mitigações da skill supabase: auth.uid() conferido no corpo, família
-- resolvida a partir dele (nunca de parâmetro), filtro explícito por family_id
-- em toda leitura e escrita, ou pelo id de uma caixinha já conferida como da
-- família (dentro de DEFINER o RLS não vale),
-- search_path = '', e EXECUTE só para authenticated.
--
-- Esqueleto de todas: 1) sessão  2) família  3) parâmetros  4) lock da família
-- 5) leituras e TODAS as recusas  6) escritas. As únicas recusas no passo 6 são
-- de ROW_COUNT = 0 (resgatar, atualizar_taxa): um UPDATE que é a primeira
-- escrita e não escreveu nada.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.carteira_aplicar(
  p_conta_origem_id uuid,
  p_valor_cents     bigint,
  p_caixinha_id     uuid DEFAULT NULL
)
RETURNS TABLE (lancamento_id uuid, movimento_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_family  uuid;
  v_member  uuid;
  v_hoje    date := public.carteira_hoje();
  v_saldo   bigint;
  v_conta   uuid;
  v_tx      uuid;
  v_mov     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;
  SELECT m.family_id, m.id INTO v_family, v_member
  FROM public.family_members m WHERE m.user_id = v_uid;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  PERFORM public.carteira_validar_valor(p_valor_cents);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carteira:' || v_family::text, 0));

  -- Origem: conta corrente ativa da família. A conta-carteira tem tipo
  -- 'investimento' e nunca passa aqui.
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = p_conta_origem_id
      AND a.family_id = v_family
      AND a.type = 'corrente'
      AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Conta de origem inválida';
  END IF;

  IF p_caixinha_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.investment_boxes b
    WHERE b.id = p_caixinha_id AND b.family_id = v_family
  ) THEN
    RAISE EXCEPTION 'Caixinha não encontrada';
  END IF;

  SELECT (b.current_balance * 100)::bigint INTO v_saldo
  FROM public.v_account_balances b
  WHERE b.account_id = p_conta_origem_id AND b.family_id = v_family;
  IF COALESCE(v_saldo, 0) < p_valor_cents THEN
    RAISE EXCEPTION 'Saldo insuficiente na conta de origem';
  END IF;

  -- Escritas.
  v_conta := public.carteira_garantir(v_family);

  PERFORM pg_catalog.set_config('app.carteira_rpc', 'on', true);
  INSERT INTO public.transactions (
    family_id, type, description, amount, date,
    account_id, to_account_id,
    created_by_member_id, paid_by_member_id,
    is_paid, paid_date
  ) VALUES (
    v_family, 'transferencia', 'Aplicação na carteira de investimento',
    p_valor_cents::numeric / 100, v_hoje,
    p_conta_origem_id, v_conta,
    v_member, v_member,
    true, v_hoje
  )
  RETURNING id INTO v_tx;
  PERFORM pg_catalog.set_config('app.carteira_rpc', 'off', true);

  IF p_caixinha_id IS NOT NULL THEN
    UPDATE public.investment_boxes
       SET balance_cents = balance_cents + p_valor_cents
     WHERE id = p_caixinha_id AND family_id = v_family;

    INSERT INTO public.investment_box_movements (
      family_id, box_id, kind, counterpart, amount_cents, transaction_id, occurred_on, created_by_member_id
    ) VALUES (
      v_family, p_caixinha_id, 'entrada', 'conta', p_valor_cents, v_tx, v_hoje, v_member
    )
    RETURNING id INTO v_mov;
  END IF;

  RETURN QUERY SELECT v_tx, v_mov;
END;
$$;

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
    v_family, v_conta, v_nome, p_tipo, p_taxa_bps, public.carteira_hoje(),
    p_resgate_imediato, CASE WHEN p_resgate_imediato THEN NULL ELSE p_data_vencimento END, 0
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.carteira_alocar(p_caixinha_id uuid, p_valor_cents bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_member uuid;
  v_livre  bigint;
  v_mov    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;
  SELECT m.family_id, m.id INTO v_family, v_member
  FROM public.family_members m WHERE m.user_id = v_uid;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  PERFORM public.carteira_validar_valor(p_valor_cents);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carteira:' || v_family::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.investment_boxes b
    WHERE b.id = p_caixinha_id AND b.family_id = v_family
  ) THEN
    RAISE EXCEPTION 'Caixinha não encontrada';
  END IF;

  SELECT COALESCE((
    SELECT r.nao_alocado_cents FROM public.v_carteira_resumo r WHERE r.family_id = v_family
  ), 0) INTO v_livre;
  IF v_livre < p_valor_cents THEN
    RAISE EXCEPTION 'Saldo não alocado insuficiente';
  END IF;

  -- Escritas.
  UPDATE public.investment_boxes
     SET balance_cents = balance_cents + p_valor_cents
   WHERE id = p_caixinha_id AND family_id = v_family;

  INSERT INTO public.investment_box_movements (
    family_id, box_id, kind, counterpart, amount_cents, occurred_on, created_by_member_id
  ) VALUES (
    v_family, p_caixinha_id, 'entrada', 'nao_alocado', p_valor_cents, public.carteira_hoje(), v_member
  )
  RETURNING id INTO v_mov;

  RETURN v_mov;
END;
$$;

-- p_conta_destino_id NULL = de volta para o não alocado da carteira.
CREATE OR REPLACE FUNCTION public.carteira_resgatar(
  p_caixinha_id      uuid,
  p_valor_cents      bigint,
  p_conta_destino_id uuid DEFAULT NULL
)
RETURNS TABLE (movimento_id uuid, lancamento_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_family uuid;
  v_member uuid;
  v_hoje   date := public.carteira_hoje();
  v_box    public.investment_boxes;
  v_n      integer;
  v_tx     uuid;
  v_mov    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;
  SELECT m.family_id, m.id INTO v_family, v_member
  FROM public.family_members m WHERE m.user_id = v_uid;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  PERFORM public.carteira_validar_valor(p_valor_cents);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carteira:' || v_family::text, 0));

  SELECT b.* INTO v_box
  FROM public.investment_boxes b
  WHERE b.id = p_caixinha_id AND b.family_id = v_family
  FOR UPDATE;
  IF v_box.id IS NULL THEN
    RAISE EXCEPTION 'Caixinha não encontrada';
  END IF;

  -- No dia do vencimento já pode ("a partir de").
  IF NOT v_box.resgate_imediato AND v_hoje < v_box.data_vencimento THEN
    RAISE EXCEPTION 'Esta caixinha só pode ser resgatada a partir de %',
      pg_catalog.to_char(v_box.data_vencimento, 'DD/MM/YYYY');
  END IF;

  IF v_box.balance_cents < p_valor_cents THEN
    RAISE EXCEPTION 'Saldo insuficiente na caixinha';
  END IF;

  IF p_conta_destino_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = p_conta_destino_id
      AND a.family_id = v_family
      AND a.type = 'corrente'
      AND a.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Conta de destino inválida';
  END IF;

  -- Escritas. Débito condicional atômico: nunca ler, decidir e escrever.
  UPDATE public.investment_boxes
     SET balance_cents = balance_cents - p_valor_cents
   WHERE id = p_caixinha_id
     AND family_id = v_family
     AND balance_cents >= p_valor_cents;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Saldo insuficiente na caixinha';
  END IF;

  IF p_conta_destino_id IS NOT NULL THEN
    PERFORM pg_catalog.set_config('app.carteira_rpc', 'on', true);
    INSERT INTO public.transactions (
      family_id, type, description, amount, date,
      account_id, to_account_id,
      created_by_member_id, paid_by_member_id,
      is_paid, paid_date
    ) VALUES (
      v_family, 'transferencia', 'Resgate da carteira de investimento',
      p_valor_cents::numeric / 100, v_hoje,
      v_box.account_id, p_conta_destino_id,
      v_member, v_member,
      true, v_hoje
    )
    RETURNING id INTO v_tx;
    PERFORM pg_catalog.set_config('app.carteira_rpc', 'off', true);
  END IF;

  INSERT INTO public.investment_box_movements (
    family_id, box_id, kind, counterpart, amount_cents, transaction_id, occurred_on, created_by_member_id
  ) VALUES (
    v_family, p_caixinha_id, 'saida',
    CASE WHEN p_conta_destino_id IS NULL THEN 'nao_alocado' ELSE 'conta' END,
    p_valor_cents, v_tx, v_hoje, v_member
  )
  RETURNING id INTO v_mov;

  RETURN QUERY SELECT v_mov, v_tx;
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

  -- Mesmo lock: a taxa entra no cálculo de uma confirmação de rendimento
  -- que esteja rodando ao mesmo tempo.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('carteira:' || v_family::text, 0));

  -- Única escrita. Com 0 linhas, nada foi escrito.
  UPDATE public.investment_boxes
     SET rate_bps = p_taxa_bps, rate_defined_at = public.carteira_hoje()
   WHERE id = p_caixinha_id AND family_id = v_family;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Caixinha não encontrada';
  END IF;
END;
$$;

-- Confirma o rendimento estimado de UM mês de UMA caixinha: o valor vira saldo
-- (balance_cents), entra como receita na conta-carteira (patrimônio) e passa a
-- ser resgatável. Regras:
--   - competência = dia 1 do mês, até o mês corrente (São Paulo);
--   - em ORDEM: com um mês anterior ainda pendente (rendimento > 0 e não
--     confirmado), recusa e aponta esse mês. O valor de cada mês depende dos
--     rendimentos confirmados antes dele, e confirmar fora de ordem gravaria um
--     valor que mudaria depois;
--   - uma vez por mês por caixinha: o índice único parcial é a guarda atômica,
--     além do lock;
--   - o valor é calculado AQUI, nunca vem do cliente.
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
  v_pendente date;
  v_valor    bigint;
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
  IF p_competencia > pg_catalog.date_trunc('month', v_hoje::timestamp)::date THEN
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

  SELECT s.mes::date INTO v_pendente
  FROM pg_catalog.generate_series(
    pg_catalog.date_trunc('month', v_box.created_at AT TIME ZONE 'America/Sao_Paulo'),
    (p_competencia - interval '1 month')::timestamp,
    interval '1 month'
  ) AS s(mes)
  WHERE NOT EXISTS (
      SELECT 1 FROM public.investment_box_movements m
      WHERE m.box_id = p_caixinha_id AND m.kind = 'rendimento' AND m.competencia = s.mes::date
    )
    AND public.carteira_rendimento_calculado(p_caixinha_id, s.mes::date) > 0
  ORDER BY s.mes
  LIMIT 1;
  IF v_pendente IS NOT NULL THEN
    RAISE EXCEPTION 'Confirme antes o rendimento de %', pg_catalog.to_char(v_pendente, 'MM/YYYY');
  END IF;

  v_valor := public.carteira_rendimento_calculado(p_caixinha_id, p_competencia);
  IF v_valor <= 0 THEN
    RAISE EXCEPTION 'Não há rendimento a confirmar neste mês';
  END IF;

  -- Escritas. O INSERT do movimento vem antes do crédito: se outra confirmação
  -- do mesmo mês passar pelo lock (não passa), o índice único derruba esta
  -- antes do saldo mudar, e o rollback leva o lançamento junto.
  PERFORM pg_catalog.set_config('app.carteira_rpc', 'on', true);
  INSERT INTO public.transactions (
    family_id, type, description, amount, date,
    account_id,
    created_by_member_id, paid_by_member_id,
    is_paid, paid_date
  ) VALUES (
    v_family, 'receita',
    'Rendimento confirmado: ' || v_box.name || ' (' || pg_catalog.to_char(p_competencia, 'MM/YYYY') || ')',
    v_valor::numeric / 100, v_hoje,
    v_box.account_id,
    v_member, v_member,
    true, v_hoje
  )
  RETURNING id INTO v_tx;
  PERFORM pg_catalog.set_config('app.carteira_rpc', 'off', true);

  INSERT INTO public.investment_box_movements (
    family_id, box_id, kind, counterpart, amount_cents, competencia, transaction_id, occurred_on, created_by_member_id
  ) VALUES (
    v_family, p_caixinha_id, 'rendimento', NULL, v_valor, p_competencia, v_tx, v_hoje, v_member
  )
  RETURNING id INTO v_mov;

  UPDATE public.investment_boxes
     SET balance_cents = balance_cents + v_valor
   WHERE id = p_caixinha_id AND family_id = v_family;

  RETURN QUERY SELECT v_mov, v_tx, v_valor;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.carteira_aplicar(uuid, bigint, uuid)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.carteira_criar_caixinha(text, text, integer, boolean, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.carteira_alocar(uuid, bigint)                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.carteira_resgatar(uuid, bigint, uuid)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.carteira_atualizar_taxa(uuid, integer)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.carteira_confirmar_rendimento(uuid, date)                   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.carteira_aplicar(uuid, bigint, uuid)                        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.carteira_criar_caixinha(text, text, integer, boolean, date) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.carteira_alocar(uuid, bigint)                               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.carteira_resgatar(uuid, bigint, uuid)                       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.carteira_atualizar_taxa(uuid, integer)                      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.carteira_confirmar_rendimento(uuid, date)                   TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 6 — Trava da conta-carteira em transactions e accounts
--
-- Por que uma chave de sessão (GUC), e não current_user como em 00015:
-- save_transactions, delete_transactions e pay_invoice são SECURITY DEFINER
-- de postgres. Liberar por current_user = 'postgres' deixaria /lancar,
-- "excluir lançamento" e "pagar fatura" mexerem na conta-carteira. Só as RPCs
-- do bloco 5 ligam app.carteira_rpc, com set_config(..., true), que vale só
-- para a transação, e desligam logo depois do INSERT.
--
-- Também passam:
--   service_role e supabase_admin  operação administrativa (limpeza de teste);
--   pg_trigger_depth() > 1         escrita disparada por outro gatilho, como a
--                                  cascata de uma família apagada. A única
--                                  escrita aninhada que um cliente dispara hoje
--                                  é o SET NULL de categoria ou forma de
--                                  pagamento (00009), que não muda dinheiro.
-- UPDATE só é recusado se mudar coluna de dinheiro. A descrição continua
-- editável.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tx_carteira_so_por_rpc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.current_setting('app.carteira_rpc', true) = 'on'
     OR current_user IN ('service_role', 'supabase_admin')
     OR pg_catalog.pg_trigger_depth() > 1 THEN
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

COMMENT ON FUNCTION public.tx_carteira_so_por_rpc() IS
  'Trigger (00016): lançamento que toca a conta-carteira só é gravado, alterado em dinheiro ou apagado pelas RPCs carteira_* (chave app.carteira_rpc).';

REVOKE EXECUTE ON FUNCTION public.tx_carteira_so_por_rpc() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tx_carteira_ins
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tx_carteira_so_por_rpc();
CREATE TRIGGER trg_tx_carteira_upd
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tx_carteira_so_por_rpc();
CREATE TRIGGER trg_tx_carteira_del
  BEFORE DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tx_carteira_so_por_rpc();

-- A conta-carteira não muda de tipo, de saldo inicial nem de família por
-- PostgREST. Nome e arquivamento continuam livres. Excluir a conta já é barrado
-- pela FK de investment_wallets. postgres é liberado porque nenhuma RPC faz
-- UPDATE em accounts (conferido no bloco 7).
CREATE OR REPLACE FUNCTION public.accounts_carteira_congela()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
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

REVOKE EXECUTE ON FUNCTION public.accounts_carteira_congela() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_accounts_carteira_congela
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  WHEN (NEW.type IS DISTINCT FROM OLD.type
        OR NEW.initial_balance IS DISTINCT FROM OLD.initial_balance
        OR NEW.family_id IS DISTINCT FROM OLD.family_id)
  EXECUTE FUNCTION public.accounts_carteira_congela();


-- -----------------------------------------------------------------------------
-- BLOCO 7 — Rede de proteção: a migration se recusa a terminar incompleta
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_n     int;
  v_tab   text;
  v_fn    text;
BEGIN
  -- RLS ligado nas 3 tabelas.
  SELECT count(*) INTO v_n FROM pg_class
  WHERE oid IN ('public.investment_wallets'::regclass, 'public.investment_boxes'::regclass,
                'public.investment_box_movements'::regclass)
    AND relrowsecurity;
  IF v_n <> 3 THEN v_erros := v_erros || ' RLS desligado em alguma tabela nova;'; END IF;

  -- Exatamente as 3 policies de SELECT, e nenhuma outra nas tabelas novas.
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('investment_wallets', 'investment_boxes', 'investment_box_movements');
  IF v_n <> 3 THEN v_erros := v_erros || ' esperadas 3 policies nas tabelas novas, achadas ' || v_n || ';'; END IF;
  SELECT count(*) INTO v_n FROM pg_policies
  WHERE schemaname = 'public' AND cmd = 'SELECT' AND roles = '{authenticated}'
    AND policyname IN ('investment_wallets_select', 'investment_boxes_select', 'investment_box_movements_select');
  IF v_n <> 3 THEN v_erros := v_erros || ' alguma policy de SELECT ausente ou com role errado;'; END IF;

  -- Cliente sem escrita direta; authenticated lê; anon nada.
  FOREACH v_tab IN ARRAY ARRAY['public.investment_wallets', 'public.investment_boxes', 'public.investment_box_movements'] LOOP
    IF has_table_privilege('authenticated', v_tab, 'INSERT')
       OR has_table_privilege('authenticated', v_tab, 'UPDATE')
       OR has_table_privilege('authenticated', v_tab, 'DELETE') THEN
      v_erros := v_erros || ' authenticated escreve direto em ' || v_tab || ';';
    END IF;
    IF NOT has_table_privilege('authenticated', v_tab, 'SELECT') THEN
      v_erros := v_erros || ' authenticated sem SELECT em ' || v_tab || ';';
    END IF;
    IF has_table_privilege('anon', v_tab, 'SELECT') THEN
      v_erros := v_erros || ' anon lê ' || v_tab || ';';
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.v_carteira_resumo'::regclass
                 AND 'security_invoker=true' = ANY (reloptions)) THEN
    v_erros := v_erros || ' v_carteira_resumo sem security_invoker=true;';
  END IF;
  IF has_table_privilege('anon', 'public.v_carteira_resumo', 'SELECT') THEN
    v_erros := v_erros || ' anon lê v_carteira_resumo;';
  END IF;

  -- RPCs: DEFINER, search_path vazio, anon sem EXECUTE, authenticated com.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.carteira_aplicar(uuid, bigint, uuid)',
    'public.carteira_criar_caixinha(text, text, integer, boolean, date)',
    'public.carteira_alocar(uuid, bigint)',
    'public.carteira_resgatar(uuid, bigint, uuid)',
    'public.carteira_atualizar_taxa(uuid, integer)',
    'public.carteira_confirmar_rendimento(uuid, date)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn::regprocedure
                   AND prosecdef AND 'search_path=""' = ANY (proconfig)) THEN
      v_erros := v_erros || ' ' || v_fn || ' não é DEFINER com search_path vazio;';
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      v_erros := v_erros || ' anon executa ' || v_fn || ';';
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_erros := v_erros || ' authenticated não executa ' || v_fn || ';';
    END IF;
  END LOOP;

  -- Funções internas: nenhuma é DEFINER, e as que escrevem não são chamáveis
  -- por cliente.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.carteira_garantir(uuid)', 'public.carteira_validar_valor(bigint)',
    'public.tx_carteira_so_por_rpc()', 'public.accounts_carteira_congela()'] LOOP
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_erros := v_erros || ' authenticated executa a interna ' || v_fn || ';';
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.carteira_garantir(uuid)', 'public.carteira_validar_valor(bigint)',
    'public.carteira_hoje()', 'public.carteira_rendimento_calculado(uuid, date)',
    'public.carteira_rendimentos_pendentes()',
    'public.tx_carteira_so_por_rpc()', 'public.accounts_carteira_congela()'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_fn::regprocedure AND prosecdef) THEN
      v_erros := v_erros || ' ' || v_fn || ' deveria ser INVOKER;';
    END IF;
  END LOOP;

  -- Triggers da trava ativos.
  SELECT count(*) INTO v_n FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass
    AND tgname IN ('trg_tx_carteira_ins', 'trg_tx_carteira_upd', 'trg_tx_carteira_del')
    AND tgenabled = 'O';
  IF v_n <> 3 THEN v_erros := v_erros || ' esperados 3 triggers da trava em transactions, achados ' || v_n || ';'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.accounts'::regclass
                 AND tgname = 'trg_accounts_carteira_congela' AND tgenabled = 'O') THEN
    v_erros := v_erros || ' trigger trg_accounts_carteira_congela ausente;';
  END IF;

  -- Premissa do accounts_carteira_congela: nenhuma função de public faz UPDATE
  -- em accounts.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosrc ~* 'update\s+(public\.)?accounts\M';
  IF v_n <> 0 THEN v_erros := v_erros || ' alguma função de public faz UPDATE em accounts;'; END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00016 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00016: 3 tabelas com RLS e 3 policies de SELECT, sem escrita direta; view security_invoker; 6 RPCs DEFINER; trava ativa.';
END $$;
