// Teste da migration 00007: rotacao do join_code e limite de tentativas.
// Roda contra o projeto HOSPEDADO (nao existe Supabase local neste projeto).
//
// Uso, de dentro de app/ (o import de @supabase/supabase-js so resolve aqui):
//   set -a && . ./.env.local && set +a
//   ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY SERVICE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
//     node tests/integration/join-code-seguranca.mjs
import { createClient } from '@supabase/supabase-js'
import { limparTeste } from './limpeza-utils.mjs'

const URL = 'https://wxhfgstgjjlmqauogeid.supabase.co'
const ANON = process.env.ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!ANON || !SERVICE) {
  console.error('Faltam ANON_KEY e SERVICE_KEY no ambiente.')
  process.exit(1)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const stamp = Date.now()

// O limite da migration 00007: 10 falhas por hora, por usuario.
const LIMITE = 10
const MSG_LIMITE = 'Muitas tentativas. Tente de novo em alguns minutos.'

let failures = 0
let checks = 0
const createdUsers = []
const createdFamilies = []

function check(name, passed, detail = '') {
  checks++
  if (passed) {
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    failures++
    console.log(`  FALHA ${name}${detail ? ' — ' + detail : ''}`)
  }
}

// Cria usuario autenticado. Sem familia: quem precisa de familia chama criarCasa.
async function novoUsuario(tag) {
  const email = `jc-${tag}-${stamp}@example.com`
  const pass = 'Senha!Forte123'
  const { data, error } = await admin.auth.admin.createUser({
    email, password: pass, email_confirm: true,
  })
  if (error) throw new Error(`createUser ${tag}: ${error.message}`)
  createdUsers.push(data.user.id)
  const cli = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await cli.auth.signInWithPassword({ email, password: pass })
  if (sErr) throw new Error(`signIn ${tag}: ${sErr.message}`)
  return { tag, uid: data.user.id, cli }
}

async function criarCasa(u, nome, limite = 2) {
  const { data, error } = await u.cli.rpc('create_family', {
    p_family_name: nome, p_split_rule: 'equal',
    p_member_name: `Membro ${u.tag}`, p_monthly_income: 3000,
  })
  if (error) throw new Error(`create_family ${u.tag}: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  u.familyId = row.family_id
  u.joinCode = row.join_code
  createdFamilies.push(row.family_id)
  // member_limit > 2 quando o teste precisa de vaga livre: e exatamente o
  // cenario em que a protecao acidental do limite de membros desaparece.
  if (limite !== 2) {
    const { error: upErr } = await admin.from('families')
      .update({ member_limit: limite }).eq('id', row.family_id)
    if (upErr) throw new Error(`member_limit ${u.tag}: ${upErr.message}`)
  }
  return u
}

// Gera um codigo no formato valido que (quase certamente) nao existe.
// Formato ^[A-Z2-9]{6}$ — precisa casar o CHECK para exercitar o caminho
// "codigo nao encontrado", e nao um erro de formato.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function codigoInexistente(i) {
  // Prefixo fixo improvavel + indice, mantendo 6 chars do charset.
  const base = 'ZZZ'
  let n = i
  let suf = ''
  for (let k = 0; k < 3; k++) { suf = CHARSET[n % 32] + suf; n = Math.floor(n / 32) }
  return base + suf
}

async function run() {
  // ==========================================================================
  console.log('\n--- R1: rotacao troca o codigo, o ANTIGO morre, o NOVO funciona ---')
  // ==========================================================================
  {
    // Casa com vaga livre (member_limit 3): sem isso, 'familia completa'
    // mascararia o resultado e o teste nao provaria nada sobre o codigo.
    const dono = await criarCasa(await novoUsuario('r1-dono'), 'Casa R1', 3)
    const codigoAntigo = dono.joinCode

    const { data: novo, error: rotErr } = await dono.cli.rpc('rotacionar_join_code', {})
    check('R1 rotacionar_join_code retorna codigo novo',
      !rotErr && typeof novo === 'string' && /^[A-Z2-9]{6}$/.test(novo),
      rotErr ? `${rotErr.code}: ${rotErr.message}` : `retornou ${JSON.stringify(novo)}`)
    check('R1 codigo novo e DIFERENTE do antigo', novo !== codigoAntigo,
      `antigo=${codigoAntigo} novo=${novo}`)

    // O codigo ANTIGO tem de estar morto em join_family. Pos-00008, codigo
    // inexistente devolve ZERO LINHAS (sem excecao) — ver cabecalho da 00008.
    const intrusoA = await novoUsuario('r1-antigo')
    const { data: antData, error: antErr } = await intrusoA.cli.rpc('join_family', {
      p_join_code: codigoAntigo, p_member_name: 'ComCodigoAntigo', p_monthly_income: 0,
    })
    check('R1 codigo ANTIGO nao entra mais em join_family',
      !antErr && (antData ?? []).length === 0,
      antErr ? `${antErr.code}: ${antErr.message}` : `retornou ${(antData ?? []).length} linha(s)`)

    // E confirma pelo efeito: ninguem entrou na casa com o codigo velho.
    const { count: membros } = await admin.from('family_members')
      .select('*', { count: 'exact', head: true }).eq('family_id', dono.familyId)
    check('R1 a casa continua com 1 membro (o velho codigo nao admitiu ninguem)',
      membros === 1, `${membros} membro(s)`)

    // E o codigo NOVO tem de funcionar (caminho legitimo pos-rotacao).
    const parceiro = await novoUsuario('r1-novo')
    const { data: ent, error: novErr } = await parceiro.cli.rpc('join_family', {
      p_join_code: novo, p_member_name: 'ComCodigoNovo', p_monthly_income: 2000,
    })
    const entRow = Array.isArray(ent) ? ent[0] : ent
    check('R1 codigo NOVO entra normalmente',
      !novErr && entRow?.family_id === dono.familyId,
      novErr ? `${novErr.code}: ${novErr.message}` : `entrou em ${entRow?.family_id?.slice(0, 8)}`)
  }

  // ==========================================================================
  console.log('\n--- R2: quem NAO e da familia nao afeta o codigo alheio ---')
  // ==========================================================================
  {
    const donoX = await criarCasa(await novoUsuario('r2-x'), 'Casa R2-X', 3)
    const donoY = await criarCasa(await novoUsuario('r2-y'), 'Casa R2-Y', 3)

    const codigoXAntes = donoX.joinCode

    // Y rotaciona. Como a RPC nao aceita family_id, Y so consegue girar o
    // proprio codigo — nao existe parametro por onde apontar para a casa de X.
    const { data: novoY, error: yErr } = await donoY.cli.rpc('rotacionar_join_code', {})
    check('R2 Y rotaciona o codigo DA PROPRIA casa', !yErr && typeof novoY === 'string',
      yErr ? `${yErr.code}: ${yErr.message}` : `novo de Y = ${novoY}`)

    // O codigo de X tem de estar intacto.
    const { data: famX } = await admin.from('families')
      .select('join_code').eq('id', donoX.familyId).single()
    check('R2 codigo de X ficou INTACTO depois de Y rotacionar',
      famX?.join_code === codigoXAntes,
      `antes=${codigoXAntes} depois=${famX?.join_code}`)
    check('R2 o codigo novo de Y nao e o codigo de X', novoY !== codigoXAntes)

    // E o codigo antigo de X continua valendo para entrar na casa de X:
    // prova de que a rotacao alheia nao invalidou nada aqui.
    const amigoX = await novoUsuario('r2-amigo')
    const { data: entX, error: entXErr } = await amigoX.cli.rpc('join_family', {
      p_join_code: codigoXAntes, p_member_name: 'AmigoDeX', p_monthly_income: 0,
    })
    const entXRow = Array.isArray(entX) ? entX[0] : entX
    check('R2 codigo de X continua funcionando (rotacao alheia nao o matou)',
      !entXErr && entXRow?.family_id === donoX.familyId,
      entXErr ? `${entXErr.code}: ${entXErr.message}` : 'ok')
  }

  // ==========================================================================
  console.log('\n--- R3: usuario SEM familia nao rotaciona nada ---')
  // ==========================================================================
  {
    const solto = await novoUsuario('r3-solto')
    const { error } = await solto.cli.rpc('rotacionar_join_code', {})
    check('R3 usuario sem familia recebe erro ao rotacionar',
      !!error && /não faz parte|nao faz parte/i.test(error.message ?? ''),
      error ? `${error.code}: ${error.message}` : 'ROTACIONOU SEM FAMILIA!')
  }

  // ==========================================================================
  console.log('\n--- R4: anon nao chama rotacionar_join_code ---')
  // ==========================================================================
  {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } })
    const { error } = await anon.rpc('rotacionar_join_code', {})
    check('R4 anon recusado em rotacionar_join_code',
      !!error && error.code === '42501',
      error ? `${error.code}: ${error.message.slice(0, 50)}` : 'PERMITIU ANON!')
  }

  // ==========================================================================
  console.log('\n--- L1: CAMINHO LEGITIMO — codigo certo na 1a tentativa entra ---')
  // ==========================================================================
  {
    // Este e o caso da Carol. Se este falhar, o rate limit quebrou o produto,
    // e nada mais neste arquivo importa.
    const dono = await criarCasa(await novoUsuario('l1-dono'), 'Casa L1', 3)
    const carol = await novoUsuario('l1-carol')

    // Primeiro o preview, como a tela faz, depois o join. Nenhum dos dois pode
    // contar tentativa, porque o codigo esta certo nas duas chamadas.
    const { data: prev, error: pErr } = await carol.cli.rpc('family_preview', {
      p_join_code: dono.joinCode,
    })
    const prevRow = Array.isArray(prev) ? prev[0] : prev
    check('L1 family_preview com codigo certo devolve a casa',
      !pErr && prevRow?.name === 'Casa L1',
      pErr ? `${pErr.code}: ${pErr.message}` : JSON.stringify(prevRow))

    const { data: ent, error: eErr } = await carol.cli.rpc('join_family', {
      p_join_code: dono.joinCode, p_member_name: 'Carol', p_monthly_income: 4000,
    })
    const entRow = Array.isArray(ent) ? ent[0] : ent
    check('L1 join_family com codigo certo na 1a tentativa ENTRA',
      !eErr && entRow?.family_id === dono.familyId,
      eErr ? `${eErr.code}: ${eErr.message}` : 'entrou')
  }

  // ==========================================================================
  console.log('\n--- L2: caminho legitimo DEPOIS de erros, ainda dentro do limite ---')
  // ==========================================================================
  {
    // Erro de digitacao acontece. 3 erros e o 4o acerto tem de entrar.
    const dono = await criarCasa(await novoUsuario('l2-dono'), 'Casa L2', 3)
    const gordo = await novoUsuario('l2-dedo')

    let todosRecusados = true
    for (let i = 0; i < 3; i++) {
      const { data, error } = await gordo.cli.rpc('join_family', {
        p_join_code: codigoInexistente(700 + i), p_member_name: 'Tentando', p_monthly_income: 0,
      })
      // Recusado = zero linhas e nenhuma entrada criada (contrato pos-00008).
      if (error || (data ?? []).length !== 0) todosRecusados = false
    }
    check('L2 os 3 erros de digitacao foram recusados', todosRecusados)

    const { data: ent, error: eErr } = await gordo.cli.rpc('join_family', {
      p_join_code: dono.joinCode, p_member_name: 'DedoGordo', p_monthly_income: 1000,
    })
    const entRow = Array.isArray(ent) ? ent[0] : ent
    check('L2 o acerto na 4a tentativa ENTRA (3 erros nao trancam ninguem)',
      !eErr && entRow?.family_id === dono.familyId,
      eErr ? `${eErr.code}: ${eErr.message}` : 'entrou')
  }

  // ==========================================================================
  console.log(`\n--- T1: limite — ${LIMITE} falhas passam, a seguinte e recusada (join_family) ---`)
  // ==========================================================================
  {
    const atacante = await novoUsuario('t1-atac')

    // As LIMITE primeiras falhas devolvem ZERO LINHAS sem erro (contrato
    // pos-00008). A mensagem do limite NAO pode aparecer aqui: se aparecesse,
    // o limite estaria apertado demais e puniria o usuario honesto.
    let msgErrada = ''
    for (let i = 0; i < LIMITE; i++) {
      const { data, error } = await atacante.cli.rpc('join_family', {
        p_join_code: codigoInexistente(i), p_member_name: 'Chute', p_monthly_income: 0,
      })
      if (error?.message.includes(MSG_LIMITE)) {
        msgErrada = `limite disparou cedo, na tentativa ${i + 1}`; break
      }
      if (error) { msgErrada = `tentativa ${i + 1}: erro inesperado ${error.message}`; break }
      if ((data ?? []).length !== 0) { msgErrada = `tentativa ${i + 1} ENTROU`; break }
    }
    check(`T1 as ${LIMITE} primeiras falhas devolvem vazio, sem a mensagem do limite`,
      msgErrada === '', msgErrada)

    // A seguinte tem de bater no limite, com a mensagem em portugues.
    const { error: limErr } = await atacante.cli.rpc('join_family', {
      p_join_code: codigoInexistente(99), p_member_name: 'Chute', p_monthly_income: 0,
    })
    check(`T1 a tentativa ${LIMITE + 1} e recusada com a mensagem do limite`,
      !!limErr && limErr.message.includes(MSG_LIMITE),
      limErr ? `${limErr.code}: ${limErr.message}` : 'ACEITOU A TENTATIVA EXTRA!')
    check('T1 o erro do limite vem com code P0001 (RAISE EXCEPTION)',
      limErr?.code === 'P0001', `code=${limErr?.code}`)
  }

  // ==========================================================================
  console.log('\n--- T2: as duas portas somam no MESMO contador ---')
  // ==========================================================================
  {
    // Se family_preview e join_family tivessem contadores separados, o
    // atacante teria o dobro do orcamento so por alternar entre elas.
    const atacante = await novoUsuario('t2-atac')

    // Gasta o orcamento inteiro pela porta BARATA (family_preview).
    let previewOk = true
    for (let i = 0; i < LIMITE; i++) {
      const { error } = await atacante.cli.rpc('family_preview', {
        p_join_code: codigoInexistente(200 + i),
      })
      // family_preview devolve zero linhas (sem erro) enquanto esta no limite.
      if (error && error.message.includes(MSG_LIMITE)) {
        previewOk = false
        check('T2 limite de family_preview disparou cedo', false, `na tentativa ${i + 1}`)
        break
      }
    }
    if (previewOk) {
      check(`T2 as ${LIMITE} falhas em family_preview foram aceitas (zero linhas)`, true)
    }

    // Agora join_family, que ja deveria estar sem orcamento.
    const { error: jfErr } = await atacante.cli.rpc('join_family', {
      p_join_code: codigoInexistente(299), p_member_name: 'Chute', p_monthly_income: 0,
    })
    check('T2 join_family ja esta bloqueada pelas falhas de family_preview',
      !!jfErr && jfErr.message.includes(MSG_LIMITE),
      jfErr ? `${jfErr.code}: ${jfErr.message}` : 'CONTADOR SEPARADO — orcamento dobrado!')
  }

  // ==========================================================================
  console.log('\n--- T3: family_preview tambem recusa com a mensagem do limite ---')
  // ==========================================================================
  {
    const atacante = await novoUsuario('t3-atac')
    for (let i = 0; i < LIMITE; i++) {
      await atacante.cli.rpc('family_preview', { p_join_code: codigoInexistente(300 + i) })
    }
    const { error } = await atacante.cli.rpc('family_preview', {
      p_join_code: codigoInexistente(399),
    })
    check(`T3 family_preview na tentativa ${LIMITE + 1} recusa com a mensagem do limite`,
      !!error && error.message.includes(MSG_LIMITE),
      error ? `${error.code}: ${error.message}` : 'ACEITOU A TENTATIVA EXTRA!')
  }

  // ==========================================================================
  console.log('\n--- T4: acerto NAO conta contra o usuario ---')
  // ==========================================================================
  {
    // LIMITE acertos seguidos em family_preview, e depois o orcamento de
    // falhas tem de estar intacto. Se acerto contasse, a 11a chamada
    // estouraria aqui.
    const dono = await criarCasa(await novoUsuario('t4-dono'), 'Casa T4', 3)
    const visitante = await novoUsuario('t4-vis')

    let acertoContou = false
    for (let i = 0; i < LIMITE + 5; i++) {
      const { error } = await visitante.cli.rpc('family_preview', {
        p_join_code: dono.joinCode,
      })
      if (error) { acertoContou = true; break }
    }
    check(`T4 ${LIMITE + 5} previews com codigo CERTO nao disparam o limite`,
      !acertoContou)

    // E o orcamento de falhas continua inteiro: uma falha agora devolve vazio,
    // e NAO a mensagem do limite.
    const { data: fData, error: fErr } = await visitante.cli.rpc('join_family', {
      p_join_code: codigoInexistente(400), p_member_name: 'Chute', p_monthly_income: 0,
    })
    check('T4 o orcamento de falhas ficou intacto apos os acertos',
      !fErr && (fData ?? []).length === 0,
      fErr ? `${fErr.message}` : `${(fData ?? []).length} linha(s)`)
  }

  // ==========================================================================
  console.log('\n--- T5: o contador e POR USUARIO, nao global ---')
  // ==========================================================================
  {
    // Se o contador fosse global, o atacante trancaria TODOS os usuarios do
    // app (negacao de servico no onboarding) gastando as proprias tentativas.
    const atacante = await novoUsuario('t5-atac')
    for (let i = 0; i < LIMITE + 1; i++) {
      await atacante.cli.rpc('join_family', {
        p_join_code: codigoInexistente(500 + i), p_member_name: 'Chute', p_monthly_income: 0,
      })
    }
    const { error: confirma } = await atacante.cli.rpc('join_family', {
      p_join_code: codigoInexistente(599), p_member_name: 'Chute', p_monthly_income: 0,
    })
    check('T5 o atacante esta bloqueado',
      !!confirma && confirma.message.includes(MSG_LIMITE))

    // Vitima inocente, conta nova, entra normalmente.
    const dono = await criarCasa(await novoUsuario('t5-dono'), 'Casa T5', 3)
    const inocente = await novoUsuario('t5-inoc')
    const { data: ent, error: eErr } = await inocente.cli.rpc('join_family', {
      p_join_code: dono.joinCode, p_member_name: 'Inocente', p_monthly_income: 0,
    })
    const entRow = Array.isArray(ent) ? ent[0] : ent
    check('T5 outro usuario NAO foi afetado pelo bloqueio do atacante',
      !eErr && entRow?.family_id === dono.familyId,
      eErr ? `${eErr.code}: ${eErr.message}` : 'entrou')
  }

  // ==========================================================================
  console.log('\n--- T6: o usuario nao le nem apaga as proprias tentativas ---')
  // ==========================================================================
  {
    // Ler = saber quantas tentativas restam (meio caminho do contorno).
    // Apagar = o contorno completo.
    const atacante = await novoUsuario('t6-atac')
    await atacante.cli.rpc('join_family', {
      p_join_code: codigoInexistente(600), p_member_name: 'Chute', p_monthly_income: 0,
    })

    const { data: lidas, error: selErr } = await atacante.cli
      .from('join_attempts').select('*')
    check('T6 usuario NAO le join_attempts',
      !!selErr || (lidas ?? []).length === 0,
      selErr ? `${selErr.code}` : `leu ${(lidas ?? []).length} linha(s)`)

    const { data: apagadas, error: delErr } = await atacante.cli
      .from('join_attempts').delete().eq('user_id', atacante.uid).select('id')
    check('T6 usuario NAO apaga join_attempts',
      !!delErr || (apagadas ?? []).length === 0,
      delErr ? `${delErr.code}` : `apagou ${(apagadas ?? []).length} linha(s)`)

    // Confirma pelo efeito: depois da tentativa de apagar, ele continua
    // contado. Gasta o resto do orcamento e tem de bater no limite.
    for (let i = 0; i < LIMITE; i++) {
      await atacante.cli.rpc('join_family', {
        p_join_code: codigoInexistente(610 + i), p_member_name: 'Chute', p_monthly_income: 0,
      })
    }
    const { error: aindaErr } = await atacante.cli.rpc('join_family', {
      p_join_code: codigoInexistente(699), p_member_name: 'Chute', p_monthly_income: 0,
    })
    check('T6 o contador sobreviveu a tentativa de apagar',
      !!aindaErr && aindaErr.message.includes(MSG_LIMITE),
      aindaErr ? aindaErr.message : 'contador zerado — DELETE funcionou!')
  }

  // ==========================================================================
  console.log('\n--- T7: contrato de family_preview nao mudou (sql -> plpgsql) ---')
  // ==========================================================================
  {
    const dono = await criarCasa(await novoUsuario('t7-dono'), 'Casa T7', 3)
    const vis = await novoUsuario('t7-vis')
    const { data, error } = await vis.cli.rpc('family_preview', {
      p_join_code: dono.joinCode,
    })
    const row = Array.isArray(data) ? data[0] : data
    check('T7 family_preview mantem as 4 colunas do contrato',
      !error && row && 'name' in row && 'member_count' in row
        && 'member_limit' in row && 'has_room' in row,
      error ? `${error.code}` : JSON.stringify(row))
    check('T7 family_preview nao vaza dado financeiro',
      row && !('transactions' in row) && !('amount' in row) && !('join_code' in row),
      JSON.stringify(Object.keys(row ?? {})))
    check('T7 has_room verdadeiro em casa com vaga', row?.has_room === true,
      `has_room=${row?.has_room} count=${row?.member_count}/${row?.member_limit}`)

    // Codigo inexistente: zero linhas, como a versao sql fazia.
    const { data: vazio, error: vErr } = await vis.cli.rpc('family_preview', {
      p_join_code: codigoInexistente(800),
    })
    check('T7 codigo inexistente devolve zero linhas (contrato preservado)',
      !vErr && (Array.isArray(vazio) ? vazio.length === 0 : vazio === null),
      vErr ? `${vErr.code}: ${vErr.message}` : JSON.stringify(vazio))
  }

  console.log(`\n=== ${checks - failures}/${checks} verificacoes passaram ===`)
}

async function cleanup() {
  // join_attempts cai por cascata junto com o usuario (FK ON DELETE CASCADE).
  const erros = await limparTeste(admin, createdFamilies, createdUsers)
  if (erros.length > 0) failures++
}

try {
  await run()
} catch (e) {
  failures++
  console.error('\nERRO FATAL:', e.message)
} finally {
  await cleanup()
}
process.exit(failures > 0 ? 1 : 0)
