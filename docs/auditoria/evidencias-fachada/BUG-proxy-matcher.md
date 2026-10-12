# BUG BLOQUEANTE — `proxyConfig.matcher` não é aplicado

> **Quem achou:** Fachada, no passe de navegador de `/login`, 2026-10-11
> **Arquivo defeituoso:** `app/src/proxy.ts` — **fora da minha fronteira** (é do Estrutura, `PLANO.md` §5)
> **Eu NÃO corrigi.** Este documento é o laudo; a correção é do dono do arquivo.

---

## Sintoma

Toda rota que eu construir é servida **sem CSS e sem JavaScript**. O HTML chega
certo, mas o navegador recebe uma página HTML onde esperava `.js` e `.css`.

Console do Playwright em `http://localhost:3000/login`: **16 erros**, todos
`Unexpected token '<'` — assinatura clássica de JS que na verdade é HTML.

Screenshot (375px): `docs/auditoria/evidencias-fachada/fachada-login-375-BUG-proxy.png`
— fonte serifada de fallback, nenhum token do Vitrine aplicado, inputs nativos.
A página está estruturalmente correta e visualmente quebrada.

---

## Causa medida

O `proxy()` roda em **todas** as requisições, inclusive nos estáticos que o
`matcher` deveria excluir, e redireciona cada uma para `/login`.

```
/_next/static/chunks/main-app.js   HTTP 307 -> /login?proximo=%2F_next%2Fstatic%2Fchunks%2Fmain-app.js
/_next/static/chunks/[...].css     HTTP 307 -> /login?proximo=...css
/icons/favicon.svg                 HTTP 307 -> /login?proximo=%2Ficons%2Ffavicon.svg
/og.png                            HTTP 307 -> /login?proximo=%2Fog.png
/favicon.ico                       HTTP 307 -> /login?proximo=%2Ffavicon.ico
```

Os quatro últimos são justamente os assets que o Vitrine entregou e que o P-1
liga no `<head>`: **favicon e OG image estão inacessíveis**.

O log do dev server mostra o proxy executando em cada chunk:

```
GET /login?proximo=%2F_next%2Fstatic%2Fchunks%2Fnode_modules_...js 200 in 428ms
  (next.js: 33ms, proxy.ts: 84ms, application-code: 311ms)
```

### A prova que fecha o diagnóstico

`npx next build` compila sem reclamar e lista `ƒ Proxy (Middleware)`, mas o
manifest sai **vazio**:

```
.next/server/middleware-manifest.json
  middleware       -> []        <-- vazio
  sortedMiddleware -> []        <-- vazio
  functions        -> []
  grep '"matchers"' -> NENHUM matcher gravado
```

Ou seja: **nenhum matcher é registrado**. Sem matcher registrado, não há filtro,
e o proxy intercepta tudo. O regex em si está correto quando testado isolado em
Node (`node -e` com o mesmo padrão exclui `/_next/static/...` e `/og.png`
corretamente) — o problema é o matcher não chegar ao runtime, não o conteúdo dele.

---

## Hipóteses para o dono do arquivo investigar

Não testei nenhuma delas a fundo, porque corrigir é dele:

1. **Localização.** O arquivo está em `app/src/proxy.ts`. A referência oficial
   que eu tenho (`vercel:nextjs`, `references/file-conventions.md`) mostra o
   exemplo como `proxy.ts` **na raiz do projeto**. Vale conferir se, nesta
   versão, `src/proxy.ts` é reconhecido para **executar** (está executando) mas
   não para **ler o `proxyConfig`**.
2. **Sintaxe do matcher.** O padrão usa `(?:...)` com `$` dentro de um
   lookahead negativo. O matcher do Next passa por um parser próprio
   (path-to-regexp), que não aceita todo regex de JS. Um matcher mais simples
   (sem `(?:...)` e sem `$`) distinguiria as duas hipóteses rapidamente.
3. **Nome do export.** `export const proxyConfig` está correto para v16 pela
   referência, e o build aceita — mas o manifest vazio sugere que algo na
   coleta da config não está casando.

---

## Impacto enquanto não for corrigido

- **Bloqueia a verificação visual de TODAS as telas.** Não consigo validar
  breakpoint, dark mode, contraste, alvo de toque nem foco: nada disso existe
  sem CSS. Qualquer screenshot que eu tirar agora mede o bug, não o meu trabalho.
- **Bloqueia a verificação funcional.** Sem JS não há hidratação, então
  `useActionState` não roda: o formulário de login não envia, e não dá para
  testar mensagem de erro do Zod nem o estado de carregando.
- **Quebra os assets do Vitrine** (favicon, OG) que o P-1 acabou de ligar.
- O HTML, a árvore de acessibilidade e o `tsc` continuam corretos — o defeito é
  de entrega de asset, não das minhas telas.

## O que já está provado do meu lado, apesar do bug

- `npx tsc --noEmit` → exit 0
- `lang="pt-BR"`, `<title>Entrar</title>`, metadata P-1 completa no HTML servido
  (favicon.svg, favicon.ico, apple-touch, og.png com `alt`, as duas variantes de
  `theme-color`), e "Create Next App" não aparece mais
- Árvore de acessibilidade correta: `h1` → `h2`, os dois campos com nome
  acessível ("E-mail", "Senha"), botão "Entrar" e link "Criar conta" nomeados
- Meu próprio erro de prerender (`searchParams` fora de `<Suspense>`) foi
  corrigido e não reaparece após o marcador no log
