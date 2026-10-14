// Config isolada do Sentinela (R4). Não altera nada do app: só aponta o alias '@'
// para app/src e resolve dependências a partir de app/node_modules.
const APP = 'C:/dev/financas-a-dois/app'

export default ({
  root: 'C:/dev/financas-a-dois/docs/auditoria/evidencias',
  test: {
    environment: 'node',
    include: ['sentinela-r4-hostil.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  resolve: {
    alias: [
      { find: /^next\/cache$/, replacement: 'C:/dev/financas-a-dois/docs/auditoria/evidencias/stub-next-cache.ts' },
      { find: /^@\//, replacement: `${APP}/src/` },
      { find: '@supabase/supabase-js', replacement: `${APP}/node_modules/@supabase/supabase-js` },
    ],
  },
  server: { fs: { allow: ['C:/dev/financas-a-dois'] } },
})
