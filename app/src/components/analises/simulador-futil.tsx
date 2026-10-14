'use client'

/**
 * Simulador de gasto fútil (PLANO.md §8.3): "e se eu não tivesse gasto X, quanto
 * valeria em N meses a Z% ao mês?". Plano: docs/planos/dash-orcamento-patrimonio-simulador.md §3.3.
 *
 * O número é o protagonista (stat); a projeção mês a mês é uma LINHA, uma série,
 * um eixo, com Y a partir do zero. Toda conta é de src/lib/simulador.ts
 * (centavos inteiros, BigInt); aqui só se converte o texto digitado em inteiros
 * (simulador-entrada.ts, sem parseFloat) e se desenha.
 *
 * O campo de valor NÃO vem pré-preenchido com o total fútil real, e o botão
 * "Usar os supérfluos de <mês>" (que preenche sob ação do usuário) não aparece
 * no modo privacidade: escreveria no campo, em claro, o valor que o resto da
 * tela esconde.
 *
 * Uma conta só por mudança de entrada: projetarValorFuturo devolve a série, e o
 * último ponto É o valor final (mesma serieExata de simularValorFuturo).
 */

import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { formatBRL } from '@/lib/format'
import { projetarValorFuturo, taxaPercentualParaBps, type ErroSimulacao } from '@/lib/simulador'
import { ANALISES } from '@/features/analises/copy'
import { GraficoLinha } from './grafico-linha'
import { lerReais, textoParaMeses } from './simulador-entrada'

export interface SimuladorFutilProps {
  /** Soma dos lançamentos is_futile do mês selecionado, em centavos inteiros. */
  futilDoMesCentavos: number
  /** 'outubro de 2026' */
  mesRotulo: string
}

type CampoComErro = 'valor' | 'taxa' | 'meses'

interface Calculo {
  erros: Partial<Record<CampoComErro, string>>
  vazio: boolean
  resultado: {
    meses: number
    valorInicialCentavos: number
    valorFinalCentavos: number
    rendimentoCentavos: number
    pontos: { mes: number; valorCentavos: number }[]
  } | null
}

const CAMPO_DO_ERRO: Record<ErroSimulacao, CampoComErro> = {
  valor_invalido: 'valor',
  taxa_invalida: 'taxa',
  meses_invalido: 'meses',
  resultado_grande_demais: 'meses',
}

/** Centavos -> "1234,56" (sem milhar), o formato que o próprio campo aceita de volta. */
function centavosParaTexto(centavos: number): string {
  const inteiro = Math.floor(centavos / 100)
  const casas = String(centavos % 100).padStart(2, '0')
  return `${inteiro},${casas}`
}

