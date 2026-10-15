# Auditoria Sentinela R5: leva publicada desde a R4 (00010–00013, push, grupos, orçamento, recuperação de senha, editar/excluir lançamento)

> **DESTAQUE PARA O MAESTRO (leia antes de tudo).** Nenhum achado CRÍTICO de segurança.
> O isolamento entre famílias, o `service_role` e a correção de Host Header resistiram a todos os ataques.
> Mesmo assim o veredicto é **REPROVADO**, por dois achados ALTO **CONFIRMADOS em produção**:
> 1. **A-1: "Excluir → Apenas este lançamento" na 1ª parcela apaga a série inteira.** Perda silenciosa
>    de dado financeiro. A tela responde "1 excluído" e some com N.
> 2. **A-2: a recuperação de senha não funciona em produção.** O link cai na raiz de
>    `financascasais-hori13.vercel.app`, que está atrás do login SSO da Vercel.
>
> Há também um **risco de processo ALTO (P-1)**. Uma senha REAL do Heitor apareceu em texto claro
> no navegador Playwright compartilhado e foi gravada em disco por outra sessão. **A troca dessa
> senha é recomendada.**

## Resumo Executivo

- **Escopo auditado:**
  - Commit local `580a506` (HEAD em `C:\dev\financas-a-dois`), diff `1a63b55..580a506` em `app/src`, `app/supabase`, `app/public`:
    - `C:\dev\financas-a-dois\app\src\actions\{acerto,fatura,push,editar-lancamento,grupos-categoria,orcamentos,auth,lancamento,contexto-familia,resultado}.ts`
    - `C:\dev\financas-a-dois\app\src\lib\supabase\servico.ts`, `C:\dev\financas-a-dois\app\src\lib\push\{notificar,endpoints,mensagens}.ts`
    - `C:\dev\financas-a-dois\app\src\lib\{esquemas-pagamentos,esquemas-edicao-lancamento,esquemas-grupos}.ts`
    - `C:\dev\financas-a-dois\app\supabase\migrations\0001{0,1,2,3}_*.sql`, mais as policies vigentes no banco hospedado (catálogo lido ao vivo)
    - `C:\dev\financas-a-dois\app\src\components\auth\form-nova-senha.tsx` e `C:\dev\financas-a-dois\app\src\components\transacoes\*` (só leitura de código; o comportamento foi visto em produção)
  - Rotas percorridas no navegador (produção, contas descartáveis): `/login`, `/nova-senha#...`, `/inicio`, diálogo "Excluir lançamento", diálogo "Editar lançamento".
- **Escopo NÃO auditado:**
  - **3 commits que chegaram em `origin/main` DURANTE a auditoria**, às 10:30: `2996ffa`, `fa94fd1`, `4c3fd04`, de Heitor/Antigravity. Eles ligam os diálogos de edição às Server Actions. Vi só o efeito em produção (o diálogo pede "conta de destino"). O código foi lido por cima, sem revisão completa.
  - **Dark mode e os 3 breakpoints (375/768/1440): NÃO auditados.** O navegador Playwright é compartilhado com outra sessão concorrente (ver P-1), e parei de usá-lo para não interferir nela nem ver mais credenciais.
  - **WCAG das telas de orçamento (`/ajustes/categorias`) e do botão de notificações (`/ajustes/perfil`): NÃO auditados**, pelo mesmo motivo. Só o diálogo de edição foi lido pela árvore de acessibilidade.
  - **Push real com dois aparelhos: NÃO auditado.** Sem dispositivo. O envio foi testado com `web-push` substituído por um gravador.
  - **Rate limiting de borda (WAF Vercel): NÃO AUDITADO.** Sem `vercel` CLI autenticado. Rate limit da aplicação na recuperação de senha: só o 429 do Supabase Auth é tratado. Não testei por volume.
  - **`Skill(skill="security-review")` NÃO rodou.** Ela exige que o cwd da sessão seja um repositório git, e o cwd é `c:\Users\Heitor PC\OneDrive\Documentos\Segundo cérebro live`. Mensagem literal da ferramenta, repassada a pedido dela: *"/security-review needs to run inside a git repository, but the current working directory is not one. If the repository is in a subdirectory, `cd` into it first and then re-run /security-review."* Como alternativa rodou `Skill(skill="code-review")` em nível `high`, mais a varredura manual completa abaixo.
- **Ferramentas que rodaram:**
  - `code-review` nível `high`, sem `--fix`, sobre `app/src`; ele cobriu `8fb4bb6..HEAD`
  - `supabase:supabase-postgres-best-practices`, `supabase:supabase`
  - vitest isolado com 17 testes hostis contra o banco hospedado
  - `npx supabase db query`, só leitura de catálogo
  - `next build` (Turbopack) numa cópia descartável, com sonda e sem sonda
  - API admin do Supabase Auth com `/verify`
  - Playwright só em 1440x900, tema claro, e só até o conflito de navegador
  - `superpowers:verification-before-completion`
  - **Não rodaram:** `security-review` (ver acima), `design:accessibility-review`, dark mode, 375/768.
