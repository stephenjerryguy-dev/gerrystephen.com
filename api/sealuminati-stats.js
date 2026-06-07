import { rateLimit } from './_rate-limit.js';

const OPENSEA_API = 'https://api.opensea.io/api/v2';
const SLUG = 'sealuminati';
const FALLBACK = {
  floorMon: 695,
  topOfferMon: 570.01,
  volumeMon: 252700,
  owners: 1300,
  sales24h: null,
  updatedAt: null,
  source: 'fallback',
};

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

function parseStats(data) {
  const total = data?.total || data?.stats || data;
  const oneDay = Array.isArray(data?.intervals)
    ? data.intervals.find((item) => ['one_day', 'oneDay', '1d'].includes(item?.interval))
    : undefined;

  const floorMon = numberFrom(
    total?.floor_price,
    total?.floorPrice,
    data?.floor_price,
    data?.floorPrice
  );
  const topOfferMon = numberFrom(
    total?.top_offer,
    total?.topOffer,
    total?.best_offer,
    total?.bestOffer,
    data?.top_offer
  );
  const volumeMon = numberFrom(
    total?.volume,
    total?.total_volume,
    total?.totalVolume,
    data?.total_volume
  );
  const owners = numberFrom(
    total?.num_owners,
    total?.owner_count,
    total?.owners,
    data?.num_owners
  );
  const sales24h = numberFrom(
    oneDay?.sales,
    oneDay?.sale_count,
    oneDay?.sales_count,
    data?.one_day_sales
  );

  if (!Number.isFinite(floorMon) && !Number.isFinite(volumeMon) && !Number.isFinite(owners)) {
    throw new Error('opensea_empty');
  }

  return {
    floorMon: floorMon ?? FALLBACK.floorMon,
    topOfferMon: topOfferMon ?? FALLBACK.topOfferMon,
    volumeMon: volumeMon ?? FALLBACK.volumeMon,
    owners: owners ?? FALLBACK.owners,
    sales24h: sales24h ?? FALLBACK.sales24h,
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

async function fetchOpenSeaStats() {
  const response = await fetch(`${OPENSEA_API}/collections/${SLUG}/stats`, {
    headers: openseaHeaders(),
  });
  if (!response.ok) throw new Error(`opensea_stats_${response.status}`);
  return parseStats(await response.json());
}

async function fetchSales24h() {
  const afterMs = Date.now() - 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    event_type: 'sale',
    after: String(Math.floor(afterMs / 1000)),
    limit: '200',
  });
  const response = await fetch(`${OPENSEA_API}/events/collection/${SLUG}?${params.toString()}`, {
    headers: openseaHeaders(),
  });
  if (!response.ok) throw new Error(`opensea_events_${response.status}`);
  const data = await response.json();
  const events = data?.asset_events || data?.events || data?.nft_events || [];
  if (!Array.isArray(events)) return undefined;
  return events.filter((event) => {
    const type = String(event?.event_type || event?.eventType || event?.type || '').toLowerCase();
    const timestamp = eventTimestampMs(event);
    return (!type || type === 'sale' || type === 'successful') && (!timestamp || timestamp >= afterMs);
  }).length;
}

export default async function handler(req, res) {
  if (rateLimit(req, res, { name: 'sealuminati-stats', limit: 60, windowMs: 60_000 })) return;
  res.setHeader('cache-control', 's-maxage=180, stale-while-revalidate=900');

  try {
    const stats = await fetchOpenSeaStats();
    try {
      const sales24h = await fetchSales24h();
      if (Number.isFinite(sales24h)) stats.sales24h = sales24h;
    } catch (error) {}
    res.status(200).json(stats);
  } catch (error) {
    res.status(200).json({
      ...FALLBACK,
      error: error?.message || 'sealuminati_stats_unavailable',
    });
  }
}
