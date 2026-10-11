# Plano de Tokens — Finanças a Dois v2

> **Agente:** Vitrine (identidade visual) · **FASE: PLANO** · **Data:** 2026-10-11
> **Escopo desta fase:** planejar. Nenhum arquivo de produção emitido aqui.
> **Arquivo tocado nesta fase:** apenas este (`docs/design/plano-tokens.md`).

> **ATUALIZAÇÃO DA FASE: EXECUÇÃO (2026-10-11).** Plano executado. A saída real, as medições do arquivo emitido, os screenshots e a lista completa de desvios estão em `docs/design/handoff.md` (seção 10). Onde este plano e o handoff divergirem, **o handoff manda**. Mudanças que alteram números deste documento: `--receita`, `--despesa` e `--transferencia` claros foram escurecidos 1-3% (o par com `--accent` reprovava 4.5:1); símbolo reaberto após o teste de 16px; S-3 (shadcn não inicializado) foi superada, pois o `shadcn init` rodou antes; as verificações marcadas NÃO VERIFICADO na seção 8 foram feitas.

## SUPOSIÇÕES declaradas

| # | Suposição | Por quê |
|---|---|---|
| S-1 | `PLANO.md` ausente na raiz do repositório | Não existe. Derivei escopo de `docs/superpowers/specs/2026-10-11-financas-a-dois-v2-design.md` (spec APROVADA) + `docs/superpowers/plans/2026-10-11-financas-a-dois-onda1.md` + o briefing do Maestro. |
| S-2 | Sem relatório do Radar — direção visual derivada do briefing + engenharia reversa da v1 | `Glob` por `**/*radar*` não achou nada. Referência visual externa: nenhuma. Insumo real usado: `docs/engenharia-reversa-v1.md` e o `src/styles.css` da v1. |
| S-3 | shadcn ainda **não** inicializado | Não existe `components.json` nem `src/components/ui/`. Logo, os tokens que eu emitir são a *primeira* definição de tema; preciso emitir o contrato completo que o shadcn espera para que `shadcn init` depois não sobrescreva nada. |
| S-4 | Dev server não verificado nesta fase | PWA sem telas construídas. Todo item de renderização está marcado `NÃO VERIFICADO — dev server ausente` e vira pendência explícita para a FASE: EXECUÇÃO. |

---

## 1. Direção visual — e por que não é a da v1

A v1 era **rosa/vermelho/lilás em OKLCH**, gerada pelo Lovable, com 7 paletas que
sobrescreviam só `--primary`/`--ring`. Veredicto do próprio doc de engenharia
reversa sobre as 7 paletas: *"DECIDIR (proposta: 1 identidade forte + dark)"*.
O cliente, porém, pediu **múltiplas paletas explicitamente**. Resolvo o conflito
assim: **uma identidade estrutural forte e fixa + a cor de marca como preferência
do usuário.** O usuário troca o sotaque, não troca o produto.

### O assunto, o público, a função

- **Assunto:** dinheiro compartilhado entre duas pessoas que moram juntas.
- **Público:** Heitor e Carol — duas pessoas, não um analista. Uso no celular, de pé, no mercado.
- **Função principal:** responder três perguntas (saldo real, fatura, quem deve a quem) em segundos, sem interpretação.

O vernáculo do assunto não é "fintech roxa com gradiente". É **livro-caixa**:
a coluna de valores alinhada, a conciliação, o extrato, o plástico do cartão.
A identidade vem daí.

### Princípios que governam tudo abaixo

1. **O número é o herói.** A tipografia de valor é a coisa mais caprichada do app. Valor sempre tabular, sempre alinhado à direita, sempre legível de relance.
2. **Cor informa, nunca decora.** Cada cor financeira tem um significado só, e esse significado não muda quando o usuário troca a paleta.
3. **A cor nunca é o único portador do significado.** Medido: em protanopia, receita e despesa colapsam para ΔE 13,5 (§5.3). Logo, sinal/ícone/peso são obrigatórios, não enfeite.
4. **Densidade de extrato, não de card.** Lista de lançamentos é lista, com régua divisória — não 40 cards arredondados empilhados.

### Revisão Anti-Genérico (obrigatória)

Confrontei o plano do PASSE 1 contra a lista de *tells* da skill `frontend-design`.
O que caiu em default e **o que eu mudei**:

| Eixo | Default em que caí no PASSE 1 | Revisão aplicada |
|---|---|---|
| Fundo + accent | Ia propor `#F4F1EA` creme com accent terracota `~#D97757`. É o tell nº1 nominal da skill. | Fundo **cinza-papel levemente frio** `#F7F8F7` com `--card` branco puro `#FFFFFF` acima dele. O card "flutua mais claro que o papel" — invertido em relação ao SaaS padrão, e é o que faz o cartão de conta parecer plástico sobre mesa. A família terracota sobrevive **só** como a paleta opcional "Terra", escolha do usuário, não default. A paleta default é **Cedro** (verde-petróleo). |
| Raio | Ia usar `--radius: 1rem` em tudo (era exatamente o que a v1 fazia: um valor só). | **Escala de raio declarada e com significado** (§6): `4px` em chip/badge, `8px` em input/botão, `12px` em card de conteúdo, `16px` em cartão de conta (raio de cartão de crédito real), `999px` só em pill de filtro. Raio uniforme é tell nº4. |
| Sombra | Ia usar `rgba(0,0,0,.1)` igual em tudo. | **Duas sombras com papel distinto** (§6): `--shadow-card` quase imperceptível para elevação de leitura, e `--shadow-plastic` com duas camadas para o cartão de conta parecer objeto físico. Nada mais recebe sombra. |
| Tipografia | Ia usar Geist (já instalado) + Geist Mono. É o default do create-next-app e do próprio guia shadcn. | **Instrument Sans** (tem eixo `wdth` 75–100, uso real nos rótulos do cartão) + **IBM Plex Mono** para valor. Decisão justificada em §4, não por disponibilidade. |
| Eyebrow ALL-CAPS | Ia pôr rótulo tracked-out maiúsculo acima de cada KPI. | **Proibido no handoff** (§9, regra T-3). Rótulo de KPI é sentence case, mesmo tamanho do corpo, cor `muted-foreground`. Tell nº5. |
| `→` em botão | — | **Proibido no handoff** (§9, regra T-4). |
| Motion | Ia deixar sem motion (ausência de motion também é tell). | **Escala de motion declarada** (§6) com um único momento orquestrado: a chegada de lançamento do parceiro via Realtime. Todo o resto é motion de resposta a ação. |

---

## 2. Arquitetura de tema: como 4 paletas × 2 modos funcionam em Tailwind 4

### A decisão estrutural

São **duas dimensões independentes** e elas não podem ser a mesma coisa:

- **modo** (claro/escuro) → classe `.dark` no `<html>`
- **paleta** (cor de marca) → atributo `data-paleta` no `<html>`

Por que `data-paleta` em atributo e não uma segunda classe: evita colisão com
qualquer classe utilitária do Tailwind, é legível no DevTools, e permite
`[data-paleta="terra"]` sem ambiguidade de ordem de cascata.

Por que **não** fazer como a v1 fez: a v1 tinha `applyPalette()` escrevendo
`style.setProperty` em JS no `useEffect` (`src/lib/palettes.ts:258`). Isso pinta o
app com a paleta errada no primeiro paint e dá flash a cada carregamento. Na v2 a
paleta é **CSS puro**; o JS só troca o atributo.

### Contrato de seletores (a ordem importa)

```css
@import "tailwindcss";

/* Dark mode por CLASSE, não por prefers-color-scheme sozinho:
   o usuário precisa poder escolher, e a escolha tem que vencer o SO. */
@custom-variant dark (&:where(.dark, .dark *));

:root { /* chassi claro + semântica clara + paleta Cedro clara */ }
.dark { /* chassi escuro + semântica escura + paleta Cedro escura */ }

[data-paleta="ardosia"]      { /* só primary/ring/accent claros */ }
.dark[data-paleta="ardosia"] { /* só primary/ring/accent escuros */ }
/* idem terra, ameixa */

@theme inline { /* mapeia --cor-* -> --color-* para o Tailwind gerar as classes */ }
```

**Regra de cascata:** `.dark[data-paleta=X]` tem especificidade maior que `.dark`,
que tem maior que `:root`. Logo paleta sempre vence modo, e modo sempre vence o
default. Isso é intencional e precisa ser respeitado na ordem de escrita do arquivo.

