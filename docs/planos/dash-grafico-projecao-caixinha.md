# Plano Dash — Gráfico de projeção por caixinha (Carteira de Investimento, Task 5)

> FASE: PLANO. Autor: Dash. Data: 2026-10-26.
> Governado por `docs/superpowers/plans/2026-10-16-carteira-investimento.md`, Task 5
> (forma já decidida: linha, eixo único, nunca dual-axis; não é revisitada aqui), e
> pela spec `docs/superpowers/specs/2026-10-16-carteira-investimento-design.md` §3
> (decisão 4b: rendimento só vira saldo depois de confirmado à mão) e §5.
> Skills carregadas para este plano: `dataviz` (SKILL.md, choosing-a-form,
> marks-and-anatomy, interaction, anti-patterns) e `supabase:supabase` (leitura pela
> sessão, RLS, views). `supabase:supabase-postgres-best-practices` **não** foi
> carregada: este plano não cria view, índice, função nem cron (ver §5). Se a
> execução precisar de qualquer DDL, carrego antes, e isso vira linha `Desvio:`.
> Back-end consumido sem alterar: migrations `00016_carteira_investimento.sql` e
> `00017_carteira_rendimento_mes_encerrado.sql`, `src/types/database.ts`,
> `src/lib/simulador.ts`, `src/lib/hoje.ts`.

---

## 0. Handoffs recebidos

| Insumo | Estado |
|---|---|
| Contrato do Estrutura PARA O DASH | **Recebido** (no briefing do Maestro e em `docs/planos/estrutura-carteira-investimento.md` §8.2). Conferido contra as migrations 00016/00017 e contra `src/types/database.ts` (linhas 319, 398, 1114–1135). **Uma divergência:** o §8.2 do plano do Estrutura ainda diz que `balance_cents` é "principal **sem** rendimento". Isso ficou desatualizado depois da decisão 4b. A migration (00016:93-94, `COMMENT ON COLUMN`) e o briefing dizem "principal + rendimento CONFIRMADO". **Vale a migration.** Repassar ao Estrutura para corrigir o documento (§9). |
| Paleta de séries do Vitrine | **Recebida**: `src/styles/chart-palette.ts` + `--chart-1` em `globals.css`. Este gráfico usa **só a série 1** (`var(--chart-1)`): claro `#2F6DB5`, 5.28:1 sobre o card; escuro `#5794DF`, 5.48:1. Os dois passam no validador, com os números medidos registrados no próprio arquivo. Nenhuma cor nova, nenhum hex novo. |
| Referência do Radar | `Glob docs/pesquisa/*radar*.md`: nada sobre carteira. `SUPOSIÇÃO: sem referência de gráfico do Radar — tipo de gráfico derivado da métrica e do briefing.` |
| Invólucro do Fachada | **Recebido**: o Card "Projeção de Rendimento" em `area-investimentos.tsx:400-500`, com cabeçalho, seletor de caixinha, 3 tiles de resumo e o slot `#container-grafico-projecao-caixinha` (linha 479), que cita `GraficoProjecaoCaixinha` (linha 490). **Mas a área ainda roda sobre `MOCK_CARTEIRA_INVESTIMENTO`** (linhas 38 e 62), e `carteira/page.tsx` não lê nada da carteira. Isso é uma dependência que bloqueia o gate visual (§8, etapa 7, e §9). |

---

## 1. Arquivos a criar / alterar

| Arquivo | Ação | Conteúdo | Dono |
|---|---|---|---|
| `app/src/components/carteira/projecao-caixinha-logica.ts` | criar | lógica **pura**: tipos de entrada, mês em São Paulo, série histórica de saldo confirmado, série de simulação (chama `projetarValorFuturo`), pendentes na janela, estado do gráfico, conferência de que a série fecha | Dash |
| `app/src/components/carteira/grafico-projecao-caixinha.tsx` | criar | `'use client'`. Componente `GraficoProjecaoCaixinha` + `GraficoProjecaoCaixinhaSkeleton` + constante `ALTURA_GRAFICO_PROJECAO` | Dash |
| `app/src/lib/queries/carteira-projecao.ts` | criar | `import 'server-only'`. `lerDadosProjecaoCarteira(supabase, familyId)`: 1 SELECT paginado de movimentos + 1 RPC de pendentes | Dash (pasta nova `src/lib/queries/`, convenção do Dash) |
| `app/src/components/analises/grafico-linha.tsx` | **alterar, só com props aditivas** | suporte a trecho projetado (tracejado), marcador de mês pendente, nota no tooltip, marco "hoje" e formatação de valor por ponto. Sem a prop nova, o resultado é **idêntico** ao de hoje (patrimônio e simulador não mudam) | Dash (componente já publicado pelo Dash) |
| `app/src/features/carteira/copy.ts` | alterar (acrescentar chaves) | rótulos, legenda, definição, estados vazio/erro, textos do tooltip e da tabela | Dash, só as chaves `PROJECAO_*` |
| `app/tests/unit/projecao-caixinha.test.ts` | criar | TDD da lógica pura (§7) | Dash |
| `app/tests/unit/grafico-linha.test.tsx` | criar | regressão do `GraficoLinha` sem as props novas + o trecho projetado | Dash |
| `app/tests/unit/grafico-projecao-caixinha.test.tsx` | criar | estados VAZIO/ERRO/sem projeção, modo privacidade (L-003) | Dash |
| `app/tests/integration/projecao-caixinha-reconciliacao.mjs` | criar | família descartável via service_role; SQL bruto × função de leitura × lógica; limpeza no `finally` | Dash |

**Fora do meu território. Peço ao Maestro (§9) que decida quem faz:**
- `area-investimentos.tsx`: trocar o placeholder do slot (linhas 478–497) por `<GraficoProjecaoCaixinha …/>`, receber os dados por prop e trocar o mock por dados reais.
- `carteira/page.tsx`: chamar `lerDadosProjecaoCarteira` no `Promise.all` e passar o resultado para baixo.
- `carteira/loading.tsx`: incluir `GraficoProjecaoCaixinhaSkeleton` no lugar do card.

