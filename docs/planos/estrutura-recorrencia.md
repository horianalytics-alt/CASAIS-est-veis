# Plano do Estrutura — Recorrência (assinaturas e fixos)

> FASE: PLANO, 2026-11-20. Spec: `docs/superpowers/specs/2026-11-20-recorrencia-assinaturas-design.md`.
> Nada aqui foi escrito em `supabase/migrations/`, `src/` ou `tests/`. Todo SQL abaixo é DESENHO.
> Banco consultado: produção, SOMENTE SELECT (autorização do Heitor de 2026-11-20).
> Ferramenta de leitura: `npx -y supabase@2 db query --db-url <pooler> -f <arquivo>` (senha lida de
> `app/.env.local` dentro do script e mascarada na saída; nenhum vitest rodou nesta fase).

Skills carregadas nesta fase: `supabase:supabase-postgres-best-practices` (abertas:
`references/security-rls-performance.md`, `data-upsert.md`, `lock-advisory.md`,
`schema-foreign-key-indexes.md`) e `vercel:nextjs` (só o índice do SKILL.md; nenhuma afirmação
deste plano depende de uma referência dela que eu não tenha aberto).

---

## 0. Resumo em 10 linhas

1. `pg_cron` EXISTE no catálogo do projeto, mas NÃO está instalado. Recomendo NÃO instalar e
   renovar o horizonte sob demanda (ao abrir o app), dentro da mesma RPC que monta a fila do pop-up.
2. Tabela nova `recurring_rules` (por família, RLS só SELECT; escrita só por RPC, padrão da carteira 00016).
3. `transactions` ganha 3 colunas nulas: `recurring_rule_id`, `recurring_period` (1º dia do mês de
   competência, nunca muda) e `prompt_snoozed_until` (o "pergunte de novo a partir de").
4. Idempotência dupla: marca d'água `generated_through` na regra (gera só para frente, então um mês
   excluído à mão não renasce) + índice único `(recurring_rule_id, recurring_period)` como rede.
5. Cartão: marcar uma compra de cartão como paga fora do `pay_invoice` desfaz a conta da fatura.
   Recomendo que recorrência em cartão NÃO gere pop-up (decisão do Heitor, §5).
6. Imutabilidade do acerto (00015) e trava da carteira (00016/00017) não conflitam — provado pelo
   texto dos triggers (§4). A conta-carteira é recusada na criação da regra.
7. Realtime: `transactions` já está na publicação, com REPLICA IDENTITY FULL (saída colada).
8. Migration: `00019_recorrencia.sql`. Teste: `tests/integration/recorrencia-rls.sql` + runner +
   mutante, em transação SEMPRE desfeita — e mesmo assim precisa de autorização nova (§9.4).
9. Server Actions novas em `src/actions/recorrencia.ts`; `salvarLancamento` fica intocada.
10. Previsão (Dash) NÃO precisa mudar; Carteira (`pending_inflow/outflow`) vai inflar — decisão (§11).

---

## 1. Evidência colada (banco de produção, só leitura)

### 1.1 Extensões (pergunta 1)

```
select name, default_version, installed_version from pg_available_extensions
 where name in ('pg_cron','pg_net','pgmq') order by name;
-> pg_cron  1.6.4  installed_version: null
   pg_net   0.20.4 installed_version: null
   pgmq     1.5.1  installed_version: null
```

```
ext_installed: "pg_stat_statements 1.11,pgcrypto 1.3,plpgsql 1.0,supabase_vault 0.3.1,uuid-ossp 1.1"
tz:            "UTC"
server_version:"17.11"
```

### 1.2 Realtime e triggers de `transactions` (perguntas 3 e 4)

```
pub:                            "accounts,family_members,transactions"
replica_identity_transactions:  "f"        (f = FULL)
triggers_transactions:          "trg_transactions_touch:O,trg_tx_acerto_imutavel_ins:O,
                                 trg_tx_acerto_imutavel_upd:O,trg_tx_carteira_del:O,
                                 trg_tx_carteira_ins:O,trg_tx_carteira_upd:O"   (6 triggers, todos 'O' = ativos)
```

### 1.3 As RPCs vivas são as de 00003 (não foram redefinidas)

```
proc_save_transactions:  postgres definer=true md5=ae74af833846b09176866e31abfddc7d
proc_pay_invoice:        postgres definer=true md5=d6d92645d892811a204f494d16d0540e
-- md5 do corpo entre $$ no arquivo 00003_functions.sql (node, crypto):
save_transactions ae74af833846b09176866e31abfddc7d
pay_invoice       d6d92645d892811a204f494d16d0540e
```

### 1.4 Colunas atuais de `transactions` e volume

```
cols_transactions: id,family_id,type,description,amount,date,account_id,to_account_id,owner_member_id,
 owner_share,created_by_member_id,paid_by_member_id,category_id,payment_method_id,is_paid,paid_date,notes,
 is_benefit,is_futile,futile_label,recurrence_months,recurrence_index,recurrence_parent_id,invoice_year,
 invoice_month,created_at,updated_at,settlement_to_member_id

tx_total: 13 | familias: 1 | cartoes: 3 | carteiras: 0 | existe_recurring_rules: null

-- receita/despesa por tipo de conta e status:
conta_tipo corrente | is_paid true | n 13 | em_serie 0
```

Leitura: hoje há 13 lançamentos, todos pagos em conta corrente, nenhum em cartão, nenhuma série.
Uma coluna nova com CHECK valida 13 linhas — custo desprezível.

---

## 2. Pergunta 1 — `pg_cron`: disponível, não instalado. Escolha: renovação sob demanda

**Fato:** §1.1. Instalar exigiria `CREATE EXTENSION pg_cron` numa migration (escrita).

**Escolha [minha, contestável]:** NÃO instalar. A RPC `recorrencia_fila_de_cobranca()` (§7),
chamada quando o app abre, primeiro garante o horizonte da família de quem chama e depois devolve
a fila do pop-up. Motivos:

