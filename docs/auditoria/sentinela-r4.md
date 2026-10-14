# Auditoria Sentinela — Rodada 4 (categorias/formas/contas + limpeza do banco)

**Status:** auditoria INTERROMPIDA por rate limit da sessão do agente
(`session limit · resets 3pm America/Sao_Paulo`), consolidada pelo Maestro a
partir das evidências já gravadas em `docs/auditoria/evidencias/`. O agente
não chegou a escrever este relatório nem a limpar as famílias de teste que
criou — ambas as pendências foram fechadas pelo Maestro (ver seção final).

**Escopo coberto:** isolamento multi-tenant das Server Actions de
categorias/formas/contas (`18c327e`), validação Zod e idioma, regra de
exclusão-em-uso, imutabilidade de tipo de conta, índice único normalizado,
arredondamento monetário, limite de tamanho de texto. **Não coberto** (a
sessão caiu antes): revisão da migration `00009` (FK `SET NULL` por coluna),
teste do hook `PreToolUse` de independência, revisão do `v_settlement`
(achado posterior do Maestro, ver `PENDENCIAS.md`).

**Veredicto parcial: APROVADO COM RESSALVAS.** Nenhum achado CRÍTICO. Três
achados MÉDIO/BAIXO, nenhum bloqueante para uso do casal, mas válidos para
corrigir.

---

## 1. Isolamento multi-tenant — CONFIRMADO seguro

Evidência: `evidencias/sentinela-r4-hostil.run1.out.txt`, `run2.out.txt`.

Duas famílias de teste descartáveis (A e B), A tentando atacar B sabendo o
UUID exato:

- **Pelas Server Actions** (`renomearCategoria`, `alterarTipoCategoria`,
  `arquivarCategoria`, `excluirCategoria`, `contarUsoCategoria`,
  `renomearFormaPagamento`, `arquivarFormaPagamento`, `excluirFormaPagamento`,
  `editarConta`, `arquivarConta`): as 10 chamadas de A sobre recursos de B
  retornaram `ok:false` com "não encontrada/não encontrado" — nunca um erro
  de permissão que revelasse a existência do recurso. Estado de B depois:
  intacto.
- **PostgREST direto com a sessão de A**: `select`/`update`/`delete` por id
  de B retornaram 0 linhas; `insert` com `family_id` de B retornou
  `42501` (RLS); `insert` com `family_id` da família REAL do Heitor também
  `42501`; tentativa de apontar uma transação de A para uma categoria de B
  (embed cross-tenant) retornou `23503` (FK) — bloqueado em duas camadas
  (RLS + FK), não só uma.

**Confiança: CONFIRMADO.** RLS e FKs seguram o isolamento mesmo quando o
atacante já sabe o UUID exato do recurso alheio.

## 2. Validação Zod e idioma — CONFIRMADO

Evidência: `run2.out.txt` linhas 18-26.

18 entradas hostis/invunder (vazio, só espaços/vírgulas, 41 chars, 10k
chars, lote de 51, tipo inválido, tipo numérico, array em vez de string,
input `null`, SQL-injection-like no id, etc.) — todas rejeitadas com
`ok:false` e mensagem em português. Varredura por palavras do Zod em inglês
("Invalid", "Required", "Expected"...) no JSON inteiro das 18 respostas:
**zero ocorrências**. Limites exatos (40 chars, 50 nomes) aceitos
corretamente no boundary.

**Confiança: CONFIRMADO.**

## 3. Payloads hostis armazenados como texto (XSS/SQLi) — CONFIRMADO seguro

Evidência: `run2.out.txt` linhas 27-30.

`<img src=x onerror=alert(1)>`, `'; drop table categories; --`, acentos e
aspas, zero-width space — todos aceitos e armazenados como texto puro (a
Action não executa, não interpola em SQL dinâmico). Isso é o comportamento
correto para uma Action que usa client parametrizado; o risco de XSS real
só existiria se o Fachada renderizasse esse texto sem escapar — está fora do
escopo desta auditoria (é auditoria de front, não de back).

## 4. Exclusão em uso preserva o lançamento — CONFIRMADO

Evidência: `run2.out.txt` linhas 31-34.

Categoria e forma de pagamento em uso por uma transação: ao excluir, a
transação sobrevive com `category_id`/`payment_method_id` NULL,
`family_id`, `amount` e `description` inalterados. Confirma que a migration
`00009` (FK `SET NULL` por coluna) está funcionando — a exclusão não
"vazou" para `family_id` (que é NOT NULL e quebraria a linha inteira se o
`SET NULL` fosse sem lista de colunas, o bug original que a `00009`
corrigiu).

## 5. Tipo de conta imutável — ACHADO MÉDIO (defesa só na Action, não no banco)

Evidência: `run2.out.txt` linha 35-38.

