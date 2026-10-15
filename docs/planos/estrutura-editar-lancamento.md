# Plano — Estrutura: editar lançamento (individual e em massa)

> FASE: PLANO. Autor: Estrutura, 2026-10-14. Executado na mesma sessão (o
> Maestro pediu PLANO e EXECUÇÃO em sequência).
> Governa: pedido do Heitor via Maestro — trocar o `supabase.from('transactions').update(...)`
> direto do navegador em `dialogo-editar-lancamento.tsx` e `dialogo-editar-em-massa.tsx`
> por Server Actions com Zod e `ResultadoAction<T>`.

## 0. O que a leitura do código revelou (e o brief não previa)

Lido no disco: os dois diálogos, `src/actions/lancamento.ts`, `resultado.ts`,
`contexto-familia.ts`, `orcamentos.ts`, `fatura.ts`, `src/lib/push/*`,
`src/lib/invoice.ts`, `src/lib/hoje.ts`, a tabela `transactions` (00001), as
policies de `transactions` (00006), `save_transactions`/`pay_invoice` (00003) e
`settlement_to_member_id` (00010).

1. **Fatura do cartão não é recalculada pelo update direto de hoje.**
   `invoice_year`/`invoice_month` são gravados por `save_transactions` a partir
   de `accounts.closing_day` + `date` (compra no dia do fechamento cai no ciclo
   seguinte). Não há trigger. O update direto atual muda `date`/`account_id` e
   deixa a fatura velha: compra movida para o cartão não aparece em fatura
   nenhuma; compra movida para fora do cartão continua somando na fatura dele e
   seria quitada por `pay_invoice`. **As actions recalculam a fatura** com
   `getInvoicePeriod` de `src/lib/invoice.ts` (mesma regra do SQL).
2. **Mudar o tipo para/de transferência quebra CHECKs.** `tx_transferencia_tem_destino`
   exige `to_account_id` (≠ origem) em transferência e NULL nos outros tipos;
   `tx_transferencia_sem_rateio` exige `owner_member_id`/`owner_share` nulos. A
   UI não envia conta de destino. → campo novo opcional `contaDestinoId`.
3. **Acerto de contas** (`settlement_to_member_id` preenchido, 00010) tem CHECK
   `tx_acerto_so_em_transferencia` (tipo = transferência e destinatário ≠ quem
   pagou). Editar tipo ou "quem pagou" de um acerto dá 23514 ou inverte o
   sentido do acerto em `v_settlement`.
4. **"Marcar como pago" em massa sobrescreveria a data de quem já estava pago**
   (a UI manda `paid_date = hoje` para todos).
5. Estado do banco (saída abaixo): 0 linhas `investimento`, 0 acertos; família
   real com 10 lançamentos (7 despesa, 3 receita).

```
$ node snap.mjs   (contagem antes de qualquer trabalho)
 "families": 1, "auth_users": 2, "transactions": 10,
 "investimento_global": 0, "acertos_global": 0,
 "real_tx": 10, "real_tipos": { "despesa": 7, "receita": 3 },
 "real_tx_hash": "e49ad7c55c14c191"
```

## 1. Arquivos

| Ação | Caminho (relativo a `app/`) | Conteúdo |
|---|---|---|
| criar | `src/lib/esquemas-edicao-lancamento.ts` | esquemas Zod das duas actions + funções PURAS `faturaPara`, `planejarEdicaoEmMassa` (exportáveis para teste; módulo `'use server'` só exporta função async) |
| criar | `src/actions/editar-lancamento.ts` | `'use server'`: `atualizarLancamento`, `atualizarLancamentosEmMassa` |
| alterar | `src/lib/push/mensagens.ts` | evento novo `'edicao'` |
| criar | `tests/unit/edicao-lancamento.test.ts` | esquemas + planejamento puro |
| alterar | `tests/unit/push-mensagens.test.ts` | casos do evento `'edicao'` |
| criar | `tests/integration/editar-lancamento.int.test.ts` | actions reais contra o banco hospedado, isolamento A×B, limpeza `limparTeste` |

