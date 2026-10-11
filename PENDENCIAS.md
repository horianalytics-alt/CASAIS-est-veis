# Pendências — Finanças a Dois v2

Registro vivo do que ficou fora, do que foi pedido fora de escopo e do que
depende de decisão do Heitor. Atualizado a cada entrega aceita.

---

## Aguardando decisão do Heitor

### P-001 — Rate limiting em `family_preview` e `join_family`
- **Origem:** achado 3 do `security-guidance` (2026-10-11), parte não aceita.
- **O quê:** hoje nada limita tentativas de adivinhar um `join_code`. Com
  `member_limit = 2` e beta privado o risco é baixo; ao abrir para várias
  famílias, vira porta de entrada para enumeração.
- **Por que não entrou agora:** é decisão de PRODUTO (quantas tentativas por
  hora? bloqueia por IP ou por usuário? mostra captcha?), não de schema.
- **Quando decidir:** antes de abrir o cadastro para fora do círculo de teste.

### P-006 — `join_code` não expira e não rotaciona
- **Origem:** Estrutura, plano `00006` (2026-10-11), pergunta 2 — achado dele, não pedido.
- **O quê:** o código de 6 caracteres que o parceiro digita para entrar na casa
  vale **para sempre**. Um código que vazou (print, foto, WhatsApp) continua
  válido indefinidamente. A migration `00006` corrige a FONTE de entropia
  (`random()` → `gen_random_bytes`), mas não a permanência.
- **Por que não bloqueia hoje:** com `member_limit = 2`, casa cheia recusa
  entrada. A porta só abre de verdade quando famílias maiores entrarem.
- **Mesma família de decisão que P-001** (rate limiting): as duas são sobre
  resistência a adivinhação e vazamento do código de convite. Decidir juntas.
- **Opções:** expirar em N horas · rotacionar a cada uso · botão "gerar novo
  código" nos ajustes da família · código de uso único por convite.

### P-002 — URL do repositório novo no GitHub
- **O quê:** o Heitor vai fornecer um repositório novo e vazio para receber a v2.
- **Status:** ainda não fornecido. O projeto está em git local com histórico
  completo; o push é um passo único quando a URL chegar.

### P-003 — Open Finance
- **Origem:** Heitor, 2026-10-11 — "futuramente penso em deixar esse app open finance".
- **Status:** fora do escopo da Onda 1 e da Onda 2. O schema já reserva o
  terreno: `accounts.external_id` existe para amarrar conta local a conta de
  instituição externa.
- **O que falta decidir:** qual agregador (Pluggy, Belvo, Open Finance direto),
  que é decisão de custo e de regulação, não técnica.

---

## Dívida técnica conhecida

### P-004 — 5 vulnerabilidades `npm audit` de severidade alta
- **Cadeia:** `braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next`
  → `eslint-config-next`.
- **Por que NÃO foi corrigido:** é dependência de desenvolvimento e de lint —
  nunca vai para o navegador do usuário nem para o servidor. `npm audit fix
  --force` rebaixaria `eslint-config-next` para a versão 14.2.35, incompatível
  com Next.js 16.4, quebrando o projeto para corrigir um risco que não existe
  em produção.
- **Quando resolve:** sozinho, quando o `eslint-config-next` publicar release
  com `fast-glob` atualizado.

### P-005 — Projeto Supabase da v1 continua existindo
- **O quê:** apagar o repositório do GitHub e o projeto no Lovable NÃO apaga o
  projeto Supabase da v1. Ele continua existindo, ocupando cota da conta.
- **Ação do Heitor:** apagar à mão no dashboard do Supabase, se a v1 tinha
  projeto próprio.

---

## Fora de escopo por decisão registrada

| Item | Decisão | Quando |
|---|---|---|
| Migração dos dados da v1 | Começar do zero — nada é importado | Heitor, 2026-10-11 |
| Código de convite para o beta | Cadastro aberto, sem convite | Heitor, 2026-10-11 |
| Mais de 2 membros por família | Schema arquitetado para N; `member_limit` fica em 2 na Onda 1 | Heitor, 2026-10-11 |
| Supabase local (Docker) | Descartado — 3,7 GB de imagens para um banco que já existe hospedado | Heitor, 2026-10-11 |
