// Esquemas e planejamento PURO da edição de lançamento
// (docs/planos/estrutura-editar-lancamento.md, seções 4 e 6).
import { describe, expect, it } from 'vitest'
import {
  MENSAGENS_EDICAO as M,
  esquemaAtualizarEmMassa,
  esquemaAtualizarLancamento,
  faturaPara,
  montarPatchIndividual,
  planejarEdicaoEmMassa,
  type LinhaEditavel,
} from '@/lib/esquemas-edicao-lancamento'

const ID = '11111111-1111-4111-8111-111111111111'
const CONTA = '22222222-2222-4222-8222-222222222222'
const CONTA2 = '33333333-3333-4333-8333-333333333333'
const MEMBRO = '44444444-4444-4444-8444-444444444444'
const CAT = '55555555-5555-4555-8555-555555555555'

const base = {
  id: ID,
  tipo: 'despesa' as const,
  descricao: 'Mercado',
  valor: 10.5,
  data: '2026-10-15',
  contaId: CONTA,
  categoriaId: CAT,
  pagoPorId: MEMBRO,
  estaPago: false,
  dataDoPagamento: null,
  observacao: null,
}

function errosDe(entrada: unknown, campo: string) {
  const r = esquemaAtualizarLancamento.safeParse(entrada)
  expect(r.success).toBe(false)
  if (r.success) return []
  return (r.error.flatten().fieldErrors as Record<string, string[] | undefined>)[campo]
}

describe('esquemaAtualizarLancamento — valor (P-009: recusa, não arredonda)', () => {
  const casos: [string, unknown, string][] = [
    ['zero', 0, 'O valor precisa ser maior que zero.'],
    ['negativo', -10, 'O valor precisa ser maior que zero.'],
    ['negativo com 3 casas', -1.005, 'O valor precisa ser maior que zero.'],
    ['1.005 (borda do P-009)', 1.005, 'Use no máximo 2 casas decimais.'],
    ['10.075', 10.075, 'Use no máximo 2 casas decimais.'],
    ['NaN', Number.NaN, 'Valor inválido.'],
    ['Infinity', Number.POSITIVE_INFINITY, 'Valor inválido.'],
    ['acima do teto', 100_000_000, 'Esse valor é alto demais.'],
    ['texto', '10', 'Valor inválido.'],
    ['ausente', undefined, 'Informe o valor.'],
  ]
  for (const [rotulo, valor, msg] of casos) {
    it(`${rotulo} → uma mensagem só: "${msg}"`, () => {
      expect(errosDe({ ...base, valor }, 'valor')).toEqual([msg])
    })
  }

  it('ruído binário de 2 casas (0.1 + 0.2) vira 0.3', () => {
    const r = esquemaAtualizarLancamento.parse({ ...base, valor: 0.1 + 0.2 })
    expect(r.valor).toBe(0.3)
  })

  it('o teto exato é aceito', () => {
    expect(esquemaAtualizarLancamento.parse({ ...base, valor: 99_999_999.99 }).valor).toBe(99_999_999.99)
  })
})

