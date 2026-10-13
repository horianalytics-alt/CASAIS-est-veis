// Limpeza de usuários/famílias de teste órfãos (execuções de agente interrompidas
// no meio, cujo `finally` de limpeza não rodou).
//
// MODO PADRÃO: simulação (dry-run). Só apaga de verdade com --executar.
//
// Identifica a família REAL só por FAMILIA_REAL_JOIN_CODE (env var obrigatória,
// sem fallback no código) — NUNCA por padrão de e-mail, porque um membro real
// pode ter "teste" no endereço (ex.: parceiro cujo e-mail de cadastro contém
// "teste"). Se a env var não existir, ou se a família não for encontrada, o
// script ABORTA sem apagar nada.
//
// Ordem de remoção (respeita FKs ON DELETE RESTRICT/SET NULL do schema):
//   transactions → push_subscriptions → account_goals → category_budgets
//   → accounts → categories → payment_methods → family_members → families
//   → só então auth.users (Admin API)
//
// Uso:
//   set -a && . ./.env.local && set +a
//   FAMILIA_REAL_JOIN_CODE="<código atual>" SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" node tests/integration/limpar-lixo-teste.mjs
//   FAMILIA_REAL_JOIN_CODE="<código atual>" SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" node tests/integration/limpar-lixo-teste.mjs --executar
import { createClient } from '@supabase/supabase-js'

const EXECUTAR = process.argv.includes('--executar')
const CODIGO_REAL = process.env.FAMILIA_REAL_JOIN_CODE
if (!CODIGO_REAL) {
  throw new Error(
    'Defina FAMILIA_REAL_JOIN_CODE com o join_code atual da família real antes de rodar — ' +
    'sem fallback no código, para não preservar um código antigo/vazado por engano.',
  )
}
const TAMANHO_LOTE = 25

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SERVICE_KEY,
  { auth: { persistSession: false } },
)

