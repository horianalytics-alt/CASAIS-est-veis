# Auditoria — Rodadas 12 e 13 (Carteira de Investimentos + Recorrência UI)

> Data: 2026-11-21 | Auditor: Sentinela | Modelo: claude-sonnet-4-6

## Resumo Executivo

- **Escopo auditado:**
  - Commits `cbf7793..HEAD` (18 commits, Rodadas 12 e 13)
  - Arquivos: `popup-cobranca-server.tsx`, `popup-cobranca.tsx`, `lista-assinaturas.tsx`,
    `ajustes/assinaturas/page.tsx`, `form-lancamento.tsx`, `dialogo-editar-lancamento.tsx`,
    `switch.tsx`, `area-investimentos.tsx`, `card-caixinha.tsx`, `carteira/page.tsx`,
    `layout.tsx`, `actions/recorrencia.ts`, `actions/investimentos.ts`,
    `actions/contexto-familia.ts`, `migrations/00019_recorrencia.sql`
  - Verificação TypeScript: `npx tsc --noEmit` (0 erros)
  - `security-review` executado (diff vazio — HEAD = origin/main; varredura manual compensatória aplicada)
  - `code-review` nível `high` executado sobre commits cbf7793..HEAD

- **Escopo NÃO auditado:**
  - QA visual com Playwright em telas autenticadas (3 breakpoints + dark mode): Playwright MCP não tem acesso a localhost e não havia sessão autenticada em produção. Telas internas (`/lancar`, `/ajustes/assinaturas`, `/carteira`) não foram inspecionadas visualmente.
  - Dark mode por classe CSS: o `browser_emulate_media` não ativa o dark mode deste app (classe `.dark` no `<html>` via toggle de usuário). Auditoria visual de dark mode não realizada.
  - Testes hostis contra banco de produção: NÃO AUTORIZADO pelo briefing (briefing explícito: "NÃO autorizado nesta rodada").
  - WAF Vercel: `vercel` CLI sem auth — NÃO AUDITADO.

- **Ferramentas que rodaram:**
  - `security-review` (via subagente; diff vazio — varredura manual compensatória)
  - `code-review` nível `high` sobre cbf7793..HEAD
  - Playwright: somente tela de login pública (375px, light mode — dark mode por classe, não emulável)
  - `npx tsc --noEmit` — 0 erros
  - Leitura direta de migrations, actions, components

- **Ambiente:** Código local (HEAD = origin/main). Playwright: produção (apenas /login, sem auth).

- **Contagem:**
  - CRÍTICO 0 | ALTO 0 | MÉDIO 2 | BAIXO 3
  - CONFIRMADO 4 | SUSPEITA 1

- **VEREDICTO:** APROVADO COM RESSALVAS

- **Gate `NEXT_PUBLIC_FEATURE_INVESTIMENTOS`:** APROVADO PARA ATIVAR (com ressalvas — ver ACHADO-002)

---

## Achados

### ACHADO-001
- **Severidade:** MÉDIO
- **Confiança:** SUSPEITA
- **Arquivo:** `app/src/components/recorrencia/popup-cobranca.tsx:71-98`
- **Descrição:** O canal Realtime `postgres_changes` é filtrado por `family_id=eq.${familyId}`, onde `familyId` vem como prop do Server Component (correto). No entanto, o Supabase Realtime `postgres_changes` delega a autorização à policy RLS `SELECT` da tabela `transactions` — se ela estiver corretamente configurada (confirmado em 00006: `family_id = get_user_family_id_self()`), um usuário com `familyId` de outra família não receberá linhas. O risco residual: o `familyId` está exposto no estado React do cliente (serializável em DevTools, payload de hidratação), ampliando superfície de IDOR para qualquer endpoint futuro que aceite `family_id` do cliente.
- **Impacto:** Se a RLS do Realtime estiver misconfigured ou se um endpoint futuro aceitar `family_id` do cliente, o `familyId` já conhecido facilita ataques de cross-tenant.
- **Reprodução:** Não reproduzido (banco de produção sem autorização de teste hostil). A RLS da migration 00006 mitiga o risco no estado atual.
- **Evidência:** `popup-cobranca.tsx:28-29` — `familyId?: string` como prop pública; `popup-cobranca.tsx:76` — `filter: family_id=eq.${familyId}` passado ao canal Realtime do cliente.
- **Recomendação:** O Realtime não precisa do `familyId` explícito se a RLS estiver correta — considerar remover o filtro do cliente (a Supabase filtra por RLS automaticamente). Documentar que `familyId` não é segredo mas é dado de localização de tenant.
- **Dono sugerido:** Estrutura
- **Registros criados pelo teste:** nenhum

