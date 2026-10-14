// @vitest-environment node
//
// v_orcamento_progresso e v_patrimonio_mensal (migration 00013) pelo CAMINHO DO
// APP: HTTP no PostgREST com o JWT de um usuário logado (supabase-js), e o
// visitante sem login pela chave anon. Complementa onda2-rls.sql (que troca o
// papel dentro do Postgres): aqui entram o GRANT pela Data API, o schema cache
// das views novas e o formato JSON que a tela vai receber.
//
// Duas famílias descartáveis, criadas aqui e APAGADAS no afterAll pela
// limparTeste (lançamentos -> famílias -> usuários), que conta o que saiu de
// fato. Nunca toca na família real. Fixtures gravados com service_role (são
// preparo, não o que está sob teste); toda LEITURA testada usa o cliente do
// próprio usuário ou o anon.
//
// Sem as chaves no ambiente o arquivo é PULADO. Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/onda2-views.int.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import { limparTeste } from './limpeza-utils.mjs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
// A família real nunca pode aparecer entre as criadas/apagadas por este teste.
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

type Cliente = SupabaseClient<Database>
type Casa = { tag: string; cli: Cliente; familyId: string; memberId: string; mercadoId: string }

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

// Mês corrente em São Paulo e quantos meses vão de 2025-01 até ele — calculado
// em JS, independente do now() AT TIME ZONE da view.
const MES_SP = hojeEmSaoPaulo().slice(0, 7)
const MESES_DESDE_JAN_2025 =
  Number(MES_SP.slice(0, 4)) * 12 + Number(MES_SP.slice(5, 7)) - (2025 * 12 + 1) + 1

