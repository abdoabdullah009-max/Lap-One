/**
 * Rule-based laptop recommender. Uses only verified catalog fields and only in-stock items.
 * Every reason / strength / limitation is derived from a stored field — nothing is invented.
 */
import { loadCatalog, perfIndex, resolutionClass, type CatalogItem } from './catalog';

export interface WizardAnswers {
  usage: string; budgetMin: number | null; budgetMax: number | null;    // piasters
  apps: string[]; pref: 'portable' | 'performance' | 'balanced'; reqs: string[];
}
export interface Note { key: string; vars?: Record<string, string | number> }
export interface Recommendation { item: CatalogItem; score: number; match: number; stretch: boolean; why: Note[]; strengths: Note[]; limits: Note[]; vs: Note[] }

interface Needs { minRam: number; idealRam: number; minPerf: number; needDgpu: boolean; wantDgpu: boolean; minVram: number; proGpu: boolean; highRefresh: boolean }

export function deriveNeeds(a: WizardAnswers): Needs {
  const n: Needs = { minRam: 8, idealRam: 8, minPerf: 5, needDgpu: false, wantDgpu: false, minVram: 0, proGpu: false, highRefresh: false };
  const bump = (k: keyof Needs, v: any) => { (n as any)[k] = typeof v === 'number' ? Math.max((n as any)[k], v) : v; };
  switch (a.usage) {
    case 'programming': bump('idealRam', 16); bump('minPerf', 7); break;
    case 'engineering': bump('minRam', 16); bump('idealRam', 32); bump('minPerf', 9); bump('wantDgpu', true); break;
    case 'graphics': bump('minRam', 16); bump('idealRam', 32); bump('minPerf', 8); bump('wantDgpu', true); break;
    case 'gaming': bump('minRam', 16); bump('minPerf', 9); bump('needDgpu', true); bump('minVram', 4); bump('highRefresh', true); break;
    case 'workstation': bump('minRam', 32); bump('idealRam', 32); bump('minPerf', 11); bump('needDgpu', true); bump('proGpu', true); break;
    case 'office': bump('idealRam', 16); break;
  }
  for (const app of a.apps) {
    if (app === 'heavy_dev') { bump('minRam', 16); bump('idealRam', 32); bump('minPerf', 8); }
    if (app === 'code') bump('idealRam', 16);
    if (app === 'autocad') { bump('minRam', 16); bump('wantDgpu', true); bump('minPerf', 8); }
    if (app === 'revit') { bump('minRam', 16); bump('idealRam', 32); bump('needDgpu', true); bump('minVram', 4); bump('minPerf', 9); }
    if (app === 'adobe') { bump('minRam', 16); bump('wantDgpu', true); }
    if (app === 'video' || app === '3d') { bump('minRam', 16); bump('idealRam', 32); bump('needDgpu', true); bump('minVram', 4); bump('minPerf', 9); }
    if (app === 'esports') { bump('wantDgpu', true); }
    if (app === 'aaa') { bump('needDgpu', true); bump('minVram', 6); bump('minRam', 16); bump('highRefresh', true); }
  }
  if (a.reqs.includes('ram16')) bump('minRam', 16);
  if (a.reqs.includes('dgpu')) bump('needDgpu', true);
  return n;
}

