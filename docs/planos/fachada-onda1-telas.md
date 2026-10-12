# Plano Fachada — Onda 1, telas

> **De:** Fachada · **Para:** Maestro · **FASE: PLANO** · 2026-10-11
> **Governado por:** `PLANO.md` da raiz, seções `## 1 Escopo`, `## 2 Stack e decisões de plataforma`, `## 5 Ordem de construção e fronteira de arquivos`, `## 6 Riscos que a revisão precisa cobrir`.
> **Tokens:** `docs/design/handoff.md` (Vitrine) — consumidos, nunca criados. Não invoco `frontend-design`.
> **Tarefas de referência:** 5 a 13 de `docs/superpowers/plans/2026-10-11-financas-a-dois-onda1.md`, com as correções da seção 0 abaixo.

## ADENDO 2026-10-11 — recorte da primeira rodada de execução (decisão do Maestro/Heitor)

Este plano continua valendo **inteiro** como referência da Onda 1 completa. O que muda é só a **ordem**: por limite de API, a primeira rodada entrega a **fatia mínima usável** — o Heitor abrir o app, criar a conta, criar a família e lançar uma despesa de verdade.

**Construir nesta rodada:** (1) `/login` e `/cadastro` · (2) onboarding criar/entrar por código · (3) `/inicio` com lista de lançamentos + os indicadores que o dado já permitir · (4) `/lancar` **só receita e despesa simples** · (5) o mínimo de layout/navegação que amarre as quatro.

**FORA desta rodada, construir na continuação:** carteira, fatura, pagar fatura, acerto de contas, parcelas, lote, transferência, categorias, formas de pagamento, metas, `recuperar-senha`, `nova-senha`, PWA/manifest, service worker, Realtime, seletor de paleta.

**Mapeamento para a seção 8:** entram **F-1, F-2, F-5, F-7, F-8, F-9, F-10** e um **F-11 reduzido** (receita/despesa, sem parcela, lote nem transferência). Ficam para a continuação F-3, F-4, F-6, F-12, F-13, F-14, F-15. Consequência de escopo: sem F-6 nesta rodada, **o handoff de invólucros para o Dash (seção 9) não acontece agora** — e o Dash não deve ser disparado antes dele.

**Commit à medida: um commit por tela que funcione.** Se o limite da API cortar no meio, o que está commitado sobrevive e a retomada parte dali. Não deixar trabalho não commitado.

**Camada de servidor continua NÃO sendo minha** (fronteira do `PLANO.md` §5 mantida). O Estrutura entrega `app/proxy.ts`, `app/src/actions/{auth,familia,lancamento}.ts` e `docs/planos/estrutura-contrato-handoff.md` com a seção `## Contrato de handoff — PARA O FACHADA`. **A execução só começa depois que esses três existirem** — conferir com `ls`, não supor.

**Estado do desbloqueio (reconferido no disco, 2026-10-11, regra L-005):**

| Entregável | Estado |
|---|---|
| `app/proxy.ts` | **EXISTE** (commits `8a557f4`, `9eb1423`); `npx tsc --noEmit` exit 0 |
| `app/src/actions/` | **ainda não existe** |
| `docs/planos/estrutura-contrato-handoff.md` | **ainda não existe** |

Cuidado de leitura: `grep -rln "Contrato de handoff — PARA O FACHADA" docs/` **casa com este próprio plano** (onde eu cito o nome da seção). Não é o contrato. A conferência válida é pelo **arquivo do Estrutura**, não pelo grep.

### O que eu li no `proxy.ts` entregue, e o que isso muda em mim

Verifiquei o arquivo e testei o `matcher` e a classificação de rota com `node -e` contra o regex real. Três consequências para a execução:

1. **`/onboarding` é rota PRIVADA.** Só `/login`, `/cadastro`, `/recuperar-senha` e `/nova-senha` são públicas; o default é negar. Então o onboarding roda **com sessão já criada** — o fluxo é cadastrar → (sessão) → `/onboarding` → criar/entrar família → `/inicio`. Minha tela de onboarding **não** trata usuário anônimo.
2. **`/` também é privada e hoje é a página do `create-next-app`.** Visitante sem sessão em `/` é mandado para `/login` (sem `?proximo`, porque o proxy omite o parâmetro na raiz). Com sessão, `/` **não** é redirecionada pelo proxy e cairia na página do template. Preciso resolver `/` nesta rodada — redirect para `/inicio` — senão o Heitor logado que abrir a raiz vê "Create Next App". Entra no F-8.
3. **O login precisa honrar `?proximo=`.** O proxy grava o caminho de origem em `proximo` (só caminho interno, nunca URL absoluta — proteção contra redirect aberto que eu **não** devo afrouxar). Após entrar, destino = `proximo` se presente, senão `/inicio`. Como leio `searchParams`, isso é `Promise<...>` com `await` na page, ou `useSearchParams` **dentro de `<Suspense>`** no componente client (R-6).

Observação de escopo: o `matcher` já exclui `manifest.webmanifest`, `icons/`, `og.png` e `favicon.ico` — confirmado por teste do regex. Isso é compatível com o PWA (F-3) quando ele entrar na continuação; **`/sw.js` é interceptado** e precisará ser adicionado à exclusão quando o service worker chegar. Fica anotado para a continuação, não é desta rodada.

**P-8 encerrada, com o fato correto** (corrigido pelo Maestro contra `~/.claude/settings.json`): o `PreToolUse` registra `sentinela-independencia.cjs`, não `security-guidance`. O `security-guidance` roda como revisão automática **de commit** (já disparou 2× nesta sessão, 4 problemas reais). Portanto varredura **edit a edit não acontece**; **de commit acontece**. Não é risco meu — e, como commito à medida, cada commit meu passa por ela.

---

Nenhuma linha de código de produção foi escrita nesta fase. Os três arquivos que criei para medir (`src/app/twprobe/page.tsx`, dois `.mjs` de sonda) foram removidos; `git status --short` voltou vazio.

---

## 0. Fatos medidos nesta fase que mudam o plano

Tudo abaixo foi verificado por comando nesta sessão, não é memória de treino. É o insumo mais importante deste documento: quatro destes achados contradizem o plano de referência ou o handoff.

### 0.1 O que eu medi

