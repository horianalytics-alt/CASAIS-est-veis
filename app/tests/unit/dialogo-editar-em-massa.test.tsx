import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const atualizarLancamentosEmMassa = vi.fn()
vi.mock('@/actions/editar-lancamento', () => ({
  atualizarLancamentosEmMassa: (...args: unknown[]) => atualizarLancamentosEmMassa(...args),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { DialogoEditarEmMassa } from '@/components/transacoes/dialogo-editar-em-massa'

const ID1 = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'
const CONTA = '33333333-3333-4333-8333-333333333333'
const MEMBRO1 = '44444444-4444-4444-8444-444444444444'
const MEMBRO2 = '55555555-5555-4555-8555-555555555555'
const FORMA = '66666666-6666-4666-8666-666666666666'

describe('DialogoEditarEmMassa — Forma de pagamento e Responsável (R17)', () => {
  afterEach(cleanup)

  beforeEach(() => {
    atualizarLancamentosEmMassa.mockReset()
    atualizarLancamentosEmMassa.mockResolvedValue({
      ok: true,
      dados: { atualizados: 2, gruposExecutados: 1 },
    })
  })

  it('exibe blocos de Forma de pagamento e Responsável quando há opções', () => {
    render(
      <DialogoEditarEmMassa
        aberto
        onOpenChange={() => {}}
        idsSelecionados={[ID1, ID2]}
        contas={[{ id: CONTA, name: 'Conta 1' }]}
        categorias={[]}
        membros={[
          { id: MEMBRO1, display_name: 'Heitor' },
          { id: MEMBRO2, display_name: 'Parceira' },
        ]}
        formasDePagamento={[{ id: FORMA, name: 'Cartão Nubank' }]}
      />,
    )

    expect(screen.getByLabelText(/alterar forma de pagamento/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/alterar responsável/i)).toBeInTheDocument()
  })

  it('desabilita bloco de Responsável quando há transferência na seleção', () => {
    render(
      <DialogoEditarEmMassa
        aberto
        onOpenChange={() => {}}
        idsSelecionados={[ID1, ID2]}
        contas={[{ id: CONTA, name: 'Conta 1' }]}
        categorias={[]}
        membros={[
          { id: MEMBRO1, display_name: 'Heitor' },
          { id: MEMBRO2, display_name: 'Parceira' },
        ]}
        formasDePagamento={[{ id: FORMA, name: 'Cartão Nubank' }]}
        temTransferenciaNaSelecao={true}
      />,
    )

    const checkboxResp = screen.getByLabelText(/alterar responsável/i)
    expect(checkboxResp).toBeDisabled()
    expect(
      screen.getByText(/transferências não têm responsável/i),
    ).toBeInTheDocument()
  })

  it('submete lote com formaDePagamentoId quando marcado', async () => {
    const onSalvo = vi.fn()
    render(
      <DialogoEditarEmMassa
        aberto
        onOpenChange={() => {}}
        idsSelecionados={[ID1, ID2]}
        contas={[{ id: CONTA, name: 'Conta 1' }]}
        categorias={[]}
        membros={[{ id: MEMBRO1, display_name: 'Heitor' }]}
        formasDePagamento={[{ id: FORMA, name: 'Cartão Nubank' }]}
        onSalvo={onSalvo}
      />,
    )

    // Marca o checkbox de forma de pagamento
    fireEvent.click(screen.getByLabelText(/alterar forma de pagamento/i))

    // Submete o formulário
    fireEvent.click(screen.getByRole('button', { name: /aplicar a 2 itens/i }))

    await waitFor(() => expect(atualizarLancamentosEmMassa).toHaveBeenCalledTimes(1))
    expect(atualizarLancamentosEmMassa.mock.calls[0][0]).toMatchObject({
      ids: [ID1, ID2],
      formaDePagamentoId: FORMA,
    })
    expect(onSalvo).toHaveBeenCalledWith(2, 2)
  })

  it('submete lote com responsavelId quando marcado', async () => {
    const onSalvo = vi.fn()
    render(
      <DialogoEditarEmMassa
        aberto
        onOpenChange={() => {}}
        idsSelecionados={[ID1, ID2]}
        contas={[{ id: CONTA, name: 'Conta 1' }]}
        categorias={[]}
        membros={[
          { id: MEMBRO1, display_name: 'Heitor' },
          { id: MEMBRO2, display_name: 'Parceira' },
        ]}
        formasDePagamento={[]}
        onSalvo={onSalvo}
      />,
    )

    // Marca o checkbox de responsável
    fireEvent.click(screen.getByLabelText(/alterar responsável/i))

    // Submete o formulário
    fireEvent.click(screen.getByRole('button', { name: /aplicar a 2 itens/i }))

    await waitFor(() => expect(atualizarLancamentosEmMassa).toHaveBeenCalledTimes(1))
    expect(atualizarLancamentosEmMassa.mock.calls[0][0]).toMatchObject({
      ids: [ID1, ID2],
      responsavelId: MEMBRO1,
    })
    expect(onSalvo).toHaveBeenCalledWith(2, 2)
  })

  it('bloqueia submissão se nenhum campo estiver selecionado', async () => {
    render(
      <DialogoEditarEmMassa
        aberto
        onOpenChange={() => {}}
        idsSelecionados={[ID1, ID2]}
        contas={[{ id: CONTA, name: 'Conta 1' }]}
        categorias={[]}
        membros={[{ id: MEMBRO1, display_name: 'Heitor' }]}
        formasDePagamento={[{ id: FORMA, name: 'Cartão Nubank' }]}
      />,
    )

    // O botão fica desabilitado
    const btnSubmit = screen.getByRole('button', { name: /aplicar a 2 itens/i })
    expect(btnSubmit).toBeDisabled()
  })
})
