import 'server-only'

import { connection } from 'next/server'
import { carregarCobrancasPendentes } from '@/actions/recorrencia'
import { obterContextoDaFamilia } from '@/actions/contexto-familia'
import { PopUpCobranca } from './popup-cobranca'

export async function PopUpCobrancaServer() {
  await connection()
  const contexto = await obterContextoDaFamilia()
  if (!contexto.ok) return null

  const res = await carregarCobrancasPendentes()
  const cobrancas = res.ok ? res.dados : []

  return <PopUpCobranca cobrancasIniciais={cobrancas} familyId={contexto.ctx.familyId} />
}