`editarConta` corretamente ignora o campo `tipo` mesmo quando o chamador
tenta forçá-lo (`{ tipo: 'cartao', type: 'cartao' }` como `never`) — a conta
continua `corrente`. **Mas** o mesmo usuário, pelo cliente Supabase direto
(mesma sessão, mesmo RLS), consegue:

```
A.cli.from('accounts').update({ type: 'investimento' }).eq('id', nova.id)
  → sucesso, type muda para 'investimento'
A.cli.from('accounts').update({ type: 'cartao', closing_day: 10, due_day: 20 })
  → sucesso, type muda para 'cartao'
```

A regra "tipo de conta não muda depois de criada" (decisão registrada no
`PLANO.md`) existe **só na camada da Server Action**, não como constraint
no banco. Qualquer código futuro que escreva direto via PostgREST (um
import/CSV, uma automação, um bug que não passe pela Action) contorna a
regra sem nenhum erro.

**Severidade: MÉDIA.** Não é um buraco de isolamento entre famílias (RLS
segue correto — só o próprio dono muda sua própria conta), é a ausência de
defesa em profundidade para uma regra de negócio que o produto depende.

**Sugestão para o Estrutura:** trigger `BEFORE UPDATE` em `accounts` que
rejeita mudança de `type` quando a conta já tem transação associada (ou,
mais simples e mais rígido: rejeitar sempre, replicando a decisão do
`PLANO.md` de que tipo nunca muda depois de criada).

## 6. Índice único normalizado tem brechas — ACHADO MÉDIO

Evidência: `run2.out.txt` linha 39-42.

PostgREST direto (sem passar pela normalização da Action) testou 8
variantes de "Mercado" como nome de forma de pagamento:

| Variante | Resultado direto | Bloqueado pelo índice? |
|---|---|---|
| `Mercado` | criado | — (primeiro) |
| `mercado ` (trailing space) | `23505` | SIM |
| `  MERCADO` (leading spaces) | `23505` | SIM |
| `Mercado\t` (tab) | criado | **NÃO** |
| `Mercado ` (outro trailing) | criado | **NÃO** — inconsistente com a linha 2 |
| `Mer  cado` (espaço duplo interno) | criado | **NÃO** |
| `Mércado` (acento) | criado | **NÃO** |
| `Mercado​` (zero-width space) | criado | **NÃO** |

6 das 8 variantes visualmente idênticas ou quase idênticas a "Mercado"
foram aceitas como nomes DIFERENTES pelo índice único do banco — o usuário
veria "Mercado", "Mercado" e "Mércado" como 3 formas de pagamento distintas
na lista, sem conseguir perceber a diferença visualmente. A normalização
usada pela Server Action (`chaveDeComparacao()` em `lista-nomes.ts` — NFD +
strip diacríticos + lowercase + colapso de espaço) resolve isso
corretamente quando o caminho é a Action (linha 43-46: `v1`, `v2`, `v3`
todos corretamente ignorados como duplicata de "mercado"), mas o índice do
banco em si usa uma normalização mais simples (provavelmente só
`lower(trim())`), então não é uma segunda camada real — é decorativa para
esses casos.

**Severidade: MÉDIA.** Hoje só existe um caminho de escrita (a Action), que
já normaliza certo — então não há exploração real possível pelo app atual.
O risco é de regressão futura: se algum código novo inserir direto, ou se a
normalização da Action divergir da do índice, duplicatas voltam a existir
silenciosamente.

**Sugestão para o Estrutura:** alinhar a expressão do índice único no banco
com a MESMA normalização de `chaveDeComparacao()` (remover diacríticos via
`unaccent()` ou equivalente, colapsar espaço com regex, e tratar
zero-width/tab explicitamente) — ou documentar como risco aceito se a
decisão for "só a Action escreve, então não duplica na prática".

## 7. Tamanho de texto sem limite no banco — ACHADO BAIXO

Evidência: `evidencias/sentinela-r4-tamanho-direto.out.txt`.

PostgREST direto aceitou um nome de categoria com **10.000 caracteres**, um
nome de forma de pagamento com 10.000 caracteres, e uma categoria cujo nome
é só um zero-width space (visualmente vazio). A Server Action já rejeita
isso (`LIMITE_CARACTERES=40`, confirmado na seção 2) — mas de novo, só na
Action, não como `CHECK (char_length(name) <= N)` no banco.

**Severidade: BAIXA.** Mesmo raciocínio da seção 5/6: hoje sem exploração
real possível (só a Action escreve), risco é de regressão futura ou de um
provedor de storage cobrando por linha gigante sem motivo.

## 8. Arredondamento monetário com erro de ponto flutuante — ACHADO BAIXO

Evidência: `evidencias/sentinela-r4-arredondamento.out.txt`.

