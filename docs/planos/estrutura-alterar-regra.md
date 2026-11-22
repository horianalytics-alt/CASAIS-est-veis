# Plano do Estrutura: alterar a regra de uma assinatura (migration 00021)

> FASE: PLANO. Nenhum código de produção foi escrito. Data: 2026-11-21.
> Governa: briefing do Maestro (manutenção, sem PLANO.md). Base: `00019_recorrencia.sql` aplicada.
> Tudo o que este plano afirma sobre o código existente traz o arquivo:linha lido nesta sessão.
> O que eu não medi está marcado **A PROVAR**.

---

## 0. Resumo

- **RPC nova:** `public.recorrencia_alterar_regra(p_regra_id uuid, p_campos jsonb, p_a_partir date)`.
  É SECURITY DEFINER, `search_path = ''`, e o escopo é UMA regra (L-033). Aplica um patch parcial
  com lista fechada de 12 chaves na regra e nos lançamentos **pendentes** da regra com
  `recurring_period >= p_a_partir`.
- **Action nova:** `alterarRegra(input: EntradaAlterarRegra)` em `app/src/actions/recorrencia.ts`.
- **Esquema novo:** `esquemaAlterarRegra` em `app/src/lib/esquemas-recorrencia.ts`.
- **`app.recorrencia_rpc`: NÃO é ligada.** Nenhuma coluna que a RPC grava está na lista do trigger
  (§5).
- **Três perguntas bloqueantes** (§11): (1) os meses que o usuário editou à mão são sobrescritos?
  (2) pendentes atrasados de meses anteriores entram? (3) o retorno é `jsonb` ou `TABLE`?
- **Autorização de banco** para o runner e para o `db push` (§11, item 4). Só existe produção.

---

## 1. Arquivos a criar e a alterar

| Ação | Caminho |
|---|---|
| criar | `app/supabase/migrations/00021_recorrencia_alterar_regra.sql` |
| alterar | `app/src/lib/esquemas-recorrencia.ts`: `esquemaAlterarRegra`, `EntradaAlterarRegra`, `CamposDaRegraParseados` |
| alterar | `app/src/actions/recorrencia.ts`: `alterarRegra` + reexportar o tipo |
| alterar | `app/src/actions/resultado.ts`: mensagens novas em `MENSAGENS_DE_NEGOCIO` (§4.4) |
| regenerar | `app/src/types/database.ts` (`npx supabase gen types`, ÚLTIMO passo do ciclo, no mesmo commit) |
| criar | `app/tests/integration/recorrencia-alterar-regra.sql` (teste em transação desfeita) |
| criar | `app/tests/integration/recorrencia-alterar-regra.mjs` (runner: cópia de `recorrencia-rls.mjs` trocando o arquivo de teste e o prefixo do placar) |
| criar | `app/tests/integration/recorrencia-alterar-regra-mutante.sql` |
| alterar | `app/tests/unit/esquemas-recorrencia.test.ts` (casos do esquema novo) |