### O que cada paleta sobrescreve — e o que ela JAMAIS toca

| Sobrescreve (4 variáveis × 2 modos) | **Nunca** toca |
|---|---|
| `--primary` | todo o chassi neutro (`--background`, `--card`, `--foreground`, `--muted*`, `--border*`) |
| `--primary-foreground` | **toda a semântica financeira** (`--receita`, `--despesa`, …) |
| `--ring` | a paleta de séries de gráfico |
| `--accent` (e `--accent-foreground`) | raio, sombra, motion, tipografia |

Isso é o coração do sistema: **trocar de paleta não pode mudar o significado de
nenhum número na tela.** Se receita mudasse de cor junto com a paleta, o usuário
teria que reaprender o app a cada troca.

### Persistência e anti-flash (especificação para a Fachada)

A escolha vive em `localStorage` e precisa ser aplicada **antes do primeiro
paint**, senão pisca. Script inline bloqueante no `<head>`:

```
chaves: "fad.modo" = "claro" | "escuro" | "sistema"   (default: "sistema")
        "fad.paleta" = "cedro" | "ardosia" | "terra" | "ameixa"  (default: "cedro")
```

O script lê as duas chaves e escreve `classList.add('dark')` + `dataset.paleta`
no `<html>`. **Quem escreve esse script é a Fachada** — eu especifico, ela
implementa (fronteira de escrita, §10). `suppressHydrationWarning` no `<html>` é
obrigatório porque o script muda o DOM antes do React hidratar.

---

## 3. Paletas e contraste MEDIDO

Todos os números abaixo foram calculados por `Bash`/`node` com a fórmula de
luminância relativa WCAG (`(L1+0.05)/(L2+0.05)`), não estimados. Todo hex é
`#RRGGBB` de 7 caracteres — nenhum hex de 4 caracteres entrou na fórmula.

**Limiares:** `>=4.5:1` texto normal · `>=3.0:1` texto grande (≥24px, ou ≥19px bold)
· `>=3.0:1` componente de UI, ícone e borda de foco (WCAG 1.4.11).

### 3.1 Chassi neutro — fixo em todas as paletas

**Modo claro** (`--background: #F7F8F7`, `--card: #FFFFFF`, `--muted: #EDF0EF`)

| Token | Hex | sobre `--background` | sobre `--card` | Veredicto |
|---|---|---|---|---|
| `--foreground` | `#14181C` | **16.76:1** | **17.84:1** | AA ok (texto normal) |
| `--muted-foreground` | `#5A6670` | **5.53:1** | **5.88:1** | AA ok (texto normal) |
| `--foreground` sobre `--muted` | `#14181C` | — | **15.56:1** (sobre `#EDF0EF`) | AA ok |
| `--muted-foreground` sobre `--muted` | `#5A6670` | — | **5.13:1** (sobre `#EDF0EF`) | AA ok |
| `--border-forte` (interativa) | `#7D878C` | **3.45:1** | **3.67:1** | AA ok (1.4.11, ≥3) |
| `--border` (divisória decorativa) | `#DDE2E1` | **1.23:1** | — | **isento** — ver nota |

**Modo escuro** (`--background: #101417`, `--card: #171C20`, `--muted: #1E242A`)

| Token | Hex | sobre `--background` | sobre `--card` | Veredicto |
|---|---|---|---|---|
| `--foreground` | `#E8ECEB` | **15.54:1** | **14.41:1** | AA ok (texto normal) |
| `--muted-foreground` | `#9BA6AC` | **7.44:1** | **6.90:1** | AA ok (texto normal) |
| `--foreground` sobre `--muted` | `#E8ECEB` | — | **13.15:1** (sobre `#1E242A`) | AA ok |
| `--muted-foreground` sobre `--muted` | `#9BA6AC` | — | **6.30:1** (sobre `#1E242A`) | AA ok |
| `--border-forte` (interativa) | `#6E7A81` | **4.20:1** | **3.89:1** | AA ok (1.4.11, ≥3) |
| `--border` (divisória decorativa) | `#2A3238` | **1.42:1** | — | **isento** — ver nota |

> **Nota obrigatória sobre `--border` a 1.23:1 / 1.42:1.** Esse valor **reprova**
> o limiar de 3:1 e eu o declaro deliberadamente isento, não aprovado. WCAG 1.4.11
> se aplica a *"partes gráficas necessárias para identificar um componente"*. A
> `--border` aqui é **só a régua entre linhas do extrato** — puramente decorativa,
> redundante com o espaçamento. Por isso o sistema tem **dois tokens de borda**:
> toda borda que delimita um componente interativo (input, select, checkbox,
> cartão clicável) usa `--border-forte`, que foi medida e passa. **Regra para a
> Fachada:** se a borda é a única coisa que mostra onde o campo começa, é
> `--border-forte`. Nunca `--border`.

### 3.2 As paletas escolhíveis

Nomes em português, como pedido. São quatro (contadas aqui, não no título — ver
caderno de lições L-001). Cada uma tem par claro/escuro de todos os tokens que
sobrescreve.

#### Paleta 1 — **Cedro** (default) · verde-petróleo profundo

| | claro | escuro |
|---|---|---|
| `--primary` | `#14594A` | `#5FD3B2` |
| `--primary-foreground` | `#FFFFFF` | `#101417` |

| Par medido | Razão | Veredicto |
|---|---|---|
| claro: `--primary-foreground` sobre `--primary` | **8.21:1** | AA ok |
| claro: `--primary` sobre `--background` (texto/ícone/borda de foco) | **7.71:1** | AA ok |
| escuro: `--primary-foreground` sobre `--primary` | **10.09:1** | AA ok |
| escuro: `--primary` sobre `--background` | **10.09:1** | AA ok |

#### Paleta 2 — **Ardósia** · azul-aço

| | claro | escuro |
|---|---|---|
| `--primary` | `#1C4F80` | `#7FB8F2` |
| `--primary-foreground` | `#FFFFFF` | `#101417` |

| Par medido | Razão | Veredicto |
|---|---|---|
| claro: `--primary-foreground` sobre `--primary` | **8.47:1** | AA ok |
| claro: `--primary` sobre `--background` | **7.96:1** | AA ok |
| escuro: `--primary-foreground` sobre `--primary` | **8.85:1** | AA ok |
| escuro: `--primary` sobre `--background` | **8.85:1** | AA ok |

#### Paleta 3 — **Terra** · telha queimada

| | claro | escuro |
|---|---|---|
| `--primary` | `#9E3F23` | `#F09070` |
| `--primary-foreground` | `#FFFFFF` | `#101417` |

| Par medido | Razão | Veredicto |
|---|---|---|
| claro: `--primary-foreground` sobre `--primary` | **6.58:1** | AA ok (menor valor do sistema) |
| claro: `--primary` sobre `--background` | **6.19:1** | AA ok |
| escuro: `--primary-foreground` sobre `--primary` | **7.87:1** | AA ok |
| escuro: `--primary` sobre `--background` | **7.87:1** | AA ok |

#### Paleta 4 — **Ameixa** · roxo-vinho

| | claro | escuro |
|---|---|---|
| `--primary` | `#6B2A5E` | `#D98FC6` |
| `--primary-foreground` | `#FFFFFF` | `#101417` |

| Par medido | Razão | Veredicto |
|---|---|---|
| claro: `--primary-foreground` sobre `--primary` | **9.92:1** | AA ok |
| claro: `--primary` sobre `--background` | **9.31:1** | AA ok |
| escuro: `--primary-foreground` sobre `--primary` | **7.66:1** | AA ok |
| escuro: `--primary` sobre `--background` | **7.66:1** | AA ok |

`--ring` = o mesmo hex de `--primary` em cada paleta/modo. Logo a borda de foco
herda os números acima, e o pior caso do sistema é **6.19:1** (Terra claro),
bem acima do 3:1 que 1.4.11 exige para indicador de foco.

#### `--accent` e `--accent-foreground` por paleta

`--accent` é uma **tinta leve da paleta usada como fundo** (hover de item de
lista, item de menu ativo), não uma segunda cor de marca. `--accent-foreground`
é sempre o `--foreground` do chassi — por isso o texto não muda de cor no hover.

