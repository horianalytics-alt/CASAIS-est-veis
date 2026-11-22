# Briefing Rodada 16 — Forma de pagamento e responsável no diálogo de editar lançamento

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Contexto e estado de partida

Commits da Rodada 15 estão em `origin/main`. TSC limpo. 693 testes passando.

**O problema (VERIFICADO):** o app tem as tabelas `payment_methods` (formas de pagamento) e a coluna `owner_member_id` (responsável pelo lançamento — quem gerou a despesa, independente de quem pagou). Esses campos existem há muito tempo no banco e no formulário de criar lançamento. Mas no diálogo de **editar** lançamento, esses dois campos estão completamente ausentes.

Resultado: um usuário que lança uma despesa com forma de pagamento "Nubank Crédito" e responsável "Parceiro", ao editar qualquer detalhe desse lançamento, perde silenciosamente os dois campos (eles viram `null` no banco).

**Raiz do problema mapeada:**

- **`src/lib/esquemas-edicao-lancamento.ts` linhas 76–133 (VERIFICADO):** `esquemaAtualizarLancamento` não tem `formaDePagamentoId` nem `responsavelId`. Ambos estão ausentes do schema Zod.
- **`src/lib/esquemas-edicao-lancamento.ts` linhas 193–249 (VERIFICADO):** `montarPatchIndividual` constrói o `PatchDeLancamento` sem `payment_method_id` e sem `owner_member_id`. O campo `owner_member_id` só aparece ali quando o tipo é transferência — para ser zerado explicitamente (linha 226). Em todos os outros casos, nem aparece no patch, o que significa que ao chamar o UPDATE o banco mantém o valor antigo. MAS o Supabase faz `UPDATE ... SET col1=val1, col2=val2` — se a coluna não está no objeto, ela fica intacta. Isso pode parecer seguro, mas o problema real é que o frontend não carrega os valores atuais de volta ao abrir o diálogo (ver próximo ponto).
- **`src/components/transacoes/dialogo-editar-lancamento.tsx` linhas 68–96 (VERIFICADO):** `DialogoEditarLancamentoProps` não recebe `formasDePagamento`. O tipo `LancamentoSalvo` não inclui `payment_method_id` nem `owner_member_id`. O `useEffect` de preenchimento (linhas 203–233) não carrega `transacao.payment_method_id` nem `transacao.owner_member_id` em nenhum estado local.
- **`src/actions/lancamento.ts` linhas 227–228 (VERIFICADO):** o formulário de **criar** lançamento já funciona corretamente — passa `payment_method_id` e `owner_member_id` sem problema. O problema é exclusivamente no fluxo de edição.
- **`src/app/(app)/(principal)/inicio/page.tsx` (VERIFICADO):** a página não faz query em `payment_methods` para passar ao diálogo de edição.

**Esta rodada não tem migration.** As colunas já existem no banco. O trabalho é 100% no código da app.

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes. Leitura é segura.
- `npx vitest run` SEMPRE SEM `.env.local` carregado. Se `skipped` cair para 0, PARE imediatamente — risco de escrever no banco de produção (L-031).
- `family_id` sempre vem da sessão via `obterContextoDaFamilia()`. Nunca do cliente.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho do código colado ao lado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. Escopo desta rodada

### E-1 — Back-end: adicionar `formaDePagamentoId` e `responsavelId` ao fluxo de edição individual

**Arquivos a tocar:** `src/lib/esquemas-edicao-lancamento.ts` apenas.

**O que fazer:**

**2.1 — Estender `esquemaAtualizarLancamento`** (linha ~91 do arquivo):

```ts
// Adicionar após `pagoPorId: uuid,`:
/** undefined = manter o que a linha tem; null = "sem forma de pagamento". */
formaDePagamentoId: uuid.nullish(),
/** undefined = manter; null só se for transferência. */
responsavelId: uuid.nullish(),
```

Ambos opcionais com `.nullish()` — o mesmo padrão que `categoriaId` usa. `undefined` = não tocar no banco; `null` = apagar o valor.

**2.2 — Estender `montarPatchIndividual`** (bloco do `patch`, linha ~210):

```ts
// Adicionar ao objeto patch, junto com os outros campos:
payment_method_id: e.formaDePagamentoId !== undefined ? e.formaDePagamentoId : undefined,
owner_member_id: ehTransferencia
  ? null
  : (e.responsavelId !== undefined ? e.responsavelId : undefined),
```

