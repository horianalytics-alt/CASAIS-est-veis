# Briefing Rodada 11 — URGENTE: corrigir achados da auditoria antes de conectar dados reais

O Sentinela auditou a Carteira de Investimento e **REPROVOU** a entrega.
Relatório completo: `docs/auditoria/carteira-investimento-sentinela.md`.
Dois achados são ALTOS e um deles já está em `origin/main`, ou seja, **em
produção agora**. Este briefing muda a ordem do que você ia fazer — pare
qualquer plano de conectar dados reais (isso vira a Rodada 12, depois
desta) e resolva primeiro os dois itens abaixo que são seus.

## 1. [ALTO] A2 — A aba Investimentos em produção mostra dados fictícios como se fossem reais

**Isto é urgente porque já está publicado.** `carteira/page.tsx` não
passa `dadosIniciais` ao componente, então `AreaInvestimentos` cai no
`MOCK_CARTEIRA_INVESTIMENTO` sempre — qualquer usuário real que abrir
`/carteira?aba=investimentos` hoje vê "R$ 45.850,00" e 3 caixinhas que
não existem, e se clicar em "Aplicar" recebe uma mensagem de sucesso
("Aplicação de R$ X realizada com sucesso") sem nada ser gravado em
lugar nenhum. Nada no texto da tela avisa que é demonstração.

**Correção necessária agora, antes de qualquer outra coisa nesta
rodada:** esconda a aba "Investimentos" da navegação até a Rodada 12
(conectar dados reais) estar pronta e aprovada. Não é para apagar o
trabalho — é para a aba não aparecer para o Heitor/Carol enquanto mostra
dado fictício como se fosse real. Pode ser um simples `if` por enquanto
(ex. feature flag local, ou comentar a `TabsTrigger` de Investimentos),
documentado com um comentário curto apontando para este briefing.

## 2. [MÉDIO] A4 — DialogoAplicar apaga o valor e volta o destino ao trocar a origem

`dialogo-aplicar.tsx:64-73`: o efeito que reseta os campos do formulário
está disparando toda vez que `contaOrigemId` muda, não só quando o
diálogo abre. Na prática: o usuário escolhe uma caixinha de destino,
digita um valor, aí troca a conta de origem (ex. porque errou qual
conta) — e o valor digitado some e o destino volta pra "não alocado"
sem avisar nada.

**Correção:** o reset dos campos deve disparar só na transição de
`aberto` de `false` para `true` (abrir o diálogo), nunca quando
`contaOrigemId` muda sozinho.

## 3. [BAIXO] A7 e A8 — vale corrigir agora, já que você vai mexer nestes arquivos mesmo

- **A7**: os diálogos (`dialogo-aplicar.tsx` e equivalentes) tratam erro
  só via `throw`, mas as Server Actions reais devolvem
  `{ ok: false; erro: string }` sem lançar exceção — quando a Rodada 12
  conectar dados reais, uma recusa real (ex. "Saldo insuficiente")
  passaria despercebida como sucesso se o código não checar `r.ok`
  explicitamente. Ajuste o padrão de tratamento de erro agora, mesmo
  ainda com mock, para já ficar pronto: `if (!r.ok) throw new Error(r.erro)`
  é o padrão usado no resto do app.
- **A8**: `dialogo-criar-caixinha.tsx:96-100` recusa data de vencimento
  "até hoje" no front, mas o back-end (Zod + RPC) aceita data no passado
  e permite resgate no próprio dia do vencimento. Alinhe a validação do
  front com essa regra (não recusar vencimento = hoje). Troque também
  `todayISO()` por `hojeEmSaoPaulo()` (já existe em `src/lib/hoje.ts:8`)
  — o front usa fuso do navegador, o back-end usa América/São Paulo, e
  isso diverge perto da virada do dia.

## O que NÃO fazer nesta rodada

- Não conecte dados reais ainda (migrations/Server Actions estão corretas,
  mas o A1 abaixo precisa ser corrigido pelo Estrutura antes disso fazer
  sentido — você será avisado quando a Rodada 12 estiver liberada).
- Não toque em `src/actions/`, migrations, `src/lib/supabase/`,
  `src/lib/simulador.ts`.
- Não remova a aba "Investimentos" do código — só esconda da navegação
  (ela volta a aparecer na Rodada 12).

## Verificação esperada

- `npx tsc --noEmit` limpo, `next build` ok, `npx vitest run` sem
  regressão.
- Confirmar visualmente que a aba "Investimentos" não aparece mais em
  `/carteira` (ou, se preferir manter visível, mostrar um aviso bem
  claro de "Prévia — dados de demonstração, ainda não conectado" —
  escolha sua, mas documente qual optou).
- Teste manual do DialogoAplicar: abrir, escolher caixinha, digitar
  valor, trocar a conta de origem → valor e destino devem PERMANECER.
- Screenshots nos 3 breakpoints + dark + console limpo.
- Commit por arquivo, `git pull --rebase origin main` antes do push —
  **esta correção (A2) pode e deve subir assim que estiver pronta**, não
  precisa esperar sinal meu, porque está corrigindo algo já em produção.

Fonte: `docs/auditoria/carteira-investimento-sentinela.md`, achados A2,
A4, A7, A8.

---

## O que NÃO é seu nesta rodada (para contexto, sem ação sua)

O Sentinela também achou um problema ALTO no cálculo de rendimento
(A1: o cálculo não desconta saídas feitas dentro do próprio mês, o que
permite confirmar/resgatar rendimento sobre dinheiro que já saiu da
caixinha) — isso é um defeito de SQL na migration, volta para o
Estrutura corrigir. Você não precisa fazer nada sobre isso, só saiba que
é por isso que os dados reais ainda não estão liberados para conectar.
