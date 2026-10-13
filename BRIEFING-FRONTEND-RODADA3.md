# Briefing de Front-end — Rodada 3

> **Para o agente de front-end (Antigravity).** Leia inteiro antes de começar.
> As regras do `BRIEFING-FRONTEND.md` (seções 4 a 8: tokens, C-1/C-2/C-3, A-1,
> regras do banco, fronteiras) continuam valendo integralmente.
>
> **Data:** 12/10/2026 · **Produção:** https://financascasais.vercel.app

---

## 0. Revisão da Rodada 2 — verificada, não aceita de palavra

Puxei seus commits (`856b272`, `24412f1`) e rodei:

```
npx tsc --noEmit                               -> exit 0
npx vitest run                                 -> 167/167
grep -rn "primary" src/components/financeiro/  -> 0   (C-1 cumprido)
varredura de segredo no repositório            -> limpa
```

D-1 a D-4, responsividade e Realtime: aceitos nesta conferência. Vou validar
Realtime com duas sessões e a fatura contra o banco em seguida — se achar algo,
volta como defeito na próxima rodada.

**Um defeito que encontrei e que é seu corrigir primeiro (item 1 abaixo).**

---

## 1. DEFEITO — o botão "Gerar novo código" está quebrado em produção [ALTO]

**Arquivo:** `app/src/components/ajustes/bloco-codigo-convite.tsx:45-56`

Ele chama `rotate_family_join_code`, que **não existe** no banco. A função de
rotação já existia antes do seu pedido, com outro nome: **`rotacionar_join_code`**
(migration `00007`, aplicada). Seu relatório pediu que eu criasse uma função
nova com o SQL que você escreveu — **esse SQL não será aplicado**, por três
motivos: duplicaria a função que já existe; usa `md5(random())`, que não é
gerador criptográfico (a nossa usa `gen_random_bytes`); e não participa do
limite de 10 tentativas por hora que protege o código.

Há um segundo problema, pior que o primeiro: quando a chamada falha, a tela diz
**"A função de rotação de código está sendo provisionada no banco de dados.
Solicitação registrada!"**. Nada é registrado. É uma mensagem falsa ao usuário.

**Correção:**

```ts
const { data: novoCodigo, error } = await supabase.rpc('rotacionar_join_code')
```

- **Remova o cast** `supabase.rpc as unknown as (...)`. Os tipos já foram
  regenerados e `rotacionar_join_code` existe em `src/types/database.ts`
  (`Args: Record<PropertyKey, never>; Returns: string`). O cast escondeu do
  TypeScript exatamente o erro que ele teria apontado.
- **Remova a mensagem "Solicitação registrada!"**. Exiba `error.message` como
  vem — já está em português.
- **Mostre o código novo** retornado em `novoCodigo` (6 caracteres), e
  atualize o código exibido na tela (`router.refresh()` serve).
- Erros possíveis (contrato completo em `docs/planos/estrutura-00007-contrato.md`):
  `P0001 "Você não faz parte de uma família"` e `42501` (sessão perdida).

**Prova:** clique em "Gerar novo código" na produção, cole o código antes e
depois, e confirme que o código ANTIGO não funciona mais para entrar.

---

## 2. Fila de trabalho — nesta ordem

Os itens marcados **[LIVRE]** não dependem de nada do back-end e você pode
começar agora. Os marcados **[CONTRATO PRONTO]** usam actions que estou
construindo agora; **o contrato abaixo é a especificação que elas vão
cumprir** — construa a UI contra ele. Se ao final algo divergir, o arquivo
`docs/planos/estrutura-categorias-contrato.md` (que chega com as actions)
manda.

| # | Item | Estado |
|---|---|---|
| 1 | Botão de convite (seção 1) | **[LIVRE]** — defeito, primeiro |
| 2 | Categorias e Formas de pagamento: editar, arquivar, excluir, adicionar várias | **[CONTRATO PRONTO]** |
| 3 | `/recuperar-senha` e `/nova-senha` | **[LIVRE]** |
| 4 | Marcadores "fútil" e "benefício" em `/lancar` | **[LIVRE]** |
| 5 | Contas: trocar gravação direta por actions | **[CONTRATO PRONTO]** |
| 6 | Análises: Previsão de fixos | **[LIVRE]** |
| 7 | Sons | **[LIVRE]** |
| 8 | Handler de push no `sw.js` | **[LIVRE]** |
| 9 | Pagar fatura e Registrar acerto: trocar RPC direta por actions | **aguarde contrato** — Fase B |
| 10 | Metas, Orçamento, Patrimônio, Simulador, botão de notificações | **aguarde** — Fase B |