**Não** toco em `src/components/`, `src/app/`, `supabase/migrations/`,
`src/actions/lancamento.ts`. Sem migration ⇒ sem `gen types` neste ciclo (nenhum
objeto de banco muda; `src/types/database.ts` já tem `settlement_to_member_id`).

Arquivo novo em vez de estender `lancamento.ts`: o `valor` da edição RECUSA 3+
casas (regra P-009, igual `orcamentos.ts`), enquanto `salvarLancamento` ainda
arredonda (P-009 aberto lá). Dois esquemas de valor diferentes no mesmo arquivo
seriam confundidos. Corrigir o P-009 em `salvarLancamento` fica fora de escopo.

## 2. Assinaturas

```ts
// src/actions/editar-lancamento.ts
export async function atualizarLancamento(input: {
  id: string
  tipo: 'receita' | 'despesa' | 'transferencia'
  descricao: string
  valor: number
  data: string                    // 'YYYY-MM-DD'
  contaId: string
  contaDestinoId?: string | null  // NOVO: só transferência; omitido = mantém o destino atual
  categoriaId?: string | null
  pagoPorId: string
  estaPago: boolean
  dataDoPagamento?: string | null
  observacao?: string | null
}): Promise<ResultadoAction<void>>

export async function atualizarLancamentosEmMassa(input: {
  ids: string[]                   // 1..50, repetidos são deduplicados
  categoriaId?: string | null     // undefined = não mexe; null = "sem categoria"
  contaId?: string
  pagoPorId?: string
  estaPago?: boolean              // true: só os não pagos ganham paid_date = hoje (SP)
}): Promise<ResultadoAction<{ atualizados: number }>>
```

Forma do erro: `{ ok: false, erro: string, camposComErro?: Record<string, string[]> }`.

## 3. Ordem dentro de cada action (endpoint público)

1. `safeParse` do Zod; daqui em diante só o valor parseado.
2. `obterContextoDaFamilia()` → `getUser()` + `get_user_family_id_self()`
   (família nunca vem do cliente). Autor do push em paralelo.
3. **Autorização do recurso**, com `.eq('family_id', familyId)` explícito:
   lançamento(s), conta, conta de destino, categoria, membro. Qualquer um fora
   da família = mensagem "não encontrado", sem revelar que existe.
4. Regras de negócio sobre o estado REAL das linhas (lido no passo 3).
5. `update` com `.eq('family_id', familyId)` + `.in/eq('id', …)` + `.select('id')`.
   RLS `transactions_update` (00006, USING + WITH CHECK por família) é a
   segunda camada.
6. `revalidatePath` em `/inicio`, `/lancar`, `/carteira`, `/acerto`, `/analises`.
7. `agendarNotificacao(autor, 'edicao', n)` — só se gravou algo.

## 4. Regras (validação e negócio)

Individual:
- `valor`: number, `superRefine` com UMA mensagem por prioridade (L-016):
  finito → > 0 → ≤ 99.999.999,99 → no máximo 2 casas (recusa, não arredonda;
  tolerância 1e-6 só para ruído binário). Mesmas frases de `orcamentos.ts`.
- `descricao` trim 1..120; `observacao` trim ≤ 500, vazia vira `null`.
- `data`/`dataDoPagamento`: `isValidISODate`. Pago ⇔ data (mesmas 2 frases de
  `salvarLancamento`).
- Transferência: destino = `contaDestinoId` ?? (destino atual, se a linha já era
  transferência). Ausente ou igual à origem → campo `contaDestinoId`:
  "Escolha uma conta de destino diferente da conta de origem." Categoria e
  rateio (`owner_member_id`, `owner_share`) viram `null`. Categoria enviada com
  tipo transferência é DESCARTADA em silêncio (mesmo comportamento de `salvarLancamento`).
- Não transferência: `to_account_id = null`; rateio, forma de pagamento,
  fútil/benefício e série NÃO são tocados (não estão na assinatura).
- Fatura: recalculada SÓ se `account_id` ou `date` mudaram (senão uma edição de
  descrição moveria uma compra antiga de fatura depois de alguém ter mudado o
  dia de fechamento do cartão). Conta sem `closing_day` → fatura `null`.
