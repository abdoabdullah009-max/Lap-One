import type { ReactNode } from 'react';
import { brand } from '../config/brand';
import { USAGES } from '../config/catalog';
import { View, Icon, href, bi, USAGE_ICON, waLink } from './ui';

export interface Meta {
  title: string; description?: string; canonical?: string; noindex?: boolean; ogImage?: string; ogType?: string;
  alternates?: boolean; jsonLd?: unknown[];
}

export function Layout({ v, meta, children, bodyClass = '' }: { v: View; meta: Meta; children: ReactNode; bodyClass?: string }) {
  const { t, locale, settings } = v;
  const other = locale === 'ar' ? 'en' : 'ar';
  const pathNoLocale = v.path.replace(/^\/(ar|en)/, '') || '';
  const canonical = meta.canonical ?? `${v.baseUrl}${v.path}`;
  const announcements = settings.announcements.filter((a) => a.enabled && bi(v, a));
  const wa = waLink(v, locale === 'ar' ? 'مرحبًا، عندي استفسار عن لابتوب' : 'Hi, I have a question about a laptop');
  const a = settings.analytics;
  const consented = v.search.includes('__never') ? false : undefined;
  void consented;
  return (
    <html lang={locale} dir={t('dir')}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{meta.title}</title>
        {meta.description ? <meta name="description" content={meta.description} /> : null}
        <link rel="canonical" href={canonical} />
        {meta.noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
        {meta.alternates !== false ? <>
          <link rel="alternate" hrefLang="ar-EG" href={`${v.baseUrl}/ar${pathNoLocale}`} />
          <link rel="alternate" hrefLang="en" href={`${v.baseUrl}/en${pathNoLocale}`} />
          <link rel="alternate" hrefLang="x-default" href={`${v.baseUrl}/ar${pathNoLocale}`} />
        </> : null}
        <meta property="og:site_name" content={brand.name} />
        <meta property="og:title" content={meta.title} />
        {meta.description ? <meta property="og:description" content={meta.description} /> : null}
        <meta property="og:type" content={meta.ogType || 'website'} />
        <meta property="og:url" content={canonical} />
        <meta property="og:locale" content={locale === 'ar' ? 'ar_EG' : 'en_US'} />
        {meta.ogImage ? <meta property="og:image" content={meta.ogImage.startsWith('http') ? meta.ogImage : v.baseUrl + meta.ogImage} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" content={brand.colors.electric} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={brand.fonts.googleFontsHref} />
        <link rel="stylesheet" href={`/assets/app.css?v=${v.v}`} />
        {(meta.jsonLd || []).map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, '\\u003c') }} />)}
      </head>
      <body className={bodyClass} data-locale={locale} data-ga={a.ga4_id || undefined} data-gtm={a.gtm_id || undefined} data-pixel={a.meta_pixel_id || undefined}
        data-consent-required={a.require_consent ? '1' : '0'} data-currency="EGP">
        <a className="skip" href="#main">{t('skip')}</a>
        {settings.demo_mode ? <div className="demo-banner" role="note"><Icon name="info" size={16} />{t('demo_banner')}</div> : null}
        {announcements.length ? (
          <div className="announce" role="region" aria-label="announcements">
            <div className="announce__track">{announcements.map((x, i) => <span key={i}>{bi(v, x)}</span>)}</div>
          </div>
        ) : null}
        <header className="header" id="top">
          <div className="header__row container">
            <button type="button" className="iconbtn header__menu js-drawer-open" aria-label={t('menu')} aria-controls="drawer" aria-expanded="false"><Icon name="menu" /></button>
            <a href={href(v)} className="logo" aria-label={`${brand.name} — ${t('home')}`}>
              {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} width={176} height={28} className="logo__img" /> : <><span className="logo__mark" aria-hidden="true">L1</span><span className="logo__word">LAP<b>ONE</b></span></>}
            </a>
            <form className="search js-search" role="search" action={href(v, '/laptops')} method="get">
              <label htmlFor="q" className="sr-only">{t('search')}</label>
              <Icon name="search" size={18} className="search__icon" />
              <input id="q" name="q" type="search" autoComplete="off" placeholder={t('search_placeholder')} defaultValue={new URLSearchParams(v.search).get('q') || ''}
                aria-autocomplete="list" aria-controls="search-pop" aria-expanded="false" role="combobox" enterKeyHint="search" maxLength={120} />
              <button className="search__btn" aria-label={t('search')}><Icon name="arrow" size={18} className="flip-rtl" /></button>
              <div id="search-pop" className="search__pop" role="listbox" hidden />
            </form>
            <nav className="header__actions" aria-label="account">
              <a href={href(v, '/wishlist')} className="hact" aria-label={t('wishlist')}><Icon name="heart" /><span className="hact__label">{t('wishlist')}</span><span className="count js-wish-count" hidden={!v.wishIds.length}>{v.wishIds.length}</span></a>
              <a href={href(v, '/compare')} className="hact hide-sm" aria-label={t('compare')}><Icon name="compare" /><span className="hact__label">{t('compare')}</span><span className="count js-cmp-count" hidden={!v.compareIds.length}>{v.compareIds.length}</span></a>
              <a href={href(v, '/track')} className="hact hide-sm" aria-label={t('account')}><Icon name="user" /><span className="hact__label">{t('account')}</span></a>
              <a href={href(v, '/cart')} className="hact hact--cart" aria-label={t('cart')}><Icon name="cart" /><span className="hact__label">{t('cart')}</span><span className="count js-cart-count" hidden={!v.cartCount}>{v.cartCount}</span></a>
            </nav>
          </div>
          <nav className="nav container" aria-label="main">
            <details className="nav__cats">
              <summary><Icon name="grid" size={18} />{t('categories')}<Icon name="chevronDown" size={16} /></summary>
              <div className="mega">
                <div className="mega__grid">
                  {USAGES.map((u) => <a key={u} href={href(v, `/laptops?usage=${u}`)} className="mega__item"><Icon name={USAGE_ICON[u]} /><span><b>{t(`usage_${u}` as any)}</b><small>{t(`usage_${u}_d` as any)}</small></span></a>)}
                </div>
                <a href={href(v, '/laptops?accessory=1')} className="mega__more">{t('accessories')}</a>
              </div>
            </details>
            <a href={href(v, '/laptops')}>{t('all_laptops')}</a>
            <a href={href(v, '/laptops?offer=1')} className="nav__offers"><Icon name="tag" size={16} />{t('offers')}</a>
            <a href={href(v, '/help-me-choose')} className="nav__wizard"><Icon name="sparkle" size={16} />{t('hero_cta2')}</a>
            <span className="nav__spacer" />
            <a href={href(v, '/contact')} className="hide-sm">{t('contact')}</a>
            {wa ? <a href={wa} className="nav__wa js-wa" data-source="whatsapp_general" target="_blank" rel="noopener"><Icon name="whatsapp" size={16} />{t('whatsapp')}</a> : null}
            <a href={`/${other}${pathNoLocale}${v.search}`} className="nav__lang" hrefLang={other} lang={other}><Icon name="globe" size={16} />{t('language')}</a>
          </nav>
        </header>

        <div className="drawer" id="drawer" hidden>
          <div className="drawer__panel" role="dialog" aria-modal="true" aria-label={t('menu')}>
            <div className="drawer__head">{brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} width={150} height={24} className="logo__img" /> : <span className="logo__word">LAP<b>ONE</b></span>}<button className="iconbtn js-drawer-close" aria-label={t('close')}><Icon name="x" /></button></div>
            <nav className="drawer__nav">
              <a href={href(v, '/laptops')}>{t('all_laptops')}</a>
              <a href={href(v, '/help-me-choose')}>{t('hero_cta2')}</a>
              <a href={href(v, '/laptops?offer=1')}>{t('offers')}</a>
              <p className="drawer__label">{t('categories')}</p>
              {USAGES.map((u) => <a key={u} href={href(v, `/laptops?usage=${u}`)}><Icon name={USAGE_ICON[u]} size={18} />{t(`usage_${u}` as any)}</a>)}
              <a href={href(v, '/laptops?accessory=1')}>{t('accessories')}</a>
              <hr />
              <a href={href(v, '/compare')}>{t('compare')}</a>
              <a href={href(v, '/track')}>{t('account')}</a>
              <a href={href(v, '/contact')}>{t('contact')}</a>
              <a href={`/${other}${pathNoLocale}${v.search}`} lang={other}>{t('language')}</a>
            </nav>
          </div>
        </div>

        <main id="main" tabIndex={-1}>{children}</main>

        <Footer v={v} />
        <div className="cmpbar" hidden={v.compareIds.length === 0} aria-live="polite">
          <div className="container cmpbar__in">
            <span className="js-cmpbar-text">{t('compare_bar', { n: v.compareIds.length })}</span>
            <a className="btn btn--primary btn--sm" href={href(v, '/compare')}>{t('compare_now')}</a>
            <button type="button" className="btn btn--ghost btn--sm js-compare-clear">{t('clear')}</button>
          </div>
        </div>
        <div className="toast" role="status" aria-live="polite" hidden />
        <dialog className="qv" aria-label={t('quick_view')}><div className="qv__body" /><button className="iconbtn qv__close js-qv-close" aria-label={t('close')}><Icon name="x" /></button></dialog>
        {a.require_consent && (a.ga4_id || a.gtm_id || a.meta_pixel_id) ? (
          <div className="consent" hidden>
            <p>{t('cookie_text')} <a href={href(v, '/pages/privacy')}>{t('policies')}</a></p>
            <div><button className="btn btn--primary btn--sm js-consent" data-v="yes">{t('accept')}</button><button className="btn btn--ghost btn--sm js-consent" data-v="no">{t('decline')}</button></div>
          </div>
        ) : null}
        <nav className="bnav" aria-label={locale === 'ar' ? 'التنقل السريع' : 'Quick navigation'}>
          <a href={href(v)} className={pathNoLocale === '' ? 'is-on' : ''}><Icon name="grid" size={22} /><span>{t('home')}</span></a>
          <a href={href(v, '/laptops')} className={pathNoLocale.startsWith('/laptops') ? 'is-on' : ''}><Icon name="search" size={22} /><span>{locale === 'ar' ? 'الأجهزة' : 'Laptops'}</span></a>
          <a href={href(v, '/cart')} className={pathNoLocale === '/cart' ? 'is-on' : ''}><span className="bnav__ic"><Icon name="cart" size={22} /><span className="count js-cart-count" hidden={!v.cartCount}>{v.cartCount}</span></span><span>{t('cart')}</span></a>
          {wa ? <a href={wa} className="bnav__wa js-wa" data-source="whatsapp_general" target="_blank" rel="noopener"><Icon name="whatsapp" size={22} /><span>{t('whatsapp')}</span></a>
            : <a href={href(v, '/contact')}><Icon name="phone" size={22} /><span>{t('contact')}</span></a>}
        </nav>
        {wa ? <a href={wa} className="wa-fab js-wa" data-source="whatsapp_general" target="_blank" rel="noopener" aria-label={t('whatsapp')}><Icon name="whatsapp" size={28} /></a> : null}
        <script src={`/assets/app.js?v=${v.v}`} defer nonce={v.nonce} />
      </body>
    </html>
  );
}

