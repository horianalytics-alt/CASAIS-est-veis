import 'server-only'

import type { ClienteServidor } from '@/actions/contexto-familia'
import type { Database } from '@/types/database'
import type { RegistroAcerto } from '@/features/acerto/tipos'

export type LinhaTransacaoAcerto = Pick<
  Database['public']['Tables']['transactions']['Row'],
  'id' | 'date' | 'amount' | 'paid_by_member_id' | 'settlement_to_member_id' | 'created_by_member_id'
>

/**
 * Busca os últimos 20 acertos da família no banco (leitura).
 *
 * Filtro por settlement_to_member_id NOT NULL identifica os acertos gerados
 * pela RPC settle_up (00010_acerto_liquido.sql).
 * RLS garante tenancy multi-tenant da família.
 */
export async function buscarTransacoesAcerto(
  supabase: ClienteServidor,
): Promise<LinhaTransacaoAcerto[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      paid_by_member_id,
      settlement_to_member_id,
      created_by_member_id
    `)
    .not('settlement_to_member_id', 'is', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data) return []
  return data
}

/**
 * Converte as linhas brutas de transação em registros prontos para exibição,
 * resolvendo o nome do pagador e do receptor a partir do mapa de membros.
 */
export function mapearRegistrosAcerto(
  linhas: LinhaTransacaoAcerto[],
  mapaNomes: Map<string, string>,
): RegistroAcerto[] {
  return linhas
    .filter((t) => t.settlement_to_member_id != null)
    .map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      pagadorId: t.paid_by_member_id,
      pagadorNome: mapaNomes.get(t.paid_by_member_id) ?? 'Membro',
      receptorId: t.settlement_to_member_id!,
      receptorNome: mapaNomes.get(t.settlement_to_member_id!) ?? 'Membro',
    }))
}
