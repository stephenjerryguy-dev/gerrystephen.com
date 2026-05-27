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
    chainId: 137,
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

const assetFilters = ["All", "Seals", "Omnia", "Pixseals", "Artifacts"];

const memeTemplates = [
  ["Seal Reaction", "Classic", "/assets/sappy-seals/3333.png"],
  ["Mint Mood", "Emotion", "/assets/sappy-seals/2772.png"],
  ["Colony Signal", "Colony", "/assets/sappy-seals/1184.png"],
  ["Stake Face", "Two Part", "/assets/sappy-seals/42.png"],
  ["PIXL Brain", "Classic", "/assets/sappy-seals/777.png"],
  ["Vault Check", "Colony", "/assets/sappy-seals/2021.png"],
];

const studioTools = [
  {
    title: "Profile",
    body: "Choose a liquid, staked, or delegated Seal as your identity.",
    detail: "Select a Seal, set your primary ecosystem identity, and keep the source contract visible.",
    image: "/assets/sappy-seals/1184.png",
  },
  {
    title: "X Banner",
    body: "Generate a Sappy banner from your wallet assets.",
    detail: "Compose a banner with your Seal, PIXL lane, Omnia items, and collector badges.",
    image: "/assets/sappy-seals/42.png",
  },
  {
    title: "Meme Maker",
    body: "Drop your Seal into classic meme formats.",
    detail: "Pick a template, search by mood, and keep exports ready for X or Discord.",
    image: "/assets/sappy-seals/777.png",
  },
  {
    title: "Downloads",
    body: "Keep 2D, ecosystem, and creator exports organized.",
    detail: "Collect owner-ready images and generated outputs in one download lane.",
    image: "/assets/sappy-seals/2021.png",
  },
];

const quickActions = [
  ["Holdings", "Seals, staked Seals, delegated vaults, PIXL, Omnia, keys, Pixseals, and artifacts.", "#assets", "wallet"],
  ["Studio", "Pick a Seal identity, prep banners, organize downloads, and keep creator tools close.", "#studio-tools", "sparkles"],
  ["Meme Den", "Search and remix Sappy-ready templates from the same page.", "#memes", "image"],
  ["Community", "Browse public ecosystem lanes before connecting your wallet.", "#community", "users"],
];

const state = {
  wallet: "",
  balances: {},
  directBalances: {},
  delegatedBalances: {},
  delegations: [],
  delegationStatus: "idle",
  xProfile: null,
  xStatus: "idle",
  assetFilter: "All",
  memeSearch: "",
  memeTag: "All",
  selectedStudio: 0,
  status: "preconnect",
};

function icon(name) {
  const icons = {
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"></path><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"></path>',
    arrow: '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
    waves: '<path d="M2 6c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"></path><path d="M2 12c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"></path><path d="M2 18c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 5-2"></path>',
    sparkles: '<path d="m12 3-1.9 5.8L4 10.5l6.1 1.7L12 18l1.9-5.8 6.1-1.7-6.1-1.7Z"></path><path d="M5 3v4"></path><path d="M3 5h4"></path><path d="M19 17v4"></path><path d="M17 19h4"></path>',
    shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z"></path><path d="m9 12 2 2 4-4"></path>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    x: '<path d="M4 4l16 16"></path><path d="M20 4 4 20"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

function sameAddress(left, right) {
  return left?.toLowerCase() === right?.toLowerCase();
}

function contractChainId(contract) {
  return contract.chainId || 1;
}

async function fetchDelegateRegistry(wallet) {
  const chainIds = [1, 137];
  const settled = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const response = await fetch(`https://api.delegate.xyz/registry/v2/${wallet}?chainId=${chainId}`);
      if (!response.ok) throw new Error("delegate registry unavailable");
      const delegations = await response.json();
      return delegations.map((delegation) => ({ ...delegation, chainId }));
    })
  );

  return settled
    .filter((entry) => entry.status === "fulfilled")
    .flatMap((entry) => entry.value)
    .filter((delegation) => sameAddress(delegation.to, wallet));
}

