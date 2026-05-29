/* ============ memes.js — embeds the official Sappy Meme Machine ============ */
(function () {
  const S = window.Sappy;
  const URL = S.LINKS.meme; // https://mememachine.sappyseals.io/

  function render() {
    document.getElementById("memes").innerHTML = `
      <div class="page-head">
        <div class="lane-head">
          <div>
            <span class="eyebrow">▪ MEME MACHINE</span>
            <h1 class="section-title" style="font-size:clamp(34px,5vw,56px);">The Sappy Meme Machine.</h1>
            <p class="section-sub">The official tool — browse and generate hundreds of custom memes starring any seal, then auto-reply on X. Loaded live below.</p>
          </div>
          <a class="btn btn-accent" href="${URL}" target="_blank" rel="noopener">Open in new tab ↗</a>
        </div>
        <div class="embed-wrap">
          <div class="embed-bar">
            <span class="embed-dot"></span><span class="embed-dot y"></span><span class="embed-dot g"></span>
            <span class="embed-url">mememachine.sappyseals.io</span>
            <a class="btn btn-ghost btn-sm" href="${URL}" target="_blank" rel="noopener" style="margin-left:auto;">↗ Open</a>
          </div>
          <iframe class="embed-frame" id="mm" src="${URL}" title="Sappy Meme Machine" loading="lazy"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
          <div class="embed-fallback" id="mmfall">
            <div style="text-align:center;">
              <div style="font-size:42px;">🖼</div>
              <h3 style="font-family:var(--font-display);font-weight:800;margin:10px 0 6px;">Meme Machine is best in its own tab</h3>
              <p style="color:var(--ink-soft);margin:0 0 16px;max-width:40ch;">Some browsers block embedding. Tap below to launch the official tool.</p>
              <a class="btn btn-accent" href="${URL}" target="_blank" rel="noopener">🖼&nbsp; Launch Meme Machine ↗</a>
            </div>
          </div>
        </div>
        <p class="section-sub" style="margin-top:16px;">Want a quick caption-style meme instead? Build one in the <a href="studio.html" style="color:var(--accent-deep);font-weight:700;">Seal Studio →</a></p>
      </div>`;
    // reveal fallback if the frame can't be reached (cross-origin block)
    const fr = document.getElementById("mm"), fb = document.getElementById("mmfall");
    let loaded = false;
    fr.addEventListener("load", () => { loaded = true; try { if (!fr.contentWindow || fr.contentWindow.length === undefined) {} } catch (e) {} });
    setTimeout(() => { if (!loaded) fb.classList.add("show"); }, 4000);
  }

  S.ready(function () { window.SappyLayout.mount("memes"); render(); S.init(); });
})();
