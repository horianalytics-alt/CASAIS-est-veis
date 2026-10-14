'use client'

import { formatBRL } from '@/lib/format'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Utensils, Target } from 'lucide-react'
import { ANALISES } from '@/features/analises/copy'

export interface MetaContaInfo {
  contaNome: string
  saldoAtual: number
  meta: number
}

interface IndicadoresInteligenciaProps {
  totalBeneficios: number
  totalFuteis: number
  rotulosFuteis: Array<{ rotulo: string; total: number }>
  metas: MetaContaInfo[]
}

export function IndicadoresInteligencia({
  totalBeneficios,
  totalFuteis,
  rotulosFuteis,
  metas,
}: IndicadoresInteligenciaProps) {
  const { oculto } = useOcultarValores()

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {/* Eficiência de Benefícios */}
      <Card>
        <CardHeader className="pb-[var(--esp-2)]">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold truncate">
              <Utensils className="size-4 text-[var(--beneficio)]" aria-hidden="true" />
              {ANALISES.beneficiosTitulo}
            </CardTitle>
            <Badge variant="outline" className="shrink-0 border-border-input text-xs">
              VR / VA
            </Badge>
          </div>
          <CardDescription>{ANALISES.beneficiosDescricao}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-[var(--esp-2)]">
          <span className="font-mono text-[length:var(--texto-subtitulo)] font-semibold num-tabular text-[var(--beneficio)]">
            + {formatBRL(totalBeneficios, oculto)}
          </span>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
            Valor coberto por benefícios que preservou a renda da família neste período.
          </p>
        </CardContent>
      </Card>

      {/* Gastos Fúteis / Supérfluos */}
      <Card>
        <CardHeader className="pb-[var(--esp-2)]">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-[var(--esp-2)] text-[length:var(--texto-corpo)] font-semibold">
              <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
              {ANALISES.futeisTitulo}
            </CardTitle>
            <Badge variant="outline" className="border-border-input text-[length:var(--texto-micro)]">
              Supérfluos
            </Badge>
          </div>
          <CardDescription>{ANALISES.futeisDescricao}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-[var(--esp-2)]">
          <span className="font-mono text-[length:var(--texto-subtitulo)] font-semibold num-tabular text-[var(--despesa)]">
            − {formatBRL(totalFuteis, oculto)}
          </span>
          {rotulosFuteis.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {rotulosFuteis.slice(0, 4).map((r, i) => (
                <span
                  key={i}
                  className="bg-muted text-muted-foreground rounded-xs px-1.5 py-0.5 text-[length:var(--texto-micro)]"
                >
                  {r.rotulo}: {formatBRL(r.total, oculto)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-[length:var(--texto-apoio)]">
              Nenhum gasto classificado como fútil neste período.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Metas por Conta */}
      <Card className="sm:col-span-2 lg:col-span-1">
        <CardHeader className="pb-[var(--esp-2)]">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-[var(--esp-2)] text-[length:var(--texto-corpo)] font-semibold">
              <Target className="size-4 text-primary" aria-hidden="true" />
              {ANALISES.metasTitulo}
            </CardTitle>
          </div>
          <CardDescription>{ANALISES.metasDescricao}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-[var(--esp-3)]">
          {metas.length === 0 ? (
            <p className="text-muted-foreground text-[length:var(--texto-apoio)]">
              Nenhuma meta cadastrada para as contas.
            </p>
          ) : (
            metas.map((m, idx) => {
              const progresso = Math.min(Math.max((m.saldoAtual / m.meta) * 100, 0), 100)
              return (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[length:var(--texto-apoio)]">
                    <span className="font-medium truncate">{m.contaNome}</span>
                    <span className="font-mono text-[length:var(--texto-micro)] num-tabular">
                      {progresso.toFixed(0)}%
                    </span>
                  </div>
                  <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-[length:var(--texto-micro)] text-muted-foreground num-tabular">
                    <span>{formatBRL(m.saldoAtual, oculto)}</span>
                    <span>Meta: {formatBRL(m.meta, oculto)}</span>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
