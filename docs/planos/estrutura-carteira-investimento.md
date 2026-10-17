# Estrutura — Carteira de Investimento (FASE: PLANO)

> **Governa:** `docs/superpowers/plans/2026-10-16-carteira-investimento.md`, Task 1 (schema)
> e Task 2 (Server Actions). A Task 3 (rendimento) é **decidida** aqui porque o Maestro
> pediu a decisão sob demanda vs. `pg_cron`. A execução dela depende da delegação.
> **Spec:** `docs/superpowers/specs/2026-10-16-carteira-investimento-design.md` (decisões
> fechadas, não reabertas aqui).
> **Data:** 2026-10-16. Nenhum código de produção foi escrito nesta fase.

**Skills carregadas antes de decidir (fonte de cada decisão abaixo):**
- `supabase:supabase-postgres-best-practices`: referências lidas `lock-short-transactions.md`,
  `lock-deadlock-prevention.md`, `lock-advisory.md`, `data-upsert.md`,
  `schema-data-types.md`, `schema-foreign-key-indexes.md`, `schema-constraints.md`,
  `security-privileges.md`, `security-rls-basics.md`, `security-rls-performance.md`.
- `supabase:supabase`: SKILL.md (checklist de segurança: DEFINER, views, `TO authenticated`
  sem predicado, UPDATE exige SELECT policy), `https://supabase.com/changelog.md`
  (lido nesta sessão), `https://supabase.com/docs/guides/cron.md` (lido nesta sessão).
- `vercel:nextjs`: `references/data-patterns.md` e `references/directives.md`.

---

## 0. Fatos lidos no disco que mudam o desenho (antes de qualquer decisão)

Cada item cita o arquivo e a linha lida.

| # | Fato | Onde | Consequência |
|---|---|---|---|
| F1 | `transactions.amount` e `accounts.initial_balance` são `numeric(14,2)` **em reais**, não centavos | `00001_initial_schema.sql` linhas 77 e 142 | "Centavos inteiros" vale para as tabelas novas (`bigint`). A ponte com `transactions` é `cents::numeric / 100`, que é exata, e `(reais * 100)::bigint`, que é exata para `numeric(14,2)`. |
| F2 | `criarConta` aceita `tipo: 'investimento'`, e a tela de Ajustes > Contas mostra esse tipo | `src/lib/esquemas-cadastro.ts:16`, `src/app/(app)/(principal)/ajustes/contas/page.tsx:27` | A família real **pode já ter** conta `investimento` criada à mão. Um índice único "uma conta investimento por família" pode falhar. A carteira precisa de um marcador explícito, não do tipo. |
| F3 | `save_transactions`, `delete_transactions` e `pay_invoice` são `SECURITY DEFINER`, então `current_user = postgres` dentro delas | `00003_functions.sql:215`, `:366`, `:424`; a 00015 confirma o dono `postgres` (linhas 28-33, 174-181) | Um trigger que libera por `current_user = 'postgres'` (padrão da 00015) **não** barraria `/lancar` nem "excluir lançamento". A trava da carteira precisa de outro discriminante (§2.7). |
| F4 | `v_patrimonio_mensal` soma transferência como 0; `v_settlement` só conta transferência com `settlement_to_member_id` | `00013:164`, `00010` bloco 4 | "Aplicar" como `transferencia` mantém o patrimônio igual (o dinheiro continua da família) e não gera dívida entre o casal. É o tipo certo (§2.3). |
| F5 | `v_account_balances.current_balance` = inicial + entradas pagas − saídas pagas | `00004_views.sql:24-50` | O saldo total da carteira **é** o `current_balance` da conta-carteira. O "não alocado" é derivado: total − Σ caixinhas. Não há segundo saldo gravado para ficar dessincronizado. |
| F6 | `transactions` **não** tem `UNIQUE (family_id, id)` | grep `UNIQUE \(family_id, id\)` em `supabase/migrations/`: acertos só em 00001 linhas 30 (`family_members`), 86 (`accounts`), 113 (`categories`), 128 (`payment_methods`) e 00011:150 (`category_groups`) | Movimento → lançamento usa FK simples `transaction_id → transactions(id)`. Não crio índice único novo em tabela com dado real só para isso. |
| F7 | Testes rodam contra o banco **hospedado**. Supabase local foi descartado | `PENDENCIAS.md`, tabela "Fora de escopo por decisão registrada", linha "Supabase local (Docker)" (decisão do Heitor em 2026-10-11) | Não existe `db reset`. O portão é `db push --dry-run` + o runner SQL com `--com-migration` (transação desfeita) + `db push` + `migration list`. |
| F8 | Existe runner SQL que testa um rascunho de migration dentro de uma transação desfeita | `tests/integration/grupos-rls.mjs` (flag `--com-migration`) e `grupos-rls.sql` | O teste de isolamento fica **vermelho pelo motivo certo** antes da migration existir (contra um mutante) e verde contra o rascunho, sem gravar nada (§6.1). |
| F9 | Convenção de mutante já existe nos testes de integração | `orcamentos.int.test.ts:244-247`, `editar-lancamento.int.test.ts:17` | `CARTEIRA_RLS_MUTANTE=1` troca o intruso pelo `service_role`. Os testes de isolamento TÊM de ficar vermelhos nesse modo. |
| F10 | Desde 2026-04-28, tabelas novas em `public` deixam de ser expostas à Data API por padrão. Vale para todos os projetos a partir de **2026-10-30** | `supabase.com/changelog.md`, entrada 2026-04-28 (lida nesta sessão) | Todo objeto novo leva `GRANT` explícito, como a 00013 já fez (bloco 4). Sem isso a tela quebra em 14 dias, sem erro no deploy. |
| F11 | O front da carteira já foi commitado com mock: `tipos-investimentos.ts` (colunas `rate_type`, `rate_bps`, `rate_defined_at`, `resgate_imediato`, `data_vencimento`, `balance_cents`) e os diálogos `dialogo-aplicar/alocar/resgatar/criar-caixinha.tsx` | `git log` (`1a5e4b0`..`77d1056`) e os arquivos | Uso **os mesmos nomes de coluna** do mock. Assim o tipo gerado substitui a interface escrita à mão sem renomear nada no front. |
| F12 | O diálogo de criar caixinha calcula `Math.round(taxaNumero * 100)` e usa `todayISO()` (relógio local) | `dialogo-criar-caixinha.tsx:88` e `:96` | Mesma classe do P-009 e do problema de fuso de `src/lib/hoje.ts`. Vai como pendência ao Fachada (§8.1). O servidor não confia nisso: valida bps inteiro e calcula "hoje" no fuso de São Paulo. |

**NÃO VERIFICADO: estado do banco hospedado.** Tentei uma contagem somente leitura (contas
`investimento` por família e lançamentos ligados a elas). O classificador de permissão
negou o acesso ("Production Reads"). Não contornei. A medição vira **Passo 0 obrigatório
da execução** (§7), com condição de abortar. O desenho abaixo **não depende** do
resultado (por causa do F2, o marcador da carteira é uma tabela própria). A medição
continua obrigatória para o relatório e para o snapshot da L-007.

---

## 1. Arquivos

### Criar

| Caminho | O quê |
|---|---|
| `app/supabase/migrations/00016_carteira_investimento.sql` | Tabelas, RLS, grants, view, RPCs, triggers, bloco de auto-verificação. O número 00016 é confirmado no Passo 0 (`migration list`). Se outra migration entrar antes, renumero ANTES do push. |
| `app/tests/integration/carteira-rls.sql` | Teste de isolamento por SQL (DO block que termina SEMPRE em `RAISE` com placar). Não grava nada. |
| `app/tests/integration/carteira-rls.mjs` | Runner (cópia do `grupos-rls.mjs`) com `--com-migration <arquivo>` e `--mutante <arquivo>`. |
| `app/tests/integration/carteira-rls-mutante.sql` | Patch mutante aplicado DEPOIS do rascunho, na mesma transação: policies `USING (true)`, `GRANT ALL` para `authenticated`, e RPCs que procuram a caixinha e a conta **sem** filtro de família e **gravam com o `family_id` da linha encontrada**, não com o de quem chama (o bug realista). Prova que o teste detecta o bypass. |
| `app/src/lib/esquemas-investimentos.ts` | Esquemas Zod (fora do `'use server'`: módulo de action só exporta função async). Fonte da convenção: `esquemas-pagamentos.ts:5-14`. |
| `app/src/actions/investimentos.ts` | As 5 Server Actions. |
| `app/src/lib/carteira-leitura.ts` | `lerCarteira(supabase)`: leitura para Server Component. Fonte: `vercel:nextjs` `data-patterns.md` ("Server Components (Preferred for Reads)"). Não é action. |
| `app/tests/unit/esquemas-investimentos.test.ts` | Zod: mensagem exata por caso (L-016). |
| `app/tests/integration/investimentos.int.test.ts` | Actions + Review Focus 1-5 + concorrência, contra o hospedado, `limparTeste` no `afterAll`. |
| `app/src/lib/rendimento-caixinha.ts` + `app/tests/unit/rendimento-caixinha.test.ts` | **Só se a Task 3 for delegada nesta execução** (§5). |