Não muda: nenhuma tabela, nenhuma policy, nenhuma função existente. O runner existente
`recorrencia-rls.mjs` fica como está: o placar dele é fixo em `PLACAR recorrencia-rls`
(`recorrencia-rls.mjs`, regex do placar) e o arquivo de teste também
(`const teste = resolve(import.meta.dirname, 'recorrencia-rls.sql')`). Por isso o runner novo é uma
cópia, que é o mesmo arranjo que `recorrencia-rls.mjs` declara ter seguido ("Cópia de
carteira-rls.mjs").

---

## 2. Evidência do código existente (lida nesta sessão)

| Fato | Fonte |
|---|---|
| Migrations no disco vão de 00001 a 00020. Não existe 00021 | `ls app/supabase/migrations` (00001_initial_schema.sql … 00020_saldo_pendente_do_mes.sql) |
| `recorrencia_alterar_valor` aceita `p_a_partir` só se `>= start_period`, `>= mês atual` e `<= limite + 1 mês`. Chama `recorrencia_gerar(v_family, v_alvo)` **sem** `p_regra`, ou seja, com escopo de família | 00019:648-654 |
| `recorrencia_alterar_valor` e `recorrencia_encerrar` não ligam `app.recorrencia_rpc` | 00019:656-663, 703-710 (nenhum `set_config`) |
| O gerador liga e desliga a chave em volta do próprio INSERT | 00019:283 e 322 |
| Fatura do cartão: dia menor que o fechamento cai na fatura do mês; senão, na do mês seguinte | 00019:287-294; mesma regra em `esquemas-edicao-lancamento.ts:178-185` (`faturaPara`) |
| A edição em massa recalcula a fatura só quando a conta MUDA e usa a data da própria linha | `esquemas-edicao-lancamento.ts:287-290` |
| Trigger da carteira: um UPDATE que muda `amount`/`account_id` passa a conferir se a conta antiga ou a nova é carteira, e recusa com 42501 se for | 00016:914-950 (early-return em 927-935; mensagem em 947) |
| Trigger do acerto: só dispara com `settlement_to_member_id` não nulo | 00015:127-137 |
| CHECKs de `transactions` | 00001:141, 142, 150, 195-221; 00010:73 (`tx_acerto_so_em_transferencia`); 00019:142-155 |
| CHECKs de `recurring_rules` | 00019:52-100 |
| Padrão de patch "undefined = não mexe, null = limpar" | `esquemas-edicao-lancamento.ts:145-155` (`categoriaId: uuid.nullable().optional()` + refine "nenhum campo") |
| Rótulo do fútil exige `ehFutil === true` no MESMO pedido | `esquemas-edicao-lancamento.ts:120-123` |
| `ResultadoAction`, `falha`, `falhaDeValidacao` | `actions/resultado.ts:82-117`; `traduzErroDoBanco` e a lista branca `MENSAGENS_DE_NEGOCIO` vêm depois, no mesmo arquivo |
| A família é resolvida no servidor por `getUser()` + `get_user_family_id_self` | `actions/contexto-familia.ts` (todo o arquivo) |
| A UI atual de "alterar valor" chama `alterarValorRecorrencia` | `components/recorrencia/lista-assinaturas.tsx:17, 99-102` |

---

## 3. A RPC: `public.recorrencia_alterar_regra`

### 3.1 Assinatura

```sql
CREATE OR REPLACE FUNCTION public.recorrencia_alterar_regra(
  p_regra_id  uuid,
  p_campos    jsonb,
  p_a_partir  date
)
RETURNS TABLE (alterados_na_regra int, alterados_em_transacoes int)   -- ver pergunta 3 (§11)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
```

Grants (mesmo arranjo de 00019:716-725):
`REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`

**Por que SECURITY DEFINER:** `recurring_rules` não tem grant de escrita para `authenticated`
(00019:120-121). A autorização é o filtro `family_id = v_family` dentro de CADA instrução, com
`v_family` vindo de `get_user_family_id_self()`, que lê `auth.uid()`. É o mesmo arranjo das outras
RPCs `recorrencia_*`. A referência `security-rls-performance.md` da skill de Postgres diz, sobre
funções DEFINER: "Always include an explicit `auth.uid()` check inside the function body, ... and
revoke `EXECUTE` from any role that shouldn't call them directly". Fica cumprido pelo
`get_user_family_id_self()` + REVOKE de anon.

### 3.2 Chaves aceitas em `p_campos` (lista fechada)

| Chave jsonb | Tipo jsonb exigido | Nulo permitido | Coluna (regra e lançamento) |
|---|---|---|---|
| `description` | string | não | `description` (gravada com `btrim`) |
| `amount` | number | não | `amount` |
| `account_id` | string (uuid) | não | `account_id` (+ `invoice_year/month` nos lançamentos) |
| `category_id` | string (uuid) | sim | `category_id` |
| `payment_method_id` | string (uuid) | sim | `payment_method_id` |
| `owner_member_id` | string (uuid) | sim | `owner_member_id` (par com `owner_share`) |
| `owner_share` | number | sim | `owner_share` (par com `owner_member_id`) |
| `paid_by_member_id` | string (uuid) | não | `paid_by_member_id` |
| `notes` | string | sim | `notes` |
| `is_benefit` | boolean | não | `is_benefit` |
| `is_futile` | boolean | não | `is_futile` (par com `futile_label`) |
| `futile_label` | string | sim | `futile_label` (par com `is_futile`) |

"Presente" = `p_campos ? 'chave'`, mesmo com valor JSON `null`. Chave ausente = não mexe.
Qualquer outra chave (`family_id`, `type`, `recurring_period`, `generated_through`,
`created_by_member_id`, `day_of_month`, ...) é recusada inteira, sem gravar nada.

### 3.3 Corpo (pseudo-SQL, na ordem em que roda)

Toda recusa vem antes da primeira escrita (L-005). A única escrita antes de uma recusa possível é
a do passo 9 (gerador). Ela é desfeita junto pelo RAISE, e é isso que se quer: nenhuma linha
precisa sobreviver à recusa. Ver §3.4.

```
 1. v_family := public.get_user_family_id_self();
    IF v_family IS NULL → RAISE 'Você não faz parte de nenhuma família'
 2. IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' OR p_campos = '{}'::jsonb
      → RAISE 'Nada para alterar'
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_campos) k WHERE k NOT IN (<12 chaves>))
      → RAISE 'Campo não permitido'
 3. IF p_a_partir IS NULL OR p_a_partir <> date_trunc('month', p_a_partir)::date → RAISE 'Mês inválido'
 4. Tipo jsonb de cada chave presente confere com §3.2, senão 'Campo inválido'.
    Nulo em chave que não aceita nulo → 'Campo obrigatório vazio'.
    description: btrim vazio → 'Descreva o lançamento'
    amount: <= 0, > 99999999.99 ou <> round(.,2) → 'Valor inválido'   (mesma regra de 00019:629)
    owner_share: fora de [0,1] → 'Cota inválida'
 5. pg_advisory_xact_lock(hashtextextended('recorrencia:' || v_family, 0))   -- mesma chave de 00019:636
 6. SELECT * INTO v_rr FROM recurring_rules WHERE id = p_regra_id AND family_id = v_family FOR UPDATE;
    NOT FOUND → RAISE 'Assinatura não encontrada'
 7. v_novo := v_rr com o patch aplicado. Normalização (pares):
      a. owner_member_id presente e nulo, owner_share AUSENTE → v_novo.owner_share := NULL
      b. is_futile presente e false, futile_label AUSENTE      → v_novo.futile_label := NULL
    Validação do resultado (os CHECKs, com mensagem amigável):
      v_novo.owner_share IS NOT NULL AND v_novo.owner_member_id IS NULL → 'Escolha de quem é a cota'
      v_novo.futile_label IS NOT NULL AND NOT v_novo.is_futile          → 'Marque como fútil para usar o rótulo'
      v_rr.type <> 'despesa' AND ((p_campos ? 'is_benefit' AND v_novo.is_benefit)
                                OR (p_campos ? 'is_futile' AND v_novo.is_futile)) → 'Benefício e fútil só valem para saída'
        (só o que o PATCH liga. recorrencia_criar não barra benefício em receita (00019:465-467):
         pode existir regra de receita com is_benefit = true, e checar o resultado inteiro
         recusaria até uma troca de descrição dessa regra)
 8. Referências (só as presentes), todas com family_id = v_family:
      account_id: SELECT type, archived_at, closing_day FROM accounts WHERE id = ? AND family_id = v_family
        NOT FOUND → 'Conta não encontrada nesta família'
        é carteira (investment_wallets) → 'A carteira de investimento não aceita recorrência'
        archived_at NOT NULL → 'Esta conta está arquivada'
        type = 'cartao' AND v_rr.type = 'receita' → 'Receita recorrente não pode ser no cartão'
      owner_member_id (não nulo): family_members → 'Responsável não encontrado nesta família'
      paid_by_member_id:          family_members → 'Quem paga não foi encontrado nesta família'
      category_id (não nulo):     categories     → 'Categoria não encontrada nesta família'
      payment_method_id (não nulo): payment_methods → 'Forma de pagamento não encontrada nesta família'
 9. v_alvo := date_trunc('month', carteira_hoje()) + 11 meses
    PERFORM public.recorrencia_gerar(v_family, v_alvo, v_rr.id);   -- 3º argumento: SÓ esta regra (L-033)
    SELECT generated_through INTO v_gt FROM recurring_rules WHERE id = v_rr.id;   -- relido depois de gerar
10. Janela: IF p_a_partir < v_rr.start_period
              OR p_a_partir < date_trunc('month', carteira_hoje())::date      -- ver pergunta 2
              OR p_a_partir > v_gt + 1 mês
           → RAISE 'Mês inválido'
11. UPDATE recurring_rules SET <as 12 colunas = v_novo.*> WHERE id = v_rr.id AND family_id = v_family;
    GET DIAGNOSTICS v_r = ROW_COUNT;
12. UPDATE transactions t SET
      description       = CASE WHEN p_campos ? 'description'       THEN v_novo.description       ELSE t.description END,
      amount            = CASE WHEN p_campos ? 'amount'            THEN v_novo.amount            ELSE t.amount END,
      account_id        = CASE WHEN p_campos ? 'account_id'        THEN v_novo.account_id        ELSE t.account_id END,
      invoice_year/month = CASE WHEN p_campos ? 'account_id' AND t.account_id IS DISTINCT FROM v_novo.account_id
                              THEN <fatura de t.date com v_closing_day da conta nova; NULL,NULL se não for cartão>
                              ELSE t.invoice_year/month END,
      category_id, payment_method_id, paid_by_member_id, notes, is_benefit: CASE WHEN presente ...
      owner_member_id, owner_share: os DOIS = v_novo.* quando 'owner_member_id' OU 'owner_share' estiver presente
      is_futile, futile_label:      os DOIS = v_novo.* quando 'is_futile' OU 'futile_label' estiver presente
    WHERE t.family_id = v_family
      AND t.recurring_rule_id = v_rr.id
      AND t.recurring_period >= p_a_partir
      AND t.is_paid = false;
    GET DIAGNOSTICS v_t = ROW_COUNT;
13. RETURN QUERY SELECT v_r, v_t;
```

A fatura usa a mesma regra de 00019:287-294: `dia < closing_day` cai na fatura do mês; senão, na
do mês seguinte. O dia vem de `t.date`, a data da própria linha, que pode ter sido editada à mão.
É o arranjo de `faturaPara(contaNova.closing_day, linha.date)` em
`esquemas-edicao-lancamento.ts:289`.

### 3.4 Por que o gerador roda antes, e por que a janela é conferida depois dele

- **Antes:** se `p_a_partir` cair num mês além do último gerado, os meses entre
  `generated_through + 1` e `p_a_partir - 1` nasceriam DEPOIS, já com os valores novos. O pedido
  "a partir de M" não seria cumprido. Gerar primeiro faz esses meses existirem com os valores
  antigos. Esse é o mesmo motivo de 00019:643-654.
- **Escopo da regra:** `recorrencia_alterar_valor` chama o gerador com escopo de família
  (00019:654). Aqui passo `p_regra = v_rr.id`, como a L-033 manda. O caso A17 (§7) conta as linhas
  das OUTRAS regras.
- **Janela depois do gerador:** `recorrencia_alterar_valor` PREVÊ o limite (00019:644-645). Com a
  conta arquivada essa previsão erra, porque o gerador só avança até o mês atual (00019:273-276 e
  324-329), e o limite previsto passa a deixar `p_a_partir` além do que existe. Relendo
  `generated_through` depois de gerar, o limite é o real. O RAISE da janela desfaz também as
  linhas geradas no passo 9. Isso não viola a L-005: a lição trata de uma escrita que PRECISA
  sobreviver à recusa (auditoria/contador), e aqui nenhuma precisa.

---

## 4. Contrato TypeScript

### 4.1 Esquema Zod (`app/src/lib/esquemas-recorrencia.ts`)

```ts
const textoOpcional = (max: number, msg: string) =>
  z.string({ invalid_type_error: 'Texto inválido.' }).trim().max(max, msg).nullish()
   // undefined = não mexe; '' ou só espaços = null (apaga)
   .transform((t) => (t === undefined ? undefined : t ? t : null))

export const esquemaAlterarRegra = z
  .object({
    regraId: uuid,
    /** 'YYYY-MM': só os pendentes deste mês em diante. */
    aPartirDe: mesISO,
    descricao: z.string({ invalid_type_error: 'Descreva o lançamento.' })
      .trim().min(1, 'Descreva o lançamento.').max(120, 'A descrição pode ter no máximo 120 caracteres.')
      .optional(),
    valor: valorEmReais.optional(),
    contaId: uuid.optional(),
    categoriaId: uuid.nullable().optional(),
    formaDePagamentoId: uuid.nullable().optional(),
    responsavelId: uuid.nullable().optional(),
    cotaDoResponsavel: z.number({ invalid_type_error: 'A cota vai de 0 a 1.' })
      .min(0, 'A cota vai de 0 a 1.').max(1, 'A cota vai de 0 a 1.').nullable().optional(),
    pagoPorId: uuid.optional(),
    observacao: textoOpcional(500, 'Observação longa demais.'),
    ehBeneficio: z.boolean({ invalid_type_error: 'Informe se foi pago com benefício.' }).optional(),
    ehFutil: z.boolean({ invalid_type_error: 'Informe se é um gasto fútil.' }).optional(),
    rotuloDoFutil: textoOpcional(60, 'Use no máximo 60 caracteres.'),
  })
  .refine((e) => CAMPOS_DA_REGRA.some((c) => e[c] !== undefined), {
    message: 'Escolha ao menos um campo para alterar.', path: ['formulario'],
  })
  // rr_cota_exige_responsavel: cota com responsável explicitamente apagado no mesmo pedido.
  .refine((e) => e.cotaDoResponsavel == null || e.responsavelId !== null, {
    message: 'Escolha de quem é a cota.', path: ['responsavelId'],
  })
  // rr_rotulo_exige_futil: mesmo arranjo de esquemas-edicao-lancamento.ts:120-123.
  .refine((e) => e.rotuloDoFutil == null || e.ehFutil === true, {
    message: 'Marque como fútil para usar o rótulo.', path: ['rotuloDoFutil'],
  })

export type EntradaAlterarRegra = z.input<typeof esquemaAlterarRegra>
export type AlteracaoDeRegraParseada = z.output<typeof esquemaAlterarRegra>
```

Notas:
- `valorEmReais` é o validador atual (`esquemas-recorrencia.ts:40-79`). Ele já usa a cadeia de
  prioridade com uma mensagem só (L-016/L-025), então não escrevo um validador novo.
- `CAMPOS_DA_REGRA` é a tupla `as const` das 12 chaves opcionais. A mesma tupla monta o
  `p_campos`, de modo que o refine e a montagem não divergem.
- Zod 3 `.object` descarta chaves desconhecidas por padrão. Quem decide o que vai ao banco é a
  montagem do §4.2, não o input. A lista fechada da RPC é a segunda barreira.

### 4.2 Server Action (`app/src/actions/recorrencia.ts`)

```ts
export async function alterarRegra(
  input: EntradaAlterarRegra,
): Promise<ResultadoAction<{ alteradosNaRegra: number; alteradosEmLancamentos: number }>>
```

Ordem dentro do corpo (doutrina do agente e o cabeçalho do próprio arquivo, `recorrencia.ts:30-37`):
1. `esquemaAlterarRegra.safeParse(input)`. Falhou: `falhaDeValidacao(erro)`. Daqui em diante só se
   usa `analise.data`.
2. `obterContextoDaFamilia()` (getUser + família no servidor). Sem contexto: `contexto.resultado`.
   A família NUNCA vem do input: o esquema não tem campo de família, e a RPC lê `auth.uid()`.
3. Monta `p_campos` só com as chaves `!== undefined`, pela tabela de-para:
   `descricao→description, valor→amount, contaId→account_id, categoriaId→category_id,
   formaDePagamentoId→payment_method_id, responsavelId→owner_member_id,
   cotaDoResponsavel→owner_share, pagoPorId→paid_by_member_id, observacao→notes,
   ehBeneficio→is_benefit, ehFutil→is_futile, rotuloDoFutil→futile_label`.
   `null` vai como `null` (apaga), e ausente não vai.
4. `supabase.rpc('recorrencia_alterar_regra', { p_regra_id, p_campos, p_a_partir: primeiroDiaDoMes(aPartirDe) })`.
5. Erro do banco: `traduzErroDoBanco(error)` e, se a mensagem estiver no mapa abaixo,
   `falha(msg, { [campo]: [msg] })`. Senão, `falha(msg)`.
6. Sucesso: lê a 1ª linha (`Array.isArray(data) ? data[0] : null`, mesmo padrão de
   `recorrencia.ts:99-100`). Sem linha: `falha('Não foi possível concluir. Tente de novo em instantes.')`.
   Com linha: `revalidar()` e `sucesso({ alteradosNaRegra, alteradosEmLancamentos })`.
   Não manda push: `alterarValorRecorrencia` também não manda (`recorrencia.ts:169-189`).

Mapa mensagem → campo (`camposComErro`):

| Mensagem do banco | campo |
|---|---|
| Conta não encontrada nesta família / A carteira de investimento não aceita recorrência / Esta conta está arquivada / Receita recorrente não pode ser no cartão | `contaId` |
| Responsável não encontrado nesta família / Escolha de quem é a cota | `responsavelId` |
| Quem paga não foi encontrado nesta família | `pagoPorId` |
| Categoria não encontrada nesta família | `categoriaId` |
| Forma de pagamento não encontrada nesta família | `formaDePagamentoId` |
| Marque como fútil para usar o rótulo | `rotuloDoFutil` |
| Benefício e fútil só valem para saída | `formulario` |
| Valor inválido | `valor` |
| Mês inválido | `aPartirDe` |
| Descreva o lançamento | `descricao` |

### 4.3 Forma do erro (contrato para o Fachada)

`{ ok: false, erro: string, camposComErro?: Record<string, string[]> }`. As chaves de
`camposComErro` são os nomes do esquema (`descricao`, `valor`, `contaId`, ..., `aPartirDe`) mais
`formulario` (nenhum campo escolhido, ou benefício/fútil em receita).

### 4.4 Mensagens novas em `MENSAGENS_DE_NEGOCIO`

`'Nada para alterar'`, `'Campo não permitido'`, `'Campo inválido'`, `'Campo obrigatório vazio'`,
`'Descreva o lançamento'`, `'Cota inválida'`, `'Escolha de quem é a cota'`,
`'Marque como fútil para usar o rótulo'`, `'Benefício e fútil só valem para saída'`,
`'Responsável não encontrado nesta família'`, `'Quem paga não foi encontrado nesta família'`,
`'Categoria não encontrada nesta família'`, `'Forma de pagamento não encontrada nesta família'`.
Já existem e são reusadas: `'Você não faz parte de nenhuma família'`, `'Mês inválido'`,
`'Valor inválido'`, `'Assinatura não encontrada'`, `'Conta não encontrada nesta família'`,
`'A carteira de investimento não aceita recorrência'`, `'Esta conta está arquivada'`,
`'Receita recorrente não pode ser no cartão'` (todas em `resultado.ts`, na lista de 00019).

**Risco do `startsWith`:** a comparação é por prefixo (comentário em `resultado.ts`). Na EXECUÇÃO
o executor confere por grep que nenhuma mensagem nova é prefixo de outra com sentido diferente.
Exemplo: `'Campo inválido'` e `'Campo obrigatório vazio'` não são prefixo uma da outra.
**A PROVAR** por grep na execução.

---

## 5. `app.recorrencia_rpc`: não é necessária e NÃO é ligada

O trigger de UPDATE só chama a função quando uma das 3 colunas de recorrência muda
(00019:211-217):

```
WHEN (NEW.recurring_rule_id    IS DISTINCT FROM OLD.recurring_rule_id
      OR NEW.recurring_period     IS DISTINCT FROM OLD.recurring_period
      OR NEW.prompt_snoozed_until IS DISTINCT FROM OLD.prompt_snoozed_until)
```

O UPDATE do passo 12 não escreve nenhuma dessas 3 colunas (lista no §3.3). O WHEN dá falso e a
função nunca roda. Ligar a chave seria privilégio sem uso: durante a janela ligada, qualquer erro
futuro no corpo que escrevesse `recurring_period` passaria pela trava. O efeito seria o oposto do
que a L-034 quer. `recorrencia_alterar_valor` e `recorrencia_encerrar` também não a ligam
(00019:656-663, 703-710).

O gerador do passo 9 liga a chave e desliga em seguida dentro dele mesmo (00019:283, 322). Quando
ele volta, a chave está `'off'`. O caso T01 (§7) confere isso: depois da chamada,
`current_setting('app.recorrencia_rpc', true)` não é `'on'`.

**Outra trava que dispara de verdade:** `tx_carteira_so_por_rpc` (00016:914-950) roda em todo
UPDATE de `transactions` e não sai cedo quando `amount` ou `account_id` mudam (00016:927-935).
Depois ela recusa se a conta antiga ou a nova for carteira. A regra nunca está na carteira, porque
`recorrencia_criar` recusa (00019:435-437), e o passo 8 recusa a carteira como conta nova antes de
escrever. O trigger fica como segunda barreira, e a mensagem amigável vem do passo 8.

---

## 6. Simulação das escritas contra os CHECKs (L-032)

### 6.1 `UPDATE recurring_rules` (passo 11)

| CHECK / restrição | Valor gravado | Passa porque |
|---|---|---|
| `description` NOT NULL, `length(btrim) > 0` (00019:53) | `btrim` do patch ou o atual | passo 4 recusa nulo e vazio |
| `amount > 0`, numeric(14,2) (00019:54) | patch ou atual | passo 4 (mesma faixa de 00019:629) |
| `account_id` NOT NULL + FK (família, conta) (00019:55, 78-79) | patch ou atual | passo 4 recusa nulo; passo 8 confere família |
| `owner_share BETWEEN 0 AND 1` (00019:59) | `v_novo` | passo 4 |
| `paid_by_member_id` NOT NULL + FK (00019:60, 86-87) | patch ou atual | passo 4 recusa nulo; passo 8 confere família |
| FKs de categoria, forma, responsável (00019:80-85) | `v_novo` | passo 8 confere família |
| `rr_cota_exige_responsavel` (00019:91) | `v_novo` normalizado (7a) | passo 7 recusa o caso que sobra |
| `rr_rotulo_exige_futil` (00019:92) | `v_novo` normalizado (7b) | passo 7 recusa o caso que sobra |
| `rr_inicio_e_mes`, `rr_fim_e_mes`, `rr_gerado_e_mes` (00019:93-100) | não escritos aqui | intocados. O `generated_through` do gerador já é conferido em 00019 |

### 6.2 `UPDATE transactions` (passo 12). Só linhas `is_paid = false` da regra

| CHECK / trigger | Passa porque |
|---|---|
| `description` btrim > 0, `amount > 0` (00001:141-142) | iguais aos da regra, já validados |
| `owner_share` 0..1 (00001:150) | idem |
| `tx_transferencia_tem_destino` (00001:195) | a linha é receita/despesa (`tx_recorrencia_sem_parcela`, 00019:149-155) e `to_account_id` NULL fica intocado |
| `tx_transferencia_sem_rateio` (00001:200) | não é transferência |
| `tx_pago_tem_data` (00001:204) | só `is_paid = false`; `is_paid`/`paid_date` intocados |
| `tx_cota_exige_responsavel` (00001:209) | o PAR é gravado junto com o valor da regra, que já passou o CHECK da regra. Sem isso, um patch só de `owner_share` numa linha em que o usuário tirou o responsável à mão daria 23514 |
| `tx_fatura_completa` (00001:213) | ano e mês são calculados juntos: os dois NULL (conta sem ciclo) ou os dois preenchidos |
| `invoice_year BETWEEN 2000 AND 2200` | o ano vem de `t.date`. A regra começa no máximo 9 anos atrás e 2 à frente (00019:409-414), e as linhas estão no horizonte. **A PROVAR** no caso A05 só para datas atuais |
| `tx_rotulo_exige_futil` (00001:218) | o PAR é gravado junto. Exemplo concreto: a regra é fútil com rótulo, e uma linha foi editada à mão para `is_futile = false`. Com patch `{futile_label:'y'}`, gravar só o rótulo daria 23514. Gravando o par, a linha recebe `(true, 'y')`. Caso A11 |
| `tx_recorrencia_completa`, `tx_recorrencia_sem_parcela` (00019:142-155) | colunas intocadas |
| `tx_acerto_so_em_transferencia` (00010:73) | `settlement_to_member_id` NULL e intocado |
| FKs compostas (00001:179-192) | valores conferidos na família no passo 8 |
| trigger congela (00019:211-217) | não dispara (§5) |
| trigger carteira (00016:914-950) | dispara e devolve NEW, porque nenhuma das contas é carteira (§5) |
| trigger acerto (00015:134-137) | não dispara (settlement NULL nos dois lados) |

---

## 7. Teste de aceitação (descrição; NÃO implementar nesta fase)

**Como roda:** `recorrencia-alterar-regra.sql` é um `DO` com 2 famílias de usuários de uuid novo,
troca de papel por `SET LOCAL ROLE authenticated` + `request.jwt.claims`, e termina SEMPRE em
`RAISE EXCEPTION 'PLACAR recorrencia-alterar-regra: ...'`, o que desfaz tudo. É o mesmo arranjo de
`recorrencia-rls.sql` (cabeçalho, linhas 1-15). A família A tem DOIS membros, `ma` ("Heitor") e
`ma2` ("Carol"), para reproduzir o cenário do problema. O runner, que é cópia, roda
`--com-migration 00021` (só `CREATE FUNCTION`; sem `ALTER TABLE`, então sem o lock longo de
`transactions` que a 00019 tinha) e `--mutante`. A impressão digital do schema antes e depois
prova o rollback.

**TDD:** a primeira execução é SEM a migration. A função não existe, então o teste não chega ao
placar ou dá FALHA em tudo. Esse é o vermelho. A segunda execução é `--com-migration --mutante`,
e as FALHAs têm de ser GRAVAÇÃO na linha de A (L-018). A terceira é `--com-migration`, com 0
falhas.

| Id | Caso | Esperado | 1ª recusa atingida (L-026) |
|---|---|---|---|
| A01 | Cenário do Heitor: a regra foi criada como `ma2`, com owner e paid_by = `ma2` e o mês atual pago. Como A: `alterar_regra(regra, {owner_member_id: ma, paid_by_member_id: ma}, mes+1)` | retorno (1, 11); regra com `ma`; 11 pendentes >= mes+1 com `ma`; a linha paga do mês atual continua com `ma2` | — (controle positivo do UPDATE nas duas tabelas, L-032) |
| A02 | Patch só de `description` | só a descrição muda; owner/conta/categoria/valor de regra e linhas iguais ao snapshot | — |
| A03 | `a_partir = mes` com o mês atual pendente | mês atual incluído; pagas intocadas | — |
| A04 | Linha de mes+2 editada à mão (descrição); patch de `description` | depende da PERGUNTA 1: sobrescrita (recomendado) ou preservada | — |
| A05 | Conta corrente → cartão (fechamento 10) e depois cartão → corrente | 1º: `invoice_year/month` = regra de 00019:287-294 sobre `t.date`; 2º: NULL/NULL; pagas intocadas | — |
| A06 | Regra de receita, `account_id` = cartão | 'Receita recorrente não pode ser no cartão'; nada muda | passo 8, tipo da conta |
| A07 | `account_id` = conta-carteira | 'A carteira de investimento não aceita recorrência' | passo 8, `investment_wallets` (antes do trigger da carteira) |
| A08 | `account_id` = conta arquivada | 'Esta conta está arquivada' | passo 8 |
| A09a | Regra com owner+cota; patch `{owner_member_id: null}` | cota vira NULL na regra e nas linhas | — (normalização 7a) |
| A09b | Regra sem owner; patch `{owner_share: 0.5}` | 'Escolha de quem é a cota' | passo 7 |
| A10 | Patch `{is_futile: false}` em regra fútil com rótulo | rótulo NULL na regra e nas pendentes | — (7b) |
| A11 | Regra fútil; linha de mes+3 editada para `is_futile=false, label NULL`; patch `{futile_label:'y'}` | sem 23514; linha fica `(true,'y')` | — (par gravado junto, §6.2) |
| A12 | Regra de receita; patch `{is_benefit: true}` | 'Benefício e fútil só valem para saída' | passo 7 |
| A12b | Regra de receita criada pela RPC com `is_benefit: true` no item (00019:465 aceita); patch só de `description` | aceito; `is_benefit` intocado | — (o passo 7 olha só o que o patch liga) |
| A13 | Chaves proibidas, uma por chamada: `family_id`, `type`, `recurring_period`, `generated_through` | 'Campo não permitido'; regra igual ao snapshot | passo 2 |
| A14 | `p_campos = '{}'` | 'Nada para alterar' | passo 2 |
| A15 | `{paid_by_member_id: null}`, `{description: '  '}`, `{amount: 0}`, `{amount: "10"}` (string) | 'Campo obrigatório vazio', 'Descreva o lançamento', 'Valor inválido', 'Campo inválido' | passo 4 |
| A16 | `a_partir` = mes−1; = gt+2; = dia 15 | 'Mês inválido' nos três. O 2º só depois do gerador, e a contagem de linhas da regra fica igual à de antes da chamada (o rollback do RAISE desfaz o gerado) | passo 3 / passo 10 |
| A17 | Família A tem outra regra R2 (início no mês atual) e R3 (início em jan/y2, só 1 linha). Altera R1 | linhas e `generated_through` de R2 e R3 iguais ao snapshot (L-033) | — |
| A18 | Conta da regra arquivada (assinatura pausada); patch troca a conta para uma ativa com `a_partir = mes+1` | aceito somente se `mes+1 <= gt+1`. A janela usa o `generated_through` relido (§3.4) | passo 10 |
| I01 | Como B: `alterar_regra(regra_A, {description:'x', owner_member_id: ma2}, mes+1)`. Refs VÁLIDAS de A (L-018) | 'Assinatura não encontrada'; regra e linhas de A iguais ao snapshot | passo 6 (`family_id = v_family`) |
| I02 | Como B, na própria regra: `{account_id: conta_A}` | 'Conta não encontrada nesta família'; regra de B igual. Não é a prova primária: a FK composta também barraria (dito no relatório, L-018) | passo 8 |
| I03 | Como B: `{paid_by_member_id: ma}` na própria regra | 'Quem paga não foi encontrado nesta família' | passo 8 |
| G01 | Privilégios: `has_function_privilege('anon', ...)` falso; `authenticated` verdadeiro; `prosecdef`; dono `postgres`; `search_path=""` | tudo conforme | — |
| T01 | Depois de A01: `current_setting('app.recorrencia_rpc', true)` <> 'on'; `recurring_rule_id/period/prompt_snoozed_until` das linhas iguais ao snapshot | conforme | — |

**Mutante** (`recorrencia-alterar-regra-mutante.sql`): substitui a função por uma versão em que
(1) o lookup da regra não filtra família e as escritas usam o `family_id` DA REGRA encontrada,
e (2) o passo 8 não filtra família. Precisa ficar vermelho, com GRAVAÇÃO: I01 (descrição de A
alterada). I02/I03 caem na FK composta (23503). O relatório diz que esses dois ficam vermelhos
pela mensagem, não por gravação, e que a prova de isolamento é o I01 (L-018).

**Teste unitário Zod** (`tests/unit/esquemas-recorrencia.test.ts`): nenhum campo → `formulario`;
`cotaDoResponsavel: 0.5` + `responsavelId: null` → `responsavelId`; `rotuloDoFutil: 'x'` sem
`ehFutil: true` → `rotuloDoFutil`; `observacao: '  '` → `null`; `observacao` ausente →
`undefined`; `valor: Infinity` → exatamente `['Valor inválido.']` (L-016, `toEqual`);
`aPartirDe: '2026-13'` → `aPartirDe`. Toda mensagem esperada é copiada do esquema, não de outro
teste (L-020).

**Critérios de aceite (EXECUÇÃO):**
1. Runner sem migration: não chega ao placar (vermelho, saída colada).
2. Runner `--com-migration --mutante`: I01 FALHA com a linha de A alterada.
3. Runner `--com-migration`: N de N passaram, 0 falha(s), e a impressão é igual antes e depois.
4. `Skill(code-review)` high sobre o RASCUNHO, ANTES do push (L-027). Passe de prosa do cabeçalho
   antes do push (L-022).
5. `db push` (com autorização), e depois o runner contra o aplicado: verde.
6. `npx supabase gen types` → `database.ts` mostra `recorrencia_alterar_regra`; `npx tsc --noEmit`
   limpo, sem `any`.
7. `npx vitest run` num shell SEM `.env.local`, com as suítes de integração `skipped` (L-031).
8. `security-review` e varredura de segredo do portão de saída.

---

## 8. Decisões

| # | Decisão | Justificativa / fonte |
|---|---|---|
| D1 | SECURITY DEFINER + filtro de família em cada instrução + REVOKE anon | não há grant de escrita (00019:120-121); `security-rls-performance.md` (skill Postgres, lida nesta sessão) |
| D2 | Lista fechada de chaves; chave desconhecida recusa o patch INTEIRO | patch jsonb aberto permitiria `family_id`/`type`/`generated_through`. Conhecimento meu; provado por A13 |
| D3 | Pares (responsável, cota) e (fútil, rótulo) gravados juntos nas linhas | CHECKs 00001:209 e 218; simulação do §6.2 |
| D4 | Fatura recalculada só quando a conta muda, com `t.date` | precedente `esquemas-edicao-lancamento.ts:287-290` |
| D5 | Gerador com escopo `p_regra`; janela conferida DEPOIS dele, com `generated_through` relido | L-033; §3.4 |
| D6 | Mesma chave de advisory lock das outras RPCs `recorrencia_*` | 00019:636; `lock-advisory.md` (skill Postgres): `pg_advisory_xact_lock` é solto no commit/rollback |
| D7 | `app.recorrencia_rpc` não ligada | §5 |
| D8 | Benefício/fútil em regra de receita: a RPC RECUSA, não zera em silêncio | a action não conhece o tipo da regra sem ler o banco. Divergência consciente de `montarPatchIndividual`, que zera (`esquemas-edicao-lancamento.ts:232-235`), porque lá o tipo vem no input |
| D9 | Runner novo por cópia, sem mexer no `recorrencia-rls.mjs` | o placar e o arquivo de teste são fixos no runner existente (§1) |
| D10 | Valor (`amount`) segue as mesmas regras de `recorrencia_alterar_valor`. A action antiga continua existindo | nada no briefing pede para retirá-la. A UI atual a usa (`lista-assinaturas.tsx:99`) |

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Sobrescrever ajuste manual de um mês (ex.: a descrição de dezembro mudada à mão) | PERGUNTA 1. O padrão recomendado (sobrescrever) é o mesmo de `alterar_valor`, e a UI precisa avisar |
| Trocar a conta de um cartão muda o total de uma fatura ainda não paga, nas duas contas | só pendentes >= mês atual são movidos. Registrar no contrato do Fachada que a UI avisa |
| `startsWith` em `MENSAGENS_DE_NEGOCIO` casar uma mensagem nova com uma antiga | grep na execução (§4.4) |
| Migration aplicada em produção é imutável | review high antes do push (L-027); prosa do cabeçalho antes do push (L-022) |
| Rodar runner e push contra o único banco (produção) | autorização escrita (pergunta 4). A migration só cria função: sem lock de tabela. O runner desfaz tudo e a impressão digital prova |
| Tipo `Json` no retorno, se a pergunta 3 ficar com `jsonb` | exigiria narrowing manual na action. Por isso recomendo `RETURNS TABLE` (tipado pelo gen types, como `recorrencia_criar`) |
| Concorrência com a fila do outro membro | mesma advisory lock por família, e `FOR UPDATE` na regra |
| Mutante I02/I03 vermelhos pela FK e não por gravação | declarado. A prova primária é o I01 (L-018) |

---

## 10. Ordem de operações (EXECUÇÃO)

1. Ler este plano e o caderno. Confirmar as respostas às perguntas 1 a 4.
2. Testes primeiro: `recorrencia-alterar-regra.sql`, o runner (cópia) e o mutante; casos Zod no
   unit test.
3. Vermelho: runner sem a migration; unit test do esquema vermelho (o esquema não existe).
4. Rascunho da `00021_recorrencia_alterar_regra.sql`: função + grants + bloco de autoverificação
   (função existe, DEFINER, dono postgres, `search_path=""`, anon sem EXECUTE, authenticated com
   EXECUTE), no modelo de 00019:731-784.
5. `--com-migration --mutante`: I01 vermelho por gravação. `--com-migration`: verde, impressão
   igual.
6. Esquema Zod, action e mensagens em `resultado.ts`; unit verde.
7. `Skill(code-review)` high sobre rascunho + action ANTES do push (L-027); passe de prosa do
   cabeçalho (L-022).
8. `db push` (com autorização), e o runner contra o aplicado.
9. `npx supabase gen types` → `database.ts`; `npx tsc --noEmit`.
10. `npx vitest run` sem env (L-031); `security-review`; varredura de segredo; contrato de handoff
    final conferido contra os tipos gerados.

---

## 11. Perguntas bloqueantes ao Maestro (para o Heitor)

1. **Ajuste manual de um mês:** se o Heitor mudou à mão a descrição (ou a categoria) de UM mês
   futuro, a correção em massa sobrescreve esse mês? **Recomendação:** sobrescrever. É o
   comportamento de `alterar_valor` hoje, e preservar exigiria guardar "o que foi editado à mão",
   que é coluna nova em `transactions`.
2. **Pendentes atrasados:** a regra de hoje só deixa mudar do mês atual em diante (00019:646-652).
   No cenário da Carol, se existirem pendentes de meses PASSADOS com o dono errado, eles ficam como
   estão. **Recomendação:** manter "do mês atual em diante" para esta RPC, igual a `alterar_valor`.
   Corrigir um mês passado continua possível pela edição do lançamento.
3. **Retorno:** o briefing pede `jsonb`. Recomendo
   `RETURNS TABLE (alterados_na_regra int, alterados_em_transacoes int)`, que o gen types tipa
   sozinho (como `recorrencia_criar`, `database.ts:820-824`), sem narrowing de `Json` na action.
   O nome e a semântica dos campos não mudam. Confirmar.
4. **Autorização de banco (só existe produção):** por escrito, (a) rodar o runner novo
   `--com-migration` e `--mutante` em transação desfeita; (b) `db push` da 00021. Sem isso, a
   EXECUÇÃO para no passo 5.

---

## 12. Contrato de handoff PROPOSTO

### PARA O FACHADA
- `alterarRegra(input: EntradaAlterarRegra)` em `app/src/actions/recorrencia.ts`, que retorna
  `Promise<ResultadoAction<{ alteradosNaRegra: number; alteradosEmLancamentos: number }>>`.
- Erro: `{ ok: false, erro: string, camposComErro?: Record<string, string[]> }`, com as chaves do
  §4.2/§4.3.
- Tipo do input: `EntradaAlterarRegra` (reexportado pela action, como os outros).
- Semântica para a UI: campo omitido = não mexe; `null` = apaga (categoria, forma, responsável,
  cota, observação, rótulo). `aPartirDe` vai do mês atual até 1 mês depois do último mês gerado.
  Pagos nunca mudam. Trocar a conta de/para cartão move os pendentes de fatura (a UI avisa).
- Exige sessão e família. Não há role.

### PARA O DASH
Não muda tabela, coluna, view nem índice. As linhas alteradas continuam em `transactions` com o
mesmo `recurring_period` (date, 1º dia do mês, sem fuso; "hoje" é `carteira_hoje()` em
America/Sao_Paulo, 00019:37-38). Cardinalidade por chamada: no máximo os pendentes de uma regra
(~12). Nenhuma view nova.
