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

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: vi.fn(),
  }),
}))

const mockSalvarLancamento = vi.fn()
const mockCriarRecorrencia = vi.fn()
const mockResponderCobranca = vi.fn()
const mockAlterarValorRecorrencia = vi.fn()
const mockEncerrarRecorrencia = vi.fn()

vi.mock('@/actions/lancamento', () => ({
  salvarLancamento: (...args: unknown[]) => mockSalvarLancamento(...args),
}))

vi.mock('@/actions/recorrencia', () => ({
  criarRecorrencia: (...args: unknown[]) => mockCriarRecorrencia(...args),
  responderCobranca: (...args: unknown[]) => mockResponderCobranca(...args),
  alterarValorRecorrencia: (...args: unknown[]) => mockAlterarValorRecorrencia(...args),
  encerrarRecorrencia: (...args: unknown[]) => mockEncerrarRecorrencia(...args),
}))

import { FormLancamento, type OpcaoDeConta } from '@/components/transacoes/form-lancamento'
import { PopUpCobranca } from '@/components/recorrencia/popup-cobranca'
import type { CobrancaPendente } from '@/actions/recorrencia'
import { ListaAssinaturas } from '@/components/recorrencia/lista-assinaturas'
import type { RegraRecorrente } from '@/lib/queries/recorrencias'

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

const CONTA_INFO = {
  id: CONTA_CORRENTE.id,
  name: 'Conta Corrente',
  type: 'corrente',
  archived_at: null,
}

