# PLANO — Finanças a Dois v2

Documento que governa toda delegação deste projeto. Todo briefing de subagente
cita a seção daqui que o governa.

- **Especificação detalhada:** `docs/superpowers/specs/2026-10-11-financas-a-dois-v2-design.md`
- **Plano tarefa a tarefa (14 tarefas):** `docs/superpowers/plans/2026-10-11-financas-a-dois-onda1.md`
- **Pendências:** `PENDENCIAS.md`

Este arquivo é a fonte única de escopo, fronteiras e modelo de dados. Onde ele
divergir dos dois documentos acima, **este manda**.

---

## 1 Escopo

### O que o sistema faz

Heitor e Carol lançam despesas e receitas da casa num PWA no celular. O produto
responde três perguntas que a v1 respondia mal:

1. **Quanto eu tenho de verdade em cada conta?** — saldo real acumulado, com
   saldo inicial e todo o histórico pago, não apenas o líquido do mês corrente.
2. **Quanto está na fatura do cartão e quando vence?** — compras agrupadas por
   ciclo de fechamento, com pagamento da fatura.
3. **Quem deve para quem no fim do mês?** — acerto de contas do casal pela
   regra da família (igual ou proporcional à renda).

### Em escopo — Onda 1

Autenticação por e-mail e senha · criação de família e entrada por código ·
lançamento de receita, despesa, investimento e transferência · lote e parcelas ·
dashboard com indicadores · Carteira (contas estilo cartão + fatura) · acerto de
contas · tempo real entre os dois celulares · PWA instalável · ajustes
(perfil, família, categorias, contas, formas de pagamento).

### Em escopo — Onda 2

Analytics (rosca por categoria, barras mensais, Pareto, mapa de calor, previsão
de fixos, patrimônio) · Eficiência de Benefício · simulador de gasto fútil ·
metas por conta · notificações push · sons · múltiplas paletas de cor ·
exportação CSV.

### NÃO-ESCOPO — contrato, não sugestão

O que está nesta lista não entra na entrega por iniciativa de ninguém. Pedido
fora de escopo vira linha em `PENDENCIAS.md` e pergunta ao Heitor.

| Item | Por quê |
|---|---|
| Migração de dados da v1 | Decisão do Heitor: começar do zero |
| Open Finance / agregador bancário | `PENDENCIAS.md` P-003; schema reserva `accounts.external_id` |
| Mais de 2 membros ativos por família | Schema arquitetado para N, `member_limit = 2` na Onda 1 |
| Código de convite para o beta | Cadastro aberto |
| Rate limiting de `join_family` | `PENDENCIAS.md` P-001, decisão de produto |
| Cobrança / assinatura | Beta privado e gratuito |
| App nativo iOS/Android | É PWA instalável |
| Supabase local (Docker) | Descartado: o banco hospedado já existe |

---

## 2 Stack e decisões de plataforma

Cada decisão cita a fonte. Decisão de plataforma sem fonte citada é decisão
inválida.

| Decisão | Valor | Fonte |
|---|---|---|
| Framework | Next.js 16.4, App Router, sem Pages Router | `package.json` do projeto |
| Middleware | **`proxy.ts` na raiz**, `export function proxy()` e `export const proxyConfig` — `middleware.ts` NÃO é reconhecido | `vercel:nextjs`, `references/file-conventions.md` |
| APIs assíncronas | `params`, `searchParams`, `cookies()`, `headers()` retornam Promise — tipar como `Promise<...>` e `await` | `vercel:nextjs`, `references/async-patterns.md` |
| Runtime | Node.js, não Edge | `vercel:nextjs`, `references/runtime-selection.md` |
| CSS | **Tailwind 4: não existe `tailwind.config.ts`** — tema via `@theme` em `globals.css`; dark mode via `@custom-variant dark (&:where(.dark, .dark *))` | verificação direta: o arquivo de config não existe no projeto |
| Mutação | Server Actions, não Route Handlers de CRUD | `vercel:nextjs`, `references/data-patterns.md` |
| Banco | Supabase hospedado, ref `wxhfgstgjjlmqauogeid`, região `aws-1-sa-east-1` | descoberto por teste: as outras regiões rejeitam o tenant |
| Cliente SSR | `@supabase/ssr` com `getAll`/`setAll` | `supabase:supabase` |
| Views de agregação | **`security_invoker = true` obrigatório** em toda view | `supabase:supabase` |
| Funções helper de RLS | `SECURITY DEFINER` + `SET search_path = public` + `REVOKE FROM PUBLIC, anon` | `supabase:supabase-postgres-best-practices` |
| Chamada de helper em policy | `(SELECT fn(auth.uid()))` — avalia uma vez por query, não por linha | `supabase:supabase-postgres-best-practices` |
| Dinheiro | `numeric(14,2)` no banco; centavos inteiros no TypeScript para o acerto | evita deriva de float |
| Datas | string `YYYY-MM-DD` pura, sem `new Date()` para cálculo, sem conversão de timezone | princípio portado da v1 |

