import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Estado = 'suspended' | 'running' | 'closed'

/** AudioContext falso: registra o que foi pedido e deixa o teste decidir o resume. */
class ContextoFalso {
  static instancias: ContextoFalso[] = []
  static resumePermitido = true
  /** Quando o resume não é permitido na hora, guarda quem o liberaria depois. */
  static liberarResume: (() => void) | null = null
  state: Estado = 'suspended'
  currentTime = 0
  sampleRate = 48000
  destination = {}
  buffersIniciados = 0
  osciladores: {
    quando: number
    estado: Estado
    tipo: string
    frequencias: number[]
    parada: number
  }[] = []
  /** Valores de volume agendados, um array por som (para contar batidas). */
  ganhos: number[][] = []
  constructor() {
    ContextoFalso.instancias.push(this)
  }
  resume() {
    if (!ContextoFalso.resumePermitido) {
      return new Promise<void>((resolver) => {
        // Vários resume() pendentes resolvem todos no mesmo gesto, como no navegador.
        const anterior = ContextoFalso.liberarResume
        ContextoFalso.liberarResume = () => {
          anterior?.()
          this.state = 'running'
          this.currentTime = 9
          resolver()
        }
      })
    }
    this.state = 'running'
    this.currentTime = 5
    return Promise.resolve()
  }
  createBuffer() {
    return {}
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      connect: () => {},
      start: () => {
        this.buffersIniciados++
      },
    }
  }
  createOscillator() {
    const frequencias: number[] = []
    const registro = { quando: 0, estado: this.state, tipo: '', frequencias, parada: 0 }
    const osc = {
      type: 'sine',
      frequency: {
        setValueAtTime: (v: number) => frequencias.push(v),
        linearRampToValueAtTime: (v: number) => frequencias.push(v),
      },
      connect: () => {},
      start: (quando: number) => {
        Object.assign(registro, { quando, estado: this.state, tipo: osc.type })
        this.osciladores.push(registro)
      },
      stop: (quando: number) => {
        registro.parada = quando
      },
    }
    return osc
  }
  createGain() {
    const valores: number[] = []
    this.ganhos.push(valores)
    return {
      gain: {
        setValueAtTime: (v: number) => valores.push(v),
        exponentialRampToValueAtTime: (v: number) => valores.push(v),
      },
      connect: () => {},
    }
  }
}

async function carregar() {
  vi.resetModules()
  return import('@/features/sons/sons')
}

