-- MUTANTE da migration 00019. Usado SÓ pelo recorrencia-rls.mjs --mutante,
-- DEPOIS do rascunho da migration e na MESMA transação desfeita: nunca é aplicado.
--
-- Simula os bugs que o teste tem de pegar:
--   1. recurring_rules aberta: policy USING (true), escrita liberada e GRANT;
--   2. RPCs sem filtro de família que GRAVAM na linha encontrada, com o
--      family_id DELA (o bug realista; gravar com o family_id de quem chama
--      seria barrado pelas FKs compostas e o teste ficaria vermelho pelo motivo
--      errado — L-018/L-026);
--   3. trigger que congela as colunas novas removido;
--   4. gerador interno executável pelo cliente.
-- Com este patch, R02, R03, R04, R05, R06, R07, R07b, R10, T01, T02 e T03 TÊM de
-- falhar mostrando a linha de A lida ou alterada (T01 cai no CHECK
-- tx_recorrencia_completa, que é a 2ª barreira; T02/T03 gravam).

DROP POLICY IF EXISTS recurring_rules_select ON public.recurring_rules;
CREATE POLICY recurring_rules_select ON public.recurring_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY mutante_rr_insert ON public.recurring_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY mutante_rr_update ON public.recurring_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.recurring_rules TO authenticated;

DROP TRIGGER IF EXISTS trg_tx_recorrencia_congela_ins ON public.transactions;
DROP TRIGGER IF EXISTS trg_tx_recorrencia_congela_upd ON public.transactions;

GRANT EXECUTE ON FUNCTION public.recorrencia_gerar(uuid, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recorrencia_alterar_valor(p_regra_id uuid, p_valor numeric, p_a_partir date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $mut$
DECLARE v_k int;
BEGIN
  UPDATE public.recurring_rules SET amount = p_valor WHERE id = p_regra_id;
  UPDATE public.transactions t SET amount = p_valor
   WHERE t.recurring_rule_id = p_regra_id AND t.recurring_period >= p_a_partir AND t.is_paid = false;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  RETURN v_k;
END $mut$;

CREATE OR REPLACE FUNCTION public.recorrencia_encerrar(p_regra_id uuid, p_ultimo_mes date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $mut$
DECLARE v_k int;
BEGIN
  UPDATE public.recurring_rules SET end_period = p_ultimo_mes WHERE id = p_regra_id;
  DELETE FROM public.transactions t
   WHERE t.recurring_rule_id = p_regra_id AND t.recurring_period > p_ultimo_mes AND t.is_paid = false;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  RETURN v_k;
END $mut$;

CREATE OR REPLACE FUNCTION public.recorrencia_responder(p_lancamento_id uuid, p_resposta text, p_data_pagamento date DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $mut$
DECLARE v_k int;
BEGIN
  IF p_resposta = 'pago' THEN
    UPDATE public.transactions t SET is_paid = true, paid_date = p_data_pagamento
     WHERE t.id = p_lancamento_id AND t.recurring_rule_id IS NOT NULL AND t.is_paid = false;
    GET DIAGNOSTICS v_k = ROW_COUNT;
    RETURN CASE WHEN v_k = 1 THEN 'pago' ELSE 'ja_respondida' END;
  END IF;
  UPDATE public.transactions t SET prompt_snoozed_until = public.carteira_hoje() + 1
   WHERE t.id = p_lancamento_id AND t.recurring_rule_id IS NOT NULL AND t.is_paid = false;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  RETURN CASE WHEN v_k = 1 THEN 'adiado' ELSE 'ja_respondida' END;
END $mut$;
