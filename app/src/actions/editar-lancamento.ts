'use server'

import { revalidatePath } from 'next/cache'
import {
  COLUNAS_LINHA_EDITAVEL,
  MENSAGENS_EDICAO as M,
  esquemaAtualizarEmMassa,
  esquemaAtualizarLancamento,
  montarPatchIndividual,
  planejarEdicaoEmMassa,
  type EntradaAtualizarEmMassa,
  type EntradaAtualizarLancamento,
} from '@/lib/esquemas-edicao-lancamento'
import { hojeEmSaoPaulo } from '@/lib/hoje'
import { agendarNotificacao, resolverAutorDoPush, type AutorDoPush } from '@/lib/push/notificar'
import { obterContextoDaFamilia, type ClienteServidor } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

export type { EntradaAtualizarEmMassa, EntradaAtualizarLancamento }

/*
 * Edição de lançamento — substitui o `supabase.from('transactions').update()`
 * que os diálogos faziam direto do navegador.
 * Plano: docs/planos/estrutura-editar-lancamento.md.
 *
 * Toda action, nesta ordem:
 *   1. Zod; daqui em diante só o valor parseado;
 *   2. usuário (getUser) e família resolvidos no servidor;
 *   3. autorização do RECURSO com filtro explícito por family_id: o(s)
 *      lançamento(s), a conta, a conta de destino, a categoria e o membro;
 *      id de outra família = "não encontrado", sem revelar que existe;
 *   4. regras de negócio sobre a linha como ela está no banco (fatura do
 *      cartão, transferência, acerto) — src/lib/esquemas-edicao-lancamento.ts;
 *   5. UPDATE ainda filtrado por family_id. O RLS transactions_update (00006,
 *      USING + WITH CHECK por família) é a segunda camada, não a única.
 */

function revalidar() {
  for (const rota of ['/inicio', '/lancar', '/carteira', '/acerto', '/analises']) revalidatePath(rota)
}

/** Autor de outra família que a do contexto (nunca deveria ocorrer): sem push. */
function autorDaFamilia(autor: AutorDoPush | null, familyId: string): AutorDoPush | null {
  return autor?.familyId === familyId ? autor : null
}

type Pertence = { ok: true; closing_day: number | null } | { ok: false; erro?: string }

async function contaDaFamilia(supabase: ClienteServidor, familyId: string, id: string): Promise<Pertence> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, closing_day')
    .eq('id', id)
    .eq('family_id', familyId)
    .maybeSingle()
  if (error) return { ok: false, erro: traduzErroDoBanco(error) }
  return data ? { ok: true, closing_day: data.closing_day } : { ok: false }
}

async function existeNaFamilia(
  supabase: ClienteServidor,
  tabela: 'categories' | 'family_members',
  familyId: string,
  id: string,
): Promise<{ ok: boolean; erro?: string }> {
  const { data, error } = await supabase.from(tabela).select('id').eq('id', id).eq('family_id', familyId).maybeSingle()
  if (error) return { ok: false, erro: traduzErroDoBanco(error) }
  return { ok: Boolean(data) }
}

const recusa = (mensagem: string, campo: string) => falha(mensagem, { [campo]: [mensagem] })

/**
 * Atualiza UM lançamento. Só as colunas da assinatura mudam (mais as que um
 * CHECK obriga a acompanhar: destino e rateio de transferência; fatura quando
 * a conta ou a data mudam). Uma parcela de série é editada sozinha.
 *
 * ehBeneficio / ehFutil / rotuloDoFutil: omitidos = mantém o que a linha tem;
 * tipo final diferente de despesa zera os 3; rótulo exige ehFutil=true no
 * mesmo pedido (erro em camposComErro.rotuloDoFutil).
 */
