// L-004: o matcher decide o que o proxy intercepta. Regex que decide bloqueio
// é executado contra casos que DEVEM e que NÃO DEVEM casar.
import { readFileSync } from 'node:fs'

const PROXY = process.argv[2]
const fonte = readFileSync(PROXY, 'utf8')

// Extrai o matcher do próprio arquivo, para provar o regex REAL, não uma copia.
const m = fonte.match(/matcher:\s*\[\s*'([^']+)'/)
if (!m) {
  console.error('FALHA: nao achei o matcher em ' + PROXY)
  process.exit(1)
}
const padrao = m[1].replace(/\\\\/g, '\\')
console.log('matcher extraido do arquivo:')
console.log('  ' + padrao)
console.log('')

const re = new RegExp('^' + padrao + '$')

const casos = [
  // [caminho, deve interceptar?]
  ['/inicio', true],
  ['/lancar', true],
  ['/onboarding', true],
  ['/login', true],
  ['/cadastro', true],
  ['/recuperar-senha', true],
  ['/nova-senha', true],
  ['/', true],
  ['/inicio/detalhe', true],
  ['/api/qualquer', true],
  ['/_next/static/chunks/main.js', false],
  ['/_next/static/css/app.css', false],
  ['/_next/image', false],
  ['/_next/image?url=/a.png&w=64&q=75', false],
  ['/favicon.ico', false],
  ['/icons/icon-192.png', false],
  ['/icons/apple-touch-icon.png', false],
  ['/og.png', false],
  ['/manifest.webmanifest', false],
  ['/sw.js', false],
  ['/next.svg', false],
  ['/qualquer/foto.jpg', false],
]

let falhas = 0
for (const [caminho, esperado] of casos) {
  const casou = re.test(caminho)
  const ok = casou === esperado
  if (!ok) falhas++
  console.log(
    [
      ok ? 'OK  ' : 'ERRO',
      (casou ? 'INTERCEPTA    ' : 'nao intercepta').padEnd(14),
      '| esperado: ' + (esperado ? 'INTERCEPTA    ' : 'nao intercepta').padEnd(14),
      '| ' + caminho,
    ].join(' '),
  )
}

console.log('')
console.log(`casos: ${casos.length} | falhas: ${falhas}`)
process.exit(falhas === 0 ? 0 : 1)