describe('Recorrência e P-016 Frontend — Testes Unitários', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('FormLancamento — Repetir todo mês e Parcelas', () => {
    it('exibe "Repetir todo mês" em despesa e receita quando parcelas <= 1', () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE, CONTA_CARTAO]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      expect(screen.getByLabelText(/Repetir todo mês/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Parcelas/i)).toBeInTheDocument()
    })

    it('"Repetir todo mês" e "Parcelas" são mutuamente exclusivos', async () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE, CONTA_CARTAO]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      const switchRepetir = screen.getByLabelText(/Repetir todo mês/i)

      // Ao ligar "Repetir todo mês", Parcelas deve sumir
      fireEvent.click(switchRepetir)
      await waitFor(() => {
        expect(screen.queryByLabelText(/Parcelas/i)).not.toBeInTheDocument()
      })

      // Ao desligar "Repetir todo mês", Parcelas deve reaparecer
      fireEvent.click(switchRepetir)
      await waitFor(() => {
        expect(screen.getByLabelText(/Parcelas/i)).toBeInTheDocument()
      })
    })

    it('em transferência, "Repetir todo mês" não é exibido', async () => {
      render(
        <FormLancamento
          contas={[CONTA_CORRENTE, CONTA_CARTAO]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      const radioTransferencia = screen.getByRole('radio', { name: /Transferência/i })
      fireEvent.click(radioTransferencia)

      await waitFor(() => {
        expect(screen.queryByLabelText(/Repetir todo mês/i)).not.toBeInTheDocument()
      })
    })

    it('chama criarRecorrencia com sucesso (ok: true) e exibe toast de confirmação', async () => {
      mockCriarRecorrencia.mockResolvedValueOnce({
        ok: true,
        dados: { regraId: 'regra-123', lancamentosGerados: 12 },
      })

      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      // Preenche descrição e valor
      fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: 'Netflix' } })
      fireEvent.change(screen.getByLabelText(/Valor/i), { target: { value: '55,90' } })

      // Liga repetir todo mês
      fireEvent.click(screen.getByLabelText(/Repetir todo mês/i))

      // Envia formulário
      fireEvent.click(screen.getByRole('button', { name: /Salvar lançamento/i }))

      await waitFor(() => {
        expect(mockCriarRecorrencia).toHaveBeenCalledTimes(1)
        expect(mockCriarRecorrencia).toHaveBeenCalledWith(
          expect.objectContaining({
            tipo: 'despesa',
            descricao: 'Netflix',
            valor: '55,90',
            data: '2026-11-20',
            contaId: CONTA_CORRENTE.id,
          }),
        )
      })

      // Verifica toast de confirmação
      await waitFor(() => {
        expect(screen.getByText(/Recorrência criada! 12 meses agendados/i)).toBeInTheDocument()
      })
    })

    it('trata erro geral em criarRecorrencia (ok: false)', async () => {
      mockCriarRecorrencia.mockResolvedValueOnce({
        ok: false,
        erro: 'Erro interno ao processar a regra.',
      })

      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: 'Academia' } })
      fireEvent.change(screen.getByLabelText(/Valor/i), { target: { value: '120,00' } })
      fireEvent.click(screen.getByLabelText(/Repetir todo mês/i))

      fireEvent.click(screen.getByRole('button', { name: /Salvar lançamento/i }))

      await waitFor(() => {
        expect(screen.getByText('Erro interno ao processar a regra.')).toBeInTheDocument()
      })
    })

    it('trata camposComErro em criarRecorrencia (ok: false)', async () => {
      mockCriarRecorrencia.mockResolvedValueOnce({
        ok: false,
        erro: 'Verifique os campos destacados.',
        camposComErro: {
          descricao: ['A descrição pode ter no máximo 120 caracteres.'],
        },
      })

      render(
        <FormLancamento
          contas={[CONTA_CORRENTE]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: 'X'.repeat(130) } })
      fireEvent.change(screen.getByLabelText(/Valor/i), { target: { value: '10,00' } })
      fireEvent.click(screen.getByLabelText(/Repetir todo mês/i))

      fireEvent.click(screen.getByRole('button', { name: /Salvar lançamento/i }))

      await waitFor(() => {
        expect(screen.getByText('A descrição pode ter no máximo 120 caracteres.')).toBeInTheDocument()
      })
    })
  })

  describe('P-016 — Conta cartão oculta campo e força estaPago=false', () => {
    it('quando a primeira conta é cartão, campo "Já está pago" não é renderizado', () => {
      render(
        <FormLancamento
          contas={[CONTA_CARTAO, CONTA_CORRENTE]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      expect(screen.queryByText(/Já está pago/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Data do pagamento/i)).not.toBeInTheDocument()
    })

    it('em conta cartão, submissão envia estaPago = false', async () => {
      mockSalvarLancamento.mockResolvedValueOnce({
        ok: true,
        dados: [{ id: 'tx-1', date: '2026-11-20' }],
      })

      render(
        <FormLancamento
          contas={[CONTA_CARTAO]}
          categorias={[]}
          hoje="2026-11-20"
        />,
      )

      fireEvent.change(screen.getByLabelText(/Descrição/i), { target: { value: 'Compra de mercado' } })
      fireEvent.change(screen.getByLabelText(/Valor/i), { target: { value: '250,00' } })

      fireEvent.click(screen.getByRole('button', { name: /Salvar lançamento/i }))

      await waitFor(() => {
        expect(mockSalvarLancamento).toHaveBeenCalledTimes(1)
        expect(mockSalvarLancamento).toHaveBeenCalledWith(
          expect.objectContaining({
            estaPago: false,
            dataDoPagamento: null,
          }),
        )
      })
    })
  })

  describe('PopUpCobranca — Fila bloqueante e Respostas', () => {
    const cobrancasMock: CobrancaPendente[] = [
      {
        id: 'cob-1',
        regraId: 'regra-1',
        tipo: 'despesa',
        descricao: 'Netflix',
        valor: 55.9,
        data: '2026-11-20',
        contaId: CONTA_CORRENTE.id,
        competencia: '2026-11',
      },
      {
        id: 'cob-2',
        regraId: 'regra-2',
        tipo: 'despesa',
        descricao: 'Spotify',
        valor: 34.9,
        data: '2026-11-22',
        contaId: CONTA_CORRENTE.id,
        competencia: '2026-11',
      },
    ]

    it('renderiza o primeiro item da fila com descrição, valor e competência', () => {
      render(<PopUpCobranca cobrancasIniciais={cobrancasMock} familyId="fam-1" />)

      expect(screen.getByText(/Já pagou\? Netflix/i)).toBeInTheDocument()
      expect(screen.getByText(/Cobrança recorrente \(1 de 2\)/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Sim, paguei/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Ainda não/i })).toBeInTheDocument()
    })

    it('ao clicar "Sim, paguei", exibe campo de data padrão e confirma pagamento com sucesso', async () => {
      mockResponderCobranca.mockResolvedValueOnce({
        ok: true,
        dados: { estado: 'pago' },
      })

      render(<PopUpCobranca cobrancasIniciais={cobrancasMock} familyId="fam-1" />)

      // Clica em "Sim, paguei"
      fireEvent.click(screen.getByRole('button', { name: /Sim, paguei/i }))

      // Campo de data deve aparecer com valor padrão 2026-11-20
      const inputData = screen.getByLabelText(/Data do pagamento/i) as HTMLInputElement
      expect(inputData).toBeInTheDocument()
      expect(inputData.value).toBe('2026-11-20')

      // Confirma pagamento
      fireEvent.click(screen.getByRole('button', { name: /Confirmar pagamento/i }))

      await waitFor(() => {
        expect(mockResponderCobranca).toHaveBeenCalledWith({
          lancamentoId: 'cob-1',
          resposta: 'pago',
          dataPagamento: '2026-11-20',
        })
      })

      // Item 1 deve ser removido, passando para o Item 2 (Spotify)
      await waitFor(() => {
        expect(screen.getByText(/Já pagou\? Spotify/i)).toBeInTheDocument()
      })
    })

    it('ao clicar "Ainda não", chama responderCobranca com resposta="ainda_nao" e avança', async () => {
      mockResponderCobranca.mockResolvedValueOnce({
        ok: true,
        dados: { estado: 'adiado' },
      })

      render(<PopUpCobranca cobrancasIniciais={cobrancasMock} familyId="fam-1" />)

      fireEvent.click(screen.getByRole('button', { name: /Ainda não/i }))

      await waitFor(() => {
        expect(mockResponderCobranca).toHaveBeenCalledWith({
          lancamentoId: 'cob-1',
          resposta: 'ainda_nao',
          dataPagamento: undefined,
        })
      })

      await waitFor(() => {
        expect(screen.getByText(/Já pagou\? Spotify/i)).toBeInTheDocument()
      })
    })

    it('trata resposta ja_respondida removendo o item da fila', async () => {
      mockResponderCobranca.mockResolvedValueOnce({
        ok: true,
        dados: { estado: 'ja_respondida' },
      })

      render(<PopUpCobranca cobrancasIniciais={cobrancasMock} familyId="fam-1" />)

      fireEvent.click(screen.getByRole('button', { name: /Ainda não/i }))

      await waitFor(() => {
        expect(screen.getByText(/Já pagou\? Spotify/i)).toBeInTheDocument()
      })
    })

    it('quando a fila esvazia após última resposta, diálogo é fechado', async () => {
      mockResponderCobranca.mockResolvedValueOnce({
        ok: true,
        dados: { estado: 'pago' },
      })

      const umaCobranca = [cobrancasMock[0]]
      render(<PopUpCobranca cobrancasIniciais={umaCobranca} familyId="fam-1" />)

      fireEvent.click(screen.getByRole('button', { name: /Sim, paguei/i }))
      fireEvent.click(screen.getByRole('button', { name: /Confirmar pagamento/i }))

      await waitFor(() => {
        expect(screen.queryByText(/Já pagou\? Netflix/i)).not.toBeInTheDocument()
      })
    })

    it('exibe erro caso responderCobranca falhe (ok: false)', async () => {
      mockResponderCobranca.mockResolvedValueOnce({
        ok: false,
        erro: 'Erro de conexão com o servidor.',
      })

      render(<PopUpCobranca cobrancasIniciais={cobrancasMock} familyId="fam-1" />)

      fireEvent.click(screen.getByRole('button', { name: /Ainda não/i }))

      await waitFor(() => {
        expect(screen.getByText('Erro de conexão com o servidor.')).toBeInTheDocument()
      })
      // Item continua na tela
      expect(screen.getByText(/Já pagou\? Netflix/i)).toBeInTheDocument()
    })
  })

  describe('ListaAssinaturas — Ativas e Encerradas', () => {
    const ativasMock: RegraRecorrente[] = [
      {
        id: 'regra-1',
        family_id: 'fam-1',
        type: 'despesa',
        description: 'Netflix Premium',
        amount: 55.9,
        day_of_month: 15,
        account_id: CONTA_CORRENTE.id,
        category_id: null,
        payment_method_id: null,
        start_period: '2026-11-01',
        end_period: null,
        generated_through: '2027-11-01',
        is_benefit: false,
        is_futile: false,
        futile_label: null,
        notes: null,
        owner_member_id: null,
        owner_share: null,
        paid_by_member_id: 'mem-1',
        created_by_member_id: 'mem-1',
        created_at: '2026-11-20T00:00:00Z',
        updated_at: '2026-11-20T00:00:00Z',
      },
    ]

    it('renderiza lista de ativas com conta, dia e botões de ação', () => {
      render(
        <ListaAssinaturas
          ativas={ativasMock}
          encerradas={[]}
          contas={[CONTA_INFO]}
          mesAtual="2026-11"
        />,
      )

      expect(screen.getByText('Netflix Premium')).toBeInTheDocument()
      expect(screen.getByText(/Dia 15/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Editar valor/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Encerrar assinatura/i })).toBeInTheDocument()
    })

    it('abre diálogo de editar valor e chama alterarValorRecorrencia com sucesso', async () => {
      mockAlterarValorRecorrencia.mockResolvedValueOnce({
        ok: true,
        dados: { atualizados: 11 },
      })

      render(
        <ListaAssinaturas
          ativas={ativasMock}
          encerradas={[]}
          contas={[CONTA_INFO]}
          mesAtual="2026-11"
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Editar valor/i }))

      // Diálogo aberto
      expect(screen.getByText(/Editar valor da assinatura/i)).toBeInTheDocument()

      const inputValor = screen.getByLabelText(/Novo valor/i)
      fireEvent.change(inputValor, { target: { value: '65,90' } })

      fireEvent.click(screen.getByRole('button', { name: /Salvar novo valor/i }))

      await waitFor(() => {
        expect(mockAlterarValorRecorrencia).toHaveBeenCalledWith({
          regraId: 'regra-1',
          valor: '65,90',
          aPartirDe: '2026-11',
        })
      })
    })

    it('abre diálogo de encerrar e chama encerrarRecorrencia com sucesso', async () => {
      mockEncerrarRecorrencia.mockResolvedValueOnce({
        ok: true,
        dados: { removidos: 10 },
      })

      render(
        <ListaAssinaturas
          ativas={ativasMock}
          encerradas={[]}
          contas={[CONTA_INFO]}
          mesAtual="2026-11"
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Encerrar assinatura/i }))

      expect(screen.getByRole('heading', { name: /Encerrar assinatura/i })).toBeInTheDocument()
      expect(screen.getByText(/Os lançamentos futuros serão removidos. O histórico fica./i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Encerrar assinatura/i, hidden: false }))

      await waitFor(() => {
        expect(mockEncerrarRecorrencia).toHaveBeenCalledWith({
          regraId: 'regra-1',
          ultimoMes: '2026-11',
        })
      })
    })
  })
})
