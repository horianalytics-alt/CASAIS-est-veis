# Briefing Rodada 5 — Grupos de categoria (pastas) em Ajustes e no seletor de Lançar

O back-end desta feature já está publicado e verificado em produção
(commit `6df56d8`). Esta rodada é só front: nenhuma migration, nenhuma
Server Action nova para você escrever — só consumir o que já existe.

## O problema que isso resolve

O Heitor relatou: ao lançar, o seletor de categoria mostra todas as
categorias numa lista só, e ele fica "scrolando o campo de categoria para
achar a que eu quero perdida no meio de váriassss, tudo aleatório".

## O que construir

### 1. Em Ajustes > Categorias: gerenciar grupos

Nova seção (pode ser um card novo acima ou ao lado do gerenciador de
categorias existente, `gerenciador-categorias.tsx`) para:

- **Listar os grupos existentes** da família, ordenados por `sort_order`
  depois por `name` — leitura direta, sem Server Action (mesmo padrão já
  usado para ler `categories`):
  ```ts
  const { data: grupos } = await supabase
    .from('category_groups')
    .select('id, name, sort_order')
    .order('sort_order')
    .order('name')
  ```
- **Criar grupo**: campo de texto + botão, chama `adicionarGrupo({ nome })`.
- **Renomear grupo**: chama `renomearGrupo({ id, nome })`.
- **Excluir grupo**: chama `excluirGrupo({ id })` — retorna
  `{ categoriasDesvinculadas: number }`. Mostre essa contagem na
  confirmação ou no toast de sucesso (ex.: "Grupo excluído. 3 categorias
  ficaram sem grupo."). **Excluir grupo nunca exclui categoria** — elas só
  perdem o vínculo.
- **Atribuir categoria a um grupo**: em cada linha da lista de categorias
  (no `gerenciador-categorias.tsx` já existente), adicione um seletor
  "Grupo: ___" com as opções = grupos da família + uma opção "Nenhum"
  (`grupoId: null`). Ao trocar, chama
  `atribuirGrupoCategoria({ categoriaId, grupoId })`.
- **Decisões já fechadas com o Heitor** (não precisa perguntar de novo):
  - **Sem reordenar grupos nesta rodada** — eles aparecem na ordem de
    criação. Não construa drag-and-drop nem botões de mover.
  - **Grupo pode misturar categorias de receita e despesa** — é só uma
    etiqueta visual, sem validação de tipo.
  - **Atribuição é por menu simples** ("grupo: ___"), não por
    arrastar-e-soltar.

### 2. Em `/lancar`: filtrar o seletor de categoria por grupo

No `FormLancamento` (`src/components/transacoes/form-lancamento.tsx`), o
seletor de categoria hoje é uma lista plana (`categoriasDoTipo`). Adicione
um filtro por grupo ACIMA do seletor de categoria:

- Um `Select` (ou chips/tabs, à sua escolha de UX) com os grupos da
  família + opção "Todas as categorias" (sem filtro).
- Ao escolher um grupo, o `Select` de categoria abaixo mostra só as
  categorias cujo `group_id` bate com o grupo escolhido (e que também
  batem com `tipo` como já filtra hoje).
- **Decisão já fechada:** o filtro de grupo SEMPRE começa em "Todas as
  categorias" ao abrir a tela — não lembre o último grupo usado entre
  visitas. É estado só deste componente (`useState`), não precisa
  persistir em lugar nenhum.
- Você vai precisar que a página `/lancar` (`src/app/(app)/(principal)/lancar/page.tsx`)
  passe `group_id` junto no `select` de categorias que ela já faz hoje:
  ```ts
  supabase.from('categories').select('id, name, type, group_id')...
  ```
  e o tipo `OpcaoDeCategoria` em `form-lancamento.tsx` ganha o campo
  `grupoId: string | null`.
- Aplique o mesmo filtro no formulário em lote, se fizer sentido para a UX
  (decisão sua — o lote já tem um seletor de categoria por item).

## Contrato exato das Server Actions (`src/actions/grupos-categoria.ts`)

```ts
adicionarGrupo(input: { nome: string }): Promise<ResultadoAction<{ id: string; nome: string }>>
renomearGrupo(input: { id: string; nome: string }): Promise<ResultadoAction<void>>
excluirGrupo(input: { id: string }): Promise<ResultadoAction<{ categoriasDesvinculadas: number }>>
atribuirGrupoCategoria(input: { categoriaId: string; grupoId: string | null }): Promise<ResultadoAction<void>>
```

Forma do retorno (igual a toda Server Action do projeto):
```ts
{ ok: true; dados: T } | { ok: false; erro: string; camposComErro?: Record<string, string[]> }
```

Mensagens de erro possíveis (todas em português, prontas pra tela):
- Validação: `erro: 'Confira os campos destacados.'`, com `camposComErro.nome`
  (`'Informe o nome.'` ou `'Use no máximo 40 caracteres.'`) ou
  `camposComErro.grupoId` (`'Escolha um grupo ou "nenhum".'` — atenção:
  mandar `undefined` em vez de `null` explícito para "sem grupo" é
  rejeitado pela validação).
- Nome duplicado: `'Já existe um grupo com esse nome.'` (não diferencia
  caixa, acento nem espaço extra — mesmo padrão de categorias/formas de
  pagamento).
- Id de outra família ou inexistente: `'Grupo não encontrado.'` /
  `'Categoria não encontrada.'` — nunca revela que a linha existe.

Exemplo de chamada (padrão `useTransition` já usado em
`gerenciador-categorias.tsx`):
```ts
const [pendente, iniciar] = useTransition()
const [resultado, setResultado] = useState<ResultadoAction<void> | null>(null)

iniciar(async () => {
  const r = await atribuirGrupoCategoria({ categoriaId, grupoId })
  setResultado(r)
  if (r.ok) { /* sucesso */ } else { /* r.erro, r.camposComErro */ }
})
```

## Tipos (já regenerados em `src/types/database.ts`)

```ts
Database['public']['Tables']['category_groups']['Row']
// { id: string; family_id: string; name: string; sort_order: number; created_at: string }

Database['public']['Tables']['categories']['Row']['group_id']
// string | null
```

## O que NÃO fazer nesta rodada

- Não crie Server Action nova — as 4 que existem cobrem tudo.
- Não toque em migrations, `src/actions/`, `src/lib/supabase/`.
- Não implemente reordenar grupos, restrição de tipo por grupo, nem
  "lembrar último filtro" — todos descartados nesta rodada por decisão do
  Heitor (podem voltar numa rodada futura se fizerem falta de verdade).

## Verificação esperada (mesmo padrão das rodadas anteriores)

- `npx tsc --noEmit` limpo.
- `next build` ok.
- Teste manual: criar grupo "Compras online", atribuir 2-3 categorias a
  ele, ir em `/lancar`, filtrar pelo grupo e confirmar que só essas
  categorias aparecem. Excluir o grupo e confirmar que as categorias
  voltam a aparecer sem grupo (não desaparecem, não dão erro).
- Screenshots nos 3 breakpoints (375/768/1440) + dark mode + console limpo,
  tanto da seção de grupos em Ajustes quanto do filtro em `/lancar`.
- Commit por arquivo, `git pull --rebase origin main` antes do push.

Qualquer dúvida sobre o contrato das actions, a fonte é
`app/src/actions/grupos-categoria.ts` (código real, já publicado) — pode
ler direto se precisar confirmar algum detalhe que este briefing não
cobriu.
