-- =============================================================================
-- Migration 00021 — recorrencia_alterar_regra
-- Plano: docs/planos/estrutura-alterar-regra.md, §3 e §8.
-- Data: 2026-11-21.
--
-- Cria UMA função: public.recorrencia_alterar_regra(p_regra_id, p_campos, p_a_partir).
-- Altera qualquer subconjunto das 12 chaves permitidas na regra e nos lançamentos
-- pendentes a partir de p_a_partir.
--
-- Sem ALTER TABLE, sem nova tabela, sem nova policy, sem DROP: só cria função.
-- Testado contra o schema aplicado antes do push (runner --com-migration).
--
-- Decisões:
--   D1. SECURITY DEFINER + filtro de família em cada instrução + REVOKE anon.
--       recurring_rules não tem grant de escrita para authenticated (00019:120-121).
--       Autorização: family_id = get_user_family_id_self() DENTRO de cada instrução.
--   D2. Lista fechada de 12 chaves; chave desconhecida rejeita o patch inteiro.
--   D3. Pares (owner_member_id, owner_share) e (is_futile, futile_label) gravados
--       juntos nas linhas — CHECKs 00001:209 e 218; simulação do plano §6.2.
--   D4. Fatura recalculada só quando a conta muda, com t.date da própria linha;
--       precedente: esquemas-edicao-lancamento.ts:287-290.
--   D5. Gerador com escopo p_regra (L-033); janela conferida DEPOIS do gerador,
--       com generated_through relido (§3.4 do plano).
--   D6. Mesma chave de advisory lock das outras RPCs recorrencia_* (00019:636).
--   D7. app.recorrencia_rpc NÃO é ligada: o UPDATE não escreve
--       recurring_rule_id/recurring_period/prompt_snoozed_until (§5 do plano).
--   D8. is_benefit/is_futile em receita: a RPC RECUSA apenas o que o patch liga
--       — não valida o estado inteiro da regra (L-035). Caso A12b coberto em teste.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — Função
-- -----------------------------------------------------------------------------
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
  -- Chaves permitidas (lista fechada; qualquer outra recusa o patch inteiro — D2)
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
  v_acc_type text;
  v_r        int;
  v_t        int;
