# Plano — Estrutura: acerto de contas líquido (migration 00010)

> FASE: PLANO (executado na mesma sessão, por instrução do Maestro: correção pontual).
> Repositório de trabalho: `C:\dev\financas-a-dois` (o de OneDrive é backup — `RETOMADA.md`, "MUDANÇA DE LOCAL").
> Banco: hospedado `wxhfgstgjjlmqauogeid` (PostgreSQL 17.11, medido com `select version()`). Não existe banco local.

## 1. Diagnóstico (confirmado no banco, não só por leitura)

`v_settlement` (00004, linhas 116-201) calcula `balance = pago − cota` usando só
`despesa`/`investimento`. A transferência que `settle_up` grava é ignorada, então o
acerto registrado nunca reduz o saldo. Leitura do Maestro **confirmada**.

Medido na família real (somente leitura):

- 3 transferências `Acerto de contas` de 546.47, Carol -> Heitor, `paid_by` = Carol.
- `v_settlement` hoje: Heitor `+626.42`, Carol `-626.42` (a diferença para 546.47 é o
  "Fone" de 159.91 lançado depois, pago pelo Heitor, compartilhado).
- Existe UMA outra transferência entre as contas correntes dos dois, que **não é acerto**:
  "Ajuda com o conserto", 500.00, Heitor -> Carol (2026-10-11). Isso decide o desenho
  (seção 3): "toda transferência entre contas correntes de membros diferentes" NÃO pode
  ser o critério — contaria essa ajuda como acerto.

## 2. Correção do raciocínio do Maestro sobre `pay_invoice`

Correto em parte: a transferência "Pagamento de fatura" não deve entrar em
`v_settlement` (os gastos do cartão já entram quando `pay_invoice` vira `is_paid`).
**Mas** quando eles entram, entram creditados ao `paid_by_member_id` de cada compra
(quem lançou a compra), e NÃO a quem pagou a fatura com o próprio dinheiro. Se a Carol
compra no cartão compartilhado e o Heitor paga a fatura da conta dele, o acerto credita
a Carol. Na família real isso hoje não acontece (as 8 compras no Nubank têm
`paid_by` = Heitor e foi o Heitor quem pagou a fatura), então é risco latente, não bug
ativo. É regra de negócio ambígua ("quem pagou" uma compra de cartão: o comprador ou
quem quita a fatura?) -> **pergunta ao Maestro, fora desta correção. `pay_invoice` não
é alterada.**

## 3. Decisão de modelagem

**Coluna explícita `transactions.settlement_to_member_id uuid NULL`**, preenchida só por
`settle_up`. O saldo continua POR MEMBRO (contrato `{member_id, balance}` intacto, nada
muda em `resolveTransfer`):

```
balance = total_paid − total_owed + total_settled_sent − total_settled_received
```

- `total_settled_sent`: soma dos acertos em que o membro é `paid_by_member_id` (pagou o
  acerto -> deixa de dever, saldo sobe).
- `total_settled_received`: soma dos acertos em que o membro é `settlement_to_member_id`
  (recebeu -> deixa de ter crédito, saldo desce).
- Soma dos saldos da família continua zero: cada acerto entra +X num membro e −X noutro.

Alternativas descartadas:

| Alternativa | Por que não |
|---|---|
| Identificar acerto por `description = 'Acerto de contas'` + dono da conta de destino | Texto é editável e o `/lancar` aceita `transferencia` com qualquer descrição: um lançamento manual com esse nome viraria acerto. E `accounts_update` (RLS 00006) deixa qualquer membro trocar `owner_member_id` de uma conta: o destinatário de acertos ANTIGOS mudaria retroativamente. |
| Qualquer transferência corrente->corrente entre membros diferentes | Contaria a "Ajuda com o conserto" (500.00) da família real como acerto. |
| View por par (from, to) | Muda o contrato consumido por `acerto/page.tsx` e `resolveTransfer`; desnecessário com 2 membros e com a soma por membro acima. |

Fonte: `supabase:supabase-postgres-best-practices` (schema-constraints: constraint
idempotente via `DO`/`pg_constraint`; schema-foreign-key-indexes: indexar a FK nova);
`supabase:supabase` (views: `security_invoker = true` obrigatório; `CREATE OR REPLACE
VIEW` repetindo o `WITH`).

## 4. Arquivos

