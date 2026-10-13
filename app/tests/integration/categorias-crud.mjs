// Teste de banco da migration 00009: FKs com SET NULL por coluna, unicidade
// de nome ativo e isolamento entre famílias em categorias/formas de pagamento.
// Roda contra o projeto HOSPEDADO (não existe Supabase local neste projeto).
//
// Uso, de dentro de app/ (o import de @supabase/supabase-js só resolve aqui):
//   set -a && . ./.env.local && set +a
//   node tests/integration/categorias-crud.mjs
//
// O comportamento das Server Actions (lote com duplicata e acento, ignoradas,
// mensagens em português) é testado em tests/integration/acoes-cadastro.int.test.ts,
// porque um .mjs não consegue importar o TypeScript das actions.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://wxhfgstgjjlmqauogeid.supabase.co'
const ANON = process.env.ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON || !SERVICE) {
  console.error('Faltam as chaves no ambiente (rode: set -a && . ./.env.local && set +a).')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const stamp = Date.now()

let failures = 0
let checks = 0
const createdUsers = []
const createdFamilies = []

function check(name, passed, detail = '') {
  checks++
  if (passed) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    failures++
    console.log(`  FALHA ${name}${detail ? ' — ' + detail : ''}`)
  }
}

async function novoUsuario(tag) {
  const email = `cat-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data, error } = await admin.auth.admin.createUser({
    email, password: pass, email_confirm: true,
  })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  createdUsers.push(data.user.id)
  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return { tag, uid: data.user.id, cli }
}

async function criarCasa(u) {
  const { data, error } = await u.cli.rpc('create_family', {
    p_family_name: `Casa ${u.tag}`, p_split_rule: 'equal',
    p_member_name: `Membro ${u.tag}`, p_monthly_income: 3000,
  })
  if (error) throw new Error(`create_family ${u.tag}: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  u.familyId = row.family_id
  u.memberId = row.member_id
  u.joinCode = row.join_code
  createdFamilies.push(row.family_id)
  const { data: acc, error: aErr } = await u.cli.from('accounts')
    .select('id').eq('family_id', u.familyId).limit(1)
  if (aErr) throw new Error(`accounts ${u.tag}: ${aErr.message}`)
  u.accountId = acc[0].id
  return u
}

// Insere uma categoria pelo cliente do PRÓPRIO usuário (RLS ativo).
async function criarCategoria(u, nome, tipo = 'despesa') {
  return u.cli.from('categories')
    .insert({ family_id: u.familyId, name: nome, type: tipo })
    .select('id').single()
}

async function criarForma(u, nome) {
  return u.cli.from('payment_methods')
    .insert({ family_id: u.familyId, name: nome })
    .select('id').single()
}

async function lancar(u, extra) {
  const { data, error } = await u.cli.from('transactions').insert({
    family_id: u.familyId,
    account_id: u.accountId,
    created_by_member_id: u.memberId,
    paid_by_member_id: u.memberId,
    type: 'despesa',
    description: 'Lançamento de teste 00009',
    amount: 42.5,
    date: '2026-10-10',
    ...extra,
  }).select('id').single()
  if (error) throw new Error(`lancar ${u.tag}: ${error.code} ${error.message}`)
  return data.id
}

async function lerLancamento(id) {
  const { data } = await admin.from('transactions')
    .select('id,family_id,category_id,payment_method_id,owner_member_id')
    .eq('id', id).maybeSingle()
  return data
}

