import { describe, expect, it } from 'vitest'
import '@/actions/resultado' // registra o mapa de erros em português do Zod
import { LIMITE_CARACTERES, LIMITE_NOMES } from '@/lib/lista-nomes'
import {
  esquemaAdicionarCategorias,
  esquemaAdicionarFormas,
  esquemaCriarConta,
  esquemaEditarConta,
  esquemaRenomear,
  validarCicloDoCartao,
} from '@/lib/esquemas-cadastro'

const lista = (n: number) => Array.from({ length: n }, (_, i) => `Item ${i + 1}`).join(', ')

function mensagensDe(resultado: { success: boolean; error?: { flatten(): { fieldErrors: Record<string, string[] | undefined> } } }, campo: string) {
  if (resultado.success || !resultado.error) return []
  return resultado.error.flatten().fieldErrors[campo] ?? []
}

describe('lote de nomes (categorias e formas)', () => {
  it(`nome com exatamente ${LIMITE_CARACTERES} caracteres passa`, () => {
    const r = esquemaAdicionarCategorias.safeParse({ nomes: 'a'.repeat(LIMITE_CARACTERES), tipo: 'despesa' })
    expect(r.success).toBe(true)
  })

  it(`nome com ${LIMITE_CARACTERES + 1} caracteres é recusado no campo nomes`, () => {
    const r = esquemaAdicionarCategorias.safeParse({ nomes: 'a'.repeat(LIMITE_CARACTERES + 1), tipo: 'despesa' })
    expect(r.success).toBe(false)
    expect(mensagensDe(r, 'nomes')[0]).toMatch(`no máximo ${LIMITE_CARACTERES} caracteres`)
  })

  it(`${LIMITE_NOMES} nomes passam`, () => {
    const r = esquemaAdicionarFormas.safeParse({ nomes: lista(LIMITE_NOMES) })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.nomes.nomes).toHaveLength(LIMITE_NOMES)
  })

  it(`${LIMITE_NOMES + 1} nomes são recusados no campo nomes`, () => {
    const r = esquemaAdicionarFormas.safeParse({ nomes: lista(LIMITE_NOMES + 1) })
    expect(r.success).toBe(false)
    expect(mensagensDe(r, 'nomes')[0]).toMatch(`no máximo ${LIMITE_NOMES} nomes`)
  })

  it(`duplicatas do lote não contam para o limite de ${LIMITE_NOMES}`, () => {
    const r = esquemaAdicionarFormas.safeParse({ nomes: `${lista(LIMITE_NOMES)}, item 1, ITEM 2` })
    expect(r.success).toBe(true)
  })

  it('lote vazio ou só vírgulas é recusado no campo nomes', () => {
    for (const nomes of ['', ' , ,, ']) {
      const r = esquemaAdicionarCategorias.safeParse({ nomes, tipo: 'despesa' })
      expect(r.success).toBe(false)
      expect(mensagensDe(r, 'nomes')[0]).toBe('Informe ao menos um nome.')
    }
  })

  it('tipo fora da lista é recusado em português', () => {
    const r = esquemaAdicionarCategorias.safeParse({ nomes: 'Pet', tipo: 'transferencia' })
    expect(r.success).toBe(false)
    expect(mensagensDe(r, 'tipo')[0]).toBe('Escolha uma das opções válidas.')
  })

  it('campo family_id vindo do cliente é descartado, não repassado', () => {
    const r = esquemaAdicionarCategorias.safeParse({ nomes: 'Pet', tipo: 'despesa', family_id: 'x' })
    expect(r.success).toBe(true)
    if (r.success) expect('family_id' in r.data).toBe(false)
  })
})

describe('renomear', () => {
  it(`aceita ${LIMITE_CARACTERES} caracteres e devolve o nome limpo`, () => {
    const r = esquemaRenomear.safeParse({ id: crypto.randomUUID(), nome: `  ${'b'.repeat(LIMITE_CARACTERES)}  ` })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.nome).toBe('b'.repeat(LIMITE_CARACTERES))
  })

  it(`recusa ${LIMITE_CARACTERES + 1} caracteres e nome vazio`, () => {
    expect(esquemaRenomear.safeParse({ id: crypto.randomUUID(), nome: 'b'.repeat(LIMITE_CARACTERES + 1) }).success).toBe(false)
    const vazio = esquemaRenomear.safeParse({ id: crypto.randomUUID(), nome: '   ' })
    expect(mensagensDe(vazio, 'nome')[0]).toBe('Informe o nome.')
  })

  it('colapsa espaço interno antes de contar', () => {
    const r = esquemaRenomear.safeParse({ id: crypto.randomUUID(), nome: 'Pet    Shop' })
    expect(r.success && r.data.nome).toBe('Pet Shop')
  })

  it('id que não é uuid é recusado', () => {
    expect(esquemaRenomear.safeParse({ id: '1', nome: 'Pet' }).success).toBe(false)
  })
})

