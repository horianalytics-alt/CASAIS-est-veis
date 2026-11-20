'use client'

/**
 * Gráfico de linha de UMA série, eixo Y único (PLANO.md §8.2/§8.3).
 * Usado pelo patrimônio e pelo simulador. SVG à mão, como os outros gráficos de
 * /analises (o projeto não tem Recharts). Plano:
 * docs/planos/dash-orcamento-patrimonio-simulador.md §3.2/§3.3.
 *
 * Specs do dataviz (marks-and-anatomy / interaction):
 *   - linha 2px, junção e ponta redondas, cor da série 1 (--chart-1);
 *   - ponto final r=4 com anel de 2px da superfície (--card); ponto parcial vazado;
 *   - grade hairline sólida (--border); zero em --border-forte quando cruza;
 *   - área de 10% só quando a base é o zero (área com base fora do zero mente);
 *   - rótulo direto só no ponto final; crosshair + tooltip que acha o X mais
 *     próximo; teclado (←/→/Home/End) mostra o mesmo que o hover;
 *   - tooltip só repete o que a tabela mostra (enhance, never gate);
 *   - texto sempre em token de texto, nunca na cor da série.
 *
 * Extensão aditiva (docs/planos/dash-grafico-projecao-caixinha.md §4.4), usada
 * pela projeção da caixinha. Sem as props novas a saída é idêntica à anterior
 * (tests/unit/grafico-linha.test.tsx, bloco "regressão"):
 *   - `projetado`: bloco CONTÍGUO no fim da série, desenhado TRACEJADO, sem
 *     área (o dataviz reserva o tracejado para "projeção"); fora desse formato,
 *     tudo é desenhado sólido;
 *   - `marcador: 'pendente'`: losango vazado permanente (forma, não cor);
 *   - `nota`: linha extra no tooltip e na leitura acessível;
 *   - `marcoHoje`: hairline vertical SÓLIDA com rótulo (marco de tempo);
 *   - `mostrarArea=false`: sem área (modo privacidade, L-003).
 */

import * as React from 'react'
import { dominioBonito, formatarEixoBRL, indicesDeRotulo } from './escala-linear'
import { ANALISES } from '@/features/analises/copy'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'

export interface PontoLinha {
  /** Chave estável (ex.: '2026-10' ou '12'). */
  chave: string
  /** Rótulo curto do eixo X (ex.: 'out/26'). */
  rotuloEixo: string
  /** Rótulo do tooltip (ex.: 'outubro de 2026'). */
  rotuloLongo: string
  /** Em reais. */
  valor: number
  parcial?: boolean
  /** Valor simulado. Os projetados formam um bloco contíguo no fim; senão, tudo é sólido. */
  projetado?: boolean
  /** Marcador permanente no ponto (losango vazado). */
  marcador?: 'pendente'
  /** Linha extra no tooltip e na leitura acessível (já mascarada por quem chama). */
  nota?: string
}

export interface GraficoLinhaProps {
  pontos: PontoLinha[]
  /** true = eixo Y começa no zero e ganha área de 10%. */
  incluirZero?: boolean
  rotuloAcessivel: string
  /** Formata o valor do tooltip/rótulo final; já respeita o modo privacidade. */
  formatarValor: (valor: number, ponto?: PontoLinha) => string
  /** Modo privacidade: some com os números do eixo Y. */
  oculto: boolean
  tabela: { cabecalhos: string[]; linhas: string[][] }
  /** Marco vertical de "hoje" no índice informado. */
  marcoHoje?: { indice: number; rotulo: string }
  /** false = sem área mesmo com incluirZero (modo privacidade). Padrão: true. */
  mostrarArea?: boolean
}

/** Altura TOTAL do gráfico, incluindo a faixa do eixo X (anti-pattern: eixo cortado). */
export const ALTURA_GRAFICO_LINHA = 220

