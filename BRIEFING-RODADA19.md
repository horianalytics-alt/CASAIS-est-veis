# Briefing Rodada 19 — Histórico de acertos na página /acerto

> Data: 2026-11-22. Autor: Maestro. Dono do produto: Heitor.
> `VERIFICADO` = confirmei no código nesta data. `A PROVAR` = não medi; confirme antes de agir.

---

## 0. Estado de partida

Commits da Rodada 18 estão em `origin/main`. TSC limpo. 713 testes passando, 190 skipped.

**O problema:** depois de fazer um acerto, a tela `/acerto` não mostra nenhum registro de que aquilo aconteceu. Se o usuário voltar um mês depois, não sabe quando foi o último acerto nem quanto foi. O histórico existe no banco — só falta exibi-lo.

**Como o acerto funciona (VERIFICADO em `00010_acerto_liquido.sql`):**

A RPC `settle_up` grava em `transactions`:
```sql
INSERT INTO transactions (
  family_id, type, description, amount, date,
  account_id, to_account_id,
  created_by_member_id, paid_by_member_id,
  settlement_to_member_id,  -- ← identifica que é acerto
  is_paid, paid_date
) VALUES (
  v_family_id, 'transferencia', 'Acerto de contas', p_amount, v_date,
  v_from_account, v_to_account,
  v_member_id, p_from_member_id,
  p_to_member_id,
  true, v_date
)
```

Então: todo acerto já está em `transactions` com `settlement_to_member_id IS NOT NULL`. Para exibir o histórico, basta fazer um SELECT filtrado por essa coluna.

**Dados disponíveis sem migration:**
- `date` — data do acerto
- `amount` — valor
- `paid_by_member_id` — quem pagou (devedor)
- `settlement_to_member_id` — quem recebeu (credor)
- `created_by_member_id` — quem registrou no app

Para exibir nomes, o `family_members` tem `display_name`.

**Arquivos existentes relevantes (VERIFICADO):**
- `src/app/(app)/(principal)/acerto/page.tsx` — Server Component; busca `v_settlement` e passa para `ResumoAcerto`.
- `src/components/acerto/resumo-acerto.tsx` — recebe `linhas`, `regra`, `transferencia`; renderiza o estado atual. Sem histórico.
- `src/actions/acerto.ts` — tem só `registrarAcerto`. Não precisa de nova action — o histórico é leitura.
- `src/lib/queries/` — A PROVAR: verificar se existe pasta de queries; se sim, criar `src/lib/queries/acerto.ts`. Se não existir a pasta, criar a query diretamente na page.

**Esta rodada não tem migration.**

---

## 1. Regras de segurança (inegociáveis)

- **Só existe banco de PRODUÇÃO.** Nenhuma escrita via browser durante testes.
- `npx vitest run` SEMPRE SEM `.env.local`. Se `skipped` cair para 0, PARE.
- `family_id` sempre vem da sessão via `createClient()` no Server Component. Nunca do cliente.
- Afirmação sobre o que o código faz só entra em relatório com saída de comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 2. O que fazer

### F-1 — Buscar histórico de acertos em `acerto/page.tsx`

Adicionar ao `Promise.all` existente (linha ~33):

```ts
supabase
  .from('transactions')
  .select(`
    id,
    date,
    amount,
    paid_by_member_id,
    settlement_to_member_id,
    created_by_member_id
  `)
  .not('settlement_to_member_id', 'is', null)
  .order('date', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(20)
```

Também buscar os membros para resolver os nomes (a página já busca `v_settlement` que tem `member_id` e `display_name`, mas NÃO garante que todos os membros históricos apareçam — um membro pode ter sido removido). A PROVAR: verificar se `v_settlement` já inclui ambos os membros da família e se seus `display_name` estão disponíveis ali. Se sim, o mapa de nomes pode ser construído dessas linhas. Se não, fazer query extra em `family_members`.

### F-2 — Criar tipo `RegistroAcerto`

No topo do arquivo `acerto/page.tsx` ou em `src/features/acerto/tipos.ts` (A PROVAR se existe):

```ts
export interface RegistroAcerto {
  id: string
  date: string
  amount: number
  pagadorId: string      // paid_by_member_id
  pagadorNome: string
  receptorId: string     // settlement_to_member_id
  receptorNome: string
}
```