function delegationCoversContract(delegation, contract) {
  if (delegation.chainId !== contractChainId(contract)) return false;
  if (delegation.type === "ALL") return true;
  return ["CONTRACT", "TOKEN"].includes(delegation.type) && sameAddress(delegation.contract, contract.contract);
}

function delegatedVaultsForContract(delegations, contract) {
  const vaults = new Set();
  for (const delegation of delegations) {
    if (delegation.type === "TOKEN") continue;
    if (delegationCoversContract(delegation, contract)) vaults.add(delegation.from);
  }
  return [...vaults];
}

function delegatedTokenCount(key) {
  const contract = CONTRACTS[key];
  return state.delegations.filter(
    (delegation) => delegation.type === "TOKEN" && delegationCoversContract(delegation, contract)
  ).length;
}

async function delegatedBalanceOf(key, delegations) {
  const contract = CONTRACTS[key];
  const vaults = delegatedVaultsForContract(delegations, contract);
  const balances = await Promise.allSettled(vaults.map((vault) => balanceOf(contract, vault)));
  const allOrContractTotal = balances.reduce((total, entry) => {
    return entry.status === "fulfilled" ? total + entry.value : total;
  }, 0n);

  return allOrContractTotal + BigInt(
    delegations.filter((delegation) => delegation.type === "TOKEN" && delegationCoversContract(delegation, contract)).length
  );
}

