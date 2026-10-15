# Handoff de design: Finanças a Dois v2

> **De:** Vitrine (identidade visual) · **Para:** Fachada (e Dash, onde indicado) · **FASE: EXECUÇÃO** · 2026-10-11
> **Formato base:** `design:design-handoff`, acrescido dos itens que são só do Vitrine.
> **Plano que originou:** `docs/design/plano-tokens.md`
>
> **SUPOSIÇÃO:** sem relatório do Radar. Nenhum `docs/pesquisa/*radar*.md` existe neste projeto. A direção visual deriva do briefing e da engenharia reversa da v1. Nenhuma referência externa foi consultada.

---

## 0. Leia isto primeiro: as regras que não podem ser violadas

Estas regras nasceram de números medidos, não de gosto. Se um componente quebrar uma delas, o componente está errado, não a regra.

| # | Regra | Por que, com número |
|---|---|---|
| **C-1** | **`--primary` nunca codifica valor financeiro. Semântica financeira nunca pinta chrome.** `--primary` serve só a: botão de ação principal, estado ativo de navegação, link, anel de foco. Valor, badge de tipo e seta de direção usam exclusivamente `--receita` / `--despesa` / `--investimento` / `--transferencia` / `--pendente` / `--negativo` / `--beneficio`. | Com quatro paletas livres e sete semânticas fixas, alguma paleta sempre cai no matiz de alguma semântica (remedido 2026-10-15: Terra escuro `#F09070` vs despesa `#FB7185`: 1.14:1; Terra claro `#9E3F23` vs despesa `#A70225`: 1.19:1 e vs pendente `#854A00`: 1.07:1). Não se resolve mexendo em hex; resolve-se separando os usos. |
| **C-2** | **Todo valor monetário exibe sinal `+` ou `−` explícito**, antes do `R$`, sem exceção. | Receita vs despesa, OKLab ΔE×100 sob simulação Machado 2009 (`deltaE` do `dataviz/validate_palette.js`), remedido 2026-10-15: deuteranopia **6.4 (claro) e 3.9 (escuro)**, protanopia 11.6 e 10.9. Em deuteranopia as duas cores colapsam. O sinal sobrevive a qualquer daltonismo e a print em preto e branco. |
| **C-3** | **Saldo de conta negativo usa parênteses contábeis `(R$ 1.234,56)` + ícone de alerta**, além da cor. | Desde `bee799a`, `--negativo` tem o **mesmo hex** de `--despesa` nos dois modos: ΔE 0.0. A cor não distingue nada; parênteses + ícone são a ÚNICA diferença entre "esta linha é despesa" e "esta conta está no vermelho". |

Investimento e transferência não têm sinal `+`/`−` porque não mudam patrimônio como receita/despesa. Para eles o reforço é o ícone + a palavra do tipo (tabela da seção 4).

Teste de aceite verificável (o Sentinela vai rodar): aplicar `filter: grayscale(1)` na página e conferir que receita, despesa, pago, pendente e saldo negativo continuam identificáveis. Se algum ficar ambíguo, reprova.

---

## 1. Onde vivem os tokens

**Fonte da verdade:** `C:\Users\Heitor PC\OneDrive\Documentos\SEGUNDO CÉREBRO\HORI ANALYTCIS PROJETOS\Finanças a Dois\app\src\app\globals.css`

Não existe `tailwind.config.ts` (Tailwind 4: tema por `@theme` no CSS). Não crie.

Estrutura do arquivo, na ordem em que a cascata exige:

```
@import tailwindcss / tw-animate-css / shadcn/tailwind.css
@custom-variant dark (&:where(.dark, .dark *))
:root                          chassi claro + semântica clara + paleta Cedro clara + escalas
.dark                          chassi escuro + semântica escura + paleta Cedro escura
[data-paleta="ardosia|terra|ameixa"]        só primary / primary-foreground / ring / accent (claro)
.dark[data-paleta="ardosia|terra|ameixa"]   idem (escuro)
@theme inline                  mapeia --x para --color-x (gera bg-receita, text-despesa...)
@layer base / utilities        foco visível, .valor, .num-tabular, .texto-micro
@media (prefers-reduced-motion) zera os tokens de motion
```

Duas dimensões independentes no `<html>`: **modo** pela classe `.dark`, **paleta** pelo atributo `data-paleta` (`cedro` é o default e dispensa o atributo). Cascata: `.dark[data-paleta=X]` vence `[data-paleta=X]`, que vence `.dark`, que vence `:root`. A paleta troca só quatro variáveis; **chassi e semântica nunca mudam com a paleta**.

Arquivos TS (módulos com consumidor declarado, ver seção 6):

| Caminho | Quem importa |
|---|---|
| `app/src/styles/chart-palette.ts` | **Dash**: `app/src/components/analises/grafico-rosca-categorias.tsx` e `previsao-fixos.tsx` (ver §5) |
| `app/src/styles/tema.ts` | **Fachada**: seletor de paleta/modo em `/ajustes` e o script anti-flash |

---

## 2. Tabela de tokens: token, claro, escuro, uso, contraste medido

Todo contraste vem do script `docs/design/scripts/contraste.js` rodado contra o `globals.css` emitido (saída em `docs/design/evidencias/contraste.out`) e foi confirmado no navegador por `getComputedStyle` (seção 8). Limiares: `>=4.5:1` texto normal; `>=3:1` texto grande, componente de UI, ícone e borda de foco (WCAG 1.4.11).

### 2.1 Chassi (fixo em todas as paletas)

| Token | Claro | Escuro | Uso pretendido | Contraste claro | Contraste escuro |
|---|---|---|---|---|---|
| `--background` | `#F7F8F7` | `#101417` | fundo da página | base | base |
| `--foreground` | `#14181C` | `#E8ECEB` | texto principal | 16.76:1 sobre background · 17.84:1 sobre card · 15.56:1 sobre muted | 15.54:1 · 14.41:1 · 13.15:1 |
| `--card` | `#FFFFFF` | `#171C20` | superfície de card (mais clara que o papel no claro) | base | base |
| `--card-foreground` | `#14181C` | `#E8ECEB` | texto em card | 17.84:1 | 14.41:1 |
| `--popover` | `#FFFFFF` | `#1E242A` | popover, dropdown | base | base |
| `--popover-foreground` | `#14181C` | `#E8ECEB` | texto em popover | 17.84:1 | 13.15:1 |
| `--secondary` | `#EDF0EF` | `#1E242A` | botão secundário | base | base |
| `--secondary-foreground` | `#14181C` | `#E8ECEB` | texto em secundário | 15.56:1 | 13.15:1 |
| `--muted` | `#EDF0EF` | `#1E242A` | superfície suave, skeleton | base | base |
| `--muted-foreground` | `#5A6670` | `#9BA6AC` | texto de apoio, data, categoria, rótulo de KPI | 5.53:1 background · 5.88:1 card · 5.13:1 muted | 7.44:1 · 6.90:1 · 6.30:1 |
| `--border` | `#DDE2E1` | `#2A3238` | **só** régua decorativa entre linhas do extrato | 1.23:1, **isenta** (ver nota) | 1.42:1, **isenta** |
| `--border-forte` | `#7D878C` | `#6E7A81` | **toda** borda de componente interativo | 3.45:1 background · 3.67:1 card | 4.20:1 · 3.89:1 |
| `--input` | `#7D878C` | `#6E7A81` | borda de campo (= `--border-forte`) | 3.45:1 | 4.20:1 |
| `--destructive` | `#BE352C` | `#FF8A7A` | ação destrutiva e texto de erro (mesma família de `--despesa`, hex diferente) | 5.28:1 sobre background | 8.08:1 |
| `--destructive-foreground` | `#FFFFFF` | `#101417` | texto sobre destructive | 5.62:1 | 8.08:1 |

> **Nota sobre `--border` a 1.23:1 / 1.42:1.** Reprova o 3:1 e é declarada isenta, não aprovada: WCAG 1.4.11 cobre "partes gráficas necessárias para identificar um componente", e esta é só a régua entre linhas, redundante com o espaçamento. Por isso o sistema tem dois tokens de borda. **Regra C-4:** se a borda é a única coisa que mostra onde um campo começa, é `--border-forte`, nunca `--border`. Atenção: o shadcn aplica `border-border` a tudo por padrão (`* { border-border }` em `@layer base`). Todo `Input`, `Select`, `Checkbox`, `Textarea` e cartão clicável precisa de `border-input` (ou `border-border-forte`) explícito. Verifique cada componente após `shadcn add`.