A expressão `Math.round(numero * 100) / 100` usada em
`app/src/actions/lancamento.ts` (schema `valor`) tem o erro clássico de
ponto flutuante binário para valores na borda de 0,005:

```
1.005   -> 1       (esperado: 1.01 ou 1.00, nunca perder o centavo em silêncio)
10.075  -> 10.07    (esperado: 10.08 pela convenção de arredondamento "half up")
-2.345  -> -2.35
0.30000000000000004 -> 0.3   (este caso, coincidentemente, arredonda certo)
```

Isso só afeta quem digitar um valor com 3+ casas decimais (ex.: colar de
uma calculadora, ou de uma nota fiscal com imposto fracionado) bem na
borda de arredondamento — o formulário já formata para 2 casas na maioria
dos fluxos normais de digitação, então a exposição real é baixa, mas é um
bug de verdade: o valor salvo pode divergir do que o usuário digitou por
1 centavo, silenciosamente, sem erro de validação.

**Severidade: BAIXA** (exposição rara) mas a correção é simples e vale
fazer: trocar por arredondamento decimal-safe (ex.: operar em string ou usar
`Number(numero.toFixed(2))` só depois de evitar o erro binário — ou a
técnica de somar um epsilon muito pequeno antes do `Math.round`, ou fazer a
conta em centavos inteiros desde a entrada em vez de reais fracionários).

**Sugestão para o Estrutura:** corrigir a função `valor` em
`app/src/actions/lancamento.ts` (mesma técnica provavelmente vale para
qualquer outro schema Zod de dinheiro no projeto — buscar por
`Math.round(` em `src/actions/`).

## 9. Corrida em criação de categoria (Saúde x Saude simultâneo) — observação, sem achado

Evidência: `run2.out.txt` linha 43-46.

Duas chamadas `adicionarCategorias` em paralelo, uma com "Saúde Corrida" e
outra com "Saude Corrida" (mesma chave normalizada), ambas retornaram
`ok:true` e **ambas foram criadas** — o banco ficou com duas categorias que
a normalização da aplicação deveria ter detectado como duplicata uma da
outra. Isso é uma condição de corrida real: a Action lê "já existe?" antes
de inserir, e as duas chamadas paralelas leram "não existe" ao mesmo tempo.

**Não registrado como achado formal** porque o índice único do banco (a
mesma normalização simples da seção 6) não cobre acento, então ele também
não teria bloqueado essa corrida especificamente — mas se a seção 6 for
corrigida (índice alinhado com `chaveDeComparacao()`), essa corrida também
seria resolvida de graça, porque a segunda inserção bateria no índice único
e falharia com erro tratável. **Registrar como consequência da correção da
seção 6, não como item separado.**

---

## Pendências que o agente não fechou (fechadas pelo Maestro depois)

1. **4 famílias de teste não limpas** (`Sentinela R4 a/b`, duas vezes —
   uma por `run1`, outra por `run2`/testes de tamanho/arredondamento), com
   75 categorias, 89 formas de pagamento, 5 contas e 1 transação de teste
   remanescentes no banco real. O `afterAll` do teste só IMPRIME os ids
   criados ("NÃO apagados pelo Sentinela") em vez de limpar — isso é uma
   lição de processo: um teste hostil que cria dado real no banco hospedado
   precisa limpar no próprio `afterAll`/`finally`, não depender de uma
   segunda pessoa rodar um script de limpeza depois. Fechado pelo Maestro:
   `node tests/integration/limpar-lixo-teste.mjs --executar` com
   `FAMILIA_REAL_JOIN_CODE=RVFAXV`, confirmado 4 famílias/4 usuários/75
   categorias/89 formas removidos, família real (Heitor+Carol) intacta.
2. **Relatório formal não escrito** — este arquivo substitui o que o
   agente teria entregue, reconstruído a partir das evidências brutas que
   ele já tinha gravado em disco antes de cair.
3. **Escopo não coberto** (não deu tempo): revisão formal da migration
   `00009`, teste do hook `PreToolUse` de independência do Sentinela, e o
   achado do `v_settlement` (bug de saldo de acerto não descontado — esse
   foi achado pelo Maestro depois, registrado em `PENDENCIAS.md` e
   delegado ao Estrutura separadamente).

## Veredicto final

**APROVADO COM RESSALVAS.** Isolamento multi-tenant, validação e a regra de
exclusão-em-uso estão sólidos e confirmados com evidência reproduzida.
Três achados MÉDIO/BAIXO (tipo de conta mutável fora da Action, índice
único com brechas de normalização, arredondamento de ponto flutuante) não
bloqueiam o uso atual do casal mas devem entrar na próxima rodada do
Estrutura. Nenhum achado CRÍTICO ou ALTO nesta leva.
