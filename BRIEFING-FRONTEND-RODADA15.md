# Briefing Rodada 15 — Color picker livre + Heatmap de dias clicável (Fachada)

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> Marcação: **VERIFICADO** = conferi no código nesta data. **A PROVAR** = não medi; confirme antes de agir.

---

## 0. Estado de partida

- Commits da Rodada 14 estão em `origin/main`. TSC limpo. 682 passando | 190 skipped (vitest run SEM .env.local).
- **Esta rodada NÃO tem migration.** Toda ela é front-end puro.
- **Bug de layout da lista de assinaturas (foto 1 do Heitor) já foi corrigido** diretamente pelo Maestro nesta sessão. Os botões "Corrigir regra", "Editar valor" e "Encerrar" agora usam `flex-wrap` com `flex-1 min-w-[120px]` nos dois primeiros e `w-full` no Encerrar. **NÃO retoque essa área.**
- **Componentes relevantes (VERIFICADO):**
  - `src/components/ajustes/seletor-tema.tsx` — seletor atual com 4 paletas fixas
  - `src/components/providers/tema-script.tsx` — script anti-flash no `<head>`
  - `src/styles/tema.ts` — `PaletaId`, `PALETAS`, `CHAVE_PALETA`
  - `src/app/globals.css` — blocos `[data-paleta="X"]` que sobrescrevem `--primary`
  - `src/components/analises/mapa-de-calor-dias.tsx` — heatmap de dias
  - `src/app/(app)/(principal)/analises/page.tsx` — passa `transacoes` ao `MapaDeCalorDias`

---

## 1. REGRA DE SEGURANÇA DESTA RODADA (inegociável)

**Só existe banco de PRODUÇÃO.** Não chame nenhuma Server Action de escrita pelo browser durante testes. Não use dados reais do banco para testar escrita. Leitura é segura.

Afirmação sobre o que o código existente faz só entra em relatório com a saída do comando ou trecho do código colado ao lado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

### 2.1 Color picker livre — "escolher qualquer cor" (F-1)

**Problema:** hoje há 4 paletas fixas (Cedro, Ardósia, Terra, Ameixa) definidas como blocos CSS em `globals.css` com `[data-paleta="X"]`. O Heitor quer poder escolher qualquer cor, seja ajustando num seletor visual ou digitando um código hex.

**Arquitetura aprovada pelo Maestro:**

As 4 paletas fixas continuam funcionando exatamente como estão (CSS puro via `data-paleta`). Um novo modo "Personalizada" aplica `--primary` diretamente via `style.setProperty` no elemento `<html>`. O `data-paleta` para de existir quando uma cor customizada está ativa.

