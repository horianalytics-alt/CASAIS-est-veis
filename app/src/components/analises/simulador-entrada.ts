/**
 * Entrada do simulador de gasto fútil: texto digitado -> inteiros.
 * Sem parseFloat em dinheiro (lição P-009 do projeto): só aritmética de inteiros
 * sobre o texto, como taxaPercentualParaBps em src/lib/simulador.ts.
 *
 * Aceita (pt-BR primeiro): "1.234,56", "1234,56", "1.234" (milhar), "1234.56" e
 * "12.5" (ponto decimal com 1–2 casas), "R$ 50". Recusa sinal, 3+ casas e
 * formato en-US com vírgula de milhar ('formato'). Valor bem escrito mas acima
 * do teto do simulador volta como 'grande_demais' — mensagens diferentes para
 * erros diferentes.
 */
import { LIMITES_SIMULACAO } from '@/lib/simulador'

export type LeituraReais =
  | { ok: true; centavos: number }
  | { ok: false; motivo: 'formato' | 'grande_demais' }

const COM_MILHAR_E_DECIMAL = /^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/
const SO_MILHAR = /^(\d{1,3}(?:\.\d{3})+)$/
const VIRGULA_DECIMAL = /^(\d+),(\d{1,2})$/
const PONTO_DECIMAL = /^(\d+)\.(\d{1,2})$/
const INTEIRO = /^(\d+)$/
const PREFIXO_REAL = /^R\$\s*/i

const FORMATOS: ReadonlyArray<readonly [RegExp, boolean]> = [
  [COM_MILHAR_E_DECIMAL, true],
  [SO_MILHAR, false],
  [VIRGULA_DECIMAL, true],
  [PONTO_DECIMAL, true],
  [INTEIRO, false],
]

/** Dígitos inteiros do teto (999.999.999.999,99 -> 12). Mais que isso nem é convertido. */
const MAX_DIGITOS_INTEIROS = String(Math.floor(LIMITES_SIMULACAO.valorMaxCentavos / 100)).length

function montar(inteiro: string, casas: string): LeituraReais {
  const digitos = inteiro.replace(/\./g, '').replace(/^0+(?=\d)/, '')
  if (digitos.length > MAX_DIGITOS_INTEIROS) return { ok: false, motivo: 'grande_demais' }
  const centavos = Number(digitos) * 100 + Number(casas.padEnd(2, '0'))
  if (!Number.isSafeInteger(centavos) || centavos > LIMITES_SIMULACAO.valorMaxCentavos) {
    return { ok: false, motivo: 'grande_demais' }
  }
  return { ok: true, centavos }
}

export function lerReais(texto: string): LeituraReais {
  const t = texto.trim().replace(PREFIXO_REAL, '')
  for (const [regex, temCasas] of FORMATOS) {
    const m = regex.exec(t)
    if (m) return montar(m[1], temCasas ? m[2] : '')
  }
  return { ok: false, motivo: 'formato' }
}

/** Meses inteiros (até 4 dígitos). O teto real (600) é validado pelo simulador. */
export function textoParaMeses(texto: string): number | null {
  const t = texto.trim()
  return /^\d{1,4}$/.test(t) ? Number(t) : null
}