### 2.2 Paletas escolhíveis

Cada paleta sobrescreve quatro tokens. Nomes em pt-BR: Cedro (default), Ardósia, Terra, Ameixa.

| Paleta | `--primary` claro | `--primary` escuro | `--primary-foreground` claro / escuro | `--ring` | `--accent` claro | `--accent` escuro |
|---|---|---|---|---|---|---|
| Cedro | `#14594A` | `#5FD3B2` | `#FFFFFF` / `#101417` | = primary | `#E4EDE9` | `#1B2E2A` |
| Ardósia | `#1C4F80` | `#7FB8F2` | `#FFFFFF` / `#101417` | = primary | `#E4EBF3` | `#1A2733` |
| Terra | `#9E3F23` | `#F09070` | `#FFFFFF` / `#101417` | = primary | `#F5E6E0` | `#2E211C` |
| Ameixa | `#6B2A5E` | `#D98FC6` | `#FFFFFF` / `#101417` | = primary | `#F0E4EE` | `#2A1E28` |

| Paleta | primary-fg / primary (claro · escuro) | primary / background (claro · escuro) | ring / card (claro · escuro), 1.4.11 |
|---|---|---|---|
| Cedro | 8.21:1 · 10.09:1 | 7.71:1 · 10.09:1 | 8.21:1 · 9.36:1 |
| Ardósia | 8.47:1 · 8.85:1 | 7.96:1 · 8.85:1 | 8.47:1 · 8.21:1 |
| Terra | 6.58:1 · 7.87:1 | 6.19:1 · 7.87:1 | 6.58:1 · 7.30:1 |
| Ameixa | 9.92:1 · 7.66:1 | 9.31:1 · 7.66:1 | 9.92:1 · 7.11:1 |

Pior caso de foco do sistema: **6.19:1** (Terra claro, ring sobre background), bem acima do 3:1 de 1.4.11.

`--accent-foreground` = `--foreground` (não muda de cor no hover). Texto sobre `--accent`:

| Paleta | foreground / accent (claro · escuro) | muted-foreground / accent (claro · escuro) |
|---|---|---|
| Cedro | 14.94:1 · 11.99:1 | 4.93:1 · 5.74:1 |
| Ardósia | 14.85:1 · 12.76:1 | 4.90:1 · 6.11:1 |
| Terra | 14.68:1 · 13.05:1 | 4.84:1 · 6.25:1 |
| Ameixa | 14.47:1 · 13.41:1 | 4.77:1 · 6.42:1 |

### 2.3 Semântica financeira (idêntica em todas as paletas)

> **Revisão 2026-10-15 (auditoria de contraste).** O commit `bee799a` trocou toda a semântica, nos dois modos, por hex mais vivos sem remedir; no claro, 34 de 180 pares reprovaram (pior: `--pendente` `#D97706` sobre accent Ameixa, 2.58:1). As 6 cores claras abaixo foram escurecidas mantendo a matiz OKLCH (receita h 161.5, despesa/negativo h 21.5, pendente h 61.6, benefício h 222.1; investimento girou de h 242 para h 252 para se afastar de benefício: ΔE OKLab×100 5.6 antes → 7.7 agora). O escuro é o de `bee799a`, mantido. `--transferencia` não foi tocada. Antes → depois, claro: receita `#0D8C5F` → `#036543`; despesa `#D93845` → `#A70225`; investimento `#0284C7` → `#0359A1`; pendente `#D97706` → `#854A00`; negativo `#D93845` → `#A70225`; benefício `#0891B2` → `#066077`.

Medida como TEXTO sobre background, card e, no pior caso das quatro paletas, sobre `--accent` (linha de lista em hover). Saída íntegra: `docs/design/evidencias/contraste.out` (`FALHAS: 0 | total: 180`). Nenhum override por `[data-paleta]` foi necessário: o pior accent (Ameixa `#F0E4EE`) já passa com um valor único.

| Token | Significado | Claro | Escuro | Claro: bg · card · accent (mín.) | Escuro: bg · card · accent (mín.) |
|---|---|---|---|---|---|
| `--receita` | entrada de dinheiro | `#036543` | `#10B981` | 6.69 · 7.13 · 5.78 | 7.30 · 6.77 · 5.63 |
| `--despesa` | saída de dinheiro | `#A70225` | `#FB7185` | 7.36 · 7.84 · 6.36 | 6.88 · 6.38 · 5.30 |
| `--investimento` | aplicado (não é gasto) | `#0359A1` | `#38BDF8` | 6.69 · 7.12 · 5.78 | 8.64 · 8.01 · 6.66 |
| `--transferencia` | move entre contas | `#7C3AED` | `#A78BFA` | 5.35 · 5.70 · 4.62 | 6.80 · 6.31 · 5.25 |
| `--pendente` | lançado, ainda não pago | `#854A00` | `#FBBF24` | 6.63 · 7.05 · 5.72 | 11.09 · 10.28 · 8.55 |
| `--negativo` | saldo de conta abaixo de zero (= despesa) | `#A70225` | `#FB7185` | 7.36 · 7.84 · 6.36 | 6.88 · 6.38 · 5.30 |
| `--beneficio` | vale/benefício | `#066077` | `#22D3EE` | 6.69 · 7.13 · 5.78 | 10.24 · 9.50 · 7.90 |

**Texto sobre o próprio tint** (`bg-X/10` ou `bg-X/15` com `text-X`, padrão de chip/badge/filtro usado em `resumo-do-mes`, `secao-faturas`, `lista-transacoes-interativa`, `item-transacao` e outros). O `contraste.js` não mede este par; ele foi medido à parte (`docs/design/evidencias/semantica-tint.out`, composição alfa do tint sobre a superfície, @10 e @15), e confirmado no navegador (seção 8.1). Pior caso por grupo de superfície:

| Token | Claro: background/card/muted | Claro: accent (4 paletas) | Escuro: background/card/muted | Escuro: accent (4 paletas) |
|---|---|---|---|---|
| `--receita` | 4.96 (muted@15) | 4.63 (Ameixa@15) | 4.84 (muted@15) | **4.36** (Cedro@15) |
| `--despesa` / `--negativo` | 5.16 | 4.84 | 4.61 | **4.28** |
| `--investimento` | 4.93 | 4.61 | 5.48 | 5.01 |
| `--transferencia` | **4.02** (muted@15) | **3.78** (Ameixa@15) | 4.51 | **4.13** |
| `--pendente` | 4.92 | 4.62 | 6.73 | 6.11 |
| `--beneficio` | 4.95 | 4.63 | 6.32 | 5.69 |

Em negrito, abaixo de 4.5:1. **Regra C-5:** chip com tint (`bg-X/10`, `bg-X/15`) e texto `text-X` **não vai sobre `--accent`** (nem dentro de linha com `hover:bg-accent`). Escopo do que medi: nenhum dos 11 arquivos de `app/src/components` que usam tint contém `bg-accent` (grep de 2026-10-15); um componente pai em outro arquivo pintando `accent` por fora não foi rastreado. Nos casos lidos, os tints ficam sobre card, background, popover ou `muted/50`. `--transferencia` claro só passa no tint a @10 sobre card/background (uso atual em `dialogo-editar-lancamento`); a @15 ou sobre muted reprova. Ver pendência P-012 (seção 11).

Outros pares que dependem destes tokens, medidos 2026-10-15 (claro): `text-white` sobre `bg-despesa` sólido 7.84:1 (era 4.56), sobre `bg-receita` sólido 7.13:1 (era 4.26, **reprovava**); mapa de calor (`mapa-de-calor-dias.tsx`): `text-white` sobre `bg-[var(--despesa)]/70` 4.62:1 sobre card e 4.78:1 no navegador sobre background (era 2.96, **reprovava**), `text-foreground` sobre `/45` 6.95:1 e sobre `/20` 12.04:1.

"Pago" não tem token: pago é o estado normal e usa `--receita`/`--despesa` em peso cheio. `--pendente` é o desvio que chama atenção.

Mapeamento determinístico do schema (`type`, `is_paid`) para tratamento visual:

