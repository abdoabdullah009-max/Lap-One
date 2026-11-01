/**
 * Generates neutral SVG illustrations used as REPRESENTATIVE images for demo products.
 * They are stored with kind='representative' and the storefront labels them as such.
 * Replace by uploading real photos in Admin → Products (choose "actual unit" for photos of the specific device).
 */
import fs from 'node:fs';
import path from 'node:path';

const PALETTES: Record<string, { body: string; edge: string; key: string }> = {
  silver: { body: '#D9DDE3', edge: '#B8BEC8', key: '#2A2F38' },
  black: { body: '#2B2F36', edge: '#1A1D22', key: '#0F1115' },
  graphite: { body: '#5B616B', edge: '#43484F', key: '#1E2126' },
  gold: { body: '#E8D9C4', edge: '#CDBBA2', key: '#3A342C' },
};

function screen(label: string, sub: string) {
  return `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1F44"/><stop offset="1" stop-color="#1D5BFF"/></linearGradient></defs>
  <rect x="148" y="62" width="504" height="306" rx="6" fill="url(#g)"/>
  <text x="400" y="212" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="700" fill="#fff">${label}</text>
  <text x="400" y="248" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="17" fill="#C9D6FF">${sub}</text>`;
}

export function laptopSvg(view: 'front' | 'angle' | 'closed', color: string, label: string, sub: string): string {
  const p = PALETTES[color] || PALETTES.silver;
  const bg = `<rect width="800" height="600" fill="#F4F6F9"/>`;
  if (view === 'front') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${label}">${bg}
    <ellipse cx="400" cy="500" rx="330" ry="22" fill="#000" opacity=".08"/>
    <rect x="130" y="44" width="540" height="342" rx="18" fill="${p.edge}"/><rect x="138" y="52" width="524" height="326" rx="12" fill="#0A0D12"/>
    ${screen(label, sub)}
    <path d="M70 398 H730 L760 470 Q762 482 748 482 H52 Q38 482 40 470 Z" fill="${p.body}"/>
    <rect x="40" y="476" width="720" height="10" rx="5" fill="${p.edge}"/>
    <g fill="${p.key}" opacity=".85">${Array.from({ length: 5 }, (_, r) => `<rect x="${150 + r * 6}" y="${408 + r * 11}" width="${500 - r * 12}" height="7" rx="2"/>`).join('')}</g>
    <rect x="335" y="462" width="130" height="10" rx="3" fill="${p.edge}"/></svg>`;
  }
  if (view === 'angle') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${label}">${bg}
    <ellipse cx="420" cy="505" rx="300" ry="20" fill="#000" opacity=".08"/>
    <path d="M190 80 L560 40 L600 360 L230 400 Z" fill="${p.edge}"/><path d="M200 90 L552 52 L590 350 L238 388 Z" fill="#0B1F44"/>
    <text x="395" y="230" text-anchor="middle" transform="rotate(-6 395 230)" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700" fill="#fff">${label}</text>
    <path d="M230 400 L600 360 L720 470 L320 500 Z" fill="${p.body}"/><path d="M320 500 L720 470 L722 482 L322 512 Z" fill="${p.edge}"/>
    <path d="M300 420 L590 390 L650 445 L355 470 Z" fill="${p.key}" opacity=".7"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${label}">${bg}
  <ellipse cx="400" cy="470" rx="320" ry="22" fill="#000" opacity=".08"/>
  <rect x="100" y="120" width="600" height="340" rx="22" fill="${p.body}"/><rect x="100" y="440" width="600" height="20" rx="8" fill="${p.edge}"/>
  <circle cx="400" cy="290" r="26" fill="none" stroke="${p.edge}" stroke-width="4"/>
  <text x="400" y="360" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="20" fill="${p.key}" opacity=".6">${sub}</text></svg>`;
}

export function accessorySvg(kind: string, label: string): string {
  const shapes: Record<string, string> = {
    charger: '<rect x="290" y="210" width="220" height="140" rx="22" fill="#2B2F36"/><path d="M510 280 C600 280 600 400 680 400" stroke="#2B2F36" stroke-width="12" fill="none"/><rect x="660" y="388" width="40" height="24" rx="5" fill="#5B616B"/>',
    ram: '<rect x="170" y="230" width="460" height="120" rx="6" fill="#1F6B3A"/>' + Array.from({ length: 8 }, (_, i) => `<rect x="${195 + i * 54}" y="252" width="40" height="56" rx="3" fill="#111"/>`).join('') + '<rect x="170" y="335" width="460" height="15" fill="#C9A227"/>',
    ssd: '<rect x="200" y="255" width="400" height="90" rx="6" fill="#1A1D22"/><rect x="230" y="275" width="120" height="50" rx="3" fill="#333"/><rect x="370" y="275" width="70" height="50" rx="3" fill="#333"/><rect x="580" y="270" width="20" height="60" fill="#C9A227"/>',
    bag: '<rect x="250" y="150" width="300" height="330" rx="50" fill="#0B1F44"/><rect x="300" y="250" width="200" height="150" rx="20" fill="#1D5BFF" opacity=".5"/><path d="M330 150 Q400 80 470 150" stroke="#0B1F44" stroke-width="18" fill="none"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="${label}"><rect width="800" height="600" fill="#F4F6F9"/>${shapes[kind] || shapes.charger}
  <text x="400" y="545" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="22" fill="#384052">${label}</text></svg>`;
}

export function writeSvg(dir: string, name: string, svg: string): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), svg);
  return `/img/demo/${name}`;
}
