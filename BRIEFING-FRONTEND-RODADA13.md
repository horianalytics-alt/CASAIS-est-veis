# Briefing Rodada 13 — Recorrência: formulário, pop-up e lista "Assinaturas e fixos" (Antigravity)

> Data: 2026-11-21. Autor: Maestro. Dono do produto: Heitor.
> Marcação: **VERIFICADO** = conferi no código/commit nesta data. **A PROVAR** = não conferi; confirme no código antes de agir.

---

## 0. Estado de partida

- Commit `cbf7793` está em `origin/main` e na Vercel. Tsc limpo. 648 testes passando.
- **Back-end aplicado em produção:** migrations 00019 (tabela `recurring_rules`, colunas novas em `transactions`, RPCs) e 00020 (`v_account_balances` só conta pendente do mês atual). Nada disto muda nesta rodada.
- **Actions que você vai usar** (`app/src/actions/recorrencia.ts`, **VERIFICADO**):
  - `criarRecorrencia(input: EntradaCriarRecorrencia)` → `ResultadoAction<{ regraId: string; lancamentosGerados: number }>`
  - `carregarCobrancasPendentes()` → `ResultadoAction<CobrancaPendente[]>` (renova o horizonte de 12 meses)
  - `responderCobranca(input: EntradaResponderCobranca)` → `ResultadoAction<{ estado: 'pago' | 'adiado' | 'ja_respondida' }>`
  - `alterarValorRecorrencia(input: EntradaAlterarValorRecorrencia)` → `ResultadoAction<{ atualizados: number }>`
  - `encerrarRecorrencia(input: EntradaEncerrarRecorrencia)` → `ResultadoAction<{ removidos: number }>`
- **Query de leitura** (server-only): `listarRecorrencias(supabase, familyId, mesAtual)` em `app/src/lib/queries/recorrencias.ts` → `ListaDeRecorrencias`.
- **Tipos de entrada** exportados de `app/src/lib/esquemas-recorrencia.ts` (**VERIFICADO**):
  - `EntradaCriarRecorrencia` — mesmos campos do formulário de lançar, sem `parcelas`, sem `contaDestinoId`; o campo `data` é a data do primeiro vencimento.
  - `EntradaResponderCobranca` — `{ lancamentoId, resposta: 'pago' | 'ainda_nao', dataPagamento? }`.
  - `EntradaAlterarValorRecorrencia` — `{ regraId, valor, aPartirDe: 'YYYY-MM' }`.
  - `EntradaEncerrarRecorrencia` — `{ regraId, ultimoMes: 'YYYY-MM' }`.
- **Tipo do item de fila**: `CobrancaPendente` exportado de `app/src/actions/recorrencia.ts`:
  ```ts
  { id: string; regraId: string; tipo: 'receita' | 'despesa'; descricao: string;
    valor: number; data: string; contaId: string; competencia: string }
  ```
- **Formulário de lançar** (`app/src/app/(app)/(principal)/lancar/page.tsx`):
  A conta `investimento` já foi filtrada neste commit (**VERIFICADO**).
- **Conta cartão** (`form-lancamento.tsx`): a pendência P-016 ainda existe — `estaPago: true` como padrão em cartão. Corrija nesta rodada (veja §2.5).
- **`hojeEmSaoPaulo()`** em `app/src/lib/hoje.ts` (**VERIFICADO** — uso obrigatório no servidor; nunca `new Date()` no cliente).

---

## 1. REGRA DE SEGURANÇA DESTA RODADA (inegociável)

**Só existe banco de PRODUÇÃO.** Com `.env.local` apontado, toda Action de escrita vai para a família real do Heitor e da Carol.

1. Não chame `criarRecorrencia`, `responderCobranca`, `alterarValorRecorrencia`, `encerrarRecorrencia` pelo browser durante testes. Prove via **teste de unidade com a Action mockada** (Vitest).
2. `carregarCobrancasPendentes()` é só leitura — pode chamar. Com a carteira ainda vazia de assinaturas, o esperado é fila vazia.
3. Se precisar de dado real para prova visual, **pare e me peça**: aciono o Semeador.
4. **Autorizado**: aplicar as migrations está feito (não repita). Commits e push estão autorizados.

---

## 2. O que fazer (por prioridade)

### 2.1 Formulário de lançar — interruptor "Repetir todo mês" (F-1)

No formulário de lançar (`form-lancamento.tsx`), adicione um interruptor "Repetir todo mês":

