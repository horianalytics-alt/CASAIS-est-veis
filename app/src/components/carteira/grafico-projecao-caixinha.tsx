'use client'

/**
 * Gráfico de projeção por caixinha (Carteira de Investimento, Task 5).
 * Plano: docs/planos/dash-grafico-projecao-caixinha.md.
 *
 * Forma (dataviz, choosing-a-form + Non-negotiables): LINHA, uma série (o saldo
 * da caixinha), UM eixo Y em R$. Dois estados de certeza da mesma série:
 *   - sólido      = saldo confirmado no fim de cada mês (dado real);
 *   - tracejado   = simulação dos próximos 12 meses a partir do saldo de hoje,
 *                   com a taxa atual (o dataviz reserva o tracejado para projeção);
 *   - losango     = mês fechado com rendimento estimado ainda não confirmado
 *                   (spec 4b: ele não entra no saldo nem na simulação).
 * Cor única --chart-1 (chart-palette.ts, Vitrine); a diferença nunca é só cor.
 *
 * Modo privacidade (L-003): valores mascarados, e também sem zero no domínio e
 * sem área, que deixariam ler proporções. Sem cor de ganho/perda.
 *
 * Sem Card próprio: o invólucro é da Fachada (area-investimentos.tsx).
 */

import * as React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { GraficoLinha, type PontoLinha } from '@/components/analises/grafico-linha'
import { useOcultarValores } from '@/components/providers/ocultar-valores-provider'
import { PROJECAO_CAIXINHA as C } from '@/features/carteira/copy'
import { formatBRL } from '@/lib/format'
import { rotuloDoMes } from '@/lib/hoje'
import { formatarTaxaMensal } from './tipos-investimentos'
import {
  montarProjecaoCaixinha,
  normalizarMesesProjecao,
  totalPendente,
  type CaixinhaParaProjecao,
  type MovimentoCaixinha,
  type PontoProjecaoCaixinha,
  type RendimentoPendente,
} from './projecao-caixinha-logica'

export interface GraficoProjecaoCaixinhaProps {
  /** Compatível com CaixinhaInvestimento (tipos-investimentos.ts). */
  caixinha: CaixinhaParaProjecao
  /** Pode ser a lista da família inteira: o componente filtra por caixinha.id. */
  movimentos: MovimentoCaixinha[]
  /** Idem: resultado de carteira_rendimentos_pendentes(). */
  pendentes: RendimentoPendente[]
  /** 'YYYY-MM' em America/Sao_Paulo, calculado no servidor. */
  mesAtual: string
  /** 'dd/mm/aaaa hh:mm' em America/Sao_Paulo. */
  atualizadoEm: string
  /** true quando lerDadosProjecaoCarteira devolveu { ok: false }. */
  erro?: boolean
  /** A Fachada passa router.refresh(). */
  aoTentarNovamente?: () => void
  /** Padrão 12 (o cabeçalho da Fachada diz "próximos 12 meses"). */
  mesesProjecao?: number
}

/**
 * Altura mínima do bloco inteiro em TODOS os estados, e altura exata do
 * skeleton. MEDIDA no navegador (card de 358px, viewport 390px), pior caso =
 * chave em 2 linhas + aviso de pendentes em 3 linhas: 474px. Sem pendentes,
 * em desktop ou nos estados vazio/erro, o conteúdo tem 440px e o mínimo
 * reserva o resto: o skeleton nunca é menor que o conteúdo (L-004).
 * Se a chave ou o aviso mudarem de tamanho, medir de novo (ver o gate).
 */
export const ALTURA_GRAFICO_PROJECAO = 480

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const
const COR_SERIE = 'var(--chart-1)'

/** '2026-10' -> 'out/26' */
function rotuloCurto(mes: string): string {
  return `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`
}

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa', sem Date (data de calendário, sem fuso). */
function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d.slice(0, 2)}/${m}/${a}` : iso
}

function Bloco({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col gap-[var(--esp-3)] ${className ?? ''}`}
      style={{ minHeight: ALTURA_GRAFICO_PROJECAO }}
    >
      {children}
    </div>
  )
}

