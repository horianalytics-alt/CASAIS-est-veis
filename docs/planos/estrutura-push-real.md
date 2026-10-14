# Plano — Estrutura: push real no celular (Fase B, R-1) + `pagarFatura` / `registrarAcerto` (R-13)

> FASE: PLANO. Executado na mesma sessão, por instrução do Maestro (projeto pequeno, plano
> validado por mim antes de executar). Modelo: opus nas duas fases (toca `service_role`).
> Repositório: `C:\dev\financas-a-dois` (app em `app/`). Banco: hospedado `wxhfgstgjjlmqauogeid`.
> Não existe banco local e o Docker não está rodando — portão de saída em **MODO DEGRADADO**
> (sem `db reset`; migration validada e aplicada contra o hospedado pela CLI, como 00009–00011).

## 0. Fontes lidas antes de planejar

| Fonte | O que fixou |
|---|---|
| `PROJETO.md` §2–§4 | exceção única do `service_role` em `src/lib/supabase/servico.ts`; risco R-13 aberto |
| `harmonic-jingling-eclipse.md`, "FASE B — Push, redesenhado (R-1)" | decisões já tomadas (seguidas, não reabertas) |
| `vercel:nextjs` + `node_modules/next/dist/docs/.../after.md` (Next 16.4.0) | `after()` funciona em Server Functions; no serverless usa `waitUntil` (Vercel suporta) |
| `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` §"Preventing environment poisoning" | `import 'server-only'` = **erro de build** se importado por Client Component; pacote npm é opcional para o Next, mas necessário para o vitest resolver o import |
| `supabase:supabase-postgres-best-practices` › `schema-foreign-key-indexes`, `query-composite-indexes`, `data-upsert` | índice na FK `family_id` de `push_subscriptions`; ordem das colunas |
| `supabase:supabase` › checklist de segurança | `service_role` nunca com `NEXT_PUBLIC_`; versões fixadas + lockfile |
| `00001` (tabela), `00006` (policies vigentes), `00003` (`pay_invoice`), `00010` (`settle_up` atual) | assinaturas reais das RPCs |
| `dialogo-pagar-fatura.tsx:84`, `dialogo-acertar.tsx:55` (só leitura) | parâmetros que o front manda hoje |
| `public/sw.js:76-94` (só leitura) | contrato do payload: `{ titulo, corpo, url }` |
| `web-push@3.6.7` (tarball inspecionado em scratch, `src/web-push-lib.js`) | só HTTPS (`require('https')`), `vapidDetails`/`TTL`/`urgency`/`timeout` por chamada, erro traz `statusCode` |

Medido no banco hospedado (só leitura, `npx supabase db query`):

```
versao: 17.11 | migration list: 00001..00011 em local E remote
push_subscriptions: rls=true | linhas_total=0 | linhas_familia_real=0
indices: push_subscriptions_member_id_endpoint_key (member_id, endpoint) UNIQUE ; push_subscriptions_pkey (id)
policies: push_delete_own DELETE authenticated ; push_insert_own INSERT authenticated ; push_select_own SELECT authenticated
grants anon: nenhum
```

Contagem das linhas acima conferida na saída colada no relatório de execução (REGRA PERMANENTE).

## 1. Arquivos

