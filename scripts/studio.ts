/**
 * "Studio" product illustrations — original artwork drawn in code (no third-party photos).
 * Each model gets its own look: body colour, screen aspect, bezel, keyboard (with/without number pad),
 * touch bar, red TrackPoint, fabric deck, speaker grille… on a clean white background with soft shadows.
 * They are stored with kind='representative' and always labelled "صورة توضيحية" on the storefront.
 */

type P = [number, number];
type View = 'front' | 'angle' | 'closed';

export interface Traits {
  body: string; bodyDark: string; bodyLight: string;   // chassis colours
  deck?: string;                                        // keyboard deck if different (Surface fabric)
  fabric?: boolean;
  keys: string; keyEdge: string; legend?: string;       // key cap colours
  aspect: number;                                       // screen width / height
  bezel: number;                                        // relative bezel thickness (0..1 of screen height)
  numpad: boolean; touchbar: boolean; trackpoint?: string; tpButtons?: string;
  grille: boolean; bigPad: boolean; padStyle: 'glass' | 'plain';
  hue: [string, string, string];                        // wallpaper colours
  hingeDark?: boolean; thin: number;                    // base thickness px
}

const SILVER = { body: '#D7DADF', bodyDark: '#AEB3BB', bodyLight: '#EEF0F3' };
const SPACE = { body: '#77797E', bodyDark: '#55575C', bodyLight: '#9A9CA1' };
const BLACK = { body: '#2C2E33', bodyDark: '#17181B', bodyLight: '#45484F' };
const TITAN = { body: '#5E636B', bodyDark: '#3F434A', bodyLight: '#7C818A' };
const PLAT = { body: '#DCDDDF', bodyDark: '#B9BBBF', bodyLight: '#F1F2F3' };

export function traitsFor(brand: string, family: string, screenIn: number | null): Traits {
  const f = family.toLowerCase();
  const big = (screenIn || 14) >= 15;
  const base: Traits = { ...SILVER, keys: '#24262B', keyEdge: '#0F1013', aspect: 16 / 9, bezel: 0.06, numpad: big, touchbar: false, grille: false, bigPad: false, padStyle: 'plain', hue: ['#0B3D91', '#1F7AE0', '#7FC4FF'], thin: 12 };
  if (brand === 'apple') return { ...base, ...SPACE, keys: '#151517', keyEdge: '#050506', aspect: 16 / 10, bezel: 0.045, numpad: false, touchbar: true, grille: true, bigPad: true, padStyle: 'glass', hue: ['#2B1055', '#7B3FE4', '#F08FC0'], thin: 9 };
  if (brand === 'microsoft') return { ...base, body: '#26272B', bodyDark: '#141518', bodyLight: '#3A3C42', keys: '#121316', keyEdge: '#050506', aspect: 3 / 2, bezel: 0.05, numpad: false, padStyle: 'glass', hue: ['#0A2A4A', '#1E6FD9', '#7CC6FF'], thin: 9 };  // Matte Black (all-metal deck)
  if (f.includes('thinkpad')) return { ...base, ...BLACK, keys: '#1B1C1F', keyEdge: '#0A0A0C', legend: '#DADDE2', bezel: 0.06, numpad: false, trackpoint: '#E1251B', tpButtons: '#1E1F23', hue: ['#121418', '#3B4252', '#E1251B'], thin: 10 };
  if (f.includes('zbook')) return { ...base, ...TITAN, keys: '#1C1E22', keyEdge: '#0B0C0E', grille: false, hue: ['#05223F', '#0E5FAE', '#55B6FF'], thin: 14 };
  if (f.includes('elitebook')) return { ...base, ...SILVER, grille: true, padStyle: 'glass', hue: ['#062A55', '#1565C0', '#7EC8FF'], thin: 11 };
  if (f.includes('probook')) return { ...base, ...SILVER, keys: '#2A2C31', hue: ['#073B6B', '#2C8BD6', '#9ED8FF'], thin: 12 };
  if (f.includes('precision')) return { ...base, ...BLACK, keys: '#1C1D20', keyEdge: '#0A0A0B', trackpoint: '#2F7DE1', tpButtons: '#202125', hue: ['#03213D', '#0F67B1', '#4FC3F7'], thin: 16 };
  if (f.includes('latitude')) return { ...base, ...BLACK, keys: '#1C1D20', keyEdge: '#0A0A0B', numpad: false, trackpoint: '#2F7DE1', tpButtons: '#202125', hue: ['#0A2540', '#1E6FD9', '#7CC6FF'], thin: 12 };
  if (f.includes('chromebook')) return { ...base, ...BLACK, keys: '#151618', keyEdge: '#070708', numpad: false, hue: ['#123B2A', '#1E8E5A', '#F6C445'], thin: 12 };
  if (f.includes('vostro')) return { ...base, ...TITAN, keys: '#202226', keyEdge: '#0D0E10', hue: ['#082C4A', '#1976D2', '#80D0FF'], thin: 12 };
  return base;
}

