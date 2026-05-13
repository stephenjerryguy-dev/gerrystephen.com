const ABSTRACT_WALLET = '0x382556A543aAd855C07678E7F8e820d0d90429BB';
const ETH_RPC = 'https://eth.llamarpc.com';
const ABSTRACT_RPC = 'https://api.mainnet.abs.xyz';
const BALANCE_OF = '0x70a08231';
const DECIMALS = '0x313ce567';

const ASSETS = [
  {
    id: 'pengu',
    ecosystem: 'pudgy',
    name: 'PENGU',
    collection: 'Pudgy Penguins ecosystem',
    symbol: 'PENGU',
    chain: 'Abstract',
    rpc: ABSTRACT_RPC,
    contract: '0x9eBe3A824Ca958e4b3Da772D2065518F009CBa62',
    wallet: ABSTRACT_WALLET,
    href: `https://abscan.org/token/0x9eBe3A824Ca958e4b3Da772D2065518F009CBa62?a=${ABSTRACT_WALLET}`,
  },
  {
    id: 'pixl',
    ecosystem: 'sappy',
    name: 'PIXL',
    collection: 'Pixlverse ecosystem',
    symbol: 'PIXL',
    chain: 'Ethereum',
    rpc: ETH_RPC,
    contract: '0x427A03fb96D9A94a6727fBCfbBA143444090dD64',
    wallet: ABSTRACT_WALLET,
    href: `https://etherscan.io/token/0x427A03fb96D9A94a6727fBCfbBA143444090dD64?a=${ABSTRACT_WALLET}`,
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

async function withBalance(asset) {
  try {
    const decimalsHex = await rpcCall(asset.rpc, asset.contract, DECIMALS);
    const decimals = Number.parseInt(decimalsHex, 16) || 18;
    const balanceHex = await rpcCall(asset.rpc, asset.contract, `${BALANCE_OF}${encodeAddress(asset.wallet)}`);
    return {
      ...asset,
      amount: formatUnits(balanceHex, decimals),
      tokenId: 'asset',
      image: null,
      glyph: asset.symbol,
      contract: asset.contract,
    };
  } catch (error) {
    return {
      ...asset,
      amount: 'syncing',
      tokenId: 'asset',
      image: null,
      glyph: asset.symbol,
      contract: asset.contract,
    };
  }
}

export default async function handler(req, res) {
  const assets = await Promise.all(ASSETS.map(withBalance));
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).json({ assets });
}
