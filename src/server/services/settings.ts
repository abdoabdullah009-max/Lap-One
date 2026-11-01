import { db, many } from '../db';

/**
 * Site settings: editable in Admin → Settings. Nothing here invents business facts:
 * contact numbers, policies, payment accounts etc. default to empty and the storefront
 * hides or flags anything that has not been filled in.
 */
export interface Bilingual { ar: string; en: string }
export interface Settings {
  demo_mode: boolean;
  announcements: { ar: string; en: string; enabled: boolean }[];
  contact: { phone: string; whatsapp: string; email: string; address: Bilingual; hours: Bilingual; map_url: string };
  social: { facebook: string; instagram: string; tiktok: string; youtube: string };
  payments: {
    cod: { enabled: boolean; max_order: number | null };
    paymob_card: { enabled: boolean };
    paymob_wallet: { enabled: boolean };
    manual_transfer: { enabled: boolean; instapay_handle: string; bank_details: Bilingual };
    bnpl: { enabled: boolean; provider_name: string };
  };
  pickup: { enabled: boolean; address: Bilingual; hours: Bilingual };
  reservation: { online_minutes: number; cod_hours: number; manual_transfer_hours: number };
  budget_ranges: { min: number | null; max: number | null }[];        // piasters
  trust: Record<'inspection' | 'grading' | 'warranty' | 'support' | 'shipping_returns', { enabled: boolean; title: Bilingual; body: Bilingual }>;
  grade_definitions: Record<'excellent' | 'very_good' | 'good' | 'fair', Bilingual>;
  policies: Record<'warranty' | 'shipping' | 'returns' | 'privacy' | 'terms' | 'about' | 'inspection', Bilingual>;
  faq: { q: Bilingual; a: Bilingual }[];
  analytics: { ga4_id: string; gtm_id: string; meta_pixel_id: string; require_consent: boolean };
  invoice: { legal_name: string; tax_id: string; commercial_register: string; address: string };
  wholesale_enabled: boolean;
}

const B = (ar = '', en = ''): Bilingual => ({ ar, en });

export const DEFAULT_SETTINGS: Settings = {
  demo_mode: true,
  announcements: [],
  contact: { phone: '', whatsapp: '', email: '', address: B(), hours: B(), map_url: '' },
  social: { facebook: '', instagram: '', tiktok: '', youtube: '' },
  payments: {
    cod: { enabled: true, max_order: null },
    paymob_card: { enabled: false },
    paymob_wallet: { enabled: false },
    manual_transfer: { enabled: false, instapay_handle: '', bank_details: B() },
    bnpl: { enabled: false, provider_name: '' },
  },
  pickup: { enabled: false, address: B(), hours: B() },
  reservation: { online_minutes: 30, cod_hours: 48, manual_transfer_hours: 24 },
  budget_ranges: [],
  trust: {
    inspection: { enabled: false, title: B('فحص الأجهزة', 'Device inspection'), body: B() },
    grading: { enabled: false, title: B('تصنيف الحالة', 'Condition grading'), body: B() },
    warranty: { enabled: false, title: B('الضمان', 'Warranty'), body: B() },
    support: { enabled: false, title: B('الدعم الفني', 'Technical support'), body: B() },
    shipping_returns: { enabled: false, title: B('الشحن والاسترجاع', 'Shipping & returns'), body: B() },
  },
  grade_definitions: {
    excellent: B('ممتاز', 'Excellent'), very_good: B('جيد جدًا', 'Very good'), good: B('جيد', 'Good'), fair: B('مقبول', 'Fair'),
  },
  policies: { warranty: B(), shipping: B(), returns: B(), privacy: B(), terms: B(), about: B(), inspection: B() },
  faq: [],
  analytics: { ga4_id: '', gtm_id: '', meta_pixel_id: '', require_consent: true },
  invoice: { legal_name: '', tax_id: '', commercial_register: '', address: '' },
  wholesale_enabled: false,
};

let cache: { at: number; value: Settings } | null = null;

function deepMerge<T>(base: T, over: any): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over as T;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = k in (base as any) ? deepMerge((base as any)[k], over[k]) : over[k];
  return out;
}

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  const rows = await many<{ key: string; value: any }>(db, 'SELECT key, value FROM site_settings');
  let s: Settings = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) (s as any)[r.key] = deepMerge((DEFAULT_SETTINGS as any)[r.key], r.value);
  cache = { at: Date.now(), value: s };
  return s;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K], userId: number | null) {
  await db.query(
    `INSERT INTO site_settings(key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), userId],
  );
  cache = null;
}

export function invalidateSettings() { cache = null; }
