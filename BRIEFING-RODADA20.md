# Briefing Rodada 20 — Filtro de categoria por tipo no diálogo de edição (P-012)

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Estado de partida

Commits da Rodada 19 estão em `origin/main`. TSC limpo. 720 testes passando, 190 skipped.

**O problema (VERIFICADO):** o diálogo de edição individual (`dialogo-editar-lancamento.tsx`) exibe TODAS as categorias da família no seletor, sem filtrar pelo tipo do lançamento. Resultado: se o usuário troca o tipo de "despesa" para "receita", o seletor ainda mostra categorias de despesa — e a action salva com categoria do tipo errado. O formulário de criação (`form-lancamento.tsx`) já filtra corretamente usando `categorias.filter(c => c.tipo === tipo || c.tipo === 'todos')`. Esta rodada replica esse comportamento no diálogo de edição.

**Raiz do problema (VERIFICADO em dois arquivos):**

1. `src/app/(app)/(principal)/inicio/page.tsx` linha 77:
   ```ts
   supabase.from('categories').select('id, name')
   ```
   Falta `type` no select.

2. `src/components/transacoes/dialogo-editar-lancamento.tsx`:
   - `ItemSelectOpcao` tem só `id` e `name` — sem `type`.
   - O seletor de categoria usa `categorias` diretamente sem filtro por tipo.

**Como o `form-lancamento.tsx` resolve (VERIFICADO em linhas 40–45 e 307–311):**
```ts
export interface OpcaoDeCategoria {
  id: string
  nome: string
  tipo: string        // ← campo que falta no diálogo
  grupoId: string | null
}

const categoriasDoTipo = categorias.filter(
  (c) => (c.tipo === tipo || c.tipo === 'todos') && ...
)
```

**Schema do banco (VERIFICADO em `00001_initial_schema.sql` linha 106-107):**
```sql
type text NOT NULL CHECK (type IN ('receita', 'despesa', 'investimento', 'todos'))
```

**Esta rodada não tem migration.**

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes.
- `npx vitest run` SEMPRE SEM `.env.local`. Se `skipped` cair para 0, PARE.
- `family_id` sempre vem da sessão via Server Component. Nunca do cliente.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

### B-1 — Incluir `type` na query de categorias em `inicio/page.tsx`

**Arquivo:** `src/app/(app)/(principal)/inicio/page.tsx` linha 77.

Trocar:
```ts
supabase.from('categories').select('id, name'),
```
Por:
```ts
supabase.from('categories').select('id, name, type'),
```

Nenhuma outra mudança neste arquivo nesta rodada — a prop `listaCategorias` passada para `ListaTransacoesInterativa` já inclui todas as categorias; a filtragem por tipo acontece no componente do diálogo, não na page.

### B-2 — Estender `ItemSelectOpcao` com campo `type` opcional em `dialogo-editar-lancamento.tsx`

**Arquivo:** `src/components/transacoes/dialogo-editar-lancamento.tsx`

Trocar a interface (linha 58-61):
```ts
export interface ItemSelectOpcao {
  id: string
  name: string
}
```
Por:
```ts
export interface ItemSelectOpcao {
  id: string
  name: string
  type?: string
}
```

O campo é **opcional** (`?`) para não quebrar chamadores que passam `ItemSelectOpcao` sem `type` — como a prop `formasDePagamento` ou `contas`, que não têm tipo de categoria.

### F-1 — Filtrar categorias por tipo no `DialogoEditarLancamento`

**Arquivo:** `src/components/transacoes/dialogo-editar-lancamento.tsx`

Logo após os estados do formulário (depois de `const [tipo, setTipo]`, antes do JSX), adicionar a variável derivada:

```ts
const categoriasDoTipo = categorias.filter(
  (c) => !c.type || c.type === tipo || c.type === 'todos'
)
```

A guard `!c.type` garante retrocompatibilidade: se alguém passar categorias sem `type`, o item continua aparecendo (comportamento atual).

