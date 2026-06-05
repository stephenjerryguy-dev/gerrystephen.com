/* ============ studio.js — rebuilding Gerry Stephen's Studio ============ */
(function () {
  const S = window.Sappy;
  const MEME_URL = S.LINKS.meme;

  function render() {
    const studio = document.getElementById("studio");
    if (!studio) return;
    studio.innerHTML = `
      <section class="studio-soon">
        <div>
          <span class="eyebrow">▪ GERRY STEPHEN'S STUDIO</span>
          <h1 class="section-title studio-title">Studio is being rebuilt.</h1>
          <p class="section-sub">The next version has to lock the real Sappy Seal token, preserve its traits, and place that exact seal into a new scene. Until that is right, the AI studio stays off.</p>
          <div class="studio-steps" aria-label="Studio rebuild goals">
            <span>1. Real token identity</span>
            <span>2. Trait-preserving scene</span>
            <span>3. Image-model ready</span>
          </div>
          <div class="studio-hero-actions">
            <a class="btn btn-accent" href="#meme-machine">Use Meme Machine ↓</a>
            <a class="btn btn-ghost" href="/sappy/community.html">Find your profile →</a>
          </div>
        </div>
        <div class="studio-soon-art">
          <img src="/sappy/assets/studio/seal-chef-scene.png" alt="Sappy Seal studio concept">
          <div class="studio-preview-card">
            <b>Coming soon</b>
            <span>Exact seal → new scene</span>
          </div>
        </div>
      </section>

      <section class="studio-meme-section" id="meme-machine">
        <div class="lane-head">
          <div>
            <span class="eyebrow">▪ MEME MACHINE</span>
            <h2 class="section-title">Meme while Studio cooks.</h2>
            <p class="section-sub">The official Sappy Meme Machine stays live here while Gerry Stephen's Studio is rebuilt from scratch.</p>
          </div>
          <a class="btn btn-accent" href="${MEME_URL}" target="_blank" rel="noopener">Open official tool ↗</a>
        </div>
        <div class="embed-wrap studio-embed">
          <div class="embed-bar">
            <span class="embed-dot"></span><span class="embed-dot y"></span><span class="embed-dot g"></span>
            <span class="embed-url">mememachine.sappyseals.io</span>
            <a class="btn btn-ghost btn-sm" href="${MEME_URL}" target="_blank" rel="noopener" style="margin-left:auto;">Open ↗</a>
          </div>
          <iframe class="embed-frame" id="studio-mm" src="${MEME_URL}" title="Sappy Meme Machine" loading="lazy"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
          <div class="embed-fallback" id="studio-mm-fallback">
            <div style="text-align:center;">
              <h3 style="font-family:var(--font-display);font-weight:800;margin:0 0 8px;">Meme Machine is best in its own tab</h3>
              <p style="color:var(--ink-soft);margin:0 0 16px;max-width:42ch;">If your browser blocks the embedded tool, launch the official Meme Machine directly.</p>
              <a class="btn btn-accent" href="${MEME_URL}" target="_blank" rel="noopener">Launch Meme Machine ↗</a>
            </div>
          </div>
        </div>
      </section>`;

    const fr = document.getElementById("studio-mm");
    const fb = document.getElementById("studio-mm-fallback");
    let loaded = false;
    fr?.addEventListener("load", () => { loaded = true; });
    setTimeout(() => { if (!loaded) fb?.classList.add("show"); }, 4000);
  }

  S.ready(function () {
    window.SappyLayout.mount("studio");
    render();
    S.init();
  });
})();
