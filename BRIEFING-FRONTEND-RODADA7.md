# Briefing Rodada 7 — Tela de criar/editar orçamento por categoria

O back-end está completo e publicado (`7b57e75`). O gráfico de progresso de
orçamento já existe em `/analises` (`GraficoOrcamento`, publicado pelo Dash
em `0b9496b`), mas hoje aparece sempre vazio porque não existe nenhuma tela
para você criar um orçamento. Esta rodada fecha isso.

## O que construir

Uma forma de criar/editar/excluir orçamento por categoria e mês. Sugestão
de local: um card novo em **Ajustes > Categorias** (mesma página do
`gerenciador-categorias.tsx` e do `GerenciadorGrupos`), ou um modal
disparado a partir do próprio card vazio em `/analises` — você decide onde
faz mais sentido na navegação, mas documente a escolha.

Fluxo mínimo:
1. Selecionar uma categoria (ver filtro obrigatório abaixo).
2. Selecionar o mês (padrão: mês atual, de `hojeEmSaoPaulo()`).
3. Digitar o valor do limite (reais).
4. Salvar → `definirOrcamento({ categoriaId, mes, valor })`. Chamar de novo
   para a mesma categoria+mês apenas ATUALIZA o valor (é upsert — não cria
   duplicata).
5. Opção de excluir um orçamento existente → `excluirOrcamento({ id })`.

## Decisões de produto já fechadas com o Heitor (não precisa perguntar de novo)

- **Só categorias ATIVAS** aparecem no seletor de "criar orçamento" (não
  arquivadas). Filtre no client: `categorias.filter(c => !c.archived_at)`
  (ou o campo equivalente que a leitura de `categories` já traz).
- **Só categorias de DESPESA ou INVESTIMENTO** aparecem no seletor — uma
  categoria de receita sempre mostraria "gasto: R$0" no gráfico (a view
  `v_orcamento_progresso` só soma `despesa` + `investimento`), então não
  tem utilidade criar orçamento nelas. Filtre por
  `categorias.filter(c => c.type === 'despesa' || c.type === 'investimento')`.
- Essas duas são filtros de UI — o back-end TECNICAMENTE aceita qualquer
  categoria ativa ou arquivada, qualquer tipo (o Estrutura deixou assim de
  propósito, mais simples). A restrição é só na tela.

## Contrato exato das Server Actions (`src/actions/orcamentos.ts`)

```ts
definirOrcamento(input: {
  categoriaId: string  // uuid
  mes: string            // 'YYYY-MM', 2000-01 a 2199-12
  valor: number          // reais, > 0, até 2 casas (mais casas é RECUSADO, não arredondado)
}): Promise<ResultadoAction<{ id: string; categoriaId: string; mes: string; valor: number }>>

excluirOrcamento(input: { id: string }): Promise<ResultadoAction<void>>
```

Forma do retorno (igual a toda Server Action do projeto):
```ts
{ ok: true; dados: T } | { ok: false; erro: string; camposComErro?: Record<string, string[]> }
```

Mensagens de erro possíveis:
- `camposComErro.valor`: `'Valor inválido.'` / `'O valor precisa ser maior
  que zero.'` / `'Esse valor é alto demais.'` / `'Use no máximo 2 casas
  decimais.'` / `'Informe o valor.'`
- `camposComErro.mes`: `'Mês inválido.'` / `'Informe o mês.'`
- `camposComErro.categoriaId`: `'Escolha uma categoria.'`
- `camposComErro.id`: `'Item inválido.'`
- `'Categoria não encontrada.'` (categoria de outra família ou inexistente)
- `'Orçamento não encontrado.'` (ao excluir um id que não existe/não é seu)

## Leitura (sem Server Action — mesmo padrão já usado para `categories`)

Para listar orçamentos já definidos (ex.: mostrar "editar" em vez de
"criar" quando já existe um para aquela categoria+mês):
```ts
supabase
  .from('v_orcamento_progresso')
  .select('*')
  .eq('month', mesAtual) // 'YYYY-MM'
```
Essa view já tem `category_name`, `category_type`, `budget_amount`,
`spent_amount`, `remaining_amount`, `used_ratio` — é a mesma que o Dash já
usa no `GraficoOrcamento`, então provavelmente a tela de criar pode reusar
a mesma leitura da página `/analises` em vez de fazer uma nova.

## O que NÃO fazer nesta rodada

- Não toque em `src/actions/`, migrations, `src/lib/supabase/`.
- Não toque em `src/components/analises/grafico-orcamento.tsx` nem nos
  outros arquivos que o Dash já publicou (`grafico-patrimonio.tsx`,
  `simulador-futil.tsx`, `grafico-linha.tsx`, `*-logica.ts`) — eles já
  estão prontos e verificados, não precisam de ajuste.

## Verificação esperada

- `npx tsc --noEmit` limpo, `next build` ok.
- Teste manual: criar orçamento numa categoria de despesa, confirmar que o
  card em `/analises` passa a mostrar a barra de progresso; editar o mesmo
  orçamento (mesma categoria+mês) e confirmar que atualiza em vez de
  duplicar; excluir e confirmar que o card volta ao estado vazio para
  aquela categoria.
- Screenshots nos 3 breakpoints (375/768/1440) + dark mode + console limpo.
- Commit por arquivo, `git pull --rebase origin main` antes do push.

Qualquer dúvida sobre o contrato, a fonte é
`app/src/actions/orcamentos.ts` (código real, já publicado).
