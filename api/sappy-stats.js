import { rateLimit } from './_rate-limit.js';

const RESERVOIR_API = 'https://api.reservoir.tools';
const RESERVOIR_APIS = [
  RESERVOIR_API,
  'https://api-mainnet.magiceden.dev/v3/rtp/ethereum',
];
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

function parseOpenSeaStats(data) {
  const total = data?.total || data?.stats || data;
  const oneDay = Array.isArray(data?.intervals)
    ? data.intervals.find((item) => item?.interval === 'one_day' || item?.interval === 'oneDay' || item?.interval === '1d')
    : undefined;
  const floorEth = numberFrom(
    total?.floor_price,
    total?.floorPrice,
    data?.floor_price,
    data?.floorPrice
  );
  const holders = numberFrom(
    total?.num_owners,
    total?.owner_count,
    total?.owners,
    data?.num_owners
  );
  const change24h = percentFrom(
    oneDay?.floor_price_diff,
    oneDay?.floorPriceDiff,
    data?.floor_price_diff
  );
  if (!Number.isFinite(floorEth) && !Number.isFinite(holders)) throw new Error('opensea_empty');
  return {
    floorEth: floorEth ?? FALLBACK.floorEth,
    floorUsd: null,
    change24h: change24h ?? FALLBACK.change24h,
    holders: holders ?? FALLBACK.holders,
    updatedAt: new Date().toISOString(),
    source: 'opensea',
  };
}

async function fetchCollectionStats() {
  const queries = [
    new URLSearchParams({ id: SAPPY_SEALS_CONTRACT, includeTopBid: 'false' }),
    new URLSearchParams({ id: `contract:${SAPPY_SEALS_CONTRACT}`, includeTopBid: 'false' }),
    new URLSearchParams({ slug: 'sappy-seals', includeTopBid: 'false' }),
  ];

  for (const params of queries) {
    for (const baseUrl of RESERVOIR_APIS) {
      const response = await fetch(`${baseUrl}/collections/v7?${params.toString()}`, {
        headers: reservoirHeaders(),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const collection = data?.collections?.[0];
      if (collection) return parseCollection(collection);
    }
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
    for (const baseUrl of RESERVOIR_APIS) {
      const response = await fetch(`${baseUrl}/stats/v2?${params.toString()}`, {
        headers: reservoirHeaders(),
      });
      if (!response.ok) continue;
      const data = await response.json();
      const stats = data?.stats || data;
      if (stats && typeof stats === 'object') return parseStats(stats);
    }
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
  for (const baseUrl of RESERVOIR_APIS) {
    const response = await fetch(`${baseUrl}/tokens/v7?${params.toString()}`, {
      headers: reservoirHeaders(),
    });
    if (!response.ok) continue;
    const data = await response.json();
    const item = data?.tokens?.[0];
    const floorAsk = item?.market?.floorAsk || item?.token?.market?.floorAsk || item?.token?.floorAsk;
    const floorEth = numberFrom(
      floorAsk?.price?.amount?.decimal,
      floorAsk?.price?.amount?.native,
      floorAsk?.price?.netAmount?.decimal
    );
    if (!Number.isFinite(floorEth)) continue;
    const floorUsd = numberFrom(
      floorAsk?.price?.amount?.usd,
      floorAsk?.price?.netAmount?.usd
    );
    return {
      ...FALLBACK,
      floorEth,
      floorUsd: floorUsd ?? FALLBACK.floorUsd,
      updatedAt: new Date().toISOString(),
      source: baseUrl.includes('magiceden') ? 'magiceden-token-floor' : 'reservoir-token-floor',
    };
  }
  throw new Error('reservoir_token_floor_empty');
}

async function fetchOpenSeaStats() {
  const response = await fetch('https://api.opensea.io/api/v2/collections/sappy-seals/stats', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`opensea_${response.status}`);
  const data = await response.json();
  return parseOpenSeaStats(data);
}

async function fetchStats() {
  const attempts = [fetchCollectionStats, fetchAggregateStats, fetchTokenFloorStats, fetchOpenSeaStats];
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
