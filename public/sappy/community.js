/* ============ community.js — the pod ============ */
(function () {
  const S = window.Sappy;
  const NAMES = ["wabdoteth", "diakou", "stormrdoteth", "DylanKentish", "lilstovetop", "pixlpilled", "arfarf", "sealmaxi", "coldwater", "blubber", "icefloe", "frostbite", "sappykorea", "norekme", "sealchemist", "podfather"];
  const VIBES = ["ARF ARF", "WAGBO", "Diamond Flipper", "Pod Leader", "New Collector", "Staker", "Whale", "Cold Water Club"];
  const state = { holders: null, loading: false, totalHolders: null, query: "" };

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
      holder.openseaUsername,
      holder.n,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function filteredMembers(members) {
    const q = state.query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => holderText(member).includes(q.replace(/^@/, "")));
  }

  function render() {
    const members = state.holders || NAMES.map((h, i) => {
      const seed = 1000 + i * 137;
      const n = 1 + ((seed * 7) % 40);
      return { h, vibe: VIBES[seed % VIBES.length], n, seed, id: (seed * 3) % 10000, href: `sealfolio.html?u=${h}&seed=${seed}` };
    });
    const filtered = filteredMembers(members);
    document.getElementById("community").innerHTML = `
      <div class="page-head">
        <span class="eyebrow">▪ THE POD</span>
        <h1 class="section-title" style="font-size:clamp(34px,5vw,56px);">Meet your pod.</h1>
        <p class="section-sub">Search live holders, open a Sealfolio, and let the real owner claim it by connecting wallet, X and Discord.</p>
      </div>

      <div class="quick-links">
        <a class="qlink" href="${S.LINKS.x}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://cdn.simpleicons.org/x/111820" alt="" loading="lazy"></span><div>@sappyseals<small>97.8K on X</small></div></a>
        <a class="qlink" href="${S.LINKS.meme}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://www.google.com/s2/favicons?sz=128&domain=mememachine.sappyseals.io" alt="" loading="lazy"></span><div>Meme Machine<small>generate &amp; reply</small></div></a>
        <a class="qlink" href="${S.LINKS.omnia}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://www.google.com/s2/favicons?sz=128&domain=omnia.lol" alt="" loading="lazy"></span><div>Omnia<small>the game world</small></div></a>
        <a class="qlink" href="${S.LINKS.opensea}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://cdn.simpleicons.org/opensea/2081e2" alt="" loading="lazy"></span><div>OpenSea<small>collect a seal</small></div></a>
      </div>

      <div class="folio-sec" style="margin-top:46px;">
        <div class="holder-toolbar">
          <div>
            <h2>${state.totalHolders ? `${fmt(state.totalHolders)} holders across the pod` : state.holders ? "Live holders from the contracts" : "Live holders and growing"}</h2>
            <p>${state.holders ? "Profiles are populated from holder data and enriched with OpenSea-linked socials where available." : "Loading the live pod, with local samples while the API wakes up."}</p>
          </div>
          <label class="holder-search">
            <span>Search holders</span>
            <input id="holdersearch" class="input" placeholder="wallet, ENS, X handle..." value="${esc(state.query)}">
          </label>
        </div>
        ${state.loading ? '<div class="folio-loading">Loading holder list from Sappy Seals and staked Sappy Seals...</div>' : ""}
        ${!filtered.length ? `<div class="folio-loading">No holders matched “${esc(state.query)}”. Try a wallet, ENS, OpenSea username or X handle.</div>` : ""}
        <div class="pod-grid">${filtered.map((m) => `
          <a class="pod-card" href="${m.href}">
            ${m.image ? `<img class="pod-pfp" src="${m.image}" alt="${m.h} profile picture" referrerpolicy="no-referrer" loading="lazy">` : `<div class="sealframe" data-pin="1" data-kind="seal" data-id="${m.id}" data-px="320"></div>`}
            <div class="info">
              <div class="n">${m.h}</div>
              <div class="t">${m.vibe}</div>
              <div class="cnt">${m.n} ${m.n === 1 ? "SEAL" : "SEALS"}${m.claimable ? " · CLAIM READY" : ""}</div>
              ${m.address ? `<div class="holder-wallet">${m.address.slice(0, 6)}...${m.address.slice(-4)}</div>` : ""}
            </div>
          </a>`).join("")}</div>
      </div>`;
    wireSearch();
  }

  function wireSearch() {
    const input = document.getElementById("holdersearch");
    if (!input || input.dataset.wired) return;
    input.dataset.wired = "1";
    input.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
      S.init();
      const next = document.getElementById("holdersearch");
      if (next) {
        next.focus();
        next.setSelectionRange(state.query.length, state.query.length);
      }
    });
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
        state.holders = holders.map((holder, index) => {
          const seed = 3200 + index * 97;
          return {
            h: holder.label || holder.address,
            vibe: index < 3 ? "Top Holder" : VIBES[seed % VIBES.length],
            n: holder.count || 1,
            seed,
            id: (seed * 5) % 10000,
            image: holder.profileImage,
            claimable: Boolean(holder.claimable || holder.xHandle),
            address: holder.address,
            xHandle: holder.xHandle,
            openseaUsername: holder.openseaUsername,
            href: holder.profile || `sealfolio.html?wallet=${holder.address}&u=${holder.label || holder.address}`,
          };
        });
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
