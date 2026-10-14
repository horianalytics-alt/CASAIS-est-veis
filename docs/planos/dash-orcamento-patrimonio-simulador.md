# Plano Dash — Orçamento, Patrimônio e Simulador (Onda 2, PLANO.md seção 8)

> FASE: PLANO. Autor: Dash. Data: 2026-10-14.
> Governado por `PLANO.md` §8.1, §8.2, §8.3 (formas de gráfico já decididas pelo
> Maestro com `dataviz` carregada — aqui elas são RESPEITADAS, não redecididas).
> Skills carregadas para este plano: `dataviz` (form, color formula, marks,
> interaction, anti-patterns, palette), `supabase:supabase` (leitura pela sessão,
> RLS das views `security_invoker`).
> Back-end consumido, sem tocar: migration `00013_orcamento_progresso_e_patrimonio.sql`,
> `src/lib/simulador.ts`, `src/lib/hoje.ts`, `src/types/database.ts`.

## 0. Handoffs recebidos

| Insumo | Estado |
|---|---|
| Contrato do Estrutura PARA O DASH | **Não recebido como seção nominal** — schema lido de `app/supabase/migrations/00013_orcamento_progresso_e_patrimonio.sql` e `docs/planos/estrutura-metas-patrimonio-simulador.md` §2/§3 (que cobre colunas, fuso e granularidade). Tipos em `src/types/database.ts` (linhas 748–800) batem com a migration. |
| Paleta de séries do Vitrine | **Recebida**: `src/styles/chart-palette.ts` (+ `--chart-1..5` em `globals.css`). **Falha no validador do `dataviz`** como paleta categórica de 8 (ver §6). Este trabalho só usa a série 1, que passa em claro; no escuro passa em contraste e falha só na faixa de luminosidade. Reportado ao Maestro/Vitrine — não "consertado" aqui. |
| Tokens de status (warning/critical) | **Não existem** como tokens próprios. Uso os tokens semânticos já emitidos: warning → `--pendente`, critical → `--negativo`. Pendência para o Vitrine (§9). |
| Referência do Radar | `SUPOSIÇÃO: sem referência de gráfico do Radar — tipo de gráfico derivado da métrica e do briefing` (e já fixado no PLANO.md §8). |
| Invólucro do Fachada | `Card`, `Skeleton`, `EstadoVazio` existem em `src/components/ui/`. Uso-os como estão; nenhum shadcn novo. |

## 1. Arquivos a criar / alterar

Restrição do briefing: só `src/components/`, `src/app/`, `src/features/`. Nada em
`src/lib/`, `src/actions/`, migrations, `src/lib/supabase/`, `package.json`.

| Arquivo | Ação | Conteúdo |
|---|---|---|
| `src/components/analises/escala-linear.ts` | criar | lógica pura: domínio "bonito", ticks, formato compacto de eixo em R$ |
| `src/components/analises/orcamento-logica.ts` | criar | lógica pura: status por razão, ordenação, domínio compartilhado |
| `src/components/analises/patrimonio-logica.ts` | criar | lógica pura: janela de 12 meses, flag de mês parcial, variação em R$ |
| `src/components/analises/simulador-entrada.ts` | criar | lógica pura: texto em reais → centavos inteiros (sem float), texto → meses |
| `src/components/analises/grafico-linha.tsx` | criar | gráfico de linha de UMA série, SVG à mão, crosshair + tooltip + teclado + tabela |
| `src/components/analises/grafico-orcamento.tsx` | criar | card de progresso de orçamento (barras horizontais com marcador de meta) |
| `src/components/analises/grafico-patrimonio.tsx` | criar | card de patrimônio (stat + linha) |
| `src/components/analises/simulador-futil.tsx` | criar | card do simulador (formulário + stat + linha) |
| `src/features/analises/copy.ts` | alterar | copy nova (títulos, definições, estados) |
| `src/app/(app)/(principal)/analises/page.tsx` | alterar | 2 consultas novas no `Promise.all`, total fútil em centavos, montar os 3 cards |
| `src/app/(app)/(principal)/analises/loading.tsx` | alterar | skeletons dos 3 cards novos com a altura do conteúdo final |
| `tests/unit/analises-onda2.test.ts` | criar | testes da lógica pura (ver Desvio previsto em §8) |

