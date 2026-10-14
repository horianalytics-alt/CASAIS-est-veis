import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * ÚNICO lugar do código de produção autorizado a usar a chave de serviço
 * (PROJETO.md §2; plano R-1). A chave IGNORA o RLS por completo.
 *
 * Por que a exceção existe: o RLS de push_subscriptions é por MEMBRO — cada
 * um só lê a própria inscrição (00006, push_select_own). Quem lança algo
 * precisa notificar o parceiro, e com a própria sessão não consegue ler o
 * token do aparelho dele. Só a chave de serviço lê.
 *
 * Como a exceção fica contida:
 *   - `import 'server-only'` na 1ª linha: um Client Component que importe
 *     este módulo, direta ou indiretamente, QUEBRA o `next build`.
 *   - SEM a diretiva de Server Action: com ela, as funções abaixo virariam
 *     endpoints HTTP públicos aceitando familyId arbitrário de qualquer um.
 *   - O cliente com a chave não é exportado. A superfície auditável são as
 *     duas funções abaixo, e as duas filtram por family_id EXPLICITAMENTE.
 *   - Quem chama passa SEMPRE family/member resolvidos pela sessão de quem
 *     agiu (src/lib/push/notificar.ts), nunca valor vindo do navegador.
 *
 * tests/unit/fronteira-server-only.test.ts trava as três primeiras regras.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function exigirUuid(valor: string, nome: string): void {
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    throw new Error(`servico: ${nome} inválido`)
  }
}

function clienteDeServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) throw new Error('servico: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente')
  // supabase-js puro, não o @supabase/ssr: sem cookie de usuário, a
  // requisição vai SÓ com a chave de serviço.
  return createClient<Database>(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Um aparelho de destino. `ids` = todas as linhas com este endpoint (para apagar todas num 410). */
export type InscricaoDeDestino = { ids: string[]; endpoint: string; p256dh: string; auth: string }

/**
 * Inscrições de push dos OUTROS membros da família de quem agiu.
 *
 * Ficam de fora:
 *   - as linhas do próprio autor — ninguém recebe aviso do que ele fez;
 *   - qualquer endpoint que TAMBÉM está no nome do autor: é um navegador
 *     compartilhado (um saiu sem desativar, o outro entrou e ativou), e quem
 *     está nele agora pode ser o próprio autor. O UNIQUE da tabela é por
 *     (member_id, endpoint), então o banco não impede essa duplicata.
 * E cada endpoint recebe UM envio, mesmo que esteja em mais de um membro.
 *
 * A leitura traz as linhas do autor só para saber os endpoints dele; nada
 * delas sai desta função.
 */
export async function inscricoesDosOutrosMembros(
  familyId: string,
  autorMemberId: string,
): Promise<InscricaoDeDestino[]> {
  exigirUuid(familyId, 'familyId')
  exigirUuid(autorMemberId, 'autorMemberId')

  const { data, error } = await clienteDeServico()
    .from('push_subscriptions')
    .select('id, member_id, endpoint, p256dh, auth')
    .eq('family_id', familyId)
    .order('id')

  if (error) throw new Error(`servico: leitura de inscrições falhou (${error.code ?? 'sem código'})`)

  const linhas = data ?? []
  const doAutor = new Set(linhas.filter((l) => l.member_id === autorMemberId).map((l) => l.endpoint))

  const porEndpoint = new Map<string, InscricaoDeDestino>()
  for (const l of linhas) {
    if (l.member_id === autorMemberId || doAutor.has(l.endpoint)) continue
    const existente = porEndpoint.get(l.endpoint)
    if (existente) existente.ids.push(l.id)
    else porEndpoint.set(l.endpoint, { ids: [l.id], endpoint: l.endpoint, p256dh: l.p256dh, auth: l.auth })
  }
  return [...porEndpoint.values()]
}

/**
 * Apaga inscrições que o serviço de push declarou mortas (404/410).
 * O filtro por family_id é redundante com os ids — de propósito: um id de
 * outra família que chegasse aqui por engano não apaga nada.
 */
export async function apagarInscricoes(familyId: string, ids: string[]): Promise<number> {
  exigirUuid(familyId, 'familyId')
  if (ids.length === 0) return 0
  ids.forEach((id) => exigirUuid(id, 'id'))

  const { data, error } = await clienteDeServico()
    .from('push_subscriptions')
    .delete()
    .eq('family_id', familyId)
    .in('id', ids)
    .select('id')

  if (error) throw new Error(`servico: remoção de inscrições falhou (${error.code ?? 'sem código'})`)
  return data?.length ?? 0
}
