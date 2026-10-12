# Contrato de handoff — rotação do join_code e limite de tentativas

Migrations `00007` e `00008`, aplicadas no banco hospedado (`wxhfgstgjjlmqauogeid`).
Público-alvo deste documento: o agente de front-end que vai construir o botão
"Gerar novo código" em `/ajustes/familia`.

> Foram DUAS migrations, não uma. A `00007` tinha um defeito real (o `RAISE` de
> `join_family` fazia rollback do registro da tentativa, então o rate limit dessa
> porta não existia de fato). A `00008` conserta. Como a `00007` já estava
> aplicada, ela é imutável e a correção veio em arquivo novo.

---

## 1. RPC nova: `rotacionar_join_code`

Troca o código de convite da família de quem chama por um novo, invalidando o
anterior.

```ts
const { data, error } = await supabase.rpc('rotacionar_join_code')
//    data: string | null   ex.: "H73MXV"
//    error: PostgrestError | null
```

| Item | Valor |
|---|---|
| Nome | `rotacionar_join_code` |
| Argumentos | **NENHUM**. Tipo gerado: `Args: Record<PropertyKey, never>` |
| Retorno | `string` — o código novo, 6 caracteres `^[A-Z2-9]{6}$` |
| Tipo gerado | `src/types/database.ts` → `Database['public']['Functions']['rotacionar_join_code']` |
| Exige sessão | SIM. `anon` recebe `42501` (verificado) |
| Quem pode chamar | **qualquer membro** da família (decisão registrada abaixo) |

**Não existe parâmetro `family_id`, e isso é deliberado.** A família sai de
`auth.uid()` dentro da função. Se ela aceitasse `family_id`, qualquer pessoa
autenticada poderia rotacionar o código da casa alheia. Passar um argumento
inventado é recusado com `PGRST202` (verificado).

### Formas de erro de `rotacionar_join_code`

| Situação | `error.code` | `error.message` |
|---|---|---|
| Usuário sem família | `P0001` | `Você não faz parte de uma família` |
| Sem sessão / `anon` | `42501` | `permission denied for function rotacionar_join_code` |
| Sessão expirada no server | — | trate antes, via `supabase.auth.getUser()` |

Sucesso: `error === null` e `data` é a string do código novo. Mostre esse valor
na tela — é o código que o parceiro vai digitar a partir de agora. O código
anterior deixa de funcionar imediatamente.

---

## 2. O limite de tentativas e a forma do erro quando ele estoura

**Política:** 10 tentativas **FALHAS** por janela deslizante de 1 hora, por
usuário. As duas portas (`family_preview` e `join_family`) somam no **mesmo**
contador — alternar entre elas não dobra o orçamento (verificado, caso T2).

Tentativa **bem-sucedida não conta**. Quem digita o código certo nunca é
bloqueado, nem depois de 15 consultas seguidas (verificado, caso T4).

### A forma exata do erro do limite — é esta que o front precisa tratar

```ts
{
  code: 'P0001',
  message: 'Muitas tentativas. Tente de novo em alguns minutos.',
  details: null,
  hint: null,
}
```

Vale para **as duas** RPCs, `join_family` e `family_preview`. A mensagem já está
em português e pode ser exibida ao usuário como veio. Se o projeto tem
`traduzErroDoBanco`, ela passa inalterada.

Sugestão de tratamento: erro de **formulário inteiro** (não de campo) — o
problema não é o valor digitado, é a frequência.

---

## 3. MUDANÇA DE CONTRATO — item BLOQUEANTE para o front

`join_family` **deixou de levantar exceção** quando o código não existe. Agora
ela **devolve zero linhas**, sem erro.

Motivo técnico (não é preferência): o `RAISE EXCEPTION` abortava a transação e
desfazia o `INSERT` da tentativa, então o rate limit dessa porta nunca contava
nada. Medido no banco real: 3 chamadas com código inexistente registraram 0 de 3
tentativas antes da correção; `family_preview`, que retorna normalmente,
registrava 3 de 3.

### O que isso faz no código de hoje

`src/actions/familia.ts`, função `entrarNaFamilia`:

