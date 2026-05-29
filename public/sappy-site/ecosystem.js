/* ============ ecosystem.js — dedicated dark ecosystem page ============ */
(function () {
  const PIXL_LOGO = "https://coin-images.coingecko.com/coins/images/33045/large/20220531_190522.jpg?1700450022";
  const ASSETS = [
    { name: "Sappy Seals", chain: "Ethereum", kind: "ERC-721", desc: "The original collection — 10,000 pixel seals.",
      addr: "0x364c828ee171616a39897688a831c2499ad972ec", art: "seal", seed: "sappyseals", id: 7 },
    { name: "Staked Sappy Seals", chain: "Ethereum", kind: "ERC-721", desc: "Staking wrapper — earns $PIXL daily.",
      addr: "0x1c70d0a86475cc707b48aa79f112857e7957274f", art: "seal", seed: "stakedseal", id: 999 },
    { name: "$PIXL", chain: "Ethereum", kind: "ERC-20", desc: "The memecoin that powers Omnia.",
      addr: "0x427A03fb96D9A94a6727fBCfbBA143444090dD64", art: "coin", seed: "pixltoken" },
    { name: "Omnia Pets", chain: "Ethereum", kind: "NFT", desc: "Genesis Pixl Pets — your Omnia companion.",
      addr: "0x4e76c23fe2a4e37b5e07b5625e17098baab86c18", art: "eth", seed: "omniapets" },
    { name: "Omnia Items", chain: "Ethereum", kind: "NFT", desc: "Gear, wearables & consumables.",
      addr: "0xf0ea56402b2e2b27556d7abf4236c7327722fe41", art: "eth", seed: "omniaitems", id: 1 },
    { name: "Sappy Key Coverage", chain: "Ethereum", kind: "NFT", desc: "Access keys for holder perks.",
      addr: "0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667", art: "eth", seed: "sappykey" },
    { name: "Pixseals", chain: "Polygon", kind: "ERC-721", desc: "Gas-free pixel airdrop, 1:1 mapped.",
      addr: "0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b", art: "polygon", seed: "pixseals", id: 1 },
    { name: "Digital Artifacts", chain: "Ethereum", kind: "ERC-721", desc: "1/1 Bitcoin Ordinal art — lives as on-chain HTML.",
      addr: "0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a", art: "ordinal", seed: "artifacts" },
  ];
  const chainChip = (c) => c === "Polygon" ? '<span class="chip poly">◆ Polygon</span>' : '<span class="chip eth">Ξ Ethereum</span>';
  const kindChip = (k) => k === "ERC-721" ? '<span class="chip erc721">ERC-721</span>' : k === "ERC-20" ? '<span class="chip erc20">ERC-20</span>' : '<span class="chip nft">NFT</span>';

  function renderAssets() {
    const grid = document.getElementById("eco-grid"); if (!grid) return;
    grid.innerHTML = ASSETS.map((a) => {
      let ic;
      if (a.art === "coin") ic = `<div class="ic coin"><span class="coin-fallback">$PIXL</span><img class="coin-logo" src="${PIXL_LOGO}" alt="$PIXL" referrerpolicy="no-referrer" onload="this.classList.add('show')" onerror="this.remove()"></div>`;
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
        <a class="btn btn-ghost btn-sm" href="https://etherscan.io/token/${a.addr}" target="_blank" rel="noopener">View ↗</a>
        <div class="addr-pill"><code title="${a.addr}">${a.addr}</code><button class="copy-btn" data-addr="${a.addr}">Copy</button></div>
      </article>`;
    }).join("");
  }

  window.Sappy.ready(function () { window.SappyLayout.mount("eco"); renderAssets(); window.Sappy.init(); });
})();
