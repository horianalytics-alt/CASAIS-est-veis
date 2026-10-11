// Gera os assets gráficos do Finanças a Dois. Rodar com cwd = app/
const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve('node_modules/sharp'));

const ICONS = path.resolve('public/icons');
fs.mkdirSync(ICONS, { recursive: true });

// Símbolo: dois arcos que se abrem para fora + ponto central (a conta compartilhada).
// Grade 32x32. Traço 4.5.
const SIMBOLO = (cor) =>
  `<path d="M11.5 7 A9 9 0 0 0 11.5 25" fill="none" stroke="${cor}" stroke-width="4.5" stroke-linecap="round"/>` +
  `<path d="M20.5 7 A9 9 0 0 1 20.5 25" fill="none" stroke="${cor}" stroke-width="4.5" stroke-linecap="round"/>` +
  `<circle cx="16" cy="16" r="2.8" fill="${cor}"/>`;

// favicon.svg — silhueta, sem texto, troca de cor por tema via media query dentro do SVG.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<style>.s{stroke:#14594A}.f{fill:#14594A}@media (prefers-color-scheme:dark){.s{stroke:#5FD3B2}.f{fill:#5FD3B2}}</style>
<path class="s" d="M11.5 7 A9 9 0 0 0 11.5 25" fill="none" stroke-width="4.5" stroke-linecap="round"/>
<path class="s" d="M20.5 7 A9 9 0 0 1 20.5 25" fill="none" stroke-width="4.5" stroke-linecap="round"/>
<circle class="f" cx="16" cy="16" r="2.8"/>
</svg>
`;
fs.writeFileSync(path.join(ICONS, 'favicon.svg'), favicon);

// Ícone de app: fundo Cedro #14594A, símbolo branco #FFFFFF (8.21:1).
// escala = pixels por unidade da grade 32.
function iconeSvg(tam, escala, { arredondado }) {
  const off = tam / 2 - 16 * escala; // centra a grade 32 no canvas
  const rx = arredondado ? Math.round(tam * 0.22) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}">` +
    `<rect width="${tam}" height="${tam}" rx="${rx}" fill="#14594A"/>` +
    `<g transform="translate(${off} ${off}) scale(${escala})">${SIMBOLO('#FFFFFF')}</g></svg>`;
}

async function png(nome, tam, escalaPorTam, opts) {
  const svg = iconeSvg(tam, tam * escalaPorTam, opts);
  const buf = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
  fs.writeFileSync(path.join(ICONS, nome), buf);
  console.log(nome, tam + 'x' + tam, buf.length + ' bytes');
}

(async () => {
  // any: símbolo ocupa ~ 66% da largura (bbox do símbolo = 25 de 32 unidades)
  // escalaPorTam = unidades->px por px de canvas. 0.0206 => 25 unid * 0.0206 = 51% do canvas
  await png('icon-192.png', 192, 0.0205, { arredondado: true });
  await png('icon-512.png', 512, 0.0205, { arredondado: true });
  // maskable: safe zone = círculo de raio 40% do lado. Meia-diagonal do símbolo = ~14.4 unid
  // (bbox 25 x 18). 14.4 * k <= 0.4 => k <= 0.0278 ; usa 0.024 (folga)
  await png('icon-maskable-192.png', 192, 0.0185, { arredondado: false });
  await png('icon-maskable-512.png', 512, 0.0185, { arredondado: false });
  // apple-touch: fundo chapado, sem transparência, iOS arredonda sozinho
  await png('apple-touch-icon.png', 180, 0.0205, { arredondado: false });

  // favicon.ico com PNG embutido: 16 e 32
  const mk = async (n) => sharp(Buffer.from(iconeSvg(n, n * 0.025, { arredondado: true })), { density: 288 }).resize(n, n).png({ compressionLevel: 9 }).toBuffer();
  const imgs = [await mk(16), await mk(32)];
  const n = imgs.length;
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(n, 4);
  let off = 6 + 16 * n; const dir = [];
  imgs.forEach((b, i) => {
    const sz = [16, 32][i]; const e = Buffer.alloc(16);
    e.writeUInt8(sz, 0); e.writeUInt8(sz, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(b.length, 8); e.writeUInt32LE(off, 12);
    off += b.length; dir.push(e);
  });
  const ico = Buffer.concat([head, ...dir, ...imgs]);
  fs.writeFileSync(path.resolve('src/app/favicon.ico'), ico);
  console.log('favicon.ico', ico.length + ' bytes');
})();
