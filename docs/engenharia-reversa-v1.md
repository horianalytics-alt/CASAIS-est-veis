# Engenharia reversa — Finanças a Dois v1 (Lovable)

> Fonte: `https://github.com/horianalytics-alt/finance-a-dois` — clonado em `_referencia-v1/finance-a-dois/` (fora do git da v2).
> Data da análise: 2026-10-11. 233 commits (abr–mai/2026), 21 migrations, ~7 mil linhas de código próprio.
> Tudo abaixo foi lido no código; nada é suposição sem marcação.

## 1. O que a v1 é, em uma frase

PWA mobile-first para um casal (Heitor e Carol) lançar receitas, despesas e investimentos numa "família"
compartilhada, com sincronização em tempo real entre os dois, notificação push quando o parceiro lança algo,
e uma camada analítica (runway, Pareto, heatmap, simulador de "gasto fútil", eficiência do vale-benefício).

**Stack v1:** TanStack Start + Vite + Cloudflare Workers (wrangler) + Supabase + shadcn/ui + Recharts.
**Stack v2 (contrato HORI):** Next.js App Router + Supabase + Vercel. Nenhum código de rota da v1 é portável
diretamente; o que é portável é **modelo de dados, regras de negócio, fórmulas e utilitários puros**.

## 2. Inventário de funcionalidades (com veredito recomendado)

Legenda: **MANTER** = levar como está (conceito + regra) · **REFAZER** = ideia boa, implementação ruim ·
**DESCARTAR** = não levar · **DECIDIR** = depende de você.