const MARGEM = { topo: 24, direita: 16, baixo: 28, esquerda: 68 }
// Rótulo "mês 120" ancorado no fim ocupa ~48px; 80px por rótulo evita colisão com o vizinho.
const LARGURA_POR_ROTULO_X = 80
const COR_SERIE = 'var(--chart-1)'
/** Traço da simulação: com ponta redonda de 2px, lê como traço ~6px e vão ~4px. */
const TRACEJADO_PROJECAO = '4 6'
/** Meia-diagonal do losango de pendente: 10px de ponta a ponta (dataviz: marcador >= 8px). */
const RAIO_LOSANGO = 5

/**
 * Índice do último ponto REAL quando os projetados formam um bloco contíguo no
 * fim da série (e há ao menos um real). Fora disso, null: tudo é sólido.
 */
export function indiceDeJuncao(pontos: Pick<PontoLinha, 'projetado'>[]): number | null {
  const primeiro = pontos.findIndex((p) => p.projetado)
  if (primeiro <= 0) return null
  for (let i = primeiro; i < pontos.length; i++) if (!pontos[i].projetado) return null
  return primeiro - 1
}

function useLarguraDoElemento<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null)
  const [largura, setLargura] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setLargura(Math.floor(el.getBoundingClientRect().width))
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, largura]
}

