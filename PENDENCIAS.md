# Pendências — Finanças a Dois v2

Registro vivo do que ficou fora, do que foi pedido fora de escopo e do que
depende de decisão do Heitor. Atualizado a cada entrega aceita.

---

## Aguardando decisão do Heitor

### P-001 — Rate limiting em `family_preview` e `join_family` — BLOQUEANTE para abrir o beta
- **Origem:** achado 3 do `security-guidance` (2026-10-11), parte não aceita.
  **Reforçado** por um segundo achado do mesmo hook em 2026-10-11, agora sobre a
  migration `00006`: "insufficient entropy for access-granting secret".
- **O quê:** hoje nada limita tentativas de adivinhar um `join_code`. O código
  tem 6 caracteres num alfabeto de 32 = **~30 bits** de entropia (32^6 ≈ 1,07
  bilhão). Isso é pouco para um segredo que concede acesso, SE o atacante puder
  tentar à vontade.
- **Por que a entropia NÃO foi aumentada** (achado rejeitado, com motivo):
  1. Entropia não é a defesa certa aqui. Sem limite de tentativas, um atacante
     acha código de **qualquer** comprimento com tempo suficiente; 128 bits só
     muda a escala do problema. Com limite de tentativas, 30 bits bastam com
     folga. A correção real é este P-001 — o próprio revisor diz isso na segunda
     metade da sugestão dele.
  2. Três barreiras independentes já existem em `join_family` (`00003`, linhas
     145-168): exige login (`anon` revogado), recusa quem já tem família
     (`Você já faz parte de uma família`), e recusa casa cheia
     (`v_count >= v_limit` com `FOR UPDATE` serializando entradas simultâneas).
     Com `member_limit = 2`, quem acertar o código hoje recebe
     `Esta família já está completa`.
  3. Custo real sobre o usuário: o código é o **único passo manual** do
     onboarding — digitado no celular pelo parceiro. Dobrar para 12+ caracteres
     piora o produto, e mudar o comprimento exige `ALTER TABLE` no `CHECK` de
     tabela já aplicada no banco do cliente.
- **A barreira que DESAPARECE ao abrir para famílias:** a proteção nº 2 acima
  depende de `member_limit = 2`. Numa família de 6 pessoas com 3 vagas livres,
  acertar o código **entra de verdade**. É por isso que este item é bloqueante
  para o passo "abrir para famílias", não para o beta do casal.
- **Opções:** contador de tentativas por usuário dentro das funções
  `SECURITY DEFINER` · bloqueio após N falhas · captcha no front · ou resolver
  junto com P-006 (código de uso único, que torna a adivinhação inútil).
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

### P-002 — URL do repositório novo no GitHub — RESOLVIDO
- **O quê:** o Heitor forneceu `https://github.com/horianalytics-alt/CASAIS-est-veis.git`
  em 2026-10-12. Push feito, deploy automático na Vercel confirmado.
- **Status:** fechado. Mantido aqui só como registro histórico.