**Acréscimo à tabela "Quem toca o quê" do plano mestre:** ela só lista
`grafico-projecao-caixinha.tsx` para o Dash. Os outros 8 arquivos acima também são do
Dash: lógica, query, testes e o `GraficoLinha` que o próprio Dash publicou. Nenhum deles
é da Fachada nem do Estrutura. Registro aqui para não chegar como desvio silencioso.

**Biblioteca de gráfico:** nenhuma nova. `package.json` (lido em 2026-10-26) não tem
`recharts` nem `@tremor/*`. Todos os gráficos do projeto são SVG à mão, e
`GraficoLinha` é reaproveitado, como o plano mestre exige. O bundle não cresce.

---

## 2. Forma final do gráfico

### 2.1 O que o gráfico responde

"Quanto esta caixinha tem de verdade (confirmado) ao longo do tempo, e quanto ela
teria nos próximos 12 meses se continuar rendendo a taxa informada?" É uma série só
(o saldo da caixinha), vista em **dois estados de certeza**: medido e simulado. Não
são duas séries.

### 2.2 Forma: linha, uma série, um eixo Y em R$

- **Linha.** Fonte: `dataviz/references/choosing-a-form.md`, "Trend over time → line;
  area for a single series". A forma também já está fixada no plano mestre (Task 5) e
  em `PLANO.md` §8, para patrimônio e simulador.
- **Um eixo Y só.** Fonte: `dataviz/SKILL.md`, Non-negotiables, "One axis. Never a
  dual-axis chart", e `anti-patterns.md`, primeiro item. Histórico e simulação são a
  mesma grandeza (R$) e dividem o mesmo eixo. Taxa, rendimento mensal e saldo **não**
  dividem o gráfico: a taxa fica no tile "Taxa simulada" da Fachada, e o rendimento
  pendente fica no tooltip e no aviso abaixo do gráfico.
- **Eixo X:** um ponto por mês (chave `'YYYY-MM'`). Até **12 meses de histórico**
  terminando no mês corrente de São Paulo, cortados no mês de criação da caixinha, mais
  **12 meses de simulação** à frente. No máximo 25 pontos.
- **Eixo Y com zero** (`incluirZero`) quando os valores estão visíveis. Isso mostra a
  grandeza com honestidade: 1% ao mês vira uma subida suave, não uma "explosão". Saldo
  de caixinha nunca é negativo (`CHECK balance_cents BETWEEN 0 AND …`), então o zero não
  é cruzado e não existe "linha do zero destacada". No modo privacidade o zero sai do
  domínio (§6).

### 2.3 Como o gráfico separa histórico confirmado de simulação

A separação nunca depende só de cor: a cor é a mesma (`--chart-1`) nos dois trechos.
Ela é carregada por quatro canais redundantes:

| Canal | Histórico confirmado | Simulação |
|---|---|---|
| **Traço** | sólido, 2px, junção e ponta redondas | **tracejado** 2px (`stroke-dasharray` ≈ 4 6 com ponta redonda, conferido no screenshot) |
| **Área** | lavagem de 10% (`fill-opacity 0.1`) só sob o trecho confirmado | **sem área**: a lavagem daria "volume" a um valor hipotético |
| **Texto do valor** | `R$ 12.000,00` | `≈ R$ 13.530,18` (prefixo "≈" no rótulo direto, no tooltip e na tabela) |
| **Rótulo / tabela** | situação "Confirmado" | situação "Simulação (1,02% a.m.)" |

