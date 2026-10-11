// Mede, a partir dos ARQUIVOS emitidos: contraste das series, DeltaE CIE76 entre pares,
// protanopia receita/despesa, e consistencia chart-palette.ts <-> globals.css (--chart-1..5, serie-outros)
const fs = require('fs');
const ts = fs.readFileSync(process.argv[2], 'utf8');
const css = fs.readFileSync(process.argv[3], 'utf8');
const arr = nome => { const m = ts.match(new RegExp(nome + '[^=]*=\\s*\\[([^\\]]*)\\]')); return [...m[1].matchAll(/"(#[0-9A-Fa-f]{6})"/g)].map(x => x[1].toUpperCase()); };
const claro = arr('SERIES_CLARO'), escuro = arr('SERIES_ESCURO');
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const L = h => { const c = rgb(h).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function lab(rgbLin) {
  const [r, g, b] = rgbLin;
  let X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b, Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b, Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  X /= 0.95047; Z /= 1.08883;
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const labOf = h => lab(rgb(h).map(lin));
const PROT = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
const DEUT = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]];
const TRIT = [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]];
const sim = (h, M) => { const c = rgb(h).map(lin); return M.map(row => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))); };
const labSim = (h, M) => lab(sim(h, M));
const out = [];
function bloco(nome, s, bg, card) {
  let min = 99, minNome = '', minCr = 99, minCrNome = '';
  for (let i = 0; i < s.length; i++) {
    const a = cr(s[i], bg), b = cr(s[i], card);
    if (a < minCr) { minCr = a; minCrNome = `S${i + 1} ${s[i]}`; }
    out.push(`  ${nome} S${i + 1} ${s[i]}  /background ${a.toFixed(2)}:1  /card ${b.toFixed(2)}:1  ${a >= 3 && b >= 3 ? 'OK(>=3)' : 'FAIL'}`);
    for (let j = i + 1; j < s.length; j++) { const d = dE(labOf(s[i]), labOf(s[j])); if (d < min) { min = d; minNome = `S${i + 1}-S${j + 1}`; } }
  }
  out.push(`  ${nome}: menor contraste ${minCr.toFixed(2)}:1 (${minCrNome}); menor DeltaE entre ${s.length * (s.length - 1) / 2} pares = ${min.toFixed(1)} (${minNome})`);
}
out.push('SERIES CLARO'); bloco('claro', claro, '#F7F8F7', '#FFFFFF');
out.push('SERIES ESCURO'); bloco('escuro', escuro, '#101417', '#171C20');
// dicromacia: receita vs despesa e pago vs pendente
const tok = (bloco, nome) => { const m = bloco.match(new RegExp(nome + '\\s*:\\s*(#[0-9A-Fa-f]{6})')); return m[1].toUpperCase(); };
const rootBlk = css.match(/:root\s*\{([^}]*)\}/)[1], darkBlk = css.match(/\n\.dark\s*\{([^}]*)\}/)[1];
for (const [nome, blk] of [['claro', rootBlk], ['escuro', darkBlk]]) {
  const r = tok(blk, '--receita'), d = tok(blk, '--despesa'), p = tok(blk, '--pendente'), n = tok(blk, '--negativo');
  const f = (a, b) => ['visao normal', labOf(a), labOf(b)];
  const linha = (rot, a, b) => `  ${nome} ${rot}: normal ${dE(labOf(a), labOf(b)).toFixed(1)} | deuteranopia ${dE(labSim(a, DEUT), labSim(b, DEUT)).toFixed(1)} | protanopia ${dE(labSim(a, PROT), labSim(b, PROT)).toFixed(1)} | tritanopia ${dE(labSim(a, TRIT), labSim(b, TRIT)).toFixed(1)}`;
  out.push(linha('receita vs despesa', r, d)); out.push(linha('receita vs pendente', r, p)); out.push(linha('despesa vs pendente', d, p)); out.push(linha('despesa vs negativo', d, n));
}
// consistencia TS <-> CSS
let div = 0;
for (const [nome, blk, s, o] of [['claro', rootBlk, claro, '#7D878C'], ['escuro', darkBlk, escuro, '#6E7A81']]) {
  for (let i = 1; i <= 5; i++) { const c = tok(blk, '--chart-' + i); if (c !== s[i - 1]) { div++; out.push(`DIVERGE ${nome} --chart-${i} css=${c} ts=${s[i - 1]}`); } }
  const so = tok(blk, '--serie-outros'); if (so !== o) { div++; out.push(`DIVERGE ${nome} --serie-outros css=${so} ts=${o}`); }
}
out.push('Consistencia chart-palette.ts <-> globals.css: ' + (div === 0 ? 'OK (5 series + serie-outros nos dois modos)' : div + ' divergencias'));
console.log(out.join('\n'));