| `type` | `is_paid` | Cor do valor | Sinal | Ícone (Lucide) |
|---|---|---|---|---|
| `receita` | true | `--receita` | `+` | seta entrando |
| `receita` | false | `--pendente` | `+` | relógio |
| `despesa` | true | `--despesa` | `−` (U+2212) | seta saindo |
| `despesa` | false | `--pendente` | `−` | relógio |
| `investimento` | qualquer | `--investimento` | sem sinal | cofre |
| `transferencia` | qualquer | `--transferencia` | sem sinal | duas setas |
| saldo de conta < 0 | n/a | `--negativo` | parênteses `(R$ …)` | triângulo de alerta |
| `is_benefit = true` | n/a | `--beneficio` na borda/chip; valor segue o `type` | n/a | ticket |

### 2.4 Escalas: raio, sombra, espaçamento, motion, tipo

Raio uniforme e ausência de motion são sinais de interface gerada por IA; por isso cada degrau tem um motivo.

| Token | Valor | Onde | Classe Tailwind equivalente |
|---|---|---|---|
| `--raio-chip` | `4px` | badge, chip de categoria, pill de parcela | `rounded-sm` |
| `--raio-controle` | `8px` | input, select, botão | `rounded-md` / `rounded-lg` |
| `--raio-card` | `12px` | card de conteúdo, KPI, bloco de lista | `rounded-xl` |
| `--raio-cartao` | `16px` | **cartão de conta** (canto de cartão de crédito real) | `rounded-2xl` |
| `--raio-pill` | `9999px` | filtro de período e avatar | `rounded-full` |

| Token | Valor (claro) | Valor (escuro) | Onde |
|---|---|---|---|
| `--sombra-card` | `0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)` | `none` | card de conteúdo (`shadow-card`) |
| `--sombra-cartao` | `0 2px 4px rgb(0 0 0 / 0.08), 0 8px 16px -4px rgb(0 0 0 / 0.12)` | `none` | **só** o cartão de conta (`shadow-cartao`) |
| `--borda-cartao` | `1px solid transparent` | `1px solid rgb(255 255 255 / 0.10)` | usar como `border: var(--borda-cartao)` no cartão de conta |

Nada mais no app recebe sombra. No escuro a sombra some e entra a borda fina.

Espaçamento (base 4px): `--esp-1` 4 · `--esp-2` 8 · `--esp-3` 12 · `--esp-4` 16 · `--esp-5` 20 · `--esp-6` 24 · `--esp-8` 32 · `--esp-12` 48. Lista de lançamentos: compacta (`--esp-3`/`--esp-4`), porque é extrato. Formulário e ajustes: confortável (`--esp-6`).

| Token motion | Valor | Uso |
|---|---|---|
| `--motion-rapido` | `120ms cubic-bezier(0.2, 0, 0.4, 1)` | hover, foco, troca de estado de botão |
| `--motion-padrao` | `220ms cubic-bezier(0.2, 0, 0.2, 1)` | abrir sheet, expandir fatura, trocar paleta |
| `--motion-entrada` | `420ms cubic-bezier(0.16, 1, 0.3, 1)` | **o único momento orquestrado**: lançamento do parceiro chegando por Realtime (a linha entra deslizando; o badge "novo" pulsa uma vez) |

Com `prefers-reduced-motion: reduce` os três viram `1ms` e `animation-duration`/`transition-duration` globais também (já no CSS). A entrada via Realtime vira fade de opacidade: **a Fachada implementa**.

Tipografia, escala (tokens CSS `--texto-*` e `--texto-*-lh`):

| Token | Tamanho / linha | Peso e família | Uso |
|---|---|---|---|
| `--texto-valor-heroi` | 40px / 44px | Mono 600 | o saldo real na Carteira |
| `--texto-valor-destaque` | 28px / 32px | Mono 600 | valor de KPI, total da fatura |
| `--texto-valor-linha` | 16px / 24px | Mono 500 | valor na lista de lançamentos |
| `--texto-titulo` | 20px / 28px | Sans 600 | título de página |
| `--texto-subtitulo` | 17px / 24px | Sans 600 | nome da conta no cartão |
| `--texto-corpo` | 15px / 24px | Sans 400 | descrição, corpo (já aplicado ao `body`) |
| `--texto-apoio` | 13px / 18px | Sans 400 | data, categoria, rótulo de KPI |
| `--texto-micro` | 11px / 14px | Sans 500, `font-stretch: 85%` | rótulo não essencial no cartão de conta (classe `.texto-micro`) |

Nada abaixo de 11px; 11px só em rótulo não essencial. Texto corrido: no máximo 68 caracteres por linha (`max-width: 34rem`).

---

## 3. Fontes e como são carregadas

| Papel | Família | Carregamento | Variável CSS no `<html>` |
|---|---|---|---|
| UI / display | **Instrument Sans** | `next/font/google`, variável, `axes: ["wdth"]`, subsets `latin` + `latin-ext`, `display: "swap"` | `--fonte-ui` |
| Valor, data, parcela | **IBM Plex Mono** | `next/font/google`, pesos `400` `500` `600`, subsets `latin` + `latin-ext`, `display: "swap"` | `--fonte-mono` |

Já aplicado em `app/src/app/layout.tsx` (escopo autorizado: imports de fonte, variáveis e className). O `@theme inline` aponta `--font-sans` e `--font-mono` para `var(--fonte-ui)` / `var(--fonte-mono)`.

**Proibido:** `@import` de fonte em CSS; autorreferência `--font-sans: var(--font-sans)` (o `shadcn init` a introduz e ela quebra a fonte).

Dois usos obrigatórios:
- **Valor monetário** (regra T-1): classe `.valor` (mono + `tabular-nums` + alinhado à direita + sem quebra de linha).
- **Número dentro de texto de UI** (regra T-2): classe `.num-tabular`, porque o Realtime muda valor na tela e o número não pode pular.

Verificado em runtime: o eixo `wdth` funciona. O texto de 11px "Conta Principal Nubank Cartão" mede 158.0px a `font-stretch: 100%` e 131.6px a `85%` (16.7% mais estreito), que é o uso real do eixo: caber o nome da conta num cartão de 320px.

---

## 4. Assets: caminho absoluto, consumidor, peso e licença

Raiz: `C:\Users\Heitor PC\OneDrive\Documentos\SEGUNDO CÉREBRO\HORI ANALYTCIS PROJETOS\Finanças a Dois\app`

### 4.1 Inventário, peso e quem consome

Pesos medidos com `stat -c %s` (bytes). Orçamento do Vitrine: ícone SVG 4KB, thumbnail 30KB, OG 300KB.

| Asset (caminho a partir da raiz acima) | Dimensão | Peso | Teto | Dentro? | Consumido por |
|---|---|---|---|---|---|
| `public/icons/favicon.svg` | viewBox 32×32 | 461 B | 4 KB | sim | `metadata.icons` em `src/app/layout.tsx` (Fachada) |
| `src/app/favicon.ico` | 16×16 + 32×32 | 1321 B | 15 KB | sim | convenção automática do App Router |
| `public/icons/icon-192.png` | 192×192 | 3111 B | 30 KB | sim | `manifest`, `purpose: "any"` |
| `public/icons/icon-512.png` | 512×512 | 7803 B | 60 KB | sim | `manifest`, `purpose: "any"` |
| `public/icons/icon-maskable-192.png` | 192×192 | 2016 B | 30 KB | sim | `manifest`, `purpose: "maskable"` |
| `public/icons/icon-maskable-512.png` | 512×512 | 5254 B | 60 KB | sim | `manifest`, `purpose: "maskable"` |
| `public/icons/apple-touch-icon.png` | 180×180 | 2162 B | 30 KB | sim | `metadata.icons.apple` / `appleWebApp` |
| `public/og.png` | 1200×630 | 11657 B | 300 KB | sim | `metadata.openGraph.images` e `twitter` |

Nenhum asset estourou o orçamento; nenhuma justificativa foi necessária. Os PNGs são paletizados e sem gradiente (cor chapada).

**Formato:** o requisito geral de AVIF/WebP é para imagem fotográfica de conteúdo. Este projeto não tem foto. Ícone de PWA e OG precisam ser PNG (manifest e crawlers sociais não aceitam AVIF/WebP de forma confiável). Registrado, não é desvio de qualidade.

