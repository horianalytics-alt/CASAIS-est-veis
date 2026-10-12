/**
 * Script anti-flash do tema (P-3 do handoff do Vitrine, seção 6).
 *
 * Server Component: só emite uma string constante. Roda ANTES do primeiro
 * paint, bloqueante no <head>, porque a escolha do usuário vive em
 * localStorage e precisa valer antes de qualquer pixel aparecer.
 *
 * A v1 pintava com style.setProperty dentro de useEffect e dava flash branco a
 * cada carga. Aqui o JS só escreve a classe `dark` e o atributo data-paleta; a
 * paleta em si é CSS puro, resolvida pela cascata de globals.css.
 *
 * Por que `dangerouslySetInnerHTML` é seguro aqui: o conteúdo é uma constante
 * escrita neste arquivo, sem nenhuma interpolação de dado de usuário. O que a
 * regra proíbe é HTML vindo de input; não é o caso.
 *
 * Os valores literais ("fad.modo", "fad.paleta", "sistema", "cedro") são cópia
 * de src/styles/tema.ts — o script é string, então não pode importar de lá. Se
 * mudarem no tema.ts, mudam aqui (está dito no cabeçalho do tema.ts).
 */

const SCRIPT = `
(function () {
  try {
    var modo = localStorage.getItem("fad.modo") || "sistema";
    var paleta = localStorage.getItem("fad.paleta") || "cedro";
    var raiz = document.documentElement;

    var escuro =
      modo === "escuro" ||
      (modo === "sistema" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (escuro) raiz.classList.add("dark");
    else raiz.classList.remove("dark");

    if (paleta && paleta !== "cedro") raiz.dataset.paleta = paleta;
    else delete raiz.dataset.paleta;
  } catch (e) {
    /* localStorage bloqueado (janela privada): fica no tema padrão. */
  }
})();
`.trim()

export function TemaScript() {
  // Sem next/script: este precisa ser bloqueante no <head>, e o next/script
  // (mesmo beforeInteractive) não garante execução antes do primeiro paint.
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
}
