# Briefing Rodada 18 — Excluir conta permanentemente (P-016)

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Estado de partida

Commits da Rodada 17 estarão em `origin/main` antes desta rodada começar. TSC limpo. ≥703 testes passando.

**O problema (VERIFICADO):** em `/ajustes/contas`, cada conta tem um botão de editar e um botão de arquivar (`BotaoArquivarConta`). Não existe botão de excluir. O Heitor pediu exclusão permanente: "futuramente vai ser péssimo encontrar conta ativa em meio a várias arquivadas."

**O que o banco já garante (VERIFICADO em `00001_initial_schema.sql`):**

```sql
FOREIGN KEY (family_id, account_id)
  REFERENCES accounts(family_id, id) ON DELETE RESTRICT,
FOREIGN KEY (family_id, to_account_id)
  REFERENCES accounts(family_id, id) ON DELETE RESTRICT,
```

A tabela `transactions` tem FK com `ON DELETE RESTRICT` para `accounts`. Isso significa que o banco **recusa automaticamente** o DELETE de qualquer conta que ainda tenha transações vinculadas — com erro `23503`. A Server Action não precisa verificar antes: basta tentar o DELETE e tratar o erro com mensagem amigável.

**Arquivos existentes relevantes (VERIFICADO):**
- `src/actions/contas.ts` — tem `criarConta`, `editarConta`, `arquivarConta`. Não tem `excluirConta`.
- `src/components/carteira/botao-arquivar-conta.tsx` — botão simples, chama `arquivarConta`, usa `useTransition`.
- `src/app/(app)/(principal)/ajustes/contas/page.tsx` — Server Component que renderiza a lista; importa `BotaoArquivarConta`. O botão de excluir entra aqui ao lado do de arquivar.
- `src/lib/esquemas-cadastro.ts` — tem `esquemaArquivar` (uuid + boolean). O schema de excluir é mais simples: só uuid.

**Esta rodada não tem migration.** O `ON DELETE RESTRICT` já existe no banco.

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes.
- `npx vitest run` SEMPRE SEM `.env.local`. Se `skipped` cair para 0, PARE.
- `family_id` sempre vem da sessão via `obterContextoDaFamilia()`. Nunca do cliente.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

### E-1 — Back-end: `excluirConta` em `src/actions/contas.ts`

Adicionar ao final do arquivo (após `arquivarConta`):

```ts
export async function excluirConta(input: { id: string }): Promise<ResultadoAction<void>> {
  const analise = z.object({ id: z.string().uuid('Conta inválida.') }).safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  const { data, error } = await ctx.supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')

  if (error) {
    // 23503 = FK violation: conta tem transações vinculadas (ON DELETE RESTRICT).
    if (error.code === '23503') {
      return falha('Esta conta não pode ser excluída porque tem lançamentos vinculados. Arquive-a em vez de excluir.')
    }
    return falha(traduzErroDoBanco(error))
  }
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADA)

  revalidar()
  return sucesso()
}
```

**Nota:** `z` já está importado no arquivo via `import { ... } from '@/lib/esquemas-cadastro'` — A PROVAR se `z` está importado diretamente ou só os schemas. Se não estiver, adicionar `import { z } from 'zod'`.

### F-1 — Front-end: botão de excluir em `/ajustes/contas`

Criar `src/components/ajustes/botao-excluir-conta.tsx` — componente client, seguindo o mesmo padrão de `botao-arquivar-conta.tsx`:

