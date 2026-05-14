const WALLETS = [
  '0xCf3b8981AbAa56a8E41117b0c721C05F608400A7',
  '0x382556a543aad855c07678e7f8e820d0d90429bb',
  '0xc3ce1eb539c1cc031ecd7b95e8c00768bf324403',
];

const RESERVOIR_API = 'https://api.reservoir.tools';
const POLYGON_RESERVOIR_API = 'https://api-polygon.reservoir.tools';
const BLOCKSCOUT_API = 'https://eth.blockscout.com/api/v2';
const ETH_RPC = 'https://eth.llamarpc.com';
const TOKEN_URI_SELECTOR = '0xc87b56dd';
const ERC1155_URI_SELECTOR = '0x0e89341c';
const OMNIA_PETS_CONTRACT = '0x4e76c23fe2a4e37b5e07b5625e17098baab86c18';
const OMNIA_ITEMS_CONTRACT = '0xf0ea56402b2e2b27556d7abf4236c7327722fe41';
const INKFINITY_CONTRACT = '0x4de49a57235cc0d4d22baad106a4dc302c8d935e';
const PIXSEALS_CONTRACT = '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b';
const LOCAL_INKFINITY_IMAGES = {
  1: 'assets/inkfinity-visionary.png',
  2: 'assets/inkfinity-professor.png',
  3: 'assets/inkfinity-thoughts.png',
};
const FORCE_METADATA_REFRESH = new Set([OMNIA_PETS_CONTRACT, OMNIA_ITEMS_CONTRACT, INKFINITY_CONTRACT]);
const STATIC_PREVIEW_NFTS = [
  {
    name: 'Pixseal #525',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/525.png',
    href: `https://opensea.io/item/polygon/${PIXSEALS_CONTRACT}/525`,
    contract: PIXSEALS_CONTRACT,
    tokenId: '525',
    wallet: 'collection',
  },
  {
    name: 'Pixseal #3600',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/3600.png',
    href: `https://opensea.io/item/polygon/${PIXSEALS_CONTRACT}/3600`,
    contract: PIXSEALS_CONTRACT,
    tokenId: '3600',
    wallet: 'collection',
  },
  {
    name: 'Pixseal #9690',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9690.png',
    href: `https://opensea.io/item/polygon/${PIXSEALS_CONTRACT}/9690`,
    contract: PIXSEALS_CONTRACT,
    tokenId: '9690',
    wallet: 'collection',
  },
  {
    name: 'Pixseal #9815',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9815.png',
    href: `https://opensea.io/item/polygon/${PIXSEALS_CONTRACT}/9815`,
    contract: PIXSEALS_CONTRACT,
    tokenId: '9815',
    wallet: 'collection',
  },
];
const ECOSYSTEMS = [
  {
    id: 'sappy',
    label: 'Sappy Seals ecosystem',
    contracts: [
      '0x1c70d0a86475cc707b48aa79f112857e7957274f',
      '0x364c828ee171616a39897688a831c2499ad972ec',
      '0x4e76c23fe2a4e37b5e07b5625e17098baab86c18',
      '0xf0ea56402b2e2b27556d7abf4236c7327722fe41',
      '0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667',
      PIXSEALS_CONTRACT,
    ],
    keywords: ['sappy', 'pixl', 'omnia', 'pets'],
    strictKeywords: ['pixseals', 'pixseal', 'sappy key', 'sappy keys', 'sappy soulbounds', 'faithful key', 'pixlverse item', 'pixlverse items', 'omnia item', 'omnia items'],
  },
  {
    id: 'pudgy',
    label: 'Pudgy Penguins ecosystem',
    contracts: [
      '0xbd3531da5cf5857e7cfaa92426877b022e612cf8',
      '0x524cab2ec69124574082676e6f654a18df49a048',
      '0x062e691c2054de82f28008a8ccc6d7a1c8ce060d',
    ],
    keywords: ['pudgy', 'penguin', 'lil pudgy', 'rod'],
    strictKeywords: [],
  },
  {
    id: 'inkfinity',
    label: 'Inkfinity Canvas',
    contracts: [
      '0x4de49a57235cc0d4d22baad106a4dc302c8d935e',
    ],
    keywords: ['inkfinity', 'nftvisionary', 'nuttyprofessor', 'thunderofthoughts', 'e. guy'],
    previewContracts: [INKFINITY_CONTRACT],
  },
];

