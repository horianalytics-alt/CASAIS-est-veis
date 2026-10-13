// Semeia o histórico do casal: a Carol, um cartão e ~30 lançamentos em 3 meses.
//
// Usa as RPCs reais (join_family, save_transactions), não insert direto, para
// que os dados nasçam no mesmo estado que o app produziria — dado inserido por
// fora pula RLS, CHECK e validação, e esconde bug em vez de revelar.
//
// PRESERVA a família do Heitor (join_code vem de SEED_JOIN_CODE) e o usuário dele.
// Para desfazer: node tests/integration/limpar-semente.mjs
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_KEY

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Credenciais vêm do ambiente, nunca do código: este arquivo vai para o
// repositório, e senha em texto aberto num repo foi um dos defeitos da v1.
const CODIGO = process.env.SEED_JOIN_CODE
const EMAIL_HEITOR = process.env.SEED_EMAIL_DONO
const EMAIL_CAROL = process.env.SEED_EMAIL_PARCEIRA ?? 'carol.financas.teste@gmail.com'
const SENHA = process.env.SEED_SENHA

if (!EMAIL_HEITOR || !SENHA || !CODIGO) {
  throw new Error(
    'Faltam credenciais. Rode com:\n' +
      '  SEED_EMAIL_DONO=... SEED_SENHA=... SEED_JOIN_CODE=... node tests/integration/semear.mjs\n' +
      '(ou defina-as em app/.env.local, que é git-ignored)',
  )
}

function log(...a) {
  console.log(...a)
}

// --- 0. Guarda: a família tem de existir, senão aborta ---------------------
const { data: fams, error: eFam } = await admin
  .from('families')
  .select('id,name,join_code')
  .eq('join_code', CODIGO)
if (eFam) throw new Error(eFam.message)
if (!fams?.length) throw new Error(`Família ${CODIGO} não encontrada — ABORTANDO`)

const familia = fams[0]
log(`família preservada: "${familia.name}" (${familia.join_code})`)

// --- 1. Sessão do Heitor ----------------------------------------------------
async function entrar(email, senha) {
  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await cli.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return cli
}

const heitor = await entrar(EMAIL_HEITOR, SENHA)
const { data: idHeitor } = await heitor.rpc('get_user_member_id_self')
log(`Heitor: membro ${idHeitor?.slice(0, 8)}`)

// --- 2. A Carol entra pela RPC real -----------------------------------------
let idCarol
const { data: jaExiste } = await admin
  .from('family_members')
  .select('id,display_name')
  .eq('family_id', familia.id)
  .eq('display_name', 'Carol')

if (jaExiste?.length) {
  idCarol = jaExiste[0].id
  log(`Carol já existia: ${idCarol.slice(0, 8)}`)
} else {
  const { data: u, error: eU } = await admin.auth.admin.createUser({
    email: EMAIL_CAROL,
    password: SENHA,
    email_confirm: true,
  })
  if (eU && !/already/i.test(eU.message)) throw new Error(`criar Carol: ${eU.message}`)

  const carol = await entrar(EMAIL_CAROL, SENHA)
  const { data: entrada, error: eJoin } = await carol.rpc('join_family', {
    p_join_code: CODIGO,
    p_member_name: 'Carol',
    p_monthly_income: 6200,
  })
  if (eJoin) throw new Error(`join_family: ${eJoin.message}`)
  idCarol = (Array.isArray(entrada) ? entrada[0] : entrada).member_id
  log(`Carol entrou pela RPC: membro ${idCarol.slice(0, 8)}`)
}

// --- 3. Renda do Heitor (cada um só altera a própria linha) ------------------
await heitor
  .from('family_members')
  .update({ monthly_income: 7800 })
  .eq('id', idHeitor)
log('renda do Heitor: 7800')

// --- 4. Contas: a corrente de cada um já existe; falta o cartão -------------
const { data: contas } = await heitor
  .from('accounts')
  .select('id,name,type,closing_day')
  .order('sort_order')

let cartao = contas.find((c) => c.type === 'cartao')
if (!cartao) {
  const { data: novo, error: eC } = await heitor
    .from('accounts')
    .insert({
      family_id: familia.id,
      name: 'Cartão Nubank',
      type: 'cartao',
      initial_balance: 0,
      closing_day: 25,
      due_day: 5,
      sort_order: 10,
    })
    .select('id,name,closing_day')
    .single()
  if (eC) throw new Error(`cartão: ${eC.message}`)
  cartao = novo
  log(`cartão criado: ${cartao.name} (fecha dia 25, vence dia 5)`)
} else {
  log(`cartão já existia: ${cartao.name}`)
}

