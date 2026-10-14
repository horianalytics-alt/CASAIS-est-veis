# Plano — Estrutura: grupos de categoria (migration 00011) + correção do P-008

> FASE: PLANO (executado na mesma sessão, por instrução do Maestro: feature pequena e bem definida).
> Repositório: `C:\dev\financas-a-dois`. Banco: hospedado `wxhfgstgjjlmqauogeid`
> (PostgreSQL 17.11, `server_encoding` UTF8, `datcollate` en_US.UTF-8 — medidos com
> `select version(), current_setting('server_encoding'), ...`). Não existe banco local.

## 1. Requisito (decidido pelo Heitor, via Maestro)

- Grupo = pasta. Cada categoria pertence a **no máximo um** grupo, ou a nenhum.
  -> coluna `categories.group_id` nullable; **não** há tabela N:N.
- Atribuição por menu simples (um seletor por categoria em Ajustes).
- Excluir um grupo **só desvincula** as categorias; nunca as exclui e nunca é bloqueado.

## 2. Arquivos

| Ação | Caminho |
|---|---|
| criar | `app/supabase/migrations/00011_grupos_categoria_e_nome_normalizado.sql` |
| criar | `app/src/actions/grupos-categoria.ts` |
| criar | `app/src/lib/esquemas-grupos.ts` (Zod; módulo `'use server'` só exporta funções async) |
| alterar | `app/src/actions/resultado.ts` (mensagem do 23505 de `category_groups_nome_unico`) |
| alterar | `app/src/lib/lista-nomes.ts` (paridade com o índice — ver D5; é desvio do "src/lib/ novo") |
| alterar | `app/tests/unit/lista-nomes.test.ts` (casos de invisível/espaço exótico) |
| criar | `app/tests/integration/grupos-rls.sql` (teste de isolamento por SQL, sempre em rollback) |
| criar | `app/tests/integration/grupos-rls.mjs` (runner do .sql acima) |
| criar | `app/tests/integration/grupos-categoria.int.test.ts` (Server Actions contra o banco real) |
| regenerar | `app/src/types/database.ts` (último passo da migration) |
| NÃO tocar | `src/components/`, `src/app/` (Antigravity) |

## 3. Schema proposto (00011)

1. **`public.chave_nome(text) RETURNS text`** — `LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE`,
   `SET search_path = ''`, todas as chamadas qualificadas com `pg_catalog.`. Ordem:
   remove invisíveis `[U+200B-U+200D U+2060 U+FEFF U+00AD]` -> `normalize(…, 'NFD')` -> remove
   marcas combinantes `[U+0300-U+036F]` -> colapsa a classe EXPLÍCITA de espaço do JS `\s`
   (`\t\n\v\f\r`, espaço, U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F,
   U+3000) em um espaço -> `btrim` -> `lower`.
   `REVOKE EXECUTE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated, service_role`
   (quem insere numa tabela com índice de expressão precisa de EXECUTE na função).
2. **`public.category_groups`**: `id uuid PK default gen_random_uuid()`,
   `family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE`,
   `name text NOT NULL CHECK (length(btrim(name)) > 0)`, `sort_order int NOT NULL DEFAULT 0`,
   `created_at timestamptz NOT NULL DEFAULT now()`, `UNIQUE (family_id, id)` (alvo da FK composta).
   Índices: `idx_category_groups_family_id (family_id)`;
   `category_groups_nome_unico UNIQUE (family_id, public.chave_nome(name))` — sem `WHERE`,
   grupo não tem arquivamento.
3. **`categories.group_id uuid NULL`** + FK composta
   `categories_family_id_group_id_fkey (family_id, group_id) REFERENCES category_groups(family_id, id) ON DELETE SET NULL (group_id)`
   + índice `idx_categories_family_group (family_id, group_id)`.
4. **P-008, decidido corrigir nesta migration**: `DROP INDEX` + `CREATE UNIQUE INDEX` com os
   MESMOS nomes (`categories_nome_ativo_unico`, `payment_methods_nome_ativo_unico`), trocando
   `lower(btrim(name))` por `public.chave_nome(name)`; mesmo `WHERE archived_at IS NULL`.
   Pré-checagem dentro da migration: aborta com mensagem se a chave nova colidir em dado existente.
