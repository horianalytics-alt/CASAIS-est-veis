# Briefing Rodada 8 — Sensação de velocidade, animações, filtros e som

## Contexto importante: a investigação de performance

Você (Antigravity) sugeriu um prompt de back-end achando que havia lentidão
de servidor para corrigir. Investiguei com medição real antes de aprovar
qualquer mudança:

- **As 7 consultas de `/inicio` já rodam em paralelo** (`Promise.all` em
  `app/src/app/(app)/(principal)/inicio/page.tsx:67`) — não precisa mexer.
- **O push já usa `after()`** para não atrasar a resposta de
  `salvarLancamento` (comentário explícito no código,
  `app/src/actions/lancamento.ts:254`) — não precisa mexer.
- Medi a latência real: uma rota 100% estática (sem banco nenhum) já leva
  190-336ms de TTFB só de rede até a Vercel (região `gru1`, São Paulo — já
  está na região certa). O ~1s que o Heitor sente é a soma normal de
  rede + consulta ao banco + renderização, não um bug.

**Conclusão: não há otimização de servidor real a fazer aqui.** O prompt
de back-end que você rascunhou NÃO foi repassado ao Estrutura — a análise
dele estava desatualizada em relação ao código atual. O que resolve a
*sensação* de lentidão é UX, que é o que esta rodada cobre.

## O que construir (tudo front-end, aprovado pelo Heitor)

### 1. Barra de progresso de navegação (topo)

Ao clicar em qualquer link (menu, trocar de mês, etc.), uma barra fina no
topo dispara imediatamente, antes da resposta do servidor chegar. Padrão
GitHub/YouTube (`nprogress` ou implementação própria com
`useLinkStatus`/eventos de navegação do Next 16 — use o que for mais
simples de manter, documente a escolha).

### 2. Feedback tátil em botões (micro-interação)

`active:scale-[0.98]` ou equivalente em botões clicáveis do app inteiro —
efeito sutil de compressão ao toque, com retorno rápido.

### 3. Entrada suave de elementos (stagger fade-in)

Cards de resumo e itens de lista de transações entram com fade + leve
elevação (`+4px` → posição normal) em vez de aparecer bruscamente.
Mantenha sutil — a doutrina de design do projeto é minimalista, não
"flashy".

### 4. Números subindo (count-up)

Nos cards de saldo/receita/despesa em `/inicio`, faturas em `/carteira`,
totais em `/analises`: ao abrir a página ou trocar de mês, o valor sobe de
R$0,00 até o total real (~600ms, ease-out).

**Regra obrigatória:** se o Modo Privacidade estiver ligado
(`useOcultarValores()`), o count-up NÃO roda — mantém `••••••` direto, sem
nenhuma transição que exponha o valor real brevemente.

### 5. Animação nos gráficos de Análises

Barras de categoria/orçamento crescem de 0% até o valor real ao carregar
ou trocar de mês. **Atenção:** `grafico-orcamento.tsx`,
`grafico-patrimonio.tsx`, `grafico-linha.tsx` e os arquivos `*-logica.ts`
em `src/components/analises/` foram publicados pelo Dash seguindo
especificação do `dataviz` (mark specs, cores, formas) — se for animar,
anime só a entrada/transição, não altere a lógica de escala, cor ou forma
desses componentes sem necessidade.

### 6. Som de sucesso ao lançar (ajuste de timing)

O som via WebAudio já existe (`tocarSomSucesso()` em
`src/features/sons/sons.ts`), mas o `router.replace()` corta o áudio antes
de tocar. Ajuste para o som tocar por completo antes/durante o redirect
(ex.: `await` no som antes do replace, ou tocar e não esperar, dependendo
de como o WebAudio está implementado — investigue a causa exata antes de
corrigir).

### 7. Som + aviso quando o parceiro lança algo (app aberto)

Em `src/components/inicio/ouvinte-realtime.tsx`: quando chegar um evento
Realtime de novo lançamento do parceiro, além de atualizar a tela, toque
`tocarSomSucesso()` e mostre um toast curto: "Carol acabou de lançar:
[descrição] (R$ [valor])" — **respeitando o Modo Privacidade** (se
estiver ligado, não mostre o valor no toast).

### 8. Som/vibração na notificação push (app fechado) — pequeno ajuste no Service Worker

**Este item é o único de infraestrutura que você pode mexer sozinho, sem
Server Action nova.** Em `public/sw.js`, no handler de `push` (linha ~87),
o `showNotification` hoje não configura vibração nem re-notificação:

```js
// hoje:
self.registration.showNotification(dados.titulo ?? 'Finanças a Dois', {
  body: dados.corpo ?? '',
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  data: { url: dados.url ?? '/inicio' },
})

// adicionar:
self.registration.showNotification(dados.titulo ?? 'Finanças a Dois', {
  body: dados.corpo ?? '',
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  data: { url: dados.url ?? '/inicio' },
  vibrate: [200, 100, 200],
  silent: false,
  tag: 'financas-a-dois',
  renotify: true,
})
```

Teste em dispositivo real (Android — iOS tem suporte mais limitado a
`vibrate` em push) se a vibração realmente dispara.

## Filtros novos em `/inicio` (lista de lançamentos)

Hoje já existem filtros por membro e tipo (pílulas). Adicionar:

- **Filtro por categoria**: seletor com as categorias presentes nos
  lançamentos do mês já carregado (filtrar em memória, no client — os
  dados do mês já estão na página, não precisa nova consulta ao servidor).
- **Ordenação**: por data (mais recente/mais antigo primeiro — padrão
  atual já é mais recente primeiro) e por valor (maior/menor primeiro).
- **Busca rápida**: campo de texto que filtra por descrição (contém) ou
  por valor exato digitado — tudo em memória, client-side, sem round-trip
  ao servidor.

Todos esses filtros operam sobre os dados que a página já buscou (mesmo
padrão dos filtros de membro/tipo que já existem) — não criam Server
Action nem consulta nova.

## O que NÃO fazer nesta rodada

- Não mexa em `src/actions/`, migrations, `src/lib/supabase/` — não há
  trabalho de back-end aprovado nesta rodada (ver investigação acima).
- Não altere a lógica/escala/cor dos componentes de gráfico do Dash
  (`src/components/analises/grafico-*.tsx`, `*-logica.ts`) — só anime a
  entrada se fizer sentido.
- Não anime nem faça count-up em valores quando o Modo Privacidade estiver
  ligado — regra de produto, não opcional.

## Verificação esperada

- `npx tsc --noEmit` limpo, `next build` ok.
- Teste manual: Modo Privacidade ligado não deve nunca expor valor real
  durante uma animação, nem no toast do parceiro.
- Teste de vibração/som do push em dispositivo Android real.
- Screenshots nos 3 breakpoints + dark + console limpo.
- Commit por arquivo, `git pull --rebase origin main` antes do push.
