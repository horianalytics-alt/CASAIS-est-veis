import { describe, expect, it } from 'vitest'
import {
  LIMITE_CARACTERES,
  LIMITE_NOMES,
  chaveDeComparacao,
  limparNome,
  separarNomes,
} from '@/lib/lista-nomes'

describe('separarNomes', () => {
  it('exemplo do contrato: vírgula, espaços, item vazio e duplicata por caixa', () => {
    expect(separarNomes('Pet, Presentes ,, pet')).toEqual({
      nomes: ['Pet', 'Presentes'],
      descartados: ['pet'],
    })
  })

  it('separa por quebra de linha, inclusive CRLF de lista colada', () => {
    expect(separarNomes('Pet\nViagem\r\nPresentes')).toEqual({
      nomes: ['Pet', 'Viagem', 'Presentes'],
      descartados: [],
    })
  })

  it('mistura vírgula e quebra de linha', () => {
    expect(separarNomes('Pet, Viagem\nPresentes').nomes).toEqual(['Pet', 'Viagem', 'Presentes'])
  })

  it('apara as pontas e colapsa espaços internos (inclusive tab)', () => {
    expect(separarNomes('  Pet   Shop  ,\tViagem\t de  carro ').nomes).toEqual([
      'Pet Shop',
      'Viagem de carro',
    ])
  })

  it('duplicata sem diferenciar acento mantém a primeira grafia', () => {
    expect(separarNomes('Saúde, saude, SAÚDE')).toEqual({
      nomes: ['Saúde'],
      descartados: ['saude', 'SAÚDE'],
    })
  })

  it('texto vazio ou só separadores não produz nome', () => {
    expect(separarNomes('')).toEqual({ nomes: [], descartados: [] })
    expect(separarNomes(' , ,\n\n , ')).toEqual({ nomes: [], descartados: [] })
  })

  it('NÃO aplica limites: só separa (o Zod da action é quem recusa)', () => {
    const longo = 'x'.repeat(LIMITE_CARACTERES + 1)
    expect(separarNomes(longo).nomes).toEqual([longo])

    const muitos = Array.from({ length: LIMITE_NOMES + 1 }, (_, i) => `Item ${i}`).join(',')
    expect(separarNomes(muitos).nomes).toHaveLength(LIMITE_NOMES + 1)
  })
})

describe('limparNome e chaveDeComparacao', () => {
  it('limparNome apara e colapsa, sem mudar caixa nem acento', () => {
    expect(limparNome('  Saúde   da  família ')).toBe('Saúde da família')
  })

  it('chaveDeComparacao ignora caixa, acento e espaço extra', () => {
    expect(chaveDeComparacao(' Saúde  ')).toBe(chaveDeComparacao('SAUDE'))
    expect(chaveDeComparacao('Débito')).toBe(chaveDeComparacao('debito'))
    expect(chaveDeComparacao('Pet')).not.toBe(chaveDeComparacao('Pets'))
  })
})

describe('constantes compartilhadas com o front', () => {
  it('valem 40 caracteres e 50 nomes', () => {
    expect(LIMITE_CARACTERES).toBe(40)
    expect(LIMITE_NOMES).toBe(50)
  })
})
