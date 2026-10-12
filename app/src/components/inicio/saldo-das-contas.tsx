import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ValorSaldo } from '@/components/financeiro/valor-saldo'
import { INICIO, TIPOS_DE_CONTA } from '@/features/transacoes/copy'
import type { Database } from '@/types/database'

type SaldoConta = Database['public']['Views']['v_account_balances']['Row']

export interface SaldoDasContasProps {
  contas: SaldoConta[]
}

/**
 * Saldo real de cada conta (`current_balance` = saldo inicial + histórico
 * pago). Colunas de view vêm `| null`: o nulo vira fallback, sem `!`.
 */
export function SaldoDasContas({ contas }: SaldoDasContasProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
          {INICIO.tituloContas}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {contas.length === 0 ? (
          <p className="text-muted-foreground text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)]">
            {INICIO.semContas}
          </p>
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {contas.map((conta) => (
              <li
                key={conta.account_id}
                className="flex items-center justify-between gap-[var(--esp-3)] py-[var(--esp-3)] first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)] font-medium">
                    {conta.name ?? '—'}
                  </span>
                  <span className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
                    {TIPOS_DE_CONTA[conta.type ?? ''] ?? conta.type}
                  </span>
                </div>
                <ValorSaldo valor={conta.current_balance ?? 0} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