function ecosystemForNft(nft) {
  const contract = nft?.contract?.toLowerCase?.();
  const contractMatch = ECOSYSTEMS.find((ecosystem) => ecosystem.contracts.includes(contract));
  if (contractMatch) return contractMatch;

  const haystack = `${nft?.collection || ''} ${nft?.name || ''}`.toLowerCase();
  return ECOSYSTEMS.find((ecosystem) =>
    (ecosystem.id === 'inkfinity' && ecosystem.keywords.some((keyword) => haystack.includes(keyword)))
    || ecosystem.strictKeywords?.some((keyword) => haystack.includes(keyword))
  );
}

function normalizeCollectionName(name, contract) {
  const normalizedContract = contract?.toLowerCase?.();
  if (normalizedContract === OMNIA_PETS_CONTRACT) return 'Omnia Pets';
  if (normalizedContract === OMNIA_ITEMS_CONTRACT) return 'Omnia items';
  if (normalizedContract === INKFINITY_CONTRACT) return 'Inkfinity Canvas';
  if (normalizedContract === PIXSEALS_CONTRACT) return 'Pixseals by Sappy Seals';
  return name;
}

function normalizeItemName(name, contract) {
  const normalizedContract = contract?.toLowerCase?.();
  if (normalizedContract === OMNIA_PETS_CONTRACT) return name?.replace(/Genesis Pixl Pet/gi, 'Omnia Pet');
  if (normalizedContract === OMNIA_ITEMS_CONTRACT) return name?.replace(/Pixelverse/gi, 'Omnia');
  return name;
}

function localImageFor(contract, tokenId) {
  if (contract?.toLowerCase?.() === INKFINITY_CONTRACT) {
    return LOCAL_INKFINITY_IMAGES[String(tokenId)];
  }
  return undefined;
}

function curatedEcosystemNfts(nfts) {
  const seen = new Set();
  const contractCounts = new Map();
  const collectionCounts = new Map();
  const contractRank = (nft) => {
    const contract = nft.contract?.toLowerCase?.();
    const ecosystem = ecosystemForNft(nft);
    const index = ecosystem?.contracts.indexOf(contract);
    return index >= 0 ? index : 99;
  };
  const numericTokenId = (nft) => {
    const value = Number.parseInt(String(nft.tokenId || '').replace(/\D/g, ''), 10);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  };
  const isSeal = (nft) => {
    const collection = `${nft.collection || ''}`.toLowerCase();
    const name = `${nft.name || ''}`.toLowerCase();
    return collection.includes('stakedseals') || /^sappy seal\s*#/.test(name);
  };
  const sappyBucket = (nft) => {
    const haystack = `${nft.collection || ''} ${nft.name || ''}`.toLowerCase();
    if (haystack.includes('faithful key') || haystack.includes('sappy soulbounds')) return 1;
    if (isSeal(nft)) return 2;
    if (haystack.includes('omnia pet')) return 3;
    if (haystack.includes('omnia item') || haystack.includes('pixlverse')) return 4;
    if (haystack.includes('pixseal')) return 5;
    return 6;
  };
  const itemCap = (nft) => {
    if (nft.ecosystem === 'sappy' && isSeal(nft)) return 40;
    if (nft.ecosystem === 'sappy') return 12;
    return 8;
  };
  return nfts
    .map((nft) => {
      const ecosystem = ecosystemForNft(nft);
      return ecosystem ? { ...nft, ecosystem: ecosystem.id, ecosystemLabel: ecosystem.label } : null;
    })
    .filter(Boolean)
    .filter((nft) => {
      const key = `${nft.contract}:${nft.tokenId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aContract = a.contract?.toLowerCase?.();
      const bContract = b.contract?.toLowerCase?.();
      const aScore = ecosystemForNft(a)?.contracts.includes(aContract) ? 0 : 1;
      const bScore = ecosystemForNft(b)?.contracts.includes(bContract) ? 0 : 1;
      if (a.ecosystem === 'sappy' && b.ecosystem === 'sappy') {
        return (sappyBucket(a) - sappyBucket(b)) || (numericTokenId(a) - numericTokenId(b));
      }
      return (aScore - bScore) || (contractRank(a) - contractRank(b)) || (numericTokenId(a) - numericTokenId(b));
    })
    .filter((nft) => {
      const contract = nft.contract?.toLowerCase?.() || 'unknown';
      const collection = `${nft.ecosystem}:${nft.collection || contract}`.toLowerCase();
      const contractCount = contractCounts.get(contract) || 0;
      const collectionCount = collectionCounts.get(collection) || 0;
      const cap = itemCap(nft);
      const keep = contractCount < cap && collectionCount < cap;
      if (keep) {
        contractCounts.set(contract, contractCount + 1);
        collectionCounts.set(collection, collectionCount + 1);
      }
      return keep;
    })
    .slice(0, 72);
}

function ipfsToHttps(uri) {
  if (!uri || typeof uri !== 'string') return undefined;
  if (uri.startsWith('ipfs://ipfs/')) return `https://ipfs.io/ipfs/${uri.slice(12)}`;
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  if (uri.startsWith('ar://')) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

function tokenCallData(selector, tokenId) {
  const id = BigInt(tokenId).toString(16).padStart(64, '0');
  return `${selector}${id}`;
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
  const response = await fetch(ETH_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: contract, data }, 'latest'],
    }),
  });
  if (!response.ok) return undefined;
  const json = await response.json();
  return json.result;
}

