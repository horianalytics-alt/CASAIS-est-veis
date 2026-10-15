// Stubs do Sentinela R5 para rodar Server Actions fora do runtime do Next.
// Ligados por alias na config isolada; não alteram nada do app.
// Cada stub delega para um gancho em globalThis que o teste controla.
type G = {
  __r5After?: (cb: () => unknown) => void
  __r5Push?: (sub: { endpoint: string; keys: unknown }, corpo: string, opcoes: unknown) => Promise<unknown>
}
const g = globalThis as unknown as G

// next/server
export const after = (cb: () => unknown) => {
  if (g.__r5After) g.__r5After(cb)
}
// next/cache
export const revalidatePath = (..._a: unknown[]) => undefined
export const revalidateTag = (..._a: unknown[]) => undefined
// web-push (default export)
const webpush = {
  sendNotification: (sub: { endpoint: string; keys: unknown }, corpo: string, opcoes: unknown) => {
    if (!g.__r5Push) throw new Error('stub web-push sem gancho')
    return g.__r5Push(sub, corpo, opcoes)
  },
}
export default webpush