- **Ambiente:** **produção**. Existe um banco só, o Supabase hospedado `wxhfgstgjjlmqauogeid`, e o app usado foi `https://financascasais.vercel.app`. Todo dado escrito foi de **famílias e usuários descartáveis** (`sentinela-r5-*@example.com`), como o Maestro autorizou. A família real só foi alvo de tentativas de escrita que falharam (42501). A limpeza foi comprovada: retrato do banco antes e depois idêntico (ver "Registros criados").
- **Contagem:** CRÍTICO 0 | ALTO 2 | MÉDIO 3 | BAIXO 4 (CONFIRMADO 9 | SUSPEITA 6). As SUSPEITAs estão na seção "Qualidade", sem severidade bloqueante.
- **VEREDICTO: REPROVADO.** Sustentado por A-1 e A-2, os dois CONFIRMADOS e ALTO.

### O que foi testado e se SUSTENTOU (evidência em `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-hostil.obs.txt`)

| Pergunta do briefing | Resultado | Linha da evidência |
|---|---|---|
| Host Header Injection (`0c39e05`) continua corrigido? | **Sim.** Nenhum `headers()` em todo o `src/` (grep). `redirectTo` vem só de env: `https://financascasais.vercel.app/nova-senha`. 2ª camada: o Supabase Auth **recusa** `redirect_to` hostil (`evil.example`, `financascasais.vercel.app.evil.example`) e cai na Site URL. | `obs` linha 32; `sentinela-r5-redirect-allowlist.out.txt` |
| Outro lugar decide domínio sensível por cabeçalho? | **Não.** Os únicos derivados de URL são `destino.ts` (`?proximo=`, já endurecido) e `barra-progresso.tsx` (compara a origem com `window.location`). | grep na sessão |
| `servico.ts` tem `server-only` e quebra o build se um Client Component o importar? | **Sim, provado.** Sonda `'use client'` importando `servico.ts`: `next build` sai com exit 1 (`'server-only' cannot be imported from a Client Component module`). Controle sem a sonda: exit 0, com TypeScript. | `sentinela-r5-build-com-sonda.out.txt`, `sentinela-r5-build-controle.out.txt` |
| `service_role` aparece no bundle de cliente? | **Não.** 0 arquivos em `.next/static` contêm o valor da chave de serviço, a senha do banco ou a senha de semente. | `sentinela-r5-bundle-segredos.out.txt` |
| `servico.ts` só lê inscrições dos OUTROS membros da família de quem agiu? | **Sim.** A2 lança e só o endpoint de A1 recebe. A1 acerta e só A2 recebe. B1 nunca recebe. O endpoint hostil gravado por REST é **pulado** (`pulados=1`). O envio só acontece depois de `after()` (0 envios antes). Inscrição 410 apagada. `family_id` vem sempre de `get_user_member_id_self`/`family_members` pela sessão. | linhas 22–24 |
| Logs de push vazam endpoint, chave `p256dh`/`auth`, VAPID privada ou `service_role`? | **Não.** 12 segredos procurados nos 4 logs capturados: 0 ocorrências. | linhas 24–25 |
| Anti-SSRF de `salvarInscricaoPush` | 13 endpoints hostis recusados: host arbitrário, `http`, sufixo falso, userinfo, porta, fragmento, 169.254.169.254, localhost, mais de 2048 caracteres, chaves inválidas. | linha 20 |
| RLS de `push_subscriptions` | A1 não grava em nome de A2 nem na família B (42501). A2/B1 só veem a própria inscrição. A2 não apaga a de A1, nem pela Action nem por REST. | linha 22 |
| `pagarFatura`/`registrarAcerto` com id de outra família, valores inválidos, RPC direta | Todas recusadas, inclusive a RPC `pay_invoice`/`settle_up` chamada direto do cliente com ids de B. A fatura de B ficou intacta. | linhas 2–9 |
| `atualizarLancamento`/`EmMassa` | 19 + 12 entradas hostis recusadas: id/conta/categoria/membro de B, lote vazio, 51 distintos, 10.000 ids, mistura com B, acerto. SQLi/XSS gravados como texto literal. | linhas 10–14 |
| `definirOrcamento`/`excluirOrcamento` | 10 entradas hostis recusadas. A não lê nem apaga orçamento de B. REST com `family_id`/categoria de B recusado (42501/23503). | linhas 15–16 |
| Grupos | 11 entradas hostis recusadas. A FK composta barra uma categoria de A apontando para grupo de B (23503). Mover grupo para outra família dá 42501. | linhas 17–19 |
| `v_orcamento_progresso`/`v_patrimonio_mensal`/`v_settlement` | `security_invoker=true` nas 6 views (catálogo). `anon` sem SELECT nas 3 novas: 401 `permission denied for view`. Como A1: 0 linhas de B e 0 da família real. | `sentinela-r5-catalogo.out.json`; linhas 9, 16, 30 |
| RLS ligado e uma policy por operação em `category_groups` e `category_budgets` | Sim, 4 cada, todas por `family_id = (SELECT get_user_family_id_self())`, com `TO authenticated` e UPDATE com `WITH CHECK`. `push_subscriptions` tem SELECT/INSERT/DELETE por membro e nenhum UPDATE de propósito. | catálogo |
| Sem sessão | As 8 actions novas devolvem "Sua sessão expirou". | linha 31 |

