/**
 * Série de patrimônio para o gráfico de linha (PLANO.md §8.2). Lógica pura.
 * Plano: docs/planos/dash-orcamento-patrimonio-simulador.md §2/§3.2.
 *
 * Mês é chave 'YYYY-MM' (comparação de string = ordem cronológica). O "mês
 * corrente" vem de quem chama, em America/Sao_Paulo (hojeEmSaoPaulo).
 */
import type { Database } from '@/types/database'

type LinhaView = Database['public']['Views']['v_patrimonio_mensal']['Row']

export type LinhaViewPatrimonio = Pick<LinhaView, 'month' | 'total_balance' | 'net_change'>

export interface PontoPatrimonio {
  mes: string
  /** Patrimônio no fim do mês, em reais. */
  valor: number
  /** Variação do mês (receitas − saídas pagas), em reais. */
  variacaoMes: number
  /** true = mês corrente, ainda em andamento. */
  parcial: boolean
}

interface LinhaValida {
  month: string
  total_balance: number
  net_change: number | null
}

function ehValida(l: LinhaViewPatrimonio, mesFim: string): l is LinhaValida {
  return (
    typeof l.month === 'string' &&
    l.month <= mesFim &&
    typeof l.total_balance === 'number' &&
    Number.isFinite(l.total_balance)
  )
}

export function janelaPatrimonio(
  linhas: LinhaViewPatrimonio[],
  mesFim: string,
  mesAtual: string,
  tamanho = 12,
): PontoPatrimonio[] {
  return linhas
    .filter((l): l is LinhaValida => ehValida(l, mesFim))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    .slice(-tamanho)
    .map((l) => ({
      mes: l.month,
      valor: l.total_balance,
      variacaoMes: l.net_change !== null && Number.isFinite(l.net_change) ? l.net_change : 0,
      parcial: l.month === mesAtual,
    }))
}

/** Último − primeiro da janela, em reais exatos (via centavos). null com < 2 pontos. */
export function variacaoNaJanela(pontos: PontoPatrimonio[]): number | null {
  if (pontos.length < 2) return null
  const primeiro = Math.round(pontos[0].valor * 100)
  const ultimo = Math.round(pontos[pontos.length - 1].valor * 100)
  return (ultimo - primeiro) / 100
}
