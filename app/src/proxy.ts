import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

/**
 * Rotas que um visitante SEM sessão pode abrir.
 *
 * Tudo que não está aqui é privado: a regra é negar por padrão, para que uma
 * rota nova nasça protegida mesmo que ninguém lembre de atualizar este arquivo.
 */
const ROTAS_PUBLICAS = [
  '/login',
  '/cadastro',
  '/recuperar-senha',
  '/nova-senha',
] as const

/**
 * Rotas que um usuário JÁ logado não deve ver: ele é mandado para /inicio.
 *
 * `/recuperar-senha` e `/nova-senha` ficam de fora de propósito — quem está
 * logado e quer trocar a senha precisa conseguir abrir o fluxo.
 */
const ROTAS_DE_ENTRADA = ['/login', '/cadastro'] as const

function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  )
}

function ehRotaDeEntrada(pathname: string): boolean {
  return ROTAS_DE_ENTRADA.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  )
}

export async function proxy(request: NextRequest) {
  // `supabaseResponse` é reconstruído dentro de setAll porque é ESTE objeto,
  // com os cookies renovados, que precisa ser devolvido ao navegador. Devolver
  // uma resposta criada antes do setAll desloga o usuário no request seguinte.
  let supabaseResponse = NextResponse.next({ request })

  // O client do proxy é separado do de src/lib/supabase/server.ts de propósito:
  // aquele usa cookies() de next/headers, que não funciona aqui. Aqui a fonte
  // dos cookies é request.cookies e o destino é a response.
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getClaims() valida a assinatura do JWT; getSession() apenas lê o cookie,
  // que qualquer um pode forjar. Nada roda entre o createServerClient e esta
  // chamada: é ela que dispara a renovação da sessão.
  const { data: claims } = await supabase.auth.getClaims()
  const estaLogado = claims?.claims?.sub != null

  const { pathname } = request.nextUrl

  if (!estaLogado && !ehRotaPublica(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // Para onde voltar depois do login — só caminho interno, nunca URL
    // absoluta, senão o parâmetro vira redirect aberto para fora do site.
    if (pathname !== '/') {
      url.searchParams.set('proximo', pathname)
    }
    return copiaCookies(supabaseResponse, NextResponse.redirect(url))
  }

  if (estaLogado && ehRotaDeEntrada(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/inicio'
    url.search = ''
    return copiaCookies(supabaseResponse, NextResponse.redirect(url))
  }

  return supabaseResponse
}

/**
 * Transplanta os cookies renovados pelo setAll para uma resposta diferente.
 *
 * Sem isso, um redirect descarta o token recém-renovado e o usuário cai num
 * laço: volta para /login, a sessão é renovada de novo, e nunca persiste.
 */
function copiaCookies(
  origem: NextResponse,
  destino: NextResponse,
): NextResponse {
  for (const cookie of origem.cookies.getAll()) {
    destino.cookies.set(cookie)
  }
  return destino
}

export const proxyConfig = {
  // Intercepta tudo, MENOS: os estáticos do Next, os assets de PWA/ícone e
  // qualquer arquivo com extensão de imagem. O grupo (?!...) é uma negativa:
  // o caminho só casa quando NÃO começa por nenhum dos nomes listados.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|og\\.png|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
}
