# Auditoria: Carteira de Investimento (Sentinela, rodada 1)

> Gravado pelo Maestro a partir do relatório devolvido pelo Sentinela — o
> hook de independência negou a escrita dele fora de `docs/auditoria/`
> porque o conteúdo negado era um script de teste (`sentinela-seletores.sql`),
> não este relatório. A gravação deste arquivo é meu trabalho normal de
> orquestração, não uma autorização especial.

## Resumo Executivo

- **Código auditado ainda não está no GitHub (L-001):** `git fetch origin && git log HEAD..origin/main` voltou vazio. `origin/main..HEAD` = `b4f8477`, `24adcbb`, `cf9d417`, ou seja, `main` está 3 commits à frente de `origin/main` (`8826f81`). O back-end auditado não foi enviado.
  - **Mas o schema já está no banco de produção.** As migrations 00016 e 00017 constam de `supabase_migrations.schema_migrations` no projeto `wxhfgstgjjlmqauogeid`, o único banco que existe. Hoje qualquer usuário autenticado já consegue chamar as RPCs `carteira_*` pelo PostgREST, mesmo sem as Actions publicadas.
  - O front do Antigravity (`3002795..43c60af`) **já está em `origin/main`**: `git branch -r --contains 591bfda` devolve `origin/main`.
- **Escopo auditado:**
  - `app/supabase/migrations/00016_carteira_investimento.sql` e `00017_carteira_rendimento_mes_encerrado.sql`
  - `app/src/actions/investimentos.ts` e `app/src/lib/esquemas-investimentos.ts`
  - `app/tests/integration/carteira-rls.sql`, `carteira-rls-mutante.sql` e `carteira-rls.mjs`
  - `app/src/components/carteira/*`, `app/src/app/(app)/(principal)/carteira/page.tsx` e `lancar/page.tsx`
  - Catálogo do banco de produção (privilégios, ordem de lock, quem escreve `balance_cents`)
  - PostgREST com a chave anon
- **Escopo NÃO auditado:**
  - `Skill(security-review)`: a skill recusa rodar porque o diretório primário da sessão (`Segundo cérebro live`) não é repositório git; mudar o cwd do shell não resolveu. Revisão manual de segurança foi feita no lugar. `Desvio: security-review manual — skill inexecutável fora de repo git.`
  - Playwright (3 breakpoints, dark, a11y): não há login descartável fora de produção, e a tela mostra só mock. Navegador não usado, então a L-002 não se aplicou.
  - Mutante: não rodado — exigiria DDL sobre o banco de produção.
  - Concorrência dinâmica (chamadas paralelas): a verificação foi só estática, pelo catálogo.
  - `investimentos.int.test.ts`: não rodado, porque cria usuários reais em produção usando service_role.
  - Teste que provaria a conta-carteira nos seletores de `/lancar` e `/carteira`: escrita negada pelo hook.
  - Estado do deploy na Vercel: o CLI não está autenticado.
- **Ferramentas que rodaram:**
  - `code-review` nível high, sem `--fix`
  - `superpowers:verification-before-completion`, com resposta "não está completa: ver NÃO auditado"
  - `npx tsc --noEmit` (exit 0) e vitest (50/50)
  - `node tests/integration/carteira-rls.mjs` (48/48)
  - `sentinela-hostil.sql` (script próprio do Sentinela)
  - curl contra o PostgREST
  - As skills Supabase **não** foram invocadas. RLS e `security_invoker` foram julgados pelo catálogo e por execução. `Desvio: skills supabase não carregadas — critério aplicado por execução direta.`
- **Fase:** o prompt não declarou fase. Tratado como `FASE: EXECUÇÃO` completa, sem plano.
- **Ambiente:** produção. Os testes hostis rodaram em transação **sempre desfeita**, só com famílias sintéticas. `Desvio: teste de isolamento em produção (rollback) — único banco existente; família real não tocada.` Prova: `prova-rollback.txt` mostra `families=1`, 0 usuários de teste, 0 caixinhas.
- **Contagem:** CRÍTICO 0 | ALTO 2 | MÉDIO 2 | BAIXO 5 (CONFIRMADO 5 | SUSPEITA 4)
- **VEREDICTO: REPROVADO** para fiação e entrega da feature. A segurança do back-end (isolamento, trava, grants) passou em tudo o que foi testado.