function ChaveDeTraco({ comSimulacao, comPendente }: { comSimulacao: boolean; comPendente: boolean }) {
  const item = 'text-muted-foreground flex items-center gap-[var(--esp-2)] text-[length:var(--texto-micro)]'
  return (
    <ul className="flex flex-wrap items-center gap-x-[var(--esp-4)] gap-y-[var(--esp-1)]" aria-label="Legenda do gráfico">
      <li className={item}>
        <svg aria-hidden="true" width={16} height={2}>
          <line x1={1} x2={15} y1={1} y2={1} stroke={COR_SERIE} strokeWidth={2} strokeLinecap="round" />
        </svg>
        {C.chaveConfirmado}
      </li>
      {comSimulacao ? (
        <li className={item}>
          <svg aria-hidden="true" width={16} height={2}>
            <line x1={1} x2={15} y1={1} y2={1} stroke={COR_SERIE} strokeWidth={2} strokeLinecap="round" strokeDasharray="2 4" />
          </svg>
          {C.chaveSimulacao}
        </li>
      ) : null}
      {comPendente ? (
        <li className={item}>
          <svg aria-hidden="true" width={12} height={12} viewBox="0 0 12 12">
            <polygon points="6,1 11,6 6,11 1,6" fill="var(--card)" stroke={COR_SERIE} strokeWidth={2} strokeLinejoin="round" />
          </svg>
          {C.chavePendente}
        </li>
      ) : null}
    </ul>
  )
}

function Rodape({
  taxa,
  definidaEm,
  meses,
  atualizadoEm,
}: {
  taxa: string
  definidaEm: string
  meses: number
  atualizadoEm: string
}) {
  return (
    <>
      <details className="text-[length:var(--texto-apoio)]">
        <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer select-none py-[var(--esp-1)]">
          {C.comoCalculamos}
        </summary>
        <div className="text-muted-foreground mt-[var(--esp-1)] flex flex-col gap-[var(--esp-1)] leading-[var(--texto-apoio-lh)]">
          <p>{C.definicaoConfirmado}</p>
          <p>{C.definicaoSimulacao(taxa, definidaEm, meses)}</p>
        </div>
      </details>
      <p className="text-muted-foreground text-[length:var(--texto-micro)]">{C.atualizadoEm(atualizadoEm)}</p>
    </>
  )
}

