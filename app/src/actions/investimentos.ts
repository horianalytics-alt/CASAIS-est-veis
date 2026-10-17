'use server'

import { revalidatePath } from 'next/cache'
import {
  MENSAGENS_INVESTIMENTOS as M,
  esquemaAlocar,
  esquemaAplicar,
  esquemaAtualizarTaxa,
  esquemaConfirmarRendimento,
  esquemaCriarCaixinha,
  esquemaResgatar,
  type EntradaAlocar,
  type EntradaAplicar,
  type EntradaAtualizarTaxa,
  type EntradaConfirmarRendimento,
  type EntradaCriarCaixinha,
  type EntradaResgatar,
} from '@/lib/esquemas-investimentos'
import { obterContextoDaFamilia, type ClienteServidor } from './contexto-familia'
import { falha, falhaDeValidacao, sucesso, traduzErroDoBanco, type ResultadoAction } from './resultado'

/*
 * Carteira de investimento: as 6 Server Actions. Plano:
 * docs/planos/estrutura-carteira-investimento.md. Migrations: 00016 e 00017.
 *
 * Ordem em todas: Zod (só o valor PARSEADO segue) -> sessão e família
 * (getUser, get_user_family_id_self) -> autorização do RECURSO pela sessão,
 * com RLS e filtro explícito por family_id -> RPC, que refaz tudo por dentro,
 * sob o lock da família.
 *
 * O saldo NÃO é conferido aqui: ler e decidir no JS seria exatamente o L-014.
 * Quem decide saldo é a RPC, sob lock, com UPDATE condicional.
 */

const FALHA_GENERICA = 'Não foi possível concluir. Tente de novo em instantes.'

/**
 * Frases que as RPCs da carteira (00016/00017) levantam de propósito, prontas para o usuário,
 * com o campo do formulário ao qual cada uma pertence. Comparadas por prefixo
 * porque duas trazem valor interpolado no fim (data, mês).
 *
 * Moram aqui, e não em MENSAGENS_DE_NEGOCIO de resultado.ts, porque este ciclo
 * só podia tocar os arquivos da carteira (ver o relatório). O efeito é o mesmo
 * para estas Actions.
 */
const FRASES_DA_CARTEIRA: ReadonlyArray<readonly [string, string | null]> = [
  [M.valorZero, 'valor'],
  [M.valorAlto, 'valor'],
  [M.origemInvalida, 'contaOrigemId'],
  [M.destinoContaInvalida, 'destino'],
  [M.caixinhaInvalida, 'caixinhaId'],
  ['Saldo insuficiente na conta de origem', 'valor'],
  ['Saldo não alocado insuficiente', 'valor'],
  ['Saldo insuficiente na caixinha', 'valor'],
  ['Esta caixinha só pode ser resgatada a partir de', null],
  [M.nomeVazio, 'nome'],
  [M.nomeLongo, 'nome'],
  [M.tipoInvalido, 'tipoRendimento'],
  [M.taxaFaixa, 'taxaMensalBps'],
  [M.resgateImediato, 'resgateImediato'],
  [M.vencimentoFalta, 'dataVencimento'],
  [M.vencimentoInvalido, 'dataVencimento'],
  [M.competenciaInvalida, 'competencia'],
  ['Ainda não é possível confirmar o rendimento deste mês', 'competencia'],
  ['O rendimento deste mês já foi confirmado', 'competencia'],
  ['Confirme antes o rendimento de', 'competencia'],
  ['Este mês já ficou para trás', 'competencia'],
  ['Não há rendimento a confirmar neste mês', 'competencia'],
]

/** 23505 do índice que impede confirmar o mesmo mês duas vezes. */
const INDICE_RENDIMENTO_UNICO = 'investment_box_movements_rendimento_unico'