- Só aparece quando `tipo === 'receita' || tipo === 'despesa'` (nunca em transferência).
- **Mutuamente exclusivo** com o campo "Parcelas": quando "Repetir todo mês" está ligado, esconda/desabilite "Parcelas"; quando "Parcelas" > 1, esconda/desabilite "Repetir todo mês".
- Quando ligado, o formulário chama `criarRecorrencia(input)` em vez de `salvarLancamento(input)`. Os campos são os mesmos — só muda a action chamada.
- Padrão do campo `data`: o dia do vencimento = a data escolhida no formulário (já vem preenchido).
- Se `conta.tipo === 'cartao'`:
  - `estaPago` deve ser `false` obrigatoriamente (nunca oferecer "já está pago" — P-016 fica resolvida aqui).
  - O campo "Já está pago" fica oculto quando a conta selecionada é cartão, independente da recorrência. Isso resolve o P-016 definitivamente.
- Ao `sucesso`: `router.refresh()` + toast de confirmação com o número de lançamentos gerados (ex: "Recorrência criada! 12 meses agendados").
- Ao `falha`: exibir `erro` em destaque e mapear `camposComErro` para `<CampoErro>` nos campos correspondentes.

### 2.2 Pop-up de cobrança — fila bloqueante (F-2)

O pop-up é um **diálogo em tela cheia** que bloqueia o app enquanto houver itens na fila. Comportamento:

- Chame `carregarCobrancasPendentes()` ao montar o layout principal (`app/src/app/(app)/(principal)/layout.tsx` ou equivalente — **A PROVAR** onde fica o layout compartilhado). **Nunca no lado cliente via useEffect sem `server component` intermediário.** A forma certa: Server Component chama a action e passa `cobrancasPendentes` como prop inicial; o Client Component mantém a fila em state local.
- Mostra **uma cobrança por vez** (a primeira da fila). Enquanto houver pendente, o diálogo não fecha.
- **Layout do diálogo** (despesa):
  - Título: "Já pagou?" + nome da assinatura.
  - Valor formatado em BRL + mês de competência (ex: "Netflix — novembro/2026").
  - Dois botões: **"Sim, paguei"** e **"Ainda não"**.
  - Quando "Sim, paguei": mostra campo de data (`<input type="date">`), com valor padrão = `cobranca.data` (dia do vencimento). Depois confirma chamando `responderCobranca({ lancamentoId: cobranca.id, resposta: 'pago', dataPagamento })`.
  - Quando "Ainda não": chama `responderCobranca({ lancamentoId: cobranca.id, resposta: 'ainda_nao' })`.
  - Para receita: "Já recebeu?" em vez de "Já pagou?"; "Sim, recebi" em vez de "Sim, paguei".
- Após qualquer resposta (incluindo `estado === 'ja_respondida'`): remove o item da fila local e mostra o próximo. Se fila vazia, fecha.
- **Realtime**: quando o outro membro responder, o pop-up deve fechar no dispositivo do parceiro. Use o canal Realtime da família que já existe (tabela `transactions` já está na publicação, **VERIFICADO** migration 00005). Escute INSERT/UPDATE em `transactions` com `recurring_rule_id IS NOT NULL AND is_paid = true` para saber que uma cobrança foi respondida — ao receber o evento, recarregue a fila (`carregarCobrancasPendentes()` via `router.refresh()`).
- **Aviso sonoro/toast no parceiro**: quando a fila tiver 12+ itens de uma vez (assinatura nova com datas passadas), mostre um toast "X cobranças em fila" antes de abrir o pop-up, para não assustar.

### 2.3 Lista "Assinaturas e fixos" (F-3)

Crie uma nova página ou seção acessível a partir de **Ajustes** (sugestão: `app/src/app/(app)/(principal)/ajustes/assinaturas/page.tsx`):

- Chame `listarRecorrencias(supabase, familyId, hojeEmSaoPaulo().slice(0,7))` no Server Component.
- Separa em duas listas: **Ativas** e **Encerradas** (colapsável).
- Cada item mostra: descrição, valor em BRL, dia do vencimento, conta.
- **Editar valor**: botão "Editar valor" abre diálogo com campo de valor e seletor de mês "a partir de". Chama `alterarValorRecorrencia`. Padrão do mês: mês atual. Dica de texto: "Altera o valor deste mês em diante. Para mudar só este mês, edite o lançamento pelo extrato."
- **Encerrar**: botão "Encerrar assinatura" abre diálogo de confirmação com seletor de mês "último mês". Chama `encerrarRecorrencia`. Padrão: mês atual. Avisa: "Os lançamentos futuros serão removidos. O histórico fica."
- **Aviso de conta arquivada**: se a conta da assinatura estiver arquivada (`archived_at != null`), mostre um aviso visual (ex: badge "Conta arquivada — assinatura pausada").
- Esconda a opção "Transferência" no seletor de tipo ao editar uma recorrência (recorrência nunca é transferência).
- Após sucesso em qualquer operação: `router.refresh()`.