describe('esquemaAtualizarLancamento — demais campos', () => {
  it('pago sem data do pagamento é recusado no campo dataDoPagamento', () => {
    expect(errosDe({ ...base, estaPago: true, dataDoPagamento: null }, 'dataDoPagamento'))
      .toEqual(['Informe a data do pagamento.'])
  })

  it('não pago com data do pagamento é recusado', () => {
    expect(errosDe({ ...base, estaPago: false, dataDoPagamento: '2026-10-15' }, 'dataDoPagamento'))
      .toEqual(['Só preencha a data do pagamento se já estiver pago.'])
  })

  it('descrição só com espaços é recusada', () => {
    expect(errosDe({ ...base, descricao: '   ' }, 'descricao')).toEqual(['Descreva o lançamento.'])
  })

  it('descrição com 121 caracteres é recusada', () => {
    expect(errosDe({ ...base, descricao: 'x'.repeat(121) }, 'descricao'))
      .toEqual(['A descrição pode ter no máximo 120 caracteres.'])
  })

  it('tipo investimento (fora da tela) é recusado', () => {
    expect(errosDe({ ...base, tipo: 'investimento' }, 'tipo'))
      .toEqual(['Escolha se é entrada, saída ou transferência.'])
  })

  it('data impossível é recusada', () => {
    expect(errosDe({ ...base, data: '2026-02-30' }, 'data')).toEqual(['Data inválida.'])
  })

  it('id que não é uuid é recusado', () => {
    expect(errosDe({ ...base, id: 'x' }, 'id')).toEqual(['Lançamento inválido.'])
  })

  it('observação vazia vira null; descrição é aparada', () => {
    const r = esquemaAtualizarLancamento.parse({ ...base, descricao: '  Feira  ', observacao: '   ' })
    expect([r.descricao, r.observacao]).toEqual(['Feira', null])
  })
})

describe('esquemaAtualizarEmMassa', () => {
  it('sem nenhum campo para alterar é recusado', () => {
    const r = esquemaAtualizarEmMassa.safeParse({ ids: [ID] })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toEqual([M.NENHUM_CAMPO])
  })

  it('lista vazia e mais de 50 são recusadas', () => {
    const vazia = esquemaAtualizarEmMassa.safeParse({ ids: [], estaPago: true })
    const grande = esquemaAtualizarEmMassa.safeParse({
      ids: Array.from({ length: 51 }, (_, k) => `11111111-1111-4111-8111-${String(k).padStart(12, '0')}`),
      estaPago: true,
    })
    expect(vazia.success || vazia.error.issues.map((i) => i.message)).toEqual(['Nenhum lançamento selecionado.'])
    expect(grande.success || grande.error.issues.map((i) => i.message)).toEqual([
      'Muitos lançamentos de uma vez. Separe em partes.',
    ])
  })

  it('ids repetidos são deduplicados', () => {
    expect(esquemaAtualizarEmMassa.parse({ ids: [ID, ID], estaPago: false }).ids).toEqual([ID])
  })

  it('categoriaId null (sem categoria) conta como campo', () => {
    const r = esquemaAtualizarEmMassa.parse({ ids: [ID], categoriaId: null })
    expect(r.categoriaId).toBeNull()
  })
})

describe('faturaPara — mesma regra de save_transactions', () => {
  it('antes do fechamento: fatura do mesmo mês', () => {
    expect(faturaPara(10, '2026-10-09')).toEqual({ invoice_year: 2026, invoice_month: 10 })
  })
  it('NO dia do fechamento: ciclo seguinte', () => {
    expect(faturaPara(10, '2026-10-10')).toEqual({ invoice_year: 2026, invoice_month: 11 })
  })
  it('dezembro depois do fechamento vira janeiro do ano seguinte', () => {
    expect(faturaPara(5, '2026-12-20')).toEqual({ invoice_year: 2027, invoice_month: 1 })
  })
  it('conta sem ciclo (não é cartão): sem fatura', () => {
    expect(faturaPara(null, '2026-10-20')).toEqual({ invoice_year: null, invoice_month: null })
  })
})

const linhaDespesa: LinhaEditavel = {
  id: ID,
  type: 'despesa',
  account_id: CONTA,
  to_account_id: null,
  date: '2026-10-15',
  is_paid: false,
  settlement_to_member_id: null,
}

