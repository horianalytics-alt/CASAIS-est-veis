-- Tempo real: o lançamento de um aparece na tela do outro na hora.

-- DELETE no Realtime só envia a linha antiga com REPLICA IDENTITY FULL.
ALTER TABLE transactions   REPLICA IDENTITY FULL;
ALTER TABLE accounts       REPLICA IDENTITY FULL;
ALTER TABLE family_members REPLICA IDENTITY FULL;

-- Idempotente: a publicação já pode conter a tabela (re-push, ou projeto
-- hospedado onde o Supabase já adicionou alguma).
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['transactions', 'accounts', 'family_members']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Canais de presença e broadcast: o tópico carrega o family_id
-- ("presence:<uuid>"), e só quem é da família pode assinar.
--
-- No Supabase hospedado a tabela realtime.messages pertence à plataforma:
-- o RLS já vem habilitado e um ALTER TABLE nela falha com
-- "must be owner of table messages" (42501). Por isso só habilitamos o RLS
-- quando somos o dono — no banco local — e as policies, que podemos criar
-- em ambos, ficam fora do IF.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime'
      AND c.relname = 'messages'
      AND NOT c.relrowsecurity
      AND pg_has_role(current_user, c.relowner, 'USAGE')
  ) THEN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS realtime_family_topics_read  ON realtime.messages;
DROP POLICY IF EXISTS realtime_family_topics_write ON realtime.messages;

CREATE POLICY realtime_family_topics_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    split_part(realtime.topic(), ':', 2) =
      (SELECT get_user_family_id(auth.uid()))::text
  );

CREATE POLICY realtime_family_topics_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    split_part(realtime.topic(), ':', 2) =
      (SELECT get_user_family_id(auth.uid()))::text
  );