```tsx
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { excluirConta } from '@/actions/contas'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { tocarSomErro, tocarSomSucesso } from '@/features/sons/sons'

export interface BotaoExcluirContaProps {
  contaId: string
  nomeDaConta: string
}

export function BotaoExcluirConta({ contaId, nomeDaConta }: BotaoExcluirContaProps) {
  const router = useRouter()
  const [pendente, iniciarTransicao] = React.useTransition()
  const [erroExclusao, setErroExclusao] = React.useState<string | null>(null)

  const confirmarExclusao = () => {
    setErroExclusao(null)
    iniciarTransicao(async () => {
      const res = await excluirConta({ id: contaId })
      if (res.ok) {
        tocarSomSucesso()
        router.refresh()
      } else {
        tocarSomErro()
        setErroExclusao(res.erro)
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icone-toque"
          aria-label={`Excluir conta ${nomeDaConta}`}
          title="Excluir conta permanentemente"
          className="text-muted-foreground hover:text-destructive"
          disabled={pendente}
        >
          {pendente ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </div>
            <AlertDialogTitle>Excluir "{nomeDaConta}"?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm">
            Esta ação é permanente e não pode ser desfeita. A conta será removida do sistema.
            {erroExclusao && (
              <span className="mt-2 block rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-destructive text-xs">
                {erroExclusao}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setErroExclusao(null)}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmarExclusao}
            disabled={pendente}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pendente ? 'Excluindo…' : 'Excluir permanentemente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

**A PROVAR:** verificar se `AlertDialog` já está instalado no projeto (`src/components/ui/alert-dialog.tsx`). Se não existir, usar um `<Dialog>` comum com dois botões em vez do `AlertDialog`.

### F-2 — Adicionar o botão na página `/ajustes/contas`

Em `src/app/(app)/(principal)/ajustes/contas/page.tsx`:

1. Importar: `import { BotaoExcluirConta } from '@/components/ajustes/botao-excluir-conta'`
2. No bloco de botões de cada conta (linha ~122, dentro do `div` com `flex items-center gap-1`), adicionar após o `BotaoArquivarConta`:

```tsx
<BotaoExcluirConta
  contaId={conta.id}
  nomeDaConta={conta.name}
/>
```

**Regra de visibilidade:** o botão de excluir aparece para **todas** as contas (ativas e arquivadas). O banco é quem bloqueia a exclusão de contas com transações — a UI não precisa pré-filtrar. O usuário receberá a mensagem de erro amigável se tentar excluir uma conta com histórico.

**Exceção:** conta do tipo `investimento` já não tem o botão de arquivar (linha 132: `{conta.type !== 'investimento' && ...}`). Manter essa exceção: contas de investimento também não têm botão de excluir — elas têm fluxo próprio na Carteira.

---

## 3. O que NÃO fazer

- Não altere migrations.
- Não adicione lógica de "verificar transações antes de excluir" no front — o banco já protege com `ON DELETE RESTRICT`.
- Não mude o comportamento do botão de arquivar.
- Não exclua contas de investimento (excluída da regra acima).
- Não instale dependências.

---

## 4. Verificação esperada

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` SEM `.env.local` — ≥190 skipped, ≥703 passando. Se `skipped` = 0, PARE.
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** em 375px, 768px, 1440px + dark mode:
  - Lista de contas com o botão de excluir (ícone lixeira) visível ao lado do arquivar.
  - Modal de confirmação aberto para uma conta.
  - **Não** testar clique em "Excluir permanentemente" — há risco de apagar conta real de produção. A verificação visual do modal é suficiente.
- Console sem erros (`mcp__plugin_playwright_playwright__browser_console_messages`).
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz só entra em relatório com saída do comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

- Lista do que mudou (arquivo por arquivo, com linhas).
- O que foi e o que não foi verificado (com motivo).
- Pendências abertas.
- Bloco `### Auto-Análise` obrigatório.

**Fontes verificadas pelo Maestro:**
- `src/actions/contas.ts` (VERIFICADO — arquivo completo, sem `excluirConta`)
- `src/app/(app)/(principal)/ajustes/contas/page.tsx` (VERIFICADO — arquivo completo)
- `src/components/carteira/botao-arquivar-conta.tsx` (VERIFICADO — padrão a seguir)
- `app/supabase/migrations/00001_initial_schema.sql` (VERIFICADO — `ON DELETE RESTRICT` em `transactions.account_id`)
- `app/supabase/migrations/00009_fk_set_null_por_coluna_e_nomes_unicos.sql` (VERIFICADO — confirma FK column-level set null para outros campos, mas account_id permanece RESTRICT)
