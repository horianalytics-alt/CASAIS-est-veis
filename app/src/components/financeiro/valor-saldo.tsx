import {
  ValorMonetario,
  type ValorMonetarioProps,
} from './valor-monetario'

/**
 * Saldo = valor que pode ser positivo OU negativo (conta, saldo do mês).
 *
 * `ValorMonetario` recebe valor sempre positivo e tira o sinal do `tipo`. Um
 * saldo é diferente: o sinal é do próprio número. Este wrapper traduz o sinal
 * do número para as duas regras do projeto, sem formatar nada por conta:
 *   - positivo ou zero -> `+ R$ …`   (C-2: sinal sempre explícito)
 *   - negativo         -> `(R$ …)` + ícone de alerta   (C-3: contábil)
 * Quem formata e pinta continua sendo o `ValorMonetario`.
 */
export interface ValorSaldoProps
  extends Omit<ValorMonetarioProps, 'tipo' | 'contabil' | 'pago'> {
  valor: number
}

export function ValorSaldo({ valor, ...resto }: ValorSaldoProps) {
  return (
    <ValorMonetario
      {...resto}
      valor={valor}
      tipo={valor < 0 ? undefined : 'receita'}
      contabil
    />
  )
}
