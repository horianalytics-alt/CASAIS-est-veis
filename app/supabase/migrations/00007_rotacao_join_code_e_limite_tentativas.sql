-- =============================================================================
-- 00007 — Rotação do join_code e limite de tentativas
--
-- O join_code é o segredo que concede acesso às finanças da casa. Até aqui ele
-- tinha dois buracos:
--
--   1. [ALTO] NÃO ROTACIONAVA. Um código que vazou (print, foto no WhatsApp,
--      mensagem encaminhada) valia para sempre. Não havia como o dono
--      invalidá-lo. O único remédio era apagar a família.
--
--   2. [ALTO] NÃO TINHA LIMITE DE TENTATIVAS. São 6 caracteres num alfabeto de
--      32 = 32^6 = 1.073.741.824 combinações (~30 bits). Isso só é defesa
--      enquanto o atacante paga por tentativa. Com tentativas ilimitadas via
--      family_preview/join_family, 30 bits caem.
--
--      Hoje o que de fato segura um atacante é member_limit = 2: a casa cheia
--      recusa entrada em join_family ('Esta família já está completa'). Essa
--      proteção É ACIDENTAL e DESAPARECE no dia em que o app abrir para
--      famílias maiores — numa casa de 6 com vaga livre, quem acertar o código
--      ENTRA e passa a ver os lançamentos.
--
-- DECISÃO DE ESCOPO (do Heitor, registrada aqui porque muda a leitura do
-- Achado 2): NÃO aumentamos o comprimento do código. O código é o único passo
-- manual do onboarding — é digitado no celular pelo parceiro — e comprimento
-- não fecha o buraco: quem tem tentativas ilimitadas acha código de qualquer
-- tamanho. A defesa correta é LIMITE DE TENTATIVAS (torna o espaço de 1,07
-- bilhão caro de varrer) + ROTAÇÃO (torna o vazamento reversível). É isso que
-- esta migration constrói. O CHECK permanece '^[A-Z2-9]{6}$', intocado: assim
-- não há ALTER TABLE em tabela com dados reais do cliente.
--
-- As migrations 00001..00006 já foram aplicadas e são IMUTÁVEIS. Nada aqui as
-- edita: toda correção é statement novo. join_family e family_preview são
-- recriadas com CREATE OR REPLACE, mantendo assinatura idêntica (mesmo nome,
-- mesmos parâmetros, mesmo tipo de retorno), para não quebrar o app que está
-- EM PRODUÇÃO durante a janela entre o db push e o deploy da Vercel.
--
-- A migration é idempotente (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE,
-- DROP ... IF EXISTS) e roda inteira numa transação: ou os 5 blocos entram, ou
-- nenhum entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — join_attempts: o contador de tentativas
--
-- Por que tabela e não um contador em memória: a app roda em função serverless
-- na Vercel, sem estado compartilhado entre invocações. Rate limit que vive no
-- processo não existe — a próxima requisição cai em outra instância. O estado
-- tem de ficar no banco.
--
-- Por que contamos por user_id e não por IP: o IP não chega até aqui (o
-- PostgREST não o repassa ao Postgres) e é trocável de graça. O user_id, sim,
-- chega — via auth.uid() — e tem custo: criar conta exige e-mail confirmado.
-- Isso é possível porque as duas RPCs já têm o grant de 'anon' REVOGADO
-- (00003), ou seja, quem chama está sempre autenticado. Verificado contra o
-- banco real antes desta migration:
--   anon -> family_preview: 42501 permission denied for function family_preview
--   anon -> join_family:    42501 permission denied for function join_family
--
-- RLS: o usuário NÃO pode ler nem apagar as próprias tentativas. A tabela tem
-- RLS habilitado e ZERO policies para authenticated — o que, em Postgres,
-- significa "nega tudo". Isso é deliberado e não é o erro clássico de
-- habilitar RLS e esquecer a policy:
--   - ler o próprio contador entregaria ao atacante o oráculo "quantas
--     tentativas ainda tenho", que é metade do trabalho de contornar o limite;
--   - apagar entregaria o contorno inteiro.
-- Quem escreve e lê é só a função SECURITY DEFINER, que roda como owner e
-- portanto passa por cima do RLS. O REVOKE abaixo fecha também o caminho do
-- Data API, que é independente do RLS.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.join_attempts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Guardamos o código TENTADO para poder investigar um ataque depois (qual
  -- faixa do espaço o atacante varreu). Não é segredo de ninguém: é justamente
  -- um código que NÃO existe. Nunca guardamos o código que ACERTOU.
  tentou_code text        NOT NULL,
  -- Qual das duas portas foi usada. Serve para diagnóstico: um atacante
  -- esperto varre por family_preview, que é mais barata.
  origem      text        NOT NULL CHECK (origem IN ('family_preview', 'join_family')),
  tentado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.join_attempts IS
  'Tentativas FALHAS de usar um código de convite, por usuário. Base do rate '
  'limit de family_preview e join_family. Tentativa bem-sucedida NÃO é '
  'registrada aqui: o limite pune quem erra, nunca quem acerta. Escrita e '
  'lida apenas pelas funções SECURITY DEFINER; o usuário não lê nem apaga.';