### 2.4 Editar mês isolado via extrato (F-4)

Nenhuma mudança necessária no back-end: `atualizarLancamento` (action existente) já funciona para "editar só este mês". A única mudança no front:

- No diálogo de editar lançamento (`dialogo-editar-lancamento.tsx`), quando `transacao.recurring_rule_id != null`, adicione uma nota de texto: "Este lançamento faz parte de uma assinatura. Editá-lo altera só este mês."
- Não implemente nada além disso aqui — o escopo de "editar só este mês" é reutilizar o existente.

### 2.5 Corrigir P-016 — `estaPago` padrão em conta cartão (F-5)

Em `form-lancamento.tsx` linhas ~112/128: o padrão `estaPago: true` não deve ser oferecido quando a conta selecionada é do tipo `cartao`. Corrija:

- Quando `contaSelecionada?.tipo === 'cartao'`, force `estaPago = false` e oculte o campo "Já está pago" (não ofereça a opção).
- Isso se aplica tanto no formulário normal quanto quando "Repetir todo mês" está ligado.
- Feito isso, remova P-016 de `PENDENCIAS.md`.

---

## 3. O que NÃO fazer

- Não toque `app/src/actions/`, `app/supabase/migrations/`, `app/src/lib/supabase/`, `app/src/lib/esquemas-recorrencia.ts`, `app/src/actions/recorrencia.ts` (são do back-end).
- Não altere `app/src/lib/queries/recorrencias.ts` — se precisar de dado diferente, descreva o pedido.
- Não crie nova tabela, coluna ou RLS — tudo está no banco.
- Não ative flag de feature na Vercel. Não use dados da família real para testar escrita.
- Não quebre os 648 testes existentes nem introduza erro de tsc.

---

## 4. Verificação esperada (prova por arquivo)

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` sem regressão (hoje: 648 passados, 190 pulados). Adicione testes de unidade para:
  - `criarRecorrencia` mockada: `ok:true`, `ok:false` (erro geral e de campo).
  - `responderCobranca` mockada: `ok:true` com `pago`, `adiado`, `ja_respondida`; `ok:false`.
  - Pop-up remove item da fila após resposta e fecha quando fila vazia.
  - Formulário: "Repetir todo mês" e "Parcelas" são mutuamente exclusivos.
  - Conta cartão: `estaPago` é `false` e o campo fica oculto.
- Dev server: `cd app && npm run dev` (porta 3000). Se a porta estiver ocupada, avise.
- Screenshots com caminho **absoluto** usando `mcp__plugin_playwright_playwright__browser_take_screenshot` em 375px, 768px e 1440px (`mcp__plugin_playwright_playwright__browser_resize`), mais um em dark mode (`mcp__plugin_playwright_playwright__browser_emulate_media`), nos estados:
  - Formulário de lançar com "Repetir todo mês" ligado.
  - Pop-up de cobrança com uma despesa pendente (use mock/fixture se fila real vazia).
  - Lista "Assinaturas e fixos" com pelo menos uma ativa.
  - Estado vazio das três telas.
- Console do navegador sem erro (`mcp__plugin_playwright_playwright__browser_console_messages`).
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz, quantos objetos existem, ou como uma plataforma/biblioteca se comporta (Next, Radix, Supabase, Tailwind) só entra em plano, comentário ou relatório com a saída do comando ou o trecho da doc colado ao lado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

Devolva:
- Lista do que mudou (arquivo por arquivo).
- O que foi e o que **não** foi verificado (com motivo).
- Pendências que ficaram abertas.
- Se algo contradisser este briefing, escreva a contradição em vez de contornar.
- Bloco `### Auto-Análise` obrigatório (passes, erros encontrados, correções, lições, pendências).

Fonte: `app/src/actions/recorrencia.ts` (contrato verificado), `app/src/lib/esquemas-recorrencia.ts`, `app/src/lib/queries/recorrencias.ts`, `docs/superpowers/specs/2026-11-20-recorrencia-assinaturas-design.md` (decisões do Heitor §6), migration 00019 e 00020.