// ---------------------------------------------------------------- geometry helpers
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Bilinear map of (u,v) into quad [TL, TR, BR, BL]. */
const bil = (q: P[], u: number, v: number): P => lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
const f1 = (n: number) => Math.round(n * 10) / 10;
const pts = (a: P[]) => a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
const poly = (a: P[], attrs: string) => `<polygon points="${pts(a)}" ${attrs}/>`;
const quadUV = (q: P[], u0: number, v0: number, u1: number, v1: number): P[] => [bil(q, u0, v0), bil(q, u1, v0), bil(q, u1, v1), bil(q, u0, v1)];
const pathUV = (q: P[], fn: (t: number) => [number, number], n = 40) => {
  const a: P[] = []; for (let i = 0; i <= n; i++) { const [u, v] = fn(i / n); a.push(bil(q, u, v)); } return a;
};

let uid = 0;

function defs(t: Traits, id: string) {
  return `<defs>
  <filter id="sh${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="sh2${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <linearGradient id="lid${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bodyLight}"/><stop offset=".55" stop-color="${t.body}"/><stop offset="1" stop-color="${t.bodyDark}"/></linearGradient>
  <linearGradient id="deck${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.deck || t.body}"/><stop offset="1" stop-color="${t.deck ? t.deck : t.bodyLight}"/></linearGradient>
  <linearGradient id="edge${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.bodyLight}"/><stop offset="1" stop-color="${t.bodyDark}"/></linearGradient>
  <linearGradient id="glare${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="wp${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.hue[0]}"/><stop offset=".6" stop-color="${t.hue[1]}"/><stop offset="1" stop-color="${t.hue[2]}"/></linearGradient>
  ${t.fabric ? `<filter id="fab${id}"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="3" seed="3"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .35  0 0 0 0 .37  0 0 0 .55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>` : ''}
</defs>`;
}

function wallpaper(t: Traits, q: P[], id: string) {
  // Abstract, original wallpaper: gradient + three soft waves, mapped onto the (perspective) screen quad.
  let s = poly(q, `fill="url(#wp${id})"`);
  const waves: [number, number, number, string, number][] = [[0.55, 0.16, 1.2, t.hue[2], 0.35], [0.7, 0.12, 0.9, '#ffffff', 0.18], [0.82, 0.1, 1.6, t.hue[0], 0.45]];
  for (const [base, amp, freq, col, op] of waves) {
    const top = pathUV(q, (x) => [x, base - amp * Math.sin(x * Math.PI * freq + base * 4)]);
    s += poly([...top, bil(q, 1, 1), bil(q, 0, 1)], `fill="${col}" opacity="${op}"`);
  }
  return s;
}

