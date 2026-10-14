'use client'

/**
 * Progresso do orçamento por categoria (PLANO.md §8.1): barra horizontal com
 * marcador de meta, NUNCA donut. Plano: docs/planos/dash-orcamento-patrimonio-simulador.md §3.1.
 *
 * Forma: magnitude com um polo. Cada linha é um meter no MESMO eixo de razão
 * (0 .. max(100%, maior estouro)), então o marcador de 100% fica alinhado entre
 * as linhas. O trilho vai de 0 a 100% (o limite); o preenchimento passa do
 * marcador quando estoura.
 *
 * Cor: < 80% = série 1 (--chart-1), hue único CONSTANTE (rampa por valor em
 * categorias nominais é anti-pattern do dataviz — o comprimento já codifica);
 * 80–100% = status atenção (--pendente); > 100% = status crítico (--negativo).
 * Status sempre com ícone + rótulo; texto nunca na cor da série.
 */

import * as React from 'react'
import { OctagonAlert, TriangleAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { formatBRL } from '@/lib/format'
import { ANALISES } from '@/features/analises/copy'
import {
  dominioDaRazao,
  percentualInteiro,
  prepararOrcamentos,
  type LinhaOrcamento,
  type LinhaViewOrcamento,
  type StatusOrcamento,
} from './orcamento-logica'

export interface GraficoOrcamentoProps {
  linhas: LinhaViewOrcamento[]
  erro: boolean
  /** 'outubro de 2026' */
  mesRotulo: string
  emAndamento: boolean
  atualizadoEm: string
}

const COR_STATUS: Record<StatusOrcamento, string> = {
  normal: 'var(--chart-1)',
  atencao: 'var(--pendente)',
  estourado: 'var(--negativo)',
}

/** Trilho = mesmo hue do preenchimento, clareado contra a superfície (meter spec). */
const trilho = (cor: string) => `color-mix(in oklab, ${cor} 18%, var(--card))`

function SeloStatus({ status, razao }: { status: StatusOrcamento; razao: number }) {
  const pct = percentualInteiro(razao)
  if (status === 'normal') {
    return <span className="text-muted-foreground tabular-nums">{pct}</span>
  }
  const Icone = status === 'estourado' ? OctagonAlert : TriangleAlert
  const rotulo = status === 'estourado' ? ANALISES.orcamentoStatusEstourado : ANALISES.orcamentoStatusAtencao
  return (
    <span className="text-foreground inline-flex items-center gap-[var(--esp-1)] font-medium">
      <Icone className="size-4 shrink-0" style={{ color: COR_STATUS[status] }} aria-hidden="true" />
      <span>{rotulo}</span>
      <span className="tabular-nums">· {pct}</span>
    </span>
  )
}

function textoRestante(l: LinhaOrcamento, oculto: boolean): string {
  if (l.restante > 0) return ANALISES.orcamentoRestam(formatBRL(l.restante, oculto))
  if (l.restante === 0) return ANALISES.orcamentoNoLimite
  return ANALISES.orcamentoAcima(formatBRL(Math.abs(l.restante), oculto))
}

function descricaoAcessivel(l: LinhaOrcamento, oculto: boolean): string {
  const status =
    l.status === 'estourado'
      ? `${ANALISES.orcamentoStatusEstourado}. `
      : l.status === 'atencao'
        ? `${ANALISES.orcamentoStatusAtencao}. `
        : ''
  return `${l.categoria}: ${status}${formatBRL(l.gasto, oculto)} ${ANALISES.orcamentoDe} ${formatBRL(l.limite, oculto)}, ${percentualInteiro(l.razao)}. ${textoRestante(l, oculto)}.`
}

function LinhaDoOrcamento({
  linha,
  dominio,
  oculto,
}: {
  linha: LinhaOrcamento
  dominio: number
  oculto: boolean
}) {
  const [aberto, setAberto] = React.useState(false)
  const cor = COR_STATUS[linha.status]
  const posMeta = (1 / dominio) * 100
  const larguraFill = (Math.min(linha.razao, dominio) / dominio) * 100

  return (
    <li className="flex flex-col gap-[var(--esp-1)]">
      <div className="flex items-baseline justify-between gap-[var(--esp-3)] text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
        <span className="min-w-0 truncate font-medium">
          {linha.categoria}
          {linha.arquivada ? (
            <span className="text-muted-foreground font-normal"> {ANALISES.orcamentoArquivada}</span>
          ) : null}
        </span>
        <SeloStatus status={linha.status} razao={linha.razao} />
      </div>

      {/* A barra: alvo de hover/foco com tooltip que só repete o texto visível */}
      <div
        className="relative h-5 w-full rounded-[var(--raio-chip)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        tabIndex={0}
        role="img"
        aria-label={descricaoAcessivel(linha, oculto)}
        onPointerEnter={() => setAberto(true)}
        // No toque o pointerleave vem logo após o pointerup; quem fecha é o blur.
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch') setAberto(false)
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
      >
        {/* trilho: 0 a 100% do limite */}
        <div
          aria-hidden="true"
          className="absolute top-1 h-3 rounded-r-[4px]"
          style={{ left: 0, width: `${posMeta}%`, backgroundColor: trilho(cor) }}
        />
        {/* preenchimento: ponta de 4px arredondada, reta na base */}
        {larguraFill > 0 ? (
          <div
            aria-hidden="true"
            className="absolute top-1 h-3 rounded-r-[4px] transition-[width] duration-300"
            style={{ left: 0, width: `${larguraFill}%`, backgroundColor: cor }}
          />
        ) : null}
        {/* marcador de meta (100%), com anel da superfície para separar do preenchimento */}
        <div
          aria-hidden="true"
          className="bg-foreground absolute top-0 h-5 w-[2px] rounded-full"
          style={{ left: `calc(${posMeta}% - 1px)`, boxShadow: '0 0 0 1px var(--card)' }}
        />

        {aberto ? (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-[var(--esp-2)] flex w-max max-w-[16rem] flex-col gap-[var(--esp-1)] rounded-[var(--raio-controle)] px-[var(--esp-3)] py-[var(--esp-2)] text-[length:var(--texto-apoio)] shadow-[var(--sombra-cartao)] ring-1 ring-foreground/10"
            style={{ left: `min(max(0px, ${larguraFill}% - 8rem), calc(100% - 16rem))` }}
          >
            <span className="font-semibold tabular-nums">
              {formatBRL(linha.gasto, oculto)} {ANALISES.orcamentoDe} {formatBRL(linha.limite, oculto)}
            </span>
            <span className="text-muted-foreground">
              {linha.categoria} · {percentualInteiro(linha.razao)} · {textoRestante(linha, oculto)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-[var(--esp-3)] text-[length:var(--texto-micro)] leading-[var(--texto-micro-lh)]">
        <span className="tabular-nums">
          {formatBRL(linha.gasto, oculto)} {ANALISES.orcamentoDe} {formatBRL(linha.limite, oculto)} ·{' '}
          {ANALISES.orcamentoLancamentos(linha.lancamentos)}
        </span>
        <span className={linha.restante < 0 ? 'text-foreground font-medium tabular-nums' : 'tabular-nums'}>
          {textoRestante(linha, oculto)}
        </span>
      </div>
    </li>
  )
}

function ChaveLegenda({ cor, rotulo }: { cor: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-[var(--esp-2)]">
      <span aria-hidden="true" className="h-3 w-4 rounded-r-[4px]" style={{ backgroundColor: cor }} />
      {rotulo}
    </span>
  )
}

export function GraficoOrcamento({ linhas, erro, mesRotulo, emAndamento, atualizadoEm }: GraficoOrcamentoProps) {
  const { oculto } = useOcultarValores()
  const orcamentos = React.useMemo(() => prepararOrcamentos(linhas), [linhas])
  const dominio = dominioDaRazao(orcamentos)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-[var(--esp-2)]">
          <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
            {ANALISES.orcamentoTitulo}
          </CardTitle>
          {emAndamento ? (
            <Badge variant="outline" className="text-[length:var(--texto-micro)]">
              {ANALISES.emAndamento}
            </Badge>
          ) : null}
        </div>
        <CardDescription>{ANALISES.orcamentoDescricao(mesRotulo)}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-[var(--esp-4)]">
        {erro ? (
          <p role="alert" className="text-[length:var(--texto-apoio)]">
            {ANALISES.orcamentoErro}
          </p>
        ) : orcamentos.length === 0 ? (
          <div className="flex flex-col gap-[var(--esp-1)] py-[var(--esp-4)]">
            <p className="font-medium">{ANALISES.orcamentoVazioTitulo}</p>
            <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
              {ANALISES.orcamentoVazioDescricao(mesRotulo)}
            </p>
          </div>
        ) : (
          <>
            <ul className="grid gap-x-[var(--esp-8)] gap-y-[var(--esp-4)] lg:grid-cols-2">
              {orcamentos.map((l) => (
                <LinhaDoOrcamento key={l.id} linha={l} dominio={dominio} oculto={oculto} />
              ))}
            </ul>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-[var(--esp-4)] gap-y-[var(--esp-2)] text-[length:var(--texto-micro)]">
              <span className="inline-flex items-center gap-[var(--esp-2)]">
                <span aria-hidden="true" className="bg-foreground h-4 w-[2px] rounded-full" />
                {ANALISES.orcamentoLegendaMeta}
              </span>
              <ChaveLegenda cor={COR_STATUS.normal} rotulo={ANALISES.orcamentoLegendaNormal} />
              <ChaveLegenda cor={COR_STATUS.atencao} rotulo={ANALISES.orcamentoLegendaAtencao} />
              <ChaveLegenda cor={COR_STATUS.estourado} rotulo={ANALISES.orcamentoLegendaEstourado} />
            </div>
          </>
        )}

        <details className="text-[length:var(--texto-apoio)]">
          <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer select-none py-[var(--esp-1)]">
            {ANALISES.comoCalculamos}
          </summary>
          <p className="text-muted-foreground mt-[var(--esp-1)] leading-[var(--texto-apoio-lh)]">
            {ANALISES.orcamentoDefinicao}
          </p>
        </details>
        <p className="text-muted-foreground text-[length:var(--texto-micro)]">{ANALISES.atualizadoEm(atualizadoEm)}</p>
      </CardContent>
    </Card>
  )
}
