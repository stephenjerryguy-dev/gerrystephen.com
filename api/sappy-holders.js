import { rateLimit } from './_rate-limit.js';

const RESERVOIR_API = 'https://api.reservoir.tools';
const ETH_RPCS = [
  'https://ethereum.publicnode.com',
  'https://eth.llamarpc.com',
  'https://cloudflare-eth.com',
];
const OWNER_OF_SELECTOR = '0x6352211e';
const SAPPY_SEALS_CONTRACT = '0x364c828ee171616a39897688a831c2499ad972ec';
const STAKED_SEALS_CONTRACT = '0x1c70d0a86475cc707b48aa79f112857e7957274f';
const OMNIA_PETS_CONTRACT = '0x4e76c23fe2a4e37b5e07b5625e17098baab86c18';
const OMNIA_ITEMS_CONTRACT = '0xf0ea56402b2e2b27556d7abf4236c7327722fe41';
const SAPPY_KEY_CONTRACT = '0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667';
const PIXSEALS_CONTRACT = '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b';
const DIGITAL_ARTIFACT_CONTRACT = '0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a';
const OPENSEA_API = 'https://api.opensea.io/api/v2';
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ECOSYSTEM_CONTRACTS = new Set([
  SAPPY_SEALS_CONTRACT,
  STAKED_SEALS_CONTRACT,
  OMNIA_PETS_CONTRACT,
  OMNIA_ITEMS_CONTRACT,
  SAPPY_KEY_CONTRACT,
  PIXSEALS_CONTRACT,
  DIGITAL_ARTIFACT_CONTRACT,
].map((contract) => contract.toLowerCase()));
const BLOCKED_HOLDER_ADDRESSES = new Set([
  SAPPY_SEALS_CONTRACT,
  STAKED_SEALS_CONTRACT,
  '0x0000000000000000000000000000000000000000',
]);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

const SAMPLE = [
  { address: '0xCf3b8981AbAa56a8E41117b0c721C05F608400A7', count: 47 },
  { address: '0x382556a543aad855c07678e7f8e820d0d90429bb', count: 12 },
  { address: '0xc3ce1eb539c1cc031ecd7b95e8c00768bf324403', count: 8 },
];
const KNOWN_DIGITAL_ARTIFACTS_BY_WALLET = {
  '0x741047ae552e58e89f1ff51d9a06e5d9dfba3feb': 1,
  '0xcf3b8981abaa56a8e41117b0c721c05f608400a7': 1,
};

const POD_ECOSYSTEM_CONTRACTS = [
  OMNIA_PETS_CONTRACT,
  OMNIA_ITEMS_CONTRACT,
  SAPPY_KEY_CONTRACT,
  PIXSEALS_CONTRACT,
  DIGITAL_ARTIFACT_CONTRACT,
];

