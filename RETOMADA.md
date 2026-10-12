# RETOMADA — onde paramos

> Escrito em 2026-10-11, ~21:25, com a sessão da API em 92% de uso.
> Para retomar: abra o chat e diga **"continue de onde parou, os créditos resetaram"**.

---

## Estado em uma linha

Banco pronto e auditado. Camada de servidor pronta. **Falta construir as telas** —
é o último passo para o Heitor entrar no app.

---

## O que está PRONTO e PROVADO (saída real dos comandos)

```
npx tsc --noEmit                      → exit=0
npx vitest run                        → 167 testes passando (eram 83)
node tests/integration/rls-isolation.mjs  → 24/24
node tests/integration/tenant-escape.mjs  → 8/8
node docs/design/scripts/contraste.js     → 180 pares, 0 falhas
console do navegador em localhost:3000    → 0 erros, 0 avisos
```

| Camada | Estado |
|---|---|
| Banco Supabase hospedado (`wxhfgstgjjlmqauogeid`, pooler `aws-1-sa-east-1`) | 6 migrations aplicadas |
| Isolamento entre famílias (RLS) | provado com usuários reais, 24/24 |
| Tokens visuais, 4 paletas, fontes, ícones do PWA, OG | prontos, 180 contrastes medidos |
| `app/proxy.ts` — sessão + proteção de rotas (Next 16) | pronto, 21/21 casos do matcher |
| `app/src/actions/{auth,familia,lancamento,resultado}.ts` | prontos, commitados |
| **As telas** | **NÃO EXISTEM — é o que falta** |

---

## A CONTA DO HEITOR JÁ EXISTE e o login foi provado

```
email: horiheitor@gmail.com
senha: JEDh2007
user id: bfa46034-cd3d-4e9b-9944-d6b3b326f9ee
confirmado em: 2026-10-12T00:20:08Z
teste: POST /auth/v1/token?grant_type=password → access_token recebido, 3600s
```

**A confirmação de e-mail do Supabase está LIGADA** (medido:
`confirmation_sent_at` presente, sem `confirmed_at`). Por isso a conta foi criada
já confirmada via API de admin — o Heitor NÃO passa pelo `/cadastro` hoje.

**A conta não tem família ainda:** `get_user_member_id_self()` retorna `null`.
Ele VAI passar pelo onboarding. Logar sem família tem de levar a `/onboarding`.

---

## PRÓXIMO PASSO EXATO

1. **Verificar se `docs/planos/estrutura-contrato-handoff.md` existe.**
   Era o último item do Estrutura. Se não existir, não bloqueia: as actions
   estão no disco e são a fonte real da assinatura.
2. **Dar o sinal à Fachada para executar.** O plano dela é
   `docs/planos/fachada-onda1-telas.md` (590+ linhas, com adendo do recorte).
   O agente dela tem o contexto inteiro; retomar por mensagem é mais barato que
   re-delegar do zero.
3. **Ordem de prioridade das telas** (o percurso que põe o Heitor dentro do app):
   `/login` → onboarding (criar família) → `/lancar` (receita/despesa simples)
   → `/inicio` (lista + indicadores).

### Fora desta rodada (continuação, já decidido)

Carteira, fatura, pagar fatura, acerto de contas, parcelas, lote, transferência,
categorias, formas de pagamento, metas, recuperar-senha, nova-senha,
PWA/manifest, service worker, Realtime, seletor de paleta.
**F-6 (invólucros de UI) entra ANTES do Dash** — sem ele o Dash constrói no vazio.

---

## Armadilhas já descobertas — não redescubra

| Armadilha | O que fazer |
|---|---|
| `@example.com` é rejeitado pelo Supabase como domínio inválido | use `@gmail.com` nos testes de auth |
| Script que importa `@supabase/supabase-js` só resolve DENTRO de `app/` | nunca rode teste de integração de `/tmp` ou do scratchpad |
| Não existe Supabase local; Docker descartado | todo comando com `--db-url`, nunca `--local`, nunca `db reset` |
| Portas 54xxx estão reservadas pelo Hyper-V nesta máquina | se algum dia subir local, use 55xxx (`config.toml` já ajustado) |
| `useActionState` chama `(state, payload)`; as actions recebem `(formData)` | adaptador no client, já no plano da Fachada |
| `/` serve "Create Next App" e é rota privada | `redirect('/inicio')` em `/` (item de F-8) |
| `sair()` retorna `never` (faz `redirect` por dentro) | não envolver em `try/catch` |
| Nenhuma variante de `Button` do shadcn chega a 44px (padrão 32px) | `TOQUE_MINIMO` por instância |
| `calendar` do shadcn arrasta `date-fns` contra a decisão "datas ISO puras" | `<input type="date">` |
| `form` do shadcn não existe neste registry; `zod` resolve v3 | RHF direto, sintaxe Zod v3 |
| `@theme` não mapeia font-size nem spacing | `text-(length:--texto-titulo)`, `gap-[var(--esp-4)]` |

---

## Decisões de produto pendentes do Heitor

- **P-001 + P-006** (`PENDENCIAS.md`): o código de convite não expira e não há
  limite de tentativas. **Bloqueante para abrir o beta a famílias maiores**, não
  para o casal (hoje `member_limit = 2` barra quem acertar o código).
- **URL do repositório novo do GitHub:** ainda não fornecida. O push é um passo
  único quando chegar.
- **Radar nunca acionado** — decisão consciente (ele não pesquisa a stack fixa).
  Se quiser referência visual de concorrente (Mobills, Organizze, YNAB), pedir.

---

## Fato a registrar no ENTREGA.md

O `security-guidance` **não é hook de `settings.json`**: roda como revisão
automática de **commit**. Varredura edit-a-edit NÃO acontece; a de commit SIM
(disparou 2x e achou 4 problemas reais). O hook registrado em `PreToolUse` é
`sentinela-independencia.cjs`, que impede o Sentinela de editar código de
produção — esse está ativo.

---

## Ainda não rodaram

- **Sentinela** — auditoria independente. Roda depois das telas.
- **Dash** — gráficos são Onda 2.
- **code-simplifier** — só depois do Sentinela aprovar.
- **Deploy na Vercel** — depende da URL do repositório.
