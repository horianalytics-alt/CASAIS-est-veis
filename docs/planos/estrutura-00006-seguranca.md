# Migration 00006 — Correção dos 3 achados de segurança — Plano de Implementação

> **Para executores:** este é um plano de `FASE: PLANO`. Nada aqui foi aplicado no banco.
> A execução usa `superpowers:executing-plans` ou delegação direta ao Estrutura em
> `FASE: EXECUÇÃO`, tarefa por tarefa, na ordem dada.

**Objetivo:** fechar, com defesa explícita e teste que prova, os três achados aceitos —
tenant escape por mass assignment em `family_members`, oráculo de pertencimento nos
helpers `get_user_*`, e baixa entropia do `join_code`.

**Arquitetura:** uma única migration nova (`00006_hardening_seguranca.sql`), idempotente,
escrita para rodar numa transação só contra o banco hospedado. Nenhum arquivo de
`00001..00005` é tocado. Três defesas independentes, cada uma com teste próprio.

**Stack:** Postgres 15+ (Supabase hospedado, ref `wxhfgstgjjlmqauogeid`), `pgcrypto`
(já instalado por `00001`), PostgREST, `@supabase/supabase-js` nos testes.

**Spec:** achados do hook `security-guidance`, verificados tecnicamente pelo Maestro
contra o banco real; evidência reproduzida citada no briefing desta fase.

---

## Constraints globais

- Migration `00001..00005` **aplicadas e imutáveis**. Correção é sempre arquivo novo.
- `npx supabase db reset` é **PROIBIDO** — é o banco real do cliente.
- Todo comando de banco usa `--db-url`, nunca `--local`. Não existe Supabase local.
- Todo comentário SQL e toda mensagem de erro em **português do Brasil**.
- Dinheiro é `numeric(14,2)`. Data é `date` puro, sem timezone.
- Nenhum segredo em migration.
- Fora de escopo nesta migration: rate limiting de `family_preview`/`join_family`
  (pendência de produto, registrada pelo Maestro em separado).

---

## Correção de fato ao briefing — leia antes de executar

O briefing afirma: *"as policies de TODAS as 9 tabelas e as 4 views chamam a versão com
parâmetro"*. **Isto está parcialmente incorreto, e a diferença reduz muito o risco do
Achado 2.** Levantamento no disco:

```
$ grep -n 'get_user_family_id\|get_user_member_id' 00003_functions.sql 00004_views.sql 00005_realtime.sql
00003_functions.sql:370:  v_family_id uuid := get_user_family_id(auth.uid());
00005_realtime.sql:56:      (SELECT get_user_family_id(auth.uid()))::text
00005_realtime.sql:63:      (SELECT get_user_family_id(auth.uid()))::text
```

Conclusões que mudam o plano:

1. **As 4 views NÃO chamam os helpers.** Elas são `WITH (security_invoker = true)` e
   herdam o RLS das tabelas-base. `00004_views.sql:223` só concede `SELECT` a
   `authenticated`. Logo, **views não entram na lista de blast radius** — não precisam
   ser recriadas.
2. Das 7 RPCs, **só `delete_transactions` chama um helper** (`00003:370`). As outras
   derivam identidade de `auth.uid()` direto, ou de `SELECT ... WHERE user_id = v_uid`.
3. Além das policies de `00002`, há **2 policies em `realtime.messages`** (`00005:56,63`)
   que chamam `get_user_family_id`. Essas são fáceis de esquecer porque não estão no
   arquivo de RLS — e esquecê-las é exatamente o estado quebrado que o briefing manda
   evitar.

O inventário completo e exato está na Tarefa 2.

---

## Decisões, com justificativa e fonte

### D1 — Achado 1: adotar (a) trigger + (c) WITH CHECK; **rejeitar (b)** privilégio por coluna

Decisão: **defesa em profundidade com duas camadas, (a) e (c) juntas. (b) fica de fora.**

Por quê cada uma:

- **(c) `WITH CHECK` com `family_id` fixado** — custo zero, é a correção canônica.
  A policy atual tem `WITH CHECK (user_id = auth.uid())` e **não menciona `family_id`**;
  acrescentar `AND family_id = (SELECT get_user_family_id_self())` transforma o bloqueio
  acidental em regra explícita. O `(SELECT ...)` em volta da função é obrigatório por
  performance — a função é avaliada uma vez por query e não uma vez por linha.
  **Fonte:** `supabase:supabase-postgres-best-practices`, `security-rls-performance.md`
  ("wrap functions in SELECT ... Called once, cached").
- **(a) trigger `BEFORE UPDATE`** — a policy `(c)` só garante que o `family_id` final é o
  *meu*; ela não impede que uma policy futura mais larga, ou uma RPC `SECURITY DEFINER`
  (que **bypassa RLS por definição**), troque `family_id` ou `user_id`. O trigger roda
  **dentro** da função `SECURITY DEFINER` também, então é a única das três opções que
  protege contra o vetor interno. É esta camada que responde ao pedido literal do
  briefing: *"qualquer migration futura que relaxe a policy de SELECT reabre o buraco"*.
  **Fonte:** `security-rls-performance.md` — `SECURITY DEFINER` "bypass RLS on any tables
  they touch"; logo RLS não é defesa contra elas, e o trigger é.

Por quê **não (b)**, privilégio por coluna:

- `REVOKE UPDATE ... ; GRANT UPDATE (display_name, monthly_income)` é tecnicamente
  correto em Postgres, mas em PostgREST **a coluna não concedida produz `42501` em vez de
  ser ignorada**. Isso significa que todo `PATCH` que mande um campo a mais — inclusive
  um `.update()` gerado a partir de um objeto de formulário com `id` ou `family_id`
  dentro — **quebra em runtime, para o usuário legítimo**, com um erro de permissão que
  não tem nada a ver com o que ele fez. Trocamos um risco teórico por um bug de produto
  garantido.
- Pior: `REVOKE UPDATE ON family_members FROM authenticated` revoga o privilégio de
  tabela inteiro. Se a lista de colunas concedidas esquecer uma coluna que o produto
  passe a editar depois, o sintoma é `42501` opaco, e a causa (um `GRANT` numa migration
  antiga) é das coisas mais difíceis de achar neste schema.
- As camadas (a)+(c) já cobrem o mesmo vetor **sem** essa superfície de regressão.
  (b) é registrado aqui como **rejeitado com justificativa**, não como esquecido.

**Colunas que o membro PODE alterar sobre si mesmo** (resposta explícita ao briefing):

| Coluna | Pode? | Observação |
|---|---|---|
| `display_name` | **SIM** | necessidade de produto hoje |
| `monthly_income` | **SIM** | necessidade de produto hoje; alimenta `split_rule='proportional'` |
| `avatar_url` | **SIM** | já existe na tabela (`00001`), é dado de perfil do próprio membro; permitir evita um segundo `ALTER` quando a UI de perfil chegar |
| `family_id` | **NÃO** | vetor do Achado 1 — travado pelo trigger |
| `user_id` | **NÃO** | vetor do Achado 1 — travado pelo trigger |
| `id` | **NÃO** | PK; travada pelo trigger |
| `joined_at` | **NÃO** | histórico; travada pelo trigger |

O trigger implementa isso pela via negativa: **congela `id`, `family_id`, `user_id` e
`joined_at`**, e deixa o resto livre. Escolhi lista-negra em vez de lista-branca aqui de
propósito: uma coluna nova de perfil adicionada no futuro deve nascer editável, e não
quebrar silenciosamente — enquanto as 4 colunas estruturais nunca devem virar editáveis.

### D2 — Achado 2: criar helpers sem parâmetro, migrar os chamadores, **revogar** o EXECUTE do par antigo e **manter as funções** existindo

