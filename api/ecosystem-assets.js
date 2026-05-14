const ABSTRACT_WALLET = '0x382556A543aAd855C07678E7F8e820d0d90429BB';
const ETH_WALLET = '0xc3ce1Eb539c1Cc031eCd7B95e8C00768BF324403';
const ETH_RPC = 'https://eth.llamarpc.com';
const ABSTRACT_RPC = 'https://api.mainnet.abs.xyz';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens';
const BALANCE_OF = '0x70a08231';
const DECIMALS = '0x313ce567';

const ASSETS = [
  {
    id: 'pengu',
    ecosystem: 'pudgy',
    name: '$PENGU',
    collection: 'Pudgy Penguins ecosystem',
    symbol: '$PENGU',
    chain: 'Abstract',
    rpc: ABSTRACT_RPC,
    contract: '0x9eBe3A824Ca958e4b3Da772D2065518F009CBa62',
    wallet: ABSTRACT_WALLET,
    href: `https://abscan.org/token/0x9eBe3A824Ca958e4b3Da772D2065518F009CBa62?a=${ABSTRACT_WALLET}`,
    image: 'https://cdn.dexscreener.com/cms/images/527f3df62eb754a69b5d3dd14b1ee36301b506df9af455374f4e0ffb91367594?width=800&height=800&quality=95&format=auto',
  },
  {
    id: 'pixl',
    ecosystem: 'sappy',
    name: '$PIXL',
    collection: 'Omnia ecosystem',
    symbol: '$PIXL',
    chain: 'Ethereum',
    rpc: ETH_RPC,
    contract: '0x427A03fb96D9A94a6727fBCfbBA143444090dD64',
    wallet: ETH_WALLET,
    href: `https://etherscan.io/token/0x427A03fb96D9A94a6727fBCfbBA143444090dD64?a=${ETH_WALLET}`,
    image: 'https://cdn.dexscreener.com/cms/images/df894589157dc6cba4da1b969b44944defa2c7ac291457d5fccabef0af32e017?width=800&height=800&quality=95&format=auto',
    fallbackAmount: '103,278.52',
  },
];

const STATIC_ASSETS = [
  {
    id: 'pixseal-525',
    ecosystem: 'sappy',
    name: 'Pixseal #525',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/525.png',
    chain: 'Polygon',
    tokenId: '525',
    contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b',
    href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/525',
  },
  {
    id: 'pixseal-3600',
    ecosystem: 'sappy',
    name: 'Pixseal #3600',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/3600.png',
    chain: 'Polygon',
    tokenId: '3600',
    contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b',
    href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/3600',
  },
  {
    id: 'pixseal-9690',
    ecosystem: 'sappy',
    name: 'Pixseal #9690',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9690.png',
    chain: 'Polygon',
    tokenId: '9690',
    contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b',
    href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/9690',
  },
  {
    id: 'pixseal-9815',
    ecosystem: 'sappy',
    name: 'Pixseal #9815',
    collection: 'Pixseals by Sappy Seals',
    image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9815.png',
    chain: 'Polygon',
    tokenId: '9815',
    contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b',
    href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/9815',
  },
  {
    id: 'digital-artifact-93',
    ecosystem: 'sappy',
    name: 'Digital Artifact #93',
    collection: 'Digital Artifact',
    image: 'assets/digital-artifact-93.jpg',
    chain: 'Ethereum',
    tokenId: '93',
    contract: '0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a',
    href: 'https://opensea.io/item/ethereum/0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a/93',
  },
];

function encodeAddress(address) {
  return address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

async function rpcCall(rpc, to, data) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });
  if (!response.ok) throw new Error('rpc unavailable');
  const json = await response.json();
  if (!json.result || json.result === '0x') throw new Error('empty rpc result');
  return json.result;
}

function formatUnits(hex, decimals) {
  const raw = BigInt(hex);
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  const fracText = frac.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
  const wholeText = whole.toLocaleString('en-US');
  return fracText ? `${wholeText}.${fracText}` : wholeText;
}

async function fetchTokenImage(contract) {
  const response = await fetch(`${DEXSCREENER_API}/${contract}`, { headers: { accept: 'application/json' } });
  if (!response.ok) return undefined;
  const data = await response.json();
  return data?.pairs?.find((pair) => pair?.info?.imageUrl)?.info?.imageUrl;
}

async function withBalance(asset) {
  try {
    const [decimalsHex, tokenImage] = await Promise.all([
      rpcCall(asset.rpc, asset.contract, DECIMALS),
      fetchTokenImage(asset.contract).catch(() => undefined),
    ]);
    const decimals = Number.parseInt(decimalsHex, 16) || 18;
    const balanceHex = await rpcCall(asset.rpc, asset.contract, `${BALANCE_OF}${encodeAddress(asset.wallet)}`);
    return {
      ...asset,
      amount: formatUnits(balanceHex, decimals),
      tokenId: 'asset',
      image: tokenImage || asset.image || null,
      glyph: asset.symbol,
      contract: asset.contract,
    };
  } catch (error) {
    const tokenImage = await fetchTokenImage(asset.contract).catch(() => undefined);
    return {
      ...asset,
      amount: asset.fallbackAmount || 'syncing',
      tokenId: 'asset',
      image: tokenImage || asset.image || null,
      glyph: asset.symbol,
      contract: asset.contract,
    };
  }
}

export default async function handler(req, res) {
  const assets = await Promise.all(ASSETS.map(withBalance));
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).json({ assets: [...assets, ...STATIC_ASSETS] });
}