## Checklist do briefing

1. **RLS e isolamento das 4 tabelas: OK, CONFIRMADO.**
   - I01–I12 e N01–N02 passaram.
   - Casos adicionais ao teste do Estrutura:
     - S01: B resgata a própria caixinha para a corrente de A → "Conta de destino inválida".
     - S09: B consulta `carteira_meses_pendentes_da_caixinha` da caixinha de A → 0 linhas; `v_account_balances` da carteira de A → 0 linhas.
   - Anon via HTTP leva 42501 em tabela, view e RPC.
2. **Trava GUC: OK, CONFIRMADO.**
   - Com a chave anon: `rpc/set_config` → PGRST202 (404). Com `Content-Profile`/`Accept-Profile: pg_catalog` → PGRST106 (406). pg_graphql está desligado.
   - No catálogo, só `carteira_aplicar`, `carteira_resgatar` e `carteira_confirmar_rendimento` chamam `set_config`, sempre com literal, e nenhuma função chamável por `authenticated` tem SQL dinâmico.
   - Não testado como `authenticated` logado de verdade (exigiria conta real). O PGRST202 vem do schema cache e não depende do papel.
3. **Rendimento só vira saldo por confirmação: sim no caminho, mas o valor confirmado está errado (A1).**
   - No catálogo, só aplicar, alocar, confirmar e resgatar escrevem `balance_cents`. A receita na carteira só entra pela RPC (C12–C17 e S05 passaram).
4. **Concorrência: OK no estático, CONFIRMADO.**
   - Nas 6 RPCs o `pg_advisory_xact_lock` vem antes da primeira escrita (`concorrencia-catalogo.txt`).
   - O único débito é em `resgatar`: UPDATE condicional, conferindo `ROW_COUNT`, com `CHECK (balance_cents >= 0)`.
   - Os créditos são incondicionais, o que é correto.
   - `alocar` depende só do lock: não há CHECK de não alocado ≥ 0 (ver Riscos).
5. **Zod: OK.**
   - Valor: de 0,01 a 99.999.999,99, até 2 casas.
   - Taxa: inteiro de 0 a 10000 bps.
   - Nome: de 1 a 60 code points depois de `limparNome`.
   - Vencimento: de 2000 a 2100. Competência: `YYYY-MM`.
   - A RPC refaz os limites (S04 passou), mas não aplica `limparNome` (A6).
6. **security-review: NÃO EXECUTOU** (ver acima). A revisão manual não achou secret, injeção ou XSS no diff.
7. **code-review high: 10 achados**, todos conferidos e deduplicados abaixo.
8. **Front esconde a conta-carteira: não.** Ver A3. Hoje o problema é latente, mas pode aparecer agora, porque as RPCs já estão vivas.

## Achados

### [ALTO] A1 — O rendimento é calculado sobre dinheiro já resgatado no mês
- **Confiança:** CONFIRMADO | **Ambiente:** produção, em transação desfeita
- **Localização:** `app/supabase/migrations/00017_carteira_rendimento_mes_encerrado.sql:139-147`
- **Descrição:** a base do mês M é: entradas e saídas com data anterior a M, mais os rendimentos confirmados. Saídas feitas **dentro** de M não reduzem a base. Resultado: uma caixinha zerada no dia 1 rende o mês inteiro, e esse rendimento pode ser confirmado e resgatado.
- **Impacto:** a confirmação manual não impede dinheiro do nada, mesmo com taxa honesta. O patrimônio e a receita do mês inflam. Com taxa de 100% ao mês, R$ 1.000 resgatados no dia 1 geram R$ 1.000 resgatáveis (conta derivada da fórmula, não executada).
- **Reprodução:** `sentinela-hostil.sql`, bloco S08. Uma caixinha recebe R$ 1.000 em m0 e o valor sai inteiro no dia 1 de m1. Depois disso, confirma-se m1 e resgata-se o resultado.
- **Evidência:** `docs/auditoria/evidencias/carteira-r1/sentinela-hostil-placar.txt`
  - `S08a caixinha zerada no dia 1 de 2026-08 (saldo=0): pendentes = 2026-08=1000`
  - `S08b confirmar 2026-08 -> ok valor=1000 | saldo da caixinha agora=1000`
  - `S08c resgatar esse saldo para a corrente de A -> ok`
  - O `code-review` também reportou este caso (entra uma vez só na contagem).
