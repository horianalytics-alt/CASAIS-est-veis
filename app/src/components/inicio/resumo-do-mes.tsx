import { Card, CardContent } from '@/components/ui/card'
import { ValorMonetario } from '@/components/financeiro/valor-monetario'
import { ValorSaldo } from '@/components/financeiro/valor-saldo'
import { INICIO } from '@/features/transacoes/copy'

export interface ResumoDoMesProps {
  /** Receitas já recebidas no mês. */
  entrou: number
  /** Despesas já pagas no mês. */
  saiu: number
  /** Despesas ainda pendentes no mês. */
  aPagar: number
}

/**
 * Indicadores do mês: o saldo em destaque e as três parcelas em linhas.
 *
 * Linhas (rótulo à esquerda, valor à direita) em vez de quatro cartões lado a
 * lado: no celular, "+ R$ 12.345,67" em coluna estreita estoura. A linha
 * aguenta valor grande sem encolher a fonte.
 */
export function ResumoDoMes({ entrou, saiu, aPagar }: ResumoDoMesProps) {
  const saldo = Math.round((entrou - saiu) * 100) / 100

  return (
    <Card>
      <CardContent className="flex flex-col gap-[var(--esp-4)]">
        <div className="flex flex-col gap-[var(--esp-1)]">
          <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
            {INICIO.saldoDoMes}
          </p>
          <ValorSaldo valor={saldo} tamanho="heroi" className="justify-start" />
        </div>

        <dl className="divide-border flex flex-col divide-y">
          <LinhaDoResumo rotulo={INICIO.entrou} apoio={INICIO.apoioEntrou}>
            <ValorMonetario valor={entrou} tipo="receita" />
          </LinhaDoResumo>
          <LinhaDoResumo rotulo={INICIO.saiu} apoio={INICIO.apoioSaiu}>
            <ValorMonetario valor={saiu} tipo="despesa" />
          </LinhaDoResumo>
          <LinhaDoResumo rotulo={INICIO.aPagar} apoio={INICIO.apoioAPagar}>
            <ValorMonetario valor={aPagar} tipo="despesa" pago={false} />
          </LinhaDoResumo>
        </dl>
      </CardContent>
    </Card>
  )
}

function LinhaDoResumo({
  rotulo,
  apoio,
  children,
}: {
  rotulo: string
  apoio: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-[var(--esp-3)] py-[var(--esp-3)] first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <dt className="text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)] font-medium">
          {rotulo}
        </dt>
        <p className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
          {apoio}
        </p>
      </div>
      <dd className="shrink-0">{children}</dd>
    </div>
  )
}
