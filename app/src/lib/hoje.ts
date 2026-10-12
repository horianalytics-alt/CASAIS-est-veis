/**
 * "Hoje" no fuso do casal (America/Sao_Paulo), como string ISO pura.
 *
 * Na Vercel o servidor roda em UTC: `todayISO()` (que usa o relógio local)
 * viraria o dia às 21h de Brasília. Aqui o fuso é explícito. O locale en-CA
 * formata como YYYY-MM-DD sem montar a string à mão.
 */
export function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Só 1900-2099: `Date.UTC` trata anos 0-99 como 1900-1999 e calcularia o fim do
// mês errado para um `?mes=0004-02` forjado na URL.
const MES_ISO = /^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/

export function ehMesValido(valor: string | undefined): valor is string {
  return valor !== undefined && MES_ISO.test(valor)
}

/** Soma (ou subtrai) meses de uma chave 'YYYY-MM', sem usar Date. */
export function somarMeses(mes: string, delta: number): string {
  const [ano, m] = mes.split('-').map(Number)
  const total = ano * 12 + (m - 1) + delta
  const novoAno = Math.floor(total / 12)
  const novoMes = (total % 12) + 1
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}`
}

const NOMES_DOS_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

/** 'YYYY-MM' -> 'outubro de 2026'. */
export function rotuloDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  return `${NOMES_DOS_MESES[m - 1]} de ${ano}`
}

/** Primeiro e último dia do mês como ISO, para filtrar `date` sem fuso. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` }
}