describe('regra do ciclo do cartão (CHECK accounts_cartao_tem_ciclo)', () => {
  it('cartão sem os dois dias: erro em cada campo', () => {
    const erros = validarCicloDoCartao('cartao', null, undefined)
    expect(Object.keys(erros).sort()).toEqual(['diaFechamento', 'diaVencimento'])
  })

  it('cartão com os dois dias: sem erro', () => {
    expect(validarCicloDoCartao('cartao', 5, 12)).toEqual({})
  })

  it('não-cartão com dia: erro no campo informado', () => {
    expect(Object.keys(validarCicloDoCartao('corrente', 5, null))).toEqual(['diaFechamento'])
    expect(Object.keys(validarCicloDoCartao('beneficio', null, 10))).toEqual(['diaVencimento'])
  })

  it('não-cartão sem dia: sem erro', () => {
    expect(validarCicloDoCartao('investimento', null, undefined)).toEqual({})
  })
})

describe('criar conta', () => {
  const base = { nome: 'Nubank', saldoInicial: 0 }

  it('cartão sem dias é recusado com erro por campo', () => {
    const r = esquemaCriarConta.safeParse({ ...base, tipo: 'cartao' })
    expect(r.success).toBe(false)
    expect(mensagensDe(r, 'diaFechamento')).toHaveLength(1)
    expect(mensagensDe(r, 'diaVencimento')).toHaveLength(1)
  })

  it('cartão com dias 1 e 31 passa', () => {
    expect(esquemaCriarConta.safeParse({ ...base, tipo: 'cartao', diaFechamento: 1, diaVencimento: 31 }).success).toBe(true)
  })

  it('dia 0 e 32 são recusados', () => {
    expect(esquemaCriarConta.safeParse({ ...base, tipo: 'cartao', diaFechamento: 0, diaVencimento: 10 }).success).toBe(false)
    expect(esquemaCriarConta.safeParse({ ...base, tipo: 'cartao', diaFechamento: 10, diaVencimento: 32 }).success).toBe(false)
  })

  it('conta corrente com dia de fechamento é recusada no campo', () => {
    const r = esquemaCriarConta.safeParse({ ...base, tipo: 'corrente', diaFechamento: 5 })
    expect(r.success).toBe(false)
    expect(mensagensDe(r, 'diaFechamento')).toHaveLength(1)
  })

  it('saldo inicial negativo é permitido e o padrão é 0', () => {
    expect(esquemaCriarConta.safeParse({ ...base, tipo: 'corrente', saldoInicial: -150.5 }).success).toBe(true)
    const r = esquemaCriarConta.safeParse({ nome: 'Conta', tipo: 'corrente' })
    expect(r.success && r.data.saldoInicial).toBe(0)
  })

  it('saldo inicial é arredondado ao centavo', () => {
    const r = esquemaCriarConta.safeParse({ ...base, tipo: 'corrente', saldoInicial: 10.005 })
    expect(r.success && r.data.saldoInicial).toBe(10.01)
  })

  it('saldo inicial fora da faixa de numeric(14,2) é recusado', () => {
    expect(esquemaCriarConta.safeParse({ ...base, tipo: 'corrente', saldoInicial: 1e12 }).success).toBe(false)
    expect(esquemaCriarConta.safeParse({ ...base, tipo: 'corrente', saldoInicial: Number.NaN }).success).toBe(false)
  })
})

describe('editar conta', () => {
  it('aceita só o nome', () => {
    expect(esquemaEditarConta.safeParse({ id: crypto.randomUUID(), nome: 'Nova' }).success).toBe(true)
  })

  it('não aceita trocar o tipo: o campo é descartado', () => {
    const r = esquemaEditarConta.safeParse({ id: crypto.randomUUID(), tipo: 'cartao' })
    expect(r.success).toBe(true)
    if (r.success) expect('tipo' in r.data).toBe(false)
  })
})
