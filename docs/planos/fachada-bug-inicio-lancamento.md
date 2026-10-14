# Plano Fachada: "o lançamento não aparece no Início" (bug relatado pelo Heitor, 2026-10-13)

> FASE: PLANO. Correção pontual, executada na mesma sessão.

## Diagnóstico (com evidência, antes de qualquer edição)

Reproduzido no dev server (`npm run dev`, porta 3000), numa família DESCARTÁVEL
(`bug-inicio-<stamp>@example.com`), nunca na família real.

1. **A hipótese do cache está descartada.** Depois de `salvarLancamento`, o
   `router.replace('/inicio?mes=2026-10')` mostrou o lançamento novo. Voltar ao
   `/inicio` sem querystring pelo menu também mostrou. A página `/inicio` chama
   `await connection()` e não tem `'use cache'`, então não existe cache de
   servidor que a querystring pudesse escapar. E o `revalidatePath` dentro de uma
   Server Function "faz todas as páginas já visitadas atualizarem quando forem
   visitadas de novo" (doc empacotada do Next 16.4:
   `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`,
   em "Good to know"). Não há mudança a fazer na action.

2. **Causa A: o lançamento novo fica fora da tela, abaixo de lançamentos com data futura.**
   A lista ordena por `date desc, created_at desc`. Na família real, leitura
   SOMENTE LEITURA: "Fone" (13/10) fica em 5º lugar, depois de 25/10, 24/10, 15/10
   e 14/10 (contas agendadas e parcelas). Em 375px a lista começa abaixo de dois
   cards grandes, então o item novo fica bem abaixo da dobra. Depois do redirect,
   NADA na tela diz que o lançamento foi salvo. Reproduzido na família de teste
   com 2 linhas futuras: `antes-375-inicio-pos-salvar-full.png`.

3. **Causa B: a tela de lançar fica travada depois do 1º salvamento.**
   `cacheComponents: true` faz o Next 16 preservar a rota em `<Activity hidden>`
   em vez de desmontá-la. Doc: `docs/01-app/02-guides/preserving-ui-state.md`,
   seção "Forms, inputs, and state", que cita literalmente *"A 'new transaction'
   flow where each visit should start fresh"*. O `FormLancamento` mantém
   `concluido=true` e os valores antigos. Na volta ao Lançar, o botão aparece
   "Salvando…" desabilitado, com "Teste A / 10,00" ainda preenchido. Não dá para
   lançar o 2º sem recarregar. Prova: `antes-1440-lancar-travado.png`.

## Arquivos a alterar e criar

| Arquivo | Mudança |
|---|---|
| `app/src/components/transacoes/form-lancamento.tsx` | (B) `useLayoutEffect` com cleanup + ref `deveReiniciar`: quando a Activity esconde a rota depois de um salvamento bem-sucedido, chama `reset()` e `resetLote()` e zera `resultado`, `concluido`, `modo`, os detalhes abertos e `pagamentoEditado`. O botão continua desabilitado até a navegação concluir (regra L-013). (A) O redirect leva `&novo=<id do 1º retornado>&qtd=<n itens enviados>`. |
| `app/src/app/(app)/(principal)/inicio/page.tsx` | Lê `novo` (só UUID, regex) e `qtd` (inteiro de 1 a 50). Procura o lançamento na página carregada; se não estiver, busca por id com a sessão do usuário (RLS). Mostra `<AvisoLancamentoSalvo>` no TOPO, abaixo do seletor de mês, e passa `idDestacado` para a lista e a tabela. O Card de lançamentos ganha `id="lista-lancamentos"` como âncora. |
| `app/src/components/inicio/aviso-lancamento-salvo.tsx` (NOVO) | Server Component. `role="status"`, ícone `Check`, texto "“Fone” salvo: R$ 159,91 em 13/10/2026." (ou "N lançamentos salvos."), link "Ver na lista" (`#lista-lancamentos`) e link de fechar que volta ao `hrefDoMes(mes)` sem `novo`. |
| `app/src/components/transacoes/item-transacao.tsx` | Prop `destacado?: boolean`: fundo `bg-primary/10` + `aria-current="true"`. |
| `app/src/components/transacoes/tabela-transacoes-desktop.tsx` | Prop `idDestacado?: string \| null`, com o mesmo destaque na `<tr>`. |
| `app/src/features/transacoes/copy.ts` | `INICIO.salvoUm(desc, valor, data)`, `INICIO.salvoVarios(n)`, `INICIO.verNaLista`, `INICIO.fecharAviso`. |

## Assinaturas

```ts
// aviso-lancamento-salvo.tsx
export interface AvisoLancamentoSalvoProps {
  descricao: string | null   // null: nenhum lançamento lido (só a contagem)
  valor: number | null
  data: string | null        // YYYY-MM-DD
  quantidade: number         // >= 1
  hrefFechar: string
}
// item-transacao.tsx: + destacado?: boolean
// tabela-transacoes-desktop.tsx: + idDestacado?: string | null
```
Tipos de dado: `Database['public']['Tables']['transactions']['Row']` de `@/types/database` (já usado).

## Fronteira Server/Client
- O aviso, o item e a tabela continuam **Server Components**: não têm estado, efeito nem evento.
- O `form-lancamento.tsx` já é `'use client'`. Só ganha um `useLayoutEffect`.
- Nenhuma prop nova atravessa Server → Client. `idDestacado` é string e vai para Server Components.

## Tokens
`--esp-*`, `--texto-apoio`, `--texto-corpo`, `bg-primary/10`, `border-primary/40`, `text-receita`. Todos já existem em `globals.css`. Nenhum hex ou px novo.

## Rotas e estados
- `/inicio?mes=X&novo=ID`: o aviso aparece. Se o ID não existir ou for de outra família, o RLS devolve vazio e o aviso cai para "Lançamento salvo." sem detalhes; nunca quebra a página.
- `novo` inválido (não UUID) é ignorado em silêncio.
- Os outros estados (vazio, erro, loading) ficam como estão.

## Decisões
- **Não mudar a ordenação** (`date desc`) nem separar "agendados". É decisão de produto: vai como recomendação ao Maestro.
- **Não usar `bfcacheId` como key.** A doc diz "prefer resetting state explicitly… Use bfcacheId only as a last resort".
- **Aviso por URL, não por estado de client.** Sobrevive ao redirect, não exige `'use client'` em `/inicio` e some ao trocar de mês.

## Riscos
- `reset()` volta aos `defaultValues` do 1º render, inclusive `hoje`. Se a aba ficar aberta de um dia para o outro, a data padrão fica velha. Isso já acontecia antes; não piora.
- Uma consulta extra a `transactions` por id, só quando `novo` está presente e o item não está na página atual.

## Ordem de execução
1. Copy (`copy.ts`).
2. `aviso-lancamento-salvo.tsx`.
3. `item-transacao.tsx` e `tabela-transacoes-desktop.tsx` (destaque).
4. `inicio/page.tsx` (lê `novo`/`qtd`, busca, renderiza).
5. `form-lancamento.tsx` (reinício por Activity e redirect com `novo`).
6. `npx tsc --noEmit`, passe de navegador (1440, 768, 375 e dark; console; 2º lançamento seguido), `next build`.
7. Limpar a família de teste e confirmar com a saída real.

## Pendências de handoff
- Estrutura: nenhuma (a action já devolve as linhas com `id`).
- Maestro/produto: decidir se lançamentos com data futura (agendados e parcelas) devem sair do topo da lista do mês.
