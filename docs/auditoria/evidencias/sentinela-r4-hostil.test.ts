// Sentinela — auditoria R4 — testes hostis INDEPENDENTES contra o banco hospedado.
// Cria DUAS famílias descartáveis (sentinela-r4-*@example.com). Nunca toca a família real.
// NÃO apaga nada ao final: imprime os ids criados para limpeza pelo Estrutura.
// Cada teste REGISTRA a observação (console.log 'OBS ...'); asserções só onde a
// pergunta é binária e a falha deve ser vista na saída.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const estado = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => estado.cliente }))

import {
  adicionarCategorias,
  alterarTipoCategoria,
  arquivarCategoria,
  contarUsoCategoria,
  excluirCategoria,
  renomearCategoria,
} from '@/actions/categorias'
import {
  adicionarFormasPagamento,
  arquivarFormaPagamento,
  excluirFormaPagamento,
  renomearFormaPagamento,
} from '@/actions/formas-pagamento'
import { arquivarConta, criarConta, editarConta } from '@/actions/contas'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const REAL_FAMILY = '9969d589-1645-403f-912a-1504bfeebb89'

type U = { tag: string; uid: string; cli: SupabaseClient; familyId: string; memberId: string; accountId: string }
const stamp = Date.now()
let admin: SupabaseClient
const criados = { usuarios: [] as string[], familias: [] as string[] }
const obs = (k: string, v: unknown) => console.log('OBS ' + k + ' => ' + JSON.stringify(v))

async function novaCasa(tag: string): Promise<U> {
  const email = `sentinela-r4-${tag}-${stamp}@example.com`
  const pass = 'Sentinela!R4-' + stamp
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true })
  if (error || !u.user) throw new Error(`createUser ${tag}: ${error?.message}`)
  criados.usuarios.push(u.user.id)
  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  const { data: fam, error: fErr } = await cli.rpc('create_family', {
    p_family_name: `Sentinela R4 ${tag}`, p_split_rule: 'equal', p_member_name: `Sentinela ${tag}`, p_monthly_income: 1000,
  })
  if (fErr || !fam?.[0]) throw new Error(`create_family ${tag}: ${fErr?.message}`)
  criados.familias.push(fam[0].family_id)
  const { data: acc } = await cli.from('accounts').select('id').eq('family_id', fam[0].family_id).limit(1)
  return { tag, uid: u.user.id, cli, familyId: fam[0].family_id, memberId: fam[0].member_id, accountId: acc![0].id }
}
const como = (u: U) => { estado.cliente = u.cli }

let A: U
let B: U

beforeAll(async () => {
  admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
  A = await novaCasa('a')
  B = await novaCasa('b')
  obs('setup', { A: { uid: A.uid, fam: A.familyId }, B: { uid: B.uid, fam: B.familyId } })
})

afterAll(() => {
  console.log('REGISTROS CRIADOS (NÃO apagados pelo Sentinela) => ' + JSON.stringify(criados))
})

