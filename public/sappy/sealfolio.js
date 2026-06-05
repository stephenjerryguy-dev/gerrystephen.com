/* ============ sealfolio.js — profile page (X connect lives here) ============ */
(function () {
  const S = window.Sappy;
  const qs = new URLSearchParams(location.search);
  const handle = qs.get("u") || "sappyseal_holder";
  const urlWallet = qs.get("wallet") || "";
  const urlPfp = qs.get("pfp") || "";
  const urlXHandle = cleanXHandle(qs.get("x") || (/^@/.test(handle) ? handle : ""));
  const seedNum = parseInt(qs.get("seed") || "0", 10) || hashStr(handle);

  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = rng(seedNum);
  const pick = (n) => Math.floor(rnd() * n);

  const TRAITS = ["Orange BG", "Cloudy", "Poorple", "Black Tee", "Yellow Bomber", "Green Scarf", "Beanie", "Shades", "Durag", "Mushroom", "Pumpkin Head", "Halo", "Party Hat", "Skeleton"];
  const VIBES = ["ARF ARF", "Sappy on X", "Diamond Flippers", "Pod Leader", "Cold Water Club", "Sealmaxi"];
  const RANKS = ["New Collector", "Seal Enjoyer", "Pod Member", "Legendary Collector", "Seal Whale"];
  const CONTRACTS = {
    seals: "0x364c828ee171616a39897688a831c2499ad972ec",
    staked: "0x1c70d0a86475cc707b48aa79f112857e7957274f",
    pixseals: "0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b",
    omniaPets: "0x4e76c23fe2a4e37b5e07b5625e17098baab86c18",
    omniaItems: "0xf0ea56402b2e2b27556d7abf4236c7327722fe41",
    key: "0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667",
    artifacts: "0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a",
  };
  const MEDIA = {
    seals: "https://dweb.link/ipfs/QmUs4WQP47QKGwzPLjVMmhqTbspJfAC344abDEE2UT52HF",
    pixseals: "https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4",
    key: "https://gold-ready-vicuna-5.mypinata.cloud/ipfs/QmUYJi27E6p9f4BpvqEijtEe2kKyztqrtcEwr7iM3RAqLi/KeyGIF.gif",
    omniaItems: "https://dweb.link/ipfs/QmZbN8LpJe6aRdey277wx5SvsyVTom8AS9FzKMmJYFDtdh",
    artifact: "https://i2c.seadn.io/ethereum/0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a/8f01708a2265650570c246d98b7f4f21.png",
    artifactHtml93: "https://ipfs2.seadn.io/ipfs/bafybeia3j3pdbydo4ensqryfs6e2fq7oji6tywjto3uokbtw7je5vo2lpe/93.html",
    omnia: "/sappy/assets/omnia-logo.png",
  };
  const EMOJI_PACKS = {
    exclusive: "https://t.me/addemoji/SappySsemoji",
    easy: "https://t.me/addemoji/SappySealsEmojis2",
  };
  const BADGE_CATALOG = [
    { n: "OG Seal", kind: "holding", test: (ctx) => ctx.hasSeal, tier: "exclusive", icon: "seal", accent: "blue" },
    { n: "Staker", kind: "holding", test: (ctx) => ctx.staked > 0, tier: "exclusive", icon: "diamond", accent: "green" },
    { n: "Omnia", kind: "holding", test: (ctx) => ctx.has("omnia"), tier: "easy", icon: "globe", accent: "aqua" },
    { n: "Pixseal", kind: "holding", test: (ctx) => ctx.has("pixseal"), tier: "easy", icon: "palette", accent: "pink" },
    { n: "Artifact", kind: "holding", test: (ctx) => ctx.has("artifact"), tier: "exclusive", icon: "bitcoin", accent: "gold" },
    { n: "Key Holder", kind: "holding", test: (ctx) => ctx.has("key") || ctx.has("faithful"), tier: "exclusive", icon: "key", accent: "violet" },
    { n: "Whale (15)", kind: "discord", tier: "exclusive", icon: "whale", accent: "blue" },
    { n: "Baby Whale (5)", kind: "discord", tier: "exclusive", icon: "baby-whale", accent: "aqua" },
    { n: "Seal (1)", kind: "discord", tier: "easy", icon: "seal", accent: "green" },
    { n: "Omnia Pet Master (50)", kind: "discord", tier: "exclusive", icon: "crown", accent: "gold" },
    { n: "Omnia Pet (1)", kind: "discord", tier: "easy", icon: "pet", accent: "aqua" },
    { n: "Founders Pass Holder", kind: "discord", tier: "exclusive", icon: "pass", accent: "violet" },
    { n: "BTC Digital Artifact Holder", kind: "discord", tier: "exclusive", icon: "bitcoin", accent: "gold" },
    { n: "Sealuminati Holder", kind: "discord", tier: "exclusive", icon: "allseeing", accent: "violet" },
    { n: "Member", kind: "discord", tier: "easy", icon: "member", accent: "green" },
    { n: "Shill Sergeant", kind: "discord", tier: "easy", icon: "megaphone", accent: "blue" },
    { n: "Whitelist Opportunities", kind: "discord", tier: "easy", icon: "list", accent: "gold" },
    { n: "Airdrops", kind: "discord", tier: "easy", icon: "drop", accent: "aqua" },
    { n: "Event Pings", kind: "discord", tier: "easy", icon: "bell", accent: "pink" },
    { n: "The Triple Scoop", kind: "discord", tier: "exclusive", icon: "scoop", accent: "pink" },
    { n: "Daily Mints", kind: "discord", tier: "easy", icon: "mint", accent: "green" },
    { n: "M Whale (15)", kind: "discord", tier: "exclusive", icon: "m-whale", accent: "blue" },
    { n: "M Baby Whale (5)", kind: "discord", tier: "exclusive", icon: "m-baby-whale", accent: "aqua" },
    { n: "Omnia Pet Trainer (5)", kind: "discord", tier: "easy", icon: "trainer", accent: "green" },
    { n: "Omnia Pet Maxi (15)", kind: "discord", tier: "exclusive", icon: "maxi", accent: "violet" },
    { n: "Omnia Pet Sensei (25)", kind: "discord", tier: "exclusive", icon: "sensei", accent: "gold" },
    { n: "1M Pixl Holder", kind: "discord", tier: "exclusive", icon: "pixl", accent: "pink" },
    { n: "Beater", kind: "discord", tier: "easy", icon: "bat", accent: "blue" },
  ];

  const state = {
    address: "",
    connectedAddress: "",
    profileWallet: /^0x[a-fA-F0-9]{40}$/.test(urlWallet) ? urlWallet : "",
    nfts: null,
    delegatedWallets: [],
    pixlBalance: 0,
    loading: false,
    error: "",
    profile: loadLocalProfile(),
  };
  const isLocal = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const vibe = VIBES[pick(VIBES.length)];
  let walletShort = "Connect wallet";

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatPixl(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
    return Math.round(n).toLocaleString("en-US");
  }

  function cleanXHandle(value) {
    const cleaned = String(value || "").trim().replace(/^@/, "");
    return /^[A-Za-z0-9_]{1,15}$/.test(cleaned) ? cleaned : "";
  }

  function loadLocalProfile(target = urlWallet || handle) {
    try {
      const key = localProfileKey(target);
      const profiles = JSON.parse(localStorage.getItem("sappy_profiles_v1") || "{}");
      const walletProfile = profiles && typeof profiles === "object" ? profiles[key] : null;
      const legacy = JSON.parse(localStorage.getItem("sappy_profile") || "{}");
      return walletProfile && typeof walletProfile === "object"
        ? walletProfile
        : (key.startsWith("wallet:") ? {} : (legacy && typeof legacy === "object" ? legacy : {}));
    } catch (_) {
      return {};
    }
  }

  function saveLocalProfile(next) {
    state.profile = { ...state.profile, ...next, updatedAt: Date.now() };
    try {
      const wallet = state.profileWallet || state.connectedAddress || state.address || urlWallet || handle;
      const key = localProfileKey(wallet);
      const profiles = JSON.parse(localStorage.getItem("sappy_profiles_v1") || "{}");
      profiles[key] = state.profile;
      localStorage.setItem("sappy_profiles_v1", JSON.stringify(profiles));
      localStorage.setItem("sappy_profile", JSON.stringify(state.profile));
    } catch (_) {}
    return state.profile;
  }

  function localProfileKey(value) {
    const raw = String(value || "").trim().toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(raw) ? `wallet:${raw}` : `handle:${raw.replace(/^@/, "") || "sappyseal_holder"}`;
  }

  function reloadLocalProfileFor(wallet) {
    state.profile = loadLocalProfile(wallet || state.profileWallet || state.connectedAddress || state.address || handle);
  }

  async function fetchProfileApi(path, options = {}) {
    const endpoints = [path];
    if (isLocal) endpoints.push(`https://www.gerrystephen.com${path}`);
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          ...options,
          headers: { accept: "application/json", ...(options.headers || {}) },
        });
        const type = response.headers.get("content-type") || "";
        if (!type.includes("application/json")) continue;
        const json = await response.json();
        if (!response.ok) return { ...json, status: response.status };
        return json;
      } catch (_) {}
    }
    return null;
  }

  function dynamicAuthToken() {
    try {
      return window.sappyGetDynamicAuthToken?.() || window.sappyDynamicAuthToken || "";
    } catch (_) {
      return "";
    }
  }

  async function loadRemoteProfile(wallet) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet || "")) return;
    const data = await fetchProfileApi(`/api/sappy-profile?wallet=${encodeURIComponent(wallet)}`);
    if (!data?.profile) return;
    state.profile = { ...state.profile, ...data.profile };
    try {
      const key = localProfileKey(wallet);
      const profiles = JSON.parse(localStorage.getItem("sappy_profiles_v1") || "{}");
      profiles[key] = state.profile;
      localStorage.setItem("sappy_profiles_v1", JSON.stringify(profiles));
      localStorage.setItem("sappy_profile", JSON.stringify(state.profile));
    } catch (_) {}
    render();
  }

  async function persistRemoteProfile(profile) {
    const wallet = profile?.claimedWallet || state.profileWallet || state.connectedAddress || state.address;
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet || "")) return;
    const payload = { ...profile, wallet, claimedWallet: wallet };
    const token = dynamicAuthToken();
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const data = await fetchProfileApi("/api/sappy-profile", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (data?.profile) {
      state.profile = { ...state.profile, ...data.profile };
      return true;
    }
    if (data?.error === "wallet_mismatch") S.toast("Connect and sign with the matching wallet before saving this Sealfolio.");
    else if (data?.error) S.toast("Sign with Dynamic before saving your Sealfolio.");
    return false;
  }

  function markProfileClaimed(owned) {
    const wallet = state.profileWallet || state.connectedAddress || state.address;
    const walletMatchesProfile = Boolean(state.connectedAddress && (!state.profileWallet || state.connectedAddress.toLowerCase() === state.profileWallet.toLowerCase()));
    if (!walletMatchesProfile || !owned?.length) return;
    saveLocalProfile({
      claimed: true,
      verified: Boolean(state.profile.verified || urlPfp),
      claimedWallet: wallet,
      claimedAt: state.profile.claimedAt || Date.now(),
      xHandle: cleanXHandle(state.profile.xHandle || urlXHandle),
      pfp: state.profile.pfp || urlPfp || firstProfileImage(owned),
    });
    persistRemoteProfile(state.profile);
  }

  const COLLECTION_CACHE_MS = 10 * 60 * 1000;

  function collectionCacheKey(address) {
    return `sappy_collection_${String(address || "").toLowerCase()}`;
  }

  function applyCollectionData(data) {
    state.nfts = Array.isArray(data?.nfts) ? data.nfts : [];
    state.delegatedWallets = Array.isArray(data?.delegatedWallets) ? data.delegatedWallets : [];
    state.pixlBalance = Number(data?.pixlBalance || 0) || 0;
    markProfileClaimed(normalizeOwned());
  }

  function readCollectionCache(address) {
    try {
      const cached = JSON.parse(localStorage.getItem(collectionCacheKey(address)) || "null");
      if (!cached || !Array.isArray(cached.nfts)) return null;
      if (Date.now() - Number(cached.cachedAt || 0) > COLLECTION_CACHE_MS) return null;
      return cached;
    } catch (_) {
      return null;
    }
  }

  function writeCollectionCache(address, data) {
    try {
      localStorage.setItem(collectionCacheKey(address), JSON.stringify({ ...data, cachedAt: Date.now() }));
    } catch (_) {}
  }

  function contractType(contract) {
    const c = String(contract || "").toLowerCase();
    if (c === CONTRACTS.seals || c === CONTRACTS.staked) return "seal";
    if (c === CONTRACTS.pixseals) return "pixseal";
    if (c === CONTRACTS.omniaPets) return "omnia-pet";
    if (c === CONTRACTS.omniaItems) return "omnia-item";
    if (c === CONTRACTS.key) return "sappy-key";
    if (c === CONTRACTS.artifacts) return "artifact";
    return "asset";
  }

  function isDigitalArtifactAsset(o) {
    const haystack = `${o?.collection || ""} ${o?.name || ""} ${o?.contract || ""} ${o?.chain || ""}`.toLowerCase();
    return contractType(o?.contract) === "artifact"
      || (haystack.includes("digital artifact") && (haystack.includes("btc") || haystack.includes("bitcoin") || haystack.includes("ordinal") || haystack.includes("artifact")));
  }

  function artifactTokenId(o) {
    const raw = o?.id || o?.tokenId || o?.identifier || o?.token_id || "";
    const direct = String(raw || "").match(/\d+/)?.[0];
    if (direct) return direct;
    return `${o?.name || ""} ${o?.collection || ""}`.match(/(?:artifact|#)\s*#?\s*(\d+)/i)?.[1] || "";
  }

  function isSealAsset(o) {
    return contractType(o.contract) === "seal" || /sappy seal/i.test(`${o.collection || ""} ${o.name || ""}`);
  }

  function normalizeImage(value) {
    const raw = value || "";
    if (Array.isArray(raw)) return normalizeImage(raw[0]);
    if (typeof raw !== "string") return "";
    const converted = S.ipfsToHttp ? S.ipfsToHttp(raw) : raw;
    return Array.isArray(converted) ? converted[0] : converted;
  }

  function scoreBreakdown(owned, staked) {
    const counts = {
      seals: owned.filter((o) => isSealAsset(o)).length,
      staked,
      omnia: owned.filter((o) => contractType(o.contract).startsWith("omnia")).length,
      pixseals: owned.filter((o) => contractType(o.contract) === "pixseal").length,
      keys: owned.filter((o) => contractType(o.contract) === "sappy-key").length,
      artifacts: owned.filter((o) => isDigitalArtifactAsset(o)).length,
      delegates: state.delegatedWallets.length,
      pixl: Number(state.pixlBalance || 0),
      collections: new Set(owned.map((o) => o.collection).filter(Boolean)).size,
    };
    const steppedScore = (count, steps) => {
      let remaining = Math.max(0, Number(count || 0));
      let total = 0;
      steps.forEach(([limit, points]) => {
        if (!remaining) return;
        const take = limit === Infinity ? remaining : Math.min(remaining, limit);
        total += take * points;
        remaining -= take;
      });
      return Math.round(total);
    };
    const sealScore = counts.seals ? 140 + steppedScore(counts.seals, [[10, 30], [40, 15], [Infinity, 6]]) : 0;
    const stakedScore = counts.staked ? Math.round(Math.sqrt(counts.staked) * 42 + Math.min(counts.staked, 10) * 6) : 0;
    const keyScore = steppedScore(counts.keys, [[1, 55], [4, 25], [Infinity, 8]]);
    const artifactScore = steppedScore(counts.artifacts, [[1, 75], [4, 35], [Infinity, 12]]);
    const omniaScore = Math.round(Math.sqrt(counts.omnia) * 30 + Math.min(counts.omnia, 20) * 4);
    const pixsealScore = Math.round(Math.sqrt(counts.pixseals) * 24 + Math.min(counts.pixseals, 25) * 2);
    const pixlScore = counts.pixl > 0 ? Math.round(85 * Math.log10(1 + counts.pixl / 5_000)) : 0;
    const delegateScore = Math.min(70, counts.delegates * 35);
    const varietyScore = Math.min(150, counts.collections * 25);
    return {
      counts,
      parts: { sealScore, stakedScore, keyScore, artifactScore, omniaScore, pixsealScore, pixlScore, delegateScore, varietyScore },
      total: sealScore + stakedScore + keyScore + artifactScore + omniaScore + pixsealScore + pixlScore + delegateScore + varietyScore,
    };
  }

  function normalizeOwned() {
    if (!state.nfts) return [];
    const seen = new Set();
    return state.nfts.map((nft) => {
      const contract = nft.contract?.toLowerCase?.() || "";
      const artifact = isDigitalArtifactAsset(nft);
      const id = artifact ? artifactTokenId(nft) : (String(nft.tokenId || "").replace(/\D/g, "") || nft.tokenId || "");
      return {
        id,
        name: nft.name || `${nft.collection || "NFT"} #${id}`,
        trait: nft.collection || "Sappy ecosystem",
        collection: nft.collection || "Sappy ecosystem",
        image: normalizeImage(nft.image || nft.image_url || nft.display_image_url || nft.cached_image_url || nft.metadata?.image),
        animation: normalizeImage(nft.animationUrl || nft.animation_url || nft.display_animation_url || nft.metadata?.animation_url),
        href: nft.href,
        chain: nft.chain || "ethereum",
        wallet: nft.wallet,
        contract: artifact ? CONTRACTS.artifacts : contract,
        staked: contract === CONTRACTS.staked || /staked/i.test(`${nft.collection || ""} ${nft.name || ""}`),
      };
    }).filter((nft) => {
      const key = isDigitalArtifactAsset(nft)
        ? `digital-artifact:${nft.contract}:${artifactTokenId(nft) || nft.id || nft.href || nft.animation || nft.image || nft.name || "unknown"}`
        : (nft.contract === CONTRACTS.seals || nft.contract === CONTRACTS.staked)
        ? `sappy-seal:${nft.id}`
        : `${nft.contract}:${nft.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function scoreFor(owned) {
    if (state.nfts) return scoreBreakdown(owned, owned.filter((o) => o.staked).length).total;
    return 0;
  }

  function rankFor(score) {
    if (score >= 2200) return "Apex Seal";
    if (score >= 1500) return "Seal Whale";
    if (score >= 1000) return "Legendary Collector";
    if (score >= 650) return "Pod Member";
    if (score >= 250) return "Seal Enjoyer";
    return "New Collector";
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
      const discordMatch = badge.kind === "discord" && (roleNames.has(normalizeRole(badge.n))
        || (badge.n === "Sealuminati Holder" && has("sealuminati"))
        || (badge.n === "BTC Digital Artifact Holder" && owned.some(isDigitalArtifactAsset)));
      const have = badge.kind === "discord" ? discordMatch : badge.test(ctx);
      return { ...badge, have, role, discord: badge.kind === "discord" };
    }).filter((badge, index, badges) => badges.findIndex((item) => normalizeRole(item.n) === normalizeRole(badge.n)) === index);
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

  function xConnection(xHandle = "") {
    if (xHandle) return { connected: true, label: `@${xHandle}` };
    try {
      const raw = localStorage.getItem("sappy_x") || "";
      const handle = cleanXHandle(raw);
      return handle ? { connected: true, label: `@${handle}` } : { connected: false, label: "Not linked" };
    } catch (_) {
      return { connected: false, label: "Not linked" };
    }
  }

  function discordConnection() {
    try {
      const connected = JSON.parse(localStorage.getItem("sappy_discord") || "{}");
      const username = connected?.user?.username || connected?.user?.global_name || "";
      const roles = Array.isArray(connected?.roles) ? connected.roles : [];
      if (username || connected?.user?.id) {
        return {
          connected: true,
          rolesSynced: roles.length > 0,
          label: roles.length ? `${roles.length} holder role${roles.length === 1 ? "" : "s"} synced` : `Connected · ${username || "Discord"}`,
          note: roles.length ? "" : "Discord linked. Holder roles are based on wallet holdings.",
        };
      }
    } catch (_) {}
    return { connected: false, rolesSynced: false, label: "Not linked", note: "" };
  }

  function renderConnectPanel({ canClaim, canLinkSocials, statusCopy, xStatus, discordStatus }) {
    const walletConnected = Boolean(state.connectedAddress);
    const walletMatchesProfile = Boolean(state.connectedAddress && (!state.profileWallet || state.connectedAddress.toLowerCase() === state.profileWallet.toLowerCase()));
    return `<div class="folio-claim folio-claim-inline" id="claim">
      <div class="ct">
        <h3>${statusCopy[0]}</h3>
        <p>${statusCopy[1]}</p>
      </div>
      <div class="connection-status-grid">
        <div class="connection-status ${walletMatchesProfile ? "connected" : "pending"}">
          <span>Wallet</span><strong>${walletMatchesProfile ? `Connected · ${state.connectedAddress.slice(0, 6)}...${state.connectedAddress.slice(-4)}` : walletConnected ? "Connected wallet does not match" : "Connect matching wallet"}</strong>
        </div>
        <div class="connection-status ${xStatus.connected ? "connected" : "pending"}">
          <span>X</span><strong>${xStatus.connected ? `Connected · ${esc(xStatus.label)}` : "Not linked"}</strong>
        </div>
        <div class="connection-status ${discordStatus.connected ? "connected" : "pending"}">
          <span>Discord</span><strong>${esc(discordStatus.label)}</strong>${discordStatus.note ? `<em>${esc(discordStatus.note)}</em>` : ""}
        </div>
      </div>
      <div class="folio-connect-actions">
        ${walletMatchesProfile ? `<button class="btn btn-ghost connected-btn" disabled>✓ Wallet connected</button>` : `<button class="btn btn-accent" data-connect>${state.profileWallet ? "Connect Matching Wallet" : "Connect Wallet"} →</button>`}
        ${canLinkSocials ? `
          ${xStatus.connected ? `<button class="btn btn-x connected-btn" disabled>✓ X connected</button>` : `<button class="btn btn-x" data-x-login>𝕏&nbsp; Link X</button>`}
          ${discordStatus.connected ? `<button class="btn btn-ghost connected-btn" data-discord-login><img class="btn-logo" src="https://cdn.simpleicons.org/discord/5865F2" alt="" aria-hidden="true"> Discord connected</button>` : `<button class="btn btn-ghost" data-discord-login><img class="btn-logo" src="https://cdn.simpleicons.org/discord/5865F2" alt="" aria-hidden="true"> Link Discord</button>`}
        ` : ""}
      </div>
    </div>`;
  }

  function renderTokenArt(o) {
    const type = contractType(o.contract);
    const id = String(o.id || "").replace(/\D/g, "") || o.id || "";
    const image = canonicalTokenImage(o);
    if (type === "artifact" || isDigitalArtifactAsset(o)) {
      const html = artifactHtmlUrl(o);
      if (html) {
        return `<div class="token-art token-art-html token-art-artifact" data-skip-hydrate="1">
          <iframe src="${html}" title="${esc(o.name || `Digital Artifact #${id}`)}" loading="lazy" sandbox="allow-scripts allow-pointer-lock allow-popups allow-popups-to-escape-sandbox"></iframe>
          <a class="artifact-open" href="${o.href || html}" target="_blank" rel="noopener">HTML NFT ↗</a>
        </div>`;
      }
      if (image) {
        return `<a class="token-art token-art-static token-art-artifact" data-skip-hydrate="1" href="${o.href || "#"}" target="_blank" rel="noopener">
          <img class="nft-photo show" src="${image}" alt="${esc(o.name || `Digital Artifact #${id}`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
          <span class="artifact-open">HTML NFT ↗</span>
        </a>`;
      }
    }
    if (image || o.animation) {
      return `<a class="token-art token-art-static token-art-${type}" data-skip-hydrate="1" href="${o.href || "#"}" target="_blank" rel="noopener">
        <img class="nft-photo show" src="${image || o.animation}" alt="${esc(o.name || `Sappy asset #${o.id}`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
      </a>`;
    }
    if (isSealAsset(o) && id) return `<div class="sealframe" data-pin="1" data-kind="seal" data-id="${id}" data-px="320"></div>`;
    if (o.contract && id) return `<div class="token-art token-art-missing token-art-${type}" data-skip-hydrate="1"><span>${esc(type.replace(/-/g, " ").toUpperCase())}<br>#${esc(id)}</span></div>`;
    if (Array.isArray(state.nfts)) {
      return `<div class="token-art token-art-missing token-art-${type}" data-skip-hydrate="1"><span>${esc(type.replace(/-/g, " ").toUpperCase())}<br>ART PENDING</span></div>`;
    }
    return `<div class="token-art token-art-missing token-art-${type}" data-skip-hydrate="1"><span>CONNECT<br>WALLET</span></div>`;
  }

  function canonicalTokenImage(o) {
    const type = contractType(o.contract);
    const id = String(o.id || "").replace(/\D/g, "") || "";
    if (type === "seal" && id) return `${MEDIA.seals}/${id}.png`;
    if (type === "pixseal" && id) return `${MEDIA.pixseals}/${id}.png`;
    if (type === "omnia-item" && id) return `${MEDIA.omniaItems}/${id}.png`;
    if (type === "sappy-key") return MEDIA.key;
    if (type === "artifact" || isDigitalArtifactAsset(o)) {
      const media = normalizeImage(o.image || o.animation);
      return media && !/\.html(?:[?#]|$)/i.test(media) && !/digital-artifact-93\.jpg/i.test(media) ? media : MEDIA.artifact;
    }
    if (type === "omnia-pet") return normalizeImage(o.image || o.animation);
    return normalizeImage(o.image || o.animation);
  }

  function artifactHtmlUrl(o) {
    const id = String(o.id || "").replace(/\D/g, "") || "";
    const media = normalizeImage(o.animation || o.animationUrl || "");
    if (/\.html(?:[?#]|$)/i.test(media)) return media;
    return id === "93" ? MEDIA.artifactHtml93 : "";
  }

  function render() {
    const owned = normalizeOwned();
    const staked = owned.filter((o) => o.staked).length;
    const badges = badgesFor(owned, staked);
    const profileAsset = firstProfileAsset(owned);
    const profileImage = normalizeImage(state.profile.pfp || urlPfp || profileAsset?.image || "");
    if (profileImage) preloadProfileImage(profileImage);
    const isReal = Array.isArray(state.nfts);
    const hasProfile = isReal && owned.length > 0;
    const targetWallet = state.profileWallet || state.connectedAddress || state.address;
    const walletMatchesProfile = Boolean(state.connectedAddress && (!state.profileWallet || state.connectedAddress.toLowerCase() === state.profileWallet.toLowerCase()));
    const canClaim = hasProfile && walletMatchesProfile;
    const claimedWallet = String(state.profile.claimedWallet || "").toLowerCase();
    const targetWalletLower = String(targetWallet || "").toLowerCase();
    const isClaimed = Boolean(state.profile.claimed && (!claimedWallet || !targetWalletLower || claimedWallet === targetWalletLower));
    const isVerifiedProfile = Boolean(state.profile.verified || state.profile.claimed || urlPfp);
    const canLinkSocials = Boolean(canClaim);
    const score = hasProfile ? scoreFor(owned) : 0;
    const breakdown = scoreBreakdown(owned, staked);
    const displayName = state.profile.displayName || handle;
    const xHandle = cleanXHandle(state.profile.xHandle || urlXHandle);
    const xStatus = xConnection(xHandle);
    const discordStatus = discordConnection();
    const bio = state.profile.bio || "";
    const rank = hasProfile ? rankFor(score) : "Unclaimed";
    const statusCopy = state.loading
      ? ["Syncing your wallet.", "Pulling Sappy Seals, staked Seals, Pixseals, Omnia items, keys and artifacts from the covered contracts."]
      : isReal
        ? [
          canClaim ? (isClaimed ? "Sealfolio claimed." : "Sealfolio ready to claim.") : "Viewing a holder Sealfolio.",
          canClaim
            ? (state.delegatedWallets.length ? `Wallet verified. Includes ${state.delegatedWallets.length} Delegate.xyz vault${state.delegatedWallets.length === 1 ? "" : "s"}. Your claimed profile, bio and PFP sync through Vercel storage.` : "Wallet verified. Your claimed profile, bio and PFP sync through Vercel storage.")
            : state.profileWallet ? "Connect and sign with the matching wallet to claim or edit this profile." : `${owned.length} ecosystem asset${owned.length === 1 ? "" : "s"} found.`
        ]
        : ["Create your Sealfolio.", "Connect and sign with Dynamic to build your real Sappy identity from wallet holdings, Delegate.xyz vaults and linked socials."];
    document.getElementById("folio").innerHTML = `
      <a class="folio-back" href="/sappy/community">← Back to the Pod</a>
      <div class="folio-hero">
        <div class="folio-pfp sealframe ${profileImage || profileAsset ? "" : "folio-pfp-empty"} ${isVerifiedProfile ? "verified-pfp" : ""}" data-pin="${!profileImage && profileAsset ? "1" : "0"}" data-kind="${!profileImage && profileAsset ? "seal" : "none"}" data-id="${profileAsset ? profileAsset.id : ""}" data-px="300">
          ${profileImage ? `<img class="seal-photo show" src="${profileImage}" alt="${esc(displayName)} profile picture" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer">` : ""}
          ${!profileImage && !profileAsset ? `<img class="seal-photo show" src="/sappy/assets/sappy-seal-emoji.webp" alt="Sappy Sealfolio" loading="eager" decoding="async" fetchpriority="high">` : ""}
        </div>
        <div class="folio-id">
          <div class="name">${esc(displayName)}</div>
          <div class="wallet" id="folio-wallet">${targetWallet ? `${targetWallet.slice(0, 6)}...${targetWallet.slice(-4)}` : walletShort}</div>
          ${bio ? `<p class="folio-bio">${esc(bio)}</p>` : ""}
          <div class="folio-chips">
            <span class="chip vibe">Vibe · ${vibe}</span>
            <span class="chip pixl">BITS pending</span>
            ${xHandle ? `<a class="chip xh" href="https://x.com/${xHandle}" target="_blank" rel="noopener">𝕏 @${xHandle}</a>` : ""}
            ${canClaim ? `<span class="chip verified">${isClaimed ? "Claimed" : "Wallet verified"}</span>` : ""}
          </div>
          <details class="folio-edit folio-profile-edit" ${canClaim ? (isClaimed ? "" : "open") : "open"}>
            <summary>${canClaim ? "Edit profile" : "Claim or connect"}</summary>
            ${renderConnectPanel({ canClaim, canLinkSocials, statusCopy, xStatus, discordStatus })}
            ${canClaim ? `
            <div class="profile-edit-grid">
              <label>Display name<input class="input" id="profile-name" value="${esc(displayName)}" maxlength="40"></label>
              <label>Bio<textarea class="input" id="profile-bio" maxlength="180" placeholder="Add a short Sappy bio...">${esc(bio)}</textarea></label>
              <label class="pfp-upload">Profile picture
                <input class="input file-input" id="profile-pfp-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                <span class="pfp-upload-copy">Upload from your device. Leaving it empty keeps the current PFP.</span>
              </label>
            </div>
            <button class="btn btn-ghost" data-save-profile>Save Profile</button>
            ` : ""}
          </details>
        </div>
        <div class="score-card">
          <div class="s">${score}</div>
          <div class="l">COLLECTOR SCORE</div>
          <div class="r">${rank}</div>
        </div>
      </div>

      <div class="folio-statrow">
        <div class="fstat"><div class="v">${owned.length}</div><div class="k">Assets found</div></div>
        <div class="fstat"><div class="v">${new Set(owned.map((o) => o.collection)).size}</div><div class="k">Collections</div></div>
        <div class="fstat"><div class="v">${badges.filter(b=>b.have).length}</div><div class="k">Badges</div></div>
        <div class="fstat"><div class="v">${staked}</div><div class="k">Staked</div></div>
        <div class="fstat"><div class="v">${score}</div><div class="k">Score</div></div>
        <div class="fstat"><div class="v">${formatPixl(state.pixlBalance)}</div><div class="k">$PIXL</div></div>
      </div>
      ${hasProfile ? `<div class="score-explain">Score curve: seals ${breakdown.parts.sealScore}, staked ${breakdown.parts.stakedScore}, keys ${breakdown.parts.keyScore}, artifacts ${breakdown.parts.artifactScore}, Omnia ${breakdown.parts.omniaScore}, Pixseals ${breakdown.parts.pixsealScore}, $PIXL ${breakdown.parts.pixlScore}, Delegate.xyz ${breakdown.parts.delegateScore}, collection variety ${breakdown.parts.varietyScore}. $PIXL counts toward score, but it is not counted as an NFT asset.</div>` : ""}

      <div class="folio-sec">
        <h2>${hasProfile ? "Claim your Sealfolio" : "Create your Sealfolio"}</h2>
        ${state.loading ? '<div class="folio-loading">Loading connected wallet collection...</div>' : ""}
        ${isReal && !owned.length ? '<div class="folio-loading">No covered Sappy ecosystem NFTs were found in this wallet yet. If they are in a delegated vault, make sure Delegate.xyz points to this wallet.</div>' : ""}
        ${!isReal && !state.loading ? `<div class="folio-empty-create">
          <h3>Your Sealfolio is waiting.</h3>
          <p>Connect your wallet to create it. Once your Sappy ecosystem holdings are found, this becomes a claimable profile.</p>
          <button class="btn btn-accent" data-connect>Connect Wallet →</button>
        </div>` : ""}
        ${owned.length ? `<div class="seal-grid">${owned.map((o) => `
          <div class="seal-card">
            ${renderTokenArt(o)}
            <div class="cap">
              <div class="n">${o.name || `Sappy Seal #${o.id}`}</div>
              <div class="t">${o.trait}</div>
              ${o.wallet ? `<div class="t">${o.wallet}</div>` : ""}
              ${o.staked ? '<span class="staked">⛓ STAKED · BITS PENDING</span>' : ""}
            </div>
          </div>`).join("")}</div>` : ""}
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
        <h2>Badges & Holder Roles</h2>
        <p class="badge-note">All Sappy badge slots are shown. Holding badges unlock from the connected wallet; holder roles unlock after the matching connected role comes through.</p>
        <div class="badge-grid">${badges.map((b) => `
          <div class="badge ${b.have ? "" : "locked"} ${b.discord ? "discord-role" : ""} ${b.tier === "exclusive" ? "exclusive-role" : "easy-role"} accent-${b.accent || "blue"}">
            <a class="bi badge-sticker emoji-badge" href="${EMOJI_PACKS[b.tier || "easy"]}" target="_blank" rel="noopener" aria-label="Open ${b.tier === "exclusive" ? "Sappy Originals" : "Sappy Seals Emojis 2"} emoji set">
              ${renderSticker(b)}
              ${b.role ? `<span class="role-dot" style="background:${b.role.color || "#5865F2"}"></span>` : ""}
            </a>
            <div class="bn">${b.n}</div>
            <div class="bt">${b.discord ? "Holder role" : "Holding badge"}</div>
          </div>`).join("")}</div>
      </div>

      <div class="folio-sec" style="text-align:center;padding:30px 0 6px;color:var(--ink-soft);font-style:italic;">
        “Collect what you love. Stay sappy.” — ${handle}
      </div>`;
    wireFolioActions();
    if (window.__sappyHydrate) window.__sappyHydrate(document.getElementById("folio"));
  }

  function stickerVariant(badge) {
    const key = hashStr(`${badge.n}:${badge.icon || ""}`) % 6;
    if (badge.tier === "exclusive") return ["video", "seal-video", "a"][key % 3];
    return ["b", "seal-static", "a", "seal-video"][key % 4];
  }

  function renderSticker(badge) {
    const variant = stickerVariant(badge);
    if (variant === "video") {
      return `<video class="role-sticker-media role-sticker-video" autoplay muted loop playsinline poster="/sappy/assets/stickers/sappy-role-a.webp" aria-hidden="true">
        <source src="/sappy/assets/stickers/sappy-role-animated.webm" type="video/webm">
      </video><span class="emoji-face icon-${badge.icon || "seal"}" aria-hidden="true"></span>`;
    }
    if (variant === "seal-video") {
      return `<video class="role-sticker-media role-sticker-video role-sticker-seal" autoplay muted loop playsinline poster="/sappy/assets/sappy-seal-emoji.webp" aria-hidden="true">
        <source src="/sappy/assets/sappy-seal-emoji.webm" type="video/webm">
      </video><span class="emoji-face icon-${badge.icon || "seal"}" aria-hidden="true"></span>`;
    }
    if (variant === "seal-static") {
      return `<img class="role-sticker-media role-sticker-seal" src="/sappy/assets/sappy-seal-emoji.webp" alt="" aria-hidden="true" loading="lazy"><span class="emoji-face icon-${badge.icon || "seal"}" aria-hidden="true"></span>`;
    }
    return `<img class="role-sticker-media" src="/sappy/assets/stickers/sappy-role-${variant}.webp" alt="" aria-hidden="true" loading="lazy"><span class="emoji-face icon-${badge.icon || "seal"}" aria-hidden="true"></span>`;
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
    state.connectedAddress = detail.address;
    state.address = state.profileWallet || detail.address;
    reloadLocalProfileFor(state.profileWallet || detail.address);
    try {
      localStorage.setItem("sappy_wallet", JSON.stringify({ address: detail.address, label, connectedAt: Date.now() }));
      localStorage.setItem("sappy_wallet_label", label);
    } catch (_) {}
    const loadAddress = state.profileWallet || detail.address;
    loadRemoteProfile(loadAddress);
    loadWalletCollection(loadAddress);
  }

  async function loadWalletCollection(address) {
    if (!address || state.loading) return;
    state.address = address;
    const cached = readCollectionCache(address);
    if (cached) {
      applyCollectionData(cached);
      state.loading = false;
      state.error = "";
      render();
    } else {
      state.loading = true;
      state.error = "";
      render();
    }
    try {
      const path = `/api/nfts?wallet=${encodeURIComponent(address)}`;
      const endpoints = [path];
      if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) endpoints.push(`https://www.gerrystephen.com${path}`);
      let data = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { cache: "no-store", headers: { accept: "application/json" } });
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
      applyCollectionData(data);
      writeCollectionCache(address, data);
    } catch (e) {
      state.error = "collection_sync_failed";
      if (!cached) {
        state.nfts = [];
        state.pixlBalance = 0;
      }
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
    document.querySelectorAll("[data-connect]").forEach((button) => {
      if (button.dataset.folioWired) return;
      button.dataset.folioWired = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        S.walletModal();
      });
    });
    document.querySelectorAll("[data-save-profile]").forEach((button) => {
      if (button.dataset.wired) return;
      button.dataset.wired = "1";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const uploadedPfp = await readPfpUpload(document.getElementById("profile-pfp-file"));
        const saved = saveLocalProfile({
          displayName: document.getElementById("profile-name")?.value?.trim() || handle,
          bio: document.getElementById("profile-bio")?.value?.trim() || "",
          pfp: uploadedPfp || state.profile.pfp || urlPfp || firstProfileImage(),
          pfpSource: uploadedPfp ? "upload" : (state.profile.pfpSource || "verified"),
          claimed: true,
          verified: Boolean(state.profile.verified || state.profile.claimed || urlPfp),
          claimedWallet: state.profileWallet || state.connectedAddress || state.address,
          claimedAt: state.profile.claimedAt || Date.now(),
        });
        const remoteSaved = await persistRemoteProfile(saved);
        S.toast(remoteSaved ? "Sealfolio profile saved." : "Profile saved locally. Sign with the matching wallet to sync it.");
        render();
      });
    });
  }

  function readPfpUpload(input) {
    const file = input?.files?.[0];
    if (!file) return Promise.resolve("");
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type || "")) {
      S.toast("Use a PNG, JPG, WebP or GIF for your PFP.");
      return Promise.resolve("");
    }
    if (file.size > 1_500_000) {
      S.toast("PFP upload is too large. Try an image under 1.5 MB.");
      return Promise.resolve("");
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resizeProfileImage(typeof reader.result === "string" ? reader.result : "").then(resolve);
      reader.onerror = () => {
        S.toast("Could not read that image.");
        resolve("");
      };
      reader.readAsDataURL(file);
    });
  }

  function resizeProfileImage(dataUrl) {
    if (!dataUrl) return Promise.resolve("");
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const size = 420;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl.slice(0, 320000));
        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        ctx.fillStyle = "#fffaf0";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        resolve(canvas.toDataURL("image/webp", 0.84).slice(0, 320000));
      };
      image.onerror = () => resolve(dataUrl.slice(0, 320000));
      image.src = dataUrl;
    });
  }

  function firstProfileImage(owned = normalizeOwned()) {
    const asset = firstProfileAsset(owned);
    return asset?.image || "/sappy/assets/sappy-seal-emoji.webp";
  }

  function firstProfileAsset(owned = normalizeOwned()) {
    return owned.find((o) => isSealAsset(o) && o.image)
      || owned.find((o) => isSealAsset(o) && o.id)
      || null;
  }

  function preloadProfileImage(src) {
    if (!src || document.querySelector(`link[data-sappy-pfp="${CSS.escape(src)}"]`)) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    link.fetchPriority = "high";
    link.dataset.sappyPfp = src;
    document.head.appendChild(link);
  }

  S.ready(function () {
    window.SappyLayout.mount("community");
    render();
    S.init();
    animateBits();
    window.addEventListener("sappy-wallet-connected", (event) => syncWalletLabel(event.detail));
    if (state.profileWallet) {
      loadRemoteProfile(state.profileWallet);
      loadWalletCollection(state.profileWallet);
    }
  });
})();
