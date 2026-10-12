-- =============================================================================
-- 00008 — Corrige a contagem de tentativas em join_family
--
-- DEFEITO QUE ESTA MIGRATION CONSERTA (encontrado pelos testes T1/T5/T6 da
-- 00007, no mesmo ciclo, antes de reportar):
--
-- A 00007 colocou em join_family:
--     PERFORM registrar_tentativa_join(...);              -- INSERT
--     RAISE EXCEPTION 'Código de convite não encontrado'; -- aborta a transação
--
-- O RAISE aborta a transação inteira e, com ela, faz ROLLBACK do INSERT da
-- tentativa. Resultado: join_family NUNCA registrava nada e o rate limit dela
-- não existia de fato. family_preview funcionava porque ela retorna
-- normalmente (RETURN, sem exceção) e portanto comita o INSERT.
--
-- Medido no banco real antes de escrever esta migration:
--     3 chamadas a join_family   com código inexistente -> 0 de 3 registradas
--     3 chamadas a family_preview com código inexistente -> 3 de 3 registradas
-- Ou seja: a porta mais perigosa (a que de fato faz o atacante ENTRAR) era a
-- única sem limite. A 00007 entregou a sensação de proteção, não a proteção.
--
-- POR QUE A CORREÇÃO NÃO É "só mover o INSERT": não existe, em plpgsql puro,
-- escrita que sobreviva ao RAISE da própria transação. Bloco EXCEPTION cria
-- savepoint, e savepoint também é desfeito. Transação autônoma exigiria dblink
-- ou pg_background — extensão nova, que o briefing manda evitar.
--
-- A CORREÇÃO: separar GRAVAR de RECUSAR, e checar o limite ANTES de decidir.
--
--   1. tentativas_join_estouradas() (nova, só leitura) é consultada na PRIMEIRA
--      linha das duas RPCs. Se o usuário já estourou, a RPC levanta a mensagem
--      do limite. Essa exceção é segura: as linhas que ela contou foram
--      comitadas por chamadas ANTERIORES, não há nada nesta transação a perder.
--   2. registrar_tentativa_join() deixa de levantar exceção: só grava e limpa.
--   3. No ramo de código inexistente, join_family grava a tentativa e RETORNA
--      ZERO LINHAS, sem RAISE — e é isso que permite o INSERT comitar.
--
-- CONSEQUÊNCIA DE CONTRATO, declarada e não escondida: join_family deixa de
-- levantar 'Código de convite não encontrado' e passa a devolver zero linhas
-- nesse caso. src/actions/familia.ts trata o retorno vazio com
-- falha('Não foi possível entrar na casa. Tente de novo.'), portanto NÃO
-- quebra — mas perde o destaque do campo do convite, que hoje depende de casar
-- aquela mensagem (familia.ts linha 195). O ajuste é de uma linha, em arquivo
-- que não me pertence neste ciclo, e está no contrato de handoff para o front
-- como item BLOQUEANTE.
--
-- O limite passa a valer nas DUAS portas — é o que T1, T5 e T6 provam.
--
-- A 00007 já foi aplicada e é IMUTÁVEL. Nada aqui a edita.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — registrar_tentativa_join deixa de levantar exceção
--
-- Ela volta a ter uma responsabilidade só: GRAVAR a tentativa e limpar o lixo.
-- Quem decide recusar é o chamador, consultando tentativas_join_estouradas().
--
-- Motivo: na 00007 esta função gravava E levantava. Levantar aqui obrigava o
-- chamador a já estar em estado de abortar, o que era justamente a origem do
-- rollback. Separando as duas responsabilidades, a gravação pode comitar.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_tentativa_join(
  p_code   text,
  p_origem text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;

  INSERT INTO join_attempts (user_id, tentou_code, origem)
  VALUES (v_uid, upper(btrim(coalesce(p_code, ''))), p_origem);

  -- Limpeza oportunista: o lixo de ontem sai junto com a tentativa de hoje.
  -- Mantida aqui (e não em pg_cron) pelo motivo registrado na 00007: a tabela
  -- é auto-limitada e pg_cron seria dependência nova.
  DELETE FROM join_attempts
  WHERE tentado_em < now() - interval '24 hours';
END;
$$;

COMMENT ON FUNCTION public.registrar_tentativa_join(text, text) IS
  'Grava UMA tentativa falha de código de convite e limpa registros com mais '
  'de 24h. NÃO decide nada: quem recusa é o chamador, via '
  'tentativas_join_estouradas(). Separar gravar de recusar é o que permite o '
  'INSERT comitar — ver cabeçalho da migration 00008.';

REVOKE EXECUTE ON FUNCTION public.registrar_tentativa_join(text, text)
  FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — tentativas_join_estouradas(): a pergunta "este usuário já abusou?"
--
-- Só LÊ. Chamada no COMEÇO das duas RPCs, antes de qualquer decisão, para que a
-- recusa por limite não dependa de nenhuma escrita na mesma chamada.
--
-- Política (mantida da 00007): 10 falhas por janela deslizante de 1 hora, por
-- usuário. O espaço é 32^6 = 1.073.741.824; a 10 tentativas/hora são 87.600
-- por ano, 0,00816% do espaço — da ordem de 6.000 anos por conta para acertar.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tentativas_join_estouradas()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) >= 10
  FROM join_attempts
  WHERE user_id = (SELECT auth.uid())
    AND tentado_em > now() - interval '1 hour';
