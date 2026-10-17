// Runner do teste da carteira de investimento (carteira-rls.sql).
// Mesmo arranjo de grupos-rls.mjs.
//
// O .sql termina SEMPRE em RAISE EXCEPTION com o placar: nada que ele cria
// sobrevive. Este runner só executa o arquivo pelo `supabase db query` e
// transforma o placar em código de saída.
//
// Uso, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   node tests/integration/carteira-rls.mjs
//   node tests/integration/carteira-rls.mjs --com-migration supabase/migrations/00016_carteira_investimento.sql
//   node tests/integration/carteira-rls.mjs --com-migration <migration> --mutante tests/integration/carteira-rls-mutante.sql
//
// --com-migration: roda a migration ANTES do teste, na MESMA transação (que é
// desfeita no fim), e depois confere que investment_boxes NÃO ficou no banco.
// Só faz sentido enquanto a migration ainda não foi aplicada.
// --mutante: aplica o patch mutante depois da migration, na mesma transação.
// Com ele, o placar TEM de mostrar falhas.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SENHA = process.env.SUPABASE_DB_PASSWORD
if (!SENHA) {
  console.error('Falta SUPABASE_DB_PASSWORD no ambiente.')
  process.exit(1)
}
const DB_URL =
  `postgresql://postgres.wxhfgstgjjlmqauogeid:${encodeURIComponent(SENHA)}` +
  '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'

function argumento(nome) {
  const i = process.argv.indexOf(nome)
  return i > 0 ? resolve(process.argv[i + 1]) : null
}
const migration = argumento('--com-migration')
const mutante = argumento('--mutante')
if (mutante && !migration) {
  console.error('--mutante exige --com-migration.')
  process.exit(1)
}
const teste = resolve(import.meta.dirname, 'carteira-rls.sql')

function consultar(arquivo) {
  try {
    return execFileSync('npx', ['supabase', 'db', 'query', '--db-url', DB_URL, '-f', arquivo], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
  } catch (e) {
    // O RAISE do placar chega como erro do CLI: é o caminho normal.
    return `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
}

// `supabase db query` manda o arquivo como UM prepared statement. Com
// migration (e mutante), todos viram um DO só, com EXECUTE de cada texto.
// A exceção do placar desfaz tudo junto.
const dir = mkdtempSync(join(tmpdir(), 'carteira-rls-'))
const arquivo = join(dir, 'execucao.sql')
const sqlTeste = readFileSync(teste, 'utf8')
if (migration) {
  const partes = [['migration', readFileSync(migration, 'utf8')]]
  if (mutante) partes.push(['mutante', readFileSync(mutante, 'utf8')])
  partes.push(['teste', sqlTeste])
  for (const [nome, texto] of partes) {
    if (texto.includes('$runner_')) throw new Error(`${nome} contém o delimitador reservado $runner_`)
  }
  writeFileSync(
    arquivo,
    'DO $runner_bloco$\nBEGIN\n' +
      partes.map(([nome, texto]) => `EXECUTE $runner_${nome}$${texto}$runner_${nome}$;\n`).join('') +
      'END $runner_bloco$;\n',
  )
} else {
  writeFileSync(arquivo, sqlTeste)
}

console.log(
  migration
    ? `com rascunho de migration: ${migration}${mutante ? `\nCOM MUTANTE: ${mutante}` : ''}`
    : 'contra o schema aplicado',
)
const saida = consultar(arquivo)

const m = saida.match(/PLACAR carteira-rls: (\d+) de (\d+) passaram, (\d+) falha\(s\)([\s\S]*?)(?:"|$)/)
if (!m) {
  console.log('O teste não chegou ao placar. Saída crua:')
  console.log(saida)
  process.exit(2)
}
console.log(`placar: ${m[1]} de ${m[2]} passaram, ${m[3]} falha(s)`)
console.log(m[4].replace(/\\n/g, '\n'))

// Prova do rollback: por padrão, investment_boxes ausente (vale para a 00016).
// Para migration posterior, --prova "<select ... as rollback_ok>" diz o que conferir.
const iProva = process.argv.indexOf('--prova')
const sqlProva = iProva > 0
  ? process.argv[iProva + 1]
  : "select to_regclass('public.investment_boxes') is null as rollback_ok;"
if (migration) {
  const prova = join(dir, 'prova.sql')
  writeFileSync(prova, sqlProva)
  const p = consultar(prova)
  const ok = /"rollback_ok":\s*true/.test(p)
  console.log(`rollback conferido (${sqlProva}): ${ok}`)
  if (!ok) process.exit(3)
}

process.exit(Number(m[3]) === 0 ? 0 : 1)