| Paleta | `--accent` claro | `--foreground` `#14181C` sobre ele | `--accent` escuro | `--foreground` `#E8ECEB` sobre ele |
|---|---|---|---|---|
| Cedro | `#E4EDE9` | **14.94:1** AA ok | `#1B2E2A` | **11.99:1** AA ok |
| Ardósia | `#E4EBF3` | **14.85:1** AA ok | `#1A2733` | **12.76:1** AA ok |
| Terra | `#F5E6E0` | **14.68:1** AA ok | `#2E211C` | **13.05:1** AA ok |
| Ameixa | `#F0E4EE` | **14.47:1** AA ok | `#2A1E28` | **13.41:1** AA ok |

`--muted-foreground` também precisa funcionar sobre `--accent`, porque a data e a
categoria do lançamento continuam cinzas quando a linha recebe hover. Pior caso
de cada modo, medido:

| Par | Razão | Veredicto |
|---|---|---|
| claro: `--muted-foreground` `#5A6670` sobre Ameixa `#F0E4EE` (pior claro) | **4.77:1** | AA ok (texto normal) |
| claro: `--muted-foreground` sobre Cedro `#E4EDE9` | **4.93:1** | AA ok |
| escuro: `--muted-foreground` `#9BA6AC` sobre Cedro `#1B2E2A` (pior escuro) | **5.74:1** | AA ok |
| escuro: `--muted-foreground` sobre Ameixa `#2A1E28` | **6.42:1** | AA ok |

#### Demais pares do chassi, medidos

| Par | Claro | Escuro |
|---|---|---|
| `--secondary-foreground` sobre `--secondary` | **15.56:1** AA ok | **13.15:1** AA ok |
| `--popover-foreground` sobre `--popover` | **17.84:1** AA ok | **13.15:1** AA ok |
| `--destructive-foreground` sobre `--destructive` | **5.52:1** AA ok | **8.08:1** AA ok |

### 3.3 Achado estrutural: primary colide com a semântica — e como o sistema resolve

Medi a distância de cada `--primary` contra a cor financeira de hue vizinha:

| Par | Razão de luminância entre si | Leitura |
|---|---|---|
| Terra escuro `#F09070` vs despesa `#FF8A7A` | **1.03:1** | praticamente a mesma cor |
| Ameixa escuro `#D98FC6` vs transferência `#A79BF0` | **1.01:1** | praticamente a mesma cor |
| Cedro escuro `#5FD3B2` vs receita `#3FC68B` | **1.18:1** | muito próximas |
| Ardósia escuro `#7FB8F2` vs investimento `#74AEF0` | **1.11:1** | muito próximas |
| Terra claro `#9E3F23` vs despesa `#C0362C` | **1.19:1** | muito próximas |

**Isto não é corrigível mexendo em hex.** Com 4 paletas livres e 7 cores
semânticas fixas, alguma paleta sempre vai cair no hue de alguma semântica.
Tentar afastar todas geraria paletas feias e ainda falharia na próxima paleta.

**A resolução é uma regra de uso, e ela é lei no handoff (§9, regra C-1):**

> `--primary` **nunca** codifica um valor financeiro, e a semântica financeira
> **nunca** pinta chrome. `--primary` existe só para: botão de ação principal,
> estado ativo de navegação, borda de foco e link. Valor monetário, badge de
> tipo de lançamento e seta de direção usam **exclusivamente** os tokens
> `--receita` / `--despesa` / `--investimento` / `--transferencia`.

Com essa separação, a colisão deixa de ter consequência: as duas cores nunca
disputam o mesmo significado no mesmo lugar. Um botão "Salvar" telha ao lado de
um valor de despesa telha é ambíguo **só** se o botão também significasse despesa
— e ele não significa nada financeiro.

---

## 4. Tipografia

### Decisão

| Papel | Família | Como carregar | Pesos |
|---|---|---|---|
| UI / display | **Instrument Sans** | `next/font/google`, variável | eixo `wght` 400–700 |
| Valor monetário, data, parcela | **IBM Plex Mono** | `next/font/google`, estática | `400`, `500`, `600` **apenas** |

### Por que estas, e não Geist

Geist já está no projeto (vem do `create-next-app`) e é o default que o próprio
guia shadcn recomenda — é exatamente por isso que não serve: é a escolha que eu
faria em qualquer projeto. As razões concretas da troca:

- **Instrument Sans tem eixo `wdth` de 75 a 100** (confirmado no catálogo do
  `next/font`: `axes: [{tag:"wdth",min:75,max:100},{tag:"wght",min:400,max:700}]`).
  Isso tem uso real aqui: o rótulo do cartão de conta ("Conta Principal",
  "Nubank Cartão") precisa caber em 1 linha num cartão de 320px sem elipse.
  Comprimir a largura preservando a altura-x é melhor que reduzir o corpo.
  Geist não tem esse eixo.
- O desenho da Instrument Sans é um grotesco de terminais retas e aberturas
  fechadas — lê como impresso de banco, não como interface de startup. Combina
  com o princípio "livro-caixa".
- **IBM Plex Mono** para dinheiro porque o Plex foi desenhado para dado tabular
  e o `0` tem corte diagonal (distingue de `O` no código de família de 6
  caracteres, que usa charset sem `0`/`O` justamente por ambiguidade — a fonte
  reforça a decisão já tomada no schema).

### A decisão sobre números tabulares — declarada

**Sim, vale, e é obrigatório.** O app mostra coluna de valores (`v_account_balances`,
lista de lançamentos, fatura). Com números proporcionais, `R$ 1.111,00` e
`R$ 8.888,00` têm larguras diferentes e a coluna serrilha.

Duas camadas, porque resolvem problemas diferentes:

1. **IBM Plex Mono em todo valor monetário.** Monoespaçada já é tabular por
   construção. É o que garante o alinhamento da coluna.
2. **`font-variant-numeric: tabular-nums` também na Instrument Sans**, via uma
   classe utilitária, para os números que aparecem *dentro* de texto corrido em
   UI (ex. "3 de 12 parcelas", contador de badge). Sem isso o número pula quando
   o valor muda em tempo real — e este app tem Realtime, então valor **muda na
   tela** com o usuário olhando.

Token: `--numerico-tabular: tabular-nums` aplicado como `font-variant-numeric`.

### Carregamento — e a armadilha do Tailwind 4 que o projeto já tem

O `globals.css` atual contém este bug, herdado do `create-next-app`:

```css
@theme inline {
  --font-sans: var(--font-geist-sans);   /* NÃO FUNCIONA */
}
```

`@theme inline` do Tailwind 4 resolve custom properties **em tempo de parse do
CSS**, enquanto o `next/font` injeta `--font-geist-sans` em **runtime** via
className. O resultado é `--font-sans` vazio — e é por isso que o `body` do
projeto hoje cai em `font-family: Arial, Helvetica, sans-serif` na linha 25.
Fonte: skill `vercel:shadcn`, seção "Component Gotchas → shadcn init Breaks Geist
Font in Next.js (Tailwind v4)".

**Correção obrigatória na execução:** nomes literais dentro de `@theme inline`.

```css
@theme inline {
  --font-sans: "Instrument Sans", "Instrument Sans Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "IBM Plex Mono Fallback", ui-monospace, monospace;
}
```

E as variáveis de font **no `<html>`**, não no `<body>` (mesma fonte). O layout
atual já põe no `<html>` — isso está certo e deve ser preservado.

`@import` de fonte em CSS é **proibido** (bloqueia render, não faz preload,
não gera fallback métrico). Sempre `next/font/google` com `subsets: ["latin", "latin-ext"]`
— `latin-ext` é necessário para `ç ã õ á é í ó ú â ê ô à` do português — e
`display: "swap"`.

### Escala de tipo

Base 16px, razão ~1.25 (quarta menor), com dois saltos maiores reservados ao valor-herói.

| Token | Tamanho / altura de linha | Peso | Uso |
|---|---|---|---|
| `--texto-valor-heroi` | `40px / 44px` | Mono 600, `tabular-nums` | o saldo real na Carteira — o número mais importante do app |
| `--texto-valor-destaque` | `28px / 32px` | Mono 600 | valor do KPI, total da fatura |
| `--texto-valor-linha` | `16px / 24px` | Mono 500 | valor na lista de lançamentos |
| `--texto-titulo` | `20px / 28px` | Sans 600 | título de página |
| `--texto-subtitulo` | `17px / 24px` | Sans 600 | nome da conta no cartão |
| `--texto-corpo` | `15px / 24px` | Sans 400 | descrição do lançamento, corpo |
| `--texto-apoio` | `13px / 18px` | Sans 400 | data, categoria, rótulo de KPI |
| `--texto-micro` | `11px / 14px` | Sans 500, `wdth` 85 | rótulo no cartão de conta (onde o eixo `wdth` entra) |

