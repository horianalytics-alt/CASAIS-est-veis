-- MUTANTE da migration 00016. Usado SÓ pelo carteira-rls.mjs --mutante, DEPOIS
-- do rascunho da migration e na MESMA transação desfeita: nunca é aplicado.
--
-- Simula os dois bugs que o teste tem de pegar:
--   1. RLS/privilégio aberto: policy USING (true) e GRANT ALL para authenticated;
--   2. RPC sem filtro de família que GRAVA com o family_id da linha encontrada
--      (o bug realista). Gravar com o family_id de quem chama seria barrado
--      pelas FKs compostas com 23503, e o teste ficaria vermelho pelo motivo
--      errado (L-018/L-026).
-- Com este patch, I01..I06, I10 e F01 TÊM de falhar mostrando a linha de A
-- lida ou alterada.

DROP POLICY IF EXISTS investment_wallets_select ON public.investment_wallets;
CREATE POLICY investment_wallets_select ON public.investment_wallets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS investment_boxes_select ON public.investment_boxes;
CREATE POLICY investment_boxes_select ON public.investment_boxes FOR SELECT TO authenticated USING (true);
CREATE POLICY mutante_boxes_update ON public.investment_boxes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY mutante_boxes_delete ON public.investment_boxes FOR DELETE TO authenticated USING (true);
CREATE POLICY mutante_boxes_insert ON public.investment_boxes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS investment_box_movements_select ON public.investment_box_movements;
CREATE POLICY investment_box_movements_select ON public.investment_box_movements FOR SELECT TO authenticated USING (true);
GRANT ALL ON public.investment_wallets, public.investment_boxes, public.investment_box_movements TO authenticated;

CREATE OR REPLACE FUNCTION public.carteira_resgatar(
  p_caixinha_id uuid, p_valor_cents bigint, p_conta_destino_id uuid DEFAULT NULL)
RETURNS TABLE (movimento_id uuid, lancamento_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $mut$
DECLARE
  v_box public.investment_boxes;
  v_mov uuid;
BEGIN
  SELECT * INTO v_box FROM public.investment_boxes b WHERE b.id = p_caixinha_id;
  UPDATE public.investment_boxes SET balance_cents = balance_cents - p_valor_cents WHERE id = p_caixinha_id;
  INSERT INTO public.investment_box_movements (family_id, box_id, kind, counterpart, amount_cents, occurred_on, created_by_member_id)
  VALUES (v_box.family_id, v_box.id, 'saida', 'nao_alocado', p_valor_cents, CURRENT_DATE,
          (SELECT m.id FROM public.family_members m WHERE m.family_id = v_box.family_id ORDER BY m.id LIMIT 1))
  RETURNING id INTO v_mov;
  RETURN QUERY SELECT v_mov, NULL::uuid;
END $mut$;

CREATE OR REPLACE FUNCTION public.carteira_atualizar_taxa(p_caixinha_id uuid, p_taxa_bps integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $mut$
BEGIN
  UPDATE public.investment_boxes SET rate_bps = p_taxa_bps WHERE id = p_caixinha_id;
END $mut$;