describe('montarPatchIndividual', () => {
  const entrada = esquemaAtualizarLancamento.parse(base)

  it('mesma conta e mesma data: NÃO recalcula a fatura', () => {
    const r = montarPatchIndividual(linhaDespesa, { ...entrada, descricao: 'Outra' }, { closing_day: 10 })
    expect(r.ok).toBe(true)
    if (r.ok) expect('invoice_year' in r.patch).toBe(false)
  })

  it('mudou a data: recalcula pela conta nova', () => {
    const r = montarPatchIndividual(linhaDespesa, { ...entrada, data: '2026-10-10' }, { closing_day: 10 })
    expect(r.ok && [r.patch.invoice_year, r.patch.invoice_month]).toEqual([2026, 11])
  })

  it('mudou para conta sem ciclo: zera a fatura', () => {
    const r = montarPatchIndividual(linhaDespesa, { ...entrada, contaId: CONTA2 }, { closing_day: null })
    expect(r.ok && [r.patch.invoice_year, r.patch.invoice_month]).toEqual([null, null])
  })

  it('despesa vira transferência sem destino: recusada no campo contaDestinoId', () => {
    const r = montarPatchIndividual(linhaDespesa, { ...entrada, tipo: 'transferencia' }, { closing_day: null })
    expect(r).toEqual({ ok: false, erro: M.DESTINO, campo: 'contaDestinoId' })
  })

  it('transferência com destino igual à origem é recusada', () => {
    const r = montarPatchIndividual(
      linhaDespesa,
      { ...entrada, tipo: 'transferencia', contaDestinoId: CONTA },
      { closing_day: null },
    )
    expect(r).toEqual({ ok: false, erro: M.DESTINO, campo: 'contaDestinoId' })
  })

  it('vira transferência com destino: categoria e rateio zerados', () => {
    const r = montarPatchIndividual(
      linhaDespesa,
      { ...entrada, tipo: 'transferencia', contaDestinoId: CONTA2 },
      { closing_day: null },
    )
    expect(r.ok && r.patch).toMatchObject({
      type: 'transferencia',
      to_account_id: CONTA2,
      category_id: null,
      owner_member_id: null,
      owner_share: null,
    })
  })

  it('transferência existente editada sem contaDestinoId mantém o destino', () => {
    const linha = { ...linhaDespesa, type: 'transferencia', to_account_id: CONTA2 }
    const r = montarPatchIndividual(linha, { ...entrada, tipo: 'transferencia' }, { closing_day: null })
    expect(r.ok && r.patch.to_account_id).toBe(CONTA2)
  })

  it('transferência vira despesa: destino zerado, rateio não tocado', () => {
    const linha = { ...linhaDespesa, type: 'transferencia', to_account_id: CONTA2 }
    const r = montarPatchIndividual(linha, entrada, { closing_day: null })
    expect(r.ok && r.patch.to_account_id).toBeNull()
    expect(r.ok && 'owner_member_id' in r.patch).toBe(false)
  })

  it('acerto de contas é recusado', () => {
    const linha = { ...linhaDespesa, type: 'transferencia', to_account_id: CONTA2, settlement_to_member_id: MEMBRO }
    expect(montarPatchIndividual(linha, entrada, { closing_day: null }))
      .toEqual({ ok: false, erro: M.ACERTO, campo: 'formulario' })
  })

  it('não pago grava paid_date null; pago grava a data informada', () => {
    const naoPago = montarPatchIndividual(linhaDespesa, entrada, { closing_day: null })
    const pago = montarPatchIndividual(
      linhaDespesa,
      { ...entrada, estaPago: true, dataDoPagamento: '2026-10-16' },
      { closing_day: null },
    )
    expect(naoPago.ok && [naoPago.patch.is_paid, naoPago.patch.paid_date]).toEqual([false, null])
    expect(pago.ok && [pago.patch.is_paid, pago.patch.paid_date]).toEqual([true, '2026-10-16'])
  })
})

