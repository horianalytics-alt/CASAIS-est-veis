// Limpeza dos testes de integração que rodam contra o banco HOSPEDADO.
//
// Regra: contar o que DE FATO saiu e devolver cada falha. A versão antiga
// fazia `deleteUser(uid).catch(() => {})` e imprimia quantos usuários TENTOU
// apagar — o relatório dizia "22 removidos" enquanto eles ficavam no banco
// do cliente.
//
// Ordem obrigatória: lançamentos -> famílias -> usuários.
//   - transactions.created_by_member_id é ON DELETE RESTRICT: com lançamento
//     vivo, nem a família nem o usuário saem.
//   - a família sai e leva membros, contas, categorias, formas e orçamentos.
//   - por fim o usuário, já sem linha de membro. "not found" conta como
//     removido (o próprio teste pode ter apagado o usuário).
export async function limparTeste(admin, familias, usuarios) {
  const erros = []
  let lancamentos = 0
  let fams = 0
  let users = 0

  for (const fid of familias) {
    const { data, error } = await admin.from('transactions').delete().eq('family_id', fid).select('id')
    if (error) erros.push(`lançamentos ${fid.slice(0, 8)}: ${error.message}`)
    else lancamentos += data.length
  }
  for (const fid of familias) {
    const { data, error } = await admin.from('families').delete().eq('id', fid).select('id')
    if (error) erros.push(`família ${fid.slice(0, 8)}: ${error.message}`)
    else fams += data.length
  }
  for (const uid of usuarios) {
    const { error } = await admin.auth.admin.deleteUser(uid)
    if (error && !/not.?found/i.test(error.message)) erros.push(`usuário ${uid.slice(0, 8)}: ${error.message}`)
    else users++
  }

  console.log(
    `limpeza: ${lancamentos} lançamento(s), ${fams}/${familias.length} família(s), ` +
      `${users}/${usuarios.length} usuário(s) removidos`,
  )
  if (erros.length > 0) {
    console.log(`LIMPEZA INCOMPLETA (${erros.length}):`)
    for (const e of erros) console.log(`  - ${e}`)
  }
  return erros
}
