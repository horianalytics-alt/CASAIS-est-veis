// Runner do teste de isolamento e de valores das views da Onda 2
// (onda2-rls.sql: v_orcamento_progresso, v_patrimonio_mensal, CHECK de month).
//
// O .sql termina SEMPRE em RAISE EXCEPTION com o placar: nada que ele cria
// sobrevive (usuários, famílias, contas, categorias, orçamentos, lançamentos).
// Este runner executa o arquivo pelo `supabase db query`, transforma o placar
// em código de saída e confere a contagem global antes e depois (L-007).
//
// Uso, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   node tests/integration/onda2-rls.mjs
//   node tests/integration/onda2-rls.mjs --com-migration caminho/do/rascunho.sql
//
// --com-migration: roda o arquivo SQL ANTES do teste, na MESMA transação (que
// é desfeita no fim). Serve para ver o teste vermelho/verde contra um rascunho
// de migration sem aplicá-la. Depois, confere que as duas views e a constraint
// NÃO ficaram no banco — prova de que o rollback aconteceu. Só faz sentido
// enquanto a migration ainda não foi aplicada.
//
// Códigos de saída: 0 verde | 1 alguma asserção falhou | 2 não chegou ao placar
// | 3 rollback não confirmado | 4 contagem global mudou durante a execução.
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
const teste = resolve(import.meta.dirname, 'onda2-rls.sql')
const dir = mkdtempSync(join(tmpdir(), 'onda2-rls-'))

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

function consultarTexto(nome, sql) {
  const arquivo = join(dir, `${nome}.sql`)
  writeFileSync(arquivo, sql)
  return consultar(arquivo)
}

const SQL_CONTAGEM =
  'select (select count(*) from public.families) as familias,' +
  ' (select count(*) from auth.users) as usuarios,' +
  ' (select count(*) from public.transactions) as lancamentos,' +
  ' (select count(*) from public.category_budgets) as orcamentos;'

function contagem(rotulo) {
  const saida = consultarTexto(`contagem-${rotulo}`, SQL_CONTAGEM)
  const pegar = (campo) => saida.match(new RegExp(`"${campo}":\\s*(\\d+)`))?.[1] ?? '?'
  const c = {
    familias: pegar('familias'),
    usuarios: pegar('usuarios'),
    lancamentos: pegar('lancamentos'),
    orcamentos: pegar('orcamentos'),
  }
  console.log(
    `contagem ${rotulo}: familias ${c.familias} | usuarios ${c.usuarios} | ` +
      `lancamentos ${c.lancamentos} | orcamentos ${c.orcamentos}`,
  )
  return c
}

const antes = contagem('ANTES')

// `supabase db query` manda o arquivo como UM prepared statement: não aceita
// vários comandos. O teste já é um único DO. Com rascunho de migration, os
// dois viram um DO só, com EXECUTE de cada texto (o EXECUTE do PL/pgSQL aceita
// vários comandos). A exceção do placar desfaz migration e teste juntos.
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

let codigo = 0
const m = saida.match(/PLACAR onda2-rls: (\d+) de (\d+) passaram, (\d+) falha\(s\)([\s\S]*?)(?:"|$)/)
if (!m) {
  console.log('O teste não chegou ao placar. Saída crua:')
  console.log(saida)
  codigo = 2
} else {
  console.log(`placar: ${m[1]} de ${m[2]} passaram, ${m[3]} falha(s)`)
  console.log(m[4].replace(/\\n/g, '\n'))
  if (Number(m[3]) !== 0) codigo = 1
}

if (migration) {
  const p = consultarTexto(
    'prova',
    "select to_regclass('public.v_orcamento_progresso') is null" +
      " and to_regclass('public.v_patrimonio_mensal') is null" +
      " and not exists (select 1 from pg_constraint where conname = 'category_budgets_mes_valido')" +
      ' as rollback_ok;',
  )
  const ok = /"rollback_ok":\s*true/.test(p)
  console.log(`rollback conferido (2 views e a constraint ausentes depois): ${ok}`)
  if (!ok && codigo === 0) codigo = 3
}

const depois = contagem('DEPOIS')
const mudou = Object.keys(antes).filter((k) => antes[k] !== depois[k] || antes[k] === '?')
if (mudou.length > 0) {
  console.log(
    `CONTAGEM GLOBAL MUDOU (${mudou.join(', ')}). O teste não grava nada; ` +
      'investigue (outro processo escrevendo no banco ao mesmo tempo?).',
  )
  if (codigo === 0) codigo = 4
}

process.exit(codigo)