describe('planejarEdicaoEmMassa', () => {
  const HOJE = '2026-10-14'
  const l = (id: string, extra: Partial<LinhaEditavel> = {}): LinhaEditavel => ({ ...linhaDespesa, id, ...extra })

  it('categoria em 3 linhas: 1 grupo só (1 UPDATE atômico)', () => {
    const r = planejarEdicaoEmMassa([l('a'), l('b'), l('c')], { ids: ['a', 'b', 'c'], categoriaId: CAT }, null, HOJE)
    expect(r).toEqual({ ok: true, grupos: [{ ids: ['a', 'b', 'c'], patch: { category_id: CAT } }] })
  })

  it('marcar como pago preserva a data de quem já estava pago', () => {
    const r = planejarEdicaoEmMassa(
      [l('a'), l('b', { is_paid: true })],
      { ids: ['a', 'b'], estaPago: true },
      null,
      HOJE,
    )
    expect(r).toEqual({ ok: true, grupos: [{ ids: ['a'], patch: { is_paid: true, paid_date: HOJE } }] })
  })

  it('marcar como pendente zera todos', () => {
    const r = planejarEdicaoEmMassa(
      [l('a', { is_paid: true }), l('b')],
      { ids: ['a', 'b'], estaPago: false },
      null,
      HOJE,
    )
    expect(r).toEqual({ ok: true, grupos: [{ ids: ['a', 'b'], patch: { is_paid: false, paid_date: null } }] })
  })

  it('mudar para cartão: fatura por linha, agrupada', () => {
    const r = planejarEdicaoEmMassa(
      [l('a', { date: '2026-10-09' }), l('b', { date: '2026-10-10' }), l('c', { date: '2026-10-01' })],
      { ids: ['a', 'b', 'c'], contaId: CONTA2 },
      { id: CONTA2, closing_day: 10 },
      HOJE,
    )
    expect(r).toEqual({
      ok: true,
      grupos: [
        { ids: ['a', 'c'], patch: { account_id: CONTA2, invoice_year: 2026, invoice_month: 10 } },
        { ids: ['b'], patch: { account_id: CONTA2, invoice_year: 2026, invoice_month: 11 } },
      ],
    })
  })

  it('linha que já está na conta nova não tem a fatura recalculada', () => {
    const r = planejarEdicaoEmMassa(
      [l('a', { account_id: CONTA2 })],
      { ids: ['a'], contaId: CONTA2, pagoPorId: MEMBRO },
      { id: CONTA2, closing_day: 10 },
      HOJE,
    )
    expect(r).toEqual({ ok: true, grupos: [{ ids: ['a'], patch: { account_id: CONTA2, paid_by_member_id: MEMBRO } }] })
  })

  it('transferência na seleção + categoria: recusa o lote', () => {
    const r = planejarEdicaoEmMassa(
      [l('a'), l('b', { type: 'transferencia', to_account_id: CONTA2 })],
      { ids: ['a', 'b'], categoriaId: CAT },
      null,
      HOJE,
    )
    expect(r).toEqual({ ok: false, erro: M.TRANSFERENCIA_SEM_CATEGORIA, campo: 'categoriaId' })
  })

  it('transferência na seleção + "sem categoria": aceito', () => {
    const r = planejarEdicaoEmMassa(
      [l('a'), l('b', { type: 'transferencia', to_account_id: CONTA2 })],
      { ids: ['a', 'b'], categoriaId: null },
      null,
      HOJE,
    )
    expect(r.ok).toBe(true)
  })

  it('conta nova igual ao destino de uma transferência: recusa', () => {
    const r = planejarEdicaoEmMassa(
      [l('b', { type: 'transferencia', to_account_id: CONTA2 })],
      { ids: ['b'], contaId: CONTA2 },
      { id: CONTA2, closing_day: null },
      HOJE,
    )
    expect(r).toEqual({ ok: false, erro: M.DESTINO, campo: 'contaId' })
  })

  it('acerto na seleção: recusa o lote', () => {
    const r = planejarEdicaoEmMassa(
      [l('a'), l('b', { type: 'transferencia', to_account_id: CONTA2, settlement_to_member_id: MEMBRO })],
      { ids: ['a', 'b'], estaPago: false },
      null,
      HOJE,
    )
    expect(r).toEqual({ ok: false, erro: M.ACERTO, campo: 'ids' })
  })
})