COMMENT ON COLUMN public.join_attempts.tentou_code IS
  'Código que falhou. Por definição não corresponde a nenhuma família.';

-- Índice que serve EXATAMENTE a query do rate limit:
--   WHERE user_id = ? AND tentado_em > now() - interval '1 hour'
-- Igualdade primeiro, faixa depois — ordem obrigatória para a regra do prefixo
-- mais à esquerda valer. Fonte: supabase-postgres-best-practices,
-- query-composite-indexes.md ("place equality columns first, range columns
-- last"). Sem ele a contagem faria seq scan a cada chamada de join_family.
CREATE INDEX IF NOT EXISTS join_attempts_user_tempo_idx
  ON public.join_attempts (user_id, tentado_em DESC);

ALTER TABLE public.join_attempts ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso pelo Data API, para nenhum dos dois roles públicos. O RLS
-- acima já negaria as linhas; este REVOKE nega a TABELA. São camadas
-- diferentes e as duas são necessárias. Fonte: skill supabase, "Exposing
-- tables to the Data API" — grant de tabela é independente de RLS.
REVOKE ALL ON public.join_attempts FROM anon, authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — registrar_tentativa_join: o coração do rate limit
--
-- Uma função só, chamada pelas duas RPCs, para que as duas portas somem no
-- MESMO contador. Se cada uma tivesse o seu, o atacante teria 2x o orçamento
-- de tentativas só por alternar entre elas.
--
-- POLÍTICA DECIDIDA: 10 tentativas FALHAS por janela deslizante de 1 hora, por
-- usuário. Ao estourar, a RPC levanta exceção com a mensagem em português
-- 'Muitas tentativas. Tente de novo em alguns minutos.'
--
-- Por que 10/hora, e por que isso basta: o espaço é 32^6 = 1.073.741.824. A
-- 10 tentativas/hora, um usuário faz 87.600 tentativas por ano, ou seja cobre
-- 0,00816% do espaço por ano — a expectativa para acertar um código é da ordem
-- de 6.000 anos por conta. O atacante que quiser paralelizar tem de criar
-- contas: cada conta custa um e-mail confirmado, e são ~12.260 contas-ano para
-- 10% de chance. Isso transforma "30 bits é pouco" em "30 bits é caro", que é
-- precisamente o efeito que comprimento maior NÃO entregaria sozinho.
--
-- Por que a janela é DESLIZANTE e não um balde que zera na hora cheia: balde
-- fixo permite 20 tentativas em dois minutos, se o atacante encostar as 10 no
-- fim de uma hora e as 10 seguintes no começo da próxima. A janela deslizante
-- (tentado_em > now() - interval) não tem essa borda.
--
-- Por que a tentativa BEM-SUCEDIDA não conta: o caminho legítimo é a Carol
-- digitando o código UMA vez e entrando. Quem acerta nunca chega perto do
-- limite. Contar acerto só criaria uma forma de o usuário honesto se trancar
-- fora de casa.
--
-- LIMPEZA — decisão: DELETE oportunista aqui dentro, NÃO pg_cron.
--   - pg_cron adiciona uma extensão e um job agendado a um projeto que hoje
--     não usa nenhum dos dois (conferido: grep por 'pg_cron\|cron\.' em
--     00001..00006 retorna vazio). É dependência nova para varrer uma tabela
--     que nunca passa de algumas dezenas de linhas.
--   - a tabela é auto-limitada: cada usuário só consegue inserir 10 linhas por
--     hora, e o DELETE abaixo apaga tudo que passou de 24h a cada chamada.
--     Nenhuma linha sobrevive mais de um dia depois da última tentativa.
--   - 24h (e não 1h) para que o registro ainda sirva de diagnóstico de ataque
--     depois de a janela do limite já ter passado.
-- Fonte da preferência pelo mais simples: a instrução do briefing ("decida
-- pelo mais simples que funcione — pg_cron adiciona dependência").
--
-- SECURITY DEFINER porque precisa escrever em join_attempts, tabela onde
-- authenticated não tem grant nenhum. search_path fixado para que um
-- search_path manipulado pelo chamador não a faça escrever numa
-- 'join_attempts' falsa. REVOKE de todos: ninguém chama de fora, só
-- join_family e family_preview chamam.
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
  v_uid    uuid := auth.uid();
  v_falhas int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;

  INSERT INTO join_attempts (user_id, tentou_code, origem)
  VALUES (v_uid, upper(btrim(coalesce(p_code, ''))), p_origem);

  -- Limpeza oportunista: o lixo de ontem sai junto com a tentativa de hoje.
  DELETE FROM join_attempts
  WHERE tentado_em < now() - interval '24 hours';

  SELECT count(*) INTO v_falhas
  FROM join_attempts
  WHERE user_id = v_uid
    AND tentado_em > now() - interval '1 hour';

  IF v_falhas > 10 THEN
    RAISE EXCEPTION 'Muitas tentativas. Tente de novo em alguns minutos.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.registrar_tentativa_join(text, text) IS
  'Registra UMA tentativa falha de código de convite e levanta exceção quando '
  'o usuário passa de 10 falhas em 1 hora (janela deslizante). Chamada apenas '
  'por join_family e family_preview.';

REVOKE EXECUTE ON FUNCTION public.registrar_tentativa_join(text, text)
  FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — rotacionar_join_code: o dono invalida o código vazado
--
-- SEM PARÂMETRO, de propósito. A família sai de auth.uid() aqui dentro, pelo
-- mesmo motivo que os helpers _self() da 00006 deixaram de receber uid: uma
-- função que aceita family_id de fora responde sobre QUALQUER família. Como
-- esta função ESCREVE, aceitar family_id seria pior que um oráculo — seria
-- deixar qualquer pessoa autenticada rotacionar o código da casa alheia,
-- trancando a família fora do próprio convite (negação de serviço) e, pior,
-- trocando o código por um que o atacante acabou de ver retornar.
--
-- QUEM PODE ROTACIONAR — decisão: QUALQUER MEMBRO da família.
-- Justificativa: hoje não existe conceito de "dono" em family_members (não há
-- coluna de role nem de criador — conferido em 00001). Criar essa hierarquia
-- agora significaria ALTER TABLE em tabela com dados do cliente, uma coluna
-- nova para backfill e uma regra de negócio ("quem é o dono?") que ninguém
-- pediu. O produto são duas pessoas que dividem as contas da casa e confiam
-- uma na outra: ambas podem renomear a família e editar lançamento (policies
-- families_update e as de transactions, da 00002/00006), então ambas já têm
-- poder equivalente. Rotacionar o convite é menos destrutivo que renomear a
-- casa. Não há ganho de segurança em restringir, e há perda de usabilidade
-- real: se o celular do "dono" quebrar, ninguém mais consegue girar o código.
-- O dia em que existir papel de administrador, esta função ganha a checagem —
-- e o lugar dela já está marcado por este comentário.
--
-- A rotação é segura contra quem NÃO é da família por construção: não há o que
-- passar. get_user_family_id_self() devolve a família de quem chamou, e só.
-- Quem não está em família nenhuma recebe exceção.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rotacionar_join_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_family_id uuid;
  v_code      text;
  v_attempts  int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Você precisa estar logado';
  END IF;

  -- A mesma fonte de verdade que as policies usam, pelo mesmo caminho.
  SELECT family_id INTO v_family_id
  FROM family_members
  WHERE user_id = v_uid;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de uma família';
  END IF;

  -- Serializa duas rotações simultâneas (os dois do casal apertando o botão no
  -- mesmo segundo): sem o lock, as duas poderiam gerar códigos diferentes e
  -- uma sobrescreveria a outra, deixando um dos dois olhando um código que já
  -- não vale. Com o lock, a segunda espera e devolve o código final.
  PERFORM 1 FROM families WHERE id = v_family_id FOR UPDATE;

  -- Mesmo laço de retentativa de create_family (00003): gen_random_bytes pode,
  -- por azar, repetir um código já emitido, e join_code é UNIQUE. Sem o laço, a
  -- colisão viraria erro na cara do usuário em vez de um segundo sorteio.
  LOOP
    v_code := generate_join_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM families WHERE families.join_code = v_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar um código de convite';
    END IF;
  END LOOP;

  UPDATE families SET join_code = v_code WHERE id = v_family_id;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.rotacionar_join_code() IS
  'Troca o código de convite da família de quem chama por um novo, invalidando '
  'o anterior. Sem parâmetro: a família vem de auth.uid(), nunca de fora. '
  'Qualquer membro pode chamar — não existe papel de dono neste schema e os '
  'dois membros já têm poder equivalente sobre a casa. Retorna o código novo.';

REVOKE EXECUTE ON FUNCTION public.rotacionar_join_code() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rotacionar_join_code() TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — join_family com limite de tentativas
--
-- Assinatura IDÊNTICA à da 00003 (join_family(text, text, numeric) RETURNS
-- TABLE (family_id uuid, member_id uuid)). O app em produção continua chamando
-- igual durante a janela entre o db push e o deploy.
--
-- Onde o limite entra: SÓ no ramo em que o código NÃO existe. Os outros dois
-- motivos de recusa — 'já faz parte de uma família' e 'família já está
-- completa' — NÃO contam tentativa, porque não são chute de código:
--   - 'já faz parte' é o usuário no lugar errado da UI, com um código que pode
--     muito bem ser o certo;
--   - 'família completa' só acontece com código CORRETO, e acerto nunca pune.
--     (É também o que o caso 7 do rls-isolation.mjs exercita: o usuário A, já
--     em família, tenta o código REAL de B. Código real = nenhuma tentativa
--     registrada.)
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

  IF EXISTS (SELECT 1 FROM family_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Você já faz parte de uma família';
  END IF;

  -- FOR UPDATE serializa duas entradas simultâneas: o limite não é furado
  -- por dois convites aceitos no mesmo instante.
  SELECT f.id, f.member_limit INTO v_family_id, v_limit
  FROM families f
  WHERE f.join_code = upper(btrim(p_join_code))
  FOR UPDATE;

  IF v_family_id IS NULL THEN
    -- Chute. Registra e, se foi o 11º da hora, recusa com a mensagem do
    -- limite em vez da mensagem de código não encontrado.
    PERFORM registrar_tentativa_join(p_join_code, 'join_family');
    RAISE EXCEPTION 'Código de convite não encontrado';
  END IF;

  SELECT count(*) INTO v_count FROM family_members WHERE family_members.family_id = v_family_id;

  IF v_count >= v_limit THEN
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
  'inexistente conta como tentativa falha (rate limit de 10/hora); código '
  'correto nunca conta.';

-- Grants repetidos de propósito: CREATE OR REPLACE preserva os grants, mas
-- repetir deixa a migration autossuficiente se alguém a reaplicar num banco
-- onde a função não existia.
REVOKE EXECUTE ON FUNCTION public.join_family(text, text, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_family(text, text, numeric) TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — family_preview com limite de tentativas
--
-- Esta era a porta BARATA para enumerar: devolve nome da casa e vagas, não
-- exige nome de membro, e podia ser chamada à vontade. É a que um atacante
-- usaria para varrer o espaço e só depois chamar join_family no código que
-- acertou.
--
-- MUDANÇA DE LINGUAGEM: era LANGUAGE sql, agora é plpgsql. Função sql não tem
-- corpo imperativo — não dá para registrar a tentativa e decidir entre dois
-- caminhos dentro dela. O CONTRATO EXTERNO não muda: mesmo nome, mesmo
-- parâmetro, mesmo RETURNS TABLE (name text, member_count int,
-- member_limit int, has_room boolean), e os mesmos valores nas mesmas colunas.
-- Perde-se a possibilidade de inline da função sql, irrelevante aqui: é uma
-- chamada pontual de onboarding, não uma query de lista.
--
-- Comportamento no código inexistente: continua devolvendo ZERO LINHAS, como a
-- versão sql fazia (o WHERE não casava nada). Não trocamos por exceção, porque
-- o front hoje trata "sem linha" como "código não encontrado" e mexer nisso
-- quebraria a tela de onboarding em produção. A diferença é que agora a
-- tentativa foi contada — e, no 11º chute da hora, o RAISE do limite sobe e o
-- usuário recebe erro em vez de lista vazia.
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

  SELECT EXISTS (
    SELECT 1 FROM families f WHERE f.join_code = upper(btrim(p_join_code))
  ) INTO v_existe;

  IF NOT v_existe THEN
    -- Chute: conta e, no estouro, recusa.
    PERFORM registrar_tentativa_join(p_join_code, 'family_preview');
    RETURN;  -- zero linhas, igual à versão anterior
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
  'Código inexistente devolve zero linhas E conta como tentativa falha (rate '
  'limit de 10/hora), porque esta era a porta barata para enumerar códigos.';

REVOKE EXECUTE ON FUNCTION public.family_preview(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.family_preview(text) TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 6 — Rede de proteção: a migration se recusa a terminar se alguma peça
-- do rate limit não ficou de pé.
--
-- Sem isto, um erro de digitação em nome de função produziria uma migration
-- "aplicada com sucesso" e um rate limit que nunca conta nada — falha que só
-- apareceria no dia do ataque, quando ninguém está olhando.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
BEGIN
  -- 1. join_family e family_preview realmente chamam o contador?
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'join_family'
      AND pg_get_functiondef(p.oid) LIKE '%registrar_tentativa_join%'
  ) THEN
    v_erros := v_erros || ' join_family nao chama registrar_tentativa_join;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'family_preview'
      AND pg_get_functiondef(p.oid) LIKE '%registrar_tentativa_join%'
  ) THEN
    v_erros := v_erros || ' family_preview nao chama registrar_tentativa_join;';
  END IF;

  -- 2. rotacionar_join_code existe e NÃO aceita parâmetro (se aceitasse,
  --    viraria o vetor para rotacionar código de família alheia).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rotacionar_join_code'
      AND p.pronargs = 0
  ) THEN
    v_erros := v_erros || ' rotacionar_join_code ausente ou com parametro;';
  END IF;

  -- 3. RLS ligado em join_attempts.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'join_attempts' AND c.relrowsecurity
  ) THEN
    v_erros := v_erros || ' join_attempts sem RLS;';
  END IF;

  -- 4. join_attempts NÃO tem policy para authenticated — a negação total é
  --    intencional aqui, e uma policy acrescentada por engano viraria o
  --    oráculo "quantas tentativas me restam".
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'join_attempts'
  ) THEN
    v_erros := v_erros || ' join_attempts ganhou policy (deve ter zero);';
  END IF;

  -- 5. As três funções novas/alteradas têm search_path fixado.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('rotacionar_join_code', 'registrar_tentativa_join',
                        'join_family', 'family_preview')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  ) THEN
    v_erros := v_erros || ' funcao sem search_path fixado;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00007 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00007: rate limit e rotacao verificados.';
END $$;