| # | Verificação | Comando | Resultado |
|---|---|---|---|
| M-1 | `shadcn add` **não** reescreve `globals.css` | `npx shadcn@latest add button --dry-run` | `1 file, 1 dep` → só `src/components/ui/button.tsx` + dep `cn`. **A fronteira do Vitrine está segura.** |
| M-2 | Altura padrão do `Button` no preset `radix-nova` | `npx shadcn@latest view button` | `default: h-8` (32px), `lg: h-9` (36px), `icon: size-8`. **Nenhuma variante atinge 44px.** |
| M-3 | Foco do `Button` | idem | `outline-none` + `focus-visible:ring-3 focus-visible:ring-ring/50` **e** `focus-visible:border-ring` (opacidade cheia) |
| M-4 | Borda do `Input` | `npx shadcn@latest view input` | já nasce com `border-input` (não `border-border`) e `focus-visible:border-ring`. Altura `h-8`. |
| M-5 | `form` não existe como primitivo neste registry | `npx shadcn@latest add form --dry-run` | resolve 0 arquivos de `form.tsx`; só traz `button`. **Não há `<Form>`/`<FormField>` do shadcn aqui.** |
| M-6 | `calendar` arrasta `react-day-picker` + `date-fns` | `npx shadcn@latest add calendar --dry-run` | `+ react-day-picker@latest`, `+ date-fns` |
| M-7 | Os 16 primitivos que eu quero resolvem limpo | `add input label select card badge skeleton tabs separator alert switch checkbox popover dropdown-menu alert-dialog textarea --dry-run` | `16 files, 1 dep` — nenhum toca CSS |
| M-8 | `cn` vem do pacote npm, não de `clsx+twMerge` | `cat src/lib/utils.ts` | `export { cn } from "cn"`; `cn@0.4.0` instalado. Consistente, não é bug. |
| M-9 | `zod` nu resolve para **v3** | `head node_modules/zod/index.d.ts` | `export * from "./v3/external.js"` |
| M-10 | API de erro do Zod v3 | `grep ZodError.d.ts` | tem `.issues`, o getter `.errors` **e** `.flatten().fieldErrors` |
| M-11 | `useActionState` existe e devolve `isPending` | `@types/react/index.d.ts:1982` | `[state, dispatch, isPending]` |
| M-12 | Tipografia e espaçamento **não** têm utilitário Tailwind | `grep -- '--text-' globals.css` | vazio. O `@theme inline` do Vitrine mapeia cor, raio, sombra e easing — **não** font-size nem spacing |
| M-13 | Sintaxe de token arbitrário compila de verdade | rota de sonda + leitura do CSS servido pelo dev server | `.text-\(length\:--texto-titulo\) { font-size: var(--texto-titulo) }` e `.gap-\[var\(--esp-4\)\] { gap: var(--esp-4) }` **compilaram** |
| M-14 | Todos os ícones Lucide do handoff existem | `node -e` contra `lucide-react@1.55.0` | 26/26 presentes (`TriangleAlert` e `AlertTriangle` ambos existem) |
| M-15 | Baseline do projeto | `npx tsc --noEmit` | `exit=0` |
| M-16 | Dev server | `curl localhost:3000` | `HTTP 200` |

### 0.2 Consequências — o que eu faço diferente por causa disso

1. **M-2 + M-12 → nasce `TOQUE_MINIMO`.** Nenhuma variante do shadcn atinge 44px, e não existe utilitário de spacing custom. Toda instância interativa de `Button`/`Input`/`Select` em viewport de toque recebe `min-h-[44px]` explícito (M-13 prova que compila). Isto confirma, com número, o risco A-1 que o Vitrine deixou aberto como "não verificado".
2. **M-3 → o halo do shadcn NÃO reprova aqui.** O Vitrine calculou `ring-ring/50` a 2.27–3.40:1 e alertou que, se o halo fosse o único indicador, reprovaria 1.4.11. Medi: o `Button` do `radix-nova` traz **também** `focus-visible:border-ring` em opacidade cheia (≥6.19:1 pelo handoff). O achado 2 do Vitrine fica **resolvido pelo próprio componente**, não por override meu. Mas `outline-none` desliga a rede de segurança `:focus-visible` global do Vitrine — então a conferência passa a ser obrigatória por componente, no navegador, não por leitura de classe.
3. **M-5 → não existe `<Form>` do shadcn.** O plano de referência pressupõe o wrapper. Não vou reimplementar `FormField`/`FormMessage` à mão (seria exatamente o "primitivo artesanal" que minhas regras proíbem). Uso **React Hook Form direto** + `Label` + `Input` + um componente meu `CampoErro` de 10 linhas, que só renderiza `<p role="alert">`. Isso não reimplementa comportamento de foco nem de teclado de nenhum primitivo Radix.
4. **M-6 → `calendar` fica FORA da Onda 1.** O `PLANO.md` fixa "datas: string `YYYY-MM-DD` pura, sem `new Date()` para cálculo"; arrastar `date-fns` + `react-day-picker` para a primeira pintura contradiz a decisão de plataforma e engorda o bundle. Uso `<input type="date">` nativo, que no celular abre o seletor do próprio SO (melhor alvo de toque que qualquer calendário custom) e entrega/consome exatamente `YYYY-MM-DD`. O date range picker do invólucro de dashboard fica como **pendência declarada para a Onda 2**, quando o Dash precisar dele.
5. **M-9/M-10 → Zod v3.** Todo schema usa a API v3 (`z.string().email('mensagem')`) e leio erro por `.flatten().fieldErrors`. Escrever `z.string().email({ error: ... })` (v4) quebraria.
6. **M-12/M-13 → regra de tipografia do projeto.** Como não há `text-titulo`, o valor **nunca** vai hardcoded: escreve-se `text-(length:--texto-titulo) leading-[var(--texto-titulo-lh)]`. Registro isto como a convenção do projeto para não cair em `text-[20px]` na terceira tela.

---

## 1. Fronteira Server/Client, arquivo por arquivo

Regra que aplico: **Server Component é o default**; `'use client'` só em folha, com motivo nomeado. Nenhuma prop não-serializável (função, `Date`, instância) atravessa Server → Client — Server Action é a exceção legítima (`vercel:nextjs`, `references/rsc-boundaries.md`).

### 1.1 Raiz e chassi

| Arquivo | Fronteira | Motivo |
|---|---|---|
| `src/app/layout.tsx` (alterar) | **Server** | Só metadata, fontes, script anti-flash e composição de providers. P-1/P-3 do Vitrine. |
| `src/app/globals.css` | **NÃO TOCO** | É do Vitrine. |
| `src/app/manifest.webmanifest/route.ts` | **Route Handler** (Node) | P-2. `GET` estático devolvendo o JSON da seção 4.2 do handoff. |
| `src/app/error.tsx` | `'use client'` | Exigência do framework: `error.tsx` é obrigatoriamente Client Component. |
| `src/app/global-error.tsx` | `'use client'` | Idem, e precisa conter `<html>`/`<body>`. |
| `src/app/not-found.tsx` | **Server** | Texto estático. |
| `src/app/loading.tsx` | **Server** | Skeleton estático. |
| `src/components/providers/tema-script.tsx` | **Server** | Emite `<script dangerouslySetInnerHTML>` com string **literal constante** — nenhum dado de usuário entra ali (não é o caso proibido de `dangerouslySetInnerHTML` com conteúdo de usuário). |
| `src/components/providers/ocultar-valores-provider.tsx` | `'use client'` | `createContext` + `useState` + `localStorage`. |
| `src/components/providers/realtime-provider.tsx` | `'use client'` | `useEffect` + subscription do canal Supabase. |