| Ação | Caminho |
|---|---|
| criar | `app/supabase/migrations/00010_acerto_liquido.sql` |
| criar | `app/tests/integration/acerto-liquido.mjs` |
| regenerar | `app/src/types/database.ts` (último passo da migration) |
| NÃO alterar | `app/src/lib/settlement.ts` — `resolveTransfer` só lê `{member_id, balance}`, contrato mantido |
| NÃO alterar | `src/components/`, `src/app/` (território do Fachada) |

## 5. Schema proposto (00010)

1. `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS settlement_to_member_id uuid;`
   (nullable, sem default -> só catálogo, sem reescrita de tabela).
2. FK composta `transactions_family_id_settlement_to_member_id_fkey`
   `(family_id, settlement_to_member_id) -> family_members(family_id, id) ON DELETE RESTRICT`
   (mesma regra de `paid_by_member_id`; a limpeza já apaga lançamentos antes de membros).
3. CHECK `tx_acerto_so_em_transferencia`:
   `settlement_to_member_id IS NULL OR (type = 'transferencia' AND settlement_to_member_id <> paid_by_member_id)`.
4. Índice parcial `idx_transactions_settlement_to` em `(settlement_to_member_id) WHERE settlement_to_member_id IS NOT NULL`.
5. Backfill das linhas antigas de `settle_up`: `type='transferencia' AND description='Acerto de contas'`
   -> `settlement_to_member_id = accounts.owner_member_id` da conta de destino (só se o dono
   existe e é diferente de quem pagou). Feito com `trg_transactions_touch` desligado
   durante o UPDATE, para não reescrever `updated_at` das linhas reais. A heurística por
   descrição é usada UMA vez, aqui; daí em diante o critério é só a coluna.
6. `settle_up`: `CREATE OR REPLACE`, assinatura idêntica, grava `settlement_to_member_id = p_to_member_id`. Resto igual.
7. `v_settlement`: `CREATE OR REPLACE VIEW ... WITH (security_invoker = true)`, mesmas 7
   colunas na mesma ordem e tipo, + 2 no fim: `total_settled_sent`, `total_settled_received`.
8. Bloco `DO` de auto-verificação: aborta se faltar coluna, FK, CHECK, índice ou
   `security_invoker` na view.

RLS: nenhuma policy nova. A coluna vive em `transactions`, já coberta pelas 4 policies
por `family_id` (00006). A FK composta impede apontar para membro de outra família.

## 6. Riscos

- **A tela da família real VAI MUDAR depois do deploy**, e isso é correto: os 3 acertos
  passam a contar. Com 3 × 546.47 registrados e uma dívida real de 626.42, o saldo
  inverte (Heitor passa a dever à Carol a diferença). Os 2 (ou 3) acertos duplicados
  precisam ser excluídos pelo Heitor — não por mim (proibido tocar na família real).
  -> pendência BLOQUEANTE de comunicação para o Maestro.
- Backfill escreve em 3 linhas reais (só a coluna nova). Prova de intactude: hash das
  colunas originais antes/depois (mesmo hash = nada mais mudou, `updated_at` incluso).
- `ALTER TABLE ... DISABLE TRIGGER` pega lock exclusivo por instantes; tabela pequena.
- Migration destrutiva? Não: só ADD COLUMN nullable, constraint, índice, replace de
  função/view com colunas apenas acrescentadas.

## 7. Ordem de operações

1. Snapshot (hash) da família real — feito antes deste plano.
2. Escrever `acerto-liquido.mjs` e rodar contra o banco atual -> **VERMELHO** esperado
   no saldo pós-acerto.
3. Escrever 00010; preview do backfill (quantas linhas casam); `db push --db-url`.
4. Rodar o teste -> VERDE. Rodar `rls-isolation.mjs` e `tenant-escape.mjs` (regressão).
5. `gen types` -> `database.ts`; `tsc --noEmit`; `vitest run`.
6. Snapshot de novo: mesmo hash, mesma contagem; contagem global de famílias/usuários
   volta à de antes (prova de limpeza).

## 8. Perguntas ao Maestro (não bloqueiam esta correção)

1. Compra no cartão: quem "pagou" no acerto — comprador ou quem quita a fatura? (seção 2)
2. `settle_up` deve recusar acerto MAIOR que a dívida atual (proteção extra contra
   clique repetido)? Não implementado — regra de negócio.
