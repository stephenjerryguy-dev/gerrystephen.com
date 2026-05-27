const CONTRACTS = {
  sappySeals: {
    label: "Sappy Seals",
    chain: "Ethereum",
    contract: "0x364c828ee171616a39897688a831c2499ad972ec",
    type: "ERC-721",
    verified: true,
  },
  stakedSappySeals: {
    label: "Staked Sappy Seals",
    chain: "Ethereum",
    contract: "0x1c70d0a86475cc707b48aa79f112857e7957274f",
    type: "ERC-721 staking wrapper",
    verified: true,
  },
  pixl: {
    label: "$PIXL",
    chain: "Ethereum",
    contract: "0x427A03fb96D9A94a6727fBCfbBA143444090dD64",
    type: "ERC-20",
    verified: true,
  },
  omniaPets: {
    label: "Omnia Pets",
    chain: "Ethereum",
    contract: "0x4e76c23fe2a4e37b5e07b5625e17098baab86c18",
    type: "NFT",
    verified: true,
  },
  omniaItems: {
    label: "Omnia Items",
    chain: "Ethereum",
    contract: "0xf0ea56402b2e2b27556d7abf4236c7327722fe41",
    type: "NFT",
    verified: true,
  },
  sappyKey: {
    label: "Sappy Key Coverage",
    chain: "Ethereum",
    contract: "0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667",
    type: "NFT",
    verified: false,
  },
  pixseals: {
    label: "Pixseals",
    chain: "Polygon",
    contract: "0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b",
    type: "ERC-721",
    verified: true,
  },
  digitalArtifacts: {
    label: "Digital Artifacts",
    chain: "Ethereum",
    contract: "0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a",
    type: "ERC-721",
    verified: true,
  },
};

const sampleAssets = [
  {
    name: "Sappy Seals",
    collection: "Liquid seals",
    contractKey: "sappySeals",
    image: "/assets/sappy-seals/1184.png",
    note: "Connect to view your liquid seals.",
  },
  {
    name: "Staked Sappy Seals",
    collection: "Staked seals",
    contractKey: "stakedSappySeals",
    image: "/assets/sappy-seals/2772.png",
    note: "Connect to view your staked seals.",
  },
  {
    name: "$PIXL",
    collection: "Omnia ecosystem",
    contractKey: "pixl",
    image: "https://cdn.dexscreener.com/cms/images/df894589157dc6cba4da1b969b44944defa2c7ac291457d5fccabef0af32e017?width=800&height=800&quality=95&format=auto",
    note: "Connect to view your token balance.",
  },
  {
    name: "Omnia Pets",
    collection: "formerly Pixl Pets",
    contractKey: "omniaPets",
    glyph: "OP",
    note: "Connect to view owned pets.",
  },
  {
    name: "Omnia Items",
    collection: "formerly Pixlverse items",
    contractKey: "omniaItems",
    glyph: "OI",
    note: "Connect to view owned items.",
  },
  {
    name: "Sappy Key",
    collection: "key and soulbound coverage",
    contractKey: "sappyKey",
    glyph: "KEY",
    note: "Connect to view key assets.",
  },
  {
    name: "Pixseal #525",
    collection: "Pixseals",
    contractKey: "pixseals",
    tokenId: "525",
    image: "https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/525.png",
    href: "https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/525",
    note: "Featured ecosystem preview.",
  },
  {
    name: "Digital Artifact #93",
    collection: "Digital Artifacts",
    contractKey: "digitalArtifacts",
    tokenId: "93",
    image: "/assets/digital-artifact-93.jpg",
    href: "https://opensea.io/item/ethereum/0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a/93",
    note: "Featured artifact preview.",
  },
];

const features = [
  ["Browse holdings", "View Sappy Seals, staked Seals, PIXL, Omnia assets, Pixseals, keys, and artifacts in one place."],
  ["Check your seals", "Liquid and staked Sappy Seals stay separate where it matters and roll up together where it helps."],
  ["Create with assets", "Generate memes and X banners from the assets connected to your wallet."],
  ["Explore the colony", "Browse ecosystem collections before connecting, then personalize the hub with your wallet."],
];

