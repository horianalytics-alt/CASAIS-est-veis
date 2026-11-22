'use client'

import * as React from 'react'
import { Sun, Moon, Laptop, Check } from 'lucide-react'
import {
  CHAVE_MODO,
  CHAVE_PALETA,
  CHAVE_COR_CUSTOM,
  MODOS,
  PALETAS,
  luminanciaRelativa,
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
  const [corCustom, setCorCustom] = React.useState<string | null>(null)
  const [pickerAberto, setPickerAberto] = React.useState(false)
  const [corHex, setCorHex] = React.useState('#2563EB')
  const [montado, setMontado] = React.useState(false)

  React.useEffect(() => {
    try {
      const modoSalvo = (localStorage.getItem(CHAVE_MODO) as ModoId) || 'sistema'
      const paletaSalva = (localStorage.getItem(CHAVE_PALETA) as PaletaId) || 'cedro'
      const customSalva = localStorage.getItem(CHAVE_COR_CUSTOM)
      setModo(modoSalvo)
      setPaleta(paletaSalva)
      if (customSalva && /^#[0-9A-Fa-f]{6}$/.test(customSalva)) {
        setCorCustom(customSalva)
        setCorHex(customSalva)
      }
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
    setCorCustom(null)
    setPickerAberto(false)
    try {
      localStorage.setItem(CHAVE_PALETA, novaPaleta)
      localStorage.removeItem(CHAVE_COR_CUSTOM)
    } catch {}

    const raiz = document.documentElement
    raiz.style.removeProperty('--primary')
    raiz.style.removeProperty('--primary-foreground')
    raiz.style.removeProperty('--ring')
    raiz.style.removeProperty('--accent')

    if (novaPaleta && novaPaleta !== 'cedro') {
      raiz.dataset.paleta = novaPaleta
    } else {
      delete raiz.dataset.paleta
    }
  }

  const aplicarCorCustom = (hex: string) => {
    const normalizado = hex.startsWith('#') ? hex.toUpperCase() : `#${hex}`.toUpperCase()
    if (!/^#[0-9A-Fa-f]{6}$/.test(normalizado)) return

    const raiz = document.documentElement
    delete raiz.dataset.paleta // remove qualquer paleta fixa
    raiz.style.setProperty('--primary', normalizado)
    const foreground = luminanciaRelativa(normalizado) < 0.179 ? '#FFFFFF' : '#101417'
    raiz.style.setProperty('--primary-foreground', foreground)
    raiz.style.setProperty('--ring', normalizado)
    raiz.style.setProperty('--accent', normalizado + '20')
    setCorCustom(normalizado)
    setCorHex(normalizado)

    try {
      localStorage.setItem(CHAVE_COR_CUSTOM, normalizado)
    } catch {}
    try {
      localStorage.removeItem(CHAVE_PALETA)
    } catch {}
  }

  const ehHexValido = /^#[0-9A-Fa-f]{6}$/.test(corHex.trim())

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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PALETAS.map((p) => {
            const ativo = corCustom === null && paleta === p.id

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => alterarPaleta(p.id)}
                className={cn(
                  'flex min-h-[44px] items-center justify-between rounded-lg border p-3 text-left transition-all cursor-pointer',
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

          {/* Opção Personalizada */}
          <button
            type="button"
            onClick={() => setPickerAberto((aberto) => !aberto)}
            className={cn(
              'flex min-h-[44px] items-center justify-between rounded-lg border p-3 text-left transition-all cursor-pointer',
              corCustom !== null || pickerAberto
                ? 'border-primary bg-primary/5 ring-primary ring-2'
                : 'border-border bg-card hover:bg-muted/40',
            )}
            aria-expanded={pickerAberto}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="size-4 rounded-full shadow-xs shrink-0 border border-black/15 dark:border-white/20"
                style={{ backgroundColor: corCustom || (ehHexValido ? corHex : '#2563EB') }}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">Personalizada</span>
            </div>
            {corCustom !== null && <Check className="text-primary size-4 shrink-0" aria-hidden="true" />}
          </button>
        </div>

        {/* Picker inline de cor customizada */}
        {pickerAberto && (
          <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={ehHexValido ? corHex : '#2563EB'}
                onChange={(e) => {
                  const valor = e.target.value.toUpperCase()
                  setCorHex(valor)
                }}
                className="size-10 cursor-pointer rounded-md border border-input p-0.5 bg-transparent"
                aria-label="Selecionar cor visualmente"
              />
              <input
                type="text"
                value={corHex}
                maxLength={7}
                onChange={(e) => setCorHex(e.target.value)}
                placeholder="#RRGGBB"
                className="font-mono text-sm px-3 py-2 rounded-md border border-input bg-background w-32 uppercase focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Código hexadecimal da cor"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!ehHexValido}
                onClick={() => {
                  if (ehHexValido) {
                    aplicarCorCustom(corHex)
                  }
                }}
              >
                Usar esta cor
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  alterarPaleta('cedro')
                  setCorHex('#2563EB')
                  setPickerAberto(false)
                }}
              >
                Redefinir
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
