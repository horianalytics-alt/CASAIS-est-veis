import { z } from 'zod'
import { isValidISODate } from '@/lib/format'
import { getInvoicePeriod } from '@/lib/invoice'
import type { Database } from '@/types/database'

/**
 * Esquemas e regras PURAS da edição de lançamento (atualizarLancamento e
 * atualizarLancamentosEmMassa, em src/actions/editar-lancamento.ts).
 *
 * Moram aqui, e não no arquivo da action, porque um módulo 'use server' só
 * exporta funções async — e os testes unitários precisam destes.
 * Plano: docs/planos/estrutura-editar-lancamento.md.
 */

export const MENSAGENS_EDICAO = {
  NAO_ENCONTRADO: 'Lançamento não encontrado.',
  CONTA: 'Conta não encontrada.',
  CONTA_DESTINO: 'Conta de destino não encontrada.',
  CATEGORIA: 'Categoria não encontrada.',
  MEMBRO: 'Membro não encontrado.',
  ACERTO: 'Acerto de contas não pode ser editado. Exclua e registre de novo.',
  DESTINO: 'Escolha uma conta de destino diferente da conta de origem.',
  TRANSFERENCIA_SEM_CATEGORIA: 'Transferências não têm categoria. Tire as transferências da seleção.',
  NENHUM_CAMPO: 'Escolha pelo menos um campo para alterar.',
  PARCIAL: 'Parte dos lançamentos foi atualizada e parte não. Tente de novo.',
} as const

const M = MENSAGENS_EDICAO

const uuid = z
  .string({ required_error: 'Escolha uma opção válida.', invalid_type_error: 'Escolha uma opção válida.' })
  .uuid('Escolha uma opção válida.')

const idDeLancamento = z
  .string({ required_error: 'Lançamento inválido.', invalid_type_error: 'Lançamento inválido.' })
  .uuid('Lançamento inválido.')

const dataISO = z
  .string({ required_error: 'Informe a data.', invalid_type_error: 'Data inválida.' })
  .trim()
  .refine((valor) => isValidISODate(valor), 'Data inválida.')

/**
 * Valor em reais, sempre positivo (CHECK amount > 0; o sinal vem do tipo).
 * Mesma regra de orcamentos.ts: mais de 2 casas é RECUSADO, não arredondado
 * (achado P-009). Uma mensagem só, pela primeira regra violada (L-016: checks
 * encadeados do Zod rodam todos). A tolerância de 1e-6 só absorve o ruído
 * binário de um valor que TEM 2 casas (0.1 + 0.2).
 */
const valor = z
  .number({ required_error: 'Informe o valor.', invalid_type_error: 'Valor inválido.' })
  .superRefine((n, ctx) => {
    const mensagem = !Number.isFinite(n)
      ? 'Valor inválido.'
      : n <= 0
        ? 'O valor precisa ser maior que zero.'
        : n > 99_999_999.99
          ? 'Esse valor é alto demais.'
          : Math.abs(n * 100 - Math.round(n * 100)) >= 1e-6
            ? 'Use no máximo 2 casas decimais.'
            : null
    if (mensagem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensagem })
  })
  .transform((n) => Math.round(n * 100) / 100)

/**
 * Mesmos 3 tipos de salvarLancamento: 'investimento' não tem tela.
 * `errorMap` (e não required_error/invalid_type_error) porque um valor fora da
 * lista é `invalid_enum_value`, que aquelas duas opções não cobrem.
 */
const tipoDeLancamento = z.enum(['receita', 'despesa', 'transferencia'], {
  errorMap: () => ({ message: 'Escolha se é entrada, saída ou transferência.' }),
})

