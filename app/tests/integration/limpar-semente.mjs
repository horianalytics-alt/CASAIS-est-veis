// Desfaz o que semear.mjs criou: apaga TODOS os lançamentos da família e a
// conta de cartão, preservando a família, os membros e as contas correntes.
//
// Rodar semear.mjs duas vezes duplica os lançamentos — rode este antes de
// semear de novo.
//
// Uso:
//   set -a && . ./.env.local && set +a
//   SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY" node tests/integration/limpar-semente.mjs
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SERVICE_KEY,
  { auth: { persistSession: false } },
)

const CODIGO = process.env.SEED_JOIN_CODE ?? 'GCX3EF'

const { data: fams, error } = await admin
  .from('families')
  .select('id,name,join_code')
  .eq('join_code', CODIGO)
if (error) throw new Error(error.message)
if (!fams?.length) throw new Error(`Família ${CODIGO} não encontrada — ABORTANDO`)

const familia = fams[0]
console.log(`família: "${familia.name}" (${familia.join_code})`)
console.log('PRESERVANDO: a família, os membros e as contas correntes.')
console.log('REMOVENDO:   todos os lançamentos e a conta de cartão.\n')

// 1. Lançamentos primeiro: accounts tem FK ON DELETE RESTRICT vinda daqui.
const { count: nTx, error: eTx } = await admin
  .from('transactions')
  .delete({ count: 'exact' })
  .eq('family_id', familia.id)
if (eTx) throw new Error(`transactions: ${eTx.code} ${eTx.message}`)
console.log(`lançamentos removidos: ${nTx}`)

// 2. O cartão, que o semeador criou. As correntes nascem com a família e ficam.
const { count: nCard, error: eCard } = await admin
  .from('accounts')
  .delete({ count: 'exact' })
  .eq('family_id', familia.id)
  .eq('type', 'cartao')
if (eCard) throw new Error(`accounts: ${eCard.code} ${eCard.message}`)
console.log(`cartões removidos:     ${nCard}`)

// 3. Conferência
const { data: restam } = await admin
  .from('transactions')
  .select('id')
  .eq('family_id', familia.id)
const { data: contas } = await admin
  .from('accounts')
  .select('name,type')
  .eq('family_id', familia.id)
const { data: membros } = await admin
  .from('family_members')
  .select('display_name')
  .eq('family_id', familia.id)

console.log(`\n=== ESTADO FINAL ===`)
console.log(`lançamentos: ${restam?.length ?? 0}`)
console.log(`membros:     ${membros?.map((m) => m.display_name).join(', ')}`)
console.log(`contas:      ${contas?.map((c) => c.name).join(', ')}`)
