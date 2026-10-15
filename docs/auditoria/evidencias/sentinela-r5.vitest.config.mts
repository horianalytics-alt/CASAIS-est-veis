// Config isolada do Sentinela (R5). Não altera nada do app: só aponta o alias '@'
// para app/src e resolve dependências a partir de app/node_modules.
const APP = 'C:/dev/financas-a-dois/app'

export default ({
  root: 'C:/dev/financas-a-dois/docs/auditoria/evidencias',
  test: {
    environment: 'node',
    include: ['sentinela-r5-*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
  resolve: {
    alias: [
      { find: /^next\/server$/, replacement: 'C:/dev/financas-a-dois/docs/auditoria/evidencias/sentinela-r5-stubs.ts' },
      { find: /^next\/cache$/, replacement: 'C:/dev/financas-a-dois/docs/auditoria/evidencias/sentinela-r5-stubs.ts' },
      { find: /^web-push$/, replacement: 'C:/dev/financas-a-dois/docs/auditoria/evidencias/sentinela-r5-stubs.ts' },
      { find: /^server-only$/, replacement: 'C:/dev/financas-a-dois/docs/auditoria/evidencias/sentinela-r5-vazio.ts' },
      { find: /^@\//, replacement: `${APP}/src/` },
      { find: '@supabase/supabase-js', replacement: `${APP}/node_modules/@supabase/supabase-js` },
      { find: 'zod', replacement: `${APP}/node_modules/zod` },
    ],
  },
  server: { fs: { allow: ['C:/dev/financas-a-dois'] } },
})
