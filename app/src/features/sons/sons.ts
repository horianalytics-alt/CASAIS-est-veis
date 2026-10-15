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

/**
 * Antecedência com que o tom é agendado no relógio do contexto. Evita agendar
 * no instante exato em que a saída de áudio acabou de (re)abrir.
 */
const ANTECEDENCIA_S = 0.03

/**
 * Teto de espera pelo `resume()` antes de desistir do som (falha silenciosa).
 * Curto de propósito: um resume que só destrava no PRÓXIMO toque, sem relação
 * com o lançamento, não deve tocar o sinal fora de hora.
 */
const ESPERA_RESUME_MS = 800

/**
 * Sem nenhuma ativação do usuário na página ainda, nenhum navegador deixa o
 * contexto andar: criar um ali só gera AudioContext suspenso e o aviso "not
 * allowed to start" no console. Navegador sem `userActivation` segue em frente.
 */
function semAtivacaoAinda(): boolean {
  const ativacao = typeof navigator === 'undefined' ? undefined : navigator.userActivation
  return ativacao !== undefined && !ativacao.hasBeenActive
}

function obterContextoAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!contextoGlobal || contextoGlobal.state === 'closed') {
      if (semAtivacaoAinda()) return null
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      contextoGlobal = Ctx ? new Ctx() : null
    }
    return contextoGlobal
  } catch {
    return null
  }
}

/**
 * Destrava o áudio. DEVE ser chamada de forma SÍNCRONA dentro de um handler de
 * gesto do usuário que conte como ativação (keydown, mousedown, pointerup,
 * touchend, click) — nunca depois de um `await`, e nunca em `pointerdown` de
 * toque, que NÃO conta como ativação.
 *
 * Por quê: o navegador cria o AudioContext em `suspended` quando não houve
 * ativação do usuário, e só deixa `resume()` andar com ativação (política de
 * autoplay; Web Audio API, "allowed to start"). No Chromium a ativação é
 * "sticky" (vale para o resto da página depois do primeiro toque); no
 * WebKit/iOS o desbloqueio só vale se um nó COMEÇAR a tocar dentro do próprio
 * gesto — daí o buffer silencioso de 1 amostra. Criar o contexto já no
 * primeiro toque também abre a saída de áudio do aparelho bem antes do
 * primeiro som, em vez de abri-la no mesmo instante em que o tom de 160ms
 * precisa tocar.
 *
 * Respeita a preferência: com som desligado, não cria contexto nenhum.
 */
export function destravarAudio(): void {
  // Caminho quente (roda a cada tecla e toque): sai antes de ler o storage.
  if (contextoGlobal?.state === 'running') return
  if (!lerPreferenciaSom()) return
  const ctx = obterContextoAudio()
  if (!ctx || ctx.state === 'running') return
  try {
    ctx.resume().catch(() => {})
    const silencio = ctx.createBuffer(1, 1, ctx.sampleRate)
    const fonte = ctx.createBufferSource()
    fonte.buffer = silencio
    fonte.connect(ctx.destination)
    fonte.start(0)
  } catch {
    // Falha silenciosa: som é enfeite, nunca pode quebrar a tela.
  }
}

/**
 * Entrega o contexto já em `running`. Se estiver suspenso (ou `interrupted`,
 * no Safari), tenta `resume()` e espera ele resolver antes de agendar, para o
 * tom ser posto no relógio que de fato está andando. Se não destravar em
 * ESPERA_RESUME_MS, desiste — som atrasado depois do fato confunde mais do
 * que som nenhum.
 */
function comContextoAtivo(tocar: (ctx: AudioContext) => void): void {
  const ctx = obterContextoAudio()
  if (!ctx) return
  if (ctx.state === 'running') {
    tocar(ctx)
    return
  }
  let expirou = false
  const limite = window.setTimeout(() => {
    expirou = true
  }, ESPERA_RESUME_MS)
  ctx
    .resume()
    .then(() => {
      window.clearTimeout(limite)
      if (expirou || ctx.state !== 'running') return
      tocar(ctx)
    })
    .catch(() => {
      window.clearTimeout(limite)
    })
}