## Achados

### [ALTO] A-1: "Apagar só este lançamento" na 1ª parcela de uma série apaga TODAS as parcelas
- **Confiança:** CONFIRMADO (duas reproduções: Server Action no vitest e diálogo em produção)
- **Ambiente:** produção (banco hospedado, família descartável)
- **Localização:**
  - `C:\dev\financas-a-dois\app\supabase\migrations\00001_initial_schema.sql:169`: `recurrence_parent_id uuid REFERENCES transactions(id) ON DELETE CASCADE`. Conferido no banco vivo: `FOREIGN KEY (recurrence_parent_id) REFERENCES transactions(id) ON DELETE CASCADE`.
  - `C:\dev\financas-a-dois\app\supabase\migrations\00006_hardening_seguranca.sql:437`: o ramo `single` faz `DELETE` simples da linha.
  - É acionado por `C:\dev\financas-a-dois\app\src\components\transacoes\dialogo-excluir-lancamento.tsx` (opção "Apenas este lançamento") e pela exclusão em lote, que sempre manda `'single'` (`lista-transacoes-interativa.tsx:277`).
- **Descrição:** a 1ª parcela é a "mãe" da série. Apagá-la com escopo `single` dispara o `ON DELETE CASCADE` e leva junto todas as filhas. O RPC devolve `ROW_COUNT = 1`, e a tela confirma "1 excluído".
- **Impacto:** perda silenciosa de lançamentos futuros (parcelas de cartão, fixos). O texto da opção diz "Exclui apenas o lançamento deste mês". Previsão de 6 meses, faturas futuras e acerto ficam errados, sem aviso e sem como desfazer.
- **Reprodução:**
  1. Lance uma despesa em 3 parcelas.
  2. Em `/inicio`, clique "Excluir" na parcela 1.
  3. Escolha "Apenas este lançamento" e clique "Excluir".
  4. Consulte as parcelas de novembro e dezembro: não existem mais.
- **Evidência:**
  - `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-hostil.obs.txt` linha 26: `{"parcelasCriadas":3,"antes":3,"resposta":{"ok":true,"dados":{"excluidos":1}},"depois":0}`
  - UI em produção: `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-excluir-apenas-este-antes.png` (opção escolhida). Depois da confirmação, o banco tem só 3 lançamentos e nenhum "Notebook 3x R5": `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-ui-excluir-apenas-este.db.out.txt`
- **Recomendação:** em `delete_transactions`, no ramo `single`, quando a linha for mãe de série, promova a próxima parcela a mãe (`UPDATE ... SET recurrence_parent_id = <nova mãe>` nas irmãs) antes do `DELETE`. Alternativa: migration nova trocando a FK para `ON DELETE SET NULL`, avaliando o que isso faz com o escopo `series`. Teste de regressão: "single na mãe deixa N−1".
- **Dono sugerido:** Estrutura (RPC/migration nova). Fachada só se o texto da opção mudar.
- **Crédito:** apontado primeiro pelo `code-review` high (item 1, leitura de código). O Sentinela reproduziu e confirmou. Entrada única.
- **Registros criados pelo teste:** 3 + 3 parcelas em famílias descartáveis, já removidas (ver "Registros criados").

### [ALTO] A-2: a recuperação de senha em produção leva para um domínio atrás do login SSO da Vercel
- **Confiança:** CONFIRMADO nas duas camadas observáveis (Supabase Auth e Vercel). O fluxo completo por e-mail não foi executado: não há caixa de entrada de teste.
- **Ambiente:** produção (Supabase Auth do projeto; usuário descartável criado e apagado)
- **Localização:** configuração do Supabase Auth (Dashboard → Authentication → URL Configuration: Site URL e Redirect URLs) e Deployment Protection do domínio `financascasais-hori13.vercel.app`. O código (`C:\dev\financas-a-dois\app\src\actions\auth.ts:172-175`) pede `https://financascasais.vercel.app/nova-senha` corretamente.
- **Descrição:** a allowlist de Redirect URLs do Supabase **não aceita** `https://financascasais.vercel.app/nova-senha`. O GoTrue troca o destino pela Site URL `https://financascasais-hori13.vercel.app/`. Esse domínio responde `302` para `https://vercel.com/sso-api?...`, o login de equipe da Vercel. Quem clica no link do e-mail cai numa tela de login da Vercel, não na tela de nova senha.
- **Impacto:** Heitor ou Carol, ao esquecerem a senha, não conseguem recuperá-la. O PROJETO.md lista a recuperação como "Funcionando". O e-mail de confirmação de cadastro provavelmente tem o mesmo problema, porque `cadastrar()` não passa `emailRedirectTo` e cai na Site URL. Isso é **SUSPEITA**, não testado.
- **Reprodução:**
  1. `node docs/auditoria/evidencias/sentinela-r5-redirect-allowlist.cjs`: gera links de recuperação pela API admin (mesma validação de `redirect_to` do `/recover`) e segue o `/verify` sem seguir o redirect.
  2. `curl -sD - "https://financascasais-hori13.vercel.app/?code=x"`.