const correnteHeitor = contas.find(
  (c) => c.type === 'corrente' && /Heitor/i.test(c.name),
)
const correnteCarol = contas.find(
  (c) => c.type === 'corrente' && /Carol/i.test(c.name),
)
log(`contas: ${contas.map((c) => c.name).join(', ')}`)

// --- 5. Categorias semeadas por create_family -------------------------------
const { data: cats } = await heitor.from('categories').select('id,name')
const cat = (nome) => {
  const achada = cats.find((c) => c.name.toLowerCase().includes(nome.toLowerCase()))
  return achada?.id ?? cats[0]?.id
}

// --- 6. Os lançamentos ------------------------------------------------------
// Hoje é 2026-10-12. Dois meses anteriores + o corrente, para o saldo
// acumulado aparecer — era o bug central da v1.
const CC_H = correnteHeitor.id
const CC_C = correnteCarol?.id ?? correnteHeitor.id

const itens = []
const add = (o) => itens.push(o)

for (const [mes, rotulo] of [
  ['08', 'agosto'],
  ['09', 'setembro'],
]) {
  add({ type: 'receita', description: 'Salário Heitor', amount: 7800,
        date: `2026-${mes}-05`, account_id: CC_H, category_id: cat('salário'),
        paid_by_member_id: idHeitor, is_paid: true, paid_date: `2026-${mes}-05` })
  add({ type: 'receita', description: 'Salário Carol', amount: 6200,
        date: `2026-${mes}-05`, account_id: CC_C, category_id: cat('salário'),
        paid_by_member_id: idCarol, is_paid: true, paid_date: `2026-${mes}-05` })
  add({ type: 'despesa', description: `Mercado do mês (${rotulo})`, amount: 612.4,
        date: `2026-${mes}-08`, account_id: CC_H, category_id: cat('mercado'),
        paid_by_member_id: idHeitor, is_paid: true, paid_date: `2026-${mes}-08` })
  add({ type: 'despesa', description: 'Conta de luz', amount: 187.9,
        date: `2026-${mes}-12`, account_id: CC_C, category_id: cat('casa'),
        paid_by_member_id: idCarol, is_paid: true, paid_date: `2026-${mes}-12` })
  add({ type: 'despesa', description: 'Internet', amount: 119.9,
        date: `2026-${mes}-15`, account_id: CC_H, category_id: cat('casa'),
        paid_by_member_id: idHeitor, is_paid: true, paid_date: `2026-${mes}-15` })
  add({ type: 'despesa', description: 'Jantar fora', amount: 168.5,
        date: `2026-${mes}-20`, account_id: CC_H, category_id: cat('lazer'),
        paid_by_member_id: idHeitor, is_paid: true, paid_date: `2026-${mes}-20` })
}

// Mês corrente (outubro)
add({ type: 'receita', description: 'Salário Heitor', amount: 7800,
      date: '2026-10-05', account_id: CC_H, category_id: cat('salário'),
      paid_by_member_id: idHeitor, is_paid: true, paid_date: '2026-10-05' })
add({ type: 'receita', description: 'Salário Carol', amount: 6200,
      date: '2026-10-05', account_id: CC_C, category_id: cat('salário'),
      paid_by_member_id: idCarol, is_paid: true, paid_date: '2026-10-05' })
add({ type: 'despesa', description: 'Mercado do mês', amount: 684.3,
      date: '2026-10-06', account_id: CC_H, category_id: cat('mercado'),
      paid_by_member_id: idHeitor, is_paid: true, paid_date: '2026-10-06' })
add({ type: 'despesa', description: 'Farmácia', amount: 94.8,
      date: '2026-10-07', account_id: CC_C, category_id: cat('saúde'),
      paid_by_member_id: idCarol, is_paid: true, paid_date: '2026-10-07' })
add({ type: 'despesa', description: 'Uber para o trabalho', amount: 38.4,
      date: '2026-10-08', account_id: CC_H, category_id: cat('transporte'),
      paid_by_member_id: idHeitor, is_paid: true, paid_date: '2026-10-08' })
add({ type: 'despesa', description: 'Academia', amount: 129.9,
      date: '2026-10-09', account_id: CC_C, category_id: cat('saúde'),
      paid_by_member_id: idCarol, owner_member_id: idCarol, is_paid: true,
      paid_date: '2026-10-09' })
add({ type: 'despesa', description: 'Conta de água', amount: 86.2,
      date: '2026-10-10', account_id: CC_H, category_id: cat('casa'),
      paid_by_member_id: idHeitor, is_paid: false })
add({ type: 'despesa', description: 'Conta de luz', amount: 203.1,
      date: '2026-10-14', account_id: CC_H, category_id: cat('casa'),
      paid_by_member_id: idHeitor, is_paid: false })
