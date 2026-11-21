# Auditoria: Carteira de Investimento, rodada 2 (re-auditoria após a 00018 e a rodada 11)

Base: `docs/auditoria/carteira-investimento-sentinela.md` (rodada 1, REPROVADO, achados A1..A9).

## Pré-condições (L-001, L-004)

```
$ git rev-parse --is-inside-work-tree
true
$ git fetch origin && git log --oneline HEAD..origin/main
(vazio)
$ git rev-parse HEAD origin/main
da3aba6272a116f025bde220646ecff8fb18859b
da3aba6272a116f025bde220646ecff8fb18859b
```

- **Commit auditado:** `da3aba6` (HEAD = origin/main). Árvore de trabalho limpa, exceto arquivos não rastreados: `BRIEFING-FRONTEND-RODADA12.md` e esta pasta de evidências.
- **Banco auditado:** produção `wxhfgstgjjlmqauogeid`, com `00016,00017,00018` em `supabase_migrations.schema_migrations`.
  - O corpo das 3 funções no banco é **byte a byte** o do arquivo local da 00018. md5 remoto = md5 local:
    - `carteira_rendimento_calculado`: `4913ad09…`
    - `carteira_criar_caixinha`: `f5ecf053…`
    - `accounts_carteira_congela`: `b03f281f…`
  - Evidências: `estado-catalogo.antes.out.txt` e `md5-local-00018.out.txt`.
- **Hook PreToolUse de independência:** ATIVO. `~/.claude/settings.json` → `PreToolUse` com matcher `Write|Edit|NotebookEdit` aponta para `hooks/sentinela-independencia.cjs`. O script nega Edit/Write de `agent_type === "sentinela"` fora de `/docs/auditoria/`, `/docs/planos/` e `/.claude/agents/licoes/` (lido nesta sessão). Não existe `settings.local.json`.
- **Autorização de banco (L-003), linha do briefing:** "AUTORIZADO pelo Heitor em 2026-11-20 ('pode fazer tudo ai'): ler o banco de PRODUÇÃO e rodar testes hostis SOMENTE dentro de transação SEMPRE desfeita (ROLLBACK)…"
- **Navegador (L-002):** não usado. Ver "Escopo NÃO auditado".

## Resumo Executivo

- **Escopo auditado:**
  - `app/supabase/migrations/00018_carteira_rendimento_saldo_fim_do_mes.sql`, executada no banco de produção em transações sempre desfeitas
  - `app/src/lib/esquemas-investimentos.ts`, executado (sonda Zod)
  - `app/tests/integration/carteira-rls.mjs` e `.sql`, executados (52/52)
  - Componentes de carteira:
    - `app/src/app/(app)/(principal)/carteira/page.tsx`, `area-investimentos.tsx`, `dialogo-aplicar.tsx`, `dialogo-alocar.tsx`, `dialogo-resgatar.tsx`, `dialogo-criar-caixinha.tsx` e `card-caixinha.tsx`: leitura dos diffs e testes unitários
    - `lancar/page.tsx`: só leitura
  - Gráfico de projeção (commit `d0ba90e`):
    - `projecao-caixinha-logica.ts`: executado por sonda tsx
    - `lib/queries/carteira-projecao.ts`: leitura
    - `grafico-projecao-caixinha.tsx` e `analises/grafico-linha.tsx`: leitura e testes jsdom (113/113)