BEGIN

  -- Passo 1: família do chamador
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Você não faz parte de nenhuma família';
  END IF;

  -- Passo 2: campos
  IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb THEN
    RAISE EXCEPTION 'Nada para alterar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_campos) k
    WHERE k NOT IN (SELECT unnest(v_chaves_ok))
  ) THEN
    RAISE EXCEPTION 'Campo não permitido';
  END IF;

  -- Passo 3: p_a_partir deve ser o 1º dia de algum mês
  IF p_a_partir IS NULL OR p_a_partir <> date_trunc('month', p_a_partir)::date THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;

  -- Passo 4: validação de tipo/valor das chaves presentes
  --   Regra: jsonb_typeof para verificar o tipo correto.
  IF p_campos ? 'description' THEN
    IF jsonb_typeof(p_campos->'description') <> 'string' THEN
      RAISE EXCEPTION 'Campo inválido';
    END IF;
    IF p_campos->>'description' IS NULL OR length(btrim(p_campos->>'description')) = 0 THEN
      RAISE EXCEPTION 'Descreva o lançamento';
    END IF;
  END IF;
  IF p_campos ? 'amount' THEN
    IF jsonb_typeof(p_campos->'amount') <> 'number' THEN
      RAISE EXCEPTION 'Campo inválido';
    END IF;
    -- Mesma regra de 00019:629 (recorrencia_alterar_valor)
    IF (p_campos->>'amount')::numeric IS NULL
       OR (p_campos->>'amount')::numeric <= 0
       OR (p_campos->>'amount')::numeric > 99999999.99
       OR (p_campos->>'amount')::numeric <> round((p_campos->>'amount')::numeric, 2) THEN
      RAISE EXCEPTION 'Valor inválido';
    END IF;
  END IF;
  IF p_campos ? 'account_id' THEN
    -- JSON null é recusado antes de verificar o tipo (NOT NULL na coluna)
    IF p_campos->'account_id' = 'null'::jsonb THEN
      RAISE EXCEPTION 'Campo obrigatório vazio';
    END IF;
    IF jsonb_typeof(p_campos->'account_id') <> 'string' THEN
      RAISE EXCEPTION 'Campo inválido';
    END IF;
  END IF;
  IF p_campos ? 'paid_by_member_id' THEN
    -- JSON null é recusado antes de verificar o tipo (NOT NULL na coluna)
    IF p_campos->'paid_by_member_id' = 'null'::jsonb THEN
      RAISE EXCEPTION 'Campo obrigatório vazio';
    END IF;
    IF jsonb_typeof(p_campos->'paid_by_member_id') <> 'string' THEN
      RAISE EXCEPTION 'Campo inválido';
    END IF;
  END IF;
  IF p_campos ? 'owner_share' THEN
    IF jsonb_typeof(p_campos->'owner_share') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'Campo inválido';
    END IF;
    IF p_campos->'owner_share' <> 'null'::jsonb
       AND ((p_campos->>'owner_share')::numeric < 0 OR (p_campos->>'owner_share')::numeric > 1) THEN
      RAISE EXCEPTION 'Cota inválida';
    END IF;
  END IF;
  IF p_campos ? 'is_benefit' THEN
    IF jsonb_typeof(p_campos->'is_benefit') <> 'boolean' THEN
      RAISE EXCEPTION 'Campo inválido';
    END IF;
  END IF;
  IF p_campos ? 'is_futile' THEN
    IF jsonb_typeof(p_campos->'is_futile') <> 'boolean' THEN
      RAISE EXCEPTION 'Campo inválido';
    END IF;
  END IF;

  -- Passo 5: trava por família (mesma chave das outras RPCs recorrencia_* — D6)
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('recorrencia:' || v_family::text, 0));

  -- Passo 6: carrega a regra com lock (autorização = family_id = v_family)
  SELECT * INTO v_rr
    FROM public.recurring_rules
    WHERE id = p_regra_id AND family_id = v_family
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada';
  END IF;

  -- Passo 7: aplica o patch em memória, normaliza pares, valida resultado
  v_novo := v_rr;

  IF p_campos ? 'description'       THEN v_novo.description       := btrim(p_campos->>'description'); END IF;
  IF p_campos ? 'amount'            THEN v_novo.amount             := (p_campos->>'amount')::numeric; END IF;
  IF p_campos ? 'account_id'        THEN v_novo.account_id        := (p_campos->>'account_id')::uuid; END IF;
  IF p_campos ? 'category_id' THEN
    -- JSON null → SQL NULL; caso contrário, cast para uuid
    v_novo.category_id := CASE
      WHEN p_campos->'category_id' = 'null'::jsonb THEN NULL
      ELSE (p_campos->>'category_id')::uuid
    END;
  END IF;
  IF p_campos ? 'payment_method_id' THEN
    v_novo.payment_method_id := CASE
      WHEN p_campos->'payment_method_id' = 'null'::jsonb THEN NULL
      ELSE (p_campos->>'payment_method_id')::uuid
    END;
  END IF;
  IF p_campos ? 'owner_member_id' THEN
    v_novo.owner_member_id := CASE
      WHEN p_campos->'owner_member_id' = 'null'::jsonb THEN NULL
      ELSE (p_campos->>'owner_member_id')::uuid
    END;
  END IF;
  IF p_campos ? 'owner_share' THEN
    v_novo.owner_share := CASE
      WHEN p_campos->'owner_share' = 'null'::jsonb THEN NULL
      ELSE (p_campos->>'owner_share')::numeric
    END;
  END IF;
  IF p_campos ? 'paid_by_member_id' THEN v_novo.paid_by_member_id := (p_campos->>'paid_by_member_id')::uuid; END IF;
  IF p_campos ? 'notes' THEN
    v_novo.notes := CASE
      WHEN p_campos->'notes' = 'null'::jsonb THEN NULL
      ELSE p_campos->>'notes'
    END;
  END IF;
  IF p_campos ? 'is_benefit'   THEN v_novo.is_benefit   := (p_campos->>'is_benefit')::boolean; END IF;
  IF p_campos ? 'is_futile'    THEN v_novo.is_futile    := (p_campos->>'is_futile')::boolean; END IF;
  IF p_campos ? 'futile_label' THEN
    v_novo.futile_label := CASE
      WHEN p_campos->'futile_label' = 'null'::jsonb THEN NULL
      ELSE p_campos->>'futile_label'
    END;
  END IF;

  -- Normalização dos pares (antes da validação do resultado):
  --   7a. owner_member_id presente e NULL, owner_share AUSENTE → owner_share := NULL
  IF (p_campos ? 'owner_member_id') AND v_novo.owner_member_id IS NULL
     AND NOT (p_campos ? 'owner_share') THEN
    v_novo.owner_share := NULL;
  END IF;
  --   7b. is_futile presente e false, futile_label AUSENTE → futile_label := NULL
  IF (p_campos ? 'is_futile') AND v_novo.is_futile = false
     AND NOT (p_campos ? 'futile_label') THEN
    v_novo.futile_label := NULL;
  END IF;

  -- Validação do resultado (invariantes que o banco CHECK não garante para dados legados):
  IF v_novo.owner_share IS NOT NULL AND v_novo.owner_member_id IS NULL THEN
    RAISE EXCEPTION 'Escolha de quem é a cota';
  END IF;
  IF v_novo.futile_label IS NOT NULL AND NOT v_novo.is_futile THEN
    RAISE EXCEPTION 'Marque como fútil para usar o rótulo';
  END IF;
  -- Benefício/fútil só valem para despesa — mas SÓ valida o que o patch LIGA (L-035, D8):
  IF v_rr.type <> 'despesa'
     AND ((p_campos ? 'is_benefit' AND v_novo.is_benefit)
       OR (p_campos ? 'is_futile' AND v_novo.is_futile)) THEN
    RAISE EXCEPTION 'Benefício e fútil só valem para saída';
  END IF;

  -- Passo 8: valida referências (só as chaves presentes), com family_id = v_family
  IF p_campos ? 'account_id' THEN
    SELECT a.type INTO v_acc_type
      FROM public.accounts a
      WHERE a.id = v_novo.account_id AND a.family_id = v_family;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta não encontrada nesta família';
    END IF;
    IF EXISTS (SELECT 1 FROM public.investment_wallets w WHERE w.account_id = v_novo.account_id) THEN
      RAISE EXCEPTION 'A carteira de investimento não aceita recorrência';
    END IF;
    IF EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v_novo.account_id AND a.archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Esta conta está arquivada';
    END IF;
    IF v_acc_type = 'cartao' AND v_rr.type = 'receita' THEN
      RAISE EXCEPTION 'Receita recorrente não pode ser no cartão';
    END IF;
  END IF;
  IF (p_campos ? 'owner_member_id') AND v_novo.owner_member_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.family_members m WHERE m.id = v_novo.owner_member_id AND m.family_id = v_family) THEN
      RAISE EXCEPTION 'Responsável não encontrado nesta família';
    END IF;
  END IF;
  IF p_campos ? 'paid_by_member_id' THEN
    IF NOT EXISTS (SELECT 1 FROM public.family_members m WHERE m.id = v_novo.paid_by_member_id AND m.family_id = v_family) THEN
      RAISE EXCEPTION 'Quem paga não foi encontrado nesta família';
    END IF;
  END IF;
  IF (p_campos ? 'category_id') AND v_novo.category_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = v_novo.category_id AND c.family_id = v_family) THEN
      RAISE EXCEPTION 'Categoria não encontrada nesta família';
    END IF;
  END IF;
  IF (p_campos ? 'payment_method_id') AND v_novo.payment_method_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.payment_methods pm WHERE pm.id = v_novo.payment_method_id AND pm.family_id = v_family) THEN
      RAISE EXCEPTION 'Forma de pagamento não encontrada nesta família';
    END IF;
  END IF;

  -- Passo 9: gera os meses futuros (escopo = UMA regra, L-033 — D5)
  v_alvo := (date_trunc('month', public.carteira_hoje()) + interval '11 months')::date;
  PERFORM public.recorrencia_gerar(v_family, v_alvo, v_rr.id);
  -- Relê generated_through DEPOIS do gerador (§3.4 do plano)
  SELECT generated_through INTO v_gt FROM public.recurring_rules WHERE id = v_rr.id;

  -- Passo 10: valida a janela com o generated_through real
  IF p_a_partir < v_rr.start_period
     OR p_a_partir < date_trunc('month', public.carteira_hoje())::date
     OR p_a_partir > (v_gt + interval '1 month')::date THEN
    RAISE EXCEPTION 'Mês inválido';
  END IF;

  -- Passo 11: UPDATE da regra
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
  WHERE id = v_rr.id AND family_id = v_family;
  GET DIAGNOSTICS v_r = ROW_COUNT;

  -- Busca closing_day da conta nova (para recalcular fatura se necessário)
  IF p_campos ? 'account_id' THEN
    SELECT a.closing_day INTO v_closing
      FROM public.accounts a WHERE a.id = v_novo.account_id;
  END IF;

  -- Passo 12: UPDATE dos lançamentos pendentes a partir de p_a_partir
  -- Pares gravados juntos (D3): (owner_member_id, owner_share) e (is_futile, futile_label).
  -- Fatura recalculada só quando a conta muda, com t.date (D4).
  -- Não escreve recurring_rule_id/recurring_period/prompt_snoozed_until — trigger não dispara (D7).
  UPDATE public.transactions t SET
    description       = CASE WHEN p_campos ? 'description'
                              THEN v_novo.description       ELSE t.description END,
    amount            = CASE WHEN p_campos ? 'amount'
                              THEN v_novo.amount            ELSE t.amount END,
    account_id        = CASE WHEN p_campos ? 'account_id'
                              THEN v_novo.account_id        ELSE t.account_id END,
    invoice_year      = CASE
      WHEN p_campos ? 'account_id' AND t.account_id IS DISTINCT FROM v_novo.account_id THEN
        CASE
          WHEN v_closing IS NULL THEN NULL
          WHEN EXTRACT(DAY FROM t.date)::int < v_closing
               THEN EXTRACT(YEAR FROM t.date)::int
          ELSE EXTRACT(YEAR FROM (t.date + interval '1 month'))::int
        END
      ELSE t.invoice_year
    END,
    invoice_month     = CASE
      WHEN p_campos ? 'account_id' AND t.account_id IS DISTINCT FROM v_novo.account_id THEN
        CASE
          WHEN v_closing IS NULL THEN NULL
          WHEN EXTRACT(DAY FROM t.date)::int < v_closing
               THEN EXTRACT(MONTH FROM t.date)::int
          ELSE EXTRACT(MONTH FROM (t.date + interval '1 month'))::int
        END
      ELSE t.invoice_month
    END,
    category_id       = CASE WHEN p_campos ? 'category_id'
                              THEN v_novo.category_id       ELSE t.category_id END,
    payment_method_id = CASE WHEN p_campos ? 'payment_method_id'
                              THEN v_novo.payment_method_id ELSE t.payment_method_id END,
    paid_by_member_id = CASE WHEN p_campos ? 'paid_by_member_id'
                              THEN v_novo.paid_by_member_id ELSE t.paid_by_member_id END,
    notes             = CASE WHEN p_campos ? 'notes'
                              THEN v_novo.notes             ELSE t.notes END,
    is_benefit        = CASE WHEN p_campos ? 'is_benefit'
                              THEN v_novo.is_benefit        ELSE t.is_benefit END,
    -- Par owner: grava os DOIS quando qualquer um estiver presente (D3, CHECK 00001:209)
    owner_member_id   = CASE WHEN p_campos ? 'owner_member_id' OR p_campos ? 'owner_share'
                              THEN v_novo.owner_member_id   ELSE t.owner_member_id END,
    owner_share       = CASE WHEN p_campos ? 'owner_member_id' OR p_campos ? 'owner_share'
                              THEN v_novo.owner_share       ELSE t.owner_share END,
    -- Par fútil: grava os DOIS quando qualquer um estiver presente (D3, CHECK 00001:218)
    is_futile         = CASE WHEN p_campos ? 'is_futile' OR p_campos ? 'futile_label'
                              THEN v_novo.is_futile         ELSE t.is_futile END,
    futile_label      = CASE WHEN p_campos ? 'is_futile' OR p_campos ? 'futile_label'
                              THEN v_novo.futile_label      ELSE t.futile_label END
  WHERE t.family_id = v_family
    AND t.recurring_rule_id = v_rr.id
    AND t.recurring_period >= p_a_partir
    AND t.is_paid = false;
  GET DIAGNOSTICS v_t = ROW_COUNT;

  -- Passo 13: retorna contadores
  RETURN QUERY SELECT v_r, v_t;