Regra para `owner_member_id`: transferência → sempre `null` (já existe esse guard para o `owner_share`). Outros tipos: se veio no input, usa; se não veio (`undefined`), deixa o Supabase manter o que está.

**A PROVAR:** verificar se `PatchDeLancamento` aceita `undefined` em `payment_method_id` e `owner_member_id` (campo `undefined` em um objeto TypeScript é ignorado no spread). Se o tipo deles for `string | null` sem `undefined`, use `e.formaDePagamentoId ?? undefined` — mas confirme no tipo gerado.

**2.3 — `esquemaAtualizarEmMassa`** (linha ~137): adicionar também:

```ts
formaDePagamentoId: uuid.nullable().optional(),
responsavelId: uuid.optional(),
```

E no `refine` que valida que pelo menos um campo foi enviado (linha ~151), incluir os dois novos campos nas condições:

```ts
(e) =>
  e.categoriaId !== undefined ||
  e.contaId !== undefined ||
  e.pagoPorId !== undefined ||
  e.estaPago !== undefined ||
  e.formaDePagamentoId !== undefined ||
  e.responsavelId !== undefined
```

**A PROVAR:** verificar onde `montarPatchEmMassa` ou equivalente usa `LoteParseado` para construir o UPDATE em lote — adicionar `payment_method_id` e `owner_member_id` lá também, com a mesma lógica de `undefined` = não tocar.

**O que NÃO fazer:**
- Não altere migrations.
- Não toque em `src/actions/lancamento.ts` (create action — já funciona).
- Não toque em `src/actions/editar-lancamento.ts` nem `src/actions/editar-lancamento-em-massa.ts` a não ser que a assinatura dessas actions precise mudar para aceitar os novos campos. Se precisar, ajuste minimamente.

---

### F-1 — Front-end: adicionar os campos ao `DialogoEditarLancamento`

**Arquivos a tocar:**
- `src/components/transacoes/dialogo-editar-lancamento.tsx`
- `src/app/(app)/(principal)/inicio/page.tsx`

**O que fazer:**

**F-1a — `DialogoEditarLancamentoProps` (linha ~68):**

```ts
export interface DialogoEditarLancamentoProps {
  // ... campos existentes ...
  formasDePagamento?: ItemSelectOpcao[]  // opcional: se não vier, não exibe o campo
}
```

**F-1b — `LancamentoSalvo` (linha ~79):** adicionar os dois campos ao tipo que `onSalvo` devolve:

```ts
export type LancamentoSalvo = Pick<
  Transacao,
  | 'id'
  | 'type'
  | /* ... campos existentes ... */
  | 'payment_method_id'   // ← novo
  | 'owner_member_id'     // ← novo
>
```

**F-1c — Estados locais (após linha 128):**

```ts
const [formaDePagamentoId, setFormaDePagamentoId] = React.useState<string>('')
const [responsavelId, setResponsavelId] = React.useState<string>('')
```

**F-1d — Preenchimento ao abrir (`useEffect`, linha ~203):**

```ts
setFormaDePagamentoId(transacao.payment_method_id || '')
setResponsavelId(transacao.owner_member_id || '')
```

**F-1e — Envio (`handleSubmit`, linha ~313):**

```ts
const resposta = await atualizarLancamento({
  // ... campos existentes ...
  formaDePagamentoId: formaDePagamentoId || null,
  responsavelId: tipo === 'transferencia' ? null : (responsavelId || null),
})
```

**F-1f — Callback `onSalvo` (linha ~345):**

```ts
onSalvo?.({
  // ... campos existentes ...
  payment_method_id: formaDePagamentoId || null,
  owner_member_id: tipo === 'transferencia' ? null : (responsavelId || null),
})
```

**F-1g — UI dos novos campos (adicionar após o seletor de categoria, antes de "Pago por"):**

Forma de pagamento — só exibe se `formasDePagamento` existir e tiver itens:

```tsx
{formasDePagamento && formasDePagamento.length > 0 && tipo !== 'transferencia' && (
  <div className="grid gap-1.5">
    <Label htmlFor="edit-forma-pagamento">Forma de pagamento</Label>
    <Select
      value={formaDePagamentoId}
      onValueChange={(v) => { setFormaDePagamentoId(v === '_none' ? '' : v); limparErroDoCampo('formaDePagamentoId') }}
    >
      <SelectTrigger id="edit-forma-pagamento">
        <SelectValue placeholder="Selecione (opcional)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Nenhuma</SelectItem>
        {formasDePagamento.map((f) => (
          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <CampoErro id="edit-forma-pagamento-erro" mensagens={camposComErro['formaDePagamentoId']} />
  </div>
)}
```