async function run() {
  console.log('\n--- Setup: duas famílias ---')
  const A = await criarCasa(await novoUsuario('a'))
  const B = await criarCasa(await novoUsuario('b'))
  console.log(`  A=${A.familyId.slice(0, 8)} B=${B.familyId.slice(0, 8)}`)

  // ==========================================================================
  console.log('\n--- C1: excluir categoria EM USO preserva o lançamento ---')
  // ==========================================================================
  {
    const { data: cat, error: cErr } = await criarCategoria(A, `Excluir ${stamp}`)
    if (cErr) throw new Error(`categoria C1: ${cErr.message}`)
    const txId = await lancar(A, { category_id: cat.id })

    const { data: del, error: delErr } = await A.cli.from('categories')
      .delete().eq('id', cat.id).select('id')
    check('C1 a exclusão da categoria em uso é aceita',
      !delErr && (del ?? []).length === 1,
      delErr ? `${delErr.code}: ${delErr.message}` : `${(del ?? []).length} linha(s)`)

    const tx = await lerLancamento(txId)
    check('C1 o lançamento continua existindo', !!tx, tx ? 'existe' : 'SUMIU')
    check('C1 category_id virou NULL', tx?.category_id === null, `category_id=${tx?.category_id}`)
    check('C1 family_id ficou intacto', tx?.family_id === A.familyId, `family_id=${tx?.family_id}`)
  }

  // ==========================================================================
  console.log('\n--- C2: excluir forma de pagamento EM USO preserva o lançamento ---')
  // ==========================================================================
  {
    const { data: pm, error: pErr } = await criarForma(A, `Forma ${stamp}`)
    if (pErr) throw new Error(`forma C2: ${pErr.message}`)
    const txId = await lancar(A, { payment_method_id: pm.id })

    const { data: del, error: delErr } = await A.cli.from('payment_methods')
      .delete().eq('id', pm.id).select('id')
    check('C2 a exclusão da forma em uso é aceita',
      !delErr && (del ?? []).length === 1,
      delErr ? `${delErr.code}: ${delErr.message}` : `${(del ?? []).length} linha(s)`)

    const tx = await lerLancamento(txId)
    check('C2 o lançamento continua existindo', !!tx)
    check('C2 payment_method_id virou NULL', tx?.payment_method_id === null,
      `payment_method_id=${tx?.payment_method_id}`)
    check('C2 family_id ficou intacto', tx?.family_id === A.familyId)
  }

  // ==========================================================================
  console.log('\n--- C3: orçamento da categoria cai junto (ON DELETE CASCADE, 00001) ---')
  // ==========================================================================
  {
    // Caracterização, não correção: a cascata já existe. Fica aqui porque o
    // contrato do front avisa o usuário disso e o aviso precisa ser verdade.
    const { data: cat } = await criarCategoria(A, `Orcada ${stamp}`)
    const { error: bErr } = await A.cli.from('category_budgets').insert({
      family_id: A.familyId, category_id: cat.id, amount: 300, month: '2026-10',
    })
    check('C3 orçamento de apoio criado', !bErr, bErr?.message ?? 'ok')
    await A.cli.from('categories').delete().eq('id', cat.id)
    const { count } = await admin.from('category_budgets')
      .select('*', { count: 'exact', head: true }).eq('category_id', cat.id)
    check('C3 o orçamento foi removido junto com a categoria', count === 0, `${count} restante(s)`)
  }

  // ==========================================================================
  console.log('\n--- C4: membro que é dono de conta e de lançamento pode ser removido ---')
  // ==========================================================================
  {
    // join_family cria "Conta de <nome>" com owner_member_id do novo membro.
    // Com a FK de accounts sem lista de colunas, remover esse membro zera
    // accounts.family_id (NOT NULL) e a exclusão do usuário inteira falha.
    const C = await novoUsuario('c')
    const { data: ent, error: eErr } = await C.cli.rpc('join_family', {
      p_join_code: A.joinCode, p_member_name: 'Parceira C', p_monthly_income: 1000,
    })
    const entRow = Array.isArray(ent) ? ent[0] : ent
    if (eErr || !entRow) throw new Error(`join C: ${eErr?.message ?? 'sem linha'}`)
    C.memberId = entRow.member_id

    const { data: contaC } = await admin.from('accounts')
      .select('id').eq('owner_member_id', C.memberId).single()
    // Lançamento criado por A, mas cujo gasto é de C (sem cota).
    const txId = await lancar(A, { owner_member_id: C.memberId })

    const { error: delErr } = await admin.auth.admin.deleteUser(C.uid)
    check('C4 o usuário dono de conta é removido sem erro', !delErr,
      delErr ? delErr.message : 'removido')

    const { data: conta } = await admin.from('accounts')
      .select('id,family_id,owner_member_id').eq('id', contaC.id).maybeSingle()
    check('C4 a conta do membro removido continua existindo', !!conta)
    check('C4 accounts.owner_member_id virou NULL', conta?.owner_member_id === null,
      `owner_member_id=${conta?.owner_member_id}`)
    check('C4 accounts.family_id ficou intacto', conta?.family_id === A.familyId)

    const tx = await lerLancamento(txId)
    check('C4 transactions.owner_member_id virou NULL', tx?.owner_member_id === null,
      `owner_member_id=${tx?.owner_member_id}`)
    check('C4 transactions.family_id ficou intacto', tx?.family_id === A.familyId)
  }

  // ==========================================================================
  console.log('\n--- C5: nome ativo é único por família (sem diferenciar maiúscula) ---')
  // ==========================================================================
  {
    const base = `Pet ${stamp}`
    const { error: e1 } = await criarCategoria(A, base, 'despesa')
    check('C5 primeira categoria criada', !e1, e1?.message ?? 'ok')

    const { error: e2 } = await criarCategoria(A, `  ${base.toUpperCase()} `, 'despesa')
    check('C5 mesmo nome (outra caixa, espaços nas pontas) e mesmo tipo é recusado com 23505',
      e2?.code === '23505', e2 ? `${e2.code}` : 'INSERIU DUPLICATA')

    const { error: e3 } = await criarCategoria(A, base, 'receita')
    check('C5 mesmo nome com OUTRO tipo é permitido', !e3, e3?.message ?? 'ok')

    const { error: e4 } = await criarCategoria(B, base, 'despesa')
    check('C5 mesmo nome em OUTRA família é permitido', !e4, e4?.message ?? 'ok')

    // Arquivada não bloqueia: o índice é parcial (WHERE archived_at IS NULL).
    const arq = `Arquivada ${stamp}`
    const { data: velha } = await criarCategoria(A, arq, 'despesa')
    await A.cli.from('categories').update({ archived_at: new Date().toISOString() }).eq('id', velha.id)
    const { error: e5 } = await criarCategoria(A, arq, 'despesa')
    check('C5 nome de categoria ARQUIVADA pode ser reutilizado', !e5, e5?.message ?? 'ok')

    const forma = `Pix ${stamp}`
    const { error: f1 } = await criarForma(A, forma)
    const { error: f2 } = await criarForma(A, forma.toLowerCase())
    check('C5 forma de pagamento com nome ativo repetido é recusada com 23505',
      !f1 && f2?.code === '23505', f2 ? `${f2.code}` : 'INSERIU DUPLICATA')
  }

  // ==========================================================================
  console.log('\n--- C6: outra família não renomeia, não arquiva, não exclui ---')
  // ==========================================================================
  {
    const { data: cat } = await criarCategoria(A, `Alvo ${stamp}`)
    const { data: pm } = await criarForma(A, `AlvoForma ${stamp}`)

    // Cada tentativa devolve quantas linhas ela conseguiu afetar.
    const tentativas = (cli) => [
      ['renomeia categoria', () => cli.from('categories').update({ name: 'Invadida' }).eq('id', cat.id).select('id')],
      ['arquiva categoria', () => cli.from('categories').update({ archived_at: new Date().toISOString() }).eq('id', cat.id).select('id')],
      ['exclui categoria', () => cli.from('categories').delete().eq('id', cat.id).select('id')],
      ['renomeia forma', () => cli.from('payment_methods').update({ name: 'Invadida' }).eq('id', pm.id).select('id')],
      ['arquiva forma', () => cli.from('payment_methods').update({ archived_at: new Date().toISOString() }).eq('id', pm.id).select('id')],
      ['exclui forma', () => cli.from('payment_methods').delete().eq('id', pm.id).select('id')],
    ]

    for (const [rotulo, executar] of tentativas(B.cli)) {
      const { data, error } = await executar()
      check(`C6 B NÃO ${rotulo} de A`, !error && (data ?? []).length === 0,
        error ? error.code : `${(data ?? []).length} linha(s) afetada(s)`)
    }

    const { data: catDepois } = await admin.from('categories')
      .select('name,archived_at').eq('id', cat.id).maybeSingle()
    check('C6 a categoria de A ficou intacta',
      catDepois?.name === `Alvo ${stamp}` && catDepois?.archived_at === null,
      JSON.stringify(catDepois))

    // Prova de que o C6 não é vácuo: o mesmo UPDATE, por um cliente que
    // ignora RLS, afeta a linha. Se o teste não soubesse detectar escrita
    // cruzada, esta linha também daria 0 e o C6 seria fé, não prova.
    const { data: semRls } = await admin.from('categories')
      .update({ name: `Alvo ${stamp}` }).eq('id', cat.id).select('id')
    check('C6 controle: sem RLS o mesmo UPDATE afeta 1 linha (o teste detecta vazamento)',
      (semRls ?? []).length === 1, `${(semRls ?? []).length} linha(s)`)
  }

  console.log(`\n=== ${checks - failures}/${checks} verificacoes passaram ===`)
}

