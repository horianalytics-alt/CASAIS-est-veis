/**
 * Prova da validação que ANTECIPA os CHECK do banco.
 *
 * L-004: estas expressões decidem se o lançamento é bloqueado antes da RPC.
 * Cada regra é executada contra o caso que DEVE e o que NÃO DEVE passar.
 *
 * O esquema é reconstruído aqui porque o módulo de action é 'use server' e
 * importá-lo num teste jsdom arrastaria o runtime do Next. As regras espelhadas
 * são as mesmas, e o teste falha se a regra do banco mudar sem este arquivo
 * mudar junto.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isValidISODate } from '@/lib/format'
// Importado pelo efeito colateral: é este módulo que registra o mapa de erros
// em português do Zod, exatamente como acontece em toda action.
import '@/actions/resultado'

const dataISO = z.string().trim().refine((v) => isValidISODate(v), 'Data inválida.')

const valor = z
  .union([z.string(), z.number()], {
    required_error: 'Informe o valor.',
    invalid_type_error: 'Valor inválido.',
  })
  .transform((entrada, ctx) => {
    let numero: number
    if (typeof entrada === 'number') {
      numero = entrada
    } else {
      const limpo = entrada.trim()
      if (limpo === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o valor.' })
        return z.NEVER
      }
      const ultimaVirgula = limpo.lastIndexOf(',')
      const ultimoPonto = limpo.lastIndexOf('.')
      const semMoeda = limpo.replace(/[^\d.,-]/g, '')
      const normalizado =
        ultimaVirgula > ultimoPonto
          ? semMoeda.replace(/\./g, '').replace(',', '.')
          : semMoeda.replace(/,/g, '')
      numero = Number(normalizado)
      if (normalizado === '' || Number.isNaN(numero)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Valor inválido.' })
        return z.NEVER
      }
    }
    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Valor inválido.' })
      return z.NEVER
    }
    if (numero <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O valor precisa ser maior que zero.',
      })
      return z.NEVER
    }
    if (numero > 99_999_999.99) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Esse valor é alto demais.' })
      return z.NEVER
    }
    return Math.round(numero * 100) / 100
  })

const esquemaItem = z
  .object({
    tipo: z.enum(['receita', 'despesa']),
    descricao: z.string().trim().min(1, 'Descreva o lançamento.').max(120),
    valor,
    data: dataISO,
    contaId: z.string().uuid('Escolha uma opção válida.'),
    responsavelId: z.string().uuid().nullish(),
    cotaDoResponsavel: z.number().min(0).max(1).nullish(),
    estaPago: z.boolean().default(false),
    dataDoPagamento: dataISO.nullish(),
  })
  .refine((i) => !i.estaPago || i.dataDoPagamento != null, {
    message: 'Informe a data do pagamento.',
    path: ['dataDoPagamento'],
  })
  .refine((i) => i.estaPago || i.dataDoPagamento == null, {
    message: 'Só preencha a data do pagamento se já estiver pago.',
    path: ['dataDoPagamento'],
  })
  .refine((i) => i.cotaDoResponsavel == null || i.responsavelId != null, {
    message: 'Escolha de quem é a cota.',
    path: ['responsavelId'],
  })

const CONTA = '11111111-1111-4111-8111-111111111111'
const MEMBRO = '22222222-2222-4222-8222-222222222222'

const base = {
  tipo: 'despesa' as const,
  descricao: 'Mercado',
  valor: '120,50',
  data: '2026-10-11',
  contaId: CONTA,
}

describe('CHECK amount > 0 — o sinal vem do tipo, nao do valor', () => {
  const devemPassar: Array<[unknown, number]> = [
    ['120,50', 120.5],
    ['1.250,99', 1250.99],
    ['1250.99', 1250.99],
    ['R$ 80,00', 80],
    [0.01, 0.01],
    [99_999_999.99, 99_999_999.99],
    ['10,005', 10.01], // numeric(14,2): arredonda aqui, não no banco
  ]

  for (const [entrada, esperado] of devemPassar) {
    it(`aceita ${JSON.stringify(entrada)} -> ${esperado}`, () => {
      const r = esquemaItem.safeParse({ ...base, valor: entrada })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.valor).toBe(esperado)
    })
  }

  const naoDevemPassar: Array<[unknown, string]> = [
    // null/undefined/objeto são barrados pelo union, ANTES do transform.
    // `undefined` é campo ausente, logo usa o required_error do union; `null` e
    // objeto viram invalid_union, que IGNORA o invalid_type_error e só é salvo
    // do 'Invalid input' em inglês pelo mapa de erros global de resultado.ts.
    [undefined, 'Informe o valor.'],
    [null, 'Valor inválido.'],
    [{}, 'Valor inválido.'],
    [[], 'Valor inválido.'],
    [0, 'O valor precisa ser maior que zero.'],
    ['0', 'O valor precisa ser maior que zero.'],
    ['0,00', 'O valor precisa ser maior que zero.'],
    [-50, 'O valor precisa ser maior que zero.'],
    ['-120,50', 'O valor precisa ser maior que zero.'],
    ['', 'Informe o valor.'],
    ['abc', 'Valor inválido.'],
    [Number.NaN, 'Valor inválido.'],
    [Number.POSITIVE_INFINITY, 'Valor inválido.'],
    [100_000_000, 'Esse valor é alto demais.'],
  ]

  for (const [entrada, mensagem] of naoDevemPassar) {
    it(`rejeita ${JSON.stringify(entrada)} com "${mensagem}"`, () => {
      const r = esquemaItem.safeParse({ ...base, valor: entrada })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues.map((i) => i.message)).toContain(mensagem)
      }
    })
  }
})

describe('CHECK tx_pago_tem_data — pago <-> paid_date', () => {
  it('pago COM data passa', () => {
    const r = esquemaItem.safeParse({
      ...base,
      estaPago: true,
      dataDoPagamento: '2026-10-11',
    })
    expect(r.success).toBe(true)
  })

  it('nao pago SEM data passa', () => {
    const r = esquemaItem.safeParse({ ...base, estaPago: false })
    expect(r.success).toBe(true)
  })

  it('nao pago com data NULA explicita passa', () => {
    const r = esquemaItem.safeParse({
      ...base,
      estaPago: false,
      dataDoPagamento: null,
    })
    expect(r.success).toBe(true)
  })

  it('pago SEM data e barrado antes da RPC', () => {
    const r = esquemaItem.safeParse({ ...base, estaPago: true })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.dataDoPagamento).toEqual([
        'Informe a data do pagamento.',
      ])
    }
  })

  it('nao pago COM data e barrado antes da RPC', () => {
    const r = esquemaItem.safeParse({
      ...base,
      estaPago: false,
      dataDoPagamento: '2026-10-11',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.dataDoPagamento).toEqual([
        'Só preencha a data do pagamento se já estiver pago.',
      ])
    }
  })
})

describe('CHECK tx_cota_exige_responsavel', () => {
  it('cota COM responsavel passa', () => {
    const r = esquemaItem.safeParse({
      ...base,
      responsavelId: MEMBRO,
      cotaDoResponsavel: 0.5,
    })
    expect(r.success).toBe(true)
  })

  it('sem cota e sem responsavel passa', () => {
    expect(esquemaItem.safeParse(base).success).toBe(true)
  })

  it('cota SEM responsavel e barrada', () => {
    const r = esquemaItem.safeParse({ ...base, cotaDoResponsavel: 0.5 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.responsavelId).toEqual([
        'Escolha de quem é a cota.',
      ])
    }
  })

  it('cota fora de 0..1 e barrada (CHECK owner_share BETWEEN 0 AND 1)', () => {
    for (const cota of [-0.1, 1.5, 2]) {
      const r = esquemaItem.safeParse({
        ...base,
        responsavelId: MEMBRO,
        cotaDoResponsavel: cota,
      })
      expect(r.success, `cota ${cota} deveria falhar`).toBe(false)
    }
  })
})

describe('data e descricao', () => {
  it('data invalida e barrada', () => {
    for (const data of ['2026-02-30', '2026-13-01', '11/10/2026', '', 'hoje']) {
      const r = esquemaItem.safeParse({ ...base, data })
      expect(r.success, `data ${data} deveria falhar`).toBe(false)
    }
  })

  it('29/02 de ano bissexto passa e de ano comum nao', () => {
    expect(esquemaItem.safeParse({ ...base, data: '2028-02-29' }).success).toBe(true)
    expect(esquemaItem.safeParse({ ...base, data: '2027-02-29' }).success).toBe(false)
  })

  it('descricao so de espaco e barrada (CHECK length(btrim) > 0)', () => {
    const r = esquemaItem.safeParse({ ...base, descricao: '   ' })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.descricao).toEqual([
        'Descreva o lançamento.',
      ])
    }
  })

  it('contaId que nao e uuid e barrado', () => {
    const r = esquemaItem.safeParse({ ...base, contaId: 'nao-e-uuid' })
    expect(r.success).toBe(false)
  })

  it('tipo fora desta fatia e barrado', () => {
    for (const tipo of ['transferencia', 'investimento', 'qualquer']) {
      const r = esquemaItem.safeParse({ ...base, tipo })
      expect(r.success, `tipo ${tipo} deveria falhar`).toBe(false)
    }
  })
})

/**
 * Toda mensagem que a Fachada pode renderizar precisa estar em português.
 * O padrão em inglês do Zod ('Invalid input', 'Required', 'Expected ...') é
 * texto de biblioteca e não pode chegar à tela do usuário.
 */