**Biblioteca de gráfico:** nenhuma. Recharts NÃO está instalado (`package.json`
lido: sem `recharts`, sem `@tremor/*`) e `package.json` está fora dos caminhos
permitidos. Os 6 gráficos existentes de `/analises` são HTML/SVG à mão — sigo o
padrão. Nenhuma dependência nova, nenhum peso de bundle novo.

**Local escolhido: os três em `/analises`.** Motivos: (1) a página já tem o
seletor de mês, que é o filtro único "acima de tudo" exigido pelo `dataviz`
(interaction.md: "filters scope everything below them"); (2) não existe tela de
definir orçamento em Ajustes (nenhuma Server Action nem UI grava
`category_budgets` — grep em `src/`), então "perto de onde orçamentos são
definidos" não tem onde ser; (3) o simulador parte do total de gastos fúteis, que
já é exibido em `/analises` (`IndicadoresInteligencia`). Rota nova `/simulador`
não se paga para um card.

Ordem na página: cabeçalho → **Orçamento do mês** (o mais acionável) → rosca/Pareto
→ evolução mensal → **Patrimônio** → previsão → indicadores → **Simulador** (logo
abaixo do card de supérfluos) → mapa de calor.

## 2. KPIs

Fuso de toda agregação: **America/Sao_Paulo**. Datas são `date` sem fuso
(`transactions.date`, `paid_date`); o único "agora" é o mês corrente, que vem de
`hojeEmSaoPaulo()` no app e de `now() AT TIME ZONE 'America/Sao_Paulo'` na view
de patrimônio.

| KPI | Fórmula literal | Janela | Origem |
|---|---|---|---|
| Gasto da categoria no mês | `sum(transactions.amount)` com `type IN ('despesa','investimento')`, mesma família e categoria, `date` no mês, **pago ou não** | mês selecionado em `/analises` (padrão: mês corrente em SP) | `v_orcamento_progresso.spent_amount` |
| Limite | `category_budgets.amount` | idem | `v_orcamento_progresso.budget_amount` |
| % do orçamento usado | `round(spent/budget, 4)` → exibido como `round(ratio*100)` % | idem | `v_orcamento_progresso.used_ratio` |
| Restante / excedente | `budget - spent` (negativo = estourou, exibido como "R$ X acima") | idem | `v_orcamento_progresso.remaining_amount` |
| Patrimônio no mês | `sum(accounts.initial_balance) + Σ net_change` até o mês, todas as contas (inclusive cartão e arquivada), movimento pelo mês do `paid_date` | 12 meses terminando no mês selecionado (cortado no início da série) | `v_patrimonio_mensal.total_balance` |
| Variação do patrimônio na janela | `total_balance(último) − total_balance(primeiro)` da janela, **em R$, sem %** (sem base zero, sem divisão) | idem | derivado no app |
| Valor futuro do gasto fútil | `VF = VP·(1+i)^n`, centavos inteiros, BigInt, 1 arredondamento | n meses digitados | `simularValorFuturo` |
| Projeção mês a mês | mesma conta, ponto por mês, `mes=0` hoje | 0..n | `projetarValorFuturo` |
| Valor de partida sugerido | `Σ round(amount·100)` dos lançamentos `is_futile` do mês selecionado (soma em centavos inteiros) | mês selecionado | `transactions` já lidas pela página |

**Definição visível na UI** (texto idêntico ao desta tabela, em `copy.ts`):
- Orçamento: "Gasto = despesas e investimentos com data de compra no mês, pagos ou
  não (compra no cartão conta antes da fatura ser paga). Receitas e transferências
  não contam."
- Patrimônio: "Soma do saldo de todas as contas no fim de cada mês, inclusive
  cartões e contas arquivadas. Cada movimento conta no mês em que foi pago: compra
  no cartão entra quando a fatura é paga."