// Limpeza que CONTA O QUE DE FATO SAIU. A versão anterior dos testes contava
// tentativas e engolia o erro (.catch(() => {})): o relatório dizia "22
// removidos" enquanto os usuários ficavam no banco.
//
// Ordem obrigatória: lançamentos -> famílias -> usuários.
//   - transactions.created_by_member_id é ON DELETE RESTRICT: com lançamento
//     vivo, nem a família nem o usuário saem.
//   - família sai e leva membros, contas, categorias, formas e orçamentos.
//   - por fim o usuário, já sem linha de membro.
async function cleanup() {
  let tx = 0, fams = 0, users = 0
  const erros = []
  for (const fid of createdFamilies) {
    const { data, error } = await admin.from('transactions').delete().eq('family_id', fid).select('id')
    if (error) erros.push(`transactions ${fid.slice(0, 8)}: ${error.message}`)
    else tx += data.length
  }
  for (const fid of createdFamilies) {
    const { data, error } = await admin.from('families').delete().eq('id', fid).select('id')
    if (error) erros.push(`family ${fid.slice(0, 8)}: ${error.message}`)
    else fams += data.length
  }
  for (const uid of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(uid)
    // C4 já removeu um usuário: "not found" é sucesso para a limpeza.
    if (error && !/not.?found/i.test(error.message)) erros.push(`user ${uid.slice(0, 8)}: ${error.message}`)
    else users++
  }
  console.log(`limpeza: ${tx} lançamento(s), ${fams}/${createdFamilies.length} família(s), ${users}/${createdUsers.length} usuário(s) removidos`)
  if (erros.length) {
    console.log(`LIMPEZA INCOMPLETA (${erros.length}):`)
    for (const e of erros) console.log(`  - ${e}`)
    failures++
  }
}

try {
  await run()
} catch (e) {
  failures++
  console.error('\nERRO FATAL:', e.message)
} finally {
  await cleanup()
}
process.exit(failures > 0 ? 1 : 0)