- **Escopo NÃO auditado:**
  - **Deploy na Vercel:** o CLI não está autenticado. Não sei se `NEXT_PUBLIC_FEATURE_INVESTIMENTOS` está definida no projeto Vercel. Ela NÃO está em `app/.env.local` (`grep -l` vazio). A2 está fechado **no código**; o que a produção serve não foi visto.
  - **Playwright (3 breakpoints, dark, a11y, `?aba=investimentos` por URL):** a única forma de entrar é com a conta real da família, o que o briefing proíbe. Não há usuário descartável com sessão de navegador. O gráfico também não está ligado a nenhuma tela.
  - **`Skill(code-review)` nível high:** não rodou. `Desvio: code-review não executado — retomada após interrupção por limite de API; o pedido do Maestro priorizou gravar o relatório. A seção Qualidade fica sustentada por tsc + vitest + leitura.`
  - **`Skill(security-review)`:** foi invocada, mas o diff de trabalho estava **vazio** (HEAD = origin/main, nada pendente), então a skill não teve o que revisar. `Desvio: revisão de segurança manual sobre c9b2f76..da3aba6 no lugar da skill.` A revisão manual não encontrou `dangerouslySetInnerHTML`, `service_role`, `eval` nem SQL dinâmico no escopo (Grep vazio). A query do gráfico usa o cliente da sessão com RLS.
  - **Mutante e concorrência dinâmica:** exigiriam DDL ou chamadas paralelas contra produção.
  - **Se o hook `security-guidance` estava ativo:** não verificado.
  - **Fase:** declarada como `FASE: EXECUÇÃO`, sem caminho de plano `docs/planos/sentinela-*.md`. Executei o checklist (a)–(d) do briefing.
- **Ferramentas que rodaram:**
  - `npx -y supabase@2 db query --db-url` (CLI 2.122.1)
  - Runner do Estrutura com `--sim`
  - Script hostil próprio `sentinela-hostil-r2.sql`
  - `npx tsc --noEmit` (exit 0)
  - vitest em 6 arquivos unitários (113/113), rodado **sem** `.env.local` e com `SUPABASE_*` removidas do ambiente
  - `tsx` em duas sondas: `projecao-caixinha-logica` e o Zod
  - `security-review`, sobre um diff vazio
  - `superpowers:verification-before-completion`
  - Skills Supabase **não** invocadas: `Desvio: critério de RLS/trava aplicado por execução direta, como no r1.`
- **Ambiente:** produção, só em transações desfeitas e só com famílias sintéticas, mais local (jsdom/tsx). Estado depois dos testes (`estado-catalogo.depois.out.txt`):
  - `familias=1`, `carteiras=0`, `caixinhas=0`, `movimentos=0`
  - `usuarios_de_teste_residuais=0`
  - A produção ficou idêntica ao estado anterior.
- **Contagem dos achados abertos:** CRÍTICO 0 | ALTO 0 | MÉDIO 1 | BAIXO 3 (CONFIRMADO 2 | SUSPEITA 2)
- **VEREDICTO: APROVADO COM RESSALVAS** para a 00018 e para a rodada 11 como estão hoje: aba escondida, gráfico desligado. **Não vale para a fiação da Rodada 12**, que continua bloqueada pela ressalva 1 (A3).
  - Este veredicto não é APROVADO pleno, por duas razões:
    - QA visual (breakpoints e dark) e o deploy não foram auditados.
    - O A3 segue aberto.

## Checklist do briefing

| Item | Situação | Confiança | Evidência |
|---|---|---|---|
| (a) A1: rendimento de M sobre o saldo do fim de M | **FECHADO** | CONFIRMADO | `sentinela-hostil-r2.out.txt` H1/H2; runner S08a/S08b/S09 |
| (b) A2: aba some da navegação; `?aba=investimentos` não mostra mock | **FECHADO no código**; deploy NÃO AUDITADO | SUSPEITA (leitura, não executado no browser) | diff `92c0107`, `page.tsx:35,42,172,281` |
| (c) A3: carteira em seletores onde o banco recusa | **ABERTO** | UI SUSPEITA / banco CONFIRMADO | `lancar/page.tsx:38-42`, `carteira/page.tsx:71-77` sem mudança; C13/C15 PASS |
| (c) A4: Aplicar apaga valor/destino ao trocar origem | FECHADO no código | SUSPEITA (sem jsdom próprio nesta rodada) | diff `03a48f7`: reset só na transição false→true |
| (c) A5: conta-carteira arquivável | **FECHADO** | CONFIRMADO | H5: arquivar → 42501; C19 PASS |
| (c) A6: nome invisível/controle na RPC | **FECHADO no que foi pedido**; resíduo novo N1 | CONFIRMADO | H6a/b/f, C20 |
| (c) A7: contrato dos diálogos | **Parcial**: problema 1 fechado (diálogos tratam `{ok:false}`); problema 2 **aberto** | SUSPEITA | `area-investimentos.tsx:89-96` inalterado |
| (c) A8: vencimento diverge do back | **FECHADO** | SUSPEITA (leitura) | diff `862c771`: aceita 2000..2100, igual RPC/Zod |
| (c) A9: runner com falso "rollback falhou" | **FECHADO** | CONFIRMADO | o runner usa agora impressão digital do schema (`carteira-rls.mjs`); execução sem migration saiu `exit=0`, 52/52 |
| (d) achados novos na 00018 | 1 BAIXO (N1) | CONFIRMADO | H6c/H6d + sonda Zod |
| (d) achados novos no gráfico | 0 defeitos; 1 observação | — | `sonda-projecao.out.txt` |