**Desvio de nome em relação ao plano-mãe:** o Task 1 pede
`tests/integration/carteira-investimento.int.test.ts`. Troco por `carteira-rls.sql`/`.mjs`
porque o runner SQL é o único caminho que fica vermelho **antes** do `db push` pelo motivo
certo (F8 + L-018). Com um teste vitest antes do push, o vermelho seria "relation does not
exist", que é o motivo errado. O isolamento por Action fica em `investimentos.int.test.ts`.

### Alterar

| Caminho | O quê |
|---|---|
| `app/src/actions/resultado.ts` | Acrescentar as mensagens das RPCs novas a `MENSAGENS_DE_NEGOCIO` (§4.3). Sem isso, `traduzErroDoBanco` troca a frase por uma genérica. |
| `app/src/types/database.ts` | Regenerado (`gen types`), nunca editado à mão. |
| `app/src/lib/simulador.ts` | **Só com a Task 3:** exportar `arredondarMeioParaCima` (hoje privada, linha 87). Assinatura e comportamento iguais. Nenhuma outra linha muda. |

**Não toco:** `src/components/`, `src/app/`, `create_family`, `join_family`,
`save_transactions`, `delete_transactions`, e nenhuma migration de 00001 a 00015.

---

## 2. Decisões (cada uma com fonte)

### 2.1 Tabela de movimentos (a) vs. só UPDATE de saldo (b): **(a), validada**

- **Decisão:** `investment_box_movements` é imutável (sem grant de UPDATE/DELETE para
  cliente). `investment_boxes.balance_cents` é o saldo corrente, mantido **na mesma
  transação** que grava o movimento.
- **Por quê:**
  1. O gráfico da Task 5 precisa de pontos reais de aporte e resgate. O saldo atual
     sozinho não reconstrói o passado (spec §4, recomendação do Maestro).
  2. O rendimento sob demanda (§2.5) precisa da data de cada entrada e saída.
  3. Manter o saldo também na caixinha evita somar o histórico a cada leitura. Com
     `CHECK (balance_cents >= 0)` o banco recusa saldo negativo mesmo que uma RPC erre.
- **Fonte:** `supabase-postgres-best-practices` `schema-data-types.md` (dinheiro em
  tipo exato: uso `bigint` de centavos, igual a `simulador.ts`) e `schema-constraints.md`
  (a regra mora em constraint, não só no código). A exigência de que movimento e saldo
  sejam escritos na **mesma** transação é minha (L-014), não da skill. O
  `lock-short-transactions.md` só justifica que essa transação seja curta e sem chamada
  externa. É o que as RPCs fazem (§3.3).

### 2.2 Identificar "a" conta da carteira: **tabela `investment_wallets`, criação preguiçosa**

- **Decisão:** uma linha por família (`family_id` PK, `account_id` UNIQUE), criada pela
  primeira RPC que precisar dela (`carteira_aplicar` ou `carteira_criar_caixinha`), junto
  com a conta `accounts(type='investimento', name='Carteira de investimento',
  owner_member_id NULL, initial_balance 0)`.
- **Por que não "a única conta `type='investimento'`":** por F2 pode já existir uma ou
  mais. Um índice único quebraria o `db push` ou escolheria uma conta pessoal do casal
  como carteira.
- **Por que não uma coluna nova em `accounts`:** `accounts_update` (00006) deixa o
  cliente fazer UPDATE em qualquer coluna da conta da família. Uma flag ali seria
  forjável pelo PostgREST e exigiria trigger. A tabela nova não tem grant de escrita para
  cliente.
- **Por que preguiçosa e não no `create_family`:** não reescrevo `create_family`/`join_family`
  (00003/00007/00008) nem faço backfill em família real. A família que nunca abre a área
  não ganha conta vazia na lista.
- **Corrida na criação (duas pessoas aplicam pela primeira vez juntas):** resolvida pelo
  lock consultivo por família (§3.3), adquirido ANTES de checar se a carteira existe. Um
  `INSERT ... ON CONFLICT (family_id) DO NOTHING` sozinho deixaria uma conta órfã: as
  duas transações criariam conta e uma perderia o insert da carteira.
- **Fonte:** `lock-advisory.md` ("Transaction-level lock (released on commit/rollback)"),
  `data-upsert.md` (check-then-insert é corrida).
- **Consequência para a Fachada:** antes da 1ª aplicação, a carteira não existe.
  `lerCarteira` devolve `contaId: null` e saldos 0. O botão "Aplicar" pode aparecer
  sempre. Isto responde a pergunta aberta do `BRIEFING-FRONTEND-RODADA10.md` §3.

### 2.3 "Aplicar" grava `transaction` do tipo `transferencia`: **sim, validada, mas sem `save_transactions`**

- **Tipo:** `transferencia` de `conta de origem` → `conta-carteira`, `is_paid = true`,
  `paid_date = date = hoje em São Paulo`, sem categoria, sem `owner_member_id`.
  Resgate para conta é a transferência inversa.
- **Por que não `type='investimento'`:** o CHECK `tx_transferencia_tem_destino`
  (00001:195) proíbe `to_account_id` fora de transferência. E `investimento` conta como
  **gasto compartilhado** em `v_settlement` (00010:245-275): aplicar R$ 1.000 criaria
  dívida de R$ 500 entre o casal. Também sai do patrimônio em `v_patrimonio_mensal`
  (00013:163), e o dinheiro não saiu da família.
- **Por que não `save_transactions`:** (1) ela não grava a caixinha. Chamar as duas em
  sequência pela Action seriam duas transações, exatamente o erro da L-014. (2) Ela roda
  como `postgres` e não liga a chave da trava (§3.4), então seria recusada pela própria
  trava. O INSERT em `transactions` acontece **dentro** da RPC da carteira, na mesma
  transação do movimento e do saldo. Mesmo padrão de `pay_invoice` (00003:471-483).
- **Efeito colateral para o Dash:** `v_monthly_summary.investment_total` (00004:215)
  conta só `type='investimento'`. Aplicações da carteira **não** aparecem ali.
  Registrado no contrato do Dash (§8.2).

### 2.4 Concorrência (Review Focus 5, L-014): **lock consultivo por família + UPDATE condicional + CHECK**

São três camadas, e nenhuma lê saldo no JS para decidir:

1. `PERFORM pg_advisory_xact_lock(hashtextextended('carteira:' || v_family_id::text, 0));`
   como **primeiro** comando de toda RPC de escrita da carteira, antes de qualquer
   leitura de estado. Ele serializa, dentro de uma família, tudo o que depende de
   **várias linhas**: o "não alocado" (total da conta − Σ caixinhas), o saldo da conta
   de origem e a criação preguiçosa da carteira. Um `UPDATE` condicional numa linha só
   não protege um saldo derivado de várias tabelas. O lock é liberado no COMMIT ou no
   ROLLBACK. Famílias diferentes não se bloqueiam, salvo colisão de hash (custo: espera
   de milissegundos, nunca resultado errado).
2. Débito de caixinha sempre como UPDATE condicional atômico, conferindo a contagem de
   linhas:
   ```sql
   UPDATE public.investment_boxes
      SET balance_cents = balance_cents - p_valor_cents
    WHERE id = p_caixinha_id
      AND family_id = v_family_id
      AND balance_cents >= p_valor_cents;
   GET DIAGNOSTICS v_n = ROW_COUNT;
   IF v_n = 0 THEN RAISE EXCEPTION 'Saldo insuficiente na caixinha'; END IF;
   ```
   O crédito é `balance_cents = balance_cents + p_valor_cents` (incremento no banco, nunca
   "ler e somar no JS").
3. `CHECK (balance_cents >= 0)` na tabela: a última barreira se as duas acima forem
   removidas por engano no futuro.

