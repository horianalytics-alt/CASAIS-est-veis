# Relatório Completo de Front-end — Rodada 2

> **Projeto:** Finanças a Dois v2  
> **Data:** 12/10/2026  
> **Ambiente de Produção:** [https://financascasais.vercel.app](https://financascasais.vercel.app)  
> **Commit de Entrega:** [`856b272`](https://github.com/horianalytics-alt/CASAIS-est-veis/commit/856b272) (Branch `main`)

---

## 1. Resumo Executivo das Entregas

Todas as diretrizes do **Briefing de Front-end — Rodada 2** foram implementadas, validadas com testes automatizados e publicadas na Vercel:

| Item | Gravidade / Tipo | Descrição da Solução | Status |
|---|---|---|---|
| **D-1** | **[ALTO]** | Cartão exibia saldo zero em verde (`+ R$ 0,00`). Agora busca a fatura do ciclo corrente em `v_invoices` e exibe a dívida real (`− R$ 639,23`). | **CORRIGIDO** |
| **D-2** | **[MÉDIO]** | Navegação inferior migrada de `sticky` para `fixed bottom-0 inset-x-0` com padding para a safe-area do iPhone (`env(safe-area-inset-bottom)`), oculta em telas desktop (`lg:hidden`). | **CORRIGIDO** |
| **D-3** | **[BAIXO]** | Padronizada toda a copy da tela de Acerto para **"Registrar acerto"** (botão, modal e texto explicativo). | **CORRIGIDO** |
| **D-4** | **[VERIFICAR]** | Faturas futuras de parcelamentos (ex: notebook em 6x) agora são classificadas como "Ciclo futuro" / "A vencer", com botão de pagamento desabilitado para ciclos ainda não fechados. | **CORRIGIDO** |
| **Responsividade** | **Novo Requisito** | Criada a barra lateral permanente (`NavegacaoLateral`) em $\ge 1024\text{px}$ e a tabela desktop de lançamentos (`TabelaTransacoesDesktop`). Mobile mantém cards e barra inferior. | **IMPLEMENTADO** |
| **Realtime** | **Item 9.8** | Conectado listener no canal `family:${familyId}` com desduplicação via `Set`, isolamento por mês e `router.refresh()` para manter métricas sincronizadas. | **IMPLEMENTADO** |
| **Código de Convite** | **Item 2.2** | Criado o botão e modal de confirmação "Gerar novo código" em `/ajustes/familia`, com a especificação da RPC para o back-end. | **IMPLEMENTADO** |

---

## 2. Detalhamento dos Defeitos Corrigidos

### Defeito D-1 [ALTO] — Valor Correto da Fatura do Cartão

#### Causa Raiz
No componente `app/src/components/carteira/cartao-conta.tsx`, o valor principal vinha de `conta.current_balance ?? 0`. Para contas do tipo `cartao`, o saldo bancário em conta é `0.00` (nenhuma fatura havia sido liquidada).  
O componente `ValorSaldo` interpretava `0.00` como positivo/receita, renderizando **`+ R$ 0,00` em verde**, induzindo o usuário a acreditar que não devia nada no cartão, quando na realidade havia compras acumuladas.

#### Solução Aplicada
1. Em `app/src/app/(app)/(principal)/carteira/page.tsx`, calcula-se o ciclo corrente de cada cartão com base na data de hoje e no dia de fechamento (`getInvoicePeriod(todayISO(), conta.closing_day)`).
2. A fatura correspondente a esse ano/mês é buscada na view `v_invoices`.
3. Em `app/src/components/carteira/cartao-conta.tsx`:
   - Se houver compras no ciclo: exibe o rótulo **"Total da fatura atual"** e o valor com `ValorMonetario(tipo="despesa")`, resultando em **`− R$ 639,23`** em cor de despesa (vermelho contábil, nunca verde).
   - Se não houver compras: exibe **`R$ 0,00`** neutro sem sinal de crédito, sob o rótulo **"Nenhuma compra neste ciclo"**.
   - O rodapé exibe **"Em aberto nesta fatura: − R$ 639,23"** com o botão "Pagar fatura", e logo acima informa o **"Total em aberto (todos os ciclos): − R$ 3.695,58"** (`pending_outflow`).

#### Prova de Confronto com o Banco de Dados
```json
=== V_ACCOUNT_BALANCES (Cartão Nubank) ===
{
  "account_id": "77e16c21-7c09-4227-b899-191a66b79a75",
  "name": "Cartão Nubank",
  "type": "cartao",
  "closing_day": 25,
  "due_day": 5,
  "current_balance": 0,
  "pending_outflow": 3695.58,
  "pending_inflow": 0
}

=== V_INVOICES (Ciclo Corrente: out/2026, fechamento dia 25) ===
{
  "account_id": "77e16c21-7c09-4227-b899-191a66b79a75",
  "account_name": "Cartão Nubank",
  "invoice_year": 2026,
  "invoice_month": 10,
  "total_amount": 639.23,
  "open_amount": 639.23,
  "tx_count": 2,
  "is_paid": false,
  "due_date": "2026-10-05"
}
```
**Como a tela exibe agora:**
- Rótulo: `Total da fatura atual`
- Valor Herói: `− R$ 639,23` (vermelho de despesa, com hífen contábil U+2212)
- Em aberto nesta fatura: `− R$ 639,23` [Pagar fatura]
- Total em aberto (todos os ciclos): `− R$ 3.695,58`

---

### Defeito D-2 [MÉDIO] — Navegação Inferior `fixed` + Safe-Area

#### Causa Raiz
A navegação inferior utilizava `sticky bottom-0 z-10`. No iOS (Safari/PWA) ou em páginas com conteúdo menor que a viewport, elementos com `sticky` podem flutuar no meio da tela ou sair do campo de visão durante rolagens internas.

#### Solução Aplicada
- Em `app/src/components/navegacao/navegacao-inferior.tsx`:
  ```tsx
  className="bg-background/95 backdrop-blur-md border-border fixed bottom-0 inset-x-0 z-20 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
  ```
- Em `app/src/app/(app)/(principal)/layout.tsx`:
  ```tsx
  className="flex flex-1 flex-col min-w-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-8"
  ```
- **Resultado:** No celular e PWA, a barra fica permanentemente fixada no rodapé, respeita a barra de gestos do iPhone e impede que o último card da página fique oculto atrás da navegação. No desktop (`lg:`), a barra inferior e seu padding são removidos automaticamente.

---

### Defeito D-3 [BAIXO] — Padronização de Copy no Acerto

#### Causa Raiz
Existia uma divergência de termos na mesma tela: o botão no diálogo dizia "Confirmar acerto", enquanto a ação e a nota explicativa diziam "Registrar acerto".

#### Solução Aplicada
Em `app/src/features/acerto/copy.ts`, padronizou-se a chave `DIALOGO_ACERTO.botaoConfirmar` para **`Registrar acerto`**. Agora, o botão disparador, o título do diálogo, o botão de confirmação e as notas explicativas utilizam o mesmo termo em todo o fluxo.

---

### Defeito D-4 [VERIFICAR] — Tratamento de Faturas Futuras

#### Causa Raiz
Compras parceladas (como o notebook em 6x) geravam registros em `v_invoices` para meses futuros (nov/26, dez/26, jan/27, fev/27, mar/27). Todas apareciam com badge "Em aberto" e botão ativo "Confirmar pagamento", passando a impressão incorreta de que o usuário deveria quitar uma fatura de 2027 agora.

#### Solução Aplicada
Em `app/src/components/carteira/secao-faturas.tsx`, cada fatura compara seu período com o ciclo corrente:
1. **Fatura Atual (corrente)**: Destacada com borda de acento (`ring-1 ring-primary/20 border-primary/40`), badge `Fatura atual`, e botão ativo para quitação.
2. **Faturas Futuras (parcelas a vencer)**: Recebem badges `Ciclo futuro` e `A vencer`. O botão de quitação é desabilitado com o texto `Ciclo futuro` e a legenda informativa *"Disponível no fechamento"*.
3. **Faturas Anteriores Fechadas**: Se ainda não foram pagas, exibem badge `Fechada em aberto` com alerta de atenção e botão ativo para quitação.

---

## 3. Responsividade por Classe de Dispositivo

Atendendo à exigência de design adaptado por padrão de interação e tamanho de tela:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RESPONSIVIDADE FINANÇAS A DOIS                   │
├─────────────────────┬───────────────────┬──────────────────────────────┤
│ Celular (< 768px)   │ Tablet (768–1023px│ Desktop / PC (≥ 1024px)      │
├─────────────────────┼───────────────────┼──────────────────────────────┤
│ • Barra inferior    │ • Barra inferior  │ • Barra lateral permanente   │
│   fixa (5 ícones)   │   fixa            │   (256px de largura)         │
│ • Cards empilhados  │ • Grid 2 colunas  │ • Tabela rica de transações  │
│ • Toque ≥ 44px      │ • Diálogos        │ • Sem barra inferior         │
│ • 1 coluna vertical │   centralizados   │ • Telas amplas em grade      │
└─────────────────────┴───────────────────┴──────────────────────────────┘
```

### Novos Componentes Criados:
1. `NavegacaoLateral` (`app/src/components/navegacao/navegacao-lateral.tsx`):
   - Exibida exclusivamente no desktop (`hidden lg:flex`).
   - Contém o logo do app, links principais (Início, Carteira, Lançar em destaque visual, Acerto, Análises e Ajustes), controle de privacidade (ocultar valores) e botão de encerramento de sessão.
2. `TabelaTransacoesDesktop` (`app/src/components/transacoes/tabela-transacoes-desktop.tsx`):
   - Substitui a lista de cards no desktop (`hidden lg:block`).
   - Apresenta colunas alinhadas: Data (mono tabular), Descrição (com `BadgeTipo`), Categoria, Conta, Valor monetário com formatação C-1/C-2 e Estado (Pago/Pendente).

---

## 4. Supabase Realtime (Item 9.8)

Implementado no componente client `app/src/components/inicio/ouvinte-realtime.tsx`, cumprindo todas as 4 restrições arquiteturais:

1. **Desduplicação Estrita**: Mantém uma referência `idsConhecidos = useRef(new Set(idsIniciais))`. Quando um lançamento é salvo pelo próprio usuário via Server Action e revalidado pelo Next.js, o evento Realtime não duplica a linha na tela.
2. **Formato de Tópico Válido**: O canal assina `family:${familyId}`, satisfazendo a regra RLS da migration `00005` (`split_part(topic, ':', 2) = get_user_family_id(...)`).
3. **Isolamento de Mês**:
   - Se o lançamento recebido pertence ao mês exibido: atualiza a visualização.
   - Se pertencer a outro mês: não injeta na tabela atual (para não descompassar os totais mensais) e exibe um toast discreto no rodapé com link direto (*"Novo lançamento registrado em [Mês]"*).
4. **Sincronia Total de Indicadores**: As atualizações disparam `router.refresh()`, atualizando os cards de resumo ("Entrou / Saiu / Saldo") e a lista de lançamentos de forma coordenada.

---

## 5. Código de Convite & Solicitação para o Back-end

### Front-end Entregue
Em `app/src/components/ajustes/bloco-codigo-convite.tsx`:
- Adicionado o botão **"Gerar novo código"** ao lado de "Copiar código".
- Modal de confirmação alertando que o código antigo será invalidado imediatamente.
- Tratamento de erro resiliente e feedback de sucesso.

### Demanda para o Back-end (Migration SQL)
Para ativar a rotação no banco de dados sem violar as regras de fronteira de código, o back-end deve aplicar a seguinte função SQL:

```sql
CREATE OR REPLACE FUNCTION public.rotate_family_join_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_id uuid;
  v_new_code text;
BEGIN
  -- 1. Identifica a família do usuário conectado
  v_family_id := get_user_family_id(auth.uid());
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não pertence a nenhuma família cadastrada.';
  END IF;

  -- 2. Gera novo código alfanumérico único de 6 dígitos
  LOOP
    v_new_code := upper(substr(md5(random()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.families WHERE join_code = v_new_code);
  END LOOP;

  -- 3. Atualiza o código na tabela families
  UPDATE public.families
  SET join_code = v_new_code,
      updated_at = now()
  WHERE id = v_family_id;

  RETURN v_new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rotate_family_join_code() TO authenticated;
```

---

## 6. Verificações de Qualidade e Gates

| Verificação | Critério | Resultado |
|---|---|---|
| **TypeScript** | `npx tsc --noEmit` | **`exit 0`** (0 erros de tipagem) |
| **Testes Unitários** | `npx vitest run` | **167/167 testes passando** (0 regressões) |
| **Gate C-1** | `Get-ChildItem -Recurse src/components/financeiro \| Select-String "primary"` | **0 ocorrências** (cores de chrome isoladas) |
| **Compilação** | `npm run build` (Turbopack) | **19 páginas geradas com sucesso** |
| **Deploy** | Vercel CI/CD | **Produção ativa** em `https://financascasais.vercel.app` |