### 4.2 Manifest: valores visuais que são do Vitrine

A rota `app/src/app/manifest.webmanifest/route.ts` é da Fachada/Estrutura. Valores:

```
name:             "Finanças a Dois"
short_name:       "Finanças"            (cabe sob o ícone no Android)
description:      "Controle de contas, faturas e acerto do mês para o casal."
display:          "standalone"
orientation:      "portrait"
start_url:        "/inicio"
background_color: "#F7F8F7"             (= --background claro; é a splash)
theme_color:      "#14594A"             (= --primary Cedro claro)
icons: icon-192.png e icon-512.png com purpose "any";
       icon-maskable-192.png e icon-maskable-512.png com purpose "maskable"
       (arquivos SEPARADOS: a v1 declarou "any maskable" no mesmo arquivo e o ícone saía decapitado)
```

Além disso, `<meta name="theme-color">` no `<head>` com `media="(prefers-color-scheme: dark)"` e valor `#101417`, e outro para o claro com `#F7F8F7`. **Limitação aceita:** `theme_color` do manifest é estático e não acompanha a paleta nem o modo (manifest por usuário é complexidade desproporcional no beta).

### 4.3 Comportamento por tema (dark mode dos assets)

| Asset | Claro | Escuro | Qual usar |
|---|---|---|---|
| `favicon.svg` | traço `#14594A` | traço `#5FD3B2` via `@media (prefers-color-scheme: dark)` dentro do próprio SVG, fundo **transparente** | o SVG troca sozinho |
| `favicon.ico` | fundo Cedro `#14594A` com símbolo branco, cantos arredondados | idêntico | fixo de propósito: um ICO estático em Cedro `#14594A` sobre uma aba escura `#202124` mede **1.96:1** (e o verde claro `#5FD3B2` sobre aba branca mede 1.83:1), então ganhou fundo próprio e funciona nos dois temas (branco sobre Cedro 8.21:1) |
| ícones de PWA, apple-touch | fundo Cedro, símbolo `#FFFFFF` (8.21:1) | idêntico | fixos; o fundo colorido funciona sobre qualquer tela inicial |
| `og.png` | fundo `#F7F8F7`, bloco Cedro | n/a | OG é fixo e claro (preview de rede social não tem tema) |

Nenhum PNG tem fundo branco chapado sobre fundo escuro.

### 4.4 Ícones de UI: decorativo ou informativo

Todos vêm do `lucide-react` (a Fachada consome pelo pacote; nenhum arquivo em `public/`). Todo SVG emitido por mim tem `viewBox`, `width` e `height`, e nenhum `fill`/`stroke` hardcoded em ícone de UI (o favicon usa cor fixa por tema de propósito). Rótulos informativos abaixo são **do Vitrine** (rótulo acessível de ícone é metadata); toda outra copy é do Fachada.

| Ícone | Classificação | O que a Fachada faz |
|---|---|---|
| seta entrando / saindo junto ao valor | **DECORATIVO** | `aria-hidden="true"`: o sinal `+`/`−` e o valor já dizem |
| ícone no badge de tipo | **DECORATIVO** | `aria-hidden="true"`: a palavra do tipo está ao lado |
| relógio de pendente | **DECORATIVO** | `aria-hidden="true"`: a palavra "Pendente" está ao lado |
| cofre (investimento) | **DECORATIVO** | `aria-hidden="true"` |
| ticket (benefício) | **DECORATIVO** | `aria-hidden="true"` |
| triângulo de alerta em saldo negativo | **INFORMATIVO** | rótulo acessível: `Saldo negativo` |
| olho de ocultar valores | **INFORMATIVO** | rótulo: `Mostrar valores` / `Ocultar valores` (alterna com o estado) |
| botão de trocar paleta | **INFORMATIVO** | rótulo: `Escolher cor do app` |
| botão de trocar modo | **INFORMATIVO** | rótulo: `Mudar para tema escuro` / `Mudar para tema claro` |
| símbolo da marca no cabeçalho | **INFORMATIVO** | rótulo: `Finanças a Dois` |

### 4.5 Licenças

| Arquivo entregue | URL exata da origem | Autor / crédito | Licença | Exige atribuição visível? |
|---|---|---|---|---|
| Instrument Sans (self-hosted no build por `next/font/google`) | `https://fonts.google.com/specimen/Instrument+Sans` · repo `https://github.com/Instrument/instrument-sans` | Rodrigo Fuenzalida e Instrument | SIL OFL 1.1 | não |
| IBM Plex Mono (self-hosted no build por `next/font/google`) | `https://fonts.google.com/specimen/IBM+Plex+Mono` · repo `https://github.com/IBM/plex` | Mike Abbink, Paul van der Laan, Pieter van Rosmalen / IBM | SIL OFL 1.1 | não |
| `public/icons/favicon.svg` | n/a: desenhado pelo Vitrine; gerador em `docs/design/scripts/gen-assets.js` | Vitrine / HORI Analytics | gerado | não |
| `src/app/favicon.ico` | n/a: gerado pelo mesmo script | Vitrine / HORI Analytics | gerado | não |
| `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | n/a: gerados pelo mesmo script | Vitrine / HORI Analytics | gerado | não |
| `public/og.png` | n/a: composto no navegador a partir dos tokens e capturado | Vitrine / HORI Analytics | gerado | não |
| ícones de UI (seta, relógio, cofre, ticket, olho, alerta) | `https://lucide.dev` (consumo via pacote `lucide-react`) | Contribuidores do Lucide | ISC | não |

SIL OFL 1.1 permite web embedding e redistribuição, inclusive self-hosted. A Reserved Font Name só importa em versão modificada; as fontes não foram modificadas. O `next/font/google` baixa os arquivos no build e serve do próprio domínio: nenhuma requisição a `fonts.gstatic.com` em runtime. **Nenhum asset de terceiro** entra na entrega; nenhum SVG de terceiro foi manuseado.

Varredura de SVG, rodada no único SVG emitido:
`grep -niE '<script|on[a-z]+=|javascript:' app/public/icons/favicon.svg` retornou vazio (exit 1 = limpo).

---

## 5. Paleta de séries de gráfico (para o Dash)

Arquivo: `app/src/styles/chart-palette.ts`. **Quem importa (estado em 2026-10-15):** `app/src/components/analises/grafico-rosca-categorias.tsx` (`SERIES_CLARO`/`SERIES_ESCURO`, `SERIE_OUTROS`, `MARCADORES`) e `app/src/components/analises/previsao-fixos.tsx` (`corDaSerie` 0..2). `grafico-linha.tsx` e `grafico-orcamento.tsx` usam só `var(--chart-1)`. O módulo TS se justifica porque a cor entra como prop/estilo em TypeScript.

> **Re-trabalho P-011 (2026-10-15).** A paleta original foi validada com um script próprio (ΔE CIE76 em Lab, sem banda de L nem piso de croma) e reprovou no validador do `dataviz` (OKLab ΔE×100, CVD Machado 2009). **O gate agora é `dataviz/scripts/validate_palette.js`**; `series-de.js` continua só para a consistência TS↔CSS e o contraste por superfície (o ΔE CIE76 que ele imprime não é o critério).

API: `SERIES_CLARO`, `SERIES_ESCURO`, `SERIE_OUTROS`, `MARCADORES`, `MAX_SERIES` (8), `paletaSeries(modo)`, `corDaSerie(indice, modo)`, `marcadorDaSerie(indice)`, tipos `ModoTema` e `Marcador`.

**`corDaSerie` não cicla.** Índice `>= 8` devolve a cor de "Outros". Ciclar daria a duas categorias diferentes a mesma cor, o que é mentira visual num gráfico de gastos. O Dash agrupa o excedente em "Outros". Se precisar de mais de 8 categorias distinguíveis, é pedido de mudança ao Vitrine, não um `% 8`.