beforeEach(() => {
  ContextoFalso.instancias = []
  ContextoFalso.resumePermitido = true
  ContextoFalso.liberarResume = null
  window.localStorage.clear()
  vi.stubGlobal('AudioContext', ContextoFalso)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('destravarAudio', () => {
  it('cria o contexto, chama resume e inicia um buffer silencioso no mesmo tique', async () => {
    const { destravarAudio } = await carregar()
    destravarAudio()
    expect(ContextoFalso.instancias).toHaveLength(1)
    // síncrono: o buffer começa dentro do gesto, antes de qualquer await
    expect(ContextoFalso.instancias[0].buffersIniciados).toBe(1)
  })

  it('não cria contexto quando o som está desligado em Ajustes', async () => {
    window.localStorage.setItem('fd2_sons_ativos', '0')
    const { destravarAudio } = await carregar()
    destravarAudio()
    expect(ContextoFalso.instancias).toHaveLength(0)
  })

  it('não faz nada quando o contexto já está rodando', async () => {
    const { destravarAudio } = await carregar()
    destravarAudio()
    await Promise.resolve()
    destravarAudio()
    expect(ContextoFalso.instancias).toHaveLength(1)
    expect(ContextoFalso.instancias[0].buffersIniciados).toBe(1)
  })
})

describe('tocarSomSucesso', () => {
  it('com contexto suspenso, espera o resume e agenda no relógio já andando', async () => {
    const { tocarSomSucesso } = await carregar()
    tocarSomSucesso()
    const ctx = ContextoFalso.instancias[0]
    expect(ctx.osciladores).toHaveLength(0)
    await Promise.resolve()
    await Promise.resolve()
    expect(ctx.osciladores).toHaveLength(1)
    expect(ctx.osciladores[0].estado).toBe('running')
    expect(ctx.osciladores[0].quando).toBeCloseTo(5.03, 5)
  })

  it('reaproveita o contexto destravado no gesto, mesmo chamado depois de um await', async () => {
    const { destravarAudio, tocarSomSucesso } = await carregar()
    destravarAudio()
    await new Promise((r) => setTimeout(r, 10)) // simula a Server Action
    tocarSomSucesso()
    expect(ContextoFalso.instancias).toHaveLength(1)
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(1)
  })

  it('não toca fora de hora quando o resume só destrava depois do limite', async () => {
    vi.useFakeTimers()
    ContextoFalso.resumePermitido = false
    const { tocarSomErro } = await carregar()
    expect(() => tocarSomErro()).not.toThrow()
    vi.advanceTimersByTime(2000)
    // um toque qualquer, segundos depois, destrava o contexto
    ContextoFalso.liberarResume?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(ContextoFalso.instancias[0].state).toBe('running')
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(0)
  })

  it('toca quando o resume destrava dentro do limite', async () => {
    vi.useFakeTimers()
    ContextoFalso.resumePermitido = false
    const { tocarSomSucesso } = await carregar()
    tocarSomSucesso()
    vi.advanceTimersByTime(200)
    ContextoFalso.liberarResume?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(1)
  })

  it('não cria contexto antes de qualquer ativação do usuário na página', async () => {
    vi.stubGlobal('navigator', { ...navigator, userActivation: { hasBeenActive: false, isActive: false } })
    const { tocarSomSucesso, destravarAudio } = await carregar()
    tocarSomSucesso()
    destravarAudio()
    expect(ContextoFalso.instancias).toHaveLength(0)
  })

  it('não toca nada com o som desligado', async () => {
    window.localStorage.setItem('fd2_sons_ativos', '0')
    const { tocarSomSucesso } = await carregar()
    tocarSomSucesso()
    expect(ContextoFalso.instancias).toHaveLength(0)
  })
})

async function esvaziarMicrotarefas() {
  await Promise.resolve()
  await Promise.resolve()
}

/** Quantos picos de volume (>= 0.04) o envelope tem = quantas batidas. */
function batidas(valores: number[]) {
  return valores.filter((v) => v >= 0.04).length
}

describe('tocarSomParceiro', () => {
  it('são duas batidas em triangle descendo C6 -> G5, em até 200ms', async () => {
    const { tocarSomParceiro } = await carregar()
    tocarSomParceiro()
    await esvaziarMicrotarefas()

    const ctx = ContextoFalso.instancias[0]
    expect(ctx.osciladores).toHaveLength(1)
    const [osc] = ctx.osciladores
    expect(osc.tipo).toBe('triangle')
    expect(osc.frequencias).toEqual([1046.5, 783.99])
    expect(batidas(ctx.ganhos[0])).toBe(2)
    expect(osc.parada - osc.quando).toBeLessThanOrEqual(0.2 + 1e-9)
    expect(Math.max(...ctx.ganhos[0])).toBeLessThanOrEqual(0.06)
  })

  it('é distinguível do som de sucesso e do de erro', async () => {
    const { tocarSomSucesso, tocarSomErro, tocarSomParceiro } = await carregar()
    tocarSomSucesso()
    await esvaziarMicrotarefas()
    tocarSomErro()
    tocarSomParceiro()
    await esvaziarMicrotarefas()

    const ctx = ContextoFalso.instancias[0]
    const [sucesso, erro, parceiro] = ctx.osciladores
    const assinatura = (i: number) =>
      JSON.stringify({
        tipo: ctx.osciladores[i].tipo,
        f: ctx.osciladores[i].frequencias,
        batidas: batidas(ctx.ganhos[i]),
      })
    expect(new Set([assinatura(0), assinatura(1), assinatura(2)]).size).toBe(3)

    // sucesso sobe; parceiro desce e é agudo; erro também é triangle, mas grave
    expect(sucesso.tipo).toBe('sine')
    expect(sucesso.frequencias[1]).toBeGreaterThan(sucesso.frequencias[0])
    expect(parceiro.frequencias[1]).toBeLessThan(parceiro.frequencias[0])
    expect(Math.min(...parceiro.frequencias)).toBeGreaterThan(Math.max(...erro.frequencias) * 3)
    expect(batidas(ctx.ganhos[0])).toBe(1)
    expect(batidas(ctx.ganhos[2])).toBe(2)
  })

  it('reaproveita o contexto destravado no gesto (Realtime chega fora de gesto)', async () => {
    const { destravarAudio, tocarSomParceiro } = await carregar()
    destravarAudio()
    await new Promise((r) => setTimeout(r, 10)) // o evento do parceiro chega depois
    tocarSomParceiro()
    expect(ContextoFalso.instancias).toHaveLength(1)
    // contexto já em running: agenda na hora, sem esperar resume
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(1)
  })

  it('não toca fora de hora quando o resume só destrava depois do limite', async () => {
    vi.useFakeTimers()
    ContextoFalso.resumePermitido = false
    const { tocarSomParceiro } = await carregar()
    tocarSomParceiro()
    vi.advanceTimersByTime(2000)
    ContextoFalso.liberarResume?.()
    await esvaziarMicrotarefas()
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(0)
  })

  it('respeita a preferência: som desligado não cria contexto', async () => {
    window.localStorage.setItem('fd2_sons_ativos', '0')
    const { tocarSomParceiro } = await carregar()
    tocarSomParceiro()
    expect(ContextoFalso.instancias).toHaveLength(0)
  })

  it('lote/parcelamento (N INSERTs seguidos) toca uma vez só', async () => {
    const relogio = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const { tocarSomParceiro, INTERVALO_MINIMO_PARCEIRO_MS } = await carregar()
    tocarSomParceiro()
    await esvaziarMicrotarefas()
    tocarSomParceiro()
    tocarSomParceiro()
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(1)

    relogio.mockReturnValue(1_000_000 + INTERVALO_MINIMO_PARCEIRO_MS)
    tocarSomParceiro()
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(2)
    relogio.mockRestore()
  })

  it('vários eventos esperando o mesmo resume tocam uma vez só quando ele destrava', async () => {
    vi.useFakeTimers()
    ContextoFalso.resumePermitido = false
    const { tocarSomParceiro } = await carregar()
    tocarSomParceiro()
    tocarSomParceiro()
    tocarSomParceiro()
    vi.advanceTimersByTime(100)
    ContextoFalso.liberarResume?.()
    await esvaziarMicrotarefas()
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(1)
  })

  it('resume que falhou não consome a janela do próximo som de parceiro', async () => {
    vi.useFakeTimers()
    ContextoFalso.resumePermitido = false
    const { tocarSomParceiro } = await carregar()
    tocarSomParceiro() // contexto preso: desiste após o limite
    vi.advanceTimersByTime(900)
    ContextoFalso.resumePermitido = true
    tocarSomParceiro() // 900ms depois, já destravável: tem de tocar
    await esvaziarMicrotarefas()
    expect(ContextoFalso.instancias[0].osciladores).toHaveLength(1)
  })

  it('o intervalo do parceiro não silencia o som do próprio autor', async () => {
    const { tocarSomParceiro, tocarSomSucesso } = await carregar()
    tocarSomParceiro()
    await esvaziarMicrotarefas()
    tocarSomSucesso()
    expect(ContextoFalso.instancias[0].osciladores.map((o) => o.tipo)).toEqual([
      'triangle',
      'sine',
    ])
  })
})

describe('foiCriadoPeloParceiro (OuvinteRealtime)', () => {
  it('INSERT criado por mim não toca o som de parceiro', async () => {
    const { foiCriadoPeloParceiro } = await import('@/components/inicio/ouvinte-realtime')
    expect(foiCriadoPeloParceiro('membro-eu', 'membro-eu')).toBe(false)
  })

  it('INSERT criado pelo outro membro toca, mesmo que eu seja quem pagou', async () => {
    const { foiCriadoPeloParceiro } = await import('@/components/inicio/ouvinte-realtime')
    expect(foiCriadoPeloParceiro('membro-carol', 'membro-eu')).toBe(true)
  })

  it('sem saber quem sou (meuId ausente), toca', async () => {
    const { foiCriadoPeloParceiro } = await import('@/components/inicio/ouvinte-realtime')
    expect(foiCriadoPeloParceiro('membro-carol', null)).toBe(true)
    expect(foiCriadoPeloParceiro(undefined, undefined)).toBe(true)
  })
})