- Acerto (`settlement_to_member_id` não nulo) → recusado:
  "Acerto de contas não pode ser editado. Exclua e registre de novo."

Em massa:
- Pelo menos um campo → senão "Escolha pelo menos um campo para alterar."
- Todos os ids precisam ser da família; se UM não for → nada é gravado,
  "Lançamento não encontrado." (não confio em `.in('id', ids)` sozinho).
- Acerto na seleção → recusa o lote inteiro (mesma frase do individual).
- `categoriaId` não nulo com transferência na seleção → recusa o lote:
  "Transferências não têm categoria. Tire as transferências da seleção."
- `contaId` igual ao destino de alguma transferência selecionada → recusa:
  "Escolha uma conta de destino diferente da conta de origem."
- `contaId`: fatura recalculada por linha (cada uma tem sua data), só nas linhas
  cuja conta muda.
- `estaPago: true` → linhas não pagas ganham `paid_date = hojeEmSaoPaulo()`;
  as já pagas MANTÊM a data. `false` → `is_paid=false, paid_date=null`.
- `atualizados` = linhas efetivamente gravadas (uma linha já paga, num lote
  só de "marcar como pago", não conta).

### Atomicidade do lote (risco aceito, com 2 correções avaliadas — L-013)

O lote vira 1 `UPDATE` por grupo de linhas com o MESMO patch final
(`planejarEdicaoEmMassa` agrupa). Caso comum (categoria / quem pagou /
pendente) = 1 grupo = 1 instrução atômica. Com `contaId` para cartão ou
`estaPago: true`, pode haver mais de um grupo (faturas diferentes; já pagas
vs. não pagas) e um erro de rede entre dois `UPDATE` deixa o lote aplicado em
parte. Nenhuma linha fica inválida (cada `UPDATE` grava conta+fatura juntas) e
repetir a mesma chamada converge para o mesmo estado final. Nesse caso o erro
diz: "Parte dos lançamentos foi atualizada e parte não. Tente de novo."
- Correção A (gravação): RPC `update_transactions` numa migration — uma
  transação só. Fora dos arquivos permitidos nesta rodada (`supabase/migrations/`
  não foi liberado). **Recomendo como rodada futura.**
- Correção B (instrução única pelo PostgREST): impossível — `UPDATE` do
  PostgREST aplica o MESMO valor a todas as linhas, e aqui a fatura e a data de
  pagamento variam por linha; `upsert` exigiria passar pela policy de INSERT
  (`created_by_member_id = eu`), que recusa linha lançada pelo parceiro.

## 5. Push ao editar — decisão: SIM

Evento novo `'edicao'`: "Carol editou um lançamento" / "Carol editou 3
lançamentos", `url: '/inicio'`, sem valor (regra R-1). Por quê: num app de
casal, o parceiro mudar valor/conta/"quem pagou" de algo muda o acerto do mês
— é o tipo de alteração que mais precisa ser vista. Reaproveitar `'lancamento'`
mentiria ("registrou"). O contrato `{titulo, corpo, url}` de `public/sw.js` não
muda. Uma notificação por chamada (no lote, com a contagem), nenhuma quando
nada foi gravado.

## 6. Testes (TDD)

- Unit (`edicao-lancamento.test.ts`), RED antes do código: mensagens exatas
  dos esquemas (`toEqual([msg])`, inclui 1.005, NaN, Infinity, negativo com 3
  casas); `faturaPara` (dia antes/no/depois do fechamento, dezembro→janeiro,
  conta sem ciclo); `planejarEdicaoEmMassa` (grupos, já-pagas preservadas,
  recusas de transferência/acerto).
- Integração (`editar-lancamento.int.test.ts`), banco hospedado, 2 famílias
  descartáveis (A com 2 membros, B com 1), `limparTeste` no `afterAll` com
  contagem de sobras = 0. RED com um stub que replica o update ingênuo da UI
  de hoje (sucesso para id de outra família, fatura velha) — tem de falhar.
