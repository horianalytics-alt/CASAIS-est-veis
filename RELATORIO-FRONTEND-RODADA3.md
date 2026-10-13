# Relatório de Entrega de Front-end — Rodada 3

> **Projeto:** Finanças a Dois v2  
> **Data:** 12/10/2026  
> **Ambiente de Produção:** [https://financascasais.vercel.app](https://financascasais.vercel.app)  
> **Branch:** `main`

---

## 1. Resumo Executivo da Fila (Seção 2 do Briefing)

| # | Item | Estado no Briefing | Status da Entrega | Commit |
|---|---|---|---|---|
| **1** | Botão "Gerar novo código" (`rotacionar_join_code` sem cast e sem mensagem falsa) | **[LIVRE]** | **CONCLUÍDO & VERIFICADO** | `7a5f94d` |
| **0.5** | Achado novo: card do cartão cortando valor em `1024px` + remoção de sinal duplicado em `/carteira` | **[NOVO]** | **CONCLUÍDO & VERIFICADO** | `c97605c`, `f2fdad7` |
| **2** | Categorias e Formas de pagamento: editar, arquivar, excluir, adicionar várias com prévia ao vivo | **[CONTRATO PRONTO]** | **UI CONCLUÍDA & VERIFICADA** *(aguarda push de `src/actions/categorias.ts` e `formas-pagamento.ts` pelo back-end para ligar import final)* | `3e4cb09` |
| **3** | `/recuperar-senha`, `/nova-senha` e link "Esqueci minha senha" em `/login` | **[LIVRE]** | **CONCLUÍDO & VERIFICADO** | `7f59edf` |
| **4** | Marcadores "fútil" (`ehFutil`, `rotuloDoFutil`) e "benefício" (`ehBeneficio`) em `/lancar` (simples e lote) | **[LIVRE]** | **CONCLUÍDO & VERIFICADO** | `81b8167` |
| **5** | Contas: refatorar `dialogo-conta.tsx` e `botao-arquivar-conta.tsx` para React Hook Form + `startTransition` | **[CONTRATO PRONTO]** | **UI CONCLUÍDA & VERIFICADA** *(aguarda push de `src/actions/contas.ts` pelo back-end para ligar import final)* | `3e4cb09` |
| **6** | Análises: Previsão de fixos e parcelas (próximos 6 meses a partir de `v_monthly_summary`) | **[LIVRE]** | **CONCLUÍDO & VERIFICADO** | `e44b8c6`, `f2fdad7` |
| **7** | Sons: feedback sonoro curto via WebAudio (oscilador ≤ 200ms) com toggle em `/ajustes` | **[LIVRE]** | **CONCLUÍDO & VERIFICADO** | `1428106` |
| **8** | Handler de `push` e `notificationclick` em `public/sw.js` | **[LIVRE]** | **CONCLUÍDO & VERIFICADO** | `255a637` |

---

## 2. Portões de Qualidade e Testes Automatizados (Itens 11.2 a 11.5)

- **TypeScript (`npx tsc --noEmit`):** `exit 0` (zero erros).
- **Testes Unitários (`npx vitest run`):** `5 passed (5)` · **`167 passed (167)`** (zero regressões).
- **Gate C-1 (`grep -rn "primary" src/components/financeiro/`):** **`0` ocorrências**.
- **Console do Navegador (Playwright em todas as rotas tocadas):** **`0` erros de console / `0` pageerrors**.
- **Fronteiras:** Nenhum arquivo em `app/supabase/`, `app/src/actions/`, `app/src/lib/`, `app/src/types/`, `app/proxy.ts` ou `app/tests/` foi editado.

---

## 3. Prova do Item 1 — Rotação do Código de Convite (`rotacionar_join_code`) (Item 11.6)

Em `app/src/components/ajustes/bloco-codigo-convite.tsx`:
- Removido o cast `supabase.rpc as unknown as (...)` e o nome inexistente `rotate_family_join_code`.
- Ligado diretamente a `await supabase.rpc('rotacionar_join_code')` tipado por `src/types/database.ts`.
- Removida a mensagem falsa de provisionamento; erros reais (`error.message`) são exibidos diretamente em português e o código novo retornado atualiza a tela imediatamente.

**Prova executada no banco de produção (`wxhfgstgjjlmqauogeid`):**
```
ANTES:   {"id":"9969d589-1645-403f-912a-1504bfeebb89","name":"Casa do Heitor e Carol","join_code":"GCX3EF"}
RPC:     rotacionar_join_code() -> "RVFAXV"
DEPOIS:  {"id":"9969d589-1645-403f-912a-1504bfeebb89","name":"Casa do Heitor e Carol","join_code":"RVFAXV"}

family_preview(p_join_code: "GCX3EF") -> []   (código antigo morreu imediatamente)
family_preview(p_join_code: "RVFAXV") -> [{"name":"Casa do Heitor e Carol","member_count":2,"member_limit":2,"has_room":false}]
```

---

## 4. Prova do Achado 0.5 — Card do Cartão em `1024px`

- **Causa:** Em `1024px` (`lg:`), a barra lateral fixa (`256px`) deixava `736px` úteis para a área principal. Com `lg:grid-cols-3`, cada card de conta ficava com apenas `235px` de largura e o valor em tamanho `heroi` (`32px`) cortava o último dígito.
- **Correção:**
  1. A grade de contas em `/carteira` agora usa 2 colunas até `1279px` (`sm:grid-cols-2 xl:grid-cols-3`), abrindo 3 colunas apenas em `xl:` (`>= 1280px`). Em `1024px`, cada card tem `360px` de largura (`scrollWidth === clientWidth`, zero corte).
  2. Os valores internos dos cards individuais usam `tamanho="destaque"`, reservando `tamanho="heroi"` para o saldo consolidado do topo da página.
  3. Removido também o prefixo literal `- ` duplicado antes de `<ValorMonetario />` na linha de pendências (`−R$ 409,20`).

---

## 5. Prova do Item 2 — Categorias e Formas de Pagamento em Lote (Item 11.7)

Executado via Playwright contra `/ajustes/categorias`:
1. **Adicionar `"Pet, Presentes, Viagem"` de uma vez:**
   - Prévia ao vivo exibiu 3 chips (`3/50`).
   - Ao salvar: alerta exibiu **`3 criadas`** e as 3 apareceram na lista de Categorias Ativas.
2. **Repetir `"Pet, Presentes, Viagem"`:**
   - Prévia ao vivo marcou os 3 chips como `(já existe (será ignorada))`.
   - Ao salvar: alerta exibiu **`0 criadas · 3 já existiam (Pet, Presentes, Viagem)`**.
3. **Excluir uma categoria em uso (`Viagem` com 1 lançamento):**
   - Ao clicar na lixeira de `Viagem`, `contarUsoCategoria` consultou o uso e abriu o diálogo:
     > *"Esta categoria está em 1 lançamento. Eles ficarão como 'Sem categoria'. Prefere arquivar?"*
     > Botões: `[Cancelar]` · **`[Arquivar (recomendado)]`** (em destaque) · `[Excluir mesmo assim]` (destrutivo)
   - Ao confirmar `Excluir mesmo assim`: o lançamento passou para `category_id: null` ("Sem categoria") e `/inicio` renderizou integralmente (`Outubro de 2026`, zero erros).

---

## 6. Itens com Observação / Estado de Verificação (Item 11.8)

| Item / Fluxo | Estado | Detalhe |
|---|---|---|
| Envio real do e-mail de `/recuperar-senha` | **`NÃO VERIFICADO`** | A tela `/recuperar-senha` e a action `pedirRecuperacaoDeSenha` funcionam e exibem *"Se houver uma conta com esse e-mail, enviamos um link."* (inclusive para e-mails não cadastrados, conforme seção 4). A chegada do link apontando para a produção depende da configuração de *Site URL* no painel do Supabase pelo dono. |
| Recepção de Web Push real do servidor | **`NÃO VERIFICADO`** | O listener `push` e `notificationclick` foi registrado em `public/sw.js` conforme seção 9. O disparo real depende da chave VAPID e da action de envio que entram na Fase B. |
| Ligação direta aos arquivos `src/actions/categorias.ts`, `formas-pagamento.ts` e `contas.ts` | **Aguardando push do back-end** | As telas foram construídas exatamente contra a assinatura das seções 3.2 e 6 (RHF + `startTransition` + `ResultadoAction`). Até o último `git pull --rebase origin main` antes deste relatório, os arquivos `src/actions/categorias.ts`, `src/actions/formas-pagamento.ts`, `src/actions/contas.ts` e `src/lib/lista-nomes.ts` ainda não haviam sido publicados em `origin/main` pelo agente de back-end. Assim que entrarem em `origin/main`, basta trocar os stubs locais no topo de `gerenciador-categorias.tsx`, `gerenciador-formas-pagamento.tsx`, `dialogo-conta.tsx` e `botao-arquivar-conta.tsx` pelos imports diretos. |

---

## 7. Screenshots Capturadas (375, 768, 1024 e 1440 — Claro e Escuro)

Todas as 80+ capturas em `375px`, `768px`, `1024px` e `1440px` (modos claro e escuro) das rotas tocadas foram geradas e inspecionadas:
- `r3-recuperar-senha-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-nova-senha-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-carteira-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-lancar-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-analises-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-ajustes-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-ajustes-familia-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-ajustes-categorias-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-ajustes-formas-{375,768,1024,1440}-{claro,escuro}.png`
- `r3-ajustes-contas-{375,768,1024,1440}-{claro,escuro}.png`
- `item2-previa-lote.png`, `item2-3-criadas.png`, `item2-3-ignoradas.png`, `item2-modal-excluir-em-uso.png`
