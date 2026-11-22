import { describe, it, expect } from 'vitest'
import { arredondarMoeda } from '@/lib/format'

describe('Arredondamento decimal-safe em valores monetários (P-009 / Rodada 22)', () => {
  it('arredonda corretamente casos de borda de ponto flutuante binário', () => {
    // Casos de borda de ponto flutuante especificados no briefing
    expect(arredondarMoeda(1.005)).toBe(1.01)
    expect(arredondarMoeda(10.075)).toBe(10.08)
    expect(arredondarMoeda(1.004)).toBe(1.0)
    expect(arredondarMoeda(100.0)).toBe(100.0)
    expect(arredondarMoeda(0.1 + 0.2)).toBe(0.3) // 0.30000000000000004 → 0.30
  })

  it('lida com números com 1 ou 2 casas decimais e inteiros', () => {
    expect(arredondarMoeda(0)).toBe(0)
    expect(arredondarMoeda(12.5)).toBe(12.5)
    expect(arredondarMoeda(47.9)).toBe(47.9)
    expect(arredondarMoeda(1250.99)).toBe(1250.99)
    expect(arredondarMoeda(99999999.99)).toBe(99999999.99)
  })
})