function reservoirHeaders() {
  return {
    accept: 'application/json',
    ...(process.env.RESERVOIR_API_KEY ? { 'x-api-key': process.env.RESERVOIR_API_KEY } : {}),
  };
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function openseaHeaders() {
  return {
    accept: 'application/json',
    ...(process.env.OPENSEA_API_KEY ? { 'x-api-key': process.env.OPENSEA_API_KEY } : {}),
  };
}

function pickTwitter(account) {
  const socials = account?.social_media_accounts || account?.socialMediaAccounts || [];
  const twitter = socials.find((item) => /twitter|x/i.test(`${item.platform || item.type || item.provider || ''}`));
  const username = twitter?.username || twitter?.handle || twitter?.url?.split('/').filter(Boolean).pop();
  return username ? username.replace(/^@/, '') : undefined;
}

async function fetchOpenSeaProfile(address) {
  if (!process.env.OPENSEA_API_KEY) return null;
  const response = await fetch(`${OPENSEA_API}/accounts/${address}`, { headers: openseaHeaders() }).catch(() => undefined);
  if (!response?.ok) return null;
  const account = await response.json().catch(() => null);
  if (!account) return null;
  const xHandle = pickTwitter(account);
  return {
    label: xHandle ? `@${xHandle}` : (account.username || account.name || undefined),
    xHandle,
    openseaUsername: account.username,
    profileImage: account.profile_image_url || account.profileImageUrl,
    profileUrl: account.address ? `https://opensea.io/${account.address}` : undefined,
  };
}

async function fetchOpenSeaAccount(addressOrUsername) {
  if (!process.env.OPENSEA_API_KEY || !addressOrUsername) return null;
  const response = await fetch(`${OPENSEA_API}/accounts/${encodeURIComponent(addressOrUsername)}`, {
    headers: openseaHeaders(),
  }).catch(() => undefined);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function nftContract(item) {
  return String(
    item?.contract
    || item?.contract_address
    || item?.asset_contract?.address
    || item?.collection?.primary_asset_contracts?.[0]?.address
    || ''
  ).toLowerCase();
}

function isDigitalArtifactLike(item) {
  const haystack = [
    item?.name,
    item?.identifier,
    item?.token_id,
    item?.collection?.name,
    item?.collection?.slug,
    item?.collection,
    item?.contract,
    item?.chain,
  ].filter(Boolean).join(' ').toLowerCase();
  return nftContract(item) === DIGITAL_ARTIFACT_CONTRACT
    || (haystack.includes('digital artifact') && (haystack.includes('btc') || haystack.includes('bitcoin') || haystack.includes('ordinal') || haystack.includes('artifact')));
}

async function countOpenSeaEcosystemNfts(address, chain) {
  if (!process.env.OPENSEA_API_KEY || !ADDRESS_RE.test(address)) return 0;
  let count = 0;
  let next = undefined;
  for (let page = 0; page < 4; page += 1) {
    const params = new URLSearchParams({ limit: '200' });
    if (next) params.set('next', next);
    const response = await fetch(`${OPENSEA_API}/chain/${chain}/account/${address}/nfts?${params.toString()}`, {
      headers: openseaHeaders(),
    }).catch(() => undefined);
    if (!response?.ok) break;
    const data = await response.json().catch(() => ({}));
    count += (data.nfts || []).filter((nft) => ECOSYSTEM_CONTRACTS.has(nftContract(nft)) || isDigitalArtifactLike(nft)).length;
    next = data.next;
    if (!next) break;
  }
  return count;
}

async function holderFromOpenSeaQuery(query) {
  const account = await fetchOpenSeaAccount(query);
  const address = account?.address;
  if (!ADDRESS_RE.test(address || '')) return null;
  const [profile, ethCount, polygonCount, bitcoinCount] = await Promise.all([
    fetchOpenSeaProfile(address),
    countOpenSeaEcosystemNfts(address, 'ethereum'),
    countOpenSeaEcosystemNfts(address, 'matic'),
    countOpenSeaEcosystemNfts(address, 'bitcoin'),
  ]);
  const count = ethCount + polygonCount + bitcoinCount + (KNOWN_DIGITAL_ARTIFACTS_BY_WALLET[address.toLowerCase()] || 0);
  const xHandle = profile?.xHandle || pickTwitter(account);
  const label = xHandle ? `@${xHandle}` : (account.username || account.name || profile?.label || shortAddress(address));
  const cleanUser = String(xHandle || account.username || label || shortAddress(address)).replace(/^@/, '');
  return {
    address,
    label,
    count,
    countType: 'ecosystem',
    rank: null,
    source: 'opensea-account',
    xHandle,
    openseaUsername: account.username || profile?.openseaUsername,
    profileImage: account.profile_image_url || account.profileImageUrl || profile?.profileImage,
    profileUrl: `https://opensea.io/${account.username || address}`,
    claimable: Boolean(xHandle || account.username),
    profile: `/sappy/sealfolio.html?wallet=${address}&u=${encodeURIComponent(cleanUser)}`,
  };
}

async function enrichHolders(holders) {
  if (!process.env.OPENSEA_API_KEY || !holders.length) return holders;
  const profiles = await Promise.allSettled(holders.slice(0, 48).map((holder) => fetchOpenSeaProfile(holder.address)));
  return holders.map((holder, index) => {
    const profile = profiles[index]?.status === 'fulfilled' ? profiles[index].value : null;
    if (!profile) return holder;
    const label = profile.label || holder.label;
    return {
      ...holder,
      label,
      xHandle: profile.xHandle,
      openseaUsername: profile.openseaUsername,
      profileImage: profile.profileImage,
      profileUrl: profile.profileUrl,
      claimable: Boolean(profile.xHandle),
      countType: holder.countType || 'seals',
      profile: `/sappy/sealfolio.html?wallet=${holder.address}&u=${encodeURIComponent((profile.xHandle || label || holder.label).replace(/^@/, ''))}`,
    };
  });
}

function holderCount(owner) {
  const ownership = owner?.ownership || {};
  return Number(owner?.tokenCount || owner?.count || owner?.tokensCount || owner?.token_count || ownership.tokenCount || ownership.token_count || ownership.totalCount || 0) || 0;
}

async function fetchTopOwners() {
  const params = new URLSearchParams({ limit: '50' });
  [SAPPY_SEALS_CONTRACT, STAKED_SEALS_CONTRACT].forEach((contract) => params.append('collections', contract));
  const response = await fetch(`${RESERVOIR_API}/owners/cross-collections/v1?${params.toString()}`, {
    headers: reservoirHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.owners || [])
    .map((owner) => ({
      address: owner.address || owner.owner || owner.id,
      count: holderCount(owner),
    }))
    .filter((owner) => /^0x[a-fA-F0-9]{40}$/.test(owner.address));
}

async function fetchOpenSeaTopHolders() {
  if (!process.env.OPENSEA_API_KEY) return [];
  const holders = [];
  let next = undefined;
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({ limit: '100' });
    if (next) params.set('next', next);
    const response = await fetch(`${OPENSEA_API}/collections/sappy-seals/holders?${params.toString()}`, {
      headers: openseaHeaders(),
    });
    if (!response.ok) break;
    const data = await response.json().catch(() => ({}));
    holders.push(...(data.holders || [])
      .map((holder) => ({
        address: holder.address,
        count: Number(holder.quantity || holder.count || 0) || 0,
        percentage: Number(holder.percentage || 0) || 0,
        source: 'opensea',
      }))
      .filter((holder) => (
        /^0x[a-fA-F0-9]{40}$/.test(holder.address)
        && holder.count > 0
        && !BLOCKED_HOLDER_ADDRESSES.has(holder.address.toLowerCase())
      )));
    next = data.next;
    if (!next) break;
  }
  return holders;
}

function ownerFromToken(item) {
  return item?.token?.owner || item?.token?.ownerAddress || item?.owner || item?.ownership?.owner || item?.market?.floorAsk?.maker;
}

function ownerOfData(tokenId) {
  return `${OWNER_OF_SELECTOR}${BigInt(tokenId).toString(16).padStart(64, '0')}`;
}

function decodeOwner(result) {
  if (!result || typeof result !== 'string' || result.length < 66) return undefined;
  const address = `0x${result.slice(-40)}`;
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : undefined;
}

async function fetchOwnersFromOwnerOf(contract, count = 160) {
  const body = Array.from({ length: count }, (_, index) => {
    const tokenId = index + 1;
    return {
      jsonrpc: '2.0',
      id: tokenId,
      method: 'eth_call',
      params: [{ to: contract, data: ownerOfData(tokenId) }, 'latest'],
    };
  });
  for (const rpc of ETH_RPCS) {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
    if (!response?.ok) continue;
    const calls = await response.json().catch(() => []);
    const owners = (Array.isArray(calls) ? calls : [])
      .map((call) => decodeOwner(call.result))
      .filter(Boolean)
      .map((address) => ({ address, count: 1 }));
    if (owners.length) return owners;

    const singleCalls = await Promise.all(body.slice(0, 80).map((call) => fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(call),
    })
      .then((res) => (res.ok ? res.json() : undefined))
      .catch(() => undefined)));
    const singleOwners = singleCalls
      .map((call) => decodeOwner(call?.result))
      .filter(Boolean)
      .map((address) => ({ address, count: 1 }));
    if (singleOwners.length) return singleOwners;
  }
  return [];
}

