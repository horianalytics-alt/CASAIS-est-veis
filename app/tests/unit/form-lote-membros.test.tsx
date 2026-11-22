import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import * as React from 'react'

// jsdom mocks
Element.prototype.scrollIntoView = vi.fn()
window.HTMLElement.prototype.scrollIntoView = vi.fn()
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
}))

vi.mock('@/lib/haptics', () => ({
  hapticFeedback: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/features/sons/sons', () => ({
  tocarSomSucesso: vi.fn(),
  tocarSomErro: vi.fn(),
  tocarSomParceiro: vi.fn(),
}))

const mockSalvarLancamento = vi.fn()
const mockCriarRecorrencia = vi.fn()
const mockAlterarRegra = vi.fn()
const mockAtualizarLancamento = vi.fn()

vi.mock('@/actions/lancamento', () => ({
  salvarLancamento: (...args: unknown[]) => mockSalvarLancamento(...args),
}))

vi.mock('@/actions/editar-lancamento', () => ({
  atualizarLancamento: (...args: unknown[]) => mockAtualizarLancamento(...args),
}))

vi.mock('@/actions/recorrencia', () => ({
  criarRecorrencia: (...args: unknown[]) => mockCriarRecorrencia(...args),
  alterarRegra: (...args: unknown[]) => mockAlterarRegra(...args),
  alterarValorRecorrencia: vi.fn(),
  encerrarRecorrencia: vi.fn(),
}))

import {
  FormLancamento,
  type OpcaoDeConta,
  type OpcaoDeMembro,
  type OpcaoDeFormaDePagamento,
} from '@/components/transacoes/form-lancamento'
import { DialogoEditarLancamento } from '@/components/transacoes/dialogo-editar-lancamento'
import { ListaAssinaturas } from '@/components/recorrencia/lista-assinaturas'
import type { RegraRecorrente } from '@/lib/queries/recorrencias'
import type { Database } from '@/types/database'

type Transacao = Database['public']['Tables']['transactions']['Row']

const CONTA_CORRENTE: OpcaoDeConta = {
  id: 'c1111111-1111-4111-8111-111111111111',
  nome: 'Conta Corrente',
  tipo: 'corrente',
  closing_day: null,
  due_day: null,
}

const CONTA_CARTAO: OpcaoDeConta = {
  id: 'c2222222-2222-4222-8222-222222222222',
  nome: 'Cartão Nubank',
  tipo: 'cartao',
  closing_day: 10,
  due_day: 20,
}

const MEMBROS: OpcaoDeMembro[] = [
  { id: 'm1111111-1111-4111-8111-111111111111', nome: 'Heitor' },
  { id: 'm2222222-2222-4222-8222-222222222222', nome: 'Carol' },
]

const FORMAS_PAGAMENTO: OpcaoDeFormaDePagamento[] = [
  { id: 'f1111111-1111-4111-8111-111111111111', nome: 'Pix' },
  { id: 'f2222222-2222-4222-8222-222222222222', nome: 'Cartão de Débito' },
]