- **Evidência:**
  - `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-redirect-allowlist.out.txt`: `"controle_dominio_legitimo": {"pedido":"https://financascasais.vercel.app/nova-senha","redirect_to_no_link":"https://financascasais-hori13.vercel.app/","status":303,"location_origem_caminho":"https://financascasais-hori13.vercel.app/"}`
  - curl desta sessão: `HTTP/1.1 302 Found` / `Location: https://vercel.com/sso-api?url=https%3A%2F%2Ffinancascasais-hori13.vercel.app%2F%3Fcode%3Dteste-sentinela...`
- **Recomendação:**
  - Mudar a Site URL para `https://financascasais.vercel.app`.
  - Incluir `https://financascasais.vercel.app/**` em Redirect URLs. O padrão de preview só se for desejado.
  - Ou tirar a Deployment Protection do alias `-hori13`.
  - Depois, testar ponta a ponta com o e-mail do Heitor.
- **Dono sugerido:** Heitor (configuração de painel; nenhum agente tem acesso).
- **Registros criados pelo teste:** 1 usuário `sentinela-r5-redir-*`, apagado pelo próprio script (`"aindaExiste": false`).

### [MÉDIO] M-1: `/nova-senha` aceita qualquer `#access_token` e loga o visitante na conta de outra pessoa (login CSRF / fixação de sessão)
- **Confiança:** CONFIRMADO
- **Ambiente:** produção (`https://financascasais.vercel.app`, contas descartáveis)
- **Localização:** `C:\dev\financas-a-dois\app\src\components\auth\form-nova-senha.tsx`, `useEffect` adicionado em `1d6317c`, ramo `hash.includes('access_token')` → `supabase.auth.setSession(...)`.
- **Descrição:** qualquer link `https://financascasais.vercel.app/nova-senha#access_token=<A>&refresh_token=<B>` instala a sessão do dono dos tokens no navegador de quem abriu. Não há checagem de origem nem de `type=recovery` vindo do próprio Auth. Como o cadastro é aberto, o atacante cria conta, gera os próprios tokens e manda o link.
- **Impacto:** a vítima (Heitor ou Carol, no PWA) passa a operar a conta do atacante. Se o atacante nomeou a "casa" e a conta de forma convincente, o que a vítima lançar vai para a família do atacante, que lê tudo. Se a vítima já estava logada, a sessão dela é substituída.
- **Reprodução:**
  1. Navegador sem sessão: `/inicio` redireciona para `/login` (confirmado).
  2. Abra `/nova-senha#access_token=<tokens da conta "Atacante R5">&refresh_token=...&type=recovery`.
  3. Abra `/inicio`: aparece logado como "Atacante R5".
- **Evidência:** `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-fixacao-sessao-inicio.png` (tela `/inicio` com "Conta de Atacante R5"); `browser_evaluate` desta sessão: `{"url":"https://financascasais.vercel.app/inicio","contemAtacante":true,"cookiesSb":["sb-wxhfgstgjjlmqauogeid-auth-token"]}`; árvore em `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-snapshot-fixacao-inicio.yml`.
- **Recomendação:** remover o ramo de hash. Usar só o fluxo que o `@supabase/ssr` recomenda para recuperação: template de e-mail com `token_hash` mais `verifyOtp({ type: 'recovery', token_hash })` no servidor, ou o PKCE `?code=`, que só funciona no navegador que pediu. Consultar `supabase:supabase` / docs de Auth antes de implementar.
- **Dono sugerido:** Fachada (componente), com Estrutura se a troca for para `verifyOtp` no servidor.
- **Registros criados pelo teste:** usuário/família "Atacante R5", removidos (`sentinela-r5-ui-setup.limpar.out.txt`).