---

### ACHADO-002
- **Severidade:** MÉDIO
- **Confiança:** CONFIRMADO
- **Arquivo:** `app/src/app/(app)/(principal)/carteira/page.tsx:124`
- **Descrição:** A fixture guard de desenvolvimento inclui `process.env.NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true'` como co-condição de ativação em produção. Quando a feature flag for ativada (pré-requisito para o deploy), qualquer usuário autenticado que adicionar `?fixture=caixinhas`, `?fixture=pendentes` ou `?fixture=erro` à URL `/carteira` verá dados mockados em vez dos dados reais de investimento.
- **Impacto:** Usuário vê portfólio falso (dados de mock). Não é vazamento de dados de outro tenant, mas é incorreção de dados em produção para usuários que descobrirem o parâmetro.
- **Reprodução:** Código: `if (params.fixture && (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true'))` — confirmado em leitura direta do arquivo linha 124.
- **Evidência:**
  ```
  // carteira/page.tsx:120-150
  if (params.fixture && (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true')) {
    if (params.fixture === 'caixinhas' || params.fixture === 'pendentes' || params.fixture === 'erro') {
      finalResumo = MOCK_CARTEIRA_INVESTIMENTO
      ...
    }
  }
  ```
- **Recomendação:** Restringir o fixture a `process.env.NODE_ENV === 'development'` apenas. Remover `|| process.env.NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true'` da condição antes de ativar a flag em produção.
- **Dono sugerido:** Fachada
- **Registros criados pelo teste:** nenhum

---

### ACHADO-003
- **Severidade:** MÉDIO
- **Confiança:** CONFIRMADO
- **Arquivo:** `app/src/components/carteira/area-investimentos.tsx:246-247` + `app/src/components/carteira/card-caixinha.tsx:215-216`
- **Descrição:** `handleConfirmarRendimento` lança `throw new Error(res.erro)` quando a Server Action retorna `{ ok: false }`. O `card-caixinha.tsx` captura o erro com `catch { hapticFeedback.warning() }` — a mensagem de erro é descartada e o usuário recebe apenas feedback háptico, sem nenhuma mensagem visual explicando por que a confirmação falhou.
- **Impacto:** UX degradada — o usuário não sabe se houve erro de saldo, competência duplicada ou problema de rede. Pode repetir a ação desnecessariamente.
- **Reprodução:** Fluxo: usuário clica "Confirmar" → `aoConfirmarRendimento(id, competencia)` → `confirmarRendimentoMensal` retorna `{ ok: false, erro: 'O rendimento deste mês já foi confirmado' }` → `throw new Error(...)` → `catch { hapticFeedback.warning() }` — erro descartado.
- **Evidência:**
  ```
  // area-investimentos.tsx:246-247
  if (!res.ok) {
    throw new Error(res.erro || 'Não foi possível confirmar o rendimento.')
  }

  // card-caixinha.tsx:215-216
  } catch {
    hapticFeedback.warning()
  }
  ```
