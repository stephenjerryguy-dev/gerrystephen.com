const WALLETS = [
  '0xCf3b8981AbAa56a8E41117b0c721C05F608400A7',
  '0x382556a543aad855c07678e7f8e820d0d90429bb',
  '0xc3ce1eb539c1cc031ecd7b95e8c00768bf324403',
];

const RESERVOIR_API = 'https://api.reservoir.tools';
const BLOCKSCOUT_API = 'https://eth.blockscout.com/api/v2';
const ETH_RPC = 'https://eth.llamarpc.com';
const TOKEN_URI_SELECTOR = '0xc87b56dd';
const ERC1155_URI_SELECTOR = '0x0e89341c';
const ECOSYSTEMS = [
  {
    id: 'sappy',
    label: 'Sappy Seals ecosystem',
    contracts: [
      '0x1c70d0a86475cc707b48aa79f112857e7957274f',
      '0x364c828ee171616a39897688a831c2499ad972ec',
      '0x4e76c23fe2a4e37b5e07b5625e17098baab86c18',
      '0xf0ea56402b2e2b27556d7abf4236c7327722fe41',
    ],
    keywords: ['sappy', 'seal', 'pixl', 'pixel', 'omnia', 'pets', 'pixelverse'],
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
  },
  {
    id: 'inkfinity',
    label: 'Inkfinity Canvas',
    contracts: [],
    keywords: ['inkfinity', 'nftvisionary', 'nuttyprofessor', 'thunderofthoughts', 'e. guy'],
  },
];

function ecosystemForNft(nft) {
  const contract = nft?.contract?.toLowerCase?.();
  const contractMatch = ECOSYSTEMS.find((ecosystem) => ecosystem.contracts.includes(contract));
  if (contractMatch) return contractMatch;

  const haystack = `${nft?.collection || ''} ${nft?.name || ''}`.toLowerCase();
  return ECOSYSTEMS.find((ecosystem) =>
    ecosystem.keywords.some((keyword) => haystack.includes(keyword))
  );
}

function curatedEcosystemNfts(nfts) {
  const seen = new Set();
  const contractRank = (nft) => {
    const contract = nft.contract?.toLowerCase?.();
    const ecosystem = ecosystemForNft(nft);
    const index = ecosystem?.contracts.indexOf(contract);
    return index >= 0 ? index : 99;
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
      return (aScore - bScore) || (contractRank(a) - contractRank(b));
    })
    .slice(0, 36);
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

async function fetchTokenMetadataImage(contract, tokenId) {
  const callData = tokenCallData(TOKEN_URI_SELECTOR, tokenId);
  const fallbackCallData = tokenCallData(ERC1155_URI_SELECTOR, tokenId);
  const tokenUriHex = await ethCall(contract, callData).catch(() => undefined)
    || await ethCall(contract, fallbackCallData).catch(() => undefined);
  const tokenUri = ipfsToHttps(decodeAbiString(tokenUriHex)?.replace('{id}', BigInt(tokenId).toString(16).padStart(64, '0')));
  if (!tokenUri) return undefined;

  const metadata = await fetch(tokenUri).then((res) => res.ok ? res.json() : undefined).catch(() => undefined);
  return ipfsToHttps(metadata?.image || metadata?.image_url || metadata?.animation_url);
}

async function fetchMetadataImageFromUri(uri) {
  const metadataUri = ipfsToHttps(uri?.trim?.());
  if (!metadataUri) return undefined;
  const metadata = await fetch(metadataUri).then((res) => res.ok ? res.json() : undefined).catch(() => undefined);
  return ipfsToHttps(metadata?.image || metadata?.image_url || metadata?.animation_url);
}

function normalizeToken(item, wallet) {
  const token = item?.token || item || {};
  const collection = token.collection || {};
  const contract = token.contract || token.contractAddress || token.collection?.id;
  const tokenId = token.tokenId || token.token_id;

  if (!contract || !tokenId) return null;

  return {
    name: token.name || `${collection.name || 'NFT'} #${tokenId}`,
    collection: collection.name || 'Collected NFT',
    image: ipfsToHttps(token.imageSmall || token.image || token.imageUrl || token.metadata?.image),
    href: `https://opensea.io/assets/ethereum/${contract}/${tokenId}`,
    contract,
    tokenId,
    wallet: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
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
    name: item?.metadata?.name || `${token.name || token.symbol || 'NFT'} #${tokenId}`,
    collection: token.name || token.symbol || 'Collected NFT',
    image: ipfsToHttps(item?.image_url || item?.media_url || item?.metadata?.image || item?.metadata?.image_url),
    metadataUri,
    href: `https://opensea.io/assets/ethereum/${contract}/${tokenId}`,
    contract,
    tokenId,
    wallet: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
  };
}

async function fetchBlockscoutNfts(wallet) {
  const response = await fetch(`${BLOCKSCOUT_API}/addresses/${wallet}/nft`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return [];
  const data = await response.json();
  const normalized = (data.items || [])
    .map((item) => normalizeBlockscoutNft(item, wallet))
    .filter(Boolean);

  return Promise.all(normalized.map(async (nft) => ({
    ...nft,
    image: nft.image
      || await fetchMetadataImageFromUri(nft.metadataUri)
      || await fetchTokenMetadataImage(nft.contract, nft.tokenId),
  })));
}

async function fetchReservoirNfts(wallet, contract) {
  const params = new URLSearchParams({
    limit: contract ? '20' : '48',
    sortBy: 'floorAskPrice',
    excludeSpam: 'true',
    excludeNsfw: 'true',
  });
  if (contract) params.set('collection', contract);

  const url = `${RESERVOIR_API}/users/${wallet}/tokens/v10?${params.toString()}`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return [];
  const data = await response.json();
  const normalized = (data.tokens || [])
    .map((item) => normalizeToken(item, wallet))
    .filter(Boolean);
  return Promise.all(normalized.map(async (nft) => ({
    ...nft,
    image: nft.image || await fetchTokenMetadataImage(nft.contract, nft.tokenId),
  })));
}

export default async function handler(req, res) {
  try {
    const ecosystemContracts = ECOSYSTEMS.flatMap((ecosystem) => ecosystem.contracts);
    const reservoirResponses = await Promise.allSettled(
      WALLETS.flatMap((wallet) => [
        fetchReservoirNfts(wallet),
        ...ecosystemContracts.map((contract) => fetchReservoirNfts(wallet, contract)),
      ])
    );

    const blockscoutResponses = await Promise.allSettled(WALLETS.map(fetchBlockscoutNfts));
    const allNfts = [
      ...reservoirResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
      ...blockscoutResponses.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
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
