// Stub do Sentinela para rodar as Server Actions fora do runtime do Next.
// Substitui 'next/cache' via alias da config isolada; não altera nada do app.
export const revalidatePath = (..._args: unknown[]) => undefined
export const revalidateTag = (..._args: unknown[]) => undefined
export const unstable_cache = <T>(fn: T) => fn
