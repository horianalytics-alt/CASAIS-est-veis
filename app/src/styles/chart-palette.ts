/**
 * Paleta de SÉRIES de gráfico — Finanças a Dois.
 *
 * QUEM IMPORTA (2026-10-15): src/components/analises/grafico-rosca-categorias.tsx
 * (SERIES_CLARO/ESCURO, SERIE_OUTROS, MARCADORES) e
 * src/components/analises/previsao-fixos.tsx (corDaSerie 0..2). grafico-linha.tsx
 * e grafico-orcamento.tsx consomem só a série 1 via var(--chart-1) do globals.css.
 *
 * Fonte dos hex: docs/design/handoff.md §5. As 5 primeiras cores também vivem em
 * globals.css como --chart-1..5 (compatibilidade shadcn); o script
 * docs/design/scripts/series-de.js confere que as duas fontes não divergem.
 *
 * VALIDADOR (gate): dataviz/scripts/validate_palette.js — OKLab ΔE×100, CVD
 * Machado 2009 sev. 1.0, pares ADJACENTES. Re-trabalhada em 2026-10-15 (P-011):
 * a paleta anterior reprovava banda de L / piso de croma (e, no escuro, o piso
 * de visão normal). Números MEDIDOS da paleta abaixo:
 *   claro  (sup. #FFFFFF card, #F7F8F7 bg, #EDF0EF muted): ALL CHECKS PASS
 *     L 0.440–0.613 (banda 0.43–0.77), C mín 0.105 (castanho), CVD adj. mín 10.4
 *     (deutan, telha↔teal e oliva↔magenta), visão normal adj. mín 18.0
 *     (ocre↔castanho); contraste mín 3.80:1 card / 3.57:1 bg / 3.32:1 muted (ocre).
 *   escuro (sup. #171C20 card, #101417 bg): ALL CHECKS PASS
 *     L 0.528–0.664 (banda 0.48–0.67), C mín 0.105, CVD adj. mín 10.4 (deutan,
 *     telha↔teal), visão normal adj. mín 15.8 (ocre↔castanho); contraste mín
 *     3.10:1 card / 3.35:1 bg (castanho).
 *     Sobre #1E242A (muted/popover) o castanho cai para 2.83:1 (WARN do
 *     validador): fora do card, a série 8 só aparece com rótulo de texto ao lado.
 *   Séries 1–3 também passam em TODOS os pares (dispersão, small multiples):
 *     claro CVD 10.4 / normal 15.8; escuro CVD 10.4 / normal 16.1.
 *   O conjunto das 8 NÃO passa em todos os pares (pior: oliva↔ocre, slots 5/7,
 *   normal 9.8 claro / 8.4 escuro; reordenar não muda). Gráfico em que qualquer
 *   par pode encostar: no máximo 3 séries.
 *
 * REGRA: cor nunca é o único portador. Use rótulo direto e marcador de forma.
 */

export type ModoTema = "claro" | "escuro";
export type Marcador = "circle" | "square" | "triangle" | "diamond";

/**
 * Série 1..8, ordem fixa (a ordem é o mecanismo de segurança CVD: só vizinhos se
 * tocam). Nunca ciclar. Comentário = OKLCH L/C e contraste vs card.
 */
export const SERIES_CLARO: readonly string[] = [
  "#2F6DB5", // 1 azul      L .531 C .130  5.28:1  (inalterada)
  "#C2552F", // 2 telha     L .582 C .149  4.53:1  (inalterada)
  "#0D8A71", // 3 teal      L .566 C .106  4.29:1  (era #0E7F78, C .091 < piso)
  "#7A5BC4", // 4 violeta   L .554 C .158  5.10:1  (inalterada)
  "#6E7A1F", // 5 oliva     L .552 C .113  4.70:1  (inalterada)
  "#A83A6E", // 6 magenta   L .520 C .153  6.01:1  (inalterada)
  "#AB7A10", // 7 ocre      L .613 C .123  3.80:1  (era #9A6B10; clareou p/ separar do castanho)
  "#7D4005", // 8 castanho  L .440 C .105  8.05:1  (era #5B4636, L .412 e C .038)
];

export const SERIES_ESCURO: readonly string[] = [
  "#5794DF", // 1 azul      L .659 C .129  5.48:1  (era #6FA8E8, L .718 > banda)
  "#D15B41", // 2 telha     L .615 C .155  4.32:1  (era #F08A5E, L .734)
  "#1B947E", // 3 teal      L .599 C .105  4.56:1  (era #3FBDB2, L .727)
  "#8760CB", // 4 violeta   L .579 C .161  3.73:1  (era #A992E8, L .714)
  "#7CA245", // 5 oliva     L .664 C .129  5.81:1  (era #AFBE4A, L .767)
  "#BA4E84", // 6 magenta   L .580 C .151  3.69:1  (era #E87FAE, L .725)
  "#B18E15", // 7 ocre      L .661 C .130  5.52:1  (era #D9A838, L .758)
  "#9B572E", // 8 castanho  L .528 C .105  3.10:1  (era #C9A68A, L .749 e C .057)
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