function siteMock(q: P[]) {
  // A miniature LAP ONE storefront (our own site) drawn in perspective on the display.
  const r = (u0: number, v0: number, u1: number, v1: number, fill: string, extra = '') => poly(quadUV(q, u0, v0, u1, v1), `fill="${fill}" ${extra}`);
  let s = r(0, 0, 1, 1, '#FFFFFF');
  s += r(0, 0, 1, 0.035, '#0060FF');
  s += r(0, 0.035, 1, 0.12, '#FFFFFF') + r(0, 0.118, 1, 0.122, '#E4E7EC');
  s += r(0.78, 0.058, 0.96, 0.098, '#0060FF', 'rx="1"');                 // logo block (RTL: right)
  s += r(0.3, 0.06, 0.74, 0.096, '#F2F4F7');                             // search bar
  s += r(0.04, 0.066, 0.07, 0.09, '#98A2B3') + r(0.09, 0.066, 0.12, 0.09, '#98A2B3');
  s += r(0, 0.122, 1, 0.5, '#EAF2FF');                                   // hero
  s += r(0.5, 0.2, 0.94, 0.25, '#101828') + r(0.58, 0.27, 0.94, 0.32, '#101828') + r(0.62, 0.35, 0.94, 0.37, '#667085');
  s += r(0.76, 0.41, 0.94, 0.46, '#0060FF') + r(0.56, 0.41, 0.73, 0.46, '#FFFFFF', 'stroke="#0060FF" stroke-width=".6"');
  s += r(0.08, 0.17, 0.42, 0.46, '#FFFFFF') + r(0.13, 0.22, 0.37, 0.36, '#1D2939') + r(0.1, 0.36, 0.4, 0.4, '#C9CED6');
  for (let i = 0; i < 4; i++) {                                            // product cards
    const u0 = 0.04 + i * 0.235, u1 = u0 + 0.215;
    s += r(u0, 0.56, u1, 0.97, '#FFFFFF', 'stroke="#E4E7EC" stroke-width=".6"');
    s += r(u0 + 0.015, 0.58, u1 - 0.015, 0.76, '#F2F4F7') + r(u0 + 0.05, 0.62, u1 - 0.05, 0.72, '#475467');
    s += r(u0 + 0.06, 0.8, u1 - 0.015, 0.83, '#344054') + r(u0 + 0.1, 0.86, u1 - 0.015, 0.88, '#98A2B3');
    s += r(u0 + 0.12, 0.91, u1 - 0.015, 0.945, '#0060FF') + r(u0 + 0.015, 0.905, u0 + 0.06, 0.95, '#0060FF');
  }
  return s;
}

function screenAssembly(t: Traits, lid: P[], id: string, site = false) {
  // lid = outer quad of the display panel [TL, TR, BR, BL]
  const b = t.bezel; const bx = b * 0.9 / t.aspect * 1.6;
  const panel = quadUV(lid, 0.012, 0.012, 0.988, 0.988);
  const disp = quadUV(lid, bx, b * 1.15, 1 - bx, 1 - b * 1.25);
  let s = poly(lid, `fill="url(#edge${id})"`);
  s += poly(panel, 'fill="#0A0B0D"');
  s += site ? siteMock(disp) : wallpaper(t, disp, id);
  s += poly(panel, `fill="url(#glare${id})"`);
  const cam = bil(lid, 0.5, b * 0.58);
  s += `<circle cx="${f1(cam[0])}" cy="${f1(cam[1])}" r="2.2" fill="#22252B"/><circle cx="${f1(cam[0])}" cy="${f1(cam[1])}" r=".9" fill="#3D5A80"/>`;
  return s;
}

