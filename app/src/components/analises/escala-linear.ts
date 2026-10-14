/**
 * Escala linear dos gráficos de linha de /analises (patrimônio e simulador).
 * Lógica pura, sem DOM. Plano: docs/planos/dash-orcamento-patrimonio-simulador.md §4.
 *
 * Garantias de que a tela depende: o domínio nunca é degenerado (max > min),
 * nada aqui devolve NaN/Infinity, e os ticks são passos "redondos"
 * (1, 2, 2,5, 5 × 10^n).
 */

export interface Dominio {
  min: number
  max: number
  ticks: number[]
}

const FATORES = [1, 2, 2.5, 5, 10] as const

/** Menor passo "redondo" >= bruto. */
function passoBonito(bruto: number): number {
  const expoente = Math.floor(Math.log10(bruto))
  const base = 10 ** expoente
  const fracao = bruto / base
  const fator = FATORES.find((f) => fracao <= f + 1e-9) ?? 10
  return fator * base
}

/** Próximo passo redondo estritamente maior que `passo`. */
function proximoPasso(passo: number): number {
  return passoBonito(passo * 1.0001)
}

function limpar(n: number): number {
  // Evita 0.30000000000000004 nos ticks fracionários e o -0.
  const r = Number(n.toFixed(10))
  return r === 0 ? 0 : r
}

export function dominioBonito(
  valores: number[],
  opcoes: { incluirZero?: boolean; maxTicks?: number } = {},
): Dominio {
  const { incluirZero = false, maxTicks = 4 } = opcoes
  const intervalosMax = Math.max(1, Math.floor(maxTicks))
  const finitos = valores.filter((v) => Number.isFinite(v))

  let lo = finitos.length > 0 ? Math.min(...finitos) : 0
  let hi = finitos.length > 0 ? Math.max(...finitos) : 0
  if (incluirZero) {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
  }

  if (lo === hi) {
    // Série chapada: abre uma folga em volta do valor (ou acima do zero).
    if (lo === 0) {
      hi = 1
    } else {
      const folga = Math.abs(lo) * 0.1
      lo -= folga
      hi += folga
      if (incluirZero) {
        lo = Math.min(lo, 0)
        hi = Math.max(hi, 0)
      }
    }
  }

  let passo = passoBonito((hi - lo) / intervalosMax)
  let min = Math.floor(lo / passo) * passo
  let max = Math.ceil(hi / passo) * passo
  // Arredondar para fora pode somar intervalos: sobe o passo até caber.
  while (Math.round((max - min) / passo) > intervalosMax) {
    passo = proximoPasso(passo)
    min = Math.floor(lo / passo) * passo
    max = Math.ceil(hi / passo) * passo
  }

  const n = Math.round((max - min) / passo)
  const ticks = Array.from({ length: n + 1 }, (_, i) => limpar(min + i * passo))
  return { min: limpar(min), max: limpar(max), ticks }
}

const MAX_CASAS = 2

function numero(valor: number, casas: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(valor)
}

/**
 * Casas decimais que o próprio passo tem (na unidade já dividida): 0,25 -> 2,
 * 0,5 -> 1, 10 -> 0. Ticks são múltiplos do passo, então essas casas bastam.
 */
function casasParaPasso(passoNaUnidade: number): number {
  if (!Number.isFinite(passoNaUnidade) || passoNaUnidade <= 0) return 1
  for (let casas = 0; casas <= 6; casas++) {
    const escalado = passoNaUnidade * 10 ** casas
    if (Math.abs(Math.round(escalado) - escalado) < 1e-6) return casas
  }
  return 6
}

/**
 * Rótulo compacto de eixo em reais: "R$ 0", "R$ 950", "R$ 1,2 mil", "R$ 1,5 mi".
 * Negativo leva o sinal de menos U+2212 antes do R$ (regra C-2 do projeto).
 *
 * Com `passo` (distância entre ticks), as casas decimais saem do passo: tick de
 * R$ 1.250 com passo 250 é "R$ 1,25 mil", nunca "R$ 1,3 mil" (número errado) nem
 * dois ticks com o mesmo rótulo. Se o compacto precisaria de mais de 2 casas,
 * cai para o valor cheio ("R$ 12.341").
 */
export function formatarEixoBRL(valor: number, passo?: number): string {
  if (!Number.isFinite(valor)) return '—'
  const abs = Math.abs(valor)
  const sinal = valor < 0 && abs > 0 ? '−' : ''
  const unidade = abs >= 1_000_000 ? 1_000_000 : abs >= 1_000 ? 1_000 : 1
  const sufixo = unidade === 1_000_000 ? ' mi' : unidade === 1_000 ? ' mil' : ''

  let corpo: string
  if (passo === undefined) {
    corpo = `${numero(abs / unidade, unidade === 1 ? 2 : 1)}${sufixo}`
  } else {
    const casas = casasParaPasso(passo / unidade)
    corpo =
      casas > MAX_CASAS && unidade > 1
        ? numero(abs, casasParaPasso(passo))
        : `${numero(abs / unidade, Math.min(casas, MAX_CASAS))}${sufixo}`
  }
  return `${sinal}R$ ${corpo}`
}

/**
 * Quais índices do eixo X recebem rótulo: no máximo `maxRotulos`, sempre o
 * primeiro e o último (o último é "agora", o ponto que importa).
 */
export function indicesDeRotulo(total: number, maxRotulos: number): number[] {
  if (total <= 0) return []
  const ultimo = total - 1
  if (maxRotulos <= 1) return [ultimo]
  if (total <= maxRotulos) return Array.from({ length: total }, (_, i) => i)

  const passo = Math.ceil(ultimo / (maxRotulos - 1))
  const indices: number[] = []
  for (let i = 0; i < ultimo; i += passo) indices.push(i)
  // O penúltimo rótulo colado no último colide: sai.
  if (indices.length > 1 && ultimo - indices[indices.length - 1] < passo / 2) indices.pop()
  indices.push(ultimo)
  return indices
}
