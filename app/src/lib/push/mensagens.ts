/**
 * Texto das notificações push. Puro: sem servidor, sem banco.
 *
 * Regra do plano (R-1): a notificação NUNCA leva valor monetário. Ela aparece
 * na tela bloqueada do celular — "Carol gastou R$ 500" ficaria visível para
 * quem estiver ao lado. Diz só QUEM fez O QUÊ; o detalhe fica no app.
 *
 * O formato `{ titulo, corpo, url }` é o contrato do handler de push em
 * public/sw.js — mudar um nome aqui exige mudar lá.
 */
export type EventoPush = 'lancamento' | 'fatura' | 'acerto' | 'edicao'

export type MensagemPush = { titulo: string; corpo: string; url: string }

export const LIMITE_NOME_NA_NOTIFICACAO = 40

const TITULO = 'Finanças a Dois'
const NOME_PADRAO = 'Alguém da sua casa'

function nomeExibivel(nome: string): string {
  // Array.from separa por code point: `slice` puro cortaria um emoji ao meio
  // e deixaria um surrogate solto na tela bloqueada.
  const limpo = Array.from(nome.trim()).slice(0, LIMITE_NOME_NA_NOTIFICACAO).join('').trim()
  return limpo === '' ? NOME_PADRAO : limpo
}

/**
 * `quantidade` = itens do lote salvo de uma vez (não parcelas: um lançamento
 * em 3x é UM lançamento para quem lançou).
 */
export function mensagemDoEvento(evento: EventoPush, nome: string, quantidade = 1): MensagemPush {
  const quem = nomeExibivel(nome)
  switch (evento) {
    case 'lancamento':
      return {
        titulo: TITULO,
        corpo:
          quantidade > 1
            ? `${quem} registrou ${quantidade} lançamentos`
            : `${quem} registrou um lançamento`,
        url: '/inicio',
      }
    case 'edicao':
      // Editar muda o acerto do mês (valor, conta, quem pagou): o parceiro
      // precisa saber, sem o valor na tela bloqueada.
      return {
        titulo: TITULO,
        corpo:
          quantidade > 1
            ? `${quem} editou ${quantidade} lançamentos`
            : `${quem} editou um lançamento`,
        url: '/inicio',
      }
    case 'fatura':
      return { titulo: TITULO, corpo: `${quem} pagou uma fatura do cartão`, url: '/carteira' }
    case 'acerto':
      return { titulo: TITULO, corpo: `${quem} registrou um acerto de contas`, url: '/acerto' }
  }
}
