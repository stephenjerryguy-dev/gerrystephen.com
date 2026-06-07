/* ============ community.js — the pod ============ */
(function () {
  const S = window.Sappy;
  const NAMES = ["wabdoteth", "diakou", "stormrdoteth", "DylanKentish", "lilstovetop", "pixlpilled", "arfarf", "sealmaxi", "coldwater", "blubber", "icefloe", "frostbite", "sappykorea", "norekme", "sealchemist", "podfather"];
  const VIBES = ["ARF ARF", "Sappy on X", "Diamond Flipper", "Pod Leader", "New Collector", "Staker", "Whale", "Cold Water Club"];
  const state = {
    holders: null,
    loading: true,
    totalHolders: null,
    query: "",
    queryLoading: false,
    queryResults: null,
    queryTimer: null,
    queryRun: 0,
  };

  const isLocal = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  async function fetchJson(path) {
    const urls = [path];
    if (isLocal) urls.push(`https://www.gerrystephen.com${path}`);
    for (const url of urls) {
      try {
        const response = await fetch(url, { headers: { accept: "application/json" } });
        const type = response.headers.get("content-type") || "";
        if (!response.ok || !type.includes("application/json")) continue;
        return await response.json();
      } catch (_) {}
    }
    return null;
  }

  function fmt(n) {
    return Number(n).toLocaleString("en-US");
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function holderText(holder) {
    return [
      holder.h,
      holder.vibe,
      holder.address,
      holder.xHandle,
      holder.ensName,
      holder.openseaUsername,
      holder.n,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function searchNeedle() {
    return state.query.trim().replace(/^@/, "").toLowerCase();
  }

  function memberSearchFields(member) {
    return [
      member.h,
      member.xHandle,
      member.ensName,
      member.openseaUsername,
      member.address,
      member.vibe,
    ].filter(Boolean).map((value) => String(value).replace(/^@/, "").toLowerCase());
  }

  function searchScore(member, q) {
    const fields = memberSearchFields(member);
    if (fields.some((field) => field === q)) return 0;
    if (fields.some((field) => field.startsWith(q))) return 1;
    if (fields.some((field) => field.includes(q))) return 2;
    return holderText(member).includes(q) ? 3 : 99;
  }

  function filteredMembers(members) {
    const q = searchNeedle();
    if (!q) return members;
    return members
      .map((member) => ({ member, score: searchScore(member, q) }))
      .filter((item) => item.score < 99)
      .sort((a, b) => a.score - b.score || Number(b.member.n || 0) - Number(a.member.n || 0))
      .map((item) => item.member);
  }

  function mapHolder(holder, index, offset = 3200) {
    const seed = offset + index * 97;
    const label = holder.label || holder.xHandle || holder.openseaUsername || holder.address;
    const breakdown = normalizeBreakdown(holder);
    const count = Number.isFinite(Number(holder.count)) ? Number(holder.count) : breakdown.total;
    const countType = holder.countType || "ecosystem";
    const params = new URLSearchParams({
      u: label || holder.address || `holder-${index + 1}`,
    });
    if (holder.address) params.set("wallet", holder.address);
    if (holder.profileImage) params.set("pfp", holder.profileImage);
    if (holder.xHandle) params.set("x", holder.xHandle.replace(/^@/, ""));
    if (holder.ensName) params.set("ens", holder.ensName);
    return {
      h: label,
      vibe: holder.vibe || (holder.source === "opensea-account" ? "OpenSea profile" : index < 3 ? "Top Holder" : VIBES[seed % VIBES.length]),
      n: Number.isFinite(count) ? count : 0,
      countType,
      breakdown,
      verifiedHoldings: Boolean(holder.verifiedHoldings || breakdown.total > 0 || Number(holder.count) > 0),
      seed,
      id: (seed * 5) % 10000,
      image: holder.profileImage,
      claimable: Boolean((holder.claimable || holder.xHandle || holder.openseaUsername) && (breakdown.total > 0 || Number(holder.count) > 0)),
      address: holder.address,
      xHandle: holder.xHandle,
      ensName: holder.ensName,
      openseaUsername: holder.openseaUsername,
      href: `sealfolio.html?${params.toString()}`,
    };
  }

  function render() {
    const members = state.holders || [];
    const localFiltered = filteredMembers(members);
    const apiResults = Array.isArray(state.queryResults) ? state.queryResults : null;
    const filtered = apiResults?.length ? apiResults : localFiltered;
    const searchingOpenSea = state.queryLoading && state.query.trim().length >= 2;
    const q = searchNeedle();
    document.getElementById("community").innerHTML = `
      <div class="page-head">
        <span class="eyebrow">▪ THE POD</span>
        <h1 class="section-title" style="font-size:clamp(34px,5vw,56px);">Meet your pod.</h1>
        <p class="section-sub">Search live holders, open a Sealfolio, and let the real owner claim it by connecting wallet, X and Discord.</p>
      </div>

      <div class="quick-links">
        <a class="qlink" href="${S.LINKS.x}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://cdn.simpleicons.org/x/111820" alt="" loading="lazy"></span><div>@sappyseals<small>97.8K on X</small></div></a>
        <a class="qlink" href="${S.LINKS.omnia}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://www.google.com/s2/favicons?sz=128&domain=omnia.lol" alt="" loading="lazy"></span><div>Omnia<small>the game world</small></div></a>
        <a class="qlink" href="${S.LINKS.opensea}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://cdn.simpleicons.org/opensea/2081e2" alt="" loading="lazy"></span><div>OpenSea<small>collect a seal</small></div></a>
      </div>

      <div class="folio-sec" style="margin-top:46px;">
        <div class="holder-toolbar">
          <div>
            <h2>${state.totalHolders ? `${fmt(state.totalHolders)} holders across the pod` : state.holders ? "Live holders from the contracts" : "Live holders and growing"}</h2>
            <p>${q ? `${filtered.length} possible ${filtered.length === 1 ? "profile" : "profiles"} for “${esc(state.query)}”${searchingOpenSea ? " · checking OpenSea..." : ""}` : searchingOpenSea ? "Searching OpenSea accounts and holder profiles..." : state.holders ? "Profiles are populated from holder data and enriched with OpenSea-linked socials where available." : "Loading the live pod, with local samples while the API wakes up."}</p>
          </div>
          <label class="holder-search">
            <span>Search holders</span>
            <input id="holdersearch" class="input" placeholder="wallet, ENS, OpenSea name, X handle..." value="${esc(state.query)}">
          </label>
        </div>
        ${state.loading ? '<div class="folio-loading">Loading holder list from Sappy Seals and staked Sappy Seals...</div>' : ""}
        ${searchingOpenSea ? '<div class="folio-loading">Checking OpenSea for that holder profile...</div>' : ""}
        ${!filtered.length && !searchingOpenSea && !state.loading ? `<div class="folio-loading">${state.query ? `No holders matched “${esc(state.query)}”. Keep typing a wallet, ENS, OpenSea username or X handle.` : "Holder profiles are syncing from the covered Sappy ecosystem contracts. Try again in a moment."}</div>` : ""}
        <div class="pod-grid">${filtered.map((m) => `
          <a class="pod-card ${m.claimable ? "verified-holder" : ""}" href="${m.href}">
            ${m.image ? `<img class="pod-pfp" src="${m.image}" alt="${m.h} profile picture" referrerpolicy="no-referrer" loading="lazy">` : `<div class="sealframe" data-pin="1" data-kind="seal" data-id="${m.id}" data-px="320"></div>`}
            <div class="info">
              <div class="n">${m.h}</div>
              <div class="t">${m.vibe}</div>
              <div class="cnt">${countLabel(m)}${m.claimable ? " · CLAIM READY" : ""}</div>
              ${breakdownLabel(m) ? `<div class="holder-breakdown">${breakdownLabel(m)}</div>` : ""}
              ${m.address ? `<div class="holder-wallet">${m.address.slice(0, 6)}...${m.address.slice(-4)}</div>` : ""}
            </div>
          </a>`).join("")}</div>
      </div>`;
    wireSearch();
  }

  function countLabel(member) {
    const n = Number(member.n || 0) || 0;
    if (!n && !member.verifiedHoldings) return "HOLDINGS SYNCING";
    return `${n} ECO ASSET${n === 1 ? "" : "S"}`;
  }

  function normalizeBreakdown(holder) {
    const raw = holder?.breakdown && typeof holder.breakdown === "object" ? holder.breakdown : {};
    const seals = Number(raw.seals || raw.sappySeals || raw.sealCount || 0) || 0;
    const ecosystem = Number(raw.ecosystem || raw.other || raw.ecosystemAssets || 0) || 0;
    const artifacts = Number(raw.artifacts || raw.digitalArtifacts || 0) || 0;
    const pixl = Number(holder?.pixlBalance || raw.pixl || 0) || 0;
    const total = Number(raw.total || holder?.count || seals + ecosystem) || 0;
    return { seals, ecosystem, artifacts, pixl, total };
  }

  function breakdownLabel(member) {
    const b = member.breakdown || {};
    const parts = [];
    if (b.ecosystem && b.ecosystem !== b.seals) parts.push(`${fmt(b.ecosystem)} other`);
    if (b.artifacts) parts.push(`${fmt(b.artifacts)} artifact${b.artifacts === 1 ? "" : "s"}`);
    if (b.pixl) parts.push(`${fmt(Math.round(b.pixl))} PIXL`);
    return parts.slice(0, 3).join(" · ");
  }

  function wireSearch() {
    const input = document.getElementById("holdersearch");
    if (!input || input.dataset.wired) return;
    input.dataset.wired = "1";
    input.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.queryResults = null;
      window.clearTimeout(state.queryTimer);
      const q = state.query.trim().replace(/^@/, "");
      if (q.length >= 2) {
        const run = ++state.queryRun;
        state.queryLoading = true;
        state.queryTimer = window.setTimeout(() => searchOpenSeaQuery(q, run), 350);
      } else {
        state.queryLoading = false;
      }
      render();
      S.init();
      const next = document.getElementById("holdersearch");
      if (next) {
        next.focus();
        next.setSelectionRange(state.query.length, state.query.length);
      }
    });
  }

  async function searchOpenSeaQuery(q, run) {
    try {
      const data = await fetchJson(`/api/sappy-holders?q=${encodeURIComponent(q)}`);
      if (run !== state.queryRun) return;
      const holders = Array.isArray(data?.holders) ? data.holders : [];
      state.queryResults = holders.map((holder, index) => mapHolder(holder, index, 7200));
    } catch (_) {
      if (run === state.queryRun) state.queryResults = [];
    } finally {
      if (run === state.queryRun) {
        state.queryLoading = false;
        render();
        S.init();
        const next = document.getElementById("holdersearch");
        if (next) {
          next.focus();
          next.setSelectionRange(state.query.length, state.query.length);
        }
      }
    }
  }

  async function loadHolders() {
    state.loading = true;
    render();
    try {
      const [data, stats] = await Promise.all([
        fetchJson("/api/sappy-holders"),
        fetchJson("/api/sappy-stats"),
      ]);
      if (Number.isFinite(Number(stats?.holders))) state.totalHolders = Number(stats.holders);
      const holders = Array.isArray(data?.holders) ? data.holders : [];
      if (holders.length) {
        state.holders = holders.map((holder, index) => mapHolder(holder, index));
      }
    } catch (_) {
      state.holders = null;
    } finally {
      state.loading = false;
      render();
      S.init();
    }
  }

  S.ready(function () { window.SappyLayout.mount("community"); render(); S.init(); loadHolders(); });
})();
