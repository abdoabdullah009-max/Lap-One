import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// Load .env (simple KEY=VALUE parser; real env vars take precedence)
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  DB_DRIVER: z.enum(['builtin', 'pg']).default('builtin'),
  DB_POOL_MAX: z.coerce.number().default(10),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  // Payments
  PAYMOB_MODE: z.enum(['sandbox_mock', 'test', 'live']).default('sandbox_mock'),
  PAYMOB_SECRET_KEY: z.string().optional(),
  PAYMOB_PUBLIC_KEY: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().min(16),
  PAYMOB_CARD_INTEGRATION_ID: z.string().optional(),
  PAYMOB_WALLET_INTEGRATION_ID: z.string().optional(),
  PAYMOB_API_BASE: z.string().url().default('https://accept.paymob.com'),
  // Uploads
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(8),
  // Bootstrap admin (only used by `npm run seed` when no users exist)
  SEED_ADMIN_EMAIL: z.string().email().default('admin@lapone.local'),
  SEED_ADMIN_PASSWORD: z.string().min(10).optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
