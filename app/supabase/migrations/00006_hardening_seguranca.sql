-- =============================================================================
-- 00006 — Endurecimento de segurança
--
-- Corrige três achados aceitos pela revisão de segurança:
--
--   1. [ALTO]  family_members permitia, em teoria, que um membro trocasse o
--              próprio family_id (mass assignment / fuga de tenant). O bloqueio
--              que existe hoje é consequência acidental da policy de SELECT,
--              não de uma regra explícita de UPDATE.
--   2. [MÉDIO] get_user_family_id(uid) recebia o usuário como PARÂMETRO e era
--              executável por qualquer usuário logado: dava para descobrir a
--              qual família um terceiro pertence. Vazava relação social.
--   3. [MÉDIO] generate_join_code() usava random(), que não é criptográfico:
--              o código de convite é um segredo de autorização e precisa de
--              fonte de entropia imprevisível.
--
-- Esta migration NÃO altera nenhuma tabela, nenhuma coluna e nenhuma assinatura
-- de RPC pública. Ela só troca funções, cria um trigger e recria policies. Por
-- isso não há ALTER TABLE aqui.
--
-- As migrations 00001..00005 já foram aplicadas e são imutáveis. Nada aqui as
-- edita: toda correção é statement novo.
--
-- A migration é idempotente (CREATE OR REPLACE, DROP ... IF EXISTS) e roda
-- inteira numa transação: ou os 6 blocos entram, ou nenhum entra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BLOCO 1 — Helpers de identidade SEM parâmetro
--
-- O problema da versão antiga não era o que ela retornava, era quem ela aceitava
-- como pergunta: recebendo 'uid' de fora, ela respondia sobre QUALQUER pessoa.
-- Nas versões abaixo o usuário não é mais parâmetro — vem de auth.uid(), de
-- dentro do corpo. Deixa de existir a possibilidade de perguntar sobre terceiro.
--
-- Mantidas as mesmas garantias da versão antiga:
--   STABLE           — o resultado não muda dentro da mesma query (permite cache)
--   SECURITY DEFINER — consulta family_members sem disparar o RLS de
--                      family_members, que é o que evitaria recursão infinita
--                      (a policy de family_members chama esta função)
--   SET search_path = public
--                    — impede que um search_path manipulado pelo chamador faça a
--                      função ler uma tabela "family_members" falsa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_family_id_self()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id
  FROM family_members
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_family_id_self() IS
  'Família do usuário logado. Sem parâmetro de propósito: a versão antiga, que '
  'recebia o uid de fora, permitia descobrir a família de terceiros.';

REVOKE EXECUTE ON FUNCTION public.get_user_family_id_self() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_family_id_self() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_member_id_self()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM family_members
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_member_id_self() IS
  'Membro do usuário logado. Sem parâmetro, pelo mesmo motivo acima.';

REVOKE EXECUTE ON FUNCTION public.get_user_member_id_self() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_member_id_self() TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Trigger que congela as colunas estruturais de family_members
--
-- Por que um trigger, e não só a policy do bloco 3:
--
-- A policy de RLS protege o que vem pela API (PostgREST). Ela NÃO protege o que
-- vem de dentro de uma função SECURITY DEFINER — essas funções, por definição,
-- ignoram o RLS das tabelas que tocam. Como todas as RPCs de gravação deste
-- projeto são SECURITY DEFINER, a policy sozinha deixaria o vetor aberto por
-- dentro.
--
-- O trigger roda nos DOIS caminhos. É a camada que não depende de nenhuma
-- policy continuar escrita do jeito certo no futuro — que é exatamente a
-- fragilidade apontada pela revisão: hoje o ataque é barrado de raspão, pela
-- policy de SELECT combinada com o RETURNING do PostgREST, e não por uma regra
-- que diga "isto é proibido".
--
-- Estratégia de lista-NEGRA, de propósito: congelamos as 4 colunas estruturais
-- e deixamos as demais livres. Assim uma coluna de perfil criada no futuro
-- (telefone, preferência, fuso) nasce editável, e não quebra em silêncio; e as
-- 4 colunas abaixo nunca passam a ser editáveis por descuido.
--
-- Colunas que o membro PODE alterar sobre si mesmo: display_name,
-- monthly_income, avatar_url.  (avatar_url editável é decisão de produto
-- confirmada: é dado de perfil pessoal e não há upload moderado no produto.)
-- Colunas congeladas: id, family_id, user_id, joined_at.
--
-- A comparação é por VALOR, não por presença: um UPDATE que reenvia
-- family_id com o MESMO valor passa normalmente. Isso é necessário porque o
-- cliente costuma devolver o objeto inteiro num PATCH.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.family_members_congela_estrutura()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION 'Não é permitido mudar a família de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido mudar o usuário de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é permitido mudar o identificador de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'Não é permitido mudar a data de entrada de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.family_members_congela_estrutura() IS
  'Impede troca de id, family_id, user_id e joined_at em family_members. '
  'Vale também para funções SECURITY DEFINER, que ignoram RLS.';

