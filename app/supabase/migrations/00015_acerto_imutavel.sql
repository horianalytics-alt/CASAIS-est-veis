-- =============================================================================
-- 00015 — Acerto de contas imutável no BANCO, não só na Server Action
--
-- DEFEITO (achado M-2 do Sentinela R5, docs/auditoria/r5-sentinela.md),
-- reproduzido antes desta migration por
-- tests/integration/acerto-imutavel.int.test.ts (8 testes vermelhos):
--
--   A 00010 diz que transactions.settlement_to_member_id é "gravada SÓ por
--   settle_up", mas nada no banco impunha isso. A trava "acerto não pode ser
--   editado" morava só em src/lib/esquemas-edicao-lancamento.ts. A policy
--   transactions_update (00002) só olha family_id. Com a PRÓPRIA sessão, por
--   PostgREST, um membro da família:
--     - alterava valor, data, descrição, is_paid ou quem pagou/recebeu de um
--       acerto real (UPDATE ... WHERE id = <acerto>  -> 1 linha);
--     - desfazia o acerto (SET settlement_to_member_id = NULL);
--     - forjava um acerto novo (INSERT com settlement_to_member_id);
--     - transformava uma transferência comum em acerto (UPDATE SET
--       settlement_to_member_id = <membro>).
--   Todos mexem na v_settlement sem passar por validação nenhuma. Não cruza
--   família (a FK composta da 00010 barra membro de outra casa).
--
-- A CORREÇÃO: trigger BEFORE INSERT/UPDATE em transactions que recusa, para os
-- papéis de cliente, qualquer linha que É ou que VIRARIA acerto. DELETE fica
-- de fora de propósito: "exclua e registre de novo" é o fluxo do produto
-- (excluirLancamento -> delete_transactions, e a policy transactions_delete).
--
-- QUEM CONTINUA GRAVANDO (lista de papéis liberados, fechada):
--   postgres       dono da tabela e das RPCs SECURITY DEFINER. Dentro de
--                  settle_up o current_user é o dono da função (postgres), então
--                  o acerto legítimo continua nascendo. É também o papel com que
--                  o Postgres executa as ações de FK (ON DELETE SET NULL de
--                  category_id/payment_method_id, 00009): excluir uma categoria
--                  que um acerto antigo referencia continua funcionando.
--   service_role   operação administrativa (scripts de limpeza/semente); já
--                  ignora o RLS por completo, recusar aqui não protegeria nada.
--   supabase_admin manutenção da plataforma.
-- Qualquer outro papel (authenticated, anon, ou um papel criado no futuro) é
-- recusado: falha fechada.
--
-- Nenhuma RPC legítima ATUALIZA linha de acerto (conferido no catálogo vivo):
-- save_transactions não grava a coluna; pay_invoice só faz UPDATE em
-- despesa/investimento; delete_transactions só apaga.
--
-- ALTERNATIVA DESCARTADA — REVOKE de coluna (recomendação do Sentinela):
--   REVOKE INSERT (settlement_to_member_id), UPDATE (settlement_to_member_id)
--   ON transactions FROM authenticated
-- não tem efeito: authenticated tem o grant no nível da TABELA, e o Postgres
-- não subtrai coluna de grant de tabela. Medido no banco hospedado, dentro de
-- um DO que termina em RAISE (rollback):
--   "depois do REVOKE de coluna, authenticated ainda tem INSERT=t UPDATE=t na
--    coluna; grant de tabela UPDATE=t"
-- Para funcionar, seria preciso revogar INSERT/UPDATE da tabela inteira e
-- regravar o grant coluna a coluna (toda coluna nova nasceria sem grant) — e
-- mesmo assim não barraria UPDATE de amount/date num acerto, que é o centro do
-- achado. O trigger cobre os dois casos com uma regra só.
--
-- SQLSTATE 42501 (insufficient_privilege): é recusa por permissão, e
-- traduzErroDoBanco já mapeia 42501 para "Você não tem permissão para fazer
-- isso." se este erro chegar a alguma Action (hoje não chega: a Action recusa
-- antes, com a mesma frase de BANCO_EDITAR).
--
-- Desempenho: as cláusulas WHEN filtram no executor, antes de chamar a função.
-- Lançamento comum (settlement_to_member_id NULL nos dois lados) nunca entra no
-- plpgsql.
--
-- Nenhum dado muda: CREATE FUNCTION/TRIGGER não reescreve linha. Conferido
-- antes, só leitura, na família real: 1 acerto, coerente (conta de origem do
-- pagador, destino do recebedor, updated_at = created_at, sem categoria), e
-- nenhuma transferência "Acerto de contas" com o vínculo apagado.
--
-- 00001..00014 estão aplicadas e são IMUTÁVEIS: tudo aqui é statement novo.
-- A migration roda inteira numa transação: ou tudo entra, ou nada entra.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — A função do trigger
--
-- SECURITY INVOKER (o padrão) de propósito: é o current_user de QUEM grava que
-- decide. Como DEFINER, current_user seria sempre o dono e a trava não
-- recusaria ninguém. search_path vazio: nada é resolvido por nome além de
-- current_user/TG_OP, que não dependem de schema.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tx_acerto_so_por_settle_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Linha que já é acerto: nenhuma alteração, nem para "desfazer".
  IF TG_OP = 'UPDATE' AND OLD.settlement_to_member_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Acerto de contas não pode ser editado. Exclua e registre de novo.';
  END IF;

  -- INSERT de acerto, ou UPDATE que transformaria uma linha comum em acerto.
  IF NEW.settlement_to_member_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Acerto de contas só pode ser registrado pela função settle_up.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tx_acerto_so_por_settle_up() IS
  'Trigger (00015): papéis de cliente não criam, editam nem desfazem acerto de contas em transactions. Só settle_up (SECURITY DEFINER) grava. DELETE é permitido.';