- **Recomendação:** Em `card-caixinha.tsx`, capturar a mensagem de erro e exibi-la no estado local do card (ou repassar via prop de callback de erro). Alternativa: `aoConfirmarRendimento` retorna o erro em vez de lançar, e o card exibe a mensagem.
- **Dono sugerido:** Dash / Fachada
- **Registros criados pelo teste:** nenhum

---

### ACHADO-004
- **Severidade:** BAIXO
- **Confiança:** CONFIRMADO
- **Arquivo:** `app/src/components/recorrencia/popup-cobranca.tsx:140-144`
- **Descrição:** Stale closure em `handleResponder`: após `setFila` remover o item respondido, a verificação `if (fila.length <= 1)` lê o valor pré-atualização de `fila`. O comportamento acidental é correto para o caso de 1→0 (último item dispara `router.refresh()`), mas para filas de 3→2 e 2→1 o `router.refresh()` nunca é chamado — a página fica com estado desatualizado até o pop-up fechar completamente.
- **Impacto:** Em filas longas (12+ itens), o estado da página (parceiro pode ter respondido outras cobranças) só é sincronizado quando o pop-up esvazia por completo.
- **Reprodução:** Ter 3+ cobranças pendentes → responder as primeiras como "ainda não" → observar que `router.refresh()` não é chamado até a última resposta.
- **Evidência:**
  ```
  // popup-cobranca.tsx:139-144
  setFila((antiga) => antiga.filter((c) => c.id !== itemAtual.id))
  setConfirmandoPagamento(false)
  if (fila.length <= 1) {   // lê o valor antigo de fila, não o pós-filter
    router.refresh()
  }
  ```
- **Recomendação:** Mover a lógica de refresh para dentro do callback do `setFila`:
  ```ts
  setFila((antiga) => {
    const nova = antiga.filter((c) => c.id !== itemAtual.id)
    if (nova.length === 0) router.refresh()
    return nova
  })
  ```
- **Dono sugerido:** Fachada
- **Registros criados pelo teste:** nenhum

---

### ACHADO-005
- **Severidade:** BAIXO
- **Confiança:** CONFIRMADO
- **Arquivo:** `app/src/components/transacoes/form-lancamento.tsx:286`
- **Descrição:** O `mensagemToast` exibido após `criarRecorrencia` com sucesso nunca é auto-descartado por `setTimeout`. Ele depende do `useLayoutEffect` cleanup na navegação (~1200ms). Se a navegação for lenta ou falhar (rede lenta, erro de roteamento), o toast "Recorrência criada! N meses agendados." permanece visível indefinidamente. Todos os outros toasts do projeto (`lista-assinaturas.tsx:140`, `popup-cobranca.tsx:52`) usam `setTimeout(..., 4000)`.
- **Impacto:** UX inconsistente — toast persistente em caso de navegação lenta.
- **Evidência:** Ausência de `useEffect` com `setTimeout` para `mensagemToast` no `form-lancamento.tsx`, contrariamente ao padrão de `lista-assinaturas.tsx:145-150`.
- **Recomendação:** Adicionar `useEffect(() => { if (mensagemToast) { const t = setTimeout(() => setMensagemToast(null), 4000); return () => clearTimeout(t) } }, [mensagemToast])`.
- **Dono sugerido:** Fachada
- **Registros criados pelo teste:** nenhum

---

## Riscos de Processo

### RISCO-001 — INFORMATIVO | Confiança: CONFIRMADO
Hook `PreToolUse` de independência do Sentinela ATIVO em `settings.json`.
Arquivo: `C:/Users/Heitor PC/.claude/hooks/sentinela-independencia.cjs`.
Independência estrutural confirmada — a trava existe e está operacional.

### RISCO-002 — INFORMATIVO | Confiança: CONFIRMADO
`security-guidance` plugin instalado (`enabledPlugins` confirmado em `settings.json`). Hook de varredura incremental ativo — cada Edit/Write é coberto automaticamente.

