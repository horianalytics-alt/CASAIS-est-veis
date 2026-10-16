# Carteira de Investimento — Plano de Implementação

> **Para quem executa:** use `superpowers:subagent-driven-development` — cada
> tarefa abaixo vira uma delegação ao agente dono, em FASE: PLANO depois
> FASE: EXECUÇÃO, conforme a doutrina MAESTRO já estabelecida neste projeto.

**Objetivo:** criar a área "Investimentos" dentro de Carteira — aplicar
dinheiro em caixinhas com taxa de rendimento manual, acompanhar saldo
rendendo mês a mês, projetar com gráfico, resgatar respeitando a regra de
cada caixinha.

**Arquitetura:** uma conta especial `type='investimento'` por família
recebe o valor "aplicado"; uma tabela nova de caixinhas organiza esse saldo
internamente, sem criar conta nova por caixinha. Rendimento mensal via
juros compostos em centavos inteiros, mesma técnica já usada em
`src/lib/simulador.ts`.

**Spec:** `docs/superpowers/specs/2026-10-16-carteira-investimento-design.md`

## Decisões de plataforma já tomadas (com fonte)

- Gráfico de projeção da caixinha: mudança no tempo → linha, eixo único,
  nunca dual-axis. Fonte: `Skill(skill="dataviz")`, mesma decisão já
  aplicada a patrimônio/simulador no `PLANO.md` seção 8.
- Modelo de tenancy (RLS por `family_id`): já estabelecido no projeto,
  fonte `supabase:supabase-postgres-best-practices`, decisão original no
  Passo 3 do plano fundador.
- Toda `VIEW` nova precisa de `security_invoker=true`: fonte
  `supabase:supabase`.

## Global Constraints

- Valores monetários sempre em centavos inteiros, nunca float (regra já
  estabelecida no projeto — P-009 documenta o que acontece quando se
  ignora isso).
- RLS por `family_id`, nunca por usuário individual.
- Server Actions como única porta de escrita sensível — nenhuma chamada
  direta de `supabase.from(...)` do navegador.
- Autorização dupla: filtro explícito por `family_id` na Action + RLS como
  segunda camada, mesmo padrão de todas as Actions já publicadas.
- Linguagem da UI: "Aplicar" / "Resgatar", nunca "Transferir" (decisão de
  produto da spec, seção 6 — evita confundir com transferência entre
  contas).
- Taxa de rendimento é sempre estimativa manual nesta leva — nunca
  integração automática com SELIC/CDI real.

## Review Focus

1. **Caixinha com `resgate_imediato=false` e `data_vencimento` no passado**
   (criada com vencimento já vencido, ou o tempo passou) — deveria liberar
   resgate automaticamente; testar os dois lados da data.
2. **Aplicar mais dinheiro do que a conta de origem tem de saldo** — a
   Action deve recusar, mesma regra que já existe implicitamente em outras
   operações financeiras do projeto (não deixar saldo negativo sem querer).
3. **Resgatar mais saldo do que a caixinha tem** — recusar, nunca deixar
   `balance_cents` negativo.
4. **Taxa com valor absurdo** (ex.: 500% ao mês, ou negativa) — validar
   limites sãos, mesmo padrão de `LIMITES_SIMULACAO` em `simulador.ts`.
5. **Duas pessoas da mesma família mexendo na mesma caixinha ao mesmo
   tempo** (Heitor aplica, Carol resgata, quase simultâneo) — a escrita de
   saldo precisa ser atômica (UPDATE condicional ou transação), não
   ler-depois-escrever que perderia uma das duas operações.

---

## Task 1: Schema — conta de investimento, caixinhas, movimentos

**Files:**
- Create: `app/supabase/migrations/00016_carteira_investimento.sql`
- Test: `app/tests/integration/carteira-investimento.int.test.ts`

**Interfaces:**
- Produces: tabela `investment_boxes` (colunas conforme spec seção 4:
  `id, family_id, account_id, name, rate_type, rate_bps, rate_defined_at,
  resgate_imediato, data_vencimento, balance_cents, created_at,
  updated_at`), tabela `investment_box_movements` (histórico de
  aportes/resgates, para o gráfico de projeção ter pontos reais — decisão
  (a) da spec seção 4), RLS em ambas, índices de apoio.
- Consumes: `accounts` (precisa de uma linha `type='investimento'` por
  família — decidir se é criada automaticamente na primeira "Aplicar" ou
  se já nasce com a família, citando a fonte da decisão).

