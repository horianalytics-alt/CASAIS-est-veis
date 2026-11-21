# Briefing Rodada 12 — Ligar a Carteira de Investimento aos dados reais (Antigravity)

> Data: 2026-11-20. Autor: Maestro. Dono do produto: Heitor.
> Marcação: **VERIFICADO** = conferi no código/commit nesta data. **A PROVAR** = não conferi; confirme
> no código antes de agir e me corrija se estiver errado.

## 0. Estado de partida (leia antes de mexer)

- A rodada 11 foi entregue: A2/A4/A7/A8 corrigidos. A aba "Investimentos" está escondida por
  `EXIBIR_ABA_INVESTIMENTOS = process.env.NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true'`
  em `app/src/app/(app)/(principal)/carteira/page.tsx` (**VERIFICADO**, commit `92c0107`).
  Se essa variável está ligada na Vercel de produção: **A PROVAR** (não conferi). Não ligue.
- O banco já tem tudo: migrations 00016, 00017 e **00018 aplicadas** (a 00018 corrigiu o cálculo
  do rendimento). As 6 Server Actions existem em `app/src/actions/investimentos.ts`:
  `aplicarNaCarteira`, `criarCaixinha`, `alocarParaCaixinha`, `resgatarDaCaixinha`,
  `atualizarTaxaCaixinha`, `confirmarRendimentoMensal` (**VERIFICADO**, grep dos `export`).
  Os formatos de entrada são os tipos `Entrada*` de `app/src/lib/esquemas-investimentos.ts`
  (leia esse arquivo, não copie daqui).
- `area-investimentos.tsx` ainda usa `MOCK_CARTEIRA_INVESTIMENTO` (linhas 38 e 62, **VERIFICADO**)
  e `carteira/page.tsx` não lê nada da carteira. Procurei `from '@/actions/investimentos'` em
  `app/src` e não achei nenhum import, então os diálogos ainda não chamam as Actions reais (**VERIFICADO** por grep).
- O Dash entregou o gráfico de projeção, **já commitado e ainda não ligado** (`d0ba90e`):
  `app/src/components/carteira/grafico-projecao-caixinha.tsx` + `projecao-caixinha-logica.ts` +
  `app/src/lib/queries/carteira-projecao.ts`.

## 1. REGRA DE SEGURANÇA DESTA RODADA (inegociável)

**Só existe banco de PRODUÇÃO.** Rodar o app local com `.env.local` aponta para ele. Portanto:

1. **Nenhuma Action de escrita** (`aplicar`, `criar`, `alocar`, `resgatar`, `atualizar taxa`, `confirmar`)
   pode ser disparada contra o banco real pelo navegador durante o seu teste. Aplicar/criar caixinha
   na família real do Heitor e da Carol cria dinheiro de verdade no app deles.
2. A prova das ações é por **teste de unidade com a Action mockada** (vitest), cobrindo `ok: true`,
   `ok: false` e a forma do erro. A prova visual é com **dados de fixture** (um modo de fixture só
   em desenvolvimento, que nunca vai para produção, ou testes de componente).
3. O que pode rodar contra o banco real: **somente leitura**. Com a carteira ainda vazia na
   produção, o esperado é ver o estado vazio da aba.
4. Se precisar de dado real para uma prova, **pare e me peça**: eu aciono o Semeador para criar
   uma família descartável.
5. Não ligue `NEXT_PUBLIC_FEATURE_INVESTIMENTOS` em produção. Quem liga é o Heitor, **depois** do
   Sentinela aprovar. Localmente, use a variável só no seu ambiente.

## 2. O que fazer (por prioridade)

### 2.1 Trocar mock por dado real (F-1)
- `carteira/page.tsx` lê, pela sessão do usuário (cliente do servidor, nunca `service_role`):
  `v_carteira_resumo` (colunas `total_cents`, `alocado_cents`, `nao_alocado_cents`, **VERIFICADO** na 00016)
  e `investment_boxes` (as caixinhas). O formato exato das colunas está em `app/src/types/database.ts`;
  mapeie para `CarteiraInvestimentoResumo` / `CaixinhaInvestimento` de `tipos-investimentos.ts`
  e **me avise** se os nomes divergirem (**A PROVAR**).
- `AreaInvestimentos` recebe `dadosIniciais` e **não** cai mais no mock em produção. O mock
  fica só para testes e fixture de desenvolvimento.
- Ligue os 4 diálogos (aplicar, criar caixinha, alocar, resgatar) às Actions. Padrão de
  erro do app: `if (!r.ok) throw new Error(r.erro)` (a Action **devolve** `{ ok:false, erro }`, não lança).
  Mostre erros de campo usando `camposComErro` quando vier.
- Depois de cada sucesso: `router.refresh()`.
- Cuidado já apontado pelo Sentinela (A7): o efeito em `area-investimentos.tsx` ~linhas 89–96
  que reaplica `dadosIniciais` pode descartar estado local ao trocar a caixinha da projeção;
  garanta que não descarta o que o usuário digitou (**A PROVAR**).

### 2.2 Ligar o gráfico de projeção (Dash → você)
Use `GraficoProjecaoCaixinha` no slot `#container-grafico-projecao-caixinha` (~linhas 478–497 de
`area-investimentos.tsx`). Props (do relatório do Dash):
- `caixinha`: `{ id, name, rate_bps, rate_defined_at ('YYYY-MM-DD'), balance_cents, created_at }` da caixinha **real** selecionada.
- `movimentos`, `pendentes`: vêm de `lerDadosProjecaoCarteira(supabase, familyId)` em
  `app/src/lib/queries/carteira-projecao.ts` (`import 'server-only'`). **Chame uma vez** no
  `Promise.all` de `page.tsx` com o cliente da sessão. Nunca importe esse arquivo num componente client.
