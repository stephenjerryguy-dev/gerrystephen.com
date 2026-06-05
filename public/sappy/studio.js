/* ============ studio.js — Gerry Stephen's Studio coming soon ============ */
(function () {
  const S = window.Sappy;

  function render() {
    const studio = document.getElementById("studio");
    if (!studio) return;
    studio.innerHTML = `
      <section class="studio-soon">
        <div>
          <span class="eyebrow">▪ GERRY STEPHEN'S STUDIO</span>
          <h1 class="section-title studio-title">Gerry Stephen's Studio is coming soon.</h1>
          <p class="section-sub">A premium Sappy creative suite is on the way. Pick your seal, set the scene, and turn the pod's energy into visuals built for sharing.</p>
          <div class="studio-steps" aria-label="Studio rebuild goals">
            <span>1. Choose your seal</span>
            <span>2. Set the scene</span>
            <span>3. Share the vibe</span>
          </div>
          <div class="studio-hero-actions">
            <a class="btn btn-ghost" href="/sappy/community.html">Find your profile →</a>
          </div>
        </div>
        <div class="studio-soon-art">
          <img src="/sappy/assets/studio/seal-chef-scene.png" alt="Sappy Seal studio concept">
          <div class="studio-preview-card">
            <b>Coming soon</b>
            <span>Your seal → new scene</span>
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
