import { createClient } from '@/lib/supabase/server'
import { falha, traduzErroDoBanco, type ResultadoAction } from './resultado'

/**
 * Resolve, NO SERVIDOR, quem está chamando e de qual família.
 *
 * Sem 'use server' de propósito: isto não é uma action, é um ajudante das
 * actions. A família NUNCA vem do cliente — vem de get_user_family_id_self(),
 * que lê auth.uid() dentro do banco. Um family_id forjado no corpo da
 * requisição não tem por onde entrar.
 *
 * Ordem: getUser() primeiro (valida o token no servidor de Auth; getSession()
 * leria o cookie sem verificar), depois a família.
 */
export type ClienteServidor = Awaited<ReturnType<typeof createClient>>

export type ContextoDaFamilia = { supabase: ClienteServidor; familyId: string }

export async function obterContextoDaFamilia(): Promise<
  { ok: true; ctx: ContextoDaFamilia } | { ok: false; resultado: ResultadoAction<never> }
> {
  const supabase = await createClient()

  const { data: usuario, error: erroDeUsuario } = await supabase.auth.getUser()
  if (erroDeUsuario || !usuario.user) {
    return { ok: false, resultado: falha('Sua sessão expirou. Entre de novo.') }
  }

  const { data: familyId, error } = await supabase.rpc('get_user_family_id_self')
  if (error) return { ok: false, resultado: falha(traduzErroDoBanco(error)) }
  if (!familyId) {
    return { ok: false, resultado: falha('Você não faz parte de nenhuma família.') }
  }

  return { ok: true, ctx: { supabase, familyId } }
}