- `erro?: boolean` = `!dados.ok` (com `ok:false`, passe `movimentos=[]` e `pendentes=[]`).
- `mesAtual` = `hojeEmSaoPaulo().slice(0, 7)` calculado no **servidor** (`src/lib/hoje.ts`); nunca `new Date()` no navegador.
- `atualizadoEm` = `'dd/mm/aaaa hh:mm'` em horário de Brasília, calculado no servidor (mesma
  convenção de `/analises`; o helper exato: **A PROVAR**).
- `aoTentarNovamente` = `router.refresh()`, criado dentro do componente client.
- `mesesProjecao`: omita (padrão 12).
- `key={caixinha.id}` no slot para remontar limpo ao trocar de caixinha.

### 2.3 Tiles e loading (F-2, F-3, F-4)
- Tile "Projeção em 12 meses" (~`area-investimentos.tsx:470`): troque `Math.pow` em float por
  `valorProjetadoCentavos(balance_cents, rate_bps, 12)` de `projecao-caixinha-logica.ts`, para
  bater exatamente com o fim do gráfico.
- Tiles "Saldo atual" (~`:452`) e "Projeção" (~`:470`): usam `formatBRL` sem máscara e **vazam o valor
  no Modo Privacidade**, ao lado de um gráfico mascarado. Use `ValorMonetario` (ou `formatBRL(v, oculto)`).
- `carteira/loading.tsx`: inclua `GraficoProjecaoCaixinhaSkeleton` (sem props, altura fixa de 480px).

### 2.4 Fluxo "Confirmar rendimento" (F-5)
Rendimento só vira saldo depois de o casal confirmar (decisão do Heitor, spec §4b em
`docs/superpowers/specs/2026-10-16-carteira-investimento-design.md`). A Action é
`confirmarRendimentoMensal({ caixinhaId, competencia })`. Leia a spec e o plano
(`docs/superpowers/plans/2026-10-16-carteira-investimento.md`) para ver o que o fluxo de tela precisa
ter. **Se a spec for ambígua sobre a tela (onde fica o botão, o que o texto diz), PARE e pergunte ao
Heitor pelo Maestro; não decida sozinho.** Regra de cálculo atual (00018): o mês M rende sobre o
saldo no **fim** de M; um mês só pode ser confirmado depois de encerrado. Não reexplique isso ao usuário
com texto que contradiga isso.

### 2.5 Achados do Sentinela que são seus
- **A3:** a conta-carteira (`type === 'investimento'`) e contas não-corrente aparecem em seletores onde o
  banco recusa. Em `lancar/page.tsx` (~linhas 38–42) e em `carteira/page.tsx` (`contasOrigem`, ~linhas 71–77):
  - tire a conta-carteira dos seletores comuns;
  - em **Aplicar** e **Resgatar**, ofereça só contas `corrente`.
- **Botão Arquivar** na conta-carteira (`cartao-conta.tsx` / `botao-arquivar-conta.tsx`): esconda quando
  `type === 'investimento'`. Arquivar essa conta agora é recusado no banco (a 00018) e o usuário veria
  "Você não tem permissão para fazer isso.".
- **Q1 (Sentinela, BAIXO):** `dialogo-criar-caixinha.tsx:24` importa `hojeEmSaoPaulo` e não usa (**VERIFICADO**): remova.
  O banner de `area-investimentos.tsx:252` cita "Rodada 12", termo interno que a família leria. Com dado real o banner de
  "dados simulados" some; se sobrar texto de transição, sem jargão interno.
- **Gate:** a aba só pode ser ligada em produção depois de o Sentinela re-auditar esta rodada (A3 é o item MÉDIO que bloqueia).

## 3. O que NÃO fazer

- Não toque `src/actions/`, migrations, `src/lib/supabase/`, `src/lib/simulador.ts`, `src/lib/esquemas-investimentos.ts`.
- Não altere `projecao-caixinha-logica.ts`, `grafico-projecao-caixinha.tsx` nem `grafico-linha.tsx`
  (são do Dash). Se precisar de mudança neles, descreva o pedido.
- Não mexa na recorrência de assinaturas: é a rodada 13, ainda em plano.
- Não ligue a flag em produção e não use dados da família real para testar escrita.

## 4. Verificação esperada (prova por arquivo)

- `npx tsc --noEmit` limpo, `npx vitest run` sem regressão (hoje: 625 passados, 190 pulados), `next build` ok.
- Dev server: `cd app && npm run dev` (porta 3000), com fixture. Se a porta estiver ocupada, avise.
- Screenshots com caminho **absoluto** em 375px, 768px e 1440px, mais um em dark e um em Modo Privacidade
  (nenhum `R$ <número>` visível), nos estados: vazio, com caixinhas, com pendentes, erro de leitura.
- Saída do console do navegador sem erro.
- Teste de unidade de cada diálogo com a Action mockada: `ok:true`, `ok:false` (erro geral e de campo).
- Teste: trocar a conta de origem no diálogo Aplicar mantém valor e destino (regressão da A4).
- Commit por arquivo; `git pull --rebase origin main` antes do push. **Pode subir**: com a flag desligada
  a aba continua escondida em produção.

## 5. Ao terminar

Devolva: lista do que mudou, o que foi e o que **não** foi verificado (com motivo), e o que ficou como
pendência. Se algo contradisser este briefing, escreva a contradição em vez de contornar.

Fonte: `docs/planos/dash-grafico-projecao-caixinha.md` §9 (F-1..F-5), `docs/auditoria/carteira-investimento-sentinela.md`
(A3, A5, A7), relatório de execução do Estrutura (00018) de 2026-11-20.