async function fetchTokenMetadata(contract, tokenId) {
  const callData = tokenCallData(TOKEN_URI_SELECTOR, tokenId);
  const fallbackCallData = tokenCallData(ERC1155_URI_SELECTOR, tokenId);
  const tokenUriHex = await ethCall(contract, callData).catch(() => undefined)
    || await ethCall(contract, fallbackCallData).catch(() => undefined);
  const tokenUri = ipfsToHttps(decodeAbiString(tokenUriHex)?.replace('{id}', BigInt(tokenId).toString(16).padStart(64, '0')));
  if (!tokenUri) return undefined;

  let metadata;
  if (tokenUri.startsWith('data:application/json;base64,')) {
    metadata = JSON.parse(Buffer.from(tokenUri.slice('data:application/json;base64,'.length), 'base64').toString('utf8'));
  } else if (tokenUri.startsWith('data:application/json,')) {
    metadata = JSON.parse(decodeURIComponent(tokenUri.slice('data:application/json,'.length)));
  } else {
    metadata = await fetch(tokenUri).then((res) => res.ok ? res.json() : undefined).catch(() => undefined);
  }
  if (!metadata) return undefined;
  return {
    name: metadata.name,
    image: ipfsToHttps(metadata?.image || metadata?.image_url || metadata?.animation_url),
  };
}

async function fetchTokenMetadataImage(contract, tokenId) {
  return (await fetchTokenMetadata(contract, tokenId))?.image;
}

async function fetchMetadataImageFromUri(uri) {
  const metadataUri = ipfsToHttps(uri?.trim?.());
  if (!metadataUri) return undefined;
  const metadata = await fetch(metadataUri).then((res) => res.ok ? res.json() : undefined).catch(() => undefined);
  return ipfsToHttps(metadata?.image || metadata?.image_url || metadata?.animation_url);
}

function normalizeToken(item, wallet = 'collection', chain = 'ethereum') {
  const token = item?.token || item || {};
  const collection = token.collection || {};
  const contract = token.contract || token.contractAddress || token.collection?.id;
  const tokenId = token.tokenId || token.token_id;

  if (!contract || !tokenId) return null;

  return {
    name: normalizeItemName(token.name || `${collection.name || 'NFT'} #${tokenId}`, contract),
    collection: normalizeCollectionName(collection.name || 'Collected NFT', contract),
    image: localImageFor(contract, tokenId) || ipfsToHttps(token.imageSmall || token.image || token.imageUrl || token.metadata?.image),
    href: `https://opensea.io/assets/${chain}/${contract}/${tokenId}`,
    contract,
    tokenId,
    chain,
    wallet: wallet === 'collection' ? 'collection' : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
  };
}

function normalizeBlockscoutNft(item, wallet) {
  const token = item?.token || {};
  const contract = token.address_hash;
  const tokenId = item?.id || item?.token_id;
  if (!contract || !tokenId) return null;

  const metadataError = item?.metadata?.error;
  const metadataUri = typeof metadataError === 'string' && metadataError.includes('ipfs://')
    ? metadataError.slice(metadataError.indexOf('ipfs://')).trim()
    : undefined;

  return {
    name: normalizeItemName(item?.metadata?.name || `${token.name || token.symbol || 'NFT'} #${tokenId}`, contract),
    collection: normalizeCollectionName(token.name || token.symbol || 'Collected NFT', contract),
    image: localImageFor(contract, tokenId) || ipfsToHttps(item?.image_url || item?.media_url || item?.metadata?.image || item?.metadata?.image_url),
    metadataUri,
    href: `https://opensea.io/assets/ethereum/${contract}/${tokenId}`,
    contract,
    tokenId,
    wallet: wallet === 'collection' ? 'collection' : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
  };
}