- [ ] **Step 1: Ler o schema atual de `accounts` e `transactions`**

Confirme as colunas exatas de `accounts` (tipo, saldo inicial) e como
`transactions.type='investimento'` já funciona hoje (é tratado como saída
simples de uma conta, conforme já investigado nesta sessão). Decida: a
"Aplicar" dinheiro na carteira de investimento grava uma `transaction` do
tipo `transferencia` entre a conta de origem e a conta de investimento da
família (reaproveita o mecanismo e o CHECK já existente de
`to_account_id`), ou um tipo novo? Recomendação: reaproveitar
`transferencia` — já é exatamente esse mecanismo (debita uma conta,
credita outra), só que o destino é a conta de investimento. Documente a
decisão no cabeçalho da migration.

- [ ] **Step 2: Escrever a migration**

`investment_boxes` e `investment_box_movements` com RLS (mesma política
de `family_id = get_user_family_id_self()` que todas as outras tabelas
usam), `CHECK (balance_cents >= 0)`, `CHECK (resgate_imediato OR
data_vencimento IS NOT NULL)` (vencimento obrigatório quando não é
resgate imediato — regra 5 da spec), índices por `family_id` e por
`account_id`.

- [ ] **Step 3: Teste de isolamento**

Família B não lê/edita/cria caixinha de família A. Rodar contra o banco
hospedado real, família de teste descartável, limpa no `finally`.

- [ ] **Step 4: Rodar e confirmar**

```
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```
Colar saída real. Regenerar tipos (`npx supabase gen types`).

- [ ] **Step 5: Commit**

```bash
git add app/supabase/migrations/00016_carteira_investimento.sql app/tests/integration/carteira-investimento.int.test.ts app/src/types/database.ts
git commit -m "feat(db): schema da carteira de investimento (caixinhas e movimentos)"
```

---

## Task 2: Server Actions — aplicar, criar caixinha, alocar, resgatar, atualizar taxa

**Files:**
- Create: `app/src/actions/investimentos.ts`
- Create: `app/src/lib/esquemas-investimentos.ts`
- Test: `app/tests/integration/investimentos.int.test.ts`

**Interfaces:**
- Consumes: schema da Task 1, `obterContextoDaFamilia` (mesmo padrão de
  toda Action do projeto), `src/lib/simulador.ts` (reaproveitar
  `simularValorFuturo` para o cálculo mensal de rendimento, em vez de
  reescrever juros compostos).
- Produces (assinaturas exatas, para o Fachada consumir depois):
  ```ts
  aplicarNaCarteira(input: {
    contaOrigemId: string
    valor: number        // reais, > 0, até 2 casas
    caixinhaId?: string  // omitido = vai para saldo não alocado
  }): Promise<ResultadoAction<{ movimentoId: string }>>

  criarCaixinha(input: {
    nome: string          // 1-60 caracteres
    tipoRendimento: string  // enum a definir (pré/pós/liquidez diária)
    taxaMensalBps: number   // 0-10000, mesma faixa de LIMITES_SIMULACAO
    resgateImediato: boolean
    dataVencimento?: string | null  // obrigatória se resgateImediato=false
  }): Promise<ResultadoAction<{ id: string }>>

  alocarParaCaixinha(input: {
    caixinhaId: string
    valor: number  // do saldo não alocado para a caixinha
  }): Promise<ResultadoAction<void>>

  resgatarDaCaixinha(input: {
    caixinhaId: string
    valor: number
    destino: 'nao_alocado' | { contaId: string }
  }): Promise<ResultadoAction<void>>

  atualizarTaxaCaixinha(input: {
    caixinhaId: string
    taxaMensalBps: number
  }): Promise<ResultadoAction<void>>  // grava rate_defined_at = hoje
  ```

- [ ] **Step 1: Escrever os esquemas Zod**

Em `esquemas-investimentos.ts`, mesma convenção de validação de dinheiro
já usada no projeto (positivo, até 2 casas, sem arredondar — nunca repetir
o erro de ponto flutuante do P-009). Validar `dataVencimento` obrigatória
quando `resgateImediato=false` (mesmo padrão do `refine` já usado em
`esquemas-edicao-lancamento.ts` para `rotuloDoFutil`/`ehFutil`).

- [ ] **Step 2: Implementar `criarCaixinha`**