- **Recomendação:** as saídas de M devem reduzir a base de M. A regra exata (menor saldo do mês ou saldo líquido) é decisão do Heitor. Correção em migration nova, com teste.
- **Dono sugerido:** Estrutura, com o Heitor decidindo a regra.
- **Registros criados pelo teste:** nenhum (rollback).

### [ALTO] A2 — A aba Investimentos em `origin/main` mostra patrimônio fictício e falsos sucessos
- **Confiança:** CONFIRMADO para o código em `origin/main`. O deploy na Vercel está NÃO AUDITADO. | **Ambiente:** local (SSR via Vite)
- **Localização:** `app/src/components/carteira/area-investimentos.tsx:60-62, 98-191`; `carteira/page.tsx:276`
- **Descrição:**
  - `page.tsx` não passa `dadosIniciais`, então o componente cai em `MOCK_CARTEIRA_INVESTIMENTO` (R$ 45.850,00 e as caixinhas "Reserva de Emergência", "CDB Pré-fixado 2027", "LCI Imobiliária").
  - Os handlers só mudam estado local e exibem "Aplicação de R$ X realizada com sucesso".
  - Não há aviso de demonstração: "demonstra", "exemplo" e "fictíc" estão ausentes; só aparece "simulado", e só na taxa.
- **Impacto:** a família real vê como seus investimentos dados que não existem, e "aplica" dinheiro sem nada ser gravado.
- **Evidência:**
  - `render-ssr-area-investimentos.txt`: com as props da página, "Reserva de Emergência", "CDB Pré-fixado 2027" e "LCI Imobiliária" aparecem como PRESENTE.
  - `git branch -r --contains 591bfda` → `origin/main`.
- **Recomendação:** até a fiação de dados reais, esconder a aba ou rotular explicitamente como demonstração.
- **Dono sugerido:** Fachada/Antigravity; a decisão de esconder é do Maestro/Heitor.
- **Registros:** nenhum.

### [MÉDIO] A3 — A conta-carteira e contas não-corrente aparecem como opção onde o banco recusa
- **Confiança:** SUSPEITA no lado da UI (prova negada pelo hook). O lado do banco está CONFIRMADO. | **Ambiente:** produção (rollback) + leitura
- **Localização:**
  - `lancar/page.tsx:38-42`: lista todas as contas ativas, sem filtrar tipo.
  - `carteira/page.tsx:71-77`: `contasOrigem` = todas as contas não-cartão (benefício, investimento e a própria carteira), usada em Aplicar, Resgatar e Pagar fatura.
  - `actions/resultado.ts:190`: o código 42501 vira "Você não tem permissão para fazer isso.".
- **Do lado do banco (CONFIRMADO):**
  - C13: `save_transactions` com a carteira → 42501.
  - C15: `pay_invoice` pela carteira → 42501.
  - C11: Aplicar com origem cartão ou carteira → "Conta de origem inválida".
- **Impacto:** depois que a carteira existe, o usuário escolhe a "Carteira de investimento" em `/lancar` e recebe um erro de permissão genérico. Se a primeira conta da lista for um VR, o Aplicar sempre falha. A carteira passa a existir assim que alguém chamar a RPC, o que já é possível em produção.
- **Recomendação:**
  - Filtrar a carteira dos seletores comuns (pela tabela `investment_wallets`, não pelo tipo).
  - Em Aplicar e Resgatar, oferecer só contas `corrente`.
  - Mapear a frase da trava em `MENSAGENS_DE_NEGOCIO`.
