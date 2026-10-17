// @vitest-environment node
//
// Server Actions da carteira de investimento (src/actions/investimentos.ts),
// de verdade, contra o banco HOSPEDADO. Plano:
// docs/planos/estrutura-carteira-investimento.md. Mesmo arranjo de
// orcamentos.int.test.ts: só o createClient do servidor (cookie do Next) é
// trocado por um cliente supabase-js autenticado como o usuário do teste;
// revalidatePath é neutralizado. Zod, família, RPCs, RLS, trava e CHECKs são
// os reais.
//
// Duas famílias descartáveis: A (2 membros, para a concorrência) e B (1
// membro, intrusa). APAGADAS no afterAll pela limparTeste (lançamentos ->
// famílias -> usuários), com sobras contadas por id (L-019). Nunca toca na
// família real.
//
// A concorrência chama as RPCs direto, com os dois clientes de A em paralelo:
// a Action usa um único cliente mockado por vez, e a atomicidade mora na RPC.
//
// Para rodar, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   npx vitest run tests/integration/investimentos.int.test.ts
// CARTEIRA_RLS_MUTANTE=1 troca o intruso do bloco "RLS direto" pelo
// service_role: esses testes TÊM de ficar vermelhos nesse modo.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import { limparTeste } from './limpeza-utils.mjs'

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import {
  alocarParaCaixinha,
  aplicarNaCarteira,
  atualizarTaxaCaixinha,
  confirmarRendimentoMensal,
  criarCaixinha,
  resgatarDaCaixinha,
} from '@/actions/investimentos'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const temAmbiente = Boolean(URL && ANON && SERVICE)
const FAMILIA_REAL = '9969d589-1645-403f-912a-1504bfeebb89'

// Frases vindas da FONTE de cada caminho (L-020): RPCs da migration 00016 e
// contexto-familia.ts.
const SALDO_ORIGEM = 'Saldo insuficiente na conta de origem'
const SALDO_CAIXINHA = 'Saldo insuficiente na caixinha'
const CAIXINHA = 'Caixinha não encontrada'
const ORIGEM = 'Conta de origem inválida'
const DESTINO = 'Conta de destino inválida'
const TAXA = 'A taxa precisa estar entre 0% e 100% ao mês.'
const JA_CONFIRMADO = 'O rendimento deste mês já foi confirmado'
const TRAVA = 'Movimentos da carteira de investimento só podem ser feitos pela área de Investimentos.'
const SESSAO = 'Sua sessão expirou. Entre de novo.'

type Cliente = SupabaseClient<Database>
type Membro = { id: string; cli: Cliente }
type Casa = { familyId: string; m1: Membro; m2?: Membro; conta1: string; conta2?: string }

const stamp = Date.now()
let admin: Cliente
const usuarios: string[] = []
const familias: string[] = []

