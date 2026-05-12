const WALLETS = [
  '0xCf3b8981AbAa56a8E41117b0c721C05F608400A7',
  '0x382556a543aad855c07678e7f8e820d0d90429bb',
  '0xc3ce1eb539c1cc031ecd7b95e8c00768bf324403',
];

function normalizeToken(item, wallet) {
  const token = item?.token || item || {};
  const collection = token.collection || {};
  const contract = token.contract;
  const tokenId = token.tokenId || token.token_id;

  if (!contract || !tokenId) return null;

  return {
    name: token.name || `${collection.name || 'NFT'} #${tokenId}`,
    collection: collection.name || 'Collected NFT',
    image: token.imageSmall || token.image || token.imageUrl || token.metadata?.image,
    href: `https://opensea.io/assets/ethereum/${contract}/${tokenId}`,
    wallet: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
  };
}

export default async function handler(req, res) {
  try {
    const responses = await Promise.allSettled(
      WALLETS.map(async (wallet) => {
        const url = `https://api-ethereum.reservoir.tools/users/${wallet}/tokens/v10?limit=24&sortBy=floorAskPrice&excludeSpam=true&excludeNsfw=true`;
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.tokens || [])
          .map((item) => normalizeToken(item, wallet))
          .filter(Boolean);
      })
    );

    const nfts = responses
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((nft) => nft.image)
      .slice(0, 16);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ nfts });
  } catch (error) {
    res.status(200).json({ nfts: [] });
  }
}