export function GraficoLinha({
  pontos,
  incluirZero = false,
  rotuloAcessivel,
  formatarValor,
  oculto,
  tabela,
  marcoHoje,
  mostrarArea = true,
}: GraficoLinhaProps) {
  const { ref: refInView, inView } = useInView<HTMLDivElement>({ threshold: 0.15, replayOnScroll: true })
  const [refCaixa, largura] = useLarguraDoElemento<HTMLDivElement>()
  const [ativo, setAtivo] = React.useState<number | null>(null)
  const idLeitura = React.useId()

  const n = pontos.length
  const larguraPlot = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita)
  const alturaPlot = ALTURA_GRAFICO_LINHA - MARGEM.topo - MARGEM.baixo

  const dominio = React.useMemo(
    () => dominioBonito(pontos.map((p) => p.valor), { incluirZero, maxTicks: 4 }),
    [pontos, incluirZero],
  )

  const x = (i: number) => MARGEM.esquerda + (n <= 1 ? larguraPlot / 2 : (i / (n - 1)) * larguraPlot)
  const y = (v: number) =>
    MARGEM.topo + (1 - (v - dominio.min) / (dominio.max - dominio.min)) * alturaPlot

  const indiceMaisProximo = (px: number) => {
    if (n <= 1 || larguraPlot <= 0) return 0
    const bruto = ((px - MARGEM.esquerda) / larguraPlot) * (n - 1)
    return Math.min(n - 1, Math.max(0, Math.round(bruto)))
  }

  // No toque, pointerleave dispara logo após o pointerup: o tooltip fecharia ao
  // levantar o dedo. Toque fecha pelo blur (tocar fora), mouse fecha ao sair.
  const aoSairPonteiro = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.pointerType !== 'touch') setAtivo(null)
  }

  const aoMoverPonteiro = (e: React.PointerEvent<SVGRectElement>) => {
    const caixa = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!caixa) return
    setAtivo(indiceMaisProximo(e.clientX - caixa.left))
  }

  const aoTeclar = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return
    const atual = ativo ?? n - 1
    let proximo: number | null = null
    if (e.key === 'ArrowLeft') proximo = Math.max(0, atual - 1)
    else if (e.key === 'ArrowRight') proximo = Math.min(n - 1, atual + 1)
    else if (e.key === 'Home') proximo = 0
    else if (e.key === 'End') proximo = n - 1
    else if (e.key === 'Escape') {
      setAtivo(null)
      return
    }
    if (proximo !== null) {
      e.preventDefault()
      setAtivo(proximo)
    }
  }

  // Sem bloco projetado válido, o trecho real é a série inteira (saída de antes).
  const juncao = indiceDeJuncao(pontos)
  const fimReal = juncao ?? n - 1
  const ehProjetado = (i: number) => juncao !== null && i > juncao
  const segmento = (de: number, ate: number) =>
    pontos
      .slice(de, ate + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(de + k).toFixed(1)},${y(p.valor).toFixed(1)}`)
      .join(' ')
  const caminho = segmento(0, fimReal)
  const caminhoProjetado = juncao !== null ? segmento(juncao, n - 1) : null
  const yBase = y(Math.max(dominio.min, Math.min(0, dominio.max)))
  // Área só sob o trecho real: a lavagem daria "volume" a um valor simulado.
  const caminhoArea =
    incluirZero && mostrarArea && n > 1 && fimReal >= 1
      ? `${caminho} L${x(fimReal).toFixed(1)},${yBase.toFixed(1)} L${x(0).toFixed(1)},${yBase.toFixed(1)} Z`
      : null

  const passoY = dominio.ticks.length > 1 ? dominio.ticks[1] - dominio.ticks[0] : undefined
  const maxRotulosX = Math.max(2, Math.floor(larguraPlot / LARGURA_POR_ROTULO_X))
  const rotulosX = indicesDeRotulo(n, maxRotulosX)
  const zeroCruza = dominio.min < 0 && dominio.max > 0

  const ultimo = n > 0 ? pontos[n - 1] : null
  const pontoAtivo = ativo !== null ? pontos[ativo] : null
  const leitura = pontoAtivo
    ? `${pontoAtivo.rotuloLongo}${pontoAtivo.parcial ? ` (${ANALISES.parcial})` : ''}: ${formatarValor(pontoAtivo.valor, pontoAtivo)}${pontoAtivo.nota ? `. ${pontoAtivo.nota}` : ''}`
    : ''
  const ativoProjetado = ativo !== null && ehProjetado(ativo)
  const ultimoVazado = ultimo ? Boolean(ultimo.parcial) || ehProjetado(n - 1) : false
  const indiceMarco =
    marcoHoje && Number.isInteger(marcoHoje.indice) && marcoHoje.indice >= 0 && marcoHoje.indice < n
      ? marcoHoje.indice
      : null

  // Tooltip: centro no ponto, preso dentro da caixa.
  const larguraTooltip = 168
  const centroTooltip = ativo !== null
    ? Math.min(Math.max(x(ativo), larguraTooltip / 2), Math.max(larguraTooltip / 2, largura - larguraTooltip / 2))
    : 0

  // Rótulo do ponto final: acima do ponto; se não couber, abaixo.
  const yRotuloFinal = ultimo ? (y(ultimo.valor) - 12 < 12 ? y(ultimo.valor) + 20 : y(ultimo.valor) - 12) : 0

  return (
    <div ref={refInView} className="flex flex-col gap-[var(--esp-3)]">
      <div
        ref={refCaixa}
        className="relative w-full rounded-[var(--raio-controle)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{ height: ALTURA_GRAFICO_LINHA }}
        tabIndex={0}
        role="group"
        aria-roledescription="gráfico"
        aria-label={`${rotuloAcessivel}. Use as setas para percorrer os meses.`}
        aria-describedby={idLeitura}
        onKeyDown={aoTeclar}
        onFocus={() => setAtivo((a) => a ?? n - 1)}
        onBlur={() => setAtivo(null)}
      >
        {largura > 0 && n > 1 ? (
          <svg
            width={largura}
            height={ALTURA_GRAFICO_LINHA}
            className="block overflow-visible"
            aria-hidden="true"
          >
            {/* Grade e ticks do eixo Y */}
            {dominio.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGEM.esquerda}
                  x2={MARGEM.esquerda + larguraPlot}
                  y1={y(t)}
                  y2={y(t)}
                  // No modo privacidade o zero não se destaca: entregaria "ficou negativo".
                  stroke={t === 0 && zeroCruza && !oculto ? 'var(--border-forte)' : 'var(--border)'}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={MARGEM.esquerda - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[length:var(--texto-micro)] tabular-nums"
                >
                  {oculto ? '•••' : formatarEixoBRL(t, passoY)}
                </text>
              </g>
            ))}

            {/* Eixo X */}
            {rotulosX.map((i) => (
              <text
                key={pontos[i].chave}
                x={x(i)}
                y={ALTURA_GRAFICO_LINHA - 8}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[length:var(--texto-micro)] tabular-nums"
              >
                {pontos[i].rotuloEixo}
              </text>
            ))}

            {indiceMarco !== null && marcoHoje ? (
              <g data-marco="hoje">
                <line
                  x1={x(indiceMarco)}
                  x2={x(indiceMarco)}
                  y1={MARGEM.topo}
                  y2={MARGEM.topo + alturaPlot}
                  stroke="var(--border)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={x(indiceMarco)}
                  y={MARGEM.topo - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[length:var(--texto-micro)]"
                >
                  {marcoHoje.rotulo}
                </text>
              </g>
            ) : null}

            {caminhoArea ? (
              <path
                d={caminhoArea}
                fill={COR_SERIE}
                fillOpacity={inView ? 0.1 : 0}
                style={{
                  transition: 'fill-opacity 850ms cubic-bezier(0.16, 1, 0.3, 1) 200ms',
                }}
              />
            ) : null}

            <path
              d={caminho}
              fill="none"
              stroke={COR_SERIE}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={inView ? 0 : 1}
              style={{
                transition: 'stroke-dashoffset 850ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />

            {/* Simulação: tracejada, entra depois que o trecho real termina de desenhar. */}
            {caminhoProjetado ? (
              <path
                d={caminhoProjetado}
                fill="none"
                stroke={COR_SERIE}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={TRACEJADO_PROJECAO}
                opacity={inView ? 1 : 0}
                className="motion-reduce:transition-none!"
                style={{ transition: 'opacity 400ms ease 850ms' }}
              />
            ) : null}

            {/* Junção real -> simulação: o último ponto REAL (o saldo de hoje) ganha a
                marca cheia. Com um único ponto real o trecho sólido nem tem segmento,
                e sem esta marca o saldo de hoje não apareceria. */}
            {juncao !== null ? (
              <circle
                data-ponto-real="juncao"
                cx={x(juncao)}
                cy={y(pontos[juncao].valor)}
                r={4}
                fill={COR_SERIE}
                stroke="var(--card)"
                strokeWidth={2}
              />
            ) : null}

            {/* Mês com rendimento a confirmar: losango vazado (forma, não cor). */}
            {pontos.map((p, i) =>
              p.marcador === 'pendente' ? (
                <polygon
                  key={`pendente-${p.chave}`}
                  data-marcador="pendente"
                  points={[
                    `${x(i)},${y(p.valor) - RAIO_LOSANGO}`,
                    `${x(i) + RAIO_LOSANGO},${y(p.valor)}`,
                    `${x(i)},${y(p.valor) + RAIO_LOSANGO}`,
                    `${x(i) - RAIO_LOSANGO},${y(p.valor)}`,
                  ].join(' ')}
                  fill="var(--card)"
                  stroke={COR_SERIE}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ) : null,
            )}

            {/* Crosshair */}
            {ativo !== null ? (
              <line
                x1={x(ativo)}
                x2={x(ativo)}
                y1={MARGEM.topo}
                y2={MARGEM.topo + alturaPlot}
                stroke="var(--border-forte)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
            ) : null}

            {/* Ponto final (vazado se o mês está em andamento) + rótulo direto */}
            {ultimo ? (
              <g
                className={cn(
                  'transition-all duration-500',
                  inView ? 'opacity-100 scale-100' : 'opacity-0 scale-75',
                )}
                style={{
                  transformOrigin: `${x(n - 1)}px ${y(ultimo.valor)}px`,
                  transitionDelay: '750ms',
                }}
              >
                <circle
                  cx={x(n - 1)}
                  cy={y(ultimo.valor)}
                  r={4}
                  fill={ultimoVazado ? 'var(--card)' : COR_SERIE}
                  stroke={ultimoVazado ? COR_SERIE : 'var(--card)'}
                  strokeWidth={2}
                />
                {ativo === null ? (
                  <text
                    x={x(n - 1)}
                    y={yRotuloFinal}
                    textAnchor="end"
                    className="fill-foreground text-[length:var(--texto-apoio)] font-semibold tabular-nums"
                  >
                    {formatarValor(ultimo.valor, ultimo)}
                  </text>
                ) : null}
              </g>
            ) : null}

            {/* Ponto ativo */}
            {pontoAtivo && ativo !== null && ativo !== n - 1 ? (
              <circle
                cx={x(ativo)}
                cy={y(pontoAtivo.valor)}
                r={4}
                fill={pontoAtivo.parcial || ativoProjetado ? 'var(--card)' : COR_SERIE}
                stroke={pontoAtivo.parcial || ativoProjetado ? COR_SERIE : 'var(--card)'}
                strokeWidth={2}
              />
            ) : null}

            {/* Alvo do ponteiro: a área inteira do gráfico, não a linha de 2px */}
            <rect
              x={MARGEM.esquerda}
              y={0}
              width={larguraPlot}
              height={ALTURA_GRAFICO_LINHA}
              fill="transparent"
              // pan-y: arrastar na horizontal percorre os meses; na vertical, rola a página.
              style={{ touchAction: 'pan-y' }}
              onPointerMove={aoMoverPonteiro}
              onPointerDown={aoMoverPonteiro}
              onPointerLeave={aoSairPonteiro}
            />
          </svg>
        ) : null}

        {pontoAtivo && ativo !== null ? (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute top-0 flex flex-col gap-[var(--esp-1)] rounded-[var(--raio-controle)] px-[var(--esp-3)] py-[var(--esp-2)] shadow-[var(--sombra-cartao)] ring-1 ring-foreground/10"
            style={{ left: centroTooltip, width: larguraTooltip, transform: 'translateX(-50%)' }}
          >
            <span className="flex items-center gap-[var(--esp-2)]">
              {ativoProjetado ? (
                <svg aria-hidden="true" data-chave-tooltip="projetado" width={12} height={2} className="shrink-0">
                  <line x1={1} x2={11} y1={1} y2={1} stroke={COR_SERIE} strokeWidth={2} strokeLinecap="round" strokeDasharray="2 4" />
                </svg>
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-block h-[2px] w-3 rounded-full"
                  style={{ backgroundColor: COR_SERIE }}
                />
              )}
              <span className="text-[length:var(--texto-corpo)] font-semibold tabular-nums">
                {formatarValor(pontoAtivo.valor, pontoAtivo)}
              </span>
            </span>
            <span className="text-muted-foreground text-[length:var(--texto-micro)]">
              {pontoAtivo.rotuloLongo}
              {pontoAtivo.parcial ? ` · ${ANALISES.parcial}` : ''}
            </span>
            {pontoAtivo.nota ? (
              <span className="text-muted-foreground text-[length:var(--texto-micro)]">{pontoAtivo.nota}</span>
            ) : null}
          </div>
        ) : null}

        <span id={idLeitura} className="sr-only" aria-live="polite">
          {leitura}
        </span>
      </div>

      <details className="text-[length:var(--texto-apoio)]">
        <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer select-none py-[var(--esp-1)]">
          {ANALISES.verTabela}
        </summary>
        <div className="mt-[var(--esp-2)] max-h-72 overflow-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                {tabela.cabecalhos.map((c, i) => (
                  <th
                    key={c}
                    scope="col"
                    className={`text-muted-foreground py-[var(--esp-1)] font-medium ${i > 0 ? 'text-right' : ''}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map((linha, li) => (
                <tr key={pontos[li]?.chave ?? li} className="border-b border-border/60">
                  {linha.map((celula, ci) => (
                    <td
                      key={ci}
                      className={`py-[var(--esp-1)] ${ci > 0 ? 'text-right tabular-nums' : ''}`}
                    >
                      {celula}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