export async function recommend(a: WizardAnswers, limit = 5): Promise<{ recs: Recommendation[]; needs: Needs; relaxedBudget: boolean }> {
  const all = (await loadCatalog()).filter((i) => !i.is_accessory && i.available > 0);
  const needs = deriveNeeds(a);
  const maxStretch = a.budgetMax !== null ? Math.round(a.budgetMax * 1.1) : null;

  const candidates = all.filter((it) => {
    if (a.budgetMin !== null && it.price < a.budgetMin * 0.85) return false;
    if (maxStretch !== null && it.price > maxStretch) return false;
    if (a.reqs.includes('touch') && !it.touch) return false;
    if (a.reqs.includes('2in1') && !it.convertible) return false;
    if (a.reqs.includes('big') && (it.screen_in || 0) < 15.5) return false;
    if (a.reqs.includes('small') && (it.screen_in || 99) > 14.1) return false;
    if (a.reqs.includes('fhd') && !['fhd', 'qhd', '4k'].includes(resolutionClass(it.resolution) || '')) return false;
    if (a.reqs.includes('battery') && it.battery_max === null) return false;
    if (needs.needDgpu && !it.gpu_dedicated) return false;
    return true;
  });

  const scoreOf = (it: CatalogItem) => {
    const perf = perfIndex(it);
    let s = 0;
    s += Math.min(perf, needs.minPerf + 4) * 2 - Math.max(0, needs.minPerf - perf) * 4;
    s += (it.ram_gb || 0) >= needs.idealRam ? 6 : (it.ram_gb || 0) >= needs.minRam ? 3 : -8;
    if (needs.wantDgpu && it.gpu_dedicated) s += 4;
    if ((it.vram_gb || 0) >= needs.minVram && needs.minVram) s += 3;
    if (needs.proGpu && /quadro|rtx a\d|^a\d{3,4}|t\d{3,4}/i.test(it.gpu_model || '')) s += 5;
    if (needs.highRefresh && (it.refresh_hz || 60) >= 120) s += 4;
    if (it.usages.includes(a.usage)) s += 6;
    if (a.pref === 'portable') s += it.weight_kg ? (it.weight_kg <= 1.4 ? 6 : it.weight_kg <= 1.8 ? 2 : -4) : 0;
    if (a.pref === 'performance') s += perf * 0.8;
    if (a.pref === 'balanced') s += it.weight_kg && it.weight_kg <= 1.9 ? 2 : 0;
    if (it.battery_max !== null) s += 1;
    if (a.budgetMax !== null && it.price > a.budgetMax) s -= 6;  // stretch penalty
    if (a.budgetMax !== null) s += Math.max(0, (a.budgetMax - it.price) / a.budgetMax) * 2; // mild preference for savings
    return s;
  };

  let pool = candidates;
  let relaxedBudget = false;
  const ranked = pool.map((it) => ({ it, s: scoreOf(it) })).sort((x, y) => y.s - x.s);
  const top = ranked.slice(0, limit);
  if (!top.length) return { recs: [], needs, relaxedBudget };

  const best = top[0].s;
  const recs: Recommendation[] = top.map(({ it, s }, idx) => {
    const why: Note[] = []; const strengths: Note[] = []; const limits: Note[] = []; const vs: Note[] = [];
    if (it.usages.includes(a.usage)) why.push({ key: 'usage_fit', vars: { usage: a.usage } });
    if ((it.ram_gb || 0) >= needs.minRam) why.push({ key: 'ram_ok', vars: { n: it.ram_gb || 0, need: needs.minRam } });
    if (needs.needDgpu || needs.wantDgpu) { if (it.gpu_dedicated) why.push({ key: 'dgpu_ok', vars: { model: it.gpu_model || '' } }); }
    if (a.budgetMax !== null && it.price <= a.budgetMax) why.push({ key: 'in_budget' });
    if (a.pref === 'portable' && it.weight_kg && it.weight_kg <= 1.4) why.push({ key: 'light', vars: { kg: it.weight_kg } });

    if (perfIndex(it) >= needs.minPerf + 2) strengths.push({ key: 'strong_cpu', vars: { model: it.cpu_model || '' } });
    if ((it.ram_gb || 0) >= 32) strengths.push({ key: 'lots_ram', vars: { n: it.ram_gb || 0 } });
    if ((it.storage_gb || 0) >= 1024) strengths.push({ key: 'big_storage', vars: { n: (it.storage_gb || 0) / 1024 } });
    if ((it.refresh_hz || 60) >= 120) strengths.push({ key: 'fast_screen', vars: { hz: it.refresh_hz || 0 } });
    if (it.grade === 'excellent') strengths.push({ key: 'excellent_grade' });
    if (it.battery_max !== null && it.battery_max >= 85) strengths.push({ key: 'good_battery', vars: { pct: it.battery_max } });
    if (it.has_upgrades) strengths.push({ key: 'upgradable' });

    if ((it.ram_gb || 0) < needs.idealRam) limits.push({ key: 'ram_low', vars: { n: it.ram_gb || 0, ideal: needs.idealRam } });
    if (!it.gpu_dedicated && (a.usage === 'graphics' || a.apps.some((x) => ['adobe', 'esports', 'autocad'].includes(x)))) limits.push({ key: 'igpu' });
    if (it.weight_kg && it.weight_kg >= 2.2) limits.push({ key: 'heavy', vars: { kg: it.weight_kg } });
    if (it.battery_max === null) limits.push({ key: 'battery_unknown' });
    else if (it.battery_min !== null && it.battery_min < 75) limits.push({ key: 'battery_low', vars: { pct: it.battery_min } });
    if (it.grade === 'fair' || it.grade === 'good') limits.push({ key: 'cosmetic', vars: { grade: it.grade } });
    if (resolutionClass(it.resolution) === 'hd') limits.push({ key: 'hd_screen' });
    if (it.available === 1) limits.push({ key: 'single_unit' });

    const alt = top[idx === 0 ? 1 : 0]?.it;
    if (alt) {
      const d = it.price - alt.price;
      if (Math.abs(d) >= 50_000) vs.push({ key: d < 0 ? 'vs_cheaper' : 'vs_pricier', vars: { amount: Math.abs(d), other: alt.family_name } });
      if ((it.ram_gb || 0) !== (alt.ram_gb || 0)) vs.push({ key: (it.ram_gb || 0) > (alt.ram_gb || 0) ? 'vs_more_ram' : 'vs_less_ram', vars: { other: alt.family_name } });
      if (!!it.gpu_dedicated !== !!alt.gpu_dedicated) vs.push({ key: it.gpu_dedicated ? 'vs_dgpu' : 'vs_no_dgpu', vars: { other: alt.family_name } });
      if (it.weight_kg && alt.weight_kg && Math.abs(it.weight_kg - alt.weight_kg) >= 0.3) vs.push({ key: it.weight_kg < alt.weight_kg ? 'vs_lighter' : 'vs_heavier', vars: { other: alt.family_name } });
    }
    const match = Math.max(40, Math.min(99, Math.round(100 - (best - s) * 2.5)));
    return { item: it, score: s, match, stretch: a.budgetMax !== null && it.price > a.budgetMax, why, strengths: strengths.slice(0, 4), limits: limits.slice(0, 4), vs: vs.slice(0, 3) };
  });
  return { recs, needs, relaxedBudget };
}