**`proxy.ts` (raiz de `app/`) — eu NÃO escrevo.** Está listado nos meus caminhos permitidos, mas é guarda de autenticação: fronteira do Estrutura (`PLANO.md` §5 dá `app/proxy.ts` ao Estrutura, etapa 4b). Ver pendência E-2.

### 1.2 Rotas de autenticação — grupo `(auth)`

Layout próprio: sem navegação inferior, cartão centrado, `max-width` estreito.

| Arquivo | Fronteira | Motivo |
|---|---|---|
| `src/app/(auth)/layout.tsx` | **Server** | Só moldura. |
| `src/app/(auth)/login/page.tsx` | **Server** | Renderiza o form client; sem estado próprio. |
| `src/app/(auth)/cadastro/page.tsx` | **Server** | Idem. |
| `src/app/(auth)/recuperar-senha/page.tsx` | **Server** | Idem. |
| `src/app/(auth)/nova-senha/page.tsx` | **Server** | Idem. |
| `src/components/auth/form-login.tsx` | `'use client'` | `useActionState` + `isPending` (M-11). |
| `src/components/auth/form-cadastro.tsx` | `'use client'` | Idem. |
| `src/components/auth/form-recuperar-senha.tsx` | `'use client'` | Idem. |
| `src/components/auth/form-nova-senha.tsx` | `'use client'` | Idem. |

### 1.3 Rotas da aplicação — grupo `(app)`

| Arquivo | Fronteira | Motivo |
|---|---|---|
| `src/app/(app)/layout.tsx` | **Server** | `await createClient()` para sessão + família; monta providers e navegação. **Nunca** `'use client'`. |
| `src/app/(app)/inicio/page.tsx` | **Server** | Lê `v_monthly_summary` e `transactions`; `searchParams: Promise<...>` com `await` (decisão de plataforma). |
| `src/app/(app)/inicio/loading.tsx` | **Server** | Skeleton de mesma altura. |
| `src/app/(app)/inicio/error.tsx` | `'use client'` | Framework. |
| `src/app/(app)/carteira/page.tsx` | **Server** | Lê `v_account_balances` + `v_invoices`. |
| `src/app/(app)/carteira/loading.tsx` / `error.tsx` | Server / `'use client'` | Idem acima. |
| `src/app/(app)/lancar/page.tsx` | **Server** | Busca contas, categorias, formas, membros e passa como props planas. |
| `src/app/(app)/acerto/page.tsx` | **Server** | Lê `v_settlement`. |
| `src/app/(app)/acerto/loading.tsx` / `error.tsx` | Server / `'use client'` | Idem. |
| `src/app/(app)/ajustes/page.tsx` | **Server** | Índice de links. |
| `src/app/(app)/ajustes/perfil/page.tsx` | **Server** | Lê a própria linha de `family_members`. |
| `src/app/(app)/ajustes/familia/page.tsx` | **Server** | Lê `families` + membros; exibe `join_code`. |
| `src/app/(app)/ajustes/categorias/page.tsx` | **Server** | Lista `categories`. |
| `src/app/(app)/ajustes/contas/page.tsx` | **Server** | Lista `accounts`. |
| `src/app/(app)/ajustes/formas-pagamento/page.tsx` | **Server** | Lista `payment_methods`. |
| `src/app/(app)/onboarding/page.tsx` | **Server** | Decide criar-vs-entrar pela ausência de família. |

### 1.4 Componentes client — e por que cada um precisa ser

Cada `'use client'` abaixo é **folha**. Nenhum `layout.tsx` e nenhum `page.tsx` recebe a diretiva.

| Componente | Motivo exato do `'use client'` |
|---|---|
| `navegacao/navegacao-inferior.tsx` | `usePathname` para marcar item ativo. **Exige `<Suspense>`** — ver risco R-6. |
| `navegacao/alternar-valores.tsx` | Lê/escreve o contexto de ocultar valores. |
| `tema/seletor-tema.tsx` | `useState` + `localStorage` + escreve `classList`/`dataset` no `<html>`. |
| `transacoes/form-lancamento.tsx` | React Hook Form, estado de abas de tipo, cálculo do rótulo de fatura ao vivo. |
| `transacoes/form-lote.tsx` | Lista dinâmica de linhas. |
| `transacoes/lista-transacoes-ao-vivo.tsx` | Recebe página inicial do servidor e aplica evento de Realtime. |
| `transacoes/acoes-transacao.tsx` | `AlertDialog` de exclusão com escopo (`single`/`series`). |
| `carteira/dialogo-pagar-fatura.tsx` | `Dialog` + `useActionState`. |
| `acerto/dialogo-acertar.tsx` | Idem. |
| `ajustes/*/form-*.tsx` (5 CRUDs) | Formulários controlados. |
| `ui/paginacao.tsx` | `useRouter`/`useSearchParams` → **Suspense obrigatório**. |
| `ui/animar-entrada.tsx` | Animação de chegada por Realtime; respeita `prefers-reduced-motion`. |

---

## 2. Primitivos shadcn: quais e em que ordem

Todos confirmados por `--dry-run` (M-1, M-7): nenhum toca `globals.css`.

**Lote 1 — chassi (antes de qualquer tela):**
```
npx shadcn@latest add button input label card skeleton badge separator
```

**Lote 2 — formulário:**
```
npx shadcn@latest add select checkbox switch textarea alert
```

**Lote 3 — sobreposição e navegação:**
```
npx shadcn@latest add dialog alert-dialog sheet dropdown-menu popover tabs
```

**Lote 4 — dados (invólucro do Dash):**
```
npx shadcn@latest add table
```

**Fora da Onda 1, com motivo:**

| Primitivo | Decisão | Motivo |
|---|---|---|
| `calendar` | **não instalar** | M-6: arrasta `date-fns` + `react-day-picker` e contraria a decisão "datas ISO puras". Uso `<input type="date">`. |
| `form` | **não existe** | M-5. RHF direto + `CampoErro`. |
| `sonner` / `toast` | **não na Onda 1** | Traz `next-themes`, que competiria com o controle de tema do Vitrine (`.dark` + `data-paleta`). Feedback de sucesso via redirect + estado inline. |
| `command` | Onda 2 | Sem busca global no escopo. |

**Depois de CADA lote, obrigatoriamente (P-4):**
```
grep -rn "ring-ring/50" app/src/components/ui        # para cada hit, confirmar focus-visible:border-ring no MESMO elemento
grep -rn "border-border" app/src/components/ui       # C-4: componente interativo não pode usar --border
grep -rnE "h-[0-9]|size-[0-9]" app/src/components/ui # A-1: catalogar quem precisa de min-h-[44px]
grep -rnE "#[0-9a-fA-F]{3,8}|rgb\(|[0-9]+px" app/src/components/ui  # T-5: hex/px cru
```

