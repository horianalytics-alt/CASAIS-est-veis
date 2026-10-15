-- =============================================================================
-- 00014 — Excluir "só este lançamento" na 1ª parcela não apaga mais a série
--
-- DEFEITO (achado A-1 do Sentinela R5, docs/auditoria/r5-sentinela.md),
-- reproduzido antes desta migration por
-- tests/integration/excluir-lancamento.int.test.ts (5 testes vermelhos):
--
--   00001 criou transactions.recurrence_parent_id como
--     REFERENCES transactions(id) ON DELETE CASCADE
--   A 1ª parcela é a "mãe" da série (save_transactions grava as outras
--   apontando para ela). Apagar a mãe com escopo 'single' disparava o
--   CASCADE e levava junto todas as parcelas filhas; a RPC devolvia
--   ROW_COUNT = 1 e a tela dizia "1 excluído". O mesmo acontecia com um
--   DELETE direto por REST, que a policy transactions_delete permite.
--
-- Mesma FK, achado B-1 do mesmo relatório: ela era a ÚNICA chave de
-- transactions sem family_id. Uma linha da família A podia apontar para um id
-- da família B (o banco aceitava, porque a checagem de FK ignora RLS), o que
-- dava um oráculo de existência de id (23503 x sucesso) e fazia a linha de A
-- sumir em cascata quando B apagava o próprio lançamento.
--
-- A CORREÇÃO: recurrence_parent_id deixa de ser chave estrangeira e passa a
-- ser só a CHAVE DA SÉRIE (o id da 1ª parcela, gravado uma vez por
-- save_transactions). Sem FK não há cascata, nem por RPC nem por REST, e não
-- há checagem cruzando famílias.
--
-- Por que isto NÃO quebra a exclusão da série inteira: o ramo 'series' de
-- delete_transactions (00006) nunca dependeu do CASCADE. Ele apaga
-- explicitamente
--     t.family_id = v_family_id
--     AND (t.id = v_parent OR t.recurrence_parent_id = v_parent)
-- com v_parent = COALESCE(recurrence_parent_id, id) da linha escolhida. Depois
-- de a mãe sair, as filhas continuam com recurrence_parent_id = id da mãe, e
-- o mesmo filtro continua achando todas elas. O bloco 3 abaixo recusa
-- terminar se esse ramo não estiver no corpo vivo da função.
--
-- Alternativas avaliadas e descartadas:
--   - ON DELETE SET NULL (recurrence_parent_id): apagar a mãe zeraria a chave
--     das filhas, e elas deixariam de ser série ("excluir série" a partir de
--     uma delas apagaria só ela).
--   - NO ACTION + promover a 2ª parcela a nova mãe dentro da RPC: corrige a
--     RPC, mas reescreve N-1 linhas a cada exclusão (UPDATE em cada parcela,
--     updated_at mexido, um evento Realtime de UPDATE por parcela para o
--     parceiro) e faz o DELETE direto por REST de uma mãe falhar com 23503.
--     Mais partes móveis para o mesmo resultado.
--   - FK composta (family_id, recurrence_parent_id), recomendada para o B-1:
--     fecha o cruzamento entre famílias, mas continua precisando de uma das
--     duas opções acima para o A-1, e exigiria UNIQUE (family_id, id) novo.
--
-- O que se perde: o banco deixa de garantir que a chave da série aponta para
-- uma linha existente. Isso é exatamente o estado pretendido depois que a mãe
-- é excluída. Toda leitura por série é filtrada por family_id (a RPC, e o RLS
-- no REST), então uma chave "pendurada" num id de outra família agrupa só
-- linhas da própria família.
--
-- O índice parcial idx_transactions_series (00001) fica: é ele que atende o
-- "t.recurrence_parent_id = v_parent" da exclusão da série.
--
-- Nenhum dado muda: DROP CONSTRAINT não reescreve linha. Conferido antes no
-- banco hospedado: 0 linhas com chave órfã, 0 com chave apontando para outra
-- família, 0 séries na família real.
--
-- 00001..00013 estão aplicadas e são IMUTÁVEIS: tudo aqui é statement novo.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — Tirar a chave estrangeira (e com ela o ON DELETE CASCADE)
-- -----------------------------------------------------------------------------
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_recurrence_parent_id_fkey;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Documentar o que a coluna é agora
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.transactions.recurrence_parent_id IS
  'Chave da série de parcelas: o id da 1ª parcela, gravado por save_transactions. '
  'NULL na 1ª parcela e em lançamento avulso. NÃO é chave estrangeira de '
  'propósito (00014): com FK, excluir a 1ª parcela apagava a série inteira em '
  'cascata. Pode apontar para um id que já não existe (a 1ª parcela excluída); '
  'a série continua sendo {id = chave} + {recurrence_parent_id = chave}, sempre '
  'filtrada por family_id.';


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Rede de proteção: a migration se recusa a terminar se
--   (a) sobrou qualquer FK em transactions sobre recurrence_parent_id, ou
--   (b) o corpo vivo de delete_transactions não tiver o ramo que apaga a série
--       pelas filhas (sem ele, tirar o CASCADE quebraria "excluir série").
-- O regex de (b) foi executado antes contra o prosrc vivo e contra 3 casos
-- sintéticos: casa o vivo e a variação com espaços; não casa um corpo só com
-- "t.id = p_id" nem um que só apaga "t.id = v_parent".
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_fks   text;
BEGIN
  SELECT string_agg(c.conname, ', ')
    INTO v_fks
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
  WHERE c.contype = 'f'
    AND c.conrelid = 'public.transactions'::regclass
    AND a.attname = 'recurrence_parent_id';

  IF v_fks IS NOT NULL THEN
    v_erros := v_erros || ' FK ainda presente em recurrence_parent_id: ' || v_fks || ';';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'delete_transactions'
      AND p.prosrc ~ 't\.recurrence_parent_id\s*=\s*v_parent'
  ) THEN
    v_erros := v_erros || ' delete_transactions sem o ramo de serie pelas filhas;';
  END IF;

  IF to_regclass('public.idx_transactions_series') IS NULL THEN
    v_erros := v_erros || ' indice idx_transactions_series ausente;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00014 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00014: FK de recurrence_parent_id removida; ramo de serie e indice verificados.';
END $$;