---

## 3. Item 2 — Categorias e Formas de pagamento (pedido direto do dono)

Hoje as telas `/ajustes/categorias` e `/ajustes/formas-pagamento` **só listam**.
O Heitor quer **editar, excluir e adicionar uma ou várias de uma vez, separadas
por vírgula**.

### 3.1 O que a tela precisa ter

**Lista** — cada item com:
- nome (e, em categorias, o tipo como badge: Despesa / Receita / Investimento / Todos)
- ação **Renomear** (edição inline ou diálogo)
- ação **Arquivar** — é o caminho **padrão** e recomendado: some dos
  formulários de lançamento, mas o histórico continua mostrando o nome
- ação **Excluir** — destrutiva, em menu secundário, com confirmação
- itens arquivados numa seção recolhida "Arquivadas", com **Reativar**

**Adicionar várias de uma vez:**
- um `<textarea>` com placeholder `Ex.: Pet, Presentes, Viagem`
- separador: **vírgula ou quebra de linha** (o dono pediu vírgula; quebra de
  linha também funciona porque é natural ao colar uma lista)
- **prévia ao vivo, antes de salvar**: mostre os itens detectados como chips,
  e marque os que serão ignorados por já existirem
- em categorias: um seletor de tipo que vale para o lote inteiro
  (padrão: Despesa)
- depois de salvar, mostre o resultado: *"3 criadas · 1 já existia (Pet)"*

**Para a prévia, use a mesma função e as mesmas constantes que o servidor
usa** — assim a prévia nunca mente sobre o que vai ser salvo (correção R-3:
antes esse limite estava em dois lugares e podia divergir):

```ts
import { separarNomes, LIMITE_CARACTERES, LIMITE_NOMES } from '@/lib/lista-nomes'
// separarNomes('Pet, Presentes ,, pet') -> { nomes: ['Pet', 'Presentes'], descartados: ['pet'] }
```

Regras dessa função (já decididas, não reimplemente):
- separa por `,` e por quebra de linha
- apara as pontas e colapsa espaços internos
- descarta vazios
- remove duplicatas **sem diferenciar maiúscula nem acento** (`Pet` = `pet`,
  `Saúde` = `saude`); mantém a primeira grafia digitada
- limite: `LIMITE_CARACTERES` (40) por nome, `LIMITE_NOMES` (50) por lote —
  **importe as constantes, não repita os números**; o Zod do servidor usa as
  mesmas
- vírgula dentro de um nome não é suportada

**Excluir:**
- antes de confirmar, chame `contarUsoCategoria` e mostre o número:
  *"Esta categoria está em 12 lançamentos. Eles ficarão como 'Sem categoria'.
  Prefere arquivar?"* — com o botão **Arquivar** em destaque e **Excluir mesmo
  assim** como secundário
- em uso por zero lançamentos: confirmação simples
- se houver orçamento ligado à categoria, avise que ele será removido junto

**Mudar o tipo de uma categoria:** só é permitido se ela **não** estiver em
uso. Se estiver, a action devolve erro em português explicando — exiba como
vem. Renomear é sempre permitido.

### 3.2 Contrato das actions

**Estilo de chamada: objeto tipado, não FormData** — mesmo padrão de
`salvarLancamento`. Use React Hook Form controlado + `startTransition`,
guardando o `ResultadoAction` em `useState`. **Não** use `useActionState`
direto (a aridade não bate — ver `BRIEFING-FRONTEND.md` seção 2, item 4).

```ts
// app/src/actions/categorias.ts
type TipoCategoria = 'receita' | 'despesa' | 'investimento' | 'todos'

adicionarCategorias(input: { nomes: string; tipo: TipoCategoria })
  -> ResultadoAction<{
       criadas: { id: string; nome: string }[]
       ignoradas: string[]          // já existiam (mesmo nome e tipo, ativas)
     }>

renomearCategoria(input: { id: string; nome: string })      -> ResultadoAction<void>
alterarTipoCategoria(input: { id: string; tipo: TipoCategoria }) -> ResultadoAction<void>
arquivarCategoria(input: { id: string; arquivar: boolean }) -> ResultadoAction<void>
excluirCategoria(input: { id: string })
  -> ResultadoAction<{ lancamentosAfetados: number }>
contarUsoCategoria(input: { id: string })
  -> ResultadoAction<{ lancamentos: number; orcamentos: number }>
```