---

## 3. Componentes compartilhados — assinatura de props

Tipos importados de `@/types/database` (nunca redeclarados, nunca `any`). Apelidos que uso:

```ts
import type { Database } from '@/types/database'

type Transacao       = Database['public']['Tables']['transactions']['Row']
type SaldoConta      = Database['public']['Views']['v_account_balances']['Row']
type Fatura          = Database['public']['Views']['v_invoices']['Row']
type ResumoMes       = Database['public']['Views']['v_monthly_summary']['Row']
type LinhaAcerto     = Database['public']['Views']['v_settlement']['Row']
type Membro          = Database['public']['Tables']['family_members']['Row']
type Categoria       = Database['public']['Tables']['categories']['Row']
type Conta           = Database['public']['Tables']['accounts']['Row']
type FormaPagamento  = Database['public']['Tables']['payment_methods']['Row']
type Familia         = Database['public']['Tables']['families']['Row']
```

**Atenção de tipo, verificada em M-*:** toda coluna de **view** vem `| null` nos tipos gerados (`current_balance: number | null`), enquanto a tabela `transactions` vem não-nula. Meus componentes de view aceitam `| null` e tratam o nulo — não uso `!` para calar o compilador. E `transactions.type` / `families.split_rule` são `string`, não união literal: a narrowing é minha, por mapa indexado por `string`, nunca por `as`.

### 3.1 Dinheiro e semântica financeira — onde C-1/C-2/C-3 vivem

Estes três componentes são o **único** lugar do app autorizado a pintar valor. É assim que a regra deixa de depender de disciplina em 20 telas.

```ts
// src/components/financeiro/valor-monetario.tsx   (Server)
export type SinalExibido = 'auto' | 'nunca'
export interface ValorMonetarioProps {
  valor: number
  tipo?: 'receita' | 'despesa' | 'investimento' | 'transferencia'
  pago?: boolean                 // false => cor --pendente (mapa da seção 2.3 do handoff)
  contabil?: boolean             // true  => C-3: negativo entre parênteses + ícone de alerta
  sinal?: SinalExibido
  tamanho?: 'heroi' | 'destaque' | 'linha'
  className?: string
}
```
- **C-2 aqui:** o `+`/`−` (U+2212) é concatenado **antes** do `R$`, derivado de `tipo`, para `receita` e `despesa`, sem exceção. `investimento`/`transferencia` não levam sinal (regra do handoff) e recebem ícone + palavra do tipo.
- **C-3 aqui:** com `contabil` e `valor < 0`, renderiza `(R$ 1.234,56)` + `TriangleAlert` com nome acessível `Saldo negativo` (ícone **informativo**, seção 4.4).
- **C-1 aqui:** a cor vem **só** de `--receita`/`--despesa`/`--investimento`/`--transferencia`/`--pendente`/`--negativo`. `--primary` é proibido neste arquivo — e isso é verificável por `grep -n "primary" src/components/financeiro/`.
- **Ocultar valores:** chama `formatBRL(valor, ocultar)` do `@/lib/format`; **nenhum** caminho formata dinheiro à mão. O sinal também é suprimido quando oculto (o helper já não vaza o negativo) — e `aria-label`/`title` recebem o **mesmo** texto mascarado (risco R-4).
- Classe `.valor` sempre (T-1); tamanho por `text-(length:--texto-valor-*)`; acima de 12 caracteres o herói cai para `destaque` (edge case 7.3).

```ts
// src/components/financeiro/badge-tipo.tsx   (Server)
export interface BadgeTipoProps {
  tipo: string                   // vem do banco como string; narrowing por mapa
  pago: boolean
  beneficio?: boolean
}
```
Ícone `aria-hidden="true"` **+ a palavra do tipo** ao lado (é o que sobrevive ao `grayscale(1)` do teste de aceite). `--raio-chip` via `rounded-sm`.

```ts
// src/components/financeiro/selo-pendente.tsx   (Server)
export interface SeloPendenteProps { pago: boolean; dataPagamento: string | null }
```
`Clock` decorativo + a palavra "Pendente".

### 3.2 Invólucro de dashboard — o que eu entrego ao Dash

Eu entrego o **continente**; tipo de gráfico, eixo, escala, série, cor de série, tooltip e legenda são do **Dash**. Não escolho nenhum deles.

```ts
// src/components/ui/cartao-painel.tsx   (Server)
export interface CartaoPainelProps {
  titulo: string
  apoio?: string
  acao?: React.ReactNode
  children: React.ReactNode
  className?: string
}

// src/components/ui/esqueleto-bloco.tsx   (Server)
export interface EsqueletoBlocoProps {
  altura: number       // px — DEVE casar com a altura final do conteúdo
  linhas?: number
  className?: string
}

// src/components/ui/grade-painel.tsx   (Server)
export interface GradePainelProps {
  colunas?: 2 | 3 | 4   // base 1 col; lg aplica o valor (breakpoints 7.1 do handoff)
  children: React.ReactNode
}

// src/components/ui/cartao-indicador.tsx   (Server)
export interface CartaoIndicadorProps {
  rotulo: string                 // T-3: sentence case, nunca CAIXA ALTA espaçada
  valor: number
  tipo?: 'receita' | 'despesa' | 'investimento'
  pago?: boolean
  contabil?: boolean
  apoio?: string
}

// src/components/ui/tabela-dados.tsx   (Server; ordenação/filtro por searchParams, sem estado de client)
export interface ColunaTabela<T> {
  chave: string
  titulo: string
  alinhar?: 'inicio' | 'fim'
  ordenavel?: boolean
  render: (linha: T) => React.ReactNode
}
export interface TabelaDadosProps<T> {
  colunas: ColunaTabela<T>[]
  linhas: T[]
  chaveDaLinha: (linha: T) => string   // key estável: id do banco, NUNCA o índice
  vazio: React.ReactNode
}
```
`chaveDaLinha` é obrigatória de propósito: é o que impede key ausente/duplicada na lista (item do meu checklist).

```ts
// src/components/ui/estado-vazio.tsx   (Server)
export interface EstadoVazioProps { titulo: string; descricao: string; acao?: React.ReactNode }
// src/components/ui/estado-erro.tsx   ('use client' — recebe reset do error.tsx)
export interface EstadoErroProps { titulo: string; descricao: string; aoTentarNovamente?: () => void }
```
Sem ilustração: o Vitrine não entregou asset de estado vazio e eu **não** invento um.

### 3.3 Carteira, transação, acerto

```ts
// src/components/carteira/cartao-conta.tsx   (Server)
export interface CartaoContaProps {
  conta: SaldoConta
  faturaAberta?: Fatura | null
  aoPagar?: React.ReactNode      // nó pronto, não função: mantém a prop serializável
}
```
Único componente com `shadow-cartao` + `--raio-cartao` (`rounded-2xl`) + `border: var(--borda-cartao)`. Nome da conta em 1 linha com `.texto-micro` (`font-stretch: 85%`) antes de elipsar, e `title` com o nome completo. Saldo com `contabil` ligado → C-3.

