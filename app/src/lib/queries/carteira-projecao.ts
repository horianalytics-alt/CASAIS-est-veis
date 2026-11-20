import 'server-only'

/**
 * Leitura dos dados do gráfico de projeção por caixinha (Dash).
 * Plano: docs/planos/dash-grafico-projecao-caixinha.md §4.2 e §5.
 *
 * Roda com o cliente da SESSÃO (@supabase/ssr), nunca com service_role:
 *   - investment_box_movements: filtro explícito por family_id + RLS
 *     investment_box_movements_select (00016) — a mesma dupla camada das Actions;
 *   - carteira_rendimentos_pendentes(): SECURITY INVOKER (00017); o RLS de
 *     investment_boxes restringe às caixinhas da família de quem chama.
 *
 * Paginado: supabase/config.toml tem max_rows = 1000 (o do projeto hospedado
 * A PROVAR: não foi lido). Sem paginar, uma família com histórico longo teria
 * a série CORTADA sem aviso, então o laço não presume o teto: lê até a página
 * vazia. A lógica ainda confere que a soma fecha com balance_cents.
 *
 * Qualquer erro vira { ok: false }, nunca lista vazia: lista vazia seria o
 * estado "caixinha vazia", que é mentira quando a leitura falhou.
 */
import type { ClienteServidor } from '@/actions/contexto-familia'
import type {
  MovimentoCaixinha,
  RendimentoPendente,
  TipoMovimento,
} from '@/components/carteira/projecao-caixinha-logica'

export type DadosProjecaoCarteira =
  | { ok: true; movimentos: MovimentoCaixinha[]; pendentes: RendimentoPendente[] }
  | { ok: false }

/** Linhas pedidas por chamada (o servidor pode devolver menos: ver o laço). */
export const TAMANHO_PAGINA = 1000

const TIPOS: ReadonlySet<string> = new Set<TipoMovimento>(['entrada', 'saida', 'rendimento'])

function ehTipo(kind: string): kind is TipoMovimento {
  return TIPOS.has(kind)
}

export async function lerDadosProjecaoCarteira(
  supabase: ClienteServidor,
  familyId: string,
): Promise<DadosProjecaoCarteira> {
  const movimentos: MovimentoCaixinha[] = []
  // Avança pelo que o servidor DEVOLVEU, não pelo que pedimos, e só para numa
  // página vazia: se o max_rows do projeto for menor que a página, um passo
  // fixo pularia linhas (e um "bloco curto" pararia cedo demais).
  for (let de = 0; ; de = movimentos.length) {
    const { data, error } = await supabase
      .from('investment_box_movements')
      .select('box_id,kind,amount_cents,occurred_on')
      .eq('family_id', familyId)
      .order('occurred_on')
      .order('id') // desempate estável: sem ele, páginas podem repetir ou pular linhas
      .range(de, de + TAMANHO_PAGINA - 1)
    if (error || !data) return { ok: false }
    for (const linha of data) {
      if (!ehTipo(linha.kind)) return { ok: false }
      movimentos.push({
        caixinhaId: linha.box_id,
        tipo: linha.kind,
        valorCentavos: linha.amount_cents,
        ocorridoEm: linha.occurred_on,
      })
    }
    if (data.length === 0) break
  }

  const { data: pendentes, error: erroPendentes } = await supabase.rpc('carteira_rendimentos_pendentes')
  if (erroPendentes || !pendentes) return { ok: false }

  return {
    ok: true,
    movimentos,
    pendentes: pendentes.map((p) => ({
      caixinhaId: p.caixinha_id,
      competencia: p.competencia,
      valorCentavos: p.rendimento_cents,
    })),
  }
}
