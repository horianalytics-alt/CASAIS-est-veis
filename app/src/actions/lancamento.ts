'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isValidISODate } from '@/lib/format'
import { agendarNotificacao, resolverAutorDoPush } from '@/lib/push/notificar'
import {
  falha,
  falhaDeValidacao,
  sucesso,
  traduzErroDoBanco,
  type ResultadoAction,
} from './resultado'
import type { Database } from '@/types/database'

export type Lancamento = Database['public']['Tables']['transactions']['Row']

const uuid = z.string().uuid('Escolha uma opção válida.')

const dataISO = z
  .string({ required_error: 'Informe a data.' })
  .trim()
  .refine((valor) => isValidISODate(valor), 'Data inválida.')

/**
 * Valor em reais, sempre POSITIVO.
 *
 * O banco tem CHECK (amount > 0): o sinal vem do `tipo`, nunca do número. Uma
 * despesa de 50 é `{ tipo: 'despesa', valor: 50 }`, jamais `-50`.
 */
const valor = z
  // A mensagem do union é declarada: sem ela, `null`/`undefined`/objeto caem no
  // 'Invalid input' em inglês do Zod, que chegaria à tela do usuário.
  .union([z.string(), z.number()], {
    required_error: 'Informe o valor.',
    invalid_type_error: 'Valor inválido.',
  })
  .transform((entrada, ctx) => {
    let numero: number

    if (typeof entrada === 'number') {
      numero = entrada
    } else {
      const limpo = entrada.trim()
      if (limpo === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe o valor.' })
        return z.NEVER
      }
      const ultimaVirgula = limpo.lastIndexOf(',')
      const ultimoPonto = limpo.lastIndexOf('.')
      const semMoeda = limpo.replace(/[^\d.,-]/g, '')
      const normalizado =
        ultimaVirgula > ultimoPonto
          ? semMoeda.replace(/\./g, '').replace(',', '.')
          : semMoeda.replace(/,/g, '')
      numero = Number(normalizado)
      if (normalizado === '' || Number.isNaN(numero)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Valor inválido.' })
        return z.NEVER
      }
    }

    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Valor inválido.' })
      return z.NEVER
    }
    if (numero <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O valor precisa ser maior que zero.',
      })
      return z.NEVER
    }
    if (numero > 99_999_999.99) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Esse valor é alto demais.',
      })
      return z.NEVER
    }

    // numeric(14,2): mais de 2 casas seria arredondado pelo banco em silêncio.
    return Math.round(numero * 100) / 100
  })

/**
 * Nesta fatia só `receita` e `despesa`.
 *
 * `investimento` e `transferencia` existem no banco mas ficam fora de propósito:
 * transferência exige `to_account_id` e um par de regras próprias, que entram
 * com a tela de transferência.
 */
const tipoDeLancamento = z.enum(['receita', 'despesa', 'transferencia'], {
  required_error: 'Escolha se é entrada, saída ou transferência.',
  invalid_type_error: 'Escolha se é entrada, saída ou transferência.',
})

const esquemaItem = z
  .object({
    tipo: tipoDeLancamento,
    descricao: z
      .string({ required_error: 'Descreva o lançamento.' })
      .trim()
      .min(1, 'Descreva o lançamento.')
      .max(120, 'A descrição pode ter no máximo 120 caracteres.'),
    valor,
    data: dataISO,
    contaId: uuid,
    contaDestinoId: uuid.nullish(),
    parcelas: z.coerce
      .number()
      .int('Número de parcelas precisa ser inteiro.')
      .min(1, 'Mínimo de 1 parcela.')
      .max(120, 'Máximo de 120 parcelas.')
      .default(1)
      .nullish(),
    categoriaId: uuid.nullish(),
    formaDePagamentoId: uuid.nullish(),
    responsavelId: uuid.nullish(),
    cotaDoResponsavel: z
      .number()
      .min(0, 'A cota vai de 0 a 1.')
      .max(1, 'A cota vai de 0 a 1.')
      .nullish(),
    pagoPorId: uuid.nullish(),
    estaPago: z.boolean().default(false),
    dataDoPagamento: dataISO.nullish(),
    observacao: z.string().trim().max(500, 'Observação longa demais.').nullish(),
    ehBeneficio: z.boolean().default(false),
    ehFutil: z.boolean().default(false),
    rotuloDoFutil: z.string().trim().max(60).nullish(),
  })
  // CHECK tx_pago_tem_data: pago exige data; não pago exige data nula. Validado
  // aqui para o usuário ler "informe a data do pagamento" em vez de um erro de
  // constraint do Postgres.
  .refine((item) => !item.estaPago || item.dataDoPagamento != null, {
    message: 'Informe a data do pagamento.',
    path: ['dataDoPagamento'],
  })
  .refine((item) => item.estaPago || item.dataDoPagamento == null, {
    message: 'Só preencha a data do pagamento se já estiver pago.',
    path: ['dataDoPagamento'],
  })
  // CHECK tx_cota_exige_responsavel.
  .refine(
    (item) => item.cotaDoResponsavel == null || item.responsavelId != null,
    {
      message: 'Escolha de quem é a cota.',
      path: ['responsavelId'],
    },
  )
  // CHECK tx_transferencia_tem_destino: transferência exige conta diferente.
  .refine(
    (item) =>
      item.tipo !== 'transferencia' ||
      (item.contaDestinoId != null && item.contaDestinoId !== item.contaId),
    {
      message: 'Escolha uma conta de destino diferente da conta de origem.',
      path: ['contaDestinoId'],
    },
  )
  // CHECK tx_transferencia_sem_rateio: transferência não admite rateio.
  .refine(
    (item) =>
      item.tipo !== 'transferencia' ||
      (item.responsavelId == null && item.cotaDoResponsavel == null),
    {
      message: 'Transferência não aceita divisão entre membros.',
      path: ['responsavelId'],
    },
  )

