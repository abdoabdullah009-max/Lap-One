/**
 * Query understanding for the storefront search.
 * Turns free text like "لاب i7 جيل عاشر أقل من 15 ألف" or "Dell 16GB" into structured filters,
 * then fuzzy-matches whatever text is left against product search documents.
 * Pure functions — unit tested in tests/unit/search.test.ts.
 */
import { toLatinDigits } from '../money';

export interface ParsedQuery {
  text: string[];                       // leftover tokens for text matching
  filters: {
    brand?: string[]; series?: string[]; usage?: string[]; cpu_brand?: string[]; cpu_tier?: string[];
    cpu_gen?: number[]; cpu_model?: string[]; ram?: number[]; storage_min?: number; storage_type?: string[];
    gpu_brand?: string[]; gpu_model?: string[]; gpu_type?: string[]; touch?: boolean; convertible?: boolean;
    min?: number; max?: number; screen?: string[]; in_stock?: boolean;   // min/max in EGP (pounds)
  };
  understood: { key: string; label: string }[];
}

export function normalize(input: string): string {
  return toLatinDigits(input)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')       // tashkeel + tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[،,؛;!?؟()\[\]{}"“”']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ORDINALS: [RegExp, number][] = [
  [/(?:ال)?حادي عشر|حداشر|احداشر/, 11], [/(?:ال)?ثاني عشر|(?:ال)?تاني عشر|اتناشر/, 12], [/(?:ال)?ثالث عشر|(?:ال)?تالت عشر|تلتاشر/, 13],
  [/(?:ال)?رابع عشر|اربعتاشر/, 14], [/(?:ال)?عاشر/, 10], [/(?:ال)?تاسع/, 9], [/(?:ال)?ثامن|(?:ال)?تامن/, 8], [/(?:ال)?سابع/, 7],
  [/(?:ال)?سادس/, 6], [/(?:ال)?خامس/, 5], [/(?:ال)?رابع/, 4], [/(?:ال)?ثالث|(?:ال)?تالت/, 3], [/(?:ال)?ثاني|(?:ال)?تاني/, 2],
];

export const USAGE_WORDS: Record<string, string[]> = {
  graphics: ['جرافيك', 'جرافكس', 'مونتاج', 'فوتوشوب', 'بريمير', 'graphic', 'graphics', 'design', 'designer', 'editing', 'photoshop', 'premiere', 'video'],
  gaming: ['جيمينج', 'جيمنج', 'جيمز', 'العاب', 'لعب', 'gaming', 'gamer', 'games', 'game'],
  engineering: ['هندسه', 'هندسي', 'مهندس', 'اوتوكاد', 'ريفيت', 'سوليد', 'معماري', 'autocad', 'revit', 'solidworks', 'cad', 'engineering', 'engineer'],
  programming: ['برمجه', 'مبرمج', 'programming', 'programmer', 'coding', 'developer', 'dev'],
  study: ['دراسه', 'جامعه', 'طالب', 'طلاب', 'طلبه', 'مذاكره', 'student', 'students', 'study', 'university', 'college', 'school'],
  office: ['اوفيس', 'مكتب', 'مكاتب', 'شغل', 'office', 'business', 'work'],
  workstation: ['workstation', 'workstations', 'ورك', 'ستيشن', 'محطه'],
  budget: ['اقتصادي', 'اقتصاديه', 'رخيص', 'cheap', 'budget', 'affordable'],
};

export const BRAND_WORDS: Record<string, string[]> = {
  dell: ['dell', 'ديل', 'دل'], hp: ['hp', 'اتش بي', 'اتشبي', 'هب'], lenovo: ['lenovo', 'لينوفو', 'لينوڤو', 'لينوفوا'],
  microsoft: ['microsoft', 'surface', 'سيرفس', 'سيرفيس', 'مايكروسوفت'], apple: ['apple', 'macbook', 'mac', 'ماك', 'ماك بوك', 'ابل'],
  asus: ['asus', 'اسوس', 'ازوس'], acer: ['acer', 'ايسر', 'اسير'], msi: ['msi', 'ام اس اي'],
};

