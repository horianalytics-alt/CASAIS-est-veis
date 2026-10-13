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

/** Apara as pontas e colapsa qualquer sequência de espaço/tab em um espaço. */
export function limparNome(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim()
}

/**
 * Chave usada para decidir se dois nomes são "o mesmo": ignora caixa, acento
 * e espaço extra. `Saúde`, `saude` e ` SAÚDE ` têm a mesma chave.
 */
export function chaveDeComparacao(nome: string): string {
  return limparNome(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
