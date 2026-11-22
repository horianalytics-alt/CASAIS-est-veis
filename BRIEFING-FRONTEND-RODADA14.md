# Briefing Rodada 14 — Formulário em lote e botão "Corrigir meses futuros" (Antigravity)

> Data: 2026-11-21. Autor: Maestro. Dono do produto: Heitor.
> Marcação: **VERIFICADO** = conferi no código/commit nesta data. **A PROVAR** = não medi; confirme antes de agir.

---

## 0. Estado de partida

- Commit `78da367` está em `origin/main` e na Vercel. TSC limpo. 648+ testes passando (verifique com `npx vitest run` antes de começar).
- **Back-end aplicado em produção:** migrations 00001–00020. Nada disso muda nesta rodada.
- **Esta rodada NÃO tem nova migration.** Toda ela é front-end puro — exceto o Server Action `alterarRegra` que virá em briefing paralelo do Estrutura (Rodada 14-B). Aguarde o contrato antes de implementar o botão "Corrigir meses futuros" (§2.3). Se o contrato não chegou, implemente §2.1 e §2.2 primeiro e deixe §2.3 como pendência.
- **Componentes existentes relevantes (VERIFICADO):**
  - `app/src/components/transacoes/form-lancamento.tsx` — `FormLancamentoProps`, `ItemLote`, `CamposSimples`
  - `app/src/components/transacoes/dialogo-editar-lancamento.tsx` — já exibe nota de assinatura (F-4 da R13)
  - `app/src/components/recorrencia/lista-assinaturas.tsx` — botões "Editar valor" e "Encerrar" já existem
  - `app/src/actions/recorrencia.ts` — `criarRecorrencia`, `alterarValorRecorrencia`, `encerrarRecorrencia`
  - `app/src/lib/esquemas-recorrencia.ts` — `EntradaCriarRecorrencia` já tem `responsavelId`, `pagoPorId`, `formaDePagamentoId`, `observacao`
- **`FormLancamentoProps` atual (VERIFICADO em form-lancamento.tsx:52-57):**
  ```ts
  export interface FormLancamentoProps {
    contas: OpcaoDeConta[]
    categorias: OpcaoDeCategoria[]
    grupos?: OpcaoDeGrupo[]
    hoje: string
  }
  ```
  Não tem `membros` — nenhum campo de responsável ou pago por existe em nenhuma aba.
- **`ItemLote` atual (VERIFICADO em form-lancamento.tsx:78-89):**
  ```ts
  interface ItemLote {
    tipo: 'despesa' | 'receita'
    descricao: string
    valor: string
    data: string
    contaId: string
    categoriaId: string
    estaPago: boolean
    ehBeneficio: boolean
    ehFutil: boolean
    rotuloDoFutil: string
  }
  ```
  Falta vs. `CamposSimples`: `dataDoPagamento`, `formaDePagamentoId`, `responsavelId`, `cotaDoResponsavel`, `pagoPorId`, `observacao`, `parcelas`, `repetirTodoMes`.
- **Fonte da hora:** `hojeEmSaoPaulo()` em `app/src/lib/hoje.ts` (**VERIFICADO** — uso obrigatório no servidor; nunca `new Date()` no cliente para derivar data).

---

## 1. REGRA DE SEGURANÇA DESTA RODADA (inegociável)

**Só existe banco de PRODUÇÃO.** Com `.env.local` apontado, toda Action de escrita vai para a família real do Heitor e da Carol.

1. Não chame `alterarRegra`, `alterarValorRecorrencia`, `encerrarRecorrencia`, `criarRecorrencia` pelo browser durante testes. Prove via **teste de unidade com a Action mockada** (Vitest).
2. Leitura via `carregarCobrancasPendentes()` e `listarRecorrencias()` é segura — só leitura.
3. Se precisar de dado real para prova visual: **pare e peça ao Maestro**. O Maestro aciona o Semeador.
4. **Autorizado:** commits e push para `origin/main`.

---

## 2. O que fazer (por prioridade)

### 2.1 Adicionar `membros` a `FormLancamentoProps` e ao formulário simples (F-1)

**Problema:** o formulário de lançar (simples e lote) não tem campo de responsável nem de "pago por", mesmo que `EntradaCriarRecorrencia` já aceite `responsavelId` e `pagoPorId`. O Heitor criou uma recorrência e todos os 12 meses ficaram como Carol porque o campo não existia.

**O que fazer:**

1. Adicione `membros` a `FormLancamentoProps`:
   ```ts
   export interface OpcaoDeMembro {
     id: string
     nome: string
   }

   export interface FormLancamentoProps {
     contas: OpcaoDeConta[]
     categorias: OpcaoDeCategoria[]
     grupos?: OpcaoDeGrupo[]
     membros?: OpcaoDeMembro[]    // ← novo, opcional (backward compat)
     hoje: string
   }
   ```

