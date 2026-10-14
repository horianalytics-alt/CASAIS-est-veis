/**
 * Simulador de gasto fútil — "e se eu não tivesse gasto X, quanto isso valeria
 * em N meses investido a Z% ao mês?" (PLANO.md seção 8.3).
 *
 * Plano: docs/planos/estrutura-metas-patrimonio-simulador.md, seção 5.
 *
 * Regras de dinheiro (as mesmas do resto do projeto, e a lição do P-009):
 *   - valor SEMPRE em centavos inteiros; nunca ponto flutuante em dinheiro;
 *   - taxa em pontos-base inteiros (100 = 1% a.m.);
 *   - a conta é feita em BigInt, de forma EXATA, e arredondada UMA vez no fim
 *     (meio centavo para cima). O resultado bate com VF = VP * (1 + i)^n da
 *     calculadora; arredondar mês a mês acumularia erro.
 *
 * Nunca lança exceção: entrada inválida vira código de erro. A função roda
 * dentro de render de componente, e um throw derrubaria a tela. A frase que o
 * usuário lê é copy de UI e fica com quem desenha a tela.
 *
 * tsconfig mira ES2017: sem literal `1n` e sem o operador `**` (um transpilador
 * pode trocá-lo por Math.pow, que lança TypeError com BigInt). A potência é
 * um laço de multiplicação — no máximo 600 voltas.
 */

export interface EntradaSimulacao {
  /** Valor que deixou de ser gasto, em centavos inteiros: 0..LIMITES_SIMULACAO.valorMaxCentavos. */
  valorCentavos: number
  /** Taxa de juros ao mês em pontos-base inteiros: 100 = 1% a.m.; 0..LIMITES_SIMULACAO.taxaMaxBps. */
  taxaMensalBps: number
  /** Prazo em meses inteiros: 0..LIMITES_SIMULACAO.mesesMax. */
  meses: number
}

export type ErroSimulacao =
  | 'valor_invalido'
  | 'taxa_invalida'
  | 'meses_invalido'
  | 'resultado_grande_demais'

export type ResultadoSimulacao =
  | { ok: true; valorFinalCentavos: number; rendimentoCentavos: number }
  | { ok: false; erro: ErroSimulacao }

export interface PontoProjecao {
  /** 0 = hoje (o próprio valor); n = depois de n meses. */
  mes: number
  valorCentavos: number
}

export type ResultadoProjecao =
  | { ok: true; pontos: PontoProjecao[] }
  | { ok: false; erro: ErroSimulacao }

export const LIMITES_SIMULACAO = {
  /** R$ 999.999.999.999,99 — o teto de numeric(14,2), o tipo dos valores no banco. */
  valorMaxCentavos: 99_999_999_999_999,
  /** 100% ao mês. */
  taxaMaxBps: 10_000,
  /** 50 anos. */
  mesesMax: 600,
} as const

const BASE_BPS = BigInt(10_000)
const DOIS = BigInt(2)
const MAIOR_SEGURO = BigInt(Number.MAX_SAFE_INTEGER)

function inteiroEntre(valor: number, min: number, max: number): boolean {
  return Number.isSafeInteger(valor) && valor >= min && valor <= max
}

function validar(entrada: EntradaSimulacao): ErroSimulacao | null {
  if (!inteiroEntre(entrada.valorCentavos, 0, LIMITES_SIMULACAO.valorMaxCentavos)) {
    return 'valor_invalido'
  }
  if (!inteiroEntre(entrada.taxaMensalBps, 0, LIMITES_SIMULACAO.taxaMaxBps)) {
    return 'taxa_invalida'
  }
  if (!inteiroEntre(entrada.meses, 0, LIMITES_SIMULACAO.mesesMax)) {
    return 'meses_invalido'
  }
  return null
}

/**
 * valor * (numerador / denominador), arredondado ao inteiro mais próximo com
 * meio para cima. Todos os termos são >= 0, então a divisão inteira do BigInt
 * (que trunca) é um floor: floor((2 * a + b) / (2 * b)) = round-half-up(a / b).
 */
function arredondarMeioParaCima(numerador: bigint, denominador: bigint): bigint {
  return (numerador * DOIS + denominador) / (DOIS * denominador)
}

/**
 * Valores da série do mês 0 ao mês `entrada.meses`, cada um calculado de forma
 * exata e arredondado sozinho. Já validada a entrada.
 */
function serieExata(entrada: EntradaSimulacao): bigint[] | 'resultado_grande_demais' {
  const valor = BigInt(entrada.valorCentavos)
  const fator = BASE_BPS + BigInt(entrada.taxaMensalBps)
  let numerador = valor
  let denominador = BigInt(1)
  const serie: bigint[] = [valor]
  for (let mes = 1; mes <= entrada.meses; mes++) {
    numerador *= fator
    denominador *= BASE_BPS
    const ponto = arredondarMeioParaCima(numerador, denominador)
    // A série nunca decresce (taxa >= 0): o primeiro ponto que estoura encerra.
    if (ponto > MAIOR_SEGURO) return 'resultado_grande_demais'
    serie.push(ponto)
  }
  return serie
}

/** Quanto `valorCentavos` valeria depois de `meses` meses a `taxaMensalBps` ao mês. */
export function simularValorFuturo(entrada: EntradaSimulacao): ResultadoSimulacao {
  const erro = validar(entrada)
  if (erro) return { ok: false, erro }

  const serie = serieExata(entrada)
  if (serie === 'resultado_grande_demais') return { ok: false, erro: serie }

  const valorFinalCentavos = Number(serie[serie.length - 1])
  return {
    ok: true,
    valorFinalCentavos,
    rendimentoCentavos: valorFinalCentavos - entrada.valorCentavos,
  }
}

/** A mesma conta, mês a mês (meses + 1 pontos), para o gráfico de linha. */
export function projetarValorFuturo(entrada: EntradaSimulacao): ResultadoProjecao {
  const erro = validar(entrada)
  if (erro) return { ok: false, erro }

  const serie = serieExata(entrada)
  if (serie === 'resultado_grande_demais') return { ok: false, erro: serie }

  return {
    ok: true,
    pontos: serie.map((valor, mes) => ({ mes, valorCentavos: Number(valor) })),
  }
}

// Parte inteira obrigatória; vírgula ou ponto; 1 ou 2 casas decimais.
const TAXA_PERCENTUAL = /^(\d+)(?:[.,](\d{1,2}))?$/

/**
 * Taxa digitada em % ao mês ("1,07", "1.07", "1") -> pontos-base (107, 107, 100),
 * só com aritmética de inteiros sobre o texto — sem parseFloat, para não repetir
 * o erro do P-009 (Math.round(1.005 * 100) = 100). Mais de 2 casas, sinal,
 * separador de milhar, notação científica ou vazio -> null. Não aplica o teto
 * de taxa: quem valida o intervalo é simularValorFuturo (taxa_invalida).
 */
export function taxaPercentualParaBps(texto: string): number | null {
  const m = TAXA_PERCENTUAL.exec(texto.trim())
  if (!m) return null
  const inteiro = Number(m[1])
  const casas = (m[2] ?? '').padEnd(2, '0')
  const bps = inteiro * 100 + Number(casas)
  return Number.isSafeInteger(bps) ? bps : null
}
