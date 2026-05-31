/* ============ studio.js — Gerry's AI Studio ============ */
(function () {
  const S = window.Sappy;
  const $ = (id) => document.getElementById(id);

  const AI_STYLES = [
    ["cinematic", "Cinematic poster"],
    ["viral", "Viral X meme"],
    ["editorial", "Editorial collectible"],
    ["sticker", "Sticker pack"],
  ];
  const AI_RATIOS = [
    ["1:1", "Square"],
    ["16:9", "Banner"],
    ["9:16", "Story"],
    ["4:3", "Post"],
  ];
  const AI_PRESETS = [
    ["Breakfast alpha", "My seal cooking breakfast in a warm kitchen after finding alpha before the timeline wakes up"],
    ["Omnia raid", "My seal leading Omnia pets into a neon fantasy raid, funny triumphant caption space"],
    ["Timeline cooked", "My seal posting through a late night market dip, premium relatable X meme"],
    ["Pod wins", "My seal celebrating a massive community win, confetti, bold meme composition"],
  ];
  const REFERENCE_ASSETS = [
    ["/sappy/assets/studio/seal-chef-scene.png", "Scene quality"],
    ["/sappy/assets/studio/seal-character-sheet.png", "Character base"],
    ["/sappy/assets/studio/seal-pose-grid.png", "Pose guide"],
  ];

  const state = {
    sealNumber: "",
    sealRef: null,
    aiPrompt: AI_PRESETS[0][1],
    aiStyle: "viral",
    aiRatio: "1:1",
    aiCount: 2,
    aiImages: [],
    aiStatus: "idle",
    aiPlan: "",
  };

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function styleInstruction() {
    const map = {
      cinematic: "high-end cinematic poster lighting, rich depth, premium collectible campaign art, no cheap clipart",
      viral: "sharp viral X meme composition, expressive reaction, bold readable caption area, funny but polished",
      editorial: "clean editorial art direction, gallery-grade composition, tasteful Sappy Seals brand energy",
      sticker: "premium sticker-pack illustration, strong silhouette, transparent-feeling subject focus, playful meme energy",
    };
    return map[state.aiStyle] || map.viral;
  }

  function sealInstruction() {
    if (!state.sealRef) {
      return "No seal reference loaded yet. Ask the user for a Sappy Seal number before final image generation.";
    }
    const traits = state.sealRef.outfitSummary || (state.sealRef.traits || []).map((t) => `${t.trait_type}: ${t.value}`).join("; ");
    return [
      `Use ${state.sealRef.name || `Sappy Seal #${state.sealRef.id}`} as the exact character reference.`,
      `Token ID: ${state.sealRef.id}.`,
      `Preserve the visible outfit, headwear, expression, accessories, body color, and background palette from the real NFT.`,
      traits ? `Trait notes: ${traits}.` : "",
      state.sealRef.image ? `Reference image URL: ${state.sealRef.image}.` : "",
    ].filter(Boolean).join(" ");
  }

  function buildPremiumPrompt(concept) {
    return [
      sealInstruction(),
      `User concept: ${concept}.`,
      `Style: ${styleInstruction()}.`,
      "Create a polished Sappy Seal meme image direction like a finished illustration: strong character consistency, clean scene, expressive pose, and premium social polish.",
      "If the scene changes the outfit, adapt the real seal's existing traits into the new outfit instead of inventing a random seal.",
      "Use the attached style references as quality direction: cute full-body seal character, consistent turns/poses, and polished environment scenes.",
      "Avoid clutter. Leave clean negative space for captions. Keep the tone wholesome, funny, and community-native.",
      "Do not reference Okay Bears or any other collection.",
    ].join(" ");
  }

  function setAIStatus(status, plan) {
    state.aiStatus = status;
    if (plan !== undefined) state.aiPlan = plan;
    const btn = $("aigen");
    if (btn) {
      btn.textContent = status === "loading" ? "Generating..." : "Create memes";
      btn.disabled = status === "loading";
    }
    const planEl = $("aiplan");
    if (planEl) {
      planEl.innerHTML = state.aiPlan || "Describe the joke or moment. Claude will shape it into polished Sappy-ready options.";
      planEl.classList.toggle("working", status === "loading");
    }
  }

  function ratioLabel() {
    const match = AI_RATIOS.find(([value]) => value === state.aiRatio);
    return match ? `${match[1]} · ${match[0]}` : state.aiRatio;
  }

  function generatedCard(image, index) {
    const prompt = image.revisedPrompt || image.prompt || "";
    return `
      <article class="ai-result-card">
        <div class="ai-result-media">
          ${image.url ? `<img src="${image.url}" alt="Generated Sappy meme ${index + 1}" loading="lazy">` : `<div class="ai-result-fallback">${image.svg || "AI preview"}</div>`}
        </div>
        ${image.referenceUrl ? `<div class="ai-result-brief"><img src="${esc(image.referenceUrl)}" alt="${esc(image.sealName || "Seal reference")}" loading="lazy"><p>${esc(image.caption || "Concept ready for image generation.")}</p></div>` : ""}
        ${prompt ? `<div class="ai-prompt-output"><strong>Image brief</strong><p>${esc(prompt)}</p></div>` : ""}
        <div class="ai-result-actions">
          <span>${image.model || "studio preview"} · ${ratioLabel()}</span>
          ${prompt ? `<button class="btn btn-ghost btn-sm" data-copy-prompt="${esc(prompt)}" type="button">Copy brief</button>` : ""}
          ${image.url ? `<a class="btn btn-ghost btn-sm" href="${image.url}" target="_blank" rel="noopener">Open</a>` : ""}
        </div>
      </article>`;
  }

  function renderAIResults() {
    const grid = $("airesults");
    if (!grid) return;
    grid.innerHTML = state.aiImages.length
      ? state.aiImages.map(generatedCard).join("")
      : `<div class="ai-empty">
          <div class="ai-empty-card">
            <span>Ready when your seal is.</span>
            <strong>Load a token, write the bit, ship a premium prompt pack.</strong>
            <p>Outputs include caption direction, the exact Sappy Seal reference, and image briefs ready for a generation model or designer.</p>
          </div>
        </div>`;
    grid.querySelectorAll("[data-copy-prompt]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(button.dataset.copyPrompt || "");
          S.toast("Image brief copied.");
        } catch (_) {
          S.toast("Copy failed. Select the brief manually.");
        }
      });
    });
  }

  function renderSealRef() {
    const box = $("sealref");
    if (!box) return;
    if (!state.sealRef) {
      box.innerHTML = `<div class="seal-ref-empty">Enter a Sappy Seal number to pull the exact NFT art, name, and outfit traits.</div>`;
      const stage = $("stageSeal");
      if (stage) stage.innerHTML = `<img src="/sappy/assets/studio/seal-character-sheet.png" alt="Sappy character reference">`;
      return;
    }
    const traits = (state.sealRef.traits || []).slice(0, 8);
    box.innerHTML = `
      <div class="seal-ref-card">
        <img src="${esc(state.sealRef.image)}" alt="${esc(state.sealRef.name)}" loading="lazy">
        <div>
          <strong>${esc(state.sealRef.name)}</strong>
          <span>${esc(state.sealRef.source || "metadata")} reference loaded</span>
          <p>${esc(state.sealRef.outfitSummary || "Real token metadata loaded for outfit matching.")}</p>
          <div class="seal-trait-row">${traits.map((trait) => `<em>${esc(trait.trait_type)}: ${esc(trait.value)}</em>`).join("")}</div>
        </div>
      </div>`;
    const stage = $("stageSeal");
    if (stage) {
      stage.innerHTML = `<img src="${esc(state.sealRef.image)}" alt="${esc(state.sealRef.name)}" referrerpolicy="no-referrer">`;
    }
  }

  async function loadSealRef(showToast = true) {
    const input = $("sealnumber");
    const id = String(input?.value || state.sealNumber || "").trim().replace(/^#/, "");
    if (!/^\d{1,5}$/.test(id)) {
      if (showToast) S.toast("Enter a real Sappy Seal number first.");
      return null;
    }
    state.sealNumber = id;
    const btn = $("loadseal");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Loading seal...";
    }
    try {
      const r = await fetch(`/api/sappy-seal?id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error("seal_load_failed");
      state.sealRef = await r.json();
      renderSealRef();
      if (showToast) S.toast(`${state.sealRef.name || `Sappy Seal #${id}`} loaded.`);
      return state.sealRef;
    } catch (e) {
      state.sealRef = null;
      renderSealRef();
      if (showToast) S.toast("Could not load that seal yet. Check OpenSea/API config and try again.");
      return null;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Load seal";
      }
    }
  }

  async function generatePremiumMemes() {
    const concept = $("aiprompt").value.trim();
    if (!concept) { S.toast("Give Gerry's AI Studio a meme concept first."); return; }
    if (!state.sealRef) {
      const seal = await loadSealRef(false);
      if (!seal) {
        S.toast("Load a Sappy Seal number before generating.");
        return;
      }
    }
    state.aiPrompt = concept;
    state.aiStyle = $("aistyle").value;
    state.aiRatio = $("airatio").value;
    state.aiCount = Math.max(1, Math.min(4, +$("aicount").value || 2));
    setAIStatus("loading", "Claude is shaping the joke, captions, composition notes, and premium Sappy prompt direction...");
    try {
      const r = await fetch("/api/sappy-generate-meme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: buildPremiumPrompt(concept),
          concept,
          style: state.aiStyle,
          aspectRatio: state.aiRatio,
          n: state.aiCount,
          seal: state.sealRef,
          references: REFERENCE_ASSETS.map(([url, label]) => ({ url, label })),
        }),
      });
      if (!r.ok) throw new Error("generation_failed");
      const json = await r.json();
      state.aiImages = json.images || [];
      setAIStatus("ready", json.plan || "Generated premium meme options.");
      renderAIResults();
      S.toast(json.provider === "fallback" ? "Drafts generated." : json.provider === "claude" ? "Claude concepts generated." : "Memes generated.");
    } catch (e) {
      state.aiImages = [];
      setAIStatus("error", "Generation did not complete. Try a shorter concept or refresh the studio.");
      renderAIResults();
      S.toast("Generation did not complete.");
    }
  }

  function applyAIPreset(prompt) {
    $("aiprompt").value = prompt;
    state.aiPrompt = prompt;
    setAIStatus("idle", "Prompt loaded. Pick a format, then create your options.");
  }

  function render() {
    $("studio").innerHTML = `
      <section class="studio-hero">
        <div>
          <span class="eyebrow">▪ GERRY'S AI STUDIO</span>
          <h1 class="section-title studio-title">Make your seal the main character.</h1>
          <p class="section-sub">Load a real Sappy Seal, preserve its traits, then generate polished scene briefs, captions and meme-ready art direction powered by Claude.</p>
          <div class="studio-hero-actions">
            <a class="btn btn-accent" href="#studio-maker">Start creating →</a>
            <a class="btn btn-ghost" href="/sappy/sealfolio.html">Use my Sealfolio</a>
          </div>
        </div>
        <div class="studio-hero-preview">
          <img src="/sappy/assets/studio/seal-chef-scene.png" alt="Generated Sappy Seal breakfast scene">
          <div class="studio-preview-card">
            <b>Scene system</b>
            <span>Token traits → pose → caption → final prompt</span>
          </div>
        </div>
      </section>
      <section class="ai-studio-shell">
        <div class="ai-command" id="studio-maker">
          <div>
            <span class="eyebrow">▪ TOKEN-AWARE CREATOR</span>
            <h2>Choose the seal. Direct the moment.</h2>
            <p>The studio pulls OpenSea metadata first, so the prompt keeps the right outfit, headwear, expression and palette instead of inventing a random seal.</p>
          </div>
          <div class="seal-loader">
            <label>Seal number<input id="sealnumber" class="input" inputmode="numeric" placeholder="7262" value="${esc(state.sealNumber)}"></label>
            <button class="btn btn-ghost" id="loadseal" type="button">Load seal</button>
          </div>
          <div id="sealref" class="seal-ref"></div>
          <textarea id="aiprompt" class="input ai-textarea" rows="5">${state.aiPrompt}</textarea>
          <div class="ai-prompt-presets">
            ${AI_PRESETS.map(([name, prompt]) => `<button type="button" data-ai-preset="${prompt}">${name}</button>`).join("")}
          </div>
          <div class="ai-controls">
            <label>Style<select id="aistyle" class="input">${AI_STYLES.map(([v, n]) => `<option value="${v}" ${state.aiStyle === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
            <label>Format<select id="airatio" class="input">${AI_RATIOS.map(([v, n]) => `<option value="${v}" ${state.aiRatio === v ? "selected" : ""}>${n} · ${v}</option>`).join("")}</select></label>
            <label>Outputs<select id="aicount" class="input">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${state.aiCount === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          </div>
          <button class="btn btn-accent full ai-generate" id="aigen">Create memes</button>
          <div class="ai-plan" id="aiplan">Describe the joke or moment. Claude will shape it into polished Sappy-ready options.</div>
        </div>
        <div class="studio-stage-panel">
          <div class="studio-stage">
            <div class="stage-orbit"></div>
            <div class="stage-seal" id="stageSeal"></div>
            <div class="stage-chip top">Character locked</div>
            <div class="stage-chip bottom">Scene ready</div>
          </div>
          <div class="studio-reference-strip">
            ${REFERENCE_ASSETS.map(([url, label]) => `<figure><img src="${url}" alt="${label}" loading="lazy"><figcaption>${label}</figcaption></figure>`).join("")}
          </div>
        </div>
      </section>
      <section class="ai-output-section">
        <div class="eco-head">
          <span class="eyebrow">▪ OUTPUTS</span>
          <h2 class="section-title">Prompt packs that can actually ship.</h2>
          <p class="section-sub">Each run returns captions, a visual direction, the real seal reference and copyable image briefs.</p>
        </div>
        <div class="ai-results" id="airesults"></div>
      </section>
      <section class="ai-note-strip">
        <strong>Reference quality:</strong>
        <span>Studio uses the real seal token plus these target examples for character consistency, pose control, and finished-scene polish.</span>
      </section>`;
    renderAIResults();
    renderSealRef();
    $("aigen").addEventListener("click", generatePremiumMemes);
    $("loadseal").addEventListener("click", () => loadSealRef(true));
    $("sealnumber").addEventListener("input", (e) => { state.sealNumber = e.target.value; });
    document.querySelectorAll("[data-ai-preset]").forEach((b) => b.addEventListener("click", () => applyAIPreset(b.dataset.aiPreset)));
    $("aiprompt").addEventListener("input", (e) => { state.aiPrompt = e.target.value; });
  }

  S.ready(function () { window.SappyLayout.mount("studio"); render(); S.init(); });
})();
