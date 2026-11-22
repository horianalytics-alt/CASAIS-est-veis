import { z } from 'zod'
import { isValidISODate } from '@/lib/format'

/**
 * Esquemas Zod da recorrência (src/actions/recorrencia.ts).
 * Plano: docs/planos/estrutura-recorrencia.md, §8 e §15.
 *
 * Moram aqui, e não no arquivo da action, porque um módulo 'use server' só
 * exporta funções async, e os testes unitários precisam destes.
 *
 * O banco revalida tudo o que importa (recorrencia_* em 00019); estas regras
 * existem para o usuário ler a mensagem certa no campo certo.
 */

const uuid = z
  .string({ required_error: 'Escolha uma opção válida.', invalid_type_error: 'Escolha uma opção válida.' })
  .uuid('Escolha uma opção válida.')

const dataISO = z
  .string({ required_error: 'Informe a data.', invalid_type_error: 'Data inválida.' })
  .trim()
  .refine((valor) => isValidISODate(valor), 'Data inválida.')

const mesISO = z
  .string({ required_error: 'Escolha o mês.', invalid_type_error: 'Mês inválido.' })
  .trim()
  .regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/, 'Mês inválido.')

/** 'YYYY-MM' -> 'YYYY-MM-01', o formato que as RPCs recebem. */
export function primeiroDiaDoMes(mes: string): string {
  return `${mes}-01`
}

/**
 * Valor em reais, sempre positivo. Aceita número ou texto com vírgula (o
 * formulário de lançar manda texto, como em salvarLancamento). Mais de 2 casas
 * é RECUSADO, não arredondado. Uma mensagem só, pela primeira regra violada
 * (lição L-016: checks encadeados do Zod rodam todos).
 */
export const valorEmReais = z
  // errorMap no union: z.number() recusa NaN no próprio tipo, e sem isto a
  // mensagem chegaria como 'Invalid input', em inglês (teste unitário).
  .union([z.string(), z.number()], {
    errorMap: (_issue, ctx) => ({ message: ctx.data === undefined ? 'Informe o valor.' : 'Valor inválido.' }),
  })
  .transform((entrada, ctx) => {
    let numero: number
    if (typeof entrada === 'number') {
      numero = entrada
    } else {
      const limpo = entrada.trim()
      const ultimaVirgula = limpo.lastIndexOf(',')
      const ultimoPonto = limpo.lastIndexOf('.')
      const semMoeda = limpo.replace(/[^\d.,-]/g, '')
      const normalizado =
        ultimaVirgula > ultimoPonto
          ? semMoeda.replace(/\./g, '').replace(',', '.')
          : semMoeda.replace(/,/g, '')
      numero = normalizado === '' ? Number.NaN : Number(normalizado)
      if (limpo === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o valor.' })
        return z.NEVER
      }
    }
    const mensagem = !Number.isFinite(numero)
      ? 'Valor inválido.'
      : numero <= 0
        ? 'O valor precisa ser maior que zero.'
        : numero > 99_999_999.99
          ? 'Esse valor é alto demais.'
          : Math.abs(numero * 100 - Math.round(numero * 100)) >= 1e-6
            ? 'Use no máximo 2 casas decimais.'
            : null
    if (mensagem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensagem })
      return z.NEVER
    }
    return Math.round(numero * 100) / 100
  })

/**
 * Criar assinatura. Mesmos nomes de campo do formulário de lançar
 * (EntradaDeLancamento em src/actions/lancamento.ts), sem `parcelas` e sem
 * `contaDestinoId`: recorrência é só entrada ou saída, e não é parcela.
 */
export const esquemaCriarRecorrencia = z
  .object({
    tipo: z.enum(['receita', 'despesa'], {
      errorMap: () => ({ message: 'Repetir todo mês vale só para entrada ou saída.' }),
    }),
    descricao: z
      .string({ required_error: 'Descreva o lançamento.', invalid_type_error: 'Descreva o lançamento.' })
      .trim()
      .min(1, 'Descreva o lançamento.')
      .max(120, 'A descrição pode ter no máximo 120 caracteres.'),
    valor: valorEmReais,
    data: dataISO,
    contaId: uuid,
    categoriaId: uuid.nullish(),
    formaDePagamentoId: uuid.nullish(),
    responsavelId: uuid.nullish(),
    cotaDoResponsavel: z.number().min(0, 'A cota vai de 0 a 1.').max(1, 'A cota vai de 0 a 1.').nullish(),
    pagoPorId: uuid.nullish(),
    estaPago: z.boolean({ invalid_type_error: 'Informe se está pago.' }).default(false),
    dataDoPagamento: dataISO.nullish(),
    observacao: z.string({ invalid_type_error: 'Observação inválida.' }).trim().max(500, 'Observação longa demais.').nullish(),
    ehBeneficio: z.boolean().default(false),
    ehFutil: z.boolean().default(false),
    rotuloDoFutil: z.string().trim().max(60, 'Use no máximo 60 caracteres.').nullish(),
  })
  // CHECK tx_pago_tem_data: mesmas frases de salvarLancamento.
  .refine((e) => !e.estaPago || e.dataDoPagamento != null, {
    message: 'Informe a data do pagamento.',
    path: ['dataDoPagamento'],
  })
  .refine((e) => e.estaPago || e.dataDoPagamento == null, {
    message: 'Só preencha a data do pagamento se já estiver pago.',
    path: ['dataDoPagamento'],
  })
  // CHECK rr_cota_exige_responsavel.
  .refine((e) => e.cotaDoResponsavel == null || e.responsavelId != null, {
    message: 'Escolha de quem é a cota.',
    path: ['responsavelId'],
  })

