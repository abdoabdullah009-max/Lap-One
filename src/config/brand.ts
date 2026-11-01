/**
 * Central brand configuration (code-level defaults).
 * Anything the business needs to change day-to-day (announcements, contact numbers, policies,
 * payment methods, trust claims) is editable in Admin → Settings and stored in the database;
 * those values override these defaults at runtime.
 */
export const brand = {
  name: 'LAP ONE',
  // Temporary text mark — replace with the approved logo file in /public/brand/ when available.
  logoIsTemporary: true,
  logoUrl: null as string | null,
  colors: {
    navy: '#0B1F44',
    navyDeep: '#071631',
    electric: '#1D5BFF',
    electricHover: '#1446D6',
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