### Prova do A1 (item a)

Cenário S08 reproduzido igual ao r1 (`sentinela-hostil-r2.out.txt`, hoje = 2026-11-20). A caixinha é criada em 2026-08, recebe R$ 1.000 em 05/08 e esse valor sai inteiro em 01/09. A taxa é de 1% ao mês.

```
OBS H1a caixinha zerada no dia 1 de 2026-09: pendentes = 2026-08=1000 | calculado(m1)=0 | calculado(m2)=0
OBS H1b confirmar 2026-09 direto (o ataque do r1) -> Confirme antes o rendimento de 08/2026
OBS H1c confirmar 2026-08 -> ok valor=1000
OBS H1d pendentes depois de confirmar m0 = 2026-09=10,2026-10=10
OBS H1e confirmar 2026-09 -> ok valor=10 | saldo da caixinha=1010
OBS H2 saque de 40000 em 2026-09-15: rendimento confirmado de m1=610 (esperado 1% de 61000=610) | saldo=61610
OBS H4 caixinhas de A com saldo diferente da soma dos movimentos: 0
```

- **No r1:** 2026-09 rendia **1000** sobre o dinheiro já sacado.
- **Agora:**
  - Rende **10**, que é 1% dos R$ 10 de rendimento confirmado que ficaram.
  - O saque parcial no meio do mês reduz a base de M.
  - O invariante "saldo = soma dos movimentos" se mantém.
- O runner do Estrutura passou 52/52 (`carteira-rls-execucao.out.txt`), inclusive C19, C20, R01–R11 e S08a/S08b/S09.

**Risco aceito (não é defeito):** R$ 1.000 que ficam um único dia (de 30/09 para 01/10) rendem o mês inteiro. Evidência: `OBS H3 R$1.000 por 1 dia (2026-09-30 -> 2026-10-01): pendentes = 2026-09=1000`. A regra foi escolhida pelo Heitor e está no cabeçalho da 00018. Fica registrada aqui como risco aceito.

### A2 (item b), o que foi provado e o que não foi

- `page.tsx:35`: `const EXIBIR_ABA_INVESTIMENTOS = process.env.NEXT_PUBLIC_FEATURE_INVESTIMENTOS === 'true'`.
- `page.tsx:42`: `abaAtiva = EXIBIR_ABA_INVESTIMENTOS && params.aba === 'investimentos' ? 'investimentos' : 'contas'`.
- Com o flag desligado:
  - O `TabsList` não é renderizado.
  - O `TabsContent value="investimentos"`, junto com `<AreaInvestimentos>`, não é renderizado.
  - O `?aba=investimentos` cai em `contas`.
- `git grep` confirma que `AreaInvestimentos` só é importada nesse `page.tsx`. Não há outro caminho para o mock.
- O banner "Prévia da Carteira — Dados de Demonstração" existe (`bec0cb5`) e só aparece com o flag ligado.
- **NÃO AUDITADO:**
  - O valor do flag na Vercel.
  - O HTML servido em produção para `/carteira?aba=investimentos`.
  - Por isso a confiança é SUSPEITA: leitura sem execução.