### RISCO-003 — INFORMATIVO | Confiança: CONFIRMADO
Desvio de QA visual: Playwright MCP não acessou localhost (conexão recusada). QA visual das telas autenticadas não foi possível nesta sessão. Recomenda-se que o Fachada/Semeador execute a matriz visual completa antes do ativação da feature flag.

### RISCO-004 — ALTO | Confiança: CONFIRMADO
Fixture de desenvolvimento ativa em produção quando `NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true'` (ver ACHADO-002). Corrigir ANTES de ativar a feature flag.

---

## Verificações de Segurança — Resultado das Checks do Checklist

### A. Segurança e RLS

**A1. `popup-cobranca-server.tsx` — `obterContextoDaFamilia()`**
- CONFIRMADO SEGURO. `import 'server-only'` na linha 1. `obterContextoDaFamilia()` usa `getUser()` (não `getSession()`). `carregarCobrancasPendentes()` deriva a família de `auth.uid()` via RPC. `familyId` vem da sessão do servidor.

**A2. `lista-assinaturas.tsx` — `regraId` IDOR**
- CONFIRMADO SEGURO. `alterarValorRecorrencia` e `encerrarRecorrencia` em `actions/recorrencia.ts` chamam `obterContextoDaFamilia()` e passam o `regraId` para RPCs que internamente verificam `WHERE rr.id = p_regra_id AND rr.family_id = v_family`. Um `regraId` de outra família retorna "Assinatura não encontrada" — sem exposição de dados nem modificação cross-tenant.

**A3. `form-lancamento.tsx` — `familyId` em `criarRecorrencia`**
- CONFIRMADO SEGURO. `criarRecorrencia` não recebe `familyId` como parâmetro. A família é derivada inteiramente de `auth.uid()` dentro da RPC `recorrencia_criar`. Código do formulário (linhas 258-295) não envia nem mesmo tenta enviar `familyId`.

**A4. Actions de carteira — `familyId` da sessão**
- CONFIRMADO SEGURO. `aplicarNaCarteira`, `criarCaixinha`, `alocarParaCaixinha`, `resgatarDaCaixinha`, `confirmarRendimentoMensal` — todas chamam `obterContextoDaFamilia()` como primeira ação pós-Zod. `familyId` nunca vem do cliente.

**A5. Next.js `^16.4.6`**
- CONFIRMADO. `app/package.json:18` — `"next": "^16.4.6"`. Commit `16a1ba3` atualiza para esta versão com correção de segurança.

### B. Fronteira Server/Client

**B1. `popup-cobranca-server.tsx` — `server-only`**
- CONFIRMADO. `import 'server-only'` linha 1. Server Component puro, não exporta funções chamadas diretamente pelo cliente.

**B2. `lista-assinaturas.tsx` — `'use client'`**
- CONFIRMADO. `'use client'` linha 1. Não importa `server-only`.

**B3. `ajustes/assinaturas/page.tsx` — Server Component**
- CONFIRMADO. Serializa apenas primitivos (arrays de strings/números/booleans) para `ListaAssinaturas`. Nenhuma função ou objeto Date não-primitivo é passado como prop.

### C. RLS e Isolamento de Dados

**Migration 00019 — `recurring_rules`**
- CONFIRMADO. RLS habilitado. Policy `recurring_rules_select` com `family_id = get_user_family_id_self()`. Sem policy de INSERT/UPDATE/DELETE para `authenticated`. Grant apenas SELECT. Trigger `tx_recorrencia_congela` protege colunas `recurring_rule_id`, `recurring_period`, `prompt_snoozed_until` contra escrita direta via REST. Bloco 6 da migration faz auto-verificação em tempo de apply.
- Achado de arquitetura (BAIXO, não exploitável): `recorrencia_gerar` recebe `p_family` como parâmetro sem re-verificar `auth.uid()` internamente — mas EXECUTE está revogado para `authenticated`/`anon`.

### D. Responsividade e Acessibilidade

