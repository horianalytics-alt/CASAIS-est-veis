'use client'

// Folha de cliente: estado de envio (useActionState) e a prévia da casa, que
// é buscada quando o campo do código perde o foco. A page continua Server
// Component.

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  entrarNaFamilia,
  verPreviaDaFamilia,
  type FamiliaIngressada,
  type PreviaDaFamilia,
} from '@/actions/familia'
import type { ResultadoAction } from '@/actions/resultado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CampoErro } from '@/components/ui/campo-erro'
import { ENTRAR_CASA } from '@/features/familia/copy'

type Estado = ResultadoAction<FamiliaIngressada> | null

export function FormEntrarCasa() {
  const router = useRouter()
  const [previa, setPrevia] = useState<PreviaDaFamilia | null>(null)
  const [previaVazia, setPreviaVazia] = useState(false)
  const [buscando, iniciarBusca] = useTransition()

  const [estado, enviar, pendente] = useActionState<Estado, FormData>(
    // Adaptador de aridade: entrarNaFamilia recebe só (formData), enquanto o
    // useActionState chama (anterior, payload).
    async (_anterior, formData) => {
      const resultado = await entrarNaFamilia(formData)
      if (resultado.ok) {
        router.replace('/inicio')
        router.refresh()
      }
      return resultado
    },
    null,
  )

  const falhou = estado !== null && !estado.ok
  const campos = falhou ? estado.camposComErro : undefined

  /**
   * Confirma a casa ANTES de entrar: o código é digitado à mão e um dígito
   * errado levaria a pessoa para a casa de outra família sem ela perceber.
   *
   * `verPreviaDaFamilia` devolve `sucesso(null)` quando o código não existe
   * (zero linhas, não erro), então `dados === null` é "não encontrei", não
   * falha. Chamo em transition para não travar o campo.
   */
  function buscarPrevia(codigo: string) {
    const limpo = codigo.trim().toUpperCase()
    setPrevia(null)
    setPreviaVazia(false)
    if (limpo.length !== 6) return

    iniciarBusca(async () => {
      const resultado = await verPreviaDaFamilia(limpo)
      if (resultado.ok) {
        if (resultado.dados) setPrevia(resultado.dados)
        else setPreviaVazia(true)
      }
    })
  }

  return (
    <form action={enviar} className="flex flex-col gap-[var(--esp-4)]" noValidate>
      {falhou && !campos ? (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="codigo">{ENTRAR_CASA.codigoLabel}</Label>
        <Input
          id="codigo"
          name="codigo"
          placeholder={ENTRAR_CASA.codigoPlaceholder}
          maxLength={6}
          // O alfabeto é [A-Z2-9] e a action já faz toUpperCase. Não revalido
          // o conjunto aqui: duas validações divergem com o tempo.
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          // Mono tabular para o código não ter caractere ambíguo. NÃO uso a
          // classe .valor aqui: ela força text-align:right (útil para dinheiro
          // em coluna), e num campo de digitação o cursor começaria na direita.
          className="font-mono num-tabular tracking-[0.2em]"
          onBlur={(e) => buscarPrevia(e.target.value)}
          aria-invalid={campos?.codigo ? true : undefined}
          aria-describedby={campos?.codigo ? 'erro-codigo ajuda-codigo' : 'ajuda-codigo'}
          disabled={pendente}
        />
        <p
          id="ajuda-codigo"
          className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]"
        >
          {ENTRAR_CASA.codigoApoio}
        </p>
        <CampoErro id="erro-codigo" mensagens={campos?.codigo} />

        {/* aria-live: a prévia chega depois do blur, sem o usuário pedir, e
            precisa ser anunciada por leitor de tela. */}
        <div aria-live="polite" className="min-h-[1.5rem]">
          {buscando ? (
            <p className="text-muted-foreground text-[length:var(--texto-apoio)]">
              Procurando…
            </p>
          ) : previa ? (
            <p className="text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]">
              {ENTRAR_CASA.previaEncontrada}{' '}
              <strong className="font-semibold">{previa.nome}</strong>
              {previa.temVaga ? null : (
                <span className="text-destructive">
                  {' '}
                  — {ENTRAR_CASA.previaSemVaga}
                </span>
              )}
            </p>
          ) : previaVazia ? (
            <p className="text-destructive text-[length:var(--texto-apoio)]">
              {ENTRAR_CASA.previaNaoEncontrada}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="nomeDoMembroEntrar">{ENTRAR_CASA.seuNomeLabel}</Label>
        <Input
          id="nomeDoMembroEntrar"
          name="nomeDoMembro"
          placeholder={ENTRAR_CASA.seuNomePlaceholder}
          maxLength={40}
          autoComplete="given-name"
          aria-invalid={campos?.nomeDoMembro ? true : undefined}
          aria-describedby={campos?.nomeDoMembro ? 'erro-nomeDoMembroEntrar' : undefined}
          disabled={pendente}
        />
        <CampoErro
          id="erro-nomeDoMembroEntrar"
          mensagens={campos?.nomeDoMembro}
        />
      </div>

      <div className="flex flex-col gap-[var(--esp-2)]">
        <Label htmlFor="rendaEntrar">{ENTRAR_CASA.rendaLabel}</Label>
        <Input
          id="rendaEntrar"
          name="renda"
          inputMode="decimal"
          placeholder="0,00"
          aria-invalid={campos?.renda ? true : undefined}
          aria-describedby={campos?.renda ? 'erro-rendaEntrar ajuda-rendaEntrar' : 'ajuda-rendaEntrar'}
          disabled={pendente}
        />
        <p
          id="ajuda-rendaEntrar"
          className="text-muted-foreground text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]"
        >
          {ENTRAR_CASA.rendaApoio}
        </p>
        <CampoErro id="erro-rendaEntrar" mensagens={campos?.renda} />
      </div>

      <Button
        type="submit"
        size="toque"
        variant="outline"
        disabled={pendente}
        className="w-full"
      >
        {pendente ? ENTRAR_CASA.enviando : ENTRAR_CASA.enviar}
      </Button>
    </form>
  )
}
