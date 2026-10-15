/**
 * Feedback sonoro curto via WebAudio (oscilador), sem arquivos externos.
 *
 * Ligado por padrão; preferência persistida em localStorage com try/catch.
 * Volume baixo (gain <= 0.06) e duração total <= 200ms.
 */

const CHAVE_SOM = 'fd2_sons_ativos'

export function lerPreferenciaSom(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const salvo = window.localStorage.getItem(CHAVE_SOM)
    return salvo !== '0'
  } catch {
    return true
  }
}

export function salvarPreferenciaSom(ativo: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHAVE_SOM, ativo ? '1' : '0')
  } catch {
    /* modo privado ou storage bloqueado */
  }
}

let contextoGlobal: AudioContext | null = null

function obterContextoAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!contextoGlobal || contextoGlobal.state === 'closed') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      contextoGlobal = Ctx ? new Ctx() : null
    }
    if (contextoGlobal && contextoGlobal.state === 'suspended') {
      contextoGlobal.resume().catch(() => {})
    }
    return contextoGlobal
  } catch {
    return null
  }
}

/**
 * Toca um sinal curto de conclusão (≤ 160ms, volume sutil).
 */
export function tocarSomSucesso(): void {
  if (!lerPreferenciaSom()) return
  const ctx = obterContextoAudio()
  if (!ctx) return

  try {
    const agora = ctx.currentTime
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, agora) // C5
    osc.frequency.setValueAtTime(659.25, agora + 0.07) // E5

    ganho.gain.setValueAtTime(0.001, agora)
    ganho.gain.exponentialRampToValueAtTime(0.055, agora + 0.015)
    ganho.gain.exponentialRampToValueAtTime(0.001, agora + 0.15)

    osc.connect(ganho)
    ganho.connect(ctx.destination)

    osc.start(agora)
    osc.stop(agora + 0.16)
  } catch {
    // Falha silenciosa
  }
}

/**
 * Toca um sinal curto de falha/erro (≤ 170ms, volume sutil).
 */
export function tocarSomErro(): void {
  if (!lerPreferenciaSom()) return
  const ctx = obterContextoAudio()
  if (!ctx) return

  try {
    const agora = ctx.currentTime
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(240, agora)
    osc.frequency.linearRampToValueAtTime(175, agora + 0.14)

    ganho.gain.setValueAtTime(0.001, agora)
    ganho.gain.exponentialRampToValueAtTime(0.06, agora + 0.015)
    ganho.gain.exponentialRampToValueAtTime(0.001, agora + 0.16)

    osc.connect(ganho)
    ganho.connect(ctx.destination)

    osc.start(agora)
    osc.stop(agora + 0.17)
  } catch {
    // Falha silenciosa
  }
}
