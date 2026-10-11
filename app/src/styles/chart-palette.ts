/**
 * Paleta de SÉRIES de gráfico — Finanças a Dois.
 *
 * QUEM IMPORTA: o agente Dash, em `src/components/charts/**` (Onda 2: rosca por
 * categoria, evolução mensal, Pareto, barras por pessoa). O Recharts recebe cor
 * como prop em TypeScript, não como classe CSS — por isso este módulo existe.
 * Na Onda 1 nada importa este arquivo (deliberado, ver docs/design/handoff.md).
 *
 * Fonte dos hex: docs/design/handoff.md, tabela de contraste. As 5 primeiras
 * cores também vivem em globals.css como --chart-1..5 (compatibilidade shadcn);
 * o script de verificação do handoff confere que as duas fontes não divergem.
 *
 * Contraste MEDIDO (WCAG 1.4.11, elemento gráfico, limiar 3:1):
 *   claro  sobre #F7F8F7: menor razão 4.26:1 (telha)
 *   escuro sobre #101417: menor razão 7.02:1 (violeta)
 * Separação perceptual (ΔE CIE76, os 28 pares): menor 29.2 claro / 27.7 escuro.
 *
 * REGRA: cor nunca é o único portador. Use rótulo direto e marcador de forma.
 */

export type ModoTema = "claro" | "escuro";
export type Marcador = "circle" | "square" | "triangle" | "diamond";

/** Série 1..8, ordem fixa, otimizada para as 3 primeiras serem as mais separadas. */
export const SERIES_CLARO: readonly string[] = [
  "#2F6DB5", // 1 azul
  "#C2552F", // 2 telha
  "#0E7F78", // 3 teal
  "#7A5BC4", // 4 violeta
  "#6E7A1F", // 5 oliva
  "#A83A6E", // 6 magenta
  "#9A6B10", // 7 ocre
  "#5B4636", // 8 castanho
];

export const SERIES_ESCURO: readonly string[] = [
  "#6FA8E8", // 1 azul
  "#F08A5E", // 2 telha
  "#3FBDB2", // 3 teal
  "#A992E8", // 4 violeta
  "#AFBE4A", // 5 oliva
  "#E87FAE", // 6 magenta
  "#D9A838", // 7 ocre
  "#C9A68A", // 8 castanho
];

/** Série "Outros": agrupa o excedente além de 8. Cinza neutro, fora da sequência. */
export const SERIE_OUTROS: Readonly<Record<ModoTema, string>> = {
  claro: "#7D878C", // = --border-forte claro, 3.45:1
  escuro: "#6E7A81", // = --border-forte escuro, 4.20:1
};

/** Marcador de forma por série (gráfico de linha). Resolve daltonismo sem legenda. */
export const MARCADORES: readonly Marcador[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "circle",
  "square",
  "triangle",
  "diamond",
];

export const MAX_SERIES = 8;

export function paletaSeries(modo: ModoTema): readonly string[] {
  return modo === "claro" ? SERIES_CLARO : SERIES_ESCURO;
}

/**
 * Cor da série `indice` (0-based). NÃO cicla: índice >= MAX_SERIES devolve a cor
 * de "Outros". Ciclar daria a duas categorias diferentes a mesma cor, o que é
 * mentira visual num gráfico de gastos. O chamador agrupa o excedente em "Outros".
 */
export function corDaSerie(indice: number, modo: ModoTema): string {
  if (!Number.isInteger(indice) || indice < 0 || indice >= MAX_SERIES) {
    return SERIE_OUTROS[modo];
  }
  return paletaSeries(modo)[indice];
}

/**
 * Marcador da série `indice`. Para "Outros" (índice >= 8) devolve "circle" vazado
 * por convenção do chamador; aqui devolve o primeiro marcador.
 */
export function marcadorDaSerie(indice: number): Marcador {
  if (!Number.isInteger(indice) || indice < 0 || indice >= MAX_SERIES) {
    return MARCADORES[0];
  }
  return MARCADORES[indice];
}
