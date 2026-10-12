/**
 * Mensagem de erro de um campo de formulário.
 *
 * Existe porque este registry do shadcn NÃO tem o primitivo `form` (medido:
 * `npx shadcn@latest add form --dry-run` resolve zero arquivos). Em vez de
 * reimplementar FormField/FormMessage à mão — o que recriaria comportamento de
 * foco e de teclado que não é meu — este componente só anuncia texto.
 *
 * WCAG 1.4.1: erro nunca é comunicado apenas pela borda vermelha. A borda vem
 * do `aria-invalid` do próprio primitivo; a frase vem daqui.
 */

export interface CampoErroProps {
  /** `id` que o input referencia em aria-describedby. */
  id: string
  /** Mensagens do campo (ResultadoAction.camposComErro[campo]). */
  mensagens?: string[]
}

export function CampoErro({ id, mensagens }: CampoErroProps) {
  if (!mensagens || mensagens.length === 0) return null

  return (
    <p
      id={id}
      // role="alert" faz o leitor de tela anunciar sem precisar de foco.
      role="alert"
      className="text-destructive text-[length:var(--texto-apoio)] leading-[var(--texto-apoio-lh)]"
    >
      {mensagens.join(' ')}
    </p>
  )
}