## Achados abertos

### [MÉDIO] A3 — A conta-carteira e as contas não-corrente aparecem como opção onde o banco recusa (herdado, ainda aberto)
- **Confiança:** SUSPEITA no lado da UI (leitura, nenhuma tela executada). O lado do banco foi CONFIRMADO de novo nesta sessão.
- **Ambiente:** leitura + produção (rollback).
- **Localização:** `app/src/app/(app)/(principal)/lancar/page.tsx:38-42` e `app/src/app/(app)/(principal)/carteira/page.tsx:71-77`. `git log` desses arquivos não tem commit da rodada 11.
- **Descrição:**
  - `/lancar` lista todas as contas ativas sem filtro.
  - `contasOrigem` em `/carteira` inclui toda conta que não é cartão, e isso alimenta Aplicar, Resgatar e Pagar fatura.
  - O banco recusa a conta-carteira com 42501 (C13 e C15 PASS em `carteira-rls-execucao.out.txt`), e a tela mostraria "Você não tem permissão para fazer isso.".
- **Impacto:**
  - Hoje é latente: `carteiras=0` em produção e a aba está escondida.
  - Vira defeito visível no instante em que a Rodada 12 ligar a fiação e a carteira existir.
- **Reprodução:** criar a carteira por Aplicar e abrir `/lancar`. A carteira vai aparecer no seletor de conta.
- **Evidência:** trechos de código citados; `carteira-rls-execucao.out.txt` (C11, C13, C15).
- **Recomendação:**
  - Filtrar a conta-carteira (por `investment_wallets`) dos seletores comuns.
  - Em Aplicar e Resgatar, oferecer só `corrente`.
  - Mapear a mensagem da trava.
  - Tudo isso é condição para a Rodada 12.
- **Dono sugerido:** Fachada (seletores) e Estrutura (mensagem).
- **Registros criados pelo teste:** nenhum (rollback).

### [BAIXO] N1 — Nome de caixinha "visualmente vazio" passa na RPC e no Zod (U+2800, acento combinante solto)
- **Confiança:** CONFIRMADO.
- **Ambiente:** produção (rollback) + local (tsx).
- **Localização:**
  - `00018_carteira_rendimento_saldo_fim_do_mes.sql:162-169`: classe de limpeza da RPC.
  - `app/src/lib/esquemas-investimentos.ts`: `DIRECAO_E_CONTROLE` + `limparNome`.
- **Descrição:** a 00018 fechou o A6 nos caracteres listados. Dois casos ainda passam, e os dois produzem um nome que aparece em branco na tela:
  - O Braille em branco (U+2800) não é espaço nem invisível para nenhuma das duas listas.
  - Marcas combinantes soltas (U+0301…) também passam.
  - A RPC e o Zod concordam entre si, então não há divergência, só o resíduo.
- **Evidência:**
  - `sentinela-hostil-r2.out.txt`:
    - `OBS H6c nome so U+2800 (Braille em branco) x3 -> CRIADA nome_hex=e2a080e2a080e2a080 len=3`
    - `OBS H6d nome so U+0301 (acento combinante solto) x5 -> CRIADA nome_hex=cc81cc81cc81cc81cc81 len=5`
  - `sonda-zod-nome.out.txt`: `U+2800 x3 -> ACEITO nome_len=3` / `U+0301 x5 -> ACEITO nome_len=5`
- **Impacto:** é só cosmético. O usuário cria a caixinha por conta própria, dentro da própria família: não há vetor contra terceiros. O resultado é um card com nome em branco.
- **Recomendação:** exigir ao menos um caractere das categorias L ou N (`\p{L}|\p{N}` no Zod; no Postgres, `~ '[[:alnum:]]'`). Correção em migration nova.
- **Dono sugerido:** Estrutura.
- **Registros:** nenhum.

