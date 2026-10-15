# Briefing Rodada 9 — Trocar update direto pelas Server Actions de editar lançamento

O back-end está completo e publicado (`9252760`). Os dois diálogos que
você já construiu (`dialogo-editar-lancamento.tsx` e
`dialogo-editar-em-massa.tsx`) hoje chamam
`supabase.from('transactions').update(...)` direto do navegador — troque
pelas Server Actions reais.

## 1. `dialogo-editar-lancamento.tsx`

**Hoje** (linha ~135): `createClient()` + `.from('transactions').update({...}).eq('id', transacao.id)`.

**Troca para:**
```ts
import { atualizarLancamento } from '@/actions/editar-lancamento'

const resposta = await atualizarLancamento({
  id: transacao.id,
  tipo,                          // 'receita' | 'despesa' | 'transferencia'
  descricao: descLimpa,
  valor: valorNumero,            // number, não string
  data,
  contaId,
  contaDestinoId: tipo === 'transferencia' ? contaDestinoId : undefined,
  categoriaId: tipo === 'transferencia' ? undefined : (categoriaId || null),
  pagoPorId: membroId,
  estaPago,
  dataDoPagamento: estaPago ? dataPagamento : null,
  observacao: observacao.trim() || null,
})

if (!resposta.ok) {
  setErro(resposta.erro)
  // resposta.camposComErro?.contaId, .categoriaId, .valor, etc. — mesmo
  // padrão de erro por campo do resto do app
  return
}
```

**Atenção:**
- `valor` é `number`, não string — se seu input guarda string, converta
  antes de chamar (mesmo padrão que `form-lancamento.tsx` já faz).
- Mais de 2 casas decimais no valor é **recusado**, não arredondado.
- Se o tipo for "transferência", você precisa ter um campo de conta de
  destino na UI (se ainda não tiver, adicione — a action exige
  `contaDestinoId` nesse caso e recusa se for igual à conta de origem).
- Um lançamento de **acerto de contas** não pode ser editado — a action
  recusa com `'Acerto de contas não pode ser editado. Exclua e registre
  de novo.'` em `camposComErro.formulario`. Trate esse erro mostrando a
  mensagem (não deveria normalmente aparecer na UI de editar, já que
  lançamentos de acerto têm descrição própria — mas trate o erro mesmo
  assim).

## 2. `dialogo-editar-em-massa.tsx`

**Hoje** (linha ~135): `createClient()` + `.from('transactions').update(updates).in('id', idsSelecionados)`.

**Troca para:**
```ts
import { atualizarLancamentosEmMassa } from '@/actions/editar-lancamento'

const input: Parameters<typeof atualizarLancamentosEmMassa>[0] = { ids: idsSelecionados }
if (mudarCategoria) input.categoriaId = categoriaId === '__nenhuma__' ? null : categoriaId
if (mudarConta) input.contaId = contaId
if (mudarMembro) input.pagoPorId = membroId
if (mudarStatus) input.estaPago = statusPago === 'pago'

const resposta = await atualizarLancamentosEmMassa(input)

if (!resposta.ok) {
  setErro(resposta.erro)
  return
}
// resposta.dados.atualizados pode ser MENOR que idsSelecionados.length —
// ex.: marcar "pago" em lançamentos que já estavam pagos não conta.
// Mostre esse número no toast de sucesso se fizer sentido ("8 de 10
// lançamentos atualizados").
```

**Atenção:**
- Máximo 50 ids por chamada — se o usuário puder selecionar mais que
  isso, trate (desabilite "Selecionar todos" acima de 50, ou quebre em
  lotes — decisão sua).
- Se **qualquer** id da seleção não pertencer à família, a chamada
  inteira falha com `'Lançamento não encontrado.'` e nada é gravado —
  isso não deveria acontecer no uso normal (a lista vem da própria
  família), mas é bom saber que não há gravação parcial silenciosa nesse
  caso.
- Se a seleção misturar transferências com `mudarCategoria`, a action
  recusa com `'Transferências não têm categoria. Tire as transferências
  da seleção.'` — trate esse erro (idealmente, desabilite "Alterar
  categoria" no diálogo se a seleção tiver alguma transferência).
- Em caso raro de falha de rede no meio de um lote grande, pode retornar
  `'Parte dos lançamentos foi atualizada e parte não. Tente de novo.'` —
  trate mostrando essa mensagem e permitindo tentar de novo (a ação é
  segura de repetir).

## Contrato completo das duas actions (`@/actions/editar-lancamento`)

```ts
atualizarLancamento(input: {
  id: string
  tipo: 'receita' | 'despesa' | 'transferencia'
  descricao: string            // 1-120 caracteres
  valor: number                 // > 0, até 2 casas
  data: string                  // 'YYYY-MM-DD'
  contaId: string
  contaDestinoId?: string | null  // obrigatória se tipo='transferencia'
  categoriaId?: string | null      // ignorada em transferência
  pagoPorId: string
  estaPago: boolean
  dataDoPagamento?: string | null  // obrigatória se estaPago
  observacao?: string | null
}): Promise<ResultadoAction<void>>

atualizarLancamentosEmMassa(input: {
  ids: string[]                 // 1-50
  categoriaId?: string | null    // omitir = não mexe; null = "sem categoria"
  contaId?: string
  pagoPorId?: string
  estaPago?: boolean
}): Promise<ResultadoAction<{ atualizados: number }>>
```

Forma do retorno (igual a toda Server Action do projeto):
```ts
{ ok: true; dados: T } | { ok: false; erro: string; camposComErro?: Record<string, string[]> }
```

## O que NÃO fazer

- Não toque em `src/actions/`, migrations, `src/lib/supabase/`,
  `src/lib/push/`.
- Não altere o comportamento de `DialogoExcluirLancamento` — já usa a
  Server Action real, está correto.

## Verificação esperada

- `npx tsc --noEmit` limpo, `next build` ok.
- Teste manual: editar um lançamento individual (incluindo trocar para
  transferência e voltar), editar em massa (categoria, conta, membro,
  status), confirmar que `/inicio`/`/carteira`/`/acerto`/`/analises`
  refletem a mudança.
- Screenshots nos 3 breakpoints + dark + console limpo.
- Commit por arquivo, `git pull --rebase origin main` antes do push.

Fonte do contrato: `app/src/actions/editar-lancamento.ts` (código real, já
publicado).