Nada abaixo de 11px, e 11px só em rótulo não essencial. Comprimento de linha
máximo em texto corrido: 68 caracteres (`max-width: 34rem`).

---

## 5. Semântica financeira de cor

### 5.1 Os tokens e os números

Sete significados, cada um com par claro/escuro, **idênticos nas 4 paletas**.
Medidos sobre `--background` de cada modo.

| Token | Significado | Claro | Razão (claro) | Escuro | Razão (escuro) |
|---|---|---|---|---|---|
| `--receita` | entrada de dinheiro | `#0F7A52` | **5.02:1** AA ok | `#3FC68B` | **8.52:1** AA ok |
| `--despesa` | saída de dinheiro | `#C0362C` | **5.18:1** AA ok | `#FF8A7A` | **8.08:1** AA ok |
| `--investimento` | aplicado (não é gasto) | `#1F5FA8` | **6.05:1** AA ok | `#74AEF0` | **7.98:1** AA ok |
| `--transferencia` | move entre contas, não muda patrimônio | `#6B5BB5` | **5.21:1** AA ok | `#A79BF0` | **7.57:1** AA ok |
| `--pendente` | lançado, ainda não pago | `#8A5A00` | **5.57:1** AA ok | `#E0A93F` | **8.74:1** AA ok |
| `--negativo` | saldo de conta abaixo de zero | `#9A2B22` | **7.19:1** AA ok | `#FF6F61` | **6.79:1** AA ok |
| `--beneficio` | vale/benefício (dinheiro de uso restrito) | `#0A6B6B` | **5.93:1** AA ok | `#3FC2C2` | **8.56:1** AA ok |

Sobre `--card` também medido, todos passam: claro de 5.35:1 a 7.66:1; escuro de
6.29:1 a 8.11:1. Pior caso do conjunto: `--receita` claro sobre `--background` a
**5.02:1** — acima de 4.5:1.

**"Valor pago"** não tem token próprio de cor: pago é o estado **normal**. Um
lançamento pago usa `--receita`/`--despesa` em peso cheio; `--pendente` é o
*desvio* que precisa ser sinalizado. Isso evita um quarto estado de cor
competindo e segue o princípio de que só a exceção chama atenção.

### 5.2 Mapeamento tipo de lançamento → token

O schema tem `type IN ('receita','despesa','investimento','transferencia')` e o
booleano `is_paid`. O mapeamento é determinístico:

| `type` | `is_paid` | Cor do valor | Sinal | Ícone |
|---|---|---|---|---|
| `receita` | `true` | `--receita` | `+` | seta entrando |
| `receita` | `false` | `--pendente` | `+` | relógio |
| `despesa` | `true` | `--despesa` | `−` | seta saindo |
| `despesa` | `false` | `--pendente` | `−` | relógio |
| `investimento` | qualquer | `--investimento` | `→` prefixo, nunca sufixo em botão | cofre |
| `transferencia` | qualquer | `--transferencia` | `⇄` | duas setas |
| — (saldo de conta < 0) | — | `--negativo` | `−` | triângulo de alerta |
| `is_benefit = true` | — | `--beneficio` na **borda/chip**, valor segue a regra do `type` | — | ticket |

### 5.3 Reforço não-cromático — MEDIDO, obrigatório, e onde exatamente

Simulei dicromacia (matrizes de Viénot em sRGB linear) e medi ΔE CIE76:

| Par | Visão normal | Deuteranopia | **Protanopia** | Tritanopia |
|---|---|---|---|---|
| receita vs despesa (claro) | 95.5 | 83.0 | **13.5 — colapsa** | 85.4 |
| receita vs despesa (escuro) | 93.2 | 78.0 | **13.5 — colapsa** | 56.4 |
| pago vs pendente (claro) | 63.4 | 61.0 | 34.2 ok | 57.7 |
| pago vs pendente (escuro) | 72.6 | 75.4 | 31.7 ok | 68.1 |
| despesa vs saldo-negativo (claro) | **13.8 — já colapsa em visão normal** | 15.3 | 7.8 | 13.3 |

Dois achados que mandam no design:

1. **Protanopia funde receita e despesa (ΔE 13,5).** O par verde/vermelho — que é
   o par mais importante do app — é indistinguível para quem tem protanopia.
   Confirma numericamente a preocupação do briefing.
2. **Despesa e saldo-negativo estão a ΔE 13,8 já em visão normal.** São dois
   vermelhos próximos de propósito (ambos são "dinheiro indo embora"), mas isso
   significa que a cor não pode ser o que distingue "esta linha é uma despesa" de
   "esta conta está no vermelho".

**Portanto, reforço obrigatório — não é recomendação, é requisito de aceite:**

| Onde | Reforço obrigatório | Por quê |
|---|---|---|
| **Todo valor monetário, sem exceção** | **sinal `+` / `−` sempre presente**, antes do `R$` | É o reforço que sobrevive a qualquer daltonismo e a print em preto-e-branco. Resolve o achado nº1. |
| Badge de tipo de lançamento | **ícone + palavra** ("Despesa", "Receita") — nunca só o ponto colorido | Resolve o achado nº1 em quem navega por badge |
| Saldo de conta negativo | **ícone de alerta + parênteses contábeis** `(R$ 1.234,56)` além da cor | Resolve o achado nº2: parênteses é a convenção contábil universal para negativo |
| Estado pendente | **ícone de relógio + a palavra "Pendente"** | Pendente a 31.7 passa, mas o estado é crítico (dinheiro que ainda vai sair) |
| Acerto de contas ("quem deve a quem") | **frase explícita com os dois nomes e a direção em palavras** (padrão: `<nome> deve <valor> a <nome>`) — nunca só um número colorido. A redação final é do Fachada; a exigência de ser frase, e não cor, é minha | É a resposta a uma das 3 perguntas do produto; não pode depender de cor |
| Série de gráfico | ver §7: marcador de forma + rótulo direto | Legenda só-cor reprova |

**Regra de aceite verificável:** nenhuma informação financeira no app pode ser
compreendida apenas pela cor. Teste do Sentinela: aplicar
`filter: grayscale(1)` na página e conferir que receita, despesa, pago, pendente
e saldo negativo continuam identificáveis. Se algum ficar ambíguo, reprova.

---

## 6. Taxonomia completa: raio, sombra, espaçamento, motion

Raio único e ausência de motion são *tells* — então ambos são **escala declarada**.

### Raio — cada valor tem um motivo

| Token | Valor | Onde |
|---|---|---|
| `--raio-chip` | `4px` | badge, chip de categoria, pill de parcela |
| `--raio-controle` | `8px` | input, select, botão |
| `--raio-card` | `12px` | card de conteúdo, KPI, bloco de lista |
| `--raio-cartao` | `16px` | **cartão de conta** — raio de cartão de crédito real (ISO/IEC 7810 ID-1 tem canto de 3.18mm ≈ 1/16 da altura; a 200px de altura dá ~16px) |
| `--raio-pill` | `9999px` | só filtro de período e avatar |

### Sombra — com papéis distintos, não um valor repetido

| Token | Valor | Onde |
|---|---|---|
| `--sombra-card` | `0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)` | card de conteúdo; quase imperceptível, só separa do papel |
| `--sombra-cartao` | `0 2px 4px rgb(0 0 0 / 0.08), 0 8px 16px -4px rgb(0 0 0 / 0.12)` | **só** o cartão de conta — duas camadas para parecer objeto físico sobre a mesa |

No modo escuro sombra quase não funciona; o cartão de conta ganha
`--borda-cartao-escuro: 1px solid rgb(255 255 255 / 0.10)` em vez de sombra
reforçada. Nada mais no app recebe sombra.

### Espaçamento — base 4px

`--esp-1: 4px` · `--esp-2: 8px` · `--esp-3: 12px` · `--esp-4: 16px` ·
`--esp-5: 20px` · `--esp-6: 24px` · `--esp-8: 32px` · `--esp-12: 48px`