### [MÉDIO] M-2: o "acerto de contas" pode ser forjado ou desfeito por REST direto; a trava "acerto não pode ser editado" só existe na Server Action
- **Confiança:** CONFIRMADO
- **Ambiente:** produção (família descartável A)
- **Localização:** privilégio de coluna. `authenticated` tem INSERT e UPDATE em `transactions.settlement_to_member_id` (catálogo). A policy `transactions_update` só olha `family_id`. A regra fica em `C:\dev\financas-a-dois\app\src\lib\esquemas-edicao-lancamento.ts` (`montarPatchIndividual`/`planejarEdicaoEmMassa`).
- **Descrição:** a 00010 diz que a coluna é "gravada SÓ por settle_up", mas nada no banco impõe isso. Com a própria sessão, um membro grava uma transferência com `settlement_to_member_id` e desfaz um acerto real (`SET settlement_to_member_id = NULL`), contornando `settle_up` e a recusa `M.ACERTO`.
- **Impacto:** a integridade do saldo de acerto entre os dois membros depende da boa-fé de cada um ou de nenhum token vazado. Não cruza família: com membro de B, o resultado é `23503`.
- **Reprodução:** como A1, `insert` em `transactions` com `type='transferencia'`, `settlement_to_member_id=A2`, `amount=999`. O saldo de `v_settlement` vai de ±45 para ±1044. Depois, `update ... set settlement_to_member_id=null` no acerto real retorna 1 linha.
- **Evidência:** `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-hostil.obs.txt` linha 28: `"acertoForjadoPorRest":{"rows":1}, "saldoAntes":[...-45...,45], "saldoDepois":[...-1044...,1044], "desfazerAcertoPorRest":{"rows":1}, "acertoComMembroDeB":{"code":"23503"}`. Catálogo: `sentinela-r5-catalogo.out.json` (`auth_update_colunas_transactions` inclui `settlement_to_member_id`).
- **Recomendação:** migration nova com `REVOKE INSERT (settlement_to_member_id), UPDATE (settlement_to_member_id) ON transactions FROM authenticated`. `settle_up` é SECURITY DEFINER e continua gravando. Também um trigger que recuse UPDATE de linha de acerto fora do RPC.
- **Dono sugerido:** Estrutura
- **Registros criados pelo teste:** 1 lançamento forjado na família A descartável, removido.

### [MÉDIO] M-3: no diálogo "Editar lançamento", três comboboxes não têm nome acessível e o tipo selecionado não é anunciado
- **Confiança:** CONFIRMADO (árvore de acessibilidade em produção, já com os commits `2996ffa..4c3fd04`)
- **Ambiente:** produção, 1440x900, tema claro
- **Localização:** `C:\dev\financas-a-dois\app\src\components\transacoes\dialogo-editar-lancamento.tsx` (seletores Conta/Categoria/Quem realizou o pagamento; grupo "Tipo")
- **Descrição:** a árvore mostra `combobox [ref=f4e462]` (Conta), `combobox [ref=f4e466]` (Categoria / Conta de destino) e `combobox [ref=f4e470]` (Quem pagou) **sem nome**: o texto visível "Conta" é um `generic` não associado. Os botões "Despesa/Receita/Transferência" não expõem estado `pressed`/`selected`; depois de clicar "Transferência", nenhum aparece como selecionado na árvore.
- **Impacto:** com leitor de tela (TalkBack/VoiceOver no celular), o usuário ouve "caixa de combinação" sem saber de qual campo se trata, nem qual tipo está ativo. WCAG 2.1 AA 1.3.1 e 4.1.2.
- **Reprodução:** abra "Editar" em qualquer lançamento e use `browser_snapshot` com `target role=dialog`.
- **Evidência:** `C:\dev\financas-a-dois\docs\auditoria\evidencias\sentinela-r5-snapshot-dialogo-editar.yml` e `...-dialogo-editar-transferencia.yml`.
- **Recomendação:** `id` no `SelectTrigger` mais `htmlFor` no `Label` (ou `aria-labelledby`). Grupo de tipo como `role="radiogroup"` com `aria-checked`, ou `aria-pressed` nos botões. Verificar se o mesmo padrão existe no diálogo em massa e em `form-lancamento.tsx`; não auditados.
- **Dono sugerido:** Fachada
- **Registros criados pelo teste:** nenhum (o diálogo foi fechado sem salvar; a tentativa com "Transferência" foi barrada no cliente: "Selecione a conta de destino.").

