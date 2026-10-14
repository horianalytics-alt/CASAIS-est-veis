/**
 * Helpers para o lado do navegador do Web Push.
 *
 * Intencionalmente separado de src/lib/push/notificar.ts (que é server-only
 * e usa web-push com as chaves privadas). Este módulo só usa APIs do
 * navegador e não importa nada de Node.js.
 */

/**
 * Converte uma chave pública VAPID de base64url para Uint8Array<ArrayBuffer>,
 * formato exigido por PushManager.subscribe({ applicationServerKey }).
 *
 * Usa Uint8Array.from() (em vez de new Uint8Array()) para garantir que o
 * buffer subjacente seja um ArrayBuffer puro — o TypeScript DOM lib exige
 * isso em applicationServerKey e rejeita Uint8Array<ArrayBufferLike>.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  // base64url → base64 padrão
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0))
}

/** Retorna true se o navegador suporta Web Push. */
export function suportaPush(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}