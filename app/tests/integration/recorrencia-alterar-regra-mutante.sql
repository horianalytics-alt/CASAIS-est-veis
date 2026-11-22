-- Mutante de recorrencia_alterar_regra (migration 00021).
-- Plano: docs/planos/estrutura-alterar-regra.md, §7 (mutante).
--
-- Substitui a função por uma versão deliberadamente aberta:
-- (1) O lookup da regra NÃO filtra por family_id; as escritas usam o family_id
--     da REGRA encontrada (não da família do chamador).
-- (2) O passo 8 (referências) NÃO filtra por family_id.
--
-- Resultado esperado: I01 fica VERMELHO com GRAVAÇÃO (a linha de A é alterada).
-- I02/I03 ficam vermelhos pela mensagem (FK composta barra — declarado no plano,
-- L-018: a prova primária de isolamento é o I01, não o I02/I03).
CREATE OR REPLACE FUNCTION public.recorrencia_alterar_regra(
  p_regra_id  uuid,
  p_campos    jsonb,
  p_a_partir  date
)
RETURNS TABLE (alterados_na_regra int, alterados_em_transacoes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Chaves permitidas (mesmo conjunto da versão correta)
  v_chaves_ok text[] := ARRAY[
    'description','amount','account_id','category_id','payment_method_id',
    'owner_member_id','owner_share','paid_by_member_id','notes',
    'is_benefit','is_futile','futile_label'];

  v_family   uuid := public.get_user_family_id_self();
  v_rr       public.recurring_rules;
  v_novo     public.recurring_rules;
  v_gt       date;
  v_alvo     date;
  v_closing  int;
  v_inv_y    int;
  v_inv_m    int;
  v_r        int;
  v_t        int;
BEGIN
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nada para alterar';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_campos) k WHERE k NOT IN (SELECT unnest(v_chaves_ok))) THEN
    RAISE EXCEPTION 'Campo não permitido';
  END IF;
  IF p_a_partir IS NULL OR p_a_partir <> date_trunc('month', p_a_partir)::date THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;

  -- MUTANTE: busca a regra SEM filtrar por família do chamador
  SELECT * INTO v_rr FROM public.recurring_rules WHERE id = p_regra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;
  -- Usa o family_id da REGRA encontrada (não da família do chamador)
  -- para as escritas abaixo

  -- Validações de tipo/valor (simplificadas)
  IF p_campos ? 'amount' THEN
    IF jsonb_typeof(p_campos->'amount') <> 'number' THEN RAISE EXCEPTION 'Campo inválido'; END IF;
    IF (p_campos->>'amount')::numeric <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recorrencia:' || v_rr.family_id::text, 0));

  v_novo := v_rr;
  IF p_campos ? 'description'       THEN v_novo.description       := btrim(p_campos->>'description'); END IF;
  IF p_campos ? 'amount'            THEN v_novo.amount             := (p_campos->>'amount')::numeric; END IF;
  IF p_campos ? 'account_id'        THEN v_novo.account_id        := (p_campos->>'account_id')::uuid; END IF;
  IF p_campos ? 'category_id'       THEN v_novo.category_id       := (p_campos->>'category_id')::uuid; END IF;
  IF p_campos ? 'payment_method_id' THEN v_novo.payment_method_id := (p_campos->>'payment_method_id')::uuid; END IF;
  IF p_campos ? 'owner_member_id'   THEN v_novo.owner_member_id   := (p_campos->>'owner_member_id')::uuid; END IF;
  IF p_campos ? 'owner_share'       THEN v_novo.owner_share       := (p_campos->>'owner_share')::numeric; END IF;
  IF p_campos ? 'paid_by_member_id' THEN v_novo.paid_by_member_id := (p_campos->>'paid_by_member_id')::uuid; END IF;
  IF p_campos ? 'notes'             THEN v_novo.notes             := p_campos->>'notes'; END IF;
  IF p_campos ? 'is_benefit'        THEN v_novo.is_benefit        := (p_campos->>'is_benefit')::boolean; END IF;
  IF p_campos ? 'is_futile'         THEN v_novo.is_futile         := (p_campos->>'is_futile')::boolean; END IF;
  IF p_campos ? 'futile_label'      THEN v_novo.futile_label      := p_campos->>'futile_label'; END IF;

  -- MUTANTE: referências SEM filtro de família
  IF p_campos ? 'account_id' THEN
    IF EXISTS (SELECT 1 FROM public.investment_wallets WHERE account_id = v_novo.account_id) THEN
      RAISE EXCEPTION 'A carteira de investimento não aceita recorrência';
    END IF;
    IF EXISTS (SELECT 1 FROM public.accounts WHERE id = v_novo.account_id AND archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Esta conta está arquivada';
    END IF;
    IF EXISTS (SELECT 1 FROM public.accounts WHERE id = v_novo.account_id AND type = 'cartao')
       AND v_rr.type = 'receita' THEN
      RAISE EXCEPTION 'Receita recorrente não pode ser no cartão';
    END IF;
  END IF;

  v_alvo := (date_trunc('month', public.carteira_hoje()) + interval '11 months')::date;
  PERFORM public.recorrencia_gerar(v_rr.family_id, v_alvo, v_rr.id);
  SELECT generated_through INTO v_gt FROM public.recurring_rules WHERE id = v_rr.id;

  IF p_a_partir < v_rr.start_period
     OR p_a_partir < date_trunc('month', public.carteira_hoje())::date
     OR p_a_partir > (v_gt + interval '1 month')::date THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;

  -- MUTANTE: UPDATE com family_id DA REGRA (não do chamador)
  UPDATE public.recurring_rules SET
    description       = v_novo.description,
    amount            = v_novo.amount,
    account_id        = v_novo.account_id,
    category_id       = v_novo.category_id,
    payment_method_id = v_novo.payment_method_id,
    owner_member_id   = v_novo.owner_member_id,
    owner_share       = v_novo.owner_share,
    paid_by_member_id = v_novo.paid_by_member_id,
    notes             = v_novo.notes,
    is_benefit        = v_novo.is_benefit,
    is_futile         = v_novo.is_futile,
    futile_label      = v_novo.futile_label
  WHERE id = v_rr.id AND family_id = v_rr.family_id;
  GET DIAGNOSTICS v_r = ROW_COUNT;

  -- Calcula closing_day para a fatura (se a conta for cartão)
  IF p_campos ? 'account_id' THEN
    SELECT closing_day INTO v_closing
      FROM public.accounts WHERE id = v_novo.account_id;
  END IF;

  UPDATE public.transactions t SET
    description       = CASE WHEN p_campos ? 'description'       THEN v_novo.description       ELSE t.description END,
    amount            = CASE WHEN p_campos ? 'amount'            THEN v_novo.amount            ELSE t.amount END,
    account_id        = CASE WHEN p_campos ? 'account_id'        THEN v_novo.account_id        ELSE t.account_id END,
    invoice_year      = CASE
      WHEN p_campos ? 'account_id' AND t.account_id IS DISTINCT FROM v_novo.account_id THEN
        CASE
          WHEN v_closing IS NULL THEN NULL
          WHEN EXTRACT(DAY FROM t.date)::int < v_closing THEN EXTRACT(YEAR FROM t.date)::int
          ELSE EXTRACT(YEAR FROM (t.date + interval '1 month'))::int
        END
      ELSE t.invoice_year
    END,
    invoice_month     = CASE
      WHEN p_campos ? 'account_id' AND t.account_id IS DISTINCT FROM v_novo.account_id THEN
        CASE
          WHEN v_closing IS NULL THEN NULL
          WHEN EXTRACT(DAY FROM t.date)::int < v_closing THEN EXTRACT(MONTH FROM t.date)::int
          ELSE EXTRACT(MONTH FROM (t.date + interval '1 month'))::int
        END
      ELSE t.invoice_month
    END,
    category_id       = CASE WHEN p_campos ? 'category_id'       THEN v_novo.category_id       ELSE t.category_id END,
    payment_method_id = CASE WHEN p_campos ? 'payment_method_id' THEN v_novo.payment_method_id ELSE t.payment_method_id END,
    paid_by_member_id = CASE WHEN p_campos ? 'paid_by_member_id' THEN v_novo.paid_by_member_id ELSE t.paid_by_member_id END,
    notes             = CASE WHEN p_campos ? 'notes'             THEN v_novo.notes             ELSE t.notes END,
    is_benefit        = CASE WHEN p_campos ? 'is_benefit'        THEN v_novo.is_benefit        ELSE t.is_benefit END,
    owner_member_id   = CASE WHEN p_campos ? 'owner_member_id' OR p_campos ? 'owner_share' THEN v_novo.owner_member_id ELSE t.owner_member_id END,
    owner_share       = CASE WHEN p_campos ? 'owner_member_id' OR p_campos ? 'owner_share' THEN v_novo.owner_share ELSE t.owner_share END,
    is_futile         = CASE WHEN p_campos ? 'is_futile' OR p_campos ? 'futile_label' THEN v_novo.is_futile ELSE t.is_futile END,
    futile_label      = CASE WHEN p_campos ? 'is_futile' OR p_campos ? 'futile_label' THEN v_novo.futile_label ELSE t.futile_label END
  WHERE t.family_id = v_rr.family_id  -- MUTANTE: family_id da regra, não do chamador
    AND t.recurring_rule_id = v_rr.id
    AND t.recurring_period >= p_a_partir
    AND t.is_paid = false;
  GET DIAGNOSTICS v_t = ROW_COUNT;

  RETURN QUERY SELECT v_r, v_t;
END;
$$;