| # | Nome | Claro | /background · /card · /muted | Escuro | /background · /card · /muted |
|---|---|---|---|---|---|
| 1 | azul | `#2F6DB5` | 4.96 · 5.28 · 4.61 | `#5794DF` | 5.91 · 5.48 · 5.00 |
| 2 | telha | `#C2552F` | 4.26 · 4.53 · 3.95 | `#D15B41` | 4.66 · 4.32 · 3.94 |
| 3 | teal | `#0D8A71` | 4.03 · 4.29 · 3.74 | `#1B947E` | 4.92 · 4.56 · 4.16 |
| 4 | violeta | `#7A5BC4` | 4.79 · 5.10 · 4.44 | `#8760CB` | 4.02 · 3.73 · 3.40 |
| 5 | oliva | `#6E7A1F` | 4.42 · 4.70 · 4.10 | `#7CA245` | 6.27 · 5.81 · 5.30 |
| 6 | magenta | `#A83A6E` | 5.64 · 6.01 · 5.24 | `#BA4E84` | 3.98 · 3.69 · 3.36 |
| 7 | ocre | `#AB7A10` | 3.57 · 3.80 · 3.32 | `#B18E15` | 5.95 · 5.52 · 5.03 |
| 8 | castanho | `#7D4005` | 7.56 · 8.05 · 7.02 | `#9B572E` | 3.35 · 3.10 · **2.83** |
| outros | cinza | `#7D878C` | 3.45 · 3.67 · — | `#6E7A81` | 4.20 · 3.89 · — |

Superfícies: claro `--background #F7F8F7`, `--card #FFFFFF`, `--muted #EDF0EF`; escuro `#101417`, `#171C20`, `#1E242A` (= `--popover`). Valores no claro mantidos: slots 1, 2, 4, 5 e 6. Trocados: 3 (C 0.091 abaixo do piso), 7 e 8 (castanho tinha L 0.412 e C 0.038; o ocre clareou para manter ocre↔castanho ≥ 15). No escuro, todos os slots foram trocados, porque os 8 estavam acima da banda L 0.48–0.67 (inclusive o azul `#6FA8E8`, L 0.718).

Série de gráfico é elemento gráfico (WCAG 1.4.11, limiar 3:1), não texto. Pior caso sobre o card: 3.80:1 (ocre claro) e 3.10:1 (castanho escuro). **Única exceção medida:** castanho escuro sobre `--muted`/`--popover` = 2.83:1. Fora do card, a série 8 só aparece acompanhada de rótulo de texto (amostra de cor na tooltip e na legenda, sempre com o nome ao lado). Rótulo de texto do gráfico usa `--foreground` ou `--muted-foreground` (4.5:1+), nunca a cor da série.

Saída do validador (pares adjacentes, `--surface` = card):

| Checagem | Claro | Escuro |
|---|---|---|
| Banda de L | PASS (0.440–0.613 em 0.43–0.77) | PASS (0.528–0.664 em 0.48–0.67) |
| Piso de croma 0.10 | PASS (mín 0.105) | PASS (mín 0.105) |
| CVD adjacente (alvo 8) | PASS **10.4** (magenta↔oliva, deutan) | PASS **10.4** (teal↔telha, deutan) |
| Visão normal adjacente (piso 15) | PASS **18.0** (castanho↔ocre) | PASS **15.8** (castanho↔ocre) |
| Contraste vs superfície | PASS (≥ 3:1 em card e bg) | PASS em card e bg; WARN 2.83 em `#1E242A` |
| Todos os pares, séries 1–3 | PASS CVD 10.4 / normal 15.8 | PASS CVD 10.4 / normal 16.1 |

**Limite de séries por forma.** Barra empilhada, linha, rosca e barras lado a lado (só vizinhos se tocam) aceitam as 8. Dispersão, bolha, mapa e small multiples (qualquer par pode encostar) aceitam **no máximo 3** (séries 1–3). O conjunto das 8 não passa no teste de todos os pares (pior par: oliva↔ocre, slots 5 e 7, normal 9.8 claro / 8.4 escuro). Reordenar não resolve, porque o conjunto de todos os pares não depende da ordem; para mais de 3 séries nessas formas, agrupe em "Outros" ou divida em facetas.

**Rosca: vizinhos de "Outros".** "Outros" vem depois da série 7 e antes da 1. Medido: S7↔Outros 13.6 claro / 17.0 escuro; S1↔Outros 14.6 claro / 14.2 escuro (normal). Fica abaixo de 15, mas "Outros" é cinza neutro, de outra natureza, e não um nono matiz. O validador não o inclui. A rosca precisa do gap de 2px e de nome+valor escritos por fatia, que já são obrigatórios.

Consistência: `--chart-1..5` e `--serie-outros` no `globals.css` (necessários ao shadcn `chart`) são cópias das cinco primeiras séries; o script `series-de.js` confere que CSS e TS não divergem (resultado: sem divergência nos dois modos).

**Reforço não cromático obrigatório** (cor sozinha reprova): rótulo direto na série sempre que couber; marcador de forma distinto por série em gráfico de linha (`MARCADORES`); rosca e Pareto com nome e valor escritos; legenda só-cor reprova.

Paleta sequencial (mapa de calor por dia da semana) **não foi emitida**: é Onda 2 e depende de qual métrica entra na rampa. O Dash pede quando chegar lá (pendência P-5).

---

## 6. Paletas: persistência e anti-flash (especificação; a Fachada implementa)

`app/src/styles/tema.ts` exporta `CHAVE_MODO` (`"fad.modo"`), `CHAVE_PALETA` (`"fad.paleta"`), `MODO_PADRAO` (`"sistema"`), `PALETA_PADRAO` (`"cedro"`), `MODOS`, `PALETAS` (id, nome e `swatch` claro/escuro com o `--primary`), `ehPaletaId`, `ehModoId`, e os tipos `ModoId` e `PaletaId`. **Quem importa: a Fachada**, no seletor de `/ajustes`.

A escolha vive em `localStorage` e precisa valer **antes do primeiro paint**. Script inline bloqueante no `<head>` que lê as duas chaves, aplica `classList.add('dark')` quando o modo for escuro (ou `sistema` com `prefers-color-scheme: dark`) e escreve `dataset.paleta`. Como o script é uma string, copie os valores literais de `tema.ts`. `suppressHydrationWarning` no `<html>` é obrigatório. A paleta é CSS puro; o JS só troca o atributo (a v1 escrevia `style.setProperty` em `useEffect` e dava flash).

---

## 7. Estados, responsividade e edge cases

### 7.1 Breakpoints (mobile-first; o PWA é instalado no celular)

| Breakpoint | Comportamento |
|---|---|
| base (< 640px) | 1 coluna; navegação inferior fixa; cartão de conta em largura total; valor-herói 40px; lista densa |
| `sm` (>= 640px) | cartões de conta em 2 colunas |
| `md` (>= 768px) | navegação vai para o topo; conteúdo com `max-width: 48rem` centralizado |
| `lg` (>= 1024px) | KPIs em 4 colunas; `max-width: 64rem` |

Os três pontos de prova do Maestro (375, 768, 1440) caem em base, `md` e `lg`.

### 7.2 Estados de interação (todo elemento interativo precisa de todos)

| Estado | Tratamento |
|---|---|
| default | token base |
| hover | `--accent` de fundo (item de lista) ou primary 8% mais escuro (botão); `--motion-rapido` |
| focus-visible | `outline: 2px solid var(--ring); outline-offset: 2px`. **Nunca** remover sem substituto |
| active | escala `0.98` + `--motion-rapido` |
| disabled | `opacity: 0.5` + `cursor: not-allowed` (ver correção na seção 9: não atende 4.5:1, é isento por ser componente inativo) |
| loading | `Skeleton` em `--muted`, com `aria-busy="true"` |
| erro | borda `--destructive` **e** mensagem abaixo do campo; nunca só a borda vermelha (WCAG 1.4.1) |

### 7.3 Edge cases de texto (pt-BR é mais longo que inglês)

| Caso | Tratamento visual |
|---|---|
| nome de conta longo | 1 linha, `text-overflow: ellipsis`, `title` com o nome completo; antes de elipsar, aplicar `font-stretch: 85%` (`.texto-micro`) |
| descrição de lançamento longa | no máximo 2 linhas, depois elipse |
| valor muito grande (`numeric(14,2)`, até 999.999.999.999,99) | o valor-herói cai de 40px para 28px acima de 12 caracteres; **nunca** quebra linha nem elipsa (valor truncado é dado errado) |
| valores ocultos (olho) | máscara mantendo a mesma largura de caixa, para a lista não pular |
| estado vazio | sem ilustração (nenhum asset do Vitrine aqui); uma frase de ação em `--muted-foreground` no tamanho `--texto-corpo`, centralizada, com o botão primário abaixo. **A redação é do Fachada** (`design:ux-copy`); o Vitrine especificou só o tratamento visual |
| acerto de contas ("quem deve a quem") | frase com os dois nomes e a direção em palavras, no padrão `<nome> deve <valor> a <nome>`; quebra em 2 linhas, nunca elipsa; **a redação final é do Fachada**; a exigência de ser frase e não cor é do Vitrine |
| nome de membro longo | quebra de linha, nunca elipse no acerto |

