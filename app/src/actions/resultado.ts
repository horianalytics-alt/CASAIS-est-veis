import type { ZodError } from 'zod'

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
] as const

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

  if (e.code && POR_CODIGO[e.code]) return POR_CODIGO[e.code]

  return fallback
}
