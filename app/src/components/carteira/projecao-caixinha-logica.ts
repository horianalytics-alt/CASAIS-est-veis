/**
 * Série do gráfico de projeção por caixinha. Lógica PURA, sem React e sem banco.
 * Plano: docs/planos/dash-grafico-projecao-caixinha.md §3 e §4.1.
 *
 * Duas partes, nunca misturadas:
 *   - saldo CONFIRMADO no fim de cada mês: soma assinada de
 *     investment_box_movements até o último dia do mês. O rendimento confirmado
 *     é datado no último dia da competência (migration 00017), então entra no
 *     mês a que pertence. O ponto do mês corrente é o balance_cents de agora;
 *   - SIMULAÇÃO: projetarValorFuturo a partir do balance_cents, com a taxa
 *     atual, sem aportes, sem resgates e sem rendimento ainda não confirmado
 *     (spec, decisão 4b: estimativa não vira saldo, nem juros compostos).
 *
 * Fuso: America/Sao_Paulo. occurred_on e competencia já são datas de
 * calendário de SP: o mês sai do texto ('YYYY-MM-DD'.slice(0, 7)), sem Date.
 * O único instante (created_at) é convertido com Intl, como hojeEmSaoPaulo().
 *
 * Nunca lança exceção (roda em render). Dado que não fecha vira 'divergente':
 * a tela mostra erro, nunca um número que não bate com o saldo.
 */
import { LIMITES_SIMULACAO, projetarValorFuturo, simularValorFuturo } from '@/lib/simulador'
import { somarMeses } from '@/lib/hoje'

export type TipoMovimento = 'entrada' | 'saida' | 'rendimento'

export interface MovimentoCaixinha {
  caixinhaId: string
  tipo: TipoMovimento
  /** Centavos inteiros > 0. */
  valorCentavos: number
  /** 'YYYY-MM-DD', data de calendário em São Paulo. */
  ocorridoEm: string
}

export interface RendimentoPendente {
  caixinhaId: string
  /** 'YYYY-MM-01'. */
  competencia: string
  /** Centavos inteiros > 0. */
  valorCentavos: number
}

export interface CaixinhaParaProjecao {
  id: string
  name: string
  rate_bps: number
  rate_defined_at: string
  balance_cents: number
  created_at: string
}

export type SituacaoPonto = 'confirmado' | 'hoje' | 'simulacao'

export interface PontoProjecaoCaixinha {
  /** 'YYYY-MM'. */
  mes: string
  valorCentavos: number
  situacao: SituacaoPonto
  /** Rendimento estimado deste mês ainda não confirmado; 0 = nenhum. */
  pendenteCentavos: number
}

export type EstadoProjecao =
  | { tipo: 'vazio' }
  | { tipo: 'divergente' }
  | {
      tipo: 'sem_simulacao'
      pontos: PontoProjecaoCaixinha[]
      motivo: 'saldo_zero' | 'resultado_grande_demais'
    }
  | { tipo: 'ok'; pontos: PontoProjecaoCaixinha[]; indiceHoje: number; valorFinalCentavos: number }

export const MESES_HISTORICO_PADRAO = 12
export const MESES_PROJECAO_PADRAO = 12

const DATA_ISO = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MES_ISO = /^\d{4}-(0[1-9]|1[0-2])$/
const TIPOS: ReadonlySet<string> = new Set(['entrada', 'saida', 'rendimento'])

const FORMATO_MES_SP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
})

/** Instante (timestamptz ISO) -> 'YYYY-MM' em America/Sao_Paulo. Inválido -> null. */
export function mesEmSaoPaulo(instanteIso: string): string | null {
  const instante = new Date(instanteIso)
  if (typeof instanteIso !== 'string' || instanteIso === '' || Number.isNaN(instante.getTime())) return null
  // en-CA com year+month formata 'YYYY-MM'.
  const texto = FORMATO_MES_SP.format(instante)
  return MES_ISO.test(texto) ? texto : null
}

function centavosValidos(valor: number): boolean {
  return Number.isSafeInteger(valor) && valor > 0
}

function pendentesValidos(pendentes: RendimentoPendente[], caixinhaId: string): RendimentoPendente[] {
  return pendentes.filter(
    (p) => p.caixinhaId === caixinhaId && centavosValidos(p.valorCentavos) && DATA_ISO.test(p.competencia),
  )
}

/** Rendimento a confirmar da caixinha: todos os meses, inclusive fora da janela. */
export function totalPendente(
  pendentes: RendimentoPendente[],
  caixinhaId: string,
): { meses: number; centavos: number } {
  const validos = pendentesValidos(pendentes, caixinhaId)
  return { meses: validos.length, centavos: validos.reduce((s, p) => s + p.valorCentavos, 0) }
}

/** Valor da simulação depois de `meses`, o mesmo do fim do gráfico. Inválido ou estouro -> null. */
export function valorProjetadoCentavos(balanceCents: number, rateBps: number, meses: number): number | null {
  const r = simularValorFuturo({ valorCentavos: balanceCents, taxaMensalBps: rateBps, meses })
  return r.ok ? r.valorFinalCentavos : null
}

