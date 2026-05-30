import { rateLimit } from './_rate-limit.js';

const RESERVOIR_API = 'https://api.reservoir.tools';
const SAPPY_SEALS_CONTRACT = '0x364c828ee171616a39897688a831c2499ad972ec';
const FALLBACK = {
  floorEth: 0.122,
  floorUsd: 305,
  change24h: 0,
  holders: 3885,
  updatedAt: null,
  source: 'fallback',
};

function reservoirHeaders() {
  return {
    accept: 'application/json',
    ...(process.env.RESERVOIR_API_KEY ? { 'x-api-key': process.env.RESERVOIR_API_KEY } : {}),
  };
}

function numberFrom(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function percentFrom(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function parseCollection(collection) {
  const floorEth = numberFrom(
    collection?.floorAsk?.price?.amount?.decimal,
    collection?.floorAskPrice,
    collection?.floorAsk?.price?.amount?.native
  );
  const floorUsd = numberFrom(
    collection?.floorAsk?.price?.amount?.usd,
    collection?.floorAsk?.price?.netAmount?.usd
  );
  const holders = numberFrom(
    collection?.ownerCount,
    collection?.owners,
    collection?.ownersCount
  );
  const change24h = percentFrom(
    collection?.floorSaleChange?.['1day'],
    collection?.floorAsk?.price?.change?.['1day'],
    collection?.volumeChange?.['1day'],
    collection?.day1?.floorChange,
    collection?.day1?.floorAskChange
  );

  return {
    floorEth: floorEth ?? FALLBACK.floorEth,
    floorUsd: floorUsd ?? FALLBACK.floorUsd,
    change24h: change24h ?? FALLBACK.change24h,
    holders: holders ?? FALLBACK.holders,
    updatedAt: new Date().toISOString(),
    source: 'reservoir',
  };
}

function parseStats(stats) {
  const floorEth = numberFrom(
    stats?.floorAskPrice,
    stats?.floorAsk?.price?.amount?.decimal,
    stats?.floorPrice,
    stats?.floor
  );
  const floorUsd = numberFrom(
    stats?.floorAsk?.price?.amount?.usd,
    stats?.floorAskPriceUsd,
    stats?.floorUsd
  );
  const holders = numberFrom(
    stats?.ownerCount,
    stats?.owners,
    stats?.ownersCount
  );
  const change24h = percentFrom(
    stats?.floorSaleChange?.['1day'],
    stats?.day1FloorSaleChange,
    stats?.day1?.floorSaleChange,
    stats?.day1?.floorChange
  );

  return {
    floorEth: floorEth ?? FALLBACK.floorEth,
    floorUsd: floorUsd ?? FALLBACK.floorUsd,
    change24h: change24h ?? FALLBACK.change24h,
    holders: holders ?? FALLBACK.holders,
    updatedAt: new Date().toISOString(),
    source: 'reservoir',
  };
}

async function fetchCollectionStats() {
  const queries = [
    new URLSearchParams({ id: SAPPY_SEALS_CONTRACT, includeTopBid: 'false' }),
    new URLSearchParams({ id: `contract:${SAPPY_SEALS_CONTRACT}`, includeTopBid: 'false' }),
    new URLSearchParams({ slug: 'sappy-seals', includeTopBid: 'false' }),
  ];

  for (const params of queries) {
    const response = await fetch(`${RESERVOIR_API}/collections/v7?${params.toString()}`, {
      headers: reservoirHeaders(),
    });
    if (!response.ok) continue;
    const data = await response.json();
    const collection = data?.collections?.[0];
    if (collection) return parseCollection(collection);
  }
  throw new Error('reservoir_collection_empty');
}

async function fetchAggregateStats() {
  const queries = [
    new URLSearchParams({ collection: SAPPY_SEALS_CONTRACT }),
    new URLSearchParams({ collection: `contract:${SAPPY_SEALS_CONTRACT}` }),
    new URLSearchParams({ tokenSetId: `contract:${SAPPY_SEALS_CONTRACT}` }),
  ];

  for (const params of queries) {
    const response = await fetch(`${RESERVOIR_API}/stats/v2?${params.toString()}`, {
      headers: reservoirHeaders(),
    });
    if (!response.ok) continue;
    const data = await response.json();
    const stats = data?.stats || data;
    if (stats && typeof stats === 'object') return parseStats(stats);
  }
  throw new Error('reservoir_stats_empty');
}

async function fetchTokenFloorStats() {
  const params = new URLSearchParams({
    collection: SAPPY_SEALS_CONTRACT,
    sortBy: 'floorAskPrice',
    limit: '1',
    includeAttributes: 'false',
    includeLastSale: 'false',
    includeTopBid: 'false',
  });
  const response = await fetch(`${RESERVOIR_API}/tokens/v7?${params.toString()}`, {
    headers: reservoirHeaders(),
  });
  if (!response.ok) throw new Error(`reservoir_tokens_${response.status}`);
  const data = await response.json();
  const item = data?.tokens?.[0];
  const floorAsk = item?.market?.floorAsk || item?.token?.market?.floorAsk || item?.token?.floorAsk;
  const floorEth = numberFrom(
    floorAsk?.price?.amount?.decimal,
    floorAsk?.price?.amount?.native,
    floorAsk?.price?.netAmount?.decimal
  );
  if (!Number.isFinite(floorEth)) throw new Error('reservoir_token_floor_empty');
  const floorUsd = numberFrom(
    floorAsk?.price?.amount?.usd,
    floorAsk?.price?.netAmount?.usd
  );
  return {
    ...FALLBACK,
    floorEth,
    floorUsd: floorUsd ?? FALLBACK.floorUsd,
    updatedAt: new Date().toISOString(),
    source: 'reservoir-token-floor',
  };
}

async function fetchStats() {
  const attempts = [fetchCollectionStats, fetchAggregateStats, fetchTokenFloorStats];
  let lastError;
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      errors.push(`${attempt.name}:${error?.message || error}`);
    }
  }
  const error = lastError || new Error('stats_unavailable');
  error.attempts = errors;
  throw error;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (rateLimit(req, res, { name: 'sappy-stats', limit: 60, windowMs: 60_000 })) return;

  try {
    const stats = await fetchStats();
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=900');
    res.status(200).json(stats);
  } catch (error) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      ...FALLBACK,
      updatedAt: new Date().toISOString(),
      ...(req.query?.debug === '1' ? { debug: error?.attempts || [error?.message] } : {}),
    });
  }
}