function calcular(valorTexto: string, taxaTexto: string, mesesTexto: string): Calculo {
  const erros: Calculo['erros'] = {}
  if (valorTexto.trim() === '') return { erros, vazio: true, resultado: null }

  const valor = lerReais(valorTexto)
  const taxaMensalBps = taxaPercentualParaBps(taxaTexto)
  const meses = textoParaMeses(mesesTexto)
  if (!valor.ok) {
    erros.valor =
      valor.motivo === 'grande_demais'
        ? ANALISES.simuladorErros.valor_grande_demais
        : ANALISES.simuladorErros.valor_texto
  }
  if (taxaMensalBps === null) erros.taxa = ANALISES.simuladorErros.taxa_texto
  if (meses === null) erros.meses = ANALISES.simuladorErros.meses_texto
  if (!valor.ok || taxaMensalBps === null || meses === null) {
    return { erros, vazio: false, resultado: null }
  }

  const valorCentavos = valor.centavos
  const projecao = projetarValorFuturo({ valorCentavos, taxaMensalBps, meses })
  if (!projecao.ok) {
    erros[CAMPO_DO_ERRO[projecao.erro]] = ANALISES.simuladorErros[projecao.erro]
    return { erros, vazio: false, resultado: null }
  }
  const valorFinalCentavos = projecao.pontos[projecao.pontos.length - 1].valorCentavos
  return {
    erros,
    vazio: false,
    resultado: {
      meses,
      valorInicialCentavos: valorCentavos,
      valorFinalCentavos,
      rendimentoCentavos: valorFinalCentavos - valorCentavos,
      pontos: projecao.pontos,
    },
  }
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  modo,
  placeholder,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  erro?: string
  modo: 'decimal' | 'numeric'
  placeholder?: string
}) {
  const idErro = `${id}-erro`
  return (
    <div className="flex flex-col gap-[var(--esp-2)]">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="text"
        inputMode={modo}
        autoComplete="off"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
        className="tabular-nums"
      />
      {erro ? (
        <p id={idErro} className="text-destructive text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

export function SimuladorFutil({ futilDoMesCentavos, mesRotulo }: SimuladorFutilProps) {
  const { oculto } = useOcultarValores()
  const id = React.useId()
  const [valorTexto, setValorTexto] = React.useState('')
  const [taxaTexto, setTaxaTexto] = React.useState('1,00')
  const [mesesTexto, setMesesTexto] = React.useState('12')

  const { erros, vazio, resultado } = React.useMemo(
    () => calcular(valorTexto, taxaTexto, mesesTexto),
    [valorTexto, taxaTexto, mesesTexto],
  )
  const temCurva = resultado !== null && resultado.meses > 0 && resultado.valorInicialCentavos > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[length:var(--texto-subtitulo)] font-semibold">
          {ANALISES.simuladorTitulo}
        </CardTitle>
        <CardDescription>{ANALISES.simuladorDescricao}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-[var(--esp-4)]">
        <div className="grid gap-[var(--esp-4)] sm:grid-cols-3">
          <Campo
            id={`${id}-valor`}
            rotulo={ANALISES.simuladorValor}
            valor={valorTexto}
            aoMudar={setValorTexto}
            erro={erros.valor}
            modo="decimal"
            placeholder="250,00"
          />
          <Campo
            id={`${id}-taxa`}
            rotulo={ANALISES.simuladorTaxa}
            valor={taxaTexto}
            aoMudar={setTaxaTexto}
            erro={erros.taxa}
            modo="decimal"
          />
          <Campo
            id={`${id}-meses`}
            rotulo={ANALISES.simuladorMeses}
            valor={mesesTexto}
            aoMudar={setMesesTexto}
            erro={erros.meses}
            modo="numeric"
          />
        </div>

        {futilDoMesCentavos > 0 && !oculto ? (
          <Button
            type="button"
            variant="outline"
            size="toque"
            className="w-fit max-w-full whitespace-normal text-left"
            onClick={() => setValorTexto(centavosParaTexto(futilDoMesCentavos))}
          >
            {ANALISES.simuladorUsarFuteis(mesRotulo, formatBRL(futilDoMesCentavos / 100, oculto))}
          </Button>
        ) : null}

        <div className="flex flex-col gap-[var(--esp-4)]">
          {vazio ? (
            <p className="text-muted-foreground text-[length:var(--texto-apoio)]">{ANALISES.simuladorPreencha}</p>
          ) : resultado ? (
            <div className="flex flex-wrap items-end gap-x-[var(--esp-8)] gap-y-[var(--esp-3)]">
              <div className="flex flex-col gap-[var(--esp-1)]">
                <span className="text-muted-foreground text-[length:var(--texto-apoio)]">
                  {ANALISES.simuladorResultado(resultado.meses)}
                </span>
                <ValorMonetario valor={resultado.valorFinalCentavos / 100} tamanho="destaque" />
              </div>
              <div className="flex flex-col gap-[var(--esp-1)]">
                <span className="text-muted-foreground text-[length:var(--texto-apoio)]">
                  {ANALISES.simuladorRendimento}
                </span>
                <ValorMonetario valor={resultado.rendimentoCentavos / 100} tipo="receita" />
              </div>
            </div>
          ) : null}
        </div>

        {resultado && temCurva ? (
          <GraficoLinha
            pontos={resultado.pontos.map((p) => ({
              chave: String(p.mes),
              rotuloEixo: ANALISES.simuladorEixoMes(p.mes),
              rotuloLongo: ANALISES.simuladorEixoMes(p.mes),
              valor: p.valorCentavos / 100,
            }))}
            incluirZero
            rotuloAcessivel={ANALISES.simuladorGraficoRotulo(resultado.meses)}
            formatarValor={(v) => formatBRL(v, oculto)}
            oculto={oculto}
            tabela={{
              cabecalhos: [ANALISES.simuladorColunaMes, ANALISES.simuladorColunaValor],
              linhas: resultado.pontos.map((p) => [
                ANALISES.simuladorEixoMes(p.mes),
                formatBRL(p.valorCentavos / 100, oculto),
              ]),
            }}
          />
        ) : resultado ? (
          <p className="text-muted-foreground text-[length:var(--texto-apoio)]">{ANALISES.simuladorSemCurva}</p>
        ) : null}

        <details className="text-[length:var(--texto-apoio)]">
          <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer select-none py-[var(--esp-1)]">
            {ANALISES.comoCalculamos}
          </summary>
          <p className="text-muted-foreground mt-[var(--esp-1)] leading-[var(--texto-apoio-lh)]">
            {ANALISES.simuladorDefinicao}
          </p>
        </details>
      </CardContent>
    </Card>
  )
}