-- Esta função é gatilho: ninguém a chama diretamente.
REVOKE EXECUTE ON FUNCTION public.family_members_congela_estrutura()
  FROM PUBLIC, anon, authenticated;

-- DROP antes de CREATE deixa a migration repetível sem erro.
DROP TRIGGER IF EXISTS trg_family_members_congela_estrutura ON family_members;

CREATE TRIGGER trg_family_members_congela_estrutura
  BEFORE UPDATE ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.family_members_congela_estrutura();


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Recriação das policies para usar os helpers sem parâmetro
--
-- Ordem importa: os helpers do bloco 1 JÁ existem neste ponto, e a versão antiga
-- (com parâmetro) só perde o EXECUTE no bloco 4, depois que ninguém mais a usa.
-- Em nenhum instante uma policy aponta para função inexistente.
--
-- O (SELECT ...) em volta da função não é enfeite: sem ele o Postgres chama a
-- função uma vez POR LINHA avaliada. Com ele, uma vez por query.
-- Fonte: supabase-postgres-best-practices, security-rls-performance.md.
--
-- Inventário conferido contra o banco real antes desta migration: 32 policies
-- referenciam os helpers com parâmetro (30 em public + 2 em realtime). A 31ª
-- policy de public, family_members_update_self, não usava helper nenhum e passa
-- a usar agora, pela camada (c) do Achado 1. Total recriado aqui: 33.
-- -----------------------------------------------------------------------------

-- families ---------------------------------------------------------------------
DROP POLICY IF EXISTS families_select ON families;
CREATE POLICY families_select ON families
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS families_update ON families;
CREATE POLICY families_update ON families
  FOR UPDATE TO authenticated
  USING      (id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (id = (SELECT public.get_user_family_id_self()));

-- family_members ---------------------------------------------------------------
DROP POLICY IF EXISTS family_members_select ON family_members;
CREATE POLICY family_members_select ON family_members
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- Aqui está a camada (c) do Achado 1. A policy antiga verificava SÓ
-- user_id = auth.uid(), e não dizia nada sobre family_id: a linha resultante
-- podia, em teoria, apontar para outra família. Agora o WITH CHECK exige que a
-- linha, DEPOIS do update, continue sendo deste usuário E desta família.
DROP POLICY IF EXISTS family_members_update_self ON family_members;
CREATE POLICY family_members_update_self ON family_members
  FOR UPDATE TO authenticated
  USING (
    user_id       = (SELECT auth.uid())
    AND family_id = (SELECT public.get_user_family_id_self())
  )
  WITH CHECK (
    user_id       = (SELECT auth.uid())
    AND family_id = (SELECT public.get_user_family_id_self())
  );

-- accounts ---------------------------------------------------------------------
DROP POLICY IF EXISTS accounts_select ON accounts;
CREATE POLICY accounts_select ON accounts
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS accounts_insert ON accounts;
CREATE POLICY accounts_insert ON accounts
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS accounts_update ON accounts;
CREATE POLICY accounts_update ON accounts
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS accounts_delete ON accounts;
CREATE POLICY accounts_delete ON accounts
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- categories -------------------------------------------------------------------
DROP POLICY IF EXISTS categories_select ON categories;
CREATE POLICY categories_select ON categories
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS categories_insert ON categories;
CREATE POLICY categories_insert ON categories
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS categories_update ON categories;
CREATE POLICY categories_update ON categories
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS categories_delete ON categories;
CREATE POLICY categories_delete ON categories
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- payment_methods --------------------------------------------------------------
DROP POLICY IF EXISTS payment_methods_select ON payment_methods;
CREATE POLICY payment_methods_select ON payment_methods
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS payment_methods_insert ON payment_methods;
CREATE POLICY payment_methods_insert ON payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS payment_methods_update ON payment_methods;
CREATE POLICY payment_methods_update ON payment_methods
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS payment_methods_delete ON payment_methods;
CREATE POLICY payment_methods_delete ON payment_methods
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- transactions -----------------------------------------------------------------
DROP POLICY IF EXISTS transactions_select ON transactions;
CREATE POLICY transactions_select ON transactions
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- O autor vem de quem está logado: ninguém lança assinando o nome do outro.
DROP POLICY IF EXISTS transactions_insert ON transactions;
CREATE POLICY transactions_insert ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    family_id = (SELECT public.get_user_family_id_self())
    AND created_by_member_id = (SELECT public.get_user_member_id_self())
  );