### 7.4 Regras de uso que a Fachada não pode violar

| # | Regra |
|---|---|
| C-1, C-2, C-3 | ver seção 0 |
| C-4 | borda de componente interativo usa `--border-forte` / `border-input`, nunca `--border` |
| T-1 | valor monetário sempre em mono, `tabular-nums`, alinhado à direita (`.valor`) |
| T-2 | número dentro de texto de UI usa `.num-tabular` |
| T-3 | **proibido** eyebrow em CAIXA ALTA espaçada acima de heading. Rótulo de KPI é sentence case, tamanho de apoio, `--muted-foreground` |
| T-4 | **proibido** `→` colado em texto de botão |
| T-5 | nenhum hex hardcoded em componente; só tokens (o `design:design-system` modo `audit` vai pegar) |
| A-1 | alvo de toque `>= 44×44px` (WCAG 2.5.5); se o visual for menor, ampliar a área clicável com padding. **Atenção (não verificado, componentes ainda não instalados):** os tamanhos padrão do shadcn costumam ficar entre 32px e 36px de altura; confira o `Button`, `Input`, `Select` e `Checkbox` após `shadcn add` e faça override para 44px no mobile |
| A-2 | foco visível sempre. **Atenção ao halo do shadcn:** ver seção 9, achado 2 |
| A-3 | `prefers-reduced-motion` respeitado nos três tokens de motion |

---

## 8. Prova de renderização

