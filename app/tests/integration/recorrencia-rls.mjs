// Runner do teste da recorrência (recorrencia-rls.sql).
// Cópia de carteira-rls.mjs (mesmo arranjo), trocando só os nomes.
//
// O .sql termina SEMPRE em RAISE EXCEPTION com o placar: nada que ele cria
// sobrevive. Este runner só executa o arquivo pelo `supabase db query` e
// transforma o placar em código de saída.
//
// Uso, de dentro de app/:
//   set -a && . ./.env.local && set +a
//   node tests/integration/recorrencia-rls.mjs
//   node tests/integration/recorrencia-rls.mjs --com-migration supabase/migrations/00019_recorrencia.sql
//   node tests/integration/recorrencia-rls.mjs --com-migration <migration> --mutante tests/integration/recorrencia-rls-mutante.sql
//
// --com-migration: roda a migration ANTES do teste, na MESMA transação (que é
// desfeita no fim), e depois confere que a impressão digital do schema public
// é a mesma de antes (prova do rollback). Só faz sentido enquanto a migration
// ainda não foi aplicada. --prova "<select ... as rollback_ok>" é opcional.
// --sim: repassa --yes ao CLI v3 (sem ele, em modo agente, o CLI recusa SQL
// no banco hospedado). Só com autorização escrita para rodar contra produção.
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
const teste = resolve(import.meta.dirname, 'recorrencia-rls.sql')

function consultar(arquivo) {
  try {
    // No Windows o shell junta os argumentos com espaço e sem aspas: o caminho
    // do arquivo vai entre aspas para sobreviver a um TEMP com espaço
    // (code-review high da 00018).
    const caminho = process.platform === 'win32' ? `"${arquivo}"` : arquivo
    // CLI v3 em modo agente recusa SQL no hospedado sem --yes
    // (HostedMutationConsentRequiredError). --sim repassa o --yes: só com
    // autorização escrita para rodar contra o banco (que aqui é produção).
    const extra = process.argv.includes('--sim') ? ['--yes'] : []
    return execFileSync('npx', ['supabase', 'db', 'query', '--db-url', DB_URL, ...extra, '-f', caminho], {
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
const dir = mkdtempSync(join(tmpdir(), 'recorrencia-rls-'))
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

// Impressão digital do schema public (funções e corpos, tabelas e views,
// policies, triggers). Tirada antes e depois de rodar com --com-migration: se
// mudou, o rollback NÃO aconteceu. Vale para qualquer migration, sem --prova
// (achado A9 do Sentinela: o padrão antigo só servia para a 00016).
// Cada parte ordena pela própria expressão: ORDER BY 1 dentro de agregado
// ordenaria por uma constante, e a impressão poderia variar sem o schema mudar.
const SQL_IMPRESSAO = `select md5(concat_ws('|',
  (select string_agg(x, ',' order by x) from (
     select p.oid::regprocedure::text || md5(p.prosrc) || coalesce(array_to_string(p.proconfig, ','), '') as x
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') a),
  (select string_agg(x, ',' order by x) from (
     select c.relname::text || c.relkind::text as x
     from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') b),
  (select string_agg(x, ',' order by x) from (
     select tablename::text || policyname::text || coalesce(qual, '') || coalesce(with_check, '') as x
     from pg_policies where schemaname = 'public') c),
  (select string_agg(x, ',' order by x) from (
     select c.relname::text || t.tgname::text || t.tgenabled::text || pg_get_triggerdef(t.oid) as x
     from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal) d)
)) as impressao;`
function impressao() {
  const f = join(dir, 'impressao.sql')
  writeFileSync(f, SQL_IMPRESSAO)
  const m = consultar(f).match(/"impressao":\s*"([0-9a-f]{32})"/)
  return m ? m[1] : null
}
const impressaoAntes = migration ? impressao() : null
if (migration && !impressaoAntes) {
  console.log('Não foi possível tirar a impressão digital do schema antes de rodar.')
  process.exit(4)
}

console.log(
  migration
    ? `com rascunho de migration: ${migration}${mutante ? `\nCOM MUTANTE: ${mutante}` : ''}`
    : 'contra o schema aplicado',
)
const saida = consultar(arquivo)

// A mensagem do placar chega como string JSON escapada: vai até a primeira
// aspa NÃO escapada (uma FALHA com `\"` no SQLERRM não corta a lista —
// code-review high da 00018) e é desescapada com JSON.parse.
const m = saida.match(/PLACAR recorrencia-rls: (\d+) de (\d+) passaram, (\d+) falha\(s\)((?:\\.|[^"\\])*)/)
if (!m) {
  console.log('O teste não chegou ao placar. Saída crua:')
  console.log(saida)
  process.exit(2)
}
console.log(`placar: ${m[1]} de ${m[2]} passaram, ${m[3]} falha(s)`)
let linhas
try {
  linhas = JSON.parse(`"${m[4]}"`)
} catch {
  linhas = m[4].replace(/\\n/g, '\n')
}
console.log(linhas)

// Prova do rollback: a impressão digital do schema tem de ser a mesma de antes.
// --prova "<select ... as rollback_ok>" acrescenta uma checagem específica.
if (migration) {
  const depois = impressao()
  const igual = depois === impressaoAntes
  console.log(`rollback conferido (impressão do schema igual antes/depois): ${igual}`)
  if (!igual) process.exit(3)
  const iProva = process.argv.indexOf('--prova')
  if (iProva > 0) {
    const sqlProva = process.argv[iProva + 1]
    const prova = join(dir, 'prova.sql')
    writeFileSync(prova, sqlProva)
    const ok = /"rollback_ok":\s*true/.test(consultar(prova))
    console.log(`rollback conferido (${sqlProva}): ${ok}`)
    if (!ok) process.exit(3)
  }
}

process.exit(Number(m[3]) === 0 ? 0 : 1)