| Ação | Caminho | Por quê |
|---|---|---|
| criar | `app/supabase/migrations/00012_indice_push_familia.sql` | índice `(family_id, member_id)` — ver D7 |
| criar | `app/src/lib/supabase/servico.ts` | ÚNICO uso de `SUPABASE_SERVICE_ROLE_KEY` em produção (R-1) |
| criar | `app/src/lib/push/notificar.ts` | `server-only`: resolve o autor, agenda via `after()`, envia com `web-push`, apaga 404/410 |
| criar | `app/src/lib/push/mensagens.ts` | puro: texto da notificação por evento (sem valor) |
| criar | `app/src/lib/push/endpoints.ts` | puro: lista de serviços de push aceitos (anti-SSRF, D9) |
| criar | `app/src/lib/esquemas-pagamentos.ts` | Zod de `pagarFatura` / `registrarAcerto` / inscrição (arquivo `'use server'` só exporta função async) |
| criar | `app/src/actions/fatura.ts` | `pagarFatura` (R-13) |
| criar | `app/src/actions/acerto.ts` | `registrarAcerto` (R-13) |
| criar | `app/src/actions/push.ts` | `salvarInscricaoPush` / `removerInscricaoPush` — **acréscimo**, ver D10 |
| alterar | `app/src/actions/lancamento.ts` | agenda o push depois do `save_transactions` com sucesso |
| alterar | `app/package.json`, `app/package-lock.json` | `web-push@3.6.7`, `server-only@0.0.1` (deps); `@types/web-push@3.6.4` (dev) — versões exatas |
| criar | `app/tests/unit/push-mensagens.test.ts` | texto sem valor; allowlist de endpoint |
| criar | `app/tests/unit/push-envio-real.test.ts` | `web-push.generateRequestDetails` REAL + decriptação do corpo |
| criar | `app/tests/unit/esquemas-pagamentos.test.ts` | Zod |
| criar | `app/tests/unit/fronteira-server-only.test.ts` | estático: diretiva, grafo de import a partir de todo `'use client'`, chave só em `servico.ts`, import fora do Next lança |
| criar | `app/tests/integration/push-envio.int.test.ts` | actions reais contra o banco hospedado: autor não recebe, outra família nunca recebe, 410 apaga |
| regenerar | `app/src/types/database.ts` | último passo da migration |
| **temporário, não commitado** | `app/src/app/prova-server-only/{page.tsx,cliente.tsx}` | prova de que o `next build` FALHA — ver "Desvio previsto" no fim do §8 |
| NÃO tocar | `src/components/`, `src/app/` (fora o temporário acima), `public/sw.js`, `next.config.ts` | território do Antigravity / fora da lista |

## 2. Schema proposto (00012) — só um índice

```sql
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_family_member
  ON public.push_subscriptions (family_id, member_id);
-- + bloco DO de auto-verificação (aborta se o índice não existir)
```

- Nenhuma coluna nova. Não há "marcar inscrição morta": a inscrição recusada com 404/410 é
  **apagada** (decisão do R-1), então coluna de status seria dado morto.
- RLS **não muda**: as 3 policies por membro continuam valendo. Não existe policy de UPDATE
  e não é criada (a action de inscrição só faz DELETE + INSERT do próprio membro).
- Tabela vazia (`linhas_total=0`): `CREATE INDEX` sem `CONCURRENTLY` (migration é transacional),
  lock de instantes.
- Não destrutiva. Nenhum dado existente afetado.

Policies vigentes de `push_subscriptions` (lidas de `pg_policies`, não mudam):

| Operação | Role | Regra |
|---|---|---|
| SELECT | authenticated | `member_id = get_user_member_id_self()` |
| INSERT | authenticated | WITH CHECK `member_id = get_user_member_id_self() AND family_id = get_user_family_id_self()` |
| DELETE | authenticated | `member_id = get_user_member_id_self()` |
| UPDATE | — | sem policy (nega) |
| anon | — | sem grant |
| service_role | — | ignora RLS: usado SÓ em `servico.ts`, com filtro explícito de família (abaixo) |

## 3. Assinaturas

### 3.1 `src/lib/supabase/servico.ts` (`import 'server-only'`, SEM `'use server'`)

```ts
export type InscricaoDeDestino = { id: string; endpoint: string; p256dh: string; auth: string }
// Inscrições dos OUTROS membros da família: WHERE family_id = $1 AND member_id <> $2.
export async function inscricoesDosOutrosMembros(familyId: string, autorMemberId: string): Promise<InscricaoDeDestino[]>
// Apaga inscrições mortas: WHERE family_id = $1 AND id IN ($2). Devolve quantas saíram.
export async function apagarInscricoes(familyId: string, ids: string[]): Promise<number>
```
- O cliente `service_role` é criado DENTRO do módulo e **não é exportado** — a superfície
  auditável são estas duas funções.
