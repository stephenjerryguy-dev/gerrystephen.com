import { neon } from '@neondatabase/serverless';
import { rateLimit } from '../lib/rate-limit.js';

const MAX_ENTRIES = 50;
const LEADERBOARD_KEY = 'monerge:leaderboard:v1';

globalThis.__monergeLeaderboard = globalThis.__monergeLeaderboard || [];
globalThis.__monergeLeaderboardTableReady = globalThis.__monergeLeaderboardTableReady || false;

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

async function ensureLeaderboardTable(sql) {
  if (!sql || globalThis.__monergeLeaderboardTableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS monerge_leaderboard (
      id TEXT PRIMARY KEY,
      wallet TEXT DEFAULT '',
      username TEXT DEFAULT '',
      pfp TEXT DEFAULT '',
      score INTEGER NOT NULL,
      actual INTEGER NOT NULL,
      difficulty TEXT DEFAULT 'Classic',
      max_tile INTEGER DEFAULT 2,
      moves INTEGER DEFAULT 0,
      signature TEXT DEFAULT '',
      tx_hash TEXT DEFAULT '',
      revealed_at TIMESTAMPTZ DEFAULT now(),
      signed_at TIMESTAMPTZ
    )
  `;
  await sql`ALTER TABLE monerge_leaderboard ADD COLUMN IF NOT EXISTS tx_hash TEXT DEFAULT ''`;
  await sql`
    CREATE INDEX IF NOT EXISTS monerge_leaderboard_rank_idx
    ON monerge_leaderboard ((signature <> ''), score DESC, revealed_at DESC)
  `;
  globalThis.__monergeLeaderboardTableReady = true;
}

function rowToEntry(row = {}) {
  return sanitizeEntry({
    id: row.id,
    wallet: row.wallet,
    username: row.username,
    pfp: row.pfp,
    score: row.score,
    actual: row.actual,
    difficulty: row.difficulty,
    maxTile: row.max_tile,
    moves: row.moves,
    signature: row.signature,
    txHash: row.tx_hash,
    revealedAt: row.revealed_at ? new Date(row.revealed_at).toISOString() : '',
    signedAt: row.signed_at ? new Date(row.signed_at).toISOString() : ''
  });
}

async function readPostgresEntries() {
  const sql = sqlClient();
  if (!sql) return undefined;
  await ensureLeaderboardTable(sql);
  const rows = await sql`
    SELECT id, wallet, username, pfp, score, actual, difficulty, max_tile, moves, signature, tx_hash, revealed_at, signed_at
    FROM monerge_leaderboard
    ORDER BY (signature <> '') DESC, score DESC, revealed_at DESC
    LIMIT 200
  `;
  return dedupeEntries(rows.map(rowToEntry).filter(Boolean)).slice(0, MAX_ENTRIES);
}

async function writePostgresEntry(entry) {
  const sql = sqlClient();
  if (!sql) return undefined;
  await ensureLeaderboardTable(sql);
  await sql`
    INSERT INTO monerge_leaderboard (
      id, wallet, username, pfp, score, actual, difficulty, max_tile, moves, signature, tx_hash, revealed_at, signed_at
    )
    VALUES (
      ${entry.id},
      ${entry.wallet},
      ${entry.username},
      ${entry.pfp},
      ${entry.score},
      ${entry.actual},
      ${entry.difficulty},
      ${entry.maxTile},
      ${entry.moves},
      ${entry.signature},
      ${entry.txHash},
      ${entry.revealedAt || new Date().toISOString()},
      ${entry.signedAt || null}
    )
    ON CONFLICT (id) DO UPDATE SET
      wallet = EXCLUDED.wallet,
      username = EXCLUDED.username,
      pfp = EXCLUDED.pfp,
      score = EXCLUDED.score,
      actual = EXCLUDED.actual,
      difficulty = EXCLUDED.difficulty,
      max_tile = EXCLUDED.max_tile,
      moves = EXCLUDED.moves,
      signature = EXCLUDED.signature,
      tx_hash = EXCLUDED.tx_hash,
      revealed_at = EXCLUDED.revealed_at,
      signed_at = EXCLUDED.signed_at
  `;
  return readPostgresEntries();
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function kvCommand(command) {
  const config = kvConfig();
  if (!config) return undefined;
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error('leaderboard database unavailable');
  const data = await response.json();
  return data?.result;
}

async function readStoredEntries() {
  try {
    const entries = await readPostgresEntries();
    if (Array.isArray(entries)) return entries;
  } catch (_) {}
  try {
    const result = await kvCommand(['GET', LEADERBOARD_KEY]);
    const entries = typeof result === 'string' ? JSON.parse(result) : result;
    if (Array.isArray(entries)) return entries.map(sanitizeEntry).filter(Boolean);
  } catch (_) {}
  return globalThis.__monergeLeaderboard;
}

async function writeStoredEntries(entries) {
  const cleanEntries = sortEntries(entries.map(sanitizeEntry).filter(Boolean)).slice(0, MAX_ENTRIES);
  globalThis.__monergeLeaderboard = cleanEntries;
  try {
    const persistedEntries = await writePostgresEntry(cleanEntries[0]);
    if (Array.isArray(persistedEntries)) return persistedEntries;
  } catch (_) {}
  try {
    await kvCommand(['SET', LEADERBOARD_KEY, JSON.stringify(cleanEntries)]);
  } catch (_) {}
  return cleanEntries;
}

function sanitizeProfileUrl(value = '') {
  const url = String(value || '').trim();
  if (/^https?:\/\//i.test(url)) return url.slice(0, 360);
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(url)) return url.slice(0, 140000);
  return '';
}

function sanitizeEntry(input = {}) {
  const score = Number(input.score);
  const maxTile = Number(input.maxTile);
  const moves = Number(input.moves);
  if (!Number.isFinite(score) || score < 0) return null;
  return {
    id: String(input.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 80),
    wallet: String(input.wallet || '').slice(0, 64),
    username: String(input.username || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24),
    pfp: sanitizeProfileUrl(input.pfp),
    score: Math.round(score),
    actual: Number.isFinite(Number(input.actual)) ? Math.round(Number(input.actual)) : Math.round(score),
    difficulty: String(input.difficulty || 'Classic').slice(0, 24),
    maxTile: Number.isFinite(maxTile) ? maxTile : 2,
    moves: Number.isFinite(moves) ? moves : 0,
    signature: String(input.signature || '').slice(0, 220),
    txHash: String(input.txHash || '').slice(0, 80),
    revealedAt: String(input.revealedAt || new Date().toISOString()).slice(0, 40),
    signedAt: String(input.signedAt || '').slice(0, 40)
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const signedDelta = Number(Boolean(b.signature)) - Number(Boolean(a.signature));
    if (signedDelta) return signedDelta;
    return (b.score || 0) - (a.score || 0);
  });
}

function playerKey(entry = {}) {
  const wallet = String(entry.wallet || '').trim().toLowerCase();
  if (wallet) return `wallet:${wallet}`;
  const username = String(entry.username || '').trim().toLowerCase();
  if (username) return `user:${username}`;
  return `id:${entry.id || Math.random()}`;
}

function dedupeEntries(entries = []) {
  const bestByPlayer = new Map();
  sortEntries(entries).forEach((entry) => {
    const key = playerKey(entry);
    const current = bestByPlayer.get(key);
    if (!current || (entry.score || 0) > (current.score || 0)) bestByPlayer.set(key, entry);
  });
  return sortEntries([...bestByPlayer.values()]);
}

async function readJsonBody(request) {
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

export default async function handler(request, response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('cache-control', 'no-store');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method === 'POST') {
    if (rateLimit(request, response, { name: 'leaderboard-write', limit: 8, windowMs: 60_000 })) return;
  } else if (rateLimit(request, response, { name: 'leaderboard-read', limit: 90, windowMs: 60_000 })) {
    return;
  }

  if (request.method === 'POST') {
    const entry = sanitizeEntry(await readJsonBody(request));
    if (!entry) {
      response.status(400).json({ error: 'invalid leaderboard entry' });
      return;
    }
    const currentEntries = await readStoredEntries();
    const withoutSameRun = currentEntries.filter((item) => item.id !== entry.id);
    await writeStoredEntries(dedupeEntries([entry, ...withoutSameRun]));
  }

  const entries = await readStoredEntries();
  response.status(200).json({
    entries: dedupeEntries(entries).slice(0, MAX_ENTRIES),
    storage: postgresUrl() ? 'neon-postgres' : kvConfig() ? 'kv-database' : 'memory-fallback'
  });
}
