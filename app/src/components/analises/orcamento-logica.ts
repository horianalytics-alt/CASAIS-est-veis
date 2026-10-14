/**
 * Progresso de orçamento por categoria (PLANO.md §8.1). Lógica pura.
 * Plano: docs/planos/dash-orcamento-patrimonio-simulador.md §3.1/§4.
 *
 * Faixas: razão < 0,80 normal (hue único da série 1); 0,80..1,00 atenção
 * (status warning); > 1,00 estourado (status critical).
 */
import type { Database } from '@/types/database'

type LinhaView = Database['public']['Views']['v_orcamento_progresso']['Row']

export type LinhaViewOrcamento = Pick<
  LinhaView,
  | 'budget_id'
  | 'category_name'
  | 'category_archived_at'
  | 'budget_amount'
  | 'spent_amount'
  | 'remaining_amount'
  | 'used_ratio'
  | 'tx_count'
>

export type StatusOrcamento = 'normal' | 'atencao' | 'estourado'

export const LIMIAR_ATENCAO = 0.8

export interface LinhaOrcamento {
  id: string
  categoria: string
  arquivada: boolean
  /** Reais. */
  limite: number
  gasto: number
  /** limite − gasto, em reais; negativo = estourou. */
  restante: number
  /** gasto / limite (1 = 100%). */
  razao: number
  lancamentos: number
  status: StatusOrcamento
}

export function statusDoOrcamento(razao: number): StatusOrcamento {
  if (!Number.isFinite(razao)) return 'normal'
  if (razao > 1) return 'estourado'
  if (razao >= LIMIAR_ATENCAO) return 'atencao'
  return 'normal'
}

const centavos = (reais: number) => Math.round(reais * 100)

const COMPARADOR_NOME = new Intl.Collator('pt-BR', { sensitivity: 'base' })

function finitoOu(valor: number | null, padrao: number): number {
  return valor !== null && Number.isFinite(valor) ? valor : padrao
}

export function prepararOrcamentos(linhas: LinhaViewOrcamento[]): LinhaOrcamento[] {
  const saida: LinhaOrcamento[] = []
  for (const l of linhas) {
    const limite = finitoOu(l.budget_amount, 0)
    if (!l.budget_id || centavos(limite) <= 0) continue
    const gasto = finitoOu(l.spent_amount, 0)
    // Razão EXATA em centavos. A used_ratio da view é round(…, 4): R$ 2.000,09
    // de R$ 2.000,00 vira 1,0000 lá e pintaria "Atenção" num orçamento estourado.
    const razao = centavos(gasto) / centavos(limite)
    saida.push({
      id: l.budget_id,
      categoria: l.category_name ?? 'Sem nome',
      arquivada: l.category_archived_at !== null,
      limite,
      gasto,
      // Em centavos, para não herdar resíduo de float (300 − 230,5 etc.).
      restante: (centavos(limite) - centavos(gasto)) / 100,
      razao,
      lancamentos: finitoOu(l.tx_count, 0),
      status: statusDoOrcamento(razao),
    })
  }
  return saida.sort(
    (a, b) => b.razao - a.razao || COMPARADOR_NOME.compare(a.categoria, b.categoria),
  )
}

/** Fim do eixo compartilhado: 100% ou o maior estouro. */
export function dominioDaRazao(linhas: LinhaOrcamento[]): number {
  return Math.max(1, ...linhas.map((l) => l.razao).filter((r) => Number.isFinite(r)))
}

export function percentualInteiro(razao: number): string {
  if (!Number.isFinite(razao)) return '—'
  return `${Math.round(razao * 100)}%`
}