- **Dono sugerido:** Fachada (seletores) e Estrutura (mensagem).
- **Registros:** nenhum.

### [MÉDIO] A4 — O diálogo Aplicar apaga o valor e volta o destino para "não alocado" ao trocar a origem
- **Confiança:** CONFIRMADO | **Ambiente:** local (jsdom)
- **Localização:** `app/src/components/carteira/dialogo-aplicar.tsx:64-73`. O efeito de reset depende de `contaOrigemId`.
- **Evidência:** `jsdom-dialogo-aplicar-troca-origem.txt`
  - `ANTES -> valor: "1.500,00" | destino: cx-reserva`
  - `DEPOIS -> valor: "" | destino: nao_alocado`
- **Impacto:** depois da fiação, o dinheiro pode ir para o não alocado em vez da caixinha escolhida, sem o usuário perceber.
- **Recomendação:** resetar os campos só quando `aberto` passa de false para true.
- **Dono sugerido:** Fachada. **Registros:** nenhum. (O `code-review` também reportou.)

### [BAIXO] A5 — A conta-carteira pode ser arquivada e as RPCs continuam operando
- **Confiança:** CONFIRMADO | **Ambiente:** produção (rollback)
- **Evidência:** S06 em `sentinela-hostil-placar.txt`: `arquivar conta-carteira -> ok, 1 linha(s) | aplicar com carteira arquivada -> ok`. Excluir a conta é barrado com 23503.
- **Impacto:** o "Saldo total" de `/carteira`, que só conta contas ativas, deixa de bater com o patrimônio.
- **Recomendação:** congelar o `archived_at` da carteira no trigger, ou fazer as RPCs recusarem carteira arquivada.
- **Dono sugerido:** Estrutura. **Registros:** nenhum.

### [BAIXO] A6 — A RPC `carteira_criar_caixinha` aceita nome só invisível ou com caracteres de controle
- **Confiança:** CONFIRMADO | **Ambiente:** produção (rollback)
- **Evidência:** S03: o nome só com U+200B passa (`ok`); o nome com U+202E, `\n` e U+0007 também (`ok`); 61 caracteres são recusados.
- **Descrição:** o Zod com `limparNome` barraria isso, mas a RPC é chamável direto pelo PostgREST. Ela só faz `btrim`.
- **Recomendação:** replicar a limpeza de invisíveis na RPC ou num CHECK.
- **Dono sugerido:** Estrutura. **Registros:** nenhum.

### [BAIXO] A7 — O contrato dos diálogos é incompatível com as Actions (vale para a fiação futura)
- **Confiança:** SUSPEITA | **Ambiente:** leitura
- **Problema 1:** os diálogos tratam erro só via `throw` (`dialogo-aplicar.tsx:104-115` e equivalentes). As Actions devolvem `{ok:false}` e não lançam, então uma recusa apareceria como sucesso.
- **Problema 2:** o efeito em `area-investimentos.tsx:89-96` depende de `caixinhaParaProjecaoId` e reaplica `dadosIniciais`, descartando o estado local.
- **O que falta para confirmar:** a fiação real.
- **Dono sugerido:** Fachada.

### [BAIXO] A8 — O diálogo de vencimento diverge do back-end
- **Confiança:** SUSPEITA | **Ambiente:** leitura
- **Problema 1:** `dialogo-criar-caixinha.tsx:96-100` recusa vencimento até hoje, mas Zod e RPC aceitam data no passado e resgate no próprio dia (S02b: vence hoje → `ok`).
- **Problema 2:** `todayISO()` usa a data local do navegador, enquanto a RPC usa a de São Paulo.
- **Dono sugerido:** Fachada.

### [BAIXO] A9 — O runner dá falso "rollback falhou" com a 00017
- **Confiança:** SUSPEITA | **Ambiente:** leitura
- **Descrição:** em `carteira-rls.mjs:95-99`, a prova padrão só serve para a 00016. Com `--com-migration 00017` e sem `--prova`, o runner sai com código 3 mesmo sem falha de rollback.
- **Dono sugerido:** Estrutura.

