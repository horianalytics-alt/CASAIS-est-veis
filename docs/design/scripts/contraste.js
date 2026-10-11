const fs = require('fs');
const css = fs.readFileSync(process.argv[2], 'utf8');
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function block(sel) {
  const re = new RegExp('(^|\\n)' + esc(sel) + '\\s*\\{([^}]*)\\}');
  const m = css.match(re);
  if (!m) throw new Error('no block ' + sel);
  const o = {};
  for (const l of m[2].matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) o[l[1]] = l[2].toUpperCase();
  return o;
}
const root = block(':root'), dark = { ...root, ...block('.dark') };
const pal = {};
for (const p of ['ardosia', 'terra', 'ameixa']) pal[p] = { claro: block('[data-paleta="' + p + '"]'), escuro: block('.dark[data-paleta="' + p + '"]') };
const L = h => { const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const r = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
let fail = 0; const out = [];
function chk(nome, a, b, lim) {
  if (!a || !b) { fail++; out.push('FAIL token ausente em ' + nome); return; }
  const v = r(a, b); const ok = v >= lim; if (!ok) fail++;
  out.push(`${ok ? 'OK  ' : 'FAIL'} ${v.toFixed(2).padStart(6)}:1 (>=${lim}) ${nome} [${a} / ${b}]`);
}
const modes = { claro: root, escuro: dark };
const SEM = ['--receita', '--despesa', '--investimento', '--transferencia', '--pendente', '--negativo', '--beneficio'];
for (const [m, t] of Object.entries(modes)) {
  out.push('== chassi ' + m);
  for (const bg of ['--background', '--card', '--muted']) { chk(`${m} foreground/${bg}`, t['--foreground'], t[bg], 4.5); chk(`${m} muted-foreground/${bg}`, t['--muted-foreground'], t[bg], 4.5); }
  chk(`${m} border-forte/background`, t['--border-forte'], t['--background'], 3);
  chk(`${m} border-forte/card`, t['--border-forte'], t['--card'], 3);
  chk(`${m} input/background`, t['--input'], t['--background'], 3);
  out.push(`INFO ${m} border(decorativo)/background ${r(t['--border'], t['--background']).toFixed(2)}:1 (isento)`);
  chk(`${m} secondary-fg/secondary`, t['--secondary-foreground'], t['--secondary'], 4.5);
  chk(`${m} popover-fg/popover`, t['--popover-foreground'], t['--popover'], 4.5);
  chk(`${m} card-fg/card`, t['--card-foreground'], t['--card'], 4.5);
  chk(`${m} destructive-fg/destructive`, t['--destructive-foreground'], t['--destructive'], 4.5);
  chk(`${m} destructive/background (texto de erro)`, t['--destructive'], t['--background'], 4.5);
  for (const s of SEM) { chk(`${m} ${s}/background`, t[s], t['--background'], 4.5); chk(`${m} ${s}/card`, t[s], t['--card'], 4.5); }
  for (const i of [1, 2, 3, 4, 5]) chk(`${m} chart-${i}/background (1.4.11)`, t['--chart-' + i], t['--background'], 3);
  chk(`${m} serie-outros/background (1.4.11)`, t['--serie-outros'], t['--background'], 3);
}
const paletas = { cedro: { claro: root, escuro: dark } };
for (const [k, v] of Object.entries(pal)) paletas[k] = { claro: { ...root, ...v.claro }, escuro: { ...dark, ...v.escuro } };
for (const [p, mm] of Object.entries(paletas)) for (const [m, t] of Object.entries(mm)) {
  out.push(`== paleta ${p} ${m}`);
  chk(`${p} ${m} primary-fg/primary`, t['--primary-foreground'], t['--primary'], 4.5);
  chk(`${p} ${m} primary/background`, t['--primary'], t['--background'], 4.5);
  chk(`${p} ${m} primary/card`, t['--primary'], t['--card'], 4.5);
  chk(`${p} ${m} ring/background (1.4.11)`, t['--ring'], t['--background'], 3);
  chk(`${p} ${m} ring/card (1.4.11)`, t['--ring'], t['--card'], 3);
  chk(`${p} ${m} foreground/accent`, t['--accent-foreground'], t['--accent'], 4.5);
  chk(`${p} ${m} muted-foreground/accent`, t['--muted-foreground'], t['--accent'], 4.5);
  for (const s of SEM) chk(`${p} ${m} ${s}/accent`, t[s], t['--accent'], 4.5);
}
console.log(out.join('\n'));
console.log('\nFALHAS:', fail, '| total:', out.filter(l => /^(OK|FAIL)/.test(l)).length);
