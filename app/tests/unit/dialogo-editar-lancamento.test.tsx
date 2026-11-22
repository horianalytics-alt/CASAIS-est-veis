import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { Database } from '@/types/database'

// jsdom não tem ResizeObserver; o Checkbox do Radix mede o próprio tamanho.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const atualizarLancamento = vi.fn()
vi.mock('@/actions/editar-lancamento', () => ({
  atualizarLancamento: (...args: unknown[]) => atualizarLancamento(...args),
}))
vi.mock('@/actions/recorrencia', () => ({
  alterarRegra: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { DialogoEditarLancamento } from '@/components/transacoes/dialogo-editar-lancamento'

type Transacao = Database['public']['Tables']['transactions']['Row']

const CONTA = '11111111-1111-4111-8111-111111111111'
const MEMBRO = '22222222-2222-4222-8222-222222222222'

function linha(sobre: Partial<Transacao> = {}): Transacao {
  return {
    account_id: CONTA,
    amount: 47.9,
    category_id: null,
    created_at: '2026-10-01T00:00:00Z',
    created_by_member_id: MEMBRO,
    date: '2026-10-10',
    description: 'Mercado',
    family_id: '33333333-3333-4333-8333-333333333333',
    futile_label: null,
    id: '44444444-4444-4444-8444-444444444444',
    invoice_month: null,
    invoice_year: null,
    is_benefit: false,
    is_futile: false,
    is_paid: false,
    notes: null,
    owner_member_id: null,
    owner_share: null,
    paid_by_member_id: MEMBRO,
    paid_date: null,
    payment_method_id: null,
    recurrence_index: null,
    recurrence_months: null,
    recurrence_parent_id: null,
    recurring_period: null,
    recurring_rule_id: null,
    prompt_snoozed_until: null,
    settlement_to_member_id: null,
    to_account_id: null,
    type: 'despesa',
    updated_at: '2026-10-01T00:00:00Z',
    ...sobre,
  }
}

function abrir(transacao: Transacao, onSalvo?: (s: unknown) => void) {
  return render(
    <DialogoEditarLancamento
      aberto
      onOpenChange={() => {}}
      transacao={transacao}
      contas={[{ id: CONTA, name: 'Conta corrente' }]}
      categorias={[]}
      membros={[{ id: MEMBRO, display_name: 'Heitor' }]}
      onSalvo={onSalvo}
    />,
  )
}

const salvar = () => fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

describe('DialogoEditarLancamento — benefício e gasto fútil', () => {
  // Sem globals no vitest, o RTL não desmonta sozinho entre testes.
  afterEach(cleanup)

  beforeEach(() => {
    atualizarLancamento.mockReset()
    atualizarLancamento.mockResolvedValue({ ok: true, dados: undefined })
  })

  it('pré-preenche os 3 campos com o que a linha tem', () => {
    abrir(linha({ is_benefit: true, is_futile: true, futile_label: 'Doce' }))
    expect(screen.getByRole('checkbox', { name: /benefício/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /gasto fútil/i })).toBeChecked()
    expect(screen.getByLabelText(/o que motivou/i)).toHaveValue('Doce')
  })

  it('linha sem marcação abre desmarcada e sem campo de rótulo', () => {
    abrir(linha())
    expect(screen.getByRole('checkbox', { name: /benefício/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /gasto fútil/i })).not.toBeChecked()
    expect(screen.queryByLabelText(/o que motivou/i)).toBeNull()
  })

  it('manda SEMPRE os 3 campos, com o rótulo aparado', async () => {
    abrir(linha())
    fireEvent.click(screen.getByRole('checkbox', { name: /benefício/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /gasto fútil/i }))
    fireEvent.change(screen.getByLabelText(/o que motivou/i), { target: { value: '  Delivery  ' } })
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    expect(atualizarLancamento.mock.calls[0][0]).toMatchObject({
      ehBeneficio: true,
      ehFutil: true,
      rotuloDoFutil: 'Delivery',
    })
  })

  it('desmarcar fútil manda rotuloDoFutil null (apaga o rótulo)', async () => {
    abrir(linha({ is_futile: true, futile_label: 'Doce' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /gasto fútil/i }))
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    const enviado = atualizarLancamento.mock.calls[0][0]
    expect(enviado).toMatchObject({ ehBeneficio: false, ehFutil: false, rotuloDoFutil: null })
    expect('rotuloDoFutil' in enviado).toBe(true)
  })

  it('fútil com rótulo vazio manda null, não string vazia', async () => {
    abrir(linha({ is_futile: true, futile_label: null }))
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    expect(atualizarLancamento.mock.calls[0][0]).toMatchObject({ ehFutil: true, rotuloDoFutil: null })
  })

  it('fora de despesa esconde os campos e manda tudo zerado', async () => {
    abrir(linha({ type: 'receita', is_benefit: true, is_futile: true, futile_label: 'x' }))
    expect(screen.queryByRole('checkbox', { name: /benefício/i })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /gasto fútil/i })).toBeNull()
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    expect(atualizarLancamento.mock.calls[0][0]).toMatchObject({
      ehBeneficio: false,
      ehFutil: false,
      rotuloDoFutil: null,
    })
  })

  it('onSalvo devolve as colunas gravadas, com as marcações (lista atualiza a cauda)', async () => {
    const onSalvo = vi.fn()
    abrir(linha(), onSalvo)
    fireEvent.click(screen.getByRole('checkbox', { name: /benefício/i }))
    salvar()
    await waitFor(() => expect(onSalvo).toHaveBeenCalledTimes(1))
    expect(onSalvo.mock.calls[0][0]).toMatchObject({
      id: '44444444-4444-4444-8444-444444444444',
      is_benefit: true,
      is_futile: false,
      futile_label: null,
      description: 'Mercado',
      amount: 47.9,
    })
  })

  it('mostra o erro de campo do rótulo e o apaga, com o aviso geral, ao digitar nele', async () => {
    atualizarLancamento.mockResolvedValue({
      ok: false,
      erro: 'Revise os campos destacados.',
      camposComErro: { rotuloDoFutil: ['Use no máximo 60 caracteres.'] },
    })
    abrir(linha({ is_futile: true, futile_label: 'Doce' }))
    salvar()
    const erro = await screen.findByText('Use no máximo 60 caracteres.')
    expect(erro).toHaveAttribute('id', 'erro-rotulo-futil')
    expect(screen.getByText('Revise os campos destacados.')).toBeInTheDocument()
    expect(screen.getByLabelText(/o que motivou/i)).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(screen.getByLabelText(/o que motivou/i), { target: { value: 'Doces' } })
    expect(screen.queryByText('Use no máximo 60 caracteres.')).toBeNull()
    // Era o único erro de campo: o aviso geral não pode ficar dizendo que o form está inválido.
    expect(screen.queryByText('Revise os campos destacados.')).toBeNull()
  })

  it('aviso geral fica enquanto sobrar outro erro de campo', async () => {
    atualizarLancamento.mockResolvedValue({
      ok: false,
      erro: 'Revise os campos destacados.',
      camposComErro: {
        rotuloDoFutil: ['Use no máximo 60 caracteres.'],
        descricao: ['Descrição muito longa.'],
      },
    })
    abrir(linha({ is_futile: true, futile_label: 'Doce' }))
    salvar()
    await screen.findByText('Use no máximo 60 caracteres.')
    fireEvent.change(screen.getByLabelText(/o que motivou/i), { target: { value: 'Doces' } })
    expect(screen.queryByText('Use no máximo 60 caracteres.')).toBeNull()
    expect(screen.getByText('Revise os campos destacados.')).toBeInTheDocument()
  })

  it('despesa marcada que vira receita manda os 3 campos zerados (estado oculto não vaza)', async () => {
    const onSalvo = vi.fn()
    abrir(linha({ is_benefit: true, is_futile: true, futile_label: 'Doce' }), onSalvo)
    fireEvent.click(screen.getByRole('radio', { name: 'Receita' }))
    expect(screen.queryByRole('checkbox', { name: /benefício/i })).toBeNull()
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    expect(atualizarLancamento.mock.calls[0][0]).toMatchObject({
      tipo: 'receita',
      ehBeneficio: false,
      ehFutil: false,
      rotuloDoFutil: null,
    })
    expect(onSalvo.mock.calls[0][0]).toMatchObject({
      is_benefit: false,
      is_futile: false,
      futile_label: null,
    })
  })
})

describe('DialogoEditarLancamento — forma de pagamento e responsável', () => {
  afterEach(cleanup)

  beforeEach(() => {
    atualizarLancamento.mockReset()
    atualizarLancamento.mockResolvedValue({ ok: true, dados: undefined })
  })

  const MEMBRO2 = '55555555-5555-4555-8555-555555555555'
  const FORMA = '66666666-6666-4666-8666-666666666666'

  it('não exibe forma de pagamento nem responsável se não houver opções suficientes', () => {
    render(
      <DialogoEditarLancamento
        aberto
        onOpenChange={() => {}}
        transacao={linha()}
        contas={[{ id: CONTA, name: 'Conta' }]}
        categorias={[]}
        membros={[{ id: MEMBRO, display_name: 'Heitor' }]}
      />,
    )
    expect(screen.queryByLabelText(/forma de pagamento/i)).toBeNull()
    expect(screen.queryByLabelText(/responsável/i)).toBeNull()
  })

  it('exibe forma de pagamento e responsável quando há opções disponíveis', () => {
    render(
      <DialogoEditarLancamento
        aberto
        onOpenChange={() => {}}
        transacao={linha({ payment_method_id: FORMA, owner_member_id: MEMBRO2 })}
        contas={[{ id: CONTA, name: 'Conta' }]}
        categorias={[]}
        membros={[
          { id: MEMBRO, display_name: 'Heitor' },
          { id: MEMBRO2, display_name: 'Parceira' },
        ]}
        formasDePagamento={[{ id: FORMA, name: 'Cartão de Crédito' }]}
      />,
    )
    expect(screen.getByLabelText(/forma de pagamento/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/responsável/i)).toBeInTheDocument()
  })

  it('oculta forma de pagamento e responsável quando tipo é transferência', () => {
    render(
      <DialogoEditarLancamento
        aberto
        onOpenChange={() => {}}
        transacao={linha({ type: 'transferencia' })}
        contas={[
          { id: CONTA, name: 'Conta 1' },
          { id: '99999999-9999-4999-8999-999999999999', name: 'Conta 2' },
        ]}
        categorias={[]}
        membros={[
          { id: MEMBRO, display_name: 'Heitor' },
          { id: MEMBRO2, display_name: 'Parceira' },
        ]}
        formasDePagamento={[{ id: FORMA, name: 'Cartão de Crédito' }]}
      />,
    )
    expect(screen.queryByLabelText(/forma de pagamento/i)).toBeNull()
    expect(screen.queryByLabelText(/responsável/i)).toBeNull()
  })

  it('envia formaDePagamentoId e responsavelId em atualizarLancamento e onSalvo', async () => {
    const onSalvo = vi.fn()
    render(
      <DialogoEditarLancamento
        aberto
        onOpenChange={() => {}}
        transacao={linha({ payment_method_id: FORMA, owner_member_id: MEMBRO2 })}
        contas={[{ id: CONTA, name: 'Conta' }]}
        categorias={[]}
        membros={[
          { id: MEMBRO, display_name: 'Heitor' },
          { id: MEMBRO2, display_name: 'Parceira' },
        ]}
        formasDePagamento={[{ id: FORMA, name: 'Cartão de Crédito' }]}
        onSalvo={onSalvo}
      />,
    )
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    expect(atualizarLancamento.mock.calls[0][0]).toMatchObject({
      formaDePagamentoId: FORMA,
      responsavelId: MEMBRO2,
    })
    expect(onSalvo).toHaveBeenCalledTimes(1)
    expect(onSalvo.mock.calls[0][0]).toMatchObject({
      payment_method_id: FORMA,
      owner_member_id: MEMBRO2,
    })
  })
})

describe('DialogoEditarLancamento — filtro de categoria por tipo (Rodada 20 / P-012)', () => {
  afterEach(cleanup)

  beforeEach(() => {
    atualizarLancamento.mockReset()
    atualizarLancamento.mockResolvedValue({ ok: true, dados: undefined })
  })

  const CAT_DESPESA = 'aaaaaaaa-1111-4111-8111-111111111111'
  const CAT_RECEITA = 'bbbbbbbb-2222-4222-8222-222222222222'
  const CAT_TODOS = 'cccccccc-3333-4333-8333-333333333333'

  const categoriasTeste = [
    { id: CAT_DESPESA, name: 'Alimentação', type: 'despesa' },
    { id: CAT_RECEITA, name: 'Salário', type: 'receita' },
    { id: CAT_TODOS, name: 'Geral', type: 'todos' },
  ]

  it('exibe apenas categorias de despesa e "todos" quando o tipo é despesa', () => {
    render(
      <DialogoEditarLancamento
        aberto
        onOpenChange={() => {}}
        transacao={linha({ type: 'despesa', category_id: CAT_DESPESA })}
        contas={[{ id: CONTA, name: 'Conta' }]}
        categorias={categoriasTeste}
        membros={[{ id: MEMBRO, display_name: 'Heitor' }]}
      />,
    )

    expect(screen.getAllByText('Alimentação').length).toBeGreaterThan(0)
    expect(screen.getByText('Geral')).toBeInTheDocument()
    expect(screen.queryByText('Salário')).toBeNull()
  })

  it('ao mudar o tipo de despesa para receita, limpa categoria incompatível e filtra para categorias de receita', async () => {
    render(
      <DialogoEditarLancamento
        aberto
        onOpenChange={() => {}}
        transacao={linha({ type: 'despesa', category_id: CAT_DESPESA })}
        contas={[{ id: CONTA, name: 'Conta' }]}
        categorias={categoriasTeste}
        membros={[{ id: MEMBRO, display_name: 'Heitor' }]}
      />,
    )

    // Inicialmente com categoria de despesa
    expect(screen.getAllByText('Alimentação').length).toBeGreaterThan(0)

    // Troca para Receita
    fireEvent.click(screen.getByRole('radio', { name: 'Receita' }))

    // Salário e Geral devem estar presentes, Alimentação não
    expect(screen.getAllByText('Salário').length).toBeGreaterThan(0)
    expect(screen.getByText('Geral')).toBeInTheDocument()
    expect(screen.queryByText('Alimentação')).toBeNull()

    // A categoriaId anterior (Alimentação) deve ter sido limpa (placeholder "Sem categoria")
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    expect(atualizarLancamento.mock.calls[0][0].categoriaId).toBeNull()
  })

  it('preserva categoria do tipo "todos" ao alternar de despesa para receita', async () => {
    render(
      <DialogoEditarLancamento
        aberto
        onOpenChange={() => {}}
        transacao={linha({ type: 'despesa', category_id: CAT_TODOS })}
        contas={[{ id: CONTA, name: 'Conta' }]}
        categorias={categoriasTeste}
        membros={[{ id: MEMBRO, display_name: 'Heitor' }]}
      />,
    )

    // Troca para Receita
    fireEvent.click(screen.getByRole('radio', { name: 'Receita' }))

    // Categoria do tipo "todos" não deve ser limpa
    salvar()
    await waitFor(() => expect(atualizarLancamento).toHaveBeenCalledTimes(1))
    expect(atualizarLancamento.mock.calls[0][0].categoriaId).toBe(CAT_TODOS)
  })
})
