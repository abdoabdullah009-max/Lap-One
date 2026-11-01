/**
 * Central brand configuration (code-level defaults).
 * Anything the business needs to change day-to-day (announcements, contact numbers, policies,
 * payment methods, trust claims) is editable in Admin → Settings and stored in the database;
 * those values override these defaults at runtime.
 */
export const brand = {
  name: 'LAP ONE',
  // Temporary text mark — replace with the approved logo file in /public/brand/ when available.
  logoIsTemporary: false,
  logoUrl: '/brand/logo.png' as string | null,
  colors: {
    navy: '#071B3A',
    navyDeep: '#071631',
    electric: '#0060FF',
    electricHover: '#004FD6',
    gray50: '#F6F7F9',
    gray100: '#EEF0F4',
    gray200: '#E1E5EC',
    gray500: '#6B7385',
    gray700: '#384052',
    ink: '#0E1420',
  },
  fonts: {
    // Loaded from Google Fonts in production; falls back to system fonts.
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
    ar: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif",
    en: "'Inter', 'IBM Plex Sans Arabic', 'Segoe UI', system-ui, sans-serif",
  },
  currency: 'EGP',
  defaultLocale: 'ar' as const,
  locales: ['ar', 'en'] as const,
  orderPrefix: 'LO-',
};
export type Locale = (typeof brand.locales)[number];
