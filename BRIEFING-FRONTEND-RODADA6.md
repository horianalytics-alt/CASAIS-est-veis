# Briefing Rodada 6 — Push real no celular

O back-end do push real já está publicado e verificado em produção
(commit `0609e05`). As chaves VAPID já estão configuradas na Vercel pelo
Heitor. Esta rodada é: (1) trocar as duas chamadas diretas de RPC que hoje
saem do navegador por Server Actions, e (2) construir o botão "Ativar
notificações".

## Por que isso importa

Hoje `dialogo-pagar-fatura.tsx` e `dialogo-acertar.tsx` chamam
`supabase.rpc('pay_invoice', ...)` e `supabase.rpc('settle_up', ...)`
**direto do navegador**, sem passar por nenhuma Server Action. Isso significa
que pagar fatura e acertar contas nunca disparam notificação push para o
parceiro, nunca têm validação Zod, e o erro que chega à tela não segue o
contrato `ResultadoAction<T>` do resto do app.

## 1. Trocar `dialogo-pagar-fatura.tsx`

**Arquivo:** `app/src/components/carteira/dialogo-pagar-fatura.tsx`, linha ~84.

**Hoje:**
```ts
const { error: erroRpc } = await supabase.rpc('pay_invoice', {
  p_card_account_id: ...,
  p_from_account_id: ...,
  p_invoice_year: ...,
  p_invoice_month: ...,
  p_date: ...,
})
```

**Troca para:**
```ts
import { pagarFatura } from '@/actions/fatura'

// dentro do handler, com useTransition como já é o padrão do projeto:
const resposta = await pagarFatura({
  cartaoId: ...,      // era p_card_account_id
  contaOrigemId: ...,  // era p_from_account_id
  anoFatura: ...,       // era p_invoice_year
  mesFatura: ...,       // era p_invoice_month
  data: ...,             // era p_date
})
if (resposta.ok) {
  // resposta.dados.pagamentoId disponível se precisar
} else {
  // resposta.erro (string) e resposta.camposComErro (por campo) — mesmo
  // contrato que o resto do app já usa
}
```

Assinatura completa:
```ts
pagarFatura(input: {
  cartaoId: string      // uuid
  contaOrigemId: string // uuid
  anoFatura: number     // 2000-2100
  mesFatura: number     // 1-12
  data: string          // YYYY-MM-DD
}): Promise<ResultadoAction<{ pagamentoId: string }>>
```

Mensagens de erro possíveis (iguais às que a RPC já lançava, agora também
vêm por `camposComErro` quando o campo é identificável):
- `'Cartão não encontrado nesta família'` → `camposComErro.cartaoId`
- `'Conta de origem inválida'` → `camposComErro.contaOrigemId`
- Validação Zod (data inválida, ano/mês fora do intervalo) → mensagens em
  português, por campo.

## 2. Trocar `dialogo-acertar.tsx`

**Arquivo:** `app/src/components/acerto/dialogo-acertar.tsx`, linha ~55.

**Hoje:**
```ts
const { error: erroRpc } = await supabase.rpc('settle_up', {
  p_from_member_id: ...,
  p_to_member_id: ...,
  p_amount: ...,
  p_date: ...,
})
```

**Troca para:**
```ts
import { registrarAcerto } from '@/actions/acerto'

const resposta = await registrarAcerto({
  deMembroId: ...,   // era p_from_member_id — quem PAGA
  paraMembroId: ..., // era p_to_member_id — quem RECEBE
  valor: ...,          // era p_amount — NÚMERO, não string (ver nota abaixo)
  data: ...,             // era p_date
})
```

Assinatura completa:
```ts
registrarAcerto(input: {
  deMembroId: string   // uuid, quem paga
  paraMembroId: string // uuid, quem recebe
  valor: number        // reais, só 2 casas decimais
  data: string          // YYYY-MM-DD
}): Promise<ResultadoAction<{ acertoId: string }>>
```

**Atenção ao campo `valor`:** é `number`, não aceita mais de 2 casas
decimais — se vier com mais, a validação RECUSA (não arredonda; arredondar
float em dinheiro foi um bug real já corrigido no projeto, P-009). Isso
deve ser transparente, já que o diálogo manda o saldo que veio de
`v_settlement`, que o banco já entrega com `round(..., 2)`.

**Não inverta `deMembroId`/`paraMembroId`** — o mapeamento é fixo (de =
quem paga, para = quem recebe). Trocar os dois inverteria a dívida em vez
de quitá-la.