export const SERIES_WORDS: Record<string, string[]> = {
  latitude: ['latitude', 'لاتيتيود', 'لاتتيود'], precision: ['precision', 'بريسيجن', 'بريسيشن'], xps: ['xps'],
  elitebook: ['elitebook', 'اليت بوك', 'اليتبوك'], probook: ['probook', 'برو بوك', 'بروبوك'], zbook: ['zbook', 'زد بوك', 'زدبوك'],
  thinkpad: ['thinkpad', 'ثينك باد', 'ثينكباد', 'think pad'], legion: ['legion', 'ليجن', 'ليجون'], omen: ['omen', 'اومن'],
  rog: ['rog'], tuf: ['tuf'], surface: ['surface', 'سيرفس', 'سيرفيس'], macbook: ['macbook', 'ماك بوك'],
};

const STOPWORDS = new Set(['لاب', 'لابتوب', 'لابتوبات', 'لابات', 'laptop', 'laptops', 'notebook', 'ل', 'لل', 'في', 'with', 'for', 'the', 'a', 'an',
  'و', 'ب', 'عايز', 'محتاج', 'عاوز', 'جهاز', 'اجهزه', 'سعر', 'بسعر', 'price', 'مستعمل', 'مستعمله', 'used', 'استيراد', 'imported', 'من', 'جيبلي', 'بتاع', 'يكون', 'كويس', 'جيد', 'and', 'or', 'pc', 'computer', 'كمبيوتر']);

const RAM_SIZES = new Set([4, 8, 12, 16, 24, 32, 48, 64, 96, 128]);

function toPounds(n: string, unit?: string): number {
  let v = Number(n.replace(/[,.](?=\d{3}\b)/g, ''));
  if (unit && /^(k|الف|الاف|الفين)$/.test(unit)) v *= 1000;
  else if (v < 1000) v *= 1000;                      // "اقل من 15" in a price context = 15,000
  return Math.round(v);
}