export const esquemaAtualizarLancamento = z
  .object({
    id: idDeLancamento,
    tipo: tipoDeLancamento,
    descricao: z
      .string({ required_error: 'Descreva o lançamento.', invalid_type_error: 'Descreva o lançamento.' })
      .trim()
      .min(1, 'Descreva o lançamento.')
      .max(120, 'A descrição pode ter no máximo 120 caracteres.'),
    valor,
    data: dataISO,
    contaId: uuid,
    /** Só transferência. Omitido = mantém o destino que a linha já tem. */
    contaDestinoId: uuid.nullish(),
    categoriaId: uuid.nullish(),
    pagoPorId: uuid,
    estaPago: z.boolean({ required_error: 'Informe se está pago.', invalid_type_error: 'Informe se está pago.' }),
    dataDoPagamento: dataISO.nullish(),
    observacao: z
      .string({ invalid_type_error: 'Observação inválida.' })
      .trim()
      .max(500, 'Observação longa demais.')
      .nullish()
      .transform((o) => (o ? o : null)),
  })
  // CHECK tx_pago_tem_data — mesmas frases de salvarLancamento.
  .refine((e) => !e.estaPago || e.dataDoPagamento != null, {
    message: 'Informe a data do pagamento.',
    path: ['dataDoPagamento'],
  })
  .refine((e) => e.estaPago || e.dataDoPagamento == null, {
    message: 'Só preencha a data do pagamento se já estiver pago.',
    path: ['dataDoPagamento'],
  })

export type EntradaAtualizarLancamento = z.input<typeof esquemaAtualizarLancamento>
export type AtualizacaoParseada = z.output<typeof esquemaAtualizarLancamento>

export const esquemaAtualizarEmMassa = z
  .object({
    ids: z
      .array(idDeLancamento, { required_error: 'Nenhum lançamento selecionado.', invalid_type_error: 'Nenhum lançamento selecionado.' })
      .min(1, 'Nenhum lançamento selecionado.')
      // Mesmo teto do lote de salvarLancamento.
      .max(50, 'Muitos lançamentos de uma vez. Separe em partes.')
      .transform((ids) => Array.from(new Set(ids))),
    /** undefined = não mexe; null = "sem categoria". */
    categoriaId: uuid.nullable().optional(),
    contaId: uuid.optional(),
    pagoPorId: uuid.optional(),
    estaPago: z.boolean({ invalid_type_error: 'Informe se está pago.' }).optional(),
  })
  .refine(
    (e) =>
      e.categoriaId !== undefined || e.contaId !== undefined || e.pagoPorId !== undefined || e.estaPago !== undefined,
    { message: M.NENHUM_CAMPO, path: ['formulario'] },
  )

export type EntradaAtualizarEmMassa = z.input<typeof esquemaAtualizarEmMassa>
export type LoteParseado = z.output<typeof esquemaAtualizarEmMassa>

type Lancamento = Database['public']['Tables']['transactions']['Row']
export type PatchDeLancamento = Database['public']['Tables']['transactions']['Update']

/** O que as regras precisam saber da linha como ela está HOJE no banco. */
export type LinhaEditavel = Pick<
  Lancamento,
  'id' | 'type' | 'account_id' | 'to_account_id' | 'date' | 'is_paid' | 'settlement_to_member_id'
>

export const COLUNAS_LINHA_EDITAVEL = 'id,type,account_id,to_account_id,date,is_paid,settlement_to_member_id'

type Recusa = { ok: false; erro: string; campo: string }

/**
 * Em qual fatura a linha cai, com a MESMA regra de save_transactions (00003):
 * dia < fechamento = fatura do mês; no dia do fechamento ou depois = seguinte.
 * Conta sem ciclo (não é cartão) = sem fatura.
 */
export function faturaPara(
  closingDay: number | null,
  dataISO: string,
): { invoice_year: number | null; invoice_month: number | null } {
  if (closingDay == null) return { invoice_year: null, invoice_month: null }
  const { year, month } = getInvoicePeriod(dataISO, closingDay)
  return { invoice_year: year, invoice_month: month }
}

/**
 * Patch da edição individual. Só as colunas da assinatura (mais as que um
 * CHECK obriga a acompanhar): rateio, forma de pagamento, fútil/benefício e
 * série ficam como estão.
 */
