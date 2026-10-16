# Briefing Rodada 10 — Área de Investimentos (Carteira)

Nova feature arquitetural: a Carteira de Investimento. O back-end
(Estrutura) e o gráfico (Dash) estão sendo construídos em paralelo nesta
mesma rodada — este briefing cobre o que sobra para você: a tela, os
diálogos e, especialmente, fazer essa área nova **parecer que sempre
esteve no app**, no mesmo nível de polimento das rodadas 7-9.

Plano de referência completo (schema, Server Actions, decisões de
produto): `docs/superpowers/plans/2026-10-16-carteira-investimento.md`.
Spec de design (por que cada decisão foi tomada):
`docs/superpowers/specs/2026-10-16-carteira-investimento-design.md`.

**Não comece a construir ainda** — este briefing fecha a UI que vai
consumir dados reais do Estrutura. Vou te mandar o contrato final das
Server Actions (assinaturas exatas) e o nome do componente de gráfico do
Dash assim que os dois publicarem. Use este documento para já desenhar os
componentes e a navegação enquanto isso termina.

## 1. O que a tela faz (visão do usuário)

Dentro de `/carteira`, uma nova aba/seção "Investimentos":

- Mostra o saldo total da carteira de investimento e o saldo "não
  alocado" (o que foi aplicado mas ainda não foi para nenhuma caixinha).
- Lista as caixinhas da família: nome, tipo de rendimento, taxa (com
  aviso de que é estimativa, desde quando foi definida), saldo atual,
  badge de resgate imediato ou "disponível em dd/mm/aaaa".
- Botão **"Aplicar"**: formulário que debita uma conta normal (Conta
  Corrente, etc.) e credita o saldo não alocado da carteira de
  investimento — ou direto numa caixinha existente, se o usuário escolher.
- Botão **"Criar caixinha"**: nome livre, tipo de rendimento, taxa
  mensal, resgate imediato (sim/não) + data de vencimento se não.
- Botão **"Alocar"** dentro de cada caixinha: move saldo não alocado para
  ela.
- Botão **"Resgatar"**: move saldo de volta — para não alocado ou direto
  para uma conta normal. Bloqueado com mensagem clara se a caixinha não
  é de resgate imediato e a data de vencimento ainda não chegou.
- Gráfico de projeção por caixinha (componente do Dash, nome exato a
  confirmar — vai ser algo como `GraficoProjecaoCaixinha`, reaproveitando
  o mesmo `GraficoLinha` que você já viu em `/analises`).

**Linguagem obrigatória:** sempre "Aplicar" / "Resgatar", nunca
"Transferir" — é uma decisão de produto para não confundir com
transferência entre contas normais (seção 6 da spec).

## 2. Efeitos e microinterações — OBRIGATÓRIO, mesmo padrão do resto do app

Esta é a parte que o Heitor pediu que eu deixasse explícita antes de
qualquer código: a área de Investimentos **não pode parecer uma tela
antiga** comparada ao que você já construiu nas rodadas anteriores.
Replique, sem reinventar, os mesmos padrões:

- **Valores monetários com count-up**: saldo total, saldo não alocado e
  saldo de cada caixinha usam o mesmo componente `ValorMonetario` que já
  existe no app (count-up via `requestAnimationFrame` ao entrar em foco).
  **Obrigatório respeitar a guarda do Modo Privacidade** — o mesmo
  `!deveAnimar || oculto` que você já aplica em `/inicio` e `/carteira`
  hoje. Não crie um componente de valor novo para esta tela.
- **Cards de caixinha entram em cascata ao rolar**: mesmo
  `ScrollReveal`/`useInView` com replay que você já usa em
  `SaldoDasContas`/`CartaoConta` — cada card da lista de caixinhas anima
  a entrada, e volta a animar se o usuário rolar pra fora e pra dentro de
  novo (replay ao voltar, não anima só uma vez na vida da página).
- **Badges de destaque**: o badge de "resgate imediato" ou "disponível
  em dd/mm" segue o mesmo tratamento visual que você já deu a badges como
  "Fatura atual" — use `animate-micro-pulso` (2.8s) se fizer sentido
  chamar atenção (ex.: caixinha que acabou de ficar disponível para
  resgate).
- **Haptics**: todo botão que confirma uma ação financeira (Aplicar,
  Alocar, Resgatar, Criar caixinha) chama o mesmo `src/lib/haptics.ts`
  calibrado que você já usa no resto do app — toque médio ao confirmar,
  vibração de sucesso ao concluir. Não invente uma vibração nova.
- **Selo de concluído**: se fizer sentido na UX de um resgate concluído
  (ex. um "carimbo" visual tipo recibo), reaproveite `animate-carimbo`,
  já usado em faturas pagas — avalie se cabe, não é obrigatório como os
  itens acima.
- **Dark mode e os 3 breakpoints**: mesma exigência de sempre. Se algum
  desses efeitos (count-up, cascata, micro-pulso) não existir ainda como
  componente reutilizável isolado quando você for usá-lo, **não
  reimplemente do zero** — importe o componente/hook já publicado. Se
  genuinamente não achar onde ele vive, me avise antes de recriar.

Resumo da régua: feche os olhos, abra `/inicio` e depois a nova tela de
Investimentos — não deve dar pra adivinhar qual foi construída primeiro.

## 3. O que falta confirmar antes de você codificar a parte de dados

Isto ainda está em construção pelo Estrutura e pelo Dash. Vou te avisar
quando publicarem:

- Assinaturas exatas de `aplicarNaCarteira`, `criarCaixinha`,
  `alocarParaCaixinha`, `resgatarDaCaixinha`, `atualizarTaxaCaixinha`
  (`src/actions/investimentos.ts`).
- Nome e props do componente de gráfico do Dash.
- Se a conta de investimento da família é criada automaticamente na
  primeira "Aplicar" ou já existe de antemão (muda se o botão "Aplicar"
  pode aparecer sempre ou só depois de uma primeira configuração).

Pode adiantar: estrutura de pastas dos componentes
(`src/components/carteira/area-investimentos.tsx` +
`dialogo-criar-caixinha.tsx` + `dialogo-aplicar.tsx` +
`dialogo-resgatar.tsx`), layout visual, estados de loading/vazio/erro, e
os efeitos da seção 2 com dados mockados.

## 4. O que NÃO fazer

- Não toque em `src/actions/`, migrations, `src/lib/supabase/`,
  `src/lib/simulador.ts` — é território do Estrutura.
- Não construa o gráfico em si (eixo, escala, série, tooltip) — isso é
  do Dash. Você só monta o card/invólucro em volta do componente que ele
  publicar.
- Não escreva "Transferir" em nenhum texto desta tela.

## Verificação esperada

- `npx tsc --noEmit` limpo, `next build` ok.
- Screenshots nos 3 breakpoints (375/768/1440) + dark mode.
- Console limpo (`browser_console_messages`).
- Teste manual com dados mockados: aplicar, criar caixinha, alocar,
  resgatar (incluindo o caso bloqueado de resgate antes do vencimento).
- Commit por arquivo, `git pull --rebase origin main` antes do push.

Fonte: `docs/superpowers/plans/2026-10-16-carteira-investimento.md`
(Task 4) e `docs/superpowers/specs/2026-10-16-carteira-investimento-design.md`.