**A PROVAR:** como o `globals.css` gera `--primary-foreground` e `--ring` a partir do `--primary`. Se for gerado automaticamente pelo CSS, ótimo. Se precisar ser calculado manualmente, use a fórmula: foreground branco (#FFFFFF) para cores escuras (luminância < 0.4), preto (#101417) para claras.

**O que mudar:**

1. **`src/styles/tema.ts`** — adicione:
   ```ts
   export const CHAVE_COR_CUSTOM = 'fad.cor-custom'
   // PaletaId continua o union de 4; cor custom fica em chave separada
   ```
   Não quebre `PaletaId` — as 4 paletas fixas continuam válidas. A cor customizada é ortogonal: salva em `CHAVE_COR_CUSTOM`, e quando presente, o `data-paleta` não é escrito.

2. **`src/components/ajustes/seletor-tema.tsx`** — adicione uma quinta "opção" de paleta: **"Personalizada"** com um círculo que mostra a cor atual (ou uma cor padrão se nunca tiver escolhido). Ao clicar nela, abre um picker inline (ver spec abaixo). Se uma cor customizada estiver salva, o botão "Personalizada" aparece selecionado mesmo que não corresponda a nenhuma das 4 paletas fixas.

   **Spec do picker inline:**
   - Um `<input type="color">` nativo (suporte universal, acessível, sem lib extra).
   - Ao lado, um `<input type="text">` para digitar hex (`#RRGGBB`), sincronizado bidirecionalmente com o color input.
   - Botão "Usar esta cor" aplica a cor.
   - Botão "Redefinir" remove a cor customizada e volta para a paleta padrão (Cedro).
   - O picker só aparece quando o usuário clica em "Personalizada" — não abre ao clicar nas 4 paletas fixas.

3. **`src/components/ajustes/seletor-tema.tsx` — lógica de aplicação:**
   ```ts
   const aplicarCorCustom = (hex: string) => {
     const raiz = document.documentElement
     delete raiz.dataset.paleta  // remove qualquer paleta fixa
     raiz.style.setProperty('--primary', hex)
     // foreground: calcule luminância relativa
     const foreground = luminanciaRelativa(hex) < 0.179 ? '#FFFFFF' : '#101417'
     raiz.style.setProperty('--primary-foreground', foreground)
     raiz.style.setProperty('--ring', hex)
     // accent: versão mais clara (20% de opacidade) — pode usar hex+'33'
     raiz.style.setProperty('--accent', hex + '20')
     try { localStorage.setItem(CHAVE_COR_CUSTOM, hex) } catch {}
     try { localStorage.removeItem(CHAVE_PALETA) } catch {}
   }
   ```
   Implemente `luminanciaRelativa(hex: string): number` usando a fórmula padrão WCAG (linearizar canal sRGB, aplicar coeficientes 0.2126/0.7152/0.0722).

4. **`src/components/providers/tema-script.tsx`** — atualize o SCRIPT inline para restaurar a cor customizada no anti-flash:
   ```js
   var corCustom = localStorage.getItem("fad.cor-custom");
   if (corCustom) {
     raiz.style.setProperty("--primary", corCustom);
     // recalcular foreground inline (duplicar a lógica — sem import possível)
     // usar: luminância < threshold → branco, senão preto
     delete raiz.dataset.paleta;
   } else if (paleta && paleta !== "cedro") {
     raiz.dataset.paleta = paleta;
   } else {
     delete raiz.dataset.paleta;
   }
   ```
   O cálculo de luminância **precisa estar inline** no script (não pode fazer import). Implemente a versão compacta em ~8 linhas de JS puro sem dependências.

5. **Ao selecionar uma das 4 paletas fixas enquanto uma cor customizada está ativa:** remova `localStorage.removeItem("fad.cor-custom")`, remova `style.removeProperty("--primary")` (e `--primary-foreground`, `--ring`, `--accent`), e aplique o `data-paleta` normalmente.

**O que NÃO fazer no color picker:**
- Não instale bibliotecas de color picker (`react-colorful`, etc.) — `<input type="color">` nativo é suficiente.
- Não altere os blocos CSS das 4 paletas em `globals.css`.
- Não mude `PaletaId` para `string` — os tipos fixos continuam como estão.
- Não tente derivar a paleta de série de gráficos da cor customizada (isso é escopo do Vitrine/Dash, não desta rodada).

---

### 2.2 Heatmap de dias clicável — detalhe de transações do dia (F-2)

**Problema:** o componente `MapaDeCalorDias` mostra a intensidade de gasto por dia, mas cada quadradinho é apenas um `<div>` visual. O Heitor quer poder clicar num dia e ver todas as transações daquele dia.

**Dados disponíveis (VERIFICADO em `analises/page.tsx:56-59`):**
```ts
transacoes = supabase.from('transactions').select(
  'id, date, amount, type, description, account_id, category_id, is_paid, is_benefit, is_futile, futile_label'
)
// Filtradas por .gte('date', inicio).lte('date', fim) — já são as do mês
```

Esses dados são passados para `<MapaDeCalorDias anoMes={mes} transacoes={transacoes} />`, mas hoje a interface `TransacaoSimples` só recebe `{ date, amount, type }` — os campos de descrição, conta, categoria não chegam ao componente.

**O que mudar:**

1. **`src/app/(app)/(principal)/analises/page.tsx`** — a query já busca todos os campos necessários. Passe-os ao `MapaDeCalorDias`:
   - Ou expanda `TransacaoSimples` para incluir os campos extras.
   - Ou passe uma segunda prop `transacoesCompletas` com o array completo.
   - **Decisão do Maestro:** expanda `TransacaoSimples` — é mais limpo. Adicione `id`, `description`, `account_id`, `category_id`, `is_paid` opcionais.

2. **`src/components/analises/mapa-de-calor-dias.tsx`** — faça as seguintes mudanças:
   
   a) **Transforme cada dia de `<div>` para `<button>`** com `type="button"`. Dias sem gasto (`gasto === 0`) NÃO são clicáveis (mantenha `<div>` para eles — não tem sentido clicar num dia vazio).
   
   b) **State:** `diaAberto: number | null` para saber qual dia está no modal.
   
   c) **Modal/Sheet:** ao clicar num dia com gasto, abre um `<Dialog>` (ou `<Sheet>` se preferir slide lateral — o Maestro não tem preferência, escolha o que melhor encaixar mobile-first) mostrando:
   - Título: "Dia X" (ex: "Dia 7")
   - Subtítulo: "Total: R$ 123,45" (soma das despesas do dia)
   - Lista das transações do dia (tipo `despesa` apenas — afinal é o heatmap de gastos):
     - Descrição
     - Valor monetário (use `<ValorMonetario />` ou `formatBRL()` + respeite `oculto`)
     - Conta (use o mapa de contas — **A PROVAR:** o componente não recebe o mapa de contas hoje; você vai precisar receber `mapaContas` como prop ou receber `contas: { id, nome }[]` para montar o mapa internamente)
     - Badge se for `is_benefit` ou `is_futile`
     - Status de pagamento (pago/pendente)
   - Botão de fechar

   **Prop necessária:** o componente atual não tem `contas` — você precisa adicionar uma prop `contas?: { id: string; nome: string }[]` a `MapaDeCalorDiasProps` e passá-la de `analises/page.tsx` (que já busca `contas`).

   d) **Respeite `oculto`:** todos os valores monetários no modal usam `useOcultarValores()` já importado no componente.

   e) **Acessibilidade:** `<button>` com `aria-label="Dia X: despesa − R$ 123,45"` (já existe como `title` — transforme em `aria-label`). Modal tem `aria-labelledby`.