Decisão: **4 passos numa transação só**, nesta ordem — (1) cria `get_user_family_id_self()`
e `get_user_member_id_self()`; (2) recria as 33 policies que usam a versão antiga e a RPC
`delete_transactions`; (3) `REVOKE EXECUTE` da versão com parâmetro para `authenticated`;
(4) **não** faz `DROP` da versão com parâmetro.

Por quê este caminho é o de menor risco:

- **Nunca há estado intermediário quebrado**, porque a migration inteira é uma transação
  (`npx supabase db push` roda cada arquivo em transação). Mas, mesmo que alguém rode os
  statements à mão fora de transação, a ordem acima é segura em cada ponto: as funções
  novas existem antes de qualquer policy referenciá-las, e a função antiga continua
  existindo e executável até depois de a última policy ter parado de usá-la.
- **`REVOKE` em vez de `DROP`.** `DROP FUNCTION get_user_family_id(uuid)` falharia ou
  exigiria `CASCADE` se qualquer objeto ainda depender dela — e `CASCADE` numa migration
  contra o banco do cliente é inaceitável. `REVOKE EXECUTE ... FROM authenticated` fecha
  o oráculo (que é o achado: *usuário logado* consegue consultar terceiro) sem risco de
  derrubar dependência. A função segue chamável pelo owner, o que preserva qualquer uso
  interno futuro.
- **Risco assumido e declarado:** se existir, no banco hospedado, alguma policy ou objeto
  criado fora destes 5 arquivos que chame `get_user_family_id(uuid)` como `authenticated`,
  o `REVOKE` vai quebrá-lo. A Tarefa 2 inclui uma **query de inventário contra o banco
  real** que precisa ser rodada e ter a saída colada **antes** de aplicar, exatamente para
  fechar essa incerteza. Não é opcional.
- As funções novas levam **`SET search_path = public`**, `STABLE`, `SECURITY DEFINER`,
  `REVOKE ... FROM PUBLIC, anon` e `GRANT TO authenticated`, idênticas ao padrão que
  `00001` já estabeleceu. **Fonte:** `security-rls-performance.md` (search_path fixo,
  revoke de quem não deve chamar) + consistência com `00001_initial_schema.sql:40-52`.

Ponto que o briefing não pediu mas eu registro como achado novo meu: a função antiga
`get_user_family_id(uid)` **não tem nenhuma checagem de `auth.uid()` no corpo** — ela faz
`SELECT family_id FROM family_members WHERE user_id = uid`, e só. A skill é explícita que
uma `SECURITY DEFINER` deve *"always include an explicit auth.uid() check inside the
function body"*. As versões `_self()` resolvem isso na raiz: o `uid` deixa de ser
parâmetro e passa a vir de `(SELECT auth.uid())` dentro do corpo, de modo que **não existe
mais a possibilidade sintática** de consultar terceiro.

### D3 — Achado 3: `gen_random_bytes()`, manter **6 caracteres**, e rejeição por módulo

Decisão: trocar `random()` por `gen_random_bytes()` (pgcrypto, já instalado por `00001`),
**manter o comprimento em 6** e o charset de 32, e **não** mexer no `CHECK` da coluna.

Por quê manter 6:

- O achado real é **`random()` não é CSPRNG** — é um PRNG previsível a partir do estado da
  sessão, e o código de convite é um segredo de autorização. Isso é corrigido inteiramente
  pela troca da fonte de entropia, **sem tocar no comprimento**.
- O espaço `32^6 ≈ 1,07 bilhão` com entropia real é **~30 bits**. Para um código que é
  (i) digitado à mão pelo parceiro, (ii) de vida curta no fluxo de convite, e (iii)
  protegido contra enumeração por rate limiting — que é a pendência de produto já
  registrada — 30 bits é adequado. O gargalo de enumeração **não é o comprimento, é a
  ausência de rate limiting**: sem rate limit, 12 caracteres também caem para quem tiver
  banda; com rate limit, 6 basta. Aumentar o comprimento aqui seria **tratar o sintoma do
  outro achado**, pagando custo de UX real.
- Custo de UX de 6 → 12 é concreto e assimétrico: o código é lido em voz alta ou digitado
  no celular por uma pessoa que já está no fluxo de onboarding, e é o único passo manual
  do produto. Dobrar o comprimento dobra a chance de erro de digitação no momento de maior
  abandono.
- **Consequência boa de manter 6:** o `CHECK (join_code ~ '^[A-Z2-9]{6}$')` de
  `00001` continua válido e **não precisamos de `ALTER TABLE` numa tabela já aplicada.**
  Zero risco de lock, zero risco de linha existente violar constraint nova.
  Isto é um ganho de risco, não só de conveniência.

Detalhe de implementação que importa (e que um `% 32` ingênuo erraria): o charset tem
**exatamente 32** caracteres, e 32 divide 256 — então `get_byte(...) % 32` é
**uniformemente distribuído** e não há viés de módulo. Isto é verdade por acidente
aritmético do tamanho do charset, então a migration **comenta esse fato explicitamente**,
para que quem mexer no charset depois saiba que mudar para um tamanho que não divida 256
reintroduz viés.

Registro do que **não** muda: `generate_join_code()` já tem `REVOKE EXECUTE ... FROM
PUBLIC, anon, authenticated` (`00003:23`) e já é chamada apenas de dentro de
`create_family`, com loop de até 50 tentativas contra colisão de `UNIQUE`. Essa parte está
correta e fica como está.

---

## Blast radius — tudo que toca as funções helper

Lista exaustiva, levantada do disco. **Cada item desta tabela precisa ser recriado pela
Tarefa 3**, ou o `REVOKE` da Tarefa 4 o quebra.

### Policies em `00002_rls_policies.sql` — 31 policies, 9 tabelas

Contagem conferida no disco:

```
$ grep -oP '^CREATE POLICY \w+ ON \K[\w.]+' 00002_rls_policies.sql | sort | uniq -c
      4 account_goals     4 accounts          4 categories
      4 category_budgets  2 families          2 family_members
      4 payment_methods   3 push_subscriptions  4 transactions
```

| Tabela | Policies que chamam helper | Helper usado |
|---|---|---|
| `families` | `families_select`, `families_update` | `get_user_family_id` |
| `family_members` | `family_members_select` | `get_user_family_id` |
| `family_members` | `family_members_update_self` | *(nenhum hoje — passa a usar `_self` por D1)* |
| `accounts` | `accounts_select/insert/update/delete` | `get_user_family_id` |
| `categories` | `categories_select/insert/update/delete` | `get_user_family_id` |
| `payment_methods` | `payment_methods_select/insert/update/delete` | `get_user_family_id` |
| `transactions` | `transactions_select/update/delete` | `get_user_family_id` |
| `transactions` | `transactions_insert` | **ambos** (`family_id` + `created_by_member_id`) |
| `push_subscriptions` | `push_select_own`, `push_delete_own` | `get_user_member_id` |
| `push_subscriptions` | `push_insert_own` | **ambos** |
| `account_goals` | `account_goals_select/insert/update/delete` | `get_user_family_id` |
| `category_budgets` | `category_budgets_select/insert/update/delete` | `get_user_family_id` |

### Policies em `00005_realtime.sql` — 2 policies, fora do arquivo de RLS

| Objeto | Policy | Linha | Por que é fácil esquecer |
|---|---|---|---|
| `realtime.messages` | `realtime_family_topics_read` | `00005:52-58` | não está em `00002`; é de outra migration e de outro schema |
| `realtime.messages` | `realtime_family_topics_write` | `00005:60-66` | idem |