function Footer({ v }: { v: View }) {
  const { t, settings: s } = v;
  const c = s.contact;
  const social = Object.entries(s.social).filter(([, url]) => url);
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div>
          {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} width={176} height={28} className="logo__img" loading="lazy" /> : <span className="logo__word logo__word--light">LAP<b>ONE</b></span>}
          <p className="footer__about">{t('footer_about')}</p>
          {brand.logoIsTemporary ? <p className="footer__note">{v.locale === 'ar' ? 'شعار نصي مؤقت — ليس الشعار المعتمد.' : 'Temporary text mark — not the approved logo.'}</p> : null}
        </div>
        <div>
          <h3>{t('quick_links')}</h3>
          <ul>
            <li><a href={href(v, '/laptops')}>{t('all_laptops')}</a></li>
            <li><a href={href(v, '/help-me-choose')}>{t('hero_cta2')}</a></li>
            <li><a href={href(v, '/laptops?offer=1')}>{t('offers')}</a></li>
            <li><a href={href(v, '/compare')}>{t('compare')}</a></li>
            <li><a href={href(v, '/track')}>{t('account')}</a></li>
            <li><a href={href(v, '/faq')}>{t('faq')}</a></li>
          </ul>
        </div>
        <div>
          <h3>{t('policies')}</h3>
          <ul>
            {(['warranty', 'shipping', 'returns', 'inspection', 'privacy', 'terms', 'about'] as const).map((p) => (
              <li key={p}><a href={href(v, `/pages/${p}`)}>{POLICY_TITLES[v.locale][p]}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <h3>{t('contact_us')}</h3>
          <ul className="footer__contact">
            {c.phone ? <li><Icon name="phone" size={16} /><a href={`tel:${c.phone}`} dir="ltr">{c.phone}</a></li> : null}
            {c.whatsapp ? <li><Icon name="whatsapp" size={16} /><a href={waLink(v, '') || '#'} dir="ltr" target="_blank" rel="noopener">{c.whatsapp.replace(/^20/, '0')}</a></li> : null}
            {c.email ? <li><Icon name="mail" size={16} /><a href={`mailto:${c.email}`}>{c.email}</a></li> : null}
            {bi(v, c.address) ? <li><Icon name="pin" size={16} />{bi(v, c.address)}</li> : null}
            {bi(v, c.hours) ? <li><Icon name="clock" size={16} />{bi(v, c.hours)}</li> : null}
          </ul>
          {social.length ? <><h3>{t('follow')}</h3><ul className="footer__social">{social.map(([k, url]) => <li key={k}><a href={url} target="_blank" rel="noopener">{k}</a></li>)}</ul></> : null}
        </div>
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} {brand.name}. {t('rights')}.</span>
        {s.invoice.commercial_register ? <span>{v.locale === 'ar' ? 'سجل تجاري' : 'CR'}: {s.invoice.commercial_register}</span> : null}
        <a href="#top">↑</a>
      </div>
    </footer>
  );
}

export const POLICY_TITLES = {
  ar: { warranty: 'سياسة الضمان', shipping: 'الشحن والتوصيل', returns: 'الاسترجاع والاستبدال', inspection: 'إزاي بنفحص الأجهزة', privacy: 'الخصوصية', terms: 'الشروط والأحكام', about: 'من نحن' },
  en: { warranty: 'Warranty policy', shipping: 'Shipping & delivery', returns: 'Returns & exchanges', inspection: 'How we inspect devices', privacy: 'Privacy', terms: 'Terms & conditions', about: 'About us' },
} as const;