```ts
// src/components/transacoes/item-transacao.tsx   (Server)
export interface ItemTransacaoProps {
  transacao: Transacao
  nomeCategoria?: string | null
  nomeConta?: string | null
  nomeMembro?: string | null
  acoes?: React.ReactNode
  destacarNovo?: boolean         // chegou por Realtime
}
```
Descrição em no máximo 2 linhas e depois elipse (7.3). `--border` só como régua entre linhas (C-4: aqui é decorativa e isso é o uso legítimo).

```ts
// src/components/acerto/resumo-acerto.tsx   (Server)
export interface ResumoAcertoProps {
  linhas: LinhaAcerto[]
  membros: Pick<Membro, 'id' | 'display_name'>[]
  regra: string                  // families.split_rule
}
```
Renderiza a **frase** `<nome> deve <valor> a <nome>` (exigência do Vitrine: frase, não cor), quebrando em 2 linhas e **nunca** elipsando nome de membro.

---

## 4. Loading, erro e vazio — por tela

Skeleton com a **mesma altura** do conteúdo final (via `EsqueletoBlocoProps.altura`), para não haver salto de layout.

| Rota | Loading | Erro | Vazio |
|---|---|---|---|
| `/login`, `/cadastro`, `/recuperar-senha`, `/nova-senha` | `isPending` do `useActionState` desabilita o botão e troca o rótulo | `Alert` inline acima dos campos, em pt-BR; erro de campo sob o campo (borda **e** texto — nunca só a borda, WCAG 1.4.1) | n/a |
| `/onboarding` | idem | idem + erros nominais das RPCs (seção 6) | n/a |
| `/inicio` | `loading.tsx`: 4 esqueletos de indicador + 6 linhas de extrato | `error.tsx` com `reset()` | **PRIMEIRA TELA REAL DO HEITOR** — ver nota abaixo |
| `/carteira` | esqueleto de 2 cartões em altura de cartão real | `error.tsx` | "Nenhuma conta cadastrada." + botão → `/ajustes/contas` |
| `/lancar` | esqueleto de formulário | `error.tsx`; erro de submit em `Alert` | se faltar conta cadastrada, bloqueia com aviso + link (não deixa o form inválido de propósito) |
| `/acerto` | esqueleto da frase + 2 linhas | `error.tsx` | "Nada a acertar neste mês." |
| `/ajustes` e as 5 subrotas | esqueleto de lista | `error.tsx` | um vazio por lista, com o CTA de criar |

`global-error.tsx` cobre falha no layout raiz. `not-found.tsx` cobre rota inexistente.

### O vazio de `/inicio` é a primeira tela real do produto (decisão do Maestro)

No percurso desta rodada — cadastrar → criar família → **`/inicio` vazio** → lançar → `/inicio` com dado — o Heitor vê a tela vazia **antes** de existir qualquer lançamento. Ela não é polimento: é a primeira impressão do app dele. Tratamento:

- **Não é erro e não parece erro.** Sem ícone de alerta, sem cor semântica de despesa, sem borda vermelha.
- Estrutura de copy (padrão de estado vazio: o que é + por que está vazio + como começar), em `src/features/transacoes/copy.ts`:
  título **"Tudo pronto para começar"** · descrição **"Seus lançamentos vão aparecer aqui. Comece registrando um gasto ou uma entrada."** · CTA primário **"Lançar o primeiro"** → `/lancar`.
- O CTA é `Button` default (`--primary`) — uso legítimo de `--primary` por C-1 (ação principal, não valor financeiro) — com `TOQUE_MINIMO`.
- Sem ilustração: o Vitrine não entregou asset de estado vazio e eu não invento um (seção 7.3 do handoff).
- Os indicadores numéricos aparecem zerados com `ValorMonetario`, respeitando C-2 (então **"+ R$ 0,00"**, não "R$ 0,00" solto) — o zero é dado legítimo, não ausência.
- Prova: screenshot deste estado nos 3 breakpoints + dark, porque é a tela que o cliente vê primeiro.

---

## 5. Onde C-1, C-2, C-3 e as regras do Vitrine são aplicadas

| Regra | Componente que a implementa | Como eu provo |
|---|---|---|
| **C-1** `--primary` nunca codifica valor | `valor-monetario.tsx`, `badge-tipo.tsx`, `cartao-indicador.tsx` | `grep -rn "primary" src/components/financeiro/` → **zero**. `--primary` só em `Button` default, item ativo da navegação, link e `--ring`. |
| **C-2** sinal `+`/`−` sempre | `valor-monetario.tsx`, caminho único | screenshot em `grayscale(1)` com receita e despesa distinguíveis |
| **C-3** negativo contábil | `valor-monetario.tsx` (`contabil`) e `cartao-conta.tsx` | conta com saldo negativo mostra `(R$ …)` + `TriangleAlert` rotulado |
| **C-4** borda forte em interativo | `border-input` nos campos (M-4 já vem certo) | `grep -rn "border-border" src/components/ui` só em separador/régua |
| **T-1/T-2** mono tabular | `.valor` / `.num-tabular` | nenhum valor fora do `ValorMonetario` |
| **T-3** sem eyebrow caixa alta | `cartao-indicador.tsx` | `grep -rn "uppercase tracking" src/components` → zero |
| **T-4** sem `→` em botão | `copy.ts` | `grep -rn "→" src/features/*/copy.ts` → zero |
| **T-5** nenhum hex cru | todos | `grep -rnE "#[0-9a-fA-F]{3,8}|rgb\(" src/components src/app` → zero, + `design:design-system` em `audit` |
| **A-1** toque ≥44px | `TOQUE_MINIMO` em botão, campo, item de navegação, chip, botão só-ícone | medição de caixa no navegador, não leitura de classe |
| **A-2** foco visível | M-3: o primitivo já traz `focus-visible:border-ring` | navegação só por Tab, nos dois temas |
| **A-3** `prefers-reduced-motion` | `animar-entrada.tsx` cai para fade | emulação no Playwright |
| **P-7** desabilitado não informa sozinho | todo botão desabilitado tem o motivo escrito ao lado | inspeção dos screenshots |

---

## 6. Copy centralizada

Um módulo tipado por feature, nenhum texto solto no JSX:
`src/features/auth/copy.ts`, `familia/`, `transacoes/`, `carteira/`, `acerto/`, `ajustes/`, `comum/`.

**Termos canônicos** (fixados para não oscilar entre telas):

