// Community ecosystems data: typed port of the original carousel logic.
// /api/nfts returns the wallet's owned tokens; /api/ecosystem-assets returns
// live token balances. Curated fallbacks keep the section useful offline.

export type Nft = {
  ecosystem?: string;
  name: string;
  collection: string;
  image?: string;
  glyph?: string;
  href?: string;
  tokenId?: string;
  contract?: string;
  amount?: string;
  chain?: string;
  animationUrl?: string;
  symbol?: string;
};

export type Ecosystem = {
  id: 'sappy' | 'pudgy';
  label: string;
  short: string;
  note: string;
  links: { label: string; href: string }[];
  fallback: Nft[];
};

export type EcosystemGroup = Ecosystem & { items: Nft[] };

const BUILD_VERSION = 'iglu-v2';
const LIVE_API_ORIGIN = 'https://gerrystephen.com';

export const TOKEN_AMOUNT_FALLBACKS: Record<string, string> = {
  $PIXL: '1,035,060.94',
  $PENGU: '89,026.96',
};

export const ECOSYSTEMS: Ecosystem[] = [
  {
    id: 'sappy',
    label: 'Sappy Seals ecosystem',
    short: 'Sappy Seals',
    note: 'My Sappy-side collection: $PIXL, Sappy Faithful Key, Sappy Seals, Omnia Pets, Omnia items, Pixseals, and a Bitcoin ordinal.',
    links: [
      { label: 'Sappy Seals', href: 'https://sappy.lol/seals' },
      { label: 'Sappy hub', href: 'https://sappy.gerrystephen.com' },
    ],
    fallback: [
      { name: '$PIXL', collection: 'Omnia ecosystem', image: '/assets/pixl-logo.png', glyph: '$PIXL', tokenId: 'asset', amount: TOKEN_AMOUNT_FALLBACKS.$PIXL, chain: 'Ethereum' },
      { name: 'Pixseal #525', collection: 'Pixseals by Sappy Seals', image: 'https://ipfs2.seadn.io/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/525.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/525', tokenId: '525', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
      { name: 'Pixseal #3600', collection: 'Pixseals by Sappy Seals', image: 'https://ipfs2.seadn.io/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/3600.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/3600', tokenId: '3600', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
      { name: 'Pixseal #9690', collection: 'Pixseals by Sappy Seals', image: 'https://ipfs2.seadn.io/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9690.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/9690', tokenId: '9690', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
      { name: 'Pixseal #9815', collection: 'Pixseals by Sappy Seals', image: 'https://ipfs2.seadn.io/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9815.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/9815', tokenId: '9815', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
      { name: 'Digital Artifact #93', collection: 'Digital Artifact', image: '/assets/digital-artifact-93.jpg', href: 'https://opensea.io/item/ethereum/0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a/93', tokenId: '93', contract: '0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a' },
    ],
  },
  {
    id: 'pudgy',
    label: 'Pudgy Penguins ecosystem',
    short: 'Pudgy Penguins',
    note: 'Pudgy Penguin, Lil Pudgy, Pudgy Rods, and $PENGU.',
    links: [{ label: 'Pudgy Penguins', href: 'https://pengu.pudgypenguins.com' }],
    fallback: [
      { name: 'Pudgy Penguin', collection: 'Pudgy Penguins ecosystem', image: '/assets/pudgy-penguin.webp', tokenId: 'pending', contract: 'pending' },
      { name: '$PENGU', collection: 'Pudgy Penguins ecosystem', glyph: '$PENGU', tokenId: 'asset', amount: TOKEN_AMOUNT_FALLBACKS.$PENGU, chain: 'Abstract' },
    ],
  },
];

const REQUIRED_ASSETS: Nft[] = [
  {
    ecosystem: 'sappy',
    name: '$PIXL',
    collection: 'Omnia ecosystem',
    image: '/assets/pixl-logo.png',
    glyph: '$PIXL',
    tokenId: 'asset',
    amount: TOKEN_AMOUNT_FALLBACKS.$PIXL,
    chain: 'Ethereum',
    contract: '0x427A03fb96D9A94a6727fBCfbBA143444090dD64',
    href: 'https://etherscan.io/token/0x427A03fb96D9A94a6727fBCfbBA143444090dD64',
  },
  {
    ecosystem: 'pudgy',
    name: '$PENGU',
    collection: 'Pudgy Penguins ecosystem',
    image: 'https://cdn.dexscreener.com/cms/images/527f3df62eb754a69b5d3dd14b1ee36301b506df9af455374f4e0ffb91367594?width=800&height=800&quality=95&format=auto',
    glyph: '$PENGU',
    tokenId: 'asset',
    amount: TOKEN_AMOUNT_FALLBACKS.$PENGU,
    chain: 'Abstract',
    contract: '0x9eBe3A824Ca958e4b3Da772D2065518F009CBa62',
    href: 'https://abscan.org/token/0x9eBe3A824Ca958e4b3Da772D2065518F009CBa62?a=0x382556A543aAd855C07678E7F8e820d0d90429BB',
  },
];

function isLocalDev() {
  return ['127.0.0.1', 'localhost'].includes(window.location.hostname);
}

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T | null> {
  const url = `${path}${path.includes('?') ? '&' : '?'}v=${BUILD_VERSION}`;
  const local = await fetch(url, { signal, cache: 'no-store' }).catch(() => undefined);
  if (local?.ok && local.headers.get('content-type')?.includes('application/json')) return local.json() as Promise<T>;
  // `vite dev` has no serverless functions; read the live API instead.
  if (!isLocalDev()) return null;
  const live = await fetch(`${LIVE_API_ORIGIN}${url}`, { signal, cache: 'no-store' }).catch(() => undefined);
  return live?.ok ? (live.json() as Promise<T>) : null;
}

function tokenNumber(nft: Nft) {
  const value = Number.parseInt(String(nft.tokenId ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function pudgyRank(nft: Nft) {
  const haystack = `${nft.collection} ${nft.name}`.toLowerCase();
  if (nft.tokenId === 'asset' && haystack.includes('pengu')) return 0;
  if (haystack.includes('pudgy penguin')) return 1;
  if (haystack.includes('lil pudgy')) return 2;
  if (haystack.includes('rod') || haystack.includes('present')) return 3;
  return 4;
}

function sappyRank(nft: Nft) {
  const collection = nft.collection.toLowerCase();
  const name = nft.name.toLowerCase();
  const haystack = `${collection} ${name}`;
  if (nft.tokenId === 'asset' && haystack.includes('pixl')) return 0;
  if (haystack.includes('faithful key') || haystack.includes('sappy soulbounds')) return 1;
  if (collection.includes('stakedseals') || /^sappy seal\s*#/.test(name)) return 2;
  if (haystack.includes('omnia pet')) return 3;
  if (haystack.includes('omnia item') || haystack.includes('pixlverse')) return 4;
  if (haystack.includes('pixseal')) return 5;
  return 6;
}

function orderItems(id: Ecosystem['id'], items: Nft[]) {
  const rank = id === 'pudgy' ? pudgyRank : sappyRank;
  return [...items].sort((a, b) => rank(a) - rank(b) || tokenNumber(a) - tokenNumber(b));
}

function identity(nft: Nft) {
  if (nft.tokenId === 'asset') return `asset:${String(nft.name || nft.symbol || nft.glyph).toLowerCase()}`;
  return `${String(nft.contract || nft.collection).toLowerCase()}:${String(nft.tokenId || nft.name).toLowerCase()}`;
}

function mergeItems(items: Nft[]) {
  const byId = new Map<string, Nft>();
  for (const item of items) {
    const key = identity(item);
    const current = byId.get(key);
    if (!current) {
      byId.set(key, item);
      continue;
    }
    // Prefer a live token balance over a curated/"syncing" one.
    const nextAmount = String(item.amount ?? '').toLowerCase();
    const currentAmount = String(current.amount ?? '').toLowerCase();
    const nextIsLive = item.tokenId === 'asset' && item.amount && nextAmount !== 'syncing';
    const currentIsStale = current.tokenId === 'asset' && (!current.amount || currentAmount === 'syncing');
    if (nextIsLive && (currentIsStale || nextAmount !== currentAmount)) byId.set(key, { ...current, ...item });
  }
  return [...byId.values()];
}

export function buildGroups(owned: Nft[], assets: Nft[] = []): EcosystemGroup[] {
  return ECOSYSTEMS.map((ecosystem) => {
    const ownedHere = owned.filter((nft) => nft.ecosystem === ecosystem.id);
    const base = ownedHere.length ? ownedHere : ecosystem.fallback;
    const items = mergeItems([
      ...REQUIRED_ASSETS.filter((asset) => asset.ecosystem === ecosystem.id),
      ...base,
      ...assets.filter((asset) => asset.ecosystem === ecosystem.id),
    ]);
    return { ...ecosystem, items: orderItems(ecosystem.id, items) };
  });
}

type NftsResponse = { nfts?: Nft[]; pixlBalance?: number | string };
type AssetsResponse = { assets?: Nft[] };

export async function loadEcosystemGroups(signal: AbortSignal): Promise<EcosystemGroup[]> {
  const [nftData, assetData] = await Promise.all([
    fetchJson<NftsResponse>('/api/nfts', signal).catch(() => null),
    fetchJson<AssetsResponse>('/api/ecosystem-assets', signal).catch(() => null),
  ]);
  const owned = (nftData?.nfts ?? []).filter((nft) => nft?.image || nft?.animationUrl || nft?.tokenId === 'asset');
  const pixl = Number(nftData?.pixlBalance ?? 0);
  if (pixl > 0) {
    owned.unshift({
      ...REQUIRED_ASSETS[0],
      amount: pixl.toLocaleString('en-US', { maximumFractionDigits: 2 }),
    });
  }
  return buildGroups(owned, assetData?.assets ?? []);
}

export function describeToken(nft: Nft) {
  if (nft.tokenId === 'asset') return [nft.amount || TOKEN_AMOUNT_FALLBACKS[nft.name] || 'live balance', nft.chain].filter(Boolean).join(' · ');
  if (nft.tokenId === 'soon') return 'Coming soon';
  if (nft.tokenId && nft.tokenId !== 'pending' && nft.contract) {
    const id = nft.tokenId.length > 10 ? `${nft.tokenId.slice(0, 4)}…${nft.tokenId.slice(-4)}` : nft.tokenId;
    return `${nft.contract.slice(0, 6)}…${nft.contract.slice(-4)} / #${id}`;
  }
  return 'Exact token data pending';
}
