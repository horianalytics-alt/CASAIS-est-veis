import * as React from 'react'
import {
  CreditCard,
  Landmark,
  PiggyBank,
  Sparkles,
  UtensilsCrossed,
  Calendar,
} from 'lucide-react'
import type { Database } from '@/types/database'
import { ValorSaldo } from '@/components/financeiro/valor-saldo'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { CARTEIRA } from '@/features/carteira/copy'
import { TIPOS_DE_CONTA } from '@/features/transacoes/copy'
import { BotaoArquivarConta } from './botao-arquivar-conta'
import {
  DialogoPagarFatura,
  type ContaOrigem,
} from './dialogo-pagar-fatura'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SaldoConta = Database['public']['Views']['v_account_balances']['Row']
type Fatura = Database['public']['Views']['v_invoices']['Row']

export interface CartaoContaProps {
  conta: SaldoConta
  faturaAberta?: Fatura | null
  contasOrigem?: ContaOrigem[]
  className?: string
}

function iconeDoTipo(tipo: string | null) {
  switch (tipo) {
    case 'cartao':
      return CreditCard
    case 'investimento':
      return PiggyBank
    case 'beneficio':
      return UtensilsCrossed
    default:
      return Landmark
  }
}

export function CartaoConta({
  conta,
  faturaAberta,
  contasOrigem = [],
  className,
}: CartaoContaProps) {
  const Icone = iconeDoTipo(conta.type)
  const saldoAtual = conta.current_balance ?? 0
  const pendenteEntrada = conta.pending_inflow ?? 0
  const pendenteSaida = conta.pending_outflow ?? 0
  const saldoPrevisto = saldoAtual + pendenteEntrada - pendenteSaida
  const temPendencias = pendenteEntrada > 0 || pendenteSaida > 0
  const ehCartao = conta.type === 'cartao'
  const arquivada = Boolean(conta.archived_at)

  return (
    <article
      aria-label={`Conta ${conta.name ?? ''}`}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 transition-all duration-200',
        'shadow-cartao border border-border/80 dark:border-white/10',
        'bg-linear-to-br from-card via-card to-muted/40',
        arquivada && 'opacity-65',
        className,
      )}
    >
      {/* Topo do Cartão: Tipo da Conta, Ícone e Ações */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-muted text-foreground flex size-9 items-center justify-center rounded-lg border border-border/60">
            <Icone className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <span className="text-muted-foreground block text-xs font-medium">
              {TIPOS_DE_CONTA[conta.type ?? ''] ?? conta.type ?? 'Conta'}
            </span>
            <h3
              title={conta.name ?? 'Conta'}
              className="text-foreground max-w-[180px] truncate text-base font-semibold sm:max-w-[220px]"
            >
              {conta.name ?? 'Conta'}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {conta.account_id && (
            <BotaoArquivarConta
              contaId={conta.account_id}
              estaArquivada={arquivada}
            />
          )}
        </div>
      </div>

      {/* Saldo Principal */}
      <div className="my-5 flex flex-col">
        <span className="text-muted-foreground text-xs font-medium">
          {ehCartao ? 'Total da fatura atual' : CARTEIRA.saldoAtual}
        </span>
        <div className="mt-1">
          <ValorSaldo valor={saldoAtual} tamanho="heroi" />
        </div>

        {/* Linha de Saldo Previsto se houver pendências */}
        {temPendencias && !ehCartao && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted-foreground">
              {CARTEIRA.saldoPrevisto}:
            </span>
            <ValorSaldo valor={saldoPrevisto} tamanho="linha" />
            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              {pendenteEntrada > 0 && (
                <span>
                  + <ValorMonetario valor={pendenteEntrada} tipo="receita" pago={false} />
                </span>
              )}
              {pendenteSaida > 0 && (
                <span>
                  − <ValorMonetario valor={pendenteSaida} tipo="despesa" pago={false} />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rodapé do Cartão */}
      <div className="border-border/60 mt-auto flex flex-col gap-2 border-t pt-3">
        {ehCartao ? (
          <div className="flex flex-col gap-2">
            {conta.closing_day && conta.due_day && (
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {CARTEIRA.fechamentoEVencimento(conta.closing_day, conta.due_day)}
                </span>
              </div>
            )}

            {faturaAberta && faturaAberta.open_amount && faturaAberta.open_amount > 0 ? (
              <div className="bg-muted/60 mt-1 flex items-center justify-between gap-2 rounded-lg p-2.5">
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-[11px]">
                    Em aberto
                  </span>
                  <ValorMonetario
                    valor={faturaAberta.open_amount}
                    tipo="despesa"
                    tamanho="linha"
                  />
                </div>
                <DialogoPagarFatura
                  fatura={{
                    account_id: conta.account_id!,
                    account_name: conta.name,
                    invoice_year: faturaAberta.invoice_year ?? new Date().getFullYear(),
                    invoice_month: faturaAberta.invoice_month ?? new Date().getMonth() + 1,
                    open_amount: faturaAberta.open_amount,
                  }}
                  contasOrigem={contasOrigem}
                  gatilho={
                    <Button variant="default" size="toque" className="h-9 px-3 text-xs">
                      {CARTEIRA.pagarFatura}
                    </Button>
                  }
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span className="flex items-center gap-1">
              <Sparkles className="size-3" aria-hidden="true" />
              {arquivada ? 'Conta arquivada' : 'Ativa para lançamentos'}
            </span>
          </div>
        )}
      </div>
    </article>
  )
}