5. **RLS de `category_groups`**: `ENABLE ROW LEVEL SECURITY`; 4 policies `TO authenticated`,
   uma por operação, todas `family_id = (SELECT public.get_user_family_id_self())` — igual ao
   que está vigente em `categories` (lido de `pg_policies` no banco hospedado):
   `select` USING; `insert` WITH CHECK; `update` USING + WITH CHECK; `delete` USING.
   `REVOKE ALL … FROM anon, PUBLIC; GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`.
6. Bloco `DO` de auto-verificação: aborta se faltar tabela, RLS, as 4 policies, a FK com
   `SET NULL (group_id)`, os 3 índices únicos usando `chave_nome`, ou se `chave_nome` não for IMMUTABLE.

`categories` não ganha policy nova: `group_id` vive numa tabela já coberta por 4 policies
por `family_id`; a FK composta é o que impede apontar para grupo de OUTRA família.

## 4. Decisões

| # | Decisão | Por quê | Fonte |
|---|---|---|---|
| D1 | FK **composta** `(family_id, group_id)`, não `REFERENCES category_groups(id)` simples como no briefing | Mesmo comportamento pedido (SET NULL, nunca bloqueia), mas com FK simples uma categoria da família A poderia apontar para um grupo da família B via PostgREST (a policy de `categories_update` só olha o `family_id` da categoria). Padrão do schema desde 00001; `SET NULL (coluna)` para não zerar `family_id` (bug real corrigido na 00009). | 00001/00009; `supabase-postgres-best-practices` › schema-foreign-key-indexes (índice na FK) |
| D2 | Função própria `chave_nome` com `normalize` + regex, **sem** extensão `unaccent` | Expressão de índice exige função IMMUTABLE; `unaccent()` é STABLE e a extensão não está instalada (`pg_extension` = plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault). `normalize` é IMMUTABLE (`provolatile = 'i'`, medido). Classe de espaço explícita em vez de `\s` do Postgres, que depende do locale — com a lista explícita a função é de fato imutável. | Documentação do PostgreSQL, CREATE INDEX ("functions used in index expressions must be marked IMMUTABLE"). A skill `supabase-postgres-best-practices` não tem regra sobre normalização em índice de expressão — sem fonte da skill para D2, declarado. |
| D3 | Corrigir P-008 nesta migration | 0 colisões com a chave nova nos dados existentes (15 categorias ativas, 6 formas — medido, só contagem); tabelas minúsculas, lock de instantes. Mesmos nomes de índice -> `resultado.ts` continua mapeando o 23505. | medição abaixo |
| D4 | Índice parcial `WHERE archived_at IS NULL` mantido em categories/payment_methods | Comportamento publicado (arquivada não ocupa nome) não muda | `supabase-postgres-best-practices` › query-partial-indexes |
| D5 | `lista-nomes.ts`: `limparNome` passa a remover invisíveis; `chaveDeComparacao` reordenada (marcas antes de colapsar espaço) | Paridade exata com `chave_nome`. Antes: 5/20 casos batiam entre JS atual e índice atual; a chave JS antiga também errava 6 casos: zero-width na ponta e no meio (4, 5), BOM (11), acento solto entre espaços (13), soft hyphen (16) e word joiner (17). Depois: 20/20. Arquivo é meu (back-end), mas é importado pela prévia do front — muda a prévia para melhor, sem mudar assinatura. | saída da paridade abaixo |
| D6 | Actions em arquivo novo `grupos-categoria.ts`; atribuição por action própria `atribuirGrupoCategoria` (não um campo opcional em `renomearCategoria`) | Mantém o contrato publicado de `categorias.ts` intacto (o Antigravity já consome) e dá ao seletor "grupo: ___" uma action de um só propósito | contrato `ResultadoAction<T>` de `resultado.ts` |
| D7 | `adicionarGrupo` recebe UM nome (não lote como categorias) | Briefing nomeia `adicionarGrupo` no singular; grupo é criado um por vez na UI | briefing do Maestro |
| D8 | Grupo não tem tipo (receita/despesa) e não tem arquivamento | Não pedido; grupo pode conter categorias de tipos diferentes; `/lancar` filtra por tipo E por grupo | — (ver pergunta 3) |

Paridade JS × SQL (somente `SELECT` sobre `VALUES`, nada gravado):

```
=== ATUAL (índice 00009 lower(btrim) + chave JS atual) ===
... 5/20 casos OK
=== PROPOSTA (expressão nova + chave JS nova) ===
... 20/20 casos OK
```
(saída completa no relatório de execução)