async function fetchOwnersFromTokens(contract) {
  const owners = [];
  let continuation = undefined;
  for (let page = 0; page < 4; page += 1) {
    const params = new URLSearchParams({
      collection: contract,
      limit: '200',
      sortBy: 'tokenId',
      includeAttributes: 'false',
      includeLastSale: 'false',
      includeTopBid: 'false',
    });
    if (continuation) params.set('continuation', continuation);
    const response = await fetch(`${RESERVOIR_API}/tokens/v7?${params.toString()}`, {
      headers: reservoirHeaders(),
    });
    if (!response.ok) break;
    const data = await response.json();
    owners.push(...(data.tokens || [])
      .map((item) => ownerFromToken(item))
      .filter((address) => /^0x[a-fA-F0-9]{40}$/.test(address)));
    continuation = data.continuation;
    if (!continuation) break;
  }
  return owners.map((address) => ({ address, count: 1 }));
}

function interleaveGroups(groups, limit = 32) {
  const out = [];
  const seen = new Set();
  let index = 0;
  while (out.length < limit) {
    let added = false;
    for (const group of groups) {
      const item = group[index];
      if (!item) continue;
      const key = item.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      added = true;
      if (out.length >= limit) break;
    }
    if (!added && groups.every((group) => index >= group.length - 1)) break;
    index += 1;
  }
  return out;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (rateLimit(req, res, { name: 'sappy-holders', limit: 36, windowMs: 60_000 })) return;

  try {
    const query = String(req.query?.q || req.query?.query || '').trim().replace(/^@/, '');
    const aggregate = new Map();
    let owners = await fetchOpenSeaTopHolders();
    if (!owners.length) owners = await fetchTopOwners();
    if (!owners.length) {
      const tokenOwnerResponses = await Promise.allSettled([
        fetchOwnersFromTokens(SAPPY_SEALS_CONTRACT),
        fetchOwnersFromTokens(STAKED_SEALS_CONTRACT),
      ]);
      owners = tokenOwnerResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    }
    if (!owners.length) {
      const ownerOfResponses = await Promise.allSettled([
        fetchOwnersFromOwnerOf(SAPPY_SEALS_CONTRACT),
        fetchOwnersFromOwnerOf(STAKED_SEALS_CONTRACT),
      ]);
      owners = ownerOfResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    }

    owners.forEach((owner) => {
      const key = owner.address.toLowerCase();
      const current = aggregate.get(key) || { address: owner.address, count: 0 };
      current.count += owner.count;
      aggregate.set(key, current);
    });

    const ecosystemResponses = await Promise.allSettled(POD_ECOSYSTEM_CONTRACTS.map((contract) => fetchOwnersFromTokens(contract)));
    const ecosystemAggregate = new Map();
    ecosystemResponses
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .forEach((owner) => {
        const key = owner.address.toLowerCase();
        const current = ecosystemAggregate.get(key) || { address: owner.address, count: 0 };
        current.count += owner.count;
        ecosystemAggregate.set(key, current);
      });
    Object.entries(KNOWN_DIGITAL_ARTIFACTS_BY_WALLET).forEach(([address, count]) => {
      const current = ecosystemAggregate.get(address) || { address, count: 0 };
      current.count += count;
      ecosystemAggregate.set(address, current);
    });

    const sealCandidates = [...aggregate.values()]
      .sort((a, b) => b.count - a.count)
      .filter((holder) => holder.count <= 64)
      .slice(0, 36)
      .map((holder, index) => ({
        address: holder.address,
        label: shortAddress(holder.address),
        count: holder.count,
        countType: 'seals',
        rank: index + 1,
        profile: `/sappy/sealfolio.html?wallet=${holder.address}&u=${shortAddress(holder.address)}`,
      }));
    const ecosystemCandidates = [...ecosystemAggregate.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 36)
      .map((holder, index) => ({
        address: holder.address,
        label: shortAddress(holder.address),
        count: holder.count,
        countType: 'ecosystem',
        rank: index + 1,
        profile: `/sappy/sealfolio.html?wallet=${holder.address}&u=${shortAddress(holder.address)}`,
      }));

    const enriched = await enrichHolders(interleaveGroups([sealCandidates, ecosystemCandidates], 48));
    const xLinked = enriched.filter((holder) => holder.xHandle);
    let holders = (xLinked.length ? [...xLinked, ...enriched.filter((holder) => !holder.xHandle)] : enriched).slice(0, 32);
    if (query) {
      const q = query.toLowerCase();
      const matches = holders.filter((holder) => [
        holder.address,
        holder.label,
        holder.xHandle,
        holder.openseaUsername,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
      const direct = await holderFromOpenSeaQuery(query).catch(() => null);
      holders = [
        ...(direct ? [direct] : []),
        ...matches.filter((holder) => !direct || holder.address.toLowerCase() !== direct.address.toLowerCase()),
      ].slice(0, 32);
    }

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({ holders: holders.length ? holders : SAMPLE.map((holder, index) => ({
      ...holder,
      label: shortAddress(holder.address),
      countType: 'seals',
      rank: index + 1,
      profile: `/sappy/sealfolio.html?wallet=${holder.address}&u=${shortAddress(holder.address)}`,
    })) });
  } catch (error) {
    res.status(200).json({ holders: SAMPLE.map((holder, index) => ({
      ...holder,
      label: shortAddress(holder.address),
      countType: 'seals',
      rank: index + 1,
      profile: `/sappy/sealfolio.html?wallet=${holder.address}&u=${shortAddress(holder.address)}`,
    })) });
  }
}
