import { redirect } from 'next/navigation'

/**
 * A raiz não tem conteúdo próprio: é só a porta de entrada.
 *
 * O proxy (src/proxy.ts) já manda o visitante SEM sessão para /login, mas NÃO
 * redireciona quem está logado — e sem esta página a raiz servia o template do
 * create-next-app ("Create Next App") para o usuário autenticado. Era a
 * primeira coisa que ele veria depois de entrar.
 *
 * Server Component: o redirect roda no servidor, sem pintar nada antes.
 */
export default function Raiz() {
  redirect('/inicio')
}