export function montarPatchIndividual(
  linha: LinhaEditavel,
  e: AtualizacaoParseada,
  contaNova: { closing_day: number | null },
): { ok: true; patch: PatchDeLancamento } | Recusa {
  // CHECK tx_acerto_so_em_transferencia + sentido do acerto em v_settlement.
  if (linha.settlement_to_member_id != null) return { ok: false, erro: M.ACERTO, campo: 'formulario' }

  const ehTransferencia = e.tipo === 'transferencia'
  // CHECK tx_transferencia_tem_destino.
  const destino = ehTransferencia
    ? (e.contaDestinoId ?? (linha.type === 'transferencia' ? linha.to_account_id : null))
    : null
  if (ehTransferencia && (destino == null || destino === e.contaId)) {
    return { ok: false, erro: M.DESTINO, campo: 'contaDestinoId' }
  }

  const patch: PatchDeLancamento = {
    type: e.tipo,
    description: e.descricao,
    amount: e.valor,
    date: e.data,
    account_id: e.contaId,
    to_account_id: destino,
    // Transferência não tem categoria (mesmo descarte de salvarLancamento).
    category_id: ehTransferencia ? null : (e.categoriaId ?? null),
    paid_by_member_id: e.pagoPorId,
    is_paid: e.estaPago,
    paid_date: e.estaPago ? (e.dataDoPagamento ?? null) : null,
    notes: e.observacao,
  }
  // CHECK tx_transferencia_sem_rateio.
  if (ehTransferencia) {
    patch.owner_member_id = null
    patch.owner_share = null
  }
  // Fatura só muda se a conta ou a data mudaram: senão, editar a descrição de
  // uma compra antiga a moveria de fatura depois de uma troca do dia de
  // fechamento do cartão.
  if (e.contaId !== linha.account_id || e.data !== linha.date) {
    Object.assign(patch, faturaPara(contaNova.closing_day, e.data))
  }
  return { ok: true, patch }
}

/** Chave estável do patch (ordem das chaves fixada) para agrupar linhas iguais. */
function chaveDoPatch(patch: PatchDeLancamento): string {
  return JSON.stringify(Object.entries(patch).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Patch final de CADA linha do lote, agrupado por patch igual: cada grupo vira
 * um UPDATE (uma instrução atômica). No caso comum é um grupo só. Linha sem
 * nada a mudar (já paga, num "marcar como pago") não entra em grupo nenhum.
 *
 * Recusa o lote INTEIRO, sem gravar nada, se alguma linha não pode receber a
 * mudança — nunca aplica em parte por regra de negócio.
 */
export function planejarEdicaoEmMassa(
  linhas: LinhaEditavel[],
  e: Pick<LoteParseado, 'categoriaId' | 'contaId' | 'pagoPorId' | 'estaPago'> & { ids: string[] },
  contaNova: { id: string; closing_day: number | null } | null,
  hoje: string,
): { ok: true; grupos: { ids: string[]; patch: PatchDeLancamento }[] } | Recusa {
  if (linhas.some((l) => l.settlement_to_member_id != null)) return { ok: false, erro: M.ACERTO, campo: 'ids' }
  if (e.categoriaId != null && linhas.some((l) => l.type === 'transferencia')) {
    return { ok: false, erro: M.TRANSFERENCIA_SEM_CATEGORIA, campo: 'categoriaId' }
  }
  if (e.contaId !== undefined && linhas.some((l) => l.type === 'transferencia' && l.to_account_id === e.contaId)) {
    return { ok: false, erro: M.DESTINO, campo: 'contaId' }
  }

  const grupos = new Map<string, { ids: string[]; patch: PatchDeLancamento }>()
  // Ordem dos ids do pedido: o resultado não depende da ordem em que o banco devolveu as linhas.
  const porId = new Map(linhas.map((l) => [l.id, l]))
  for (const id of e.ids) {
    const linha = porId.get(id)
    if (!linha) continue
    const patch: PatchDeLancamento = {}
    if (e.categoriaId !== undefined) patch.category_id = e.categoriaId
    if (e.contaId !== undefined && contaNova) {
      patch.account_id = e.contaId
      if (linha.account_id !== e.contaId) Object.assign(patch, faturaPara(contaNova.closing_day, linha.date))
    }
    if (e.pagoPorId !== undefined) patch.paid_by_member_id = e.pagoPorId
    if (e.estaPago === true && !linha.is_paid) {
      patch.is_paid = true
      patch.paid_date = hoje
    }
    if (e.estaPago === false) {
      patch.is_paid = false
      patch.paid_date = null
    }
    if (Object.keys(patch).length === 0) continue

    const chave = chaveDoPatch(patch)
    const grupo = grupos.get(chave)
    if (grupo) grupo.ids.push(id)
    else grupos.set(chave, { ids: [id], patch })
  }
  return { ok: true, grupos: [...grupos.values()] }
}