```ts
// app/src/actions/formas-pagamento.ts  — o mesmo, sem tipo
adicionarFormasPagamento(input: { nomes: string })
  -> ResultadoAction<{ criadas: { id: string; nome: string }[]; ignoradas: string[] }>
renomearFormaPagamento(input: { id: string; nome: string })      -> ResultadoAction<void>
arquivarFormaPagamento(input: { id: string; arquivar: boolean }) -> ResultadoAction<void>
excluirFormaPagamento(input: { id: string })
  -> ResultadoAction<{ lancamentosAfetados: number }>
contarUsoFormaPagamento(input: { id: string })
  -> ResultadoAction<{ lancamentos: number }>
```

Forma do resultado (a mesma de sempre, `src/actions/resultado.ts`):
```ts
| { ok: true; dados: T }
| { ok: false; erro: string; camposComErro?: Record<string, string[]> }
```
`erro` já vem em português e pronto para exibir. `camposComErro.nomes` aponta
para o textarea quando o lote é inválido (ex.: vazio, 51 itens, nome com 41
caracteres).

**Até as actions chegarem**, construa contra este contrato. Para testar a tela
antes, um mock local no componente é aceitável — mas **remova o mock antes do
commit final** e teste contra as actions reais.

---

## 4. Item 3 — Recuperar e definir nova senha

Hoje não existe "esqueci minha senha". Para mandar o app à Carol e à família,
isso é essencial. As actions **já existem** em `app/src/actions/auth.ts`:

```ts
pedirRecuperacaoDeSenha(formData)  // campo: 'email'
definirNovaSenha(formData)          // campos: 'senha', 'confirmacao'
```

Estilo **FormData** → `useActionState` **com o adaptador de aridade** (igual ao
`/login`).

- `/recuperar-senha` — campo de e-mail. **A action devolve sucesso mesmo para
  e-mail que não existe, de propósito** (não revela quem tem conta). A tela
  mostra **sempre** a mesma confirmação: *"Se houver uma conta com esse e-mail,
  enviamos um link."* Não "melhore" isso com "e-mail não encontrado".
- `/nova-senha` — senha + confirmação. É onde o link do e-mail chega.
- Link "Esqueci minha senha" em `/login`.
- As duas rotas são **públicas**: confira que o `proxyConfig` em
  `app/proxy.ts` as deixa passar (a lista `ROTAS_PUBLICAS` já tem
  `/recuperar-senha` e `/nova-senha`). Se não deixar, **reporte** — `proxy.ts`
  é meu.

Aviso: o link do e-mail só vai apontar para a produção depois que o dono
configurar a *Site URL* no painel do Supabase. Isso não é seu; teste a tela e
declare o envio de e-mail como `NÃO VERIFICADO` se não chegar.

---

## 5. Item 4 — Marcadores "fútil" e "benefício" em `/lancar`

Os cards **"Gastos fúteis"** e **"Eficiência de Benefício"** em `/analises`
nunca terão dado real, porque o formulário não deixa marcar. **A action já
aceita os campos** — só falta a tela:

```ts
// EntradaDeLancamento (app/src/actions/lancamento.ts) já tem:
ehBeneficio: boolean          // pago com VR/VA
ehFutil: boolean              // compra de impulso
rotuloDoFutil?: string | null // até 60 caracteres, só quando ehFutil
```

- Dois controles em `/lancar`, numa área "Mais detalhes" recolhida por padrão
  (não pesar o formulário rápido do dia a dia).
- `rotuloDoFutil` só aparece quando "fútil" está marcado.
- Só fazem sentido para **despesa** — esconda para receita e transferência.
- No lote, cada linha pode ter os seus.

---

## 6. Item 5 — Contas pelas actions

`app/src/components/ajustes/dialogo-conta.tsx:107` grava **direto no banco pelo
navegador** (`supabase.from('accounts').insert(...)`). O RLS protege, mas pula a
validação Zod e a tradução de erro: um cartão sem dia de fechamento vira erro
cru do Postgres (`accounts_cartao_tem_ciclo`) na cara do usuário.

Troque pelas actions (objeto tipado, RHF + `startTransition`):

```ts
// app/src/actions/contas.ts
type TipoConta = 'corrente' | 'beneficio' | 'cartao' | 'investimento'

criarConta(input: {
  nome: string
  tipo: TipoConta
  saldoInicial: number          // pode ser negativo; padrão 0
  diaFechamento?: number | null // 1-31, OBRIGATÓRIO se tipo = 'cartao', proibido senão
  diaVencimento?: number | null // idem
}) -> ResultadoAction<{ id: string }>

editarConta(input: { id: string; nome?: string; diaFechamento?: number | null; diaVencimento?: number | null })
  -> ResultadoAction<void>

arquivarConta(input: { id: string; arquivar: boolean }) -> ResultadoAction<void>
```