Nota operacional herdada de `00005`: no Supabase hospedado `realtime.messages` **pertence
à plataforma**. `ALTER TABLE` nela falha com `42501`, mas `CREATE POLICY` e `DROP POLICY`
funcionam — foi por isso que `00005` isolou o `ALTER` num `DO $$` condicional e deixou as
policies fora dele. **A Tarefa 3 repete esse mesmo padrão** (usa `DROP POLICY IF EXISTS` +
`CREATE POLICY`, sem nenhum `ALTER TABLE`), senão a migration 00006 falha no hospedado.

### RPCs

| Função | Chama helper? | Ação |
|---|---|---|
| `delete_transactions(uuid, text)` | **SIM** — `00003:370` | recriar usando `_self()` |
| `create_family` | não (`auth.uid()` direto) | nenhuma |
| `join_family` | não | nenhuma |
| `family_preview` | não | nenhuma |
| `save_transactions` | não | nenhuma |
| `pay_invoice` | não | nenhuma |
| `settle_up` | não | nenhuma |
| `seed_family_defaults` | não | nenhuma |
| `generate_join_code` | não | recriar por D3 (motivo diferente) |

### Views — **nenhuma ação**

`v_account_balances`, `v_invoices`, `v_settlement`, `v_monthly_summary`: todas
`WITH (security_invoker = true)`, nenhuma chama helper, herdam RLS das tabelas-base.
`00004:223` concede só `SELECT` a `authenticated`. **Não recriar** — recriar view sem
necessidade é risco gratuito de perder o `security_invoker` num `CREATE OR REPLACE`
malfeito.

---

## Review Focus — o que a correção pode quebrar e nenhum teste hoje cobre

1. **Caminho feliz do próprio perfil.** Depois do trigger, um membro ainda consegue
   `UPDATE family_members SET display_name = 'X'` em si mesmo? Se o trigger estiver com a
   comparação invertida, o produto para de funcionar e o teste de ataque continua verde.
   → coberto na Tarefa 6, caso `T1-OK`.
2. **`family_id` igual ao próprio.** PostgREST manda frequentemente o objeto inteiro de
   volta num `.update()`. Um `UPDATE` que inclui `family_id = <o meu próprio>` **tem que
   passar** — o trigger compara valor, não presença da coluna. → Tarefa 6, `T1-NOOP`.
3. **`realtime.messages` esquecida.** Se a Tarefa 3 recriar as 31 policies de `00002` e
   esquecer as 2 de `00005`, o `REVOKE` da Tarefa 4 derruba o tempo real **silenciosamente**
   — o canal simplesmente para de entregar, sem erro no `tsc` e sem erro no teste de RLS.
   → Tarefa 5 tem uma query que falha a migration se sobrar qualquer referência.
4. **`delete_transactions` esquecida.** Mesma classe: a RPC passa a levantar
   `permission denied for function get_user_family_id` só quando um usuário apagar um
   lançamento. → Tarefa 6, caso `T2-RPC`.
5. **`join_code` fora do `CHECK`.** Se o novo gerador produzir caractere fora de
   `[A-Z2-9]` ou comprimento ≠ 6, `create_family` passa a falhar com violação de CHECK no
   `INSERT` — e só para quem criar família nova. → Tarefa 6, `T3-FORMATO`, com 200
   amostras.

---

## Arquivo a criar

**Único arquivo de produção:**
`app/supabase/migrations/00006_hardening_seguranca.sql`

**Arquivos de teste a modificar:**
- `app/tests/integration/tenant-escape.mjs` — acrescentar casos do Achado 1 e 2
- `app/tests/integration/rls-isolation.mjs` — acrescentar caso de regressão da RPC

**Nenhum outro arquivo.** Em particular: **não** gerar tipos novos — esta migration não
altera nenhuma coluna, nenhuma tabela e nenhuma assinatura de RPC pública, então
`src/types/database.ts` (se existir) não muda. Ver "Portão de saída" para como provar isso
em vez de assumir.

---

## Tarefa 1 — Pré-voo: confirmar o estado real do banco antes de escrever SQL

Esta tarefa não escreve nada. Ela existe porque o plano assume coisas sobre o banco
hospedado que foram lidas **do disco**, e disco não é banco.

- [ ] **Passo 1: carregar credenciais**

```bash
cd "C:/Users/Heitor PC/OneDrive/Documentos/SEGUNDO CÉREBRO/HORI ANALYTCIS PROJETOS/Finanças a Dois/app"
set -a && . ./.env.local && set +a
DB_URL="postgresql://postgres.wxhfgstgjjlmqauogeid:$SUPABASE_DB_PASSWORD@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```

- [ ] **Passo 2: confirmar que 00001..00005 estão aplicadas e 00006 não**

```bash
npx supabase migration list --db-url "$DB_URL"
```

Esperado: `00001`..`00005` com marca em Remote. Se `00006` já aparecer, **PARE** — alguém
já aplicou algo; reporte ao Maestro em vez de seguir.

