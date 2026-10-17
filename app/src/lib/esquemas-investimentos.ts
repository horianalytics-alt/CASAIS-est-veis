import { z } from 'zod'
import { isValidISODate } from '@/lib/format'
import { limparNome } from '@/lib/lista-nomes'
import { LIMITES_SIMULACAO } from '@/lib/simulador'

/**
 * Esquemas Zod das Server Actions da carteira de investimento
 * (src/actions/investimentos.ts). Ficam fora do arquivo de action porque um
 * módulo 'use server' só exporta função async, e os testes precisam deles.
 *
 * As mensagens que também existem dentro das RPCs das migrations 00016/00017 são
 * IGUAIS às delas: a tela mostra a mesma frase venha a recusa do Zod ou do
 * banco. Plano: docs/planos/estrutura-carteira-investimento.md, §2.8.
 *
 * Dinheiro: a fronteira é em REAIS (number) e sai daqui em CENTAVOS inteiros.
 * Mais de 2 casas é recusado, não arredondado (P-009). Cada campo tem UMA
 * mensagem, pela primeira regra violada (L-016). Modelo:
 * `valor` de esquemas-edicao-lancamento.ts.
 */

export const TIPOS_RENDIMENTO = ['liquidez_diaria', 'pos_fixado', 'pre_fixado'] as const
export type TipoRendimento = (typeof TIPOS_RENDIMENTO)[number]

export const LIMITE_NOME_CAIXINHA = 60
/** 100% ao mês, o mesmo teto do simulador (decisão Q5 do Heitor). */
export const TAXA_MAX_BPS = LIMITES_SIMULACAO.taxaMaxBps
/** Teto de valor dos esquemas do projeto (esquemas-edicao-lancamento.ts). */
export const VALOR_MAX_REAIS = 99_999_999.99

export const MENSAGENS_INVESTIMENTOS = {
  valorZero: 'O valor precisa ser maior que zero.',
  valorAlto: 'Esse valor é alto demais.',
  valorCasas: 'Use no máximo 2 casas decimais.',
  valorInvalido: 'Valor inválido.',
  taxaFaixa: 'A taxa precisa estar entre 0% e 100% ao mês.',
  taxaInvalida: 'Taxa inválida.',
  nomeVazio: 'Informe o nome da caixinha.',
  nomeLongo: `Use no máximo ${LIMITE_NOME_CAIXINHA} caracteres.`,
  tipoInvalido: 'Escolha um tipo de rendimento válido.',
  resgateImediato: 'Informe se o resgate é imediato.',
  vencimentoFalta: 'Informe a data de vencimento.',
  vencimentoInvalido: 'Data de vencimento inválida.',
  competenciaInvalida: 'Mês de competência inválido',
  destinoInvalido: 'Escolha para onde vai o resgate.',
  origemInvalida: 'Conta de origem inválida',
  destinoContaInvalida: 'Conta de destino inválida',
  caixinhaInvalida: 'Caixinha não encontrada',
} as const

const M = MENSAGENS_INVESTIMENTOS

function uuidCom(mensagem: string) {
  return z.string({ required_error: mensagem, invalid_type_error: mensagem }).uuid(mensagem)
}

const caixinhaId = uuidCom(M.caixinhaInvalida)

/** Reais -> centavos inteiros. Uma mensagem só (L-016). */
const valorEmCentavos = z
  .number({ required_error: 'Informe o valor.', invalid_type_error: M.valorInvalido })
  .superRefine((n, ctx) => {
    const mensagem = !Number.isFinite(n)
      ? M.valorInvalido
      : n <= 0
        ? M.valorZero
        : n > VALOR_MAX_REAIS
          ? M.valorAlto
          : Math.abs(n * 100 - Math.round(n * 100)) >= 1e-6
            ? M.valorCasas
            : null
    if (mensagem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensagem })
  })
  .transform((n) => Math.round(n * 100))

/** Pontos-base inteiros, 0..TAXA_MAX_BPS. O front converte "1,05" com taxaPercentualParaBps. */
const taxaMensalBps = z
  .number({ required_error: 'Informe a taxa.', invalid_type_error: M.taxaInvalida })
  .superRefine((n, ctx) => {
    const mensagem = !Number.isFinite(n) || !Number.isInteger(n)
      ? M.taxaInvalida
      : n < 0 || n > TAXA_MAX_BPS
        ? M.taxaFaixa
        : null
    if (mensagem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensagem })
  })

