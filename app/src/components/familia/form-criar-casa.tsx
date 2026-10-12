'use client'

// 'use client' porque este formulário tem estado de envio (useActionState) e
// precisa do resultado da action para pintar erro de campo sem recarregar.
// É folha: a page que o renderiza continua Server Component.

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarFamilia, type FamiliaCriada } from '@/actions/familia'
import type { ResultadoAction } from '@/actions/resultado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CampoErro } from '@/components/ui/campo-erro'
import { CRIAR_CASA, CASA_CRIADA } from '@/features/familia/copy'

type Regra = 'equal' | 'proportional'

export function FormCriarCasa() {
  const router = useRouter()
  const [regra, setRegra] = useState<Regra>('equal')

  // A action recebe (formData) — um argumento. O useActionState chama
  // (estadoAnterior, payload). Passar a action direto não compila; o
  // adaptador de aridade vive aqui, no client.
  const [estado, enviar, pendente] = useActionState(
    async (
      _anterior: ResultadoAction<FamiliaCriada> | null,
      formData: FormData,
    ) => criarFamilia(formData),
    null,
  )

  const erros = estado && !estado.ok ? estado.camposComErro : undefined
  const erroGeral = estado && !estado.ok ? estado.erro : undefined

  // Depois de criar, mostramos o código de convite antes de seguir: é o que a
  // outra pessoa digita para entrar na casa, e sumiria se navegássemos já.
  if (estado?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">{CASA_CRIADA.titulo}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Compartilhe este código com quem mora com você. É com ele que a
            outra pessoa entra na casa.
          </p>
        </div>

        <div className="border-input rounded-lg border p-4 text-center">
          <span className="valor num-tabular text-3xl tracking-[0.2em]">
            {estado.dados.codigoDeConvite}
          </span>
        </div>

        <p className="text-muted-foreground text-sm">
          Você pode ver este código de novo nos ajustes da casa.
        </p>

        <Button
          size="toque"
          onClick={() => router.replace('/inicio')}
          className="w-full"
        >
          {CASA_CRIADA.continuar}
        </Button>
      </div>
    )
  }

  return (
    <form action={enviar} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nomeDaFamilia">{CRIAR_CASA.nomeDaCasaLabel}</Label>
        <Input
          id="nomeDaFamilia"
          name="nomeDaFamilia"
          placeholder={CRIAR_CASA.nomeDaCasaPlaceholder}
          autoComplete="off"
          required
          aria-invalid={erros?.nomeDaFamilia ? true : undefined}
          aria-describedby={
            erros?.nomeDaFamilia ? 'erro-nomeDaFamilia' : undefined
          }
          disabled={pendente}
        />
        <CampoErro id="erro-nomeDaFamilia" mensagens={erros?.nomeDaFamilia} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nomeDoMembro">{CRIAR_CASA.seuNomeLabel}</Label>
        <Input
          id="nomeDoMembro"
          name="nomeDoMembro"
          placeholder={CRIAR_CASA.seuNomePlaceholder}
          autoComplete="given-name"
          required
          aria-invalid={erros?.nomeDoMembro ? true : undefined}
          aria-describedby={
            erros?.nomeDoMembro ? 'erro-nomeDoMembro' : undefined
          }
          disabled={pendente}
        />
        <CampoErro id="erro-nomeDoMembro" mensagens={erros?.nomeDoMembro} />
      </div>

      {/* Radio nativo em fieldset: navegação por seta e agrupamento no leitor
          de tela saem de graça, sem reimplementar um RadioGroup. */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">{CRIAR_CASA.regraLabel}</legend>
        <p className="text-muted-foreground text-sm">
          Vale para os gastos da casa. Você pode mudar depois.
        </p>

        <div className="mt-1 flex flex-col gap-1">
          <label className="border-input flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3">
            <input
              type="radio"
              name="regraDeDivisao"
              value="equal"
              checked={regra === 'equal'}
              onChange={() => setRegra('equal')}
              className="size-4"
            />
            <span className="text-sm">{CRIAR_CASA.regraIgual}</span>
          </label>

          <label className="border-input flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3">
            <input
              type="radio"
              name="regraDeDivisao"
              value="proportional"
              checked={regra === 'proportional'}
              onChange={() => setRegra('proportional')}
              className="size-4"
            />
            <span className="text-sm">{CRIAR_CASA.regraProporcional}</span>
          </label>
        </div>

        <CampoErro id="erro-regraDeDivisao" mensagens={erros?.regraDeDivisao} />
      </fieldset>

      {/* A renda fica sempre visível: escondê-la na regra "metade" faria o
          valor digitado sumir ao trocar de regra e voltar. */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="renda">
          Sua renda por mês{' '}
          <span className="text-muted-foreground font-normal">
            {regra === 'proportional' ? '(necessária)' : '(opcional)'}
          </span>
        </Label>
        <Input
          id="renda"
          name="renda"
          inputMode="decimal"
          placeholder="0,00"
          aria-required={regra === 'proportional' ? true : undefined}
          aria-invalid={erros?.renda ? true : undefined}
          aria-describedby="ajuda-renda"
          disabled={pendente}
        />
        <p id="ajuda-renda" className="text-muted-foreground text-sm">
          {regra === 'proportional'
            ? 'Usada para calcular a parte de cada um nos gastos da casa.'
            : 'Só é usada se vocês mudarem para a divisão proporcional.'}
        </p>
        <CampoErro id="erro-renda" mensagens={erros?.renda} />
      </div>

      {erroGeral ? (
        <Alert variant="destructive">
          <AlertDescription>{erroGeral}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="toque" disabled={pendente} className="w-full">
        {pendente ? CRIAR_CASA.enviando : CRIAR_CASA.enviar}
      </Button>
    </form>
  )
}