export function GraficoProjecaoCaixinha({
  caixinha,
  movimentos,
  pendentes,
  mesAtual,
  atualizadoEm,
  erro = false,
  aoTentarNovamente,
  mesesProjecao,
}: GraficoProjecaoCaixinhaProps) {
  const { oculto } = useOcultarValores()
  // O mesmo número que a lógica usa: os textos nunca contradizem o gráfico.
  const meses = normalizarMesesProjecao(mesesProjecao)
  const estado = React.useMemo(
    () => montarProjecaoCaixinha({ caixinha, movimentos, pendentes, mesAtual, mesesProjecao: meses }),
    [caixinha, movimentos, pendentes, mesAtual, meses],
  )
  const pendente = totalPendente(pendentes, caixinha.id)
  const taxa = formatarTaxaMensal(caixinha.rate_bps)
  const definidaEm = dataBR(caixinha.rate_defined_at)

  const dinheiro = (centavos: number) => formatBRL(centavos / 100, oculto)

  if (erro || estado.tipo === 'divergente') {
    return (
      <Bloco>
        <div role="alert" className="flex flex-col items-start gap-[var(--esp-2)] py-[var(--esp-4)]">
          <p className="flex items-center gap-[var(--esp-2)] font-medium">
            <AlertCircle className="size-4" aria-hidden="true" />
            {C.erroTitulo}
          </p>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)]">{C.erroDescricao}</p>
          {aoTentarNovamente ? (
            <Button type="button" variant="outline" size="sm" onClick={aoTentarNovamente} className="gap-1.5">
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {C.tentarDeNovo}
            </Button>
          ) : null}
        </div>
      </Bloco>
    )
  }

  if (estado.tipo === 'vazio') {
    return (
      <Bloco className="justify-center">
        <div className="flex flex-col gap-[var(--esp-1)] py-[var(--esp-4)]">
          <p className="font-medium">{C.vazioTitulo}</p>
          <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
            {C.vazioDescricao}
          </p>
        </div>
      </Bloco>
    )
  }

  const pontos = estado.pontos
  const temPendenteNaJanela = pontos.some((p) => p.pendenteCentavos > 0)

  const notaDe = (p: PontoProjecaoCaixinha): string | undefined => {
    if (p.situacao === 'simulacao') return C.notaSimulacao(taxa)
    if (p.pendenteCentavos > 0) return C.notaPendente(oculto ? null : dinheiro(p.pendenteCentavos))
    return undefined
  }

  const pontosLinha: PontoLinha[] = pontos.map((p) => ({
    chave: p.mes,
    rotuloEixo: rotuloCurto(p.mes),
    rotuloLongo: p.situacao === 'simulacao' ? C.rotuloLongoSimulado(rotuloDoMes(p.mes)) : rotuloDoMes(p.mes),
    valor: p.valorCentavos / 100,
    projetado: p.situacao === 'simulacao' || undefined,
    marcador: p.pendenteCentavos > 0 ? 'pendente' : undefined,
    nota: notaDe(p),
  }))

  // Simulado leva "≈" também no modo oculto: diz o estado, não o valor.
  const formatarValor = (valor: number, ponto?: PontoLinha) =>
    `${ponto?.projetado ? '≈ ' : ''}${formatBRL(valor, oculto)}`

  const situacaoDe = (p: PontoProjecaoCaixinha) => {
    const base =
      p.situacao === 'simulacao' ? C.situacaoSimulacao : p.situacao === 'hoje' ? C.situacaoHoje : C.situacaoConfirmado
    return p.pendenteCentavos > 0 ? `${base} · ${C.notaPendente(oculto ? null : dinheiro(p.pendenteCentavos))}` : base
  }

  const indiceHoje = estado.tipo === 'ok' ? estado.indiceHoje : pontos.length - 1

  return (
    <Bloco>
      <ChaveDeTraco comSimulacao={estado.tipo === 'ok'} comPendente={temPendenteNaJanela} />

      {pontos.length >= 2 ? (
        <GraficoLinha
          pontos={pontosLinha}
          // Visível: zero no eixo, grandeza honesta. Oculto: sem zero e sem área (L-003).
          incluirZero={!oculto}
          mostrarArea={!oculto}
          marcoHoje={estado.tipo === 'ok' ? { indice: indiceHoje, rotulo: C.hoje } : undefined}
          // O GraficoLinha já acrescenta a instrução de navegação por setas.
          rotuloAcessivel={C.rotuloGrafico(caixinha.name, meses)}
          formatarValor={formatarValor}
          oculto={oculto}
          tabela={{
            cabecalhos: [C.colunaMes, C.colunaSaldo, C.colunaSituacao],
            linhas: pontos.map((p, i) => [
              pontosLinha[i].rotuloLongo,
              formatarValor(pontosLinha[i].valor, pontosLinha[i]),
              situacaoDe(p),
            ]),
          }}
        />
      ) : (
        // Um mês só e sem simulação (caixinha criada e zerada neste mês): não há linha
        // para desenhar, mas o valor não some.
        <p className="font-medium tabular-nums">{C.saldoDeHoje(dinheiro(pontos[pontos.length - 1].valorCentavos))}</p>
      )}

      <div className="flex flex-col gap-[var(--esp-1)] text-[length:var(--texto-apoio)]">
        {estado.tipo === 'sem_simulacao' ? (
          <p className="text-muted-foreground">
            {estado.motivo === 'saldo_zero' ? C.semSimulacaoSaldoZero : C.semSimulacaoGrande}
          </p>
        ) : null}
        {pendente.meses > 0 ? (
          <p className="text-muted-foreground leading-[var(--texto-apoio-lh)]">
            {C.avisoPendentes(pendente.meses, oculto ? null : dinheiro(pendente.centavos))}
          </p>
        ) : null}
      </div>

      <Rodape taxa={taxa} definidaEm={definidaEm} meses={meses} atualizadoEm={atualizadoEm} />
    </Bloco>
  )
}

/** Mesma altura do conteúdo final em qualquer estado (L-004). */
export function GraficoProjecaoCaixinhaSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--esp-3)]" style={{ height: ALTURA_GRAFICO_PROJECAO }} aria-hidden="true">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-[220px] w-full rounded-[var(--raio-controle)]" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-4 w-32" />
    </div>
  )
}