```ts
// linha ~192 — este ramo NÃO é mais alcançado para código errado:
if (error) {
  const mensagem = traduzErroDoBanco(error)
  if (mensagem.startsWith('Código de convite não encontrado')) {
    return falha(mensagem, { codigo: [mensagem] })   // <- destaque do campo
  }
  return falha(mensagem)
}

// linha ~201 — é ESTE ramo que passa a receber o código errado:
const linha = data?.[0]
if (!linha) return falha('Não foi possível entrar na casa. Tente de novo.')
```

**Não quebra** — o usuário recebe uma mensagem de falha. Mas **perde o destaque
no campo do convite** e a mensagem fica genérica.

**Ajuste pedido ao front** (uma linha, em arquivo que não me pertence neste
ciclo):

```ts
const linha = data?.[0]
if (!linha) {
  const msg = 'Código de convite não encontrado'
  return falha(msg, { codigo: [msg] })
}
```

Com isso a UX volta a ser a de antes: campo do convite destacado, mensagem
específica.

---

## 4. Assinaturas que NÃO mudaram

Para não haver dúvida durante a janela entre migration e deploy:

| RPC | Args | Returns | Mudou? |
|---|---|---|---|
| `join_family` | `{ p_join_code: string; p_member_name: string; p_monthly_income?: number }` | `{ family_id: string; member_id: string }[]` | assinatura igual; **comportamento** de código errado mudou (seção 3) |
| `family_preview` | `{ p_join_code: string }` | `{ name: string; member_count: number; member_limit: number; has_room: boolean }[]` | assinatura e comportamento iguais; passou de `LANGUAGE sql` para `plpgsql`, invisível de fora |
| `create_family` | inalterada | inalterada | não |

`family_preview` com código inexistente continua devolvendo **zero linhas**,
como sempre fez. A diferença é que agora a tentativa é contada.

### Erros de `join_family` que continuam sendo exceção

| Situação | `code` | `message` |
|---|---|---|
| Já faz parte de uma família | `P0001` | `Você já faz parte de uma família` |
| Família lotada (código **correto**) | `P0001` | `Esta família já está completa` |
| Limite de tentativas | `P0001` | `Muitas tentativas. Tente de novo em alguns minutos.` |
| Sem sessão | `P0001` | `Você precisa estar logado para entrar em uma família` |

Nenhuma dessas conta como tentativa falha, exceto o próprio estouro do limite —
que não grava nada, só recusa.

---

## 5. Tabela nova: `join_attempts` (o front NUNCA lê)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | `bigint` identity | — |
| `user_id` | `uuid` | FK `auth.users(id)` `ON DELETE CASCADE` |
| `tentou_code` | `text` | o código que falhou (por definição não é de ninguém) |
| `origem` | `text` | `'family_preview'` ou `'join_family'` |
| `tentado_em` | `timestamptz` | default `now()`, **UTC** |

RLS habilitado com **zero policies** — negação total, deliberada. `anon` e
`authenticated` têm `REVOKE ALL` na tabela. Verificado: `SELECT` e `INSERT`
diretos pelos dois roles recebem `42501`.

Por que o usuário não pode ler: saber quantas tentativas restam é metade do
trabalho de contornar o limite. Por que não pode apagar: seria o contorno
inteiro.

Limpeza: `DELETE` oportunista dentro de `registrar_tentativa_join` apaga tudo
com mais de 24h. **Sem `pg_cron`** — nenhuma dependência nova.

---

## 6. Decisão registrada: quem pode rotacionar

**Qualquer membro da família.** Justificativa:

- Não existe conceito de "dono" em `family_members` — não há coluna de role nem
  de criador (conferido em `00001`). Criar essa hierarquia exigiria `ALTER TABLE`
  em tabela com dados reais do cliente, backfill, e uma regra de negócio que
  ninguém pediu.
- Os dois membros já têm poder equivalente sobre a casa: ambos podem renomear a
  família (policy `families_update`) e editar lançamentos. Rotacionar o convite é
  menos destrutivo que renomear a casa.
- Restringir teria custo real de usabilidade: se o celular do "dono" quebrar,
  ninguém mais consegue girar um código vazado.

Quando existir papel de administrador, a checagem entra nessa função — o lugar
já está marcado em comentário no SQL.

---

## 7. Timezone

`join_attempts.tentado_em` é `timestamptz`, gravado em **UTC** por `now()`. A
janela do limite é calculada no banco (`now() - interval '1 hour'`), então o
front não precisa fazer conta de fuso em nenhum momento.
