# Relatório de Entrega — Front-End Rodada 5 (`Finanças a Dois`)

## 1. Commits publicados em `origin/main`

Todos os arquivos foram commitados individualmente e enviados após `git pull --rebase origin main`:

- `01cc8f1` — `feat(ajustes): adiciona textos de cópia para grupos de categoria`
- `fa5c862` — `feat(ajustes): cria componente GerenciadorGrupos para gestão de pastas de categoria`
- `3184f28` — `feat(ajustes): adiciona seletor de atribuição de grupo por categoria`
- `749e3bc` — `feat(ajustes): carrega grupos de categoria e renderiza GerenciadorGrupos na página de categorias`
- `4eb0532` — `feat(transacoes): adiciona textos de filtro por grupo de categoria`
- `27324d7` — `feat(transacoes): adiciona filtro de grupo acima do seletor de categorias em FormLancamento`
- `d37467e` — `feat(transacoes): busca grupos e group_id de categorias e injeta em FormLancamento na página /lancar`

---

## 2. Componentes e Telas Implementadas

### 2.1 Ajustes > Categorias (`/ajustes/categorias`)
1. **`app/src/components/ajustes/gerenciador-grupos.tsx`:**
   - Criação de novos grupos com chamada à Server Action `adicionarGrupo({ nome })`.
   - Listagem dos grupos da família na ordem natural de criação (`sort_order`, `name`).
   - Renomeação inline de grupos (`renomearGrupo({ id, nome })`) com validação de duplicidade e limite de 40 caracteres.
   - Exclusão com diálogo de confirmação (`excluirGrupo({ id })`), exibindo o total de categorias desvinculadas no alerta de sucesso (ex.: *"Grupo excluído. 2 categorias ficaram sem grupo."*).
   - Sem reordenar nem drag-and-drop, conforme briefing.

2. **`app/src/components/ajustes/gerenciador-categorias.tsx`:**
   - Adicionado seletor `Grupo: [___]` em cada linha de categoria (ativas e arquivadas).
   - Opções exibem todos os grupos existentes + opção `"Nenhum"` (`grupoId: null`).
   - Integração com `atribuirGrupoCategoria({ categoriaId, grupoId })` via `useTransition` e atualização imediata via `router.refresh()`.

3. **`app/src/app/(app)/(principal)/ajustes/categorias/page.tsx`:**
   - Consulta paralela no Supabase trazendo `categories` e `category_groups` ordenados por `sort_order` e `name`.
   - Renderiza `GerenciadorGrupos` no topo e `GerenciadorCategorias` com a lista de grupos injetada.

### 2.2 Seletor de Categorias em Lançar (`/lancar`)
1. **`app/src/components/transacoes/form-lancamento.tsx`:**
   - Inserido seletor `Filtrar por grupo` imediatamente acima do campo `Categoria (opcional)`.
   - Inicia por padrão em `"Todas as categorias"` em cada visita e é limpo ao reiniciar o formulário após salvar.
   - Filtra dinamicamente as categorias pelo grupo selecionado, combinando com o tipo de lançamento (`despesa`, `receita`, `todos`).
   - Reseta a categoria para `"Sem categoria"` se a seleção atual não pertencer ao grupo filtrado.

2. **`app/src/app/(app)/(principal)/lancar/page.tsx`:**
   - Query de categorias atualizada para incluir `group_id`.
   - Busca em paralelo de `category_groups` repassando `grupos` para `FormLancamento`.

---

## 3. Saída literal dos gates de verificação

### 3.1 `npx tsc --noEmit`
```text
(exit code 0 — 0 erros)
```

### 3.2 `npx vitest run`
```text
 RUN  v5.0.3 C:/Users/Heitor PC/OneDrive/Documentos/SEGUNDO CÉREBRO/HORI ANALYTCIS PROJETOS/Finanças a Dois/app

 ↓ tests/integration/grupos-categoria.int.test.ts (23 tests | 23 skipped)
 ↓ tests/integration/acoes-cadastro.int.test.ts (23 tests | 23 skipped)
 ✓ tests/unit/lista-nomes.test.ts (12 tests) 10ms
 ✓ tests/unit/settlement.test.ts (26 tests) 10ms
 ✓ tests/unit/invoice.test.ts (16 tests) 8ms
 ✓ tests/unit/resultado.test.ts (32 tests) 13ms
 ✓ tests/unit/format.test.ts (41 tests) 29ms
 ✓ tests/unit/lancamento-validacao.test.ts (58 tests) 22ms
 ✓ tests/unit/esquemas-cadastro.test.ts (25 tests) 14ms

 Test Files  7 passed | 2 skipped (9)
      Tests  210 passed | 46 skipped (256)
```

### 3.3 `npm run build`
```text
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 1703ms
  Running TypeScript ...
  Finished TypeScript in 4.4s ...
  Collecting page data using 15 workers ...
✓ Generating static pages using 15 workers (21/21) in 1419ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ◐ /acerto
├ ◐ /ajustes
├ ◐ /ajustes/categorias
├ ◐ /ajustes/contas
├ ◐ /ajustes/familia
├ ◐ /ajustes/formas-pagamento
├ ◐ /ajustes/perfil
├ ◐ /analises
├ ○ /cadastro
├ ◐ /carteira
├ ◐ /inicio
├ ◐ /lancar
├ ◐ /login
├ ○ /manifest.webmanifest
├ ○ /nova-senha
├ ƒ /onboarding
└ ○ /recuperar-senha
```

---

## 4. Testes Manuais e Validação Fim a Fim (Playwright)

Executado contra a sessão real de usuário (`horiheitor@gmail.com`):

1. **Criação de grupo no navegador:**
   - Input preenchido com `"Compras online"` e submetido.
   - Grupo criado e renderizado imediatamente na lista.
2. **Atribuição de categorias:**
   - 2 categorias vinculadas ao grupo `"Compras online"` via select na linha.
3. **Filtro em `/lancar`:**
   - Ao selecionar `"Compras online"` no filtro de grupo, apenas as categorias pertencentes a esse grupo foram exibidas.
4. **Exclusão de grupo com categorias vinculadas:**
   - Clicado em excluir `"Compras online"`.
   - Diálogo de confirmação exibido com o texto explicativo.
   - Ao confirmar, o alerta confirmou: *"Grupo excluído. 2 categorias ficaram sem grupo."*
   - As categorias permaneceram existentes e sem grupo.
5. **Erros no console do navegador:** **0 erros**.

---

## 5. Capturas de Tela

Capturadas nos breakpoints 375px, 768px e 1440px nos modos Claro e Escuro:
- `r5-ajustes-categorias-1440-claro.png`
- `r5-ajustes-categorias-1440-escuro.png`
- `r5-ajustes-categorias-768-claro.png`
- `r5-ajustes-categorias-768-escuro.png`
- `r5-ajustes-categorias-375-claro.png`
- `r5-ajustes-categorias-375-escuro.png`
- `r5-lancar-1440-claro.png`
- `r5-lancar-1440-escuro.png`
- `r5-lancar-768-claro.png`
- `r5-lancar-768-escuro.png`
- `r5-lancar-375-claro.png`
- `r5-lancar-375-escuro.png`