| # | Funcionalidade (onde vive na v1) | O que faz | Veredito |
|---|---|---|---|
| 1 | Auth e-mail/senha + reset (`routes/auth.tsx`, `reset-password.tsx`) | Login, cadastro, recuperação | MANTER |
| 2 | Família com código de 6 caracteres (`create_family_with_two_profiles`) | Cria a "casa", gera código sem letras ambíguas (sem 0/O/1/I) | MANTER |
| 3 | Modelo "Netflix" — 1 login, 2 perfis + troca de perfil (`ProfileSwitcher`) | Um celular pode lançar como qualquer um dos dois | **DECIDIR** (ver §5) |
| 4 | Parceiro "reivindica" perfil-placeholder via código (`link_profile_to_user`, `claimed_at`) | Segundo login assume o perfil criado pelo primeiro | REFAZER (virou 6 RPCs e 5 migrations de remendo) |
| 5 | Lançamento: data, tipo (receita/despesa/investimento), descrição, categoria, valor, conta, forma de pagamento | Núcleo | MANTER |
| 6 | Pago? + data de pagamento → "A pagar" / "A receber" | Previsto vs realizado | MANTER |
| 7 | Recorrência/parcelas (1–120 meses) com editar/excluir "só esta" ou "série inteira" | Gera N linhas com `recurrence_parent_id` | MANTER a UX, REFAZER a gravação (não é atômica) |
| 8 | Lote rápido — vários lançamentos num envio (`TransactionForm` `allowBulk`) | Lança a feira toda de uma vez | MANTER |
| 9 | Responsável do gasto (perfil) **e** campo `owner` = `heitor`/`carol`/`casal` | Dois conceitos sobrepostos de "de quem é" | REFAZER — unificar em "Pessoa A / Pessoa B / Casal" sem nome cravado no schema |
| 10 | Autor ≠ responsável (`created_by_id` vs `profile_id`) | Quem digitou vs de quem é o gasto | MANTER |
| 11 | Contas (corrente / benefício) com saldo | Separar dinheiro livre do vale-refeição | MANTER, REFAZER o cálculo de saldo (§4) |
| 12 | Natureza "Benefício" + KPI **Eficiência de Benefício** (`carteira.tsx`) | % do gasto-benefício que saiu do cartão certo vs do bolso | MANTER — diferencial real |
| 13 | Gasto fútil ("Bobeiras", rótulo customizável) + **simulador de juros compostos** (poupança/CDI/custom, N anos) | "Se você não gastasse isso, teria R$ X em 5 anos" | MANTER — diferencial real |
| 14 | Dashboard: 8 cards (receitas/despesas totais e pagas, investimentos, média/dia, a pagar, a receber) | Resumo do mês | REFAZER — 8 cards é ruído; consolidar |
| 15 | Runway (dias de caixa livre ao ritmo atual) | Quantos dias o saldo aguenta | MANTER |
| 16 | Comparativo com mês anterior (MoM) | Δ% receitas e despesas | MANTER |
| 17 | "Top gastos do mês" por pessoa | Quem gastou quanto | MANTER |
| 18 | Metas por conta + orçamento por categoria, alerta ao atingir 80% (`metas.tsx`) | Teto mensal | MANTER |
| 19 | Análise: donut por categoria, barras por pessoa, Pareto 80/20, heatmap por dia da semana, forecast, patrimônio | Camada analítica | MANTER parte, REFAZER fórmulas (§4) |
| 20 | Carteira visual estilo cartão de crédito com "saúde" da conta | Visual | DECIDIR |
| 21 | Tempo real: lançamento do parceiro aparece na hora + toast "Carol adicionou…" + badge "novo" 5 s + presença online | O "a dois" do app | MANTER — é a alma do produto |
| 22 | Push notification (Web Push/VAPID) quando o parceiro lança | Aviso com app fechado | MANTER, REFAZER a infraestrutura (§3) |
| 23 | Ocultar valores (olho) | Privacidade em público | MANTER, consertar (a Análise ignora) |
| 24 | 7 paletas de cor + dark mode | Personalização | DECIDIR (proposta: 1 identidade forte + dark) |
| 25 | Sons (sucesso, exclusão, parceiro) | Feedback | DECIDIR |
| 26 | Foto de perfil com recorte (`AvatarCropper`) | Avatar | MANTER |
| 27 | Cadastros: categorias por tipo, formas de pagamento, contas — com reordenação | Configuração | MANTER |
| 28 | Seeds padrão (12 categorias, 6 formas, 2 contas) | Começa pronto | MANTER |
| 29 | Exportar CSV (mês / semana / período) | Saída de dados | MANTER |
| 30 | Seleção múltipla + exclusão em massa | Limpeza | MANTER |
| 31 | PWA instalável (manifest + service worker) | "App" no celular | MANTER |
| 32 | Configurações de família em chave/valor (`family_settings`) | Taxas de juros, renda mensal, rótulo fútil | REFAZER — virar colunas tipadas |

## 3. Problemas encontrados (segurança e arquitetura)

### Segurança — ação imediata na v1 que está no ar

| Sev. | Achado | Evidência | Ação |
|---|---|---|---|
| **ALTO** | Segredo do gatilho de push **em texto puro num repositório público** (dois valores: o original e o "rotacionado") | `migrations/20260502193108…sql:1384` e `20260503143810…sql:1628` | Qualquer pessoa com o segredo + um `family_id` dispara push para o casal. **Rotacione já** no Supabase da v1 (ou desligue a função `send-push`). Na v2: segredo só em Vault/env, nunca em migration. |
| MÉDIO | Edge Function `send-push` com `verify_jwt = false` | `supabase/config.toml` | Na v2: Database Webhook / `pg_net` com header assinado vindo de env. |
| MÉDIO | Gatilho de push usa a extensão `http` **síncrona** dentro do `AFTER INSERT` | `20260421020154…sql` | Cada lançamento espera a chamada HTTP. Na v2: assíncrono (`pg_net` ou Webhook). |
| BAIXO | `.env` commitado (só URL + chave publicável — não é segredo, mas é hábito ruim) | `.env` | `.gitignore` correto na v2. |
| BAIXO | `accounts`, `account_goals`, `category_budgets`, `family_settings` sem FK em `family_id`; `account_goals.account_id` pode apontar para conta de outra família (FK ignora RLS) | migrations 20260502193900 e 20260506005822 | Na v2: FK composta `(family_id, account_id)`. |
| BAIXO | `created_by_id` e `profile_id` vêm do cliente — qualquer membro pode lançar "em nome" do outro | `transaction.new.tsx` | Aceitável entre casal; na v2 o autor vem do servidor (`auth.uid()`). |