export const NOTE_TEXT: Record<'ar' | 'en', Record<string, string>> = {
  ar: {
    usage_fit: 'مصنّف ضمن أجهزة هذا الاستخدام', ram_ok: '{n} جيجا رام (المطلوب لاستخدامك {need} على الأقل)', dgpu_ok: 'كارت شاشة منفصل {model}',
    in_budget: 'داخل ميزانيتك', light: 'خفيف: {kg} كجم',
    strong_cpu: 'معالج قوي بالنسبة لاحتياجك ({model})', lots_ram: '{n} جيجا رام', big_storage: 'تخزين {n} تيرا', fast_screen: 'شاشة {hz} هرتز',
    excellent_grade: 'الحالة الشكلية ممتازة', good_battery: 'بطارية مقاسة حتى {pct}%', upgradable: 'متاح ترقيات رسمية من صفحة الجهاز',
    ram_low: '{n} جيجا رام — الأفضل {ideal} لاستخدامك (ممكن ترقية لو متاحة)', igpu: 'كارت شاشة مدمج — محدود في البرامج والألعاب التقيلة',
    heavy: 'وزنه {kg} كجم — أقل راحة في التنقل', battery_unknown: 'البطارية لم تُختبر بعد', battery_low: 'أقل بطارية متاحة مقاسة {pct}%',
    cosmetic: 'حالة شكلية "{grade}" — راجع وصف الخدوش', hd_screen: 'دقة الشاشة HD وليست Full HD', single_unit: 'وحدة واحدة متاحة',
    vs_cheaper: 'أرخص من {other} بـ {amount}', vs_pricier: 'أغلى من {other} بـ {amount}', vs_more_ram: 'رامات أكثر من {other}', vs_less_ram: 'رامات أقل من {other}',
    vs_dgpu: 'فيه كارت منفصل بخلاف {other}', vs_no_dgpu: 'بدون كارت منفصل بخلاف {other}', vs_lighter: 'أخف من {other}', vs_heavier: 'أتقل من {other}',
    cheaper: 'أرخص بـ {amount}', pricier: 'أغلى بـ {amount}', ram: 'رام {n} جيجا', storage: 'تخزين {n} جيجا', dgpu: 'كارت منفصل {model}', igpu_alt: 'كارت مدمج',
    cpu: 'معالج {model}', lighter: 'أخف ({kg} كجم)', heavier: 'أتقل ({kg} كجم)', grade: 'الحالة: {grade}',
  },
  en: {
    usage_fit: 'Listed for this use', ram_ok: '{n}GB RAM (your use needs at least {need}GB)', dgpu_ok: 'Dedicated {model} graphics', in_budget: 'Within your budget',
    light: 'Light: {kg} kg', strong_cpu: 'Strong CPU for your needs ({model})', lots_ram: '{n}GB RAM', big_storage: '{n}TB storage', fast_screen: '{hz}Hz display',
    excellent_grade: 'Excellent cosmetic condition', good_battery: 'Battery measured up to {pct}%', upgradable: 'Official upgrades available on the product page',
    ram_low: '{n}GB RAM — {ideal}GB is better for your use (upgrade if offered)', igpu: 'Integrated graphics — limited for heavy apps and games',
    heavy: 'Weighs {kg} kg — less comfortable to carry', battery_unknown: 'Battery not tested yet', battery_low: 'Lowest measured available battery: {pct}%',
    cosmetic: '"{grade}" cosmetic grade — check the notes on marks', hd_screen: 'HD screen, not Full HD', single_unit: 'Only one unit available',
    vs_cheaper: '{amount} cheaper than {other}', vs_pricier: '{amount} more than {other}', vs_more_ram: 'More RAM than {other}', vs_less_ram: 'Less RAM than {other}',
    vs_dgpu: 'Has a dedicated GPU, unlike {other}', vs_no_dgpu: 'No dedicated GPU, unlike {other}', vs_lighter: 'Lighter than {other}', vs_heavier: 'Heavier than {other}',
    cheaper: '{amount} cheaper', pricier: '{amount} more', ram: '{n}GB RAM', storage: '{n}GB storage', dgpu: 'Dedicated {model}', igpu_alt: 'Integrated graphics',
    cpu: '{model} CPU', lighter: 'Lighter ({kg} kg)', heavier: 'Heavier ({kg} kg)', grade: 'Grade: {grade}',
  },
};