Pré-checagem de colisão com a chave nova (só contagem):
```
{"categorias_ativas":15,"colisoes_categorias":0,"colisoes_formas":0,"formas_ativas":6}
```

## 5. Assinaturas (`app/src/actions/grupos-categoria.ts`)

```ts
adicionarGrupo(input: { nome: string }): Promise<ResultadoAction<{ id: string; nome: string }>>
renomearGrupo(input: { id: string; nome: string }): Promise<ResultadoAction<void>>
excluirGrupo(input: { id: string }): Promise<ResultadoAction<{ categoriasDesvinculadas: number }>>
atribuirGrupoCategoria(input: { categoriaId: string; grupoId: string | null }): Promise<ResultadoAction<void>>
```

Zod (`esquemas-grupos.ts`): `nome` = `limparNome` + 1..`LIMITE_CARACTERES` (40); ids `uuid`;
`grupoId` `uuid | null`. Erros: `'Grupo não encontrado.'`, `'Categoria não encontrada.'`,
`'Já existe um grupo com esse nome.'` (com `camposComErro.nome`), mais os de `traduzErroDoBanco`.
Ordem em toda action: Zod -> `obterContextoDaFamilia()` (`getUser` + família no servidor) ->
consulta filtrada por `family_id` -> RLS como segunda camada.

Leitura (sem action, como já é feito com `categories` nas páginas):

```ts
supabase.from('category_groups').select('id, name, sort_order').order('sort_order').order('name')
supabase.from('categories').select('id, name, type, group_id, ...')   // group_id: string | null
```

Tipos: `Database['public']['Tables']['category_groups']['Row']` e
`Database['public']['Tables']['categories']['Row']['group_id']` em `@/types/database`.

## 6. Riscos

- `DROP INDEX`/`CREATE UNIQUE INDEX` em `categories`/`payment_methods` pega lock exclusivo
  por instantes. Tabelas com 15 e 6 linhas ativas. Sem `CONCURRENTLY` (não roda em transação
  e a migration é transacional).
- O teste de RLS e o "vermelho" rodam o rascunho da migration DENTRO de uma transação no banco
  de produção, que termina SEMPRE em `RAISE EXCEPTION` (rollback garantido — L-005 usada a
  favor). Prova de que nada ficou: `to_regclass('public.category_groups')` nulo depois do vermelho.
- `chave_nome` faz parte de 3 índices: mudar o corpo dela no futuro exige `REINDEX` dos três.
- Família real: a migration só acrescenta coluna nula em `categories` e recria índices. Prova:
  hash das colunas originais de categories/payment_methods antes e depois (mesmo hash).
- Migration destrutiva? Não. Nenhum dado é apagado ou alterado; `DROP INDEX` só de índice.

## 7. Ordem de operações

1. Contagem global (families/auth.users/transactions/categories/payment_methods) + hash da
   família real (categories, payment_methods) — ANTES.
2. Unit: casos novos em `lista-nomes.test.ts` -> vermelho -> mudar `lista-nomes.ts` -> verde.
3. Escrever `grupos-rls.sql` + runner. Rascunho da 00011 SEM o bloco de RLS -> rodar em
   rollback -> **VERMELHO** (vazamento). Acrescentar o bloco de RLS -> rodar em rollback -> verde.
4. `db push --db-url` -> `migration list` mostra 00011 em Remote.
5. `grupos-rls.mjs` contra o schema aplicado -> verde.
6. `gen types` -> `database.ts`.
7. `grupos-categoria.int.test.ts` escrito antes das actions -> vermelho -> actions -> verde.
   Regressão: `acoes-cadastro.int.test.ts` (usa os índices recriados).
8. `tsc --noEmit`, `vitest run`, contagem global + hash DEPOIS (iguais ao passo 1).
9. `security-review`, varredura de segredo, commit.

## 8. Perguntas ao Maestro (não bloqueiam)

1. Reordenar grupos (arrastar/subir) — `sort_order` existe, mas não há action de reordenar. Precisa?
2. O seletor de `/lancar` deve lembrar o último grupo usado? É estado de UI (Antigravity), não de banco.
3. Grupo misto (receita + despesa no mesmo grupo) é aceitável? Hoje é permitido; se o Heitor
   quiser grupo só de despesa, vira coluna `type` em `category_groups` numa migration nova.