Depois, no seletor de categoria (linha ~618), trocar `{categorias.map(...)` por `{categoriasDoTipo.map(...)`:

```tsx
{categoriasDoTipo.map((cat) => (
  <SelectItem key={cat.id} value={cat.id}>
    {cat.name}
  </SelectItem>
))}
```

**Comportamento ao trocar o tipo:** quando o usuário muda o tipo do lançamento (ex.: de "despesa" para "receita"), a lista de categorias disponíveis muda. Se a categoria atualmente selecionada não for válida para o novo tipo, ela deve ser limpa (`setCategoriaId('')`).

Isso já acontece na parte do `useEffect` ou no handler de mudança de tipo? A PROVAR: verificar se já existe um `useEffect` ou `onValueChange` no seletor de tipo que zera `categoriaId`. Se não existir, adicionar ao handler que muda `tipo`:

```ts
// Dentro do handler de mudança de tipo (onde setTipo é chamado)
// Depois de setTipo(novoTipo):
const catAtual = categorias.find(c => c.id === categoriaId)
if (catAtual?.type && catAtual.type !== novoTipo && catAtual.type !== 'todos') {
  setCategoriaId('')
}
```

### C-1 — Propagar `type` ao montar `listaCategorias` em `inicio/page.tsx`

A query do B-1 já inclui `type`. Verificar como `listaCategorias` é montado e passado para `ListaTransacoesInterativa`:

```ts
// Linha ~249 (A PROVAR — confirmar linha real)
listaCategorias={(categorias.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
```

Trocar por:
```ts
listaCategorias={(categorias.data ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type }))}
```

Isso faz o `type` chegar até o `DialogoEditarLancamento` via `listaCategorias` → `categorias` prop.

---

## 3. O que NÃO fazer

- Não altere migrations.
- Não altere `src/actions/editar-lancamento.ts` — a action server-side já valida `category_id` só por existência na família, não por tipo. Isso é intencional (a action não precisa barrar — o filtro da UI já previne).
- Não altere o `form-lancamento.tsx` — ele já funciona corretamente.
- Não altere o `dialogo-editar-em-massa.tsx` — ele não tem seletor de categoria (edição em massa não suporta categoria).
- Não instale dependências.

---

## 4. Verificação esperada

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` SEM `.env.local` — ≥190 skipped, ≥720 passando. Se `skipped` = 0, PARE.
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** em 375px, 768px, 1440px + dark mode:
  - Diálogo de edição aberto para um lançamento do tipo "despesa" — o seletor de categoria deve mostrar apenas categorias de despesa e "todos".
  - Diálogo com tipo trocado para "receita" — o seletor deve mostrar apenas categorias de receita e "todos".
  - Se não houver lançamentos na família de produção para demonstrar, o estado do diálogo vazio é suficiente (mas confirmar pelo código que o filtro está aplicado).
- Console sem erros.
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz só entra em relatório com saída do comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

- Lista do que mudou (arquivo por arquivo, com linhas).
- Confirmação de que ao trocar tipo, categorias incompatíveis são limpas.
- O que foi e o que não foi verificado (com motivo).
- Pendências abertas.
- Bloco `### Auto-Análise` obrigatório.

**Fontes verificadas pelo Maestro:**
- `src/app/(app)/(principal)/inicio/page.tsx` linha 77 (VERIFICADO — `select('id, name')` sem `type`)
- `src/components/transacoes/dialogo-editar-lancamento.tsx` linhas 58-61, 616-623 (VERIFICADO — `ItemSelectOpcao` sem `type`, `categorias.map` sem filtro)
- `src/components/transacoes/form-lancamento.tsx` linhas 40-45, 307-311 (VERIFICADO — `OpcaoDeCategoria` tem `tipo`, `categoriasDoTipo` filtrado)
- `app/supabase/migrations/00001_initial_schema.sql` linhas 102-114 (VERIFICADO — `categories.type` CHECK `('receita','despesa','investimento','todos')`)