Mensagens de erro possíveis:
- `'Membro não encontrado nesta família'` → `camposComErro.deMembroId` ou
  `camposComErro.paraMembroId`.
- `'O acerto precisa ser entre duas pessoas diferentes'` →
  `camposComErro.paraMembroId`.
- Validação Zod (valor ≤ 0, mais de 2 casas, data inválida).

## 3. Botão "Ativar notificações"

O `public/sw.js` já tem o handler de `push` e `notificationclick` prontos
(Rodada 3) — você só precisa do lado do app que pede permissão e registra
o aparelho.

**Novo componente** (sugestão de local: `src/components/ajustes/` ou
`src/components/inicio/`, você decide onde faz mais sentido na navegação —
Ajustes > Perfil parece natural, mas fique à vontade).

Fluxo:
1. Checar se o navegador suporta (`'serviceWorker' in navigator && 'PushManager' in window`) — se não, não mostrar o botão ou mostrar desabilitado com explicação.
2. No clique, pedir permissão (`Notification.requestPermission()`).
3. Se concedida, pegar o service worker registrado e inscrever:
   ```ts
   const registro = await navigator.serviceWorker.ready
   const inscricao = await registro.pushManager.subscribe({
     userVisibleOnly: true,
     applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
   })
   ```
   (a função `urlBase64ToUint8Array` é um helper padrão para converter a
   chave pública VAPID base64url em `Uint8Array` — provavelmente não existe
   ainda no projeto, precisa criar; é um helper puro, pode ir em
   `src/lib/push-cliente.ts` ou nome parecido).
4. Mandar o resultado de `inscricao.toJSON()` para a Server Action:
   ```ts
   import { salvarInscricaoPush } from '@/actions/push'
   const resposta = await salvarInscricaoPush(inscricao.toJSON())
   ```
   O formato de `PushSubscription.toJSON()` já bate com o que a action
   espera (`{ endpoint, keys: { p256dh, auth }, expirationTime }`).
5. Para desativar: `inscricao.unsubscribe()` no navegador, e chamar
   `removerInscricaoPush({ endpoint: inscricao.endpoint })`.

Assinaturas:
```ts
salvarInscricaoPush(input: {
  endpoint: string
  keys: { p256dh: string; auth: string }
  expirationTime?: number | null
}): Promise<ResultadoAction<void>>

removerInscricaoPush(input: { endpoint: string }): Promise<ResultadoAction<void>>
```

Ambas idempotentes — pode chamar de novo sem medo de duplicar ou dar erro
estranho.

**Estado da UI:** cheque se já existe uma inscrição ativa (ex.: guardando
em `localStorage` se o endpoint atual já foi registrado, ou lendo
`registro.pushManager.getSubscription()` no mount) para mostrar
"Notificações ativadas" vs. o botão de ativar.

## O que a notificação diz

O texto NÃO leva valor monetário (decisão de privacidade): algo como
"Carol registrou um lançamento" / "Carol pagou a fatura do Nubank" /
"Carol registrou um acerto de contas". Você não precisa escrever esse
texto — ele já é montado no back-end (`src/lib/push/notificar.ts`). Só
precisa garantir que o `notificationclick` do `sw.js` (já existe) leva
para uma rota sensata (`/inicio` ou `/acerto`, como já deve estar).

## O que NÃO fazer nesta rodada

- Não toque em `src/actions/`, `src/lib/supabase/servico.ts`,
  `src/lib/push/notificar.ts` — já estão prontos e testados.
- Não precisa reescrever o `sw.js` — o handler de push já existe.
- Não mude o texto da notificação no back-end.

## Verificação esperada

- `npx tsc --noEmit` limpo, `next build` ok.
- Teste manual com DUAS sessões reais (Heitor e Carol, como já foi feito
  para o Realtime): ativar notificação nos dois aparelhos/navegadores,
  pagar uma fatura ou registrar um acerto de um lado, confirmar que o
  OUTRO recebe a notificação — e que QUEM FEZ A AÇÃO não recebe a própria.
- Testar em navegador que recusa a permissão (deve degradar bem, sem
  quebrar a tela).
- Screenshots do botão nos 3 breakpoints + dark + console limpo.
- Commit por arquivo, `git pull --rebase origin main` antes do push.

Qualquer dúvida sobre o contrato das actions, a fonte é
`app/src/actions/fatura.ts`, `app/src/actions/acerto.ts` e
`app/src/actions/push.ts` (código real, já publicado).