const esquemaSalvar = z
  .array(esquemaItem)
  .min(1, 'Nenhum lançamento para salvar.')
  // A RPC aceita lote; a tela desta fatia manda um. O teto evita um payload
  // que faria a função rodar por minutos dentro de uma transação só.
  .max(50, 'Muitos lançamentos de uma vez. Separe em partes.')

export type EntradaDeLancamento = z.input<typeof esquemaItem>

/**
 * Grava um ou mais lançamentos pela RPC `save_transactions`.
 *
 * A assinatura já aceita LISTA porque é assim que a RPC funciona: a tela de
 * hoje manda um item, e a de lote futura não muda este contrato.
 *
 * `created_by_member_id` NÃO vem do cliente: a própria RPC resolve pelo
 * `auth.uid()`, e o RLS confere. Mandar do cliente seria permitir lançar no
 * nome de outra pessoa.
 */
export async function salvarLancamento(
  input: EntradaDeLancamento | EntradaDeLancamento[],
): Promise<ResultadoAction<Lancamento[]>> {
  const lista = Array.isArray(input) ? input : [input]
  const analise = esquemaSalvar.safeParse(lista)

  if (!analise.success) {
    // Num lote, o fieldErrors do array vem indexado; para um item só a Fachada
    // espera o nome do campo puro, então achatamos o caminho.
    const campos: Record<string, string[]> = {}
    for (const issue of analise.error.issues) {
      const nome = issue.path.filter((p) => typeof p === 'string').join('.')
      const chave = nome === '' ? 'formulario' : nome
      campos[chave] = [...(campos[chave] ?? []), issue.message]
    }
    return falha('Confira os campos destacados.', campos)
  }

  const supabase = await createClient()

  const { data: usuario, error: erroDeUsuario } = await supabase.auth.getUser()
  if (erroDeUsuario || !usuario.user) {
    return falha('Sua sessão expirou. Entre de novo.')
  }

  const itens = analise.data.map((item) => ({
    type: item.tipo,
    description: item.descricao,
    amount: item.valor,
    date: item.data,
    account_id: item.contaId,
    to_account_id: item.tipo === 'transferencia' ? item.contaDestinoId ?? null : null,
    category_id: item.tipo === 'transferencia' ? null : (item.categoriaId ?? null),
    payment_method_id: item.formaDePagamentoId ?? null,
    owner_member_id: item.tipo === 'transferencia' ? null : (item.responsavelId ?? null),
    owner_share: item.tipo === 'transferencia' ? null : (item.cotaDoResponsavel ?? null),
    paid_by_member_id: item.pagoPorId ?? null,
    is_paid: item.estaPago,
    paid_date: item.dataDoPagamento ?? null,
    notes: item.observacao ?? null,
    is_benefit: item.ehBeneficio,
    is_futile: item.ehFutil,
    futile_label: item.ehFutil ? (item.rotuloDoFutil ?? null) : null,
    recurrence_months: item.parcelas ?? 1,
  }))

  // Quem lançou, pela sessão, em paralelo com a gravação (não atrasa a
  // resposta). Nunca rejeita: sem autor, só não há push.
  const autor = resolverAutorDoPush(supabase, usuario.user.id)

  const { data, error } = await supabase.rpc('save_transactions', {
    p_items: itens,
  })

  if (error) return falha(traduzErroDoBanco(error))

  revalidatePath('/inicio')
  revalidatePath('/lancar')
  revalidatePath('/carteira')
  revalidatePath('/acerto')

  // Push para o parceiro DEPOIS da resposta (after). Uma notificação por
  // chamada, contando os itens do lote — não as parcelas.
  agendarNotificacao(await autor, 'lancamento', analise.data.length)

  return sucesso(data ?? [])
}

const esquemaExcluir = z.object({
  id: z.string().uuid('Lançamento inválido.'),
  escopo: z.enum(['single', 'series']).default('single'),
})

/**
 * Exclui um lançamento (`single`) ou a série de parcelas inteira (`series`).
 *
 * A RPC filtra por `family_id` do próprio chamador: um id de outra casa cai em
 * 'Lançamento não encontrado', sem revelar que a linha existe.
 */
export async function excluirLancamento(
  id: string,
  escopo: 'single' | 'series' = 'single',
): Promise<ResultadoAction<{ excluidos: number }>> {
  const analise = esquemaExcluir.safeParse({ id, escopo })

  if (!analise.success) return falhaDeValidacao(analise.error)

  const supabase = await createClient()

  const { data: usuario, error: erroDeUsuario } = await supabase.auth.getUser()
  if (erroDeUsuario || !usuario.user) {
    return falha('Sua sessão expirou. Entre de novo.')
  }

  const { data, error } = await supabase.rpc('delete_transactions', {
    p_id: analise.data.id,
    p_scope: analise.data.escopo,
  })

  if (error) return falha(traduzErroDoBanco(error))

  revalidatePath('/inicio')
  revalidatePath('/lancar')

  return sucesso({ excluidos: data ?? 0 })
}
