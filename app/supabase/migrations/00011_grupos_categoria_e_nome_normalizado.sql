-- =============================================================================
-- 00011 — Grupos de categoria + nome normalizado nos índices únicos (P-008)
--
-- O QUE ENTRA:
--   1. public.chave_nome(text): a normalização de nome que o banco usa nos
--      índices únicos. Espelho exato de chaveDeComparacao() em
--      src/lib/lista-nomes.ts.
--   2. public.category_groups: grupo ("pasta") de categorias da família.
--   3. categories.group_id: no máximo UM grupo por categoria, ou nenhum.
--   4. P-008 (Sentinela R4): os índices únicos de categories e payment_methods
--      passam a usar chave_nome() em vez de lower(btrim(name)).
--
-- Plano: docs/planos/estrutura-grupos-categoria.md.
-- 00001..00010 estão aplicadas e são IMUTÁVEIS: tudo aqui é statement novo.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — chave_nome(): quando dois nomes são "o mesmo"
--
-- P-008: o índice da 00009 usava lower(btrim(name)). Ele só pegava caixa e
-- espaço comum nas pontas; tab, espaço duplo interno, acento e zero-width
-- passavam como nomes "diferentes" que são a mesma palavra na tela.
--
-- Ordem (idêntica à de chaveDeComparacao):
--   1. remove invisíveis: U+200B..U+200D, U+2060, U+FEFF, U+00AD
--   2. decompõe em NFD (o "ú" vira "u" + acento solto)
--   3. remove as marcas combinantes U+0300..U+036F (os acentos soltos)
--   4. colapsa espaço em um espaço só
--   5. apara as pontas e põe em minúscula
--
-- Por que não a extensão unaccent: expressão de índice exige função IMMUTABLE
-- e unaccent() é STABLE (depende de dicionário e de search_path); além disso
-- ela não está instalada neste projeto. normalize() é IMMUTABLE (provolatile
-- 'i', conferido no banco hospedado).
--
-- Por que a classe de espaço é EXPLÍCITA e não \s: o \s do Postgres, fora do
-- ASCII, segue o locale do servidor. A lista abaixo é exatamente o \s do
-- JavaScript (tab, LF, VT, FF, CR, espaço, U+00A0, U+1680, U+2000..U+200A,
-- U+2028, U+2029, U+202F, U+205F, U+3000; o U+FEFF já saiu no passo 1). Com a
-- lista fixa, a função é imutável de verdade, e não só declarada como tal.
--
-- Paridade JS x SQL provada antes desta migration em 20 casos (zero-width no
-- meio e na ponta, BOM, NBSP, em space, acento composto e decomposto, acento
-- solto entre espaços, CRLF, soft hyphen, word joiner): 20/20.
--
-- ATENÇÃO: esta função faz parte de 3 índices únicos. Mudar o corpo dela exige
-- migration nova + REINDEX dos três — e a mesma mudança em lista-nomes.ts.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chave_nome(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.lower(
           pg_catalog.btrim(
             pg_catalog.regexp_replace(
               pg_catalog.regexp_replace(
                 pg_catalog.normalize(
                   pg_catalog.regexp_replace(p_nome, '[\x200b-\x200d\x2060\xfeff\xad]', '', 'g'),
                   'NFD'),
                 '[\x0300-\x036f]', '', 'g'),
               '[\t\n\v\f\r \xa0\x1680\x2000-\x200a\x2028\x2029\x202f\x205f\x3000]+', ' ', 'g'),
             ' '));
$$;

COMMENT ON FUNCTION public.chave_nome(text) IS
  'Chave de comparação de nome (sem caixa, acento, invisível e espaço extra). '
  'Usada nos índices únicos de categories, payment_methods e category_groups. '
  'Espelho de chaveDeComparacao() em src/lib/lista-nomes.ts.';

-- Quem INSERE/ATUALIZA numa tabela com índice de expressão precisa de EXECUTE
-- na função do índice. anon não tem acesso a nenhuma dessas tabelas.
REVOKE EXECUTE ON FUNCTION public.chave_nome(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chave_nome(text) TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Pré-checagem: a chave nova não pode colidir em dado existente
--
-- Medido antes de escrever esta migration: 15 categorias ativas e 6 formas
-- ativas, 0 colisões. Se alguém criar uma colisão entre a medição e o deploy,
-- a migration para AQUI com mensagem clara, em vez de falhar no CREATE UNIQUE
-- INDEX com erro cru. Só contagem: nenhum nome sai na mensagem.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_cat   int;
  v_formas int;
BEGIN
  SELECT count(*) INTO v_cat FROM (
    SELECT 1 FROM public.categories
    WHERE archived_at IS NULL
    GROUP BY family_id, public.chave_nome(name), type
    HAVING count(*) > 1
  ) c;

  SELECT count(*) INTO v_formas FROM (
    SELECT 1 FROM public.payment_methods
    WHERE archived_at IS NULL
    GROUP BY family_id, public.chave_nome(name)
    HAVING count(*) > 1
  ) f;

  IF v_cat > 0 OR v_formas > 0 THEN
    RAISE EXCEPTION
      'Migration 00011 abortada: a normalização nova junta nomes que hoje são distintos '
      '(% grupo(s) em categories, % em payment_methods). Renomeie ou arquive antes.',
      v_cat, v_formas;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Índices únicos de categories e payment_methods com chave_nome()
--
-- MESMOS nomes da 00009: src/actions/resultado.ts escolhe a mensagem do 23505
-- pelo nome do índice. Mesmo WHERE archived_at IS NULL (arquivada não ocupa o
-- nome). Lock exclusivo por instantes: tabelas com dezenas de linhas.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.categories_nome_ativo_unico;
CREATE UNIQUE INDEX categories_nome_ativo_unico
  ON public.categories (family_id, public.chave_nome(name), type)
  WHERE archived_at IS NULL;

DROP INDEX IF EXISTS public.payment_methods_nome_ativo_unico;
CREATE UNIQUE INDEX payment_methods_nome_ativo_unico
  ON public.payment_methods (family_id, public.chave_nome(name))
  WHERE archived_at IS NULL;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — category_groups
--
-- Mesmo desenho de categories/payment_methods: family_id em toda linha,
-- UNIQUE (family_id, id) como alvo de FK composta. Grupo não tem tipo nem
-- arquivamento (não foi pedido): um grupo pode juntar categorias de tipos
-- diferentes, e o nome é único na família sem exceção.
-- -----------------------------------------------------------------------------
CREATE TABLE public.category_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, id)
);

