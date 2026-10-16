// @vitest-environment node
//
// Fronteira servidor/cliente do módulo de serviço (a ÚNICA exceção de
// service_role do projeto — PROJETO.md §2, plano R-1).
//
// A prova forte é o `next build` falhando quando um Client Component importa
// `servico.ts` (rodada à parte e registrada no relatório). Este arquivo é a
// rede que roda em todo `vitest`: se alguém tirar o `import 'server-only'`,
// puser 'use server' no módulo (o que viraria as funções em endpoints
// públicos que aceitam familyId arbitrário), ou ligar um Client Component a
// ele por um caminho indireto, o teste fica vermelho.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(import.meta.dirname, '../..')
const SRC = join(RAIZ, 'src')
const SERVICO = join(SRC, 'lib/supabase/servico.ts')
const NOTIFICAR = join(SRC, 'lib/push/notificar.ts')
const PROTEGIDOS = [SERVICO, NOTIFICAR]

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) return arquivos(p)
    return /\.(ts|tsx|js|jsx|mjs)$/.test(nome) ? [p] : []
  })
}

/** Primeira instrução do arquivo, ignorando comentários e linhas vazias. */
function primeiraInstrucao(fonte: string): string {
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return semComentarios.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''
}

function diretiva(fonte: string): 'use client' | 'use server' | null {
  const p = primeiraInstrucao(fonte)
  if (/^['"]use client['"]/.test(p)) return 'use client'
  if (/^['"]use server['"]/.test(p)) return 'use server'
  return null
}

const EXTENSOES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx']

function resolverImport(de: string, especificador: string): string | null {
  let base: string
  if (especificador.startsWith('@/')) base = join(SRC, especificador.slice(2))
  else if (especificador.startsWith('.')) base = resolve(dirname(de), especificador)
  else return null // pacote do node_modules: fora do grafo local
  for (const ext of EXTENSOES) {
    const p = base + ext
    try {
      if (statSync(p).isFile()) return p
    } catch {
      // tenta a próxima extensão
    }
  }
  return null
}

function importsDe(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, 'utf8')
  const achados = new Set<string>()
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of fonte.matchAll(re)) {
    const alvo = resolverImport(arquivo, m[1] ?? m[2] ?? m[3])
    if (alvo) achados.add(alvo)
  }
  return [...achados]
}

describe('fronteira server-only do módulo de serviço', () => {
  it.each(PROTEGIDOS.map((p) => [relative(RAIZ, p), p]))(
    '%s começa com import "server-only" e não tem diretiva',
    (_nome, caminho) => {
      const fonte = readFileSync(caminho, 'utf8')
      expect(primeiraInstrucao(fonte)).toMatch(/^import\s+['"]server-only['"];?$/)
      expect(fonte).not.toMatch(/['"]use (server|client)['"]/)
    },
  )

  it('SUPABASE_SERVICE_ROLE_KEY só aparece em src/lib/supabase/servico.ts', () => {
    const comChave = arquivos(SRC).filter((p) => readFileSync(p, 'utf8').includes('SUPABASE_SERVICE_ROLE_KEY'))
    expect(comChave.map((p) => relative(RAIZ, p).replace(/\\/g, '/'))).toEqual(['src/lib/supabase/servico.ts'])
  })

  it('nenhuma variável NEXT_PUBLIC_ carrega segredo (SERVICE, SECRET, PRIVATE)', () => {
    const vazamentos = arquivos(SRC).flatMap((p) =>
      [...readFileSync(p, 'utf8').matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET|PRIVATE)[A-Z0-9_]*/g)].map(
        (m) => `${relative(RAIZ, p)}: ${m[0]}`,
      ),
    )
    expect(vazamentos).toEqual([])
  })

  it(
    'nenhum arquivo "use client" alcança servico.ts ou notificar.ts pelo grafo de import',
    () => {
      const todos = arquivos(SRC)
    const clientes = todos.filter((p) => diretiva(readFileSync(p, 'utf8')) === 'use client')
    expect(clientes.length).toBeGreaterThan(0) // sanidade: o scan enxerga os componentes

    const violacoes: string[] = []
    for (const inicio of clientes) {
      const visitados = new Set<string>([inicio])
      const fila: Array<{ arquivo: string; caminho: string[] }> = [{ arquivo: inicio, caminho: [inicio] }]
      while (fila.length > 0) {
        const { arquivo, caminho } = fila.shift()!
        for (const alvo of importsDe(arquivo)) {
          if (visitados.has(alvo)) continue
          visitados.add(alvo)
          if (PROTEGIDOS.includes(alvo)) {
            violacoes.push([...caminho, alvo].map((p) => relative(RAIZ, p)).join(' -> '))
            continue
          }
          // Um arquivo 'use server' importado por cliente vira referência de
          // action: o corpo dele (e o que ele importa) NÃO vai para o bundle.
          if (diretiva(readFileSync(alvo, 'utf8')) === 'use server') continue
          fila.push({ arquivo: alvo, caminho: [...caminho, alvo] })
        }
      }
    }
    expect(violacoes).toEqual([])
  }, 15000)

  it('o detector de grafo funciona: um cliente fictício que importa servico.ts seria pego', () => {
    // Controle negativo do teste acima, sem gravar arquivo: a mesma resolução
    // de import aplicada a um especificador que aponta para o módulo.
    expect(resolverImport(join(SRC, 'components/x.tsx'), '@/lib/supabase/servico')).toBe(SERVICO)
    expect(resolverImport(join(SRC, 'lib/push/x.ts'), '../supabase/servico')).toBe(SERVICO)
  })

  it('importar servico.ts fora da camada de servidor do Next LANÇA o erro do server-only', async () => {
    await expect(import('@/lib/supabase/servico')).rejects.toThrow(
      /cannot be imported from a Client Component module/,
    )
  })

  it('importar notificar.ts fora da camada de servidor também lança', async () => {
    await expect(import('@/lib/push/notificar')).rejects.toThrow(
      /cannot be imported from a Client Component module/,
    )
  })
})
