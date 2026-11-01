/** Money helpers. All amounts are integer piasters (1 EGP = 100). */

export const EGP = (pounds: number): number => {
  const v = Math.round(pounds * 100);
  if (!Number.isSafeInteger(v)) throw new Error('Amount out of range');
  return v;
};

/** Parse user/admin input like "15,000" / "١٥٠٠٠" / "15000.50" into piasters. Returns null if invalid. */
export function parseEGP(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = toLatinDigits(String(input)).replace(/[,\s٬]/g, '').replace('٫', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const v = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(v) ? v : null;
}

export function formatEGP(piasters: number, locale: 'ar' | 'en' = 'ar'): string {
  const pounds = piasters / 100;
  const hasFrac = piasters % 100 !== 0;
  const num = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG', {
    minimumFractionDigits: hasFrac ? 2 : 0, maximumFractionDigits: 2,
  }).format(pounds);
  return locale === 'ar' ? `${num} ج.م` : `EGP ${num}`;
}

/** Percentage of an amount, rounded down to whole piasters (never over-discounts). */
export function percentOf(amount: number, percent: number): number {
  return Math.floor((amount * percent) / 100);
}

export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}
