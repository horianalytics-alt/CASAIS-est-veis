'use client'

import * as React from 'react'
import { Sun, Moon, Laptop, Check } from 'lucide-react'
import {
  CHAVE_MODO,
  CHAVE_PALETA,
  MODOS,
  PALETAS,
  type ModoId,
  type PaletaId,
} from '@/styles/tema'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AJUSTES } from '@/features/ajustes/copy'
import { cn } from '@/lib/utils'

export function SeletorTema() {
  const [modo, setModo] = React.useState<ModoId>('sistema')
  const [paleta, setPaleta] = React.useState<PaletaId>('cedro')
  const [montado, setMontado] = React.useState(false)

  React.useEffect(() => {
    try {
      const modoSalvo = (localStorage.getItem(CHAVE_MODO) as ModoId) || 'sistema'
      const paletaSalva = (localStorage.getItem(CHAVE_PALETA) as PaletaId) || 'cedro'
      setModo(modoSalvo)
      setPaleta(paletaSalva)
    } catch {
      /* fallback se localStorage bloqueado */
    }
    setMontado(true)
  }, [])

  const alterarModo = (novoModo: ModoId) => {
    setModo(novoModo)
    try {
      localStorage.setItem(CHAVE_MODO, novoModo)
    } catch {}

    const raiz = document.documentElement
    const escuro =
      novoModo === 'escuro' ||
      (novoModo === 'sistema' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)

    if (escuro) raiz.classList.add('dark')
    else raiz.classList.remove('dark')
  }

  const alterarPaleta = (novaPaleta: PaletaId) => {
    setPaleta(novaPaleta)
    try {
      localStorage.setItem(CHAVE_PALETA, novaPaleta)
    } catch {}

    const raiz = document.documentElement
    if (novaPaleta && novaPaleta !== 'cedro') {
      raiz.dataset.paleta = novaPaleta
    } else {
      delete raiz.dataset.paleta
    }
  }

  if (!montado) return null

  return (
    <div className="flex flex-col gap-6">
      {/* Seletor de Modo */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">{AJUSTES.modo}</Label>
        <div className="grid grid-cols-3 gap-2">
          {MODOS.map((m) => {
            const ativo = modo === m
            const Icone = m === 'claro' ? Sun : m === 'escuro' ? Moon : Laptop
            const rotulo =
              m === 'claro'
                ? AJUSTES.modoClaro
                : m === 'escuro'
                  ? AJUSTES.modoEscuro
                  : AJUSTES.modoSistema

            return (
              <Button
                key={m}
                type="button"
                variant={ativo ? 'default' : 'outline'}
                size="toque"
                onClick={() => alterarModo(m)}
                className={cn(
                  'flex items-center justify-center gap-2 text-sm',
                  ativo && 'font-semibold',
                )}
              >
                <Icone className="size-4" aria-hidden="true" />
                {rotulo}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Seletor de Paleta */}
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">{AJUSTES.paleta}</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PALETAS.map((p) => {
            const ativo = paleta === p.id

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => alterarPaleta(p.id)}
                className={cn(
                  'flex min-h-[44px] items-center justify-between rounded-lg border p-3 text-left transition-all',
                  ativo
                    ? 'border-primary bg-primary/5 ring-primary ring-2'
                    : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="size-4 rounded-full shadow-xs shrink-0"
                    style={{ backgroundColor: p.swatch.claro }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{p.nome}</span>
                </div>
                {ativo && <Check className="text-primary size-4 shrink-0" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
