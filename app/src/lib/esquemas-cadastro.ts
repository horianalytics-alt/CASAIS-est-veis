import { z } from 'zod'
import { LIMITE_CARACTERES, LIMITE_NOMES, limparNome, separarNomes } from '@/lib/lista-nomes'

/**
 * Esquemas Zod das actions de cadastro (categorias, formas de pagamento,
 * contas). Ficam fora dos arquivos de action porque um módulo 'use server' só
 * pode exportar funções assíncronas — e porque assim são testáveis sem servidor.
 *
 * Os limites de nome vêm de '@/lib/lista-nomes'. Nenhum número de limite é
 * repetido aqui.
 */

export const TIPOS_CATEGORIA = ['receita', 'despesa', 'investimento', 'todos'] as const
export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number]

export const TIPOS_CONTA = ['corrente', 'beneficio', 'cartao', 'investimento'] as const
export type TipoConta = (typeof TIPOS_CONTA)[number]

/** Limite técnico do nome de conta (o banco só exige não-vazio). */
export const LIMITE_CARACTERES_CONTA = 60

const id = z.string({ required_error: 'Item inválido.' }).uuid('Item inválido.')

const mensagemDeTamanho = `Use no máximo ${LIMITE_CARACTERES} caracteres.`

/** Nome único (renomear): limpo, 1..LIMITE_CARACTERES. */
const nomeDeCadastro = z
  .string({ required_error: 'Informe o nome.' })
  .transform(limparNome)
  .pipe(z.string().min(1, 'Informe o nome.').max(LIMITE_CARACTERES, mensagemDeTamanho))

/** Lote "Pet, Presentes": separado aqui mesmo, com os limites compartilhados. */
const loteDeNomes = z
  .string({ required_error: 'Informe ao menos um nome.' })
  .transform((texto, ctx) => {
    const lote = separarNomes(texto)

    if (lote.nomes.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe ao menos um nome.' })
      return z.NEVER
    }
    if (lote.nomes.length > LIMITE_NOMES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Informe no máximo ${LIMITE_NOMES} nomes por vez (você informou ${lote.nomes.length}).`,
      })
      return z.NEVER
    }
    const longos = lote.nomes.filter((nome) => nome.length > LIMITE_CARACTERES)
    if (longos.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Use no máximo ${LIMITE_CARACTERES} caracteres por nome: ${longos.join(', ')}.`,
      })
      return z.NEVER
    }
    return lote
  })

const tipoCategoria = z.enum(TIPOS_CATEGORIA)

// ---------------------------------------------------------------------------
// Categorias e formas de pagamento
// ---------------------------------------------------------------------------

export const esquemaAdicionarCategorias = z.object({ nomes: loteDeNomes, tipo: tipoCategoria })
export const esquemaAdicionarFormas = z.object({ nomes: loteDeNomes })
export const esquemaRenomear = z.object({ id, nome: nomeDeCadastro })
export const esquemaAlterarTipo = z.object({ id, tipo: tipoCategoria })
export const esquemaArquivar = z.object({
  id,
  arquivar: z.boolean({ required_error: 'Campo obrigatório.', invalid_type_error: 'Valor inválido.' }),
})
export const esquemaId = z.object({ id })

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

/**
 * Regra do CHECK accounts_cartao_tem_ciclo (00001), checada ANTES do banco
 * para devolver erro por campo em português, em vez do erro cru da constraint:
 *   cartão     -> fechamento E vencimento obrigatórios
 *   não-cartão -> nenhum dos dois
 * Devolve campo -> mensagem; objeto vazio = válido.
 */
export function validarCicloDoCartao(
  tipo: TipoConta,
  diaFechamento: number | null | undefined,
  diaVencimento: number | null | undefined,
): Record<string, string> {
  const erros: Record<string, string> = {}
  if (tipo === 'cartao') {
    if (diaFechamento == null) erros.diaFechamento = 'Informe o dia de fechamento da fatura (1 a 31).'
    if (diaVencimento == null) erros.diaVencimento = 'Informe o dia de vencimento da fatura (1 a 31).'
  } else {
    if (diaFechamento != null) erros.diaFechamento = 'Só cartão de crédito tem dia de fechamento.'
    if (diaVencimento != null) erros.diaVencimento = 'Só cartão de crédito tem dia de vencimento.'
  }
  return erros
}

const diaDoMes = z
  .number({ invalid_type_error: 'Informe um dia entre 1 e 31.' })
  .int('Informe um dia entre 1 e 31.')
  .min(1, 'Informe um dia entre 1 e 31.')
  .max(31, 'Informe um dia entre 1 e 31.')
  .nullable()
  .optional()

const nomeDeConta = z
  .string({ required_error: 'Informe o nome da conta.' })
  .transform(limparNome)
  .pipe(
    z
      .string()
      .min(1, 'Informe o nome da conta.')
      .max(LIMITE_CARACTERES_CONTA, `Use no máximo ${LIMITE_CARACTERES_CONTA} caracteres.`),
  )

/** numeric(14,2): até 999.999.999.999,99 em módulo. Arredonda ao centavo. */
const saldo = z
  .number({ invalid_type_error: 'Informe um valor válido.' })
  .finite('Informe um valor válido.')
  .transform((valor) => Math.round(valor * 100) / 100)
  .pipe(
    z
      .number()
      .gt(-1e12, 'Valor fora do limite permitido.')
      .lt(1e12, 'Valor fora do limite permitido.'),
  )

export const esquemaCriarConta = z
  .object({
    nome: nomeDeConta,
    tipo: z.enum(TIPOS_CONTA),
    saldoInicial: saldo.default(0),
    diaFechamento: diaDoMes,
    diaVencimento: diaDoMes,
  })
  .superRefine((conta, ctx) => {
    const erros = validarCicloDoCartao(conta.tipo, conta.diaFechamento, conta.diaVencimento)
    for (const [campo, message] of Object.entries(erros)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message })
    }
  })

/** O tipo NÃO está aqui de propósito: conta não muda de tipo depois de criada. */
export const esquemaEditarConta = z.object({
  id,
  nome: nomeDeConta.optional(),
  diaFechamento: diaDoMes,
  diaVencimento: diaDoMes,
})