function lotes(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// Pagina auth.users por completo — listUsers nunca devolve tudo de uma vez só
// (um perPage grande na primeira página esconde o resto; é preciso avançar
// `page` até a página vir vazia).
async function listarTodosUsuarios() {
  const todos = []
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers (página ${page}): ${error.message}`)
    todos.push(...data.users)
    if (data.users.length < perPage) break
    page++
  }
  return todos
}

// Apaga por lotes de ids (a querystring do PostgREST tem limite de tamanho).
async function apagarPorIds(tabela, coluna, ids) {
  let total = 0
  for (const lote of lotes(ids, TAMANHO_LOTE)) {
    if (lote.length === 0) continue
    const { count, error } = await admin
      .from(tabela)
      .delete({ count: 'exact' })
      .in(coluna, lote)
    if (error) throw new Error(`${tabela}: ${error.code ?? ''} ${error.message}`)
    total += count ?? 0
  }
  return total
}

async function contarPorFamilyIds(tabela, familyIds) {
  if (familyIds.length === 0) return 0
  let total = 0
  for (const lote of lotes(familyIds, TAMANHO_LOTE)) {
    const { count, error } = await admin
      .from(tabela)
      .select('id', { count: 'exact', head: true })
      .in('family_id', lote)
    if (error) throw new Error(`${tabela} (contagem): ${error.code ?? ''} ${error.message}`)
    total += count ?? 0
  }
  return total
}

console.log(`=== limpar-lixo-teste.mjs — modo: ${EXECUTAR ? 'EXECUÇÃO REAL' : 'SIMULAÇÃO (dry-run)'} ===\n`)

// -----------------------------------------------------------------------
// 1. Localiza a família REAL. Aborta se não achar — nunca adivinha.
// -----------------------------------------------------------------------
const { data: familiaReal, error: eReal } = await admin
  .from('families')
  .select('id,name,join_code')
  .eq('join_code', CODIGO_REAL)
  .maybeSingle()
if (eReal) throw new Error(`Falha ao buscar família real: ${eReal.message}`)
if (!familiaReal) {
  throw new Error(
    `ABORTANDO: família real com join_code='${CODIGO_REAL}' NÃO foi encontrada. ` +
    `Nada foi apagado. Confira FAMILIA_REAL_JOIN_CODE ou se o código foi rotacionado.`,
  )
}
console.log(`Família REAL localizada: "${familiaReal.name}" (join_code=${familiaReal.join_code}, id=${familiaReal.id})`)

// -----------------------------------------------------------------------
// 2. Lista todas as famílias e separa preservar/remover.
// -----------------------------------------------------------------------
const { data: todasFamilias, error: eTodas } = await admin
  .from('families')
  .select('id,name,join_code,created_at')
  .order('created_at', { ascending: true })
if (eTodas) throw new Error(`Falha ao listar famílias: ${eTodas.message}`)

const familiasRemover = todasFamilias.filter((f) => f.id !== familiaReal.id)
const idsRemover = familiasRemover.map((f) => f.id)

console.log(`\nTotal de famílias no banco: ${todasFamilias.length}`)
console.log(`Famílias a PRESERVAR: 1 ("${familiaReal.name}", ${familiaReal.join_code})`)
console.log(`Famílias a REMOVER:   ${familiasRemover.length}\n`)

if (familiasRemover.length > 0) {
  console.log('--- Lista de famílias que seriam removidas (nome | join_code | criada em) ---')
  for (const f of familiasRemover) {
    console.log(`  ${f.name ?? '(sem nome)'} | ${f.join_code} | ${f.created_at}`)
  }
  console.log('')
}

// -----------------------------------------------------------------------
// 3. Membros reais (para preservar explicitamente) e membros de famílias-lixo.
// -----------------------------------------------------------------------
const { data: membrosReais, error: eMembrosReais } = await admin
  .from('family_members')
  .select('id,user_id,display_name')
  .eq('family_id', familiaReal.id)
if (eMembrosReais) throw new Error(`Falha ao listar membros reais: ${eMembrosReais.message}`)

console.log(`Membros REAIS a preservar (${membrosReais.length}):`)
for (const m of membrosReais) {
  console.log(`  ${m.display_name} (user_id=${m.user_id})`)
}

let membrosRemover = []
if (idsRemover.length > 0) {
  for (const lote of lotes(idsRemover, TAMANHO_LOTE)) {
    const { data, error } = await admin
      .from('family_members')
      .select('id,user_id,display_name,family_id')
      .in('family_id', lote)
    if (error) throw new Error(`Falha ao listar membros de famílias-lixo: ${error.message}`)
    membrosRemover.push(...data)
  }
}

// Sanidade: nenhum user_id de membro real pode aparecer na lista de remoção.
const userIdsReais = new Set(membrosReais.map((m) => m.user_id))
const colisao = membrosRemover.filter((m) => userIdsReais.has(m.user_id))
if (colisao.length > 0) {
  throw new Error(
    `ABORTANDO: ${colisao.length} membro(s) marcado(s) para remoção têm user_id ` +
    `que também pertence à família REAL. Isso não deveria ser possível (UNIQUE(user_id)) ` +
    `— pare e investigue antes de apagar qualquer coisa.`,
  )
}

// -----------------------------------------------------------------------
// 4. Contagens por tabela (o que seria apagado).
// -----------------------------------------------------------------------
const nTx = await contarPorFamilyIds('transactions', idsRemover)
const nPush = await contarPorFamilyIds('push_subscriptions', idsRemover)
const nGoals = await contarPorFamilyIds('account_goals', idsRemover)
const nBudgets = await contarPorFamilyIds('category_budgets', idsRemover)
const nAccounts = await contarPorFamilyIds('accounts', idsRemover)
const nCategories = await contarPorFamilyIds('categories', idsRemover)
const nPayMethods = await contarPorFamilyIds('payment_methods', idsRemover)
const nMembers = membrosRemover.length
const nFamilies = familiasRemover.length
const nUsers = membrosRemover.length // 1 user_id por member nesta onda (UNIQUE(user_id))

console.log(`\n--- Simulação: contagem de linhas a REMOVER ---`)
console.log(`transactions:        ${nTx}`)
console.log(`push_subscriptions:  ${nPush}`)
console.log(`account_goals:       ${nGoals}`)
console.log(`category_budgets:    ${nBudgets}`)
console.log(`accounts:            ${nAccounts}`)
console.log(`categories:          ${nCategories}`)
console.log(`payment_methods:     ${nPayMethods}`)
console.log(`family_members:      ${nMembers}`)
console.log(`families:            ${nFamilies}`)
console.log(`auth.users:          ${nUsers}`)

if (!EXECUTAR) {
  console.log(`\n=== SIMULAÇÃO CONCLUÍDA — nada foi apagado. Rode com --executar para aplicar. ===`)
  process.exit(0)
}

// -----------------------------------------------------------------------
// 5. EXECUÇÃO REAL — segue a ordem de FKs, em lotes.
// -----------------------------------------------------------------------
console.log(`\n=== EXECUTANDO REMOÇÃO REAL ===`)

const rTx = await apagarPorIds('transactions', 'family_id', idsRemover)
console.log(`transactions removidos:       ${rTx}`)

const rPush = await apagarPorIds('push_subscriptions', 'family_id', idsRemover)
console.log(`push_subscriptions removidos: ${rPush}`)

const rGoals = await apagarPorIds('account_goals', 'family_id', idsRemover)
console.log(`account_goals removidos:      ${rGoals}`)

const rBudgets = await apagarPorIds('category_budgets', 'family_id', idsRemover)
console.log(`category_budgets removidos:   ${rBudgets}`)

const rAccounts = await apagarPorIds('accounts', 'family_id', idsRemover)
console.log(`accounts removidos:           ${rAccounts}`)

const rCategories = await apagarPorIds('categories', 'family_id', idsRemover)
console.log(`categories removidos:          ${rCategories}`)

const rPayMethods = await apagarPorIds('payment_methods', 'family_id', idsRemover)
console.log(`payment_methods removidos:     ${rPayMethods}`)

const rMembers = await apagarPorIds('family_members', 'family_id', idsRemover)
console.log(`family_members removidos:      ${rMembers}`)

const rFamilies = await apagarPorIds('families', 'id', idsRemover)
console.log(`families removidas:            ${rFamilies}`)

// auth.users via Admin API — um a um, não é tabela PostgREST.
const userIdsRemover = [...new Set(membrosRemover.map((m) => m.user_id))]
let okUsers = 0
let falhasUsers = []
for (const uid of userIdsRemover) {
  const { error } = await admin.auth.admin.deleteUser(uid)
  if (error) {
    falhasUsers.push({ uid, error: error.message })
  } else {
    okUsers++
  }
}
console.log(`auth.users removidos:          ${okUsers} / ${userIdsRemover.length}`)
if (falhasUsers.length > 0) {
  console.log(`FALHAS ao remover usuários:`)
  for (const f of falhasUsers) console.log(`  ${f.uid}: ${f.error}`)
}

// -----------------------------------------------------------------------
// 6. Conferência final.
// -----------------------------------------------------------------------
const { data: famFinal } = await admin.from('families').select('id,name,join_code')
const { data: memFinal } = await admin.from('family_members').select('id,display_name,family_id')
const { data: accFinal } = await admin.from('accounts').select('id,name,family_id')
const { data: txFinal } = await admin.from('transactions').select('id', { count: 'exact', head: true })
const { data: usersFinal, error: eUsersFinal } = await admin.auth.admin.listUsers({ perPage: 1000 })

console.log(`\n=== ESTADO FINAL ===`)
console.log(`families:        ${famFinal?.length ?? '?'}`)
console.log(`family_members:  ${memFinal?.length ?? '?'}`)
console.log(`accounts:        ${accFinal?.length ?? '?'}`)
console.log(`transactions:    ${txFinal?.count ?? '?'}`)
if (!eUsersFinal) console.log(`auth.users:      ${usersFinal.users.length}`)
console.log(`famílias restantes: ${famFinal?.map((f) => `${f.name} (${f.join_code})`).join(', ')}`)
console.log(`membros restantes:  ${memFinal?.map((m) => m.display_name).join(', ')}`)
console.log(`contas restantes:   ${accFinal?.map((a) => a.name).join(', ')}`)
