/* ============ community.js — the pod ============ */
(function () {
  const S = window.Sappy;
  const NAMES = ["wabdoteth", "diakou", "stormrdoteth", "DylanKentish", "lilstovetop", "pixlpilled", "arfarf", "sealmaxi", "coldwater", "blubber", "icefloe", "frostbite", "sappykorea", "norekme", "sealchemist", "podfather"];
  const VIBES = ["ARF ARF", "WAGBO", "Diamond Flipper", "Pod Leader", "New Collector", "Staker", "Whale", "Cold Water Club"];
  const state = { holders: null, loading: false };

  function render() {
    const members = state.holders || NAMES.map((h, i) => {
      const seed = 1000 + i * 137;
      const n = 1 + ((seed * 7) % 40);
      return { h, vibe: VIBES[seed % VIBES.length], n, seed, id: (seed * 3) % 10000, href: `sealfolio.html?u=${h}&seed=${seed}` };
    });
    document.getElementById("community").innerHTML = `
      <div class="page-head">
        <span class="eyebrow">▪ THE POD</span>
        <h1 class="section-title" style="font-size:clamp(34px,5vw,56px);">Meet your pod.</h1>
        <p class="section-sub">Every seal has a Sealfolio. Browse the pod, peek a profile, find your people. Connect your X to claim yours.</p>
      </div>

      <div class="quick-links">
        <a class="qlink" href="${S.LINKS.x}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://cdn.simpleicons.org/x/111820" alt="" loading="lazy"></span><div>@sappyseals<small>97.8K on X</small></div></a>
        <a class="qlink" href="${S.LINKS.meme}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://www.google.com/s2/favicons?sz=128&domain=mememachine.sappyseals.io" alt="" loading="lazy"></span><div>Meme Machine<small>generate &amp; reply</small></div></a>
        <a class="qlink" href="${S.LINKS.omnia}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://www.google.com/s2/favicons?sz=128&domain=omnia.lol" alt="" loading="lazy"></span><div>Omnia<small>the game world</small></div></a>
        <a class="qlink" href="${S.LINKS.opensea}" target="_blank" rel="noopener"><span class="qi logo"><img src="https://cdn.simpleicons.org/opensea/2081e2" alt="" loading="lazy"></span><div>OpenSea<small>collect a seal</small></div></a>
      </div>

      <div class="folio-sec" style="margin-top:46px;">
        <h2>${state.holders ? "Live holders from the contracts" : "3,885 holders and growing"}</h2>
        ${state.loading ? '<div class="folio-loading">Loading holder list from Sappy Seals and staked Sappy Seals...</div>' : ""}
        <div class="pod-grid">${members.map((m) => `
          <a class="pod-card" href="${m.href}">
            <div class="sealframe" data-pin="1" data-kind="seal" data-id="${m.id}" data-px="320"></div>
            <div class="info"><div class="n">${m.h}</div><div class="t">${m.vibe}</div><div class="cnt">${m.n} ${m.n === 1 ? "SEAL" : "SEALS"}</div></div>
          </a>`).join("")}</div>
      </div>`;
  }

  async function loadHolders() {
    state.loading = true;
    render();
    try {
      let response = await fetch("/api/sappy-holders", { headers: { accept: "application/json" } });
      if (!response.ok && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) {
        response = await fetch("https://www.gerrystephen.com/api/sappy-holders", { headers: { accept: "application/json" } });
      }
      const data = response.ok ? await response.json() : { holders: [] };
      const holders = Array.isArray(data.holders) ? data.holders : [];
      if (holders.length) {
        state.holders = holders.map((holder, index) => {
          const seed = 3200 + index * 97;
          return {
            h: holder.label || holder.address,
            vibe: index < 3 ? "Top Holder" : VIBES[seed % VIBES.length],
            n: holder.count || 1,
            seed,
            id: (seed * 5) % 10000,
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