COMMENT ON TABLE public.category_groups IS
  'Grupo ("pasta") de categorias da família. Uma categoria fica em no máximo um grupo.';

CREATE INDEX idx_category_groups_family_id ON public.category_groups (family_id);

-- O nome do índice é usado por src/actions/resultado.ts. Não renomeie um sem o outro.
CREATE UNIQUE INDEX category_groups_nome_unico
  ON public.category_groups (family_id, public.chave_nome(name));


-- -----------------------------------------------------------------------------
-- BLOCO 5 — categories.group_id
--
-- FK COMPOSTA (family_id, group_id): uma categoria só aponta para grupo da
-- MESMA família. Com FK simples em group_id, a policy categories_update (que só
-- olha o family_id da categoria) deixaria a família A pendurar a categoria dela
-- num grupo da família B.
--
-- ON DELETE SET NULL (group_id): excluir o grupo deixa as categorias dele sem
-- grupo e nunca é bloqueado. A lista de colunas é obrigatória — sem ela o
-- Postgres zeraria family_id também (o defeito que a 00009 consertou).
--
-- ADD COLUMN nullable sem default: só catálogo, sem reescrever a tabela.
-- -----------------------------------------------------------------------------
ALTER TABLE public.categories ADD COLUMN group_id uuid;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_family_id_group_id_fkey
  FOREIGN KEY (family_id, group_id)
  REFERENCES public.category_groups (family_id, id)
  ON DELETE SET NULL (group_id);