const state = {
  wallet: "",
  balances: {},
  status: "preconnect",
};

function icon(name) {
  const icons = {
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>',
    arrow: '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
    waves: '<path d="M2 6c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"></path><path d="M2 12c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"></path><path d="M2 18c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"></path>',
    sparkles: '<path d="m12 3-1.9 5.8L4 10.5l6.1 1.7L12 18l1.9-5.8 6.1-1.7-6.1-1.7Z"></path><path d="M5 3v4"></path><path d="M3 5h4"></path><path d="M19 17v4"></path><path d="M17 19h4"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function contractFor(asset) {
  return CONTRACTS[asset.contractKey];
}

function encodeAddress(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function formatUnits(raw, decimals = 18) {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  const fracText = frac.toString().padStart(decimals, "0").slice(0, 3).replace(/0+$/, "");
  return fracText ? `${whole.toLocaleString()}.${fracText}` : whole.toLocaleString();
}

async function ethCall(rpc, to, data) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  if (!response.ok) throw new Error("rpc unavailable");
  const json = await response.json();
  if (!json.result || json.result === "0x") throw new Error("empty rpc result");
  return BigInt(json.result);
}

async function balanceOf(contract, wallet) {
  const rpc = contract.chain === "Polygon" ? "https://polygon-rpc.com" : "https://eth.llamarpc.com";
  const data = `0x70a08231${encodeAddress(wallet)}`;
  return ethCall(rpc, contract.contract, data);
}

async function hydrateWallet(address) {
  state.wallet = address;
  state.status = "loading";
  render();

  const readableContracts = ["sappySeals", "stakedSappySeals", "pixl", "pixseals", "digitalArtifacts"];
  const entries = await Promise.allSettled(
    readableContracts.map(async (key) => [key, await balanceOf(CONTRACTS[key], address)])
  );

  const balances = {};
  for (const entry of entries) {
    if (entry.status === "fulfilled") {
      const [key, value] = entry.value;
      balances[key] = value;
    }
  }

  state.balances = balances;
  state.status = "connected";
  render();
}

async function connectWallet() {
  if (window.sappyWalletConnect) {
    const address = await window.sappyWalletConnect();
    if (address) return hydrateWallet(address);
  }

  if (window.ethereum?.request) {
    const [address] = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (address) return hydrateWallet(address);
  }

  state.status = "needsWallet";
  render();
}

function displayAmount(key) {
  const value = state.balances[key];
  if (value === undefined) return state.status === "connected" ? "0" : "Connect";
  if (key === "pixl") return formatUnits(value, 18);
  return value.toLocaleString();
}

function sealTotal() {
  const liquid = state.balances.sappySeals || 0n;
  const staked = state.balances.stakedSappySeals || 0n;
  return state.status === "connected" ? (liquid + staked).toLocaleString() : "Connect";
}

function assetCard(asset) {
  const contract = contractFor(asset);
  const liveBalance = state.balances[asset.contractKey];
  const balanceText = liveBalance !== undefined
    ? (asset.contractKey === "pixl" ? `${formatUnits(liveBalance)} $PIXL` : `${liveBalance.toLocaleString()} owned`)
    : asset.note;
  const media = asset.image
    ? `<img src="${asset.image}" alt="${asset.name}" loading="lazy" />`
    : `<div class="glyph-mark">${asset.glyph}</div>`;
  const href = asset.href || `https://opensea.io/assets/${contract.chain.toLowerCase()}/${contract.contract}`;

  return `
    <a class="asset-card" href="${href}" target="_blank" rel="noopener">
      <div class="asset-image ${asset.image ? "" : "glyph"}">${media}</div>
      <h3>${asset.name}</h3>
      <p class="asset-collection">${asset.collection}</p>
      <p class="asset-detail">${balanceText}</p>
      <span>${contract.chain} · ${shortAddress(contract.contract)}</span>
    </a>
  `;
}

function contractRow(item) {
  return `
    <article class="contract-row">
      <div>
        <strong>${item.label}</strong>
        <span>${item.type} on ${item.chain}</span>
      </div>
      <code>${item.contract}</code>
    </article>
  `;
}

function render() {
  const connected = Boolean(state.wallet);
  const connectLabel = connected ? shortAddress(state.wallet) : "Connect Wallet";
  const holderCopy = connected
    ? `<strong>${sealTotal()} total seals</strong> across liquid and staked contracts<br />Wallet assets are grouped by ecosystem lane.`
    : `<strong>Sappy Seals + Staked Sappy Seals</strong><br />Connect to populate your ecosystem view.`;
  document.querySelector("#app").innerHTML = `
    <div class="page">
      <header class="site-header">
        <nav class="nav">
          <a class="brand" href="#">
            <strong>sappy.</strong>
            <span>ecosystem hub</span>
          </a>
          <div class="nav-links">
            <a href="#home">Home</a>
            <a href="#assets">Assets</a>
            <a href="#studio">Studio</a>
            <a href="#memes">Memes</a>
            <a href="#community">Community</a>
          </div>
          <button class="connect ${connected ? "connected" : ""}">${icon("wallet")}${connectLabel}</button>
        </nav>
      </header>

      <section id="home" class="hero">
        <div class="hero-pattern"></div>
        <div class="hero-inner">
          <div class="hero-copy">
            <h1>All your seals.<br /><span>Finally</span> in one place.</h1>
            <p>Track Sappy Seals, staked Seals, $PIXL, Omnia Pets, Omnia Items, Sappy Keys, Pixseals, and Digital Artifacts. Build your identity. Meet your people. Stay sappy.</p>
            <div class="hero-actions">
              <button class="primary">Connect Wallet ${icon("arrow")}</button>
              <a class="secondary" href="#community">Explore the Colony ${icon("waves")}</a>
            </div>
            <div class="holder-row">
              <div class="avatar-stack">
                <img src="/assets/sappy-hero.png" alt="" />
                ${sampleAssets.filter((asset) => asset.image).slice(0, 3).map((asset) => `<img src="${asset.image}" alt="" />`).join("")}
              </div>
              <p>${holderCopy}</p>
            </div>
          </div>
          <div class="hero-art">
            <div class="glow"></div>
            <div class="speech">stay<br />sappy...</div>
            <img src="/assets/sappy-hero.png" alt="Sappy Seal" />
          </div>
        </div>
      </section>

      <main class="main">
        <section class="stats">
          <div><p>Total Seals</p><strong>${sealTotal()}</strong><span>liquid + staked</span></div>
          <div><p>Sappy Seals</p><strong>${displayAmount("sappySeals")}</strong><span>${shortAddress(CONTRACTS.sappySeals.contract)}</span></div>
          <div><p>Staked Seals</p><strong>${displayAmount("stakedSappySeals")}</strong><span>${shortAddress(CONTRACTS.stakedSappySeals.contract)}</span></div>
          <div><p>$PIXL</p><strong>${displayAmount("pixl")}</strong><span>wallet balance</span></div>
        </section>

        <section id="studio" class="studio">
          <div class="section-head">
            <h2>Collector and creator hub.</h2>
            <p>A home base for Sappy holders to browse, create, and move through the ecosystem.</p>
          </div>
          <div class="feature-grid">
            ${features.map(([title, body]) => `
              <article>
                <div>${icon("sparkles")}</div>
                <h3>${title}</h3>
                <p>${body}</p>
              </article>
            `).join("")}
          </div>
        </section>

        <section id="assets" class="asset-section">
          <div class="section-head split">
            <div>
              <h2>${connected ? "Your ecosystem assets." : "Sappy ecosystem assets."}</h2>
              <p>${connected ? "Your connected wallet is now shaping the collection view." : "Explore the collections covered by the hub. Connect your wallet to make it yours."}</p>
            </div>
            <a href="https://www.sappy.lol/~/omnia" target="_blank" rel="noopener">Open sappy.lol ${icon("arrow")}</a>
          </div>
          <div class="asset-grid confirmed">
            ${sampleAssets.map(assetCard).join("")}
          </div>
        </section>

        <section class="studio-page">
          <div class="section-head split">
            <div>
              <h2>Your Seal Studio.</h2>
              <p>Build a holder profile, prepare banners, save creator outputs, and keep downloadable ecosystem assets close.</p>
            </div>
            <button class="small-connect">Connect Wallet ${icon("arrow")}</button>
          </div>
          <div class="studio-tools">
            ${[
              ["Profile", "Choose a liquid or staked Seal as your identity."],
              ["X Banner", "Generate a Sappy banner from your wallet assets."],
              ["Meme Maker", "Drop your Seal into classic meme formats."],
              ["Downloads", "Keep 2D, ecosystem, and creator exports organized."],
            ].map(([title, body], index) => `
              <article>
                <img src="/assets/sappy-seals/${[1184, 42, 777, 2021][index]}.png" alt="" />
                <div>
                  <h3>${title}</h3>
                  <p>${body}</p>
                </div>
              </article>
            `).join("")}
          </div>
        </section>

        <section id="memes" class="meme-vault">
          <div class="back-link">The Meme Den</div>
          <div class="meme-head">
            <span>${icon("sparkles")} Meme Vault</span>
            <h2>The Meme Den</h2>
            <p>Search, remix, and download Sappy-ready meme templates.</p>
          </div>
          <div class="search-row">
            <span>⌕</span>
            <input aria-label="Search memes by name" placeholder="Search by meme name..." />
          </div>
          <div class="tag-row">
            ${["All", "Emotion", "Two Part", "Colony", "Classic"].map((tag, index) => `<button class="${index === 0 ? "active" : ""}">${tag}</button>`).join("")}
          </div>
          <div class="meme-grid">
            ${[
              ["Seal Reaction", "Classic", "/assets/sappy-seals/3333.png"],
              ["Mint Mood", "Popular", "/assets/sappy-seals/2772.png"],
              ["Colony Signal", "New", "/assets/sappy-seals/1184.png"],
            ].map(([title, tag, src]) => `
              <article>
                <div><img src="${src}" alt="${title}" /></div>
                <h3>${title}</h3>
                <p>${tag}</p>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="meme-panel">
          <div>
            <h2>Meme and banner studio.</h2>
            <p>Create from your liquid Seals, staked Seals, Pixseals, Omnia assets, keys, and artifacts after connecting.</p>
          </div>
          <div class="mock-banner">
            <span>sappy.</span>
            <strong>Liquid, staked, and still sappy.</strong>
          </div>
        </section>

        <section class="contract-section">
          <div class="section-head">
            <h2>Supported collections.</h2>
            <p>Liquid Sappy Seals and staked Sappy Seals are both included.</p>
          </div>
          <div class="contract-list">
            ${Object.values(CONTRACTS).map(contractRow).join("")}
          </div>
        </section>

        <section id="community" class="community">
          <div>
            <span>Community</span>
            <h2>Find your colony.</h2>
            <p>Browse the ecosystem before connecting, then let your wallet bring your Seals, staked Seals, Omnia assets, Pixseals, and artifacts into view.</p>
            <a href="#assets">Explore assets ${icon("arrow")}</a>
          </div>
          <div class="community-grid">
            ${sampleAssets.slice(0, 5).map((asset) => `
              <a class="mini-card" href="#assets">
                <div class="mini-media ${asset.image ? "" : "glyph"}">${asset.image ? `<img src="${asset.image}" alt="${asset.name}" />` : `<div class="glyph-mark">${asset.glyph}</div>`}</div>
                <strong>${asset.name}</strong>
                <span>${asset.collection}</span>
              </a>
            `).join("")}
          </div>
        </section>
      </main>

      <footer>
        <strong>sappy.</strong>
        <span>A public Sappy Seals ecosystem hub.</span>
      </footer>
    </div>
  `;

  document.querySelector(".connect").addEventListener("click", connectWallet);
  document.querySelector(".primary").addEventListener("click", connectWallet);
}

window.setSappyWallet = hydrateWallet;
render();