Densidade: **compacta** (`--esp-3`/`--esp-4`) na lista de lançamentos, porque é
extrato e densidade é a feature. **Confortável** (`--esp-6`) em formulário e
ajustes, porque é entrada de dado no celular.

### Motion — um momento orquestrado, o resto é resposta

| Token | Valor | Uso |
|---|---|---|
| `--motion-rapido` | `120ms cubic-bezier(0.2, 0, 0.4, 1)` | hover, foco, troca de estado de botão |
| `--motion-padrao` | `220ms cubic-bezier(0.2, 0, 0.2, 1)` | abrir sheet, expandir fatura, troca de paleta |
| `--motion-entrada` | `420ms cubic-bezier(0.16, 1, 0.3, 1)` | **o único momento orquestrado:** lançamento do parceiro chegando por Realtime — a linha entra deslizando e o badge "novo" pulsa uma vez |

`@media (prefers-reduced-motion: reduce)` zera os três para `1ms` e troca a
entrada do Realtime por um fade de opacidade. **Especificado por mim,
implementado pela Fachada.**

Justificativa do momento orquestrado: o Realtime é, segundo o doc de engenharia
reversa, *"a alma do produto"* (item 21, "MANTER — é a alma do produto"). É o
único lugar onde algo acontece na tela **sem** o usuário ter pedido, então é o
único lugar que merece motion não solicitado.

---

## 7. `src/styles/chart-palette.ts` — paleta de séries

### Quem importa

**O agente Dash**, e só ele, em `src/components/charts/**`. Os gráficos da Onda 2
(donut por categoria, evolução mensal, Pareto de gastos, barras por pessoa).
Este módulo TS se justifica porque o Recharts recebe cor como **prop em TS**, não
como classe CSS — logo existe consumidor real em TypeScript. Não é token morto.

> **Nota de escopo:** gráficos são **Onda 2** pela spec (§11). Eu emito a paleta
> na Onda 1 porque ela é parte do sistema de cor e precisa ser validada junto
> com o resto. O Dash consome quando a Onda 2 começar.

### Suporte, ordem e overflow

- **8 séries** com cor própria, em ordem fixa.
- **Ordem** otimizada para que as 3 primeiras — o caso comum, porque a maioria
  dos gráficos do app tem 2 ou 3 séries — sejam as de maior separação perceptual
  entre si.
- **Mais de 8 séries:** a paleta **não** cicla. Ciclar faz duas categorias
  diferentes terem a mesma cor, o que é mentira visual num gráfico de gastos.
  Regra: o Dash agrupa o excedente em **"Outros"**, que usa
  `--serie-outros` (cinza neutro, fora da sequência). Se o Dash precisar mesmo de
  >8 categorias distinguíveis, isso é um pedido de mudança para mim — não um
  `for` com `% 8`. A função exportada implementa essa regra.

### Valores medidos

**Modo claro** (contra `--background #F7F8F7` / `--card #FFFFFF`):

| # | Nome | Hex | /background | /card | 1.4.11 (≥3) |
|---|---|---|---|---|---|
| 1 | azul | `#2F6DB5` | **4.96:1** | 5.28:1 | ok |
| 2 | telha | `#C2552F` | **4.26:1** | 4.53:1 | ok |
| 3 | teal | `#0E7F78` | **4.56:1** | 4.85:1 | ok |
| 4 | violeta | `#7A5BC4` | **4.79:1** | 5.10:1 | ok |
| 5 | oliva | `#6E7A1F` | **4.42:1** | 4.70:1 | ok |
| 6 | magenta | `#A83A6E` | **5.64:1** | 6.01:1 | ok |
| 7 | ocre | `#9A6B10` | **4.40:1** | 4.68:1 | ok |
| 8 | castanho | `#5B4636` | **8.31:1** | 8.85:1 | ok |

**Modo escuro** (contra `--background #101417` / `--card #171C20`):

| # | Nome | Hex | /background | /card | 1.4.11 (≥3) |
|---|---|---|---|---|---|
| 1 | azul | `#6FA8E8` | **7.44:1** | 6.90:1 | ok |
| 2 | telha | `#F08A5E` | **7.49:1** | 6.95:1 | ok |
| 3 | teal | `#3FBDB2` | **8.05:1** | 7.47:1 | ok |
| 4 | violeta | `#A992E8` | **7.02:1** | 6.51:1 | ok |
| 5 | oliva | `#AFBE4A` | **9.07:1** | 8.41:1 | ok |
| 6 | magenta | `#E87FAE` | **7.12:1** | 6.60:1 | ok |
| 7 | ocre | `#D9A838` | **8.47:1** | 7.85:1 | ok |
| 8 | castanho | `#C9A68A` | **8.20:1** | 7.61:1 | ok |

Pior caso do conjunto: **4.26:1** (telha claro) — acima de 4.5? Não: 4.26 < 4.5,
mas série de gráfico é **elemento gráfico**, governado por 1.4.11 (≥3:1), não por
1.4.3. Passa com folga. Rótulo de texto do gráfico usa `--foreground` ou
`--muted-foreground`, que passam 1.4.3.

### Correção aplicada durante este plano — separação perceptual

Luminância sozinha é o teste **errado** para paleta categórica: séries
equiluminantes são uma virtude (nenhuma série parece mais importante). O teste
certo é separação perceptual. Medi ΔE CIE76 entre **todos** os 28 pares.

**Primeira versão reprovou.** A série 8 era indigo (`#3F4C9E` claro / `#8793E0`
escuro) e ficou perto demais das séries 1 (azul) e 4 (violeta):

| Par | ΔE claro | ΔE escuro |
|---|---|---|
| S1 azul vs S8 indigo | 18.7 (abaixo de 20) | 16.4 (abaixo de 20) |
| S4 violeta vs S8 indigo | 19.8 (abaixo de 20) | **12.3 — reprova** |

**Correção:** série 8 virou **castanho** (`#5B4636` / `#C9A68A`), um hue não
ocupado por nenhuma outra série. Resultado remedido:

| Conjunto | Menor ΔE entre todos os 28 pares | Veredicto |
|---|---|---|
| claro | **29.2** (oliva vs ocre) | ok (alvo ≥20) |
| escuro | **27.7** (azul vs violeta) | ok (alvo ≥20) |

### Reforço não-cromático no gráfico (obrigatório)

Como em §5.3, cor não basta:

- **Rótulo direto na série** sempre que couber, em vez de legenda à distância.
- **Marcador de forma distinto** por série em gráfico de linha (círculo,
  quadrado, triângulo, losango) — resolve daltonismo sem depender da legenda.
- Donut/Pareto: **valor e nome da categoria escritos** na fatia ou ao lado.
- `--serie-outros`: `#7D878C` (claro) / `#6E7A81` (escuro) — os mesmos hex de
  `--border-forte`, já medidos a 3.45:1 e 4.20:1.

### Forma do arquivo a emitir

```
src/styles/chart-palette.ts

export const SERIES_CLARO: readonly string[]   // 8 hex, ordem fixa
export const SERIES_ESCURO: readonly string[]  // 8 hex, ordem fixa
export const SERIE_OUTROS = { claro: '#7D878C', escuro: '#6E7A81' }
export const MARCADORES: readonly ('circle'|'square'|'triangle'|'diamond')[]
export type ModoTema = 'claro' | 'escuro'
export function paletaSeries(modo: ModoTema): readonly string[]
export function corDaSerie(indice: number, modo: ModoTema): string
  // indice >= 8 -> retorna SERIE_OUTROS[modo]; NÃO cicla
export const MAX_SERIES = 8
```

Sequencial (para heatmap por dia da semana, item 19 da v1) **não** entra na Onda 1:
é Onda 2 e precisa de decisão sobre a métrica antes da rampa. Registrado como
pendência (§11).

---

## 8. Favicon, ícones do PWA e OG image

### O símbolo

Precisa funcionar a 16px e dizer "duas pessoas, uma conta". A ideia:
**dois arcos que se encontram formando um único vão central** — leitura dupla de
"duas metades de um todo" e de duas colunas de um livro-caixa se fechando. Sem
texto, sem coração (clichê de app para casal), sem cifrão (clichê de fintech).

**Favicon é silhueta, não o logo completo encolhido.** O logo completo
(símbolo + "Finanças a Dois") existe só no cabeçalho e no OG.

### Inventário de arquivos