- **Ordem de locks (sem deadlock):** toda RPC pega o lock da família ANTES de qualquer
  lock de linha (`SELECT ... FOR UPDATE` da caixinha, UPDATE da caixinha, INSERT em
  `transactions`). Como todas seguem a mesma ordem, duas RPCs da carteira nunca esperam
  uma pela outra em ciclo. Fonte: `lock-deadlock-prevention.md` ("Always acquire locks in
  a consistent order").
- **Transação curta:** a RPC não chama nada externo. O push, se um dia existir, vai em
  `after()` na Action, fora da transação. Fonte: `lock-short-transactions.md`.
- **Limite honesto:** `/lancar` (despesa comum na conta de origem) **não** pega o lock
  da carteira. Uma despesa lançada no mesmo milissegundo de uma aplicação pode deixar a
  conta de origem negativa. Isso já vale para todo o app hoje: nenhum fluxo impede saldo
  negativo em conta corrente. O Review Focus 2 fica garantido **entre operações da
  carteira** e no instante da aplicação. Pegar o lock em `save_transactions` exigiria
  reescrevê-la, o que está fora do escopo.

### 2.5 Rendimento: **sob demanda, sem gravar. `pg_cron` rejeitado nesta leva**

- **Decisão:** nada é gravado por tempo. O "rendimento estimado até hoje" é calculado na
  leitura, em TypeScript, com a técnica do `simulador.ts` (BigInt, um arredondamento meio
  para cima no fim).
- **Por que não `pg_cron`:**
  1. A doc do Supabase Cron (lida nesta sessão) diz que o job executa SQL ou funções
     dentro do banco, a partir de `cron.job`. Ela **não** fala em sessão de usuário nem em
     `auth.uid()`. **Inferência minha, não afirmação da doc:** sem usuário logado, um job
     mensal teria de escrever em todas as famílias com um papel que ignora o RLS. É o
     tipo de código privilegiado que o checklist da `supabase:supabase` manda evitar
     ("SECURITY DEFINER functions bypass RLS... Prefer SECURITY INVOKER"). Se o cron um dia
     for reavaliado, o papel de execução tem de ser conferido no repositório do `pg_cron`
     antes, porque a doc lida não o informa.
  2. Gravar o rendimento estimado em `balance_cents` transformaria dinheiro **estimado**
     em dinheiro **resgatável**. Um resgate para a conta corrente creditaria um valor que
     o banco real talvez não tenha pago, e o saldo da conta deixaria de bater com o
     extrato. Ver pergunta bloqueante **Q2**.
  3. A taxa muda manualmente (`atualizarTaxaCaixinha`). Um valor gravado com a taxa
     antiga ficaria para sempre errado. Calcular na leitura sempre usa o dado atual.
- **Fonte:** `supabase:supabase` (SKILL.md, checklist "SECURITY DEFINER functions bypass
  RLS") e `https://supabase.com/docs/guides/cron.md`. A doc diz que os jobs executam SQL e
  funções no banco, recomenda no máximo 8 jobs simultâneos e traz a frase "Each Job
  should run no more than 10 minutes".
- **Quando reavaliar:** se o Heitor quiser "consolidar o rendimento real do mês" (fase
  2), isso vira uma ação explícita do usuário ("registrar rendimento"), não um cron.

### 2.6 Escrita só por RPC `SECURITY DEFINER`, com zero grant de escrita para cliente

- **Decisão:** as três tabelas novas têm RLS habilitado, **uma policy SELECT por
  tabela** (`TO authenticated`, `family_id = (SELECT public.get_user_family_id_self())`)
  e **nenhuma** policy de INSERT/UPDATE/DELETE, **de propósito**. Também levam
  `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM anon, authenticated` e
  `GRANT SELECT ... TO authenticated` explícito (F10). Toda escrita passa pelas RPCs.
- **Por que DEFINER, contrariando a preferência por INVOKER da skill:** com INVOKER, o
  cliente precisaria de UPDATE em `investment_boxes`. Com esse grant, qualquer membro faria
  `PATCH /investment_boxes?id=eq.X {balance_cents: 999999}` direto no PostgREST: dinheiro
  fabricado, sem movimento e sem conferir o não alocado. A 00015 já mediu que
  `REVOKE` de coluna não subtrai grant de tabela (00015:44-55). Prefiro **nenhum grant
  de escrita** e um único caminho com as regras. Mitigações exigidas pela skill para
  DEFINER, todas aplicadas:
  - `auth.uid()` conferido no corpo de toda RPC, e a família resolvida a partir dele,
    nunca de parâmetro;
  - `SET search_path = ''`, com todo nome qualificado (`public.`, `pg_catalog.`);
  - `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated`. A skill
    avisa que função nova em `public` é executável por PUBLIC por padrão;
  - funções internas (`carteira_garantir`, `carteira_nao_alocado_cents`) são INVOKER e
    têm `EXECUTE` revogado de `PUBLIC, anon, authenticated`. Só rodam chamadas de dentro
    de uma RPC DEFINER. Mesmo padrão de `seed_family_defaults` (00003:61);
  - toda RPC filtra **explicitamente** por `family_id = v_family_id` em cada SELECT e
    UPDATE. Dentro de DEFINER o RLS não vale, então o filtro **é** a primeira camada.
- **Autorização dupla:** a Action confere o recurso pela sessão (com RLS) antes de
  chamar a RPC. A RPC repete a conferência por dentro. O cliente não tem caminho de
  escrita fora da RPC. Mesmo desenho de `pagarFatura` (`src/actions/fatura.ts:27-60`).
- **Fonte:** `supabase:supabase` SKILL.md (checklist "SECURITY DEFINER functions in
  public are callable by all roles... always include an auth.uid() check... revoke
  EXECUTE"), `security-rls-performance.md` (`(select ...)` em volta da função na policy:
  uma avaliação por query) e `security-privileges.md` (menor privilégio).

### 2.7 Trava da conta-carteira contra lançamento comum: **recomendada, depende de Q1**

O "não alocado" é derivado (F5). Qualquer lançamento comum que mexa na conta-carteira
desfaz a conta:
- `/lancar` com a carteira como conta: despesa direto da carteira;
- "Excluir lançamento" na lista de `/inicio` sobre a transferência "Aplicação na
  carteira" que já foi para uma caixinha. O total cai, a caixinha continua, e o não
  alocado fica **negativo**;
- `atualizarLancamento`/`atualizarLancamentosEmMassa` (`src/actions/editar-lancamento.ts:82`
  e `:141`) trocando valor ou conta dessa transferência;
- `pagarFatura` com a carteira como origem (`pay_invoice` aceita `type <> 'cartao'`,
  00003:451-456).

**Proposta (opção A):** trigger `BEFORE INSERT/UPDATE/DELETE` em `transactions` que
recusa, com SQLSTATE 42501, qualquer linha que envolva a conta-carteira
(`account_id` ou `to_account_id` presente em `investment_wallets`) **a menos que** a
chave `app.carteira_rpc = 'on'` esteja ligada na transação. Só as RPCs da carteira ligam
essa chave, com `set_config('app.carteira_rpc', 'on', true)`, e desligam logo depois do
INSERT. `service_role` e `supabase_admin` passam, para a limpeza de teste continuar
funcionando. `postgres` **não** passa (F3). O UPDATE só é recusado se mudar coluna de
dinheiro (`type, amount, date, account_id, to_account_id, is_paid, paid_date`). Editar a
descrição continua livre, e o `ON DELETE SET NULL` de categoria (00009) nunca é barrado
(as linhas da carteira não têm categoria). Um trigger irmão em `accounts` recusa, para
papéis de cliente, mudar `type`, `initial_balance` ou `family_id` da conta-carteira.
Excluí-la já é barrado pela FK de `investment_wallets`.

- **Por que GUC e não `current_user`:** por F3. Por que o cliente não liga a chave:
  o PostgREST só expõe funções dos schemas expostos. `pg_catalog.set_config` não está em
  `public`, e nenhuma função de `public` repassa texto para `set_config`. **Isto é uma
  hipótese a provar na execução:** o teste chama `rpc('set_config', ...)` como
  `authenticated` e exige erro de função inexistente (§6.2, caso T-GUC).
- **Opção B (sem trigger):** a Fachada esconde a conta-carteira de `/lancar`, das
  listas de conta e da origem do pagamento de fatura. A RPC recusa operar com não alocado
  negativo. Fica a brecha de excluir a transferência pela lista de lançamentos, que é um
  caminho real da UI.
- **Recomendação: A.** Ver **Q1**.

### 2.8 Validação de dinheiro e taxa

- **Fronteira da Action em reais** (`valor: number`, como pede o plano-mãe), convertida
  para centavos **uma vez** no Zod. **Modelo a copiar: `valor` de
  `esquemas-edicao-lancamento.ts:51-65`**, que já é a versão corrigida pela L-016:
  `superRefine` com cadeia de prioridade (finito → `> 0` → `<= 99_999_999.99` → 2 casas
  com tolerância `1e-6`) e **uma** mensagem só. **Não** copiar `valorDoAcerto`
  (`esquemas-pagamentos.ts:55-61`): é a cadeia `.finite().positive().max().refine()` que
  devolve 3 mensagens para `Infinity` (L-016). Mais de 2 casas é **recusado**, não
  arredondado (P-009). A única diferença em relação ao modelo é a saída:
  `.transform((n) => Math.round(n * 100))` → `valorCentavos`, um inteiro, em vez de reais.
- **Teto `99_999_999.99`:** é a convenção do projeto (o mesmo número em
  `esquemas-edicao-lancamento.ts:58` e `esquemas-pagamentos.ts:59`), **não** um limite de
  precisão. Medi nesta sessão (`node -e`, 200.000 valores de 2 casas sorteados perto de
  99.999.999,99 e outros 200.000 perto de 999.999.999.999,99): pior erro de `n * 100` = 0
  nos dois, e nenhum valor válido recusado. Um teto maior é viável. Fica o do projeto
  por consistência.
- **Taxa:** `taxaMensalBps` inteiro entre `0` e `10_000`, a faixa de
  `LIMITES_SIMULACAO.taxaMaxBps` (`simulador.ts:56`), que é o que o plano-mãe fixa.
  Recusa 500% a.m. (50.000 bps) e taxa negativa (Review Focus 4). Também é CHECK no
  banco, porque a RPC é chamável direto pelo PostgREST. Um teto mais apertado é
  pergunta não bloqueante (Q5).
- **Nome:** `limparNome` (de `lista-nomes.ts`, igual a `esquemaCriarConta`) e de 1 a 60
  **code points** (`Array.from`, L-015). No banco: `CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)`.
  `char_length` conta caracteres, não bytes.
- **Enum de tipo:** `text` + CHECK `IN ('liquidez_diaria','pos_fixado','pre_fixado')`,
  os mesmos literais do mock do front (F11). Fonte: `schema-data-types.md` ("use text
  with check constraint or create enum type"). CHECK é mais barato de estender que
  `ALTER TYPE`.
- **Vencimento (Review Focus 1):** obrigatório quando `resgateImediato=false`
  (`refine` no objeto com `path: ['dataVencimento']`, mesmo padrão de
  `esquemas-edicao-lancamento.ts:120-122`, o par `rotuloDoFutil`/`ehFutil`). Com
  `resgateImediato=true`, a data vira `null`.
  **Data no passado é aceita:** a caixinha já nasce liberada para resgate. O Review Focus
  1 trata esse caso como válido ("deveria liberar resgate automaticamente"). Faixa
  plausível: `2000-01-01..2100-12-31`.
- **"Hoje" é sempre o de São Paulo, calculado DENTRO da RPC:**
  `(now() AT TIME ZONE 'America/Sao_Paulo')::date`, mesma expressão de
  `v_patrimonio_mensal` (00013:146). Ele **não** é parâmetro, porque a RPC é chamável
  direto e um `p_hoje` forjado destravaria o resgate antes do vencimento. Regra: o resgate
  é liberado se `resgate_imediato OR hoje_sp >= data_vencimento`. No dia do vencimento
  já pode, o que é coerente com a frase "a partir de dd/mm/aaaa".

### 2.9 Contas válidas como origem e destino

- Origem de "Aplicar" e destino de "Resgatar": `type = 'corrente'`, `archived_at IS NULL`,
  da família, e **não** a conta-carteira. Mesma família de regra de `settle_up`
  (versão vigente em 00010:167 e :176, `a.type = 'corrente'`). Cartão nunca (não tem saldo). Benefício (VR/VA) e
  contas `investimento` manuais ficam de fora: ver **Q3**.

### 2.10 Fronteira Next.js

- Mutação = Server Action em `src/actions/investimentos.ts` (`'use server'`). Leitura =
  `lerCarteira(supabase)` chamada pelo Server Component de `/carteira`. Fonte:
  `vercel:nextjs` `data-patterns.md` (decision tree: mutation → Server Action; read de
  Server Component → fetch direto). Esquemas Zod em módulo separado, porque arquivo
  `'use server'` só exporta função async (`directives.md`, convenção de
  `esquemas-pagamentos.ts:8-9`).
- Toda Action, nesta ordem: Zod (`safeParse`, só o valor **parseado** segue) →
  `obterContextoDaFamilia()` (`getUser()`, nunca `getSession()`;
  `contexto-familia.ts:12-25`) → autorização do RECURSO pela sessão com
  `.eq('family_id', familyId)` → RPC → `revalidatePath('/carteira')` e `'/inicio'`.

---

## 3. Schema proposto (migration 00016)

### 3.1 Tabelas

**`public.investment_wallets`**: uma carteira por família.

| Coluna | Tipo | Regra |
|---|---|---|
| `family_id` | `uuid` | PK, `REFERENCES families(id) ON DELETE CASCADE` |
| `account_id` | `uuid NOT NULL` | `UNIQUE`; FK `(family_id, account_id) → accounts(family_id, id)` **NO ACTION** |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| | | `UNIQUE (family_id, account_id)`: alvo da FK das caixinhas |

**`public.investment_boxes`**: colunas do spec §4 e do mock do front (F11).

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK `DEFAULT gen_random_uuid()` |
| `family_id` | `uuid NOT NULL` | `REFERENCES families(id) ON DELETE CASCADE` (coluna de tenant) |
| `account_id` | `uuid NOT NULL` | FK `(family_id, account_id) → investment_wallets(family_id, account_id)` NO ACTION. A caixinha **só** pode apontar para a carteira da própria família, nunca para outra conta |
| `name` | `text NOT NULL` | `CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)` |
| `rate_type` | `text NOT NULL` | `CHECK (rate_type IN ('liquidez_diaria','pos_fixado','pre_fixado'))` |
| `rate_bps` | `integer NOT NULL` | `CHECK (rate_bps BETWEEN 0 AND 10000)` |
| `rate_defined_at` | `date NOT NULL` | data de calendário em São Paulo, gravada pela RPC |
| `resgate_imediato` | `boolean NOT NULL` | |
| `data_vencimento` | `date` | `CHECK ((resgate_imediato AND data_vencimento IS NULL) OR (NOT resgate_imediato AND data_vencimento IS NOT NULL))` (spec regra 5) |
| `balance_cents` | `bigint NOT NULL DEFAULT 0` | `CHECK (balance_cents BETWEEN 0 AND 99999999999999)` (teto de `numeric(14,2)`, `simulador.ts:54`) |
| `created_at` / `updated_at` | `timestamptz NOT NULL DEFAULT now()` | `updated_at` pelo `touch_updated_at()` já existente (00001:235) |
| | | `UNIQUE (family_id, id)`: alvo da FK dos movimentos |

**`public.investment_box_movements`**: histórico imutável.

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `uuid` | PK |
| `family_id` | `uuid NOT NULL` | `REFERENCES families(id) ON DELETE CASCADE` |
| `box_id` | `uuid NOT NULL` | FK `(family_id, box_id) → investment_boxes(family_id, id)` NO ACTION |
| `kind` | `text NOT NULL` | `CHECK (kind IN ('entrada','saida'))` |
| `counterpart` | `text NOT NULL` | `CHECK (counterpart IN ('nao_alocado','conta'))` |
| `amount_cents` | `bigint NOT NULL` | `CHECK (amount_cents BETWEEN 1 AND 99999999999999)` |
| `transaction_id` | `uuid` | `REFERENCES transactions(id) ON DELETE SET NULL` (F6). `CHECK (counterpart = 'conta' OR transaction_id IS NULL)`. Só nessa direção, porque o SET NULL da limpeza não pode violar o CHECK |
| `occurred_on` | `date NOT NULL` | data em São Paulo, gravada pela RPC |
| `created_by_member_id` | `uuid NOT NULL` | FK `(family_id, created_by_member_id) → family_members(family_id, id)` NO ACTION |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

**Por que NO ACTION e não RESTRICT nas FKs internas:** `limparTeste` apaga a família, e o
CASCADE leva contas, carteira, caixinhas e movimentos **no mesmo comando**. RESTRICT é
conferido na hora e pode falhar conforme a ordem interna da cascata. NO ACTION é
conferido no fim do comando. Fora da cascata, os dois barram a exclusão da conta-carteira
ou da caixinha com filhos. Fonte: **conhecimento meu da doc do Postgres** ("Constraints",
FK: NO ACTION pode ser adiado, RESTRICT não). Não li nesta sessão: as referências da
skill não tratam RESTRICT vs NO ACTION. Por isso é **asserção a provar**: o teste
T-LIMPEZA (§6.2) tem de dar contagem de sobras = 0 com as FKs escritas assim. Se falhar,
o desvio vai registrado.

### 3.2 Índices (cada FK indexada: `schema-foreign-key-indexes.md`)

| Índice | Serve |
|---|---|
| PK `investment_wallets(family_id)` + UNIQUE `(account_id)` + UNIQUE `(family_id, account_id)` | RLS, lookup do trigger por `account_id`, FK das caixinhas |
| `idx_investment_boxes_family_account ON investment_boxes (family_id, account_id)` | RLS (`family_id` na frente) + FK composta. Um índice composto cobre os dois (`query-composite-indexes.md`) |
| UNIQUE `investment_boxes (family_id, id)` | alvo de FK |
| `idx_box_movements_family_box_date ON investment_box_movements (family_id, box_id, occurred_on)` | RLS + FK + ordem do gráfico |
| `idx_box_movements_transaction ON investment_box_movements (transaction_id) WHERE transaction_id IS NOT NULL` | SET NULL ao apagar lançamento (parcial: a maioria é NULL, `query-partial-indexes.md`) |
| `idx_box_movements_member ON investment_box_movements (family_id, created_by_member_id)` | FK para membro |

### 3.3 RPCs (todas `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE ... FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`)

Esqueleto comum, na ordem obrigatória (L-005: **toda recusa vem antes da primeira
escrita**):

```
1. v_uid := auth.uid(); NULL  -> RAISE 'Você precisa estar logado'
2. família e membro de public.family_members WHERE user_id = v_uid;
   NULL -> RAISE 'Você não faz parte de nenhuma família'
3. validação dos parâmetros (valor > 0 e <= teto, taxa, nome, vencimento),
   ainda sem lock
4. PERFORM pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended('carteira:' || v_family_id::text, 0))
5. leituras de estado, todas com family_id = v_family_id, e TODAS as recusas
6. escritas
```

**L-005 aplicada explicitamente:** nenhuma das 5 operações precisa registrar uma
tentativa recusada (não há contador nem auditoria de recusa). O rollback do RAISE é o
comportamento **desejado** (tudo ou nada). A armadilha da L-005 só existiria se uma
recusa dependesse de ler algo que a própria chamada acabou de escrever. Por isso a regra é
"todas as checagens no passo 5, nenhuma no passo 6". A única recusa que sobra no passo 6
é o `ROW_COUNT = 0` do UPDATE condicional (§2.4). Ele é a **primeira** escrita do
resgate e não escreve nada quando recusa. No `aplicar`, a criação preguiçosa da carteira
acontece no passo 6, depois de todas as checagens. Se algo falhar depois dela, o
rollback leva a carteira junto, o que é inofensivo porque ela é recriada na próxima
chamada.

| RPC | Assinatura | Recusas (passo 5) | Escritas (passo 6) |
|---|---|---|---|
| `carteira_aplicar` | `(p_conta_origem_id uuid, p_valor_cents bigint, p_caixinha_id uuid DEFAULT NULL) RETURNS TABLE (lancamento_id uuid, movimento_id uuid)` | origem não é `corrente` ativa da família, ou é a carteira → `'Conta de origem inválida'`; `p_valor_cents > saldo` (via `v_account_balances.current_balance * 100`, filtrado por família e conta) → `'Saldo insuficiente na conta de origem'`; caixinha informada e não é da família → `'Caixinha não encontrada'` | garante a carteira → `set_config('app.carteira_rpc','on',true)` → INSERT `transactions` (transferência origem→carteira, `amount = p_valor_cents::numeric / 100`) → `set_config(...,'off',true)` → se houver caixinha: UPDATE `balance_cents = balance_cents + v` + INSERT movimento (`entrada`, `conta`, `transaction_id`) |
| `carteira_criar_caixinha` | `(p_nome text, p_tipo text, p_taxa_bps integer, p_resgate_imediato boolean, p_data_vencimento date) RETURNS uuid` | nome, tipo, taxa e vencimento fora da regra (mensagens §4.3) | garante a carteira → INSERT caixinha com `rate_defined_at = hoje_sp`, `data_vencimento = NULL` se imediato |
| `carteira_alocar` | `(p_caixinha_id uuid, p_valor_cents bigint) RETURNS uuid` (movimento) | caixinha não é da família → `'Caixinha não encontrada'`; `v > não alocado` (0 se não há carteira) → `'Saldo não alocado insuficiente'` | UPDATE `+ v` → INSERT movimento (`entrada`, `nao_alocado`) |
| `carteira_resgatar` | `(p_caixinha_id uuid, p_valor_cents bigint, p_conta_destino_id uuid DEFAULT NULL) RETURNS TABLE (movimento_id uuid, lancamento_id uuid)`. `NULL` = para o não alocado | caixinha (`SELECT ... FOR UPDATE`) não é da família → `'Caixinha não encontrada'`; `NOT resgate_imediato AND hoje_sp < data_vencimento` → `'Esta caixinha só pode ser resgatada a partir de ' \|\| to_char(data_vencimento,'DD/MM/YYYY')`; `v > balance_cents` → `'Saldo insuficiente na caixinha'`; destino informado não é `corrente` ativa da família → `'Conta de destino inválida'` | UPDATE condicional `- v` (§2.4, `ROW_COUNT = 0` → mesma mensagem de saldo) → se for conta: `set_config on` → INSERT transferência carteira→destino → `off` → INSERT movimento (`saida`, `conta`/`nao_alocado`) |
| `carteira_atualizar_taxa` | `(p_caixinha_id uuid, p_taxa_bps integer) RETURNS void` | taxa fora de 0..10000; caixinha não é da família → `'Caixinha não encontrada'` | UPDATE `rate_bps`, `rate_defined_at = hoje_sp`. Não mexe em saldo |
| `carteira_garantir` (interna, INVOKER, sem EXECUTE para cliente) | `(p_family_id uuid) RETURNS uuid` (conta) | sem recusa | se não existe carteira: INSERT `accounts` (`sort_order = max+1` da família) + INSERT `investment_wallets`. Só é segura **sob o lock** do passo 4 |
| `carteira_nao_alocado_cents` (interna, INVOKER, sem EXECUTE para cliente) | `(p_family_id uuid) RETURNS bigint` | | `(current_balance * 100)::bigint` da conta-carteira − `COALESCE(sum(balance_cents),0)` |

**Invariante do "não alocado"**, conferida por teste depois de cada operação:

| Operação | Total da conta | Σ caixinhas | Não alocado |
|---|---|---|---|
| aplicar sem caixinha | +v | 0 | +v |
| aplicar na caixinha | +v | +v | 0 |
| alocar | 0 | +v | −v |
| resgatar → não alocado | 0 | −v | +v |
| resgatar → conta | −v | −v | 0 |

### 3.4 Triggers (dependem de **Q1 = A**)

- `public.tx_carteira_so_por_rpc()`: INVOKER, `SET search_path = ''`, EXECUTE revogado
  de `PUBLIC, anon, authenticated` (padrão de 00015:84-118). Ligada a três triggers em
  `public.transactions`: `trg_tx_carteira_ins` (BEFORE INSERT), `trg_tx_carteira_upd`
  (BEFORE UPDATE), `trg_tx_carteira_del` (BEFORE DELETE). Lógica em §2.7. Mensagem:
  `'Movimentos da carteira de investimento só podem ser feitos pela área de Investimentos.'`
  com `ERRCODE = '42501'`.
- `public.accounts_carteira_congela()` + `trg_accounts_carteira_congela` (BEFORE UPDATE em
  `accounts`): recusa mudança de `type`, `initial_balance` ou `family_id` da
  conta-carteira para papéis fora de `postgres`, `service_role`, `supabase_admin`. Aqui
  `postgres` é liberado porque nenhuma RPC existente faz UPDATE em `accounts`
  (conferir com grep no catálogo vivo na execução, como fez a 00015:40-42).
- `trg_investment_boxes_touch`: BEFORE UPDATE, `touch_updated_at()` (00001:235).

### 3.5 View

`public.v_carteira_resumo WITH (security_invoker = true)`: uma linha por família com
carteira: `family_id, account_id, total_cents, alocado_cents, nao_alocado_cents`
(`total_cents` vem de `v_account_balances`). `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
e depois `GRANT SELECT ... TO authenticated`. Fonte: `supabase:supabase` ("Views bypass
RLS by default... use security_invoker = true") e o padrão de 00013:213-214.

### 3.6 Policies (RLS por operação e por role)

| Tabela | SELECT (`TO authenticated`) | INSERT | UPDATE | DELETE | `anon` |
|---|---|---|---|---|---|
| `investment_wallets` | `family_id = (SELECT public.get_user_family_id_self())` | nenhuma + REVOKE | nenhuma + REVOKE | nenhuma + REVOKE | REVOKE ALL |
| `investment_boxes` | idem | nenhuma + REVOKE | nenhuma + REVOKE | nenhuma + REVOKE | REVOKE ALL |
| `investment_box_movements` | idem | nenhuma + REVOKE | nenhuma + REVOKE | nenhuma + REVOKE | REVOKE ALL |

Não é o caso "RLS ligado e zero policies trava tudo": cada tabela tem a policy de leitura,
e a escrita é negada **de propósito**, com a RPC como único caminho (§2.6). Nenhuma
`FOR ALL`, nenhum `USING (true)`. Como não há policy de UPDATE, não há `WITH CHECK` a
esquecer.

### 3.7 Bloco final de auto-verificação (DO que aborta a migration)

Mesmo padrão de 00013 e 00015. A migration aborta se faltar algo:
- as 3 tabelas com `relrowsecurity`;
- exatamente as 3 policies SELECT esperadas, por **nome**;
- `has_table_privilege('authenticated', <tabela>, 'INSERT'|'UPDATE'|'DELETE')` falso nas 3;
  `has_table_privilege('anon', ..., 'SELECT')` falso; `SELECT` verdadeiro para
  `authenticated`;
- `v_carteira_resumo` com `'security_invoker=true' = ANY(reloptions)`;
- as 5 RPCs `prosecdef` com `proconfig` contendo `search_path=""` e
  `has_function_privilege('anon', ..., 'EXECUTE')` falso;
- as 2 internas sem EXECUTE para `authenticated`;
- os triggers ativos (`tgenabled = 'O'`) se Q1 = A.

**L-004:** cada expressão desse bloco é rodada pelo `carteira-rls.mjs --com-migration`
antes do push. Se ela abortar contra o rascunho, o placar mostra. Nenhuma expressão
entra sem ter executado.

---

## 4. Server Actions e Zod

### 4.1 `src/lib/esquemas-investimentos.ts` (exporta)

```ts
export const TIPOS_RENDIMENTO = ['liquidez_diaria', 'pos_fixado', 'pre_fixado'] as const
export type TipoRendimento = (typeof TIPOS_RENDIMENTO)[number]
export const LIMITE_NOME_CAIXINHA = 60
export const TAXA_MAX_BPS = LIMITES_SIMULACAO.taxaMaxBps   // 10_000, reaproveitado
export const VALOR_MAX_REAIS = 99_999_999.99               // mesmo de esquemas-pagamentos.ts:59

export const esquemaAplicar        // { contaOrigemId: uuid, valor -> valorCentavos, caixinhaId?: uuid }
export const esquemaCriarCaixinha  // { nome, tipoRendimento, taxaMensalBps, resgateImediato, dataVencimento? }
export const esquemaAlocar         // { caixinhaId, valor -> valorCentavos }
export const esquemaResgatar       // { caixinhaId, valor -> valorCentavos, destino: 'nao_alocado' | { contaId } }
export const esquemaAtualizarTaxa  // { caixinhaId, taxaMensalBps }
export type EntradaAplicar = z.input<typeof esquemaAplicar>   // (e uma por esquema)
```

Todos são `.strict()`. `destino` é `z.union([z.literal('nao_alocado'), z.object({ contaId: uuid }).strict()])`.

### 4.2 `src/actions/investimentos.ts` (assinaturas exatas)

```ts
'use server'
aplicarNaCarteira(input: EntradaAplicar):
  Promise<ResultadoAction<{ lancamentoId: string; movimentoId: string | null }>>
criarCaixinha(input: EntradaCriarCaixinha): Promise<ResultadoAction<{ id: string }>>
alocarParaCaixinha(input: EntradaAlocar): Promise<ResultadoAction<void>>
resgatarDaCaixinha(input: EntradaResgatar): Promise<ResultadoAction<void>>
atualizarTaxaCaixinha(input: EntradaAtualizarTaxa): Promise<ResultadoAction<void>>
```

**Desvio em relação ao plano-mãe:** `aplicarNaCarteira` devolveria `{ movimentoId: string }`.
Sem caixinha **não existe movimento**: o valor vai ao não alocado, e o que nasce é só o
lançamento. Devolvo `{ lancamentoId, movimentoId: string | null }`. O diálogo do front
não usa o retorno (`dialogo-aplicar.tsx:45`, `onAplicar(...) => Promise<void>`), então
nada quebra.

Pré-checagem do recurso pela sessão (a primeira camada, com RLS), antes da RPC:
- `aplicar`: `accounts` `.eq('family_id').eq('id', contaOrigemId)` com `type = 'corrente'`
  e `archived_at` nulo, e a caixinha (se houver) `.eq('family_id')`;
- `alocar`, `resgatar` e `atualizarTaxa`: a caixinha `.eq('family_id')`; no resgate, também
  a conta de destino.

A **mesma frase** da RPC é devolvida, com o campo em `camposComErro` (padrão de
`fatura.ts:53-60`). O saldo **não** é pré-checado na Action: ler e decidir no JS seria
exatamente o L-014. Quem decide é a RPC, sob lock.

### 4.3 Mensagens novas em `MENSAGENS_DE_NEGOCIO` (`resultado.ts`)

`'Conta de destino inválida'`, `'Saldo insuficiente na conta de origem'`,
`'Caixinha não encontrada'`, `'Saldo não alocado insuficiente'`,
`'Saldo insuficiente na caixinha'`, `'Esta caixinha só pode ser resgatada a partir de'`
(prefixo: o fim tem data interpolada, e `startsWith` cobre),
`'Movimentos da carteira de investimento só podem ser feitos pela área de Investimentos.'`,
e as de validação que a RPC repete do Zod (nome, tipo, taxa, vencimento, valor). O texto
exato de cada uma é decidido UMA vez na migration, e o teste copia **da migration**, não
de outro teste (L-020). `'Conta de origem inválida'` já existe.

---

## 5. Task 3: rendimento sob demanda (executar só se delegado)

- `src/lib/rendimento-caixinha.ts`:
  `estimarRendimento({ taxaMensalBps, movimentos: {kind, amountCents, occurredOn}[], hoje }) -> { ok: true; valorEstimadoCentavos; rendimentoCentavos } | { ok: false; erro }`.
- Fórmula exata, linear no principal: com `N = max(meses_i)`, temos
  `num = Σ s_i · P_i · (10000 + r)^{n_i} · 10000^{N − n_i}` e `den = 10000^N`, com um
  `arredondarMeioParaCima(num, den)` no fim (o helper de `simulador.ts:87`, passado a
  `export`). `s_i = +1` entrada, `−1` saída. Rodado nesta sessão (`node -e`):
  100000 centavos aplicados há 2 meses e 50000 resgatados há 1 mês, a 100 bps
  → **51510** (102010 − 50500).
- `meses completos(de, até)` = `(a2−a1)·12 + (m2−m1)`, menos 1 se o dia de `até` for
  menor que `min(dia de "de", último dia do mês de "até")`, e piso 0. Casos executados
  nesta sessão, 9 de 9 conforme o esperado:
  `01-15→02-14 = 0`, `01-15→02-15 = 1`, `01-31→02-28 = 1`, `01-31→02-27 = 0`,
  `2024-01-31→2024-02-29 = 1`, `10-16→10-16 = 0`, `03-31→04-30 = 1`,
  `2026-12-10→2027-01-10 = 1`, futuro `10-20→10-16 = 0`.
- Usa a **taxa atual** sobre todo o histórico, e a UI diz isso ("estimativa com a taxa
  definida em dd/mm/aaaa"). Se Q2 voltar diferente, este item é refeito.

---

## 6. Testes

### 6.1 `carteira-rls.sql` (isolamento, TDD vermelho→verde sem gravar)

Fixtures criadas como `postgres` dentro do DO: duas famílias A e B com usuários de uuid
novo, uma conta corrente de cada com receita paga, a carteira de A e uma caixinha de A com
saldo. A troca de papel usa `SET LOCAL ROLE authenticated` +
`set_config('request.jwt.claims', ...)`. O placar sai por RAISE e tudo é desfeito.

Casos (cada um com SQLSTATE ou contagem esperada; **intruso B usa referências válidas
de A**, L-018):
- B: `SELECT` em `investment_wallets`, `investment_boxes`, `investment_box_movements` e
  `v_carteira_resumo` filtrando pelos ids de A → 0 linhas;
- B: `UPDATE investment_boxes SET balance_cents = 1 WHERE id = <caixinha de A>` → 42501;
  `DELETE` → 42501; `INSERT` com `family_id = A` e `account_id = <carteira de A>` → 42501;
  a linha de A continua igual;
- **A, na própria família:** `UPDATE` direto de `balance_cents` → 42501. Prova que o
  atalho para fabricar dinheiro está fechado;
- B: `carteira_resgatar(<caixinha de A>, 1, <corrente de A>)` → `'Caixinha não encontrada'`;
  `carteira_aplicar(<corrente de A>, 1, <caixinha de A>)` → `'Conta de origem inválida'`;
  `carteira_alocar(<caixinha de A>, 1)` e `carteira_atualizar_taxa(<caixinha de A>, 50)` →
  `'Caixinha não encontrada'`; o saldo e a taxa de A não mudam;
- `anon`: `SELECT` nas três tabelas e na view → 42501; `EXECUTE` nas 5 RPCs → 42501;
- **barreiras de saldo (estruturais):** A chama `carteira_resgatar(<própria caixinha>, saldo + 1, NULL)`
  → `'Saldo insuficiente na caixinha'`, com saldo e contagem de movimentos iguais;
  `carteira_alocar(<própria caixinha>, não alocado + 1)` → `'Saldo não alocado insuficiente'`;
  como `postgres`, `UPDATE investment_boxes SET balance_cents = -1` → 23514 (o CHECK
  existe e morde);
- se Q1 = A: A (`authenticated`) `INSERT` em `transactions` com `to_account_id = <carteira>`
  → 42501; `save_transactions` com a carteira como conta → 42501;
  `delete_transactions(<transferência criada por carteira_aplicar dentro do DO>)` → 42501;
  `pay_invoice(<cartão>, <carteira>, ...)` → 42501, com a **fixture do cartão tendo
  despesa não paga na fatura pedida**. Sem ela, `pay_invoice` recusa antes com
  `'Esta fatura não tem valor em aberto'` (00003:467-469) e o caso passaria pelo motivo
  errado (L-018). O caso confere o SQLSTATE 42501, não só "deu erro". Editar só a
  `description` da transferência → passa.

**Sequência de prova (registrada no relatório com a saída colada):**
1. `node tests/integration/carteira-rls.mjs --com-migration supabase/migrations/00016_carteira_investimento.sql --mutante tests/integration/carteira-rls-mutante.sql`
   → **VERMELHO**, e o placar tem de mostrar B **lendo** a caixinha de A e o
   `carteira_resgatar` de B **devolvendo ok e mudando o saldo de A** (L-018: o mutante
   tem de GRAVAR, não só mudar a mensagem). **Armadilha prevista:** um mutante que
   tirasse só o filtro e continuasse gravando com o `family_id` de B seria barrado pelas
   FKs compostas `(family_id, box_id)` e `(family_id, account_id)` com 23503. O teste
   ficaria vermelho pela mensagem, não pela gravação, que é exatamente o caso da L-018.
   Por isso o mutante grava com o `family_id` da linha encontrada (ver o arquivo do
   mutante em §1). Se o vermelho vier de 23503, o mutante está errado: corrigir o
   mutante, não o teste.
2. O mesmo comando sem `--mutante` → **VERDE**.
3. Conferência pós-runner: `investment_boxes` não existe no banco (prova do rollback),
   como faz o `grupos-rls.mjs`.

### 6.2 `investimentos.int.test.ts` (depois do push; Actions reais, `createClient` mockado como em `orcamentos.int.test.ts`)

Família A com **dois membros** (para o Review Focus 5) e família B. Limpeza no
`afterAll` com `limparTeste`, contagem de sobras por id (L-019), e nunca a família real
(`FAMILIA_REAL`).

| Caso | Prova |
|---|---|
| RF1-a | caixinha `resgateImediato=false` com vencimento **amanhã** → resgate recusado com `'Esta caixinha só pode ser resgatada a partir de DD/MM/AAAA'` exato |
| RF1-b | vencimento **hoje** (hojeEmSaoPaulo) → resgate aceito |
| RF1-c | vencimento **ontem**, criada assim → criação aceita e resgate aceito |
| RF1-d | `resgateImediato=false` sem data → Zod `{ dataVencimento: [msg] }` com `toEqual` |
| RF2 | aplicar `saldo + 0,01` → `'Saldo insuficiente na conta de origem'`, nenhum lançamento novo, caixinha igual |
| RF3 | resgatar `saldo + 0,01` → `'Saldo insuficiente na caixinha'`, saldo igual, nenhum movimento novo |
| RF4 | taxa `50000`, `-1`, `1.5`, `Infinity`, `NaN` → **uma** mensagem cada (`toEqual([msg])`, L-016); a mesma taxa direto na RPC → recusada pelo banco |
| RF5-a | 10 `rpc('carteira_aplicar', R$10 na caixinha)` em `Promise.all`, alternando os clientes dos dois membros → saldo final = inicial + 100,00 exato, 10 movimentos, 10 lançamentos |
| RF5-b | caixinha com R$100; dois resgates de R$60 em paralelo (um por membro), repetido 5 vezes com caixinha nova → em **cada** rodada exatamente 1 `ok` e 1 `'Saldo insuficiente na caixinha'`, saldo final R$40 |
| RF5-c | conta com R$100; duas aplicações de R$60 em paralelo → exatamente 1 `ok` |
| RF5-d | duas primeiras aplicações em paralelo numa família **sem** carteira → existe exatamente 1 linha em `investment_wallets` e 1 conta `'Carteira de investimento'` (corrida da criação preguiçosa) |
| INV | depois de cada operação da tabela de §3.3, `v_carteira_resumo` confere total, alocado e não alocado |
| ISO-A | B chama as 5 Actions com ids **e contas de A** → mensagem de não encontrado ou de conta inválida, e o estado de A igual |
| ISO-RLS | intruso = `CARTEIRA_RLS_MUTANTE === '1' ? admin : B.cli`, lendo e alterando direto no PostgREST. TEM de ficar vermelho no modo mutante |
| P-009 | `valor: 1.005` → `'Use no máximo 2 casas decimais.'` (recusa, não arredonda); `0.1 + 0.2` → aceito como 30 centavos |
| T-GUC | `B.cli.rpc('set_config', { setting_name: 'app.carteira_rpc', new_value: 'on', is_local: true })` → erro de função inexistente (prova a premissa de §2.7). Se **não** der erro, a trava A está furada: parar e reportar |
| T-LIMPEZA | depois do `limparTeste`: 0 linhas por id de família nas três tabelas novas |

O vitest roda primeiro com as Actions em stub (`return falha('não implementado')`):
**vermelho** pela asserção. Depois com a implementação: **verde**.

### 6.3 Unit: `esquemas-investimentos.test.ts`

Cada caso inválido com a mensagem exata ao lado, inclusive `Infinity`, `NaN`, negativo
com 3 casas, nome de 60 e de 61 code points com emoji na fronteira (L-015), e chaves
desconhecidas (`.strict()`).

### 6.4 Concorrência: o que NÃO dá para provar com mutante

Não existe como forçar, de forma determinística, a corrida contra um mutante sem lock no
banco hospedado sem implantar o mutante em produção, e isso eu não faço. A prova é
comportamental (RF5-a a RF5-d, repetidos) mais a estrutural (caso "barreiras de saldo"
do §6.1: recusa acima do saldo e o CHECK `>= 0` mordendo como `postgres`). Esse limite
vai escrito no relatório. Os casos RF1-b e RF1-c usam `hojeEmSaoPaulo()`. Rodar a suíte
perto da meia-noite de Brasília pode virar o dia entre o teste e a RPC. Se um deles falhar,
conferir o horário antes de mexer no código.

---

## 7. Ordem de operações

0. **Pré-voo (somente leitura; saída colada; aborta se falhar):**
   `git pull --rebase origin main`; `npx supabase migration list --db-url ...`. Se a
   última aplicada não for 00015, renumero. Contagem por SQL de `accounts` por `type`, de
   lançamentos com `account_id`/`to_account_id` em conta `investimento`, e o snapshot
   global de famílias, usuários e lançamentos (L-007). Hoje está **NÃO VERIFICADO**
   (§0). Se a permissão continuar negada, paro e devolvo ao Maestro, porque sem snapshot
   não há prova de "família real intacta".
1. Respostas de Q1, Q2 e Q3 em mãos. Sem elas não escrevo SQL.
2. `carteira-rls.sql` + runner + mutante → rascunho da 00016 → sequência de prova §6.1
   (vermelho com mutante, verde sem).
3. Unit do Zod vermelho → `esquemas-investimentos.ts` → verde.
4. **Passe de prosa do cabeçalho da migration, frase a frase contra a fonte (L-022)**,
   ANTES do push.
5. `npx supabase db push --dry-run` (só a 00016 listada) → `db push` → `migration list`
   (00016 em Remote).
6. `npx supabase gen types typescript --db-url ... --schema public > src/types/database.ts`
   → `npx tsc --noEmit`. Os tipos são regenerados **depois** da última migration e entram
   no mesmo commit.
7. `resultado.ts` (mensagens) → Actions em stub → `investimentos.int.test.ts` vermelho →
   implementação → verde → `CARTEIRA_RLS_MUTANTE=1` vermelho nos testes ISO-RLS.
8. Suíte completa `npx vitest run` no modo padrão (paralelo, L-019): a trava de §2.7 não
   pode quebrar nenhum teste existente (`save_transactions`, `excluir-lancamento`,
   `pagarFatura` e `acerto` precisam continuar verdes).
9. Task 3, se delegada.
10. Snapshot pós-execução (L-007), varredura de segredos, `Skill(security-review)`,
    `Skill(code-review)` high, `Skill(superpowers:verification-before-completion)`.
11. Commits: migration + teste SQL + tipos num commit; Actions + Zod + testes no outro
    (como no plano-mãe, Task 1 Step 5 e Task 2 Step 8).

**Por que essa ordem:** a migration é imutável depois do push (L-022), então tudo o que
pode estar errado nela é provado antes, numa transação desfeita. Os tipos dependem da
migration aplicada. As Actions dependem dos tipos.

---

## 8. Contrato de handoff (prévia, confirmado na execução)

### 8.1 PARA O FACHADA

- **Actions:** §4.2, de `@/actions/investimentos`. Entrada `z.input` dos esquemas de
  `@/lib/esquemas-investimentos`. Erro sempre na forma
  `{ ok: false; erro: string; camposComErro?: Record<string, string[]> }`. As chaves de
  `camposComErro` são os nomes dos campos da entrada (`valor`, `contaOrigemId`,
  `caixinhaId`, `nome`, `taxaMensalBps`, `dataVencimento`, `destino`). O diálogo hoje
  espera `throw`. A Fachada adapta: `if (!r.ok) throw new Error(r.erro)`, ou
  equivalente.
- **Leitura:** `lerCarteira(supabase)` de `@/lib/carteira-leitura` →
  `{ contaId: string | null; saldoTotalCents; saldoNaoAlocadoCents; caixinhas: Tables<'investment_boxes'>[] }`.
  As colunas de `investment_boxes` têm **os mesmos nomes** do mock
  `tipos-investimentos.ts`. Troque a interface escrita à mão por
  `Database['public']['Tables']['investment_boxes']['Row']`.
- **Esconder a conta-carteira** (`contaId`, ou `investment_wallets.account_id`) de
  `/lancar`, de "Contas & Cartões", da origem do pagamento de fatura, e das listas de
  origem e destino dos próprios diálogos (só contas `corrente` ativas). Com Q1 = A,
  usá-la fora da área dá o erro `'Movimentos da carteira...'`.
- **Pendências de front (não minhas):** trocar `Math.round(taxaNumero * 100)` por
  `taxaPercentualParaBps` (`simulador.ts:152`), por causa do P-009; trocar `todayISO()`
  por `hojeEmSaoPaulo()` no diálogo de criar caixinha; o servidor aceita vencimento no
  passado (RF1-c), e o front pode manter a trava de UX.
- **Rotas:** tudo sob `(app)`, exige sessão e família. Não há role: os dois membros
  podem tudo na carteira da família (o mesmo modelo de `transactions`).

### 8.2 PARA O DASH

- **Tabelas e métricas:** `investment_boxes.balance_cents` (bigint, centavos,
  principal **sem** rendimento), `rate_bps` (bps ao mês),
  `investment_box_movements(kind, counterpart, amount_cents, occurred_on)`,
  `v_carteira_resumo(total_cents, alocado_cents, nao_alocado_cents)`
  (`security_invoker = true`).
- **Datas:** `occurred_on`, `rate_defined_at` e `data_vencimento` são `date` de
  calendário em **America/Sao_Paulo**, sem fuso. `created_at`/`updated_at` são
  `timestamptz` (UTC no banco). A granularidade do rendimento é **mês completo** (§5).
- **Cardinalidade esperada:** dezenas de caixinhas por família, alguns movimentos por mês
  por caixinha. É uma estimativa de produto, não uma medição.
- **Índices prontos:** `(family_id, box_id, occurred_on)` para a série do gráfico.
- **Projeção:** `projetarValorFuturo({ valorCentavos: balance_cents, taxaMensalBps: rate_bps, meses })`
  já existe. O histórico real sai dos movimentos.
- **Atenção:** `v_monthly_summary.investment_total` **não** inclui aplicações da carteira
  (§2.3). Se o KPI "investido no mês" tiver de incluí-las, isso é uma migration NOVA
  pedida via `PENDENCIAS.md`.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Migration destrutiva? **Não.** Só `CREATE` de tabela, índice, view, função e trigger. Nenhum `ALTER` de coluna, `DROP` ou backfill | Os triggers em `transactions`/`accounts` pegam um lock breve na criação. Não reescrevem linhas |
| A trava (Q1=A) muda o comportamento de fluxos existentes para linhas da carteira | Só afeta linhas que tocam a conta-carteira, que ainda não existe. A suíte completa roda no passo 8 |
| A premissa "o cliente não liga `app.carteira_rpc`" | Teste T-GUC. Se falhar, a trava é rebaixada a defesa parcial e devolvida ao Maestro |
| DEFINER em `public` é endpoint público | Mitigações de §2.6, auto-verificação de §3.7, isolamento de §6.1 |
| Conta `investimento` manual já existente com o mesmo nome | Ela não vira carteira (§2.2). O Passo 0 mede e o relatório diz quantas existem |
| A conta-carteira aparece nas listas atuais até a Fachada filtrar | Registrado no contrato §8.1 |
| Rendimento estimado não é resgatável | Depende de Q2. A UI precisa dizer "estimativa" |
| Data API sem exposição automática a partir de 2026-10-30 (F10) | GRANT explícito + teste ISO-A lendo pela sessão |
| Docker/local: não usado (F7). MCP do Supabase: não autenticado | O caminho é CLI `--db-url` + runner SQL. Nada depende de MCP |
| Leitura de produção negada nesta fase | Passo 0 da execução. Sem ela, parar |

---

## 10. Perguntas

### Bloqueantes (sem resposta não escrevo SQL)

- **Q1: travar a conta-carteira contra lançamento comum?** (A) trigger de §2.7: `/lancar`,
  editar/excluir lançamento e pagar fatura recusam linhas que tocam a carteira;
  (B) só esconder na UI, e aceitar que excluir a transferência pela lista de `/inicio`
  deixa o não alocado negativo. **Recomendo A.** É regra de negócio sobre fluxos
  existentes, por isso não decido sozinho.
- **Q2: o rendimento estimado é só exibição?** Ele não entra em `balance_cents`, não pode
  ser resgatado e não entra no patrimônio. O resgate fica limitado ao principal.
  **Recomendo sim:** a taxa é estimativa manual (spec §3.3), e resgatar dinheiro
  estimado para a conta corrente faria o saldo do app divergir do extrato. A
  alternativa (rendimento resgatável) muda §2.1, §2.5 e §5.
- **Q3: quais contas podem ser origem de "Aplicar" e destino de "Resgatar"?**
  **Recomendo só `corrente` ativa**, como `settle_up`. Ficariam de fora o benefício
  (VR/VA, que não se investe) e contas `investimento` manuais.

### Não bloqueantes (sigo com o padrão indicado se não houver resposta)

- **Q4:** não há como devolver dinheiro do **não alocado** direto para uma conta (as 5
  Actions do plano-mãe não cobrem). Padrão: fica de fora desta leva e vira pendência. O
  usuário aloca numa caixinha de resgate imediato e resgata.
- **Q5:** teto da taxa. Padrão: 10.000 bps (100% a.m.), conforme o plano-mãe. Um teto
  realista (por exemplo 1.000 bps) é decisão de produto.
- **Q6:** não há excluir nem arquivar caixinha nesta leva. Padrão: pendência.
- **Q7:** push para o parceiro ao aplicar ou resgatar. Padrão: fora desta leva, sem push.

---

## Lições do caderno aplicadas neste plano

REGRA PERMANENTE (cada número ao lado da fonte ou do comando), L-004 (regra de meses
e exemplo BigInt executados), L-005 (§3.3), L-014 (§2.4), L-015 (nome por code point),
L-016 (§2.8, §6.3), L-018 (§6.1, §6.2), L-019 (§6.2), L-020 (§4.3), L-022 (§7 passo 4),
L-007 (§7 passo 0).

---

## 11. Revisão na FASE: EXECUÇÃO (2026-10-16): o que mudou em relação às §1-§10

Respostas do Heitor (via Maestro): Q1 = A (trava com GUC, T-GUC obrigatório);
Q3 = só `corrente` ativa; Q5 = 10.000 bps; Q6 = fora. **Q2 mudou o desenho:**
o rendimento é confirmado manualmente, mês a mês, e só então vira saldo
(spec, decisão 4b). Por isso as §2.5 e §5 ficam **substituídas** por esta seção.

- **Rendimento estimado é calculado na leitura, nunca gravado por tempo** (sem
  `pg_cron`, pelo mesmo motivo de §2.5). O que se grava é a **confirmação**:
  `carteira_confirmar_rendimento` (Action `confirmarRendimentoMensal`) cria um
  movimento `kind='rendimento'` com `competencia` (dia 1 do mês), soma ao
  `balance_cents` e cria uma `receita` paga na conta-carteira (patrimônio). O
  valor é calculado na RPC, sob o lock da família, e nunca vem do cliente.
- **Fórmula:** base(M) = entradas − saídas antes de M + rendimentos confirmados
  de meses < M; rendimento = base × taxa / 10000, meio centavo para cima (a
  mesma conta de `simulador.ts:87`). A conta mora em SQL porque o valor
  confirmado tem de ser calculado no banco. Por isso a Task 3 em TypeScript não
  foi criada. Desvio registrado.
- **Regras (todas cobertas no `carteira-rls.sql`):** só mês **encerrado**
  (competência < mês corrente em São Paulo); **ordem cronológica**, decisão
  minha delegada pelo Maestro, porque o valor de um mês depende dos anteriores
  confirmados; mês anterior ao último confirmado nunca mais confirma; uma vez
  por mês por caixinha (índice único parcial + lock); taxa = a vigente no
  **último dia** do mês (histórico `investment_box_rates`, 00017); receita e
  movimento datados no último dia da competência.
- **Migrations:** 00016 (desenho das §2-§3) + 00017 (achados aceitos de duas
  rodadas de `code-review` high, aplicada como migration nova porque a 00016
  já estava no ar).
- **Desvios das §1-§4:** `lerCarteira` (`src/lib/carteira-leitura.ts`) não foi
  criada, porque não estava nos arquivos permitidos; a leitura é por tabela, view
  e RPC (contrato no relatório). `resultado.ts` não foi alterado pelo mesmo
  motivo: as frases das RPCs são traduzidas em `src/actions/investimentos.ts`.
  `carteira_nao_alocado_cents` não foi criada: o não alocado vem de
  `v_carteira_resumo`, que é a fórmula única.