- [ ] **Passo 3: inventário real de quem referencia os helpers** — fecha o risco de D2

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
-- Policies que mencionam os helpers, em QUALQUER schema (pega realtime.messages)
SELECT schemaname, tablename, policyname,
       pg_get_expr(pol.polqual,      pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
FROM pg_policies p
JOIN pg_policy  pol ON pol.polname = p.policyname
JOIN pg_class   c   ON c.oid = pol.polrelid AND c.relname = p.tablename
WHERE pg_get_expr(pol.polqual, pol.polrelid)      LIKE '%get_user_%'
   OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%get_user_%'
ORDER BY schemaname, tablename, policyname;

-- Funções cujo corpo menciona os helpers
SELECT n.nspname, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc LIKE '%get_user_family_id%' OR p.prosrc LIKE '%get_user_member_id%'
ORDER BY 1,2;

-- Views cujo texto menciona os helpers (esperado: ZERO linhas)
SELECT schemaname, viewname FROM pg_views
WHERE definition LIKE '%get_user_%' ORDER BY 1,2;
SQL
```

**Critério de aceite:** a saída tem de bater com a seção "Blast radius" — 33 policies
(31 em `public` + 2 em `realtime`), `delete_transactions` entre as funções, e **zero
views**. Cole a saída no relatório.

**Se aparecer qualquer policy, função ou view fora da lista:** **PARE**. Acrescente ao
plano antes de executar. Um objeto fora da lista é exatamente o que o `REVOKE` da Tarefa 4
vai quebrar em produção.

- [ ] **Passo 4: baseline dos testes — tem de estar verde ANTES de mexer**

```bash
ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  node tests/integration/rls-isolation.mjs
```

Esperado: `20/20 verificacoes passaram`, exit 0. Se já estiver vermelho, o problema é
anterior a esta migration — reporte.

---

## Tarefa 2 — Escrever o bloco 1 da migration: helpers sem parâmetro

**Arquivo:** criar `app/supabase/migrations/00006_hardening_seguranca.sql`

**Interfaces produzidas** (as Tarefas 3 e 4 dependem destes nomes exatos):
- `public.get_user_family_id_self() RETURNS uuid`
- `public.get_user_member_id_self() RETURNS uuid`

- [ ] **Passo 1: escrever o cabeçalho e o bloco 1**

```sql
-- =============================================================================
-- 00006 — Endurecimento de segurança
--
-- Corrige três achados aceitos pela revisão de segurança:
--
--   1. [ALTO]  family_members permitia, em teoria, que um membro trocasse o
--              próprio family_id (mass assignment / fuga de tenant). O bloqueio
--              que existe hoje é consequência acidental da policy de SELECT,
--              não de uma regra explícita de UPDATE.
--   2. [MÉDIO] get_user_family_id(uid) recebia o usuário como PARÂMETRO e era
--              executável por qualquer usuário logado: dava para descobrir a
--              qual família um terceiro pertence. Vazava relação social.
--   3. [MÉDIO] generate_join_code() usava random(), que não é criptográfico:
--              o código de convite é um segredo de autorização e precisa de
--              fonte de entropia imprevisível.
--
-- Esta migration NÃO altera nenhuma tabela, nenhuma coluna e nenhuma assinatura
-- de RPC pública. Ela só troca funções e recria policies. Por isso não há
-- ALTER TABLE aqui, e os tipos gerados do banco não mudam.
--
-- As migrations 00001..00005 já foram aplicadas e são imutáveis. Nada aqui as
-- edita: toda correção é statement novo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BLOCO 1 — Helpers de identidade SEM parâmetro
--
-- O problema da versão antiga não era o que ela retornava, era quem ela aceitava
-- como pergunta: recebendo 'uid' de fora, ela respondia sobre QUALQUER pessoa.
-- Nas versões abaixo o usuário não é mais parâmetro — vem de auth.uid(), de
-- dentro do corpo. Deixa de existir a possibilidade de perguntar sobre terceiro.
--
-- Mantidas as mesmas garantias da versão antiga:
--   STABLE          — o resultado não muda dentro da mesma query (permite cache)
--   SECURITY DEFINER— consulta family_members sem disparar o RLS de
--                     family_members, que é o que evitaria recursão infinita
--                     (a policy de family_members chama esta função)
--   SET search_path = public
--                   — impede que um search_path manipulado pelo chamador faça a
--                     função ler uma tabela "family_members" falsa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_family_id_self()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id
  FROM family_members
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_family_id_self() IS
  'Família do usuário logado. Sem parâmetro de propósito: a versão antiga, que '
  'recebia o uid de fora, permitia descobrir a família de terceiros.';

REVOKE EXECUTE ON FUNCTION public.get_user_family_id_self() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_family_id_self() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_member_id_self()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM family_members
  WHERE user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_member_id_self() IS
  'Membro do usuário logado. Sem parâmetro, pelo mesmo motivo acima.';

REVOKE EXECUTE ON FUNCTION public.get_user_member_id_self() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_member_id_self() TO authenticated;
```

- [ ] **Passo 2: não aplicar ainda.** A migration só vai ao banco na Tarefa 5, inteira.
      Aplicar bloco a bloco é o que criaria o estado intermediário quebrado.

---

## Tarefa 3 — Bloco 2: trigger que congela as colunas estruturais (Achado 1, camada a)

**Arquivo:** acrescentar a `00006_hardening_seguranca.sql`

- [ ] **Passo 1: escrever o bloco 2**

```sql
-- -----------------------------------------------------------------------------
-- BLOCO 2 — Trigger que congela as colunas estruturais de family_members
--
-- Por que um trigger, e não só a policy do bloco 3:
--
-- A policy de RLS protege o que vem pela API (PostgREST). Ela NÃO protege o que
-- vem de dentro de uma função SECURITY DEFINER — essas funções, por definição,
-- ignoram o RLS das tabelas que tocam. Como todas as RPCs de gravação deste
-- projeto são SECURITY DEFINER, a policy sozinha deixaria o vetor aberto por
-- dentro.
--
-- O trigger roda nos DOIS caminhos. É a camada que não depende de nenhuma
-- policy continuar escrita do jeito certo no futuro — que é exatamente a
-- fragilidade apontada pela revisão: hoje o ataque é barrado de raspão, pela
-- policy de SELECT combinada com o RETURNING do PostgREST, e não por uma regra
-- que diga "isto é proibido".
--
-- Estratégia de lista-NEGRA, de propósito: congelamos as 4 colunas estruturais
-- e deixamos as demais livres. Assim uma coluna de perfil criada no futuro
-- (telefone, preferência, fuso) nasce editável, e não quebra em silêncio; e as
-- 4 colunas abaixo nunca passam a ser editáveis por descuido.
--
-- Colunas que o membro PODE alterar sobre si mesmo: display_name,
-- monthly_income, avatar_url.
-- Colunas congeladas: id, family_id, user_id, joined_at.
--
-- A comparação é por VALOR, não por presença: um UPDATE que reenvia
-- family_id com o MESMO valor passa normalmente. Isso é necessário porque o
-- cliente costuma devolver o objeto inteiro num PATCH.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.family_members_congela_estrutura()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.family_id IS DISTINCT FROM OLD.family_id THEN
    RAISE EXCEPTION 'Não é permitido mudar a família de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não é permitido mudar o usuário de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Não é permitido mudar o identificador de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'Não é permitido mudar a data de entrada de um membro'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.family_members_congela_estrutura() IS
  'Impede troca de id, family_id, user_id e joined_at em family_members. '
  'Vale também para funções SECURITY DEFINER, que ignoram RLS.';

-- Esta função é gatilho: ninguém a chama diretamente.
REVOKE EXECUTE ON FUNCTION public.family_members_congela_estrutura()
  FROM PUBLIC, anon, authenticated;

-- DROP antes de CREATE deixa a migration repetível sem erro.
DROP TRIGGER IF EXISTS trg_family_members_congela_estrutura ON family_members;

CREATE TRIGGER trg_family_members_congela_estrutura
  BEFORE UPDATE ON family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.family_members_congela_estrutura();
```

Nota de decisão sobre `ERRCODE`: usar `check_violation` (`23514`) em vez do
`raise_exception` default (`P0001`) faz o erro chegar ao cliente como violação de
restrição de dados, que é o que ele é, em vez de erro genérico de aplicação. O teste da
Tarefa 6 aceita qualquer erro, então isto é escolha de qualidade de mensagem, não de
aprovação do teste.

---

## Tarefa 4 — Bloco 3: recriar as 33 policies e a RPC (Achado 2 + Achado 1 camada c)

**Arquivo:** acrescentar a `00006_hardening_seguranca.sql`

**Interfaces consumidas:** `get_user_family_id_self()`, `get_user_member_id_self()` da
Tarefa 2.

- [ ] **Passo 1: policies de `public` — as 31**

Padrão para todas: `DROP POLICY IF EXISTS` + `CREATE POLICY`, com
`(SELECT public.get_user_*_self())`. O `(SELECT ...)` é obrigatório: avalia a função uma
vez por query em vez de uma vez por linha.

```sql
-- -----------------------------------------------------------------------------
-- BLOCO 3 — Recriação das policies para usar os helpers sem parâmetro
--
-- Ordem importa: os helpers do bloco 1 JÁ existem neste ponto, e a versão antiga
-- (com parâmetro) só perde o EXECUTE no bloco 4, depois que ninguém mais a usa.
-- Em nenhum instante uma policy aponta para função inexistente.
--
-- O (SELECT ...) em volta da função não é enfeite: sem ele o Postgres chama a
-- função uma vez POR LINHA avaliada. Com ele, uma vez por query.
-- -----------------------------------------------------------------------------

-- families ---------------------------------------------------------------------
DROP POLICY IF EXISTS families_select ON families;
CREATE POLICY families_select ON families
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS families_update ON families;
CREATE POLICY families_update ON families
  FOR UPDATE TO authenticated
  USING      (id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (id = (SELECT public.get_user_family_id_self()));

-- family_members ---------------------------------------------------------------
DROP POLICY IF EXISTS family_members_select ON family_members;
CREATE POLICY family_members_select ON family_members
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- Aqui está a camada (c) do Achado 1. A policy antiga verificava SÓ
-- user_id = auth.uid(), e não dizia nada sobre family_id: a linha resultante
-- podia, em teoria, apontar para outra família. Agora o WITH CHECK exige que a
-- linha, DEPOIS do update, continue sendo deste usuário E desta família.
DROP POLICY IF EXISTS family_members_update_self ON family_members;
CREATE POLICY family_members_update_self ON family_members
  FOR UPDATE TO authenticated
  USING (
    user_id   = (SELECT auth.uid())
    AND family_id = (SELECT public.get_user_family_id_self())
  )
  WITH CHECK (
    user_id   = (SELECT auth.uid())
    AND family_id = (SELECT public.get_user_family_id_self())
  );

-- accounts ---------------------------------------------------------------------
DROP POLICY IF EXISTS accounts_select ON accounts;
CREATE POLICY accounts_select ON accounts
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS accounts_insert ON accounts;
CREATE POLICY accounts_insert ON accounts
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS accounts_update ON accounts;
CREATE POLICY accounts_update ON accounts
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS accounts_delete ON accounts;
CREATE POLICY accounts_delete ON accounts
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- categories -------------------------------------------------------------------
DROP POLICY IF EXISTS categories_select ON categories;
CREATE POLICY categories_select ON categories
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS categories_insert ON categories;
CREATE POLICY categories_insert ON categories
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS categories_update ON categories;
CREATE POLICY categories_update ON categories
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS categories_delete ON categories;
CREATE POLICY categories_delete ON categories
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- payment_methods --------------------------------------------------------------
DROP POLICY IF EXISTS payment_methods_select ON payment_methods;
CREATE POLICY payment_methods_select ON payment_methods
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS payment_methods_insert ON payment_methods;
CREATE POLICY payment_methods_insert ON payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS payment_methods_update ON payment_methods;
CREATE POLICY payment_methods_update ON payment_methods
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS payment_methods_delete ON payment_methods;
CREATE POLICY payment_methods_delete ON payment_methods
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- transactions -----------------------------------------------------------------
DROP POLICY IF EXISTS transactions_select ON transactions;
CREATE POLICY transactions_select ON transactions
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- O autor vem de quem está logado: ninguém lança assinando o nome do outro.
DROP POLICY IF EXISTS transactions_insert ON transactions;
CREATE POLICY transactions_insert ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    family_id = (SELECT public.get_user_family_id_self())
    AND created_by_member_id = (SELECT public.get_user_member_id_self())
  );

DROP POLICY IF EXISTS transactions_update ON transactions;
CREATE POLICY transactions_update ON transactions
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS transactions_delete ON transactions;
CREATE POLICY transactions_delete ON transactions
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- push_subscriptions -----------------------------------------------------------
-- O token do aparelho é privado de cada pessoa: nem o parceiro lê.
DROP POLICY IF EXISTS push_select_own ON push_subscriptions;
CREATE POLICY push_select_own ON push_subscriptions
  FOR SELECT TO authenticated
  USING (member_id = (SELECT public.get_user_member_id_self()));

DROP POLICY IF EXISTS push_insert_own ON push_subscriptions;
CREATE POLICY push_insert_own ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = (SELECT public.get_user_member_id_self())
    AND family_id = (SELECT public.get_user_family_id_self())
  );

