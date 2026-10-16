# Carteira de Investimento — Spec de Design

**Data:** 2026-10-16
**Autor:** Maestro, a partir de brainstorming com o Heitor.

## 1. Problema

Hoje o tipo `investimento` existe no schema de `transactions` e no CHECK de
`accounts.type`, mas nunca foi exposto na UI. O Heitor relatou confusão real
usando o app: não existe forma de marcar "apliquei dinheiro" nem de
acompanhar quanto tem investido, em quê, e quanto está rendendo.

## 2. O que o Heitor pediu (resumo da conversa)

Uma área dentro de Carteira, separada do saldo do dia a dia, onde ele move
dinheiro das contas normais e organiza em "caixinhas" (reserva de
emergência, pré-fixado, pós-fixado, etc.), cada uma com uma taxa de
rendimento que ele mesmo informa (% da Selic/CDI/CDB), crescendo mês a mês
de forma simulada, com gráfico de projeção. Aporte automático mensal fica
para uma fase futura.

## 3. Decisões de modelo (fechadas na conversa com o Heitor)

1. **Carteira de Investimento é uma ÁREA nova**, não uma conta adicional
   por caixinha. Uma transferência de uma conta normal (ex.: Conta
   Corrente) credita o saldo agregado da Carteira de Investimento e
   debita a conta de origem — mesmo mecanismo de uma transferência comum
   entre contas, mas com um destino especial.
2. **Caixinhas são organização interna do saldo da Carteira de
   Investimento**, não contas separadas. Têm nome livre (não um enum
   fixo), tipo de rendimento e taxa definida pelo usuário.
3. **Taxa é uma estimativa que o usuário informa e ajusta manualmente** —
   nunca uma integração automática com SELIC/CDI real nesta fase. A UI
   deixa isso explícito (ex.: "Estimativa — taxa definida em dd/mm/aaaa").
4. **Rendimento é calculado mensalmente**, não diariamente — mesma técnica
   de juros compostos em centavos inteiros já usada em
   `src/lib/simulador.ts` (`simularValorFuturo`/`projetarValorFuturo`).
4b. **Rendimento mensal nasce "estimado" e só vira saldo de verdade por
    confirmação manual** (decisão tomada durante a FASE: PLANO do
    Estrutura, 2026-10-16, revisando a recomendação original deste spec
    de "nunca resgatável"). O Heitor rejeitou as duas pontas — nem
    "resgatável automaticamente" (criaria dinheiro do nada a partir de
    uma taxa sem validação externa) nem "só exibição, nunca grava" (ele
    quer acompanhar o rendimento real mês a mês, não recalculado do
    zero toda vez que abre a tela). O modelo final: todo mês a caixinha
    mostra "Rendimento estimado: R$ X — Confirmar?"; só quando o usuário
    confirma, aquele valor específico soma ao `balance_cents` da
    caixinha e passa a contar no patrimônio e ser resgatável. Meses não
    confirmados não expiram nem viram saldo sozinhos.
5. **Regra de resgate por caixinha**: uma flag `resgate_imediato`
   (boolean). Quando `false`, a caixinha tem uma `data_vencimento`; antes
   dela, o saldo não pode ser resgatado. Quando `true`, resgate livre a
   qualquer momento.
6. **Resgate** move saldo de volta: de uma caixinha para o saldo livre
   (não alocado) da Carteira de Investimento, ou direto para uma conta
   normal (debita a caixinha, credita a conta — mesma mecânica inversa da
   aplicação).
7. **Fora de escopo desta leva**: aporte automático recorrente a cada
   salário; taxa SELIC/CDI real via API externa (a taxa é sempre manual).

## 4. Modelo de dados (proposta inicial — Estrutura valida/ajusta no plano)

Cria uma conta especial do tipo `investimento` por família (reaproveitando
`accounts.type = 'investimento'`, que já existe no schema) para representar
a Carteira de Investimento agregada. O saldo dessa conta é a soma de:
saldo não alocado + saldo de todas as caixinhas.