- Isolamento: B não edita linha de A (individual e lote, inclusive lote misto
  B+A, que não pode gravar nem a linha de B); B não aponta a própria linha
  para conta/categoria/membro de A; RLS direto (cliente de B no PostgREST)
  altera 0 linhas de A, e o modo `EDICAO_RLS_MUTANTE=1` (intruso = service_role)
  TEM de ficar vermelho.
- Família real: hash dos lançamentos/contas/categorias/membros antes e depois.

## 7. Ordem de operações

1. Testes unitários (RED) → `esquemas-edicao-lancamento.ts` (GREEN).
2. Teste de mensagem `'edicao'` (RED) → `mensagens.ts` (GREEN).
3. Teste de integração + stub ingênuo (RED, saída colada) → actions reais (GREEN).
4. Modo mutante do RLS (tem de falhar).
5. `npx tsc --noEmit`, `npx vitest run` (suíte toda), varredura de segredo,
   `security-review`, snapshot final da família real.
6. `git pull --rebase origin main`, commit, push.

## 8. Riscos

- Nenhuma migration, nenhum dado existente reescrito. Os testes criam e
  apagam só famílias próprias (nunca `9969d589-…`).
- Atomicidade parcial do lote em falha de rede (seção 4).
- `pay_invoice` já quitou a fatura e alguém marca uma compra dela como
  pendente: a fatura reabre aquele valor e pode ser paga de novo. É o mesmo
  comportamento do update direto de hoje; não bloqueio (seria regra de negócio
  nova) — vai como pergunta.

## 9. Perguntas ao Maestro (não bloqueiam: adotei a opção conservadora, reversível)

1. Acerto de contas: recusar edição (adotado) ou permitir só descrição/valor/data?
2. Lote com transferência + categoria: recusar o lote (adotado) ou pular as transferências?
3. Desmarcar "pago" de compra de cartão de fatura já quitada: permitir (adotado, igual hoje) ou bloquear?
4. Migration com RPC `update_transactions` para lote atômico: abrir rodada?

## 10. Execução — evidência do modo mutante (2026-10-15)

A action original foi copiada e teve o sha256 conferido antes e depois
(`3423335fbbac3c3a…`, idêntico após restaurar). Cada mutante foi gerado do
original por script (`.eq('family_id', familyId)` removido: 6 ocorrências;
cliente da action trocado por `service_role`: 2 ocorrências).

| Mutante | Filtro por família na action | RLS na action | Resultado de `editar-lancamento.int.test.ts` |
|---|---|---|---|
| `EDICAO_RLS_MUTANTE=1` (intruso do bloco "RLS direto" = service_role) | mantido | — | `Tests  2 failed \| 21 passed (23)` — os 2 testes "RLS:" |
| M-B: sem filtro + sem RLS (vazamento real) | removido | desligado | `Tests  6 failed \| 18 passed (24)` — os 6 testes "B não …" |
| M-A: sem filtro, RLS ligado | removido | ligado | `Tests  24 passed (24)` — o RLS sozinho segura |
| M-C: com filtro, sem RLS | mantido | desligado | `Tests  24 passed (24)` — o filtro sozinho segura |
| original restaurado | mantido | ligado | 24/24 (dentro de `Tests  97 passed (97)` dos 3 arquivos do ciclo) |

O mutante RLS rodou antes do teste novo abaixo (por isso 23).

Desvio: teste novo "B não edita lançamento de A nem usando conta, categoria e
membro do próprio A" — no M-B o teste individual antigo (com as referências de B)
só ficava vermelho pela MENSAGEM: quem barrava a gravação era a FK composta de
`transactions` (23503, "Um dos itens escolhidos não existe mais"), não a ausência
de filtro. Com as referências de A não há FK que segure, e no M-B a action
devolveu `{ ok: true }` — gravou na linha de A. É esse o caso que prova o filtro.

Desvio: `tests/integration/push-envio.int.test.ts` (ciclo do push) comparava a
contagem GLOBAL de famílias antes/depois; no `npx vitest run` padrão as suítes de
integração rodam em paralelo e ele falhava (`expected { familias: 5, … } to
deeply equal { familias: 2, … }`). Trocado por sobras do que o próprio arquivo
criou (famílias por id = 0; cada usuário via `getUserById` = `null`).