| Conceito | Termo único | Proibido |
|---|---|---|
| iniciar sessão | **Entrar** | Login, Acessar, Sign in |
| encerrar sessão | **Sair** | Logout, Deslogar |
| criar conta de usuário | **Criar conta** | Cadastrar-se, Registrar |
| conta bancária/cartão | **conta** | carteira (é o nome da tela), banco |
| lançamento | **lançamento** | transação, movimento |
| acerto do casal | **acerto** | split, divisão, quitação |
| código da família | **código de convite** | código de família, convite |

Mensagens Zod em **português**, na API **v3** (M-9), verificadas com formulário preenchido de verdade:
`'Informe seu e-mail'`, `'E-mail inválido'`, `'A senha precisa de ao menos 6 caracteres'`, `'As senhas não conferem'`, `'Informe uma descrição'`, `'Informe um valor maior que zero'`, `'Escolha uma conta'`, `'Data inválida'`, `'A conta de destino precisa ser diferente da conta de origem'`, `'O código tem 6 caracteres'`.

**Erros das RPCs** já chegam em pt-BR e eu os exibo **como vêm**, sem reescrever, mapeados por correspondência: `Você precisa estar logado para entrar em uma família`, `Você já faz parte de uma família`, `Código de convite não encontrado`, `Esta família já está completa`. O código `23514` do trigger de segurança (`Não é permitido mudar a família de um membro` / `...a data de entrada de um membro`) vira uma mensagem única: `Esse dado não pode ser alterado.` Erro desconhecido cai em `Não foi possível concluir. Tente de novo.` — **nunca** vaza `error.message` cru do Postgres na tela.

---

## 7. Riscos e como cada um é endereçado

| # | Risco | Tratamento |
|---|---|---|
| **R-1** | **Hidratação do tema.** O script anti-flash mexe no `<html>` antes da hidratação. | `suppressHydrationWarning` **no `<html>`** — é o uso legítimo documentado (atributo que o script muda de propósito), não máscara de fronteira errada. O script é string literal constante, inline no `<head>`, e a paleta é CSS puro: o JS só troca `classList`/`dataset`. **Nunca** `style.setProperty` em `useEffect` (foi o flash da v1). Se aparecer erro de hidratação em qualquer **outro** ponto, corrijo a fronteira — jamais acrescento `suppressHydrationWarning`. |
| **R-2** | **Virada de mês da fatura.** Compra no dia do fechamento cai no ciclo seguinte. | `form-lancamento.tsx` chama `getInvoicePeriod(data, closing_day)` do `@/lib/invoice` **ao vivo** e mostra "Vai para a fatura de <mês>" **antes** de salvar. Não reimplemento a regra. Teste no navegador com `closing_day=25`, datas 24 e 26. |
| **R-3** | **Parcelas.** A série é gerada no banco. | A UI envia **um** pedido a `save_transactions` com `recurrence_months`; **não** gero parcela no cliente. Mostro a prévia ("12 parcelas de …") como texto calculado só para leitura. |
| **R-4** | **Ocultar valores.** | Caminho único por `formatBRL(v, ocultar)`; `aria-label` e `title` recebem o texto mascarado. Máscara preserva a largura da caixa para a lista não pular. Verificação: `grep -rnE "toFixed|toLocaleString|R\\$" src/components src/app` só deve achar `formatBRL`. |
| **R-5** | **Realtime duplicando a própria linha.** | A lista mantém um `Set` de `id` já renderizados; evento cujo `id` já existe é **descartado** (não concatenado). Em página > 1, linha nova **não** entra na lista: aparece um aviso "1 lançamento novo" com ação de recarregar — inserir no meio de uma página paginada embaralharia a ordem. Linha nova de outro membro entra com `--motion-entrada`, e com `prefers-reduced-motion` vira fade. |
| **R-6** | **CSR bailout.** `useSearchParams`/`usePathname` sem `Suspense` tornam a página inteira client (`vercel:nextjs`, `references/suspense-boundaries.md`). | `ui/paginacao.tsx` e `navegacao-inferior.tsx` ficam **dentro de `<Suspense>`** com fallback de mesma altura. |
| **R-7** | **`redirect()` dentro de `try/catch`.** `redirect` lança; capturá-lo cancela a navegação silenciosamente (`references/error-handling.md`). | Nos formulários, `redirect` fica **fora** do `try`; se precisar de `catch`, uso `unstable_rethrow(error)` antes de tratar. Entra na revisão de cada form. |
| **R-8** | **Contrato do Estrutura ausente.** Não existe `src/actions/`, nem `proxy.ts`, nem seção `## Contrato de handoff — PARA O FACHADA`. | Trabalho com **mock tipado** marcado `// MOCK — remover quando Estrutura entregar`, derivado de `@/types/database` (não de `any`). Pendências E-1 a E-4 na seção 10. |
| **R-9** | **Tipos de view são `| null`.** | Componentes de view aceitam `| null` e renderizam fallback; `npx tsc --noEmit` é a prova. Nenhum `!` e nenhum `as`. |
| **R-10** | **Alvo de toque do shadcn (32px).** Medido em M-2. | `TOQUE_MINIMO = 'min-h-[44px]'` aplicado e **medido no navegador** por caixa, não por classe. |
| **R-11** | **`outline-none` do primitivo desliga a rede do Vitrine.** M-3. | Conferência `grep` após cada lote + Tab no navegador nos dois temas. |
| **R-12** | **Peso da primeira pintura.** | Nenhum chart na Onda 1. Quando o Dash entregar, o chart entra por `next/dynamic` com skeleton de mesma altura. `next/image` sempre com `width`/`height` (ou `fill` + `sizes`); `priority` só no herói. |

---

## 8. Ordem de implementação — tarefas com entregável testável

Cada tarefa termina com algo verificável. Nenhuma tarefa é "parcialmente pronta".

