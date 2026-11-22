# Briefing Rodada 17 — Forma de pagamento e responsável na edição em massa

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Estado de partida

Commits da Rodada 16 estão em `origin/main`. TSC limpo. 703 testes passando, 190 skipped.

**Esta rodada é 100% front-end.** O back-end já está pronto desde a R16:

- `esquemaAtualizarEmMassa` aceita `formaDePagamentoId: uuid.nullable().optional()` e `responsavelId: uuid.optional()` (VERIFICADO em `src/lib/esquemas-edicao-lancamento.ts` linhas 153–164).
- `planejarEdicaoEmMassa` aplica ambos os campos no patch, com guard de transferência para `owner_member_id` (VERIFICADO mesma linha ~283–311).
- O `.refine` que valida que pelo menos um campo foi enviado já inclui os dois novos campos (VERIFICADO linha ~151).

**O que falta (VERIFICADO em `src/components/transacoes/dialogo-editar-em-massa.tsx`):**

O `DialogoEditarEmMassa` tem 4 opções de alteração em lote: Categoria, Conta, Quem Pagou, Status. Não tem "Forma de pagamento" nem "Responsável".

- Props do componente (linha 38–47): sem `formasDePagamento` e sem prop nova para responsável (membros já existe).
- `handleSubmit` (linha 91): não envia `formaDePagamentoId` nem `responsavelId`.
- UI (linhas 190–366): sem os dois blocos checkbox+seletor correspondentes.

A prop `membros` já existe na interface — só falta usá-la para o campo "Responsável pelo gasto".

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes. Leitura é segura.
- `npx vitest run` SEMPRE SEM `.env.local` carregado. Se `skipped` cair para 0, PARE — risco de escrita em produção.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

**Arquivo:** `src/components/transacoes/dialogo-editar-em-massa.tsx` apenas.

### 2.1 — Adicionar prop `formasDePagamento`

```ts
export interface DialogoEditarEmMassaProps {
  // ... props existentes ...
  formasDePagamento?: ItemSelectOpcao[]  // opcional: se não vier ou vier vazio, o bloco não aparece
}
```

### 2.2 — Adicionar estados locais (após `statusPago`)

```ts
const [mudarFormaPagamento, setMudarFormaPagamento] = React.useState(false)
const [formaDePagamentoId, setFormaDePagamentoId] = React.useState<string>('')

const [mudarResponsavel, setMudarResponsavel] = React.useState(false)
const [responsavelId, setResponsavelId] = React.useState<string>('')
```

### 2.3 — Incluir no reset ao reabrir (dentro do `useEffect`)

```ts
setMudarFormaPagamento(false)
setFormaDePagamentoId(formasDePagamento?.[0]?.id ?? '')
setMudarResponsavel(false)
setResponsavelId(membros[0]?.id ?? '')
```

Atualizar também as dependências do `useEffect`: adicionar `formasDePagamento`.

### 2.4 — Atualizar a guarda de envio

A linha que bloqueia envio sem nenhum campo selecionado (linha ~95 e linha ~382 `disabled`):

```ts
if (!mudarCategoria && !mudarConta && !mudarMembro && !mudarStatus && !mudarFormaPagamento && !mudarResponsavel) {
  setErro('Selecione pelo menos um campo para alterar em lote.')
  return
}
```

### 2.5 — Enviar no `handleSubmit`

```ts
if (mudarFormaPagamento) {
  input.formaDePagamentoId = formaDePagamentoId === '_none' ? null : (formaDePagamentoId || null)
}
if (mudarResponsavel && !temTransferenciaNaSelecao) {
  input.responsavelId = responsavelId || undefined
}
```

Guard: "Responsável" não faz sentido em lote que inclui transferências — bloquear com mensagem de erro, igual ao guard de Categoria.

### 2.6 — Adicionar os dois blocos de UI

Seguir **exatamente o mesmo padrão visual** dos 4 blocos existentes: `rounded-xl border p-3 flex flex-col gap-2.5`, checkbox + label + seletor condicional com `pl-6 pt-1`.

**Bloco "Alterar Forma de pagamento"** — só renderiza se `formasDePagamento && formasDePagamento.length > 0`:

```tsx
{formasDePagamento && formasDePagamento.length > 0 && (
  <div className={cn('rounded-xl border p-3 flex flex-col gap-2.5 transition-colors',
    mudarFormaPagamento ? 'border-primary/50 bg-primary/5' : 'border-border/70 bg-muted/20'
  )}>
    <div className="flex items-center gap-2">
      <Checkbox id="check-mudar-forma" checked={mudarFormaPagamento}
        onCheckedChange={(c) => setMudarFormaPagamento(Boolean(c))} />
      <Label htmlFor="check-mudar-forma" className="text-xs font-semibold cursor-pointer">
        Alterar Forma de pagamento
      </Label>
    </div>
    {mudarFormaPagamento && (
      <div className="pl-6 pt-1">
        <Select value={formaDePagamentoId || '_none'} onValueChange={(v) => setFormaDePagamentoId(v === '_none' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Nenhuma</SelectItem>
            {formasDePagamento.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )}
  </div>
)}
```

**Bloco "Alterar Responsável"** — só renderiza se `membros.length > 1` (igual ao bloco de Quem Pagou):

```tsx
{membros.length > 1 && (
  <div className={cn('rounded-xl border p-3 flex flex-col gap-2.5 transition-colors',
    temTransferenciaNaSelecao && 'opacity-60 bg-muted/10',
    !temTransferenciaNaSelecao && mudarResponsavel && 'border-primary/50 bg-primary/5',
    !temTransferenciaNaSelecao && !mudarResponsavel && 'border-border/70 bg-muted/20',
  )}>
    <div className="flex items-center gap-2">
      <Checkbox id="check-mudar-resp"
        checked={!temTransferenciaNaSelecao && mudarResponsavel}
        disabled={temTransferenciaNaSelecao}
        onCheckedChange={(c) => setMudarResponsavel(Boolean(c))} />
      <Label htmlFor="check-mudar-resp" className={cn('text-xs font-semibold',
        temTransferenciaNaSelecao ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'
      )}>
        Alterar Responsável
      </Label>
    </div>
    {temTransferenciaNaSelecao && (
      <p className="text-[11px] text-muted-foreground pl-6">
        A seleção inclui transferências. Transferências não têm responsável.
      </p>
    )}
    {!temTransferenciaNaSelecao && mudarResponsavel && (
      <div className="pl-6 pt-1">
        <Select value={responsavelId} onValueChange={setResponsavelId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione o responsável" />
          </SelectTrigger>
          <SelectContent>
            {membros.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )}
  </div>
)}
```

### 2.7 — Propagar `formasDePagamento` de onde o componente é chamado

**A PROVAR:** localizar onde `<DialogoEditarEmMassa>` é instanciado (provavelmente em `lista-transacoes-interativa.tsx`) e passar a prop `formasDePagamento` que já foi adicionada à `ListaTransacoesInterativa` na R16.

---

## 3. O que NÃO fazer

- Não altere `src/lib/esquemas-edicao-lancamento.ts` — back-end já pronto.
- Não altere `src/actions/editar-lancamento.ts`.
- Não altere o diálogo de edição individual — foi feito na R16.
- Não instale dependências.
- Não quebre testes existentes nem introduza erro de tsc.

---

## 4. Verificação esperada

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` SEM `.env.local` — ≥190 skipped, ≥703 passando. Se `skipped` = 0, PARE.
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** em 375px, 768px, 1440px + dark mode:
  - Modal de edição em massa aberto com os 6 blocos visíveis.
  - Bloco "Alterar Forma de pagamento" expandido com o seletor.
  - Bloco "Alterar Responsável" expandido com o seletor.
  - Bloco "Alterar Responsável" desabilitado quando há transferência na seleção.
- Console sem erros (`mcp__plugin_playwright_playwright__browser_console_messages`).
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz só entra em relatório com saída do comando ou trecho do código colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

- Lista do que mudou (arquivo por arquivo, com linhas).
- O que foi e o que não foi verificado (com motivo).
- Pendências abertas.
- Bloco `### Auto-Análise` obrigatório.

**Fonte verificada pelo Maestro:** `src/components/transacoes/dialogo-editar-em-massa.tsx` (VERIFICADO — arquivo completo, 404 linhas), `src/lib/esquemas-edicao-lancamento.ts` (VERIFICADO — R16 já preparou o back-end), `src/components/transacoes/lista-transacoes-interativa.tsx` (A PROVAR — localizar a chamada de `DialogoEditarEmMassa` e confirmar que `formasDePagamento` já está disponível ali após R16).
