/* ============ studio.js — rebuilding Gerry Stephen's Studio ============ */
(function () {
  const S = window.Sappy;

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
      </section>`;
  }

  S.ready(function () {
    window.SappyLayout.mount("studio");
    render();
    S.init();
  });
})();