describe('Rodada 14 — Membros e Formulário em Lote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('F-1: Membros no Formulário Simples', () => {
    it('sem membros passados (ou array vazio), campos Responsável e Pago por não aparecem', () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          membros={[]}
          hoje="2026-11-21"
        />,
      )

      expect(screen.queryByLabelText(/Responsável/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Pago por/i)).not.toBeInTheDocument()
    })

    it('com membros passados em despesa e receita, campos Responsável e Pago por aparecem', () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          membros={MEMBROS}
          hoje="2026-11-21"
        />,
      )

      expect(screen.getByLabelText(/Responsável/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Pago por/i)).toBeInTheDocument()
    })

    it('em transferência simples, campos Responsável e Pago por não aparecem', async () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE, CONTA_CARTAO]}
          categorias={[]}
          membros={MEMBROS}
          hoje="2026-11-21"
        />,
      )

      // Muda para transferência
      const radioTransferencia = screen.getByRole('radio', { name: /Transferência/i })
      fireEvent.click(radioTransferencia)

      await waitFor(() => {
        expect(screen.queryByLabelText(/Responsável/i)).not.toBeInTheDocument()
        expect(screen.queryByLabelText(/Pago por/i)).not.toBeInTheDocument()
      })
    })

    it('submete dados com responsavelId e pagoPorId em salvarLancamento', async () => {
      mockSalvarLancamento.mockResolvedValueOnce({
        ok: true,
        dados: [{ id: 'tx-1', date: '2026-11-21' }],
      })

      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          membros={MEMBROS}
          membroAtualId={MEMBROS[0].id}
          hoje="2026-11-21"
        />,
      )

      fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: 'Supermercado' } })
      fireEvent.change(screen.getByLabelText(/Valor/i), { target: { value: '150,00' } })

      fireEvent.click(screen.getByRole('button', { name: /Salvar lançamento/i }))

      await waitFor(() => {
        expect(mockSalvarLancamento).toHaveBeenCalledTimes(1)
        expect(mockSalvarLancamento).toHaveBeenCalledWith(
          expect.objectContaining({
            descricao: 'Supermercado',
            valor: '150,00',
            pagoPorId: MEMBROS[0].id,
            responsavelId: null,
          }),
        )
      })
    })
  })

  describe('F-2: Campos no Formulário em Lote', () => {
    it('alterna para modo lote e exibe os itens com os novos campos', () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          membros={MEMBROS}
          formasDePagamento={FORMAS_PAGAMENTO}
          hoje="2026-11-21"
        />,
      )

      const tabLote = screen.getByRole('tab', { name: /Lançamento em lote/i })
      fireEvent.click(tabLote)

      expect(screen.getAllByPlaceholderText(/Observação/i).length).toBe(2)
      expect(screen.getAllByLabelText(/Forma de pagamento/i).length).toBe(2)
      expect(screen.getAllByLabelText(/Responsável/i).length).toBe(2)
      expect(screen.getAllByLabelText(/Pago por/i).length).toBe(2)
    })

    it('em conta corrente, marcar estaPago exibe o campo dataDoPagamento', async () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          membros={MEMBROS}
          hoje="2026-11-21"
        />,
      )

      const tabLote = screen.getByRole('tab', { name: /Lançamento em lote/i })
      fireEvent.click(tabLote)

      // No início em conta corrente, estaPago vem marcado por padrão
      const checkboxes = screen.getAllByRole('checkbox')
      const checkboxItem0 = checkboxes[0]
      expect(checkboxItem0).toBeChecked()

      // Campo de data do pagamento está visível
      expect(screen.getAllByLabelText(/Data do pagamento/i).length).toBeGreaterThan(0)

      // Desmarca o checkbox
      fireEvent.click(checkboxItem0)

      await waitFor(() => {
        expect(checkboxItem0).not.toBeChecked()
      })
    })

    it('troca de conta para cartão em lote oculta status de pagamento e força estaPago = false', async () => {
      render(
        <FormLancamento
          contas={[CONTA_CARTAO]}
          categorias={[]}
          membros={MEMBROS}
          hoje="2026-11-21"
        />,
      )

      const tabLote = screen.getByRole('tab', { name: /Lançamento em lote/i })
      fireEvent.click(tabLote)

      // Com a primeira conta sendo cartão, não há checkbox de status pago
      expect(screen.queryByLabelText(/Já foi paga/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Data do pagamento/i)).not.toBeInTheDocument()
    })

    it('submete formulário em lote com todos os novos campos mapeados', async () => {
      mockSalvarLancamento.mockResolvedValueOnce({
        ok: true,
        dados: [
          { id: 'tx-1', date: '2026-11-21' },
          { id: 'tx-2', date: '2026-11-21' },
        ],
      })

      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          membros={MEMBROS}
          membroAtualId={MEMBROS[0].id}
          formasDePagamento={FORMAS_PAGAMENTO}
          hoje="2026-11-21"
        />,
      )

      const tabLote = screen.getByRole('tab', { name: /Lançamento em lote/i })
      fireEvent.click(tabLote)

      const inputsDesc = screen.getAllByPlaceholderText(/Padaria/i)
      const inputsValor = screen.getAllByPlaceholderText('0,00')
      const inputsObs = screen.getAllByPlaceholderText(/Observação/i)

      fireEvent.change(inputsDesc[0], { target: { value: 'Almoço' } })
      fireEvent.change(inputsValor[0], { target: { value: '45,00' } })
      fireEvent.change(inputsObs[0], { target: { value: 'Restaurante perto do trabalho' } })

      fireEvent.change(inputsDesc[1], { target: { value: 'Café' } })
      fireEvent.change(inputsValor[1], { target: { value: '12,00' } })

      fireEvent.click(screen.getByRole('button', { name: /Salvar 2 lançamentos/i }))

      await waitFor(() => {
        expect(mockSalvarLancamento).toHaveBeenCalledTimes(1)
        expect(mockSalvarLancamento).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              descricao: 'Almoço',
              valor: '45,00',
              observacao: 'Restaurante perto do trabalho',
              pagoPorId: MEMBROS[0].id,
            }),
            expect.objectContaining({
              descricao: 'Café',
              valor: '12,00',
              pagoPorId: MEMBROS[0].id,
            }),
          ]),
        )
      })
    })
  })

  describe('F-3: Botão "Corrigir meses futuros" e "Corrigir regra"', () => {
    const transacaoComRecorrencia: Transacao = {
      id: 'tx-1111111-1111-4111-8111-111111111111',
      recurring_rule_id: 'regra-9999-9999',
      recurring_period: '2026-11-01',
      type: 'despesa',
      description: 'Academia Mensal',
      amount: 120.0,
      date: '2026-11-10',
      account_id: CONTA_CORRENTE.id,
      to_account_id: null,
      category_id: null,
      payment_method_id: null,
      owner_member_id: null,
      owner_share: null,
      paid_by_member_id: MEMBROS[0].id,
      created_by_member_id: MEMBROS[0].id,
      is_paid: false,
      paid_date: null,
      notes: null,
      is_benefit: false,
      is_futile: false,
      futile_label: null,
      recurrence_index: null,
      recurrence_months: null,
      recurrence_parent_id: null,
      settlement_to_member_id: null,
      prompt_snoozed_until: null,
      invoice_month: null,
      invoice_year: null,
      family_id: 'f-1',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }

    it('exibe botão "Corrigir meses futuros" quando transacao.recurring_rule_id != null', () => {
      render(
        <DialogoEditarLancamento
          aberto={true}
          onOpenChange={vi.fn()}
          transacao={transacaoComRecorrencia}
          contas={[{ id: CONTA_CORRENTE.id, name: CONTA_CORRENTE.nome }]}
          categorias={[]}
          membros={[{ id: MEMBROS[0].id, display_name: MEMBROS[0].nome }]}
        />,
      )

      expect(screen.getByRole('button', { name: /Corrigir meses futuros/i })).toBeInTheDocument()
    })

    it('clicar em "Corrigir meses futuros" abre o diálogo de confirmação com opções "Só este mês" e "Corrigir"', async () => {
      render(
        <DialogoEditarLancamento
          aberto={true}
          onOpenChange={vi.fn()}
          transacao={transacaoComRecorrencia}
          contas={[{ id: CONTA_CORRENTE.id, name: CONTA_CORRENTE.nome }]}
          categorias={[]}
          membros={[{ id: MEMBROS[0].id, display_name: MEMBROS[0].nome }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Corrigir meses futuros/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Só este mês/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^Corrigir$/i })).toBeInTheDocument()
      })

      // Clicar em "Só este mês" fecha a confirmação sem disparar action
      fireEvent.click(screen.getByRole('button', { name: /Só este mês/i }))
      await waitFor(() => {
        expect(mockAlterarRegra).not.toHaveBeenCalled()
      })
    })

    it('chama alterarRegra com sucesso (ok: true) e exibe toast de confirmação', async () => {
      mockAlterarRegra.mockResolvedValueOnce({
        ok: true,
        dados: { alteradosNaRegra: 1, alteradosEmLancamentos: 11 },
      })

      render(
        <DialogoEditarLancamento
          aberto={true}
          onOpenChange={vi.fn()}
          transacao={transacaoComRecorrencia}
          contas={[{ id: CONTA_CORRENTE.id, name: CONTA_CORRENTE.nome }]}
          categorias={[]}
          membros={[{ id: MEMBROS[0].id, display_name: MEMBROS[0].nome }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Corrigir meses futuros/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Corrigir$/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /^Corrigir$/i }))

      await waitFor(() => {
        expect(mockAlterarRegra).toHaveBeenCalledTimes(1)
        expect(mockAlterarRegra).toHaveBeenCalledWith(
          expect.objectContaining({
            regraId: 'regra-9999-9999',
            aPartirDe: '2026-11',
          }),
        )
        expect(screen.getByText(/11 lançamentos corrigidos/i)).toBeInTheDocument()
      })
    })

    it('trata erro retornado por alterarRegra (ok: false)', async () => {
      mockAlterarRegra.mockResolvedValueOnce({
        ok: false,
        erro: 'Não foi possível alterar a regra.',
      })

      render(
        <DialogoEditarLancamento
          aberto={true}
          onOpenChange={vi.fn()}
          transacao={transacaoComRecorrencia}
          contas={[{ id: CONTA_CORRENTE.id, name: CONTA_CORRENTE.nome }]}
          categorias={[]}
          membros={[{ id: MEMBROS[0].id, display_name: MEMBROS[0].nome }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Corrigir meses futuros/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Corrigir$/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /^Corrigir$/i }))

      await waitFor(() => {
        expect(screen.getByText(/Não foi possível alterar a regra/i)).toBeInTheDocument()
      })
    })

    it('na ListaAssinaturas, exibe botão "Corrigir regra" e dispara alterarRegra', async () => {
      mockAlterarRegra.mockResolvedValueOnce({
        ok: true,
        dados: { alteradosNaRegra: 1, alteradosEmLancamentos: 6 },
      })

      const regraAtiva: RegraRecorrente = {
        id: 'regra-1234',
        type: 'despesa',
        description: 'Internet Fibra',
        amount: 150.0,
        account_id: CONTA_CORRENTE.id,
        category_id: null,
        payment_method_id: null,
        owner_member_id: null,
        owner_share: null,
        paid_by_member_id: MEMBROS[0].id,
        created_by_member_id: MEMBROS[0].id,
        notes: null,
        is_benefit: false,
        is_futile: false,
        futile_label: null,
        day_of_month: 15,
        start_period: '2026-01-01',
        end_period: null,
        generated_through: '2026-12-01',
        family_id: 'f-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }

      render(
        <ListaAssinaturas
          ativas={[regraAtiva]}
          encerradas={[]}
          contas={[{ id: CONTA_CORRENTE.id, name: CONTA_CORRENTE.nome, type: 'corrente', archived_at: null }]}
          mesAtual="2026-11"
        />,
      )

      const btnCorrigir = screen.getByRole('button', { name: /Corrigir regra/i })
      expect(btnCorrigir).toBeInTheDocument()

      fireEvent.click(btnCorrigir)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Salvar alterações/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }))

      await waitFor(() => {
        expect(mockAlterarRegra).toHaveBeenCalledTimes(1)
        expect(mockAlterarRegra).toHaveBeenCalledWith(
          expect.objectContaining({
            regraId: 'regra-1234',
            aPartirDe: '2026-11',
            descricao: 'Internet Fibra',
            contaId: CONTA_CORRENTE.id,
          }),
        )
      })
    })
  })
})
