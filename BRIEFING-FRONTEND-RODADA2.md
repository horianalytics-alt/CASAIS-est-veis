# Briefing de Front-end — Rodada 2

> **Para o agente de front-end (Antigravity).** Leia este arquivo inteiro antes
> de escrever código. Ele substitui a fila de trabalho do
> `BRIEFING-FRONTEND.md` — as regras daquele documento (seções 4 a 8) continuam
> valendo integralmente.
>
> **Data:** 12/10/2026 · **Produção:** https://financascasais.vercel.app

---

## 0. Revisão do que você entregou — verificado, não aceito de palavra

Puxei seus 8 commits, rodei a verificação e abri o app em produção. **O grosso
está correto e bem feito.** Saída real:

```
npx tsc --noEmit                            -> exit 0
npx vitest run                              -> 5 arquivos, 167/167
grep -rn "primary" src/components/financeiro/ -> 0   (gate C-1 cumprido)
rotas criadas                               -> 15 pages
console em /inicio, /carteira, /acerto      -> 0 erros, 0 avisos
```

Produção respondendo:
```
/                     -> 307 -> /inicio
/login                -> 200
/manifest.webmanifest -> 200
/sw.js                -> 200
/icons/favicon.svg    -> 200
```

Entrei em produção com a conta real e naveguei. **A navegação inferior está
correta** (medi: `top 747`, altura `65`, viewport `812` — fica no rodapé).
O **Acerto está certo**: mostra `Carol deve R$ 226,85 para Heitor`, que bate
exatamente com o que a view `v_settlement` devolve.

Agora os defeitos. São poucos, mas um deles mostra número errado ao usuário.

---

## 1. DEFEITOS ENCONTRADOS — corrija antes de seguir

### D-1 [ALTO] — O cartão mostra "Total da fatura atual" com o número errado

**Arquivo:** `app/src/components/carteira/cartao-conta.tsx:53`
```ts
const saldoAtual = conta.current_balance ?? 0
```

**O que o usuário vê hoje na Carteira:**
```
Cartão Nubank
Total da fatura atual
+R$ 0,00                 <- errado, e em VERDE (parece crédito a favor)
Fecha dia 25 · Vence dia 5
Em aberto
−R$ 583,33               <- de outro ciclo, contradiz a linha acima
```

**O que o banco realmente tem** (consultei agora):
```
v_account_balances  -> Cartão Nubank: current_balance 0.00, pending_outflow 3695.58
v_invoices (out/26) -> total_amount 639.23, open_amount 639.23
```

**A causa:** `current_balance` é o saldo da CONTA, não o valor da fatura. Num
cartão ele é zero porque nenhuma fatura foi paga ainda. A fatura do ciclo
corrente é **R$ 639,23**, e vem de `v_invoices`, não de `v_account_balances`.

**Por que isso é grave:** o rótulo diz "Total da fatura atual" e mostra
**+R$ 0,00 em verde**. O usuário lê "não devo nada no cartão" quando deve
R$ 639,23 no ciclo corrente e R$ 3.695,58 no total em aberto. É exatamente o
tipo de número errado que a régua do produto proíbe — ver o `PLANO.md`.

**Correção esperada:**
- Para conta de `type === 'cartao'`, o número grande vem do ciclo **corrente**
  de `v_invoices` (o que contém a data de hoje pela regra de fechamento), não
  de `current_balance`.
- Se não houver fatura no ciclo corrente, mostre `R$ 0,00` **sem sinal de
  crédito** e com rótulo "Nenhuma compra neste ciclo".
- O valor de uma fatura é uma dívida: **nunca** em verde de receita.
- "Em aberto" tem de ser do MESMO ciclo que o número grande, ou mude o rótulo
  para "Total em aberto (todos os ciclos)" e use `pending_outflow` (3.695,58).

### D-2 [MÉDIO] — Navegação inferior usa `sticky`, deveria ser `fixed`

**Arquivo:** `app/src/components/navegacao/navegacao-inferior.tsx:27`
```
className="bg-background border-border sticky bottom-0 z-10 border-t"
```

`sticky` depende do fluxo do elemento pai. Em página curta ou com contêiner de
rolagem próprio, a barra sai de vista. Num PWA instalado no celular, a barra de
navegação precisa estar **sempre** acessível.

