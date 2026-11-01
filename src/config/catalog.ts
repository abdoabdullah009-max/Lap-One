/** Reference data used across storefront, admin and search. */

export const GRADES = ['excellent', 'very_good', 'good', 'fair'] as const;
export type Grade = (typeof GRADES)[number];

export const USAGES = ['study', 'office', 'programming', 'engineering', 'graphics', 'gaming', 'workstation', 'budget'] as const;
export type Usage = (typeof USAGES)[number];

export const UNIT_STATUSES = ['received', 'awaiting_inspection', 'available', 'reserved', 'sold', 'returned', 'under_maintenance', 'archived'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const ORDER_STATUSES = ['pending', 'awaiting_payment', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed manual transitions in admin. Server enforces these. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  awaiting_payment: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: ['refunded'],
  refunded: [],
};

/** Statuses that count as realized/confirmed sales in reports. */
export const CONFIRMED_SALE_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'shipped', 'delivered'];

/** Egyptian governorates (code, Arabic, English). */
export const GOVERNORATES: [string, string, string][] = [
  ['CAI', 'القاهرة', 'Cairo'], ['GIZ', 'الجيزة', 'Giza'], ['ALX', 'الإسكندرية', 'Alexandria'],
  ['QAL', 'القليوبية', 'Qalyubia'], ['SHR', 'الشرقية', 'Sharqia'], ['DAK', 'الدقهلية', 'Dakahlia'],
  ['GHR', 'الغربية', 'Gharbia'], ['MNF', 'المنوفية', 'Monufia'], ['BEH', 'البحيرة', 'Beheira'],
  ['KFS', 'كفر الشيخ', 'Kafr El Sheikh'], ['DAM', 'دمياط', 'Damietta'], ['PTS', 'بورسعيد', 'Port Said'],
  ['ISM', 'الإسماعيلية', 'Ismailia'], ['SUZ', 'السويس', 'Suez'], ['FYM', 'الفيوم', 'Faiyum'],
  ['BNS', 'بني سويف', 'Beni Suef'], ['MNY', 'المنيا', 'Minya'], ['AST', 'أسيوط', 'Asyut'],
  ['SHG', 'سوهاج', 'Sohag'], ['QNA', 'قنا', 'Qena'], ['LXR', 'الأقصر', 'Luxor'],
  ['ASN', 'أسوان', 'Aswan'], ['BA', 'البحر الأحمر', 'Red Sea'], ['WAD', 'الوادي الجديد', 'New Valley'],
  ['MT', 'مطروح', 'Matrouh'], ['SIN', 'شمال سيناء', 'North Sinai'], ['JS', 'جنوب سيناء', 'South Sinai'],
];
export const GOV_CODES = GOVERNORATES.map((g) => g[0]);