add({ type: 'despesa', description: 'Internet', amount: 119.9,
      date: '2026-10-15', account_id: CC_H, category_id: cat('casa'),
      paid_by_member_id: idHeitor, is_paid: false })
add({ type: 'investimento', description: 'Aporte Tesouro Selic', amount: 1200,
      date: '2026-10-06', account_id: CC_H, category_id: cat('investi'),
      paid_by_member_id: idHeitor, is_paid: true, paid_date: '2026-10-06' })

// BORDA 1 — fatura: dia 24 (antes do fechamento) e dia 25 (NO fechamento).
// A do dia 25 tem de cair na fatura de NOVEMBRO.
add({ type: 'despesa', description: 'Streaming (compra dia 24)', amount: 55.9,
      date: '2026-10-24', account_id: cartao.id, category_id: cat('lazer'),
      paid_by_member_id: idHeitor, is_paid: false })
add({ type: 'despesa', description: 'Livraria (compra dia 25 - fechamento)',
      amount: 139.7, date: '2026-10-25', account_id: cartao.id,
      category_id: cat('lazer'), paid_by_member_id: idHeitor, is_paid: false })

// BORDA 2 — parcelas: 6x no cartão, geradas in-SQL pela própria função.
add({ type: 'despesa', description: 'Notebook (6x)', amount: 583.33,
      date: '2026-10-03', account_id: cartao.id, category_id: cat('casa'),
      paid_by_member_id: idHeitor, is_paid: false, recurrence_months: 6 })

// BORDA 3 — saldo negativo na conta da Carol, para exercitar C-3 na UI.
add({ type: 'despesa', description: 'Conserto do carro', amount: 2800,
      date: '2026-10-11', account_id: CC_C, category_id: cat('transporte'),
      paid_by_member_id: idCarol, is_paid: true, paid_date: '2026-10-11' })

log(`\nenviando ${itens.length} itens para save_transactions...`)
const { data: salvos, error: eSave } = await heitor.rpc('save_transactions', {
  p_items: itens,
})
if (eSave) throw new Error(`save_transactions: ${eSave.code} ${eSave.message}`)
log(`gravados: ${salvos.length} lançamentos (parcelas expandidas pela função)`)

// --- 7. Transferência: precisa de duas contas distintas ---------------------
if (correnteCarol) {
  const { error: eT } = await heitor.rpc('save_transactions', {
    p_items: [
      { type: 'transferencia', description: 'Ajuda com o conserto',
        amount: 500, date: '2026-10-11', account_id: CC_H,
        to_account_id: CC_C, paid_by_member_id: idHeitor,
        is_paid: true, paid_date: '2026-10-11' },
    ],
  })
  if (eT) log(`  transferência falhou: ${eT.code} ${eT.message}`)
  else log('  transferência gravada')
}

// --- 8. Conferência: os números batem? --------------------------------------
log('\n=== CONFERÊNCIA ===')

const { data: saldos } = await heitor
  .from('v_account_balances')
  .select('name,current_balance,pending_outflow')
log('\nv_account_balances:')
for (const s of saldos ?? []) {
  log(`  ${s.name.padEnd(22)} saldo ${String(s.current_balance).padStart(10)}  a pagar ${s.pending_outflow}`)
}

const { data: acerto } = await heitor
  .from('v_settlement')
  .select('display_name,total_paid,total_owed,balance')
log('\nv_settlement (o acerto do casal):')
for (const a of acerto ?? []) {
  log(`  ${a.display_name.padEnd(10)} pagou ${String(a.total_paid).padStart(10)}  devia ${String(a.total_owed).padStart(10)}  saldo ${a.balance}`)
}

const { data: faturas } = await heitor
  .from('v_invoices')
  .select('account_name,invoice_year,invoice_month,total_amount,tx_count,due_date')
  .order('invoice_month')
log('\nv_invoices (BORDA: a compra do dia 25 tem de estar em NOVEMBRO):')
for (const f of faturas ?? []) {
  log(`  ${f.account_name}  ${String(f.invoice_month).padStart(2, '0')}/${f.invoice_year}  total ${f.total_amount}  (${f.tx_count} compras)  vence ${f.due_date}`)
}

const { data: meses } = await heitor
  .from('v_monthly_summary')
  .select('month,income_total,expense_total,payable,tx_count')
  .order('month')
log('\nv_monthly_summary:')
for (const m of meses ?? []) {
  log(`  ${m.month}  entrou ${String(m.income_total ?? 0).padStart(9)}  saiu ${String(m.expense_total ?? 0).padStart(9)}  a pagar ${m.payable ?? 0}  (${m.tx_count} lanç.)`)
}

log('\nPara desfazer: node tests/integration/limpar-semente.mjs')
