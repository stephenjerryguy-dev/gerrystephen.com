/* ============ studio.js — Gerry's Seal Studio (pick seal + illustrated scenes) ============
   Subject: Gerry's posed sprite OR any on-chain seal by token id (never altered).
   Scenes: curated vector backdrops (sun/sea/stars/skyline/spotlight) — no emoji.
   Shapes are fractions (0-1) so the SAME spec renders to DOM preview and canvas export. */
(function () {
  const S = window.Sappy;
  const POSES = [
    { f: "poses/pose-1-front.png", n: "Front" }, { f: "poses/pose-2-34front.png", n: "¾ Front" },
    { f: "poses/pose-3-side.png", n: "Side" }, { f: "poses/pose-4-back.png", n: "Back" },
    { f: "poses/pose-5-34back.png", n: "¾ Back" }, { f: "poses/pose-6-topdown.png", n: "Top" },
    { f: "poses/pose-7-high.png", n: "High" }, { f: "poses/pose-8-low.png", n: "Low" },
    { f: "poses/pose-9-under.png", n: "Under" }, { f: "poses/pose-10-ots.png", n: "Shoulder" },
  ];
  const FILTERS = [
    { n: "Original", f: "none" }, { n: "Noir", f: "grayscale(1) contrast(1.12)" },
    { n: "Vapor", f: "hue-rotate(265deg) saturate(1.5)" }, { n: "Sunset", f: "sepia(.55) saturate(1.6) hue-rotate(-18deg)" },
  ];

  // ---- curated scenes (no emoji) ----
  function stars(n, seed) { const out = []; let s = seed || 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < n; i++) out.push({ t: "c", cx: rnd(), cy: rnd() * 0.6, r: 0.004 + rnd() * 0.006, fill: "rgba(255,255,255,0.9)" }); return out; }
  function buildings() { const out = []; let x = 0.02; while (x < 0.98) { const w = 0.06 + Math.random() * 0.05, h = 0.18 + Math.random() * 0.3; out.push({ t: "r", x, y: 1 - h, w: w - 0.01, h, fill: "#0f1733" }); x += w; } return out; }
  const SCENES = {
    space:  { name: "Space",   bg: ["#13204d", "#05060f"], shapes: [{ t: "c", cx: 0.8, cy: 0.22, r: 0.11, fill: "#e9edff" }, { t: "c", cx: 0.8, cy: 0.22, r: 0.11, fill: "rgba(0,0,0,0.06)" }, ...stars(46, 3)] },
    beach:  { name: "Beach",   bg: ["#a6dcff", "#ffe7a8"], shapes: [{ t: "c", cx: 0.78, cy: 0.2, r: 0.1, fill: "#fff2a8" }, { t: "r", x: 0, y: 0.56, w: 1, h: 0.16, fill: "#46b3e6" }, { t: "r", x: 0, y: 0.72, w: 1, h: 0.28, fill: "#f3dc9b" }] },
    sunset: { name: "Sunset",  bg: ["#ff9e6b", "#5b3a8a"], shapes: [{ t: "c", cx: 0.5, cy: 0.58, r: 0.17, fill: "#ffd66b" }, { t: "r", x: 0, y: 0.66, w: 1, h: 0.34, fill: "#3a2a6a" }] },
    stage:  { name: "Stage",   bg: ["#241636", "#0a0612"], shapes: [{ t: "c", cx: 0.5, cy: 0.34, r: 0.36, fill: "rgba(255,240,200,0.18)" }, { t: "c", cx: 0.5, cy: 0.34, r: 0.22, fill: "rgba(255,240,200,0.18)" }, { t: "r", x: 0, y: 0.8, w: 1, h: 0.2, fill: "#1d1230" }] },
    city:   { name: "City",    bg: ["#16244e", "#0a1126"], shapes: [{ t: "c", cx: 0.82, cy: 0.2, r: 0.08, fill: "#fdf6d8" }, ...stars(22, 9), ...buildings()] },
    meadow: { name: "Meadow",  bg: ["#bfe8ff", "#e3f8c9"], shapes: [{ t: "c", cx: 0.2, cy: 0.22, r: 0.1, fill: "#fff2a8" }, { t: "c", cx: 0.3, cy: 1.02, r: 0.42, fill: "#9fd86b" }, { t: "c", cx: 0.85, cy: 1.05, r: 0.4, fill: "#86c95a" }] },
  };
  const SCENE_KEYS = Object.keys(SCENES);
  const PROMPT_PRESETS = [
    ["Viral reaction", "dramatic stage spotlight, shocked seal reaction, caption about floor moving"],
    ["Omnia quest", "fantasy meadow adventure, seal entering omnia, heroic gaming poster"],
    ["Late night X", "city rooftop at midnight, posting through it, dry collector humor"],
    ["Beach alpha", "surfing at sunset, pod caught the wave, optimistic market meme"],
  ];

  let state = { mode: "pose", pose: 1, tokenId: 9815, scene: "beach", capColor: "#15202a", filter: "none", cap: "STAY SAPPY", size: 64, pos: "center" };
  const $ = (id) => document.getElementById(id);

  function shapesHTML(sh) {
    return sh.map((s) => s.t === "c"
      ? `<span style="position:absolute;left:${(s.cx - s.r) * 100}%;top:${(s.cy - s.r) * 100}%;width:${s.r * 200}%;padding-bottom:${s.r * 200}%;height:0;border-radius:50%;background:${s.fill}"></span>`
      : `<span style="position:absolute;left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;height:${s.h * 100}%;background:${s.fill}"></span>`).join("");
  }
  function subjectHTML() {
    if (state.mode === "token")
      return `<div class="sealframe subj-token" id="subj" data-pin="1" data-kind="seal" data-id="${state.tokenId}" data-px="360"></div>`;
    return `<img class="subj-pose" id="subj" src="${POSES[state.pose - 1].f}" alt="">`;
  }
  function paint() {
    const sc = SCENES[state.scene];
    $("stage").style.background = `linear-gradient(160deg, ${sc.bg[0]}, ${sc.bg[1]})`;
    $("scenelayer").innerHTML = shapesHTML(sc.shapes);
    const sub = $("subj");
    if (sub) { sub.style.height = state.size + "%"; sub.style.left = state.pos === "left" ? "26%" : state.pos === "right" ? "74%" : "50%";
      sub.querySelectorAll && sub.querySelectorAll(".seal-photo,.seal-cv").forEach((e) => e.style.filter = state.filter);
      if (sub.tagName === "IMG") sub.style.filter = state.filter; }
    const cap = $("cap"); cap.textContent = state.cap; cap.style.color = state.capColor; cap.style.display = state.cap ? "block" : "none";
  }
  function rebuildSubject() { $("subjwrap").innerHTML = subjectHTML(); if (state.mode === "token") S.hydrate(); paint(); }

  function localSceneBrain(q) {
    const text = q.toLowerCase();
    const choice = text.match(/space|moon|star|alien|ordinal/) ? "space"
      : text.match(/city|rooftop|night|twitter| x |post|timeline/) ? "city"
      : text.match(/stage|spotlight|concert|announce|reveal/) ? "stage"
      : text.match(/sunset|gold|orange|alpha|pump/) ? "sunset"
      : text.match(/meadow|omnia|quest|game|pet|world/) ? "meadow"
      : "beach";
    const captions = {
      space: ["TO THE FLOE", "ORBITAL ARF", "SEAL SIGNAL"],
      city: ["POSTING THROUGH IT", "TIMELINE ALPHA", "CITY POD"],
      stage: ["MAIN CHARACTER", "POD REVEAL", "LIGHTS ON"],
      sunset: ["UP ONLY", "CATCH THE WAVE", "SUNSET SAPPY"],
      meadow: ["ENTER OMNIA", "QUEST ACCEPTED", "PIXLPILLED"],
      beach: ["STAY SAPPY", "ARF ARF", "WAVE CHECK"],
    };
    const cap = captions[choice][Math.abs([...text].reduce((a, c) => a + c.charCodeAt(0), 0)) % captions[choice].length];
    const darkScenes = ["space", "city", "stage", "sunset"];
    return {
      scene: choice,
      caption: cap,
      capColor: darkScenes.includes(choice) ? "#ffffff" : "#15202a",
      rationale: `Matched "${q}" to ${SCENES[choice].name} and generated a short X-ready caption.`,
    };
  }

  async function askSceneAI(q) {
    if (window.sappySceneAI) return window.sappySceneAI(q, { scenes: SCENE_KEYS });
    try {
      const r = await fetch("/api/sappy-studio-scene", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: q, scenes: SCENE_KEYS }),
      });
      if (r.ok) return r.json();
    } catch (e) {}
    if (window.claude && window.claude.complete) {
      const p = `Map a scene description to one preset and a caption for a Sappy Seals meme. Presets: ${SCENE_KEYS.join(", ")}. Scene: "${q}". Reply ONLY minified JSON: {"scene":"<one preset key>","caption":"SHORT ALL-CAPS PUNCHY (max 5 words)","capColor":"#ffffff or #15202a for contrast","rationale":"one short reason"}.`;
      const raw = await window.claude.complete(p);
      const m = raw.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]);
    }
    return localSceneBrain(q);
  }

  function applyIdea(j, q) {
    if (SCENES[j.scene]) state.scene = j.scene;
    if (j.caption) { state.cap = String(j.caption).toUpperCase().slice(0, 32); $("capin").value = state.cap; }
    state.capColor = j.capColor || localSceneBrain(q).capColor;
    document.querySelectorAll("#scenes button").forEach((x) => x.classList.toggle("active", x.dataset.s === state.scene));
    const out = $("aiout");
    if (out) {
      out.innerHTML = `<b>${SCENES[state.scene].name}</b> · ${state.cap}${j.rationale ? `<br>${j.rationale}` : ""}`;
      out.classList.add("show");
    }
    paint();
  }

  async function genScene() {
    const q = $("scenein").value.trim(); if (!q) { S.toast("Describe a scene first ✨"); return; }
    const b = $("genbtn"), o = b.textContent; b.textContent = "✨ Building…"; b.disabled = true;
    try {
      applyIdea(await askSceneAI(q), q);
      S.toast("✨ Scene set — “" + SCENES[state.scene].name + "”.");
    } catch (e) {
      applyIdea(localSceneBrain(q), q);
      S.toast("✨ Used local scene brain — ready to remix.");
    }
    b.textContent = o; b.disabled = false;
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  async function download() {
    const W = 1080; const cv = document.createElement("canvas"); cv.width = W; cv.height = W; const ctx = cv.getContext("2d");
    const sc = SCENES[state.scene];
    const g = ctx.createLinearGradient(0, 0, W, W); g.addColorStop(0, sc.bg[0]); g.addColorStop(1, sc.bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    sc.shapes.forEach((s) => { ctx.fillStyle = s.fill; if (s.t === "c") { ctx.beginPath(); ctx.arc(s.cx * W, s.cy * W, s.r * W, 0, 7); ctx.fill(); } else ctx.fillRect(s.x * W, s.y * W, s.w * W, s.h * W); });
    const cx = W * (state.pos === "left" ? .28 : state.pos === "right" ? .72 : .5);
    await new Promise((res) => { const im = new Image();
      if (state.mode === "token") im.crossOrigin = "anonymous";
      im.onload = () => { const h = W * (state.size / 100); const w = state.mode === "token" ? h : h * (im.width / im.height);
        ctx.save(); if (state.mode === "token") { rr(ctx, cx - w / 2, W - h - W * 0.06, w, h, 26); ctx.clip(); }
        ctx.filter = state.filter === "none" ? "none" : state.filter; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, cx - w / 2, W - h - W * 0.06, w, h); ctx.restore(); ctx.filter = "none"; res(); };
      im.onerror = res;
      im.src = state.mode === "token" ? S.sealUrls(state.tokenId)[0] : POSES[state.pose - 1].f; });
    if (state.cap) { ctx.fillStyle = state.capColor; ctx.font = "900 " + Math.round(W * 0.072) + "px Archivo, sans-serif"; ctx.lineWidth = Math.round(W * 0.012); ctx.strokeStyle = state.capColor === "#ffffff" ? "#15202a" : "#ffffff"; ctx.lineJoin = "round"; ctx.textAlign = "center"; ctx.strokeText(state.cap, W / 2, W * 0.93); ctx.fillText(state.cap, W / 2, W * 0.93); }
    try { const a = document.createElement("a"); a.download = "gerry-seal-scene.png"; a.href = cv.toDataURL("image/png"); a.click(); S.toast("🦭 Downloaded your scene!"); }
    catch (e) { S.toast("Export blocked — try a Gerry pose (token art can taint canvas)."); }
  }

  function render() {
    $("studio").innerHTML = `
      <div class="page-head">
        <span class="eyebrow">▪ GERRY'S SEAL STUDIO</span>
        <h1 class="section-title" style="font-size:clamp(34px,5vw,56px);">Gerry's Seal Studio.</h1>
        <p class="section-sub">My personal fan-made meme lab — <b>not an official Sappy tool</b>. Pick a seal, set the scene, ship a meme. Same seal, every angle — the look never changes.</p>
      </div>
      <div class="tool-grid" style="margin-top:30px;">
        <div class="stage">
          <div class="frame" id="stage" style="overflow:hidden;">
            <div class="scene-layer" id="scenelayer"></div>
            <div class="subj-wrap" id="subjwrap">${subjectHTML()}</div>
            <div class="scene-cap" id="cap">${state.cap}</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-sec ai-box">
            <label>✨ AI scene <span style="color:var(--accent-deep)">— describe it, we build it</span></label>
            <input class="input" id="scenein" type="text" placeholder="e.g. surfing at sunset / rooftop in the city">
            <div class="ai-presets">${PROMPT_PRESETS.map(([name, prompt]) => `<button type="button" data-prompt="${prompt}">${name}</button>`).join("")}</div>
            <button class="btn btn-accent full" id="genbtn">✨ Generate scene</button>
            <div class="ai-output" id="aiout"></div>
          </div>
          <div class="panel-sec"><label>Scene</label><div class="chip-row" id="scenes">${SCENE_KEYS.map((k) => `<button class="pillbtn ${k === state.scene ? "active" : ""}" data-s="${k}">${SCENES[k].name}</button>`).join("")}</div></div>
          <div class="panel-sec"><label>Subject</label>
            <div class="seg" id="mode"><button data-m="pose" class="active">Gerry (posed)</button><button data-m="token">Any seal #</button></div>
            <div id="poserow"><div class="pose-pick" id="poses">${POSES.map((p, i) => `<button class="${i === 0 ? "active" : ""}" data-i="${i + 1}" title="${p.n}"><img src="${p.f}" alt="${p.n}"><span>${p.n}</span></button>`).join("")}</div></div>
            <div id="tokenrow" style="display:none;"><div class="row"><input class="input" id="idin" type="number" min="0" max="9999" value="${state.tokenId}"><button class="btn btn-ghost" id="roll">🎲 Roll</button></div></div>
          </div>
          <div class="panel-sec"><label>Size &amp; position</label>
            <input type="range" id="size" min="38" max="90" value="${state.size}" class="rng">
            <div class="seg" id="pos"><button data-p="left">Left</button><button data-p="center" class="active">Center</button><button data-p="right">Right</button></div>
          </div>
          <div class="panel-sec"><label>Filter</label><div class="chip-row" id="filters">${FILTERS.map((f, i) => `<button class="pillbtn ${i === 0 ? "active" : ""}" data-f="${f.f}">${f.n}</button>`).join("")}</div></div>
          <div class="panel-sec"><label>Caption</label><input class="input" id="capin" type="text" value="${state.cap}"></div>
          <button class="btn btn-accent full" id="dl">⬇ Download meme</button>
        </div>
      </div>`;
    if (state.mode === "token") S.hydrate();
    paint();
    $("genbtn").addEventListener("click", genScene);
    $("scenein").addEventListener("keydown", (e) => { if (e.key === "Enter") genScene(); });
    document.querySelectorAll(".ai-presets button").forEach((b) => b.addEventListener("click", () => { $("scenein").value = b.dataset.prompt; genScene(); }));
    document.querySelectorAll("#scenes button").forEach((b) => b.addEventListener("click", () => { state.scene = b.dataset.s; document.querySelectorAll("#scenes button").forEach((x) => x.classList.toggle("active", x === b)); paint(); }));
    document.querySelectorAll("#mode button").forEach((b) => b.addEventListener("click", () => { state.mode = b.dataset.m; document.querySelectorAll("#mode button").forEach((x) => x.classList.toggle("active", x === b)); $("poserow").style.display = state.mode === "pose" ? "" : "none"; $("tokenrow").style.display = state.mode === "token" ? "" : "none"; rebuildSubject(); }));
    document.querySelectorAll("#poses button").forEach((b) => b.addEventListener("click", () => { state.pose = +b.dataset.i; document.querySelectorAll("#poses button").forEach((x) => x.classList.toggle("active", x === b)); rebuildSubject(); }));
    $("roll").addEventListener("click", () => { state.tokenId = S.randId(); $("idin").value = state.tokenId; rebuildSubject(); });
    $("idin").addEventListener("change", (e) => { state.tokenId = Math.max(0, Math.min(9999, +e.target.value || 0)); rebuildSubject(); });
    $("size").addEventListener("input", (e) => { state.size = +e.target.value; paint(); });
    document.querySelectorAll("#pos button").forEach((b) => b.addEventListener("click", () => { state.pos = b.dataset.p; document.querySelectorAll("#pos button").forEach((x) => x.classList.toggle("active", x === b)); paint(); }));
    document.querySelectorAll("#filters button").forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.f; document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("active", x === b)); paint(); }));
    $("capin").addEventListener("input", (e) => { state.cap = e.target.value; paint(); });
    $("dl").addEventListener("click", download);
  }

  S.ready(function () { window.SappyLayout.mount("studio"); render(); S.init(); });
})();
