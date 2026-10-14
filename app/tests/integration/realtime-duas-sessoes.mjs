// Prova o Realtime como o OuvinteRealtime consome: dois clientes autenticados
// (Heitor e Carol), mesma familia, assinando o topico `family:${familyId}`
// nas tabelas `transactions`. Insere e depois exclui, e confirma que o evento
// chega ao OUTRO membro, sem duplicar.
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.ANON_KEY
const SERVICE = process.env.SERVICE_KEY

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

let falhas = 0
let checks = 0
const check = (nome, ok, det = '') => {
  checks++
  if (!ok) falhas++
  console.log(`  ${ok ? 'PASS ' : 'FALHA'} ${nome}${det ? ' — ' + det : ''}`)
}

async function entrar(email, senha) {
  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await cli.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return cli
}

try {
  const heitor = await entrar('horiheitor@gmail.com', process.env.SEED_SENHA)
  const { data: familyId } = await heitor.rpc('get_user_family_id_self')
  const { data: idHeitor } = await heitor.rpc('get_user_member_id_self')
  console.log(`familia: ${familyId}`)

  // E-mail da Carol vem SO da env var (sem fallback): desde 2026-10-13 a conta
  // dela usa o e-mail real, que nao fica versionado no repositorio.
  const emailCarol = process.env.SEED_EMAIL_PARCEIRA
  if (!emailCarol) throw new Error('defina SEED_EMAIL_PARCEIRA (e-mail da Carol) no ambiente')
  const carol = await entrar(emailCarol, process.env.SEED_SENHA)

  const { data: contas } = await heitor.from('accounts').select('id,name').limit(1)
  const { data: cats } = await heitor.from('categories').select('id').limit(1)
  const contaId = contas[0].id
  const catId = cats[0].id

  // Carol assina o canal como o componente faz.
  const eventosRecebidos = []
  const topico = `family:${familyId}`
  const canal = carol
    .channel(topico)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions', filter: `family_id=eq.${familyId}` },
      (payload) => {
        const nova = payload.new
        const antiga = payload.old
        eventosRecebidos.push({ tipo: payload.eventType, id: nova?.id ?? antiga?.id })
      },
    )
    .subscribe()

  // Espera a inscricao confirmar.
  await new Promise((r) => setTimeout(r, 2000))

  console.log('\n--- Heitor lanca uma despesa de teste ---')
  const { data: inserido, error: eIns } = await heitor.rpc('save_transactions', {
    p_items: [{
      type: 'despesa', description: 'TESTE REALTIME', amount: 1.23,
      date: new Date().toISOString().slice(0, 10), account_id: contaId,
      category_id: catId, paid_by_member_id: idHeitor, is_paid: true,
      paid_date: new Date().toISOString().slice(0, 10),
    }],
  })
  if (eIns) throw new Error(`insert: ${eIns.message}`)
  const txId = inserido[0].id
  console.log(`  lancamento criado: ${txId}`)

  await new Promise((r) => setTimeout(r, 3000))

  const insertsRecebidos = eventosRecebidos.filter((e) => e.tipo === 'INSERT' && e.id === txId)
  check('Carol recebeu o INSERT via Realtime', insertsRecebidos.length >= 1,
    `recebeu ${insertsRecebidos.length} evento(s)`)
  check('Carol NAO recebeu o INSERT duplicado', insertsRecebidos.length <= 1,
    `recebeu ${insertsRecebidos.length} evento(s) do mesmo id`)

  console.log('\n--- Heitor exclui o lancamento de teste ---')
  const { error: eDel } = await heitor.rpc('delete_transactions', { p_id: txId, p_scope: 'single' })
  if (eDel) throw new Error(`delete: ${eDel.message}`)

  await new Promise((r) => setTimeout(r, 8000))

  const deletesRecebidos = eventosRecebidos.filter((e) => e.tipo === 'DELETE' && e.id === txId)
  check('Carol recebeu o DELETE via Realtime', deletesRecebidos.length >= 1,
    `recebeu ${deletesRecebidos.length} evento(s)`)
  check('Carol NAO recebeu o DELETE duplicado', deletesRecebidos.length <= 1,
    `recebeu ${deletesRecebidos.length} evento(s) do mesmo id`)

  await carol.removeChannel(canal)

  // Confirma que o lancamento de teste realmente sumiu (nao sujou a familia real).
  const { data: conf } = await admin.from('transactions').select('id').eq('id', txId)
  check('lancamento de teste nao existe mais no banco', (conf ?? []).length === 0)

  console.log(`\n=== ${checks - falhas}/${checks} ===`)
} catch (e) {
  console.error('ERRO:', e.message)
  falhas++
}
process.exit(falhas > 0 ? 1 : 0)