export function parseQuery(raw: string, opts: { brands?: Record<string, string[]>; series?: Record<string, string[]> } = {}): ParsedQuery {
  let s = ' ' + normalize(raw) + ' ';
  const f: ParsedQuery['filters'] = {};
  const understood: ParsedQuery['understood'] = [];
  const take = (re: RegExp) => { s = s.replace(re, ' '); };

  // --- price -------------------------------------------------------------------------
  const num = '(\\d[\\d,\\.]*)\\s*(k|الف|الاف|الفين)?';
  let m = s.match(new RegExp(`(?:من|between|from)\\s*${num}\\s*(?:الي|الى|لحد|ل|to|and|-)\\s*${num}`));
  if (m) { f.min = toPounds(m[1], m[2]); f.max = toPounds(m[3], m[4]); take(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); }
  m = s.match(new RegExp(`(?:اقل من|اقل|تحت|لحد|حد اقصي|بحد اقصي|اقصي|ميزانيه|ميزانيتي|under|below|less than|max|up to|upto|<)\\s*${num}`));
  if (m) { f.max = toPounds(m[1], m[2]); take(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); }
  m = s.match(new RegExp(`(?:اكتر من|اكثر من|فوق|اعلي من|over|above|more than|min|>)\\s*${num}`));
  if (m) { f.min = toPounds(m[1], m[2]); take(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); }
  m = s.match(/\s(\d{1,3})\s*(?:الف|k)\s/);   // bare "15 الف"
  if (m && f.max === undefined) { f.max = Number(m[1]) * 1000; take(m[0].trim() ? new RegExp(m[0].trim()) : /$^/); }
  if (f.min !== undefined) understood.push({ key: 'min', label: `≥ ${f.min.toLocaleString('en')}` });
  if (f.max !== undefined) understood.push({ key: 'max', label: `≤ ${f.max.toLocaleString('en')}` });

  // --- generation ----------------------------------------------------------------------
  m = s.match(/(?:الجيل|جيل|gen|generation)\s*(?:ال)?(\d{1,2})\b/) || s.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:gen|generation)\b/);
  if (m) { f.cpu_gen = [Number(m[1])]; take(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); }
  else {
    const gm = s.match(/(?:الجيل|جيل)\s+(\S+(?:\s+عشر)?)/);
    if (gm) {
      for (const [re, n] of ORDINALS) if (re.test(gm[1])) { f.cpu_gen = [n]; take(new RegExp(gm[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); break; }
    }
  }
  if (f.cpu_gen) understood.push({ key: 'cpu_gen', label: `Gen ${f.cpu_gen[0]}` });

  // --- exact CPU model (e.g. i7-1185g7, 10750h, 5800h) -----------------------------------
  m = s.match(/\b(?:i[3579]\s*-?\s*)?(\d{4,5}(?!gb|tb|mb|hz)[a-z]{1,2}\d?)\b/);
  if (m) {
    f.cpu_model = [m[1]];
    const gen = m[1].length === 5 ? Number(m[1].slice(0, 2)) : null;
    if (gen && !f.cpu_gen && gen >= 10 && gen <= 14) f.cpu_gen = [gen];
    understood.push({ key: 'cpu_model', label: m[1].toUpperCase() });
    // keep tier detection below working on the same text
    s = s.replace(m[1], ' ');
  }

  // --- CPU tier ------------------------------------------------------------------------
  const tiers: string[] = [];
  s = s.replace(/(^|\s)(?:core\s*|كور\s*)?(?:i|اي)\s*-?\s*([3579])(?=\s|$|-)/g, (_x, _p, d) => { tiers.push('i' + d); return ' '; });
  s = s.replace(/(?:ryzen|رايزن|رايزين)\s*([3579])\b/g, (_x, d) => { tiers.push('r' + d); return ' '; });
  s = s.replace(/(?:core\s*)?ultra\s*([579])\b/g, (_x, d) => { tiers.push('u' + d); return ' '; });
  s = s.replace(/\bm([1-4])(?:\s*(pro|max))?\b/g, (_x, d) => { tiers.push('m' + d); return ' '; });
  if (/\b(ryzen|رايزن|amd)\b/.test(s)) { f.cpu_brand = ['amd']; take(/\b(ryzen|رايزن|amd)\b/); }
  if (/\bintel|انتل\b/.test(s)) { f.cpu_brand = ['intel']; take(/\b(intel|انتل)\b/); }
  if (tiers.length) { f.cpu_tier = tiers; understood.push({ key: 'cpu_tier', label: tiers.map((t) => t.toUpperCase()).join(' / ') }); }

  // --- GPU -----------------------------------------------------------------------------
  m = s.match(/\b(rtx|gtx|mx|rx)\s*-?\s*(a?\d{3,4})\b/);
  if (m) { f.gpu_model = [`${m[1]} ${m[2]}`]; f.gpu_type = ['dedicated']; understood.push({ key: 'gpu', label: `${m[1]} ${m[2]}`.toUpperCase() }); take(new RegExp(m[0])); }
  m = s.match(/\b(?:quadro\s*)?((?:rtx\s*)?a\d{3,4}|t\d{3,4}|p\d{3,4})\b/);
  if (m) { f.gpu_model = [...(f.gpu_model || []), m[1].replace(/^rtx\s*/, '')]; f.gpu_type = ['dedicated']; understood.push({ key: 'gpu', label: m[1].toUpperCase() }); take(new RegExp(m[0])); }
  if (/\b(rtx|gtx|quadro|nvidia|انفيديا|نفيديا)\b/.test(s)) { f.gpu_brand = ['nvidia']; f.gpu_type = ['dedicated']; understood.push({ key: 'gpu_brand', label: 'NVIDIA' }); take(/\b(rtx|gtx|quadro|nvidia|انفيديا|نفيديا)\b/g); }
  if (/(كارت شاشه|كارت منفصل|كارت خارجي|dedicated|gpu|graphics card|\bكارت\b)/.test(s)) {
    f.gpu_type = ['dedicated']; understood.push({ key: 'gpu_type', label: 'GPU ✓' });
    take(/(كارت شاشه|كارت منفصل|كارت خارجي|dedicated|gpu|graphics card|\bكارت\b)/g);
  }

  // --- storage (before RAM so "512 ssd" is not read as RAM) ------------------------------
  m = s.match(/(\d+)\s*(gb|g|جيجا|tb|t|تيرا)?\s*(ssd|nvme|hdd|هارد|تخزين|storage)/) || s.match(/(\d)\s*(tb|تيرا)\b/);
  if (m) {
    let gb = Number(m[1]); if (m[2] && /^(tb|t|تيرا)$/.test(m[2])) gb *= 1024;
    f.storage_min = gb; understood.push({ key: 'storage', label: gb >= 1024 ? `${gb / 1024}TB+` : `${gb}GB+` });
    if (m[3] && /hdd|هارد/.test(m[3])) f.storage_type = ['hdd'];
    take(new RegExp(m[0]));
  }
  if (/\b(ssd|nvme)\b/.test(s)) take(/\b(ssd|nvme)\b/g);

  // --- RAM -----------------------------------------------------------------------------
  m = s.match(/(\d{1,3})\s*(?:gb|g|جيجا|جيجابايت)?\s*(?:ram|رام|رامات|ميموري)/) || s.match(/(?:ram|رام|رامات)\s*(\d{1,3})/)
    || s.match(/\b(\d{1,3})\s*(?:gb|جيجا)\b/);
  if (m && RAM_SIZES.has(Number(m[1]))) {
    f.ram = [Number(m[1])]; understood.push({ key: 'ram', label: `${m[1]}GB RAM` }); take(new RegExp(m[0]));
  }
  take(/\b(ram|رام|رامات|gb|جيجا)\b/g);

  // --- screen size -----------------------------------------------------------------------
  m = s.match(/(1[0-8](?:\.\d)?)\s*(?:بوصه|inch|in|انش|")/);
  if (m) { f.screen = [String(Math.floor(Number(m[1])))]; understood.push({ key: 'screen', label: `${m[1]}"` }); take(new RegExp(m[0].replace('.', '\\.'))); }

  // --- touch / 2-in-1 / stock ----------------------------------------------------------
  if (/(تاتش|touch|لمس)/.test(s)) { f.touch = true; understood.push({ key: 'touch', label: 'Touch' }); take(/(شاشه\s*)?(تاتش|touch|لمس)/g); }
  if (/(2\s*(?:in|في)\s*1|2in1|x360|قلاب|yoga|convertible)/.test(s)) { f.convertible = true; understood.push({ key: 'convertible', label: '2-in-1' }); take(/(2\s*(?:in|في)\s*1|2in1|x360|قلاب|yoga|convertible)/g); }
  if (/\b(متاح|available|in stock)\b/.test(s)) { f.in_stock = true; take(/\b(متاح|available|in stock)\b/g); }

  // --- brands / series / usage (multi-word aliases first) -------------------------------
  const brandMap = { ...BRAND_WORDS, ...(opts.brands || {}) };
  for (const [slug, words] of Object.entries(brandMap)) {
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|\\s)${normalize(w)}(?=\\s|$)`);
      if (re.test(s)) { (f.brand ||= []).includes(slug) || f.brand.push(slug); take(re); understood.push({ key: 'brand', label: slug.toUpperCase() }); break; }
    }
  }
  const seriesMap = { ...SERIES_WORDS, ...(opts.series || {}) };
  for (const [slug, words] of Object.entries(seriesMap)) {
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|\\s)${normalize(w)}(?=\\s|$)`);
      if (re.test(s)) { (f.series ||= []).push(slug); take(re); understood.push({ key: 'series', label: slug[0].toUpperCase() + slug.slice(1) }); break; }
    }
  }
  const tokens = s.split(' ').filter(Boolean);
  const rest: string[] = [];
  for (let tok of tokens) {
    tok = tok.replace(/^(لل|ال|ل|ب|و)(?=\S{3,})/, '');   // strip common Arabic prefixes: "للجرافيك" -> "جرافيك"
    let used = false;
    for (const [u, words] of Object.entries(USAGE_WORDS)) {
      if (words.some((w) => tok === w || (tok.length >= 4 && (w.startsWith(tok) || tok.startsWith(w))))) {
        if (!(f.usage ||= []).includes(u)) { f.usage.push(u); understood.push({ key: 'usage', label: u }); }
        used = true; break;
      }
    }
    if (!used && !STOPWORDS.has(tok) && tok.length > 1) rest.push(tok);
  }
  return { text: rest, filters: f, understood };
}

// --- fuzzy text scoring --------------------------------------------------------------------
export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Score how well a single query token matches a document's token list. 0 = no match. */
export function tokenScore(tok: string, docTokens: string[]): number {
  let best = 0;
  for (const d of docTokens) {
    if (d === tok) return 10;
    if (tok.length >= 2 && d.startsWith(tok)) best = Math.max(best, 7);
    else if (tok.length >= 3 && d.includes(tok)) best = Math.max(best, 4);
    else if (tok.length >= 4) {
      const dist = levenshtein(tok, d, tok.length >= 7 ? 2 : 1);
      if (dist <= (tok.length >= 7 ? 2 : 1)) best = Math.max(best, 5 - dist);
    }
  }
  return best;
}

export function textScore(tokens: string[], docTokens: string[]): { score: number; matchedAll: boolean } {
  let score = 0; let matchedAll = true;
  for (const t of tokens) { const sc = tokenScore(t, docTokens); if (!sc) matchedAll = false; score += sc; }
  return { score, matchedAll };
}

export function tokenizeDoc(...parts: (string | null | undefined)[]): string[] {
  return [...new Set(normalize(parts.filter(Boolean).join(' ')).replace(/[-_/]/g, ' ').split(' ').filter(Boolean))];
}