$$;

COMMENT ON FUNCTION public.tentativas_join_estouradas() IS
  'true quando o usuário atual já tem 10 ou mais tentativas falhas de código '
  'na última hora (janela deslizante). Só lê; não grava.';

REVOKE EXECUTE ON FUNCTION public.tentativas_join_estouradas()
  FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — join_family: limite ANTES, gravação DEPOIS, sem exceção no fim
--
-- Assinatura idêntica à da 00003/00007. As exceções de 'já faz parte' e
-- 'família completa' continuam exatamente como estavam — elas não gravam nada,
-- então podem abortar à vontade.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_family(
  p_join_code      text,
  p_member_name    text,
  p_monthly_income numeric DEFAULT NULL
)
RETURNS TABLE (family_id uuid, member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_limit     int;
  v_count     int;
  v_member_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado para entrar em uma família';
  END IF;

  -- PRIMEIRA coisa: o usuário já abusou? Esta exceção é segura porque não há
  -- nada gravado nesta transação para perder.
  IF tentativas_join_estouradas() THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente de novo em alguns minutos.';
  END IF;

  IF EXISTS (SELECT 1 FROM family_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Você já faz parte de uma família';
  END IF;

  -- FOR UPDATE serializa duas entradas simultâneas: o limite de membros não é
  -- furado por dois convites aceitos no mesmo instante.
  SELECT f.id, f.member_limit INTO v_family_id, v_limit
  FROM families f
  WHERE f.join_code = upper(btrim(p_join_code))
  FOR UPDATE;

  IF v_family_id IS NULL THEN
    -- Chute. Grava a tentativa e RETORNA VAZIO — sem RAISE, para que o INSERT
    -- comite. É esta linha que faz o rate limit de join_family existir de
    -- verdade; com RAISE aqui (como na 00007) a gravação era desfeita.
    PERFORM registrar_tentativa_join(p_join_code, 'join_family');
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM family_members
  WHERE family_members.family_id = v_family_id;

  IF v_count >= v_limit THEN
    -- Só acontece com código CORRETO. Acerto nunca conta como tentativa.
    RAISE EXCEPTION 'Esta família já está completa';
  END IF;

  INSERT INTO family_members (family_id, user_id, display_name, monthly_income)
  VALUES (v_family_id, v_uid, btrim(p_member_name), p_monthly_income)
  RETURNING id INTO v_member_id;

  INSERT INTO accounts (family_id, owner_member_id, name, type, initial_balance, sort_order)
  VALUES (v_family_id, v_member_id, 'Conta de ' || btrim(p_member_name), 'corrente', 0, 2);

  RETURN QUERY SELECT v_family_id, v_member_id;
END;
$$;

COMMENT ON FUNCTION public.join_family(text, text, numeric) IS
  'Entra na família pelo código de convite, respeitando member_limit. Código '
  'inexistente: grava tentativa falha e retorna ZERO LINHAS (sem exceção, '
  'para que a gravação comite — ver 00008). Limite de 10 falhas/hora é '
  'checado ANTES de tudo e recusa com "Muitas tentativas...". Código correto '
  'nunca conta como tentativa.';

REVOKE EXECUTE ON FUNCTION public.join_family(text, text, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_family(text, text, numeric) TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — family_preview: mesma inversão, mesmo contador
--
-- Contrato externo inalterado: mesmo nome, mesmo parâmetro, mesmas 4 colunas,
-- e código inexistente continua devolvendo zero linhas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.family_preview(p_join_code text)
RETURNS TABLE (name text, member_count int, member_limit int, has_room boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existe boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;

  IF tentativas_join_estouradas() THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente de novo em alguns minutos.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM families f WHERE f.join_code = upper(btrim(p_join_code))
  ) INTO v_existe;

  IF NOT v_existe THEN
    PERFORM registrar_tentativa_join(p_join_code, 'family_preview');
    RETURN;  -- zero linhas, igual à versão original da 00003
  END IF;

  RETURN QUERY
  SELECT
    f.name,
    (SELECT count(*)::int FROM family_members m WHERE m.family_id = f.id),
    f.member_limit,
    (SELECT count(*) FROM family_members m WHERE m.family_id = f.id) < f.member_limit
  FROM families f
  WHERE f.join_code = upper(btrim(p_join_code));
END;
$$;

COMMENT ON FUNCTION public.family_preview(text) IS
  'Mostra nome da casa e vagas antes de entrar, sem vazar dado financeiro. '
  'Código inexistente devolve zero linhas E grava tentativa falha. Limite de '
  '10 falhas/hora checado antes de tudo.';

REVOKE EXECUTE ON FUNCTION public.family_preview(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.family_preview(text) TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — Rede de proteção
--
-- A da 00007 verificava que as RPCs CHAMAM o contador. Isso era verdade e a
-- proteção ainda assim não funcionava — por isso aqui a verificação é outra:
-- que o RAISE de 'não encontrado' SAIU de join_family. Enquanto ele estiver
-- lá, a gravação é desfeita e o limite é teatro.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_def   text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'join_family';

  IF v_def IS NULL THEN
    v_erros := v_erros || ' join_family nao existe;';
  ELSE
    IF v_def LIKE '%Código de convite não encontrado%' THEN
      v_erros := v_erros ||
        ' join_family ainda levanta "nao encontrado" apos gravar: o rollback'
        ' apaga a tentativa e o rate limit nao conta nada;';
    END IF;
    IF v_def NOT LIKE '%registrar_tentativa_join%' THEN
      v_erros := v_erros || ' join_family nao grava tentativa;';
    END IF;
    IF v_def NOT LIKE '%tentativas_join_estouradas%' THEN
      v_erros := v_erros || ' join_family nao checa o limite;';
    END IF;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'family_preview';

  IF v_def NOT LIKE '%tentativas_join_estouradas%' THEN
    v_erros := v_erros || ' family_preview nao checa o limite;';
  END IF;
  IF v_def NOT LIKE '%registrar_tentativa_join%' THEN
    v_erros := v_erros || ' family_preview nao grava tentativa;';
  END IF;

  -- registrar_tentativa_join NÃO pode mais levantar a mensagem do limite:
  -- se levantar, volta o rollback que esta migration conserta.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'registrar_tentativa_join';

  IF v_def LIKE '%Muitas tentativas%' THEN
    v_erros := v_erros ||
      ' registrar_tentativa_join voltou a levantar o limite (causa do rollback);';
  END IF;

  -- search_path fixado em todas as quatro.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('join_family', 'family_preview',
                        'registrar_tentativa_join', 'tentativas_join_estouradas')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  ) THEN
    v_erros := v_erros || ' funcao sem search_path fixado;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00008 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00008: contagem de join_family corrigida e verificada.';
END $$;