### Comandos de banco

Não existe Supabase local. Todo comando usa `--db-url`:

```
npx supabase db push --db-url "postgresql://postgres.wxhfgstgjjlmqauogeid:$SUPABASE_DB_PASSWORD@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
```

Credenciais em `app/.env.local` (git-ignored, confirmado por
`git check-ignore -v app/.env.local`). Carregar com `set -a && . ./.env.local && set +a`.

**Migrations 00001–00005 estão APLICADAS no banco do cliente.** Não podem ser
editadas. Correção é migration NOVA. `db reset` é proibido.

### Dev server

`cd app && npm run dev` → **http://localhost:3000**

---

## 3 Modelo de isolamento de dados

Decisão do orquestrador, não do Estrutura. Modelo: **tenant por família**, com
RLS em todas as tabelas e a família resolvida de `auth.uid()` pelo servidor —
o cliente nunca informa seu próprio `family_id` como fonte de verdade.

Toda FK é **composta com `family_id`**: `(family_id, x) REFERENCES t(family_id, id)`.
Isso corrige o bug da v1 em que uma FK simples ignorava o RLS e podia apontar
para a linha de outra família.

### Quem lê e quem escreve cada tabela

| Tabela | Lê | Escreve | Observação |
|---|---|---|---|
| `families` | membros da família | UPDATE pelos membros; INSERT só via RPC `create_family` | sem DELETE |
| `family_members` | membros da família | cada um só a PRÓPRIA linha, e só `display_name` e `monthly_income` | `family_id` e `user_id` são imutáveis pelo usuário — ver achado A-001 |
| `accounts` | membros da família | membros da família | cadastro compartilhado da casa |
| `categories` | membros da família | membros da família | idem |
| `payment_methods` | membros da família | membros da família | idem |
| `transactions` | membros da família | INSERT exige `created_by_member_id = get_user_member_id(auth.uid())` | ninguém assina lançamento como o outro |
| `push_subscriptions` | **só o próprio membro** | só o próprio membro | o token do aparelho é privado até do parceiro |
| `account_goals` | membros da família | membros da família | |
| `category_budgets` | membros da família | membros da família | |
| `realtime.messages` | tópico `<canal>:<family_id>` da própria família | idem | presença e broadcast |

`anon` tem `REVOKE ALL` em todas as tabelas: visitante sem login não lê nada.

### Prova exigida

Nenhuma tabela chega à entrega sem policy RLS e sem **teste provando que o
usuário A não lê a linha do usuário B**, com a saída do teste colada.

- `app/tests/integration/rls-isolation.mjs` — **20/20 em 2026-10-11** contra o
  banco hospedado. Cobre leitura cruzada, filtro explícito, escrita cruzada,
  assinatura de lançamento, as 4 views, token de push, RPC com código alheio e
  transferência entre famílias.
- `app/tests/integration/tenant-escape.mjs` — prova de conceito do achado A-001.

---

## 4 Achados de segurança aceitos

Verificados tecnicamente contra o banco real antes de aceitar. Correção
delegada ao Estrutura como migration `00006`.

