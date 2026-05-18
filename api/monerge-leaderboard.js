const MAX_ENTRIES = 50;

globalThis.__monergeLeaderboard = globalThis.__monergeLeaderboard || [];

function sanitizeEntry(input = {}) {
  const score = Number(input.score);
  const maxTile = Number(input.maxTile);
  const moves = Number(input.moves);
  if (!Number.isFinite(score) || score < 0) return null;
  return {
    id: String(input.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 80),
    wallet: String(input.wallet || '').slice(0, 64),
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
    const withoutSameRun = globalThis.__monergeLeaderboard.filter((item) => item.id !== entry.id);
    globalThis.__monergeLeaderboard = sortEntries([entry, ...withoutSameRun]).slice(0, MAX_ENTRIES);
  }

  response.status(200).json({
    entries: sortEntries(globalThis.__monergeLeaderboard).slice(0, 12)
  });
}