Tabela nova `investment_boxes` (nome final a critério do Estrutura, seguindo
a convenção do projeto):
- `id`, `family_id`, `account_id` (a conta de investimento da família)
- `name` (texto livre, ex.: "Reserva de emergência")
- `rate_type` (ex.: `'pre_fixado' | 'pos_fixado' | 'liquidez_diaria'` —
  Estrutura decide o enum exato)
- `rate_bps` (taxa mensal em pontos-base, mesma convenção de
  `simularValorFuturo`)
- `rate_defined_at` (data em que a taxa foi informada — para o aviso de
  "estimativa desde")
- `resgate_imediato` (boolean)
- `data_vencimento` (nullable, obrigatória quando `resgate_imediato=false`)
- `balance_cents` (saldo atual da caixinha, centavos inteiros)
- `created_at`, `updated_at`

Movimentação de saldo entre caixinhas e o saldo não alocado: decidir entre
(a) uma tabela de movimentos (`investment_box_movements`) para ter
histórico auditável, ou (b) só atualizar `balance_cents` direto. O Estrutura
decide no plano, citando `supabase:supabase-postgres-best-practices` —
minha recomendação é (a), para o gráfico de projeção ter pontos históricos
reais de aporte, não só o saldo atual.

O cálculo mensal de rendimento precisa de um mecanismo de "aplicar o mês"
— avaliar `pg_cron` (citando `supabase:supabase` antes de decidir) rodando
uma vez por mês, ou calcular sob demanda na leitura (ex.: a view/RPC calcula
"quanto já renderia até hoje" sem gravar nada, e só grava de fato quando
o usuário abre a tela ou um cron mensal consolida). Decisão de arquitetura
do Estrutura, com fonte citada.

## 5. Front-end (visão geral — Fachada/Dash detalham no plano)

- Nova aba/seção "Investimentos" dentro de `/carteira`.
- Tela mostra: saldo total da carteira de investimento, saldo não alocado,
  lista de caixinhas (nome, tipo, taxa, saldo, badge de resgate
  imediato/vencimento).
- Fluxo de "Aplicar": formulário que debita uma conta normal e credita o
  saldo não alocado da carteira de investimento (ou direto numa caixinha
  existente).
- Fluxo de "Alocar": mover saldo não alocado para uma caixinha.
- Fluxo de criar caixinha: nome, tipo de rendimento, taxa, resgate
  imediato ou data de vencimento.
- Fluxo de "Resgatar": move saldo de uma caixinha de volta (para não
  alocado ou direto para uma conta), bloqueado se `resgate_imediato=false`
  e `data_vencimento` no futuro.
- Gráfico de projeção por caixinha, reaproveitando `GraficoLinha` (Dash) —
  forma de linha, eixo único, mesma decisão já tomada no PLANO.md para
  patrimônio/simulador.

## 6. Riscos identificados no brainstorming

- **Taxa desatualizada corrói confiança**: mitigado deixando explícito na
  UI que é estimativa, com data de quando foi definida.
- **Complexidade de múltiplas caixinhas com regras diferentes**: mitigado
  com modelo simples (flag + data de vencimento), sem simular regras reais
  de liquidez de mercado.
- **Confusão entre "transferência entre contas" e "aplicar na carteira de
  investimento"**: mitigado com linguagem própria ("Aplicar"/"Resgatar"),
  não "Transferir".
- **Aporte automático mexendo em dinheiro real**: fora de escopo nesta
  leva — fica para uma fase 2, depois que o fluxo manual estiver testado
  em uso real.

## 7. Próximo passo

Escrever o plano de implementação (`writing-plans`), dividindo entre
Estrutura (schema, RPC/Server Actions, cálculo de rendimento) e
Fachada/Dash (UI da área de investimentos, gráfico de projeção) — seguindo
a ordem canônica do pipeline já documentada no `PLANO.md` deste projeto.