async function fetchBlockscoutNfts(wallet) {
  const items = [];
  let params = undefined;
  for (let page = 0; page < 4; page += 1) {
    const query = params ? `?${new URLSearchParams(params).toString()}` : '';
    const response = await fetch(`${BLOCKSCOUT_API}/addresses/${wallet}/nft${query}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) break;
    const data = await response.json();
    items.push(...(data.items || []));
    if (!data.next_page_params) break;
    params = data.next_page_params;
  }
  const normalized = items.map((item) => normalizeBlockscoutNft(item, wallet)).filter(Boolean);

  return Promise.all(normalized.map(async (nft) => ({
    ...nft,
    image: nft.image
      || await fetchMetadataImageFromUri(nft.metadataUri)
      || await fetchTokenMetadataImage(nft.contract, nft.tokenId),
  })));
}

async function fetchBlockscoutContractInstances(contract) {
  const response = await fetch(`${BLOCKSCOUT_API}/tokens/${contract}/instances`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.items || [])
    .map((item) => normalizeBlockscoutNft(item, 'collection'))
    .filter(Boolean);
}

async function fetchReservoirNfts(wallet, contract, options = {}) {
  const api = options.api || RESERVOIR_API;
  const chain = options.chain || 'ethereum';
  const params = new URLSearchParams({
    limit: contract ? '20' : '48',
    sortBy: 'floorAskPrice',
    excludeSpam: 'true',
    excludeNsfw: 'true',
  });
  if (contract) params.set('collection', contract);

  const url = `${api}/users/${wallet}/tokens/v10?${params.toString()}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return [];
  const data = await response.json();
  const normalized = (data.tokens || [])
    .map((item) => normalizeToken(item, wallet, chain))
    .filter(Boolean);
  return Promise.all(normalized.map(refreshNftMetadata));
}

async function refreshNftMetadata(nft) {
  const needsRefresh = FORCE_METADATA_REFRESH.has(nft.contract?.toLowerCase?.());
  const metadata = needsRefresh || !nft.image
    ? await fetchTokenMetadata(nft.contract, nft.tokenId).catch(() => undefined)
    : undefined;

  return {
    ...nft,
    name: normalizeItemName(metadata?.name || nft.name, nft.contract),
    image: metadata?.image || nft.image,
  };
}

async function fetchCollectionPreviewNfts(contract) {
  const params = new URLSearchParams({
    collection: contract,
    limit: '8',
    sortBy: 'tokenId',
    includeAttributes: 'false',
  });

  const response = await fetch(`${RESERVOIR_API}/tokens/v7?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return [];
  const data = await response.json();
  const normalized = (data.tokens || [])
    .map((item) => normalizeToken(item))
    .filter(Boolean);
  return Promise.all(normalized.map(refreshNftMetadata));
}

async function fetchContractSampleNfts(contract) {
  const tokenIds = Array.from({ length: 24 }, (_, index) => String(index + 1));
  const nfts = await Promise.all(tokenIds.map(async (tokenId) => {
    const metadata = await fetchTokenMetadata(contract, tokenId).catch(() => undefined);
    if (!metadata?.image) return null;
    return {
      name: normalizeItemName(metadata.name || `Inkfinity Canvas #${tokenId}`, contract),
      collection: normalizeCollectionName('Inkfinity Canvas', contract),
      image: metadata.image,
      href: `https://opensea.io/assets/ethereum/${contract}/${tokenId}`,
      contract,
      tokenId,
      wallet: 'collection',
    };
  }));
  return nfts.filter(Boolean);
}

export default async function handler(req, res) {
  try {
    const ecosystemContracts = ECOSYSTEMS.flatMap((ecosystem) => ecosystem.contracts);
    const reservoirResponses = await Promise.allSettled(
      WALLETS.flatMap((wallet) => [
        fetchReservoirNfts(wallet),
        ...ecosystemContracts.map((contract) => fetchReservoirNfts(wallet, contract)),
        fetchReservoirNfts(wallet, PIXSEALS_CONTRACT, { api: POLYGON_RESERVOIR_API, chain: 'matic' }),
      ])
    );

    const blockscoutResponses = await Promise.allSettled(WALLETS.map(fetchBlockscoutNfts));
    const previewResponses = await Promise.allSettled(
      ECOSYSTEMS.flatMap((ecosystem) => ecosystem.previewContracts || []).map(fetchCollectionPreviewNfts)
    );
    const sampleResponses = await Promise.allSettled([
      fetchBlockscoutContractInstances(INKFINITY_CONTRACT),
      fetchContractSampleNfts(INKFINITY_CONTRACT),
    ]);
    const allNfts = [
      ...reservoirResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
      ...blockscoutResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
      ...previewResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
      ...sampleResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
      ...STATIC_PREVIEW_NFTS,
    ];

    let nfts = curatedEcosystemNfts(allNfts.filter((nft) => nft.image));

    if (!nfts.length) {
      nfts = curatedEcosystemNfts(blockscoutResponses
        .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
        .filter((nft) => nft.image)
      );
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ nfts });
  } catch (error) {
    res.status(200).json({ nfts: [] });
  }
}