### Sobre o teste do Estrutura
- Rodou 48/48 (`carteira-rls-execucao-sentinela.txt`). Prova o que diz.
- **Lacunas cobertas nesta auditoria:** trava de vencimento (S02), destino em conta de outra família (S01), meses pendentes de outra família (S09).
- **Lacunas que ficam:** o mutante só altera RLS, `resgatar` e `atualizar_taxa`. Os filtros por família de aplicar, alocar e confirmar não têm vermelho provado. A trava (C12–C17) também não, exceto F04 e F05 contra a 00016.

## Riscos de processo

1. **Hook PreToolUse de independência: ATIVO, CONFIRMADO.** Uma escrita de teste do Sentinela no scratchpad foi negada pelo `sentinela-independencia.cjs`.
   - MÉDIO/SUSPEITA (leitura do hook): o `allow()` devolve `permissionDecision: "allow"` para todo Edit/Write de qualquer outro agente. Isso pode estar pulando os prompts de permissão do time inteiro.
   - A regra casa por substring, então um caminho com `/docs/auditoria/../src/` passaria.
   - O hook não cobre Bash.
   - Dono: Heitor.
2. **MÉDIO/CONFIRMADO: schema em produção antes do código.** As RPCs já podem ser chamadas pelo cliente, e a fiação do front não existe.
3. **ALTO/CONFIRMADO: só existe banco de produção.** O Docker não está rodando e não há preview. Não há ambiente legítimo para teste hostil, mutante ou concorrência real.
4. **BAIXO: a trava GUC é forte só por falta de caminho SQL.** No nível SQL, qualquer papel liga `app.carteira_rpc` (S07: `INSERT aceito (current_user=authenticated)`). Qualquer função futura em `public` com SQL dinâmico ou `set_config` parametrizado quebra a trava. Recomenda-se uma rede de proteção nas migrations.
5. **BAIXO: o não alocado ≥ 0 só é garantido pelo lock.** Não há invariante no banco.
6. **NÃO AUDITADO: se o hook `security-guidance` estava ativo.** Na dúvida, esta revisão manual pode ter sido a única cobertura de segurança.

## Recomendações ao Heitor

- Abrir uma sessão dedicada de `claude-security` antes da entrega, porque a feature mexe com dinheiro e o `security-review` não rodou.
- Decidir a regra do A1.
- Criar um ambiente local ou de preview com Supabase para os testes destrutivos.

### Auto-Análise (do Sentinela)
- Passes realizados: 3
- Passes que encontraram erro: 2
- Correções aplicadas:
  - O A3 estava como CONFIRMADO e virou SUSPEITA no lado da UI, porque a prova foi negada.
  - O A2 dizia "em produção"; virou código CONFIRMADO em `origin/main` com o deploy NÃO AUDITADO.
  - Os achados 1, 3, 4, 5 e 9 do `code-review` foram fundidos com A2, A3, A4 e A1. Os achados 2 e 6 viraram A7. A lista final não tem duplicatas.
  - A trava GUC saiu da lista de achados e foi para Riscos (não é defeito).
  - Ficaram registrados os desvios: `security-review` não rodou, skills Supabase não carregadas, testes em produção com rollback.
- Lições novas: nenhuma gravada por ele (escrita suspensa pelo hook no momento). Propostas registradas para o próximo caderno:
  - Pedir autorização explícita no briefing antes de qualquer teste contra o banco de produção, mesmo com rollback.
  - Conferir no início se o cwd da sessão é o repositório; se não for, pedir ao Maestro uma sessão aberta no repositório antes de contar com `security-review`.
- Pendências abertas:
  - `security-review` real (skill nunca executou de fato).
  - QA Playwright em 3 breakpoints e dark.
  - Mutante e concorrência dinâmica, que precisam de ambiente fora de produção.
  - Prova do A3 na UI.
