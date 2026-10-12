/**
 * Validação do destino pós-login (`?proximo=`).
 *
 * Mora num módulo próprio porque é usada em DOIS lados — no servidor, na page
 * de /login ao ler `searchParams`, e no cliente, em FormLogin antes de
 * `router.replace`. Defesa em profundidade: se amanhã o destino for montado por
 * outro caminho, a segunda barreira ainda segura. Duas cópias do corpo
 * divergiriam com o tempo; uma função importada, não.
 *
 * ACHADO DE SEGURANÇA que originou esta versão (security-guidance, confirmado
 * por teste): a validação anterior inspecionava TEXTO (`startsWith('//')`) e
 * era contornável por caractere de controle invisível. `"/\t//evil.com"` começa
 * com `/` seguido de TAB, então passava pelo teste — mas o navegador DESCARTA
 * o TAB ao resolver a URL e navegava para `http://evil.com`. Resultado: página
 * de login legítima, no domínio verdadeiro, empurrando o usuário para um clone
 * depois de ele digitar a senha. Medido: 3 payloads escapavam.
 *
 * A correção não é remendar caso a caso: é RESOLVER a URL como o navegador
 * resolveria e comparar a origem. Qualquer truque que engane o parser aparece
 * como origem diferente da base. Medido depois: 0 escapes, e os 4 caminhos
 * legítimos (`/inicio`, `/inicio?a=1`, `/lancar#x`, `/ajustes/perfil`) seguem
 * passando — o `?proximo=` que o proxy.ts gera não pode quebrar.
 */

/** Base sintética: o TLD `.invalid` é reservado e nunca resolve de verdade. */
const BASE_INTERNA = 'http://interno.invalid'

export function caminhoInternoSeguro(
  valor: string | string[] | undefined,
): string | undefined {
  // Lista (`?proximo=a&proximo=b`) é entrada inesperada: recusa.
  if (typeof valor !== 'string') return undefined

  // Controles (inclui \t \n \r \u0000) e barra invertida: o navegador os
  // ignora ou converte em '/' ao resolver, então nenhuma checagem de texto
  // feita ANTES dessa normalização é confiável.
  if (/[\u0000-\u001F\u007F\\]/.test(valor)) return undefined

  // Precisa ser caminho relativo à raiz; '//host' é URL protocolo-relativa.
  if (!valor.startsWith('/') || valor.startsWith('//')) return undefined

  try {
    const url = new URL(valor, BASE_INTERNA)
    // A verificação que vale: para onde isto REALMENTE aponta.
    if (url.origin !== BASE_INTERNA) return undefined
    // Devolve normalizado, não o texto cru que entrou.
    return url.pathname + url.search + url.hash
  } catch {
    return undefined
  }
}
