// Sentinela r2 — o Zod da caixinha aceita os mesmos nomes "visualmente vazios" que a RPC aceitou (H6c/H6d)?
import { esquemaCriarCaixinha } from '../../../../app/src/lib/esquemas-investimentos'

const base = { tipoRendimento: 'liquidez_diaria', taxaMensalBps: 100, resgateImediato: true }
for (const [rotulo, nome] of [
  ['U+2800 x3', '⠀⠀⠀'],
  ['U+0301 x5', '́'.repeat(5)],
  ['U+200B so', '​'],
] as const) {
  const r = esquemaCriarCaixinha.safeParse({ ...base, nome })
  console.log(rotulo, '->', r.success ? `ACEITO nome_len=${Array.from(r.data.nome).length}` : `RECUSADO ${JSON.stringify(r.error.issues.map((i) => [i.path.join('.'), i.message]))}`)
}
