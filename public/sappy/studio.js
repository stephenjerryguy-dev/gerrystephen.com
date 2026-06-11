/* ============ studio.js - Gerry Stephen's Seal Studio ============ */
(function () {
  const S = window.Sappy;
  const STORE_KEY = "sappy.studio.assets.v1";

  const GERRY = {
    type: "reference",
    id: "gerry",
    name: "Gerry reference seal",
    collection: "Studio reference set",
    image: "/sappy/assets/studio/seal-character-sheet.png",
    hero: "/sappy/assets/studio/seal-chef-scene.png",
    poseGrid: "/sappy/assets/studio/seal-pose-grid.png",
    traits: [
      { trait_type: "Base", value: "round Sappy seal" },
      { trait_type: "Headwear", value: "black studio cap" },
      { trait_type: "Clothes", value: "orange shirt" },
      { trait_type: "Expression", value: "soft happy face" },
    ],
    outfitSummary: "Round white seal body; black studio cap; orange shirt; simple happy face; clean mascot proportions.",
  };

  const FORMATS = [
    {
      id: "reference",
      label: "Reference card",
      kicker: "clean identity",
      copy: "A compact card that locks the seal, traits, caption and use notes.",
    },
    {
      id: "turnaround",
      label: "Turnaround sheet",
      kicker: "Gerry set",
      copy: "A pose sheet for the studio reference seal. On-chain seals keep their original angle.",
    },
    {
      id: "scene",
      label: "Scene concept",
      kicker: "share-ready brief",
      copy: "A scene direction that tells an image model how the real seal becomes the main character.",
    },
  ];

  const SCENES = [
    {
      id: "kitchen",
      name: "Kitchen alpha",
      prompt: "POV: You found alpha at 4am and now you are cooking breakfast while the timeline sleeps.",
      palette: "linear-gradient(135deg,#ffe4b7 0%,#fff5df 44%,#cdefff 100%)",
      accent: "#f59f35",
      props: "sunlit kitchen, warm counter, egg pan, cozy morning light",
    },
    {
      id: "arctic",
      name: "Arctic field note",
      prompt: "When the whole pod is searching for signal and your seal already found it.",
      palette: "linear-gradient(135deg,#d9f5ff 0%,#f7fbff 46%,#b8d8ff 100%)",
      accent: "#1e93d6",
      props: "ice field, bright sky, crisp shadows, expedition sticker energy",
    },
    {
      id: "timeline",
      name: "Timeline reply",
      prompt: "That one reply that turns into the entire group chat saying ARF ARF.",
      palette: "linear-gradient(135deg,#151c31 0%,#285f8f 52%,#95dfff 100%)",
      accent: "#8fd8ff",
      props: "social card, midnight glow, notification bubbles, meme caption space",
    },
    {
      id: "beach",
      name: "Low tide legend",
      prompt: "The seal that brought calm water energy to a noisy market day.",
      palette: "linear-gradient(135deg,#fff0bd 0%,#a8e7ff 48%,#56c9a6 100%)",
      accent: "#33b889",
      props: "soft beach, glassy water, small shells, breezy sticker finish",
    },
  ];

  const state = {
    step: 0,
    subjectType: "gerry",
    tokenId: "",
    tokenLoading: false,
    tokenError: "",
    seal: null,
    format: "reference",
    scene: "kitchen",
    caption: "",
    shareFrame: true,
    plan: "",
  };

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function normalizeTraits(traits) {
    return Array.isArray(traits) ? traits.filter((trait) => trait && (trait.trait_type || trait.value)).slice(0, 8) : [];
  }

  function getSubject() {
    return state.subjectType === "token" && state.seal ? state.seal : GERRY;
  }

  function getScene() {
    return SCENES.find((scene) => scene.id === state.scene) || SCENES[0];
  }

  function getFormat() {
    return FORMATS.find((format) => format.id === state.format) || FORMATS[0];
  }

  function getSubjectImage() {
    const subject = getSubject();
    return subject.image || GERRY.image;
  }

  function shortTraitLine(subject) {
    const traits = normalizeTraits(subject.traits);
    if (!traits.length) return subject.outfitSummary || "Sappy proportions, visible original outfit, same seal identity.";
    return traits.map((trait) => `${trait.trait_type || "Trait"}: ${trait.value}`).join("; ");
  }

  function buildBrief() {
    const subject = getSubject();
    const scene = getScene();
    const format = getFormat();
    const identity = shortTraitLine(subject);
    const caption = state.caption.trim() || scene.prompt;
    if (state.format === "turnaround") {
      return `Create a clean Sappy Seal turnaround reference sheet for ${subject.name}. Keep the exact same character identity across angles: ${identity}. White or very light studio background, thick black linework, simple readable proportions, no extra characters, no trait changes.`;
    }
    if (state.format === "scene") {
      return `Use ${subject.name} as the main character in a polished Sappy-style scene. Preserve the exact seal identity and visible traits: ${identity}. Scene: ${scene.props}. Caption idea: "${caption}" The character should replace the main subject in the scene, not appear as a pasted sticker. Keep cute Sappy proportions, clean linework, readable composition, no extra limbs, no changed outfit.`;
    }
    return `Create a reusable reference card for ${subject.name}. Preserve the exact seal identity: ${identity}. Include a clean front-facing crop, trait notes, and a short caption: "${caption}" Keep it polished, simple, and share-ready.`;
  }

  function readLibrary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch (error) {
      return [];
    }
  }

  function writeLibrary(items) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, 12)));
    } catch (error) {}
  }

  function addLibraryItem() {
    const subject = getSubject();
    const scene = getScene();
    const format = getFormat();
    const item = {
      id: Date.now(),
      title: `${subject.name} - ${format.label}`,
      subtitle: state.format === "scene" ? scene.name : format.kicker,
      image: getSubjectImage(),
      brief: buildBrief(),
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    writeLibrary([item].concat(readLibrary()));
    return item;
  }

  function downloadBrief() {
    const subject = getSubject();
    const scene = getScene();
    const format = getFormat();
    const text = [
      "Gerry Stephen's Seal Studio",
      "",
      `Subject: ${subject.name}`,
      `Format: ${format.label}`,
      `Scene: ${scene.name}`,
      "",
      "Image brief:",
      buildBrief(),
      "",
      "Negative prompt:",
      "random mascot, different seal, changed outfit, changed traits, extra limbs, malformed face, low detail, blurry text, off-brand style",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sappy-studio-${subject.id || "concept"}-${format.id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadSvgCard() {
    const subject = getSubject();
    const scene = getScene();
    const format = getFormat();
    const caption = esc(state.caption.trim() || scene.prompt);
    const title = esc(subject.name);
    const formatLabel = esc(format.label);
    const image = esc(getSubjectImage());
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e4f6ff"/>
      <stop offset="48%" stop-color="#fff9ed"/>
      <stop offset="100%" stop-color="#c6ecff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" rx="64" fill="url(#bg)"/>
  <rect x="72" y="72" width="1056" height="1056" rx="48" fill="#ffffff" fill-opacity="0.74" stroke="#d9cdb9" stroke-width="4"/>
  <image href="${image}" x="250" y="110" width="700" height="700" preserveAspectRatio="xMidYMid meet"/>
  <text x="92" y="900" font-family="Arial Black, Arial, sans-serif" font-size="70" fill="#151c23">${title}</text>
  <text x="92" y="972" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#1e6ea5">${formatLabel}</text>
  <foreignObject x="92" y="1014" width="1016" height="110">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font:700 34px Arial,sans-serif;color:#151c23;line-height:1.15">${caption}</div>
  </foreignObject>
</svg>`.trim();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sappy-studio-${subject.id || "concept"}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function heroMarkup() {
    return `
      <section class="studio-lab-hero">
        <div class="studio-lab-copy">
          <span class="eyebrow">▪ AI CREATIVE STUDIO</span>
          <h1 class="section-title studio-title">Gerry Stephen's Seal Studio.</h1>
          <p class="section-sub">Pick a seal, choose a format, and turn it into a clean reference card, scene brief, or share-ready concept. The scene can change. The seal identity should not.</p>
          <div class="studio-stepper" aria-label="Studio steps">
            ${["Subject", "Format", "Customize", "Export"].map((label, index) => `
            <button type="button" class="${state.step === index ? "active" : ""}" data-step="${index}">
                <b>${String(index + 1).padStart(2, "0")}</b><span>${label}</span>
              </button>
            `).join("")}
          </div>
          <div class="studio-hero-actions">
            <button type="button" class="btn btn-accent" data-jump-workbench>Start creating</button>
            <a class="btn btn-ghost" href="/sappy/sealfolio.html">Use my Sealfolio</a>
          </div>
        </div>
        <div class="studio-hero-preview">
          <img src="/sappy/assets/studio/seal-chef-scene.png" alt="Sappy Seal scene adaptation">
          <div class="studio-preview-card">
            <b>Scene adaptation</b>
            <span>Real token -> same seal -> new scenario</span>
          </div>
        </div>
      </section>`;
  }

  function subjectMarkup() {
    const subject = getSubject();
    const tokenReady = state.subjectType === "token" && state.seal;
    return `
      <section class="studio-panel studio-subject-panel" data-panel="subject">
        <div class="studio-panel-head">
          <span class="eyebrow">▪ 01 SUBJECT</span>
          <h2>Choose the seal.</h2>
          <p>Use the Gerry reference set, or load an actual Sappy Seal by token number.</p>
        </div>
        <div class="studio-subject-grid">
          <button type="button" class="studio-subject-card ${state.subjectType === "gerry" ? "active" : ""}" data-subject="gerry">
            <img src="${GERRY.image}" alt="Gerry reference seal">
            <span>Reference set</span>
            <b>Gerry</b>
            <small>Best for pose sheets and model reference.</small>
          </button>
          <div class="studio-subject-card studio-token-card ${state.subjectType === "token" ? "active" : ""}">
            <div class="studio-token-loader">
              <label for="seal-token">On-chain seal #</label>
              <div>
                <input id="seal-token" class="input" inputmode="numeric" pattern="[0-9]*" placeholder="Example: 1" value="${esc(state.tokenId)}">
                <button type="button" class="btn btn-accent" data-load-token>${state.tokenLoading ? "Loading..." : "Load"}</button>
              </div>
            </div>
            <div class="studio-token-preview">
              ${tokenReady ? `<img src="${esc(state.seal.image)}" alt="${esc(state.seal.name)}">` : `<img src="/sappy/assets/sappy-app-icon-512.png" alt="">`}
              <div>
                <span>${tokenReady ? "Token loaded" : "Any seal #"}</span>
                <b>${tokenReady ? esc(state.seal.name) : "Load a Sappy Seal"}</b>
                <small>${tokenReady ? esc(shortTraitLine(state.seal)) : "The studio preserves visible traits from metadata."}</small>
              </div>
            </div>
            ${state.tokenError ? `<p class="studio-error">${esc(state.tokenError)}</p>` : ""}
          </div>
        </div>
      </section>`;
  }

  function formatMarkup() {
    return `
      <section class="studio-panel" data-panel="format">
        <div class="studio-panel-head">
          <span class="eyebrow">▪ 02 FORMAT</span>
          <h2>Pick the output.</h2>
          <p>Reference cards and scene concepts work for any seal. Turnarounds use the Gerry pose set.</p>
        </div>
        <div class="studio-format-grid">
          ${FORMATS.map((format) => {
            const disabled = format.id === "turnaround" && state.subjectType === "token";
            return `
              <button type="button" class="studio-format-card ${state.format === format.id ? "active" : ""}" data-format="${format.id}" ${disabled ? "disabled" : ""}>
                <span>${esc(format.kicker)}</span>
                <b>${esc(format.label)}</b>
                <small>${esc(disabled ? "Turnaround sheets need the studio reference pose set." : format.copy)}</small>
              </button>`;
          }).join("")}
        </div>
      </section>`;
  }

  function customizeMarkup() {
    return `
      <section class="studio-panel" data-panel="customize">
        <div class="studio-panel-head">
          <span class="eyebrow">▪ 03 CUSTOMIZE</span>
          <h2>Direct the scene.</h2>
          <p>Keep it clear enough that the seal replaces the main character, not just gets pasted into the corner.</p>
        </div>
        <div class="studio-custom-grid">
          <label class="studio-field">
            <span>Scene</span>
            <select class="input" data-scene-select>
              ${SCENES.map((scene) => `<option value="${scene.id}" ${scene.id === state.scene ? "selected" : ""}>${esc(scene.name)}</option>`).join("")}
            </select>
          </label>
          <label class="studio-field studio-field-wide">
            <span>Caption or prompt hook</span>
            <textarea class="input studio-caption" data-caption placeholder="${esc(getScene().prompt)}">${esc(state.caption)}</textarea>
          </label>
          <label class="studio-toggle">
            <input type="checkbox" data-share-frame ${state.shareFrame ? "checked" : ""}>
            <span>Add share frame</span>
          </label>
        </div>
      </section>`;
  }

  function previewMarkup() {
    const subject = getSubject();
    const scene = getScene();
    const format = getFormat();
    const image = getSubjectImage();
    const caption = state.caption.trim() || scene.prompt;
    const traits = normalizeTraits(subject.traits);
    if (state.format === "turnaround") {
      return `
        <div class="studio-live-card studio-turnaround-card ${state.shareFrame ? "framed" : ""}">
          <div class="studio-live-label">Turnaround sheet</div>
          <img src="${GERRY.poseGrid}" alt="Gerry turnaround sheet">
          <div class="studio-live-caption">${esc(subject.name)} pose reference</div>
        </div>`;
    }
    if (state.format === "scene") {
      return `
        <div class="studio-live-card studio-scene-card ${state.shareFrame ? "framed" : ""}" style="--scene-bg:${scene.palette};--scene-accent:${scene.accent};">
          <div class="studio-scene-surface">
            <div class="studio-live-label">Identity locked</div>
            <img class="studio-scene-subject" src="${esc(image)}" alt="${esc(subject.name)}">
            <div class="studio-scene-caption">${esc(caption)}</div>
          </div>
          <div class="studio-scene-notes">
            <b>${esc(scene.name)}</b>
            <span>${esc(scene.props)}</span>
          </div>
        </div>`;
    }
    return `
      <div class="studio-live-card studio-reference-card ${state.shareFrame ? "framed" : ""}">
        <div class="studio-live-label">Reference card</div>
        <img class="studio-reference-image" src="${esc(image)}" alt="${esc(subject.name)}">
        <div class="studio-reference-copy">
          <b>${esc(subject.name)}</b>
          <span>${esc(subject.collection || "Sappy Seals")}</span>
          <p>${esc(caption)}</p>
          <div class="studio-traits">
            ${(traits.length ? traits : GERRY.traits).slice(0, 5).map((trait) => `<em>${esc(trait.trait_type || "Trait")}: ${esc(trait.value)}</em>`).join("")}
          </div>
        </div>
      </div>`;
  }

  function workbenchMarkup() {
    const plan = buildBrief();
    return `
      <section class="studio-workbench" id="studio-workbench">
        <div class="studio-workbench-form">
          ${subjectMarkup()}
          ${formatMarkup()}
          ${customizeMarkup()}
        </div>
        <aside class="studio-preview-panel">
          <div class="studio-panel-head">
            <span class="eyebrow">LIVE DIRECTOR PREVIEW</span>
            <h2>Your seal stays the hero.</h2>
            <p>The generated direction is designed to preserve the token identity while changing the scenario.</p>
          </div>
          <div id="studio-live-preview">${previewMarkup()}</div>
          <div class="studio-brief">
            <span>Image-model brief</span>
            <p>${esc(plan)}</p>
          </div>
          <div class="studio-export-row">
            <button type="button" class="btn btn-accent" data-generate>Generate concept kit</button>
            <button type="button" class="btn btn-ghost" data-download-brief>Download brief</button>
            <button type="button" class="btn btn-ghost" data-download-svg>Download card</button>
          </div>
          <div class="studio-plan" aria-live="polite">${state.plan ? esc(state.plan) : "Ready when you are. The kit saves below and stays on this device."}</div>
        </aside>
      </section>`;
  }

  function libraryMarkup() {
    const items = readLibrary();
    return `
      <section class="studio-library">
        <div class="eco-head">
          <span class="eyebrow">▪ EXPORT LIBRARY</span>
          <h2 class="section-title">Saved concepts.</h2>
          <p class="section-sub">Your recent studio kits stay in this browser so you can keep iterating without starting over.</p>
        </div>
        <div class="studio-library-grid">
          ${items.length ? items.map((item) => `
            <article class="studio-library-card">
              <img src="${esc(item.image)}" alt="">
              <div>
                <span>${esc(item.date)} · ${esc(item.subtitle)}</span>
                <b>${esc(item.title)}</b>
                <p>${esc(item.brief)}</p>
              </div>
            </article>
          `).join("") : `
            <div class="studio-library-empty">
              <b>No saved concepts yet.</b>
              <span>Generate a kit and it will land here.</span>
            </div>`}
        </div>
      </section>`;
  }

  function render() {
    const studio = document.getElementById("studio");
    if (!studio) return;
    studio.innerHTML = `
      ${heroMarkup()}
      ${workbenchMarkup()}
      ${libraryMarkup()}
    `;
    bind(studio);
  }

  async function loadToken() {
    const id = String(state.tokenId || "").trim();
    if (!/^\d{1,5}$/.test(id)) {
      state.subjectType = "token";
      state.tokenError = "Enter a Sappy Seal number from 0 to 9999.";
      render();
      return;
    }
    state.subjectType = "token";
    state.tokenLoading = true;
    state.tokenError = "";
    render();
    try {
      const response = await fetch(`/api/sappy-seal?id=${encodeURIComponent(id)}`, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Could not load that seal yet. Check OpenSea/API config and try again.");
      const seal = await response.json();
      state.seal = {
        ...seal,
        type: "token",
        id,
        traits: normalizeTraits(seal.traits),
      };
      state.tokenError = "";
      if (state.format === "turnaround") state.format = "reference";
    } catch (error) {
      state.seal = null;
      state.tokenError = error.message || "Could not load that seal yet.";
    } finally {
      state.tokenLoading = false;
      render();
    }
  }

  function generateKit() {
    state.plan = "Inking outlines... locking traits... building the export kit.";
    render();
    setTimeout(() => {
      const item = addLibraryItem();
      state.plan = `${item.title} saved. Download the brief or keep iterating.`;
      render();
      const library = document.querySelector(".studio-library");
      if (library) library.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 700);
  }

  function bind(root) {
    root.querySelectorAll("[data-step]").forEach((button) => {
      button.addEventListener("click", () => {
        state.step = Number(button.dataset.step) || 0;
        const panels = ["subject", "format", "customize"];
        const target = panels[state.step] ? root.querySelector(`[data-panel="${panels[state.step]}"]`) : root.querySelector(".studio-preview-panel");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
        render();
      });
    });
    root.querySelector("[data-jump-workbench]")?.addEventListener("click", () => {
      root.querySelector("#studio-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    root.querySelectorAll("[data-subject]").forEach((button) => {
      button.addEventListener("click", () => {
        state.subjectType = button.dataset.subject;
        state.tokenError = "";
        if (state.subjectType === "gerry") state.format = state.format || "reference";
        if (state.subjectType === "token" && state.format === "turnaround") state.format = "reference";
        render();
      });
    });
    const tokenInput = root.querySelector("#seal-token");
    tokenInput?.addEventListener("input", (event) => {
      state.tokenId = event.target.value.replace(/[^\d]/g, "").slice(0, 5);
      event.target.value = state.tokenId;
    });
    tokenInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadToken();
      }
    });
    root.querySelector("[data-load-token]")?.addEventListener("click", loadToken);
    root.querySelectorAll("[data-format]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        state.format = button.dataset.format;
        state.step = Math.max(state.step, 1);
        render();
      });
    });
    root.querySelector("[data-scene-select]")?.addEventListener("change", (event) => {
      state.scene = event.target.value;
      state.step = Math.max(state.step, 2);
      render();
    });
    root.querySelector("[data-caption]")?.addEventListener("input", (event) => {
      state.caption = event.target.value;
      const preview = root.querySelector("#studio-live-preview");
      const brief = root.querySelector(".studio-brief p");
      if (preview) preview.innerHTML = previewMarkup();
      if (brief) brief.textContent = buildBrief();
    });
    root.querySelector("[data-share-frame]")?.addEventListener("change", (event) => {
      state.shareFrame = event.target.checked;
      render();
    });
    root.querySelector("[data-generate]")?.addEventListener("click", generateKit);
    root.querySelector("[data-download-brief]")?.addEventListener("click", downloadBrief);
    root.querySelector("[data-download-svg]")?.addEventListener("click", downloadSvgCard);
  }

  S.ready(function () {
    window.SappyLayout.mount("studio");
    render();
    S.init();
  });
})();
