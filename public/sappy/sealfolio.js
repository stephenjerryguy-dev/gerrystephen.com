/* ============ sealfolio.js — profile page (X connect lives here) ============ */
(function () {
  const S = window.Sappy;
  const qs = new URLSearchParams(location.search);
  const handle = qs.get("u") || "sappyseal_holder";
  const urlWallet = qs.get("wallet") || "";
  const urlPfp = qs.get("pfp") || "";
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
    pixseals: "0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b",
    omniaPets: "0x4e76c23fe2a4e37b5e07b5625e17098baab86c18",
    omniaItems: "0xf0ea56402b2e2b27556d7abf4236c7327722fe41",
    key: "0x3d3ad7b00e885d3d969e03bfcbaed80fb3df6667",
    artifacts: "0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a",
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
    loading: false,
    error: "",
    profile: loadLocalProfile(),
  };
  const vibe = VIBES[pick(VIBES.length)];
  let walletShort = "Connect wallet";

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadLocalProfile() {
    try {
      const profile = JSON.parse(localStorage.getItem("sappy_profile") || "{}");
      return profile && typeof profile === "object" ? profile : {};
    } catch (_) {
      return {};
    }
  }

  function saveLocalProfile(next) {
    state.profile = { ...state.profile, ...next, updatedAt: Date.now() };
    try { localStorage.setItem("sappy_profile", JSON.stringify(state.profile)); } catch (_) {}
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
      artifacts: owned.filter((o) => contractType(o.contract) === "artifact").length,
      delegates: state.delegatedWallets.length,
      collections: new Set(owned.map((o) => o.collection).filter(Boolean)).size,
    };
    const sealScore = Math.min(420, counts.seals ? 120 + Math.max(0, Math.min(counts.seals, 5) - 1) * 30 + Math.max(0, counts.seals - 5) * 12 : 0);
    const stakedScore = Math.min(160, counts.staked * 35);
    const keyScore = Math.min(80, counts.keys * 35);
    const artifactScore = Math.min(80, counts.artifacts * 35);
    const omniaScore = Math.min(180, Math.round(Math.sqrt(counts.omnia) * 22));
    const pixsealScore = Math.min(90, Math.round(Math.sqrt(counts.pixseals) * 13));
    const delegateScore = Math.min(50, counts.delegates * 25);
    const varietyScore = Math.min(90, counts.collections * 15);
    return {
      counts,
      parts: { sealScore, stakedScore, keyScore, artifactScore, omniaScore, pixsealScore, delegateScore, varietyScore },
      total: Math.min(999, sealScore + stakedScore + keyScore + artifactScore + omniaScore + pixsealScore + delegateScore + varietyScore),
    };
  }

  function normalizeOwned() {
    if (!state.nfts) return [];
    return state.nfts.map((nft) => {
      const contract = nft.contract?.toLowerCase?.() || "";
      const id = String(nft.tokenId || "").replace(/\D/g, "") || nft.tokenId || "";
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
        contract,
        staked: contract === CONTRACTS.staked || /staked/i.test(`${nft.collection || ""} ${nft.name || ""}`),
      };
    });
  }

  function scoreFor(owned) {
    if (state.nfts) return scoreBreakdown(owned, owned.filter((o) => o.staked).length).total;
    return 0;
  }

  function rankFor(score) {
    if (score >= 850) return "Seal Whale";
    if (score >= 650) return "Legendary Collector";
    if (score >= 420) return "Pod Member";
    if (score >= 180) return "Seal Enjoyer";
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
      const discordMatch = badge.kind === "discord" && (roleNames.has(normalizeRole(badge.n)) || (badge.n === "Sealuminati Holder" && has("sealuminati")));
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

  function renderTokenArt(o) {
    const type = contractType(o.contract);
    const id = String(o.id || "").replace(/\D/g, "") || o.id || "";
    if (o.image || o.animation) {
      return `<a class="sealframe token-art" href="${o.href || "#"}" target="_blank" rel="noopener">
        <img class="seal-photo show" src="${o.image || o.animation}" alt="${esc(o.name || `Sappy asset #${o.id}`)}" loading="lazy" referrerpolicy="no-referrer">
      </a>`;
    }
    if (isSealAsset(o) && id) return `<div class="sealframe" data-pin="1" data-kind="seal" data-id="${id}" data-px="320"></div>`;
    if (o.contract && id) return `<div class="sealframe token-art token-art-fetch token-art-${type}" data-kind="${type}" data-contract="${esc(o.contract)}" data-chain="${o.chain === "matic" ? "polygon" : "eth"}" data-id="${esc(id)}" data-px="320"></div>`;
    if (Array.isArray(state.nfts)) {
      return `<div class="sealframe token-art token-art-missing token-art-${type}"><span>${esc(type.replace(/-/g, " ").toUpperCase())}<br>ART PENDING</span></div>`;
    }
    return `<div class="sealframe token-art token-art-missing token-art-${type}"><span>CONNECT<br>WALLET</span></div>`;
  }

  function render() {
    const owned = normalizeOwned();
    const staked = owned.filter((o) => o.staked).length;
    const badges = badgesFor(owned, staked);
    const profileAsset = firstProfileAsset(owned);
    const profileImage = normalizeImage(state.profile.pfp || urlPfp || profileAsset?.image || "");
    const isReal = Array.isArray(state.nfts);
    const hasProfile = isReal && owned.length > 0;
    const targetWallet = state.profileWallet || state.connectedAddress || state.address;
    const walletMatchesProfile = Boolean(state.connectedAddress && (!state.profileWallet || state.connectedAddress.toLowerCase() === state.profileWallet.toLowerCase()));
    const canClaim = hasProfile && walletMatchesProfile;
    const canLinkSocials = Boolean(canClaim);
    const score = hasProfile ? scoreFor(owned) : 0;
    const breakdown = scoreBreakdown(owned, staked);
    const displayName = state.profile.displayName || handle;
    const bio = state.profile.bio || "";
    const rank = hasProfile ? rankFor(score) : "Unclaimed";
    const statusCopy = state.loading
      ? ["Syncing your wallet.", "Pulling Sappy Seals, staked Seals, Pixseals, Omnia items, keys and artifacts from the covered contracts."]
      : isReal
        ? [
          canClaim ? "Sealfolio ready to claim." : "Viewing a holder Sealfolio.",
          canClaim
            ? (state.delegatedWallets.length ? `Wallet verified. Includes ${state.delegatedWallets.length} Delegate.xyz vault${state.delegatedWallets.length === 1 ? "" : "s"}.` : "Wallet verified. You can edit this profile and link socials.")
            : state.profileWallet ? "Connect and sign with the matching wallet to claim or edit this profile." : `${owned.length} ecosystem asset${owned.length === 1 ? "" : "s"} found.`
        ]
        : ["Create your Sealfolio.", "Connect and sign with Dynamic to build your real Sappy identity from wallet holdings, Delegate.xyz vaults and linked socials."];
    document.getElementById("folio").innerHTML = `
      <a class="folio-back" href="community.html">← Back to the Pod</a>
      <div class="folio-hero">
        <div class="folio-pfp sealframe ${profileImage || profileAsset ? "" : "folio-pfp-empty"} ${urlPfp ? "verified-pfp" : ""}" data-pin="${!profileImage && profileAsset ? "1" : "0"}" data-kind="${!profileImage && profileAsset ? "seal" : "none"}" data-id="${profileAsset ? profileAsset.id : ""}" data-px="300">
          ${profileImage ? `<img class="seal-photo show" src="${profileImage}" alt="${esc(displayName)} profile picture" referrerpolicy="no-referrer">` : ""}
          ${!profileImage && !profileAsset ? `<img class="seal-photo show" src="/sappy/assets/sappy-seal-emoji.webp" alt="Sappy Sealfolio">` : ""}
        </div>
        <div class="folio-id">
          <div class="name">${esc(displayName)}</div>
          <div class="wallet" id="folio-wallet">${targetWallet ? `${targetWallet.slice(0, 6)}...${targetWallet.slice(-4)}` : walletShort}</div>
          ${bio ? `<p class="folio-bio">${esc(bio)}</p>` : ""}
          <div class="folio-chips">
            <span class="chip vibe">Vibe · ${vibe}</span>
            <span class="chip pixl">BITS pending</span>
            <a class="chip xh" href="https://x.com/${handle.replace(/^@/, "")}" target="_blank" rel="noopener">𝕏 @${handle.replace(/^@/, "")}</a>
            ${canClaim ? `<span class="chip verified">Wallet verified</span>` : ""}
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
          ${canLinkSocials ? `
            <button class="btn btn-accent" data-connect>Connect Wallet</button>
            <button class="btn btn-x" data-x-login>𝕏&nbsp; Link X</button>
            <button class="btn btn-ghost" data-discord-login><img class="btn-logo" src="https://cdn.simpleicons.org/discord/5865F2" alt="" aria-hidden="true"> Link Discord</button>
          ` : `
            <button class="btn btn-accent" data-connect>${state.profileWallet ? "Connect Matching Wallet" : "Connect Wallet"} →</button>
          `}
        </div>
      </div>

      ${canClaim ? `<div class="folio-edit">
        <div>
          <label>Display name<input class="input" id="profile-name" value="${esc(displayName)}" maxlength="40"></label>
          <label>Bio<textarea class="input" id="profile-bio" maxlength="180" placeholder="Add a short Sappy bio...">${esc(bio)}</textarea></label>
        </div>
        <button class="btn btn-ghost" data-save-profile>Save Profile</button>
      </div>` : ""}

      <div class="folio-statrow">
        <div class="fstat"><div class="v">${owned.length}</div><div class="k">Assets found</div></div>
        <div class="fstat"><div class="v">${new Set(owned.map((o) => o.collection)).size}</div><div class="k">Collections</div></div>
        <div class="fstat"><div class="v">${badges.filter(b=>b.have).length}</div><div class="k">Badges</div></div>
        <div class="fstat"><div class="v">${staked}</div><div class="k">Staked</div></div>
        <div class="fstat"><div class="v">${score}</div><div class="k">Score</div></div>
      </div>
      ${hasProfile ? `<div class="score-explain">Score curve: seals ${breakdown.parts.sealScore}, staked ${breakdown.parts.stakedScore}, keys ${breakdown.parts.keyScore}, artifacts ${breakdown.parts.artifactScore}, Omnia ${breakdown.parts.omniaScore}, Pixseals ${breakdown.parts.pixsealScore}, Delegate.xyz ${breakdown.parts.delegateScore}, collection variety ${breakdown.parts.varietyScore}. Whale scores now require real depth, not just a long mixed asset list.</div>` : ""}

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
    try {
      localStorage.setItem("sappy_wallet", JSON.stringify({ address: detail.address, label, connectedAt: Date.now() }));
      localStorage.setItem("sappy_wallet_label", label);
    } catch (_) {}
    const loadAddress = state.profileWallet || detail.address;
    loadWalletCollection(loadAddress);
  }

  async function loadWalletCollection(address) {
    if (!address || state.loading) return;
    state.address = address;
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
      button.addEventListener("click", (event) => {
        event.preventDefault();
        saveLocalProfile({
          displayName: document.getElementById("profile-name")?.value?.trim() || handle,
          bio: document.getElementById("profile-bio")?.value?.trim() || "",
          pfp: firstProfileImage(),
        });
        S.toast("Sealfolio profile saved.");
        render();
      });
    });
  }

  function firstProfileImage() {
    const asset = firstProfileAsset(normalizeOwned());
    return asset?.image || "/sappy/assets/sappy-seal-emoji.webp";
  }

  function firstProfileAsset(owned = normalizeOwned()) {
    return owned.find((o) => isSealAsset(o) && o.image)
      || owned.find((o) => isSealAsset(o) && o.id)
      || null;
  }

  S.ready(function () {
    window.SappyLayout.mount("community");
    render();
    S.init();
    animateBits();
    window.addEventListener("sappy-wallet-connected", (event) => syncWalletLabel(event.detail));
    if (state.profileWallet) loadWalletCollection(state.profileWallet);
  });
})();
