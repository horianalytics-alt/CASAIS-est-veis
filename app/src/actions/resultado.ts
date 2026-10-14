import { z, type ZodError } from 'zod'

/**
 * Rede de segurança em português para o Zod.
 *
 * Toda mensagem deste projeto deveria ser declarada no próprio esquema. Quando
 * uma escapa — campo novo, tipo inesperado vindo de um request forjado — o
 * padrão do Zod é inglês ('Invalid input', 'Required', 'Expected boolean,
 * received string') e esse texto chegaria à tela do usuário via
 * `camposComErro`. Este mapa garante que o pior caso ainda seja português.
 *
 * Registrado uma vez, no módulo que TODA action importa.
 */
const mapaDeErrosEmPortugues: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: 'Campo obrigatório.' }
      }
      return { message: 'Valor inválido.' }

    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: 'Escolha uma das opções válidas.' }

    case z.ZodIssueCode.invalid_union:
      return { message: 'Valor inválido.' }

    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'E-mail inválido.' }
      if (issue.validation === 'uuid') return { message: 'Escolha uma opção válida.' }
      return { message: 'Formato inválido.' }

    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') {
        return issue.minimum === 1
          ? { message: 'Campo obrigatório.' }
          : { message: `Use ao menos ${issue.minimum} caracteres.` }
      }
      if (issue.type === 'number') {
        return { message: `O valor mínimo é ${issue.minimum}.` }
      }
      if (issue.type === 'array') {
        return { message: `Informe ao menos ${issue.minimum} item(ns).` }
      }
      return { message: 'Valor baixo demais.' }

    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') {
        return { message: `Use no máximo ${issue.maximum} caracteres.` }
      }
      if (issue.type === 'number') {
        return { message: `O valor máximo é ${issue.maximum}.` }
      }
      if (issue.type === 'array') {
        return { message: `Informe no máximo ${issue.maximum} item(ns).` }
      }
      return { message: 'Valor alto demais.' }

    case z.ZodIssueCode.not_multiple_of:
      return { message: 'Valor com precisão inválida.' }

    case z.ZodIssueCode.unrecognized_keys:
      return { message: 'Há campos não reconhecidos no formulário.' }

    default:
      // `ctx.defaultError` só é usado quando nada acima cobriu; o teste de
      // vazamento cobre os casos alcançáveis.
      return { message: ctx.defaultError }
  }
}

z.setErrorMap(mapaDeErrosEmPortugues)

/**
 * Forma única de retorno de TODA Server Action deste projeto.
 *
 * A Fachada renderiza erro a partir desta forma e de mais nenhuma: `ok` é o
 * discriminante, `erro` já vem em português pronto para a tela, e
 * `camposComErro` mapeia campo do formulário -> mensagens daquele campo.
 */
export type ResultadoAction<T = void> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; camposComErro?: Record<string, string[]> }

export function sucesso(): ResultadoAction<void>
export function sucesso<T>(dados: T): ResultadoAction<T>
export function sucesso<T>(dados?: T): ResultadoAction<T | undefined> {
  return { ok: true, dados }
}

export function falha(
  erro: string,
  camposComErro?: Record<string, string[]>,
): ResultadoAction<never> {
  return camposComErro ? { ok: false, erro, camposComErro } : { ok: false, erro }
}

/**
 * Converte o erro do Zod na forma que a Fachada espera.
 *
 * Zod 3: `.flatten().fieldErrors` é `Record<string, string[] | undefined>`;
 * as chaves sem mensagem são descartadas para o tipo fechar sem `any`.
 */
export function falhaDeValidacao(
  erro: ZodError,
  mensagem = 'Confira os campos destacados.',
): ResultadoAction<never> {
  const bruto = erro.flatten().fieldErrors
  const campos: Record<string, string[]> = {}

  for (const [campo, mensagens] of Object.entries(bruto)) {
    if (mensagens && mensagens.length > 0) campos[campo] = mensagens
  }

  return falha(mensagem, campos)
}

/** Erro que o Postgres/PostgREST devolve. Só o que usamos para decidir. */
type ErroPostgres = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

