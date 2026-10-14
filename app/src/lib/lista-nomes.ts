/**
 * Lista de nomes digitada pelo usuário ("Pet, Presentes, Viagem").
 *
 * Módulo PURO: sem import de servidor. A tela importa daqui para a prévia ao
 * vivo e as Server Actions importam daqui para gravar — assim a prévia nunca
 * diz uma coisa e o servidor faz outra.
 */

/** Máximo de caracteres por nome (comprimento = `String.length`). */
export const LIMITE_CARACTERES = 40

/** Máximo de nomes distintos por lote. */
export const LIMITE_NOMES = 50

/**
 * Caracteres invisíveis que não têm lugar num nome: zero-width space/non-joiner/
 * joiner (U+200B..U+200D), word joiner (U+2060), BOM/zero-width no-break space
 * (U+FEFF) e soft hyphen (U+00AD). Sem isso "Pet" e "Pet<zero-width>" seriam
 * dois nomes diferentes que parecem idênticos na tela (P-008, Sentinela R4).
 */
const INVISIVEIS = /[\u{200b}-\u{200d}\u{2060}\u{feff}\u{ad}]/gu

/** Marcas combinantes (acentos) depois da decomposição NFD. */
const MARCAS = /[\u{300}-\u{36f}]/gu

/**
 * Remove invisíveis, apara as pontas e colapsa qualquer sequência de espaço
 * (inclusive tab, quebra de linha e espaço não separável) em um espaço.
 */
export function limparNome(nome: string): string {
  return nome.replace(INVISIVEIS, '').replace(/\s+/g, ' ').trim()
}

/**
 * Chave usada para decidir se dois nomes são "o mesmo": ignora caixa, acento,
 * invisível e espaço extra. `Saúde`, `saude` e ` SAÚDE ` têm a mesma chave.
 *
 * ESPELHO EXATO de public.chave_nome() (migration 00011), que é a expressão dos
 * índices únicos de categories, payment_methods e category_groups. Mesma ordem:
 * invisíveis -> NFD -> sem marcas -> colapsa espaço -> apara -> minúscula. As
 * marcas saem ANTES de colapsar o espaço para que "a <acento solto> b" vire
 * "a b", e não "a  b". Mudou aqui? Mude a função SQL numa migration nova (e
 * REINDEX nos três índices) — senão a action e o banco discordam.
 */
export function chaveDeComparacao(nome: string): string {
  return nome
    .replace(INVISIVEIS, '')
    .normalize('NFD')
    .replace(MARCAS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Separa por vírgula e por quebra de linha, limpa cada item, descarta vazios e
 * remove duplicatas mantendo a primeira grafia digitada.
 *
 * NÃO aplica os limites (LIMITE_CARACTERES, LIMITE_NOMES): isso é do Zod da action,
 * que importa as mesmas constantes.
 *
 * separarNomes('Pet, Presentes ,, pet')
 *   -> { nomes: ['Pet', 'Presentes'], descartados: ['pet'] }
 */
export function separarNomes(texto: string): { nomes: string[]; descartados: string[] } {
  const nomes: string[] = []
  const descartados: string[] = []
  const vistos = new Set<string>()

  for (const parte of texto.split(/[,\r\n]/)) {
    const nome = limparNome(parte)
    if (nome === '') continue

    const chave = chaveDeComparacao(nome)
    if (vistos.has(chave)) {
      descartados.push(nome)
    } else {
      vistos.add(chave)
      nomes.push(nome)
    }
  }

  return { nomes, descartados }
}