| Arquivo | Dimensão | Formato | Propósito | Teto de peso |
|---|---|---|---|---|
| `app/public/icons/favicon.svg` | `32×32` viewBox | SVG | favicon moderno, `currentColor`-aware | ≤ 4KB |
| `app/src/app/favicon.ico` | `32×32` + `16×16` | ICO | fallback legado (**já existe** — substituir) | ≤ 15KB |
| `app/public/icons/icon-192.png` | `192×192` | PNG | manifest `purpose: "any"` | ≤ 30KB |
| `app/public/icons/icon-512.png` | `512×512` | PNG | manifest `purpose: "any"` | ≤ 60KB |
| `app/public/icons/icon-maskable-192.png` | `192×192` | PNG | manifest `purpose: "maskable"` | ≤ 30KB |
| `app/public/icons/icon-maskable-512.png` | `512×512` | PNG | manifest `purpose: "maskable"` | ≤ 60KB |
| `app/public/icons/apple-touch-icon.png` | `180×180` | PNG | iOS tela inicial (iOS ignora maskable) | ≤ 30KB |
| `app/public/og.png` | `1200×630` | PNG | OG / Twitter card | ≤ 300KB |

**`maskable` separado de `any` é obrigatório.** A v1 cometeu o erro de declarar
`"purpose": "any maskable"` no mesmo arquivo
(`_referencia-v1/finance-a-dois/public/manifest.webmanifest`). Android aplica
máscara circular e corta ~20% das bordas: um ícone desenhado para `any` fica
decapitado. O maskable precisa da **safe zone de 40% central** (símbolo dentro de
um círculo de raio 40% do lado, resto é sangria de fundo).

`apple-touch-icon` à parte porque iOS não implementa `maskable` e aplica o próprio
arredondamento — ícone com fundo transparente fica preto no iOS, então este tem
fundo chapado.

### Manifest — valores que eu defino

A rota `src/app/manifest.webmanifest/route.ts` é da Fachada/Estrutura; **os valores
visuais são meus**:

```
name:             "Finanças a Dois"
short_name:       "Finanças"        (≤12 chars, cabe sob o ícone no Android)
description:      "Controle de contas, faturas e acerto do mês para o casal."
display:          "standalone"
orientation:      "portrait"
start_url:        "/inicio"
background_color: "#F7F8F7"   (= --background claro; é a splash, não o tema)
theme_color:      "#14594A"   (= --primary da paleta Cedro default)
```

`background_color` **tem que ser** o `--background` do modo claro: é a cor da
splash screen enquanto o app carrega, e se for escura dá flash branco→escuro→claro.
A v1 usou `#0f172a` (escuro) com tema claro — era o flash.

**Limitação conhecida e aceita:** `theme_color` no manifest é estático; não
acompanha a paleta escolhida nem o modo. Mitigação: `<meta name="theme-color">`
no `<head>` com `media="(prefers-color-scheme: dark)"` para dar ao menos a
variante escura. Fica como pendência (§11): seguir a *paleta* exige manifest
dinâmico por usuário, que é complexidade desproporcional no beta.

### OG image — e o teste dos 300px

`1200×630`. O texto precisa sobreviver reduzido a ~300px de largura (preview de
WhatsApp/LinkedIn), que é fator 4 — logo **mínimo prático de ~60px no original**.

| Elemento | Tamanho no original | A 300px (÷4) | Sobrevive? |
|---|---|---|---|
| "Finanças a Dois" | **96px** | 24px | sim |
| Subtítulo "Contas, faturas e o acerto do mês" | **40px** | 10px | marginal — **aceito como decorativo**, a mensagem está no título |
| Símbolo | **160px** | 40px | sim |

Composição: símbolo à esquerda, título à direita, fundo `--background` claro com
um bloco de `--primary` Cedro sangrando pela borda esquerda. **Sem gradiente, sem
screenshot do app** (screenshot de UI em OG fica ilegível a 300px).

### Verificação — honestamente declarada

| Item | Status |
|---|---|
| favicon legível a 16px | **NÃO VERIFICADO — dev server ausente** (app sem telas; verificar na FASE: EXECUÇÃO) |
| OG reduzido a ~300px | **NÃO VERIFICADO — dev server ausente** |
| ícone maskable na safe zone | **NÃO VERIFICADO — dev server ausente** |
| peso de cada asset por `ls -l` | **NÃO VERIFICADO** — assets ainda não existem; medir na execução |
| `getComputedStyle` confirmando token aplicado | **NÃO VERIFICADO — dev server ausente** |

Isso é pendência explícita para o Maestro, não item concluído. Na FASE: EXECUÇÃO,
cada linha acima vira screenshot com caminho absoluto.

---

## 9. Handoff para a Fachada — o que eu emito e o que ela consome

Formato base: `Skill(skill="design:design-handoff")`, acrescido dos itens que são
só meus. O handoff completo será gravado em `docs/design/handoff.md` na FASE:
EXECUÇÃO. Esta seção fixa o **contrato**.

### 9.1 Arquivos que eu vou emitir na execução

| Caminho exato | Conteúdo | Dono |
|---|---|---|
| `app/src/app/globals.css` | **fonte da verdade dos tokens**: `@import`, `@custom-variant dark`, `:root`, `.dark`, os 3 blocos `[data-paleta=...]` + `.dark[data-paleta=...]`, `@theme inline`, `@layer base` | **meu** (reescrita completa do arquivo atual) |
| `app/src/styles/chart-palette.ts` | paleta de séries + marcadores + `corDaSerie()` | **meu** (consumido pelo Dash) |
| `app/src/styles/tema.ts` | `PALETAS` (id + nome em pt-BR + swatch para o seletor), `MODOS`, chaves de `localStorage`, tipos `PaletaId`/`ModoId` | **meu** (consumido pela Fachada no seletor de ajustes) |
| `app/public/icons/*` | os 7 arquivos de ícone de §8 | **meu** |
| `app/public/og.png` | OG image | **meu** |
| `app/src/app/favicon.ico` | substitui o do create-next-app | **meu** |
| `docs/design/handoff.md` | o handoff escrito completo | **meu** |

**Fora da minha fronteira, descrito para a Fachada aplicar** (§10): o script
inline anti-flash no `<head>`, as chamadas `next/font` em `layout.tsx`, o
componente seletor de paleta/modo, e todo JSX.

### 9.2 Tabela token → claro → escuro → uso

Contrato shadcn/Tailwind 4 (confirmado via `Skill(skill="vercel:shadcn")`).
Os tokens padrão que o shadcn espera, todos presentes:

| Token | Claro | Escuro | Uso pretendido |
|---|---|---|---|
| `--background` | `#F7F8F7` | `#101417` | fundo da página |
| `--foreground` | `#14181C` | `#E8ECEB` | texto principal |
| `--card` | `#FFFFFF` | `#171C20` | superfície de card |
| `--card-foreground` | `#14181C` | `#E8ECEB` | texto em card |
| `--popover` | `#FFFFFF` | `#1E242A` | popover, dropdown |
| `--popover-foreground` | `#14181C` | `#E8ECEB` | texto em popover |
| `--primary` | *por paleta* | *por paleta* | **só** ação principal, nav ativa, link, foco |
| `--primary-foreground` | *por paleta* | *por paleta* | texto sobre primary |
| `--secondary` | `#EDF0EF` | `#1E242A` | botão secundário |
| `--secondary-foreground` | `#14181C` | `#E8ECEB` | texto em secundário |
| `--muted` | `#EDF0EF` | `#1E242A` | superfície suave, skeleton |
| `--muted-foreground` | `#5A6670` | `#9BA6AC` | texto de apoio, rótulo |
| `--accent` | *por paleta* — §3.2, medido | *por paleta* — §3.2, medido | hover de item de lista/menu |
| `--accent-foreground` | `#14181C` | `#E8ECEB` | texto sobre accent (= `--foreground`) |
| `--border` | `#DDE2E1` | `#2A3238` | **só** régua decorativa |
| `--border-forte` | `#7D878C` | `#6E7A81` | **toda** borda de componente interativo |
| `--input` | `#7D878C` | `#6E7A81` | borda de campo (= `--border-forte`) |
| `--ring` | *por paleta* | *por paleta* | anel de foco |
| `--destructive` | `#C0362C` | `#FF8A7A` | ação destrutiva (excluir) |
| `--destructive-foreground` | `#FFFFFF` | `#101417` | texto sobre destructive |
| `--receita` | `#0F7A52` | `#3FC68B` | valor de receita |
| `--despesa` | `#C0362C` | `#FF8A7A` | valor de despesa |
| `--investimento` | `#1F5FA8` | `#74AEF0` | valor de investimento |
| `--transferencia` | `#6B5BB5` | `#A79BF0` | valor de transferência |
| `--pendente` | `#8A5A00` | `#E0A93F` | lançamento não pago |
| `--negativo` | `#9A2B22` | `#FF6F61` | saldo de conta < 0 |
| `--beneficio` | `#0A6B6B` | `#3FC2C2` | conta/lançamento de benefício |