function keyboard(t: Traits, deck: P[], id: string) {
  let s = '';
  const kbU0 = t.numpad ? 0.06 : 0.115, kbU1 = t.numpad ? 0.94 : 0.885;
  const v0 = t.grille ? 0.13 : 0.08, v1 = 0.56;
  const mainU1 = t.numpad ? kbU0 + (kbU1 - kbU0) * 0.79 : kbU1;
  if (t.grille) {
    // speaker grille strip above the keyboard
    const g = quadUV(deck, kbU0 + 0.02, 0.035, kbU1 - 0.02, 0.085);
    s += poly(g, `fill="${t.bodyDark}" opacity=".35"`);
  }
  const rows = 6; const rowGap = 0.012; const rh = (v1 - v0 - rowGap * (rows - 1)) / rows;
  const layout: number[][] = [
    Array(14).fill(1),
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.2],
    [2.3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.7],
    [1, 1, 1, 1.25, 5.5, 1.25, 1, 1, 1, 1],
  ];
  const keyQuad = (u0: number, u1: number, r: number, fRow = false) => {
    const top = v0 + r * (rh + rowGap) + (fRow ? rh * 0.35 : 0);
    return quadUV(deck, u0, top, u1, v0 + r * (rh + rowGap) + rh);
  };
  const drawKey = (q: P[]) => {
    const shadowQ = q.map((p) => [p[0], p[1] + 1.6] as P);
    s += poly(shadowQ, `fill="${t.keyEdge}"`);
    s += poly(q, `fill="${t.keys}"`);
    if (t.legend) { const c = lerp(q[0], q[2], 0.5); s += `<circle cx="${f1(c[0] - 1)}" cy="${f1(c[1] - 1)}" r=".9" fill="${t.legend}" opacity=".7"/>`; }
  };
  layout.forEach((row, r) => {
    if (r === 0 && t.touchbar) { const tb = keyQuad(kbU0, mainU1, 0, true); s += poly(tb.map((p) => [p[0], p[1] + 1.2] as P), 'fill="#000"'); s += poly(tb, 'fill="#101114"'); const g = quadUV(tb, 0.08, 0.2, 0.92, 0.8); s += poly(g, 'fill="#2B3A55" opacity=".55"'); return; }
    const total = row.reduce((a, b) => a + b, 0); const gap = 0.006; const unit = (mainU1 - kbU0 - gap * (row.length - 1)) / total;
    let u = kbU0;
    row.forEach((w) => { const u1 = u + unit * w; drawKey(keyQuad(u, u1, r, r === 0)); u = u1 + gap; });
  });
  if (t.numpad) {
    const nu0 = mainU1 + 0.018; const cols = 4; const gap = 0.006; const kw = (kbU1 - nu0 - gap * (cols - 1)) / cols;
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) drawKey(keyQuad(nu0 + c * (kw + gap), nu0 + c * (kw + gap) + kw, r));
  }
  // trackpoint
  if (t.trackpoint) {
    const p = bil(deck, kbU0 + (mainU1 - kbU0) * 0.5, v0 + 4 * (rh + rowGap) - rowGap / 2);
    s += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="4.2" fill="${t.trackpoint}"/><circle cx="${f1(p[0] - 1)}" cy="${f1(p[1] - 1)}" r="1.4" fill="#fff" opacity=".35"/>`;
  }
  // touchpad
  const padC = (kbU0 + mainU1) / 2; const padW = t.bigPad ? 0.46 : 0.26;
  const pv0 = t.trackpoint ? 0.69 : 0.62;
  if (t.tpButtons) {
    const bq = quadUV(deck, padC - padW / 2, 0.6, padC + padW / 2, 0.665);
    s += poly(bq, `fill="${t.tpButtons}"`);
    for (const k of [1 / 3, 2 / 3]) { const a = bil(bq, k, 0), b = bil(bq, k, 1); s += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${t.keyEdge}" stroke-width="1"/>`; }
    if (t.trackpoint === '#E1251B') for (const k of [0.02, 0.98]) { const a = bil(bq, k, 0.2), b = bil(bq, k, 0.8); s += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="#E1251B" stroke-width="1.6"/>`; }
  }
  const pad = quadUV(deck, padC - padW / 2, pv0, padC + padW / 2, 0.95);
  s += poly(pad.map((p) => [p[0], p[1] + 0.8] as P), `fill="${t.bodyDark}" opacity=".5"`);
  s += poly(pad, t.padStyle === 'glass' ? `fill="${t.deck || t.body}" stroke="${t.bodyDark}" stroke-width=".8"` : `fill="${t.bodyDark}" opacity=".35"`);
  return s;
}

function laptop(t: Traits, id: string, lid: P[], deck: P[], shadow: [number, number, number, number], site = false) {
  const front: P[] = [deck[3], deck[2], [deck[2][0], deck[2][1] + t.thin], [deck[3][0], deck[3][1] + t.thin]];
  let s = `<ellipse cx="${shadow[0]}" cy="${shadow[1]}" rx="${shadow[2]}" ry="${shadow[3]}" fill="#0B1220" opacity=".12" filter="url(#sh${id})"/>`;
  s += `<ellipse cx="${shadow[0]}" cy="${shadow[1] - 4}" rx="${shadow[2] * 0.92}" ry="${shadow[3] * 0.35}" fill="#0B1220" opacity=".25" filter="url(#sh2${id})"/>`;
  s += poly(front, `fill="url(#edge${id})"`);
  s += poly(deck, `fill="url(#deck${id})"`);
  if (t.fabric) s += poly(deck, `fill="#000" filter="url(#fab${id})"`);
  s += poly([deck[0], deck[1], bil(deck, 1, 0.012), bil(deck, 0, 0.012)], `fill="${t.bodyDark}" opacity=".6"`);
  s += keyboard(t, deck, id);
  // front lip highlight + notch
  s += `<polyline points="${pts([deck[3], deck[2]])}" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" fill="none"/>`;
  const n0 = lerp(deck[3], deck[2], 0.44), n1 = lerp(deck[3], deck[2], 0.56);
  s += `<path d="M${f1(n0[0])} ${f1(n0[1])} Q${f1((n0[0] + n1[0]) / 2)} ${f1(n0[1] + 5)} ${f1(n1[0])} ${f1(n1[1])}" stroke="${t.bodyDark}" stroke-width="1.2" fill="none"/>`;
  // hinge
  s += poly([lid[3], lid[2], [lid[2][0], lid[2][1] + 6], [lid[3][0], lid[3][1] + 6]], `fill="${t.hingeDark ? '#111' : t.bodyDark}"`);
  s += screenAssembly(t, lid, id, site);
  return s;
}

