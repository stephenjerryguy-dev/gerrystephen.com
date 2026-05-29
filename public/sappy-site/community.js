/* ============ community.js — the pod ============ */
(function () {
  const S = window.Sappy;
  const NAMES = ["wabdoteth", "diakou", "stormrdoteth", "DylanKentish", "lilstovetop", "pixlpilled", "arfarf", "sealmaxi", "coldwater", "blubber", "icefloe", "frostbite", "sappykorea", "norekme", "sealchemist", "podfather"];
  const VIBES = ["ARF ARF", "WAGBO", "Diamond Flipper", "Pod Leader", "New Collector", "Staker", "Whale", "Cold Water Club"];

  function render() {
    const members = NAMES.map((h, i) => {
      const seed = 1000 + i * 137;
      const n = 1 + ((seed * 7) % 40);
      return { h, vibe: VIBES[seed % VIBES.length], n, seed, id: (seed * 3) % 10000 };
    });
    document.getElementById("community").innerHTML = `
      <div class="page-head">
        <span class="eyebrow">▪ THE POD</span>
        <h1 class="section-title" style="font-size:clamp(34px,5vw,56px);">Meet your pod.</h1>
        <p class="section-sub">Every seal has a Sealfolio. Browse the pod, peek a profile, find your people. Connect your X to claim yours.</p>
      </div>

      <div class="quick-links">
        <a class="qlink" href="${S.LINKS.x}" target="_blank" rel="noopener"><span class="qi">𝕏</span><div>@sappyseals<small>97.8K on X</small></div></a>
        <a class="qlink" href="${S.LINKS.meme}" target="_blank" rel="noopener"><span class="qi">🖼</span><div>Meme Machine<small>generate &amp; reply</small></div></a>
        <a class="qlink" href="${S.LINKS.omnia}" target="_blank" rel="noopener"><span class="qi">🌍</span><div>Omnia<small>the game world</small></div></a>
        <a class="qlink" href="${S.LINKS.opensea}" target="_blank" rel="noopener"><span class="qi">⛵</span><div>OpenSea<small>collect a seal</small></div></a>
      </div>

      <div class="folio-sec" style="margin-top:46px;">
        <h2>3,885 holders and growing</h2>
        <div class="pod-grid">${members.map((m) => `
          <a class="pod-card" href="sealfolio.html?u=${m.h}&seed=${m.seed}">
            <div class="sealframe" data-pin="1" data-kind="seal" data-id="${m.id}" data-px="320"></div>
            <div class="info"><div class="n">${m.h}</div><div class="t">${m.vibe}</div><div class="cnt">${m.n} ${m.n === 1 ? "SEAL" : "SEALS"}</div></div>
          </a>`).join("")}</div>
      </div>`;
  }

  S.ready(function () { window.SappyLayout.mount("community"); render(); S.init(); });
})();
