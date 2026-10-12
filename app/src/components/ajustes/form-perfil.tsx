'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseBRLInput } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AJUSTES_PERFIL } from '@/features/ajustes/copy'

export function FormPerfil({
  membroId,
  nomeInicial,
  rendaInicial,
}: {
  membroId: string
  nomeInicial: string
  rendaInicial: number | null
}) {
  const router = useRouter()
  const [nome, setNome] = React.useState(nomeInicial)
  const [renda, setRenda] = React.useState(
    rendaInicial !== null ? String(rendaInicial).replace('.', ',') : '',
  )
  const [pendente, setPendente] = React.useState(false)
  const [mensagem, setMensagem] = React.useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const aoSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      setMensagem({ tipo: 'erro', texto: 'Informe seu nome de exibição.' })
      return
    }

    setPendente(true)
    setMensagem(null)

    try {
      const rendaNumerica = renda.trim() ? parseBRLInput(renda) : null
      const supabase = createClient()
      const { error } = await supabase
        .from('family_members')
        .update({
          display_name: nome.trim(),
          monthly_income: Number.isNaN(rendaNumerica) ? null : rendaNumerica,
        })
        .eq('id', membroId)

      if (!error) {
        setMensagem({ tipo: 'ok', texto: AJUSTES_PERFIL.sucesso })
        router.refresh()
      } else {
        setMensagem({ tipo: 'erro', texto: 'Não foi possível salvar o perfil.' })
      }
    } finally {
      setPendente(false)
    }
  }

  return (
    <form onSubmit={aoSalvar} className="flex flex-col gap-4">
      {mensagem && (
        <Alert variant={mensagem.tipo === 'erro' ? 'destructive' : 'default'}>
          <AlertDescription>{mensagem.texto}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">{AJUSTES_PERFIL.nome}</Label>
        <Input
          id="nome"
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={AJUSTES_PERFIL.nomePlaceholder}
          required
          className="min-h-[44px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="renda">{AJUSTES_PERFIL.renda}</Label>
        <Input
          id="renda"
          type="text"
          inputMode="decimal"
          value={renda}
          onChange={(e) => setRenda(e.target.value)}
          placeholder="0,00"
          className="min-h-[44px]"
        />
        <p className="text-muted-foreground text-xs">{AJUSTES_PERFIL.rendaDica}</p>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" size="toque" disabled={pendente}>
          {pendente ? AJUSTES_PERFIL.salvando : AJUSTES_PERFIL.salvar}
        </Button>
      </div>
    </form>
  )
}