### [BAIXO] B-1: `recurrence_parent_id` é FK simples, sem `family_id`; família A consegue pendurar lançamento num id de B
- **Confiança:** CONFIRMADO
- **Ambiente:** produção (famílias descartáveis)
- **Localização:** `C:\dev\financas-a-dois\app\supabase\migrations\00001_initial_schema.sql:169`. É de antes desta leva, mas é a mesma FK do A-1. Todas as outras FKs de `transactions` são compostas.
- **Descrição/Impacto:** A grava uma linha com `recurrence_parent_id = <id de B>` e o banco aceita, porque a checagem de FK ignora RLS. Isso dá (a) um oráculo de existência: um UUID inexistente devolve `23503`, um existente devolve sucesso; (b) quando B apaga o próprio lançamento, a linha de A some em cascata. Não lê nem apaga dado de B. UUID v4 é inadivinhável, por isso BAIXO.
- **Evidência:** `sentinela-r5-hostil.obs.txt` linhas 28–29: `"serieApontandoParaTxDeB":{"rows":1}`, `"serieApontandoParaIdInexistente":{"code":"23503"}`, `"cascata_cruzada":{"BexcluiuTxB":1,"linhaDeAsobrevive":false}`.
- **Recomendação:** na mesma migration que resolver A-1, trocar por FK composta `(family_id, recurrence_parent_id) → transactions(family_id, id)`. Exige `UNIQUE (family_id, id)` em `transactions`.
- **Dono sugerido:** Estrutura
- **Registros criados pelo teste:** 1 linha na família A descartável, removida.

### [BAIXO] B-2: as views antigas mantêm SELECT para `anon` e INSERT para `authenticated`
- **Confiança:** CONFIRMADO
- **Ambiente:** produção (catálogo e REST com chave anon)
- **Localização:** `v_account_balances`, `v_invoices`, `v_monthly_summary` (00004; fora desta leva). As 3 views novas ou recriadas (`v_settlement`, `v_orcamento_progresso`, `v_patrimonio_mensal`) já estão corretas.
- **Descrição/Impacto:** hoje nada vaza. A chamada anon recebe `401 permission denied for table accounts/transactions`, porque o bloqueio vem das tabelas-base. É defesa em uma camada só: um GRANT futuro em tabela-base para anon expõe as views.
- **Evidência:** `sentinela-r5-catalogo.out.json` (`"anon_select":true,"auth_insert":true` nas 3); `sentinela-r5-hostil.obs.txt` linha 30.
- **Recomendação:** `REVOKE ALL ... FROM anon, authenticated; GRANT SELECT ... TO authenticated`, como a 00010/00013 já fazem.
- **Dono sugerido:** Estrutura
- **Registros criados pelo teste:** nenhum.

### [BAIXO] B-3: `urlDoSite()` com `NEXT_PUBLIC_SITE_URL=""` gera `redirectTo` relativo
- **Confiança:** CONFIRMADO (execução da action com env controlado)
- **Ambiente:** local (vitest)
- **Localização:** `C:\dev\financas-a-dois\app\src\actions\auth.ts:227-232` (`??` não trata string vazia)
- **Evidência:** `sentinela-r5-hostil.obs.txt` linha 32: `{"redirectTo":"/nova-senha"}` no 3º caso.
- **Impacto:** variável criada vazia no painel da Vercel quebra o link sem erro visível. Não reabre o Host Header.
- **Recomendação:** `process.env.NEXT_PUBLIC_SITE_URL?.trim() || ...`, e rejeitar valor que não comece com `https://`.
- **Dono sugerido:** Estrutura
- **Registros criados pelo teste:** nenhum (Auth substituído por um espião; nenhum e-mail enviado).

### [BAIXO] B-4: mensagens de validação duplicadas ou triplicadas
- **Confiança:** CONFIRMADO
- **Ambiente:** produção (banco), actions via vitest
- **Localização:** `C:\dev\financas-a-dois\app\src\lib\esquemas-pagamentos.ts` (`valorDoAcerto` com checks encadeados; `endpoint` com `.max` e `.refine`)
- **Evidência:** `sentinela-r5-hostil.obs.txt` linha 6: `"infinito":{"valor":["Valor inválido.","Esse valor é alto demais.","Use no máximo 2 casas decimais."]}`; linha 20: `"longo":{"endpoint":["Serviço de notificação não reconhecido.","Serviço de notificação não reconhecido."]}`.
- **Recomendação:** o mesmo `superRefine` de mensagem única já usado em `orcamentos.ts`/`esquemas-edicao-lancamento.ts` (L-016 do Estrutura).
- **Dono sugerido:** Estrutura
- **Registros criados pelo teste:** nenhum.

### Qualidade: SUSPEITAS do `code-review` high, não reproduzidas nesta sessão

Vêm de leitura de código, sem execução, e por isso não sustentam veredicto. O que falta para confirmar está ao lado de cada uma.