Autoriza a família, valida taxa dentro de limites sãos (reutilizar
`LIMITES_SIMULACAO` de `simulador.ts` se fizer sentido, ou declarar limite
próprio documentado). Grava `rate_defined_at = hoje`.

- [ ] **Step 3: Implementar `aplicarNaCarteira`**

Confirma que a conta de investimento da família existe (cria na primeira
chamada se a decisão da Task 1 for "lazy creation" — documentar). Grava
uma `transaction` tipo `transferencia` da conta de origem para a conta de
investimento (reaproveitando `save_transactions` RPC se couber, ou INSERT
direto com os mesmos campos — decidir e documentar). Se `caixinhaId`
informado, também grava um `investment_box_movements` e atualiza
`balance_cents` da caixinha de forma atômica (UPDATE com incremento, não
ler-depois-escrever — Review Focus item 5).

- [ ] **Step 4: Implementar `alocarParaCaixinha` e `resgatarDaCaixinha`**

Movimento atômico de saldo entre "não alocado" e a caixinha (ou vice-versa
no resgate). `resgatarDaCaixinha` recusa se `resgate_imediato=false` e
`data_vencimento` no futuro (Review Focus item 1) — mensagem de erro clara
("Esta caixinha só pode ser resgatada a partir de dd/mm/aaaa"). Recusa se
`valor > balance_cents` da caixinha (Review Focus item 3).

- [ ] **Step 5: Implementar `atualizarTaxaCaixinha`**

Só atualiza `rate_bps` e `rate_defined_at`, sem mexer em saldo.

- [ ] **Step 6: Testes de integração**

Cobrir os 5 itens do Review Focus. Família de teste descartável, limpa no
`finally` com saída real. Teste de concorrência (duas chamadas quase
simultâneas de aplicar/resgatar na mesma caixinha não perdem uma
atualização — prova que o UPDATE é atômico).

- [ ] **Step 7: Rodar e confirmar**

```
npx tsc --noEmit
npx vitest run tests/integration/investimentos.int.test.ts
```
Colar saída real. Confirmar família real intacta (snapshot antes/depois).

- [ ] **Step 8: Commit**

```bash
git add app/src/actions/investimentos.ts app/src/lib/esquemas-investimentos.ts app/tests/integration/investimentos.int.test.ts
git commit -m "feat(investimentos): Server Actions de aplicar, alocar, resgatar e criar caixinha"
```

---

## Task 3: Cálculo de rendimento mensal

**Files:**
- Modify: `app/src/lib/simulador.ts` (ou criar `app/src/lib/rendimento-caixinha.ts` se o Estrutura preferir separar)
- Test: `app/tests/unit/rendimento-caixinha.test.ts`

**Interfaces:**
- Consumes: `simularValorFuturo`/`EntradaSimulacao` já existentes.
- Produces: uma função que, dado o saldo atual de uma caixinha e sua taxa,
  calcula "quanto já renderia até hoje" desde o último cálculo — decidir
  entre grava mensalmente (cron) ou calcula sob demanda na leitura (sem
  gravar), citando a fonte da decisão (`supabase:supabase` para avaliar
  `pg_cron`, ou justificar o cálculo sob demanda como mais simples para
  esta primeira leva).

- [ ] **Step 1: Decidir a estratégia (sob demanda vs. cron)**

Recomendação: começar com cálculo sob demanda (a view/Action calcula
"rendimento até hoje" na hora de exibir, sem gravar nada) — mais simples,
sem precisar de infraestrutura de cron nesta primeira leva.  Documentar a
decisão e, se o Estrutura escolher diferente, justificar com fonte.

- [ ] **Step 2: Implementar e testar**