### P-003 — Open Finance — CANCELADO
- **Origem:** Heitor, 2026-10-11 — "futuramente penso em deixar esse app open finance".
- **Status:** CANCELADO por decisão do Heitor em 2026-10-13 ("se isso for por
  causa do open finance esquece, não quero mais"). Não entra em nenhuma fase
  futura. O campo `accounts.external_id` fica no schema sem uso — não vale a
  pena remover só por isso, mas nenhuma pesquisa de agregador (Pluggy/Belvo)
  será feita.

---

## Dívida técnica conhecida

### P-007 — ~~Tipo de conta mutável fora da Server Action~~ — RESOLVIDO
- **Origem:** Sentinela, auditoria R4 (`docs/auditoria/sentinela-r4.md`, seção 5).
- **Resolvido em:** migration `00016_carteira_investimento.sql` (verificado pelo Maestro em 2026-11-22).
- **Estado atual:** trigger `trg_accounts_carteira_congela` (`BEFORE UPDATE ON public.accounts`) rejeita mudança de `type`, `initial_balance` e `family_id` via `accounts_carteira_congela()`. Proteção existe no banco, não só na Action.

### P-008 — ~~Índice único de nome normalizado tem brechas~~ — RESOLVIDO
- **Origem:** Sentinela, auditoria R4 (seção 6).
- **Resolvido em:** migration `00011_grupos_categoria_e_nome_normalizado.sql` (verificado pelo Maestro em 2026-11-22).
- **Estado atual:** função `chave_nome()` criada no banco (PostgreSQL) normaliza o nome antes da indexação. Índices `uq_categories_family_name` e `uq_payment_methods_family_name` usam `chave_nome(name)` como expressão. `chaveDeComparacao()` no código TypeScript usa a mesma normalização. Proteção existe tanto no banco quanto na Action.

### P-009 — ~~Arredondamento de ponto flutuante em valores monetários~~ — RESOLVIDO
- **Origem:** Sentinela, auditoria R4 (seção 8).
- **O quê:** `Math.round(numero * 100) / 100` em
  `app/src/actions/lancamento.ts` errava na borda de 0,005 por causa de
  ponto flutuante binário (`1.005 → 1` em vez de `1.01`;
  `10.075 → 10.07` em vez de `10.08`).
- **Resolução:** Resolvido na Rodada 22:
  - Criada função `arredondarMoeda(numero: number): number` em `src/lib/format.ts` utilizando notação exponencial decimal (`Number(Math.round(Number(numero + 'e2')) + 'e-2')`), eliminando a distorção binária IEEE-754.
  - Aplicada em `src/actions/lancamento.ts` (linha 85) e no espelho de validação em `tests/unit/lancamento-validacao.test.ts`.
  - Criada suíte unitária dedicada em `tests/unit/arredondamento.test.ts` cobrindo todos os casos de borda (`1.005 -> 1.01`, `10.075 -> 10.08`, `1.004 -> 1.00`, `100.0 -> 100.0`, `0.1 + 0.2 -> 0.3`).
- **Status:** Fechado na Rodada 22.

### P-014 — Projeção da caixinha parte só do saldo confirmado, não do estimado
- **Origem:** Dash, plano `dash-grafico-projecao-caixinha.md` (M-4), 2026-10-26.
- **O quê:** o gráfico de projeção de 12 meses calcula a simulação a
  partir de `balance_cents` (só rendimento já CONFIRMADO pelo usuário),
  nunca do rendimento estimado/pendente de confirmação. Quem demora para
  confirmar um mês vê a curva de projeção começar de um ponto mais baixo
  do que "deveria" se o rendimento pendente já contasse.
- **Severidade:** não é bug — é consequência direta da decisão 4b da
  spec (rendimento só vira saldo de verdade por confirmação manual).
  Registrado como característica esperada, não para correção.
- **Se incomodar o Heitor no uso real:** considerar um aviso textual no
  gráfico tipo "projeção não inclui rendimento ainda não confirmado",
  decisão de produto, não técnica.

### P-013 — ~~atualizarLancamento devolve só o id, não a linha completa~~ — RESOLVIDO
- **Origem:** Fachada, achado durante a correção de VR/VA e gasto fútil
  no diálogo de editar, 2026-10-16.
- **O quê:** a action terminava em `.select('id')` em vez de `.select('*').single()`.
  Depois de editar, a lista local (`lista-transacoes-interativa.tsx`)
  fazia merge com objeto manual do formulário, deixando `invoice_year`,
  `invoice_month` e `owner_share` desatualizados em itens do scroll infinito.
- **Resolução:** Resolvido na Rodada 21:
  - `src/actions/editar-lancamento.ts`: assinatura de `atualizarLancamento` alterada para devolver `Promise<ResultadoAction<Database['public']['Tables']['transactions']['Row']>>`, fazendo `.select('*').single()`, tratando `PGRST116` como `M.NAO_ENCONTRADO` e devolvendo `sucesso(data)`.
  - `src/components/transacoes/dialogo-editar-lancamento.tsx`: merge local agora consome diretamente `onSalvo?.(resposta.dados)`.
  - Testes unitários atualizados em `app/tests/unit/dialogo-editar-lancamento.test.tsx` garantindo propagação das colunas calculadas pelo backend.
- **Status:** Fechado na Rodada 21.

### P-012 — Diálogo de editar lançamento não filtra categoria por tipo — RESOLVIDO
- **Origem:** Fachada, achado colateral na correção do bug de troca de
  tipo, 2026-10-15.
- **O quê:** `dialogo-editar-lancamento.tsx` lista TODAS as categorias da
  família no seletor, sem filtrar pelo tipo do lançamento (a query de
  `/inicio` busca só `id, name`, sem `type`). Uma categoria de despesa
  pode ficar selecionada depois de trocar o tipo para receita, e a
  action salva assim — ela só confere se a categoria existe na família,
  não se o tipo bate.
- **Resolução:** Resolvido na Rodada 20:
  - Adicionado `type` na query de categorias em `src/app/(app)/(principal)/inicio/page.tsx` e propagado até o diálogo via `listaCategorias`.
  - Atualizada interface `ItemSelectOpcao` com `type?: string`.
  - Adicionado filtro `categoriasDoTipo` em `src/components/transacoes/dialogo-editar-lancamento.tsx` (`!c.type || c.type === tipo || c.type === 'todos'`).
  - Limpeza automática de categorias incompatíveis ao mudar de tipo (`setCategoriaId('')`).
  - Testes unitários cobrindo o comportamento em `dialogo-editar-lancamento.test.tsx`.
- **Status:** Fechado na Rodada 20.

### P-010 — ~~Sem Server Action para criar/editar orçamento por categoria~~ — RESOLVIDO
- **Origem:** Dash, entrega de `/analises`, 2026-10-14.
- **Resolvido em:** rodada posterior (verificado pelo Maestro em 2026-11-22).
- **Estado atual:** `src/actions/orcamentos.ts` tem `definirOrcamento` e `excluirOrcamento`;
  `GerenciadorOrcamentos` está renderizado em `/ajustes/categorias`; `GraficoOrcamento` lê
  `v_orcamento_progresso` em `/analises`. Feature completamente funcional.

### P-011 — ~~Paleta categórica reprova no validador do dataviz~~ — RESOLVIDO
- **Origem:** Dash, mesma entrega.
- **Resolvido em:** retrabalho da paleta em `src/styles/chart-palette.ts` em 2026-10-15 (verificado pelo Maestro em 2026-11-22).
- **Estado atual:** comentário no arquivo confirma "ALL CHECKS PASS" para todos os 8 slots em light e dark. Paleta validada pela skill `dataviz`.

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

### P-016 — Excluir conta permanentemente (hoje só arquiva) — RESOLVIDO
- **Origem:** Heitor, 2026-11-22 — "não tem como excluir um cartão que já foi criado, só arquivar; futuramente vai ser péssimo encontrar conta ativa em meio a várias arquivadas".
- **O quê:** a tela `ajustes/contas` tem botão de arquivar (`BotaoArquivarConta`) mas não de excluir. Conta com transações vinculadas não pode ser excluída sem decisão arquitetural: exclusão física destrói histórico; exclusão com verificação ("conta sem transações pode ser apagada") é a rota mais segura.
- **Resolução:** Implementado na Rodada 18:
  - Server Action `excluirConta` em `src/actions/contas.ts` capturando código PostgreSQL `23503` (FK violation com `ON DELETE RESTRICT`) e retornando mensagem amigável: "Esta conta não pode ser excluída porque tem lançamentos vinculados. Arquive-a em vez de excluir."
  - Componente client `BotaoExcluirConta` em `src/components/ajustes/botao-excluir-conta.tsx` com diálogo de confirmação destrutivo e exibição de erro.
  - Integrado em `/ajustes/contas/page.tsx` para todas as contas ativas/arquivadas (exceto investimentos).
- **Status:** Fechado na Rodada 18.

### P-015 — Nome de caixinha "invisível" passa (Sentinela N1, BAIXO, CONFIRMADO)
- **O quê:** nome só com U+2800 (Braille em branco) ou só com U+0301 (acento solto) é aceito pelo Zod e pela RPC `carteira_criar_caixinha`. Evidência: `docs/auditoria/evidencias/carteira-r2/sonda-zod-nome.out.txt`.
- **Dono:** Estrutura, em migration NOVA (nunca ALTER na 00018), junto com a limpeza de U+200F e Hangul filler já pendente, e o mesmo ajuste em `esquemas-investimentos.ts`.
- **Quando:** antes de ligar a aba Investimentos.

### P-017 — Edição em massa (`DialogoEditarEmMassa`) sem seletores de forma de pagamento e responsável na UI — RESOLVIDO
- **Origem:** Rodada 16 (Briefing linha 234 e Sentinela Achado Baixo).
- **O quê:** Na Rodada 16, o backend (`esquemaAtualizarEmMassa` e `planejarEdicaoEmMassa`) foi totalmente preparado para receber `formaDePagamentoId` e `responsavelId`, mas a interface visual (`DialogoEditarEmMassa`) ainda não expunha os dois campos para alteração em lote.
- **Resolução:** Implementado na Rodada 17 com os seletores correspondentes, sentinela `_none`, guard contra transferências para `responsavelId` e cobertura com testes unitários em `dialogo-editar-em-massa.test.tsx`.
- **Status:** Fechado na Rodada 17.

---

## Fora de escopo por decisão registrada

| Item | Decisão | Quando |
|---|---|---|
| Migração dos dados da v1 | Começar do zero — nada é importado | Heitor, 2026-10-11 |
| Código de convite para o beta | Cadastro aberto, sem convite | Heitor, 2026-10-11 |
| Mais de 2 membros por família | Schema arquitetado para N; `member_limit` fica em 2 na Onda 1 | Heitor, 2026-10-11 |
| Supabase local (Docker) | Descartado — 3,7 GB de imagens para um banco que já existe hospedado | Heitor, 2026-10-11 |