/**
 * Toca um sinal curto de conclusão (≤ 160ms, volume sutil).
 */
export function tocarSomSucesso(): void {
  if (!lerPreferenciaSom()) return
  comContextoAtivo(agendarSucesso)
}

function agendarSucesso(ctx: AudioContext): void {
  try {
    const agora = ctx.currentTime + ANTECEDENCIA_S
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
 * Intervalo mínimo entre dois sons de parceiro. Um lote ou um parcelamento
 * chega por Realtime como N eventos INSERT seguidos; sem isto seriam N toques
 * empilhados. Não afeta o som de sucesso/erro do próprio autor.
 */
export const INTERVALO_MINIMO_PARCEIRO_MS = 1200
let ultimoSomParceiro = Number.NEGATIVE_INFINITY

/**
 * Toca o aviso de "o parceiro acabou de lançar" (≤ 200ms, volume sutil).
 *
 * Precisa ser reconhecível sem olhar a tela e não se confundir com os outros:
 * - sucesso (o próprio autor): UMA nota contínua em `sine`, subindo C5→E5;
 * - erro: UM glide grave em `triangle`, descendo 240→175Hz;
 * - parceiro: DUAS batidas separadas por silêncio, uma oitava acima do
 *   sucesso, descendo C6→G5 ("ding-dong" de campainha), em `triangle`.
 * O que separa os três ao ouvido é o ritmo (uma vs. duas batidas), o registro
 * (agudo vs. grave) e a direção (sobe vs. desce).
 *
 * Usa o mesmo caminho do sucesso/erro: respeita a preferência de som e só
 * agenda com o contexto em `running` (destravado no gesto por DestravarAudio).
 * Como chega por Realtime, nunca está dentro de um gesto — se o contexto não
 * foi destravado antes, `comContextoAtivo` desiste em silêncio.
 */
export function tocarSomParceiro(): void {
  if (!lerPreferenciaSom()) return
  if (Date.now() - ultimoSomParceiro < INTERVALO_MINIMO_PARCEIRO_MS) return
  comContextoAtivo(agendarParceiro)
}

function agendarParceiro(ctx: AudioContext): void {
  // O intervalo é conferido de novo e só é marcado AQUI, na hora em que o som
  // de fato vai tocar: um resume que falhou não consome a janela, e vários
  // eventos que esperavam o mesmo resume não tocam todos juntos quando ele
  // resolve.
  const agoraMs = Date.now()
  if (agoraMs - ultimoSomParceiro < INTERVALO_MINIMO_PARCEIRO_MS) return
  ultimoSomParceiro = agoraMs
  try {
    const agora = ctx.currentTime + ANTECEDENCIA_S
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1046.5, agora) // C6
    // A troca de nota cai no silêncio entre as batidas: sem estalo.
    osc.frequency.setValueAtTime(783.99, agora + 0.1) // G5

    // 1ª batida: 0–80ms
    ganho.gain.setValueAtTime(0.001, agora)
    ganho.gain.exponentialRampToValueAtTime(0.05, agora + 0.012)
    ganho.gain.exponentialRampToValueAtTime(0.001, agora + 0.08)
    // silêncio: 80–100ms
    ganho.gain.setValueAtTime(0.001, agora + 0.1)
    // 2ª batida: 100–190ms
    ganho.gain.exponentialRampToValueAtTime(0.05, agora + 0.112)
    ganho.gain.exponentialRampToValueAtTime(0.001, agora + 0.19)

    osc.connect(ganho)
    ganho.connect(ctx.destination)

    osc.start(agora)
    osc.stop(agora + 0.2)
  } catch {
    // Falha silenciosa
  }
}

/**
 * Toca um sinal curto de falha/erro (≤ 170ms, volume sutil).
 */
export function tocarSomErro(): void {
  if (!lerPreferenciaSom()) return
  comContextoAtivo(agendarErro)
}

function agendarErro(ctx: AudioContext): void {
  try {
    const agora = ctx.currentTime + ANTECEDENCIA_S
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