export function studioSvg(view: View, t: Traits, label: string): string {
  const site = [...label].reduce((a, c) => a + c.charCodeAt(0), 0) % 4 < 2;
  const id = `s${++uid}`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${label.replace(/[<&"]/g, '')}"><rect width="800" height="600" fill="#FFFFFF"/>
${defs(t, id)}`;
  // screen height from aspect: lid width ~ 470 front
  if (view === 'front') {
    const w = 560; const h = w / t.aspect * 0.97; const yb = 420;
    const lid: P[] = [[400 - w / 2 + 4, yb - h], [400 + w / 2 - 4, yb - h], [400 + w / 2, yb], [400 - w / 2, yb]];
    const deck: P[] = [[400 - w / 2 - 4, yb + 5], [400 + w / 2 + 4, yb + 5], [400 + w / 2 + 44, yb + 44], [400 - w / 2 - 44, yb + 44]];
    return `${head}${laptop(t, id, lid, deck, [400, yb + 58, 330, 10], site)}</svg>`;
  }
  if (view === 'angle') {
    const h = 300 / t.aspect * 1.62;
    const BL: P = [214, 382], BR: P = [585, 336];
    const TL: P = [178, 382 - h * 1.02], TR: P = [548, 336 - h * 0.95];
    const lid: P[] = [TL, TR, BR, BL];
    const deck: P[] = [[BL[0], BL[1] + 6], [BR[0], BR[1] + 6], [752, 446], [338, 520]];
    return `${head}${laptop(t, id, lid, deck, [500, 535, 300, 22])}</svg>`;
  }
  // closed: lid seen from above-front, slightly rotated
  const q: P[] = [[205, 222], [612, 200], [722, 368], [102, 398]];
  const edgeQ: P[] = [q[3], q[2], [q[2][0], q[2][1] + t.thin + 4], [q[3][0], q[3][1] + t.thin + 4]];
  const sideQ: P[] = [q[2], q[1], [q[1][0], q[1][1] + t.thin], [q[2][0], q[2][1] + t.thin + 4]];
  let s = `<ellipse cx="412" cy="410" rx="330" ry="20" fill="#0B1220" opacity=".22" filter="url(#sh${id})"/>`;
  s += poly(sideQ, `fill="${t.bodyDark}"`) + poly(edgeQ, `fill="url(#edge${id})"`);
  s += poly(q, `fill="url(#lid${id})"`);
  s += poly([bil(q, 0, 0), bil(q, 0.62, 0), bil(q, 0.3, 1), bil(q, 0, 1)], 'fill="#fff" opacity=".07"');
  s += `<polyline points="${pts([q[3], q[2]])}" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" fill="none"/>`;
  if (t.trackpoint === '#E1251B') { const p = bil(q, 0.86, 0.86); s += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="3" fill="#E1251B"/>`; }
  return `${head}${s}</svg>`;
}
