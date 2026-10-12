/**
 * Estado vazio: o que é + por que está vazio + como começar.
 *
 * Não é erro e não parece erro: sem ícone de alerta, sem cor semântica de
 * despesa, sem borda vermelha. Sem ilustração — o Vitrine não entregou asset
 * de estado vazio e nenhum foi inventado.
 */
export interface EstadoVazioProps {
  titulo: string
  descricao: string
  acao?: React.ReactNode
}

export function EstadoVazio({ titulo, descricao, acao }: EstadoVazioProps) {
  return (
    <div className="flex flex-col items-center gap-[var(--esp-3)] px-[var(--esp-4)] py-[var(--esp-8)] text-center">
      <h2 className="text-[length:var(--texto-subtitulo)] leading-[var(--texto-subtitulo-lh)] font-semibold">
        {titulo}
      </h2>
      <p className="text-muted-foreground max-w-[28rem] text-[length:var(--texto-corpo)] leading-[var(--texto-corpo-lh)]">
        {descricao}
      </p>
      {acao ? <div className="mt-[var(--esp-2)]">{acao}</div> : null}
    </div>
  )
}