describe('1. isolamento multi-tenant (A ataca B sabendo o UUID)', () => {
  it('Server Actions: A não lê/renomeia/arquiva/exclui/muda tipo de categoria, forma e conta de B', async () => {
    como(B)
    const cb = await adicionarCategorias({ nomes: 'Alvo B', tipo: 'despesa' })
    const fb = await adicionarFormasPagamento({ nomes: 'Forma Alvo B' })
    if (!cb.ok || !fb.ok) throw new Error('setup B')
    const catB = cb.dados.criadas[0].id
    const formaB = fb.dados.criadas[0].id
    como(A)
    const r = {
      renomearCat: await renomearCategoria({ id: catB, nome: 'Invadida' }),
      tipoCat: await alterarTipoCategoria({ id: catB, tipo: 'receita' }),
      arqCat: await arquivarCategoria({ id: catB, arquivar: true }),
      contarCat: await contarUsoCategoria({ id: catB }),
      excCat: await excluirCategoria({ id: catB }),
      renForma: await renomearFormaPagamento({ id: formaB, nome: 'Invadida' }),
      arqForma: await arquivarFormaPagamento({ id: formaB, arquivar: true }),
      excForma: await excluirFormaPagamento({ id: formaB }),
      editConta: await editarConta({ id: B.accountId, nome: 'Invadida' }),
      arqConta: await arquivarConta({ id: B.accountId, arquivar: true }),
    }
    obs('1a.actions_A_sobre_B', r)
    const { data: c } = await admin.from('categories').select('name,type,archived_at').eq('id', catB).single()
    const { data: f } = await admin.from('payment_methods').select('name,archived_at').eq('id', formaB).single()
    const { data: a } = await admin.from('accounts').select('name,archived_at').eq('id', B.accountId).single()
    obs('1a.estado_B_depois', { c, f, a })
    for (const v of Object.values(r)) expect(v.ok).toBe(false)
    expect(c).toEqual({ name: 'Alvo B', type: 'despesa', archived_at: null })
  })

  it('PostgREST direto com a sessão de A: select/update/delete por id de B, insert com family_id de B, embed via transactions', async () => {
    const { data: catsB } = await admin.from('categories').select('id').eq('family_id', B.familyId).limit(1)
    const catB = catsB![0].id
    const sel = await A.cli.from('categories').select('id,name').eq('id', catB)
    const upd = await A.cli.from('categories').update({ name: 'X' }).eq('id', catB).select('id')
    const del = await A.cli.from('categories').delete().eq('id', catB).select('id')
    const ins = await A.cli.from('categories').insert({ family_id: B.familyId, name: 'Plantada', type: 'despesa' }).select('id')
    const insReal = await A.cli.from('categories').insert({ family_id: REAL_FAMILY, name: 'Plantada', type: 'despesa' }).select('id')
    const contasB = await A.cli.from('accounts').select('id').eq('family_id', B.familyId)
    const viewB = await A.cli.from('v_account_balances').select('*').eq('family_id', B.familyId)
    const viewReal = await A.cli.from('v_account_balances').select('*').eq('family_id', REAL_FAMILY)
    // embed: transações visíveis de A trazendo categoria — e tentativa de apontar tx de A para categoria de B
    const txCross = await A.cli.from('transactions').insert({
      family_id: A.familyId, account_id: A.accountId, created_by_member_id: A.memberId, paid_by_member_id: A.memberId,
      type: 'despesa', description: 'cross', amount: 1, date: '2026-10-10', category_id: catB,
    }).select('id')
    obs('1b.rest_A_sobre_B', {
      sel: { rows: sel.data?.length, err: sel.error?.code },
      upd: { rows: upd.data?.length, err: upd.error?.code },
      del: { rows: del.data?.length, err: del.error?.code },
      insFamB: { rows: ins.data?.length, err: ins.error?.code, msg: ins.error?.message },
      insFamReal: { rows: insReal.data?.length, err: insReal.error?.code },
      contasB: { rows: contasB.data?.length, err: contasB.error?.code },
      viewB: { rows: viewB.data?.length, err: viewB.error?.code },
      viewReal: { rows: viewReal.data?.length, err: viewReal.error?.code },
      txApontandoCategoriaDeB: { rows: txCross.data?.length, err: txCross.error?.code, msg: txCross.error?.message },
    })
    expect(sel.data?.length ?? 0).toBe(0)
    expect(upd.data?.length ?? 0).toBe(0)
    expect(del.data?.length ?? 0).toBe(0)
    expect(ins.error).not.toBeNull()
  })
})