-- Função de trigger não é chamável por RPC; o privilégio de EXECUTE só é
-- conferido quando o trigger é criado, não quando dispara.
REVOKE EXECUTE ON FUNCTION public.tx_acerto_so_por_settle_up() FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Os triggers
--
-- Dois, porque OLD não existe em WHEN de trigger de INSERT.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_tx_acerto_imutavel_ins ON public.transactions;
CREATE TRIGGER trg_tx_acerto_imutavel_ins
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.settlement_to_member_id IS NOT NULL)
  EXECUTE FUNCTION public.tx_acerto_so_por_settle_up();

DROP TRIGGER IF EXISTS trg_tx_acerto_imutavel_upd ON public.transactions;
CREATE TRIGGER trg_tx_acerto_imutavel_upd
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (OLD.settlement_to_member_id IS NOT NULL OR NEW.settlement_to_member_id IS NOT NULL)
  EXECUTE FUNCTION public.tx_acerto_so_por_settle_up();

COMMENT ON COLUMN public.transactions.settlement_to_member_id IS
  'Destinatário de um acerto de contas. NULL = não é acerto. Quem paga é paid_by_member_id. '
  'Gravada só por settle_up: desde a 00015 o trigger tx_acerto_so_por_settle_up recusa '
  'INSERT/UPDATE de acerto vindo de papel de cliente (DELETE continua permitido).';


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Rede de proteção: a migration se recusa a terminar incompleta
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_n     int;
BEGIN
  SELECT count(*) INTO v_n
  FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass
    AND tgname IN ('trg_tx_acerto_imutavel_ins', 'trg_tx_acerto_imutavel_upd')
    AND tgenabled = 'O'
    AND tgfoid = 'public.tx_acerto_so_por_settle_up()'::regprocedure;
  IF v_n <> 2 THEN
    v_erros := v_erros || ' esperados 2 triggers ativos, achados ' || v_n || ';';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.tx_acerto_so_por_settle_up()'::regprocedure
      AND (prosecdef OR proconfig IS NULL OR NOT ('search_path=""' = ANY (proconfig)))
  ) THEN
    v_erros := v_erros || ' função do trigger é DEFINER ou está sem search_path fixo;';
  END IF;

  -- settle_up precisa continuar DEFINER e do mesmo dono da lista liberada, ou
  -- o acerto legítimo passa a ser recusado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.settle_up(uuid, uuid, numeric, date)'::regprocedure
      AND prosecdef
      AND pg_get_userbyid(proowner) = 'postgres'
  ) THEN
    v_erros := v_erros || ' settle_up deixou de ser SECURITY DEFINER de postgres;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00015 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00015: 2 triggers de acerto imutável ativos; função INVOKER com search_path fixo; settle_up DEFINER de postgres.';
END $$;