END;
$$;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Grants (mesmo arranjo de 00019:716-725)
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.recorrencia_alterar_regra(uuid, jsonb, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recorrencia_alterar_regra(uuid, jsonb, date) TO authenticated;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Rede de proteção: a migration se recusa a terminar incompleta
-- (mesmo modelo de 00019:731-784, adaptado para a função nova)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text := '';
  v_n     int;
BEGIN
  -- A função existe?
  SELECT count(*) INTO v_n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'recorrencia_alterar_regra';
  IF v_n <> 1 THEN
    v_erros := v_erros || ' recorrencia_alterar_regra não encontrada;';
  END IF;

  -- SECURITY DEFINER, dono postgres, search_path vazio?
  SELECT count(*) INTO v_n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'recorrencia_alterar_regra'
    AND p.prosecdef
    AND pg_get_userbyid(p.proowner) = 'postgres'
    AND 'search_path=""' = ANY (p.proconfig);
  IF v_n <> 1 THEN
    v_erros := v_erros || ' recorrencia_alterar_regra: DEFINER/dono/search_path incorretos;';
  END IF;

  -- anon sem EXECUTE?
  IF has_function_privilege('anon', 'public.recorrencia_alterar_regra(uuid, jsonb, date)', 'EXECUTE') THEN
    v_erros := v_erros || ' recorrencia_alterar_regra executável pelo anon;';
  END IF;

  -- authenticated com EXECUTE?
  IF NOT has_function_privilege('authenticated', 'public.recorrencia_alterar_regra(uuid, jsonb, date)', 'EXECUTE') THEN
    v_erros := v_erros || ' recorrencia_alterar_regra sem EXECUTE para authenticated;';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'Migration 00021 abortada:%', v_erros;
  END IF;

  RAISE NOTICE 'Migration 00021: recorrencia_alterar_regra criada; SECURITY DEFINER, dono postgres, search_path vazio; anon sem EXECUTE, authenticated com EXECUTE.';
END $$;