describe('2. validação Zod e idioma', () => {
  it('entradas inválidas e hostis nas actions', async () => {
    como(A)
    const r = {
      vazio: await adicionarCategorias({ nomes: '', tipo: 'despesa' }),
      soEspacosVirgulas: await adicionarCategorias({ nomes: ' ,  , \n ', tipo: 'despesa' }),
      nome41: await adicionarCategorias({ nomes: 'x'.repeat(41), tipo: 'despesa' }),
      nome10k: await adicionarCategorias({ nomes: 'y'.repeat(10_000), tipo: 'despesa' }),
      lote51: await adicionarFormasPagamento({ nomes: Array.from({ length: 51 }, (_, i) => `F${i}`).join(',') }),
      tipoInvalido: await adicionarCategorias({ nomes: 'Ok', tipo: 'hack' as never }),
      tipoNumero: await adicionarCategorias({ nomes: 'Ok', tipo: 1 as never }),
      nomesNaoString: await adicionarCategorias({ nomes: ['a'] as never, tipo: 'despesa' }),
      inputNull: await adicionarCategorias(null as never),
      renomearVazio: await renomearCategoria({ id: A.accountId, nome: '   ' }),
      renomear41: await renomearCategoria({ id: A.accountId, nome: 'z'.repeat(41) }),
      idNaoUuid: await excluirCategoria({ id: "1' OR '1'='1" }),
      arquivarString: await arquivarCategoria({ id: A.accountId, arquivar: 'true' as never }),
      contaTipoInvalido: await criarConta({ nome: 'C', tipo: 'poupanca' as never, saldoInicial: 0 }),
      contaSaldoNaN: await criarConta({ nome: 'C', tipo: 'corrente', saldoInicial: Number.NaN }),
      contaSaldoString: await criarConta({ nome: 'C', tipo: 'corrente', saldoInicial: '10' as never }),
      contaDia0: await criarConta({ nome: 'C', tipo: 'cartao', saldoInicial: 0, diaFechamento: 0, diaVencimento: 32 }),
      contaNome61: await criarConta({ nome: 'n'.repeat(61), tipo: 'corrente', saldoInicial: 0 }),
      contaSaldoEnorme: await criarConta({ nome: 'C', tipo: 'corrente', saldoInicial: 1e13 }),
    }
    obs('2a.validacao', r)
    // Varredura de idioma: palavras do Zod em inglês em qualquer mensagem.
    const textos = JSON.stringify(r)
    const ingles = textos.match(/\b(Invalid|Required|Expected|received|String must|Number must|must contain|Array must)\b/g)
    obs('2a.palavras_em_ingles', ingles ?? [])
    for (const v of Object.values(r)) expect(v.ok).toBe(false)
  })

  it('limites exatos aceitos (40 chars, 50 nomes)', async () => {
    como(A)
    const n40 = await adicionarCategorias({ nomes: 'w'.repeat(40), tipo: 'despesa' })
    const l50 = await adicionarFormasPagamento({ nomes: Array.from({ length: 50 }, (_, i) => `Lim${i}`).join(',') })
    obs('2b.limites', { n40: n40.ok, l50: l50.ok ? l50.dados.criadas.length : l50 })
  })

  it('payloads hostis aceitos como texto (armazenamento)', async () => {
    como(A)
    const xss = await adicionarCategorias({ nomes: '<img src=x onerror=alert(1)>', tipo: 'despesa' })
    const sqli = await adicionarFormasPagamento({ nomes: "'; drop table categories; --" })
    const acentos = await adicionarCategorias({ nomes: `ç ã ü ' " < >`, tipo: 'despesa' })
    const zwsp = await adicionarCategorias({ nomes: '​', tipo: 'despesa' })
    obs('2c.hostis', { xss, sqli, acentos, zwsp })
  })
})

