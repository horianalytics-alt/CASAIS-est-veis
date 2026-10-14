'use client'

/**
 * Patrimônio da família mês a mês (PLANO.md §8.2): LINHA, UMA série, UM eixo Y.
 * Nunca dual-axis. Plano: docs/planos/dash-orcamento-patrimonio-simulador.md §3.2.
 *
 * Janela: 12 meses terminando no mês selecionado em /analises (o seletor de mês
 * da página é o filtro único). Mês corrente = parcial (ponto vazado + rótulo).
 * Variação em R$ (sem %: sem base zero, sem divisão).
 */

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { formatBRL } from '@/lib/format'
import { rotuloDoMes } from '@/lib/hoje'
import { ANALISES } from '@/features/analises/copy'
import { GraficoLinha, ALTURA_GRAFICO_LINHA, type PontoLinha } from './grafico-linha'
import { janelaPatrimonio, variacaoNaJanela, type LinhaViewPatrimonio } from './patrimonio-logica'

export interface GraficoPatrimonioProps {
  linhas: LinhaViewPatrimonio[]
  erro: boolean
  /** Mês selecionado 'YYYY-MM' (fim da janela). */
  mes: string
  /** Mês corrente em São Paulo 'YYYY-MM'. */
  mesAtual: string
  atualizadoEm: string
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

/** '2026-10' -> 'out/26' */
function rotuloCurto(mes: string): string {
  return `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`
}

/** Valor com sinal explícito (C-2): + / U+2212 / nada para zero. */
function comSinal(valor: number, oculto: boolean): string {
  if (oculto) return formatBRL(0, true)
  const sinal = valor > 0 ? '+' : valor < 0 ? '−' : ''
  return `${sinal}${formatBRL(Math.abs(valor))}`
}

/** Patrimônio pode ser negativo: parênteses contábeis, como o saldo de conta. */
function valorContabil(valor: number, oculto: boolean): string {
  if (oculto) return formatBRL(0, true)
  return valor < 0 ? `(${formatBRL(Math.abs(valor))})` : formatBRL(valor)
}

export function GraficoPatrimonio({ linhas, erro, mes, mesAtual, atualizadoEm }: GraficoPatrimonioProps) {
  const { oculto } = useOcultarValores()
  const pontos = React.useMemo(() => janelaPatrimonio(linhas, mes, mesAtual), [linhas, mes, mesAtual])
  const variacao = variacaoNaJanela(pontos)
  const ultimo = pontos.length > 0 ? pontos[pontos.length - 1] : null

  const pontosLinha: PontoLinha[] = pontos.map((p) => ({
    chave: p.mes,
    rotuloEixo: rotuloCurto(p.mes),
    rotuloLongo: rotuloDoMes(p.mes),
    valor: p.valor,
    parcial: p.parcial,
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
          {ANALISES.patrimonioTitulo}
        </CardTitle>
        <CardDescription>{ANALISES.patrimonioDescricao}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-[var(--esp-4)]">
        {erro ? (
          <p role="alert" className="text-[length:var(--texto-apoio)]">
            {ANALISES.patrimonioErro}
          </p>
        ) : !ultimo ? (
          <div className="flex flex-col gap-[var(--esp-1)] py-[var(--esp-4)]">
            <p className="font-medium">{ANALISES.patrimonioVazioTitulo}</p>
            <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
              {ANALISES.patrimonioVazioDescricao(rotuloDoMes(mes))}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-[var(--esp-8)] gap-y-[var(--esp-3)]">
              <div className="flex flex-col gap-[var(--esp-1)]">
                <span className="text-muted-foreground text-[length:var(--texto-apoio)]">
                  {ANALISES.patrimonioEm(rotuloDoMes(ultimo.mes))}
                  {ultimo.parcial ? ` · ${ANALISES.parcial}` : ''}
                </span>
                <ValorMonetario valor={ultimo.valor} contabil tamanho="destaque" />
              </div>
              {variacao !== null ? (
                <div className="flex flex-col gap-[var(--esp-1)]">
                  <span className="text-muted-foreground text-[length:var(--texto-apoio)]">
                    {ANALISES.patrimonioVariacao(pontos.length - 1)}
                    {ultimo.parcial ? ` (${ANALISES.patrimonioAteHoje})` : ''}
                  </span>
                  {/* Oculto: sem cor de receita/despesa, que entregaria se subiu ou caiu. */}
                  {variacao === 0 || oculto ? (
                    <span className="valor text-[length:var(--texto-valor-linha)] font-medium">
                      {formatBRL(0, oculto)}
                    </span>
                  ) : (
                    <ValorMonetario
                      valor={Math.abs(variacao)}
                      tipo={variacao > 0 ? 'receita' : 'despesa'}
                    />
                  )}
                </div>
              ) : null}
            </div>

            {pontos.length < 2 ? (
              <p
                className="text-muted-foreground flex items-center text-[length:var(--texto-apoio)]"
                style={{ minHeight: ALTURA_GRAFICO_LINHA }}
              >
                {ANALISES.patrimonioUmMes}
              </p>
            ) : (
              <GraficoLinha
                pontos={pontosLinha}
                rotuloAcessivel={ANALISES.patrimonioGraficoRotulo(
                  rotuloDoMes(pontos[0].mes),
                  rotuloDoMes(ultimo.mes),
                )}
                formatarValor={(v) => valorContabil(v, oculto)}
                oculto={oculto}
                tabela={{
                  cabecalhos: [
                    ANALISES.patrimonioColunaMes,
                    ANALISES.patrimonioColunaValor,
                    ANALISES.patrimonioColunaVariacao,
                  ],
                  linhas: pontos.map((p) => [
                    `${rotuloDoMes(p.mes)}${p.parcial ? ` (${ANALISES.parcial})` : ''}`,
                    valorContabil(p.valor, oculto),
                    comSinal(p.variacaoMes, oculto),
                  ]),
                }}
              />
            )}
          </>
        )}

        <details className="text-[length:var(--texto-apoio)]">
          <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer select-none py-[var(--esp-1)]">
            {ANALISES.comoCalculamos}
          </summary>
          <p className="text-muted-foreground mt-[var(--esp-1)] leading-[var(--texto-apoio-lh)]">
            {ANALISES.patrimonioDefinicao}
          </p>
        </details>
        <p className="text-muted-foreground text-[length:var(--texto-micro)]">{ANALISES.atualizadoEm(atualizadoEm)}</p>
      </CardContent>
    </Card>
  )
}
