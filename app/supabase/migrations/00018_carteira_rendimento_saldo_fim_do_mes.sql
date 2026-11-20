-- =============================================================================
-- 00018 — Carteira: rendimento sobre o saldo do FIM do mês; conta-carteira
-- não é arquivada; nome da caixinha limpo na RPC
--
-- Corrige achados da auditoria do Sentinela sobre a carteira (00016/00017
-- estão aplicadas e são imutáveis):
--
--   A1 (ALTO) — a base do mês M era "entradas e saídas ANTES de M + rendimentos
--      confirmados". Um saque feito DENTRO de M não reduzia a base de M. A
--      caixinha zerada no dia 1 de M ainda rendia o mês M inteiro sobre o saldo
--      de antes do saque, e esse rendimento era confirmável e resgatável
--      (reprodução S08 do Sentinela).
--      REGRA NOVA, confirmada pelo Heitor: o mês M rende sobre o saldo da
--      caixinha no FIM de M, ou seja, entradas e saídas até o último dia de M
--      mais os rendimentos confirmados de meses anteriores. Ele rejeitou o
--      cálculo proporcional aos dias. Consequência da regra: uma entrada feita
--      em M rende o mês M inteiro, inclusive no mês de criação da caixinha.
--   A5 (BAIXO) — a conta-carteira podia ser arquivada pelo cliente (sumia das
--      telas e as RPCs continuavam operando). Agora archived_at entra na trava
--      de accounts.
--   A6 (BAIXO) — carteira_criar_caixinha só fazia btrim: aceitava nome feito só
--      de invisíveis ou com controle de direção (U+202E). Agora a RPC limpa o
--      nome como o Zod (src/lib/lista-nomes.ts, limparNome) e também remove
--      marcas e controles de direção, outros invisíveis e caracteres de
--      controle (lista no BLOCO 2), a mesma do esquema Zod da caixinha
--      (src/lib/esquemas-investimentos.ts, que remove a mais U+0000 e
--      surrogates soltos, que o texto do Postgres nem aceita).
--
-- Reproduzido antes desta migration por tests/integration/carteira-rls.sql
-- contra a 00017 aplicada (execução de 2026-11-20): placar 40 de 52,
-- vermelhos C19, C20, R01, R02, R03, R09, R04, R05, R08, S08a (pendente
-- m1 = 1000 na caixinha zerada no dia 1 de m1), S08b e S09. Com esta
-- migration na mesma transação desfeita: 52 de 52.
--
-- Só CREATE OR REPLACE de 3 funções com a mesma assinatura, e o trigger de
-- accounts recriado com a condição nova. CREATE OR REPLACE mantém dono e
-- grants (a rede do BLOCO 4 confere o EXECUTE de carteira_criar_caixinha);
-- assinaturas iguais, então os tipos gerados não mudam. Nenhuma tabela e
-- nenhum dado. 00001..00017 estão aplicadas e são IMUTÁVEIS.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 0 — Pré-condições
--
-- Rendimento confirmado pela regra antiga teria valor diferente pela regra
-- nova; uma conta-carteira já arquivada ficaria presa arquivada. A migration
-- para em vez de conviver com as duas coisas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.investment_box_movements WHERE kind = 'rendimento';
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Migration 00018 abortada: % rendimento(s) já confirmado(s) pela regra antiga. Revise antes.', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM public.investment_wallets w JOIN public.accounts a ON a.id = w.account_id
  WHERE a.archived_at IS NOT NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Migration 00018 abortada: % conta(s)-carteira arquivada(s). Desarquive antes.', v_n;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- BLOCO 1 — A1: rendimento do mês M sobre o saldo do FIM de M
--
-- base = entradas - saídas com data até o último dia de M + rendimentos
--        confirmados de competências anteriores a M;
-- rendimento = base * taxa / 10000, meio centavo para cima (a mesma conta de
--        arredondarMeioParaCima em src/lib/simulador.ts).
-- Taxa: a vigente no último dia de M (histórico investment_box_rates, 00017).
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
  v_fim   date;
