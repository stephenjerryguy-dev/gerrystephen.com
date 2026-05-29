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
    ["Alpha leak", "A Sappy Seal discovers absurd alpha on a glowing laptop, chaotic but wholesome crypto meme energy"],
    ["Omnia raid", "A heroic Sappy Seal leading Omnia pets into a neon fantasy raid, funny triumphant caption space"],
    ["Timeline cooked", "A tired Sappy Seal posting through a late night market dip, premium relatable X meme"],
    ["Pod wins", "A crowd of Sappy Seals celebrating a massive community win, confetti, bold meme composition"],
  ];

  const state = {
    aiPrompt: AI_PRESETS[0][1],
    aiStyle: "viral",
    aiRatio: "1:1",
    aiCount: 2,
    aiImages: [],
    aiStatus: "idle",
    aiPlan: "",
  };

  function styleInstruction() {
    const map = {
      cinematic: "high-end cinematic poster lighting, rich depth, premium collectible campaign art, no cheap clipart",
      viral: "sharp viral X meme composition, expressive reaction, bold readable caption area, funny but polished",
      editorial: "clean editorial art direction, gallery-grade composition, tasteful Sappy Seals brand energy",
      sticker: "premium sticker-pack illustration, strong silhouette, transparent-feeling subject focus, playful meme energy",
    };
    return map[state.aiStyle] || map.viral;
  }

  function buildPremiumPrompt(concept) {
    return [
      "Use a Sappy Seal as the central character inspiration while preserving the collection identity.",
      `User concept: ${concept}.`,
      `Style: ${styleInstruction()}.`,
      "Make it feel like a polished social meme or campaign visual, not a basic paint collage.",
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
      planEl.innerHTML = state.aiPlan || "Describe the joke or moment. Gerry's AI Studio will shape it into polished Sappy-ready options.";
      planEl.classList.toggle("working", status === "loading");
    }
  }

  function generatedCard(image, index) {
    return `
      <article class="ai-result-card">
        <div class="ai-result-media">
          ${image.url ? `<img src="${image.url}" alt="Generated Sappy meme ${index + 1}" loading="lazy">` : `<div class="ai-result-fallback">${image.svg || "AI preview"}</div>`}
        </div>
        <div class="ai-result-actions">
          <span>${image.model || "studio preview"}</span>
          ${image.url ? `<a class="btn btn-ghost btn-sm" href="${image.url}" target="_blank" rel="noopener">Open</a>` : ""}
        </div>
      </article>`;
  }

  function renderAIResults() {
    const grid = $("airesults");
    if (!grid) return;
    grid.innerHTML = state.aiImages.length
      ? state.aiImages.map(generatedCard).join("")
      : `<div class="ai-empty">Generated memes will appear here. Add a concept and let Gerry's AI Studio build campaign-ready options.</div>`;
  }

  async function generatePremiumMemes() {
    const concept = $("aiprompt").value.trim();
    if (!concept) { S.toast("Give Gerry's AI Studio a meme concept first."); return; }
    state.aiPrompt = concept;
    state.aiStyle = $("aistyle").value;
    state.aiRatio = $("airatio").value;
    state.aiCount = Math.max(1, Math.min(4, +$("aicount").value || 2));
    setAIStatus("loading", "Strengthening the prompt, choosing composition notes, and sending it to the premium image lane...");
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
        }),
      });
      if (!r.ok) throw new Error("generation_failed");
      const json = await r.json();
      state.aiImages = json.images || [];
      setAIStatus("ready", json.plan || "Generated premium meme options.");
      renderAIResults();
      S.toast(json.provider === "fallback" ? "Drafts generated." : "Memes generated.");
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
      <div class="page-head">
        <span class="eyebrow">▪ GERRY'S AI STUDIO</span>
        <h1 class="section-title studio-title">Gerry's AI Studio.</h1>
        <p class="section-sub">Turn a quick Sappy idea into polished meme drafts, banners, replies and campaign visuals built for X.</p>
      </div>
      <section class="ai-studio-shell">
        <div class="ai-command">
          <div>
            <span class="eyebrow">▪ AI MEME MAKER</span>
            <h2>Start with the joke. Leave the art direction to Gerry.</h2>
            <p>Pick a vibe, choose a format, and generate ready-to-post Sappy concepts without wrestling with a blank canvas.</p>
          </div>
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
          <div class="ai-plan" id="aiplan">Describe the joke or moment. Gerry's AI Studio will shape it into polished Sappy-ready options.</div>
        </div>
        <div class="ai-results" id="airesults"></div>
      </section>
      <section class="ai-note-strip">
        <strong>Best results:</strong>
        <span>Use a clear reaction, a Sappy-specific moment, and where it should be posted: reply, banner, square meme, or story.</span>
      </section>`;
    renderAIResults();
    $("aigen").addEventListener("click", generatePremiumMemes);
    document.querySelectorAll("[data-ai-preset]").forEach((b) => b.addEventListener("click", () => applyAIPreset(b.dataset.aiPreset)));
    $("aiprompt").addEventListener("input", (e) => { state.aiPrompt = e.target.value; });
  }

  S.ready(function () { window.SappyLayout.mount("studio"); render(); S.init(); });
})();
