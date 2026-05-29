/* ============ sealfolio.js — profile page (X connect lives here) ============ */
(function () {
  const S = window.Sappy;
  const qs = new URLSearchParams(location.search);
  const handle = qs.get("u") || "sappyseal_holder";
  const seedNum = parseInt(qs.get("seed") || "0", 10) || hashStr(handle);

  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rnd = rng(seedNum);
  const pick = (n) => Math.floor(rnd() * n);

  const TRAITS = ["Orange BG", "Cloudy", "Poorple", "Black Tee", "Yellow Bomber", "Green Scarf", "Beanie", "Shades", "Durag", "Mushroom", "Pumpkin Head", "Halo", "Party Hat", "Skeleton"];
  const VIBES = ["ARF ARF", "WAGBO", "Diamond Flippers", "Pod Leader", "Cold Water Club", "Sealmaxi"];
  const RANKS = ["New Collector", "Seal Enjoyer", "Pod Member", "Legendary Collector", "Seal Whale"];

  const owned = [];
  const nOwned = 3 + pick(6);
  const used = new Set();
  for (let i = 0; i < nOwned; i++) {
    let id; do { id = pick(10000); } while (used.has(id)); used.add(id);
    owned.push({ id, trait: TRAITS[pick(TRAITS.length)], staked: rnd() > 0.5 });
  }
  const staked = owned.filter((o) => o.staked).length;
  const pixl = (staked * (140 + pick(360))).toLocaleString("en-US");
  const score = 120 + pick(880);
  const rank = RANKS[Math.min(RANKS.length - 1, Math.floor(score / 200))];
  const vibe = VIBES[pick(VIBES.length)];
  const walletShort = "0x" + seedNum.toString(16).padStart(4, "0").slice(0, 4) + "…" + (seedNum % 9999).toString(16).padStart(4, "0");

  const BADGES = [
    { i: "🦭", n: "OG Seal", have: rnd() > .3 },
    { i: "💎", n: "Staker", have: staked > 0 },
    { i: "🌊", n: "Ocean Fund", have: rnd() > .5 },
    { i: "🎨", n: "Meme Lord", have: rnd() > .5 },
    { i: "🏆", n: "Pod Leader", have: rnd() > .7 },
    { i: "🔑", n: "Key Holder", have: rnd() > .6 },
  ];

  function render() {
    document.getElementById("folio").innerHTML = `
      <a class="folio-back" href="community.html">← Back to the Pod</a>
      <div class="folio-hero">
        <div class="folio-pfp sealframe" data-pin="1" data-kind="seal" data-id="${owned[0].id}" data-px="300"></div>
        <div class="folio-id">
          <div class="name">${handle}</div>
          <div class="wallet">${walletShort}</div>
          <div class="folio-chips">
            <span class="chip vibe">Vibe · ${vibe}</span>
            <span class="chip pixl">${pixl} $PIXL</span>
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
          <h3>This is a sample Sealfolio.</h3>
          <p>Connect your X to claim your handle and pull your real seals, staking & $PIXL.</p>
        </div>
        <button class="btn btn-x" data-x-login>𝕏&nbsp; Connect your X</button>
      </div>

      <div class="folio-statrow">
        <div class="fstat"><div class="v">${nOwned}</div><div class="k">Seals owned</div></div>
        <div class="fstat"><div class="v">${owned.length}/14</div><div class="k">Traits</div></div>
        <div class="fstat"><div class="v">${BADGES.filter(b=>b.have).length}</div><div class="k">Badges</div></div>
        <div class="fstat"><div class="v">${staked}</div><div class="k">Staked</div></div>
        <div class="fstat"><div class="v">${score}</div><div class="k">Score</div></div>
      </div>

      <div class="folio-sec">
        <h2>${handle}'s Seals</h2>
        <div class="seal-grid">${owned.map((o) => `
          <div class="seal-card">
            <div class="sealframe" data-pin="1" data-kind="seal" data-id="${o.id}" data-px="320"></div>
            <div class="cap"><div class="n">Sappy Seal #${o.id}</div><div class="t">${o.trait}</div>${o.staked ? '<span class="staked">⛓ STAKED · EARNING $PIXL</span>' : ""}</div>
          </div>`).join("")}</div>
      </div>

      <div class="folio-sec">
        <h2>Staking & $PIXL</h2>
        <div class="stake-card">
          <div>
            <div style="font-family:var(--font-pixel);font-size:9px;color:var(--ink-soft);letter-spacing:.06em;">▸ CLAIMABLE $PIXL</div>
            <div class="pixl-bal">${pixl} <span style="font-size:20px;">$PIXL</span></div>
            <div class="stake-bar"><i style="width:${Math.min(100, staked / nOwned * 100)}%"></i></div>
            <div style="color:var(--ink-soft);font-size:13.5px;margin-top:10px;">${staked} of ${nOwned} seals staked · earning up to 500 $PIXL/day each by rarity.</div>
          </div>
          <button class="btn btn-accent">Claim $PIXL →</button>
        </div>
      </div>

      <div class="folio-sec">
        <h2>Badges</h2>
        <div class="badge-grid">${BADGES.map((b) => `
          <div class="badge ${b.have ? "" : "locked"}"><div class="bi">${b.i}</div><div class="bn">${b.n}</div></div>`).join("")}</div>
      </div>

      <div class="folio-sec" style="text-align:center;padding:30px 0 6px;color:var(--ink-soft);font-style:italic;">
        “Collect what you love. Stay sappy.” — ${handle}
      </div>`;
  }

  S.ready(function () {
    window.SappyLayout.mount("community");
    render();
    S.init();
  });
})();