**Correção:** `fixed bottom-0 inset-x-0`, mais `padding-bottom` no `main`
igual à altura da barra (para o último item não ficar embaixo dela), mais
`padding-bottom: env(safe-area-inset-bottom)` para o iPhone com barra de gestos.

### D-3 [BAIXO] — Copy inconsistente no Acerto

A tela de Acerto tem o botão **"Confirmar acerto"** e, no texto explicativo
abaixo, fala em **"Registrar acerto"**. Dois nomes para a mesma ação. Escolha um
e use em todo lugar (sugiro "Registrar acerto", que descreve melhor: o app grava
a transferência, não confirma algo pendente).

### D-4 [VERIFICAR] — Faturas futuras aparecem como "Aberta"

A Carteira lista mar/2027, fev/2027, jan/2027, dez/2026 — todas as parcelas
futuras do notebook em 6x — cada uma com botão "Confirmar pagamento".

Isso não é necessariamente errado (são ciclos reais e futuros), mas **oferecer
"Confirmar pagamento" para uma fatura que vence em março de 2027 é estranho**.
Avalie: ou separe "ciclo corrente / próximos / anteriores" com destaque só para
o corrente, ou desabilite o pagamento de ciclo futuro com uma explicação.

---

## 2. RESPOSTAS às suas três perguntas

### 2.1 Realtime (item 9.8) — SIM, mas depois dos defeitos acima

Pode conectar o listener. Requisitos que não podem ser violados:

- **Desduplicação obrigatória.** Quem acabou de lançar já tem a linha na tela
  pelo `revalidatePath`. Sem controle, a linha aparece duas vezes. Use um `Set`
  de ids já renderizados.
- **O canal carrega o `family_id` no tópico.** O RLS de `realtime.messages` já
  está configurado na migration `00005` com
  `split_part(realtime.topic(), ':', 2) = get_user_family_id(...)`. Respeite
  esse formato de tópico, senão a assinatura é negada.
- **A lista de `/inicio` é paginada e filtrada por mês.** Uma linha nova de
  outro mês **não** deve ser injetada na lista do mês corrente — isso faria o
  total da página divergir dos indicadores. Prefira: se a linha é do mês
  exibido, insira; senão, mostre um aviso discreto "novo lançamento em
  setembro" com link.
- **Os indicadores também mudam.** Se você insere a linha mas não atualiza
  "Entrou/Saiu/Saldo", a tela passa a mostrar soma inconsistente com a lista.
  Ou atualize ambos, ou use `router.refresh()`.

### 2.2 Código de convite (P-001 / P-006) — adicione o botão "Gerar novo código"

Decisão do dono do projeto, com o raciocínio:

Hoje o limite de 2 membros protege (casa cheia recusa entrada). Mas essa
proteção **desaparece** quando o app abrir para famílias maiores — numa casa de
6 pessoas com vagas livres, quem acertar o código entra e vê as finanças.

**O que fazer agora (é seu):** botão "Gerar novo código" em
`/ajustes/familia`. Resolve o caso real — código vazou num print ou grupo de
WhatsApp, o dono rotaciona e o antigo morre.

**O que NÃO é seu:** a rotação precisa de uma função no banco que gere e grave
o código novo. Isso é back-end. **Reporte a necessidade e eu escrevo a
migration** — não crie migration, não altere `00001`–`00006`.

Limite de tentativas (`P-001`) continua pendente e também é back-end.

### 2.3 SMTP — é tarefa do dono, não sua

Correto o diagnóstico: o plano gratuito do Supabase limita e-mails. Quando o
Heitor for convidar gente de fora, ele conecta Resend ou SendGrid no painel.
**Não há nada a fazer no código.** Já está registrado.

---

## 3. NOVO REQUISITO DO DONO — responsividade por classe de dispositivo

Pedido textual: *"é bom fazer uma interface pensada para celular, notebook,
tablet e PC que podem usar a mesma interface, mas para o mobile tem que ser
diferente."*

Hoje o app é mobile-first com adaptação simples. O pedido é mais forte: o mobile
tem um **padrão de interação diferente**, não só um layout mais estreito.

### O que muda por classe