BEGIN
  SELECT b.rate_bps INTO v_atual FROM public.investment_boxes b WHERE b.id = p_caixinha_id;
  IF v_atual IS NULL OR p_competencia IS NULL THEN
    RETURN 0;
  END IF;

  v_fim := ((p_competencia + interval '1 month')::date - 1);

  SELECT r.rate_bps INTO v_taxa
  FROM public.investment_box_rates r
  WHERE r.box_id = p_caixinha_id
    AND r.valid_from <= v_fim
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

  -- Saldo no fim de M: saques feitos DENTRO de M reduzem a base de M.
  SELECT COALESCE(sum(CASE
           WHEN m.kind = 'entrada'    AND m.occurred_on <= v_fim        THEN  m.amount_cents
           WHEN m.kind = 'saida'      AND m.occurred_on <= v_fim        THEN -m.amount_cents
           WHEN m.kind = 'rendimento' AND m.competencia <  p_competencia THEN  m.amount_cents
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
-- BLOCO 2 — A6: a RPC limpa o nome como o Zod
--
-- 1) remove os invisíveis de limparNome (U+200B..U+200D, U+2060, U+FEFF,
--    U+00AD) e mais: marcas e controles de direção (U+200E, U+200F, U+061C,
--    U+202A..U+202E, U+2066..U+2069), operadores invisíveis (U+2061..U+2064,
--    e U+2065, não atribuído), preenchimentos Hangul (U+115F, U+1160,
--    U+3164, U+FFA0), U+180E e caracteres de controle que não são espaço
--    (U+0001..U+0008, U+000E..U+001F, U+007F..U+009F). A mesma lista está em
--    DIRECAO_E_CONTROLE, src/lib/esquemas-investimentos.ts;
-- 2) colapsa qualquer sequência de espaço (a classe do \s do JavaScript, sem
--    o U+FEFF, que o passo 1 já removeu) num espaço só, e apara as pontas.
-- Corpo igual ao da 00017, exceto a linha de v_nome e o teste de vazio, que
-- perdeu o "IS NULL" (o COALESCE já troca nulo por '').
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
  v_nome   text := pg_catalog.btrim(
                     pg_catalog.regexp_replace(
                       pg_catalog.regexp_replace(
                         COALESCE(p_nome, ''),
                         '[\x0001-\x0008\x000e-\x001f\x007f-\x009f\xad\x061c\x115f\x1160\x180e\x200b-\x200f\x202a-\x202e\x2060-\x2069\x3164\xfeff\xffa0]',
                         '', 'g'),
                       '[\x0009-\x000d\x0020\xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000]+',
                       ' ', 'g'));
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

  IF pg_catalog.char_length(v_nome) = 0 THEN
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


-- -----------------------------------------------------------------------------
-- BLOCO 3 — A5: a conta-carteira não é arquivada pelo cliente
--
-- O trigger de accounts passa a disparar também quando archived_at muda. Quem
-- passa continua o mesmo da 00017: a chave das RPCs da carteira e
-- service_role/supabase_admin.
-- -----------------------------------------------------------------------------
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
      MESSAGE = 'A conta da carteira de investimento não pode mudar de tipo nem de saldo inicial, nem ser arquivada.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_carteira_congela ON public.accounts;
CREATE TRIGGER trg_accounts_carteira_congela
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW
  WHEN (NEW.type IS DISTINCT FROM OLD.type
        OR NEW.initial_balance IS DISTINCT FROM OLD.initial_balance
        OR NEW.family_id IS DISTINCT FROM OLD.family_id
        OR NEW.archived_at IS DISTINCT FROM OLD.archived_at)
  EXECUTE FUNCTION public.accounts_carteira_congela();


-- -----------------------------------------------------------------------------
-- BLOCO 4 — Rede de proteção
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_src   text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.carteira_rendimento_calculado(uuid, date)'::regprocedure;
  IF v_src !~ 'occurred_on <= v_fim' OR v_src ~ 'occurred_on < p_competencia' THEN
    v_erros := v_erros || ' carteira_rendimento_calculado não usa o saldo do fim do mês;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.carteira_criar_caixinha(text, text, integer, boolean, date)'::regprocedure
                 AND prosecdef AND 'search_path=""' = ANY (proconfig)
                 AND pg_catalog.strpos(prosrc, '\x3164') > 0 AND pg_catalog.strpos(prosrc, '\x200b-\x200f') > 0) THEN
    v_erros := v_erros || ' carteira_criar_caixinha sem limpeza de nome ou deixou de ser DEFINER com search_path vazio;';
  END IF;
  IF has_function_privilege('anon', 'public.carteira_criar_caixinha(text, text, integer, boolean, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.carteira_criar_caixinha(text, text, integer, boolean, date)', 'EXECUTE') THEN
    v_erros := v_erros || ' EXECUTE de carteira_criar_caixinha fora do esperado;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.accounts'::regclass
                 AND tgname = 'trg_accounts_carteira_congela' AND tgenabled = 'O'
                 AND pg_get_triggerdef(oid) ~ 'archived_at') THEN
    v_erros := v_erros || ' trigger trg_accounts_carteira_congela ausente ou sem archived_at;';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid IN ('public.carteira_rendimento_calculado(uuid, date)'::regprocedure,
                                                 'public.accounts_carteira_congela()'::regprocedure)
             AND prosecdef) THEN
    v_erros := v_erros || ' função de cálculo ou da trava virou DEFINER;';
  END IF;

  -- A limpeza de nome, executada: invisíveis + U+202E + U+200F + U+3164 + tab
  -- + controle saem, espaço colapsa.
  IF pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(
       '  Pet' || chr(8238) || chr(8203) || chr(8207) || chr(12644) || chr(160) || chr(9) || 'Teste' || chr(1) || '  ',
       '[\x0001-\x0008\x000e-\x001f\x007f-\x009f\xad\x061c\x115f\x1160\x180e\x200b-\x200f\x202a-\x202e\x2060-\x2069\x3164\xfeff\xffa0]', '', 'g'),
       '[\x0009-\x000d\x0020\xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000]+', ' ', 'g')) <> 'Pet Teste' THEN
    v_erros := v_erros || ' a expressão de limpeza de nome não limpa o caso de referência;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00018 abortada:%', v_erros;
  END IF;
  RAISE NOTICE 'Migration 00018: rendimento sobre o saldo do fim do mês; conta-carteira não arquivável; nome limpo na RPC.';
END $$;