Mesma rigidez de centavos inteiros e `BigInt` para a conta exata que já
existe em `simulador.ts` — não reescrever a técnica, reaproveitar.

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/simulador.ts app/tests/unit/rendimento-caixinha.test.ts
git commit -m "feat(investimentos): calculo de rendimento mensal das caixinhas"
```

---

## Task 4: Front — área de Investimentos em Carteira (Fachada)

**Files:**
- Create: `app/src/components/carteira/area-investimentos.tsx` (ou
  estrutura de pastas que o Fachada preferir)
- Create: `app/src/components/carteira/dialogo-criar-caixinha.tsx`
- Create: `app/src/components/carteira/dialogo-aplicar.tsx`
- Create: `app/src/components/carteira/dialogo-resgatar.tsx`
- Modify: `app/src/app/(app)/(principal)/carteira/page.tsx`

**Interfaces:**
- Consumes: as 5 Server Actions da Task 2 (assinaturas exatas acima).

**IMPORTANTE — consistência de UX com o resto do app:** esta tela entra
DEPOIS da leva grande de animações/micro-interações que o Antigravity já
construiu em todo o app (`e8d6b08`..`43296f7`: `useInView`/`ScrollReveal`
com replay, micro-pulso em badges de destaque, count-up em
`ValorMonetario`, haptics calibrados por ação, cápsula na navegação). A
área de Investimentos PRECISA seguir o mesmo padrão, não ficar visualmente
"atrasada" em relação ao resto do app:
- Saldo total e saldo não alocado em `ValorMonetario` com count-up ao
  entrar em foco (`inView`), respeitando Modo Privacidade.
- Cards de caixinha entram em cascata (`ScrollReveal`) como os cards de
  conta em `SaldoDasContas`/`CartaoConta` já fazem.
- Badge de "resgate imediato" ou "disponível em dd/mm" com o mesmo
  tratamento visual de badges existentes (ex. "Fatura atual" com
  micro-pulso, se fizer sentido aqui).
- Haptics nos botões de Aplicar/Resgatar, mesmo padrão calibrado de
  `src/lib/haptics.ts` (toque médio ao confirmar uma ação financeira,
  sucesso ao concluir).
- Considerar o selo de "carimbo" (`animate-carimbo`, já usado em faturas
  pagas) para uma caixinha resgatada, se fizer sentido na UX.

- [ ] **Step 1-N:** (o Fachada detalha os passos na FASE: PLANO dele,
  seguindo este arquivo como governa)

- [ ] **Step final: Commit**

---

## Task 5: Gráfico de projeção por caixinha (Dash)

**Files:**
- Create: `app/src/components/carteira/grafico-projecao-caixinha.tsx`

**Interfaces:**
- Consumes: `projetarValorFuturo` (já existe em `simulador.ts`),
  `GraficoLinha` (componente já publicado pelo Dash para
  patrimônio/simulador — reaproveitar, não recriar).

**Forma já decidida** (seção 5 da spec, dataviz carregado): linha, eixo
único, nunca dual-axis — mesma regra de patrimônio.

- [ ] **Step 1-N:** (o Dash detalha os passos na FASE: PLANO dele)

- [ ] **Step final: Commit**

---

## Quem toca o quê (fronteira de ownership, mesma regra do projeto)

| Agente | Território nesta leva |
|---|---|
| Estrutura | migrations, `src/actions/investimentos.ts`, `src/lib/esquemas-investimentos.ts`, `src/lib/simulador.ts` (ou arquivo novo), `tests/` |
| Dash | `grafico-projecao-caixinha.tsx` |
| Fachada | `area-investimentos.tsx` e os 3 diálogos, modificação de `carteira/page.tsx` |
| Antigravity (depois) | consumir o briefing final e aplicar os mesmos efeitos de scroll/haptics já padronizados no resto do app |

Ordem: Estrutura (Task 1-3) primeiro, sequencial. Dash e Fachada podem
rodar em paralelo DEPOIS do Estrutura entregar (consomem o mesmo schema/
Actions, mas tocam arquivos diferentes — confirmar por escrito antes de
paralelizar, conforme `dispatching-parallel-agents`).

## Self-Review

1. **Cobertura do spec**: as 7 decisões da seção 3 do spec estão todas
   refletidas em alguma task? Sim — modelo em Task 1, linguagem/UX em
   Task 4, taxa manual em Task 2/3, mensal em Task 3, resgate em Task 2,
   fora de escopo (aporte automático, SELIC real) explicitamente não
   incluído em nenhuma task.
2. **Placeholder scan**: nenhum "TBD"/"implementar depois" nas tasks 1-3
   (Estrutura); tasks 4-5 são propositalmente abertas para o
   Fachada/Dash detalharem na própria FASE: PLANO deles, como já é o
   padrão deste projeto (o Maestro não escreve código de produção).
3. **Consistência de tipos**: `caixinhaId: string` usado igual em todas
   as assinaturas da Task 2; `valor: number` sempre em reais (nunca
   centavos) na fronteira das Actions, convertido para centavos
   internamente — mesmo padrão de `atualizarLancamento`.
4. **Review Focus**: os 5 itens têm dono (todos na Task 2, steps 3-4).