-- Índice da FK: o SET NULL ao excluir um grupo procura por (family_id, group_id).
CREATE INDEX idx_categories_family_group ON public.categories (family_id, group_id);


-- -----------------------------------------------------------------------------
-- BLOCO 6 — RLS de category_groups
--
-- Uma policy por operação, TO authenticated, todas pela família do usuário
-- logado — a MESMA expressão vigente em categories (lida de pg_policies no
-- banco hospedado). (SELECT ...) em volta da função: avaliada uma vez por
-- consulta, não por linha.
--
-- UPDATE tem USING e WITH CHECK: sem o WITH CHECK, um membro poderia mover um
-- grupo da própria família para outra família.
--
-- Privilégios: o padrão do schema public concede ALL a anon em tabela nova
-- (o teste vermelho mostrou anon lendo esta tabela antes deste bloco). REVOKE
-- explícito, como 00002 fez com as outras tabelas.
--
-- categories NÃO ganha policy: group_id vive numa tabela já coberta por 4
-- policies por family_id, e a FK composta do bloco 5 impede apontar para
-- grupo de outra família.
-- -----------------------------------------------------------------------------
ALTER TABLE public.category_groups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.category_groups FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_groups TO authenticated;

CREATE POLICY category_groups_select ON public.category_groups
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

CREATE POLICY category_groups_insert ON public.category_groups
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

CREATE POLICY category_groups_update ON public.category_groups
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

CREATE POLICY category_groups_delete ON public.category_groups
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));


-- -----------------------------------------------------------------------------
-- BLOCO 7 — Rede de proteção: a migration se recusa a terminar incompleta
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.category_groups'::regclass) THEN
    v_erros := v_erros || ' RLS desligado em category_groups;';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'category_groups'
        AND roles = '{authenticated}'
        AND (cmd, policyname) IN (('SELECT', 'category_groups_select'),
                                  ('INSERT', 'category_groups_insert'),
                                  ('UPDATE', 'category_groups_update'),
                                  ('DELETE', 'category_groups_delete'))) <> 4 THEN
    v_erros := v_erros || ' faltam policies em category_groups (esperadas 4, uma por operacao);';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'category_groups' AND policyname = 'category_groups_update'
                   AND with_check IS NOT NULL) THEN
    v_erros := v_erros || ' category_groups_update sem WITH CHECK;';
  END IF;

  IF has_table_privilege('anon', 'public.category_groups', 'SELECT')
     OR has_table_privilege('anon', 'public.category_groups', 'INSERT') THEN
    v_erros := v_erros || ' anon ainda tem acesso a category_groups;';
  END IF;

  IF (SELECT provolatile FROM pg_proc WHERE oid = 'public.chave_nome(text)'::regprocedure) <> 'i' THEN
    v_erros := v_erros || ' chave_nome nao e IMMUTABLE;';
  END IF;

  IF to_regclass('public.category_groups') IS NULL THEN
    v_erros := v_erros || ' tabela category_groups ausente;';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categories_family_id_group_id_fkey'
      AND conrelid = 'public.categories'::regclass
      AND pg_get_constraintdef(oid) ~ 'ON DELETE SET NULL \(group_id\)$'
  ) THEN
    v_erros := v_erros || ' FK categories_family_id_group_id_fkey ausente ou sem SET NULL (group_id);';
  END IF;

  IF (SELECT count(*) FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('categories_nome_ativo_unico', 'payment_methods_nome_ativo_unico',
                          'category_groups_nome_unico')
        AND indexdef LIKE '%UNIQUE%'
        AND indexdef LIKE '%chave_nome(name)%') <> 3 THEN
    v_erros := v_erros || ' algum dos 3 indices unicos nao usa chave_nome(name);';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00011 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00011: chave_nome, category_groups com RLS e 4 policies, FK e 3 indices unicos verificados.';
END $$;