async function hydrateWallet(address) {
  state.wallet = address;
  state.status = "loading";
  state.delegationStatus = "loading";
  render();

  const readableContracts = ["sappySeals", "stakedSappySeals", "pixl", "pixseals", "digitalArtifacts"];
  const [directEntries, delegateEntry] = await Promise.all([
    Promise.allSettled(readableContracts.map(async (key) => [key, await balanceOf(CONTRACTS[key], address)])),
    fetchDelegateRegistry(address).then(
      (delegations) => ({ status: "fulfilled", delegations }),
      () => ({ status: "rejected", delegations: [] })
    ),
  ]);

  const delegations = delegateEntry.delegations;
  const delegatedEntries = await Promise.allSettled(
    readableContracts.map(async (key) => [key, await delegatedBalanceOf(key, delegations)])
  );

  const directBalances = {};
  for (const entry of directEntries) {
    if (entry.status === "fulfilled") {
      const [key, value] = entry.value;
      directBalances[key] = value;
    }
  }

  const delegatedBalances = {};
  for (const entry of delegatedEntries) {
    if (entry.status === "fulfilled") {
      const [key, value] = entry.value;
      delegatedBalances[key] = value;
    }
  }

  const balances = {};
  for (const key of readableContracts) {
    balances[key] = (directBalances[key] || 0n) + (delegatedBalances[key] || 0n);
  }

  state.directBalances = directBalances;
  state.delegatedBalances = delegatedBalances;
  state.delegations = delegations;
  state.delegationStatus = delegateEntry.status === "fulfilled" ? "connected" : "unavailable";
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

async function connectX() {
  state.xStatus = "loading";
  render();

  if (window.sappyXLogin) {
    try {
      const profile = await window.sappyXLogin();
      if (profile?.handle) {
        state.xProfile = profile;
        state.xStatus = "connected";
        render();
        return;
      }
    } catch (_) {
      state.xStatus = "error";
      render();
      return;
    }
  }

  state.xStatus = "needsProvider";
  render();
}

function xLabel() {
  if (state.xProfile?.handle) return `@${state.xProfile.handle.replace(/^@/, "")}`;
  if (state.xStatus === "loading") return "Opening X...";
  if (state.xStatus === "needsProvider") return "X Login Ready";
  return "Login with X";
}

function xStatusText() {
  if (state.xProfile?.handle) return `Signed in as @${state.xProfile.handle.replace(/^@/, "")}.`;
  if (state.xStatus === "needsProvider") return "Connect the Dynamic X provider to window.sappyXLogin to complete live sign-in.";
  if (state.xStatus === "error") return "X login needs another try.";
  return "Use X for identity and wallet for asset ownership.";
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

function delegateSummary() {
  if (!state.wallet) return "Connect with a hot wallet to include eligible delegated vault assets.";
  if (state.delegationStatus === "loading") return "Checking Delegate.xyz for vault access...";
  if (state.delegationStatus === "unavailable") return "Delegate.xyz registry could not be reached. Direct wallet assets are still shown.";
  if (!state.delegations.length) return "No incoming Delegate.xyz vaults found for this wallet.";

  const vaultCount = new Set(state.delegations.map((delegation) => delegation.from.toLowerCase())).size;
  const tokenDelegations = state.delegations.filter((delegation) => delegation.type === "TOKEN").length;
  return `${vaultCount} delegated vault${vaultCount === 1 ? "" : "s"} found${tokenDelegations ? `, including ${tokenDelegations} token-level delegation${tokenDelegations === 1 ? "" : "s"}` : ""}.`;
}

function delegatedDisplay(key) {
  const delegated = state.delegatedBalances[key] || 0n;
  const tokenCount = delegatedTokenCount(key);
  if (!state.wallet) return "Connect";
  if (key === "pixl") return formatUnits(delegated, 18);
  return tokenCount && delegated === BigInt(tokenCount)
    ? `${delegated.toLocaleString()} token-level`
    : delegated.toLocaleString();
}

function assetMatchesFilter(asset) {
  if (state.assetFilter === "All") return true;
  if (state.assetFilter === "Seals") return ["sappySeals", "stakedSappySeals"].includes(asset.contractKey);
  if (state.assetFilter === "Omnia") return ["pixl", "omniaPets", "omniaItems", "sappyKey"].includes(asset.contractKey);
  if (state.assetFilter === "Pixseals") return asset.contractKey === "pixseals";
  if (state.assetFilter === "Artifacts") return asset.contractKey === "digitalArtifacts";
  return true;
}

function filteredAssets() {
  return sampleAssets.filter(assetMatchesFilter);
}

function filteredMemes() {
  const search = state.memeSearch.trim().toLowerCase();
  return memeTemplates.filter(([title, tag]) => {
    const matchesTag = state.memeTag === "All" || tag === state.memeTag;
    const matchesSearch = !search || title.toLowerCase().includes(search) || tag.toLowerCase().includes(search);
    return matchesTag && matchesSearch;
  });
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
    : `<strong>Sappy Seals + Staked Sappy Seals</strong><br />Connect to populate your ecosystem view. Delegate.xyz vaults are included.`;
  document.querySelector("#app").innerHTML = `
    <div class="page">
      <header class="site-header">
        <nav class="nav">
          <a class="brand" href="#">
            <strong>sappy.</strong>
            <span>ecosystem hub</span>
          </a>
          <div class="nav-links">
            <a href="#assets">Assets</a>
            <a href="#studio-tools">Studio</a>
            <a href="#memes">Memes</a>
            <a href="#community">Community</a>
          </div>
          <div class="nav-actions">
            <button class="x-login ${state.xProfile ? "connected" : ""}">${icon("x")}${xLabel()}</button>
            <button class="connect ${connected ? "connected" : ""}">${icon("wallet")}${connectLabel}</button>
          </div>
        </nav>
      </header>

      <section id="home" class="hero">
        <div class="hero-pattern"></div>
        <div class="hero-inner">
          <div class="hero-copy">
            <h1>All your seals.<br /><span>Finally</span> in one place.</h1>
            <p>Track liquid Seals, staked Seals, delegated vaults, $PIXL, Omnia, Pixseals, keys, and artifacts from one fast holder hub.</p>
            <div class="hero-actions">
              <button class="primary">Connect Wallet ${icon("arrow")}</button>
              <button class="secondary x-login-hero">${icon("x")}${xLabel()}</button>
              <a class="secondary" href="#assets">Browse Assets ${icon("waves")}</a>
            </div>
            <p class="login-note">${xStatusText()}</p>
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

        <section class="quick-hub">
          ${quickActions.map(([title, body, href, iconName]) => `
            <a href="${href}">
              <div>${icon(iconName)}</div>
              <strong>${title}</strong>
              <span>${body}</span>
            </a>
          `).join("")}
        </section>

        <section id="delegate" class="delegate-panel compact">
          <div class="delegate-copy">
            <span>${icon("shield")} Delegate.xyz</span>
            <p>${delegateSummary()}</p>
          </div>
          <div class="delegate-stats">
            <article><p>Delegated Seals</p><strong>${connected ? ((state.delegatedBalances.sappySeals || 0n) + (state.delegatedBalances.stakedSappySeals || 0n)).toLocaleString() : "Connect"}</strong><span>liquid + staked</span></article>
            <article><p>Delegated $PIXL</p><strong>${delegatedDisplay("pixl")}</strong><span>eligible vault balance</span></article>
            <article><p>Delegated Pixseals</p><strong>${delegatedDisplay("pixseals")}</strong><span>Polygon registry</span></article>
          </div>
          <a href="https://delegate.xyz/" target="_blank" rel="noopener">Manage delegations ${icon("arrow")}</a>
        </section>

        <section id="assets" class="asset-section">
          <div class="section-head split">
            <div>
              <h2>${connected ? "Your ecosystem assets." : "Sappy ecosystem assets."}</h2>
              <p>${connected ? "Direct and delegated balances are grouped into practical collection lanes." : "Filter the covered collections, then connect when you want the view personalized."}</p>
            </div>
            <a href="https://www.sappy.lol/~/omnia" target="_blank" rel="noopener">Open sappy.lol ${icon("arrow")}</a>
          </div>
          <div class="asset-toolbar">
            <div class="filter-row" role="tablist" aria-label="Asset filters">
              ${assetFilters.map((filter) => `<button class="${state.assetFilter === filter ? "active" : ""}" data-asset-filter="${filter}">${filter}</button>`).join("")}
            </div>
            <p>${filteredAssets().length} collection${filteredAssets().length === 1 ? "" : "s"} shown</p>
          </div>
          <div class="asset-grid confirmed">
            ${filteredAssets().map(assetCard).join("")}
          </div>
        </section>

        <section id="studio-tools" class="studio-page">
          <div class="section-head split">
            <div>
              <h2>Seal Studio.</h2>
              <p>Pick a task and work from the same connected asset pool.</p>
            </div>
            <button class="small-connect">Connect Wallet ${icon("arrow")}</button>
          </div>
          <div class="studio-tools">
            ${studioTools.map((tool, index) => `
              <article class="${state.selectedStudio === index ? "selected" : ""}" data-studio-index="${index}">
                <img src="${tool.image}" alt="" />
                <div>
                  <h3>${tool.title}</h3>
                  <p>${tool.body}</p>
                </div>
              </article>
            `).join("")}
          </div>
          <div class="studio-detail">
            <img src="${studioTools[state.selectedStudio].image}" alt="" />
            <div>
              <span>${state.selectedStudio + 1} / ${studioTools.length}</span>
              <h3>${studioTools[state.selectedStudio].title}</h3>
              <p>${studioTools[state.selectedStudio].detail}</p>
              <button class="small-connect">${connected ? "Use connected assets" : "Connect Wallet"} ${icon("arrow")}</button>
            </div>
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
            <input aria-label="Search memes by name" placeholder="Search by meme name..." value="${escapeAttr(state.memeSearch)}" />
          </div>
          <div class="tag-row">
            ${["All", "Emotion", "Two Part", "Colony", "Classic"].map((tag) => `<button class="${state.memeTag === tag ? "active" : ""}" data-meme-tag="${tag}">${tag}</button>`).join("")}
          </div>
          <div class="meme-grid">
            ${filteredMemes().map(([title, tag, src]) => `
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
  document.querySelector(".x-login")?.addEventListener("click", connectX);
  document.querySelector(".x-login-hero")?.addEventListener("click", connectX);
  document.querySelectorAll(".small-connect").forEach((button) => button.addEventListener("click", connectWallet));
  document.querySelectorAll("[data-asset-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.assetFilter = button.dataset.assetFilter;
      render();
    });
  });
  document.querySelectorAll("[data-studio-index]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedStudio = Number(card.dataset.studioIndex);
      render();
    });
  });
  document.querySelectorAll("[data-meme-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      state.memeTag = button.dataset.memeTag;
      render();
    });
  });
  document.querySelector(".search-row input")?.addEventListener("input", (event) => {
    state.memeSearch = event.target.value;
    render();
    document.querySelector(".search-row input")?.focus();
  });
}

window.setSappyWallet = hydrateWallet;
render();
