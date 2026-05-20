const MAX_ENTRIES = 50;
const LEADERBOARD_KEY = 'monerge:leaderboard:v1';

globalThis.__monergeLeaderboard = globalThis.__monergeLeaderboard || [];

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
    await kvCommand(['SET', LEADERBOARD_KEY, JSON.stringify(cleanEntries)]);
  } catch (_) {}
  return cleanEntries;
}

function sanitizeProfileUrl(value = '') {
  const url = String(value || '').trim().slice(0, 360);
  return /^https?:\/\//i.test(url) ? url : '';
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
    const entry = sanitizeEntry(await readJsonBody(request));
    if (!entry) {
      response.status(400).json({ error: 'invalid leaderboard entry' });
      return;
    }
    const currentEntries = await readStoredEntries();
    const withoutSameRun = currentEntries.filter((item) => item.id !== entry.id);
    await writeStoredEntries([entry, ...withoutSameRun]);
  }

  const entries = await readStoredEntries();
  response.status(200).json({
    entries: sortEntries(entries).slice(0, 12),
    storage: kvConfig() ? 'database' : 'memory-fallback'
  });
}