- Os dois parâmetros são conferidos como uuid (lança se não forem). Quem chama passa
  SEMPRE valores resolvidos pela sessão (3.2), nunca do cliente.
- Sem `'use server'` de propósito: com a diretiva, as duas funções virariam endpoints
  públicos que aceitam `familyId` arbitrário. O teste estático trava isso.

### 3.2 `src/lib/push/notificar.ts` (`import 'server-only'`)

```ts
export type EventoPush = 'lancamento' | 'fatura' | 'acerto'
export type AutorDoPush = { familyId: string; memberId: string; nome: string }
export async function resolverAutorDoPush(supabase: ClienteServidor, userId: string): Promise<AutorDoPush | null> // nunca lança
export function agendarNotificacao(autor: AutorDoPush | null, evento: EventoPush, quantidade?: number): void   // chama after()
export async function enviarNotificacao(autor: AutorDoPush, evento: EventoPush, quantidade?: number): Promise<RelatorioDeEnvio> // nunca lança
```
- `resolverAutorDoPush`: `family_members.select('id, family_id, display_name').eq('user_id', userId)`
  pela **sessão do usuário** (RLS), com `userId` vindo de `getUser()`. É a mesma consulta que
  `get_user_family_id_self()` faz (00006, `WHERE user_id = auth.uid()`), devolvendo também o
  membro e o nome numa ida só. Em `pagarFatura`/`registrarAcerto` o `familyId` resultante é
  conferido contra o `ctx.familyId` de `obterContextoDaFamilia()` (que chama
  `get_user_family_id_self`); divergência = não envia.
- Payload = contrato do `sw.js`: `{ titulo: 'Finanças a Dois', corpo, url }`.
- Envio: `Promise.allSettled`, `TTL: 86400`, `urgency: 'normal'`, `timeout: 10000`, `vapidDetails`
  por chamada (sem estado global). Endpoint fora da allowlist é PULADO (D9).
- 404/410 → `apagarInscricoes`. Outros erros → só log (status + 8 primeiros caracteres do id;
  nunca o endpoint nem as chaves, que funcionam como credencial do aparelho).
- Sem VAPID no ambiente → não envia, `console.warn`, a action segue `ok: true`.
- Nunca altera o `ResultadoAction` da action: push é efeito colateral.

### 3.3 Server Actions (todas `ResultadoAction<T>` de `resultado.ts`)

```ts
// src/actions/fatura.ts
export type EntradaPagarFatura = {
  cartaoId: string       // uuid — accounts.id do cartão (= fatura.account_id)
  contaOrigemId: string  // uuid — conta NÃO-cartão de onde sai o dinheiro
  anoFatura: number      // inteiro 2000..2100 (= fatura.invoice_year)
  mesFatura: number      // inteiro 1..12 (= fatura.invoice_month)
  data: string           // 'YYYY-MM-DD', obrigatório (data do pagamento)
}
export async function pagarFatura(input: EntradaPagarFatura): Promise<ResultadoAction<{ pagamentoId: string }>>

// src/actions/acerto.ts
export type EntradaRegistrarAcerto = {
  deMembroId: string     // uuid — quem PAGA o acerto (= devedorId do diálogo)
  paraMembroId: string   // uuid — quem RECEBE (= credorId)
  valor: number          // reais, > 0, no máximo 2 casas, até 99.999.999,99
  data: string           // 'YYYY-MM-DD', obrigatório
}
export async function registrarAcerto(input: EntradaRegistrarAcerto): Promise<ResultadoAction<{ acertoId: string }>>

// src/actions/push.ts — formato de PushSubscription.toJSON(), o front passa direto
export type EntradaInscricaoPush = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  expirationTime?: number | null   // aceito e ignorado
}
export async function salvarInscricaoPush(input: EntradaInscricaoPush): Promise<ResultadoAction<void>>
export async function removerInscricaoPush(input: { endpoint: string }): Promise<ResultadoAction<void>>
```

