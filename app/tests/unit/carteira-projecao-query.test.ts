// @vitest-environment node
/**
 * lerDadosProjecaoCarteira (src/lib/queries/carteira-projecao.ts).
 * Plano: docs/planos/dash-grafico-projecao-caixinha.md §4.2.
 * Cliente falso: só a forma da cadeia do supabase-js que a função usa.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { lerDadosProjecaoCarteira, TAMANHO_PAGINA } from '@/lib/queries/carteira-projecao'

type Linha = { box_id: string; kind: string; amount_cents: number; occurred_on: string }

function clienteFalso(opcoes: {
  movimentos: Linha[]
  erroMovimentos?: { message: string }
  /** Teto de linhas por resposta do servidor (max_rows do PostgREST). */
  tetoServidor?: number
  pendentes?: { caixinha_id: string; competencia: string; rendimento_cents: number }[]
  erroPendentes?: { message: string }
}) {
  const chamadas: { filtros: [string, unknown][]; ordens: string[]; faixas: [number, number][] } = {
    filtros: [],
    ordens: [],
    faixas: [],
  }
  const consulta = {
    select: () => consulta,
    eq: (c: string, v: unknown) => (chamadas.filtros.push([c, v]), consulta),
    order: (c: string) => (chamadas.ordens.push(c), consulta),
    range: (de: number, ate: number) => {
      chamadas.faixas.push([de, ate])
      if (opcoes.erroMovimentos) return Promise.resolve({ data: null, error: opcoes.erroMovimentos })
      const fim = Math.min(ate + 1, de + (opcoes.tetoServidor ?? Infinity))
      return Promise.resolve({ data: opcoes.movimentos.slice(de, fim), error: null })
    },
  }
  const cliente = {
    from: (tabela: string) => {
      expect(tabela).toBe('investment_box_movements')
      return consulta
    },
    rpc: (nome: string) => {
      expect(nome).toBe('carteira_rendimentos_pendentes')
      return Promise.resolve(
        opcoes.erroPendentes ? { data: null, error: opcoes.erroPendentes } : { data: opcoes.pendentes ?? [], error: null },
      )
    },
  }
  return { cliente: cliente as never, chamadas }
}

const linha = (i: number, kind = 'entrada'): Linha => ({
  box_id: 'cx-1',
  kind,
  amount_cents: 100 + i,
  occurred_on: '2026-07-01',
})

describe('lerDadosProjecaoCarteira', () => {
  it('filtra pela família, ordena de forma estável e mapeia os campos', async () => {
    const { cliente, chamadas } = clienteFalso({
      movimentos: [linha(0), linha(1, 'saida')],
      pendentes: [{ caixinha_id: 'cx-1', competencia: '2026-08-01', rendimento_cents: 1010 }],
    })
    const r = await lerDadosProjecaoCarteira(cliente, 'fam-a')
    // duas chamadas: a página com dados e a vazia que encerra o laço; ambas filtradas e ordenadas
    expect(chamadas.faixas).toHaveLength(2)
    expect(chamadas.filtros).toEqual([['family_id', 'fam-a'], ['family_id', 'fam-a']])
    expect(chamadas.ordens).toEqual(['occurred_on', 'id', 'occurred_on', 'id'])
    expect(r).toMatchObject({
      ok: true,
      movimentos: [
        { caixinhaId: 'cx-1', tipo: 'entrada', valorCentavos: 100, ocorridoEm: '2026-07-01' },
        { caixinhaId: 'cx-1', tipo: 'saida', valorCentavos: 101, ocorridoEm: '2026-07-01' },
      ],
      pendentes: [{ caixinhaId: 'cx-1', competencia: '2026-08-01', valorCentavos: 1010 }],
    })
  })

  it('pagina além do max_rows (1000) e só para na primeira página vazia', async () => {
    const total = TAMANHO_PAGINA * 2 + 5
    const { cliente, chamadas } = clienteFalso({ movimentos: Array.from({ length: total }, (_, i) => linha(i)) })
    const r = await lerDadosProjecaoCarteira(cliente, 'fam-a')
    expect(r.ok && r.movimentos.length).toBe(total)
    expect(chamadas.faixas).toEqual([
      [0, TAMANHO_PAGINA - 1],
      [TAMANHO_PAGINA, 2 * TAMANHO_PAGINA - 1],
      [2 * TAMANHO_PAGINA, 3 * TAMANHO_PAGINA - 1],
      [total, total + TAMANHO_PAGINA - 1],
    ])
  })

  it('servidor com max_rows MENOR que a página (500): não pula nem trunca linhas', async () => {
    const total = 1203
    const { cliente } = clienteFalso({
      movimentos: Array.from({ length: total }, (_, i) => linha(i)),
      tetoServidor: 500,
    })
    const r = await lerDadosProjecaoCarteira(cliente, 'fam-a')
    expect(r.ok && r.movimentos.length).toBe(total)
    // cada linha lida uma vez só, na ordem: o valor carrega o índice (100 + i)
    expect(r.ok && r.movimentos.map((m) => m.valorCentavos)).toEqual(Array.from({ length: total }, (_, i) => 100 + i))
  })

  it('sem movimentos: uma única chamada, vazia, e ok', async () => {
    const { cliente, chamadas } = clienteFalso({ movimentos: [] })
    const r = await lerDadosProjecaoCarteira(cliente, 'fam-a')
    expect(r).toMatchObject({ ok: true, movimentos: [] })
    expect(chamadas.faixas).toHaveLength(1)
  })

  it('kind desconhecido -> { ok: false } (nunca soma o que não sabe somar)', async () => {
    const { cliente } = clienteFalso({ movimentos: [linha(0, 'ajuste')] })
    expect(await lerDadosProjecaoCarteira(cliente, 'fam-a')).toEqual({ ok: false })
  })

  it('erro nos movimentos ou nos pendentes -> { ok: false }, nunca lista vazia', async () => {
    expect(await lerDadosProjecaoCarteira(clienteFalso({ movimentos: [], erroMovimentos: { message: 'x' } }).cliente, 'f')).toEqual({ ok: false })
    expect(await lerDadosProjecaoCarteira(clienteFalso({ movimentos: [], erroPendentes: { message: 'x' } }).cliente, 'f')).toEqual({ ok: false })
  })
})