| # | Severidade | Achado | Veredicto |
|---|---|---|---|
| A-001 | ALTO | `family_members_update_self` não fixa `family_id` nem protege `user_id`: mass assignment com risco de tenant escape | **ACEITO** — hoje bloqueado, mas por acidente (policy de SELECT + RETURNING do PostgREST), não por regra explícita. Evidência: trocar `family_id` para UUID inexistente dá 42501 (RLS), não 23503 (FK) |
| A-002 | MÉDIO | `get_user_family_id(uid)` e `get_user_member_id(uid)` são `SECURITY DEFINER` com parâmetro e `GRANT` para `authenticated`: qualquer logado descobre a família de terceiro | **ACEITO** — vaza relação, não valor |
| A-003 | MÉDIO | `generate_join_code()` usa `random()` (não CSPRNG) com 32^6 combinações | **ACEITO parcialmente** — risco baixo hoje com `member_limit = 2`; corrigir com `gen_random_bytes` porque o produto vai abrir para famílias. Rate limiting fica em `PENDENCIAS.md` P-001 |

---

## 5 Ordem de construção e fronteira de arquivos

Dois agentes só rodam em paralelo quando os caminhos que tocam não se cruzam,
declarados por escrito antes do disparo.

| Etapa | Agente | Caminhos que pode tocar | Paralelo com |
|---|---|---|---|
| 4a | **Vitrine** — tokens, paleta, tipografia, ícones | `docs/design/`, `app/src/app/globals.css`, `app/src/styles/`, `app/public/` | 4b |
| 4b | **Estrutura** — schema, RLS, funções, Auth, Server Actions | `docs/planos/`, `app/supabase/`, `app/src/lib/supabase/`, `app/src/types/`, `app/proxy.ts` | 4a |
| 4c | **Fachada** — componentes, páginas, formulários | `app/src/components/`, `app/src/app/` (exceto `globals.css`) | nenhum — consome 4a e 4b |
| 4d | **Dash** — gráficos, KPIs, views de agregação | `app/src/components/charts/`, migration nova de view | nenhum — consome 4b e 4a |
| 5 | **Sentinela** — auditoria independente | `docs/auditoria/`, `evidencias/` | — |

**Fachada é sequencial**: consome os tokens do Vitrine e os tipos do Estrutura.
Nunca em paralelo com eles. **Dash** roda depois do Estrutura e não em paralelo
com a Fachada.

### Prova visual obrigatória

Toda entrega de Fachada e de Dash exige, com caminho absoluto de arquivo:
screenshots em **375px, 768px e 1440px**, mais um em **dark mode**, mais a saída
de `browser_console_messages` **sem erro**. Dev server em
`cd app && npm run dev`, porta 3000. Entrega de front-end sem esses arquivos é
entrega quebrada e é re-delegada.

O Vitrine está fora desta regra: ele entrega asset, e a prova dele é o asset
renderizado com peso e dimensão.

---

## 6 Riscos que a revisão precisa cobrir

1. **Virada de mês na fatura** — compra no dia do fechamento cai no ciclo
   SEGUINTE. Testar `closing_day = 25` com compra em 24 e em 26.
2. **Isolamento RLS entre famílias** — coberto, 20/20. Re-rodar após a 00006.
3. **Parcelas atômicas** — se a parcela 3 falhar, as parcelas 1 e 2 não existem.
   A geração roda dentro de `save_transactions`, em uma transação SQL.
4. **Divisão proporcional com renda zero** — renda total 0 cai para divisão
   igual, nunca divide por zero. Coberto em `settlement.ts` e em `v_settlement`.
5. **Saldo acumulado vs mensal** — o saldo inclui lançamento pago de mês
   anterior. Foi o bug central da v1.

---

## 7 Estado verificado em 2026-10-11

Saída real dos comandos, não afirmação:

```
npx supabase db push   → 00001..00005 aplicadas
npx tsc --noEmit       → exit=0, nenhum erro
npx vitest run         → Test Files 3 passed (3) | Tests 83 passed (83)
rls-isolation.mjs      → 20/20 verificacoes passaram
tenant-escape.mjs      → NAO EXPLORAVEL (bloqueio acidental — ver A-001)
```

Tabelas e views confirmadas vivas por consulta REST com `service_role`: as 9
tabelas e as 4 views respondem HTTP 200; `transactions` com chave `anon`
responde **HTTP 401** (`REVOKE ALL FROM anon` ativo).