DROP POLICY IF EXISTS transactions_update ON transactions;
CREATE POLICY transactions_update ON transactions
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS transactions_delete ON transactions;
CREATE POLICY transactions_delete ON transactions
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- push_subscriptions -----------------------------------------------------------
-- O token do aparelho é privado de cada pessoa: nem o parceiro lê.
DROP POLICY IF EXISTS push_select_own ON push_subscriptions;
CREATE POLICY push_select_own ON push_subscriptions
  FOR SELECT TO authenticated
  USING (member_id = (SELECT public.get_user_member_id_self()));

DROP POLICY IF EXISTS push_insert_own ON push_subscriptions;
CREATE POLICY push_insert_own ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = (SELECT public.get_user_member_id_self())
    AND family_id = (SELECT public.get_user_family_id_self())
  );

DROP POLICY IF EXISTS push_delete_own ON push_subscriptions;
CREATE POLICY push_delete_own ON push_subscriptions
  FOR DELETE TO authenticated
  USING (member_id = (SELECT public.get_user_member_id_self()));

-- account_goals ----------------------------------------------------------------
DROP POLICY IF EXISTS account_goals_select ON account_goals;
CREATE POLICY account_goals_select ON account_goals
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS account_goals_insert ON account_goals;
CREATE POLICY account_goals_insert ON account_goals
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS account_goals_update ON account_goals;
CREATE POLICY account_goals_update ON account_goals
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS account_goals_delete ON account_goals;
CREATE POLICY account_goals_delete ON account_goals
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- category_budgets -------------------------------------------------------------
DROP POLICY IF EXISTS category_budgets_select ON category_budgets;
CREATE POLICY category_budgets_select ON category_budgets
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS category_budgets_insert ON category_budgets;
CREATE POLICY category_budgets_insert ON category_budgets
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS category_budgets_update ON category_budgets;
CREATE POLICY category_budgets_update ON category_budgets
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS category_budgets_delete ON category_budgets;
CREATE POLICY category_budgets_delete ON category_budgets
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- -----------------------------------------------------------------------------
-- realtime.messages — canais de presença e broadcast
--
-- Estas duas policies NÃO estão em 00002: vieram de 00005, em outro schema.
-- Esquecê-las aqui faria o tempo real parar de funcionar em silêncio depois do
-- REVOKE do bloco 4 — sem erro de build e sem erro no teste de RLS.
--
-- No Supabase hospedado a tabela realtime.messages pertence à plataforma:
-- ALTER TABLE nela falha com 42501, mas CREATE/DROP POLICY funcionam. Por isso
-- aqui NÃO existe nenhum ALTER TABLE — só policy. (Mesmo padrão de 00005.)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS realtime_family_topics_read  ON realtime.messages;
CREATE POLICY realtime_family_topics_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    split_part(realtime.topic(), ':', 2) =
      (SELECT public.get_user_family_id_self())::text
  );

DROP POLICY IF EXISTS realtime_family_topics_write ON realtime.messages;
CREATE POLICY realtime_family_topics_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    split_part(realtime.topic(), ':', 2) =
      (SELECT public.get_user_family_id_self())::text
  );

-- -----------------------------------------------------------------------------
-- delete_transactions — a única RPC que chamava um helper com parâmetro
--
-- Corpo idêntico ao de 00003_functions.sql, trocando SOMENTE a primeira linha
-- do DECLARE. A assinatura (uuid, text) e o DEFAULT 'single' não mudam — por
-- isso o CREATE OR REPLACE é seguro e os tipos gerados não mudam.
-- A lógica de série (recurrence_parent_id) está preservada integralmente.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_transactions(p_id uuid, p_scope text DEFAULT 'single')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid := public.get_user_family_id_self();
  v_parent    uuid;
  v_deleted   int;
