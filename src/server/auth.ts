import crypto from 'node:crypto';
import { db, one } from './db';

// ---- password hashing (scrypt, salted, constant-time verify) ----------------------------
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, n, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}
// A real hash used to keep timing equal when the email does not exist
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));

// ---- RBAC --------------------------------------------------------------------------------
export const PERMISSIONS = [
  'dashboard.view', 'finance.view', 'costs.view', 'products.view', 'products.edit', 'inventory.view', 'inventory.edit',
  'orders.view', 'orders.update', 'orders.cancel', 'orders.assign', 'payments.record', 'customers.view', 'customers.pii',
  'leads.manage', 'coupons.manage', 'shipping.manage', 'settings.manage', 'users.manage', 'audit.view', 'export', 'import',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: [...PERMISSIONS],
  manager: PERMISSIONS.filter((p) => p !== 'users.manage'),
  sales: ['dashboard.view', 'products.view', 'inventory.view', 'orders.view', 'orders.update', 'orders.assign', 'customers.view', 'customers.pii', 'leads.manage'],
  warehouse: ['dashboard.view', 'products.view', 'products.edit', 'inventory.view', 'inventory.edit', 'orders.view', 'import'],
  accountant: ['dashboard.view', 'finance.view', 'costs.view', 'products.view', 'inventory.view', 'orders.view', 'payments.record', 'customers.view', 'audit.view', 'export'],
  support: ['dashboard.view', 'products.view', 'inventory.view', 'orders.view', 'customers.view', 'customers.pii', 'leads.manage'],
};

export const ROLES: [string, string, string][] = [
  ['super_admin', 'مدير النظام', 'Super Admin'], ['manager', 'مدير الفرع / المتجر', 'Branch / Store Manager'],
  ['sales', 'موظف مبيعات', 'Sales Employee'], ['warehouse', 'موظف مخزن', 'Warehouse Employee'],
  ['accountant', 'محاسب', 'Accountant'], ['support', 'خدمة العملاء', 'Customer Support'],
];

export interface AdminUser { id: number; email: string; name: string; role_key: string; csrf: string; perms: Set<Permission> }

export function can(user: AdminUser | null, perm: Permission) { return !!user && user.perms.has(perm); }

// ---- sessions ----------------------------------------------------------------------------
const SESSION_HOURS = 12;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function createSession(userId: number, ip: string, ua: string): Promise<{ token: string; csrf: string }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  await db.query(`INSERT INTO sessions(id_hash, user_id, csrf_token, ip, user_agent, expires_at)
                  VALUES ($1,$2,$3,$4,$5, now() + interval '${SESSION_HOURS} hours')`, [sha256(token), userId, csrf, ip, ua.slice(0, 300)]);
  await db.query(`DELETE FROM sessions WHERE expires_at < now()`);
  return { token, csrf };
}

export async function getSessionUser(token: string | undefined): Promise<AdminUser | null> {
  if (!token || token.length > 100) return null;
  const row = await one<any>(db, `SELECT u.id, u.email, u.name, u.role_key, s.csrf_token
      FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = $1 AND s.expires_at > now() AND u.active`, [sha256(token)]);
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, role_key: row.role_key, csrf: row.csrf_token, perms: new Set(ROLE_PERMISSIONS[row.role_key] || []) };
}

export async function destroySession(token: string | undefined) {
  if (token) await db.query('DELETE FROM sessions WHERE id_hash = $1', [sha256(token)]);
}

/** Login with lockout after repeated failures. Returns user id or an error code. */
export async function attemptLogin(email: string, password: string): Promise<{ userId?: number; error?: 'invalid' | 'locked' }> {
  const u = await one<any>(db, 'SELECT id, password_hash, active, failed_logins, locked_until FROM users WHERE lower(email) = lower($1)', [email.trim()]);
  if (!u) { verifyPassword(password, DUMMY_HASH); return { error: 'invalid' }; }
  if (u.locked_until && new Date(u.locked_until) > new Date()) return { error: 'locked' };
  const ok = verifyPassword(password, u.password_hash);
  if (!ok || !u.active) {
    const fails = u.failed_logins + 1;
    await db.query(`UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $2 >= 5 THEN now() + interval '15 minutes' ELSE NULL END WHERE id = $1`, [u.id, fails >= 5 ? 0 : fails]);
    return { error: fails >= 5 ? 'locked' : 'invalid' };
  }
  await db.query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]);
  return { userId: u.id };
}
