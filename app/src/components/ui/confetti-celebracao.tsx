'use client'

import * as React from 'react'

export interface ConfettiCelebracaoProps {
  /** Se true, dispara o efeito de confetes */
  ativo?: boolean
  /** Duração em milissegundos antes de limpar o canvas (padrão: 2600ms) */
  duracao?: number
  /** Callback chamado quando o efeito termina */
  aoConcluir?: () => void
}

interface Particula {
  x: number
  y: number
  vx: number
  vy: number
  raio: number
  cor: string
  rotacao: number
  vRotacao: number
  tipo: 'circulo' | 'retangulo'
  largura: number
  altura: number
  opacidade: number
}

const CORES_CELEBRACAO = [
  '#10B981', // Emerald
  '#059669', // Verde escuro
  '#F59E0B', // Ouro / Âmbar
  '#FBBF24', // Dourado claro
  '#6366F1', // Indigo suave
  '#8B5CF6', // Roxo suave
  '#14B8A6', // Teal
]

export function ConfettiCelebracao({
  ativo = false,
  duracao = 2600,
  aoConcluir,
}: ConfettiCelebracaoProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [visivel, setVisivel] = React.useState(ativo)

  React.useEffect(() => {
    if (!ativo) {
      setVisivel(false)
      return
    }

    // Respeita acessibilidade de movimento reduzido
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      aoConcluir?.()
      return
    }

    setVisivel(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const largura = (canvas.width = window.innerWidth)
    const altura = (canvas.height = window.innerHeight)

    const particulas: Particula[] = []
    const totalParticulas = Math.min(Math.floor(largura / 25), 55)

    // Ponto de origem: centro inferior da tela ou centro
    const origemX = largura / 2
    const origemY = altura * 0.45

    for (let i = 0; i < totalParticulas; i++) {
      const angulo = Math.PI * 0.2 + Math.random() * Math.PI * 0.6 // para cima
      const velocidade = 6 + Math.random() * 9
      const ehRetangulo = Math.random() > 0.4
      particulas.push({
        x: origemX + (Math.random() - 0.5) * 60,
        y: origemY + (Math.random() - 0.5) * 30,
        vx: Math.cos(angulo) * velocidade * (Math.random() > 0.5 ? 1 : -1),
        vy: -Math.sin(angulo) * velocidade,
        raio: 3 + Math.random() * 3,
        largura: 6 + Math.random() * 6,
        altura: 4 + Math.random() * 5,
        tipo: ehRetangulo ? 'retangulo' : 'circulo',
        cor: CORES_CELEBRACAO[Math.floor(Math.random() * CORES_CELEBRACAO.length)],
        rotacao: Math.random() * Math.PI * 2,
        vRotacao: (Math.random() - 0.5) * 0.2,
        opacidade: 1,
      })
    }

    let animacaoId: number
    const inicio = performance.now()
    const gravidade = 0.28
    const arrasto = 0.985

    function animar(agora: number) {
      if (!ctx) return
      const decorrido = agora - inicio
      if (decorrido > duracao) {
        setVisivel(false)
        aoConcluir?.()
        return
      }

      ctx.clearRect(0, 0, largura, altura)

      // Fade out no último terço
      const fatorFade = decorrido > duracao * 0.65
        ? Math.max(0, 1 - (decorrido - duracao * 0.65) / (duracao * 0.35))
        : 1

      for (const p of particulas) {
        p.vx *= arrasto
        p.vy += gravidade
        p.x += p.vx
        p.y += p.vy
        p.rotacao += p.vRotacao
        p.opacidade = fatorFade

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotacao)
        ctx.globalAlpha = p.opacidade
        ctx.fillStyle = p.cor

        if (p.tipo === 'retangulo') {
          ctx.fillRect(-p.largura / 2, -p.altura / 2, p.largura, p.altura)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.raio, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()
      }

      animacaoId = requestAnimationFrame(animar)
    }

    animacaoId = requestAnimationFrame(animar)

    return () => {
      cancelAnimationFrame(animacaoId)
    }
  }, [ativo, duracao, aoConcluir])

  if (!visivel && !ativo) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      aria-hidden="true"
    />
  )
}