Ordem dentro de cada action (doutrina "Toda Server Action é um endpoint público"):
1. Zod `safeParse` → só `analise.data` daqui em diante.
2. `obterContextoDaFamilia()` → `getUser()` (nunca `getSession()`) + `get_user_family_id_self()`.
3. **Autorização do recurso**, pela sessão (RLS = 2ª camada), antes da RPC:
   - `pagarFatura`: `accounts.select('id,type').in('id',[cartaoId, contaOrigemId])` — o cartão
     precisa voltar com `type='cartao'`, a origem com `type<>'cartao'`.
   - `registrarAcerto`: `family_members.select('id').in('id',[de, para])` — os dois precisam voltar.
   - A RPC (`SECURITY DEFINER`) refaz a checagem por `v_family_id` dentro dela: são duas camadas.
4. RPC (`pay_invoice` / `settle_up`) com os valores parseados; `settle_up` é a da **00010**
   (grava `settlement_to_member_id = p_to_member_id`): `deMembroId → p_from_member_id`,
   `paraMembroId → p_to_member_id`. Nenhuma mudança na RPC.
5. Sucesso → `revalidatePath` (`/carteira`, `/inicio`, `/acerto`) → `agendarNotificacao(...)`.

Forma do erro (exata):

| Caso | Retorno |
|---|---|
| Zod | `{ ok:false, erro:'Confira os campos destacados.', camposComErro:{ <campo>: [msg] } }` |
| sem sessão | `{ ok:false, erro:'Sua sessão expirou. Entre de novo.' }` |
| sem família | `{ ok:false, erro:'Você não faz parte de nenhuma família.' }` |
| cartão de outra família / não é cartão | `{ ok:false, erro:'Cartão não encontrado nesta família', camposComErro:{ cartaoId:[mesmo texto] } }` |
| origem inválida | `{ ok:false, erro:'Conta de origem inválida', camposComErro:{ contaOrigemId:[mesmo texto] } }` |
| fatura sem valor em aberto | `{ ok:false, erro:'Esta fatura não tem valor em aberto' }` (RPC) |
| membro de outra família no acerto | `{ ok:false, erro:'Membro não encontrado nesta família', camposComErro:{ <deMembroId\|paraMembroId>:[...] } }` |
| de = para | Zod: `camposComErro.paraMembroId = ['O acerto precisa ser entre duas pessoas diferentes']` |
| sem conta corrente | `{ ok:false, erro:'Cada pessoa precisa de uma conta corrente para acertar' }` (RPC) |
| endpoint fora da allowlist / chave malformada | Zod em `camposComErro.endpoint` / `camposComErro['keys.p256dh']` / `['keys.auth']` |
| qualquer outro erro do banco | `traduzErroDoBanco` (nunca a mensagem crua) |

## 4. Mensagens (sem valor monetário, R-1)

| Evento | `corpo` | `url` |
|---|---|---|
| `lancamento` (1 item) | `<Nome> registrou um lançamento` | `/inicio` |
| `lancamento` (N itens) | `<Nome> registrou N lançamentos` (N = itens do lote, não parcelas) | `/inicio` |
| `fatura` | `<Nome> pagou uma fatura do cartão` | `/carteira` |
| `acerto` | `<Nome> registrou um acerto de contas` | `/acerto` |

`<Nome>` = `display_name` aparado, até 40 caracteres; vazio → `Alguém da sua casa`.
`titulo` sempre `Finanças a Dois`.

## 5. Chaves VAPID

