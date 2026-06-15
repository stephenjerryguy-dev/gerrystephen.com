import { rateLimit } from '../lib/rate-limit.js';

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
  sales24h: null,
  volume24h: null,
  holders: 2367,
  updatedAt: null,
  source: 'fallback',
};

function reservoirHeaders() {
  return {
    accept: 'application/json',
    ...(process.env.RESERVOIR_API_KEY ? { 'x-api-key': process.env.RESERVOIR_API_KEY } : {}),
  };
}

function openseaHeaders() {
  return {
    accept: 'application/json',
    ...(process.env.OPENSEA_API_KEY ? { 'x-api-key': process.env.OPENSEA_API_KEY } : {}),
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
    sales24h: FALLBACK.sales24h,
    volume24h: FALLBACK.volume24h,
    holders: FALLBACK.holders,
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
    sales24h: FALLBACK.sales24h,
    volume24h: FALLBACK.volume24h,
    holders: FALLBACK.holders,
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
  const sales24h = numberFrom(
    oneDay?.sales,
    oneDay?.sale_count,
    oneDay?.sales_count,
    data?.one_day_sales
  );
  const volume24h = numberFrom(
    oneDay?.volume,
    oneDay?.volume_eth,
    oneDay?.volumeEth,
    data?.one_day_volume
  );
  if (!Number.isFinite(floorEth) && !Number.isFinite(holders)) throw new Error('opensea_empty');
  return {
    floorEth: floorEth ?? FALLBACK.floorEth,
    floorUsd: null,
    change24h: change24h ?? FALLBACK.change24h,
    sales24h: sales24h ?? FALLBACK.sales24h,
    volume24h: volume24h ?? FALLBACK.volume24h,
    holders: FALLBACK.holders,
    updatedAt: new Date().toISOString(),
    source: 'opensea',
  };
}

function eventTimestampMs(event) {
  const raw = event?.event_timestamp || event?.created_date || event?.created_at || event?.timestamp || event?.eventTime;
  if (!raw) return 0;
  const parsed = typeof raw === 'number' ? raw : Date.parse(raw);
  if (!Number.isFinite(parsed)) return 0;
  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function paymentEth(event) {
  const payment = event?.payment || event?.event?.payment || event?.transaction?.payment || {};
  const token = payment?.payment_token || payment?.token || {};
  const decimals = numberFrom(token?.decimals, payment?.decimals) ?? 18;
  const direct = numberFrom(
    event?.total_price_eth,
    event?.price?.quantity?.decimal,
    event?.payment?.quantity?.decimal,
    payment?.amount?.decimal,
    payment?.value?.decimal
  );
  if (Number.isFinite(direct)) return direct;
  const raw = payment?.quantity || payment?.amount || event?.total_price || event?.price?.quantity;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber)) return undefined;
  return asNumber / (10 ** decimals);
}

function parseOpenSeaSalesEvents(data, afterMs) {
  const events = data?.asset_events || data?.events || data?.nft_events || [];
  if (!Array.isArray(events)) return { sales24h: undefined, volume24h: undefined };
  let sales24h = 0;
  let volume24h = 0;
  let hasVolume = false;
  for (const event of events) {
    const type = String(event?.event_type || event?.eventType || event?.type || '').toLowerCase();
    if (type && type !== 'sale' && type !== 'successful') continue;
    const timestamp = eventTimestampMs(event);
    if (timestamp && timestamp < afterMs) continue;
    sales24h += 1;
    const eth = paymentEth(event);
    if (Number.isFinite(eth) && eth > 0) {
      volume24h += eth;
      hasVolume = true;
    }
  }
  return {
    sales24h: sales24h || undefined,
    volume24h: hasVolume ? volume24h : undefined,
  };
}

async function fetchOpenSeaSales24h() {
  const afterMs = Date.now() - 24 * 60 * 60 * 1000;
  const after = Math.floor(afterMs / 1000);
  const params = new URLSearchParams({
    event_type: 'sale',
    after: String(after),
    limit: '200',
  });
  const response = await fetch(`https://api.opensea.io/api/v2/events/collection/sappy-seals?${params.toString()}`, {
    headers: openseaHeaders(),
  });
  if (!response.ok) throw new Error(`opensea_events_${response.status}`);
  const data = await response.json();
  const parsed = parseOpenSeaSalesEvents(data, afterMs);
  if (!Number.isFinite(parsed.sales24h)) throw new Error('opensea_events_empty');
  return parsed;
}

async function fetchEthUsd() {
  const response = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`coinbase_${response.status}`);
  const data = await response.json();
  return numberFrom(data?.data?.amount, data?.amount);
}

async function addUsdEstimate(stats) {
  if (Number.isFinite(Number(stats?.floorUsd)) && Number(stats.floorUsd) > 0) return stats;
  const floorEth = Number(stats?.floorEth);
  if (!Number.isFinite(floorEth) || floorEth <= 0) return stats;
  try {
    const ethUsd = await fetchEthUsd();
    if (!Number.isFinite(ethUsd)) return stats;
    return {
      ...stats,
      floorUsd: floorEth * ethUsd,
      ethUsd,
      usdEstimated: true,
    };
  } catch (error) {
    return stats;
  }
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
      sales24h: FALLBACK.sales24h,
      volume24h: FALLBACK.volume24h,
      updatedAt: new Date().toISOString(),
      source: baseUrl.includes('magiceden') ? 'magiceden-token-floor' : 'reservoir-token-floor',
    };
  }
  throw new Error('reservoir_token_floor_empty');
}

async function fetchOpenSeaStats() {
  const response = await fetch('https://api.opensea.io/api/v2/collections/sappy-seals/stats', {
    headers: openseaHeaders(),
  });
  if (!response.ok) throw new Error(`opensea_${response.status}`);
  const data = await response.json();
  const stats = parseOpenSeaStats(data);
  try {
    const events = await fetchOpenSeaSales24h();
    if (Number.isFinite(events.sales24h) && events.sales24h > 0) {
      return {
        ...stats,
        sales24h: events.sales24h,
        volume24h: Number.isFinite(events.volume24h) ? events.volume24h : stats.volume24h,
        source: 'opensea-events',
      };
    }
  } catch (error) {}
  return stats;
}

async function fetchOpenSeaEventStats() {
  const events = await fetchOpenSeaSales24h();
  return {
    ...FALLBACK,
    sales24h: events.sales24h,
    volume24h: Number.isFinite(events.volume24h) ? events.volume24h : FALLBACK.volume24h,
    updatedAt: new Date().toISOString(),
    source: 'opensea-events',
  };
}

async function fetchStats() {
  const attempts = [fetchOpenSeaStats, fetchOpenSeaEventStats, fetchCollectionStats, fetchAggregateStats, fetchTokenFloorStats];
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
    const stats = await addUsdEstimate(await fetchStats());
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