`--destructive` reusa deliberadamente o hex de `--despesa`: excluir e gastar são
ambos "perda", e um quinto vermelho só adicionaria ruído. Já medido: 5.18:1 claro
/ 8.08:1 escuro.

**Cada token de cor acima tem par claro/escuro.** Nenhum token sem par.

### 9.3 Fontes e carregamento

```
Instrument Sans — next/font/google, variable, subsets ["latin","latin-ext"],
                  display "swap", variável CSS --fonte-ui
IBM Plex Mono   — next/font/google, weights ["400","500","600"],
                  subsets ["latin","latin-ext"], display "swap", variável --fonte-mono
```

- variáveis de font no `<html>`, **não** no `<body>`
- em `@theme inline`, **nomes literais** — nunca `var(--fonte-ui)` (§4)
- `@import` de fonte em CSS: **proibido**

### 9.4 Assets: caminho absoluto e quem consome

| Asset | Consumido por |
|---|---|
| `app/public/icons/favicon.svg` | `metadata.icons` em `app/src/app/layout.tsx` |
| `app/src/app/favicon.ico` | convenção automática do App Router |
| `app/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-*.png` | `app/src/app/manifest.webmanifest/route.ts` |
| `app/public/icons/apple-touch-icon.png` | `metadata.appleWebApp` em `layout.tsx` |
| `app/public/og.png` | `metadata.openGraph.images` em `layout.tsx` |

Caminho absoluto de cada arquivo entra no `handoff.md` na execução, depois de
existirem.

### 9.5 Ícones: decorativo ou informativo

Declaração por ícone — a Fachada aplica conforme:

| Ícone | Classificação | O que a Fachada faz |
|---|---|---|
| seta entrando / saindo no valor | **DECORATIVO** | `aria-hidden="true"` — o sinal `+`/`−` e o valor já dizem |
| ícone no badge de tipo | **DECORATIVO** | `aria-hidden="true"` — a palavra "Despesa" está ao lado |
| relógio de pendente | **DECORATIVO** | `aria-hidden="true"` — a palavra "Pendente" está ao lado |
| triângulo de alerta em saldo negativo | **INFORMATIVO** | rótulo: **"Saldo negativo"** |
| olho de ocultar valores | **INFORMATIVO** | rótulo: **"Mostrar valores"** / **"Ocultar valores"** (alterna com o estado) |
| botão de trocar paleta | **INFORMATIVO** | rótulo: **"Escolher cor do app"** |
| botão de trocar modo claro/escuro | **INFORMATIVO** | rótulo: **"Mudar para tema escuro"** / **"Mudar para tema claro"** |
| cofre (investimento) | **DECORATIVO** | `aria-hidden="true"` |
| ticket (benefício) | **DECORATIVO** | `aria-hidden="true"` |
| símbolo da marca no cabeçalho | **INFORMATIVO** | rótulo: **"Finanças a Dois"** |

Todo SVG que eu emitir terá `viewBox`, `width`, `height` e `fill="currentColor"`
onde a cor deve ser herdada. Nenhum `fill` hardcoded em ícone de UI.

### 9.6 Regras que a Fachada NÃO pode violar

| # | Regra | Motivo medido |
|---|---|---|
| **C-1** | `--primary` nunca codifica valor financeiro; semântica financeira nunca pinta chrome | §3.3 — colisão de 1.01:1 a 1.19:1 entre primary e semântica |
| **C-2** | Todo valor monetário tem sinal `+`/`−` explícito | §5.3 — protanopia funde receita/despesa (ΔE 13.5) |
| **C-3** | Saldo negativo usa parênteses contábeis + ícone, além da cor | §5.3 — despesa vs negativo a ΔE 13.8 em visão normal |
| **C-4** | Borda de componente interativo usa `--border-forte`, nunca `--border` | §3.1 — `--border` mede 1.23:1, isenta só como régua |
| **T-1** | Valor monetário sempre em `--font-mono` com `tabular-nums` e alinhado à direita | §4 — coluna serrilha sem isso |
| **T-2** | Número dentro de texto de UI usa `tabular-nums` | §4 — Realtime muda valor na tela e o número pula |
| **T-3** | **Proibido** eyebrow ALL-CAPS tracked-out acima de heading | tell de design gerado por IA |
| **T-4** | **Proibido** `→` colado em texto de botão | tell de design gerado por IA |
| **T-5** | Nenhum hex hardcoded em componente — só tokens | `design:design-system` modo `audit` vai pegar |
| **A-1** | Alvo de toque ≥ `44×44px` (WCAG 2.5.5); se o visual é menor, área clicável ampliada por padding | mobile é o caso principal |
| **A-2** | Foco visível sempre: `outline: 2px solid var(--ring); outline-offset: 2px` | pior caso de `--ring` mede 6.19:1, acima do 3:1 de 1.4.11 |
| **A-3** | `prefers-reduced-motion` respeitado nos 3 tokens de motion | §6 |

### 9.7 Breakpoints, estados e edge cases de texto

Mobile-first. O PWA é instalado no celular; desktop é cortesia.

| Breakpoint | Comportamento |
|---|---|
| base (< 640px) | 1 coluna; nav inferior fixa; cartão de conta full-width; valor-herói 40px; lista densa |
| `sm` (≥ 640px) | cartões de conta em 2 colunas |
| `md` (≥ 768px) | nav vai para o topo; conteúdo com `max-width: 48rem` centralizado |
| `lg` (≥ 1024px) | KPIs em 4 colunas; `max-width: 64rem` |

Os 3 breakpoints que o Maestro exige para prova de screenshot (375 / 768 / 1440)
caem em base / `md` / `lg`.

**Estados de interação** (todo elemento interativo precisa dos 6):

| Estado | Tratamento |
|---|---|
| default | token base |
| hover | `--accent` de fundo (item de lista) ou primary 8% mais escuro (botão); `--motion-rapido` |
| focus-visible | `outline: 2px solid var(--ring); outline-offset: 2px` — **nunca** `outline: none` |
| active | escala `0.98` + `--motion-rapido` |
| disabled | `opacity: 0.5` + `cursor: not-allowed`; **não** remove contraste de texto abaixo de 4.5:1 |
| loading | `Skeleton` em `--muted`, com `aria-busy="true"` |

**Edge cases de texto** (pt-BR é mais longo que inglês — "Transferência" tem 14
caracteres contra 8 de "Transfer"):

| Caso | Tratamento |
|---|---|
| nome de conta longo | 1 linha, `text-overflow: ellipsis`, `title` com o nome completo; eixo `wdth` 85 no rótulo micro antes de elipsar |
| descrição de lançamento longa | 2 linhas máximo, depois elipse |
| valor muito grande (`numeric(14,2)` → até `R$ 999.999.999.999,99`) | valor-herói reduz de 40px para 28px quando passa de 12 caracteres; **nunca** quebra linha nem elipsa — valor truncado é dado errado |
| valores ocultos (olho) | `R$ ••••` mantendo a mesma largura de caixa, para a lista não pular |
| estado vazio | **sem ilustração** (nenhum asset meu aqui); uma frase de ação em `--muted-foreground` no tamanho `--texto-corpo`, centralizada, com o botão de ação primário abaixo. **O texto é do Fachada** (`design:ux-copy` não é minha skill) — eu especifico só o tratamento visual |
| erro | borda `--destructive` + mensagem abaixo do campo, nunca só a borda vermelha (1.4.1) |
| nome de membro longo no acerto | frase quebra em 2 linhas, nunca elipsa — "quem deve a quem" é a resposta, precisa estar inteira |

---

## 10. Fronteira de escrita

**Escrevo apenas em:**
`app/src/app/globals.css` (bloco de tokens) · `app/src/styles/**` ·
`app/public/**` · `app/src/app/favicon.ico` · `docs/design/**`

