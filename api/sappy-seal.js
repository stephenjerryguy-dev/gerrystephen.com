import { rateLimit } from './_rate-limit.js';

const OPENSEA_API = 'https://api.opensea.io/api/v2';
const ETH_RPCS = [
  process.env.ETH_RPC_URL,
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com',
].filter(Boolean);
const SAPPY_SEALS_CONTRACT = '0x364c828ee171616a39897688a831c2499ad972ec';
const TOKEN_URI_SELECTOR = '0xc87b56dd';

function ipfsToHttps(uri) {
  if (!uri || typeof uri !== 'string') return undefined;
  if (uri.startsWith('ipfs://ipfs/')) return `https://ipfs.io/ipfs/${uri.slice(12)}`;
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

function tokenCallData(tokenId) {
  return `${TOKEN_URI_SELECTOR}${BigInt(tokenId).toString(16).padStart(64, '0')}`;
}

function decodeAbiString(hex) {
  if (!hex || hex === '0x') return undefined;
  const clean = hex.slice(2);
  const offset = Number.parseInt(clean.slice(0, 64), 16) * 2;
  const length = Number.parseInt(clean.slice(offset, offset + 64), 16) * 2;
  const data = clean.slice(offset + 64, offset + 64 + length);
  return Buffer.from(data, 'hex').toString('utf8').replace(/\0+$/, '');
}

async function ethCall(contract, data) {
  for (const rpc of ETH_RPCS) {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: contract, data }, 'latest'],
      }),
    }).catch(() => undefined);
    if (!response?.ok) continue;
    const json = await response.json().catch(() => ({}));
    if (json.result && json.result !== '0x') return json.result;
  }
  return undefined;
}

function normalizeTraits(rawTraits) {
  const traits = Array.isArray(rawTraits) ? rawTraits : [];
  return traits
    .map((trait) => ({
      trait_type: trait.trait_type || trait.traitType || trait.type || trait.key || '',
      value: trait.value || trait.trait_value || trait.traitValue || trait.name || '',
    }))
    .filter((trait) => trait.trait_type || trait.value);
}

function outfitSummary(traits) {
  const wanted = /background|body|skin|fur|clothes|clothing|outfit|shirt|head|hat|eyes|mouth|accessory|accessories|face/i;
  const picked = traits.filter((trait) => wanted.test(`${trait.trait_type} ${trait.value}`));
  const source = picked.length ? picked : traits;
  return source
    .slice(0, 10)
    .map((trait) => `${trait.trait_type || 'Trait'}: ${trait.value}`)
    .join('; ');
}

async function fetchOpenSeaSeal(tokenId) {
  if (!process.env.OPENSEA_API_KEY) return undefined;
  const response = await fetch(`${OPENSEA_API}/chain/ethereum/contract/${SAPPY_SEALS_CONTRACT}/nfts/${tokenId}`, {
    headers: {
      accept: 'application/json',
      'x-api-key': process.env.OPENSEA_API_KEY,
    },
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const data = await response.json().catch(() => null);
  const nft = data?.nft || data;
  if (!nft) return undefined;
  const traits = normalizeTraits(nft.traits || nft.metadata?.attributes || nft.metadata?.traits);
  return {
    id: String(tokenId),
    name: nft.name || `Sappy Seal #${tokenId}`,
    collection: 'Sappy Seals',
    image: ipfsToHttps(nft.display_image_url || nft.image_url || nft.image || nft.metadata?.image),
    openseaUrl: nft.opensea_url || `https://opensea.io/item/ethereum/${SAPPY_SEALS_CONTRACT}/${tokenId}`,
    traits,
    outfitSummary: outfitSummary(traits),
    source: 'opensea',
  };
}

async function fetchMetadataSeal(tokenId) {
  const tokenUriHex = await ethCall(SAPPY_SEALS_CONTRACT, tokenCallData(tokenId)).catch(() => undefined);
  const tokenUri = ipfsToHttps(decodeAbiString(tokenUriHex));
  if (!tokenUri) return undefined;
  let metadata;
  if (tokenUri.startsWith('data:application/json;base64,')) {
    metadata = JSON.parse(Buffer.from(tokenUri.slice('data:application/json;base64,'.length), 'base64').toString('utf8'));
  } else if (tokenUri.startsWith('data:application/json,')) {
    metadata = JSON.parse(decodeURIComponent(tokenUri.slice('data:application/json,'.length)));
  } else {
    metadata = await fetch(tokenUri, { headers: { accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : undefined))
      .catch(() => undefined);
  }
  if (!metadata) return undefined;
  const traits = normalizeTraits(metadata.attributes || metadata.traits);
  return {
    id: String(tokenId),
    name: metadata.name || `Sappy Seal #${tokenId}`,
    collection: 'Sappy Seals',
    image: ipfsToHttps(metadata.image || metadata.image_url || metadata.animation_url),
    openseaUrl: `https://opensea.io/item/ethereum/${SAPPY_SEALS_CONTRACT}/${tokenId}`,
    traits,
    outfitSummary: outfitSummary(traits),
    source: 'tokenURI',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (rateLimit(req, res, { name: 'sappy-seal', limit: 30, windowMs: 60_000 })) return;

  const id = String(req.query?.id || req.query?.tokenId || '').trim();
  if (!/^\d{1,5}$/.test(id)) return res.status(400).json({ error: 'invalid_seal_number' });
  const tokenId = Number(id);
  if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 9999) {
    return res.status(400).json({ error: 'seal_number_out_of_range' });
  }

  const seal = await fetchOpenSeaSeal(tokenId).catch(() => undefined)
    || await fetchMetadataSeal(tokenId).catch(() => undefined);
  if (!seal?.image) {
    return res.status(502).json({ error: 'seal_metadata_unavailable', id: String(tokenId) });
  }
  return res.status(200).json(seal);
}
