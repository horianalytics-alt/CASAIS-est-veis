'use client'

import { useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { formatBRL } from '@/lib/format'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'

/**
 * O ÚNICO lugar do app autorizado a pintar valor em dinheiro.
 *
 * Concentrar aqui é o que torna C-1, C-2 e C-3 verificáveis: em vez de
 * depender de disciplina em 20 telas, a regra vive num arquivo só e é
 * conferível por grep.
 *
 * C-1 — a cor de chrome NUNCA codifica valor financeiro. A cor aqui vem SÓ
 *       da semântica do Vitrine. O gate automatizado é um grep pela palavra
 *       de cor de chrome neste diretório, que tem de dar ZERO — por isso nem
 *       este comentário a escreve por extenso. Cores: --receita / --despesa /
 *       --investimento / --transferencia / --pendente / --negativo.
 * C-2 — todo valor monetário exibe sinal `+` ou `−` (U+2212) explícito, ANTES
 *       do `R$`, sem exceção. Em protanopia receita e despesa colapsam
 *       (ΔE 12.6): o sinal é o que sobrevive ao daltonismo e ao preto e branco.
 * C-3 — saldo de conta negativo usa parênteses contábeis `(R$ 1.234,56)` MAIS
 *       ícone de alerta, além da cor.
 *
 * ATENÇÃO ao formatBRL: no pt-BR ele devolve `-R$ 1.234,56`, com hífen antes
 * do R$. Esse hífen não é o sinal da C-2 e não deve escapar. Por isso sempre
 * passamos Math.abs() e compomos o sinal nós mesmos.
 *
 * Ocultar valores: `formatBRL(v, true)` devolve `R$ ••••` e não vaza o
 * negativo. Quando oculto, o sinal e os parênteses também somem — senão o
 * sinal entregaria a informação que o olho estava escondendo.
 */

export type TipoDeValor =
  | 'receita'
  | 'despesa'
  | 'investimento'
  | 'transferencia'

export interface ValorMonetarioProps {
  /** Em reais. O SINAL vem do `tipo`, não do número (o banco tem CHECK > 0). */
  valor: number
  tipo?: TipoDeValor
  /** false => cor --pendente (mapa da seção 2.3 do handoff). */
  pago?: boolean
  /** C-3: saldo de conta. Negativo vira `(R$ …)` + ícone de alerta. */
  contabil?: boolean
  /** Provider de ocultar valores. */
  oculto?: boolean
  tamanho?: 'heroi' | 'destaque' | 'linha'
  className?: string
  /** Animar valor subindo do zero ao valor real */
  animar?: boolean
}

/** Mapa determinístico de (tipo, pago) -> cor, da seção 2.3 do handoff. */
function classeDeCor(
  tipo: TipoDeValor | undefined,
  pago: boolean,
  negativoContabil: boolean,
): string {
  if (negativoContabil) return 'text-negativo'
  if (!tipo) return 'text-foreground'
  // Pendente é o desvio que chama atenção; pago é o estado normal.
  if ((tipo === 'receita' || tipo === 'despesa') && !pago) return 'text-pendente'
  if (tipo === 'receita') return 'text-receita'
  if (tipo === 'despesa') return 'text-despesa'
  if (tipo === 'investimento') return 'text-investimento'
  return 'text-transferencia'
}

/**
 * C-2. Investimento e transferência não levam sinal porque não mudam
 * patrimônio como receita/despesa — para eles o reforço é o ícone + a palavra
 * do tipo, que o BadgeTipo exibe ao lado.
 */
function sinalDe(tipo: TipoDeValor | undefined): '' | '+' | '\u2212' {
  if (tipo === 'receita') return '+'
  if (tipo === 'despesa') return '\u2212'
  return ''
}

const CLASSE_TAMANHO = {
  heroi:
    'text-[length:var(--texto-valor-heroi)] leading-[var(--texto-valor-heroi-lh)] font-semibold',
  destaque:
    'text-[length:var(--texto-valor-destaque)] leading-[var(--texto-valor-destaque-lh)] font-semibold',
  linha:
    'text-[length:var(--texto-valor-linha)] leading-[var(--texto-valor-linha-lh)] font-medium',
} as const

export function ValorMonetario({
  valor,
  tipo,
  pago = true,
  contabil = false,
  oculto: propOculto,
  tamanho = 'linha',
  className,
  animar,
}: ValorMonetarioProps) {
  const { oculto: contextOculto } = useOcultarValores()
  const oculto = propOculto ?? contextOculto

  const deveAnimar = animar ?? (tamanho === 'heroi' || tamanho === 'destaque')
  const { ref, inView } = useInView<HTMLSpanElement>({
    threshold: 0.1,
    replayOnScroll: true,
  })
  const [valorExibido, setValorExibido] = useState(deveAnimar ? 0 : valor)

  useEffect(() => {
    if (!deveAnimar || oculto) {
      setValorExibido(valor)
      return
    }

    if (!inView) {
      setValorExibido(0)
      return
    }

    const valorInicial = 0
    const diferenca = valor - valorInicial
    if (Math.abs(diferenca) < 0.01) {
      setValorExibido(valor)
      return
    }

    const duracao = 600
    const inicioTempo = performance.now()
    let idAnimacao: number

    function animarPasso(agora: number) {
      const decorrido = agora - inicioTempo
      const progresso = Math.min(decorrido / duracao, 1)
      const ease = 1 - Math.pow(1 - progresso, 3)
      setValorExibido(valorInicial + diferenca * ease)

      if (progresso < 1) {
        idAnimacao = requestAnimationFrame(animarPasso)
      } else {
        setValorExibido(valor)
      }
    }

    idAnimacao = requestAnimationFrame(animarPasso)
    return () => cancelAnimationFrame(idAnimacao)
  }, [valor, deveAnimar, oculto, inView])

  const valorParaExibir = deveAnimar && !oculto ? valorExibido : valor
  const negativoContabil = contabil && valorParaExibir < 0

  // Sempre o módulo: o sinal e os parênteses são nossos, não do toLocaleString.
  const textoDoValor = formatBRL(Math.abs(valorParaExibir), oculto)

  // Oculto: sem sinal e sem parênteses, senão eles entregariam o que o olho
  // estava escondendo. A largura da caixa é preservada pelo próprio ••••.
  const sinal = oculto ? '' : negativoContabil ? '' : sinalDe(tipo)

  const corpo =
    !oculto && negativoContabil ? `(${textoDoValor})` : `${sinal}${textoDoValor}`

  /**
   * O valor-herói cai para o tamanho de destaque acima de 12 caracteres
   * (edge case 7.3 do handoff): valor truncado é dado errado, então encolhe
   * em vez de quebrar linha ou elipsar.
   */
  const tamanhoEfetivo =
    tamanho === 'heroi' && corpo.length > 12 ? 'destaque' : tamanho

  return (
    <span
      ref={deveAnimar ? ref : undefined}
      // .valor = mono + tabular-nums + alinhado à direita + sem quebra (T-1).
      className={cn(
        'valor inline-flex items-center gap-[var(--esp-1)]',
        CLASSE_TAMANHO[tamanhoEfetivo],
        classeDeCor(tipo, pago, negativoContabil),
        className,
      )}
    >
      {negativoContabil && !oculto ? (
        // Ícone INFORMATIVO (handoff 4.4): precisa de nome acessível, porque é
        // ele que diferencia "linha de despesa" de "conta no vermelho".
        <TriangleAlert
          aria-label="Saldo negativo"
          role="img"
          className="size-4 shrink-0"
        />
      ) : null}
      {corpo}
    </span>
  )
}