- Simulador: "Juros compostos mensais sobre o valor, sem aportes nem impostos."
- Cada card mostra "Atualizado em dd/mm às hh:mm" (horário de Brasília, momento
  do render — a página é dinâmica por `connection()`).

**Período parcial (janela equivalente):** nenhum KPI aqui compara período parcial
com período cheio. Quando o mês selecionado é o corrente: orçamento rotulado
"mês em andamento"; no patrimônio o último ponto é rotulado "parcial" (marcador
vazado + texto no tooltip e na tabela) e a variação diz "até hoje".

## 3. Gráficos

### 3.1 Orçamento — barra horizontal com marcador de meta (PLANO.md §8.1)
- **Forma:** magnitude com um polo → barra horizontal (meter) por categoria orçada.
  Nunca donut. Uma linha por orçamento; ordenada por `used_ratio` desc (o mais
  perto de estourar primeiro), desempate por nome.
- **Escala:** eixo de razão **compartilhado** entre as linhas, domínio
  `[0, max(1, maior razão)]`, começa em 0 (sem truncar). Marcador de meta em 1.0
  (100%) alinhado verticalmente em todas as linhas.
- **Marcas (marks-and-anatomy.md):** trilho 12px; preenchimento com ponta 4px
  arredondada, reto na base; trilho = mesmo hue clareado
  (`color-mix(in oklab, <cor> 18%, var(--card))`, regra do meter: "track is a
  lighter step of the same ramp"); marcador de meta 2px × 20px em `--foreground`
  com anel de 1px em `--card` para separar do preenchimento; 2px de ar entre trilho
  e marcador.
- **Cor (color-formula.md):** razão < 0,80 → série 1 (`--chart-1`), um hue só e
  **constante** (pintar mais escuro onde a barra é maior seria "value-ramp on
  nominal categories", anti-pattern — o comprimento já codifica). 0,80 ≤ razão ≤ 1,00
  → status warning (`--pendente`). razão > 1,00 → status critical (`--negativo`).
  Status sempre com ícone + rótulo ("Atenção", "Estourou"), nunca só cor.
- **Rótulo direto:** nome à esquerda; "R$ gasto de R$ limite" e "% · n lançamentos"
  em texto (tokens de texto, nunca cor da série); "Restam R$ X" / "R$ X acima do
  limite". Todos os valores visíveis sem hover.
- **Tooltip:** por barra, no hover e no foco (barra é foco por teclado): categoria,
  gasto, limite, %, status. Só repete o que está visível — enhance, never gate.
- **Legenda:** 1 série → sem caixa de legenda; uma chave do marcador de meta
  ("| limite do orçamento") e das três faixas de status no rodapé do card.

### 3.2 Patrimônio — linha, eixo único (PLANO.md §8.2)
- **Forma:** mudança no tempo → linha, UMA série, UM eixo Y. Sem dual-axis, sem
  segunda série de variação.
- **Eixo X:** meses `YYYY-MM` → "out/25"; no máximo `floor(largura/64)` rótulos,
  sempre o último. **Eixo Y:** domínio "bonito" cobrindo min..max da janela,
  **não força zero** (linha pode); se o domínio cruza 0, a linha do zero ganha
  `--border-forte`. 4–5 ticks, formato compacto ("R$ 12 mil", "−R$ 1,2 mil",
  "R$ 1,5 mi"). Grade hairline sólida `--border`.
- **Marcas:** linha 2px `--chart-1`, junção/ponta redonda; ponto final r=4 com anel
  2px `--card`; mês parcial = ponto final vazado. Sem área (área com base fora do
  zero mente).
- **Rótulo direto:** só o valor final (endpoint).
- **Tooltip:** crosshair vertical que encaixa no mês mais próximo; tooltip com
  valor (forte) + mês (secundário) + chave de traço curto; "parcial" quando for o
  caso. Teclado: o gráfico é focável, ←/→/Home/End movem o mês.
- **Tabela:** `<details>` "Ver tabela" com mês, patrimônio, variação do mês.
- **Stat acima do gráfico:** patrimônio do último mês da janela + variação em R$
  na janela (sinal explícito U+2212/+). Sem %.

### 3.3 Simulador — stat + linha, eixo único (PLANO.md §8.3)
- **Forma:** o número é o protagonista (stat tile "em N meses valeria R$ X" +
  "rendimento + R$ Y"); a projeção é mudança no tempo → linha, uma série, um eixo.
- **Eixo Y:** **começa em zero** (crescimento composto honesto); com base no zero,
  área de 10% de opacidade da série é permitida. Mesmo componente `GraficoLinha`.
- **Eixo X:** "mês 0 (hoje)" … "mês n"; rótulos espaçados como no patrimônio.
- `meses = 0` ou `valor = 0` → só o stat, sem gráfico (uma linha de 1 ponto ou
  chapada no zero não informa nada) + frase explicando.

### 3.4 Paleta / tokens por série
| Uso | Claro | Escuro | Token |
|---|---|---|---|
| Série única (linha, barra normal) | `#2F6DB5` 5,28:1 em `#FFFFFF` | `#6FA8E8` 6,90:1 em `#171C20` | `--chart-1` |
| Status warning | `#D97706` 3,19:1 | `#FBBF24` 10,28:1 | `--pendente` |
| Status critical | `#D93845` 4,56:1 | `#FB7185` 6,38:1 | `--negativo` |
| Marcador de meta | `--foreground` 17,84:1 | 14,41:1 | `--foreground` |
| Grade / zero | `--border` / `--border-forte` | idem | |
| Texto, ticks | `--foreground` / `--muted-foreground` | | |

Contrastes medidos com `contrast()` de `dataviz/scripts/validate_palette.js`
sobre `--card` (superfície real dos gráficos). Nenhum hex no código: tudo `var(--…)`.

## 4. Assinaturas

```ts
// escala-linear.ts
export interface Dominio { min: number; max: number; ticks: number[] }
export function dominioBonito(valores: number[], opcoes?: { incluirZero?: boolean; maxTicks?: number }): Dominio
export function formatarEixoBRL(valor: number): string          // "R$ 12 mil", "−R$ 1,2 mil", "R$ 1,5 mi", "R$ 0"
export function indicesDeRotulo(total: number, maxRotulos: number): number[]  // sempre inclui o último

// orcamento-logica.ts
export type StatusOrcamento = 'normal' | 'atencao' | 'estourado'
export const LIMIAR_ATENCAO = 0.8
export function statusDoOrcamento(razao: number): StatusOrcamento
export interface LinhaOrcamento { id: string; categoria: string; arquivada: boolean; limite: number; gasto: number; restante: number; razao: number; lancamentos: number; status: StatusOrcamento }
export function prepararOrcamentos(linhas: LinhaViewOrcamento[]): LinhaOrcamento[]   // descarta linha sem id/limite<=0, ordena
export function dominioDaRazao(linhas: LinhaOrcamento[]): number                    // max(1, maior razão)
export function percentualInteiro(razao: number): string                             // "75%", nunca NaN/Infinity

// patrimonio-logica.ts
export interface PontoPatrimonio { mes: string; valor: number; variacaoMes: number; parcial: boolean }
export function janelaPatrimonio(linhas: LinhaViewPatrimonio[], mesFim: string, mesAtual: string, tamanho?: number): PontoPatrimonio[]
export function variacaoNaJanela(pontos: PontoPatrimonio[]): number | null           // null com < 2 pontos

// simulador-entrada.ts
export function reaisParaCentavos(texto: string): number | null   // "1.234,56" | "1234,56" | "1234.56" | "R$ 50" ; sem parseFloat
export function textoParaMeses(texto: string): number | null      // inteiro 0..999 (o teto 600 é do simulador)

// componentes (todos 'use client' — consomem useOcultarValores)
export interface PontoLinha { chave: string; rotuloEixo: string; rotuloLongo: string; valor: number; parcial?: boolean }
export function GraficoLinha(props: { pontos: PontoLinha[]; incluirZero?: boolean; rotuloAcessivel: string; formatarValor: (v: number) => string; colunaExtra?: { titulo: string; valores: string[] } }): JSX.Element
export function GraficoOrcamento(props: { linhas: LinhaViewOrcamento[]; erro: boolean; mesRotulo: string; emAndamento: boolean; atualizadoEm: string }): JSX.Element
export function GraficoPatrimonio(props: { linhas: LinhaViewPatrimonio[]; erro: boolean; mes: string; mesAtual: string; atualizadoEm: string }): JSX.Element
export function SimuladorFutil(props: { futilDoMesCentavos: number; mesRotulo: string }): JSX.Element
```
`LinhaViewOrcamento` / `LinhaViewPatrimonio` = `Pick<Database['public']['Views'][...]['Row'], …>`.

Consultas (na `page.tsx`, cliente da sessão `createClient()` de `@/lib/supabase/server`,
RLS das views `security_invoker` resolve a família — sem filtro por `family_id`
vindo do cliente):
```ts
supabase.from('v_orcamento_progresso')
  .select('budget_id, category_name, category_archived_at, budget_amount, spent_amount, remaining_amount, used_ratio, tx_count')
  .eq('month', mes)
supabase.from('v_patrimonio_mensal')
  .select('month, net_change, total_balance')
  .lte('month', mes).order('month', { ascending: false }).limit(12)
```
Erro de cada consulta vira `erro: true` no card (estado ERRO local), não derruba a página.

## 5. Views / índices / funções

**Nenhuma.** As duas views já existem (00013, `security_invoker = true`, verificado
pela rede de proteção do Bloco 5 da migration e por `tests/integration/onda2-views.int.test.ts`).
Eu não crio VIEW, índice nem função. Decisão de `security_invoker`: herdada (`true`).
Ainda assim re-provo o isolamento na leitura que a TELA faz (§7, gate).

## 6. Decisões (com fonte)

| # | Decisão | Fonte |
|---|---|---|
| D1 | Formas: barra horizontal + marcador (orçamento), linha eixo único (patrimônio, simulador) | PLANO.md §8 + `dataviz` choosing-a-form / anti-patterns (dual-axis, donut) |
| D2 | Cor do orçamento ≤ 80%: hue único CONSTANTE, não rampa por valor | `dataviz` anti-patterns "value-ramp on nominal categories"; meter spec em marks-and-anatomy |
| D3 | Status com ícone + rótulo; tokens `--pendente`/`--negativo` | `dataviz` color-formula "Status is fixed"; tokens existentes do Vitrine |
| D4 | Patrimônio sem zero forçado e sem área; simulador com zero e área 10% | `dataviz` marks (área = wash) + regra de não-truncar só para barra |
| D5 | Valores direto-rotulados; tooltip só repete; tabela `<details>` | `dataviz` interaction "tooltips enhance, never gate"; a11y pass |
| D6 | SVG à mão, sem lib | `package.json` (sem recharts) + padrão dos 6 gráficos existentes + caminhos permitidos |
| D7 | Modo privacidade: valores em R$ viram "R$ ••••" em texto, ticks, tooltip e tabela; % do orçamento e a forma da linha continuam (não revelam valor absoluto) | `ocultar-valores-provider.tsx` / `valor-monetario.tsx` |
| D8 | Simulador NÃO pré-preenche o campo com o total fútil real (vazaria no modo privacidade); botão "Usar os supérfluos de <mês>" preenche sob ação do usuário. Taxa padrão "1,00", prazo padrão "12" | decisão de UX/privacidade do Dash |
| D9 | Reais → centavos por aritmética de texto (regex), nunca `parseFloat` | lição P-009 do projeto, mesma regra de `taxaPercentualParaBps` |
| D10 | Paleta categórica do Vitrine falha o validador (8 slots): claro — banda L (`#5B4636` 0,412) e croma (`#0E7F78` 0,091, `#5B4636` 0,038); escuro — banda L nos 8, croma `#C9A68A`, piso de visão normal `#C9A68A↔#D9A838` ΔE 8,8. NÃO corrijo: só a série 1 é usada aqui (claro: PASS em tudo; escuro: contraste 6,90:1 PASS, banda L 0,718 > 0,67 FAIL). Reporto ao Maestro | `dataviz` validate_palette.js (saída na entrega) + regra "conflito de paleta → reportar" |

## 7. Riscos (o que pode dar número errado AQUI)

1. **Float em dinheiro:** `amount` chega como número JSON (`230.5`). Somar float
   do total fútil dá `0.30000000000000004`. → somar `Math.round(amount*100)` por linha.
2. **Mês do orçamento perto da meia-noite:** filtrar pelo `mes` da página, que vem de
   `hojeEmSaoPaulo()`; nunca `new Date()` no servidor (UTC na Vercel).
3. **Patrimônio com mês futuro:** a view vai até `max(mês corrente, último paid_date)`;
   `lte('month', mes)` impede que um `paid_date` futuro apareça como "hoje".
4. **Janela vs começo da série:** família nova tem 1–2 meses; < 2 pontos → sem linha,
   só o stat ("ainda há só um mês de histórico"), nunca linha de 1 ponto nem NaN.
5. **Domínio degenerado:** todos os valores iguais ou zero → `dominioBonito` expande
   (nunca `max == min`, que daria divisão por zero → NaN no `y`).
6. **Razão > 1 muito grande:** domínio compartilhado `max(1, razão)` comprime as
   outras barras — aceito (honesto); o % em texto continua exato.
7. **Categoria arquivada com orçamento no mês:** exibida com "(arquivada)", não some
   (o gasto existiu).
8. **RLS:** se as views perdessem `security_invoker`, a tela mostraria outra família.
   → gate re-prova com 2 famílias descartáveis lendo pelo cliente do usuário.
9. **Paleta escura fora da banda:** série 1 no escuro é mais clara que a banda;
   legibilidade garantida por contraste 6,9:1, mas é pendência do Vitrine.

## 8. Ordem de execução

1. `Skill(superpowers:test-driven-development)` → `tests/unit/analises-onda2.test.ts`
   vermelho (base zero, negativo, período parcial, virada de mês/ano, texto inválido).
   **Desvio previsto:** `tests/` está fora dos caminhos do briefing, mas o
   `vitest.config.mts` só inclui `tests/**` e a regra de TDD é obrigatória para a
   lógica pura. Arquivo NOVO, nenhum teste existente alterado.
2. Lógica pura (`escala-linear`, `orcamento-logica`, `patrimonio-logica`,
   `simulador-entrada`) até verde.
3. Copy em `features/analises/copy.ts` (`design:ux-copy` para rótulos/definições).
4. `GraficoLinha` → `GraficoOrcamento`, `GraficoPatrimonio`, `SimuladorFutil`.
5. `page.tsx` + `loading.tsx`.
6. `npx tsc --noEmit`, `npx vitest run`, `npx next build`.
7. Dados: família de teste descartável A (com orçamentos nas 3 faixas, 12+ meses de
   movimento), família B (isolamento), família C vazia (estado VAZIO) — criadas por
   script no scratchpad (fora do repo), apagadas no fim com contagem. Família real
   **não é tocada** (nem leitura é necessária).
8. Reconciliação: cada número da tela × SQL bruto em `transactions`/`accounts`/
   `category_budgets` (sem as views) via `npx supabase db query --db-url`.
9. Isolamento: A não lê linha de B nas duas views pelo cliente do usuário.
10. Gate visual: Playwright (o MCP falhou ao conectar nesta sessão → script
    `playwright-core` do cache do npx com o Chrome do sistema): 1440×900, 768,
    390×844, dark, VAZIO, ERRO, CARREGANDO; console sem `NaN`/erro; tempo de rede.
11. `EXPLAIN (ANALYZE)` das duas consultas como `authenticated`.
12. `Skill(code-review)` high no diff; `verification-before-completion`; auto-análise.

## 9. Pendências para outros agentes

| Para | Pendência |
|---|---|
| **Estrutura** | Não existe Server Action para criar/editar/excluir `category_budgets` (nem `account_goals`). Sem ela, o card de orçamento só mostra o estado vazio em produção. Pedido: `salvarOrcamento`/`excluirOrcamento` em `src/actions/` (Zod: categoria da família, `month` válido, `amount > 0`). |
| **Fachada** | Tela para definir orçamento por categoria/mês (provável lugar: Ajustes > Categorias), consumindo a action acima; depois, link "Definir orçamentos" no estado vazio do card. |
| **Vitrine** | (a) Paleta categórica de `chart-palette.ts` falha o validador do `dataviz` (detalhe em D10) — re-step dos slots 3, 8 (claro) e de todos no escuro para a banda L 0,48–0,67, e o par 7↔8 escuro abaixo do piso de visão normal. (b) Criar tokens de status próprios (`--status-atencao`, `--status-critico`) em vez de reaproveitar `--pendente`/`--negativo`. |
| **Maestro** | `loading.tsx` de `/analises` usa `max-w-5xl` enquanto a página usa `max-w-7xl` (pulo de layout pré-existente) — corrijo junto, por estar no meu arquivo. |

---

## 10. Execução (FASE: EXECUÇÃO, 2026-10-14) — desvios registrados

Desvio: teste em `app/tests/unit/analises-onda2.test.ts` (fora dos caminhos do briefing) — `vitest.config.mts` só inclui `tests/**`; arquivo NOVO, nenhum teste existente tocado (previsto em §8).
Desvio: **fórmula da razão do orçamento** — a tela NÃO usa `used_ratio` da view; recalcula `round(gasto·100)/round(limite·100)` exato. Motivo: `used_ratio` é `round(…, 4)` e R$ 2.000,09 de R$ 2.000,00 vira 1,0000 → "Atenção · 100%" num orçamento estourado (achado do `code-review` high). Teste: "estouro de centavos".
Desvio: `formatarEixoBRL(valor, passo?)` — as casas decimais do tick saem do passo do eixo (1.250 com passo 250 = "R$ 1,25 mil", não "R$ 1,3 mil"). Achado do `code-review`.
Desvio: `reaisParaCentavos` virou `lerReais(texto): { ok: true; centavos } | { ok: false; motivo: 'formato' | 'grande_demais' }` — mensagem certa para valor grande demais (teto de `LIMITES_SIMULACAO`).
Desvio: simulador usa SÓ `projetarValorFuturo` (valor final = último ponto, mesma `serieExata`), com `useMemo` — antes calculava a série BigInt duas vezes por tecla.
Desvio: no modo privacidade o botão "Usar os supérfluos" some (escreveria o valor em claro no campo), a variação do patrimônio perde a cor receita/despesa e a linha do zero não se destaca.
Desvio: rótulos do eixo X a cada 80px (não 64) — "mês 112"/"mês 120" colidiam.
Desvio: tooltip no toque não fecha no `pointerleave` de touch (fecha no blur) e o alvo tem `touch-action: pan-y`.
Desvio: estado vazio do patrimônio diz "Sem histórico de patrimônio até <mês>" (o texto antigo mandava cadastrar conta mesmo para família com conta navegando para antes do histórico).
Desvio: `EXPLAIN (ANALYZE)` rodou como `postgres` com `family_id` explícito, não como `authenticated` — `npx supabase db query` não aceita multi-comando (SET ROLE) e o cliente `pg` exigiria desligar a verificação TLS; não fiz.
Desvio: rota temporária `src/app/dash-estados/` criada só para screenshot de ERRO/CARREGANDO (bloqueada fora de `development`) e APAGADA antes do `next build`.

Achado do `code-review` REJEITADO: limitar o eixo de razão compartilhado (ex.: 150%) quando um orçamento estoura muito — seria eixo truncado em gráfico de barra; o % exato continua em texto em cada linha.
