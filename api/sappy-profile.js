import { neon } from '@neondatabase/serverless';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { rateLimit } from '../lib/rate-limit.js';

const PROFILE_PREFIX = 'sappy:profile:v1:';
const DYNAMIC_ENV_ID = process.env.SAPPY_DYNAMIC_ENV_ID
  || process.env.VITE_SAPPY_DYNAMIC_ENV_ID
  || '7f5ed078-ee9f-49aa-b9d6-8a90434aaf40';
const DYNAMIC_JWKS = createRemoteJWKSet(
  new URL(`https://app.dynamicauth.com/api/v0/sdk/${DYNAMIC_ENV_ID}/.well-known/jwks`)
);

globalThis.__sappyProfiles = globalThis.__sappyProfiles || new Map();
globalThis.__sappyProfilesTableReady = globalThis.__sappyProfilesTableReady || false;

function setCors(response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'authorization,content-type,x-dynamic-auth-token');
  response.setHeader('cache-control', 'no-store');
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function postgresUrl() {
  return process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.NEON_DATABASE_URL
    || '';
}

function sqlClient() {
  const url = postgresUrl();
  return url ? neon(url) : null;
}

async function ensureProfilesTable(sql) {
  if (!sql || globalThis.__sappyProfilesTableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS sappy_profiles (
      wallet TEXT PRIMARY KEY,
      display_name TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      pfp TEXT DEFAULT '',
      pfp_source TEXT DEFAULT 'verified',
      x_handle TEXT DEFAULT '',
      discord_id TEXT DEFAULT '',
      sappy_lol_id TEXT DEFAULT '',
      sappy_lol_handle TEXT DEFAULT '',
      sappy_lol_url TEXT DEFAULT '',
      sappy_game_reserved BOOLEAN DEFAULT false,
      sappy_game_verified BOOLEAN DEFAULT false,
      sappy_game_claimed_at BIGINT DEFAULT 0,
      claimed BOOLEAN DEFAULT false,
      verified BOOLEAN DEFAULT false,
      claimed_wallet TEXT DEFAULT '',
      claimed_at BIGINT DEFAULT 0,
      updated_at BIGINT DEFAULT 0
    )
  `;
  await sql`ALTER TABLE sappy_profiles ADD COLUMN IF NOT EXISTS sappy_lol_id TEXT DEFAULT ''`;
  await sql`ALTER TABLE sappy_profiles ADD COLUMN IF NOT EXISTS sappy_lol_handle TEXT DEFAULT ''`;
  await sql`ALTER TABLE sappy_profiles ADD COLUMN IF NOT EXISTS sappy_lol_url TEXT DEFAULT ''`;
  await sql`ALTER TABLE sappy_profiles ADD COLUMN IF NOT EXISTS sappy_game_reserved BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE sappy_profiles ADD COLUMN IF NOT EXISTS sappy_game_verified BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE sappy_profiles ADD COLUMN IF NOT EXISTS sappy_game_claimed_at BIGINT DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS sappy_profiles_updated_idx ON sappy_profiles (updated_at DESC)`;
  globalThis.__sappyProfilesTableReady = true;
}

async function kvCommand(command) {
  const config = kvConfig();
  if (!config) return undefined;
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error('profile storage unavailable');
  const data = await response.json();
  return data?.result;
}

function profileKey(wallet) {
  const normalized = String(wallet || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? `${PROFILE_PREFIX}${normalized}` : '';
}

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}

function sanitizePfp(value = '') {
  const pfp = String(value || '').trim();
  if (/^https?:\/\//i.test(pfp)) return pfp.slice(0, 600);
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(pfp)) return pfp.slice(0, 320000);
  return '';
}

function sanitizeSappyLolHandle(value = '') {
  const cleaned = sanitizeText(value, 48).replace(/^@/, '').replace(/[^A-Za-z0-9_.-]/g, '');
  return cleaned.slice(0, 40);
}

function sanitizeSappyLolUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://sappy.lol');
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'sappy.lol') return '';
    return url.toString().slice(0, 400);
  } catch (_) {
    return '';
  }
}

function sanitizeProfile(input = {}) {
  const wallet = String(input.wallet || input.claimedWallet || '').trim().toLowerCase();
  const key = profileKey(wallet);
  if (!key) return null;
  return {
    wallet,
    displayName: sanitizeText(input.displayName, 48),
    bio: sanitizeText(input.bio, 180),
    pfp: sanitizePfp(input.pfp),
    pfpSource: sanitizeText(input.pfpSource, 24) || 'verified',
    xHandle: sanitizeText(String(input.xHandle || '').replace(/^@/, ''), 15),
    discordId: sanitizeText(input.discordId, 64),
    sappyLolId: sanitizeText(input.sappyLolId, 64),
    sappyLolHandle: sanitizeSappyLolHandle(input.sappyLolHandle),
    sappyLolUrl: sanitizeSappyLolUrl(input.sappyLolUrl),
    sappyGameReserved: Boolean(input.sappyGameReserved || input.sappyLolHandle || input.sappyLolUrl),
    sappyGameVerified: Boolean(input.sappyGameVerified),
    sappyGameClaimedAt: Number(input.sappyGameClaimedAt || 0) || 0,
    claimed: Boolean(input.claimed),
    verified: Boolean(input.verified || input.claimed),
    claimedWallet: wallet,
    claimedAt: Number(input.claimedAt || Date.now()) || Date.now(),
    updatedAt: Date.now(),
  };
}

function authTokenFromRequest(request) {
  const authorization = String(request.headers?.authorization || request.headers?.Authorization || '').trim();
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim();
  return String(request.headers?.['x-dynamic-auth-token'] || request.headers?.['X-Dynamic-Auth-Token'] || '').trim();
}

function collectWalletsFromPayload(value, wallets = new Set(), seen = new Set()) {
  if (!value || seen.has(value)) return wallets;
  if (typeof value === 'string') {
    const matches = value.match(/0x[a-fA-F0-9]{40}/g) || [];
    matches.forEach((wallet) => wallets.add(wallet.toLowerCase()));
    return wallets;
  }
  if (typeof value !== 'object') return wallets;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectWalletsFromPayload(item, wallets, seen));
    return wallets;
  }
  Object.entries(value).forEach(([key, item]) => {
    if (/address|wallet|publicIdentifier|identifier|chain/i.test(key)) {
      collectWalletsFromPayload(item, wallets, seen);
    } else if (item && typeof item === 'object') {
      collectWalletsFromPayload(item, wallets, seen);
    }
  });
  return wallets;
}

async function verifyDynamicWallet(request, wallet) {
  const expected = String(wallet || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(expected)) {
    return { ok: false, status: 400, error: 'valid wallet required' };
  }
  const token = authTokenFromRequest(request);
  if (!token) {
    return { ok: false, status: 401, error: 'dynamic_auth_required' };
  }
  try {
    const { payload } = await jwtVerify(token, DYNAMIC_JWKS);
    const wallets = collectWalletsFromPayload(payload);
    if (wallets.has(expected)) return { ok: true, wallet: expected, payload };
    return { ok: false, status: 403, error: 'wallet_mismatch' };
  } catch (_) {
    return { ok: false, status: 401, error: 'dynamic_auth_invalid' };
  }
}

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (_) {
    return {};
  }
}

async function readProfile(wallet) {
  const key = profileKey(wallet);
  if (!key) return null;
  try {
    const sql = sqlClient();
    if (sql) {
      await ensureProfilesTable(sql);
      const normalizedWallet = String(wallet || '').trim().toLowerCase();
      const rows = await sql`
        SELECT wallet, display_name, bio, pfp, pfp_source, x_handle, discord_id,
          sappy_lol_id, sappy_lol_handle, sappy_lol_url, sappy_game_reserved,
          sappy_game_verified, sappy_game_claimed_at,
          claimed, verified, claimed_wallet, claimed_at, updated_at
        FROM sappy_profiles
        WHERE wallet = ${normalizedWallet}
        LIMIT 1
      `;
      const row = rows?.[0];
      if (row) {
        return sanitizeProfile({
          wallet: row.wallet,
          displayName: row.display_name,
          bio: row.bio,
          pfp: row.pfp,
          pfpSource: row.pfp_source,
          xHandle: row.x_handle,
          discordId: row.discord_id,
          sappyLolId: row.sappy_lol_id,
          sappyLolHandle: row.sappy_lol_handle,
          sappyLolUrl: row.sappy_lol_url,
          sappyGameReserved: row.sappy_game_reserved,
          sappyGameVerified: row.sappy_game_verified,
          sappyGameClaimedAt: Number(row.sappy_game_claimed_at || 0),
          claimed: row.claimed,
          verified: row.verified,
          claimedWallet: row.claimed_wallet,
          claimedAt: Number(row.claimed_at || Date.now()),
          updatedAt: Number(row.updated_at || Date.now()),
        });
      }
    }
  } catch (_) {}
  try {
    const stored = await kvCommand(['GET', key]);
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (parsed && typeof parsed === 'object') return sanitizeProfile(parsed);
  } catch (_) {}
  return globalThis.__sappyProfiles.get(key) || null;
}

async function writeProfile(profile) {
  const key = profileKey(profile.wallet);
  if (!key) return null;
  globalThis.__sappyProfiles.set(key, profile);
  try {
    const sql = sqlClient();
    if (sql) {
      await ensureProfilesTable(sql);
      await sql`
        INSERT INTO sappy_profiles (
          wallet, display_name, bio, pfp, pfp_source, x_handle, discord_id,
          sappy_lol_id, sappy_lol_handle, sappy_lol_url, sappy_game_reserved,
          sappy_game_verified, sappy_game_claimed_at,
          claimed, verified, claimed_wallet, claimed_at, updated_at
        )
        VALUES (
          ${profile.wallet},
          ${profile.displayName},
          ${profile.bio},
          ${profile.pfp},
          ${profile.pfpSource},
          ${profile.xHandle},
          ${profile.discordId},
          ${profile.sappyLolId},
          ${profile.sappyLolHandle},
          ${profile.sappyLolUrl},
          ${profile.sappyGameReserved},
          ${profile.sappyGameVerified},
          ${profile.sappyGameClaimedAt},
          ${profile.claimed},
          ${profile.verified},
          ${profile.claimedWallet},
          ${profile.claimedAt},
          ${profile.updatedAt}
        )
        ON CONFLICT (wallet) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          bio = EXCLUDED.bio,
          pfp = EXCLUDED.pfp,
          pfp_source = EXCLUDED.pfp_source,
          x_handle = EXCLUDED.x_handle,
          discord_id = EXCLUDED.discord_id,
          sappy_lol_id = EXCLUDED.sappy_lol_id,
          sappy_lol_handle = EXCLUDED.sappy_lol_handle,
          sappy_lol_url = EXCLUDED.sappy_lol_url,
          sappy_game_reserved = EXCLUDED.sappy_game_reserved,
          sappy_game_verified = EXCLUDED.sappy_game_verified,
          sappy_game_claimed_at = EXCLUDED.sappy_game_claimed_at,
          claimed = EXCLUDED.claimed,
          verified = EXCLUDED.verified,
          claimed_wallet = EXCLUDED.claimed_wallet,
          claimed_at = EXCLUDED.claimed_at,
          updated_at = EXCLUDED.updated_at
      `;
      return profile;
    }
  } catch (_) {}
  try {
    await kvCommand(['SET', key, JSON.stringify(profile)]);
  } catch (_) {}
  return profile;
}

function storageName() {
  return postgresUrl() ? 'neon-postgres' : kvConfig() ? 'vercel-kv' : 'memory-fallback';
}

export default async function handler(request, response) {
  setCors(response);
  if (request.method === 'OPTIONS') return response.status(204).end();

  if (request.method === 'POST') {
    if (rateLimit(request, response, { name: 'sappy-profile-write', limit: 12, windowMs: 60_000 })) return;
    const profile = sanitizeProfile(await readBody(request));
    if (!profile) return response.status(400).json({ error: 'valid wallet required' });
    const auth = await verifyDynamicWallet(request, profile.wallet);
    if (!auth.ok) return response.status(auth.status || 401).json({ error: auth.error || 'dynamic_auth_required' });
    profile.claimed = true;
    profile.verified = true;
    profile.claimedWallet = auth.wallet;
    const saved = await writeProfile(profile);
    return response.status(200).json({ profile: saved, storage: storageName() });
  }

  if (rateLimit(request, response, { name: 'sappy-profile-read', limit: 90, windowMs: 60_000 })) return;
  const profile = await readProfile(request.query?.wallet);
  return response.status(200).json({ profile, storage: storageName() });
}