DROP POLICY IF EXISTS push_delete_own ON push_subscriptions;
CREATE POLICY push_delete_own ON push_subscriptions
  FOR DELETE TO authenticated
  USING (member_id = (SELECT public.get_user_member_id_self()));

-- account_goals ----------------------------------------------------------------
DROP POLICY IF EXISTS account_goals_select ON account_goals;
CREATE POLICY account_goals_select ON account_goals
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS account_goals_insert ON account_goals;
CREATE POLICY account_goals_insert ON account_goals
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS account_goals_update ON account_goals;
CREATE POLICY account_goals_update ON account_goals
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS account_goals_delete ON account_goals;
CREATE POLICY account_goals_delete ON account_goals
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

-- category_budgets -------------------------------------------------------------
DROP POLICY IF EXISTS category_budgets_select ON category_budgets;
CREATE POLICY category_budgets_select ON category_budgets
  FOR SELECT TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS category_budgets_insert ON category_budgets;
CREATE POLICY category_budgets_insert ON category_budgets
  FOR INSERT TO authenticated
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS category_budgets_update ON category_budgets;
CREATE POLICY category_budgets_update ON category_budgets
  FOR UPDATE TO authenticated
  USING      (family_id = (SELECT public.get_user_family_id_self()))
  WITH CHECK (family_id = (SELECT public.get_user_family_id_self()));

DROP POLICY IF EXISTS category_budgets_delete ON category_budgets;
CREATE POLICY category_budgets_delete ON category_budgets
  FOR DELETE TO authenticated
  USING (family_id = (SELECT public.get_user_family_id_self()));
```

- [ ] **Passo 2: as 2 policies de `realtime.messages` — as que se esquece**

```sql
-- -----------------------------------------------------------------------------
-- realtime.messages — canais de presença e broadcast
--
-- Estas duas policies NÃO estão em 00002: vieram de 00005, em outro schema.
-- Esquecê-las aqui faria o tempo real parar de funcionar em silêncio depois do
-- REVOKE do bloco 4 — sem erro de build e sem erro no teste de RLS.
--
-- No Supabase hospedado a tabela realtime.messages pertence à plataforma:
-- ALTER TABLE nela falha com 42501, mas CREATE/DROP POLICY funcionam. Por isso
-- aqui NÃO existe nenhum ALTER TABLE — só policy. (Mesmo padrão de 00005.)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS realtime_family_topics_read  ON realtime.messages;
CREATE POLICY realtime_family_topics_read ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    split_part(realtime.topic(), ':', 2) =
      (SELECT public.get_user_family_id_self())::text
  );

DROP POLICY IF EXISTS realtime_family_topics_write ON realtime.messages;
CREATE POLICY realtime_family_topics_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    split_part(realtime.topic(), ':', 2) =
      (SELECT public.get_user_family_id_self())::text
  );
```

- [ ] **Passo 3: recriar `delete_transactions`, a única RPC que chama helper**

O corpo é idêntico ao de `00003`, trocando apenas a primeira linha do `DECLARE`.
A assinatura `(uuid, text)` **não muda** — por isso o `CREATE OR REPLACE` é seguro e os
tipos gerados não mudam. Copie o corpo de `00003_functions.sql:363-410` **integralmente**,
trocando:

```sql
-- ANTES (00003:370):
  v_family_id uuid := get_user_family_id(auth.uid());
-- DEPOIS:
  v_family_id uuid := public.get_user_family_id_self();