export type EntradaCriarRecorrencia = z.input<typeof esquemaCriarRecorrencia>

export const esquemaResponderCobranca = z
  .object({
    lancamentoId: z
      .string({ required_error: 'Lançamento inválido.', invalid_type_error: 'Lançamento inválido.' })
      .uuid('Lançamento inválido.'),
    resposta: z.enum(['pago', 'ainda_nao'], {
      errorMap: () => ({ message: 'Resposta inválida.' }),
    }),
    /** Só em 'pago'. O front sugere o dia do vencimento. */
    dataPagamento: dataISO.nullish(),
  })
  .refine((e) => e.resposta !== 'pago' || e.dataPagamento != null, {
    message: 'Informe a data do pagamento.',
    path: ['dataPagamento'],
  })

export type EntradaResponderCobranca = z.input<typeof esquemaResponderCobranca>

export const esquemaAlterarValorRecorrencia = z.object({
  regraId: uuid,
  valor: valorEmReais,
  /** 'YYYY-MM': deste mês em diante. */
  aPartirDe: mesISO,
})

export type EntradaAlterarValorRecorrencia = z.input<typeof esquemaAlterarValorRecorrencia>

export const esquemaEncerrarRecorrencia = z.object({
  regraId: uuid,
  /** 'YYYY-MM': o último mês que ainda é cobrado. */
  ultimoMes: mesISO,
})

export type EntradaEncerrarRecorrencia = z.input<typeof esquemaEncerrarRecorrencia>

// ---------------------------------------------------------------------------
// esquemaAlterarRegra — altera qualquer subconjunto das 12 chaves da regra.
// Plano: docs/planos/estrutura-alterar-regra.md, §4.1.
// ---------------------------------------------------------------------------

/** Chaves opcionais que podem ir ao banco. Usada no refine e na montagem de p_campos. */
export const CAMPOS_DA_REGRA = [
  'descricao',
  'valor',
  'contaId',
  'categoriaId',
  'formaDePagamentoId',
  'responsavelId',
  'cotaDoResponsavel',
  'pagoPorId',
  'observacao',
  'ehBeneficio',
  'ehFutil',
  'rotuloDoFutil',
] as const

type CampoDaRegra = (typeof CAMPOS_DA_REGRA)[number]

/** Campo de texto opcional: undefined = não mexe; '' ou só espaços = null (apaga). */
const textoOpcional = (max: number, msg: string) =>
  z
    .string({ invalid_type_error: 'Texto inválido.' })
    .trim()
    .max(max, msg)
    .nullish()
    .transform((t) => (t === undefined ? undefined : t ? t : null))

export const esquemaAlterarRegra = z
  .object({
    regraId: uuid,
    /** 'YYYY-MM': só os lançamentos pendentes deste mês em diante. */
    aPartirDe: mesISO,
    descricao: z
      .string({ invalid_type_error: 'Descreva o lançamento.' })
      .trim()
      .min(1, 'Descreva o lançamento.')
      .max(120, 'A descrição pode ter no máximo 120 caracteres.')
      .optional(),
    valor: valorEmReais.optional(),
    contaId: uuid.optional(),
    categoriaId: uuid.nullable().optional(),
    formaDePagamentoId: uuid.nullable().optional(),
    responsavelId: uuid.nullable().optional(),
    cotaDoResponsavel: z
      .number({ invalid_type_error: 'A cota vai de 0 a 1.' })
      .min(0, 'A cota vai de 0 a 1.')
      .max(1, 'A cota vai de 0 a 1.')
      .nullable()
      .optional(),
    pagoPorId: uuid.optional(),
    observacao: textoOpcional(500, 'Observação longa demais.'),
    ehBeneficio: z.boolean({ invalid_type_error: 'Informe se foi pago com benefício.' }).optional(),
    ehFutil: z.boolean({ invalid_type_error: 'Informe se é um gasto fútil.' }).optional(),
    rotuloDoFutil: textoOpcional(60, 'Use no máximo 60 caracteres.'),
  })
  .refine((e) => CAMPOS_DA_REGRA.some((c) => (e as Record<CampoDaRegra, unknown>)[c] !== undefined), {
    message: 'Escolha ao menos um campo para alterar.',
    path: ['formulario'],
  })
  // rr_cota_exige_responsavel: cota com responsável explicitamente apagado no mesmo pedido.
  .refine((e) => e.cotaDoResponsavel == null || e.responsavelId !== null, {
    message: 'Escolha de quem é a cota.',
    path: ['responsavelId'],
  })
  // rr_rotulo_exige_futil: mesmo arranjo de esquemas-edicao-lancamento.ts:120-123.
  .refine((e) => e.rotuloDoFutil == null || e.ehFutil === true, {
    message: 'Marque como fútil para usar o rótulo.',
    path: ['rotuloDoFutil'],
  })

export type EntradaAlterarRegra = z.input<typeof esquemaAlterarRegra>
export type AlteracaoDeRegraParseada = z.output<typeof esquemaAlterarRegra>
