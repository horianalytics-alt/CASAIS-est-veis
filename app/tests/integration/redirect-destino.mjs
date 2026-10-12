/**
 * Regressão do redirect aberto no `?proximo=` do /login.
 *
 * Autorizado nominalmente pelo Maestro: este é o ÚNICO arquivo que a Fachada
 * cria em app/tests/.
 *
 * POR QUE ESTE TESTE EXISTE: a primeira versão de `caminhoInternoSeguro()`
 * validava TEXTO (`startsWith('//')`). `"/<TAB>//evil.com"` começa com `/`
 * seguido de TAB, passava no teste — mas o navegador DESCARTA o caractere de
 * controle ao resolver e navegava para `http://evil.com`. Login legítimo, no
 * domínio verdadeiro, entregando a senha a um clone. Três payloads escapavam.
 *
 * A defesa é resolver a URL e comparar a ORIGEM. Sem este teste, alguém
 * "simplifica" a função daqui a três meses e o buraco volta sem ninguém ver.
 *
 * Rodar:  node tests/integration/redirect-destino.mjs   (a partir de app/)
 * Critério: 0 escapes para host externo E 0 caminhos legítimos quebrados.
 */

import { caminhoInternoSeguro } from '../../src/features/auth/destino.ts'

const ORIGEM_INTERNA = 'http://app-real.test'

const PAYLOADS = [
  // Ataques: nenhum pode resultar em navegação para fora do app.
  ['//evil.com', 'ataque'],
  ['/' + String.fromCharCode(92) + 'evil.com', 'ataque'],
  ['https://evil.com', 'ataque'],
  ['http://evil.com', 'ataque'],
  ['/\t//evil.com', 'ataque'],
  ['/\n//evil.com', 'ataque'],
  ['/\r//evil.com', 'ataque'],
  ['/%2F%2Fevil.com', 'ataque'],
  ['/%5Cevil.com', 'ataque'],
  ['/./' + String.fromCharCode(92) + 'evil.com', 'ataque'],
  ['/ //evil.com', 'ataque'],
  ['/\u0000//evil.com', 'ataque'],
  ['javascript:alert(1)', 'ataque'],
  ['/\u007F//evil.com', 'ataque'],
  [['/inicio', '/outro'], 'ataque'],
  // Legítimos: são o que o proxy.ts gera. Não podem quebrar.
  ['/inicio', 'legitimo'],
  ['/inicio?a=1', 'legitimo'],
  ['/lancar#x', 'legitimo'],
  ['/ajustes/perfil', 'legitimo'],
  ['/carteira?mes=2026-10', 'legitimo'],
  // Ausente: sem destino, quem chama cai no padrão '/inicio'.
  [undefined, 'ausente'],
]

let escapes = 0
let legitimosQuebrados = 0

for (const [entrada, classe] of PAYLOADS) {
  const saida = caminhoInternoSeguro(entrada)

  let origem = null
  if (typeof saida === 'string') {
    try {
      origem = new URL(saida, ORIGEM_INTERNA).origin
    } catch {
      origem = null
    }
  }

  const escapou =
    typeof saida === 'string' && origem !== null && origem !== ORIGEM_INTERNA
  if (escapou) escapes++
  if (classe === 'legitimo' && saida === undefined) legitimosQuebrados++

  const rotulo = entrada === undefined ? '(undefined)' : JSON.stringify(entrada)
  const estado =
    saida === undefined
      ? 'BLOQUEADO'
      : escapou
        ? '*** ESCAPA PARA ' + origem + ' ***'
        : 'interno -> ' + JSON.stringify(saida)

  console.log(rotulo.padEnd(28) + ' [' + classe.padEnd(8) + '] ' + estado)
}

console.log('')
console.log('escapes para host externo:    ' + escapes)
console.log('caminhos legitimos quebrados: ' + legitimosQuebrados)

if (escapes > 0 || legitimosQuebrados > 0) {
  console.error('\nFALHOU: a validacao de destino regrediu.')
  process.exit(1)
}

console.log('\nOK: nenhum destino escapa do app e os caminhos legitimos passam.')
