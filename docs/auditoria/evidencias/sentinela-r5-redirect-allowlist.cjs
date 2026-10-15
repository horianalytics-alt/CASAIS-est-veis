// Sentinela R5 — 2ª camada contra Host Header Injection: o Supabase Auth honra um
// redirect_to de domínio ESTRANHO no link de recuperação?
// Cria 1 usuário descartável (sentinela-r5-redir-*@example.com), gera links de
// recuperação pela API admin (nenhum e-mail é enviado), segue o /verify SEM seguir o
// redirect e imprime só ORIGEM+CAMINHO do Location (o fragmento tem tokens: nunca impresso).
// Apaga o usuário no fim e confirma.
const { createClient } = require('C:/dev/financas-a-dois/app/node_modules/@supabase/supabase-js')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

;(async () => {
  const email = `sentinela-r5-redir-${Date.now()}@example.com`
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: 'Sentinela!R5-redir-' + Date.now(), email_confirm: true })
  if (error) throw error
  const out = {}
  try {
    for (const [rotulo, alvo] of [
      ['dominio_hostil', 'https://evil.example/nova-senha'],
      ['subdominio_vercel_hostil', 'https://financascasais.vercel.app.evil.example/nova-senha'],
      ['controle_dominio_legitimo', 'https://financascasais.vercel.app/nova-senha'],
    ]) {
      const { data, error: e } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: alvo } })
      if (e) { out[rotulo] = { erro: e.message }; continue }
      const link = new URL(data.properties.action_link)
      const resp = await fetch(link, { redirect: 'manual' })
      const loc = resp.headers.get('location') || ''
      let destino = '(sem location)'
      try { const l = new URL(loc); destino = l.origin + l.pathname } catch { destino = loc.split('#')[0].split('?')[0] }
      out[rotulo] = { pedido: alvo, redirect_to_no_link: link.searchParams.get('redirect_to'), status: resp.status, location_origem_caminho: destino }
    }
  } finally {
    const { error: d } = await admin.auth.admin.deleteUser(u.user.id)
    const { data: chk } = await admin.auth.admin.getUserById(u.user.id)
    out.limpeza = { deleteUser: d ? d.message : 'ok', aindaExiste: Boolean(chk && chk.user) }
  }
  console.log(JSON.stringify(out, null, 2))
})().catch((e) => { console.error('ERRO', e.message); process.exit(1) })
