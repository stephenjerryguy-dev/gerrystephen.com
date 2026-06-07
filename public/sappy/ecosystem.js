/* ============ ecosystem.js — dedicated dark ecosystem page ============ */
(function () {
  const PIXL_LOGO = "https://coin-images.coingecko.com/coins/images/33045/large/20220531_190522.jpg?1700450022";
  const ASSETS = [
    { name: "Sappy Seals", chain: "Ethereum", kind: "ERC-721", desc: "Sappy Seals",
      addr: "0x364c828ee171616a39897688a831c2499ad972ec", art: "image", image: "/assets/sappy-seals/1.png", seed: "sappyseals", id: 1, url: "https://opensea.io/collection/sappy-seals", action: "Buy/View" },
    { name: "Staked Sappy Seals", chain: "Ethereum", kind: "ERC-721", desc: "Staking wrapper — earns BITS daily.",
      addr: "0x1c70d0a86475cc707b48aa79f112857e7957274f", art: "image", image: "/assets/sappy-seals/777.png", seed: "stakedseal", id: 777, url: "https://etherscan.io/token/0x1c70d0a86475cc707b48aa79f112857e7957274f", action: "View" },
    { name: "$PIXL", chain: "Ethereum", kind: "ERC-20", desc: "The memecoin that powers Omnia.",
      addr: "0x427A03fb96D9A94a6727fBCfbBA143444090dD64", art: "coin", seed: "pixltoken", url: "https://app.uniswap.org/swap?chain=ethereum&outputCurrency=0x427A03fb96D9A94a6727fBCfbBA143444090dD64", action: "Trade" },
    { name: "Omnia Pets", chain: "Ethereum", kind: "ERC-721", desc: "Genesis Pixl Pets — your Omnia companion.",
      addr: "0x4e76c23fe2a4e37b5e07b5625e17098baab86c18", art: "image", image: "/sappy/assets/ecosystem/omnia-pet-1483.png", seed: "omniapets", url: "https://opensea.io/collection/omnia-pets-genesis", action: "Buy/View" },
    { name: "Omnia Items", chain: "Ethereum", kind: "ERC-1155", desc: "Gear, wearables & consumables.",
      addr: "0xf0ea56402b2e2b27556d7abf4236c7327722fe41", art: "image", image: "/sappy/assets/omnia/omnia-founders-pass.png", seed: "omniaitems", id: 1, url: "https://opensea.io/collection/omnia-items", action: "Buy/View" },
    { name: "Faithful Key", chain: "Ethereum", kind: "ERC-1155", desc: "A celebratory gift to every awesome HODLer still along for the ride to see where this adventure takes us. Don't ask Gordon where we found it though...",
      addr: "0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667", art: "image", image: "/sappy/assets/ecosystem/faithful-key.webp", seed: "sappykey", url: "https://etherscan.io/token/0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667", action: "View" },
    { name: "Pixseals", chain: "Polygon", kind: "ERC-721", desc: "Gas-free pixel airdrop, 1:1 mapped.",
      addr: "0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b", art: "image", image: "/sappy/assets/ecosystem/pixseal-1.avif", seed: "pixseals", id: 1, url: "https://opensea.io/assets/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/1", action: "Buy/View" },
    { name: "Digital Artifacts", chain: "Bitcoin / Ethereum", kind: "ERC-721", desc: "Bitcoin Ordinal artifacts mirrored on Ethereum.",
      addr: "0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a", art: "html", image: "https://i2c.seadn.io/ethereum/0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a/8f01708a2265650570c246d98b7f4f21.png", html: "https://ipfs2.seadn.io/ipfs/bafybeia3j3pdbydo4ensqryfs6e2fq7oji6tywjto3uokbtw7je5vo2lpe/93.html", seed: "artifacts", url: "https://opensea.io/item/ethereum/0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a/93", action: "Buy/View" },
  ];
  const chainChip = (c) => c === "Polygon" ? '<span class="chip poly">◆ Polygon</span>' : c === "Bitcoin / Ethereum" ? '<span class="chip nft">₿ BTC / Ξ ETH</span>' : '<span class="chip eth">Ξ Ethereum</span>';
  const kindChip = (k) => k === "ERC-721" ? '<span class="chip erc721">ERC-721</span>' : k === "ERC-1155" ? '<span class="chip erc721">ERC-1155</span>' : k === "ERC-20" ? '<span class="chip erc20">ERC-20</span>' : '<span class="chip nft">NFT</span>';

  function renderAssets() {
    const grid = document.getElementById("eco-grid"); if (!grid) return;
    grid.innerHTML = ASSETS.map((a) => {
      let ic;
      if (a.art === "coin") ic = `<div class="ic coin"><span class="coin-fallback">$PIXL</span><img class="coin-logo" src="${PIXL_LOGO}" alt="$PIXL" referrerpolicy="no-referrer" onload="this.classList.add('show')" onerror="this.remove()"></div>`;
      else if (a.art === "image") ic = `<div class="ic art-image"><img src="${a.image}" alt="${a.name} preview" loading="eager" decoding="async"></div>`;
      else if (a.art === "html") ic = `<div class="ic art-html"><iframe src="${a.html}" title="${a.name} HTML NFT" loading="lazy" sandbox="allow-scripts allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"></iframe><a href="${a.url}" target="_blank" rel="noopener">HTML NFT ↗</a></div>`;
      else if (a.art === "ordinal") ic = '<div class="ic ordinal"><span class="b">\u20bf</span><span class="t">ORDINAL</span></div>';
      else if (a.art === "seal") ic = `<div class="ic sealframe" data-pin="1" data-kind="seal" data-id="${a.id}" data-seed="${a.seed}" data-px="200"></div>`;
      else ic = `<div class="ic sealframe" data-kind="${a.art}" data-contract="${a.addr}"${a.id !== undefined ? ` data-id="${a.id}"` : ""} data-seed="${a.seed}" data-px="200"></div>`;
      return `
      <article class="asset">
        ${ic}
        <div class="meta">
          <div class="top"><h3>${a.name}</h3>${kindChip(a.kind)} ${chainChip(a.chain)}</div>
          <div class="chain">${a.desc}</div>
        </div>
        <a class="btn btn-ghost btn-sm" href="${a.url || `https://etherscan.io/token/${a.addr}`}" target="_blank" rel="noopener">${a.action || "View"} ↗</a>
        <div class="addr-pill"><code title="${a.addr}">${a.addr}</code><button class="copy-btn" data-addr="${a.addr}">Copy</button></div>
      </article>`;
    }).join("");
  }

  window.Sappy.ready(function () { window.SappyLayout.mount("eco"); renderAssets(); window.Sappy.init(); });
})();
