# Relatório de Entrega — Front-End Rodada 4 (`Finanças a Dois`)

## 1. Commits publicados em `origin/main`

Todos os arquivos foram commitados individualmente e enviados após `git pull --rebase origin main`:

- `858bb66` — `feat(ajustes): ligar gerenciador de categorias nas server actions reais`
- `0bc216c` — `feat(ajustes): ligar gerenciador de formas de pagamento nas server actions reais`
- `2da9da7` — `feat(ajustes): ligar dialogo-conta nas server actions criarConta e editarConta`
- `5a66b2a` — `feat(carteira): ligar botao-arquivar-conta na server action arquivarConta`

---

## 2. Componentes atualizados

Nenhuma implementação local temporária ou chamada direta via Supabase client restou nos componentes. A fronteira com `app/src/actions/` e `app/src/lib/` agora é 100% consumida:

1. **`app/src/components/ajustes/gerenciador-categorias.tsx`:**
   - Importa `adicionarCategorias`, `renomearCategoria`, `alterarTipoCategoria`, `arquivarCategoria`, `excluirCategoria`, `contarUsoCategoria` e `type TipoCategoria` diretamente de `@/actions/categorias`.
   - Importa `LIMITE_CARACTERES`, `LIMITE_NOMES`, `separarNomes` e `chaveDeComparacao` de `@/lib/lista-nomes`.
   - Removeu todos os stubs locais e chamadas diretas a `createClient()`.
   - Envia texto cru para `adicionarCategorias({ nomes: valores.nomes, tipo: valores.tipo })`, permitindo que o Zod da action processe e aplique as regras no servidor.

2. **`app/src/components/ajustes/gerenciador-formas-pagamento.tsx`:**
   - Importa `adicionarFormasPagamento`, `renomearFormaPagamento`, `arquivarFormaPagamento`, `excluirFormaPagamento` e `contarUsoFormaPagamento` diretamente de `@/actions/formas-pagamento`.
   - Importa `LIMITE_CARACTERES`, `LIMITE_NOMES`, `separarNomes` e `chaveDeComparacao` de `@/lib/lista-nomes`.
   - Removeu todos os stubs locais e chamadas diretas a `createClient()`.

3. **`app/src/components/ajustes/dialogo-conta.tsx`:**
   - Importa `criarConta`, `editarConta` e `type TipoConta` de `@/actions/contas`.
   - Removeu stubs locais e chamadas diretas a `createClient()`.
   - No modo edição, o campo `tipo` permanece desabilitado com dica informativa, respeitando o contrato de que tipo de conta não muda após a criação.
   - Trata `ResultadoAction` com validação de ciclo de cartão por campo (`diaFechamento`, `diaVencimento`).

4. **`app/src/components/carteira/botao-arquivar-conta.tsx`:**
   - Importa `arquivarConta` diretamente de `@/actions/contas`.
   - Removeu stub local e chamada direta a `createClient()`.

---

## 3. Saída literal dos gates de verificação

### 3.1 `npx tsc --noEmit`
```text
(exit code 0 — 0 erros)
```

### 3.2 `npx vitest run`
```text
 RUN  v5.0.3 C:/Users/Heitor PC/OneDrive/Documentos/SEGUNDO CÉREBRO/HORI ANALYTCIS PROJETOS/Finanças a Dois/app

 ↓ tests/integration/acoes-cadastro.int.test.ts (23 tests | 23 skipped)
 ✓ tests/unit/invoice.test.ts (16 tests) 9ms
 ✓ tests/unit/settlement.test.ts (26 tests) 12ms
 ✓ tests/unit/lista-nomes.test.ts (10 tests) 9ms
 ✓ tests/unit/resultado.test.ts (32 tests) 15ms
 ✓ tests/unit/lancamento-validacao.test.ts (58 tests) 27ms
 ✓ tests/unit/esquemas-cadastro.test.ts (25 tests) 19ms
 ✓ tests/unit/format.test.ts (41 tests) 106ms

 Test Files  7 passed | 1 skipped (8)
      Tests  208 passed | 23 skipped (231)
```