### [BAIXO] A7 (problema 2) — O efeito de `area-investimentos.tsx` reaplica `dadosIniciais` ao trocar a caixinha da projeção (herdado, ainda aberto)
- **Confiança:** SUSPEITA.
- **Ambiente:** leitura.
- **Localização:** `app/src/components/carteira/area-investimentos.tsx:89-96`. As dependências são `[dadosIniciais, caixinhaParaProjecaoId]`, e o efeito chama `setDados(dadosIniciais)`.
- **Descrição:** é o mesmo problema do r1. Depois da fiação, trocar a caixinha da projeção descartaria o estado local atualizado depois de uma Action, caso o componente ainda mantenha estado local.
- **O que falta para confirmar:** a fiação da Rodada 12.
- **Dono sugerido:** Fachada.
- **Registros:** nenhum.

### [BAIXO] Q1 — Import não usado e jargão interno no banner
- **Confiança:** CONFIRMADO para o import (Grep). SUSPEITA para a copy, que não foi vista renderizada.
- **Ambiente:** leitura.
- **Localização:**
  - `dialogo-criar-caixinha.tsx:24`: importa `hojeEmSaoPaulo`, mas o Grep não acha nenhum outro uso no arquivo.
  - `area-investimentos.tsx` (banner de `bec0cb5`): o texto diz "até a integração final na Rodada 12", um termo interno do time mostrado à família.
- **Impacto:** nenhum funcional. Se o flag for ligado antes da fiação, a família lê "Rodada 12".
- **Dono sugerido:** Fachada.
- **Registros:** nenhum.

## Gráfico de projeção (`d0ba90e`): sem defeito encontrado

O gráfico não está ligado a nenhuma tela. `git grep GraficoProjecaoCaixinha` só acha o slot em `area-investimentos.tsx:488-500`.

- **Lógica executada** (`sonda-projecao.out.txt`, alimentada com os mesmos movimentos que o banco gerou em H1):
  - P1:
    ```
    2026-08:101000[c] 2026-09:1010[c] 2026-10:1010(+10 pend)[c] 2026-11:1010[h] 2026-12:1020[s] …
    ```
    O saldo confirmado fecha com o `balance_cents`, e o pendente da 00018 aparece no mês certo.
  - P2: antes de confirmar, 2026-08 mostra `+1000 pend` e o resultado é `sem_simulacao` com saldo zero.
  - P3, fuso: 02:30Z de 01/12 → `2026-11` (São Paulo), correto.
  - P4: movimento duplicado, como numa paginação instável, vira `divergente`, nunca um número errado.
- **Query** (`carteira-projecao.ts`): usa o cliente da sessão com filtro `family_id` e RLS. Pagina até receber uma página vazia, com desempate por `id`, e transforma erro em `{ok:false}`. Uma corrida com confirmação concorrente cai em `divergente` (P4), o que é seguro.
- **Testes:** 113/113 em 6 arquivos (`vitest-unit.out.txt`), inclusive `grafico-projecao-caixinha.test.tsx` e `grafico-linha.test.tsx` em jsdom. `tsc --noEmit` exit 0 (`tsc-noemit.out.txt`).
- **Observação (não é achado):** com taxa de 100% ao mês e o valor máximo do Zod, a projeção chega a ~4,1×10¹³ centavos em 12 meses (P5). Ainda é inteiro seguro e não dá NaN. Como a escala do eixo nesse extremo não foi vista renderizada, isso fica NÃO AUDITADO.

## Riscos de processo