export async function atualizarLancamento(input: EntradaAtualizarLancamento): Promise<ResultadoAction<void>> {
  const analise = esquemaAtualizarLancamento.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const e = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId, userId } = contexto.ctx

  const ehTransferencia = e.tipo === 'transferencia'
  const naoChecado = Promise.resolve({ ok: true as const, closing_day: null })
  const [linha, conta, destino, categoria, membro, autor] = await Promise.all([
    supabase.from('transactions').select(COLUNAS_LINHA_EDITAVEL).eq('id', e.id).eq('family_id', familyId).maybeSingle(),
    contaDaFamilia(supabase, familyId, e.contaId),
    ehTransferencia && e.contaDestinoId ? contaDaFamilia(supabase, familyId, e.contaDestinoId) : naoChecado,
    // Categoria de transferência é descartada: não precisa existir.
    !ehTransferencia && e.categoriaId ? existeNaFamilia(supabase, 'categories', familyId, e.categoriaId) : naoChecado,
    existeNaFamilia(supabase, 'family_members', familyId, e.pagoPorId),
    resolverAutorDoPush(supabase, userId),
  ])

  if (linha.error) return falha(traduzErroDoBanco(linha.error))
  if (!linha.data) return falha(M.NAO_ENCONTRADO)
  for (const r of [conta, destino, categoria, membro]) if (!r.ok && r.erro) return falha(r.erro)
  if (!conta.ok) return recusa(M.CONTA, 'contaId')
  if (!destino.ok) return recusa(M.CONTA_DESTINO, 'contaDestinoId')
  if (!categoria.ok) return recusa(M.CATEGORIA, 'categoriaId')
  if (!membro.ok) return recusa(M.MEMBRO, 'pagoPorId')

  const plano = montarPatchIndividual(linha.data, e, { closing_day: conta.closing_day })
  if (!plano.ok) return recusa(plano.erro, plano.campo)

  const { data, error } = await supabase
    .from('transactions')
    .update(plano.patch)
    .eq('id', e.id)
    .eq('family_id', familyId)
    .select('id')
  if (error) return falha(traduzErroDoBanco(error))
  // Apagada entre a leitura e o UPDATE.
  if ((data ?? []).length === 0) return falha(M.NAO_ENCONTRADO)

  revalidar()
  agendarNotificacao(autorDaFamilia(autor, familyId), 'edicao', 1)
  return sucesso()
}

/**
 * Aplica o MESMO conjunto de campos a vários lançamentos (até 50).
 *
 * Tudo ou nada nas recusas: se um id não é da família, ou se alguma linha não
 * pode receber a mudança (acerto; transferência com categoria; conta igual ao
 * destino da transferência), nada é gravado.
 *
 * Gravação: um UPDATE por grupo de linhas com o mesmo patch final (fatura do
 * cartão e data de pagamento variam por linha). No caso comum é um UPDATE só.
 * Com mais de um, uma falha no meio deixa o lote aplicado em parte — cada
 * linha continua válida e repetir a chamada converge (plano, seção 4).
 */
export async function atualizarLancamentosEmMassa(
  input: EntradaAtualizarEmMassa,
): Promise<ResultadoAction<{ atualizados: number }>> {
  const analise = esquemaAtualizarEmMassa.safeParse(input)
  if (!analise.success) {
    // O diálogo de lote não tem campo para destacar: a 1ª mensagem vai no erro.
    return falhaDeValidacao(analise.error, analise.error.issues[0]?.message)
  }
  const e = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId, userId } = contexto.ctx

  const naoChecado = Promise.resolve({ ok: true as const, closing_day: null })
  const [linhas, conta, categoria, membro, autor] = await Promise.all([
    supabase.from('transactions').select(COLUNAS_LINHA_EDITAVEL).eq('family_id', familyId).in('id', e.ids),
    e.contaId ? contaDaFamilia(supabase, familyId, e.contaId) : naoChecado,
    e.categoriaId ? existeNaFamilia(supabase, 'categories', familyId, e.categoriaId) : naoChecado,
    e.pagoPorId ? existeNaFamilia(supabase, 'family_members', familyId, e.pagoPorId) : naoChecado,
    resolverAutorDoPush(supabase, userId),
  ])

  if (linhas.error) return falha(traduzErroDoBanco(linhas.error))
  // Todos os ids precisam ser desta família — não basta o .in() filtrar.
  if (linhas.data.length !== e.ids.length) return falha(M.NAO_ENCONTRADO)
  for (const r of [conta, categoria, membro]) if (!r.ok && r.erro) return falha(r.erro)
  if (!conta.ok) return recusa(M.CONTA, 'contaId')
  if (!categoria.ok) return recusa(M.CATEGORIA, 'categoriaId')
  if (!membro.ok) return recusa(M.MEMBRO, 'pagoPorId')

  const plano = planejarEdicaoEmMassa(
    linhas.data,
    e,
    e.contaId ? { id: e.contaId, closing_day: conta.closing_day } : null,
    hojeEmSaoPaulo(),
  )
  if (!plano.ok) return recusa(plano.erro, plano.campo)

  let atualizados = 0
  for (const [k, grupo] of plano.grupos.entries()) {
    const { data, error } = await supabase
      .from('transactions')
      .update(grupo.patch)
      .eq('family_id', familyId)
      .in('id', grupo.ids)
      .select('id')
    if (error) {
      if (k === 0) return falha(traduzErroDoBanco(error))
      revalidar()
      return falha(M.PARCIAL)
    }
    atualizados += (data ?? []).length
  }

  revalidar()
  if (atualizados > 0) agendarNotificacao(autorDaFamilia(autor, familyId), 'edicao', atualizados)
  return sucesso({ atualizados })
}