BEGIN
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_scope NOT IN ('single', 'series') THEN
    RAISE EXCEPTION 'Escopo inválido';
  END IF;

  IF p_scope = 'series' THEN
    SELECT COALESCE(t.recurrence_parent_id, t.id) INTO v_parent
    FROM transactions t
    WHERE t.id = p_id AND t.family_id = v_family_id;

    IF v_parent IS NULL THEN
      RAISE EXCEPTION 'Lançamento não encontrado';
    END IF;

    DELETE FROM transactions t
    WHERE t.family_id = v_family_id
      AND (t.id = v_parent OR t.recurrence_parent_id = v_parent);
  ELSE
    DELETE FROM transactions t
    WHERE t.id = p_id AND t.family_id = v_family_id;
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_transactions(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION delete_transactions(uuid, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — Fechar o oráculo de pertencimento
--
-- Neste ponto NADA mais usa a versão com parâmetro: as 33 policies e a RPC
-- delete_transactions já foram recriadas acima, na mesma transação.
--
-- Revogamos o EXECUTE em vez de dar DROP de propósito:
--   - DROP exigiria CASCADE se qualquer objeto ainda dependesse da função, e
--     CASCADE contra o banco do cliente é inaceitável;
--   - REVOKE já resolve o achado, que é "usuário LOGADO consegue perguntar
--     sobre terceiro". Sem EXECUTE, não consegue mais.
-- A função continua existindo e chamável pelo owner.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_user_family_id(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_member_id(uuid) FROM authenticated;

COMMENT ON FUNCTION public.get_user_family_id(uuid) IS
  'OBSOLETA — não chame. Recebia o usuário como parâmetro e permitia descobrir '
  'a família de terceiros. Use get_user_family_id_self(). Mantida sem EXECUTE '
  'para authenticated apenas para não exigir DROP CASCADE.';

COMMENT ON FUNCTION public.get_user_member_id(uuid) IS
  'OBSOLETA — não chame. Use get_user_member_id_self().';


-- -----------------------------------------------------------------------------
-- BLOCO 5 — Código de convite com fonte de entropia criptográfica
--
-- random() é um gerador pseudoaleatório: a sequência é determinada pelo estado
-- da sessão e é previsível para quem conhece esse estado. O código de convite
-- não é enfeite — é o segredo que autoriza alguém a entrar na família e ver a
-- vida financeira do casal. Segredo precisa de fonte imprevisível.
--
-- gen_random_bytes() vem do pgcrypto (já instalado em 00001) e usa o gerador
-- criptográfico do sistema.
--
-- ATENÇÃO — por que a chamada é QUALIFICADA como extensions.gen_random_bytes:
-- no Supabase hospedado o pgcrypto é instalado no schema 'extensions', NÃO em
-- 'public'. Com SET search_path = public (que é obrigatório aqui, por segurança)
-- uma chamada não qualificada a gen_random_bytes() NÃO resolve e a função falha
-- em tempo de execução. Verificado contra o banco real:
--   search_path = public  → to_regprocedure('gen_random_bytes(integer)') = NULL
--                         → to_regprocedure('extensions.gen_random_bytes(integer)')
--                           = extensions.gen_random_bytes(integer)
-- gen_random_uuid(), usada em 00001 sem qualificar, funciona por outro motivo:
-- no PG13+ ela também existe em pg_catalog, que está sempre no caminho.
--
-- Mantivemos 6 caracteres de propósito:
--   - o achado é a FONTE de entropia, não o comprimento; 6 caracteres sobre um
--     charset de 32 com entropia real dão ~30 bits, adequado para um código de
--     convite de vida curta;
--   - o código é digitado à mão pelo parceiro no onboarding, o passo manual
--     mais sensível do produto: 12 caracteres dobrariam o erro de digitação;
--   - a defesa contra ENUMERAÇÃO é rate limiting em family_preview/join_family,
--     não comprimento. Sem rate limit, 12 também cai; com rate limit, 6 basta.
--     O rate limiting está registrado como pendência de produto (P-001).
--   - como o comprimento não muda, o CHECK (join_code ~ '^[A-Z2-9]{6}$') de
--     00001 continua válido e NÃO precisamos de ALTER TABLE numa tabela que já
--     tem dados do cliente.
--
-- Sobre o viés de módulo: o charset tem EXATAMENTE 32 caracteres, e 32 divide
-- 256 sem resto. Por isso (get_byte(...) % 32) é uniforme e não há viés.
-- ATENÇÃO a quem mexer nisto depois: mudar o charset para um tamanho que NÃO
-- divida 256 (por exemplo 30 ou 36) reintroduz viés e exige rejeição por
-- amostragem. Mantenha 32, ou troque o algoritmo junto.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 chars, sem 0/O/1/I
  bytes   bytea;
  code    text := '';
  i       int;
BEGIN
  -- Um byte por caractere, de uma vez: uma chamada ao gerador, não seis.
  -- Qualificada de propósito: ver o comentário do bloco acima.
  bytes := extensions.gen_random_bytes(6);

  FOR i IN 0..5 LOOP
    code := code || substr(charset, (get_byte(bytes, i) % 32) + 1, 1);
  END LOOP;

  RETURN code;
END;
$$;

COMMENT ON FUNCTION public.generate_join_code() IS
  'Gera código de convite de 6 caracteres usando gen_random_bytes (pgcrypto). '
  'Charset de 32 sem caracteres ambíguos. Chamada apenas por create_family.';

-- Mesmo grant de 00003: ninguém chama de fora, só create_family chama.
REVOKE EXECUTE ON FUNCTION public.generate_join_code() FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 6 — Rede de proteção: a migration se recusa a terminar se sobrou
-- qualquer policy ou função ainda apontando para os helpers com parâmetro.
--
-- Sem isto, esquecer uma policy (as de realtime.messages são as mais fáceis de
-- esquecer, porque vieram de outra migration e de outro schema) produziria uma
-- quebra silenciosa em produção: o canal de tempo real simplesmente pararia de
-- entregar, sem erro de build e sem teste vermelho.
--
-- Os dois regex abaixo foram EXECUTADOS contra as expressões reais devolvidas
-- por pg_get_expr e contra o prosrc real de delete_transactions antes de esta
-- migration ser aplicada: 13/13 casos conforme o esperado.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_policies text;
  v_funcs    text;
BEGIN
  SELECT string_agg(format('%s.%s/%s', n.nspname, c.relname, pol.polname), ', ')
    INTO v_policies
  FROM pg_policy pol
  JOIN pg_class     c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE COALESCE(pg_get_expr(pol.polqual,      pol.polrelid), '') ~ 'get_user_(family|member)_id\('
     OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'get_user_(family|member)_id\(';

  IF v_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Policies ainda usam o helper com parâmetro: %', v_policies;
  END IF;

  SELECT string_agg(format('%s.%s', n.nspname, p.proname), ', ')
    INTO v_funcs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname NOT IN ('get_user_family_id', 'get_user_member_id')
    AND p.prosrc ~ 'get_user_(family|member)_id\s*\(\s*[^)]';

  IF v_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'Funções ainda chamam o helper com parâmetro: %', v_funcs;
  END IF;

  -- O oráculo tem de estar fechado para authenticated neste ponto.
  IF has_function_privilege('authenticated',
       'public.get_user_family_id(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_user_family_id(uuid) ainda é executável por authenticated';
  END IF;

  IF has_function_privilege('authenticated',
       'public.get_user_member_id(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_user_member_id(uuid) ainda é executável por authenticated';
  END IF;

  -- E as versões _self() têm de estar executáveis, senão o app inteiro cai.
  IF NOT has_function_privilege('authenticated',
       'public.get_user_family_id_self()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_user_family_id_self() não é executável por authenticated';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.get_user_member_id_self()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_user_member_id_self() não é executável por authenticated';
  END IF;

  -- O trigger do bloco 2 tem de existir e estar habilitado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'family_members'
      AND t.tgname = 'trg_family_members_congela_estrutura'
      AND NOT t.tgisinternal
      AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Trigger trg_family_members_congela_estrutura ausente ou desabilitado';
  END IF;

  -- generate_join_code tem de produzir código no formato do CHECK de 00001.
  -- Prova dentro da própria migration: se o gerador novo estiver errado
  -- (por exemplo gen_random_bytes não resolvível), a migration aborta aqui
  -- em vez de quebrar create_family para o cliente.
  FOR i IN 1..20 LOOP
    IF public.generate_join_code() !~ '^[A-Z2-9]{6}$' THEN
      RAISE EXCEPTION 'generate_join_code() gerou código fora de ^[A-Z2-9]{6}$';
    END IF;
  END LOOP;
END $$;
