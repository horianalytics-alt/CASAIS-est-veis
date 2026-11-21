import 'server-only'

/**
 * Leitura da lista "Assinaturas e fixos". Plano: docs/planos/estrutura-recorrencia.md §15.
 *
 * Roda com o cliente da SESSÃO, nunca com service_role: filtro explícito por
 * family_id + RLS recurring_rules_select (00019), a mesma dupla camada das
 * actions. Ativa = sem fim, ou fim no mês atual ou depois.
 *
 * Erro vira { ok: false }, nunca lista vazia: lista vazia é o estado "nenhuma
 * assinatura", que seria mentira quando a leitura falhou.
 */
import type { ClienteServidor } from '@/actions/contexto-familia'
import type { Database } from '@/types/database'

export type RegraRecorrente = Database['public']['Tables']['recurring_rules']['Row']

export type ListaDeRecorrencias =
  | { ok: true; ativas: RegraRecorrente[]; encerradas: RegraRecorrente[] }
  | { ok: false }

/** `mesAtual` em 'YYYY-MM' (use hojeEmSaoPaulo().slice(0, 7)). */
export async function listarRecorrencias(
  supabase: ClienteServidor,
  familyId: string,
  mesAtual: string,
): Promise<ListaDeRecorrencias> {
  const { data, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('family_id', familyId)
    .order('description', { ascending: true })
    .order('id', { ascending: true })
  if (error || !data) return { ok: false }

  const corte = `${mesAtual}-01`
  const ativas = data.filter((r) => r.end_period == null || r.end_period >= corte)
  const encerradas = data.filter((r) => r.end_period != null && r.end_period < corte)
  return { ok: true, ativas, encerradas }
}