1. **Hook de independência: ATIVO (CONFIRMADO)**, conforme a leitura de `settings.json` e do script. Seguem valendo os riscos que o r1 registrou: casamento por substring, sem cobertura de Bash e `allow()` para os outros agentes. Dono: Heitor.
2. **ALTO/CONFIRMADO: só existe banco de produção.** Todo teste hostil desta rodada rodou contra produção, em transação desfeita, sob autorização escrita. Mutante e concorrência real seguem sem ambiente.
3. **MÉDIO/SUSPEITA: o estado do flag `NEXT_PUBLIC_FEATURE_INVESTIMENTOS` na Vercel é desconhecido.**
   - É inlined no build (prefixo `NEXT_PUBLIC_`). A PROVAR: comportamento de inlining do Next não conferido na doc nesta sessão.
   - Se alguém definir `true` antes da Rodada 12, o mock volta para a família, ainda que agora com o banner.
4. **BAIXO: o runner do Estrutura usa `npx supabase`, que resolve para o CLI 3.2.0.** O briefing pede `supabase@2`. Funcionou com `--db-url` e `--sim`.
5. **NÃO AUDITADO:** se o hook `security-guidance` estava ativo.

## Recomendações ao Heitor

- Antes de ligar a Rodada 12, sessão dedicada de `claude-security`, porque a feature mexe com dinheiro.
- Confirmar na Vercel que `NEXT_PUBLIC_FEATURE_INVESTIMENTOS` não está definida em Production.
- Criar um ambiente de preview ou local com Supabase, para o mutante e para o QA de navegador com usuário descartável.

## Registros criados pelos testes

Nenhum que tenha sobrevivido. Os dois scripts terminam em `RAISE EXCEPTION`, e o estado posterior está igual ao anterior (`estado-catalogo.antes/depois.out.txt`). A transação desfeita criou e descartou duas famílias sintéticas: "Sentinela A" e "Sentinela B", com os join codes QK2357 e QK2358.

## Evidências

Pasta: `C:\Users\Heitor PC\OneDrive\Documentos\SEGUNDO CÉREBRO\HORI ANALYTCIS PROJETOS\Finanças a Dois\docs\auditoria\evidencias\carteira-r2\`

| Arquivo | Conteúdo |
|---|---|
| `estado-catalogo.sql` / `.antes.out.txt` / `.depois.out.txt` | Estado do banco e do catálogo, só leitura |
| `md5-local-00018.out.txt` | md5 dos corpos das funções no arquivo local |
| `carteira-rls-execucao.out.txt` | Runner do Estrutura, 52/52, exit 0 |
| `sentinela-hostil-r2.sql` / `.out.txt` / `.placar.txt` | Script hostil próprio e o placar |
| `sonda-projecao.ts` / `.out.txt` | Sonda da lógica do gráfico |
| `sonda-zod-nome.ts` / `.out.txt` | Sonda do Zod da caixinha |
| `vitest-unit.out.txt`, `tsc-noemit.out.txt` | Testes unitários e compilador |

### Auto-Análise
- Passes realizados: 2
- Passes que encontraram erro: 1
- Correções aplicadas:
  - A sonda do Zod rodou primeiro com a chave errada (`tipo` em vez de `tipoRendimento`). As recusas vinham da chave, e não do nome. Corrigi a sonda, rodei de novo, e só a segunda saída entrou como evidência.
  - O A2 estava redigido como "FECHADO, CONFIRMADO". Virou "FECHADO no código, SUSPEITA", porque foi só leitura e o deploy está NÃO AUDITADO.
  - A A4 e a A8 tinham sido marcadas como fechadas por leitura. Ganharam confiança SUSPEITA explícita.
  - A contagem do resumo foi alinhada com os 4 achados abertos.
- Lições novas gravadas em `C:/Users/Heitor PC/.claude/agents/licoes/sentinela.md`: L-005 (o `security-review` sobre um repositório sem diff pendente revisa vazio; o intervalo de commits tem de ser declarado antes, ou o desvio registrado).
- Pendências abertas:
  - `code-review` high, que não rodou (retomada após o limite de API).
  - QA Playwright em 3 breakpoints, dark e `?aba=investimentos`, por falta de um login descartável.
  - O flag na Vercel, porque o CLI não está autenticado.
  - Mutante e concorrência, por falta de um ambiente fora de produção.