Montar esse array a partir da query + mapa de nomes dos membros (`linhas` de `v_settlement` já tem `member_id` e `display_name`).

### F-3 — Passar histórico para `ResumoAcerto`

Adicionar prop ao componente:

```ts
export interface ResumoAcertoProps {
  linhas: LinhaAcerto[]
  regra: string
  transferencia: SettlementTransfer | null
  historico: RegistroAcerto[]   // ← novo
}
```

### F-4 — Renderizar seção de histórico em `resumo-acerto.tsx`

Adicionar uma nova `<section>` **abaixo** da seção "Detalhamento por membro" e **acima** da nota explicativa:

```tsx
{/* Histórico de acertos */}
{historico.length > 0 && (
  <section aria-labelledby="titulo-historico" className="flex flex-col gap-3">
    <h3 id="titulo-historico" className="text-foreground text-base font-semibold">
      Histórico de acertos
    </h3>
    <div className="bg-card border-border/80 divide-border divide-y rounded-xl border shadow-xs overflow-hidden">
      {historico.map((registro) => (
        <div key={registro.id} className="flex items-center justify-between p-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">
              {registro.pagadorNome} → {registro.receptorNome}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(registro.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'long', year: 'numeric'
              })}
            </span>
          </div>
          <ValorMonetario valor={registro.amount} tipo="transferencia" />
        </div>
      ))}
    </div>
  </section>
)}
```

**Se `historico` estiver vazio:** não renderiza a seção (o `&&` já cobre isso).

**Regras visuais:**
- Mostrar no máximo 20 registros (já limitado no SELECT).
- Mais antigo para mais novo NÃO — mostrar do mais recente para o mais antigo (ORDER BY date DESC).
- Valor com `<ValorMonetario tipo="transferencia">` — já importado no componente.
- Respeitar `useOcultarValores()` — o `<ValorMonetario>` já faz isso automaticamente.
- Sem paginação nesta rodada — 20 registros são suficientes para o casal.

---

## 3. O que NÃO fazer

- Não criar migration.
- Não tocar em `settle_up` nem em nenhuma RPC do banco.
- Não adicionar paginação — limite de 20 é suficiente.
- Não mostrar acertos em `/inicio` — eles ficam em `/acerto`.
- Não alterar a lógica de `v_settlement` nem de `resolveTransfer`.

---

## 4. Verificação esperada

- `npx tsc --noEmit` limpo (0 erros).
- `npx vitest run` SEM `.env.local` — ≥190 skipped, ≥713 passando. Se `skipped` = 0, PARE.
- Dev server: `cd app && npm run dev` (porta 3000).
- Screenshots com caminho **absoluto** em 375px, 768px, 1440px + dark mode:
  - Página `/acerto` com a seção "Histórico de acertos" visível (pode estar vazia se a família não tiver acertos — nesse caso mostrar o estado da página normal sem a seção).
  - A PROVAR: se o banco de produção tiver acertos registrados, a seção aparece automaticamente. Se não tiver, testar apenas que o componente não quebra com `historico=[]`.
- Console sem erros.
- Commit por grupo funcional; `git pull --rebase origin main` antes do push.

---

## 5. Regra de afirmação

Afirmação sobre o que o código existente faz só entra em relatório com saída do comando ou trecho colado. Sem isso, escreva "A PROVAR:" na frente.

---

## 6. Ao terminar

- Lista do que mudou (arquivo por arquivo, com linhas).
- O que foi e o que não foi verificado (com motivo).
- Se a família de produção tinha acertos no banco (confirmado pelo SELECT) ou não.
- Pendências abertas.
- Bloco `### Auto-Análise` obrigatório.

**Fontes verificadas pelo Maestro:**
- `src/actions/acerto.ts` (VERIFICADO — `registrarAcerto` retorna `acertoId`, sem query de leitura)
- `src/app/(app)/(principal)/acerto/page.tsx` (VERIFICADO — arquivo completo, 72 linhas)
- `src/components/acerto/resumo-acerto.tsx` (VERIFICADO — arquivo completo, sem seção de histórico)
- `src/components/acerto/dialogo-acertar.tsx` (VERIFICADO — sem mudança necessária)
- `app/supabase/migrations/00010_acerto_liquido.sql` (VERIFICADO — `settle_up` grava `settlement_to_member_id`, `paid_by_member_id`, `date`, `amount`)