/**
 * Mensagens que as RPCs levantam de propósito, em português, já pensadas para
 * o usuário final. Estas podem ser repassadas; qualquer outra, não.
 *
 * O prefixo é comparado com startsWith porque algumas trazem valor
 * interpolado no fim (ex.: 'Número de parcelas inválido: 0').
 */
const MENSAGENS_DE_NEGOCIO = [
  'Você precisa estar logado para criar uma família',
  'Você precisa estar logado para entrar em uma família',
  'Você precisa estar logado',
  'Você já faz parte de uma família',
  'Você não faz parte de nenhuma família',
  'Regra de divisão inválida',
  'Não foi possível gerar um código de convite',
  'Código de convite não encontrado',
  'Esta família já está completa',
  'Nenhum lançamento recebido',
  'Número de parcelas inválido',
  'Conta não encontrada nesta família',
  'Lançamento não encontrado',
  'Escopo inválido',
  'Não é permitido mudar a família de um membro',
  'Não é permitido mudar o usuário de um membro',
  'Não é permitido mudar o identificador de um membro',
  'Não é permitido mudar a data de entrada de um membro',
  'Esta fatura não tem valor em aberto',
  'Cartão não encontrado nesta família',
  'Conta de origem inválida',
  'Valor do acerto precisa ser maior que zero',
  'O acerto precisa ser entre duas pessoas diferentes',
  'Cada pessoa precisa de uma conta corrente para acertar',
  // 00007/00008 — limite de tentativas do convite e rotação do código.
  'Muitas tentativas. Tente de novo em alguns minutos.',
  'Você não faz parte de uma família',
] as const

/**
 * 23505 de índice único conhecido -> mensagem específica.
 *
 * O Postgres põe o nome do índice na mensagem crua; ele é usado só para
 * ESCOLHER o texto, nunca é exibido. Os nomes vêm das migrations 00009 (os
 * dois primeiros, recriados com os MESMOS nomes na 00011) e 00011 (o de
 * grupos) — não renomeie um índice sem atualizar esta tabela.
 */
const POR_INDICE_UNICO: Record<string, string> = {
  categories_nome_ativo_unico: 'Já existe uma categoria ativa com esse nome.',
  payment_methods_nome_ativo_unico: 'Já existe uma forma de pagamento ativa com esse nome.',
  category_groups_nome_unico: 'Já existe um grupo com esse nome.',
}

/** Mensagem genérica por SQLSTATE, quando a crua não é exibível. */
const POR_CODIGO: Record<string, string> = {
  // check_violation — o trigger que congela family_members, ou um CHECK da
  // tabela transactions que a validação do servidor deixou passar.
  '23514': 'Esses dados não são válidos para esta operação. Confira e tente de novo.',
  // unique_violation
  '23505': 'Esse registro já existe.',
  // foreign_key_violation
  '23503': 'Um dos itens escolhidos não existe mais. Recarregue a página.',
  // not_null_violation
  '23502': 'Falta preencher um campo obrigatório.',
  // insufficient_privilege — RLS barrou.
  '42501': 'Você não tem permissão para fazer isso.',
  // Sessão ausente/expirada no PostgREST.
  PGRST301: 'Sua sessão expirou. Entre de novo.',
}

/**
 * Traduz erro do banco para mensagem exibível.
 *
 * Mensagem crua do Postgres NUNCA é repassada: ela vaza nome de tabela, de
 * coluna e de constraint. Só passa o que está em MENSAGENS_DE_NEGOCIO, que são
 * textos escritos para o usuário dentro das próprias RPCs.
 */
export function traduzErroDoBanco(
  erro: unknown,
  fallback = 'Não foi possível concluir. Tente de novo em instantes.',
): string {
  const e = (erro ?? {}) as ErroPostgres
  const mensagem = typeof e.message === 'string' ? e.message : ''

  for (const conhecida of MENSAGENS_DE_NEGOCIO) {
    if (mensagem.startsWith(conhecida)) return mensagem
  }

  if (e.code === '23505') {
    for (const [indice, texto] of Object.entries(POR_INDICE_UNICO)) {
      if (mensagem.includes(`"${indice}"`)) return texto
    }
  }

  if (e.code && POR_CODIGO[e.code]) return POR_CODIGO[e.code]

  return fallback
}