- O job do cron roda sem `auth.uid()`: precisaria de uma função que gera para TODAS as famílias,
  sem o filtro por família de quem chama — exatamente o tipo de função que a checklist manda
  evitar (SECURITY DEFINER tocando tabela com RLS sem filtro de tenant). Sob demanda, o filtro é a
  família da sessão.
- Precedente no projeto: a carteira escolheu o mesmo caminho
  (`00016_carteira_investimento.sql:24`: "Nada é gravado por tempo, e não há cron.").
- A renovação só ESCREVE quando o mês virou (marca d'água atrás do alvo); no resto das chamadas
  é só leitura.

**Custo aceito:** se ninguém abrir o app por mais de ~6 meses, a Previsão (que mostra 6 meses,
§12) pode abrir com meses faltando até a primeira chamada da fila. Com 12 meses de horizonte e
o app aberto ao menos 1 vez a cada 6 meses, nunca falta.

---

## 3. Pergunta 2 — Cartão de crédito: o que "já foi pago" significaria

### 3.1 Como funciona hoje (código colado)

`save_transactions` (00003:254, 291-303, 329-333): a compra no cartão recebe a fatura pela regra
"dia < fechamento = fatura do mês; senão a seguinte", e `is_paid` é o que o cliente mandar:

```sql
v_is_paid := COALESCE((v_item->>'is_paid')::boolean, false);
...
IF EXTRACT(DAY FROM v_date)::int < v_closing THEN  -- fatura do mês
...
(v_is_paid AND v_index = 1),   -- só a 1ª parcela pode nascer paga
```

`pay_invoice` (00003:458-492): soma SÓ as compras **não pagas** da fatura, lança UMA
transferência da conta de origem para o cartão com esse total, e marca todas como pagas:

```sql
SELECT COALESCE(sum(t.amount), 0) INTO v_total ... AND t.is_paid = false AND t.type IN ('despesa','investimento');
IF v_total <= 0 THEN RAISE EXCEPTION 'Esta fatura não tem valor em aberto';
INSERT INTO transactions (... 'transferencia', 'Pagamento de fatura', v_total ...)
UPDATE transactions t SET is_paid = true, paid_date = v_date WHERE ... AND t.is_paid = false ...
```

`v_invoices` (00004:73-101): `open_amount = sum(amount) FILTER (WHERE is_paid = false)`,
`is_paid = bool_and(t.is_paid)`.

`v_account_balances` (00004:31-48): saída paga conta contra a conta da compra (o cartão);
transferência recebida soma no destino (o cartão).

Formulário de lançar (`src/components/transacoes/form-lancamento.tsx:112` e `:128`):
`estaPago: true` é o padrão, e não há nada que desligue isso quando a conta é cartão
(`:209` só calcula o rótulo da fatura).

### 3.2 Consequência

Se o pop-up marcar uma compra de cartão como paga (`is_paid = true`) fora do `pay_invoice`:
- ela sai do `open_amount` da fatura;
- quando a fatura for paga, a transferência do banco para o cartão vem MENOR que a fatura real;
- o saldo do banco fica maior do que é, e o do cartão fica negativo nesse valor para sempre.

Ou seja: para cartão, "pago" significa "a fatura foi paga", e quem marca isso é o `pay_invoice`.

### 3.3 Opções (a decisão é do Heitor)

| | O que acontece | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | Assinatura no cartão nasce pendente, NÃO entra no pop-up. Vira paga quando a fatura é paga, como qualquer compra. | Saldo e fatura sempre certos; zero coluna extra; menos interrupção (a cobrança no cartão é automática). | O casal não "confirma" que a Netflix foi cobrada. |
| B | Pop-up no cartão pergunta outra coisa: "A cobrança apareceu na fatura?" Sim = some do pop-up, continua pendente até pagar a fatura. Não = pergunta de novo amanhã. | Mantém o hábito de confirmar. | Precisa de mais uma coluna (`prompt_confirmed_at`) e de dois textos de pop-up; o "sim" não muda dinheiro nenhum, o que pode confundir. |
| C | Pop-up marca a compra de cartão como paga, igual conta corrente. | Comportamento igual em tudo. | **Quebra a fatura** (§3.2). Não recomendo. |

Achado fora do escopo, para `PENDENCIAS.md`: o formulário atual deixa lançar compra de cartão
já como paga (padrão `estaPago: true`), com o mesmo efeito do §3.2. Hoje não há nenhuma linha
assim (§1.4: zero lançamentos em cartão).

---

## 4. Pergunta 3 — Imutabilidade do acerto (00015) e trava da 00014

**Trigger do acerto** (00015:127-138): só dispara quando a linha É ou VIRA acerto:

```sql
CREATE TRIGGER trg_tx_acerto_imutavel_ins BEFORE INSERT ... WHEN (NEW.settlement_to_member_id IS NOT NULL)
CREATE TRIGGER trg_tx_acerto_imutavel_upd BEFORE UPDATE ...
  WHEN (OLD.settlement_to_member_id IS NOT NULL OR NEW.settlement_to_member_id IS NOT NULL)
```

Lançamento recorrente é sempre receita/despesa (CHECK novo, §6.2), e acerto é sempre
transferência (`tx_acerto_so_em_transferencia`, 00010). Logo os dois conjuntos são disjuntos:
o trigger nunca entra no plpgsql para uma linha recorrente.

**Trava da 00014**: ela só REMOVEU a FK de `recurrence_parent_id` e conferiu o ramo de série de
`delete_transactions` (00014:71-72 o DROP; 88-132 o bloco 3 de conferência). A recorrência NÃO usa `recurrence_parent_id` nem
`recurrence_months` (são das parcelas); CHECK novo obriga os dois NULL em linha recorrente.
`delete_transactions(id,'series')` numa linha recorrente apaga só ela (`v_parent = COALESCE(NULL, id)`,
00006:405-450). Sem conflito.

**Trava da carteira** (versão viva = 00017:456-497):

```sql
IF current_setting('app.carteira_rpc', true) = 'on' OR current_user IN ('service_role','supabase_admin')
   OR (TG_OP = 'DELETE' AND pg_trigger_depth() > 1) THEN RETURN ...
IF TG_OP = 'UPDATE' AND NEW.type ... NEW.amount ... NEW.date ... NEW.account_id ... NEW.to_account_id
   ... NEW.is_paid ... NEW.paid_date ... NEW.family_id (todos IS NOT DISTINCT FROM OLD) THEN RETURN NEW;
IF (... EXISTS (SELECT 1 FROM investment_wallets w WHERE w.account_id = NEW.account_id ...)) THEN
  RAISE ... '42501' 'Movimentos da carteira de investimento só podem ser feitos pela área de Investimentos.'
```

- `postgres` (dono das RPCs SECURITY DEFINER) **não** está na lista liberada. Então: se uma regra
  apontar para a conta-carteira, a geração seria recusada com 42501. Correção: `recorrencia_criar`
  recusa conta-carteira ANTES de gravar (1ª recusa, §7.1).
- Mudar só `prompt_snoozed_until` não mexe em coluna de dinheiro → passa no 2º IF.
- Responder "pago" muda `is_paid/paid_date` → cai no 3º IF, que só recusa conta-carteira.

**Conclusão:** as 3 colunas novas cabem em `transactions` sem quebrar nenhuma trava. A PROVAR na
execução pelos casos T01/C01/P01 (§9).

---

## 5. Decisões que precisam do Heitor (português simples, com recomendação)

1. **Assinatura no cartão de crédito e o pop-up.** O cartão só fica "pago" quando a fatura é paga.
   Recomendo: assinatura no cartão NÃO aparece no pop-up; ela é paga junto com a fatura (opção A, §3.3).
2. **"Ainda não" de um esconde do outro?** Se o Heitor responde "ainda não", o pop-up some também
   para a Carol até amanhã? Recomendo SIM (um responde pelos dois, como no "já paguei").
3. **Data do pagamento quando responde "sim" atrasado** (ex.: venceu dia 5, abriu o app dia 8).
   Recomendo registrar como pago na data em que respondeu (dia 8), igual ao "marcar como pago" em
   lote que já existe (`esquemas-edicao-lancamento.ts:292-295`). Alternativa: dia do vencimento.
4. **"Os próximos 12 meses"** contam o mês atual? Recomendo: mês atual + 11 à frente (12 no total).
5. **Saldo "a pagar/a receber" na Carteira** vai crescer: com salário recorrente, o cartão da conta
   mostraria 12 salários "a receber" (§11). Recomendo limitar esse número ao mês atual — mexe também
   em como as parcelas aparecem ali, por isso é decisão sua (e é trabalho do Dash/Estrutura numa
   migration própria, fora desta).
6. **Orçamento por categoria** já conta gasto pendente do mês (00013, comentário da view). A
   assinatura pendente do mês vai contar no orçamento antes de ser paga. Recomendo manter (é gasto
   comprometido; parcelas já fazem isso).
7. **Encerrar**: o último mês pode ser anterior ao mês de início (= cancelar tudo que ainda não foi
   pago)? Recomendo NÃO nesta rodada: último mês >= mês de início; cancelar tudo = encerrar no mês
   de início e excluir aquela linha à mão.

---

## 6. Schema proposto (DESENHO — migration `app/supabase/migrations/00019_recorrencia.sql`)

### 6.1 Tabela `recurring_rules`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| family_id | uuid NOT NULL → families ON DELETE CASCADE | coluna de tenant |
| type | text NOT NULL CHECK in ('receita','despesa') | só mensal, só estes 2 tipos [Heitor] |
| description | text NOT NULL CHECK length(btrim) > 0 | |
| amount | numeric(14,2) NOT NULL CHECK > 0 | **igual a `transactions.amount`** (00001:142) |
| account_id | uuid NOT NULL | FK composta → accounts ON DELETE RESTRICT (igual transactions) |
| category_id | uuid | FK composta → categories ON DELETE SET NULL (category_id) (padrão 00009) |
| payment_method_id | uuid | FK composta → payment_methods ON DELETE SET NULL (payment_method_id) |
| owner_member_id | uuid | FK composta → family_members ON DELETE SET NULL (owner_member_id) |
| owner_share | numeric(5,4) CHECK 0..1 | CHECK cota exige responsável (igual tx) |
| paid_by_member_id | uuid NOT NULL | FK composta → family_members RESTRICT |
| created_by_member_id | uuid NOT NULL | FK composta → family_members RESTRICT; resolvido no banco |
| notes | text | |
| is_benefit, is_futile | boolean NOT NULL default false | |
| futile_label | text CHECK (futile_label IS NULL OR is_futile) | |
| day_of_month | int NOT NULL CHECK 1..31 | dia da data do 1º lançamento [Minha chamada do Maestro] |
| start_period | date NOT NULL CHECK (= date_trunc('month')) | 1º dia do mês de início |
| end_period | date NULL CHECK (NULL ou 1º dia de mês, >= start_period) | NULL = sem fim |
| generated_through | date NOT NULL CHECK (1º dia de mês, >= start_period − 1 mês) | marca d'água; nasce em start_period − 1 mês (nada gerado ainda) |
| created_at, updated_at | timestamptz NOT NULL default now() | touch trigger (reusa `touch_updated_at`, 00001:235) |
| UNIQUE (family_id, id) | | alvo da FK composta de transactions |

Índice: `(family_id)` para o RLS e a lista (`schema-foreign-key-indexes.md`: FK não ganha índice sozinha).

**Desvio da spec (contestação com evidência):**
- Spec §5 diz "valor em centavos". `transactions.amount` é `numeric(14,2)` em reais (00001:142) e a
  regra só existe para ser COPIADA em `transactions`. Centavos exigiria a ponte `/100` em toda
  geração (a carteira faz isso, 00016 cabeçalho: "A ponte é cents::numeric / 100"). Escolho reais,
  como `transactions`. Contestável.
- Spec §5 lista "ativa". Não crio coluna: ativa = `end_period IS NULL OR end_period >= mês atual`.
  Uma coluna a mais poderia discordar de `end_period`.

### 6.2 `transactions` — 3 colunas novas (todas nulas, sem default: só catálogo)

```
recurring_rule_id     uuid  -- FK (family_id, recurring_rule_id) → recurring_rules(family_id, id), NO ACTION
recurring_period      date  -- competência: 1º dia do mês; NUNCA muda depois de gerada
prompt_snoozed_until  date  -- pop-up some até esta data (inclusive a véspera); NULL = perguntar
```

- FK NO ACTION (o padrão), não RESTRICT: mesmo motivo da 00016 bloco 1 ("apagar a família leva ...
  no MESMO comando, e NO ACTION só é conferido no fim do comando"). Cliente não apaga regra (§6.3).
- CHECK `tx_recorrencia_completa`:
  `(recurring_rule_id IS NULL AND recurring_period IS NULL AND prompt_snoozed_until IS NULL)
   OR (recurring_rule_id IS NOT NULL AND recurring_period IS NOT NULL
       AND recurring_period = date_trunc('month', recurring_period)::date)`
- CHECK `tx_recorrencia_sem_parcela`:
  `recurring_rule_id IS NULL OR (type IN ('receita','despesa') AND recurrence_months IS NULL
   AND recurrence_parent_id IS NULL)`
- Índice ÚNICO parcial `ux_transactions_recorrencia_periodo ON transactions (recurring_rule_id,
  recurring_period) WHERE recurring_rule_id IS NOT NULL`. Também serve de índice da FK (coluna líder).
- Fila do pop-up usa o índice que já existe `idx_transactions_unpaid (family_id, date) WHERE
  is_paid = false` (00001:231). Nenhum índice novo para ela.
- Nome `recurring_*` de propósito: `recurrence_*` já é das parcelas.

Por que `recurring_period` e não a `date` no índice único: "só este mês" pode mudar a data da linha
(`montarPatchIndividual` grava `date: e.data`, `esquemas-edicao-lancamento.ts:214`). Se a chave fosse
a data, o gerador acharia o mês "vazio" e duplicaria.

### 6.3 RLS e privilégios — QUEM LÊ / QUEM ESCREVE cada linha

| Tabela | Lê | Insere | Altera | Apaga |
|---|---|---|---|---|
| `recurring_rules` | membro da MESMA família (policy `recurring_rules_select`, `family_id = (SELECT public.get_user_family_id_self())`) | só as RPCs `recorrencia_*` (SECURITY DEFINER, família de `auth.uid()`) | só as RPCs | ninguém pelo cliente; só cascata de família |
| `transactions` (linhas recorrentes) | igual hoje: mesma família (policy 00006:281-284) | só `recorrencia_*` (trigger congela, abaixo) | colunas comuns: igual hoje (policy 00006:295-299, as actions de edição). As 3 colunas novas: só RPC | igual hoje: `delete_transactions` e policy de delete |

Padrão da carteira (00016:173-187): `ENABLE ROW LEVEL SECURITY`; UMA policy `FOR SELECT TO
authenticated`; `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; `GRANT SELECT ... TO authenticated`.
Sem INSERT/UPDATE/DELETE para o cliente: não existe policy de escrita para errar.
`(SELECT ...)` em volta da função: `security-rls-performance.md` ("wrap functions in SELECT").

**Trigger novo `tx_recorrencia_congela`** (BEFORE INSERT/UPDATE em transactions, SECURITY INVOKER,
`search_path = ''`, modelo 00015): para papel diferente de `postgres/service_role/supabase_admin`,
recusa com 42501 'Dados da recorrência só mudam pela tela de assinaturas.' quando
INSERT traz qualquer das 3 colunas não nula, ou UPDATE muda qualquer uma delas. `WHEN` no
trigger para não entrar no plpgsql em lançamento comum (mesma técnica de 00015:127-138).
Motivo: a policy `transactions_update` deixa o cliente mudar qualquer coluna da própria família;
sem o trigger, um REST podia "adotar" uma linha comum numa regra (e travar o índice único) ou
apagar o vínculo.

---

## 7. Funções (DESENHO). Todas: `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = ''`,
nomes qualificados `public.`, família/membro de `auth.uid()` no corpo, `pg_advisory_xact_lock`
por família antes de ler estado (`lock-advisory.md`; mesmo arranjo da 00016 cabeçalho), toda
recusa ANTES da primeira escrita (L-005), `REVOKE EXECUTE ... FROM PUBLIC, anon` +
`GRANT ... TO authenticated` (exceto as internas). "Hoje" = `public.carteira_hoje()`
(00016:232-239, `now() AT TIME ZONE 'America/Sao_Paulo'`), porque o banco roda em UTC (§1.1).

### 7.0 Internas (sem EXECUTE para authenticated)

- `recorrencia_data(p_period date, p_dia int) RETURNS date` IMMUTABLE: `p_period + LEAST(p_dia,
  último dia do mês) - 1`. Mesma regra de `save_transactions` (00003:278-289: `LEAST(dia, último dia)`).
  Conferido em node (não SQL ainda; o SQL vira caso D01):
  ```
  dia 31 em 2027-01..04 e 2028-02 -> 2027-01-31 2027-02-28 2027-03-31 2027-04-30 2028-02-29
  ```
  A data vem sempre de `day_of_month` da regra, nunca da linha anterior (sem "deriva" 31→28→28).
- `recorrencia_fatura(p_closing int, p_data date)` → (ano, mês): cópia da regra 00003:291-303.
- `recorrencia_gerar(p_family uuid, p_ate date) RETURNS int`: para cada regra da família com
  `generated_through < LEAST(p_ate, COALESCE(end_period, p_ate))`, insere os meses
  `generated_through + 1 mês .. alvo` com `INSERT ... ON CONFLICT (recurring_rule_id, recurring_period)
  WHERE recurring_rule_id IS NOT NULL DO NOTHING` (`data-upsert.md`) e avança `generated_through`.
  Linhas nascem `is_paid = false`. Só gera para frente: um mês excluído à mão NÃO renasce.
  Recebe a família como parâmetro → por isso SEM grant para `authenticated` (sem isso viraria um
  "gere na família X"). Chamada só pelas RPCs abaixo, com a família da sessão.

### 7.1 `recorrencia_criar(p_item jsonb) RETURNS TABLE (regra_id uuid, lancamentos int)`

Mesmo formato de item de `save_transactions` (o que `salvarLancamento` monta, `lancamento.ts`),
sem `recurrence_months`/`to_account_id`. Ordem e 1ª recusa de cada caso:
1. sessão sem família → 'Você não faz parte de nenhuma família'
2. `type` fora de receita/despesa → 'Recorrência só para entrada ou saída'
3. conta não é da família (`accounts.id AND family_id = v_family`) → 'Conta não encontrada nesta família'
   (frase já existente, 00003:271, e já na lista de `resultado.ts`:
   `146:  'Conta não encontrada nesta família',`)
4. conta é carteira (`investment_wallets.account_id`) → 'A carteira de investimento não aceita recorrência'
5. conta arquivada → 'Esta conta está arquivada'
Depois: INSERT da regra (`start_period` = mês da data, `day_of_month` = dia da data,
`generated_through` = `start_period` − 1 mês), `recorrencia_gerar(v_family,
GREATEST(mês atual + 11, start_period))` (início além do horizonte ainda gera o 1º mês; caso D03).
Início no PASSADO gera os meses passados como pendentes, e eles entram na fila do pop-up (risco 9). E, se
`is_paid` veio true, marca SÓ a linha do mês de início como paga com o `paid_date` do item
(como a 1ª parcela, 00003:329-333; para cartão, conforme a decisão 1 — na opção A a action recusa
`estaPago=true` em cartão com recorrência).

### 7.2 `recorrencia_fila_de_cobranca() RETURNS TABLE (id, recurring_rule_id, type, description,
amount, date, account_id, recurring_period)`

1. `recorrencia_gerar(v_family, mês atual + 11)` (escreve só se o mês virou).
2. Devolve, da família da sessão: `recurring_rule_id IS NOT NULL AND is_paid = false AND date <= hoje
   AND COALESCE(prompt_snoozed_until, date) <= hoje` [+ na opção A: conta não é cartão],
   `ORDER BY date, id` (fila estável, L-010).
Uma RPC (e não um SELECT com RLS) porque a renovação do horizonte precisa escrever, e assim tudo é
uma transação só.

### 7.3 `recorrencia_responder(p_lancamento_id uuid, p_resposta text) RETURNS text`

`p_resposta` em ('pago','ainda_nao'); senão RAISE 'Resposta inválida' (antes de escrever).
- 'pago': `UPDATE ... SET is_paid = true, paid_date = hoje, prompt_snoozed_until = NULL WHERE id = p
  AND family_id = v_family AND recurring_rule_id IS NOT NULL AND is_paid = false AND date <= hoje`
  [+ opção A: conta não cartão]. ROW_COUNT 1 → 'pago'.
- 'ainda_nao': `SET prompt_snoozed_until = hoje + 1` com o mesmo filtro e
  `COALESCE(prompt_snoozed_until, date) <= hoje`. ROW_COUNT 1 → 'adiado'.
- ROW_COUNT 0 → devolve 'ja_respondida' **sem exceção**: é a corrida "os dois responderam ao mesmo
  tempo" e também "id de outra família" — as duas respostas são indistinguíveis de propósito (não
  revela existência). O UPDATE condicional é a trava de concorrência; não precisa de advisory lock.

### 7.4 `recorrencia_alterar_valor(p_regra_id uuid, p_valor numeric, p_a_partir date) RETURNS int`

"Deste mês em diante". Recusas: regra não é da família → 'Assinatura não encontrada';
`p_a_partir` não é 1º dia de mês ou é anterior a `start_period` → 'Mês inválido'; valor fora de
(0, 99.999.999,99] ou com mais de 2 casas → 'Valor inválido' (teto do projeto, `lancamento.ts`).
Grava: `recurring_rules.amount`; `transactions.amount` das linhas da regra com
`recurring_period >= p_a_partir AND is_paid = false`. Pagas não mudam; meses anteriores não mudam.
Devolve quantas linhas mudaram. Linhas futuras ainda não geradas nascem com o valor novo (vem da regra).

"Só este mês": NÃO é RPC nova. É `atualizarLancamento` existente na linha (muda `amount` e o que
mais o diálogo mandar). Ela não toca as 3 colunas novas (`montarPatchIndividual`,
`esquemas-edicao-lancamento.ts:210-223`), então o trigger congela não dispara. Se o diálogo mudar
o tipo para transferência, o CHECK `tx_recorrencia_sem_parcela` recusa com 23514 → "Esses dados não
são válidos..." (`resultado.ts`, POR_CODIGO). O Fachada deve esconder "transferência" nesse caso.
`atualizarLancamentosEmMassa` (categoria/conta/quem pagou/pago) funciona igual em linha recorrente.

### 7.5 `recorrencia_encerrar(p_regra_id uuid, p_ultimo_mes date) RETURNS int`

Recusas: regra não é da família → 'Assinatura não encontrada'; mês inválido ou anterior a
`start_period` → 'Mês inválido' (decisão 7). Grava: `end_period = p_ultimo_mes`;
`DELETE` das linhas da regra com `recurring_period > p_ultimo_mes AND is_paid = false`. Pagas e
passadas ficam. `generated_through` não recua; o gerador respeita `end_period`, nada renasce.
Devolve quantas linhas apagou. Encerrar uma regra já encerrada com outro mês: permitido só para
TRÁS (`p_ultimo_mes <= end_period`); para frente = reativar, fora de escopo → 'Para estender, crie
uma assinatura nova'.

### 7.6 Mensagens novas para `MENSAGENS_DE_NEGOCIO` (`src/actions/resultado.ts`)

'Recorrência só para entrada ou saída', 'A carteira de investimento não aceita recorrência',
'Esta conta está arquivada', 'Assinatura não encontrada', 'Mês inválido', 'Valor inválido',
'Resposta inválida', 'Para estender, crie uma assinatura nova',
'Dados da recorrência só mudam pela tela de assinaturas.' (esta é 42501; hoje 42501 vira "Você não
tem permissão" — a execução decide se acrescenta à lista; A PROVAR com grep da lista inteira).

---

## 8. Server Actions e arquivos

### 8.1 Arquivos

| Ação | Caminho |
|---|---|
| criar | `app/supabase/migrations/00019_recorrencia.sql` |
| criar | `app/src/actions/recorrencia.ts` ('use server') |
| criar | `app/src/lib/esquemas-recorrencia.ts` (Zod puro, testável; padrão de `esquemas-edicao-lancamento.ts`) |
| criar | `app/src/lib/queries/recorrencias.ts` (leitura da lista "Assinaturas e fixos" via RLS) |
| alterar | `app/src/actions/resultado.ts` (só a lista de mensagens, §7.6) |
| regenerar | `app/src/types/database.ts` (`npx supabase gen types`, ÚLTIMO passo, mesmo commit) |
| criar | `app/tests/integration/recorrencia-rls.sql`, `recorrencia-rls.mjs`, `recorrencia-rls-mutante.sql` |
| criar | `app/tests/unit/esquemas-recorrencia.test.ts` (Zod; roda SEM `.env.local`) |
| NÃO tocar | `lancamento.ts`, `editar-lancamento.ts`, `esquemas-edicao-lancamento.ts`, views 00004/00013 |

`salvarLancamento` fica intocada: o formulário chama `criarRecorrencia` quando o interruptor está
ligado. Menos risco de regressão no caminho mais usado do app.

### 8.2 Ordem dentro de cada action (doutrina do agente)

Zod (usa só o parseado) → `obterContextoDaFamilia()` (`getUser()`, nunca `getSession()`,
`contexto-familia.ts`) → RPC (a autorização do recurso é o filtro `family_id = família da sessão`
DENTRO da RPC, e o RLS/grant é a 2ª camada) → `revalidatePath` das mesmas rotas de
`editar-lancamento.ts` (`/inicio`, `/lancar`, `/carteira`, `/acerto`, `/analises`) + `/ajustes`.
Push: `criarRecorrencia` reusa `agendarNotificacao(autor, 'lancamento', 1)` como `salvarLancamento`;
as outras não notificam (push do vencimento é fora de escopo, spec §3).

---

## 9. Pergunta 8 — Plano de testes

### 9.1 Como roda (só existe produção)

`recorrencia-rls.sql` = um `DO` que cria 2 famílias com usuários de uuid novo, troca papel com
`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`, e termina SEMPRE em
`RAISE EXCEPTION` com o placar → rollback de tudo. Runner `recorrencia-rls.mjs` = cópia de
`carteira-rls.mjs` (impressão digital do schema antes/depois prova o rollback; `--com-migration`
roda o rascunho da 00019 na mesma transação; `--mutante` aplica o patch mutante).
Testes de "tempo" sem mudar o relógio: chamando `recorrencia_gerar(família, p_ate)` como `postgres`
dentro do bloco, com `p_ate` no futuro.

### 9.2 Casos (cada recusa com a 1ª checagem atingida, L-026; intruso B usa referências VÁLIDAS de A, L-018)

| Id | Caso | Esperado | 1ª recusa atingida |
|---|---|---|---|
| R01 | A cria regra (controle positivo) | 12 linhas (mês atual + 11), todas pendentes | — |
| R02 | B `SELECT` em `recurring_rules` | 0 linhas de A | policy SELECT por família |
| R03 | B `INSERT` direto em `recurring_rules` com family_id de A | 42501 | falta de grant (REVOKE) |
| R04 | B `UPDATE` direto na regra de A | 42501 / 0 linhas | falta de grant |
| R05 | B `recorrencia_alterar_valor(regra_A)` | 'Assinatura não encontrada'; valores de A iguais | lookup `id AND family_id = v_family` |
| R06 | B `recorrencia_encerrar(regra_A)` | 'Assinatura não encontrada'; linhas de A intactas | idem |
| R07 | B `recorrencia_responder(tx_A,'pago')` | 'ja_respondida'; tx_A continua pendente | filtro `family_id` do UPDATE |
| R08 | B `recorrencia_fila_de_cobranca()` | nenhum id de A | filtro da fila |
| R09 | B `recorrencia_criar` com conta de A | 'Conta não encontrada nesta família' | lookup de conta (00003:266-272 é o modelo). NÃO é prova de isolamento primária: a FK composta também barraria (L-018), dito no relatório |
| T01 | A `UPDATE transactions SET recurring_rule_id = NULL` numa linha recorrente via REST | 42501 do trigger congela | trigger |
| T02 | A `INSERT` direto com `recurring_rule_id` | 42501 | trigger |
| C01 | A cria regra na conta-carteira | 'A carteira de investimento não aceita recorrência' | checagem 4 de §7.1 (antes do trigger da carteira) |
| I01 | fila chamada 2 vezes | contagem de linhas da regra igual | marca d'água |
| I02 | `recorrencia_gerar(fa, +24 meses)` 2 vezes | 2ª chamada insere 0 | marca d'água + ON CONFLICT |
| I03 | apaga 1 mês (delete_transactions single), renova | mês NÃO volta | marca d'água |
| I04 | INSERT duplicado (rule, period) como postgres | 23505 no índice único | índice |
| D01 | regra dia 31 iniciada em janeiro | 28/29 em fevereiro, 30 em abril, 31 em março | — |
| D03 | regra com data de início 14 meses à frente | gera exatamente 1 linha (o mês de início) | — |
| D02 | regra em cartão fechamento 10, dia 10 | fatura do mês seguinte (regra 00003) | — |
| E01 | alterar valor a partir do mês M | pendentes >= M mudam; pagas e < M não | — |
| E02 | encerrar em M | pendentes > M apagadas; pagas ficam; renovar não recria | — |
| P01 | responder 'pago' | is_paid, paid_date = hoje SP; 2ª resposta = 'ja_respondida' | — |
| P02 | responder 'ainda_nao' | some da fila hoje; `prompt_snoozed_until = hoje + 1` | — |
| P03 | (opção A) assinatura em cartão | não entra na fila; 'pago' nela = 'ja_respondida' | filtro de cartão |

### 9.3 Mutante (`recorrencia-rls-mutante.sql`) — vermelho TEM de aparecer como GRAVAÇÃO

Abre, na mesma transação desfeita: policy SELECT `USING (true)` + `GRANT INSERT, UPDATE` +
policies de escrita abertas em `recurring_rules`; RPCs `recorrencia_alterar_valor/encerrar/responder`
sem filtro de família, gravando com o `family_id` DA LINHA encontrada (L-026); trigger congela
removido. Esperado: R02 (B lê 1), R03 (B insere), R04 (B altera), R05/R06/R07 (linha de A ALTERADA
— L-018), T01/T02 FALHA. `recurring_rules` tem caso próprio (R02-R04), não somado a outro (L-030).

### 9.4 Autorização necessária (bloqueante para a EXECUÇÃO)

Mesmo com rollback, rodar o runner é escrita em produção dentro de transação, e o `ALTER TABLE
transactions` do rascunho pega lock exclusivo na tabela enquanto o bloco roda (segundos; o app
fica sem gravar lançamento nesse intervalo). A autorização atual é só leitura. A EXECUÇÃO precisa,
por escrito: (a) rodar o runner `--com-migration` e `--mutante` em transação desfeita; (b) `db push`
da 00019. Regras: o comando que carrega `.env.local` contém só o runner; `npx vitest run` roda em
outro shell, sem env, e o placar tem de mostrar as suítes de integração `skipped` (L-031).

---

## 10. Perguntas 5–7 — respostas condensadas

- **5 Idempotência:** índice único parcial `(recurring_rule_id, recurring_period)` + marca d'água;
  dia 29–31 por `LEAST(dia, último dia)` (00003:282-289); fuso por `carteira_hoje()` (banco em UTC,
  §1.1; no app `hojeEmSaoPaulo()` de `src/lib/hoje.ts`). Casos I01–I04, D01.
- **6 Editar/encerrar:** §7.4, §7.5. `atualizarLancamento`/`EmMassa` continuam valendo para
  "só este mês" e não mexem nas colunas novas.
- **7 Pop-up:** fila pela RPC §7.2; responder §7.3; adiamento compartilhado pela família (decisão 2);
  fila em ordem `date, id`, uma por vez no front; erro de rede/sessão no formato `ResultadoAction`.

---

## 11. Pergunta 4 e efeitos em outras telas (o que muda sem ninguém pedir)

- **Realtime (pergunta 4):** `transactions` está em `supabase_realtime` com REPLICA IDENTITY FULL
  (§1.2). O ouvinte atual escuta `event: '*'` em `transactions` filtrado por `family_id`
  (`src/components/inicio/ouvinte-realtime.tsx:78-86`). Responder (UPDATE) chega ao parceiro como
  evento; o pop-up do outro rechama `carregarCobrancasPendentes()` e a linha some.
  A PROVAR: que o postgres_changes aplica o RLS de `transactions` ao parceiro (evidência indireta:
  PROJETO.md "Realtime entre as duas sessões ... provado 5/5"). Atenção do Fachada: o ouvinte toca
  som/toast em INSERT do parceiro; a geração de 12 linhas de uma vez dispara 12 INSERTs.
- **`v_account_balances`** (00004:51-67): `pending_outflow/pending_inflow` somam TODO pendente da
  conta, de qualquer mês, e a Carteira mostra isso (`carteira/page.tsx:116-120`,
  `cartao-conta.tsx:62-63`). Com 12 meses gerados, esses números multiplicam. Decisão 5.
- **`v_orcamento_progresso`** (00013): conta pendente do mês. Decisão 6.
- **`v_settlement`**: só `is_paid = true` (00010, 6 filtros `WHERE t.is_paid = true`). Pendente
  futuro NÃO entra no acerto.
- **`v_invoices`**: as compras recorrentes de cartão entram na fatura do mês delas, como compra normal.

## 12. Previsão (Dash) — não precisa mudar

`analises/page.tsx:46-49` lê `v_monthly_summary` e `:113-124` monta 6 meses com
`payable`/`receivable`; a view soma `NOT is_paid` por `to_char(date,'YYYY-MM')`
(00004:206-220). Linhas recorrentes geradas como pendentes entram sozinhas. Horizonte de 12 >= 6
meses mostrados. Nenhuma mudança no Dash nesta rodada.

---

## 13. Riscos

1. Lock exclusivo em `transactions` no `ALTER` (teste e push) — segundos; 13 linhas hoje (§1.4).
2. Sem cron: horizonte só anda quando alguém abre o app (§2).
3. Carteira "a pagar/a receber" inflada (decisão 5) — visível no dia do push se houver salário recorrente.
4. `account_id` com RESTRICT na regra: excluir uma conta com regra devolve 23503 → "Um dos itens
   escolhidos não existe mais" (mensagem enganosa). `grep -n "delete()" src/actions/contas.ts` volta
   vazio: o app não exclui conta pela action (só arquiva); resta o REST pela policy `accounts_delete`.
5. Conta arquivada depois de criada a regra: o gerador continua gerando nela. Fica como está; a lista
   de assinaturas deve mostrar o aviso (Fachada).
6. 12 INSERTs de uma vez no Realtime do parceiro (som/toast repetido).
7. `recorrencia_gerar` recebe a família por parâmetro: se um grant escapar para `authenticated`,
   vira escrita em outra família. Bloco de autoverificação na migration aborta se `authenticated`
   tiver EXECUTE nela (padrão dos blocos 3 de 00014/00015).
8. Migration NÃO destrutiva: só CREATE e ADD COLUMN nula; nenhum dado existente muda.
9. Assinatura criada com data no passado gera os meses passados como pendentes e todos entram no
   pop-up em fila. Alternativa: a action marcar como pagos os meses anteriores ao atual — pergunta
   para o Heitor se ele quiser (não listei no §5 por ser caso raro).

## 14. Ordem de operações (EXECUÇÃO)

1. Ler este plano, o caderno de lições e as decisões do Heitor (§5) que o Maestro trouxer.
2. Testes primeiro: `recorrencia-rls.sql` + runner + mutante; Zod unit test.
3. Rascunho da 00019 (com bloco de autoverificação no fim: RLS ligado, 1 policy SELECT, sem grant de
   escrita, `recorrencia_gerar` sem EXECUTE para authenticated, triggers ativos, funções DEFINER com
   `search_path` fixo).
4. Vermelho: runner SEM a migration → não chega ao placar (objetos não existem); runner
   `--com-migration --mutante` → FALHAs listadas, com gravação na linha de A (L-018).
5. Verde: runner `--com-migration` → 0 falhas; impressão do schema igual antes/depois.
6. `Skill(code-review)` high sobre o RASCUNHO da migration e das actions, ANTES do push (L-027).
7. Passe de prosa do cabeçalho da migration contra a fonte (L-022).
8. `npx -y supabase@2 db push --db-url ...` (com autorização) → runner contra o aplicado → verde.
9. `npx supabase gen types` → `src/types/database.ts`; actions e `resultado.ts`; `npx tsc --noEmit`.
10. `npx vitest run` em shell SEM env (skipped esperados, L-031); `security-review`; varredura de segredo.
11. Contrato de handoff final (abaixo, confirmado contra os tipos gerados).

---

## 15. Contrato de handoff PROPOSTO — PARA O FACHADA

Tipo de retorno comum (`src/actions/resultado.ts:82-84`):
`ResultadoAction<T> = { ok: true; dados: T } | { ok: false; erro: string; camposComErro?: Record<string, string[]> }`.
Toda rota fica em `(app)/(principal)`, que exige sessão e família (sem role extra).

| Action (`src/actions/recorrencia.ts`) | Entrada (Zod em `esquemas-recorrencia.ts`) | Retorno |
|---|---|---|
| `criarRecorrencia(input)` | igual a `EntradaDeLancamento` (`lancamento.ts`) com `tipo: 'receita' \| 'despesa'`, SEM `parcelas` e `contaDestinoId` | `ResultadoAction<{ regraId: string; lancamentosGerados: number }>`; erro de campo em `camposComErro` com as mesmas chaves do formulário de lançar |
| `carregarCobrancasPendentes()` | nenhuma | `ResultadoAction<CobrancaPendente[]>`, `CobrancaPendente = { id; regraId; tipo: 'receita' \| 'despesa'; descricao; valor: number; data: 'YYYY-MM-DD'; contaId; competencia: 'YYYY-MM' }`, já em ordem de fila |
| `responderCobranca({ lancamentoId, resposta })` | `lancamentoId: uuid`; `resposta: 'pago' \| 'ainda_nao'` | `ResultadoAction<{ estado: 'pago' \| 'adiado' \| 'ja_respondida' }>` — `ja_respondida` é SUCESSO (o outro respondeu antes): só tirar da fila |
| `alterarValorRecorrencia({ regraId, valor, aPartirDe })` | `regraId: uuid`; `valor`: mesmo esquema de `esquemas-edicao-lancamento.ts:51-65`; `aPartirDe: 'YYYY-MM'` | `ResultadoAction<{ atualizados: number }>` |
| `encerrarRecorrencia({ regraId, ultimoMes })` | `regraId: uuid`; `ultimoMes: 'YYYY-MM'` | `ResultadoAction<{ removidos: number }>` |
| "só este mês" | `atualizarLancamento` existente | inalterado |

Leitura da lista "Assinaturas e fixos": `src/lib/queries/recorrencias.ts` (server-only), tipo
gerado `Database['public']['Tables']['recurring_rules']['Row']`; ativa = `end_period` nulo ou
>= mês atual. Lançamento recorrente se reconhece por `transactions.recurring_rule_id != null`.
Regras de UI que o banco impõe: Parcelas e Repetir mutuamente exclusivos; em linha recorrente o
diálogo de editar não oferece "transferência"; (opção A) recorrência em cartão sem "já está pago".
Datas: `date` sem fuso (`YYYY-MM-DD`), "hoje" = America/Sao_Paulo.

## 16. Contrato de handoff — PARA O DASH

Nada muda (§12). Para referência: `recurring_rules.amount numeric(14,2)` reais; `start_period`,
`end_period`, `generated_through`, `transactions.recurring_period` são `date` sem fuso, 1º dia do
mês de competência (granularidade mensal); `prompt_snoozed_until` `date`, dia em
America/Sao_Paulo. Cardinalidade: até 12 linhas futuras por regra ativa; poucas regras por família.
Índices: `ux_transactions_recorrencia_periodo` (único parcial). Nenhuma view nova.

---

## 17. Perguntas bloqueantes ao Maestro

1. As 7 decisões do §5 (a 1 muda o SQL da fila e da resposta).
2. Autorização escrita para a EXECUÇÃO (§9.4).
3. Aceita o desvio de spec "reais e não centavos" e "sem coluna ativa" (§6.1)?
