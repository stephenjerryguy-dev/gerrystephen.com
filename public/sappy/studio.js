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
  const SAPPY_SEALS_CONTRACT = "0x364c828ee171616a39897688a831c2499ad972ec";
  const TOKEN_URI_SELECTOR = "0xc87b56dd";
  const ETH_RPC_URLS = ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"];

  const state = {
    sealNumber: "7262",
    sealRef: null,
    aiPrompt: AI_PRESETS[0][1],
    aiStyle: "viral",
    aiRatio: "1:1",
    aiCount: 2,
    aiImages: [],
    aiStatus: "idle",
    aiPlan: "",
  };
  const isLocal = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

  async function fetchJson(path) {
    const urls = [path];
    if (isLocal) urls.push(`https://www.gerrystephen.com${path}`, `https://gerrystephen.com${path}`);
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

  function ipfsToHttps(uri) {
    if (!uri || typeof uri !== "string") return "";
    if (uri.startsWith("ipfs://ipfs/")) return `https://ipfs.io/ipfs/${uri.slice(12)}`;
    if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
    if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
    return uri;
  }

  function tokenCallData(tokenId) {
    return `${TOKEN_URI_SELECTOR}${BigInt(tokenId).toString(16).padStart(64, "0")}`;
  }

  function decodeAbiString(hex) {
    if (!hex || hex === "0x") return "";
    const clean = hex.slice(2);
    const offset = Number.parseInt(clean.slice(0, 64), 16) * 2;
    const length = Number.parseInt(clean.slice(offset, offset + 64), 16) * 2;
    const data = clean.slice(offset + 64, offset + 64 + length);
    const bytes = new Uint8Array((data.match(/.{1,2}/g) || []).map((byte) => Number.parseInt(byte, 16)));
    return new TextDecoder().decode(bytes).replace(/\0+$/, "");
  }

  function normalizeTraits(rawTraits) {
    return (Array.isArray(rawTraits) ? rawTraits : [])
      .map((trait) => ({
        trait_type: trait.trait_type || trait.traitType || trait.type || trait.key || "",
        value: trait.value || trait.trait_value || trait.traitValue || trait.name || "",
      }))
      .filter((trait) => trait.trait_type || trait.value);
  }

  function outfitSummary(traits) {
    const wanted = /background|body|skin|fur|clothes|clothing|outfit|shirt|head|hat|eyes|mouth|accessory|accessories|face/i;
    const picked = traits.filter((trait) => wanted.test(`${trait.trait_type} ${trait.value}`));
    return (picked.length ? picked : traits).slice(0, 10).map((trait) => `${trait.trait_type || "Trait"}: ${trait.value}`).join("; ");
  }

  async function fetchSealMetadataFromChain(tokenId) {
    for (const rpc of ETH_RPC_URLS) {
      try {
        const response = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_call",
            params: [{ to: SAPPY_SEALS_CONTRACT, data: tokenCallData(tokenId) }, "latest"],
          }),
        });
        if (!response.ok) continue;
        const rpcJson = await response.json();
        const tokenUri = ipfsToHttps(decodeAbiString(rpcJson.result));
        if (!tokenUri) continue;
        const metadata = await fetch(tokenUri, { headers: { accept: "application/json" } }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        if (!metadata) continue;
        const traits = normalizeTraits(metadata.attributes || metadata.traits);
        return {
          id: String(tokenId),
          name: metadata.name || `Sappy Seal #${tokenId}`,
          collection: "Sappy Seals",
          image: ipfsToHttps(metadata.image || metadata.image_url || metadata.animation_url),
          openseaUrl: `https://opensea.io/item/ethereum/${SAPPY_SEALS_CONTRACT}/${tokenId}`,
          traits,
          outfitSummary: outfitSummary(traits),
          source: "tokenURI",
        };
      } catch (_) {}
    }
    return null;
  }

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
      "Create a polished Sappy Seal scene adaptation like a finished illustration: strong character consistency, clean environment, expressive pose, and premium social polish.",
      "Replace the main character in the target scene with the loaded Sappy Seal. The final image should look like the NFT seal is now performing that scene, not like two reference images placed side by side.",
      "Treat the loaded NFT as the identity lock. Translate the real seal's outfit, headwear, accessories, expression, and colors onto the character in the scene instead of inventing a random seal.",
      "Use the attached references as quality direction: cute full-body seal character, consistent turns/poses, and finished environment scenes.",
      "Avoid clutter. Leave clean negative space for captions. Keep the tone wholesome, funny, and community-native.",
      "Do not reference Okay Bears or any other collection.",
    ].join(" ");
  }

  function setAIStatus(status, plan) {
    state.aiStatus = status;
    if (plan !== undefined) state.aiPlan = plan;
    const btn = $("aigen");
    if (btn) {
      btn.textContent = status === "loading" ? "Building scene pack..." : "Generate scene pack";
      btn.disabled = status === "loading";
    }
    const planEl = $("aiplan");
    if (planEl) {
      planEl.innerHTML = state.aiPlan || "Describe the joke or moment. Claude will shape it into a Sappy-ready scene pack.";
      planEl.classList.toggle("working", status === "loading");
    }
  }

  function ratioLabel() {
    const match = AI_RATIOS.find(([value]) => value === state.aiRatio);
    return match ? `${match[1]} · ${match[0]}` : state.aiRatio;
  }

  function generatedCard(image, index) {
    const prompt = image.revisedPrompt || image.prompt || "";
    const sealImage = image.referenceUrl || state.sealRef?.image || "";
    const sceneImage = image.sceneReferenceUrl || REFERENCE_ASSETS[index % REFERENCE_ASSETS.length]?.[0] || "";
    return `
      <article class="ai-result-card">
        <div class="ai-result-media">
          ${image.url ? `<img src="${image.url}" alt="Generated Sappy meme ${index + 1}" loading="lazy">` : `
            <div class="ai-scene-board ai-scene-replace">
              ${sceneImage ? `<img class="ai-scene-bg" src="${esc(sceneImage)}" alt="${esc(image.sceneReferenceLabel || "Scene reference")}" loading="lazy">` : ""}
              <div class="ai-replacement-token">
                ${sealImage ? `<img src="${esc(sealImage)}" alt="${esc(image.sealName || "Loaded seal reference")}" loading="lazy" referrerpolicy="no-referrer">` : ""}
                <span>Replace main character</span>
              </div>
              <div class="ai-replacement-arrow">→</div>
              <div class="ai-replacement-label">${esc(image.sealName || "Loaded seal")} becomes the scene lead</div>
              <div class="ai-scene-caption">${esc(image.caption || "Sappy scene ready")}</div>
            </div>`}
        </div>
        <div class="ai-result-brief">
          ${sealImage ? `<img src="${esc(sealImage)}" alt="${esc(image.sealName || "Seal reference")}" loading="lazy" referrerpolicy="no-referrer">` : ""}
          <p>${esc(image.adaptationNotes || image.caption || "Scene pack ready for image generation.")}</p>
        </div>
        ${image.negativePrompt ? `<div class="ai-negative"><strong>Avoid</strong><p>${esc(image.negativePrompt)}</p></div>` : ""}
        ${prompt ? `<div class="ai-prompt-output"><strong>Image brief</strong><p>${esc(prompt)}</p></div>` : ""}
        <div class="ai-result-actions">
          <span>${image.model || "studio scene pack"} · ${ratioLabel()}</span>
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
            <strong>Load a token, write the bit, build a scene pack.</strong>
            <p>Outputs lock the real Sappy Seal NFT as the character reference, then shape scene, pose, caption and negative prompt direction for a real image model or designer.</p>
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
      const json = await fetchJson(`/api/sappy-seal?id=${encodeURIComponent(id)}`)
        || await fetchSealMetadataFromChain(id);
      if (!json?.image) throw new Error("seal_load_failed");
      state.sealRef = json;
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
    setAIStatus("loading", "Claude is locking the NFT identity, shaping the scene, and writing image-model ready adaptation notes...");
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
      setAIStatus("ready", json.plan || "Generated premium Sappy scene packs.");
      renderAIResults();
      S.toast(json.provider === "fallback" ? "Scene packs drafted." : json.provider === "claude" ? "Claude scene packs generated." : "Memes generated.");
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
          <h1 class="section-title studio-title">Turn a real seal into a scene-ready meme.</h1>
          <p class="section-sub">Enter the token number, lock the actual NFT traits, then let Claude build scene direction, captions and image-model prompts that keep your seal recognizable.</p>
          <div class="studio-steps" aria-label="Studio workflow">
            <span>1. Load seal</span>
            <span>2. Pick the bit</span>
            <span>3. Generate scene pack</span>
          </div>
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
            <h2>Choose the seal. Direct the scene.</h2>
            <p>OpenSea metadata powers the character lock, so outfits, headwear, expressions and palettes stay tied to the token instead of drifting into a random seal.</p>
          </div>
          <div class="studio-seal-loader">
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
          <button class="btn btn-accent full ai-generate" id="aigen">Generate scene pack</button>
          <div class="ai-plan" id="aiplan">Describe the joke or moment. Claude will shape it into a Sappy-ready scene pack.</div>
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
          <h2 class="section-title">Scene packs, not fake renders.</h2>
          <p class="section-sub">Each run returns captions, visual direction, the real seal reference, negative prompts and copyable image briefs.</p>
        </div>
        <div class="ai-results" id="airesults"></div>
      </section>
      <section class="ai-note-strip">
        <strong>Reference quality:</strong>
        <span>Studio uses the real seal token plus these target examples for character consistency, pose control, and finished-scene polish. Claude writes the direction; a dedicated image model is still needed for final renders.</span>
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
