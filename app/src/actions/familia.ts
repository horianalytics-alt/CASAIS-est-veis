'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  falha,
  falhaDeValidacao,
  sucesso,
  traduzErroDoBanco,
  type ResultadoAction,
} from './resultado'

const nomeDaFamilia = z
  .string({ required_error: 'Dê um nome para a casa.' })
  .trim()
  .min(1, 'Dê um nome para a casa.')
  .max(60, 'O nome pode ter no máximo 60 caracteres.')

const nomeDoMembro = z
  .string({ required_error: 'Informe seu nome.' })
  .trim()
  .min(1, 'Informe seu nome.')
  .max(40, 'O nome pode ter no máximo 40 caracteres.')

/** `equal` divide meio a meio; `proportional` divide pela renda de cada um. */
const regraDeDivisao = z.enum(['equal', 'proportional'], {
  required_error: 'Escolha como dividir as contas.',
  invalid_type_error: 'Escolha como dividir as contas.',
})

/**
 * Renda é opcional, mas obrigatória quando a divisão é proporcional — sem ela
 * não há como calcular a cota de cada um.
 *
 * Campo vazio vira `null`, não `0`: `0` seria uma renda declarada de zero.
 */
const renda = z
  // Mensagem declarada: sem ela, um valor de tipo inesperado cairia no
  // 'Invalid input' em inglês do Zod, que chegaria à tela.
  .union([z.string(), z.number(), z.null(), z.undefined()], {
    invalid_type_error: 'Renda inválida.',
  })
  .transform((valor, ctx) => {
    if (valor === null || valor === undefined) return null
    if (typeof valor === 'number') {
      if (!Number.isFinite(valor)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Renda inválida.' })
        return z.NEVER
      }
      return valor
    }

    const limpo = valor.trim()
    if (limpo === '') return null

    // Aceita "4.500,00" (pt-BR) e "4500.00": o último separador é o decimal.
    const ultimaVirgula = limpo.lastIndexOf(',')
    const ultimoPonto = limpo.lastIndexOf('.')
    const semMoeda = limpo.replace(/[^\d.,-]/g, '')
    const normalizado =
      ultimaVirgula > ultimoPonto
        ? semMoeda.replace(/\./g, '').replace(',', '.')
        : semMoeda.replace(/,/g, '')

    const numero = Number(normalizado)
    if (normalizado === '' || Number.isNaN(numero)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Renda inválida.' })
      return z.NEVER
    }
    return numero
  })
  .refine((valor) => valor === null || valor >= 0, {
    message: 'A renda não pode ser negativa.',
  })
  .refine((valor) => valor === null || valor <= 99_999_999.99, {
    message: 'Esse valor de renda é alto demais.',
  })

