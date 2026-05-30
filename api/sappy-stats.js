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
  const params = new URLSearchParams({
    id: SAPPY_SEALS_CONTRACT,
    includeTopBid: 'false',
  });
  const response = await fetch(`${RESERVOIR_API}/collections/v7?${params.toString()}`, {
    headers: reservoirHeaders(),
  });
  if (!response.ok) throw new Error(`reservoir_${response.status}`);
  const data = await response.json();
  const collection = data?.collections?.[0];
  if (!collection) throw new Error('reservoir_empty');
  return parseCollection(collection);
}

async function fetchAggregateStats() {
  const params = new URLSearchParams({
    collection: SAPPY_SEALS_CONTRACT,
  });
  const response = await fetch(`${RESERVOIR_API}/stats/v2?${params.toString()}`, {
    headers: reservoirHeaders(),
  });
  if (!response.ok) throw new Error(`reservoir_stats_${response.status}`);
  const data = await response.json();
  const stats = data?.stats || data;
  if (!stats || typeof stats !== 'object') throw new Error('reservoir_stats_empty');
  return parseStats(stats);
}

async function fetchStats() {
  const attempts = [fetchCollectionStats, fetchAggregateStats];
  let lastError;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('stats_unavailable');
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
    res.status(200).json({ ...FALLBACK, updatedAt: new Date().toISOString() });
  }
}