describe('nenhuma mensagem em ingles escapa para a tela', () => {
  const INGLES = [
    'Invalid input',
    'Required',
    'Expected',
    'Invalid uuid',
    'invalid_type',
    'String must contain',
    'Number must be',
  ]

  const entradasRuins: unknown[] = [
    {},
    null,
    undefined,
    { ...base, valor: null },
    { ...base, valor: undefined },
    { ...base, valor: {} },
    { ...base, valor: [] },
    { ...base, valor: 'abc' },
    { ...base, valor: -1 },
    { ...base, descricao: '' },
    { ...base, descricao: '   ' },
    { ...base, descricao: 'x'.repeat(200) },
    { ...base, data: 'ontem' },
    { ...base, data: null },
    { ...base, contaId: 'nao-e-uuid' },
    { ...base, contaId: null },
    { ...base, tipo: 'transferencia' },
    { ...base, tipo: null },
    { ...base, estaPago: true },
    { ...base, estaPago: false, dataDoPagamento: '2026-10-11' },
    { ...base, cotaDoResponsavel: 0.5 },
    { ...base, responsavelId: MEMBRO, cotaDoResponsavel: 9 },
    { ...base, estaPago: 'sim' },
  ]

  for (const [indice, entrada] of entradasRuins.entries()) {
    it(`entrada ruim #${indice} nao produz texto em ingles`, () => {
      const r = esquemaItem.safeParse(entrada)
      expect(r.success, 'esta entrada deveria falhar').toBe(false)
      if (r.success) return

      for (const issue of r.error.issues) {
        for (const termo of INGLES) {
          expect(
            issue.message,
            `issue "${issue.message}" (campo ${issue.path.join('.') || '<raiz>'}) vazou texto em ingles`,
          ).not.toContain(termo)
        }
      }
    })
  }
})
