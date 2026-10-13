# Briefing Frontend — Rodada 4

> Fonte única desta rodada. Repositório: `C:\dev\financas-a-dois` (ou o clone
> que você já tem — `git pull --rebase origin main` primeiro).
> Commits de referência: `18c327e` (actions reais publicadas), `130ad98`
> (seu relatório da Rodada 3, lido e conferido).

## Resumo do que mudou desde a Rodada 3

Seu relatório da Rodada 3 (seção 8) avisou corretamente: você implementou o
CRUD de categorias/formas de pagamento/contas **localmente**, direto contra o
Supabase do navegador (`createClient()` + `.from('categories').delete()` etc.),
porque as Server Actions reais ainda não tinham sido publicadas. Isso agora
mudou — commit `18c327e` publicou os 4 arquivos:

- `app/src/actions/categorias.ts`
- `app/src/actions/formas-pagamento.ts`
- `app/src/actions/contas.ts`
- `app/src/lib/lista-nomes.ts` (+ `app/src/lib/esquemas-cadastro.ts`)

Verifiquei antes de publicar: `npx tsc --noEmit` limpo, `npx vitest run`
208 passando (23 testes de integração pulados por padrão sem `.env.local`,
e todos os 23 passam quando roda contra o banco real), `categorias-crud.mjs`
30/30 incluindo um controle negativo que prova que o teste de RLS pegaria
um vazamento de verdade. As assinaturas batem exatamente com o que a Rodada 3
prometeu.

## O que fazer agora

**Trocar as implementações locais pelos imports reais** nos componentes que
você já construiu (`gerenciador-categorias.tsx`,
`gerenciador-formas-pagamento.tsx`, `dialogo-conta.tsx`,
`botao-arquivar-conta.tsx`). Isso não é reescrever a tela — é só a camada de
dados por trás do que já está na tela.

### 1. Categorias — `gerenciador-categorias.tsx`

Hoje você chama direto:
```ts
const supabase = createClient()
const { error } = await supabase.from('categories').delete().eq('id', input.id)
```

Troque por:
```ts
import { adicionarCategorias, renomearCategoria, alterarTipoCategoria,
         arquivarCategoria, excluirCategoria, contarUsoCategoria } from '@/actions/categorias'
```

Assinaturas reais:
```ts
adicionarCategorias(input: { nomes: string; tipo: TipoCategoria })
  // -> ResultadoAction<{ criadas: { id: string; nome: string }[]; ignoradas: string[] }>
  // "nomes" é o texto CRU digitado ("Pet, Presentes\nViagem") — a action
  // separa, limpa e aplica os limites. NÃO pré-processe antes de enviar.

renomearCategoria(input: { id: string; nome: string }): Promise<ResultadoAction<void>>
alterarTipoCategoria(input: { id: string; tipo: TipoCategoria }): Promise<ResultadoAction<void>>
arquivarCategoria(input: { id: string; arquivar: boolean }): Promise<ResultadoAction<void>>
excluirCategoria(input: { id: string }): Promise<ResultadoAction<void>>
contarUsoCategoria(input: { id: string }): Promise<ResultadoAction<{ total: number }>>
```

A prévia ao vivo do campo de lote (que mostra os chips enquanto digita) já usa
`separarNomes` de `@/lib/lista-nomes` — isso está certo e **não muda**. O que
muda é só o `onClick`/`onSubmit` final, que hoje grava direto e deve passar a
chamar `adicionarCategorias`.

**Importante — limites compartilhados (não eram, agora são):** confirme que
seu componente usa `LIMITE_CARACTERES` e `LIMITE_NOMES` exportados de
`@/lib/lista-nomes`, e não um número digitado à mão. Se a prévia hoje usa
`40` ou `50` escritos no componente, troque pelo import — é exatamente o erro
que a Rodada 3 preveniu (R-3): prévia e servidor usando a mesma constante.

### 2. Formas de pagamento — `gerenciador-formas-pagamento.tsx`

Mesmo padrão:
```ts
import { adicionarFormasPagamento, renomearFormaPagamento, arquivarFormaPagamento,
         excluirFormaPagamento, contarUsoFormaPagamento } from '@/actions/formas-pagamento'

adicionarFormasPagamento(input: { nomes: string })
  // -> ResultadoAction<{ criadas: { id: string; nome: string }[]; ignoradas: string[] }>
renomearFormaPagamento(input: { id: string; nome: string }): Promise<ResultadoAction<void>>
arquivarFormaPagamento(input: { id: string; arquivar: boolean }): Promise<ResultadoAction<void>>
excluirFormaPagamento(input: { id: string }): Promise<ResultadoAction<void>>
contarUsoFormaPagamento(input: { id: string }): Promise<ResultadoAction<{ total: number }>>
```

Formas de pagamento não têm campo `tipo` (diferente de categoria).

### 3. Contas — `dialogo-conta.tsx` e `botao-arquivar-conta.tsx`