### 3.3 Gate C-1 (`--primary` nunca como cor de dinheiro em `src/components/financeiro/`)
```powershell
PS> (Get-ChildItem -Path "app\src\components\financeiro\*" | Select-String -Pattern "primary" | Measure-Object).Count
0
```

### 3.4 `npm run build`
```text
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully in 9.4s
  Running TypeScript ...
  Finished TypeScript in 6.1s ...
✓ Generating static pages using 15 workers (21/21) in 7.3s
```

---

## 4. Testes Manuais e Validação Fim a Fim (Playwright)

Executado contra a sessão real de usuário (`horiheitor@gmail.com`):

1. **Adicionar 3 categorias ("Pet, Presentes, Viagem"):**
   - Submissão via formulário chamando `adicionarCategorias`.
   - Alerta exibido: **`3 criadas`**.
   - Evidência: `r4-item2-3-criadas.png`.

2. **Repetição de "Pet, Presentes, Viagem":**
   - Submissão chamando a action com o mesmo texto.
   - Nenhuma duplicata foi criada.
   - Alerta exibido: **`0 criadas · 3 já existiam (Pet, Presentes, Viagem)`**.
   - Evidência: `r4-item2-3-ignoradas.png`.

3. **Exclusão de categoria com lançamentos vinculados:**
   - Criado lançamento temporário vinculado à categoria `"Viagem"`.
   - Clicado no botão excluir de `"Viagem"`.
   - Modal exibiu: *"Esta categoria está em 1 lançamento. Eles ficarão como 'Sem categoria'. Prefere arquivar?"* com botões `Cancelar`, `Arquivar (recomendado)` e `Excluir mesmo assim`.
   - Ao confirmar `Excluir mesmo assim`, a categoria foi removida e a consulta ao banco confirmou que o lançamento permaneceu íntegro com `category_id: null`:
     `{"id":"5579dfd4-f92f-47fc-b5b5-252f820040da","description":"Teste Viagem Rodada 4","category_id":null}`.
   - Evidência: `r4-item2-modal-excluir-em-uso.png`.
   - Todos os dados temporários foram limpos.

---

## 5. Console do navegador nas rotas tocadas

Verificado via Playwright (`page.on('console')` e `page.on('pageerror')`) nas rotas `/ajustes/categorias`, `/ajustes/formas-pagamento` e `/ajustes/contas`:
```text
CONSOLE_ERRORS_COUNT: 0
[]
```

---

## 6. Screenshots gerados (375px, 768px, 1440px — Claro e Escuro)

Salvos em `screenshots/`:

- **Categorias:**
  - `r4-ajustes-categorias-375-claro.png` / `r4-ajustes-categorias-375-escuro.png`
  - `r4-ajustes-categorias-768-claro.png` / `r4-ajustes-categorias-768-escuro.png`
  - `r4-ajustes-categorias-1440-claro.png` / `r4-ajustes-categorias-1440-escuro.png`
- **Formas de Pagamento:**
  - `r4-ajustes-formas-pagamento-375-claro.png` / `r4-ajustes-formas-pagamento-375-escuro.png`
  - `r4-ajustes-formas-pagamento-768-claro.png` / `r4-ajustes-formas-pagamento-768-escuro.png`
  - `r4-ajustes-formas-pagamento-1440-claro.png` / `r4-ajustes-formas-pagamento-1440-escuro.png`
- **Contas:**
  - `r4-ajustes-contas-375-claro.png` / `r4-ajustes-contas-375-escuro.png`
  - `r4-ajustes-contas-768-claro.png` / `r4-ajustes-contas-768-escuro.png`
  - `r4-ajustes-contas-1440-claro.png` / `r4-ajustes-contas-1440-escuro.png`
