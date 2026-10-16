# Rodada 10 — Achado da verificação (Maestro)

Rodei eu mesmo `tsc --noEmit`, `vitest run` e `next build` sobre os
commits da Rodada 10 — os três passaram limpos, confirma seu relatório.
Também confirmei zero ocorrências de "Transferir" na área de
investimentos.

Mas a inspeção visual (conta de teste descartável, limpa depois, família
real intacta) achou um **bug real de renderização**: a aba Investimentos
abre com o conteúdo permanentemente invisível.

## O defeito

Em `/carteira?aba=investimentos`, com a aba já vindo pré-selecionada:

- O `tabpanel` ativo do Radix TEM área real (`992x1024`, `display: flex`,
  `data-state: active`) — ele não está colapsado.
- Mas o `<ScrollReveal>` que envolve o hero card (e os outros blocos da
  tela) fica preso em `opacity: 0` para sempre. Confirmei via
  `getComputedStyle`: `opacity: "0"`, `transform: "none"`, mesmo com o
  elemento plenamente dentro da viewport (`rect.top: 184`, visível).
- Rolar a página (scroll para baixo e de volta) **não reativa** — o que
  descarta a explicação "só precisa de um evento de scroll para o
  IntersectionObserver recalcular".

## Causa provável (não confirmada por mim — é sua área)

`useInView` (`src/hooks/use-in-view.ts`) anexa o `IntersectionObserver`
no `useEffect`, que roda assim que o elemento monta. Como a aba
"investimentos" já vem ativa na primeira renderização (via
`defaultValue={abaAtiva}` lido da query string), existe uma janela em
que o Radix `TabsContent` ainda pode estar em transição de
`display:none` → `display:flex` quando o observer é anexado — a
primeira entrada reportaria `isIntersecting: false` com área zero, e
como não há novo evento de interseção depois (o elemento não sai/entra
de novo da viewport), ele nunca dispara `setInView(true)`.

Isso é específico de abrir a tela com a aba **já pré-selecionada por URL**
— pode ser que clicar manualmente na aba "Investimentos" a partir de
"Contas & Cartões" funcione normal (o DOM já está estável quando o
usuário clica). Não testei esse segundo caminho — vale você conferir os
dois.

## Onde reproduzir

1. `npm run dev`, logar, `/carteira?aba=investimentos` direto na URL.
2. Esperar a página carregar sem interagir.
3. O hero card, a lista de caixinhas e o slot do gráfico existem no DOM
   (confirmei no snapshot de acessibilidade — todo o conteúdo mockado
   está lá, com os textos certos) mas ficam com opacidade 0 — a tela
   mostra só o cabeçalho "Carteira" e "Caixinhas 3" vazios.

## O que pedir para você investigar

- Se o `useInView`/`ScrollReveal` precisa de uma re-checagem manual do
  observer depois que o pai estabiliza layout (ex. invalidar e reobservar
  quando `TabsContent` muda de `data-state`), ou
- Se faz mais sentido, só nesta tela, não usar `ScrollReveal` no bloco
  que já nasce visível na carga inicial (hero card acima da dobra não
  precisa de scroll-reveal — ele já está na tela no primeiro paint;
  scroll-reveal faz mais sentido nos cards de caixinha mais abaixo, que
  o usuário de fato rola até ver).
- Teste de regressão: carregar `/carteira?aba=investimentos` direto
  (sem clicar na aba) e confirmar visualmente (screenshot, não só
  snapshot de acessibilidade) que o conteúdo aparece sem precisar rolar
  ou interagir.

## O que NÃO achei de errado

- `tsc`, `vitest` (522/522) e `next build` limpos — confirmado por mim.
- Nenhuma ocorrência de "Transferir".
- O conteúdo mockado (hero, 3 caixinhas, gráfico-slot) está correto e
  completo no DOM — é só a visibilidade que falha.

Me avise quando corrigir — reabro a verificação visual antes de aceitar
a entrega.