| # | Severidade se confirmada | Arquivo | Suspeita | Falta para confirmar | Dono |
|---|---|---|---|---|---|
| Q-1 | MÉDIO | `lista-transacoes-interativa.tsx:75` | A seleção (`Set`) sobrevive à troca de mês/página/filtro; ação em lote atinge linhas invisíveis. | Navegador: selecionar, trocar de mês, contar a barra. Interrompido pelo conflito de navegador (P-1). | Fachada |
| Q-2 | MÉDIO | `lista-transacoes-interativa.tsx:275` | A exclusão em lote faz N chamadas sequenciais, ignora as falhas e mostra toast de sucesso com a contagem pedida. Somada ao A-1, gera "N excluídos" falso. | Selecionar parcela 1 e 2 da mesma série e excluir em lote. | Fachada |
| Q-3 | MÉDIO | `dialogo-editar-lancamento.tsx:97`, `dialogo-editar-em-massa.tsx` | O `useEffect` de reset depende de arrays recriados a cada `router.refresh()` do Realtime e apaga o que o usuário está digitando. | Duas sessões: editar enquanto o parceiro lança. | Fachada |
| Q-4 | BAIXO | `ouvinte-realtime.tsx:136` | Um UPDATE (edição) de outro mês mostra "Fulano acabou de lançar…", inclusive para a própria edição. | Duas sessões. | Fachada |
| Q-5 | BAIXO | `ouvinte-realtime.tsx:170` | O canal é recriado a cada refresh; eventos no intervalo se perdem. | Parcelado 6x com Realtime aberto. | Fachada |
| Q-6 | BAIXO | `lista-transacoes-interativa.tsx:155` | A busca numérica ativa com qualquer dígito; `1.234,56` não casa. | Navegador. | Fachada |

Três itens do `code-review` **não entram como achado**: "diálogos fazem `.update()` direto do navegador", "não recalcula fatura" e "lote sobrescreve `paid_date`". Foram **corrigidos em `origin/main` durante a auditoria** (`2996ffa`, `fa94fd1`, `4c3fd04`). Em produção o diálogo já passa pela Server Action: pediu "conta de destino" e recusou no cliente. Essa evidência está em `sentinela-r5-snapshot-dialogo-editar-transferencia.yml`. As regras de servidor dessas actions passaram nos testes 3 e 4 acima.

## Riscos de processo

- **P-1 | ALTO | CONFIRMADO: o navegador Playwright MCP é compartilhado entre agentes concorrentes, e uma senha REAL foi exposta.** Por volta de 13:33Z, outra sessão (não esta) navegou o **mesmo** navegador para `http://localhost:3000/login` e preencheu o e-mail real do Heitor e uma senha. O `browser_snapshot` desta auditoria mostrou a senha em texto claro. O snapshot da outra sessão gravou a senha em disco, numa pasta sincronizada pelo OneDrive: `c:\Users\Heitor PC\OneDrive\Documentos\Segundo cérebro live\.playwright-mcp\page-2026-10-15T13-33-45-569Z.yml`. Não copio o valor para cá.
  - Há também snapshots de outra sessão às 13:24Z/13:25Z, antes da minha primeira navegação.
  - Um `Escape` meu pode ter chegado à página da outra sessão. Nenhum clique meu teve efeito lá: o único falhou ("does not match any elements").
  - Recomendações: **trocar a senha do Heitor**; apagar esse `.yml`; nunca usar credencial real em automação de navegador; não disparar dois agentes com Playwright ao mesmo tempo, ou isolar perfis.
  - O arquivo `page-2026-10-15T13-32-08-452Z.yml` (desta sessão) contém tokens da conta descartável "Atacante R5", que já foi apagada. Pode ser removido.
  - Dono: Heitor e Maestro.
- **P-2 | MÉDIO | CONFIRMADO: o código mudou durante a auditoria.** `origin/main` recebeu 3 commits às 10:30 (`2996ffa..4c3fd04`) enquanto eu auditava o HEAD local `580a506`, e a produção já os servia. Rodei `git fetch origin`, que só atualiza refs remotas, para descobrir isso. A auditoria de código é do `580a506`. Os 3 commits só foram vistos pelo comportamento em produção.
- **P-3 | MÉDIO | CONFIRMADO: `security-review` built-in não roda nesta configuração** (cwd da sessão fora de um repo git). A cobertura veio de `code-review` high mais a varredura manual. Para a próxima auditoria, o Maestro deve abrir a sessão com cwd `C:\dev\financas-a-dois`.
- **P-4 | INFO: o hook de independência está ATIVO.** `C:\Users\Heitor PC\.claude\settings.json` tem `PreToolUse` com matcher `Write|Edit|NotebookEdit`, que chama `hooks/sentinela-independencia.cjs`. Esse script nega fora de `docs/auditoria/`, `docs/planos/` e `.claude/agents/licoes/` quando `agent_type === "sentinela"`. Verificado por leitura do script; não tentei escrever fora dos destinos permitidos, então não houve bloqueio a observar. A recusa do Playwright em salvar captura fora da raiz do workspace é outra trava, do próprio MCP. Por causa dela as capturas foram copiadas para `evidencias/`. `security-guidance` está habilitado (`settings.json:49`), então houve cobertura incremental edit a edit.
- **P-5 | INFO: só existe banco de produção.** Os testes hostis rodaram nele com famílias descartáveis e autorização explícita do Maestro. A limpeza foi comprovada por retrato antes e depois (abaixo).
- **P-7 | INFO: um script de evidência foi editado por outro agente durante a sessão.** `evidencias/sentinela-r5-estado.cjs` foi alterado por outro agente/hook (aparentemente `security-guidance`): o id e o `join_code` da família real saíram do literal e passaram a vir de env var. As saídas `sentinela-r5-estado.*.out.txt` foram geradas pela versão anterior, que tinha esses valores fixos no código. O resultado não muda.
- **P-6 | INFO: a cópia descartável de build** foi criada em `docs/auditoria/evidencias/r5-build-sonda/` com junction para `app/node_modules` (o Turbopack não aceita junction para fora da raiz) e **removida** no fim; o junction foi desfeito antes do `Remove-Item`, e `app/node_modules/next/package.json` continua existindo (`True`). Uma cópia anterior em `%TEMP%` continha `.env.local` e também foi removida (`Test-Path` = `False`).