Tipo da conta não muda depois de criada (um cartão com faturas não pode virar
conta corrente).

---

## 7. Item 6 — Análises: Previsão de fixos

O que vai sair nos próximos meses. **Os dados já existem:** `v_monthly_summary`
tem linhas para meses futuros (hoje até mar/2027, por causa das parcelas), com
`payable` (a pagar) e `receivable` (a receber).

- Barras ou lista dos próximos 6 meses: quanto já está comprometido em cada um.
- Destaque o mês corrente.
- C-2 vale: todo valor com sinal.
- Use `src/styles/chart-palette.ts` para a cor das séries.

**Patrimônio** (evolução do saldo total) precisa de uma view que ainda não
existe — fica para a Fase B.

---

## 8. Item 7 — Sons

Feedback sonoro curto ao salvar e ao errar.

- **WebAudio** (oscilador), **sem arquivos de áudio**: zero peso, zero licença.
- Desligado por padrão? **Não** — ligado, mas com toggle em `/ajustes`,
  preferência salva em `localStorage` (envolva em `try/catch`).
- Volume baixo, duração ≤ 200ms.
- Não toque som em navegação comum, só em ação concluída/falha.

---

## 8.5. Item 9 — (Fase B, aguarde) Pagar fatura e Registrar acerto por action

Achado nesta revisão: `dialogo-pagar-fatura.tsx` e `dialogo-acertar.tsx` chamam
`supabase.rpc('pay_invoice', ...)` e `supabase.rpc('settle_up', ...)` **direto do
navegador**. Isso pula a validação do servidor e, mais importante, é por onde o
push de notificação teria que passar para avisar o parceiro — e hoje não passa.

Na Fase B vou publicar `pagarFatura` e `registrarAcerto` em
`src/actions/` com a mesma forma de `ResultadoAction` de sempre. Quando o
contrato chegar, troque as duas chamadas diretas pelas actions (mesmo padrão
usado na troca de `dialogo-conta.tsx`, item 5). **Não comece isso agora** —
é só para você saber que vem e não se surpreender com o pedido depois.

## 9. Item 8 — Handler de push no service worker

A parte de envio é minha e vem na Fase B. A recepção no aparelho você já pode
fazer, sem dependência:

```js
// public/sw.js
self.addEventListener('push', (event) => {
  const dados = event.data ? event.data.json() : {}
  // dados = { titulo: string, corpo: string, url: string }
  event.waitUntil(
    self.registration.showNotification(dados.titulo ?? 'Finanças a Dois', {
      body: dados.corpo ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: dados.url ?? '/inicio' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // foque uma aba aberta do app, ou abra uma nova em data.url
})
```

O payload terá **exatamente** esses três campos. O texto **não** trará o valor
do lançamento (privacidade na tela bloqueada). O botão "Ativar notificações"
espera a Fase B — ele precisa da chave pública VAPID e da action de inscrição.

---

## 10. Fronteiras (inalteradas)

**Seu:** `src/components/`, `src/app/` (rotas e layouts), `src/features/`,
`public/sw.js`.

**Meu, não toque:** `app/supabase/migrations/`, `src/actions/`,
`src/lib/supabase/`, `src/types/database.ts`, `app/proxy.ts`, `src/lib/*.ts`
testados, `app/tests/`.

**Você pode IMPORTAR** de `src/lib/` e `src/actions/` à vontade — só não edite.

Se precisar de algo que não existe (coluna, view, função, action), **pare e
reporte no relatório** com o formato exato que você precisa. Não escreva SQL
para eu aplicar — descreva a necessidade e eu desenho. (O SQL da rodada
passada duplicava uma função existente e usava gerador fraco; descrever a
necessidade teria evitado isso.)

---

## 11. Como entregar

1. Screenshots em **375, 768, 1024 e 1440**, claro **e** escuro, de cada tela tocada
2. Console sem erro em cada rota tocada
3. `npx tsc --noEmit` → exit 0
4. `npx vitest run` → sem regressão (167 hoje; vai subir com os testes das actions)
5. Gate C-1: `grep -rn "primary" src/components/financeiro/` → 0
6. Para o item 1: código antes/depois e prova de que o antigo morreu
7. Para o item 2: adicionar `"Pet, Presentes, Viagem"` de uma vez → 3 criadas;
   repetir → 3 ignoradas; excluir uma categoria em uso → lançamentos viram
   "Sem categoria" e `/inicio` continua íntegro
8. **Não marque como verificado o que não observou.** `NÃO VERIFICADO` +
   motivo é resposta aceitável.

Commite à medida e faça deploy como você já vem fazendo.