### Arquitetura

1. **Tudo é calculado no navegador sobre as últimas 2000 transações** (`app-context.tsx:169`). Passou de 2000, o
   patrimônio, o saldo livre e o heatmap ficam **silenciosamente errados**. V2: agregação no Postgres (views
   `security_invoker`) e paginação na lista.
2. **"Saldo atual" da Carteira é só o líquido do mês** (receitas − despesas pagas *naquele mês*), não o saldo da
   conta (`carteira.tsx:44-48`). Investimento não sai do saldo da conta. V2: saldo acumulado + saldo inicial da conta.
3. **Patrimônio = receitas − despesas − investimentos** (`analytics.tsx:99`): investimento é tratado como gasto,
   então quem investe mais parece ter patrimônio menor. V2: patrimônio = caixa + investido.
4. **Forecast usa sempre os dias 1–15** (`analytics.tsx:102-115`): no dia 5, divide 5 dias de gasto por 15 e
   subestima. V2: média por dia decorrido.
5. **Recorrência e lote não são atômicos**: insere a mãe, depois as parcelas e os extras em chamadas separadas;
   se falhar no meio, ficam lançamentos órfãos. V2: uma Server Action → uma função SQL transacional.
6. **Ocultar valores não cobre a Análise**: 18 `formatBRL(...)` sem máscara (`analytics.tsx`).
7. **Rotatividade de schema**: um `RESET TOTAL` (drop de tudo) no 3º migration, `is_benefit` removido e recriado,
   6 RPCs para vincular perfil. É o sinal de requisito descoberto em produção — a v2 nasce com o modelo decidido.
8. **Nomes "heitor"/"carol" cravados num CHECK do banco** (`20260506005822…sql:2039`). Impede outro casal de usar.

## 4. O que vale ouro (levar para a v2)

- **`lib/format.ts`** — datas como string pura `YYYY-MM-DD`, sem fuso (zero bug de "lançou dia 10, apareceu dia 9");
  `parseBRLInput` aceita `1.234,56` / `1234.56` / `1234,5`; `addMonthsISO` trata 31/jan → 28/fev. Portar com testes.
- **Valores em `NUMERIC(14,2)`** desde a migration de abril — nunca float.
- **Gerador de código sem caracteres ambíguos** (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
- **Padrão RLS por família** com função `SECURITY DEFINER` + `search_path` fixo (evita recursão) e o `REVOKE EXECUTE`
  das funções internas — a v1 aprendeu isso apanhando; a v2 nasce com isso.
- **Policy de Realtime por tópico da família** (`realtime.messages`, `tx:<family_id>`) — correta.
- **Push só para quem não lançou** (`neq profile_id = created_by_id`) — regra certa.
- **As três métricas que nenhum app de banco tem:** Eficiência de Benefício, Simulador de gasto fútil,
  Runway do casal.
- **UX de série**: "excluir só esta / série inteira", "aplicar à série toda (3/12)".

## 5. Decisões que só o Heitor toma

1. **Público da v2:** só vocês dois, ou um produto que outros casais podem criar conta e usar?
2. **Modelo de identidade:** cada um com seu login (recomendado), ou o "Netflix" (um login, dois perfis)?
3. **Migração de dados:** importar o histórico da v1 para a v2, ou começar do zero?
4. Itens marcados **DECIDIR** na tabela (#3, #20, #24, #25).
