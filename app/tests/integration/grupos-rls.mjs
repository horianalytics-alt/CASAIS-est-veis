// Runner do teste de isolamento de category_groups (grupos-rls.sql).
//
// O .sql termina SEMPRE em RAISE EXCEPTION com o placar: nada que ele cria
// sobrevive (usuários, famílias, grupos, categorias). Este runner só executa
// o arquivo pelo `supabase db query` e transforma o placar em código de saída.
//
// Uso, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   node tests/integration/grupos-rls.mjs
//   node tests/integration/grupos-rls.mjs --com-migration supabase/migrations/00011_....sql
//
// --com-migration: roda o arquivo de migration ANTES do teste, na MESMA
// transação (que é desfeita no fim). Serve para ver o teste vermelho/verde
// contra um rascunho de migration sem aplicá-la. Depois, confere que
// category_groups NÃO ficou no banco — prova de que o rollback aconteceu.
// Só faz sentido enquanto a migration ainda não foi aplicada.
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

const i = process.argv.indexOf('--com-migration')
const migration = i > 0 ? resolve(process.argv[i + 1]) : null
const teste = resolve(import.meta.dirname, 'grupos-rls.sql')

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

// `supabase db query` manda o arquivo como UM prepared statement: não aceita
// vários comandos. O teste já é um único DO. Com rascunho de migration, os
// dois viram um DO só, com EXECUTE de cada texto (o EXECUTE do PL/pgSQL aceita
// vários comandos). A exceção do placar desfaz migration e teste juntos.
const dir = mkdtempSync(join(tmpdir(), 'grupos-rls-'))
const arquivo = join(dir, 'execucao.sql')
const sqlTeste = readFileSync(teste, 'utf8')
if (migration) {
  const sqlMigration = readFileSync(migration, 'utf8')
  for (const [nome, texto] of [['migration', sqlMigration], ['teste', sqlTeste]]) {
    if (texto.includes('$runner_')) throw new Error(`${nome} contém o delimitador reservado $runner_`)
  }
  writeFileSync(
    arquivo,
    'DO $runner_bloco$\nBEGIN\n' +
      `EXECUTE $runner_mig$${sqlMigration}$runner_mig$;\n` +
      `EXECUTE $runner_tst$${sqlTeste}$runner_tst$;\n` +
      'END $runner_bloco$;\n',
  )
} else {
  writeFileSync(arquivo, sqlTeste)
}

console.log(migration ? `com rascunho de migration: ${migration}` : 'contra o schema aplicado')
const saida = consultar(arquivo)

const m = saida.match(/PLACAR grupos-rls: (\d+) de (\d+) passaram, (\d+) falha\(s\)([\s\S]*?)(?:"|$)/)
if (!m) {
  console.log('O teste não chegou ao placar. Saída crua:')
  console.log(saida)
  process.exit(2)
}
console.log(`placar: ${m[1]} de ${m[2]} passaram, ${m[3]} falha(s)`)
console.log(m[4].replace(/\\n/g, '\n'))

if (migration) {
  const prova = join(dir, 'prova.sql')
  writeFileSync(prova, "select to_regclass('public.category_groups') is null as rollback_ok;")
  const p = consultar(prova)
  const ok = /"rollback_ok":\s*true/.test(p)
  console.log(`rollback conferido (category_groups ausente depois): ${ok}`)
  if (!ok) process.exit(3)
}

process.exit(Number(m[3]) === 0 ? 0 : 1)
