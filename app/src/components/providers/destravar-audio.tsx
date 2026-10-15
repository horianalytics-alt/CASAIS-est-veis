'use client'

import { useEffect } from 'react'
import { destravarAudio } from '@/features/sons/sons'

/**
 * Eventos que o navegador conta como ativação do usuário (HTML, "activation
 * triggering input event"): keydown, mousedown, pointerup de toque e
 * touchend. `pointerdown` de TOQUE não conta — por isso ele não está aqui.
 * `click` entra como reforço: chega depois do pointerup, ainda dentro da
 * ativação, e cobre envio por teclado em leitor de tela.
 */
const EVENTOS_DE_GESTO = ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'] as const

/**
 * Folha sem UI: destrava o WebAudio no primeiro gesto do usuário em QUALQUER
 * ponto da página, e de novo se o sistema suspender o contexto depois (ex.:
 * app em segundo plano). Assim o som de sucesso/erro, que toca depois do
 * `await` da Server Action, encontra o contexto já em `running` e a saída de
 * áudio do aparelho já aberta.
 *
 * Os ouvintes ficam no `document`, em captura, para rodarem antes do handler
 * do botão. Cada chamada é barata: `destravarAudio` sai cedo quando o
 * contexto já está rodando ou quando o som está desligado em Ajustes.
 */
export function DestravarAudio() {
  useEffect(() => {
    const opcoes: AddEventListenerOptions = { capture: true, passive: true }
    const aoGesto = (evento: Event) => {
      // Evento sintético não é gesto. O keydown que o autopreenchimento do
      // navegador dispara na carga é "trusted" mas não ativa a página: quem o
      // barra é o `semAtivacaoAinda()` dentro de `destravarAudio`.
      if (!evento.isTrusted) return
      destravarAudio()
    }
    for (const evento of EVENTOS_DE_GESTO) {
      document.addEventListener(evento, aoGesto, opcoes)
    }
    return () => {
      for (const evento of EVENTOS_DE_GESTO) {
        document.removeEventListener(evento, aoGesto, opcoes)
      }
    }
  }, [])

  return null
}