Responsável — só exibe se `membros` tiver 2+ itens E tipo não for transferência:

```tsx
{membros.length > 1 && tipo !== 'transferencia' && (
  <div className="grid gap-1.5">
    <Label htmlFor="edit-responsavel">Responsável</Label>
    <Select
      value={responsavelId}
      onValueChange={(v) => { setResponsavelId(v === '_none' ? '' : v); limparErroDoCampo('responsavelId') }}
    >
      <SelectTrigger id="edit-responsavel">
        <SelectValue placeholder="Selecione (opcional)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Nenhum</SelectItem>
        {membros.map((m) => (
          <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <CampoErro id="edit-responsavel-erro" mensagens={camposComErro['responsavelId']} />
  </div>
)}
```

**F-1h — `inicio/page.tsx`: buscar payment_methods e passar para o diálogo:**

A PROVAR: a query atual de `inicio/page.tsx` já busca `categorias`, `membros`, `contas`. Adicionar:

```ts
const formasDePagamento = await supabase
  .from('payment_methods')
  .select('id, name')
  .eq('family_id', familyId)
  .eq('is_archived', false)
  .order('name')
```

Passar ao `<DialogoEditarLancamento formasDePagamento={formasDePagamento.data ?? []} ... />`.

**A PROVAR:** verificar qual é o componente em `inicio/page.tsx` que renderiza o `DialogoEditarLancamento` — pode ser um componente client que recebe os dados como props. Rastrear o caminho completo antes de editar.

**O que NÃO fazer no front-end:**
- Não altere o formulário de criar lançamento (`form-lancamento.tsx`) — ele já funciona.
- Não altere o formulário de editar em lote (`dialogo-editar-em-lote.tsx` ou equivalente) — isso é escopo separado; se achar bugs lá, registre em `PENDENCIAS.md` e siga em frente.
- Não instale nenhuma dependência nova.
- Não mude o layout dos outros campos — apenas insira os dois novos campos no lugar especificado.

---

## 3. O que NÃO fazer

- Não toque em `app/supabase/migrations/`.
- Não ative flag de feature na Vercel.
- Não use dados da família real para testar escrita.
- Não quebre testes existentes nem introduza erro de tsc.
- Não altere `src/actions/lancamento.ts` (create action — já funciona).

---

## 4. Verificação esperada (prova por arquivo)

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` SEM `.env.local` carregado — resultado esperado ≥190 skipped, ≥693 passando. Se `skipped` cair para 0, PARE imediatamente.
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** usando `mcp__plugin_playwright_playwright__browser_take_screenshot` em 375px, 768px e 1440px, mais um em dark mode:
  - Diálogo de editar aberto mostrando os dois novos campos (forma de pagamento e responsável).
  - Formulário de criar: confirmar que NÃO foi alterado (os campos já existiam e continuam funcionando).
- Console sem erros (`mcp__plugin_playwright_playwright__browser_console_messages`).
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz, quantos objetos existem, ou como uma plataforma/biblioteca se comporta (Next, Radix, Supabase, Tailwind) só entra em código ou relatório com a saída do comando ou o trecho do código colado ao lado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

Devolva:
- Lista do que mudou (arquivo por arquivo), com linhas alteradas.
- O que foi e o que **não** foi verificado (com motivo).
- Pendências que ficaram abertas (ex: edição em lote ainda falta os campos — registre em `PENDENCIAS.md`).
- Se algo contradisser este briefing, escreva a contradição em vez de contornar.
- Bloco `### Auto-Análise` obrigatório (passes, erros encontrados, correções, lições, pendências).

**Fontes verificadas pelo Maestro:**
- `src/lib/esquemas-edicao-lancamento.ts` (VERIFICADO — linhas 76–249)
- `src/components/transacoes/dialogo-editar-lancamento.tsx` (VERIFICADO — linhas 1–367)
- `src/actions/lancamento.ts` (VERIFICADO — linhas 227–228, create action tem os campos)
- `src/app/(app)/(principal)/inicio/page.tsx` (VERIFICADO — linhas 100–130, não busca payment_methods)