| Variável | Onde | Pública? |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel (Production + Preview) e, se quiser testar local, `.env.local` | sim — o front passa em `pushManager.subscribe({ applicationServerKey })` |
| `VAPID_PRIVATE_KEY` | **só** Vercel, sem `NEXT_PUBLIC_` | **SEGREDO** |
| `VAPID_SUBJECT` | Vercel, opcional | default `https://financascasais.vercel.app` (RFC 8292 aceita URL https; não uso e-mail para não mandar endereço pessoal a FCM/Apple sem pedido) |

Geradas por mim com `npx web-push generate-vapid-keys --json`, gravadas FORA do repositório
(scratchpad da sessão). A privada não vai para nenhum arquivo do repo, nem para o `.env.local`.
Como hoje existem 0 inscrições, gerar um par novo a qualquer momento não quebra nada.

## 6. Decisões

| # | Decisão | Por quê | Fonte |
|---|---|---|---|
| D1 | `servico.ts` com `import 'server-only'`, cliente não exportado, 2 funções | exceção única e auditável | decisão já tomada (R-1); `vercel:nextjs` + doc do Next 16 "Preventing environment poisoning" |
| D2 | Envio dentro de `after()` chamado na action | não atrasa a resposta; no serverless vira `waitUntil` | R-1; doc `after.md` do Next 16.4 ("Server Functions", "Platform Support") |
| D3 | Autor resolvido pela sessão ANTES do `after()`, em paralelo com a RPC | o `after` recebe valores prontos (padrão da doc: "read beforehand and pass the values in"); zero latência extra | doc `after.md`; R-1 (família pela sessão) |
| D4 | `web-push@3.6.7` | implementação de referência do Web Push Protocol em Node, org `web-push-libs`, mantenedor da Mozilla; faz criptografia aes128gcm (RFC 8291) e VAPID (RFC 8292) que eu NÃO devo reescrever à mão. **Licença MPL-2.0** (não MIT): copyleft por arquivo — usar sem modificar é permitido em app fechado. Última publicação 2024-01 (estável). Deps: `asn1.js`, `http_ece`, `https-proxy-agent`, `jws`, `minimist` | `npm view web-push` (saída no relatório) |
| D5 | `server-only@0.0.1` como dependência | o Next dispensa, mas o vitest (fora do Next) precisa resolver o import; e é ele que faz o teste "import fora do servidor lança" ser real | doc do Next 16 (seção acima, "installing server-only is optional") |
| D6 | Versões exatas no `package.json` | supply-chain | `supabase:supabase` › "Always pin package versions and commit lockfiles" |
| D7 | Índice `(family_id, member_id)` em migration nova | `family_id` é FK (CASCADE de `families`) sem índice; é o filtro da consulta de envio | `supabase-postgres-best-practices` › `schema-foreign-key-indexes`, `query-composite-indexes` (igualdade, coluna mais seletiva da consulta primeiro) |
| D8 | Apagar em 404 **e** 410 (o briefing diz 410) | RFC 8030: 410 = inscrição expirada; o autopush da Mozilla devolve 404 para inscrição desconhecida; o README do `web-push` recomenda os dois | protocolo, não regra de negócio |
| D9 | Allowlist de host de push (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`), https, porta padrão — checada no Zod da inscrição E no envio | sem isso, um membro registra `https://qualquer-host/...` e o NOSSO servidor faz POST para lá a cada ação do parceiro (SSRF). A checagem no envio cobre linha gravada direto pelo REST (a policy de INSERT permite ao navegador gravar sem passar pela action) | segurança; em código (não CHECK no banco) para poder incluir serviço novo sem migration |
| D10 | **Acréscimo de escopo**: `salvarInscricaoPush` / `removerInscricaoPush` | não existe NENHUM caminho de gravação de inscrição em `src/`. Sem ele, o Antigravity grava direto do navegador em `push_subscriptions` — exatamente o padrão que o R-13 está removendo. É back-end, em `src/actions/` (permitido). O Maestro pode vetar: as duas são independentes do resto | `PROJETO.md` §2 "Server Actions como única porta de escrita para dado sensível" |
| D11 | Pré-checagem de autorização do recurso na action, além da RPC | doutrina: a action verifica autorização; RLS/RPC é a 2ª camada. Também transforma "cartão de outra casa" em erro de campo | doutrina do Estrutura, "Toda Server Action é um endpoint público" |
| D12 | `data` obrigatória em `pagarFatura`/`registrarAcerto` | com `p_date` nulo a RPC usa `CURRENT_DATE` do banco (UTC): depois das 21h de Brasília o pagamento cairia no dia seguinte. O front já manda a data hoje | `src/lib/hoje.ts` (mesmo problema documentado) |
| D13 | `valor` do acerto: `number`, rejeita mais de 2 casas em vez de arredondar | o valor vem da `v_settlement` (`round(...,2)`); arredondar em float é o P-009 aberto — aqui não arredondo, recuso | P-009 (`PENDENCIAS.md`) |

## 7. Testes (o que prova cada exigência do briefing)

| Exigência | Teste | Como |
|---|---|---|
| autor NÃO recebe a própria notificação | `push-envio.int.test.ts` | casa A com 2 membros reais (create_family + join_family), inscrição de cada um gravada pela PRÓPRIA sessão (RLS real); A1 lança → endpoints enviados = só os de A2 |
| outra família NUNCA recebe | idem | casa B com inscrição; em lançamento, fatura e acerto de A, nenhum endpoint de B aparece; B tentando pagar fatura/acertar em A → erro e zero envio |
| 410 apaga | idem | `sendNotification` simulado devolve 410 para uma inscrição → linha some (conferido por `select` admin); 500 → linha fica |
| cliente não importa `servico.ts` | `fronteira-server-only.test.ts` + **`next build` real** | estático: 1ª instrução é `import 'server-only'`; nenhum arquivo `'use client'` alcança `servico.ts`/`notificar.ts` no grafo de import; `SUPABASE_SERVICE_ROLE_KEY` só aparece em `servico.ts` dentro de `src/`; `import('@/lib/supabase/servico')` fora do Next LANÇA o erro do `server-only`. Build: página temporária com Client Component importando `servico.ts` → `next build` falha → apaga → `next build` passa |
| `after()` de fato adia | idem | `after` simulado guarda o callback sem rodar: no retorno da action, `sendNotification` ainda tem 0 chamadas |
| texto sem valor | `push-mensagens.test.ts` + int | nenhum dígito de valor nem `R$` no corpo; no int, o valor lançado (ex.: 123,45) não aparece no payload |
| VAPID/criptografia corretos de verdade | `push-envio-real.test.ts` | `web-push.generateRequestDetails` REAL com as opções que o código monta; decripta o corpo com `http_ece` e a chave privada do "aparelho" de teste → JSON idêntico; header `Authorization: vapid t=…, k=…`; `TTL: 86400` |
| 00010 não regride | int | `registrarAcerto(A2 → A1, valor exato do saldo)` → linha com `settlement_to_member_id = A1`, `paid_by_member_id = A2`, e `v_settlement` de A1 e A2 = 0 |
| "falhou uma vez" | int, mutação | depois do verde: removo os filtros `family_id`/`member_id <>` de `servico.ts` → os testes de autor e de outra família FICAM VERMELHOS → restauro → verde. (O primeiro vermelho, antes do código, é import inexistente — fraco; a mutação é a prova de que o teste enxerga o bypass) |

Famílias de teste: e-mails `push-<tag>-<stamp>@example.com`, limpeza no `afterAll` por
`limparTeste` (lançamentos → famílias → usuários; `push_subscriptions` sai em CASCADE de
`families`, `join_attempts` em CASCADE de `auth.users`). A família real
(`9969d589-…`) aborta o teste se aparecer entre as criadas.

## 8. Riscos

| Risco | Prob. | Efeito | Mitigação |
|---|---|---|---|
| `service_role` em produção | — | ignora RLS | um arquivo, 2 funções, filtro explícito, uuid validado, teste de mutação, Sentinela revisa (R-1) |
| SSRF por endpoint forjado | média sem D9 | servidor faz POST para host arbitrário | D9, nos dois pontos |
| Aparelho compartilhado (Heitor e Carol no mesmo navegador) | baixa | mesmo endpoint em 2 membros → o autor recebe a própria notificação naquele aparelho | **pendência**: decidir se `salvarInscricaoPush` remove o endpoint dos outros membros (exigiria `service_role` numa 3ª função) — pergunta ao Maestro |
| Spam entre membros | baixa | um membro em loop dispara muitas notificações ao parceiro | aceito (2 pessoas da mesma casa); sem rate limit nesta entrega |
| `web-push` não empacotar no Turbopack | baixa | build quebra | verificado no `next build`; se precisar de `serverExternalPackages`, `next.config.ts` está FORA da minha lista → paro e reporto |
| `after` estourar `maxDuration` | baixa | notificação perdida | `timeout: 10000` por envio, `allSettled` em paralelo |
| iOS | — | só funciona com o PWA instalado (iOS 16.4+) | aviso já no plano mestre |
| Migration | baixa | — | só índice, tabela vazia, não destrutiva, idempotente (`IF NOT EXISTS`) |
| Prova do build toca `src/app/` | baixa | colisão com o Antigravity se ele buildar no mesmo minuto | arquivo NÃO rastreado, apagado no fim, `git status` colado (ver "Desvio previsto" abaixo) |
| Observado, fora de escopo | — | `authenticated` tem `TRUNCATE` em `push_subscriptions` (grant padrão do Supabase; TRUNCATE não passa por RLS). Não é alcançável pelo PostgREST, mas é privilégio a mais | **pendência ao Sentinela/Maestro**: `REVOKE TRUNCATE` em migration própria, para todas as tabelas |

Desvio previsto, registrado já no plano: `Desvio: arquivo temporário em src/app/prova-server-only/ — o Maestro pediu a prova de que o build quebra; só uma rota do App Router faz o Next compilar um Client Component. Não rastreado, apagado no fim.`

## 9. Ordem de operações

1. Contagem global ANTES (families, auth.users, transactions, push_subscriptions, join_attempts)
   + hash da família real (transactions, accounts, family_members, push_subscriptions).
2. `npm install --save-exact web-push@3.6.7 server-only@0.0.1` e `--save-dev --save-exact @types/web-push@3.6.4`.
3. 00012: escrever → `db push --db-url` → `migration list` (00012 em Remote) → `pg_indexes` mostra o índice.
4. `gen types --db-url` → `database.ts` (diff esperado vazio: índice não muda tipo; rodo assim mesmo).
5. TDD unit: testes de mensagens/endpoints/esquemas/fronteira → vermelho → módulos puros → verde.
6. TDD int: `push-envio.int.test.ts` → vermelho → `servico.ts`, `notificar.ts`, actions, `lancamento.ts` → verde.
7. Mutação dos filtros de `servico.ts` → vermelho → restaura → verde.
8. Prova do build (falha com o import, passa sem ele) + `git status` limpo de `src/app/`.
9. Regressão: `acerto-liquido.mjs` (usa `limparTeste`, conferido por `grep -L` — L-007).
10. `npx tsc --noEmit`, `npx vitest run`, `npx next build`.
11. VAPID gerada para fora do repo.
12. Contagem global + hash DEPOIS (iguais ao passo 1).
13. `security-review`, `code-review` high, varredura de segredo, commit local (sem push — push é do Maestro).

## 10. Perguntas ao Maestro (nenhuma bloqueia a execução)

1. D10 — manter `salvarInscricaoPush`/`removerInscricaoPush`? (Recomendo sim.)
2. Aparelho compartilhado: `salvarInscricaoPush` deve tirar o mesmo endpoint de OUTRO membro? Exige uma 3ª função no `servico.ts`.
3. Editar/excluir lançamento também notifica? Hoje não (o briefing nomeia só as 3 actions).