| Classe | Largura | Navegação | Ações | Densidade |
|---|---|---|---|---|
| **Celular** | < 768px | **barra inferior fixa** (5 pilares) | botão de ação flutuante ou fixo; modais viram folhas que sobem de baixo | alvos ≥ 44px, uma coluna, cartões empilhados |
| **Tablet** | 768–1023px | barra inferior **ou** lateral recolhida | modais centrados normais | duas colunas onde couber |
| **Notebook / PC** | ≥ 1024px | **barra lateral permanente**, sem barra inferior | ações inline; atalhos de teclado | múltiplas colunas, tabela em vez de cartão empilhado onde fizer sentido |

### Regras

1. **Uma base de código só.** Nada de rota separada para mobile, nada de
   detecção por user-agent no servidor (quebra o cache e dá hidratação errada).
   Use media query e container query.
2. **A barra inferior some em `lg:`** e é substituída por navegação lateral.
   Hoje ela aparece em todas as larguras — no desktop isso desperdiça a tela e
   parece app de celular esticado.
3. **Tabelas no desktop, cartões no celular.** A lista de lançamentos em 1440px
   tem espaço para colunas (data, descrição, categoria, conta, valor, estado).
   Em 375px continua cartão empilhado.
4. **A Carteira no desktop** pode mostrar contas e faturas lado a lado em vez de
   uma coluna longa.
5. **`/analises` é a tela que mais ganha com largura.** No desktop, grade de
   gráficos; no celular, um por vez com rolagem.
6. **Teste real em cada classe.** Screenshot em **375px, 768px, 1024px e
   1440px**, claro e escuro. Hoje faltam provas em 1024px.

---

## 4. FILA DE TRABALHO — nesta ordem

1. **D-1** — o número errado do cartão. É o mais urgente: mostra informação
   financeira falsa.
2. **D-2** — navegação `fixed` + safe-area do iPhone.
3. **D-3** — copy do Acerto.
4. **Responsividade por classe de dispositivo** (seção 3). É o pedido novo do
   dono e muda bastante coisa — faça depois dos defeitos, antes do Realtime.
5. **D-4** — tratamento de faturas futuras.
6. **Realtime** (seção 2.1), com as 4 restrições.
7. **Botão "Gerar novo código"** — construa a UI e **reporte** que precisa da
   função no banco.

---

## 5. O que continua sendo MEU (back-end) — não toque

```
app/supabase/migrations/   schema, RLS, funções SQL
app/src/actions/           Server Actions
app/src/lib/supabase/      clients
app/src/types/database.ts  tipos gerados
app/proxy.ts               middleware de sessão
app/src/lib/format.ts      utilitários com 83 testes
app/src/lib/invoice.ts
app/src/lib/settlement.ts
app/tests/                 testes de integração e unitários
```

Se precisar de dado que não existe, de função nova no banco, ou de view de
agregação: **pare e reporte no seu relatório**. Vira migration nova minha,
nunca `ALTER` no arquivo já aplicado.

Pendências de back-end que estão na minha fila, para você não duplicar:
- rotação de `join_code` (função no banco)
- limite de tentativas em `join_family` (P-001)
- Web Push com VAPID (a tabela `push_subscriptions` já existe)

---

## 6. Como entregar

1. Screenshots em **375, 768, 1024 e 1440**, claro **e** escuro
2. Console sem erro em cada rota tocada
3. `npx tsc --noEmit` → exit 0
4. `npx vitest run` → 167/167 sem regressão
5. Gate C-1: `grep -rn "primary" src/components/financeiro/` → 0
6. Para D-1: **cole a consulta** mostrando o número que a tela passou a exibir e
   o que `v_invoices` devolve, provando que batem
7. **Não marque como verificado o que não observou.** `NÃO VERIFICADO` + motivo
   é resposta aceitável; afirmação sem prova não é.

Commite à medida e faça deploy como você já vem fazendo.

---

## 7. Crédito onde é devido

O que você entregou nesta rodada é substancial e de boa qualidade: 7 áreas
funcionais, 15 rotas, as 4 paletas ligadas, PWA instalável, suíte de dataviz
completa, e **zero regressão** nos 167 testes. O gate C-1 passou, os tokens do
Vitrine foram respeitados, e o Acerto bate com o banco até o centavo.

Os defeitos acima são de acabamento, exceto D-1, que é de número. Corrija-o
primeiro.