/** O código tem 6 caracteres de [A-Z2-9] — sem 0,1,I,O, que se confundem. */
const codigoDeConvite = z
  .string({ required_error: 'Informe o código do convite.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{6}$/, 'O código tem 6 letras ou números.')

const esquemaCriarFamilia = z
  .object({
    nomeDaFamilia,
    regraDeDivisao,
    nomeDoMembro,
    renda,
  })
  .refine(
    (dados) => dados.regraDeDivisao !== 'proportional' || dados.renda !== null,
    {
      message: 'Para dividir por renda, informe quanto você recebe por mês.',
      path: ['renda'],
    },
  )

const esquemaEntrarNaFamilia = z.object({
  codigo: codigoDeConvite,
  nomeDoMembro,
  renda,
})

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor : ''
}

export type FamiliaCriada = {
  familyId: string
  memberId: string
  codigoDeConvite: string
}

export async function criarFamilia(
  formData: FormData,
): Promise<ResultadoAction<FamiliaCriada>> {
  const analise = esquemaCriarFamilia.safeParse({
    nomeDaFamilia: texto(formData, 'nomeDaFamilia'),
    regraDeDivisao: texto(formData, 'regraDeDivisao'),
    nomeDoMembro: texto(formData, 'nomeDoMembro'),
    renda: texto(formData, 'renda'),
  })

  if (!analise.success) return falhaDeValidacao(analise.error)

  const supabase = await createClient()

  // Autorização: a RPC é SECURITY DEFINER, então quem a chama precisa estar
  // provado AQUI. getUser() valida o token no servidor de Auth; getSession()
  // leria apenas o cookie, que é forjável.
  const { data: usuario, error: erroDeUsuario } = await supabase.auth.getUser()
  if (erroDeUsuario || !usuario.user) {
    return falha('Sua sessão expirou. Entre de novo.')
  }

  const { data, error } = await supabase.rpc('create_family', {
    p_family_name: analise.data.nomeDaFamilia,
    p_split_rule: analise.data.regraDeDivisao,
    p_member_name: analise.data.nomeDoMembro,
    // `undefined` omite o parâmetro e deixa o DEFAULT NULL da função valer.
    p_monthly_income: analise.data.renda ?? undefined,
  })

  if (error) return falha(traduzErroDoBanco(error))

  const linha = data?.[0]
  if (!linha) return falha('Não foi possível criar a casa. Tente de novo.')

  revalidatePath('/', 'layout')

  return sucesso({
    familyId: linha.family_id,
    memberId: linha.member_id,
    codigoDeConvite: linha.join_code,
  })
}

export type FamiliaIngressada = {
  familyId: string
  memberId: string
}

export async function entrarNaFamilia(
  formData: FormData,
): Promise<ResultadoAction<FamiliaIngressada>> {
  const analise = esquemaEntrarNaFamilia.safeParse({
    codigo: texto(formData, 'codigo'),
    nomeDoMembro: texto(formData, 'nomeDoMembro'),
    renda: texto(formData, 'renda'),
  })

  if (!analise.success) return falhaDeValidacao(analise.error)

  const supabase = await createClient()

  const { data: usuario, error: erroDeUsuario } = await supabase.auth.getUser()
  if (erroDeUsuario || !usuario.user) {
    return falha('Sua sessão expirou. Entre de novo.')
  }

  const { data, error } = await supabase.rpc('join_family', {
    p_join_code: analise.data.codigo,
    p_member_name: analise.data.nomeDoMembro,
    p_monthly_income: analise.data.renda ?? undefined,
  })

  if (error) {
    // Código errado é erro DO CAMPO: a Fachada destaca o input do convite.
    const mensagem = traduzErroDoBanco(error)
    if (mensagem.startsWith('Código de convite não encontrado')) {
      return falha(mensagem, { codigo: [mensagem] })
    }
    return falha(mensagem)
  }

  const linha = data?.[0]
  if (!linha) return falha('Não foi possível entrar na casa. Tente de novo.')

  revalidatePath('/', 'layout')

  return sucesso({ familyId: linha.family_id, memberId: linha.member_id })
}

export type PreviaDaFamilia = {
  nome: string
  membros: number
  limiteDeMembros: number
  temVaga: boolean
}

/**
 * Mostra o nome da casa antes de entrar, para o convidado confirmar que é a
 * casa certa. A RPC é SECURITY DEFINER e devolve só estes 4 campos: nenhum
 * dado financeiro vaza para quem ainda não é membro.
 *
 * Código inexistente devolve ZERO linhas, não erro — por isso o `null`.
 */
export async function verPreviaDaFamilia(
  codigo: string,
): Promise<ResultadoAction<PreviaDaFamilia | null>> {
  const analise = codigoDeConvite.safeParse(codigo)

  if (!analise.success) {
    return falha('O código tem 6 letras ou números.', {
      codigo: analise.error.issues.map((i) => i.message),
    })
  }

  const supabase = await createClient()

  const { data: usuario, error: erroDeUsuario } = await supabase.auth.getUser()
  if (erroDeUsuario || !usuario.user) {
    return falha('Sua sessão expirou. Entre de novo.')
  }

  const { data, error } = await supabase.rpc('family_preview', {
    p_join_code: analise.data,
  })

  if (error) return falha(traduzErroDoBanco(error))

  const linha = data?.[0]
  if (!linha) return sucesso(null)

  return sucesso({
    nome: linha.name,
    membros: linha.member_count,
    limiteDeMembros: linha.member_limit,
    temVaga: linha.has_room,
  })
}