describe('3. regra de negócio: excluir em uso preserva o lançamento', () => {
  it('categoria e forma em uso: tx fica com referência nula e family_id intacto', async () => {
    como(A)
    const c = await adicionarCategorias({ nomes: 'EmUso', tipo: 'despesa' })
    const f = await adicionarFormasPagamento({ nomes: 'FormaEmUso' })
    if (!c.ok || !f.ok) throw new Error('setup 3')
    const catId = c.dados.criadas[0].id
    const formaId = f.dados.criadas[0].id
    const { data: tx, error } = await A.cli.from('transactions').insert({
      family_id: A.familyId, account_id: A.accountId, created_by_member_id: A.memberId, paid_by_member_id: A.memberId,
      type: 'despesa', description: 'Sentinela tx em uso', amount: 12.34, date: '2026-10-10',
      category_id: catId, payment_method_id: formaId,
    }).select('id').single()
    if (error) throw new Error('insert tx: ' + error.message)
    const antes = await admin.from('transactions').select('family_id,category_id,payment_method_id,amount,description').eq('id', tx.id).single()
    const excCat = await excluirCategoria({ id: catId })
    const meio = await admin.from('transactions').select('family_id,category_id,payment_method_id,amount,description').eq('id', tx.id).single()
    const excForma = await excluirFormaPagamento({ id: formaId })
    const depois = await admin.from('transactions').select('family_id,category_id,payment_method_id,amount,description').eq('id', tx.id).single()
    obs('3.exclusao_em_uso', { antes: antes.data, excCat, meio: meio.data, excForma, depois: depois.data })
    expect(depois.data).toEqual({ family_id: A.familyId, category_id: null, payment_method_id: null, amount: 12.34, description: 'Sentinela tx em uso' })
  })
})

describe('4. tipo de conta imutável', () => {
  it('editarConta ignora campo tipo; PostgREST direto aceita?', async () => {
    como(A)
    const r = await editarConta({ id: A.accountId, nome: 'Conta Sentinela', tipo: 'cartao', type: 'cartao' } as never)
    const viaAction = await admin.from('accounts').select('type,name').eq('id', A.accountId).single()
    const nova = await criarConta({ nome: 'Corrente2', tipo: 'corrente', saldoInicial: 0 })
    if (!nova.ok) throw new Error('setup 4')
    const direto = await A.cli.from('accounts').update({ type: 'investimento' }).eq('id', nova.dados.id).select('id,type')
    const direto2 = await A.cli.from('accounts').update({ type: 'cartao', closing_day: 10, due_day: 20 }).eq('id', nova.dados.id).select('id,type')
    obs('4.tipo_conta', { r, viaAction: viaAction.data, diretoParaInvestimento: { data: direto.data, err: direto.error?.code }, diretoParaCartao: { data: direto2.data, err: direto2.error?.code } })
    expect(viaAction.data?.type).toBe('corrente')
  })
})

describe('5. índice único funcional (Mercado x "mercado ")', () => {
  it('PostgREST direto (sem a normalização da action)', async () => {
    const ins = async (name: string) => {
      const r = await A.cli.from('payment_methods').insert({ family_id: A.familyId, name }).select('id')
      return { name: JSON.stringify(name), ok: !r.error, code: r.error?.code }
    }
    const res = [
      await ins('Mercado'),
      await ins('mercado '),
      await ins('  MERCADO'),
      await ins('Mercado\t'),
      await ins('Mercado '),
      await ins('Mer  cado'),
      await ins('Mércado'),
      await ins('Mercado​'),
    ]
    obs('5a.indice_direto', res)
    expect(res[1].ok).toBe(false)
  })

  it('via action: variantes e corrida (Saúde x Saude em paralelo)', async () => {
    como(A)
    const v1 = await adicionarFormasPagamento({ nomes: 'mercado \t' })
    const v2 = await adicionarFormasPagamento({ nomes: 'MERCADO ' })
    const v3 = await adicionarFormasPagamento({ nomes: 'Mercado​' })
    const corrida = await Promise.all([
      adicionarCategorias({ nomes: 'Saúde Corrida', tipo: 'despesa' }),
      adicionarCategorias({ nomes: 'Saude Corrida', tipo: 'despesa' }),
    ])
    const { data: ativas } = await admin.from('categories').select('name').eq('family_id', A.familyId).ilike('name', 'sa%de corrida').is('archived_at', null)
    obs('5b.action', { v1, v2, v3, corrida, ativasNoBanco: ativas })
  })
})