async function novaCasa(tag: string): Promise<Casa> {
  const email = `onda2-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: `Casa Onda2 ${tag} ${stamp}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}`, p_monthly_income: 1000,
  })
  if (fErr || !fam?.[0]) throw new Error(`create_family ${tag}: ${fErr?.message}`)
  const familyId = fam[0].family_id
  if (familyId === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  familias.push(familyId)

  const { data: memberId } = await cli.rpc('get_user_member_id_self')
  if (!memberId) throw new Error(`membro ${tag} não encontrado`)
  // 'Mercado' é categoria padrão de seed_family_defaults; nome é único por família.
  const { data: cat } = await admin.from('categories').select('id')
    .eq('family_id', familyId).eq('name', 'Mercado').eq('type', 'despesa').single()
  if (!cat) throw new Error(`categoria Mercado de ${tag} não encontrada`)
  return { tag, cli, familyId, memberId, mercadoId: cat.id }
}

async function conta(casa: Casa, saldoInicial: number): Promise<string> {
  const { data, error } = await admin.from('accounts').insert({
    family_id: casa.familyId, owner_member_id: casa.memberId, name: `Conta ${casa.tag}`,
    type: 'corrente', initial_balance: saldoInicial,
  }).select('id').single()
  if (error || !data) throw new Error(`conta ${casa.tag}: ${error?.message}`)
  return data.id
}

type NovoLancamento = {
  type: 'receita' | 'despesa'; amount: number; date: string; paid: boolean; categoria: string | null
}

async function lancar(casa: Casa, contaId: string, itens: NovoLancamento[]) {
  const { error } = await admin.from('transactions').insert(itens.map((t, i) => ({
    family_id: casa.familyId, type: t.type, description: `onda2 ${casa.tag} ${i}`, amount: t.amount,
    date: t.date, account_id: contaId, category_id: t.categoria,
    created_by_member_id: casa.memberId, paid_by_member_id: casa.memberId,
    is_paid: t.paid, paid_date: t.paid ? t.date : null,
  })))
  if (error) throw new Error(`lançamentos ${casa.tag}: ${error.message}`)
}

describe.skipIf(!temAmbiente)('views da Onda 2 pelo PostgREST, contra o banco real', () => {
  let A: Casa
  let B: Casa

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    A = await novaCasa('a')
    B = await novaCasa('b')

    // A: saldo inicial 1000,00 ; jan +2000 (pago) ; mar -150 (pago) ; mar -80,50 (NÃO pago)
    //    orçamento de Mercado em 2025-03 = 300,00 -> gasto 150 + 80,50 = 230,50 ; razão 0,7683
    //    patrimônio: jan 3000,00 ; fev 3000,00 ; mar 2850,00 ; ... ; mês corrente 2850,00
    const contaA = await conta(A, 1000)
    await lancar(A, contaA, [
      { type: 'receita', amount: 2000, date: '2025-01-10', paid: true, categoria: null },
      { type: 'despesa', amount: 150, date: '2025-03-05', paid: true, categoria: A.mercadoId },
      { type: 'despesa', amount: 80.5, date: '2025-03-20', paid: false, categoria: A.mercadoId },
    ])
    // B: saldo inicial 500,00 ; mar -120 (pago) ; orçamento de Mercado em 2025-03 = 200,00
    const contaB = await conta(B, 500)
    await lancar(B, contaB, [
      { type: 'despesa', amount: 120, date: '2025-03-07', paid: true, categoria: B.mercadoId },
    ])
    const { error } = await admin.from('category_budgets').insert([
      { family_id: A.familyId, category_id: A.mercadoId, month: '2025-03', amount: 300 },
      { family_id: B.familyId, category_id: B.mercadoId, month: '2025-03', amount: 200 },
    ])
    if (error) throw new Error(`orçamentos: ${error.message}`)
  }, 90_000)

  afterAll(async () => {
    const erros = await limparTeste(admin, familias, usuarios)
    expect(erros).toEqual([])
  }, 60_000)

  it('A lê o progresso do próprio orçamento, com número JSON (não string)', async () => {
    const { data, error } = await A.cli.from('v_orcamento_progresso')
      .select('family_id, category_name, month, budget_amount, spent_amount, remaining_amount, used_ratio, tx_count')
      .eq('month', '2025-03')
    expect(error).toBeNull()
    expect(data).toEqual([{
      family_id: A.familyId, category_name: 'Mercado', month: '2025-03', budget_amount: 300,
      spent_amount: 230.5, remaining_amount: 69.5, used_ratio: 0.7683, tx_count: 2,
    }])
  })

  it('A não lê o orçamento de B: nem sem filtro, nem filtrando pela família de B', async () => {
    const semFiltro = await A.cli.from('v_orcamento_progresso').select('family_id')
    expect(semFiltro.error).toBeNull()
    expect(semFiltro.data?.map((r) => r.family_id)).toEqual([A.familyId])

    const deB = await A.cli.from('v_orcamento_progresso').select('budget_id').eq('family_id', B.familyId)
    expect(deB).toMatchObject({ error: null, data: [] })
  })

  it('B lê só o próprio orçamento (120,00 de 200,00)', async () => {
    const { data, error } = await B.cli.from('v_orcamento_progresso').select('family_id, spent_amount, used_ratio')
    expect(error).toBeNull()
    expect(data).toEqual([{ family_id: B.familyId, spent_amount: 120, used_ratio: 0.6 }])
  })

  it('A lê a própria série de patrimônio, contínua de 2025-01 até o mês corrente em SP', async () => {
    const { data, error } = await A.cli.from('v_patrimonio_mensal')
      .select('family_id, month, net_change, total_balance').order('month')
    expect(error).toBeNull()
    expect(data).toHaveLength(MESES_DESDE_JAN_2025)
    expect(new Set(data!.map((r) => r.family_id))).toEqual(new Set([A.familyId]))
    expect(data!.slice(0, 3)).toEqual([
      { family_id: A.familyId, month: '2025-01', net_change: 2000, total_balance: 3000 },
      { family_id: A.familyId, month: '2025-02', net_change: 0, total_balance: 3000 },
      { family_id: A.familyId, month: '2025-03', net_change: -150, total_balance: 2850 },
    ])
    expect(data!.at(-1)).toEqual({ family_id: A.familyId, month: MES_SP, net_change: 0, total_balance: 2850 })
  })

  it('A filtrando o patrimônio pela família de B recebe lista vazia', async () => {
    const { data, error } = await A.cli.from('v_patrimonio_mensal').select('month').eq('family_id', B.familyId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('visitante sem login (anon) é recusado nas duas views', async () => {
    const anon = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
    const orc = await anon.from('v_orcamento_progresso').select('budget_id')
    const pat = await anon.from('v_patrimonio_mensal').select('month')
    expect(orc.data).toBeNull()
    expect(orc.error?.code).toBe('42501')
    expect(pat.data).toBeNull()
    expect(pat.error?.code).toBe('42501')
  })
})