function falhaDoBanco(erro: { message?: string; code?: string } | null): ResultadoAction<never> {
  const mensagem = typeof erro?.message === 'string' ? erro.message : ''
  for (const [frase, campo] of FRASES_DA_CARTEIRA) {
    if (mensagem.startsWith(frase)) return campo ? falha(mensagem, { [campo]: [mensagem] }) : falha(mensagem)
  }
  if (erro?.code === '23505' && mensagem.includes(INDICE_RENDIMENTO_UNICO)) {
    const ja = 'O rendimento deste mês já foi confirmado'
    return falha(ja, { competencia: [ja] })
  }
  return falha(traduzErroDoBanco(erro))
}

function revalidar() {
  // /analises: o rendimento confirmado entra no patrimônio.
  for (const rota of ['/carteira', '/inicio', '/analises']) revalidatePath(rota)
}

/** A caixinha é desta família? Lido pela sessão: RLS + filtro explícito. */
async function caixinhaDaFamilia(
  supabase: ClienteServidor,
  familyId: string,
  caixinhaId: string,
): Promise<ResultadoAction<never> | null> {
  const { data, error } = await supabase
    .from('investment_boxes')
    .select('id')
    .eq('id', caixinhaId)
    .eq('family_id', familyId)
    .maybeSingle()
  if (error) return falha(traduzErroDoBanco(error))
  return data ? null : falha(M.caixinhaInvalida, { caixinhaId: [M.caixinhaInvalida] })
}

/** Conta corrente ativa desta família (as únicas que podem ser origem ou destino: Q3). */
async function contaCorrenteDaFamilia(
  supabase: ClienteServidor,
  familyId: string,
  contaId: string,
  mensagem: string,
  campo: string,
): Promise<ResultadoAction<never> | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id,type,archived_at')
    .eq('id', contaId)
    .eq('family_id', familyId)
    .maybeSingle()
  if (error) return falha(traduzErroDoBanco(error))
  return data && data.type === 'corrente' && data.archived_at === null ? null : falha(mensagem, { [campo]: [mensagem] })
}

export async function aplicarNaCarteira(
  input: EntradaAplicar,
): Promise<ResultadoAction<{ lancamentoId: string; movimentoId: string | null }>> {
  const analise = esquemaAplicar.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { contaOrigemId, valorCentavos, caixinhaId } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId } = contexto.ctx

  // As duas conferências em paralelo; a recusa da origem tem precedência.
  const [recusaOrigem, recusaCaixinha] = await Promise.all([
    contaCorrenteDaFamilia(supabase, familyId, contaOrigemId, M.origemInvalida, 'contaOrigemId'),
    caixinhaId ? caixinhaDaFamilia(supabase, familyId, caixinhaId) : Promise.resolve(null),
  ])
  if (recusaOrigem) return recusaOrigem
  if (recusaCaixinha) return recusaCaixinha

  const { data, error } = await supabase.rpc('carteira_aplicar', {
    p_conta_origem_id: contaOrigemId,
    p_valor_cents: valorCentavos,
    ...(caixinhaId ? { p_caixinha_id: caixinhaId } : {}),
  })
  if (error) return falhaDoBanco(error)
  const linha = data?.[0]
  if (!linha?.lancamento_id) return falha(FALHA_GENERICA)

  revalidar()
  // O tipo gerado diz string, mas sem caixinha a RPC devolve movimento_id NULL.
  return sucesso({ lancamentoId: linha.lancamento_id, movimentoId: linha.movimento_id ?? null })
}

export async function criarCaixinha(input: EntradaCriarCaixinha): Promise<ResultadoAction<{ id: string }>> {
  const analise = esquemaCriarCaixinha.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const caixinha = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase } = contexto.ctx

  // Sem recurso a autorizar: a família vem da sessão, dentro da RPC.
  const { data, error } = await supabase.rpc('carteira_criar_caixinha', {
    p_nome: caixinha.nome,
    p_tipo: caixinha.tipoRendimento,
    p_taxa_bps: caixinha.taxaMensalBps,
    p_resgate_imediato: caixinha.resgateImediato,
    ...(caixinha.dataVencimento ? { p_data_vencimento: caixinha.dataVencimento } : {}),
  })
  if (error) return falhaDoBanco(error)
  if (!data) return falha(FALHA_GENERICA)

  revalidar()
  return sucesso({ id: data })
}