/** Nome limpo (sem invisíveis, espaço colapsado) e contado por code point (L-015). */
const nomeDaCaixinha = z
  .string({ required_error: M.nomeVazio, invalid_type_error: M.nomeVazio })
  .transform(limparNome)
  .superRefine((nome, ctx) => {
    const tamanho = Array.from(nome).length
    const mensagem = tamanho === 0 ? M.nomeVazio : tamanho > LIMITE_NOME_CAIXINHA ? M.nomeLongo : null
    if (mensagem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensagem })
  })

/** Data ISO de calendário, 2000-01-01..2100-12-31 (a mesma faixa da RPC). */
const dataDeVencimento = z
  .string({ invalid_type_error: M.vencimentoInvalido })
  .trim()
  .superRefine((data, ctx) => {
    if (!isValidISODate(data) || data < '2000-01-01' || data > '2100-12-31') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: M.vencimentoInvalido })
    }
  })

export const esquemaAplicar = z
  .object({
    contaOrigemId: uuidCom(M.origemInvalida),
    valor: valorEmCentavos,
    /** Omitida = o valor vai para o saldo não alocado da carteira. */
    caixinhaId: caixinhaId.optional(),
  })
  .strict()
  .transform((e) => ({ contaOrigemId: e.contaOrigemId, valorCentavos: e.valor, caixinhaId: e.caixinhaId }))

export const esquemaCriarCaixinha = z
  .object({
    nome: nomeDaCaixinha,
    tipoRendimento: z.enum(TIPOS_RENDIMENTO, { errorMap: () => ({ message: M.tipoInvalido }) }),
    taxaMensalBps,
    resgateImediato: z.boolean({ required_error: M.resgateImediato, invalid_type_error: M.resgateImediato }),
    /** Obrigatória quando resgateImediato = false. No passado é aceita: a caixinha nasce liberada. */
    dataVencimento: dataDeVencimento.nullable().optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (!e.resgateImediato && e.dataVencimento == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dataVencimento'], message: M.vencimentoFalta })
    }
  })
  .transform((e) => ({
    nome: e.nome,
    tipoRendimento: e.tipoRendimento,
    taxaMensalBps: e.taxaMensalBps,
    resgateImediato: e.resgateImediato,
    dataVencimento: e.resgateImediato ? null : (e.dataVencimento ?? null),
  }))

export const esquemaAlocar = z
  .object({ caixinhaId, valor: valorEmCentavos })
  .strict()
  .transform((e) => ({ caixinhaId: e.caixinhaId, valorCentavos: e.valor }))

// O uuid interno e a chave desconhecida levam a mesma frase: quando o ramo do
// objeto falha "por dentro", o Zod 3 devolve o erro de dentro, e não o
// invalid_union.
const destinoDoResgate = z.union(
  [z.literal('nao_alocado'), z.object({ contaId: uuidCom(M.destinoInvalido) }).strict(M.destinoInvalido)],
  { errorMap: () => ({ message: M.destinoInvalido }) },
)

export const esquemaResgatar = z
  .object({
    caixinhaId,
    valor: valorEmCentavos,
    /** 'nao_alocado' = volta para o saldo livre da carteira. */
    destino: destinoDoResgate,
  })
  .strict()
  .transform((e) => ({
    caixinhaId: e.caixinhaId,
    valorCentavos: e.valor,
    contaDestinoId: e.destino === 'nao_alocado' ? null : e.destino.contaId,
  }))

export const esquemaAtualizarTaxa = z.object({ caixinhaId, taxaMensalBps }).strict()

// 'YYYY-MM' de 2000 a 2199. A RPC é quem recusa o mês CORRENTE e os futuros
// (só mês encerrado confirma, 00017), porque ela sabe o "hoje" de São Paulo.
// O seletor de mês da tela deve oferecer só os meses de
// carteira_rendimentos_pendentes.
const MES_DE_COMPETENCIA = /^(20|21)\d{2}-(0[1-9]|1[0-2])$/

export const esquemaConfirmarRendimento = z
  .object({
    caixinhaId,
    competencia: z
      .string({ required_error: M.competenciaInvalida, invalid_type_error: M.competenciaInvalida })
      .regex(MES_DE_COMPETENCIA, M.competenciaInvalida),
  })
  .strict()
  .transform((e) => ({ caixinhaId: e.caixinhaId, competencia: `${e.competencia}-01` }))

export type EntradaAplicar = z.input<typeof esquemaAplicar>
export type EntradaCriarCaixinha = z.input<typeof esquemaCriarCaixinha>
export type EntradaAlocar = z.input<typeof esquemaAlocar>
export type EntradaResgatar = z.input<typeof esquemaResgatar>
export type EntradaAtualizarTaxa = z.input<typeof esquemaAtualizarTaxa>
export type EntradaConfirmarRendimento = z.input<typeof esquemaConfirmarRendimento>