| # | Tarefa | Entregável testável |
|---|---|---|
| **F-1** | Lote 1 de primitivos + `grep`s de P-4 + `TOQUE_MINIMO` | `src/components/ui/*.tsx` existem; `npx tsc --noEmit` exit 0; saída dos 4 `grep` colada |
| **F-2** | `layout.tsx`: `lang="pt-BR"`, `title`/`description` reais, `metadata.icons`, `openGraph.images` **com `alt`**, `appleWebApp`, `theme-color` claro/escuro (P-1) | favicon na aba; `curl` do HTML mostra as tags; nenhum "Create Next App" |
| **F-3** | `manifest.webmanifest/route.ts` (P-2), pares `any` e `maskable` **separados** | `curl localhost:3000/manifest.webmanifest` devolve o JSON da seção 4.2 |
| **F-4** | Script anti-flash + `suppressHydrationWarning` + providers (P-3) | recarga sem flash; console **sem** erro de hidratação |
| **F-5** | `ValorMonetario`, `BadgeTipo`, `SeloPendente` | screenshot em `grayscale(1)` com receita/despesa/pendente/negativo distinguíveis (teste de aceite do Sentinela) |
| **F-6** | Invólucro: `CartaoPainel`, `EsqueletoBloco`, `GradePainel`, `CartaoIndicador`, `TabelaDados`, `EstadoVazio`, `EstadoErro` | **handoff para o Dash** (seção 9) |
| **F-7** | `(auth)`: 4 rotas + 4 forms + `copy.ts` | `browser_fill_form` com e-mail sem `@` e senha curta → mensagem Zod **em português** na tela |
| **F-8** | `(app)/layout.tsx` + navegação inferior (em `Suspense`) + alternar valores + **resolver `/`: substituir a página do `create-next-app` por `redirect('/inicio')`** · seletor de tema fica para a continuação (fora do recorte) | Tab percorre tudo com foco visível nos 2 temas; alternar valores mascara **toda** a tela; **`/` logado nunca mostra "Create Next App"** |
| **F-9** | `/onboarding` (criar família / entrar por código) | erro nominal da RPC exibido ao usar código inexistente |
| **F-10** | `/inicio`: indicadores + lista paginada + `loading`/`error`/vazio | 3 breakpoints + dark; paginação não torna a página CSR |
| **F-11** | `/lancar`: 4 tipos, lote, parcelas, rótulo de fatura ao vivo | com `closing_day=25`: data 24 → fatura do mês; data 26 → mês seguinte (R-2) |
| **F-12** | `/carteira`: cartões + fatura + pagar fatura | conta negativa em `(R$ …)` + ícone (C-3) |
| **F-13** | `/acerto` | frase `<nome> deve <valor> a <nome>`, 2 linhas, sem elipse |
| **F-14** | `/ajustes` + 5 subrotas | cada lista com vazio, erro e loading |
| **F-15** | Realtime na lista (R-5) + `animar-entrada` | linha do parceiro entra 1×, sem duplicar a própria; reduced-motion vira fade |
| **F-16** | Fechamento: `vercel:react-best-practices`, `design:design-system` audit, `code-review` medium, passe de navegador completo | relatório com os 3 breakpoints + dark por rota, console/network limpos, `tsc` colado |

Dependências: F-1 antes de tudo; F-5 antes de F-10/F-12/F-13; F-6 antes de qualquer tela de dados **e antes de o Dash começar**; F-8 antes das telas de `(app)`; F-15 por último (precisa de lista real).

---

## 9. Handoff para o Dash — invólucros que ele recebe

Entrego na F-6, **antes** de o Dash montar tela. Caminhos e props na seção 3.2.

| Caminho | Para quê |
|---|---|
| `app/src/components/ui/cartao-painel.tsx` | moldura de todo tile |
| `app/src/components/ui/esqueleto-bloco.tsx` | `altura` deve casar com a altura final do chart (sem salto) |
| `app/src/components/ui/grade-painel.tsx` | 1 col base, `lg` em 2/3/4 (breakpoints 7.1) |
| `app/src/components/ui/cartao-indicador.tsx` | KPI numérico; rótulo em sentence case (T-3) |
| `app/src/components/ui/tabela-dados.tsx` | tabela com `chaveDaLinha` obrigatória |
| `app/src/components/ui/estado-vazio.tsx` / `estado-erro.tsx` | estados do tile |

**Fronteira:** eu monto o chart **dentro** do `CartaoPainel` e não mexo no interior dele. Não escolho tipo de gráfico nem cor de série; `src/components/charts/` é do Dash e eu não toco. Se o chart dele quebrar no meu passe (NaN no tooltip, overflow em 390px), reporto ao Maestro com screenshot em vez de corrigir por cima. **Date range picker:** não entrego na Onda 1 (M-6); quando o Dash precisar, decide-se entre `<input type="date">` nativo e assumir `react-day-picker` — pendência para o Maestro.

---

## 10. Pendências de handoff

### `## PENDÊNCIAS PARA O ESTRUTURA`

Sobem pelo Maestro, não direto ao Estrutura. Antes de abrir, rodo `vercel:verification` para não encaminhar sem diagnóstico. Até serem atendidas, uso mock tipado marcado `// MOCK — remover quando Estrutura entregar`.

| # | O que falta | Shape esperado | Auth? | Tela travada |
|---|---|---|---|---|
| **E-1** | A seção `## Contrato de handoff — PARA O FACHADA` **não existe** em nenhum documento | assinatura de cada Server Action: nome, caminho, entrada Zod, retorno **incluindo a forma do erro** | — | todas as de mutação |
| **E-2** | `app/proxy.ts` não existe | `export function proxy()` + `export const proxyConfig`; redirect sem sessão → `/login`, com sessão em rota de auth → `/inicio`; `matcher` excluindo `_next/static`, `_next/image`, `favicon.ico`, `icons`, `sw.js`, `manifest` | sim | todo o grupo `(app)` |
| **E-3** | `src/actions/` não existe (auth, family, transactions, accounts, categories, payment-methods, settlement) | `(estado, formData) => Promise<{ ok: true } \| { ok: false; erro: string; campos?: Record<string,string> }>` — forma estável para `useActionState` (M-11) | sim | `(auth)`, `/onboarding`, `/lancar`, `/carteira`, `/acerto`, `/ajustes` |
| **E-4** | Quem resolve `family_id`/`member_id` no servidor | `get_user_family_id_self()` / `get_user_member_id_self()` expostos por helper tipado | sim | `(app)/layout.tsx` |
| **E-5** | Service worker (`sw.js`) do PWA | registro + estratégia de cache | não | instalabilidade |

**Eu não me desbloqueio sozinho:** não crio migration, policy RLS, Server Action, nem client Supabase com `service_role`. Se o Maestro decidir que `src/actions/` passa a ser meu, preciso dessa autorização **por escrito** — hoje `PLANO.md` §5 não me dá esse caminho.

### Do Vitrine (seção 11 do handoff)
P-1 → F-2 · P-2 → F-3 · P-3 → F-4 · P-4 → F-1 e após cada lote · P-6 → F-16 · P-7 → seção 5.
P-5 é do Dash. **P-8 ENCERRADA** pelo Maestro (ver adendo no topo): o `security-guidance` não é hook de `PreToolUse` — roda como revisão automática **de commit**. Varredura edit a edit não acontece; de commit acontece. Não é risco meu.

### Do Radar
Não existe `docs/pesquisa/*radar*.md`. Nenhuma referência visual externa; a direção vem do handoff e da engenharia reversa da v1. Declarado, não suposto.

---

## 11. O que eu vou provar com screenshot na execução

Nenhuma rota entra no relatório sem o **passe de navegador** completo. Dev server: `cd app && npm run dev` → `http://localhost:3000` (garantir no ar é meu).

Por rota — `/login`, `/cadastro`, `/recuperar-senha`, `/nova-senha`, `/onboarding`, `/inicio`, `/lancar`, `/carteira`, `/acerto`, `/ajustes` e as 5 subrotas:

1. `browser_navigate`
2. `browser_resize` **375×812**, **768×1024**, **1440×900** — em cada um: `browser_take_screenshot` com `filename` **absoluto** + **leitura** do print + `browser_snapshot` (árvore de acessibilidade lida, não só capturada)
3. `browser_emulate_media` `colorScheme: dark` → repetir o print
4. `browser_console_messages` + `browser_network_requests` — **bloqueantes:** erro de hidratação, key duplicada/ausente, qualquer 4xx/5xx inclusive imagem e fonte
5. `browser_click` em **todo** botão e link principal
6. `browser_fill_form` com dado **inválido** (e-mail sem `@`, senha de 3 caracteres, valor 0, código de 2 caracteres) e depois válido
7. `browser_press_key` Tab pelo fluxo inteiro, nos **dois** temas

Provas específicas, além do padrão:

| Prova | Como | Onde |
|---|---|---|
| Teste de aceite do Vitrine | `grayscale(1)` via `browser_evaluate`; receita, despesa, pago, pendente e saldo negativo continuam identificáveis | `/inicio`, `/carteira` |
| C-2 | print mostrando `+` e `−` antes do `R$` | `/inicio` |
| C-3 | conta negativa em `(R$ …)` + ícone rotulado | `/carteira` |
| A-1 (44px) | `getBoundingClientRect` em botão, campo, item de navegação e botão só-ícone a 375px | todas |
| A-2 / R-11 | foco por Tab visível nos 2 temas; halo conferido | todas |
| R-1 | recarga dura sem flash; console sem erro de hidratação | `/inicio` |
| R-2 | `closing_day=25`: data 24 vs 26 mudando o rótulo da fatura | `/lancar` |
| R-4 | olho ligado mascara valor, `aria-label` e `title` | `/inicio`, `/carteira` |
| R-5 | linha do parceiro entra 1×; a própria não duplica | `/inicio` |
| A-3 | `prefers-reduced-motion: reduce` → fade | `/inicio` |
| Paletas | 4 paletas × 2 modos no seletor | `/ajustes` |

Se o navegador não estiver disponível, escrevo **"VERIFICAÇÃO VISUAL NÃO EXECUTADA"** com o motivo e **não** marco o checklist.

---

## 12. Fronteira — o que eu NÃO faço

- Não toco `app/src/app/globals.css` nem `app/src/styles/` (Vitrine). Consumo `tema.ts`; não altero.
- Não crio token, paleta ou tipografia. Não invoco `frontend-design` (o Vitrine está no projeto).
- Não crio migration, policy RLS, Server Action, nem client com `service_role`.
- Não toco `app/supabase/`, `app/src/lib/`, `app/src/types/`, `app/tests/`.
- Não escolho tipo de gráfico nem cor de série; não invoco `dataviz`; não toco `app/src/components/charts/`.
- Não reescrevo rótulo de KPI nem definição de métrica do Dash.
- Não decido autorização no client: o client esconde, o servidor nega.
- Nenhum segredo em código de client; só `NEXT_PUBLIC_*`, e nunca chave de serviço.

---

### Auto-Análise

- **Passes realizados:** 4
- **Passes que encontraram erro:** 3
- **Correções aplicadas:**
  1. **Primeiro rascunho dava `calendar` como instalado e `<Form>` do shadcn como existente** → medi (`--dry-run`, M-5/M-6): `form` não resolve neste registry e `calendar` arrasta `date-fns` + `react-day-picker`, contra a decisão "datas ISO puras" do `PLANO.md`. Virou decisão registrada com motivo, não suposição.
  2. **Eu ia escrever `text-[20px]`/`p-4` por não haver `text-titulo`** → medi (M-12) que o `@theme` do Vitrine não mapeia font-size nem spacing, e **provei no dev server** (M-13) que `text-(length:--texto-titulo)` e `gap-[var(--esp-4)]` compilam. Virou a convenção de tipografia do projeto, eliminando hardcoded antes da primeira linha de código.
  3. **Eu tratava o halo de foco como reprovação herdada do Vitrine** → medi o fonte do `Button` (M-3): `focus-visible:border-ring` em opacidade cheia já existe, então o achado 2 do Vitrine está resolvido pelo primitivo; o risco real é outro — `outline-none` desliga a rede global dele (virou R-11).
  4. **Inventário do arquivo (L-001) — e um erro meu no próprio relato.** Rodei `grep -o 'Skill(skill="[^"]*")'`: o único resultado é o **placeholder literal** citado na própria lição. Ou seja, **nenhuma** skill aparece na forma invocável neste plano — nem as minhas. Minha primeira redação deste bloco afirmava que as minhas estavam "na forma invocável", o que era **falso**; corrigi a afirmação em vez de corrigir o arquivo, porque o arquivo já está certo: num documento de plano, citar ferramenta em nome cru é adequado, e o que L-001 proíbe é dar forma invocável à ferramenta **de outro agente**. Conferido por `grep` nominal: `dataviz`, `frontend-design`, `design-handoff` e `accessibility-review` **não** aparecem em forma invocável, e cada um é citado com o dono nomeado na mesma frase. As minhas (`vercel:nextjs`, `vercel:shadcn`, `design:design-system`, `design:ux-copy`, `vercel:react-best-practices`, `code-review`, `vercel:verification`) estão em nome cru, todas dentro da minha lista de obrigatórias/opcionais. L-001 cumprida; a lição nova é sobre **relatar verificação que não confere com a saída do comando** (L-004).
  5. **Sonda removida.** As 3 sondas que criei para medir foram apagadas e `git status --short` voltou **vazio** — nenhum arquivo meu fora da fronteira desta fase.
- **Lições novas gravadas em C:/Users/Heitor PC/.claude/agents/licoes/fachada.md:** L-002 (afirmar primitivo/altura do shadcn de memória em vez de medir com `--dry-run` e `view`) · L-003 (assumir que existe utilitário Tailwind para todo token do handoff, sem conferir o `@theme`) · L-004 (escrever no bloco de Auto-Análise o resultado que eu *esperava* do comando de verificação, em vez do que ele imprimiu)
- **Pendências abertas:**
  - **E-1 a E-5: RESOLVIDAS pela opção (a)** — o Maestro confirmou os três comandos e mantém a fronteira do `PLANO.md` §5: eu **não** escrevo camada de servidor. O Estrutura entrega `app/proxy.ts`, `app/src/actions/{auth,familia,lancamento}.ts` e `docs/planos/estrutura-contrato-handoff.md`. **Execução bloqueada até os três existirem** (conferido nesta sessão: ainda não existem).
  - **Date range picker** do invólucro de dashboard: fora da Onda 1 por M-6; aceito pelo Maestro como pendência da Onda 2.
  - **Handoff de invólucros para o Dash (seção 9):** não sai nesta rodada, porque F-6 saiu do recorte. O Dash não deve ser disparado antes dele.
  - **P-8: ENCERRADA** com o fato correto (ver adendo no topo) — não é risco meu.
