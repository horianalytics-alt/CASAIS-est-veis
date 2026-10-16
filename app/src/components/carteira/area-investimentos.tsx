'use client'

import * as React from 'react'
import {
  PiggyBank,
  PlusCircle,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Sparkles,
  AlertCircle,
  RefreshCw,
  LineChart,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { EstadoVazio } from '@/components/ui/estado-vazio'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { formatBRL } from '@/lib/format'
import { hapticFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'

import { CardCaixinha } from './card-caixinha'
import { DialogoCriarCaixinha, type DadosNovaCaixinha } from './dialogo-criar-caixinha'
import { DialogoAplicar, type ContaOrigem, type DadosAplicacao } from './dialogo-aplicar'
import { DialogoAlocar, type DadosAlocacao } from './dialogo-alocar'
import { DialogoResgatar, type DadosResgate } from './dialogo-resgatar'
import {
  type CaixinhaInvestimento,
  type CarteiraInvestimentoResumo,
  MOCK_CARTEIRA_INVESTIMENTO,
  formatarTaxaMensal,
  ROTULOS_TIPO_RENDIMENTO,
} from './tipos-investimentos'

export interface AreaInvestimentosProps {
  contasOrigem: ContaOrigem[]
  dadosIniciais?: CarteiraInvestimentoResumo
  carregando?: boolean
  erro?: string | null
  onAtualizar?: () => void
  className?: string
}

export function AreaInvestimentos({
  contasOrigem,
  dadosIniciais,
  carregando = false,
  erro = null,
  onAtualizar,
  className,
}: AreaInvestimentosProps) {
  // Estado local gerenciável para interação fluida antes do backend do Estrutura publicar
  const [dados, setDados] = React.useState<CarteiraInvestimentoResumo>(
    dadosIniciais ?? MOCK_CARTEIRA_INVESTIMENTO,
  )

  // Diálogos
  const [modalCriarAberto, setModalCriarAberto] = React.useState(false)
  const [modalAplicarAberto, setModalAplicarAberto] = React.useState(false)
  const [modalAlocarAberto, setModalAlocarAberto] = React.useState(false)
  const [modalResgatarAberto, setModalResgatarAberto] = React.useState(false)

  // Caixinha ativa para ações contextuais (alocar, resgatar, projeção)
  const [caixinhaParaAlocar, setCaixinhaParaAlocar] = React.useState<CaixinhaInvestimento | null>(null)
  const [caixinhaParaResgatar, setCaixinhaParaResgatar] = React.useState<CaixinhaInvestimento | null>(null)
  const [caixinhaParaProjecaoId, setCaixinhaParaProjecaoId] = React.useState<string>(
    dados.caixinhas[0]?.id ?? '',
  )

  // Toast Feedback temporário
  const [mensagemFeedback, setMensagemFeedback] = React.useState<string | null>(null)

  const dispararFeedback = React.useCallback((msg: string) => {
    setMensagemFeedback(msg)
    setTimeout(() => {
      setMensagemFeedback((atual) => (atual === msg ? null : atual))
    }, 4000)
  }, [])

  // Sincroniza se dadosIniciais mudarem
  React.useEffect(() => {
    if (dadosIniciais) {
      setDados(dadosIniciais)
      if (dadosIniciais.caixinhas.length > 0 && !caixinhaParaProjecaoId) {
        setCaixinhaParaProjecaoId(dadosIniciais.caixinhas[0].id)
      }
    }
  }, [dadosIniciais, caixinhaParaProjecaoId])

  // Ações locais (simulam o resultado das Server Actions até a publicação pelo Estrutura)
  const handleCriarCaixinha = async (nova: DadosNovaCaixinha) => {
    const novaCaixinha: CaixinhaInvestimento = {
      id: `caixinha-${Date.now()}`,
      family_id: 'fam-local',
      account_id: 'acc-inv',
      name: nova.nome,
      rate_type: nova.tipoRendimento,
      rate_bps: nova.taxaMensalBps,
      rate_defined_at: new Date().toISOString().slice(0, 10),
      resgate_imediato: nova.resgateImediato,
      data_vencimento: nova.dataVencimento ?? null,
      balance_cents: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setDados((antigos) => ({
      ...antigos,
      caixinhas: [...antigos.caixinhas, novaCaixinha],
    }))
    setCaixinhaParaProjecaoId(novaCaixinha.id)
    dispararFeedback(`Caixinha "${nova.nome}" criada com sucesso.`)
  }

  const handleAplicar = async (aplicacao: DadosAplicacao) => {
    const centavos = Math.round(aplicacao.valor * 100)
    setDados((antigos) => {
      if (aplicacao.caixinhaId) {
        // Aplicação direta em uma caixinha
        const caixinhasAtualizadas = antigos.caixinhas.map((cx) =>
          cx.id === aplicacao.caixinhaId
            ? { ...cx, balance_cents: cx.balance_cents + centavos }
            : cx,
        )
        return {
          ...antigos,
          saldoTotalCents: antigos.saldoTotalCents + centavos,
          caixinhas: caixinhasAtualizadas,
        }
      }
      // Aplicação no saldo não alocado
      return {
        ...antigos,
        saldoTotalCents: antigos.saldoTotalCents + centavos,
        saldoNaoAlocadoCents: antigos.saldoNaoAlocadoCents + centavos,
      }
    })
    dispararFeedback(`Aplicação de ${formatBRL(aplicacao.valor)} realizada com sucesso.`)
  }

  const handleAlocar = async (alocacao: DadosAlocacao) => {
    const centavos = Math.round(alocacao.valor * 100)
    setDados((antigos) => {
      const caixinhasAtualizadas = antigos.caixinhas.map((cx) =>
        cx.id === alocacao.caixinhaId
          ? { ...cx, balance_cents: cx.balance_cents + centavos }
          : cx,
      )
      return {
        ...antigos,
        saldoNaoAlocadoCents: Math.max(0, antigos.saldoNaoAlocadoCents - centavos),
        caixinhas: caixinhasAtualizadas,
      }
    })
    dispararFeedback(`${formatBRL(alocacao.valor)} alocado na caixinha com sucesso.`)
  }

  const handleResgatar = async (resgate: DadosResgate) => {
    const centavos = Math.round(resgate.valor * 100)
    setDados((antigos) => {
      const caixinhasAtualizadas = antigos.caixinhas.map((cx) =>
        cx.id === resgate.caixinhaId
          ? { ...cx, balance_cents: Math.max(0, cx.balance_cents - centavos) }
          : cx,
      )
      const novoNaoAlocado =
        resgate.destino === 'nao_alocado'
          ? antigos.saldoNaoAlocadoCents + centavos
          : antigos.saldoNaoAlocadoCents
      const novoTotal =
        resgate.destino === 'nao_alocado'
          ? antigos.saldoTotalCents
          : Math.max(0, antigos.saldoTotalCents - centavos)

      return {
        ...antigos,
        saldoTotalCents: novoTotal,
        saldoNaoAlocadoCents: novoNaoAlocado,
        caixinhas: caixinhasAtualizadas,
      }
    })
    dispararFeedback(`Resgate de ${formatBRL(resgate.valor)} realizado com sucesso.`)
  }

  // Caixinha selecionada para projeção
  const caixinhaProjecao = dados.caixinhas.find((c) => c.id === caixinhaParaProjecaoId) ?? dados.caixinhas[0]

  // Estado de Carregamento
  if (carregando) {
    return (
      <div className={cn('flex flex-col gap-6', className)}>
        <div className="rounded-2xl border border-border/80 bg-card p-5">
          <Skeleton className="h-6 w-48 mb-3" />
          <Skeleton className="h-10 w-64 mb-4" />
          <div className="flex gap-3">
            <Skeleton className="h-9 w-32 rounded-xl" />
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    )
  }

  // Estado de Erro
  if (erro) {
    return (
      <Alert variant="destructive" className="rounded-2xl">
        <AlertCircle className="size-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>{erro}</span>
          {onAtualizar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAtualizar}
              className="gap-1.5 h-7 text-xs ml-4"
            >
              <RefreshCw className="size-3.5" />
              Tentar novamente
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  const saldoTotalReais = dados.saldoTotalCents / 100
  const saldoNaoAlocadoReais = dados.saldoNaoAlocadoCents / 100

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* 1. Resumo Patrimonial da Carteira de Investimento (Hero) */}
      <ScrollReveal replayOnScroll>
        <section
          aria-label="Resumo dos Investimentos"
          className="bg-card border-border/80 flex flex-col gap-5 rounded-2xl border p-5 sm:p-6 shadow-xs transition-all duration-300"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Saldo Total Investido */}
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                Patrimônio Total Investido
              </span>
              <div className="mt-1">
                <ValorMonetario
                  valor={saldoTotalReais}
                  tipo="investimento"
                  tamanho="heroi"
                  animar
                />
              </div>
              <span className="text-muted-foreground text-xs mt-0.5">
                Rendimento mensal simulado com base nas taxas de cada caixinha
              </span>
            </div>

            {/* Saldo Não Alocado (Destaque Secundário) */}
            <div className="flex flex-col gap-1 border-border/60 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                Saldo não alocado
              </span>
              <div className="mt-0.5">
                <ValorMonetario
                  valor={saldoNaoAlocadoReais}
                  tipo="investimento"
                  tamanho="destaque"
                  animar
                />
              </div>
              <span className="text-muted-foreground text-xs">
                {saldoNaoAlocadoReais > 0
                  ? 'Disponível para alocar em suas caixinhas'
                  : 'Nenhum valor pendente de alocação'}
              </span>
            </div>
          </div>

          {/* Botões de Ação Principal: Aplicar e Criar Caixinha */}
          <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-border/60">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                hapticFeedback.light()
                setModalAplicarAberto(true)
              }}
              className="gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold shadow-xs"
            >
              <ArrowUpRight className="size-4" />
              <span>Aplicar na carteira</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                hapticFeedback.light()
                setModalCriarAberto(true)
              }}
              className="gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold"
            >
              <PiggyBank className="size-4 text-sky-500" />
              <span>Criar caixinha</span>
            </Button>

            {saldoNaoAlocadoReais > 0 && dados.caixinhas.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  hapticFeedback.light()
                  setCaixinhaParaAlocar(dados.caixinhas[0])
                  setModalAlocarAberto(true)
                }}
                className="gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold text-primary border-primary/30 bg-primary/5 hover:bg-primary/10"
              >
                <ArrowDownLeft className="size-4" />
                <span>Distribuir não alocado</span>
              </Button>
            )}
          </div>
        </section>
      </ScrollReveal>

      {/* 2. Lista de Caixinhas de Investimento */}
      <section aria-labelledby="titulo-caixinhas" className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 id="titulo-caixinhas" className="text-foreground text-lg font-semibold tracking-tight">
              Caixinhas
            </h2>
            <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-lg font-medium">
              {dados.caixinhas.length}
            </Badge>
          </div>
          <span className="text-muted-foreground text-xs">
            Organização interna de rendimentos
          </span>
        </div>

        {dados.caixinhas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma caixinha criada ainda"
            descricao="Separe sua reserva de emergência, metas de viagem e investimentos em caixinhas com taxas estimadas para ver o patrimônio crescer mês a mês."
            acao={
              <Button
                type="button"
                size="toque"
                onClick={() => {
                  hapticFeedback.light()
                  setModalCriarAberto(true)
                }}
                className="gap-2 rounded-xl"
              >
                <PiggyBank className="size-4" />
                Criar primeira caixinha
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dados.caixinhas.map((caixinha, idx) => (
              <CardCaixinha
                key={caixinha.id}
                caixinha={caixinha}
                index={idx}
                selecionada={caixinha.id === caixinhaParaProjecaoId}
                aoAlocar={(cx) => {
                  setCaixinhaParaAlocar(cx)
                  setModalAlocarAberto(true)
                }}
                aoResgatar={(cx) => {
                  setCaixinhaParaResgatar(cx)
                  setModalResgatarAberto(true)
                }}
                aoVerProjecao={(cx) => {
                  setCaixinhaParaProjecaoId(cx.id)
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* 3. Card Invólucro do Gráfico de Projeção (Preparado para o componente do Dash) */}
      {dados.caixinhas.length > 0 && caixinhaProjecao && (
        <ScrollReveal replayOnScroll delay={100}>
          <Card className="rounded-2xl border-border/80 shadow-xs overflow-hidden">
            <CardHeader className="px-5 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <LineChart className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Projeção de Rendimento
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Simulação dos próximos 12 meses para {caixinhaProjecao.name}
                  </span>
                </div>
              </div>

              {/* Seletor rápido de caixinha para o gráfico */}
              {dados.caixinhas.length > 1 && (
                <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-xl border border-border/60 overflow-x-auto max-w-full">
                  {dados.caixinhas.map((cx) => (
                    <button
                      key={cx.id}
                      type="button"
                      onClick={() => {
                        hapticFeedback.selection()
                        setCaixinhaParaProjecaoId(cx.id)
                      }}
                      className={cn(
                        'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 whitespace-nowrap',
                        cx.id === caixinhaParaProjecaoId
                          ? 'bg-background text-foreground shadow-2xs border border-border/80'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {cx.name}
                    </button>
                  ))}
                </div>
              )}
            </CardHeader>

            <CardContent className="p-5 flex flex-col gap-4">
              {/* Resumo da Simulação */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="flex flex-col p-3 rounded-xl bg-muted/30 border border-border/60">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase">
                    Saldo atual
                  </span>
                  <span className="text-sm font-semibold text-foreground mt-0.5">
                    {formatBRL(caixinhaProjecao.balance_cents / 100)}
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-xl bg-muted/30 border border-border/60">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase">
                    Taxa simulada
                  </span>
                  <span className="text-sm font-semibold text-primary mt-0.5">
                    {formatarTaxaMensal(caixinhaProjecao.rate_bps)}
                  </span>
                </div>

                <div className="flex flex-col p-3 rounded-xl bg-muted/30 border border-border/60 col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-muted-foreground font-medium uppercase">
                    Projeção em 12 meses
                  </span>
                  <span className="text-sm font-semibold text-foreground mt-0.5">
                    {formatBRL(
                      (caixinhaProjecao.balance_cents / 100) *
                        Math.pow(1 + caixinhaProjecao.rate_bps / 10000, 12),
                    )}
                  </span>
                </div>
              </div>

              {/* Slot / Invólucro reservado para o componente `GraficoProjecaoCaixinha` do Dash */}
              <div
                id="container-grafico-projecao-caixinha"
                className="relative flex flex-col items-center justify-center min-h-[220px] rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center"
              >
                <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 mb-2">
                  <TrendingUp className="size-5" />
                </div>
                <h4 className="text-xs font-semibold text-foreground">
                  Gráfico de Linha da Caixinha
                </h4>
                <p className="text-[11px] text-muted-foreground max-w-sm mt-0.5">
                  Slot arquitetural pronto para plugar o componente <code>GraficoProjecaoCaixinha</code> do agente Dash assim que publicado.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
                    {caixinhaProjecao.name} · {caixinhaProjecao.rate_bps} bps
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </ScrollReveal>
      )}

      {/* 4. Modais Interativos */}
      <DialogoCriarCaixinha
        aberto={modalCriarAberto}
        onOpenChange={setModalCriarAberto}
        onSalvar={handleCriarCaixinha}
      />

      <DialogoAplicar
        aberto={modalAplicarAberto}
        onOpenChange={setModalAplicarAberto}
        contasOrigem={contasOrigem}
        caixinhas={dados.caixinhas}
        onAplicar={handleAplicar}
      />

      <DialogoAlocar
        aberto={modalAlocarAberto}
        onOpenChange={setModalAlocarAberto}
        saldoNaoAlocadoCents={dados.saldoNaoAlocadoCents}
        caixinhas={dados.caixinhas}
        caixinhaPreSelecionadaId={caixinhaParaAlocar?.id}
        onAlocar={handleAlocar}
      />

      <DialogoResgatar
        aberto={modalResgatarAberto}
        onOpenChange={setModalResgatarAberto}
        caixinha={caixinhaParaResgatar}
        contasDestino={contasOrigem}
        onResgatar={handleResgatar}
      />

      {/* 5. Feedback Toast Inline */}
      {mensagemFeedback && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3 shadow-lg text-xs font-medium text-foreground animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" />
          </div>
          <span>{mensagemFeedback}</span>
          <button
            type="button"
            onClick={() => setMensagemFeedback(null)}
            className="ml-2 text-muted-foreground hover:text-foreground"
            aria-label="Fechar aviso"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  )
}
