# Briefing Rodada 22 — Arredondamento decimal-safe em valores monetários (P-009)

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Estado de partida

Commits da Rodada 21 estão em `origin/main`. TSC limpo. ≥723 testes passando, 190 skipped.

**O problema (VERIFICADO em `app/src/actions/lancamento.ts` linha 85):**

```ts
return Math.round(numero * 100) / 100
```

A multiplicação `numero * 100` em ponto flutuante binário pode produzir um número como `100.49999999999999` em vez de `100.5` para entradas como `1.005`. `Math.round` então arredonda para baixo (`100`) em vez de para cima (`101`), resultando em `1.00` em vez de `1.01` — divergindo do valor digitado pelo usuário por 1 centavo, em silêncio.

**Exemplos reproduzíveis:**
- `1.005` → `Math.round(1.005 * 100) / 100` = `1.00` (errado; correto seria `1.01`)
- `10.075` → `Math.round(10.075 * 100) / 100` = `10.07` (errado; correto seria `10.08`)

**Contexto:** o campo aceita entradas do usuário com até 3+ casas decimais (ex.: o teclado numérico do celular não bloqueia isso). O banco armazena como `numeric(14,2)` e truncaria em 2 casas de qualquer forma, mas o truncamento silencioso no backend sem avisar o usuário é o problema.

**Correção:** `parseFloat(numero.toFixed(2))` ou equivalentemente `Math.round((numero + Number.EPSILON) * 100) / 100`. A primeira forma é mais legível e direta.

**Esta rodada não tem migration.**

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes.
- `npx vitest run` SEMPRE SEM `.env.local`. Se `skipped` cair para 0, PARE.
- `family_id` sempre vem da sessão via `obterContextoDaFamilia()`. Nunca do cliente.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

### B-1 — Substituir `Math.round(numero * 100) / 100` por arredondamento decimal-safe

**Arquivo:** `src/actions/lancamento.ts` linha 85.

Trocar:
```ts
return Math.round(numero * 100) / 100
```

Por:
```ts
return parseFloat(numero.toFixed(2))
```

**Por quê `parseFloat(numero.toFixed(2))` funciona:**
- `Number.prototype.toFixed(2)` usa o algoritmo de arredondamento do motor JS (V8 usa "round half to even" com precisão decimal interna), que trata corretamente os casos de borda de ponto flutuante.
- `parseFloat` converte a string resultante de volta para `number`.
- Resultado: `(1.005).toFixed(2)` = `"1.01"` → `1.01` ✓

**Por quê não usar `Number.EPSILON`:**
- `Math.round((1.005 + Number.EPSILON) * 100) / 100` funciona para o exemplo mas pode introduzir o problema inverso em outros valores de borda. `toFixed` é mais idiomático e confiável aqui.

---

## 3. Verificação esperada

### Teste unitário (OBRIGATÓRIO)

Verificar se já existe teste para a função de arredondamento em `src/actions/lancamento.ts`. A PROVAR: buscar em `tests/unit/` por arquivo que importe ou teste `lancamento.ts`.

Se já existir um teste para a função de arredondamento, estender com os casos de borda:
```ts
// Casos de borda de ponto flutuante
expect(arredondar(1.005)).toBe(1.01)
expect(arredondar(10.075)).toBe(10.08)
expect(arredondar(1.004)).toBe(1.00)
expect(arredondar(100.0)).toBe(100.0)
expect(arredondar(0.1 + 0.2)).toBe(0.3) // 0.30000000000000004 → 0.30
```

Se não existir teste para arredondamento, criar `tests/unit/arredondamento.test.ts` com esses casos.

### Verificação manual
- `npx tsc --noEmit` limpo (0 erros). Apenas uma linha muda — não deve ter erro de tipo.
- `npx vitest run` SEM `.env.local` — ≥190 skipped, ≥723 passando. Se `skipped` = 0, PARE.
- **Confirmar no console do Node** que `parseFloat((1.005).toFixed(2))` retorna `1.01`:
  ```
  node -e "console.log(parseFloat((1.005).toFixed(2)))"
  ```
  Saída esperada: `1.01`. Cole a saída no relatório.
- Dev server não precisa ser levantado para esta rodada — é mudança de lógica pura.
- Commit único: `fix: arredondamento decimal-safe em valores monetários`.

---

## 4. O que NÃO fazer

- Não altere migrations.
- Não altere o schema Zod de entrada — a validação de tipo continua como está.
- Não instale dependências.
- Não altere `atualizarLancamentosEmMassa` — a função de arredondamento chama `lancamento.ts` internamente; se a função de arredondamento for a mesma compartilhada, a correção chega automaticamente. A PROVAR: confirmar se `editar-lancamento.ts` importa e reutiliza a mesma função de arredondamento de `lancamento.ts`.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz só entra em relatório com saída do comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

- Saída do comando `node -e "console.log(parseFloat((1.005).toFixed(2)))"` colada no relatório.
- Confirmação de quantos testes passando (≥723) e skipped (≥190).
- Confirmação de que `npx tsc --noEmit` retornou 0 erros.
- Pendências abertas.
- Bloco `### Auto-Análise` obrigatório.

**Fontes verificadas pelo Maestro:**
- `src/actions/lancamento.ts` linha 85 (VERIFICADO — `Math.round(numero * 100) / 100`)