async function entrar(tag: string): Promise<Cliente> {
  const email = `carteira-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  usuarios.push(u.user.id)
  const cli = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return cli
}

async function novaCasa(tag: string, comParceiro: boolean): Promise<Casa> {
  const cli = await entrar(`${tag}1`)
  const { data: fam, error } = await cli.rpc('create_family', {
    p_family_name: `Casa Carteira ${tag} ${stamp}`, p_split_rule: 'equal', p_member_name: `Membro ${tag}1`, p_monthly_income: 1000,
  })
  if (error || !fam?.[0]) throw new Error(`create_family ${tag}: ${error?.message}`)
  const familyId = fam[0].family_id
  if (familyId === FAMILIA_REAL) throw new Error('create_family devolveu a família real — abortando')
  familias.push(familyId)
  const m1: Membro = { id: fam[0].member_id, cli }
  let m2: Membro | undefined
  if (comParceiro) {
    const cli2 = await entrar(`${tag}2`)
    const { data: f } = await admin.from('families').select('join_code').eq('id', familyId).single()
    const { data: j, error: jErr } = await cli2.rpc('join_family', { p_join_code: f!.join_code, p_member_name: `Membro ${tag}2` })
    if (jErr || !j?.[0]) throw new Error(`join_family ${tag}: ${jErr?.message}`)
    m2 = { id: j[0].member_id, cli: cli2 }
  }
  const { data: contas } = await admin.from('accounts').select('id,owner_member_id')
    .eq('family_id', familyId).eq('type', 'corrente').order('id')
  const conta1 = contas!.find((c) => c.owner_member_id === m1.id)!.id
  const conta2 = m2 ? contas!.find((c) => c.owner_member_id === m2!.id)!.id : undefined
  return { familyId, m1, m2, conta1, conta2 }
}

/** Receita PAGA na conta: é o saldo que "Aplicar" pode usar. */
async function depositar(m: Membro, conta: string, reais: number) {
  const hoje = hojeEmSaoPaulo()
  const { error } = await m.cli.rpc('save_transactions', {
    p_items: [{ type: 'receita', description: 'Salário', amount: reais, date: hoje, account_id: conta, is_paid: true, paid_date: hoje }],
  })
  if (error) throw new Error(`depositar: ${error.message}`)
}

function como(m: Membro | null) {
  estado.cliente = m ? m.cli : createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
}

async function resumo(familyId: string) {
  const { data } = await admin.from('v_carteira_resumo').select('total_cents,alocado_cents,nao_alocado_cents').eq('family_id', familyId).maybeSingle()
  return data
}

async function saldoCaixinha(id: string) {
  const { data } = await admin.from('investment_boxes').select('balance_cents').eq('id', id).single()
  return data!.balance_cents
}

async function contar(tabela: 'investment_box_movements' | 'transactions', coluna: string, valor: string) {
  const { count } = await admin.from(tabela).select('id', { count: 'exact', head: true }).eq(coluna, valor)
  return count ?? -1
}

function ddmmaaaa(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function novaCaixinha(m: Membro, extra: Record<string, unknown> = {}): Promise<string> {
  como(m)
  const r = await criarCaixinha({ nome: 'Caixinha', tipoRendimento: 'pre_fixado', taxaMensalBps: 100, resgateImediato: true, ...extra })
  if (!r.ok) throw new Error(`criarCaixinha: ${r.erro}`)
  return r.dados.id
}

// Timeout no describe: todo teste aqui faz várias chamadas de rede ao banco
// hospedado, e o padrão de 5s derrubou um deles por lentidão, não por defeito.
describe.skipIf(!temAmbiente)('carteira de investimento contra o banco real', { timeout: 60_000 }, () => {
  let A: Casa
  let B: Casa
  let reserva: string

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    A = await novaCasa('a', true)
    B = await novaCasa('b', false)
    await depositar(A.m1, A.conta1, 10_000)
    await depositar(B.m1, B.conta1, 1_000)
  }, 120_000)

  afterAll(async () => {
    const erros = await limparTeste(admin, familias, usuarios)
    expect(erros).toEqual([])
    const sobras: Record<string, number | null> = {}
    for (const t of ['families', 'investment_wallets', 'investment_boxes', 'investment_box_movements', 'accounts', 'transactions'] as const) {
      const col = t === 'families' ? 'id' : 'family_id'
      const { count } = await admin.from(t).select(col, { count: 'exact', head: true }).in(col, familias)
      sobras[t] = count
    }
    console.log(`sobras após limpeza (T-LIMPEZA): ${JSON.stringify(sobras)}`)
    expect(Object.values(sobras)).toEqual([0, 0, 0, 0, 0, 0])
  }, 120_000)

  // ------------------------------------------------------------ fluxo e invariante
  it('criar caixinha, aplicar nela e no não alocado: resumo bate (INV)', async () => {
    reserva = await novaCaixinha(A.m1, { nome: 'Reserva' })
    como(A.m1)
    const r1 = await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 500, caixinhaId: reserva })
    expect(r1.ok && r1.dados.movimentoId).toEqual(expect.any(String))
    const r2 = await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 100 })
    expect(r2.ok && r2.dados).toEqual({ lancamentoId: expect.any(String), movimentoId: null })
    expect(await resumo(A.familyId)).toEqual({ total_cents: 60000, alocado_cents: 50000, nao_alocado_cents: 10000 })
    // A conta-carteira nasceu uma vez só, com o tipo certo.
    const { data: w } = await admin.from('investment_wallets').select('account_id').eq('family_id', A.familyId)
    expect(w).toHaveLength(1)
    const { data: conta } = await admin.from('accounts').select('type,name').eq('id', w![0].account_id).single()
    expect(conta).toEqual({ type: 'investimento', name: 'Carteira de investimento' })
  })

  it('alocar, resgatar para o não alocado e para a conta: invariante a cada passo (INV)', async () => {
    como(A.m2!)
    expect((await alocarParaCaixinha({ caixinhaId: reserva, valor: 50 })).ok).toBe(true)
    expect(await resumo(A.familyId)).toEqual({ total_cents: 60000, alocado_cents: 55000, nao_alocado_cents: 5000 })
    expect((await resgatarDaCaixinha({ caixinhaId: reserva, valor: 20, destino: 'nao_alocado' })).ok).toBe(true)
    expect(await resumo(A.familyId)).toEqual({ total_cents: 60000, alocado_cents: 53000, nao_alocado_cents: 7000 })
    expect((await resgatarDaCaixinha({ caixinhaId: reserva, valor: 30, destino: { contaId: A.conta1 } })).ok).toBe(true)
    expect(await resumo(A.familyId)).toEqual({ total_cents: 57000, alocado_cents: 50000, nao_alocado_cents: 7000 })
  })

  // ------------------------------------------------------------ Review Focus 1
  it('RF1-a: vencimento amanhã -> resgate recusado com a data exata', async () => {
    const amanha = somarDias(hojeEmSaoPaulo(), 1)
    const id = await novaCaixinha(A.m1, { resgateImediato: false, dataVencimento: amanha })
    como(A.m1)
    expect((await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 10, caixinhaId: id })).ok).toBe(true)
    const r = await resgatarDaCaixinha({ caixinhaId: id, valor: 1, destino: 'nao_alocado' })
    expect(r).toEqual({ ok: false, erro: `Esta caixinha só pode ser resgatada a partir de ${ddmmaaaa(amanha)}` })
    expect(await saldoCaixinha(id)).toBe(1000)
  })

  it('RF1-b/c: vencimento hoje ou ontem (criada já vencida) -> resgate liberado', async () => {
    for (const dias of [0, -1]) {
      const data = somarDias(hojeEmSaoPaulo(), dias)
      const id = await novaCaixinha(A.m1, { resgateImediato: false, dataVencimento: data })
      como(A.m1)
      expect((await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 10, caixinhaId: id })).ok).toBe(true)
      expect((await resgatarDaCaixinha({ caixinhaId: id, valor: 10, destino: 'nao_alocado' })).ok).toBe(true)
      expect(await saldoCaixinha(id)).toBe(0)
    }
  })

  it('RF1-d: resgate não imediato sem data -> erro no campo', async () => {
    como(A.m1)
    const r = await criarCaixinha({ nome: 'Sem data', tipoRendimento: 'pre_fixado', taxaMensalBps: 100, resgateImediato: false })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.camposComErro).toEqual({ dataVencimento: ['Informe a data de vencimento.'] })
  })

  // ------------------------------------------------------------ Review Focus 2 e 3
  it('RF2: aplicar 1 centavo acima do saldo da origem -> recusado, nada gravado', async () => {
    const { data } = await admin.from('v_account_balances').select('current_balance').eq('account_id', A.conta1).single()
    const saldo = Number(data!.current_balance)
    const antes = await contar('transactions', 'family_id', A.familyId)
    como(A.m1)
    const r = await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: Math.round(saldo * 100 + 1) / 100, caixinhaId: reserva })
    expect(r).toEqual({ ok: false, erro: SALDO_ORIGEM, camposComErro: { valor: [SALDO_ORIGEM] } })
    expect(await contar('transactions', 'family_id', A.familyId)).toBe(antes)
    expect(await saldoCaixinha(reserva)).toBe(50000)
  })

  it('RF3: resgatar 1 centavo acima do saldo da caixinha -> recusado, nada gravado', async () => {
    const antes = await contar('investment_box_movements', 'box_id', reserva)
    como(A.m1)
    const r = await resgatarDaCaixinha({ caixinhaId: reserva, valor: 500.01, destino: { contaId: A.conta1 } })
    expect(r).toEqual({ ok: false, erro: SALDO_CAIXINHA, camposComErro: { valor: [SALDO_CAIXINHA] } })
    expect(await saldoCaixinha(reserva)).toBe(50000)
    expect(await contar('investment_box_movements', 'box_id', reserva)).toBe(antes)
  })

  // ------------------------------------------------------------ Review Focus 4
  it('RF4: taxa absurda recusada no Zod (1 mensagem) e direto na RPC', async () => {
    como(A.m1)
    for (const taxa of [50_000, -1]) {
      const r = await atualizarTaxaCaixinha({ caixinhaId: reserva, taxaMensalBps: taxa })
      expect(r).toEqual({ ok: false, erro: 'Confira os campos destacados.', camposComErro: { taxaMensalBps: [TAXA] } })
    }
    const { error } = await A.m1.cli.rpc('carteira_atualizar_taxa', { p_caixinha_id: reserva, p_taxa_bps: 50_000 })
    expect(error?.message).toBe(TAXA)
    const { error: e2 } = await A.m1.cli.rpc('carteira_criar_caixinha', {
      p_nome: 'Absurda', p_tipo: 'pre_fixado', p_taxa_bps: 50_000, p_resgate_imediato: true,
    })
    expect(e2?.message).toBe(TAXA)
    expect((await atualizarTaxaCaixinha({ caixinhaId: reserva, taxaMensalBps: 98 })).ok).toBe(true)
    const { data } = await admin.from('investment_boxes').select('rate_bps,rate_defined_at').eq('id', reserva).single()
    expect(data).toEqual({ rate_bps: 98, rate_defined_at: hojeEmSaoPaulo() })
  })

  // ------------------------------------------------------------ Review Focus 5 (concorrência)
  it('RF5-a: 10 aplicações simultâneas pelos dois membros não perdem nenhuma', async () => {
    const id = await novaCaixinha(A.m1)
    const chamadas = Array.from({ length: 10 }, (_, i) =>
      (i % 2 ? A.m2! : A.m1).cli.rpc('carteira_aplicar', { p_conta_origem_id: A.conta1, p_valor_cents: 1000, p_caixinha_id: id }))
    const res = await Promise.all(chamadas)
    expect(res.map((r) => r.error?.message ?? 'ok')).toEqual(Array(10).fill('ok'))
    expect(await saldoCaixinha(id)).toBe(10_000)
    expect(await contar('investment_box_movements', 'box_id', id)).toBe(10)
  }, 60_000)

  it('RF5-b: dois resgates de R$60 simultâneos numa caixinha de R$100 -> exatamente 1 passa (5 rodadas)', async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      const id = await novaCaixinha(A.m1)
      como(A.m1)
      expect((await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 100, caixinhaId: id })).ok).toBe(true)
      const res = await Promise.all([A.m1, A.m2!].map((m) =>
        m.cli.rpc('carteira_resgatar', { p_caixinha_id: id, p_valor_cents: 6000 })))
      expect(res.map((r) => r.error?.message ?? 'ok').sort()).toEqual(['ok', SALDO_CAIXINHA].sort())
      expect(await saldoCaixinha(id)).toBe(4000)
    }
  }, 120_000)

  it('RF5-c: duas aplicações de R$60 simultâneas de uma conta com R$100 -> exatamente 1 passa', async () => {
    await depositar(A.m2!, A.conta2!, 100)
    const res = await Promise.all([A.m1, A.m2!].map((m) =>
      m.cli.rpc('carteira_aplicar', { p_conta_origem_id: A.conta2!, p_valor_cents: 6000 })))
    expect(res.map((r) => r.error?.message ?? 'ok').sort()).toEqual(['ok', SALDO_ORIGEM].sort())
    const { data } = await admin.from('v_account_balances').select('current_balance').eq('account_id', A.conta2!).single()
    expect(Number(data!.current_balance)).toBe(40)
  }, 60_000)

  it('RF5-d: primeiras aplicações simultâneas numa família sem carteira criam UMA carteira', async () => {
    const { count: antes } = await admin.from('investment_wallets').select('family_id', { count: 'exact', head: true }).eq('family_id', B.familyId)
    expect(antes).toBe(0)
    const res = await Promise.all([1, 2, 3].map(() =>
      B.m1.cli.rpc('carteira_aplicar', { p_conta_origem_id: B.conta1, p_valor_cents: 1000 })))
    expect(res.map((r) => r.error?.message ?? 'ok')).toEqual(['ok', 'ok', 'ok'])
    const { count: w } = await admin.from('investment_wallets').select('family_id', { count: 'exact', head: true }).eq('family_id', B.familyId)
    const { count: c } = await admin.from('accounts').select('id', { count: 'exact', head: true }).eq('family_id', B.familyId).eq('type', 'investimento')
    expect([w, c]).toEqual([1, 1])
    expect(await resumo(B.familyId)).toEqual({ total_cents: 3000, alocado_cents: 0, nao_alocado_cents: 3000 })
  }, 60_000)

  // ------------------------------------------------------------ rendimento com confirmação manual
  it('RF5-e: duas abas confirmando o mesmo mês -> 1 confirma, a outra é recusada; saldo não duplica', async () => {
    const id = await novaCaixinha(A.m1, { nome: 'Rendimento' })
    como(A.m1)
    expect((await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 1000, caixinhaId: id })).ok).toBe(true)
    // Fixture retroativa (service_role): a caixinha e a entrada passam a ser de
    // 3 meses atrás. Pendentes = os 2 meses ENCERRADOS depois da entrada; o mês
    // corrente ainda não rendeu e não aparece (00017).
    const hoje = hojeEmSaoPaulo()
    const [ano, mes] = hoje.split('-').map(Number)
    const tresMesesAtras = new Date(Date.UTC(ano, mes - 4, 15)).toISOString().slice(0, 10)
    const mesRetrasado = new Date(Date.UTC(ano, mes - 3, 1)).toISOString().slice(0, 7)
    const mesPassado = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 7)
    const fimDoMesPassado = new Date(Date.UTC(ano, mes - 1, 0)).toISOString().slice(0, 10)
    await admin.from('investment_boxes').update({ created_at: `${tresMesesAtras}T15:00:00Z` }).eq('id', id)
    await admin.from('investment_box_movements').update({ occurred_on: tresMesesAtras }).eq('box_id', id)

    const { data: pend } = await A.m1.cli.rpc('carteira_rendimentos_pendentes')
    expect(pend!.filter((p) => p.caixinha_id === id).map((p) => [p.competencia.slice(0, 7), p.rendimento_cents]))
      .toEqual([[mesRetrasado, 1000], [mesPassado, 1000]])

    const antes = await resumo(A.familyId)
    const res = await Promise.all([A.m1, A.m2!].map((m) =>
      m.cli.rpc('carteira_confirmar_rendimento', { p_caixinha_id: id, p_competencia: `${mesRetrasado}-01` })))
    expect(res.map((r) => r.error?.message ?? 'ok').sort()).toEqual(['ok', JA_CONFIRMADO].sort())
    expect(await saldoCaixinha(id)).toBe(101_000)
    const { count } = await admin.from('investment_box_movements').select('id', { count: 'exact', head: true }).eq('box_id', id).eq('kind', 'rendimento')
    expect(count).toBe(1)

    // Mês passado pela Action: 1% sobre 101000 = 1010. Vira saldo E patrimônio
    // (receita na conta-carteira, datada no fim do mês de competência); o não
    // alocado não muda.
    const r = await confirmarRendimentoMensal({ caixinhaId: id, competencia: mesPassado })
    expect(r.ok && r.dados.valorCentavos).toBe(1010)
    expect(await saldoCaixinha(id)).toBe(102_010)
    const depois = await resumo(A.familyId)
    expect(depois!.nao_alocado_cents).toBe(antes!.nao_alocado_cents)
    // Colunas de view saem anuláveis no tipo gerado.
    expect((depois!.total_cents ?? 0) - (antes!.total_cents ?? 0)).toBe(1000 + 1010)
    const { data: tx } = await admin.from('transactions').select('type,amount,is_paid,date,paid_date').eq('id', r.ok ? r.dados.lancamentoId : '').single()
    expect(tx).toEqual({ type: 'receita', amount: 10.1, is_paid: true, date: fimDoMesPassado, paid_date: fimDoMesPassado })

    // Mês corrente: ainda não rendeu.
    const corrente = await confirmarRendimentoMensal({ caixinhaId: id, competencia: hoje.slice(0, 7) })
    const NAO_AINDA = 'Ainda não é possível confirmar o rendimento deste mês'
    expect(corrente).toEqual({ ok: false, erro: NAO_AINDA, camposComErro: { competencia: [NAO_AINDA] } })

    // Rendimento confirmado é resgatável.
    const rr = await resgatarDaCaixinha({ caixinhaId: id, valor: 1020.1, destino: { contaId: A.conta1 } })
    expect(rr.ok).toBe(true)
    expect(await saldoCaixinha(id)).toBe(0)
  }, 90_000)

  // ------------------------------------------------------------ isolamento — camada 1: Actions
  it('ISO-A: B usa as 6 Actions com ids e contas de A -> recusado, A intacta', async () => {
    const antes = await saldoCaixinha(reserva)
    como(B.m1)
    expect(await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 1 })).toEqual({ ok: false, erro: ORIGEM, camposComErro: { contaOrigemId: [ORIGEM] } })
    expect(await aplicarNaCarteira({ contaOrigemId: B.conta1, valor: 1, caixinhaId: reserva })).toEqual({ ok: false, erro: CAIXINHA, camposComErro: { caixinhaId: [CAIXINHA] } })
    expect(await alocarParaCaixinha({ caixinhaId: reserva, valor: 1 })).toEqual({ ok: false, erro: CAIXINHA, camposComErro: { caixinhaId: [CAIXINHA] } })
    expect(await resgatarDaCaixinha({ caixinhaId: reserva, valor: 1, destino: { contaId: A.conta1 } })).toEqual({ ok: false, erro: CAIXINHA, camposComErro: { caixinhaId: [CAIXINHA] } })
    expect(await atualizarTaxaCaixinha({ caixinhaId: reserva, taxaMensalBps: 1 })).toEqual({ ok: false, erro: CAIXINHA, camposComErro: { caixinhaId: [CAIXINHA] } })
    expect(await confirmarRendimentoMensal({ caixinhaId: reserva, competencia: hojeEmSaoPaulo().slice(0, 7) })).toEqual({ ok: false, erro: CAIXINHA, camposComErro: { caixinhaId: [CAIXINHA] } })
    // Conta de destino de A no resgate de uma caixinha própria de B.
    const deB = await novaCaixinha(B.m1)
    como(B.m1)
    expect(await resgatarDaCaixinha({ caixinhaId: deB, valor: 1, destino: { contaId: A.conta1 } })).toEqual({ ok: false, erro: DESTINO, camposComErro: { destino: [DESTINO] } })
    const { data } = await admin.from('investment_boxes').select('balance_cents,rate_bps').eq('id', reserva).single()
    expect(data).toEqual({ balance_cents: antes, rate_bps: 98 })
  }, 60_000)

  // ------------------------------------------------------------ isolamento — camada 2: RLS direto
  // CARTEIRA_RLS_MUTANTE=1 troca o cliente de B pelo service_role (que ignora
  // RLS e tem grant): os dois testes abaixo TÊM de ficar vermelhos nesse modo.
  const intruso = () => (process.env.CARTEIRA_RLS_MUTANTE === '1' ? admin : B.m1.cli)

  it('RLS: B, direto no PostgREST, não lê carteira, caixinha, movimentos nem resumo de A', async () => {
    const lidas = await Promise.all([
      intruso().from('investment_boxes').select('id').eq('id', reserva),
      intruso().from('investment_wallets').select('family_id').eq('family_id', A.familyId),
      intruso().from('investment_box_movements').select('id').eq('box_id', reserva),
      intruso().from('v_carteira_resumo').select('family_id').eq('family_id', A.familyId),
    ])
    expect(lidas.map((r) => r.data)).toEqual([[], [], [], []])
  })

  it('RLS: B não altera nem apaga a caixinha de A pelo PostgREST; o saldo de A não muda', async () => {
    const antes = await saldoCaixinha(reserva)
    const upd = await intruso().from('investment_boxes').update({ balance_cents: 1 }).eq('id', reserva).select('id')
    const del = await intruso().from('investment_box_movements').delete().eq('box_id', reserva).select('id')
    expect([upd.data ?? [], del.data ?? []]).toEqual([[], []])
    expect(await saldoCaixinha(reserva)).toBe(antes)
  })

  // ------------------------------------------------------------ trava e T-GUC (pelo PostgREST)
  it('T-GUC: o cliente não consegue ligar a chave app.carteira_rpc pelo PostgREST', async () => {
    for (const cli of [A.m1.cli, B.m1.cli]) {
      const { data, error } = await cli.rpc('set_config' as never, { setting_name: 'app.carteira_rpc', new_value: 'on', is_local: true } as never)
      expect(data).toBeNull()
      expect(error?.code).toBe('PGRST202')
    }
  })

  it('trava pelo PostgREST: A não lança, não edita valor nem apaga lançamento da conta-carteira', async () => {
    const { data: w } = await admin.from('investment_wallets').select('account_id').eq('family_id', A.familyId).single()
    const carteira = w!.account_id
    const hoje = hojeEmSaoPaulo()
    const ins = await A.m1.cli.from('transactions').insert({
      family_id: A.familyId, type: 'transferencia', description: 'Por fora', amount: 1, date: hoje,
      account_id: A.conta1, to_account_id: carteira, created_by_member_id: A.m1.id, paid_by_member_id: A.m1.id, is_paid: true, paid_date: hoje,
    })
    expect([ins.error?.code, ins.error?.message]).toEqual(['42501', TRAVA])
    const { data: tx } = await admin.from('transactions').select('id').eq('to_account_id', carteira).order('id').limit(1).single()
    const upd = await A.m1.cli.from('transactions').update({ amount: 0.01 }).eq('id', tx!.id)
    const del = await A.m1.cli.rpc('delete_transactions', { p_id: tx!.id, p_scope: 'single' })
    expect([upd.error?.code, del.error?.code]).toEqual(['42501', '42501'])
    const desc = await A.m1.cli.from('transactions').update({ description: 'Aplicação renomeada' }).eq('id', tx!.id).select('id')
    expect(desc.data).toHaveLength(1)
  })

  // ------------------------------------------------------------ bordas
  it('P-009: 1.005 é recusado (não arredondado); sessão ausente é recusada', async () => {
    como(A.m1)
    const r = await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 1.005 })
    expect(!r.ok && r.camposComErro).toEqual({ valor: ['Use no máximo 2 casas decimais.'] })
    como(null)
    expect(await aplicarNaCarteira({ contaOrigemId: A.conta1, valor: 1 })).toEqual({ ok: false, erro: SESSAO })
  })
})