## Registros criados pelo teste (para conferência do Estrutura; todos já removidos)

| Origem | O que foi criado | Remoção comprovada |
|---|---|---|
| vitest run1 | 3 usuários `sentinela-r5-{a1,a2,b1}-*`, 2 famílias "Sentinela R5 A/B", 10 lançamentos, grupos, orçamentos, 3+1 inscrições push | `LIMPEZA => 10 lançamento(s), 2/2 família(s), 3/3 usuário(s); erros=[]` (`run1.out.txt`) |
| vitest run2 | idem (ids em `sentinela-r5-hostil.obs.txt` linha 34) | idem (`obs.txt` linha 33) |
| redirect-allowlist | 1 usuário `sentinela-r5-redir-*` | `"limpeza":{"deleteUser":"ok","aindaExiste":false}` |
| UI | usuários/famílias "Sentinela R5 UI" e "Sentinela R5 Atacante", 7 lançamentos (3 sumiram no A-1) | `sentinela-r5-ui-setup.limpar.out.txt`: `tx 3, familia 1, usuario removido` (x2) |
| **Retrato final** | `sentinela-r5-estado.antes.out.txt` vs `sentinela-r5-estado.depois.out.txt` | **idênticos**: `auth_users 2`, `families 1`, `transactions 13`, `push_subscriptions 0`, `category_groups 1`, `category_budgets 0`; família real `transactions 13`, `soma_valores 34537221.00`, `max_updated_at 2026-10-15T01:37:51.989353+00:00`, `join_code_inalterado true` |

## Recomendações ao Heitor (fora do fluxo dos agentes)

1. **Trocar a sua senha do app** (P-1) e apagar `...\.playwright-mcp\page-2026-10-15T13-33-45-569Z.yml`.
2. Corrigir a Site URL e as Redirect URLs no painel do Supabase (A-2) e testar a recuperação de ponta a ponta com o seu e-mail.
3. A rotação da chave `service_role` e da senha do banco segue pendente (PROJETO.md §4).
4. O app guarda dinheiro real e dado pessoal de duas pessoas: vale rodar `claude-security` numa **sessão dedicada sua**, com cwd `C:\dev\financas-a-dois`. Não é ferramenta deste auditor.
5. Pedir uma nova rodada do Sentinela, com navegador exclusivo, para o que ficou NÃO AUDITADO: dark mode, 375/768, WCAG de orçamento e notificações, Q-1 a Q-6 e código dos 3 commits novos.

### Auto-Análise
- Passes realizados: 4
- Passes que encontraram erro: 3
- Correções aplicadas:
  - Passe 1: A-1 estava sem crédito → agora creditado ao `code-review`, que apontou primeiro (regra de não duplicação).
  - Passe 1: os itens do `code-review` sobre `.update()` direto apareciam como SUSPEITA → foram retirados da lista, porque a produção já os corrigiu (`2996ffa..4c3fd04`); a razão ficou registrada.
  - Passe 1: o e-mail de confirmação de cadastro estava como parte do A-2 CONFIRMADO → marcado explicitamente como SUSPEITA dentro do achado.
  - Passe 2: P-1 estava como MÉDIO → subiu para ALTO, porque houve senha real em disco sincronizado.
  - Passe 2: faltava declarar o `git fetch` → registrado em P-2.
  - Passe 3: P-4 atribuía ao hook um bloqueio que na verdade era do Playwright MCP → reescrito como verificação por leitura do script.
- Lições novas gravadas em C:/Users/Heitor PC/.claude/agents/licoes/sentinela.md: L-001 (auditar o HEAD local sem antes comparar com o que está em produção), L-002 (usar o navegador Playwright compartilhado sem checar se outra sessão o estava usando)
- Pendências abertas: dark mode e 375/768 não auditados; WCAG de orçamento e notificações; Q-1 a Q-6 não reproduzidas; revisão de código dos commits `2996ffa..4c3fd04`; `security-review` não executável com este cwd; WAF Vercel NÃO AUDITADO (sem CLI autenticado); push com dois aparelhos reais.
