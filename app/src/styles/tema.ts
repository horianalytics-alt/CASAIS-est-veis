/**
 * Metadados do tema escolhível — Finanças a Dois.
 *
 * QUEM IMPORTA: a Fachada, em dois lugares:
 *   1. o script inline anti-flash do <head> (usa CHAVE_MODO, CHAVE_PALETA e os
 *      defaults) — o script é string, então copie os valores literais dele;
 *   2. o seletor de paleta/modo em /ajustes (usa PALETAS, MODOS).
 *
 * Os hex de `swatch` são os --primary de globals.css, medidos em
 * docs/design/handoff.md. Se mudar um lá, mude aqui.
 * Nomes em pt-BR são rótulos de UI do seletor; a Fachada pode reescrevê-los.
 */

export type ModoId = "claro" | "escuro" | "sistema";
export type PaletaId = "cedro" | "ardosia" | "terra" | "ameixa";

export const CHAVE_MODO = "fad.modo";
export const CHAVE_PALETA = "fad.paleta";

export const MODO_PADRAO: ModoId = "sistema";
export const PALETA_PADRAO: PaletaId = "cedro";

export const MODOS: readonly ModoId[] = ["claro", "escuro", "sistema"];

export interface PaletaInfo {
  id: PaletaId;
  nome: string;
  /** --primary em cada modo, para o círculo de amostra do seletor. */
  swatch: { claro: string; escuro: string };
}

export const PALETAS: readonly PaletaInfo[] = [
  { id: "cedro", nome: "Cedro", swatch: { claro: "#14594A", escuro: "#5FD3B2" } },
  { id: "ardosia", nome: "Ardósia", swatch: { claro: "#1C4F80", escuro: "#7FB8F2" } },
  { id: "terra", nome: "Terra", swatch: { claro: "#9E3F23", escuro: "#F09070" } },
  { id: "ameixa", nome: "Ameixa", swatch: { claro: "#6B2A5E", escuro: "#D98FC6" } },
];

export function ehPaletaId(valor: unknown): valor is PaletaId {
  return PALETAS.some((p) => p.id === valor);
}

export function ehModoId(valor: unknown): valor is ModoId {
  return MODOS.some((m) => m === valor);
}
