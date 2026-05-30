/* ============ sealfolio.js — profile page (X connect lives here) ============ */
(function () {
  const S = window.Sappy;
  const qs = new URLSearchParams(location.search);
  const handle = qs.get("u") || "sappyseal_holder";
  const urlWallet = qs.get("wallet") || "";
  const seedNum = parseInt(qs.get("seed") || "0", 10) || hashStr(handle);

  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = rng(seedNum);
  const pick = (n) => Math.floor(rnd() * n);

  const TRAITS = ["Orange BG", "Cloudy", "Poorple", "Black Tee", "Yellow Bomber", "Green Scarf", "Beanie", "Shades", "Durag", "Mushroom", "Pumpkin Head", "Halo", "Party Hat", "Skeleton"];
  const VIBES = ["ARF ARF", "WAGBO", "Diamond Flippers", "Pod Leader", "Cold Water Club", "Sealmaxi"];
  const RANKS = ["New Collector", "Seal Enjoyer", "Pod Member", "Legendary Collector", "Seal Whale"];
  const CONTRACTS = {
    seals: "0x364c828ee171616a39897688a831c2499ad972ec",
    staked: "0x1c70d0a86475cc707b48aa79f112857e7957274f",
  };
  const BADGE_CATALOG = [
    { n: "OG Seal", kind: "holding", test: (ctx) => ctx.hasSeal, sticker: 1227 },
    { n: "Staker", kind: "holding", test: (ctx) => ctx.staked > 0, sticker: 7812 },
    { n: "Omnia", kind: "holding", test: (ctx) => ctx.has("omnia"), sticker: 7262 },
    { n: "Pixseal", kind: "holding", test: (ctx) => ctx.has("pixseal"), sticker: 525 },
    { n: "Artifact", kind: "holding", test: (ctx) => ctx.has("artifact"), sticker: 93 },
    { n: "Key Holder", kind: "holding", test: (ctx) => ctx.has("key") || ctx.has("faithful"), sticker: 404 },
    { n: "Whale (15)", kind: "discord", sticker: 1515 },
    { n: "Baby Whale (5)", kind: "discord", sticker: 505 },
    { n: "Seal (1)", kind: "discord", sticker: 101 },
    { n: "Omnia Pet Master (50)", kind: "discord", sticker: 5050 },
    { n: "Omnia Pet (1)", kind: "discord", sticker: 7263 },
    { n: "Founders Pass Holder", kind: "discord", sticker: 777 },
    { n: "BTC Digital Artifact Holder", kind: "discord", sticker: 93 },
    { n: "Member", kind: "discord", sticker: 2023 },
    { n: "Shill Sergeant", kind: "discord", sticker: 444 },
    { n: "Whitelist Opportunities", kind: "discord", sticker: 888 },
    { n: "Airdrops", kind: "discord", sticker: 1234 },
    { n: "Event Pings", kind: "discord", sticker: 999 },
    { n: "The Triple Scoop", kind: "discord", sticker: 333 },
    { n: "Daily Mints", kind: "discord", sticker: 1111 },
    { n: "M Whale (15)", kind: "discord", sticker: 1516 },
    { n: "M Baby Whale (5)", kind: "discord", sticker: 506 },
    { n: "Omnia Pet Trainer (5)", kind: "discord", sticker: 5005 },
    { n: "Omnia Pet Maxi (15)", kind: "discord", sticker: 1517 },
    { n: "Omnia Pet Sensei (25)", kind: "discord", sticker: 2525 },
    { n: "1M Pixl Holder", kind: "discord", sticker: 1000 },
    { n: "Beater", kind: "discord", sticker: 808 },
  ];

  const sampleOwned = [];
  const nOwned = 3 + pick(6);
  const used = new Set();
  for (let i = 0; i < nOwned; i++) {
    let id; do { id = pick(10000); } while (used.has(id)); used.add(id);
    sampleOwned.push({ id, trait: TRAITS[pick(TRAITS.length)], collection: "Sappy Seals", staked: rnd() > 0.5 });
  }
  const state = { address: "", nfts: null, delegatedWallets: [], loading: false, error: "" };
  const vibe = VIBES[pick(VIBES.length)];
  let walletShort = "Connect wallet";

  function normalizeOwned() {
    if (!state.nfts) return state.address ? [] : sampleOwned;
    return state.nfts.map((nft) => {
      const contract = nft.contract?.toLowerCase?.() || "";
      const id = String(nft.tokenId || "").replace(/\D/g, "") || nft.tokenId || "";
      return {
        id,
        name: nft.name || `${nft.collection || "NFT"} #${id}`,
        trait: nft.collection || "Sappy ecosystem",
        collection: nft.collection || "Sappy ecosystem",
        image: nft.image,
        href: nft.href,
        chain: nft.chain || "ethereum",
        wallet: nft.wallet,
        staked: contract === CONTRACTS.staked || /staked/i.test(`${nft.collection || ""} ${nft.name || ""}`),
      };
    });
  }

  function scoreFor(owned) {
    if (state.nfts) return Math.min(999, owned.length * 42 + owned.filter((o) => o.staked).length * 85 + state.delegatedWallets.length * 30);
    return 120 + pick(880);
  }

  function badgesFor(owned, staked) {
    const discord = discordRoles();
    const roleNames = new Set(discord.map((role) => normalizeRole(role.name)));
    const has = (needle) => owned.some((nft) => `${nft.collection} ${nft.name || ""}`.toLowerCase().includes(needle));
    const ctx = {
      staked,
      has,
      hasSeal: owned.some((nft) => /sappy seal/i.test(`${nft.collection} ${nft.name || ""}`)),
    };
    return BADGE_CATALOG.map((badge) => {
      const role = discord.find((item) => normalizeRole(item.name) === normalizeRole(badge.n));
      const have = badge.kind === "discord" ? roleNames.has(normalizeRole(badge.n)) : badge.test(ctx);
      return { ...badge, have, role, discord: badge.kind === "discord" };
    });
  }

  function normalizeRole(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function discordRoles() {
    try {
      const connected = JSON.parse(localStorage.getItem("sappy_discord") || "{}");
      return Array.isArray(connected.roles) ? connected.roles.slice(0, 18) : [];
    } catch (_) {
      return [];
    }
  }

  function renderTokenArt(o) {
    if (o.image) {
      return `<a class="sealframe token-art" href="${o.href || "#"}" target="_blank" rel="noopener">
        <img class="seal-photo show" src="${o.image}" alt="${o.name || `Sappy asset #${o.id}`}" loading="lazy" referrerpolicy="no-referrer">
      </a>`;
    }
    if (Array.isArray(state.nfts)) {
      return `<div class="sealframe token-art token-art-missing"><span>ART<br>PENDING</span></div>`;
    }
    return `<div class="sealframe" data-pin="1" data-kind="seal" data-id="${o.id}" data-px="320"></div>`;
  }

  function render() {
    const owned = normalizeOwned();
    const staked = owned.filter((o) => o.staked).length;
    const score = scoreFor(owned);
    const rank = RANKS[Math.min(RANKS.length - 1, Math.floor(score / 200))];
    const badges = badgesFor(owned, staked);
    const first = owned[0] || sampleOwned[0];
    const isReal = Array.isArray(state.nfts);
    const statusCopy = state.loading
      ? ["Syncing your wallet.", "Pulling Sappy Seals, staked Seals, Pixseals, Omnia items, keys and artifacts from the covered contracts."]
      : isReal
        ? [`${owned.length} ecosystem asset${owned.length === 1 ? "" : "s"} found.`, state.delegatedWallets.length ? `Includes ${state.delegatedWallets.length} Delegate.xyz vault${state.delegatedWallets.length === 1 ? "" : "s"}.` : "Direct wallet holdings shown."]
        : ["Connect your wallet.", "Your real Sappy ecosystem assets will replace this sample Sealfolio."];
    document.getElementById("folio").innerHTML = `
      <a class="folio-back" href="community.html">← Back to the Pod</a>
      <div class="folio-hero">
        <div class="folio-pfp sealframe" data-pin="1" data-kind="${first.image ? "none" : "seal"}" data-id="${first.id}" data-px="300">
          ${first.image ? `<img class="seal-photo show" src="${first.image}" alt="${first.name || "Sealfolio profile asset"}" referrerpolicy="no-referrer">` : ""}
        </div>
        <div class="folio-id">
          <div class="name">${handle}</div>
          <div class="wallet" id="folio-wallet">${walletShort}</div>
          <div class="folio-chips">
            <span class="chip vibe">Vibe · ${vibe}</span>
            <span class="chip pixl">BITS pending</span>
            <a class="chip xh" href="https://x.com/${handle.replace(/^@/, "")}" target="_blank" rel="noopener">𝕏 @${handle.replace(/^@/, "")}</a>
          </div>
        </div>
        <div class="score-card">
          <div class="s">${score}</div>
          <div class="l">COLLECTOR SCORE</div>
          <div class="r">${rank}</div>
        </div>
      </div>

      <div class="folio-claim" id="claim">
        <div class="ct">
          <h3>${statusCopy[0]}</h3>
          <p>${statusCopy[1]}</p>
        </div>
        <div class="folio-connect-actions">
          <button class="btn btn-x" data-x-login>𝕏&nbsp; Connect your X</button>
          <button class="btn btn-ghost" data-discord-login><img class="btn-logo" src="https://cdn.simpleicons.org/discord/5865F2" alt="" aria-hidden="true"> Connect Discord</button>
        </div>
      </div>

      <div class="folio-statrow">
        <div class="fstat"><div class="v">${owned.length}</div><div class="k">Assets found</div></div>
        <div class="fstat"><div class="v">${new Set(owned.map((o) => o.collection)).size}</div><div class="k">Collections</div></div>
        <div class="fstat"><div class="v">${badges.filter(b=>b.have).length}</div><div class="k">Badges</div></div>
        <div class="fstat"><div class="v">${staked}</div><div class="k">Staked</div></div>
        <div class="fstat"><div class="v">${score}</div><div class="k">Score</div></div>
      </div>

      <div class="folio-sec">
        <h2>${isReal ? "Your Sappy ecosystem" : `${handle}'s sample Seals`}</h2>
        ${state.loading ? '<div class="folio-loading">Loading connected wallet collection...</div>' : ""}
        ${isReal && !owned.length ? '<div class="folio-loading">No covered Sappy ecosystem NFTs were found in this wallet yet. If they are in a delegated vault, make sure Delegate.xyz points to this wallet.</div>' : ""}
        <div class="seal-grid">${owned.map((o) => `
          <div class="seal-card">
            ${renderTokenArt(o)}
            <div class="cap">
              <div class="n">${o.name || `Sappy Seal #${o.id}`}</div>
              <div class="t">${o.trait}</div>
              ${o.wallet ? `<div class="t">${o.wallet}</div>` : ""}
              ${o.staked ? '<span class="staked">⛓ STAKED · BITS PENDING</span>' : ""}
            </div>
          </div>`).join("")}</div>
      </div>

      <div class="folio-sec">
        <h2>BITS Status</h2>
        <div class="stake-card">
          <div>
            <div class="bits-label"><span class="live-dot"></span>▸ BITS REVEAL</div>
            <div class="pixl-bal bits-bal pending-bits"><span id="bits-count">PENDING</span></div>
            <div class="stake-bar pending"><i id="bits-bar" style="width:${staked ? 100 : 28}%"></i></div>
            <div class="stake-detail">${staked} staked seal${staked === 1 ? "" : "s"} detected · BITS are pending until Sappy Seals reveals them.</div>
          </div>
          <button class="btn btn-accent" disabled>Pending reveal</button>
        </div>
      </div>

      <div class="folio-sec">
        <h2>Badges & Discord Roles</h2>
        <p class="badge-note">All Sappy badge slots are shown. Holding badges unlock from the connected wallet; Discord roles unlock after the matching Discord role comes through.</p>
        <div class="badge-grid">${badges.map((b) => `
          <div class="badge ${b.have ? "" : "locked"} ${b.discord ? "discord-role" : ""}">
            <div class="bi badge-sticker sealframe" data-pin="1" data-kind="seal" data-id="${b.sticker}" data-px="96">
              ${b.role ? `<span class="role-dot" style="background:${b.role.color || "#5865F2"}"></span>` : ""}
            </div>
            <div class="bn">${b.n}</div>
            <div class="bt">${b.discord ? "Discord role" : "Holding badge"}</div>
          </div>`).join("")}</div>
      </div>

      <div class="folio-sec" style="text-align:center;padding:30px 0 6px;color:var(--ink-soft);font-style:italic;">
        “Collect what you love. Stay sappy.” — ${handle}
      </div>`;
    wireFolioActions();
    if (window.__sappyHydrate) window.__sappyHydrate(document.getElementById("folio"));
  }

  function animateBits() {
    const el = document.getElementById("bits-count");
    if (!el) return;
    el.textContent = "PENDING";
    el.setAttribute("aria-label", "BITS reveal pending");
  }

  function syncWalletLabel(detail) {
    if (!detail || !detail.address) return;
    const label = detail.label || (detail.address.slice(0, 6) + "..." + detail.address.slice(-4));
    const el = document.getElementById("folio-wallet");
    if (el) el.textContent = label;
    state.address = detail.address;
    try {
      localStorage.setItem("sappy_wallet", JSON.stringify({ address: detail.address, label, connectedAt: Date.now() }));
      localStorage.setItem("sappy_wallet_label", label);
    } catch (_) {}
    loadWalletCollection(detail.address);
  }

  async function loadWalletCollection(address) {
    if (!address || state.loading || state.address.toLowerCase() !== address.toLowerCase()) return;
    state.loading = true;
    state.error = "";
    render();
    try {
      const path = `/api/nfts?wallet=${encodeURIComponent(address)}`;
      const endpoints = [path];
      if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) endpoints.push(`https://www.gerrystephen.com${path}`);
      let data = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { headers: { accept: "application/json" } });
          const type = response.headers.get("content-type") || "";
          if (!response.ok || !type.includes("application/json")) continue;
          const json = await response.json();
          if (json && Array.isArray(json.nfts)) {
            data = json;
            break;
          }
        } catch (_) {}
      }
      data = data || { nfts: [] };
      state.nfts = Array.isArray(data.nfts) ? data.nfts : [];
      state.delegatedWallets = Array.isArray(data.delegatedWallets) ? data.delegatedWallets : [];
    } catch (e) {
      state.error = "collection_sync_failed";
      state.nfts = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  function wireFolioActions() {
    document.querySelectorAll("[data-x-login]").forEach((button) => {
      if (button.dataset.wired) return;
      button.dataset.wired = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        S.xModal();
      });
    });
    document.querySelectorAll("[data-discord-login]").forEach((button) => {
      if (button.dataset.wired) return;
      button.dataset.wired = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        S.discordLogin();
      });
    });
  }

  S.ready(function () {
    window.SappyLayout.mount("community");
    render();
    S.init();
    animateBits();
    window.addEventListener("sappy-wallet-connected", (event) => syncWalletLabel(event.detail));
    if (!state.address && /^0x[a-fA-F0-9]{40}$/.test(urlWallet)) syncWalletLabel({ address: urlWallet, label: `${urlWallet.slice(0, 6)}...${urlWallet.slice(-4)}` });
  });
})();
