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
    var corCustom = localStorage.getItem("fad.cor-custom");
    var raiz = document.documentElement;

    var escuro =
      modo === "escuro" ||
      (modo === "sistema" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (escuro) raiz.classList.add("dark");
    else raiz.classList.remove("dark");

    if (corCustom && /^#[0-9A-Fa-f]{6}$/.test(corCustom)) {
      delete raiz.dataset.paleta;
      raiz.style.setProperty("--primary", corCustom);
      var s = corCustom.replace("#", "");
      var r = parseInt(s.slice(0, 2), 16) / 255;
      var g = parseInt(s.slice(2, 4), 16) / 255;
      var b = parseInt(s.slice(4, 6), 16) / 255;
      var lin = function (c) {
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      var lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      raiz.style.setProperty("--primary-foreground", lum < 0.179 ? "#FFFFFF" : "#101417");
      raiz.style.setProperty("--ring", corCustom);
      raiz.style.setProperty("--accent", corCustom + "20");
    } else if (paleta && paleta !== "cedro") {
      raiz.style.removeProperty("--primary");
      raiz.style.removeProperty("--primary-foreground");
      raiz.style.removeProperty("--ring");
      raiz.style.removeProperty("--accent");
      raiz.dataset.paleta = paleta;
    } else {
      raiz.style.removeProperty("--primary");
      raiz.style.removeProperty("--primary-foreground");
      raiz.style.removeProperty("--ring");
      raiz.style.removeProperty("--accent");
      delete raiz.dataset.paleta;
    }
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
