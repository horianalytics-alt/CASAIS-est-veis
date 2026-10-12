'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  falha,
  falhaDeValidacao,
  sucesso,
  type ResultadoAction,
} from './resultado'

const SENHA_MINIMA = 8

const email = z
  .string({ required_error: 'Informe o e-mail.' })
  .trim()
  .min(1, 'Informe o e-mail.')
  .email('E-mail inválido.')
  .toLowerCase()

const senha = z
  .string({ required_error: 'Informe a senha.' })
  .min(SENHA_MINIMA, `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`)
  .max(72, 'A senha pode ter no máximo 72 caracteres.')

const esquemaEntrar = z.object({
  email,
  // Na entrada não cobramos tamanho: senha antiga curta ainda precisa entrar.
  senha: z.string({ required_error: 'Informe a senha.' }).min(1, 'Informe a senha.'),
})

const esquemaCadastrar = z
  .object({
    email,
    senha,
    confirmacao: z
      .string({ required_error: 'Repita a senha.' })
      .min(1, 'Repita a senha.'),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    message: 'As senhas não são iguais.',
    path: ['confirmacao'],
  })

const esquemaPedirRecuperacao = z.object({ email })

const esquemaNovaSenha = z
  .object({
    senha,
    confirmacao: z
      .string({ required_error: 'Repita a senha.' })
      .min(1, 'Repita a senha.'),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    message: 'As senhas não são iguais.',
    path: ['confirmacao'],
  })

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo)
  return typeof valor === 'string' ? valor : ''
}

/**
 * Traduz os erros do Supabase Auth.
 *
 * A mensagem crua vem em inglês e às vezes diferencia "usuário não existe" de
 * "senha errada", o que permite enumerar contas. Aqui as duas colapsam numa
 * mensagem só, de propósito.
 */
function traduzErroDeAuth(mensagem: string, status?: number): string {
  const m = mensagem.toLowerCase()

  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada.'
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Já existe uma conta com esse e-mail. Tente entrar.'
  }
  if (m.includes('password should be at least')) {
    return `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`
  }
  if (m.includes('should be different from the old password')) {
    return 'A nova senha precisa ser diferente da antiga.'
  }
  if (m.includes('weak password') || m.includes('password is known to be weak')) {
    return 'Essa senha é fácil de descobrir. Escolha uma mais forte.'
  }
  if (m.includes('auth session missing') || m.includes('session_not_found')) {
    return 'Esse link expirou. Peça a recuperação de senha de novo.'
  }
  if (m.includes('token has expired') || m.includes('otp_expired')) {
    return 'Esse link expirou. Peça a recuperação de senha de novo.'
  }
  if (status === 429 || m.includes('rate limit') || m.includes('too many requests')) {
    return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
  }

  return 'Não foi possível concluir. Tente de novo em instantes.'
}

export async function entrar(
  formData: FormData,
): Promise<ResultadoAction<void>> {
  const analise = esquemaEntrar.safeParse({
    email: texto(formData, 'email'),
    senha: texto(formData, 'senha'),
  })

  if (!analise.success) return falhaDeValidacao(analise.error)

  const supabase = await createClient()
  // Usa o valor PARSEADO (e-mail já trimado e em minúsculas), não o bruto.
  const { error } = await supabase.auth.signInWithPassword({
    email: analise.data.email,
    password: analise.data.senha,
  })

  if (error) return falha(traduzErroDeAuth(error.message, error.status))

  return sucesso()
}

export async function cadastrar(
  formData: FormData,
): Promise<ResultadoAction<{ precisaConfirmarEmail: boolean }>> {
  const analise = esquemaCadastrar.safeParse({
    email: texto(formData, 'email'),
    senha: texto(formData, 'senha'),
    confirmacao: texto(formData, 'confirmacao'),
  })

  if (!analise.success) return falhaDeValidacao(analise.error)

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: analise.data.email,
    password: analise.data.senha,
  })

  if (error) return falha(traduzErroDeAuth(error.message, error.status))

  // Com confirmação de e-mail ligada o signUp não devolve sessão: a Fachada
  // mostra "confira seu e-mail" em vez de navegar para /onboarding.
  return sucesso({ precisaConfirmarEmail: data.session == null })
}

/**
 * Encerra a sessão e manda para /login.
 *
 * O redirect() lança por dentro, então esta action não volta para quem chamou:
 * o tipo de retorno é `never`.
 */
export async function sair(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function pedirRecuperacaoDeSenha(
  formData: FormData,
): Promise<ResultadoAction<void>> {
  const analise = esquemaPedirRecuperacao.safeParse({
    email: texto(formData, 'email'),
  })

  if (!analise.success) return falhaDeValidacao(analise.error)

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(
    analise.data.email,
    { redirectTo: `${urlDoSite()}/nova-senha` },
  )

  // Erro de envio não é devolvido ao usuário: dizer "esse e-mail não existe"
  // entrega quais contas existem. A Fachada mostra sempre a mesma confirmação.
  if (error && error.status === 429) {
    return falha('Muitas tentativas. Espere alguns minutos e tente de novo.')
  }

  return sucesso()
}

export async function definirNovaSenha(
  formData: FormData,
): Promise<ResultadoAction<void>> {
  const analise = esquemaNovaSenha.safeParse({
    senha: texto(formData, 'senha'),
    confirmacao: texto(formData, 'confirmacao'),
  })

  if (!analise.success) return falhaDeValidacao(analise.error)

  const supabase = await createClient()

  // O link de recuperação já criou a sessão. Sem sessão verificada no
  // servidor, trocar senha aqui alteraria a senha de quem? Por isso o getUser()
  // vem ANTES do updateUser: é ele que prova de quem é esta requisição.
  const { data: usuario, error: erroDeUsuario } = await supabase.auth.getUser()

  if (erroDeUsuario || !usuario.user) {
    return falha('Esse link expirou. Peça a recuperação de senha de novo.')
  }

  const { error } = await supabase.auth.updateUser({
    password: analise.data.senha,
  })

  if (error) return falha(traduzErroDeAuth(error.message, error.status))

  return sucesso()
}

function urlDoSite(): string {
  const bruto =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000')

  return bruto.replace(/\/+$/, '')
}
