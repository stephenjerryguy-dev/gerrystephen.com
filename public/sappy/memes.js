/* ============ memes.js — retired tool route ============ */
(function () {
  const S = window.Sappy;

  function render() {
    document.getElementById("memes").innerHTML = `
      <div class="page-head">
        <div class="lane-head">
          <div>
            <span class="eyebrow">▪ CREATOR TOOLS</span>
            <h1 class="section-title" style="font-size:clamp(34px,5vw,56px);">Creator tools are being rebuilt.</h1>
            <p class="section-sub">We are keeping this quiet until the next version is worth shipping.</p>
          </div>
          <a class="btn btn-accent" href="/sappy/studio.html">Go to Studio →</a>
        </div>
      </div>`;
  }

  S.ready(function () { window.SappyLayout.mount("memes"); render(); S.init(); });
})();
