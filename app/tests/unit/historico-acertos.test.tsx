import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver

import { render, screen, cleanup } from '@testing-library/react'
import {
  buscarTransacoesAcerto,
  mapearRegistrosAcerto,
  type LinhaTransacaoAcerto,
} from '@/lib/queries/acerto'
import { ResumoAcerto } from '@/components/acerto/resumo-acerto'
import type { RegistroAcerto } from '@/features/acerto/tipos'
import type { ClienteServidor } from '@/actions/contexto-familia'

// Mock haptics & confetti
vi.mock('@/lib/haptics', () => ({
  hapticFeedback: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/components/ui/confetti-celebracao', () => ({
  ConfettiCelebracao: () => null,
}))
vi.mock('@/components/acerto/dialogo-acertar', () => ({
  DialogoAcertar: () => <button>Mock Dialogo</button>,
}))

const MEMBRO_A = '11111111-1111-4111-8111-111111111111'
const MEMBRO_B = '22222222-2222-4222-8222-222222222222'

describe('Histórico de Acertos (Rodada 19)', () => {
  afterEach(cleanup)

  describe('buscarTransacoesAcerto', () => {
    it('executa a consulta no banco com os filtros e ordenações corretos', async () => {
      const dadosMock = [
        {
          id: 'tx-1',
          date: '2026-11-20',
          amount: 100,
          paid_by_member_id: MEMBRO_A,
          settlement_to_member_id: MEMBRO_B,
          created_by_member_id: MEMBRO_A,
        },
      ]

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: dadosMock, error: null }),
      }

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQuery),
      } as unknown as ClienteServidor

      const res = await buscarTransacoesAcerto(mockSupabase)

      expect(mockSupabase.from).toHaveBeenCalledWith('transactions')
      expect(mockQuery.not).toHaveBeenCalledWith('settlement_to_member_id', 'is', null)
      expect(mockQuery.order).toHaveBeenCalledWith('date', { ascending: false })
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockQuery.limit).toHaveBeenCalledWith(20)
      expect(res).toEqual(dadosMock)
    })

    it('retorna lista vazia em caso de erro na consulta', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Erro no banco' } }),
      }

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQuery),
      } as unknown as ClienteServidor

      const res = await buscarTransacoesAcerto(mockSupabase)
      expect(res).toEqual([])
    })
  })

  describe('mapearRegistrosAcerto', () => {
    it('mapeia linhas de transação e resolve nomes de pagador e receptor', () => {
      const mapaNomes = new Map<string, string>([
        [MEMBRO_A, 'Heitor'],
        [MEMBRO_B, 'Mariana'],
      ])

      const linhas: LinhaTransacaoAcerto[] = [
        {
          id: 'tx-1',
          date: '2026-11-20',
          amount: 150.5,
          paid_by_member_id: MEMBRO_A,
          settlement_to_member_id: MEMBRO_B,
          created_by_member_id: MEMBRO_A,
        },
      ]

      const resultado = mapearRegistrosAcerto(linhas, mapaNomes)

      expect(resultado).toHaveLength(1)
      expect(resultado[0]).toEqual({
        id: 'tx-1',
        date: '2026-11-20',
        amount: 150.5,
        pagadorId: MEMBRO_A,
        pagadorNome: 'Heitor',
        receptorId: MEMBRO_B,
        receptorNome: 'Mariana',
      })
    })

    it('aplica fallback "Membro" quando o id não está no mapa de nomes', () => {
      const mapaNomes = new Map<string, string>()

      const linhas: LinhaTransacaoAcerto[] = [
        {
          id: 'tx-2',
          date: '2026-11-21',
          amount: 200,
          paid_by_member_id: 'outro-membro',
          settlement_to_member_id: 'membro-desconhecido',
          created_by_member_id: 'outro-membro',
        },
      ]

      const resultado = mapearRegistrosAcerto(linhas, mapaNomes)

      expect(resultado[0].pagadorNome).toBe('Membro')
      expect(resultado[0].receptorNome).toBe('Membro')
    })

    it('ignora transações sem settlement_to_member_id', () => {
      const mapaNomes = new Map<string, string>()
      const linhas: LinhaTransacaoAcerto[] = [
        {
          id: 'tx-3',
          date: '2026-11-22',
          amount: 50,
          paid_by_member_id: MEMBRO_A,
          settlement_to_member_id: null,
          created_by_member_id: MEMBRO_A,
        },
      ]

      const resultado = mapearRegistrosAcerto(linhas, mapaNomes)
      expect(resultado).toHaveLength(0)
    })
  })

  describe('ResumoAcerto — Seção de Histórico', () => {
    const linhasBase = [
      {
        member_id: MEMBRO_A,
        display_name: 'Heitor',
        balance: 0,
        share: 0.5,
        total_paid: 100,
        total_owed: 100,
        total_settled_received: 0,
        total_settled_sent: 0,
        family_id: 'fam-1',
      },
      {
        member_id: MEMBRO_B,
        display_name: 'Mariana',
        balance: 0,
        share: 0.5,
        total_paid: 100,
        total_owed: 100,
        total_settled_received: 0,
        total_settled_sent: 0,
        family_id: 'fam-1',
      },
    ]

    it('NÃO renderiza a seção de histórico quando o array for vazio', () => {
      render(
        <ResumoAcerto
          linhas={linhasBase}
          regra="equal"
          transferencia={null}
          historico={[]}
        />,
      )

      expect(screen.queryByRole('heading', { name: /histórico de acertos/i })).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/histórico de acertos/i)).not.toBeInTheDocument()
    })

    it('renderiza a seção de histórico com nomes, data formatada e valor quando houver registros', () => {
      const historicoMock: RegistroAcerto[] = [
        {
          id: 'acerto-1',
          date: '2026-11-15',
          amount: 250,
          pagadorId: MEMBRO_A,
          pagadorNome: 'Heitor',
          receptorId: MEMBRO_B,
          receptorNome: 'Mariana',
        },
      ]

      render(
        <ResumoAcerto
          linhas={linhasBase}
          regra="equal"
          transferencia={null}
          historico={historicoMock}
        />,
      )

      const titulo = screen.getByRole('heading', { name: /histórico de acertos/i })
      expect(titulo).toBeInTheDocument()

      expect(screen.getByText('Heitor → Mariana')).toBeInTheDocument()
      expect(screen.getByText(/15 de novembro de 2026/i)).toBeInTheDocument()
      expect(screen.getByText(/250/)).toBeInTheDocument()
    })
  })
})
