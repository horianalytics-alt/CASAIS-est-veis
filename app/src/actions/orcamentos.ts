'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { obterContextoDaFamilia } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

/*
 * Orçamento mensal por categoria (category_budgets, 00001; CHECK de mês em
 * 00013). Toda action, nesta ordem — o mesmo padrão de categorias.ts:
 *   1. valida a entrada com Zod e usa SÓ o valor parseado;
 *   2. resolve usuário (getUser) e família no servidor;
 *   3. autoriza o recurso: a categoria (ou o orçamento) é da família de quem
 *      chama, com filtro explícito por family_id;
 *   4. o RLS de category_budgets (00002, reescrito em 00006) é a segunda
 *      camada, não a única.
 * Um id de outra família cai em 'não encontrada/o' — sem revelar que existe.
 *
 * Os esquemas moram aqui, não exportados (um módulo 'use server' só exporta
 * funções async): a validação é exercitada pelo teste de integração.
 */

const NAO_ENCONTRADA = 'Categoria não encontrada.'
const NAO_ENCONTRADO = 'Orçamento não encontrado.'

/**
 * Mesmo intervalo do CHECK category_budgets_mes_valido (00013): 2000-01..2199-12.
 * Recusado aqui para virar erro de campo, e não um 23514 genérico do banco.
 */
const mes = z
  .string({ required_error: 'Informe o mês.', invalid_type_error: 'Mês inválido.' })
  .trim()
  .regex(/^2[01][0-9]{2}-(0[1-9]|1[0-2])$/, 'Mês inválido.')

/**
 * Valor em reais, sempre positivo (CHECK amount > 0). Mesma regra de
 * valorDoAcerto (src/lib/esquemas-pagamentos.ts): mais de 2 casas é RECUSADO,
 * não arredondado — arredondar float é o achado P-009. A tolerância de 1e-6 só
 * absorve o ruído binário de um valor que TEM 2 casas (0.1 + 0.2).
 *
 * Uma mensagem só, na primeira regra violada: com checks encadeados
 * (.finite().positive().max().refine()) o Zod roda TODOS, e Infinity
 * devolvia 3 mensagens no mesmo campo.
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

const esquemaDefinirOrcamento = z.object({
  categoriaId: z.string({ required_error: 'Escolha uma categoria.' }).uuid('Escolha uma categoria.'),
  mes,
  valor,
})

const esquemaExcluirOrcamento = z.object({
  id: z.string({ required_error: 'Item inválido.' }).uuid('Item inválido.'),
})

function revalidar() {
  for (const rota of ['/analises', '/ajustes/categorias']) revalidatePath(rota)
}

/**
 * Cria OU atualiza o orçamento da categoria naquele mês.
 *
 * Upsert nativo (INSERT ... ON CONFLICT DO UPDATE) sobre o UNIQUE
 * (family_id, category_id, month) de 00001: uma instrução só, atômica. Um
 * select-then-write teria corrida entre os dois membros salvando o mesmo mês
 * ao mesmo tempo (o segundo insert bateria no UNIQUE). Como family_id faz
 * parte da chave de conflito e vem do servidor, o conflito só pode ser com uma
 * linha da própria família. No caminho de atualização o id e o created_at da
 * linha existente são preservados.
 */
export async function definirOrcamento(input: {
  categoriaId: string
  mes: string
  valor: number
}): Promise<ResultadoAction<{ id: string; categoriaId: string; mes: string; valor: number }>> {
  const analise = esquemaDefinirOrcamento.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { categoriaId, mes: mesParseado, valor: valorParseado } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  // Autorização do recurso: a categoria é desta família.
  const { data: categoria, error: erroCategoria } = await ctx.supabase
    .from('categories')
    .select('id')
    .eq('id', categoriaId)
    .eq('family_id', ctx.familyId)
    .maybeSingle()
  if (erroCategoria) return falha(traduzErroDoBanco(erroCategoria))
  if (!categoria) return falha(NAO_ENCONTRADA)

  const { data, error } = await ctx.supabase
    .from('category_budgets')
    .upsert(
      { family_id: ctx.familyId, category_id: categoriaId, month: mesParseado, amount: valorParseado },
      { onConflict: 'family_id,category_id,month' },
    )
    .select('id,category_id,month,amount')
    .single()
  if (error) {
    // Categoria apagada entre a checagem e o upsert: a FK composta barra (23503).
    if (error.code === '23503') return falha(NAO_ENCONTRADA)
    return falha(traduzErroDoBanco(error))
  }

  revalidar()
  return sucesso({ id: data.id, categoriaId: data.category_id, mes: data.month, valor: data.amount })
}

/** Remove o orçamento. Não mexe em categoria nem em lançamento. */
export async function excluirOrcamento(input: { id: string }): Promise<ResultadoAction<void>> {
  const analise = esquemaExcluirOrcamento.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { id } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { ctx } = contexto

  // O filtro por family_id É a autorização: id de outra família apaga 0 linhas.
  const { data, error } = await ctx.supabase
    .from('category_budgets')
    .delete()
    .eq('id', id)
    .eq('family_id', ctx.familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  if ((data ?? []).length === 0) return falha(NAO_ENCONTRADO)

  revalidar()
  return sucesso()
}