export async function alocarParaCaixinha(input: EntradaAlocar): Promise<ResultadoAction<void>> {
  const analise = esquemaAlocar.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { caixinhaId, valorCentavos } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId } = contexto.ctx

  const recusa = await caixinhaDaFamilia(supabase, familyId, caixinhaId)
  if (recusa) return recusa

  const { error } = await supabase.rpc('carteira_alocar', { p_caixinha_id: caixinhaId, p_valor_cents: valorCentavos })
  if (error) return falhaDoBanco(error)

  revalidar()
  return sucesso()
}

export async function resgatarDaCaixinha(input: EntradaResgatar): Promise<ResultadoAction<void>> {
  const analise = esquemaResgatar.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { caixinhaId, valorCentavos, contaDestinoId } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId } = contexto.ctx

  // As duas conferências em paralelo; a recusa da caixinha tem precedência.
  const [recusa, recusaDestino] = await Promise.all([
    caixinhaDaFamilia(supabase, familyId, caixinhaId),
    contaDestinoId
      ? contaCorrenteDaFamilia(supabase, familyId, contaDestinoId, M.destinoContaInvalida, 'destino')
      : Promise.resolve(null),
  ])
  if (recusa) return recusa
  if (recusaDestino) return recusaDestino

  // A trava de vencimento e o saldo são decididos na RPC (o "hoje" é o de
  // São Paulo, calculado no banco).
  const { error } = await supabase.rpc('carteira_resgatar', {
    p_caixinha_id: caixinhaId,
    p_valor_cents: valorCentavos,
    ...(contaDestinoId ? { p_conta_destino_id: contaDestinoId } : {}),
  })
  if (error) return falhaDoBanco(error)

  revalidar()
  return sucesso()
}

export async function atualizarTaxaCaixinha(input: EntradaAtualizarTaxa): Promise<ResultadoAction<void>> {
  const analise = esquemaAtualizarTaxa.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { caixinhaId, taxaMensalBps } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId } = contexto.ctx

  const recusa = await caixinhaDaFamilia(supabase, familyId, caixinhaId)
  if (recusa) return recusa

  const { error } = await supabase.rpc('carteira_atualizar_taxa', { p_caixinha_id: caixinhaId, p_taxa_bps: taxaMensalBps })
  if (error) return falhaDoBanco(error)

  revalidar()
  return sucesso()
}

/**
 * Confirma o rendimento estimado de UM mês de UMA caixinha. Só então o valor
 * vira saldo resgatável e entra no patrimônio (spec, decisão 4b). O valor é
 * calculado na RPC, nunca vem do cliente. Os meses são confirmados em ordem:
 * com um mês anterior pendente, a RPC recusa e diz qual.
 */
export async function confirmarRendimentoMensal(
  input: EntradaConfirmarRendimento,
): Promise<ResultadoAction<{ valorCentavos: number; lancamentoId: string; movimentoId: string }>> {
  const analise = esquemaConfirmarRendimento.safeParse(input)
  if (!analise.success) return falhaDeValidacao(analise.error)
  const { caixinhaId, competencia } = analise.data

  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return contexto.resultado
  const { supabase, familyId } = contexto.ctx

  const recusa = await caixinhaDaFamilia(supabase, familyId, caixinhaId)
  if (recusa) return recusa

  const { data, error } = await supabase.rpc('carteira_confirmar_rendimento', {
    p_caixinha_id: caixinhaId,
    p_competencia: competencia,
  })
  if (error) return falhaDoBanco(error)
  const linha = data?.[0]
  if (!linha?.movimento_id || !linha.lancamento_id) return falha(FALHA_GENERICA)

  revalidar()
  return sucesso({ valorCentavos: linha.valor_cents, lancamentoId: linha.lancamento_id, movimentoId: linha.movimento_id })
}