2. No formulário **simples** (modo `despesa` ou `receita`), adicione, após o campo de categoria:
   - **Responsável** (`responsavelId`): `<Select>` com as opções de `membros` + "Sem responsável específico" (valor null). Só aparece quando `membros.length > 0`.
   - **Pago por** (`pagoPorId`): igual, só aparece quando `membros.length > 0` e `tipo !== 'transferencia'`. Padrão: o membro atual (A PROVAR: existe como inferir; se não existir, deixe sem padrão).
   - Esses campos vão para `EntradaDeLancamento` já existente — confirme que `salvarLancamento` aceita `responsavelId` e `pagoPorId` (**A PROVAR**: grep em `app/src/actions/lancamento.ts` antes de assumir).
   - Também vão para `EntradaCriarRecorrencia` quando "Repetir todo mês" estiver ligado (**VERIFICADO**: o esquema já aceita esses campos).

3. No formulário **simples** de **transferência**, `responsavelId` e `pagoPorId` **não aparecem** (transferência não tem dono pessoal).

4. Passe `membros` de onde `FormLancamento` é usado:
   - **A PROVAR:** grep onde `<FormLancamento` é renderizado e quais props chegam hoje. Passe `membros` de lá também. O Server Component pai já tem `familyId`; query para buscar membros: `supabase.from('members').select('id, name').eq('family_id', familyId)`.

### 2.2 Adicionar campos faltantes ao formulário em **lote** (F-2)

No modo lote, cada `ItemLote` precisa dos seguintes campos que o simples já tem mas o lote não tem:

**Obrigatórios nesta rodada:**
- **`estaPago` com date picker para `dataDoPagamento`**: o lote já tem o checkbox `estaPago`, mas **não tem** o campo de data quando está marcado. Adicione: quando `item.estaPago === true`, exiba `<Input type="date">` para `dataDoPagamento` ao lado/abaixo do checkbox. Mesmo comportamento do simples (linha 809: `{!ehContaCartao && estaPago ?`).
- **`formaDePagamentoId`**: Select de forma de pagamento por item. Reuse o mesmo padrão do formulário simples (A PROVAR: como o simples recebe `formasDePagamento`; grep por `formaDePagamento` no form-lancamento.tsx e no layout pai).
- **`observacao`**: `<Input type="text">` ou `<Textarea>` por item. Máximo 500 chars (como no simples — A PROVAR: se o simples já tem, grep por `observacao` no form-lancamento.tsx).

**Opcional nesta rodada (adicionar se não aumentar complexidade demais):**
- **`responsavelId`** e **`pagoPorId`**: mesmos selects do 2.1, por item. Só aparecem quando `membros.length > 0`.

**Atualizar `ItemLote`:**
```ts
interface ItemLote {
  tipo: 'despesa' | 'receita'
  descricao: string
  valor: string
  data: string
  contaId: string
  categoriaId: string
  estaPago: boolean
  dataDoPagamento: string        // ← novo
  formaDePagamentoId: string     // ← novo (SEM_FORMA_PAGAMENTO como sentinel ou '')
  observacao: string             // ← novo
  responsavelId: string          // ← novo (SEM_RESPONSAVEL ou '')
  pagoPorId: string              // ← novo (SEM_PAGADOR ou '')
  ehBeneficio: boolean
  ehFutil: boolean
  rotuloDoFutil: string
}
```

**Regra de cartão em lote:** `estaPago` já tem guarda para conta cartão (linha 136: `ehCartaoPrimeira ? false : true`). Certifique que quando o usuário troca `contaId` de um item para cartão, o `estaPago` daquele item seja forçado para `false` e `dataDoPagamento` seja limpo — igual ao simples (linha 224: `setValue('estaPago', false)`).

**Passar para `salvarLancamento`:** confirme (**A PROVAR**) que `EntradaDeLancamento` aceita `formaDePagamentoId`, `observacao`, `responsavelId`, `pagoPorId` em cada item de lote. Se não aceitar, descreva o pedido de alteração de contrato (não altere o arquivo de action).

### 2.3 Botão "Corrigir meses futuros" no extrato (F-3)

> **DEPENDÊNCIA:** este item depende do Server Action `alterarRegra` que virá do Estrutura (Rodada 14-B). Se o contrato ainda não chegou, **pule este item** e registre como pendência com a nota "aguardando contrato de alterarRegra".

**Onde o botão aparece:**
- Em `dialogo-editar-lancamento.tsx`, quando `transacao.recurring_rule_id != null` — a nota de assinatura já existe (linha 332–335 do dialogo). Adicione, nessa mesma área, um botão secundário:

  > **"Corrigir meses futuros"** — ícone de seta em loop — abre um diálogo de confirmação.

