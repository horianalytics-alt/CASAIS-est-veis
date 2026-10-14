-- =============================================================================
-- 00012 — Índice (family_id, member_id) em push_subscriptions
--
-- POR QUÊ: o envio de push (src/lib/supabase/servico.ts) busca as inscrições
-- dos OUTROS membros da família de quem lançou:
--   WHERE family_id = $1 AND member_id <> $2
-- e family_id é FK para families (ON DELETE CASCADE) sem nenhum índice — o
-- único índice com member_id na frente é o UNIQUE (member_id, endpoint) de
-- 00001, que não serve para filtrar por família. Postgres não indexa FK
-- sozinho (supabase-postgres-best-practices › schema-foreign-key-indexes).
-- Igualdade em family_id primeiro, member_id depois (query-composite-indexes).
--
-- O que NÃO muda: nenhuma coluna, nenhuma policy, nenhum dado. As 3 policies
-- por membro de 00006 (select/insert/delete do próprio membro) continuam.
--
-- Tabela vazia no momento da escrita (0 linhas, medido): o CREATE INDEX sem
-- CONCURRENTLY (a migration é transacional) pega lock por instantes.
--
-- 00001..00011 estão aplicadas e são IMUTÁVEIS: tudo aqui é statement novo.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_family_member
  ON public.push_subscriptions (family_id, member_id);


-- -----------------------------------------------------------------------------
-- Rede de proteção: a migration se recusa a terminar sem o índice certo.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_push_subscriptions_family_member'
      AND i.indrelid = 'public.push_subscriptions'::regclass
      AND pg_get_indexdef(i.indexrelid) LIKE '%(family_id, member_id)%'
  ) THEN
    RAISE EXCEPTION 'Migration 00012 abortada: índice idx_push_subscriptions_family_member ausente ou com colunas erradas';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.push_subscriptions'::regclass) THEN
    RAISE EXCEPTION 'Migration 00012 abortada: push_subscriptions está SEM RLS';
  END IF;

  RAISE NOTICE 'Migration 00012: índice (family_id, member_id) presente; RLS de push_subscriptions ligado.';
END $$;