**Não toco em:** componente, rota, `.sql`, migration, `vercel.json`, variável de
ambiente. **Em particular: `app/supabase/` está sendo trabalhado por outro agente
neste exato momento — não toco.** Também não toco `app/src/components/`.

**Mudanças que exigem mão alheia** (descritas aqui, aplicadas por quem é dono):

| Mudança | Dono |
|---|---|
| chamadas `next/font` + `className` no `<html>` de `layout.tsx` | Fachada |
| script inline anti-flash no `<head>` + `suppressHydrationWarning` | Fachada |
| `metadata` (`icons`, `openGraph`, `appleWebApp`, `theme-color`) | Fachada |
| componente seletor de paleta e de modo em `/ajustes` | Fachada |
| `src/app/manifest.webmanifest/route.ts` (valores visuais em §8) | Fachada |
| remover `font-family: Arial...` do `body` em `globals.css` | **meu** (é o meu arquivo) |

---

## 11. Riscos e pendências

| # | Risco / pendência | Severidade | Encaminhamento |
|---|---|---|---|
| R-1 | Nenhum asset visto renderizado (sem dev server, app sem telas) | **média** | Todos os itens de §8 marcados `NÃO VERIFICADO`. Verificar na FASE: EXECUÇÃO com Playwright e registrar caminho absoluto de cada screenshot. |
| R-2 | `shadcn init` roda **depois** de mim e reescreve `globals.css` | **alta** | O plano de Onda 1 (Tarefa 1, Passo 2) roda `npx shadcn@latest init`. Se rodar depois dos meus tokens, destrói tudo. **Ordem obrigatória: `shadcn init` ANTES do Vitrine executar**, ou o Vitrine reaplica depois. Risco para o Maestro decidir a ordem. |
| R-3 | O plano de Onda 1 lista `tailwind.config.ts` no mapa de arquivos (linha 132) e manda criá-lo (Tarefa 1) | **média** | Contradiz a própria constraint global do plano (linha 19) e Tailwind 4. **Não criar.** Registrado como correção de plano, não minha para aplicar. |
| R-4 | `theme_color` do manifest não acompanha paleta nem modo | **baixa** | Aceito no beta: `theme_color` fixo Cedro + `<meta name="theme-color">` com variante dark. Manifest por usuário é complexidade desproporcional. |
| R-5 | Paleta sequencial (heatmap) não definida | **baixa** | É Onda 2 e precisa da métrica definida antes da rampa. Fica pendente; o Dash pede quando chegar lá. |
| R-6 | Gráficos são Onda 2, mas `chart-palette.ts` nasce na Onda 1 | **baixa** | Deliberado: é parte do sistema de cor e precisa de validação conjunta. Sem consumidor até a Onda 2 — declarado aqui para não parecer falha silenciosa. |
| R-7 | Hook `security-guidance` não confirmado ativo nesta sessão | **baixa** | Minha varredura de SVG (`grep` de `<script`/`on*=`/`javascript:`) é final de ciclo. Todo SVG que eu emitir será **gerado por mim**, não de terceiro — risco baixo, mas a varredura roda igual na execução. |
| R-8 | `favicon.ico` atual é o do create-next-app | **baixa** | Substituir na execução. |

---

## 12. Licenças

### Fontes

| Arquivo entregue | URL exata da origem | Autor / crédito | Licença | Exige atribuição visível? |
|---|---|---|---|---|
| Instrument Sans (via `next/font/google`, self-hosted no build) | `https://fonts.google.com/specimen/Instrument+Sans` · repo: `https://github.com/Instrument/instrument-sans` | Rodrigo Fuenzalida & Instrument | **SIL OFL 1.1** | Não |
| IBM Plex Mono (via `next/font/google`, self-hosted no build) | `https://fonts.google.com/specimen/IBM+Plex+Mono` · repo: `https://github.com/IBM/plex` | Mike Abbink, Paul van der Laan, Pieter van Rosmalen / IBM | **SIL OFL 1.1** | Não |

**Web embedding confirmado:** SIL OFL 1.1 permite embedding e redistribuição,
inclusive self-hosted. O `next/font/google` baixa os arquivos no build e os serve
do próprio domínio — nenhuma requisição a `fonts.gstatic.com` em runtime, logo
nenhum dado do usuário vai ao Google. A OFL exige que o *Reserved Font Name* não
seja usado em versão modificada; não modifico as fontes. Atribuição visível na UI
não é exigida.

### Assets gráficos

| Arquivo entregue | URL exata da origem | Autor / crédito | Licença | Exige atribuição visível? |
|---|---|---|---|---|
| `app/public/icons/favicon.svg` | — (origem: este plano, §8) | Vitrine / HORI Analytics, para o cliente | **gerado** | Não |
| `app/src/app/favicon.ico` | — | Vitrine / HORI Analytics | **gerado** | Não |
| `app/public/icons/icon-192.png`, `icon-512.png` | — | Vitrine / HORI Analytics | **gerado** | Não |
| `app/public/icons/icon-maskable-192.png`, `icon-maskable-512.png` | — | Vitrine / HORI Analytics | **gerado** | Não |
| `app/public/icons/apple-touch-icon.png` | — | Vitrine / HORI Analytics | **gerado** | Não |
| `app/public/og.png` | — | Vitrine / HORI Analytics | **gerado** | Não |

**Nenhum asset de terceiro entra na entrega.** Todo gráfico é desenhado por mim
como SVG e rasterizado — zero dependência de banco de imagem, zero risco jurídico
transferido ao cliente. Ícones de UI (seta, relógio, cofre, ticket, olho, alerta)
virão do **Lucide** (`https://lucide.dev`, licença **ISC**, não exige atribuição
visível), que é o conjunto que o shadcn já usa — a Fachada os consome via o
pacote `lucide-react`, não como arquivo em `public/`, então não entram na minha
tabela de assets.

---

## 13. Ordem de execução da FASE: EXECUÇÃO

1. **Confirmar com o Maestro se `shadcn init` já rodou** (risco R-2). Se não,
   pedir que rode antes — ou assumir que vou reaplicar depois.
2. Reescrever `app/src/app/globals.css` completo: `@import` → `@custom-variant`
   → `:root` → `.dark` → blocos `[data-paleta]` → `@theme inline` → `@layer base`.
   Remover o `font-family: Arial` e o `@media (prefers-color-scheme: dark)`
   do arquivo atual (substituído por `.dark` com escolha do usuário).
3. **Remedir** todos os pares deste plano contra o arquivo escrito (os hex podem
   sofrer ajuste de digitação; a medição é que vale).
4. Emitir `app/src/styles/tema.ts` e `app/src/styles/chart-palette.ts`.
5. Desenhar o símbolo em SVG; derivar os 7 ícones + OG.
6. Rodar `grep -niE '<script|on[a-z]+=|javascript:'` em todo SVG emitido.
7. Medir peso de cada asset com `ls -l` e preencher a tabela de orçamento.
8. **Se houver dev server:** Playwright — `getComputedStyle` dos tokens nos 4
   paletas × 2 modos, favicon a 16px, OG a `1200×630` e reduzido,
   `emulate_media(colorScheme="dark")` e remedição.
   **Se não houver:** registrar `NÃO VERIFICADO — dev server ausente` por item.
9. `Skill(skill="design:accessibility-review")` com os números finais.
10. Gravar `docs/design/handoff.md` via `Skill(skill="design:design-handoff")`.
11. `Skill(skill="superpowers:verification-before-completion")`.

---

## 14. O que ainda NÃO dá para decidir

| Item | Por que não dá | Quando dá |
|---|---|---|
| Se o símbolo funciona a 16px | Precisa existir e ser visto renderizado | FASE: EXECUÇÃO, com Playwright |
| Paleta sequencial (heatmap, forecast) | Depende de qual métrica vai na rampa e se é divergente ou sequencial | Onda 2, quando o Dash especificar o gráfico |
| Peso real de cada asset | Assets não existem | FASE: EXECUÇÃO, por `ls -l` |
| Se `--accent` serve também como fundo de chip preenchido | Como fundo de hover está medido (§3.2). Chip preenchido com texto `--primary` por cima é outro par, e depende de a Fachada querer esse componente | Quando o 1º chip preenchido existir; medir o par então |
| Se 8 séries bastam | Depende de quantas categorias de despesa a família criar na prática | Onda 2, com dado real; a regra de "Outros" cobre o excedente até lá |
