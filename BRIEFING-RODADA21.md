# Briefing Rodada 21 — atualizarLancamento devolve linha completa (P-013)

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Estado de partida

Commits da Rodada 20 estão em `origin/main`. TSC limpo. 723 testes passando, 190 skipped.

**O problema (VERIFICADO):** `atualizarLancamento` termina com `.select('id')` e retorna `ResultadoAction<void>`. Depois de salvar, o diálogo de edição constrói o objeto de merge **manualmente** com os valores do formulário e o passa via `onSalvo`. Isso funciona para os campos que o usuário digitou, mas deixa stale os campos calculados internamente pela action:

- `invoice_year` / `invoice_month` — calculados por `montarPatchIndividual` a partir de `closing_day` da conta. Se a data mudar e a conta tiver `closing_day`, o mês de fatura muda, mas o merge local não sabe disso.
- `owner_share` — zerado para transferências por `montarPatchIndividual`. O merge local não inclui esse campo.

Resultado: itens carregados via scroll infinito (que não são substituídos pelo `router.refresh()`) podem mostrar `invoice_month` desatualizado ao reabrir o diálogo ou calcular totais locais.

**O banco está sempre correto.** O problema é só a lista em memória no navegador.

**Arquivos relevantes (VERIFICADO):**
- `src/actions/editar-lancamento.ts` linha 82 — `atualizarLancamento` retorna `ResultadoAction<void>`, faz `.select('id')` na linha 119.
- `src/components/transacoes/dialogo-editar-lancamento.tsx` linhas 334–387 — chama a action, verifica `resposta.ok`, e constrói o `onSalvo` com valores do formulário (não do banco).
- `src/types/database.ts` — tem o tipo `Database['public']['Tables']['transactions']['Row']` com todos os campos.

**Esta rodada não tem migration.**

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes.
- `npx vitest run` SEMPRE SEM `.env.local`. Se `skipped` cair para 0, PARE.
- `family_id` sempre vem da sessão via `obterContextoDaFamilia()`. Nunca do cliente.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

### B-1 — Mudar `atualizarLancamento` para devolver a linha completa

**Arquivo:** `src/actions/editar-lancamento.ts`

**Passo 1** — Alterar a assinatura:
```ts
// antes
export async function atualizarLancamento(input: EntradaAtualizarLancamento): Promise<ResultadoAction<void>>

// depois
export async function atualizarLancamento(input: EntradaAtualizarLancamento): Promise<ResultadoAction<Database['public']['Tables']['transactions']['Row']>>
```

Adicionar o import necessário no topo do arquivo se ainda não existir:
```ts
import type { Database } from '@/types/database'
```
A PROVAR: verificar se `Database` já está importado neste arquivo. Se não estiver, adicionar.

**Passo 2** — Trocar `.select('id')` por `.select('*').single()`:
```ts
// antes (linha ~114–122)
const { data, error } = await supabase
  .from('transactions')
  .update(plano.patch)
  .eq('id', e.id)
  .eq('family_id', familyId)
  .select('id')
if (error) return falha(traduzErroDoBanco(error))
if ((data ?? []).length === 0) return falha(M.NAO_ENCONTRADO)

revalidar()
agendarNotificacao(autorDaFamilia(autor, familyId), 'edicao', 1)
return sucesso()

// depois
const { data, error } = await supabase
  .from('transactions')
  .update(plano.patch)
  .eq('id', e.id)
  .eq('family_id', familyId)
  .select('*')
  .single()
if (error) {
  // .single() lança PGRST116 quando não encontra linha
  if (error.code === 'PGRST116') return falha(M.NAO_ENCONTRADO)
  return falha(traduzErroDoBanco(error))
}
if (!data) return falha(M.NAO_ENCONTRADO)

revalidar()
agendarNotificacao(autorDaFamilia(autor, familyId), 'edicao', 1)
return sucesso(data)
```

**Nota importante:** `sucesso()` é chamado sem argumento para `ResultadoAction<void>`. Com `ResultadoAction<Transaction>`, precisa passar o `data`. Verificar a assinatura da função `sucesso` em `src/actions/resultado.ts` — A PROVAR se ela aceita argumento genérico ou se é `sucesso<T>(dados: T)`.

### F-1 — Usar o retorno da action no diálogo para o merge local

**Arquivo:** `src/components/transacoes/dialogo-editar-lancamento.tsx`

Substituir o bloco que constrói `onSalvo` manualmente (linhas ~368–386) pelo dado real retornado da action:

```ts
// antes: constrói objeto manual com valores do formulário
onSalvo?.({
  id: transacao.id,
  type: tipo,
  description: descLimpa,
  // ... campos do formulário ...
})

// depois: usa a linha real que a action devolveu
if (resposta.ok) {
  onSalvo?.(resposta.dados)
}
```

O tipo de `onSalvo` aceita `LancamentoSalvo` que é um `Pick<Transacao, ...>` — verificar se `resposta.dados` (que é `Transacao` completo) é compatível com `LancamentoSalvo`. Como `LancamentoSalvo` é um `Pick`, `resposta.dados` tem todos os campos necessários, então a atribuição funciona diretamente. A PROVAR: confirmar que o TypeScript aceita sem cast.

---

## 3. O que NÃO fazer

- Não altere `atualizarLancamentosEmMassa` — edição em massa devolve `{ atualizados: number }` e está correta.
- Não altere migrations.
- Não altere o schema Zod de entrada.
- Não instale dependências.

---

## 4. Verificação esperada

- `npx tsc --noEmit` limpo (0 erros). Este é o check mais importante desta rodada — a mudança de tipo genérico precisa propagar corretamente.
- `npx vitest run` SEM `.env.local` — ≥190 skipped, ≥723 passando. Se `skipped` = 0, PARE.
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** em 375px, 768px, 1440px + dark mode:
  - Página `/inicio` carregada normalmente (confirmar que o diálogo de edição abre sem erro).
  - Console sem erros de tipo ou runtime.
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz só entra em relatório com saída do comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

- Lista do que mudou (arquivo por arquivo, com linhas).
- Confirmação de que `sucesso(data)` compila sem cast.
- Confirmação de que `resposta.dados` (linha completa) é atribuído ao `onSalvo` sem erro de tipo.
- Pendências abertas.
- Bloco `### Auto-Análise` obrigatório.

**Fontes verificadas pelo Maestro:**
- `src/actions/editar-lancamento.ts` linhas 82, 114–127 (VERIFICADO — `.select('id')`, `return sucesso()`)
- `src/components/transacoes/dialogo-editar-lancamento.tsx` linhas 334–387 (VERIFICADO — `onSalvo` construído manualmente)
- `src/lib/esquemas-edicao-lancamento.ts` linhas 192–195, 241 (VERIFICADO — `invoice_year`/`invoice_month` e `owner_share` calculados internamente, não retornados)