**Diálogo de confirmação:**
- Título: "Corrigir meses futuros"
- Texto: "Vai aplicar as informações que você acabou de salvar (responsável, conta, categoria, forma de pagamento) em todos os meses futuros pendentes desta assinatura, a partir de [mês do lançamento atual]."
- Dois botões: **"Corrigir"** (chama `alterarRegra`) e **"Só este mês"** (fecha sem fazer nada).
- Após `alterarRegra`: `router.refresh()` + toast de confirmação "X lançamentos corrigidos".
- Ao falha: exibe `res.erro` em Alert.

**Campos que o botão leva para `alterarRegra`:**
Pega os valores que o usuário acabou de salvar no diálogo de editar (descrição, conta, categoria, forma de pagamento, responsável, pago por — os campos que o diálogo de editar expõe hoje). **A PROVAR:** quais campos `dialogo-editar-lancamento.tsx` atualmente edita — faça grep antes de assumir.

**Assinatura do Server Action (quando chegar):**
```ts
alterarRegra(input: EntradaAlterarRegra): Promise<ResultadoAction<{ alterados: number }>>
```
Onde `EntradaAlterarRegra` tem: `regraId`, `aPartirDe: 'YYYY-MM'`, e os campos opcionais do patch.

**Também em `lista-assinaturas.tsx`:**
Adicione um botão "Corrigir regra" (ou "Editar regra completa") na lista de assinaturas, abrindo um diálogo similar com todos os campos editáveis da regra (descrição, conta, categoria, forma de pagamento, responsável, pago por, valor — mas valor já tem botão próprio). Isso permite corrigir a regra sem precisar entrar no extrato. **A PROVAR:** estrutura atual do item em `lista-assinaturas.tsx`; grep antes.

---

## 3. O que NÃO fazer

- Não toque `app/src/actions/`, `app/supabase/migrations/`, `app/src/lib/supabase/`, `app/src/lib/esquemas-recorrencia.ts` (são do back-end do Estrutura).
- Não adicione `alterarRegra` a `app/src/actions/recorrencia.ts` — isso vem do Estrutura.
- Não ative flag de feature na Vercel. Não use dados da família real para testar escrita.
- Não quebre os testes existentes nem introduza erro de tsc.
- Não adicione `parcelas` nem `repetirTodoMes` ao lote — esses campos fazem sentido só no simples.
- Não crie nova tabela, coluna ou RLS.

---

## 4. Verificação esperada (prova por arquivo)

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` sem regressão. Adicione testes de unidade para:
  - `FormLancamento` com `membros`: campo responsável aparece e some conforme `membros.length`.
  - Lote: `estaPago = true` exibe campo de data; troca de conta para cartão força `estaPago = false`.
  - Lote: campos `formaDePagamentoId` e `observacao` existem por item.
  - Se §2.3 implementado: mock de `alterarRegra` retornando `ok:true` e `ok:false`.
- Dev server: `cd app && npm run dev` (porta 3000). Se a porta estiver ocupada, avise.
- Screenshots com caminho **absoluto** usando `mcp__plugin_playwright_playwright__browser_take_screenshot` em 375px, 768px e 1440px, mais um em dark mode, nos estados:
  - Formulário simples com campo responsável visível (com `membros` passados).
  - Formulário lote com `estaPago = true` mostrando date picker.
  - Formulário lote com campos de forma de pagamento e observação.
  - Se §2.3 implementado: diálogo "Corrigir meses futuros" aberto.
- Console do navegador sem erro (`mcp__plugin_playwright_playwright__browser_console_messages`).
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz, quantos objetos existem, ou como uma plataforma/biblioteca se comporta (Next, Radix, Supabase, Tailwind) só entra em código ou relatório com a saída do comando ou o trecho da doc colado ao lado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

Devolva:
- Lista do que mudou (arquivo por arquivo).
- O que foi e o que **não** foi verificado (com motivo).
- Pendências que ficaram abertas.
- Se algo contradisser este briefing, escreva a contradição em vez de contornar.
- Bloco `### Auto-Análise` obrigatório (passes, erros encontrados, correções, lições, pendências).

Fonte: `app/src/components/transacoes/form-lancamento.tsx` (VERIFICADO), `app/src/lib/esquemas-recorrencia.ts` (VERIFICADO), `app/src/actions/recorrencia.ts` (VERIFICADO), `app/src/components/transacoes/dialogo-editar-lancamento.tsx` (A PROVAR — grep antes de agir), `app/src/components/recorrencia/lista-assinaturas.tsx` (A PROVAR).