- NÃO AUDITADO por browser (Playwright sem sessão autenticada). Ver RISCO-003.
- `switch.tsx` — acessibilidade: o Switch usa `SwitchPrimitive.Root` com `id="repetirTodoMes"` associado a `<Label htmlFor="repetirTodoMes">` em `form-lancamento.tsx:713` — correto por leitura de código. Sem verificação visual da ordem de foco por Tab.

**D5. Pop-up bloqueante — `onPointerDownOutside` e `onEscapeKeyDown`**
- CONFIRMADO. `popup-cobranca.tsx:172-174` — ambos implementam `e.preventDefault()`. O pop-up não pode ser fechado acidentalmente.

**D6. `estaPago` oculto para conta cartão (P-016)**
- CONFIRMADO RESOLVIDO. `form-lancamento.tsx:782` — `{!ehContaCartao ? (...)`. O bloco de `estaPago` não renderiza para contas de tipo cartão.

### E. Realtime no Pop-Up

**E1. `familyId` vem do Server Component**
- CONFIRMADO. `popup-cobranca-server.tsx:10` — `contexto.ctx.familyId`. Passado como prop para `PopUpCobranca`. Ver ACHADO-001 para risco residual.

**E2. Deregistro do listener Realtime**
- CONFIRMADO. `popup-cobranca.tsx:100-102` — `return () => { supabase.removeChannel(canal) }` no cleanup do `useEffect`. Sem memory leak.

---

## Recomendações ao Heitor (fora do fluxo dos agentes)

1. **Rodar `claude-security` em sessão dedicada** antes da entrega ao cliente — esta auditoria não substituiu uma varredura profunda de todos os migrations e RPCs existentes (00001-00019).
2. **Executar matriz visual completa** (Fachada/Semeador em localhost) antes de ativar `NEXT_PUBLIC_FEATURE_INVESTIMENTOS=true` — QA visual autenticado não foi possível nesta sessão.
3. **Corrigir ACHADO-002 antes de ativar a feature flag** — fixture de desenvolvimento acessível em produção.

---

## Veredicto Detalhado

**APROVADO COM RESSALVAS**

Ressalvas numeradas:
1. ACHADO-002 (MÉDIO, CONFIRMADO) — Fixture guard ativa em produção quando feature flag ligada. Corrigir antes de ativar `NEXT_PUBLIC_FEATURE_INVESTIMENTOS=true`. Dono: Fachada.
2. ACHADO-003 (MÉDIO, CONFIRMADO) — Erro silenciado na confirmação de rendimento. Usuário sem feedback visual de falha. Dono: Dash/Fachada.
3. QA visual autenticado não realizado — a matriz de 3 breakpoints + dark mode precisa ser executada pelo Fachada/Semeador em localhost antes do gate final.

**Gate `NEXT_PUBLIC_FEATURE_INVESTIMENTOS`:** APROVADO PARA ATIVAR — com a condição de que ACHADO-002 seja corrigido primeiro (remover `|| process.env.NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true'` da fixture guard).

---

### Auto-Análise

- Passes realizados: 3
- Passes que encontraram erro: 2
- Correções aplicadas:
  - Pass 1: Rebaixei achado "variável centavos não usada" de MÉDIO para BAIXO/SUSPEITA ao confirmar que `noUnusedLocals` não está no tsconfig — não causa quebra de CI.
  - Pass 2: Reclassifiquei ACHADO-001 de ALTO para MÉDIO/SUSPEITA ao confirmar que a RLS de `transactions` em 00006 mitiga o risco de cross-tenant via Realtime no estado atual.
- Lições novas gravadas em `C:/Users/Heitor PC/.claude/agents/licoes/sentinela.md`: [L-006 — Playwright MCP não acessa localhost em ambiente de agente; sempre planejar fallback para produção ou declarar NÃO AUDITADO antes de começar]
- Pendências abertas: QA visual autenticado (3 breakpoints + dark mode por classe CSS) — requer sessão autenticada em localhost, não disponível neste ambiente.