Fonte do tracejado: o `dataviz` reserva o traço tracejado para o sentido de
projeção. `anti-patterns.md` ("Dashed gridlines or axis rules… reads as 'projection'
or 'threshold'") e `marks-and-anatomy.md` (grade "hairline (1px), **solid** (never
dashed)") tratam o tracejado como o sinal de "projeção". Por isso a grade continua
sólida, e o único tracejado do gráfico é a simulação. Assim o sinal não tem ambiguidade.

**Ponto de junção "hoje":** fica no mês corrente e vale `balance_cents`, o saldo
confirmado de agora. É dado real, então o ponto é **cheio** (r=4, anel de 2px na cor da
superfície, `marks-and-anatomy.md` "Surface ring"). Uma linha vertical hairline sólida
`var(--border)` marca a junção, com o rótulo "hoje" em `text-muted-foreground`, no topo.
Esse marco é de tempo e não revela valor.

**Ponto final da simulação:** **vazado** (fill `--card`, traço `--chart-1`). É a mesma
convenção que o `GraficoLinha` já usa para "não é valor fechado". Ele recebe o **único
rótulo direto** do gráfico: `≈ R$ X`. Fonte: `marks-and-anatomy.md`, "Lines → value at
the end" e "Label selectively". O valor de hoje já aparece no tile "Saldo atual" da
Fachada, e repeti-lo no gráfico seria rótulo em excesso.

### 2.4 Os "buracos": meses fechados com rendimento ainda não confirmado

**Decisão:** o mês pendente **não** abre um buraco na linha, e o rendimento estimado
**não** entra na linha sólida. Motivo: o saldo daquele mês é real e é exatamente o que
estava resgatável. O "buraco" é de rendimento, não de saldo. Desenhar a linha sólida
somando o estimado violaria a spec §4b ("só quando o usuário confirma, aquele valor…
soma ao `balance_cents`"). Quebrar a linha mentiria de outro jeito, dizendo "não
sabemos o saldo".

A pendência é comunicada por três canais, nenhum só de cor:

1. **Marcador de forma** no ponto sólido do mês pendente: **losango vazado**, ≥ 9px,
   traço `--chart-1`, preenchimento `--card`, sempre visível. É uma forma distinta do
   círculo cheio (real) e do círculo vazado (fim da simulação). Fonte:
   `marks-and-anatomy.md` (marcador ≥ 8px com anel da superfície) e a regra "série nunca
   distinguida só por cor" do meu arquivo de agente. Losango já é um dos `MARCADORES` de
   `chart-palette.ts`.
2. **Nota no tooltip e na tabela** daquele mês: "Rendimento de R$ 25,50 a confirmar".
3. **Aviso abaixo do gráfico**, quando existe pendência em qualquer mês, inclusive fora
   da janela: "2 meses com rendimento estimado a confirmar (R$ 51,26). Esse valor ainda
   não está no saldo nem entra na simulação." O botão "Confirmar" **não** é do Dash: é
   fluxo da Fachada, com `confirmarRendimentoMensal`. O aviso só informa.

**A simulação parte de `balance_cents`, sem os pendentes.** É a mesma regra §4b
aplicada ao futuro: estimativa não confirmada não pode virar juros compostos. Isso
também garante continuidade visual (o tracejado começa exatamente onde o sólido
termina) e a reconciliação "ponto hoje = tile Saldo atual = `balance_cents`".

**`carteira_rendimento_calculado` (estimativa do mês em andamento): não entra no
gráfico.** Motivos: (a) o tooltip de "hoje" mostraria "estimado do mês: R$ 50" e o
ponto seguinte da simulação mostraria +R$ 100. São duas estimativas com bases
diferentes no mesmo gráfico: a RPC usa a base antes do dia 1 e a simulação usa o saldo
de hoje. Isso é exatamente o "número com cara de confiável que não fecha". (b) Seriam N
chamadas de RPC, uma por caixinha. Se a Fachada quiser a estimativa do mês no card da
caixinha, a função existe para isso.

### 2.5 Legenda de traço (chave)

Com uma série só, o `dataviz` dispensa a caixa de legenda ("A single series needs no
legend box"). Aqui existem **três codificações de estado** (sólido, tracejado, losango),
e o sentido do tracejado não pode depender de convenção. Por isso o gráfico tem uma
**chave de traço** numa linha acima do plot, e não uma legenda de séries: `— Saldo
confirmado`, `- - Simulação`, e `◇ Rendimento a confirmar` (este só quando há pendente
na janela). Os traços da chave são mini-SVG na cor `--chart-1`, espelhando a marca
("Legends still mirror the mark: … line for lines", `interaction.md`). O texto usa
`text-muted-foreground`, nunca a cor da série ("Text never wears the data color").

### 2.6 Interação (herdada do `GraficoLinha`)

Fonte: `interaction.md`.
- Crosshair que acha o X mais próximo, com alvo de ponteiro do tamanho do plot inteiro.
- Tooltip com o valor em destaque e o rótulo depois ("Values lead, labels follow"),
  chave em traço curto. O traço é **tracejado** quando o ponto é projetado.
- Teclado ←/→/Home/End/Esc mostra o mesmo que o hover. `aria-live` lê
  "novembro de 2026, simulação: aproximadamente R$ 13.530,18".
- **Tabela** (`<details>` "Ver tabela") com Mês | Saldo | Situação, para o tooltip
  nunca ser o único caminho até o valor ("Tooltips enhance, never gate").
- Troca de caixinha: o seletor é da Fachada. O componente recebe `key={caixinha.id}`
  para remontar limpo, sem skeleton no refetch ("Refetch keeps the frame").

### 2.7 Mark specs aplicadas

Fonte: `marks-and-anatomy.md`. Linha 2px. Marcadores r ≥ 4 (8px) com anel de 2px
`--card`. Área a 10%. Grade hairline 1px sólida `--border`, `shapeRendering
crispEdges`, até 4 ticks "bonitos" (`dominioBonito`) e rótulo de eixo com precisão
derivada do passo (`formatarEixoBRL`, L-002). Altura total
`ALTURA_GRAFICO_LINHA = 220`, que já inclui a faixa do eixo X. A seção
"Bad: A chart container whose fixed height excludes the x-axis band" é respeitada.

---

## 3. KPIs e séries: fórmula, janela, fuso, origem

**Fuso de toda conta: America/Sao_Paulo.** `occurred_on` e `competencia` são `date` sem
fuso, já em São Paulo (contrato do Estrutura e `COMMENT`s da 00016/00017). A chave de
mês sai de `occurred_on.slice(0, 7)`, sem `new Date()` e sem conversão. O único
`timestamptz` usado é `investment_boxes.created_at`. Ele vira mês de São Paulo com
`Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`, a mesma técnica de
`hojeEmSaoPaulo()`. É a mesma regra do banco
(`date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')`, 00017:186). O mês
corrente vem do servidor (`hojeEmSaoPaulo().slice(0, 7)`) como prop. Nunca vem do
relógio do navegador, o que evita divergência de hidratação e virada às 21h de Brasília.

| Métrica | Fórmula literal | Janela | Origem (schema real) |
|---|---|---|---|
| **Saldo confirmado no fim do mês M** | `Σ amount_cents × (kind='saida' ? −1 : +1)` sobre os movimentos da caixinha com `occurred_on ≤ último dia de M`. Rendimento confirmado entra no mês da competência, porque a 00017 data o movimento no **último dia da competência** (00017:418, 440) | do mês de criação (SP) ao mês corrente; exibe os últimos 12 | `investment_box_movements(box_id, kind, amount_cents, occurred_on)` |
| **Saldo confirmado hoje** (ponto de junção) | `investment_boxes.balance_cents` | instante da leitura | `investment_boxes.balance_cents` |
| **Invariante de fechamento** | `Σ movimentos assinados (todos) == balance_cents`. Toda escrita que muda `balance_cents` grava um movimento na mesma transação: `carteira_aplicar` com caixinha, `carteira_alocar`, `carteira_resgatar`, `carteira_confirmar_rendimento`. Aplicar **sem** caixinha não toca caixinha | — | as duas acima |
| **Simulação, mês k** (k = 1..12) | `projetarValorFuturo({ valorCentavos: balance_cents, taxaMensalBps: rate_bps, meses: 12 }).pontos[k].valorCentavos`, plotado no mês `somarMeses(mesAtual, k)`. Juros compostos exatos em BigInt, um arredondamento meio-para-cima. **Sem** aportes, **sem** resgates, **sem** pendentes, taxa **atual** | 12 meses após o corrente | `src/lib/simulador.ts`, `investment_boxes.rate_bps` |
| **Rendimento a confirmar** (por mês e total) | `rendimento_cents` de cada linha de `carteira_rendimentos_pendentes()` com `caixinha_id` = a caixinha. Total = soma em centavos inteiros | meses **encerrados** abertos (a 00017 já exclui o mês corrente e os anteriores ao último confirmado) | RPC `carteira_rendimentos_pendentes()`, `SECURITY INVOKER` |

**Taxa histórica (`investment_box_rates`): não é lida pelo gráfico, e de propósito.** O
valor de cada rendimento já confirmado está gravado em `amount_cents`, e o valor de cada
pendente vem calculado pela RPC com a taxa do fim do mês (00017 bloco 2). Recalcular
rendimento passado em TypeScript duplicaria a regra do banco e um dia divergiria. A
simulação usa `rate_bps`, a taxa atual, porque é sobre o futuro, onde a taxa vigente é
a atual.

**Definição visível na UI** (`<details>` "Como calculamos", texto idêntico ao que vai
para a entrega; `design:ux-copy` na EXECUÇÃO só para polir, sem mudar o sentido):

> **Saldo confirmado:** o que estava na caixinha no fim de cada mês: aplicações e
> alocações, menos resgates, mais os rendimentos que vocês já confirmaram. Rendimento
> estimado só entra depois de confirmado.
> **Simulação (linha tracejada):** o saldo confirmado de hoje rendendo a taxa atual da
> caixinha ({taxa} a.m., informada em {dd/mm/aaaa}) com juros compostos, mês a mês, por
> 12 meses, sem novas aplicações nem resgates. É uma estimativa, não uma promessa de
> rendimento.

Abaixo da definição: "Atualizado em {dd/mm/aaaa hh:mm} (horário de Brasília)", a mesma
chave `atualizadoEm` de `/analises`.

**Variação percentual:** o gráfico **não** exibe nenhuma ("+12,7% em 12 meses"). Sem %,
não existe caso de base zero. Se a Fachada ou o Maestro quiserem esse número, ele vira
uma função pura com o caso `saldo = 0 → "—"` testado. Não é escopo deste plano.

---

## 4. Assinaturas

### 4.1 Lógica pura — `app/src/components/carteira/projecao-caixinha-logica.ts`

```ts
export type TipoMovimento = 'entrada' | 'saida' | 'rendimento'

export interface MovimentoCaixinha {
  caixinhaId: string
  tipo: TipoMovimento
  valorCentavos: number        // inteiro > 0 (CHECK 1..99999999999999)
  ocorridoEm: string           // 'YYYY-MM-DD', data de calendário SP
}

export interface RendimentoPendente {
  caixinhaId: string
  competencia: string          // 'YYYY-MM-01'
  valorCentavos: number        // inteiro > 0
}

export interface CaixinhaParaProjecao {
  id: string
  name: string
  rate_bps: number
  rate_defined_at: string      // 'YYYY-MM-DD'
  balance_cents: number
  created_at: string           // timestamptz ISO
}

export type SituacaoPonto = 'confirmado' | 'hoje' | 'simulacao'

export interface PontoProjecaoCaixinha {
  mes: string                  // 'YYYY-MM'
  valorCentavos: number
  situacao: SituacaoPonto
  pendenteCentavos: number     // 0 = sem pendência neste mês
}

export type EstadoProjecao =
  | { tipo: 'vazio' }                                    // sem movimento e saldo 0
  | { tipo: 'divergente' }                               // Σ movimentos ≠ balance_cents, ou saldo < 0
  | { tipo: 'sem_simulacao'; pontos: PontoProjecaoCaixinha[]; motivo: 'saldo_zero' | 'resultado_grande_demais' }
  | { tipo: 'ok'; pontos: PontoProjecaoCaixinha[]; indiceHoje: number; valorFinalCentavos: number }

/** 'timestamptz ISO' -> 'YYYY-MM' em America/Sao_Paulo. */
export function mesEmSaoPaulo(instanteIso: string): string

/** Monta a série inteira. Nunca lança exceção (roda em render). */
export function montarProjecaoCaixinha(entrada: {
  caixinha: CaixinhaParaProjecao
  movimentos: MovimentoCaixinha[]      // só desta caixinha (a função refiltra por id)
  pendentes: RendimentoPendente[]      // só desta caixinha (refiltra)
  mesAtual: string                     // 'YYYY-MM' SP
  mesesHistorico?: number              // padrão 12
  mesesProjecao?: number               // padrão 12, 1..LIMITES_SIMULACAO.mesesMax
}): EstadoProjecao

/** Total pendente da caixinha em centavos (todos os meses, inclusive fora da janela) e quantidade de meses. */
export function totalPendente(pendentes: RendimentoPendente[], caixinhaId: string): { meses: number; centavos: number }

/** Para o tile "Projeção em 12 meses" da Fachada bater com o fim do gráfico. */
export function valorProjetadoCentavos(balanceCents: number, rateBps: number, meses: number): number | null
```

### 4.2 Leitura — `app/src/lib/queries/carteira-projecao.ts`

```ts
import 'server-only'
import type { ClienteServidor } from '@/actions/contexto-familia'
import type { MovimentoCaixinha, RendimentoPendente } from '@/components/carteira/projecao-caixinha-logica'

export type DadosProjecaoCarteira =
  | { ok: true; movimentos: MovimentoCaixinha[]; pendentes: RendimentoPendente[]; lidoEm: string }
  | { ok: false }

export async function lerDadosProjecaoCarteira(
  supabase: ClienteServidor,   // cliente @supabase/ssr da SESSÃO (nunca servico.ts)
  familyId: string,
): Promise<DadosProjecaoCarteira>
```

- Movimentos: `.from('investment_box_movements').select('box_id,kind,amount_cents,occurred_on').eq('family_id', familyId).order('occurred_on').order('id')`,
  **paginado** com `.range()` em blocos de 1000 até vir um bloco menor que 1000.
  Motivo: `supabase/config.toml:18 max_rows = 1000`, e o padrão hospedado também é
  1000. Sem paginação, uma família com histórico longo teria a série **truncada em
  silêncio**. A invariante da §3 pega o corte, mas o certo é não cortar.
- Pendentes: `.rpc('carteira_rendimentos_pendentes')`. É uma chamada só para todas as
  caixinhas. Se a Fachada também precisar da lista (botão "Confirmar?"), a página faz
  **uma** chamada e repassa o resultado aos dois.
- Autorização: filtro explícito `family_id` + RLS `investment_box_movements_select`
  (00016:181), a mesma dupla camada das Actions. A RPC é INVOKER e o RLS restringe à
  família da sessão.
- `kind` vem como `string` nos tipos gerados. Ele é estreitado por guarda. Linha com
  `kind` desconhecido → `{ ok: false }`, para nunca plotar dado que eu não sei somar.
- Qualquer `error` do Supabase → `{ ok: false }`, e o componente mostra o estado ERRO.
  Nunca vira lista vazia, porque lista vazia viraria o estado VAZIO, que é mentira.

### 4.3 Componente — `app/src/components/carteira/grafico-projecao-caixinha.tsx`

**Nome confirmado: `GraficoProjecaoCaixinha`**, o nome que o slot da Fachada já espera
(`area-investimentos.tsx:490`). Export nomeado, sem default.

```ts
export interface GraficoProjecaoCaixinhaProps {
  caixinha: CaixinhaParaProjecao        // compatível com CaixinhaInvestimento de tipos-investimentos.ts
  movimentos: MovimentoCaixinha[]       // pode ser a lista da família inteira; o componente filtra por caixinha.id
  pendentes: RendimentoPendente[]       // idem
  mesAtual: string                      // 'YYYY-MM' SP, calculado no servidor
  atualizadoEm: string                  // 'dd/mm/aaaa hh:mm' SP
  erro?: boolean                        // true quando lerDadosProjecaoCarteira devolveu { ok: false }
  aoTentarNovamente?: () => void        // a Fachada passa router.refresh()
  mesesProjecao?: number                // padrão 12 (bate com "Simulação dos próximos 12 meses" do cabeçalho)
}

export const ALTURA_GRAFICO_PROJECAO: number   // chave + gráfico (ALTURA_GRAFICO_LINHA) + aviso + "Ver tabela" + definição
export function GraficoProjecaoCaixinha(props: GraficoProjecaoCaixinhaProps): JSX.Element
export function GraficoProjecaoCaixinhaSkeleton(): JSX.Element   // MESMA altura total (ALTURA_GRAFICO_PROJECAO)
```

Uso esperado no slot (para a Fachada colar):

```tsx
<GraficoProjecaoCaixinha
  key={caixinhaProjecao.id}
  caixinha={caixinhaProjecao}
  movimentos={projecao.ok ? projecao.movimentos : []}
  pendentes={projecao.ok ? projecao.pendentes : []}
  mesAtual={mesAtual}
  atualizadoEm={atualizadoEm}
  erro={!projecao.ok}
  aoTentarNovamente={() => router.refresh()}
/>
```

**Altura do skeleton:** `ALTURA_GRAFICO_PROJECAO` é a altura do estado com o aviso de
pendentes em **uma linha**, com `<details>` fechados. Sem pendentes, o slot do aviso
mantém essa altura com `min-height` e mostra o "Atualizado em" ali. Assim o skeleton e o
conteúdo final têm a mesma altura nos dois casos. O aviso fica **abaixo** do plot: se
ele quebrar em 2 linhas a 390px, só o que está embaixo do gráfico se move. O screenshot
de 390px confere isso.

O componente **não** tem Card próprio: o invólucro é da Fachada. Ele renderiza a chave
de traço, o `GraficoLinha`, o aviso de pendentes, o "Ver tabela", "Como calculamos" e
"Atualizado em". Lê `useOcultarValores()` sozinho, como o `GraficoPatrimonio`.

### 4.4 Alterações aditivas em `GraficoLinha` (`app/src/components/analises/grafico-linha.tsx`)

```ts
export interface PontoLinha {
  // …campos atuais inalterados (chave, rotuloEixo, rotuloLongo, valor, parcial)
  /** true = valor simulado. Os projetados formam um bloco CONTÍGUO no fim; senão, tudo vira sólido. */
  projetado?: boolean
  /** Marcador permanente no ponto (losango vazado). */
  marcador?: 'pendente'
  /** Linha extra no tooltip e na leitura acessível (já mascarada por quem chama). */
  nota?: string
}

export interface GraficoLinhaProps {
  // …props atuais
  formatarValor: (valor: number, ponto?: PontoLinha) => string   // 2º argumento opcional: compatível
  /** Marco vertical de "hoje" no índice informado. */
  marcoHoje?: { indice: number; rotulo: string }
  /** false = sem área mesmo com incluirZero (modo privacidade). Padrão: true. */
  mostrarArea?: boolean
}
```

Regras da alteração:
- Sem nenhum `projetado`/`marcador`/`nota`/`marcoHoje`/`mostrarArea`, o SVG gerado é
  **byte a byte igual** ao atual. Prova: teste de regressão escrito **antes** da edição,
  com fixture de patrimônio e de simulador (§7.2).
- Trecho projetado: o caminho é dividido no índice de junção `j` (último ponto não
  projetado). O sólido mantém a animação de desenho atual (`pathLength`/`strokeDashoffset`).
  O tracejado **não** pode usar esse truque, porque ele ocupa o `stroke-dasharray`.
  Ele entra com `opacity 0→1` depois de 850ms. Com `prefers-reduced-motion`, as duas
  transições são desligadas (`motion-reduce:transition-none`).
- Área: com `incluirZero && mostrarArea`, vai só de `0..j`.
- Ponto final projetado: vazado, sem o texto "(parcial)".

---

## 5. Views, índices e funções de leitura

**Nenhuma view, nenhum índice, nenhuma função, nenhum cron novos.**

- A série cabe numa leitura direta da tabela já protegida por RLS
  (`investment_box_movements_select`, `TO authenticated`, `family_id =
  get_user_family_id_self()`) e numa RPC `SECURITY INVOKER` já publicada. Não existe
  agregação no banco que justifique uma view. A cardinalidade é "dezenas de caixinhas,
  poucos movimentos por mês" (contrato do Estrutura).
- **Decisão de `security_invoker`: não se aplica, porque não há view.** Se a medição da
  etapa 8 mostrar que a leitura bruta é cara e uma view de saldo mensal se justificar,
  ela nasce `WITH (security_invoker = true)`, conforme `supabase:supabase` ("Views bypass
  RLS by default… use `security_invoker = true`"). Antes disso, carrego
  `supabase:supabase-postgres-best-practices`, e o caso vira linha `Desvio:`. View
  materializada: **não**, porque o dado é multi-tenant e ela não respeita
  `security_invoker`.
- Índice que serve à leitura: `idx_box_movements_family_box_date (family_id, box_id,
  occurred_on)` (00016:145). Ele cobre o filtro por `family_id`. A ordenação por
  `occurred_on` sem `box_id` no filtro pode custar um sort em memória, irrelevante nessa
  cardinalidade. `EXPLAIN (ANALYZE)` vai colado na entrega, sem estimativa.
- **Prova de isolamento** (mesmo sem view): no script de reconciliação, autenticado como
  a família A, `lerDadosProjecaoCarteira` e `carteira_rendimentos_pendentes()` não
  devolvem nenhuma linha da família B. Também roda o caso hostil de passar o
  `familyId` de B com a sessão de A: o RLS devolve zero linhas. A saída vai colada.

---

## 6. Modo Privacidade (`fad.ocultarValores`, L-003)

Regra: no modo oculto, **nenhum canal** revela valor absoluto nem proporção. Não basta
trocar o número escrito.

| Canal | Visível | Oculto |
|---|---|---|
| Ticks do eixo Y | `formatarEixoBRL` | `•••` (comportamento atual do `GraficoLinha`) |
| Rótulo direto do fim, tooltip, `aria-live`, tabela | `≈ R$ 13.530,18` | `≈ ` + `formatBRL(0, true)` (a máscara do projeto) nos pontos simulados e só a máscara nos confirmados. O "≈" fica porque diz o estado (simulação), não o valor |
| Nota de pendente no tooltip e na tabela | "Rendimento de R$ 25,50 a confirmar" | "Rendimento a confirmar" (sem valor) |
| Aviso de pendentes | "2 meses… (R$ 51,26)" | "2 meses com rendimento estimado a confirmar." A **quantidade** de meses fica, porque não é dinheiro. O valor sai |
| **Zero no domínio Y** | incluído | **removido** (`incluirZero = false`): o zero é a referência que deixa ler a proporção "rendeu 13% no ano" e o tamanho relativo de um resgate. L-003, "linha de referência no zero" |
| **Área de 10%** | sob o trecho confirmado | **removida** (`mostrarArea = false`). L-003, "preenchimento de área proporcional ao valor" |
| Cor | uma cor só (`--chart-1`), sem cor de ganho ou perda | igual. Não existe `text-receita`/`text-despesa` no componente |
| Marco "hoje", losango, tracejado | visíveis | visíveis: são tempo e estado, não valor |
| Tile "Projeção em 12 meses" e "Saldo atual" (Fachada) | — | **hoje vazam**: `area-investimentos.tsx:452` e `:470` usam `formatBRL` sem máscara. Pendência para a Fachada (§9) |

**O que continua visível no modo oculto, e por quê:** o **formato** da linha (sobe,
desce) sem escala absoluta nem zero. É o mesmo padrão aceito no `GraficoPatrimonio`
depois do code-review da L-003. A forma sem escala não permite reconstruir nenhum valor.

**L-001:** o componente não classifica nada ("rendendo bem/mal" não existe). O único
limiar é "tem pendente?", e ele se decide por `rendimento_cents > 0` inteiro, nunca por
valor arredondado. O "≈" e a máscara só existem na formatação.

---

## 7. Testes — TDD (`superpowers:test-driven-development` na EXECUÇÃO, antes da implementação)

### 7.1 `tests/unit/projecao-caixinha.test.ts` (lógica pura)

- **Série histórica:** soma assinada no fim do mês; mês sem movimento repete o saldo
  anterior; saída reduz; rendimento datado no último dia da competência entra naquele
  mês, e não no mês da confirmação; corte de 12 meses preserva a base acumulada (o
  primeiro ponto da janela inclui movimentos anteriores a ela).
- **Base zero:** sem movimento e saldo 0 → `vazio`. Histórico com saldo final 0 (tudo
  resgatado) → `sem_simulacao` / `saldo_zero`. Taxa 0 → simulação plana igual ao saldo,
  sem `NaN`.
- **Valor negativo:** um movimento que levaria a soma abaixo de 0 (dado corrompido) →
  `divergente`, nunca plotado.
- **Invariante:** Σ movimentos ≠ `balance_cents` → `divergente` (por exemplo, a corrida
  entre a leitura das caixinhas e a dos movimentos). Igual → `ok`, com o ponto de hoje
  igual a `balance_cents`.
- **Período parcial:** o mês corrente é o ponto "hoje" (situação `hoje`), nunca
  "fim do mês"; a simulação começa em `mesAtual + 1`; `pontos[indiceHoje + k]` é igual
  a `projetarValorFuturo(...).pontos[k]` para k = 1..12.
- **Caixinha criada no mês corrente:** 1 ponto sólido (hoje) + 12 simulados; sem área;
  sem `NaN` na geometria de um trecho sólido de um ponto só.
- **Virada de fuso:** `created_at = '2026-09-01T02:00:00Z'` → mês de criação `2026-08`
  (23h de 31/08 em São Paulo); `'2026-09-01T03:00:00Z'` → `2026-09`. Movimento
  `occurred_on = '2026-08-31'` fica em agosto sem conversão alguma.
- **Pendentes:** só marcam meses dentro da janela; o total inclui os de fora; a soma é
  em centavos inteiros; pendente de outra caixinha é ignorado.
- **Teto:** `resultado_grande_demais` → `sem_simulacao`, sem exceção.
- `valorProjetadoCentavos` é igual ao último ponto da série (o tile da Fachada e o
  gráfico mostram o mesmo número).

### 7.2 `tests/unit/grafico-linha.test.tsx` — escrito ANTES de editar o `GraficoLinha`

- Regressão: o `innerHTML` do SVG com fixtures de patrimônio (com mês parcial) e de
  simulador, sem props novas, é igual ao snapshot capturado do código atual.
- Trecho projetado: 2 `<path>` de linha, o segundo com `stroke-dasharray`; área só até a
  junção; ponto final vazado; losango presente no índice marcado; `marcoHoje` desenhado.
- `setup.ts` não tem `ResizeObserver`: o teste usa um stub local com largura fixa e não
  mexe no setup global.

### 7.3 `tests/unit/grafico-projecao-caixinha.test.tsx`

- Estados VAZIO, ERRO (botão "Tentar de novo" chama `aoTentarNovamente`),
  `sem_simulacao` e `divergente` (que mostra o estado de erro, nunca um número).
- **Privacidade** com `fad.ocultarValores = '1'` no `localStorage`, dentro do provider:
  o texto do contêiner não casa com `/R\$\s?\d/`; não existe `path` de área; não existe
  classe `text-receita|text-despesa`; o aviso de pendentes não traz valor.

---

## 8. Ordem de execução

1. Ler o caderno de lições e este plano inteiro. Pré-condição de `git status` limpo nos
   arquivos do §1.
2. TDD da lógica pura (§7.1): vermelho → `projecao-caixinha-logica.ts` → verde.
3. Teste de regressão do `GraficoLinha` (§7.2) contra o código atual (verde) → edição
   aditiva → teste do trecho projetado → tudo verde.
4. `lib/queries/carteira-projecao.ts` (paginação + guarda de `kind`).
5. `copy.ts` (chaves `PROJECAO_*`, `design:ux-copy` só para rótulo e definição) →
   `grafico-projecao-caixinha.tsx` + skeleton → teste do §7.3.
6. `npx tsc --noEmit` + `npx vitest run` + `npx eslint` nos arquivos tocados. Saída colada.
7. **Integração no slot.** Bloqueado pela pendência F-1 (§9): exige caixinhas reais na
   tela, não o mock. Quem pluga é a Fachada, ou o Dash se o Maestro autorizar por escrito
   a edição do slot + `page.tsx`.
8. **Reconciliação** (`tests/integration/projecao-caixinha-reconciliacao.mjs`): família
   descartável criada via service_role. Os movimentos com `occurred_on` em meses
   passados e os rendimentos confirmados com data retroativa precisam de INSERT direto,
   porque as RPCs datam tudo com `carteira_hoje()`. O Semeador não consegue montar
   histórico retroativo. Cenário: 3 meses de histórico, 1 resgate, 1 rendimento
   confirmado, 2 meses pendentes. Cada número sai de duas fontes, coladas lado a lado:
   SQL bruto (`sum(...) FILTER` por mês, `balance_cents`, a RPC de pendentes,
   `round(balance * power(1 + rate/10000.0, 12))` em `numeric`) × `montarProjecaoCaixinha`.
   Prova de isolamento A×B. `EXPLAIN (ANALYZE)` da leitura e da RPC. Limpeza no `finally`
   com contagem antes e depois, e família real intacta.
9. **Gate visual** com o dev server `npm run dev` em `app/`, porta 3000, rota
   `/carteira?aba=investimentos`: screenshots 1440x900 e 390x844, dark, modo
   privacidade, estados VAZIO/ERRO/CARREGANDO, `browser_console_messages` sem
   `NaN`/`Infinity`, `browser_network_requests` da rota. **Risco:** o MCP do Playwright
   está falhando ao conectar nesta máquina (CONNECT_TIMEOUT em 2026-10-26). Se continuar
   assim na EXECUÇÃO, cada passo visual sai como `NÃO VERIFICADO` com o motivo, e o
   Maestro decide. Não troco a prova por uma afirmação.
10. `Skill(code-review)` high no diff → correções → gate inteiro de novo →
    `verification-before-completion` → auto-análise (mínimo 2 passes) → commit:
    `feat(carteira): grafico de projecao por caixinha com historico confirmado e simulacao`.

---

## 9. Pendências e perguntas para o Maestro repassar

| # | Para | Pendência |
|---|---|---|
| F-1 | **Fachada** (bloqueia a etapa 9) | `AreaInvestimentos` ainda roda sobre `MOCK_CARTEIRA_INVESTIMENTO`, e `carteira/page.tsx` não lê a carteira. Para o gráfico ter dado real, a página precisa ler caixinhas reais (`investment_boxes`, `v_carteira_resumo`), chamar `lerDadosProjecaoCarteira` **uma vez** no `Promise.all`, calcular `mesAtual = hojeEmSaoPaulo().slice(0,7)` e `atualizadoEm` no servidor, e passar tudo para `AreaInvestimentos` → slot. Os ids do mock nunca vão bater com os movimentos reais. |
| F-2 | **Fachada** | Tile "Projeção em 12 meses" (`area-investimentos.tsx:470-473`): usa `Math.pow` em **float** sobre reais, a mesma família de erro do P-009, e não bate com o fim do gráfico, que é BigInt exato. Trocar por `valorProjetadoCentavos(balance_cents, rate_bps, 12)` de `projecao-caixinha-logica.ts`. |
| F-3 | **Fachada** (L-003, privacidade) | Os tiles "Saldo atual" (`:452`) e "Projeção em 12 meses" (`:470`) usam `formatBRL` sem máscara: no modo oculto mostram o valor em claro, ao lado de um gráfico mascarado. Usar `ValorMonetario` ou `formatBRL(v, oculto)`. |
| F-4 | **Fachada** | `carteira/loading.tsx` não tem o card de projeção: incluir `GraficoProjecaoCaixinhaSkeleton` (mesma altura do conteúdo final). |
| F-5 | **Fachada** | Se o fluxo "Confirmar rendimento" usar `carteira_rendimentos_pendentes()`, a página faz uma chamada só e reaproveita o resultado para o gráfico. |
| E-1 | **Estrutura** | `docs/planos/estrutura-carteira-investimento.md` §8.2 diz `balance_cents` = "principal **sem** rendimento". Isso está desatualizado depois da decisão 4b; a migration diz "+ rendimento confirmado". Corrigir o documento. Não há código a mudar. |
| E-2 | **Estrutura** (informativo) | Nenhuma coluna, índice ou view nova é pedida. Se o `EXPLAIN` da etapa 8 mostrar custo ruim em `carteira_rendimentos_pendentes()`, o pedido de otimização vai como migration NOVA via `PENDENCIAS.md`. Essa função é O(caixinhas × meses abertos × movimentos), e o custo cresce com meses sem confirmar. |
| M-1 | **Maestro** | Confirmar a ampliação do território do Dash (§1): 8 arquivos além de `grafico-projecao-caixinha.tsx`, inclusive a edição aditiva do `GraficoLinha`. |
| M-2 | **Maestro** | Etapa 7: a Fachada pluga o componente no slot, ou o Dash pluga com autorização escrita para `area-investimentos.tsx` (linhas 478–497) e `page.tsx`? Recomendo a Fachada, junto com a F-1, porque é o mesmo diff que troca mock por dado real. |
| M-3 | **Maestro** | O Playwright MCP está falhando ao conectar (CONNECT_TIMEOUT). Sem ele, o gate visual não sai. Precisa estar no ar antes da etapa 9. |
| M-4 | **Maestro → Heitor** (produto, não bloqueia) | A simulação parte do saldo **confirmado** e ignora pendentes (decisão 4b). Quem deixa meses sem confirmar vê a simulação começar mais baixa. Isso é intencional e está dito no aviso e na definição. Se o Heitor preferir "simular como se tudo fosse confirmado", muda uma linha da lógica e o texto da definição. |

---

## 10. Riscos — onde este gráfico pode dar número errado

1. **Truncamento silencioso pelo `max_rows = 1000`** → série parcial com cara de
   completa. Mitigação: paginação + invariante Σ = `balance_cents`.
2. **Corrida entre a leitura de `investment_boxes` e a de movimentos** (aplicação no
   meio) → Σ ≠ saldo por um request. Mitigação: estado `divergente` = mensagem de erro
   com "Tentar de novo", nunca um número.
3. **Mês de criação calculado em UTC** → o primeiro ponto cai no mês errado para caixinha
   criada entre 21h e 0h de Brasília no último dia do mês. Mitigação: `mesEmSaoPaulo` +
   teste de virada de fuso.
4. **Somar rendimento pendente na linha sólida ou na simulação** → "dinheiro do nada",
   contra a spec §4b. Mitigação: o pendente nunca entra em `valorCentavos`; teste
   explícito.
5. **Duas estimativas inconsistentes no mesmo gráfico** (estimativa do mês × simulação).
   Mitigação: `carteira_rendimento_calculado` fica fora do gráfico (§2.4).
6. **Tile da Fachada em float ≠ fim do gráfico em BigInt**: dois números diferentes para
   "projeção em 12 meses" na mesma tela. Mitigação: F-2.
7. **Regressão no patrimônio e no simulador** pela edição do `GraficoLinha`. Mitigação:
   snapshot de regressão escrito antes da edição.
8. **Vazamento no modo privacidade** pelo zero, pela área ou pelos tiles vizinhos.
   Mitigação: §6 + teste + F-3.
9. **Simulação lida como promessa.** Mitigação: tracejado, "≈", rótulo "Simulação",
   definição com "não é uma promessa de rendimento" e a taxa com a data em que foi
   informada.

---

## 11. Decisões e a fonte de cada uma

| Decisão | Fonte |
|---|---|
| Linha, uma série, um eixo, nunca dual-axis | `dataviz` `choosing-a-form.md` + SKILL.md Non-negotiables + `anti-patterns.md`; plano mestre Task 5 |
| Tracejado = simulação; grade sempre sólida | `dataviz` `anti-patterns.md` (tracejado lê como "projection") + `marks-and-anatomy.md` (grade "solid, never dashed") |
| Área 10% só sob o dado confirmado | `dataviz` `marks-and-anatomy.md` (área = lavagem de ~10%) + regra de não dar volume a valor hipotético (§2.3) |
| Rótulo direto só no fim | `dataviz` `marks-and-anatomy.md` ("Lines → value at the end", "Label selectively") |
| Chave de traço em vez de legenda de séries | `dataviz` `marks-and-anatomy.md` (uma série sem legenda) + `interaction.md` (legenda espelha a marca) + "identity never color-alone" |
| Losango vazado para pendente | `dataviz` `marks-and-anatomy.md` (marcador ≥ 8px, anel de superfície) + `chart-palette.ts` `MARCADORES` |
| Crosshair, teclado, tabela | `dataviz` `interaction.md` |
| Cor `--chart-1` única, sem hex novo | `src/styles/chart-palette.ts` (Vitrine, validado) + `dataviz` (cor depois da forma; status reservado) |
| Simulação a partir do saldo confirmado, sem pendentes | spec §3 decisão 4b |
| Juros compostos via `projetarValorFuturo` | contrato do Estrutura + plano mestre Task 5 ("reaproveitar, não reescrever") |
| Sem view; leitura direta + RPC INVOKER | `supabase:supabase` (RLS + `security_invoker` só se houver view) + cardinalidade do contrato |
| Paginação por `max_rows` | `app/supabase/config.toml:18` |
| Fuso America/Sao_Paulo; mês de `created_at` via `Intl` | contrato do Estrutura + `src/lib/hoje.ts` + 00017:186 |
| Modo privacidade sem zero e sem área | caderno do Dash L-003 + precedente `GraficoPatrimonio` |
| Recharts/Tremor ausentes, SVG à mão | `app/package.json` lido |