**O que NÃO fazer no heatmap:**
- Não faça nova query ao banco ao clicar — os dados já estão em memória.
- Não mostre receitas no modal do heatmap — só despesas (é o mapa de gastos).
- Não mude a lógica de coloração dos dias.

---

## 3. O que NÃO fazer

- Não toque `app/src/actions/`, `app/supabase/migrations/`, `app/src/lib/supabase/`.
- Não altere os 4 blocos CSS fixos em `globals.css`.
- Não ative flag de feature na Vercel. Não use dados da família real para testar escrita.
- Não quebre os testes existentes nem introduza erro de tsc.
- Não retoque o layout dos botões de assinaturas — já foi corrigido nesta sessão.

---

## 4. Verificação esperada (prova por arquivo)

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` SEM `.env.local` carregado — resultado esperado ≥190 skipped. Se `skipped` cair para 0, PARE imediatamente (risco de escrever no banco de produção).
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** usando `mcp__plugin_playwright_playwright__browser_take_screenshot` em 375px, 768px e 1440px, mais um em dark mode:
  - Seletor de paleta com a opção "Personalizada" visível.
  - Picker aberto com `<input type="color">` e campo hex.
  - Uma cor customizada aplicada (ex: um azul vivo `#2563EB`) — verifique visualmente que `--primary` mudou.
  - Heatmap de dias com um dia clicável destacado.
  - Modal de detalhe do dia aberto com lista de transações.
- Console sem erros (`mcp__plugin_playwright_playwright__browser_console_messages`).
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

Fonte verificada: `src/styles/tema.ts` (VERIFICADO), `src/app/globals.css` (VERIFICADO), `src/components/providers/tema-script.tsx` (VERIFICADO), `src/components/ajustes/seletor-tema.tsx` (VERIFICADO), `src/components/analises/mapa-de-calor-dias.tsx` (VERIFICADO), `src/app/(app)/(principal)/analises/page.tsx` (VERIFICADO).
