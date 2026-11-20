# Recorrência (assinaturas e fixos) — Desenho

> Data: 2026-11-20. Autor: Maestro, com decisões do Heitor.
> Marcação: **[Heitor]** = decidido por ele. **[Minha chamada]** = proposta minha, a confirmar.
> **A PROVAR** = afirmação técnica ainda sem evidência; o Estrutura prova na FASE: PLANO.

## 1. Intenção

Heitor e Carol lançam à mão, todo mês, gastos que se repetem sem fim conhecido
(Netflix, Crunchyroll, faculdade, planos de IA) e receitas fixas (salário). O que
incomoda é ter de entrar no app toda hora só para repetir o mesmo lançamento.
Hoje o app só tem **parcelas**, que têm fim conhecido (1 a 24 na tela, 120 no banco).
Recorrência é outra coisa: **não tem fim até alguém encerrar**.

## 2. Objetivos

- Ao lançar, um campo "repetir todo mês" cria a recorrência; o app mantém os lançamentos futuros sozinho. **[Heitor]**
- Vale para **despesa e receita**. **[Heitor]**
- Os próximos **12 meses** ficam sempre agendados como pendentes, renovando sozinhos, para a Previsão e a análise enxergarem os fixos com antecedência. **[Heitor, confirmou minha sugestão]**
- No dia da cobrança, um **pop-up em tela cheia, que bloqueia o app** até ser respondido, pergunta se já foi pago (despesa) ou recebido (receita). **[Heitor]**
- Preço mudou: dá para ajustar o valor **"daqui para frente"** e também **editar um mês só**. **[Heitor]**

## 3. Fora de escopo (nesta rodada)

- Agente de WhatsApp que ouve áudio e lança sozinho (ideia do Heitor, bem mais complexa; vira projeto próprio depois).
- Frequências diferentes de mensal (semanal, anual). **[Minha chamada]** só mensal; anual (IPVA, seguro) fica como pergunta futura.
- Notificação push do vencimento. **[Minha chamada]** o pop-up resolve; push é extra.

## 4. Comportamento

### 4.1 Criar
No formulário de lançar, um interruptor "Repetir todo mês", com `Parcelas` e `Repetir` **mutuamente exclusivos**. **[Minha chamada]** Dia da cobrança = dia da data do lançamento. Dia 29–31 em mês curto cai no último dia do mês (mesma regra das parcelas). Começa na data escolhida, sem data final.

### 4.2 Agendamento contínuo
Sempre 12 meses à frente, todos como **pendentes**. Quem mantém o horizonte (job agendado no banco ou renovação ao abrir o app) **A PROVAR**: o Estrutura confirma se `pg_cron` está disponível neste projeto antes de escolher.

### 4.3 Pop-up do dia da cobrança
- **Quem vê:** os dois; basta **um** responder, e some para o outro (via Realtime). **[Heitor]**
- **Bloqueia** o app até responder. **[Heitor]**
- **"Já foi pago": sim** → vira pago, fim. **[Heitor]**
- **"Ainda não": continua pendente e volta a perguntar no dia seguinte** em que o app for aberto. **[Heitor]**
- **Várias vencendo (ou vencidas em dias sem abrir o app):** uma por vez, em fila. **[Heitor]**
- Receita usa o texto "já recebeu?". **[Minha chamada]**

### 4.4 Editar e encerrar
- Alterar valor: "só este mês" **ou** "deste mês em diante" (os já pagos/lançados no passado não mudam). **[Heitor: as duas coisas]**
- Encerrar assinatura: define o último mês; os futuros pendentes somem, o histórico fica. **[Minha chamada]**
- Pausar: fora de escopo.

### 4.5 Aparece como "assinatura" para o usuário
Lista simples "Assinaturas e fixos" (em Ajustes ou Carteira, a definir pelo Fachada com o Heitor) para ver, editar valor e encerrar. **[Minha chamada]**

## 5. Modelo de dados (proposta, o Estrutura valida)

- Tabela nova `recurring_rules` (por família; RLS por `family_id` como o resto): conta, tipo, valor em centavos, categoria, forma de pagamento, quem pagou/dono, dia do mês, data de início, data de fim (nula = sem fim), ativa.
- `transactions` ganha `recurring_rule_id` (FK composta com `family_id`).
- Estado do pop-up: coluna "perguntar de novo a partir de" no lançamento recorrente. **A PROVAR** se cabe em `transactions` sem quebrar a imutabilidade do acerto (00015).
- Geração reaproveita a regra de fatura de cartão do `save_transactions` (compra no dia do fechamento cai na fatura seguinte).

## 6. Perguntas que ainda dependem do Heitor

1. Em **cartão de crédito**, "já foi pago" significa o quê? A despesa já conta como gasto no mês da fatura; o pop-up aí confirmaria a fatura ou a compra? (o Estrutura traz os fatos na FASE: PLANO e eu te pergunto)

## 7. Divisão de trabalho

Estrutura (tabela, RPC, job, testes de isolamento) → Fachada/Antigravity (formulário, pop-up, lista) → Sentinela antes de publicar. O Dash só entra se a Previsão precisar de ajuste (**A PROVAR**).