```ts
import { criarConta, editarConta, arquivarConta } from '@/actions/contas'

criarConta(input: {
  nome: string
  tipo: TipoConta            // 'corrente' | 'cartao' (confira o enum real em esquemas-cadastro.ts)
  saldoInicial: number       // em reais, não centavos — a action converte
  diaFechamento?: number | null
  diaVencimento?: number | null
}): Promise<ResultadoAction<{ id: string }>>

editarConta(input: {
  id: string
  nome?: string
  diaFechamento?: number | null
  diaVencimento?: number | null
}): Promise<ResultadoAction<void>>
// "tipo" NÃO é editável — a action nem aceita o campo. Um cartão com faturas
// não pode virar conta corrente. Se sua tela tiver um seletor de tipo no modo
// edição, ele precisa desaparecer ou ficar desabilitado.

arquivarConta(input: { id: string; arquivar: boolean }): Promise<ResultadoAction<void>>
```

A regra do ciclo do cartão (`accounts_cartao_tem_ciclo`: cartão exige
`diaFechamento` e `diaVencimento`, conta corrente não aceita nenhum dos dois)
já é validada **dentro** da action, antes de tocar o banco, e volta como
`camposComErro` por campo. Se seu formulário já faz essa validação no cliente
para feedback imediato, pode manter — é só feedback antecipado, a action
valida de novo e é a fonte de verdade.

### 4. O contrato de erro — `ResultadoAction<T>`

Todas essas actions devolvem o mesmo formato:
```ts
type ResultadoAction<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; camposComErro?: Record<string, string[]> }
```

`erro` é sempre texto em português pronto para mostrar (toast ou mensagem
geral). `camposComErro`, quando vier, é `{ nomeDoCampo: ['mensagem'] }` — use
para destacar o campo específico no formulário, igual ao padrão que você já
usa em `/lancar` e no onboarding.

Chamando (fora de `useActionState`, como as outras actions tipadas deste
projeto):
```ts
const [pendente, startTransition] = useTransition()

function aoSalvar(dados: FormData_ou_objeto) {
  startTransition(async () => {
    const resultado = await adicionarCategorias({ nomes: texto, tipo })
    if (!resultado.ok) {
      exibirErro(resultado.erro)
      return
    }
    // resultado.dados.criadas / resultado.dados.ignoradas
  })
}
```

### 5. O que já está correto e não precisa mudar

- O botão de convite (`bloco-codigo-convite.tsx`) chamando `rotacionar_join_code()` — confirmado certo.
- `/recuperar-senha` e `/nova-senha` — publicadas e funcionando.
- A correção do corte do cartão em 1024px (`c97605c`) — confirmada certa.
- O handler de push em `sw.js` — mantém, o envio real ainda está em desenho no back (Fase B do plano, R-1), vou avisar quando o `servico.ts` estiver pronto.
- `/lancar` com os campos fútil/benefício — confirmado certo contra `lancamento.ts:129-131`.
- Previsão de fixos e parcelas nas Análises — confirmado certo.
- Sons via WebAudio — confirmado certo.

## Depois de trocar os imports

1. `npx tsc --noEmit` — tem que sair limpo. Os tipos `TipoCategoria`/`TipoConta`
   agora vêm de `@/lib/esquemas-cadastro` via re-export das actions; se você
   tinha um tipo local duplicado para isso, pode apagar.
2. Teste manual: criar 3 categorias de uma vez ("Pet, Presentes, Viagem"),
   repetir o mesmo texto (as 3 devem vir em `ignoradas`, nenhuma duplicada),
   excluir uma categoria em uso (os lançamentos que a usavam devem continuar
   existindo, só sem categoria — "Sem categoria" — nunca some o lançamento).
3. Screenshots nos 3 breakpoints (375/768/1440) + dark mode em
   `/ajustes/categorias`, `/ajustes/formas-pagamento`, `/ajustes/contas`, com
   `browser_console_messages` limpo, como nas rodadas anteriores.
4. Commit por arquivo, `git pull --rebase origin main` antes do push (eu e o
   Semeador também publicamos nesse intervalo — o banco de teste foi limpo
   agora: 125 famílias de teste e 66 usuários órfãos removidos, só sobra a
   família real do Heitor e da Carol).

## Fila depois disso

Sem novidade na ordem — siga o que o `BRIEFING-FRONTEND-RODADA3.md` já listou
para o restante da fila (parcelas/lote, transferência, seletor de paleta,
PWA/manifest finais). Vou avisar à parte quando `pagarFatura` e
`registrarAcerto` (as novas Server Actions que vão substituir as chamadas
diretas de `pay_invoice`/`settle_up` em `dialogo-pagar-fatura.tsx` e
`dialogo-acertar.tsx`) estiverem publicadas — **não comece essa troca ainda**,
é um aviso antecipado, não uma tarefa desta rodada.