```

e mantendo, no fim, os mesmos grants que `00003` já tinha:

```sql
REVOKE EXECUTE ON FUNCTION delete_transactions(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION delete_transactions(uuid, text) TO authenticated;
```

Aviso ao executor: **leia o corpo real no arquivo `00003` e copie-o.** Não reescreva de
memória — a função tem lógica de série (`recurrence_parent_id`) que não pode mudar nesta
migration.

---

## Tarefa 5 — Bloco 4: revogar o oráculo, e Bloco 5: join_code com CSPRNG

- [ ] **Passo 1: bloco 4 — fechar o oráculo**

```sql
-- -----------------------------------------------------------------------------
-- BLOCO 4 — Fechar o oráculo de pertencimento
--
-- Neste ponto NADA mais usa a versão com parâmetro: as 33 policies e a RPC
-- delete_transactions já foram recriadas acima, na mesma transação.
--
-- Revogamos o EXECUTE em vez de dar DROP de propósito:
--   - DROP exigiria CASCADE se qualquer objeto ainda dependesse da função, e
--     CASCADE contra o banco do cliente é inaceitável;
--   - REVOKE já resolve o achado, que é "usuário LOGADO consegue perguntar
--     sobre terceiro". Sem EXECUTE, não consegue mais.
-- A função continua existindo e chamável pelo owner.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_user_family_id(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_member_id(uuid) FROM authenticated;

COMMENT ON FUNCTION public.get_user_family_id(uuid) IS
  'OBSOLETA — não chame. Recebia o usuário como parâmetro e permitia descobrir '
  'a família de terceiros. Use get_user_family_id_self(). Mantida sem EXECUTE '
  'para authenticated apenas para não exigir DROP CASCADE.';

COMMENT ON FUNCTION public.get_user_member_id(uuid) IS
  'OBSOLETA — não chame. Use get_user_member_id_self().';
```

- [ ] **Passo 2: bloco 5 — `generate_join_code` com `gen_random_bytes`**

```sql
-- -----------------------------------------------------------------------------
-- BLOCO 5 — Código de convite com fonte de entropia criptográfica
--
-- random() é um gerador pseudoaleatório: a sequência é determinada pelo estado
-- da sessão e é previsível para quem conhece esse estado. O código de convite
-- não é enfeite — é o segredo que autoriza alguém a entrar na família e ver a
-- vida financeira do casal. Segredo precisa de fonte imprevisível.
--
-- gen_random_bytes() vem do pgcrypto (já instalado em 00001) e usa o gerador
-- criptográfico do sistema.
--
-- Mantivemos 6 caracteres de propósito:
--   - o achado é a FONTE de entropia, não o comprimento; 6 caracteres sobre um
--     charset de 32 com entropia real dão ~30 bits, adequado para um código de
--     convite de vida curta;
--   - o código é digitado à mão pelo parceiro no onboarding, o passo manual
--     mais sensível do produto: 12 caracteres dobrariam o erro de digitação;
--   - a defesa contra ENUMERAÇÃO é rate limiting em family_preview/join_family,
--     não comprimento. Sem rate limit, 12 também cai; com rate limit, 6 basta.
--     O rate limiting está registrado como pendência de produto, à parte.
--   - como o comprimento não muda, o CHECK (join_code ~ '^[A-Z2-9]{6}$') de
--     00001 continua válido e NÃO precisamos de ALTER TABLE numa tabela que já
--     tem dados do cliente.
--
-- Sobre o viés de módulo: o charset tem EXATAMENTE 32 caracteres, e 32 divide
-- 256 sem resto. Por isso (get_byte(...) % 32) é uniforme e não há viés.
-- ATENÇÃO a quem mexer nisto depois: mudar o charset para um tamanho que NÃO
-- divida 256 (por exemplo 30 ou 36) reintroduz viés e exige rejeição por
-- amostragem. Mantenha 32, ou troque o algoritmo junto.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 chars, sem 0/O/1/I
  bytes   bytea;
  code    text := '';
  i       int;
BEGIN
  -- Um byte por caractere, de uma vez: uma chamada ao gerador, não seis.
  bytes := gen_random_bytes(6);

  FOR i IN 0..5 LOOP
    code := code || substr(charset, (get_byte(bytes, i) % 32) + 1, 1);
  END LOOP;

  RETURN code;
END;
$$;

COMMENT ON FUNCTION public.generate_join_code() IS
  'Gera código de convite de 6 caracteres usando gen_random_bytes (pgcrypto). '
  'Charset de 32 sem caracteres ambíguos. Chamada apenas por create_family.';

-- Mesmo grant de 00003: ninguém chama de fora, só create_family chama.
REVOKE EXECUTE ON FUNCTION public.generate_join_code() FROM PUBLIC, anon, authenticated;
```

- [ ] **Passo 3: bloco 6 — auto-verificação que FALHA a migration se sobrou referência**

Este bloco é o que impede o erro nº 3 e nº 4 do Review Focus de passar silenciosamente.

```sql
-- -----------------------------------------------------------------------------
-- BLOCO 6 — Rede de proteção: a migration se recusa a terminar se sobrou
-- qualquer policy ou função ainda apontando para os helpers com parâmetro.
--
-- Sem isto, esquecer uma policy (as de realtime.messages são as mais fáceis de
-- esquecer, porque vieram de outra migration e de outro schema) produziria uma
-- quebra silenciosa em produção: o canal de tempo real simplesmente pararia de
-- entregar, sem erro de build e sem teste vermelho.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_policies text;
  v_funcs    text;
BEGIN
  SELECT string_agg(format('%s.%s/%s', n.nspname, c.relname, pol.polname), ', ')
    INTO v_policies
  FROM pg_policy pol
  JOIN pg_class     c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE COALESCE(pg_get_expr(pol.polqual,      pol.polrelid), '') ~ 'get_user_(family|member)_id\('
     OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ 'get_user_(family|member)_id\(';

  IF v_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Policies ainda usam o helper com parâmetro: %', v_policies;
  END IF;

  SELECT string_agg(format('%s.%s', n.nspname, p.proname), ', ')
    INTO v_funcs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname NOT IN ('get_user_family_id', 'get_user_member_id')
    AND p.prosrc ~ 'get_user_(family|member)_id\s*\(\s*[^)]';

  IF v_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'Funções ainda chamam o helper com parâmetro: %', v_funcs;
  END IF;
END $$;
```

**Os dois regex deste bloco foram executados contra casos reais na fase de plano** — eles
decidem se a migration aborta, então não entram por leitura. Saída:

```
regex de FUNÇÕES: get_user_(family|member)_id\s*\(\s*[^)]
  CASOU  chamada com arg (DEVE casar):            v := get_user_family_id(auth.uid());
  nao    chamada _self (NAO deve casar):          v := public.get_user_family_id_self();
  nao    chamada _self com espaco (NAO deve):     v := get_user_member_id_self( );
  CASOU  definicao antiga param (DEVE casar):     CREATE FUNCTION get_user_family_id(uid uuid)
  nao    SELECT wrap self (NAO deve casar):       (SELECT public.get_user_family_id_self())

regex de POLICIES: get_user_(family|member)_id\(
  CASOU  policy antiga (DEVE casar):              (family_id = ( SELECT get_user_family_id(auth.uid())))
  nao    policy nova _self (NAO deve casar):      (family_id = ( SELECT get_user_family_id_self()))
  nao    qualificada nova (NAO deve casar):       ( SELECT public.get_user_member_id_self())
```

Ou seja: `_self()` nunca casa (parênteses vazios), chamada com argumento sempre casa, e a
definição das próprias funções obsoletas fica de fora pelo `NOT IN` do `WHERE`.

- [ ] **Passo 4: aplicar a migration — inteira, numa transação**

```bash
cd "C:/Users/Heitor PC/OneDrive/Documentos/SEGUNDO CÉREBRO/HORI ANALYTCIS PROJETOS/Finanças a Dois/app"
set -a && . ./.env.local && set +a
npx supabase db push --db-url "postgresql://postgres.wxhfgstgjjlmqauogeid:$SUPABASE_DB_PASSWORD@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```

Cole a saída. Esperado: `00006_hardening_seguranca.sql` aplicada, sem erro.

---

## Tarefa 6 — Provar cada correção: casos a ACRESCENTAR aos testes

Esta é a tarefa que transforma "escrevi a defesa" em "a defesa está provada". Ordem TDD:
**rode os casos novos ANTES de aplicar a migration** e registre que eles falham (ou, no
caso do Achado 1, que passam pelo motivo errado); depois aplique; depois rode de novo.

### 6a — `tenant-escape.mjs`: 4 casos novos

**Arquivo:** modificar `app/tests/integration/tenant-escape.mjs`

O arquivo hoje já testa os dois ataques de mass assignment (troca de `family_id`, troca de
`user_id`) e eles **já passam**, mas por motivo acidental. Os casos novos provam que
agora o bloqueio é **explícito**, e provam que o caminho legítimo não quebrou.

- [ ] **Caso `T1-ERRCODE` — o bloqueio agora é do trigger, não de raspão**

Discriminar a causa é o ponto do Achado 1. Antes da migration, o erro vem do RLS
(`42501`). Depois, vem do trigger (`23514` / mensagem em português).

```js
console.log('\n--- T1-ERRCODE: o bloqueio vem do trigger, com mensagem clara ---')
const { error: tErr } = await A.cli
  .from('family_members')
  .update({ family_id: B.familyId })
  .eq('id', A.memberId)
  .select('id')

// Antes de 00006: 42501 (RLS, bloqueio acidental).
// Depois de 00006: 23514 com 'Não é permitido mudar a família de um membro'.
const bloqueioExplicito =
  tErr && (tErr.code === '23514' || /mudar a família/i.test(tErr.message ?? ''))
check('T1-ERRCODE bloqueio explícito do trigger',
      bloqueioExplicito, tErr ? `${tErr.code}: ${tErr.message}` : 'NAO BLOQUEOU')
```

- [ ] **Caso `T1-OK` — o caminho legítimo continua funcionando** (Review Focus 1)

```js
console.log('\n--- T1-OK: o membro ainda edita o proprio display_name ---')
const { data: okUpd, error: okErr } = await A.cli
  .from('family_members')
  .update({ display_name: 'Alice Editada', monthly_income: 6100 })
  .eq('id', A.memberId)
  .select('display_name,monthly_income')
check('T1-OK edita proprio perfil',
      !okErr && okUpd?.[0]?.display_name === 'Alice Editada',
      okErr ? `${okErr.code}: ${okErr.message}` : JSON.stringify(okUpd))
```

- [ ] **Caso `T1-NOOP` — reenviar o próprio `family_id` não quebra** (Review Focus 2)

Este é o caso que uma implementação de trigger por *presença de coluna* quebraria, e que
a opção (b), privilégio por coluna, quebraria com `42501`.

```js
console.log('\n--- T1-NOOP: PATCH que reenvia o MESMO family_id deve passar ---')
const { error: noopErr } = await A.cli
  .from('family_members')
  .update({ family_id: A.familyId, display_name: 'Alice' })
  .eq('id', A.memberId)
  .select('id')
check('T1-NOOP family_id igual ao proprio passa',
      !noopErr, noopErr ? `${noopErr.code}: ${noopErr.message}` : 'ok')
```

- [ ] **Caso `T2-ORACULO` — o oráculo de pertencimento está fechado** (Achado 2)

Antes da migration este `rpc` responde com o `family_id` de B. Depois, tem de falhar com
permissão negada.

```js
console.log('\n--- T2-ORACULO: A nao descobre a familia de B pela funcao helper ---')
const { data: orc, error: orcErr } = await A.cli
  .rpc('get_user_family_id', { uid: B.uid })
const oraculoFechado =
  !!orcErr || orc === null || (orc !== B.familyId)
check('T2-ORACULO get_user_family_id(uid de terceiro) negada',
      oraculoFechado,
      orcErr ? `${orcErr.code}: ${orcErr.message}` : `retornou ${JSON.stringify(orc)}`)

// E a versao _self() continua respondendo sobre MIM, corretamente.
const { data: selfFam, error: selfErr } = await A.cli.rpc('get_user_family_id_self')
check('T2-SELF get_user_family_id_self responde a propria familia',
      !selfErr && selfFam === A.familyId,
      selfErr ? `${selfErr.code}: ${selfErr.message}` : `${selfFam}`)
```

Nota ao executor: `tenant-escape.mjs` hoje usa `console.log` solto, sem a função
`check()`. **Acrescente ao arquivo a mesma função `check()` de `rls-isolation.mjs`**
(que já incrementa `checks` e `failures`), para que os casos novos contem no total e o
exit code reflita a falha. Sem isso um caso novo pode falhar e o processo sair 0.

### 6b — `rls-isolation.mjs`: 2 casos novos

**Arquivo:** modificar `app/tests/integration/rls-isolation.mjs`

- [ ] **Caso `T2-RPC` — `delete_transactions` não quebrou com o REVOKE** (Review Focus 4)

Sem este caso, a RPC quebraria só quando um usuário real apagasse um lançamento.

```js
console.log('\n--- T2-RPC: delete_transactions continua funcionando pos-REVOKE ---')
{
  const { data: accA } = await A.cli.from('accounts').select('id').limit(1)
  const { data: catA } = await A.cli.from('categories').select('id').limit(1)
  const { data: ins, error: insErr } = await A.cli.from('transactions').insert({
    family_id: A.familyId, account_id: accA[0].id, category_id: catA[0].id,
    created_by_member_id: A.memberId, paid_by_member_id: A.memberId,
    type: 'despesa', description: 'Para apagar', amount: 12.34,
    date: '2026-10-07',
  }).select('id')
  check('T2-RPC insert de apoio', !insErr && ins?.length === 1,
        insErr ? `${insErr.code}: ${insErr.message}` : 'ok')

  const { data: del, error: delErr } = await A.cli
    .rpc('delete_transactions', { p_id: ins[0].id, p_scope: 'single' })
  check('T2-RPC delete_transactions apaga 1 linha',
        !delErr && del === 1,
        delErr ? `${delErr.code}: ${delErr.message}` : `retornou ${del}`)
}
```

- [ ] **Caso `T3-FORMATO` — o novo gerador respeita o CHECK** (Review Focus 5)

O gerador não é chamável de fora (`REVOKE` para `authenticated`), então o teste prova
pelo efeito: criar famílias de verdade e conferir o formato do código emitido. 200
amostras com usuário real seria lento; 12 é suficiente para pegar caractere fora do
charset ou comprimento errado, porque um bug nesse código é sistemático, não raro.

```js
console.log('\n--- T3-FORMATO: join_code gerado respeita ^[A-Z2-9]{6}$ ---')
{
  const codes = new Set()
  let formatoOk = true
  for (let i = 0; i < 12; i++) {
    const email = `codetest-${i}-${stamp}@example.com`
    const { data: u, error: uErr } = await admin.auth.admin.createUser({
      email, password: 'Senha!Forte123', email_confirm: true,
    })
    if (uErr) { formatoOk = false; break }
    created.push(u.user.id)
    const cli = createClient(URL, ANON, { auth: { persistSession: false } })
    await cli.auth.signInWithPassword({ email, password: 'Senha!Forte123' })
    const { data: fam, error: fErr } = await cli.rpc('create_family', {
      p_family_name: `Casa ${i}`, p_split_rule: 'equal',
      p_member_name: `Membro ${i}`, p_monthly_income: 1000,
    })
    if (fErr) { formatoOk = false; break }
    const code = (Array.isArray(fam) ? fam[0] : fam).join_code
    if (!/^[A-Z2-9]{6}$/.test(code)) { formatoOk = false; break }
    codes.add(code)
  }
  check('T3-FORMATO 12 codigos no formato ^[A-Z2-9]{6}$', formatoOk)
  // 12 amostras num espaco de 1,07 bilhao: colisao aqui significa gerador preso.
  check('T3-FORMATO 12 codigos distintos', codes.size === 12, `${codes.size} distintos`)
}
```

Aviso: estes 12 usuários entram em `created[]` e a rotina de `cleanup()` existente os
apaga. Confirme que o `push` está dentro do array certo antes de rodar.

- [ ] **Passo final: rodar os dois testes e colar a saída**

```bash
cd "C:/Users/Heitor PC/OneDrive/Documentos/SEGUNDO CÉREBRO/HORI ANALYTCIS PROJETOS/Finanças a Dois/app"
set -a && . ./.env.local && set +a
export ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
export SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
node tests/integration/tenant-escape.mjs
node tests/integration/rls-isolation.mjs
```

Esperado: ambos exit 0.

Sobre o total de verificações de `rls-isolation`: o baseline do briefing é `20/20`, e esta
tarefa acrescenta **4 chamadas de `check()`** (2 em `T2-RPC`, 2 em `T3-FORMATO`), logo o
esperado é `24/24`. **Mas não trate 24 como critério de aceite rígido** — o arquivo tem
`check()` dentro de laço, então o total impresso pode não ser igual ao número de linhas de
`check()`. O critério de aceite é: **exit 0, nenhum `FAIL`, e o total NOVO = total do
baseline do Passo 4 da Tarefa 1 + 4.** Cole os dois totais lado a lado.

---

## Ordem de aplicação, e por que não existe estado intermediário quebrado

A migration é **um arquivo**, aplicado por `supabase db push` **numa transação**. DDL em
Postgres é transacional, inclusive `CREATE POLICY` e `CREATE FUNCTION`: ou os 6 blocos
entram, ou nenhum entra. Não existe janela em que uma policy aponte para função
inexistente, porque nenhuma versão parcial fica visível para outra sessão.

A ordem **interna** também é segura statement a statement, caso alguém rode à mão fora de
transação:

| # | Bloco | Estado do banco depois | Por que é seguro aqui |
|---|---|---|---|
| 1 | Helpers `_self()` | funções novas existem; nada as usa ainda | adiciona, não remove |
| 2 | Trigger | `family_members` ganha defesa extra | o trigger só proíbe o que já era proibido de fato |
| 3 | 33 policies + `delete_transactions` | tudo usa `_self()`; função antiga ainda existe **e ainda tem EXECUTE** | as funções do passo 1 já existem; a antiga ainda funciona para quem não migrou |
| 4 | `REVOKE` da antiga | oráculo fechado | ninguém mais a chama — garantido pelo bloco 6 |
| 5 | `generate_join_code` | CSPRNG | independente dos outros; assinatura inalterada |
| 6 | Auto-verificação | aborta se sobrou referência | roda por último, quando já dá para afirmar |

A inversão que seria fatal é **4 antes de 3** — revogar o EXECUTE enquanto policies ainda
chamam a função antiga. O resultado seria `permission denied for function` em toda query
de toda tabela: app inteiro fora do ar. O bloco 6 existe para pegar a variante sutil desse
erro (3 incompleto).

---

## Riscos, e o que fazer se falhar no meio

| Risco | Probabilidade | O que acontece | Mitigação / recuperação |
|---|---|---|---|
| Objeto fora dos 5 arquivos chama `get_user_family_id(uuid)` | média — é a incerteza real deste plano | bloco 6 **aborta a migration**; nada é aplicado | é por isso que a Tarefa 1 Passo 3 roda o inventário contra o banco **antes**. Se o bloco 6 abortar, leia o nome na mensagem de erro, acrescente aquela policy ao bloco 3, reaplique |
| Falha no meio da aplicação | baixa | **rollback automático** — DDL é transacional | nada a fazer; o banco volta ao estado de 00005. Corrija o SQL e reaplique |
| `realtime.messages` recusa `DROP/CREATE POLICY` por permissão | baixa — `00005` já provou que policy funciona no hospedado, só `ALTER TABLE` falha | migration aborta com `42501` | o bloco **não tem** `ALTER TABLE`, de propósito. Se ainda assim falhar, isole as 2 policies de realtime numa `00007` e reporte ao Maestro: é limitação de plataforma, não erro de SQL |
| Trigger quebra fluxo legítimo de perfil | baixa | usuário não consegue editar nome/renda | casos `T1-OK` e `T1-NOOP` pegam isso **antes** de o cliente ver. Se pegarem, o bug é a comparação do trigger, não o conceito |
| Novo `join_code` viola o CHECK | baixa | `create_family` falha para família nova | `T3-FORMATO` pega. Recuperação: `00007` revertendo `generate_join_code` ao corpo de `00003` |
| `db push` interrompido por rede | média (pooler) | transação não comita; nada aplicado | reaplicar. A migration é **idempotente** (`CREATE OR REPLACE`, `DROP ... IF EXISTS`), então reaplicar é seguro |
| Rollback necessário depois de aplicada | baixa | — | **não existe `down` migration**. A reversão é uma `00007` nova que recria as policies apontando para a versão com parâmetro e devolve o `GRANT`. **Não editar nem apagar `00006`.** |

**Dado existente afetado: nenhum.** Esta migration não tem `ALTER TABLE`, nenhum `UPDATE`
de dado, nenhum `DROP` de coluna ou tabela. Só funções, trigger e policies. Nenhuma linha
de cliente é lida ou escrita. É por isso que D3 (manter 6 caracteres, sem mexer no CHECK)
importa tanto para o perfil de risco.

---

## Portão de saída da FASE: EXECUÇÃO

O executor deve colar a saída real de cada item. Item não rodado é `NÃO VERIFICADO` +
motivo, nunca verde.

```
[ ] npx supabase migration list --db-url  → 00006 presente em Remote
[ ] Inventário da Tarefa 1 Passo 3 colado, batendo com o Blast radius
[ ] node tests/integration/tenant-escape.mjs  → exit 0, com T1-ERRCODE, T1-OK,
    T1-NOOP, T2-ORACULO, T2-SELF passando
[ ] node tests/integration/rls-isolation.mjs  → 24/24, exit 0
[ ] npx tsc --noEmit  → sem erro, sem 'any' novo
[ ] gen types: NÃO se aplica — justificar com o diff vazio, ver abaixo
[ ] Grep de segredo: service_role, SERVICE_ROLE,
    NEXT_PUBLIC_.*(SERVICE|SECRET|KEY|TOKEN), 'sk-', 'eyJ', supabaseKey
    sobre os arquivos tocados E sobre app/src/ inteiro
[ ] grep -n 'INSERT INTO' app/supabase/migrations/00006_*.sql  → vazio
    (nenhum dado de demonstração em migration)
[ ] Skill(skill="security-review")  → o ciclo tocou RLS e policy
[ ] Skill(skill="superpowers:verification-before-completion")
```

**Sobre `gen types`:** a regra do projeto é que regenerar tipos é o último passo de toda
migration. Aqui a migration **não altera nenhuma tabela, coluna ou assinatura de RPC
pública** — as funções `_self()` novas têm `GRANT` para `authenticated`, então vão aparecer
no schema do PostgREST. Portanto: **rode `npx supabase gen types` de qualquer forma** e
cole o `git diff` do arquivo de tipos. Se o diff trouxer as duas funções novas, commite
junto, no mesmo ciclo. Se vier vazio, cole o diff vazio como prova — não pule o comando
nem afirme "não era necessário" sem a saída.

---

## Perguntas bloqueantes para o Maestro

Nenhuma bloqueia a execução. Duas decisões de produto ficam registradas, com a opção que
assumi:

1. **`avatar_url` editável pelo próprio membro.** Assumi **sim** (D1): a coluna já existe
   em `00001` e é dado de perfil pessoal. Se o produto quiser que o avatar venha só de
   upload controlado pelo server, o trigger precisa congelá-la também — é uma linha a
   mais no bloco 2. Confirme ou deixe como está.
2. **`join_code` permanente.** Esta migration troca a fonte de entropia, mas o código
   continua **sem expiração e sem rotação**: um código que vazou vale para sempre. Isso é
   da mesma família do rate limiting já registrado como pendência de produto, e **não
   está nesta migration**. Sugiro registrar junto na mesma pendência.

---

## Fora de escopo, explicitamente

- Rate limiting de `family_preview` / `join_family` — pendência de produto do Maestro.
- Expiração ou rotação de `join_code` — ver pergunta 2.
- Qualquer `ALTER TABLE`, índice novo ou view nova.
- Mudança de comprimento ou de charset do `join_code` — rejeitado em D3, com motivo.
- Privilégio por coluna em `family_members` — rejeitado em D1, com motivo.
- `DROP` das funções helper obsoletas — rejeitado em D2, com motivo.
