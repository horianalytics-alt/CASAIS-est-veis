import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const mockExcluirConta = vi.fn()
vi.mock('@/actions/contas', () => ({
  excluirConta: (input: { id: string }) => mockExcluirConta(input),
}))

const mockTocarSomSucesso = vi.fn()
const mockTocarSomErro = vi.fn()
vi.mock('@/features/sons/sons', () => ({
  tocarSomSucesso: () => mockTocarSomSucesso(),
  tocarSomErro: () => mockTocarSomErro(),
}))

import { BotaoExcluirConta } from '@/components/ajustes/botao-excluir-conta'

const CONTA_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const NOME_CONTA = 'Nubank Débito'

describe('BotaoExcluirConta (P-016 / Rodada 18)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  beforeEach(() => {
    mockExcluirConta.mockReset()
    mockRefresh.mockReset()
    mockTocarSomSucesso.mockReset()
    mockTocarSomErro.mockReset()
  })

  it('renderiza o botão com ícone de lixeira e aria-label acessível', () => {
    render(<BotaoExcluirConta contaId={CONTA_ID} nomeDaConta={NOME_CONTA} />)

    const botao = screen.getByRole('button', { name: `Excluir conta ${NOME_CONTA}` })
    expect(botao).toBeInTheDocument()
    expect(botao).toHaveAttribute('title', 'Excluir conta permanentemente')
  })

  it('abre o modal de confirmação ao clicar no botão', async () => {
    render(<BotaoExcluirConta contaId={CONTA_ID} nomeDaConta={NOME_CONTA} />)

    const botao = screen.getByRole('button', { name: `Excluir conta ${NOME_CONTA}` })
    fireEvent.click(botao)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(`Excluir "${NOME_CONTA}"?`)).toBeInTheDocument()
    expect(screen.getByText(/Esta ação é permanente e não pode ser desfeita/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir permanentemente' })).toBeInTheDocument()
  })

  it('fecha o modal ao clicar em Cancelar', async () => {
    render(<BotaoExcluirConta contaId={CONTA_ID} nomeDaConta={NOME_CONTA} />)

    fireEvent.click(screen.getByRole('button', { name: `Excluir conta ${NOME_CONTA}` }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    const botaoCancelar = screen.getByRole('button', { name: 'Cancelar' })
    fireEvent.click(botaoCancelar)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(mockExcluirConta).not.toHaveBeenCalled()
  })

  it('chama excluirConta com sucesso, toca som de sucesso e recarrega a página', async () => {
    mockExcluirConta.mockResolvedValueOnce({ ok: true, dados: undefined })

    render(<BotaoExcluirConta contaId={CONTA_ID} nomeDaConta={NOME_CONTA} />)

    fireEvent.click(screen.getByRole('button', { name: `Excluir conta ${NOME_CONTA}` }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    const botaoConfirmar = screen.getByRole('button', { name: 'Excluir permanentemente' })
    fireEvent.click(botaoConfirmar)

    await waitFor(() => {
      expect(mockExcluirConta).toHaveBeenCalledWith({ id: CONTA_ID })
      expect(mockTocarSomSucesso).toHaveBeenCalledTimes(1)
      expect(mockRefresh).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('exibe mensagem amigável de erro no modal quando falha com FK (lançamentos vinculados)', async () => {
    const mensagemErro = 'Esta conta não pode ser excluída porque tem lançamentos vinculados. Arquive-a em vez de excluir.'
    mockExcluirConta.mockResolvedValueOnce({ ok: false, erro: mensagemErro })

    render(<BotaoExcluirConta contaId={CONTA_ID} nomeDaConta={NOME_CONTA} />)

    fireEvent.click(screen.getByRole('button', { name: `Excluir conta ${NOME_CONTA}` }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    const botaoConfirmar = screen.getByRole('button', { name: 'Excluir permanentemente' })
    fireEvent.click(botaoConfirmar)

    await waitFor(() => {
      expect(mockExcluirConta).toHaveBeenCalledWith({ id: CONTA_ID })
      expect(mockTocarSomErro).toHaveBeenCalledTimes(1)
      expect(screen.getByText(mensagemErro)).toBeInTheDocument()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
