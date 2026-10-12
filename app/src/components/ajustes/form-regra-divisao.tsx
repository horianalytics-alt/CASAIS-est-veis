'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AJUSTES_FAMILIA } from '@/features/ajustes/copy'
import { cn } from '@/lib/utils'

export function FormRegraDivisao({
  familiaId,
  regraAtual,
}: {
  familiaId: string
  regraAtual: string
}) {
  const router = useRouter()
  const [regra, setRegra] = React.useState(regraAtual)
  const [pendente, setPendente] = React.useState(false)
  const [mensagem, setMensagem] = React.useState<string | null>(null)

  const aoSalvar = async () => {
    setPendente(true)
    setMensagem(null)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('families')
        .update({ split_rule: regra })
        .eq('id', familiaId)

      if (!error) {
        setMensagem(AJUSTES_FAMILIA.regraSalva)
        router.refresh()
      } else {
        setMensagem('Não foi possível salvar a regra.')
      }
    } finally {
      setPendente(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {mensagem && (
        <Alert>
          <AlertDescription>{mensagem}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setRegra('equal')}
          className={cn(
            'flex min-h-[56px] flex-col justify-center rounded-xl border p-4 text-left transition-all',
            regra === 'equal'
              ? 'border-primary bg-primary/5 ring-primary ring-2'
              : 'border-border bg-card hover:bg-muted/40',
          )}
        >
          <span className="text-sm font-semibold">{AJUSTES_FAMILIA.regraIgual}</span>
          <span className="text-muted-foreground text-xs mt-0.5">
            Metade para cada um em todas as despesas compartilhadas
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRegra('proportional')}
          className={cn(
            'flex min-h-[56px] flex-col justify-center rounded-xl border p-4 text-left transition-all',
            regra === 'proportional'
              ? 'border-primary bg-primary/5 ring-primary ring-2'
              : 'border-border bg-card hover:bg-muted/40',
          )}
        >
          <span className="text-sm font-semibold">{AJUSTES_FAMILIA.regraProporcional}</span>
          <span className="text-muted-foreground text-xs mt-0.5">
            Baseado na proporção de renda líquida declarada por cada um
          </span>
        </button>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="toque"
          onClick={aoSalvar}
          disabled={pendente || regra === regraAtual}
        >
          {pendente ? AJUSTES_FAMILIA.salvando : AJUSTES_FAMILIA.salvarRegra}
        </Button>
      </div>
    </div>
  )
}
