import { z } from 'zod'
import { isValidISODate } from '@/lib/format'
import { ehEndpointDePushAceito, LIMITE_ENDPOINT } from '@/lib/push/endpoints'

/**
 * Esquemas Zod de pagarFatura, registrarAcerto e da inscrição de push.
 *
 * Moram aqui, e não nos arquivos de action, porque um módulo 'use server' só
 * pode exportar funções async — e os testes precisam dos esquemas.
 *
 * Os textos de erro que também existem dentro das RPCs (pay_invoice,
 * settle_up) são IGUAIS aos delas, para a tela mostrar a mesma frase venha o
 * erro do Zod ou do banco.
 */

const uuid = z.string({ required_error: 'Escolha uma opção válida.' }).uuid('Escolha uma opção válida.')

/**
 * Obrigatória de propósito: com p_date nulo, pay_invoice/settle_up usam o
 * CURRENT_DATE do banco, que está em UTC — depois das 21h de Brasília o
 * pagamento cairia no dia seguinte (mesmo problema de src/lib/hoje.ts).
 */
const dataISO = z
  .string({ required_error: 'Informe a data.', invalid_type_error: 'Informe a data.' })
  .trim()
  .refine((valor) => isValidISODate(valor), 'Data inválida.')

const parteDaFatura = z
  .number({ required_error: 'Fatura inválida.', invalid_type_error: 'Fatura inválida.' })
  .int('Fatura inválida.')

export const esquemaPagarFatura = z
  .object({
    cartaoId: uuid,
    contaOrigemId: uuid,
    anoFatura: parteDaFatura.min(2000, 'Fatura inválida.').max(2100, 'Fatura inválida.'),
    mesFatura: parteDaFatura.min(1, 'Fatura inválida.').max(12, 'Fatura inválida.'),
    data: dataISO,
  })
  .refine((e) => e.cartaoId !== e.contaOrigemId, {
    message: 'Conta de origem inválida',
    path: ['contaOrigemId'],
  })

export type EntradaPagarFatura = z.input<typeof esquemaPagarFatura>

/**
 * Valor do acerto em reais. Só número: o diálogo manda o saldo que veio da
 * v_settlement (já `round(..., 2)` no banco).
 *
 * Mais de 2 casas é RECUSADO, não arredondado — arredondar float é
 * exatamente o achado P-009. A tolerância de 1e-6 só absorve o ruído binário
 * de um valor que TEM 2 casas (0.1 + 0.2 = 0.30000000000000004).
 */
const valorDoAcerto = z
  .number({ required_error: 'Informe o valor.', invalid_type_error: 'Valor inválido.' })
  .finite('Valor inválido.')
  .positive('O valor precisa ser maior que zero.')
  .max(99_999_999.99, 'Esse valor é alto demais.')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use no máximo 2 casas decimais.')
  .transform((n) => Math.round(n * 100) / 100)

export const esquemaRegistrarAcerto = z
  .object({
    deMembroId: uuid,
    paraMembroId: uuid,
    valor: valorDoAcerto,
    data: dataISO,
  })
  .refine((e) => e.deMembroId !== e.paraMembroId, {
    message: 'O acerto precisa ser entre duas pessoas diferentes',
    path: ['paraMembroId'],
  })

export type EntradaRegistrarAcerto = z.input<typeof esquemaRegistrarAcerto>

/** base64url sem padding (o que PushSubscription.toJSON() entrega), com tamanho em BYTES conferido. */
function chaveBase64Url(bytes: number, primeiroByte?: number) {
  return z
    .string({ required_error: 'Chave de notificação inválida.', invalid_type_error: 'Chave de notificação inválida.' })
    .trim()
    .refine((s) => {
      const semPad = s.replace(/=+$/, '')
      if (!/^[A-Za-z0-9_-]+$/.test(semPad)) return false
      if (Math.floor((semPad.length * 3) / 4) !== bytes) return false
      if (primeiroByte === undefined) return true
      // O 1º caractere base64 carrega os 6 bits altos do 1º byte.
      const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
      return alfabeto.indexOf(semPad[0]) === primeiroByte >> 2
    }, 'Chave de notificação inválida.')
}

export const esquemaInscricaoPush = z.object({
  endpoint: z
    .string({ required_error: 'Serviço de notificação não reconhecido.' })
    .trim()
    .max(LIMITE_ENDPOINT, 'Serviço de notificação não reconhecido.')
    .refine(ehEndpointDePushAceito, 'Serviço de notificação não reconhecido.'),
  keys: z.object(
    {
      // Ponto P-256 não comprimido: 65 bytes, o primeiro é 0x04.
      p256dh: chaveBase64Url(65, 0x04),
      // Segredo de autenticação: 16 bytes.
      auth: chaveBase64Url(16),
    },
    { required_error: 'Chave de notificação inválida.', invalid_type_error: 'Chave de notificação inválida.' },
  ),
  // Aceito e descartado: o navegador manda, o servidor não usa.
  expirationTime: z.number().nullish().transform(() => undefined),
})

export type EntradaInscricaoPush = z.input<typeof esquemaInscricaoPush>

export const esquemaRemoverInscricaoPush = z.object({
  endpoint: z
    .string({ required_error: 'Inscrição inválida.' })
    .trim()
    .min(1, 'Inscrição inválida.')
    .max(LIMITE_ENDPOINT, 'Inscrição inválida.'),
})