Dev server em `http://localhost:3000` (`cd app && npm run dev`), subido pelo Maestro. O ambiente do Playwright só aceita gravar dentro de `C:\Users\Heitor PC\OneDrive\Documentos\Segundo cérebro live\`, então os screenshots nasceram lá em `.playwright-mcp\` e foram **copiados** para o projeto em `docs/design/evidencias/`. Caminho absoluto de ambos abaixo.

Como os assets ainda não têm a página que os consome (a Fachada ainda não escreveu telas nem `metadata`), a verificação foi feita no navegador real, sobre a rota `/` do servidor, injetando uma página de amostra com os arquivos servidos de `/icons/*`, `/favicon.ico` e as fontes do `next/font`. Isso prova arquivo, fonte, token e tema; **não** prova que o `<head>` da Fachada vai apontar para eles. Essa ligação é pendência dela (P-1).

| Verificação | Resultado | Evidência (caminho absoluto) |
|---|---|---|
| `getComputedStyle`: fonte aplicada | `body` e `html` computam `"Instrument Sans", "Instrument Sans Fallback", ui-sans-serif, system-ui, sans-serif`; faces `Instrument Sans` 400-700 com status `loaded`; `IBM Plex Mono` 600 `loaded` quando usada | saída inline; amostra em `C:\Users\Heitor PC\OneDrive\Documentos\SEGUNDO CÉREBRO\HORI ANALYTCIS PROJETOS\Finanças a Dois\docs\design\evidencias\tokens-claro-cedro.png` |
| `getComputedStyle`: token chega ao elemento | background computado `rgb(247, 248, 247)`, foreground `rgb(20, 24, 28)`, corpo `15px`; `--primary` `#14594a`, `--receita` `#0f7650` | idem |
| contraste renderizado, todas as combinações | **256 pares** (modo × paleta × par) medidos sobre as cores computadas pelo navegador: **0 falhas**, menor razão **3.45:1** (`--border-forte` sobre background claro, limiar 3:1) | saída do `browser_evaluate`; script equivalente de arquivo: `docs/design/scripts/contraste.js` (180 pares, 0 falhas) |
| dark mode, paleta Terra | tokens e semântica legíveis; `.dark[data-paleta="terra"]` vence como esperado | `C:\Users\Heitor PC\OneDrive\Documentos\SEGUNDO CÉREBRO\HORI ANALYTCIS PROJETOS\Finanças a Dois\docs\design\evidencias\tokens-escuro-terra.png` |
| foco visível e borda de campo | `button` e `input` focados por teclado computam `outline: rgb(20, 89, 74) solid 2px` e `outline-offset: 2px`. **Achado:** um `input` cru computa `border-top-color: rgb(221, 226, 225)`, que é `--border` (1.23:1): confirma por que a regra C-4 existe, porque o `* { border-border }` do shadcn vence se o componente não pedir `border-input` | saída inline do `browser_evaluate` (sem screenshot) |
| favicon legível a 16px | **VERIFICADO.** Rasterizado a 16×16 (zoom pixelado) o símbolo ainda lê como dois arcos com ponto central; a versão com abertura de 4.5 unidades entre as pontas foi a segunda iteração (a primeira, com 2.5, fechava as pontas e lia como anel) | `C:\Users\Heitor PC\OneDrive\Documentos\SEGUNDO CÉREBRO\HORI ANALYTCIS PROJETOS\Finanças a Dois\docs\design\evidencias\assets-claro.png` e `...\assets-escuro.png` (favicon.svg troca de cor no escuro; favicon.ico tem fundo próprio) |
| OG reduzido a ~300px | **VERIFICADO.** Título 96px (24px a 300px) e subtítulo 44px (11px a 300px) legíveis | `C:\Users\Heitor PC\OneDrive\Documentos\SEGUNDO CÉREBRO\HORI ANALYTCIS PROJETOS\Finanças a Dois\docs\design\evidencias\og-300px.png` e o original `...\og-1200x630.png` |
| ícone maskable na safe zone | **VERIFICADO.** Com o círculo de raio 40% sobreposto, o símbolo inteiro cai dentro; com máscara circular de 100% (Android) nada é cortado | `...\docs\design\evidencias\assets-claro.png` e `assets-escuro.png` |
| peso de cada asset | tabela da seção 4.1, por `stat -c %s` | n/a |
| `tsc` e `vitest` | `npx tsc --noEmit` exit 0; `npx vitest run` 3 arquivos, **83/83** testes | saída colada no relatório |

Cópias originais (diretório do Playwright), caso a cópia do projeto seja removida: `C:\Users\Heitor PC\OneDrive\Documentos\Segundo cérebro live\.playwright-mcp\` com os mesmos nomes de arquivo.

### 8.1 Revisão 2026-10-15: semântica clara

Dev server: `cd app && npx next dev -p 3107` (subido por mim só para esta verificação, a partir de `C:\dev\financas-a-dois\app`). A porta 3000 desta máquina estava ocupada por um `next start` de **outra cópia** do projeto (pasta antiga no OneDrive) e servia os hex antigos; não foi usada nem derrubada.

`/inicio` exige sessão e eu não tenho credencial; a verificação foi feita sobre `/login` (mesmo `globals.css` compilado), injetando uma amostra com as **classes reais** dos componentes (`text-receita`, `bg-despesa/15 text-despesa border-despesa/30`, `bg-[var(--despesa)]/70 text-white`, `bg-receita text-white`...) sobre card, background, `muted/50` e `accent`, mais uma coluna "antes:" com os hex antigos para comparar a identidade. Artefato da amostra: o chip "Investimento" aparece sem tint porque `bg-investimento/15` não existe no código e o Tailwind não gera a classe; o par foi medido por script.

| Verificação | Resultado | Evidência (caminho absoluto) |
|---|---|---|
| `getComputedStyle` dos 6 tokens no `<html>`, 4 paletas claras | `--receita=#036543 --despesa=#a70225 --investimento=#0359a1 --pendente=#854a00 --negativo=#a70225 --beneficio=#066077` em Cedro, Ardósia, Terra e Ameixa; `--accent` muda por paleta (`#e4ede9`, `#e4ebf3`, `#f5e6e0`, `#f0e4ee`) | saída do `browser_evaluate` |
| contraste renderizado (cor computada pelo navegador, fundo composto pela pilha de ancestrais com alfa) | 54 elementos por paleta × 4 paletas = 216 medidas, **0 abaixo de 4.5:1**; pior: `text-white` sobre `bg-[var(--despesa)]/70` = 4.78:1 | saída do `browser_evaluate` |
| escuro inalterado | `.dark` computa `--receita=#10b981 --despesa=#fb7185 --investimento=#38bdf8 --pendente=#fbbf24 --negativo=#fb7185 --beneficio=#22d3ee` | saída do `browser_evaluate` |
| identidade de cor | verde segue verde, vermelho segue vermelho (carmim), azul segue azul, benefício segue petróleo; pendente virou âmbar-ocre escuro (âmbar a 4.5:1 sobre fundo claro é necessariamente escuro). Nenhuma lê como preto | `C:\dev\financas-a-dois\docs\design\evidencias\semantica-claro-cedro.png`, `...\semantica-claro-ardosia.png`, `...\semantica-claro-terra.png`, `...\semantica-claro-ameixa.png` |

**NÃO VERIFICADO** nesta revisão: `/inicio` autenticada real (sem credencial); `browser_console_messages` (não rodei).

**NÃO VERIFICADO** (entrega original), com o motivo real:
- `browser_console_messages` sem erro: a ferramenta não estava disponível na minha sessão; a Fachada e o Dash têm essa exigência na entrega deles. Não afirmo console limpo.
- Os assets **dentro do `<head>` da Fachada** (favicon na aba, `og:image` resolvido, manifest instalável): dependem de `metadata` e da rota de manifest que ainda não existem.
- Leitor de tela real (VoiceOver/NVDA) e teclado: não há telas para percorrer.

---

## 9. Autoverificação de acessibilidade (design:accessibility-review) e correções

A skill foi invocada com a rota (tokens e assets) e os números já medidos. Aplicando o checklist dela a estes artefatos:

| Critério WCAG | Resultado sobre os artefatos do Vitrine |
|---|---|
| 1.4.3 contraste de texto | passa: menor razão de texto **4.56:1** (`--despesa` claro sobre `--accent` Ameixa); o chassi vai de 5.13:1 a 17.84:1. **Revisão 2026-10-15:** os hex de `bee799a` reprovavam 34 pares; com a semântica nova, menor razão de texto sólido **4.62:1** (`--transferencia` claro sobre accent Ameixa, intocada) e, entre as 6 revistas, **5.72:1** (`--pendente` sobre accent Ameixa); sobre o próprio tint, ver 2.3 e C-5 |
| 1.4.11 contraste não textual | passa: `--border-forte` **3.45:1** (pior), foco **6.19:1** (pior), séries sobre o card **3.80:1** (pior claro, ocre) / **3.10:1** (pior escuro, castanho); exceção: castanho escuro sobre `--muted` 2.83:1, só com rótulo (§5); `--border` decorativa isenta e declarada |
| 1.4.1 uso de cor | **tratado por regra** (C-2, C-3, sinal, ícone + palavra); depende de a Fachada cumprir |
| 1.1.1 conteúdo não textual | OG precisa de `alt` em `metadata.openGraph.images`; marca no cabeçalho tem rótulo (seção 4.4) |
| 2.5.5 alvo de toque | **risco aberto, não verificável agora**: tamanhos padrão do shadcn costumam ser menores que 44px; regra A-1 |
| 2.4.7 foco visível | passa no token; **risco** no halo do shadcn (achado 2 abaixo) |
| 4.1.2 nome, papel, valor | rótulos dos ícones informativos entregues (seção 4.4) |

**Achados da autoverificação (correções e riscos que a Fachada herda):**

1. **Correção ao plano (item de `Desvio`).** O plano afirmava que `disabled: opacity 0.5` "não remove contraste de texto abaixo de 4.5:1". **Falso.** Medido: texto principal a 50% de opacidade dá **3.34:1** no claro e **4.64:1** no escuro; botão primário desabilitado Cedro claro dá **1.66:1**. WCAG 1.4.3 isenta componente de interface inativo, então não é violação, mas o plano estava errado ao dizer que passava. Tratamento: `opacity: 0.5` fica, é isento, e o estado desabilitado **nunca** pode ser o único portador de informação (a razão de estar desabilitado deve estar escrita em outro lugar).
2. **Risco em 1.4.11: o halo de foco do shadcn (NÃO VERIFICADO nos componentes, porque `src/components/ui` ainda não existe).** Nas versões do shadcn que conheço, o foco é desenhado como `ring-ring/50` (50% de opacidade). Calculei o que esse halo daria sobre o background: **2.27:1 a 2.63:1** no claro (quatro paletas) e **2.81:1 a 3.40:1** no escuro; ficam abaixo de 3:1 seis das oito combinações (as quatro claras, Terra escuro e Ameixa escuro). Se o halo for o **único** indicador de foco, reprova. Normalmente o componente também troca a borda para `border-ring` (opacidade total, `>=6.19:1`), o que salvaria o caso, mas **não conferi isso** e o Fachada precisa conferir em cada componente adicionado. Verificação concreta após cada `shadcn add`: `grep -rn "ring-ring/50" app/src/components/ui` e, para cada hit, confirmar que o mesmo elemento tem `focus-visible:border-ring` **ou** trocar `ring-ring/50` por `ring-ring`. Meu `:focus-visible` global é a rede de segurança nos elementos sem `outline-none`; medi no navegador que ele computa `rgb(20, 89, 74) solid 2px` com `outline-offset: 2px` em `button` e `input` (Cedro claro = `#14594A`).
3. **Alvo de toque.** A-1 vale também para a navegação inferior, os botões só-ícone (olho, paleta, modo) e os chips de filtro.
4. **`<html lang="en">`.** O `layout.tsx` ainda declara `lang="en"`. O app é pt-BR; isso afeta leitor de tela (WCAG 3.1.1, nível A). Fora do meu escopo autorizado em `layout.tsx` (só fonte): **a Fachada troca para `pt-BR`**, junto de `title` e `description` (hoje "Create Next App").

Veredicto WCAG do projeto continua sendo do Sentinela; isto é autoverificação antes de entregar.

---

## 10. Desvios do plano

Cada linha no formato exigido.

- `Desvio: --receita claro #0F7A52 → #0F7650, --despesa claro #C0362C → #BE352C (e --destructive claro, que reusa o hex), --transferencia claro #6B5BB5 → #6A5AB3 — o plano mediu semântica só sobre background e card; ao medir sobre --accent (fundo de linha em hover), receita caiu a 4.34:1 (Ameixa), despesa a 4.48:1 e transferência a 4.50:1 arredondado (abaixo de 4.5). Escurecidos ~1-3% até o pior par chegar a 4.56:1. Remedido: 0 falhas em 180 pares.`
- `Desvio: --font-sans/--font-mono no @theme inline usam var(--fonte-ui)/var(--fonte-mono), não os nomes literais do plano — medido no navegador que a variável do next/font resolve corretamente (família computada "Instrument Sans", face loaded). A premissa do plano e da skill vercel:shadcn de que var() não resolve em @theme inline não se confirmou nesta versão (Next 16.4 / Tailwind 4). O bug real era só a autorreferência circular, que foi removida.`
- `Desvio: favicon.svg troca de cor por @media (prefers-color-scheme: dark) dentro do SVG, não por currentColor — currentColor num favicon resolve para a cor padrão do navegador, não para o tema da aba.`
- `Desvio: favicon.ico ganhou fundo Cedro com símbolo branco, em vez de silhueta sem fundo — o ICO é estático e o verde Cedro `#14594A` sobre aba escura `#202124` mede 1.96:1; com fundo próprio (branco sobre Cedro, 8.21:1) funciona nos dois temas.`
- `Desvio: símbolo reaberto (centros dos arcos em x=11.5 e 20.5, ponto central r=2.8) em relação ao desenho inicial (12.5 e 19.5, r=2.6) — a 16px as pontas fechavam e o favicon lia como anel; a abertura maior preservou "dois arcos".`
- `Desvio: --radius-md e --radius-lg do shadcn mapeados ambos para 8px, e --radius-3xl/4xl (20px/24px) acrescentados — o plano lista cinco degraus; o shadcn usa seis nomes de degrau, e foi preciso decidir o que cada um vale. Os cinco valores do plano estão todos presentes como --raio-*.`
- `Desvio: ΔE de daltonismo remedido com as matrizes de Machado (2009), severidade 1.0, aplicadas em RGB linear; o plano usou Viénot. Receita vs despesa em protanopia: 12.6 claro e 11.6 escuro (plano: 13.5). Deuteranopia ficou bem mais baixa que no plano (32.3 e 17.8, contra 83.0 e 78.0). Os dois métodos concordam na conclusão que importa (a cor sozinha não basta; sinal obrigatório) e o segundo a reforça. Divergência de método registrada, não resolvida.`
- `Desvio: afirmação do plano "disabled não remove contraste abaixo de 4.5:1" corrigida na seção 9, achado 1 — medido 3.34:1 (claro).`
- `Desvio: escrevi app/src/app/favicon.ico (substituindo o do create-next-app), caminho que não estava na lista de arquivos permitidos da delegação — o plano aprovado (seção 9.1 e 10 do plano-tokens.md) já o listava como meu, e é a convenção do App Router; sinalizo para o Maestro confirmar. Nenhum outro arquivo fora da fronteira foi tocado (layout.tsx: só imports de fonte, variáveis e className; lang="en", title e description ficaram intactos).`

Revisão 2026-10-15 (auditoria de contraste, fora do plano original):

- `Desvio: --receita/--despesa/--investimento/--pendente/--negativo/--beneficio claros trocados (antes → depois na seção 2.3) — os hex de bee799a reprovavam 34 de 180 pares (pior 2.58:1). Alvo: >= 4.6:1 como texto sobre background, card, muted, accent das 4 paletas E sobre o próprio tint @10/@15 dessas superfícies. Remedido: FALHAS: 0 | total: 180; tint, pior 4.61:1.`
- `Desvio: --investimento claro girou a matiz OKLCH de 242 para 252 — escurecido na matiz original, ficava a ΔE 4.3 de --beneficio (já eram próximos: 5.6 antes). Em 252 fica a 7.7.`
- `Desvio: comentário de --destructive no globals.css dizia "= --despesa" e o handoff idem; não eram o mesmo hex desde bee799a e continuam não sendo. Corrigido o texto, não o valor (--destructive passa: 5.28:1).`
- `Desvio: gravei evidências em docs/design/evidencias/ (contraste.out regravado, semantica-tint.out e os 4 PNGs semantica-claro-*.png) — fora dos dois arquivos autorizados pela delegação, mas é onde o handoff aponta a evidência.`

Além dos tokens listados na seção 2: `--sidebar-*` são aliases (`var()`) de `--card`, `--foreground`, `--primary`, `--accent` e `--border`, então herdam os contrastes já medidos para esses pares; `--chart-1..5` e `--serie-outros` estão medidos na seção 5.

---

## 11. Pendências e o que cada agente precisa fazer

| # | Pendência | Dono | Detalhe |
|---|---|---|---|
| P-1 | Ligar assets e metadata | Fachada | `metadata.icons` (favicon.svg, favicon.ico, apple-touch), `openGraph.images` com `alt`, `appleWebApp`, `theme-color` com variante dark, `lang="pt-BR"`, `title`/`description` reais |
| P-2 | Rota do manifest | Fachada/Estrutura | `src/app/manifest.webmanifest/route.ts` com os valores da seção 4.2 e os dois pares `any` / `maskable` separados |
| P-3 | Script anti-flash + `suppressHydrationWarning` + seletor de paleta e modo | Fachada | seção 6 |
| P-4 | Conferir halo de foco e alvo de toque dos componentes shadcn | Fachada | seção 9, achados 2 e 3 |
| P-5 | Paleta sequencial (mapa de calor, previsão) | Dash pede ao Vitrine na Onda 2 | depende da métrica da rampa |
| P-6 | Console limpo e ligação dos assets no `<head>` real | Fachada (prova dela) / Sentinela | seção 8, NÃO VERIFICADO |
| P-7 | `--primary` de botão desabilitado e demais estados isentos | Fachada | nunca como único portador de informação |
| P-8 | Hook `security-guidance` não confirmado ativo nesta sessão | Maestro | a varredura de SVG foi rodada à mão no fim do ciclo; único SVG é gerado por mim |
| P-012 | `--transferencia` claro `#7C3AED` reprova sobre o próprio tint a @15 ou sobre muted/accent (mín. 3.78:1) | Maestro decide; Vitrine executa | não estava no escopo desta revisão; hoje só é usado a @10 sobre card/popover, onde passa. Correção candidata medida: `#6D21DA` (mesma matiz, pior caso 4.66:1 incluindo tint sobre accent) |
| P-013 | No escuro, `text-X` sobre `bg-X/15` em cima de `--accent` reprova para receita (4.36), despesa/negativo (4.28) e transferência (4.13) | Fachada (cumprir C-5) | combinação não existe no código atual; regra C-5 a proíbe. Escuro foi mantido por instrução |
| P-014 | `--negativo` tem o mesmo hex de `--despesa` desde `bee799a` (ΔE 0) | Maestro decide | C-3 (parênteses + ícone) é a única distinção. Se quiser a cor de volta como reforço, é token novo a medir |
| P-015 | `contraste.js` não mede texto sobre o próprio tint (`bg-X/10`, `/15`) nem o mapa de calor | Vitrine (precisa de autorização para tocar `docs/design/scripts/`) | foi assim que os 34 + os pares de tint passaram despercebidos; hoje medidos à parte em `semantica-tint.out` |

**Sem fonte externa de pesquisa:** não houve Radar. A direção é derivada do briefing e da engenharia reversa da v1 (`docs/engenharia-reversa-v1.md`).

---

## 12. Como reproduzir as medições

```
cd app
node ../docs/design/scripts/contraste.js src/app/globals.css          # 180 pares, deve terminar em FALHAS: 0
node ../docs/design/scripts/series-de.js src/styles/chart-palette.ts src/app/globals.css   # séries, ΔE, consistência TS x CSS
node ../docs/design/scripts/gen-assets.js                              # regenera ícones e favicon.ico (cwd = app)
```

**Lacuna conhecida (P-015):** `docs/design/evidencias/semantica-tint.out` (texto sobre o próprio tint, mapa de calor, ΔE entre semânticas) foi gerado por um script de sessão que **não está versionado** no repositório, porque a delegação de 2026-10-15 não autorizava escrever em `docs/design/scripts/`. Até que P-015 seja feita, essa medição não é reproduzível só com o repositório; o método está descrito na seção 2.3 (composição alfa sRGB do tint `X` a 10% e 15% sobre cada superfície, razão WCAG do texto `X` contra o resultado).

Se mudar qualquer hex, rode os dois primeiros antes de entregar. O terceiro depende de `sharp` (já em `app/node_modules`) e sobrescreve os PNGs e o `favicon.ico`; o `og.png` é capturado no navegador, não regenerado pelo script.

---

## 13. Revisão Anti-Genérico (resumo; íntegra em `plano-tokens.md`, seção 1)

Confronto do plano com a lista de sinais de interface gerada por IA. O que caiu em default e o que mudou, mais o que a execução alterou.

| Eixo | Default em que caí | Revisão aplicada | Mudança na execução |
|---|---|---|---|
| Fundo e accent | creme `#F4F1EA` + terracota `#D97757` | fundo cinza-papel frio `#F7F8F7` com card branco `#FFFFFF` mais claro que o papel; terracota só como paleta opcional (Terra); default é Cedro | nenhuma |
| Raio | um só valor (a v1 usava `1rem` em tudo) | cinco degraus com motivo: 4 / 8 / 12 / 16 / 9999 | acrescentei `--radius-3xl` e `--radius-4xl` por exigência do shadcn |
| Sombra | mesma sombra cinza em tudo | duas sombras com papel distinto; escuro troca sombra por borda fina | nenhuma |
| Tipografia | Geist (default do `create-next-app` e do guia shadcn) | Instrument Sans (eixo `wdth` com uso real) + IBM Plex Mono para valor | `wdth` confirmado no navegador (158.0px → 131.6px a 85%) |
| Eyebrow em CAIXA ALTA | rótulo espaçado acima de cada KPI | proibido (T-3) | nenhuma |
| `→` em botão | n/a | proibido (T-4) | nenhuma |
| Motion | nenhum | três tokens, um único momento orquestrado (chegada por Realtime) | nenhuma |
| Símbolo da marca | n/a | dois arcos e um ponto, sem coração nem cifrão | reaberto após ver o 16px real (ver seção 10) |