function inteiroEntre(valor: number | undefined, min: number, max: number, padrao: number): number {
  return valor !== undefined && Number.isSafeInteger(valor) && valor >= min && valor <= max ? valor : padrao
}

/** Meses de simulação que `montarProjecaoCaixinha` de fato usa (inválido -> padrão). Os textos usam este número. */
export function normalizarMesesProjecao(meses: number | undefined): number {
  return inteiroEntre(meses, 1, LIMITES_SIMULACAO.mesesMax, MESES_PROJECAO_PADRAO)
}

export function montarProjecaoCaixinha(entrada: {
  caixinha: CaixinhaParaProjecao
  movimentos: MovimentoCaixinha[]
  pendentes: RendimentoPendente[]
  mesAtual: string
  mesesHistorico?: number
  mesesProjecao?: number
}): EstadoProjecao {
  const { caixinha, mesAtual } = entrada
  const mesesHistorico = inteiroEntre(entrada.mesesHistorico, 1, LIMITES_SIMULACAO.mesesMax, MESES_HISTORICO_PADRAO)
  const mesesProjecao = normalizarMesesProjecao(entrada.mesesProjecao)

  if (!MES_ISO.test(mesAtual)) return { tipo: 'divergente' }
  if (!Number.isSafeInteger(caixinha.balance_cents) || caixinha.balance_cents < 0) return { tipo: 'divergente' }
  if (!Number.isSafeInteger(caixinha.rate_bps) || caixinha.rate_bps < 0 || caixinha.rate_bps > LIMITES_SIMULACAO.taxaMaxBps) {
    return { tipo: 'divergente' }
  }

  const movimentos = entrada.movimentos.filter((m) => m.caixinhaId === caixinha.id)
  for (const m of movimentos) {
    if (!TIPOS.has(m.tipo) || !centavosValidos(m.valorCentavos) || !DATA_ISO.test(m.ocorridoEm)) {
      return { tipo: 'divergente' }
    }
    if (m.ocorridoEm.slice(0, 7) > mesAtual) return { tipo: 'divergente' }
  }

  if (movimentos.length === 0 && caixinha.balance_cents === 0) return { tipo: 'vazio' }

  const mesCriacao = mesEmSaoPaulo(caixinha.created_at)
  if (mesCriacao === null) return { tipo: 'divergente' }

  // Movimento por mês (assinado). A série começa no mais antigo entre a
  // criação e o primeiro movimento, e nunca depois do mês corrente.
  const porMes = new Map<string, number>()
  let inicio = mesCriacao < mesAtual ? mesCriacao : mesAtual
  for (const m of movimentos) {
    const mes = m.ocorridoEm.slice(0, 7)
    const sinal = m.tipo === 'saida' ? -1 : 1
    porMes.set(mes, (porMes.get(mes) ?? 0) + sinal * m.valorCentavos)
    if (mes < inicio) inicio = mes
  }

  const historico: PontoProjecaoCaixinha[] = []
  let acumulado = 0
  for (let mes = inicio; mes <= mesAtual; mes = somarMeses(mes, 1)) {
    acumulado += porMes.get(mes) ?? 0
    if (acumulado < 0 || !Number.isSafeInteger(acumulado)) return { tipo: 'divergente' }
    historico.push({ mes, valorCentavos: acumulado, situacao: mes === mesAtual ? 'hoje' : 'confirmado', pendenteCentavos: 0 })
  }
  // A série tem de fechar no saldo de verdade. Senão, algum movimento faltou
  // (leitura truncada, corrida com uma escrita): erro, nunca número.
  if (acumulado !== caixinha.balance_cents) return { tipo: 'divergente' }

  const pendentePorMes = new Map<string, number>()
  for (const p of pendentesValidos(entrada.pendentes, caixinha.id)) {
    const mes = p.competencia.slice(0, 7)
    pendentePorMes.set(mes, (pendentePorMes.get(mes) ?? 0) + p.valorCentavos)
  }
  const janela = historico.slice(-mesesHistorico).map((p) => ({
    ...p,
    pendenteCentavos: pendentePorMes.get(p.mes) ?? 0,
  }))

  if (caixinha.balance_cents === 0) return { tipo: 'sem_simulacao', pontos: janela, motivo: 'saldo_zero' }

  const projecao = projetarValorFuturo({
    valorCentavos: caixinha.balance_cents,
    taxaMensalBps: caixinha.rate_bps,
    meses: mesesProjecao,
  })
  if (!projecao.ok) {
    return projecao.erro === 'resultado_grande_demais'
      ? { tipo: 'sem_simulacao', pontos: janela, motivo: 'resultado_grande_demais' }
      : { tipo: 'divergente' }
  }

  const simulados: PontoProjecaoCaixinha[] = projecao.pontos.slice(1).map((p) => ({
    mes: somarMeses(mesAtual, p.mes),
    valorCentavos: p.valorCentavos,
    situacao: 'simulacao',
    pendenteCentavos: 0,
  }))

  return {
    tipo: 'ok',
    pontos: [...janela, ...simulados],
    indiceHoje: janela.length - 1,
    valorFinalCentavos: simulados[simulados.length - 1].valorCentavos,
  }
}
