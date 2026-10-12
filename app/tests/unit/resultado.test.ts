import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  falha,
  falhaDeValidacao,
  sucesso,
  traduzErroDoBanco,
} from '@/actions/resultado'

describe('forma do resultado', () => {
  it('sucesso sem dados tem ok true', () => {
    expect(sucesso()).toEqual({ ok: true, dados: undefined })
  })

  it('sucesso com dados devolve os dados', () => {
    expect(sucesso({ id: 'abc' })).toEqual({ ok: true, dados: { id: 'abc' } })
  })

  it('falha sem campos nao inclui camposComErro', () => {
    const r = falha('deu errado')
    expect(r).toEqual({ ok: false, erro: 'deu errado' })
    expect('camposComErro' in r).toBe(false)
  })
})

describe('falhaDeValidacao — Zod 3 .flatten().fieldErrors', () => {
  const esquema = z.object({
    email: z.string().email('E-mail inválido.'),
    senha: z.string().min(8, 'Senha curta.'),
  })

  it('mapeia campo -> mensagens', () => {
    const analise = esquema.safeParse({ email: 'nao-e-email', senha: '123' })
    expect(analise.success).toBe(false)
    if (analise.success) return

    const r = falhaDeValidacao(analise.error)
    expect(r.ok).toBe(false)
    if (r.ok) return

    expect(r.camposComErro).toEqual({
      email: ['E-mail inválido.'],
      senha: ['Senha curta.'],
    })
  })

  it('so inclui o campo que falhou', () => {
    const analise = esquema.safeParse({ email: 'a@b.com', senha: '123' })
    if (analise.success) throw new Error('deveria falhar')

    const r = falhaDeValidacao(analise.error)
    if (r.ok) return

    expect(Object.keys(r.camposComErro ?? {})).toEqual(['senha'])
  })
})

/**
 * L-004: traduzErroDoBanco decide se texto cru do Postgres chega ao usuário.
 * É uma decisão de segurança, logo é executada contra casos que devem e que
 * não devem passar.
 */
describe('traduzErroDoBanco — mensagem crua nunca vaza', () => {
  const GENERICA = 'Não foi possível concluir. Tente de novo em instantes.'

  const devemPassar: Array<[string, string]> = [
    ['Você precisa estar logado para entrar em uma família', 'exigencia de login'],
    ['Você já faz parte de uma família', 'ja tem familia'],
    ['Código de convite não encontrado', 'codigo errado'],
    ['Esta família já está completa', 'familia cheia'],
    ['Conta não encontrada nesta família', 'conta de outra familia'],
    ['Lançamento não encontrado', 'lancamento inexistente'],
    ['Não é permitido mudar a família de um membro', 'trigger de congelamento'],
  ]

  for (const [mensagem, caso] of devemPassar) {
    it(`repassa mensagem de negocio: ${caso}`, () => {
      expect(traduzErroDoBanco({ message: mensagem })).toBe(mensagem)
    })
  }

  it('repassa mensagem com valor interpolado no fim', () => {
    expect(traduzErroDoBanco({ message: 'Número de parcelas inválido: 0' })).toBe(
      'Número de parcelas inválido: 0',
    )
  })

  const naoDevemPassar = [
    'new row for relation "transactions" violates check constraint "tx_pago_tem_data"',
    'duplicate key value violates unique constraint "families_join_code_key"',
    'permission denied for table family_members',
    'column t.familyid does not exist',
    'relation "public.transactions" does not exist',
    'insert or update on table "accounts" violates foreign key constraint',
  ]

  for (const mensagem of naoDevemPassar) {
    it(`NAO repassa texto cru do postgres: ${mensagem.slice(0, 40)}...`, () => {
      const traduzida = traduzErroDoBanco({ message: mensagem })
      expect(traduzida).toBe(GENERICA)
      // Nenhum nome de tabela, coluna ou constraint sobrevive.
      expect(traduzida).not.toContain('constraint')
      expect(traduzida).not.toContain('relation')
      expect(traduzida).not.toContain('transactions')
      expect(traduzida).not.toContain('family_members')
    })
  }

  const porCodigo: Array<[string, string]> = [
    ['23514', 'Esses dados não são válidos para esta operação. Confira e tente de novo.'],
    ['23505', 'Esse registro já existe.'],
    ['23503', 'Um dos itens escolhidos não existe mais. Recarregue a página.'],
    ['23502', 'Falta preencher um campo obrigatório.'],
    ['42501', 'Você não tem permissão para fazer isso.'],
  ]

  for (const [codigo, esperado] of porCodigo) {
    it(`traduz SQLSTATE ${codigo} sem usar a mensagem crua`, () => {
      const traduzida = traduzErroDoBanco({
        code: codigo,
        message: 'violates check constraint "tx_pago_tem_data" on table "transactions"',
      })
      expect(traduzida).toBe(esperado)
    })
  }

  it('mensagem de negocio tem prioridade sobre o codigo', () => {
    // O trigger levanta 23514 COM mensagem em português: a mensagem ganha.
    expect(
      traduzErroDoBanco({
        code: '23514',
        message: 'Não é permitido mudar a família de um membro',
      }),
    ).toBe('Não é permitido mudar a família de um membro')
  })

  it('erro nulo ou vazio cai na generica', () => {
    expect(traduzErroDoBanco(null)).toBe(GENERICA)
    expect(traduzErroDoBanco(undefined)).toBe(GENERICA)
    expect(traduzErroDoBanco({})).toBe(GENERICA)
    expect(traduzErroDoBanco('string solta')).toBe(GENERICA)
  })
})
