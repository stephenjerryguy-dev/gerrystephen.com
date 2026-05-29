/* ============ sappy. ecosystem hub — shared header + footer (layout.js) ============ */
(function () {
  const L = window.Sappy.LINKS;

  function header(active) {
    const root = "/sappy-site/";
    const link = (href, label, id) =>
      `<a href="${root}${href}"${id === active ? ' class="active"' : ""}>${label}</a>`;
    return `
    <header>
      <div class="wrap nav">
        <a class="brand" href="/sappy" aria-label="sappy. ecosystem hub">
          <span class="word">sappy<b>.</b></span>
          <span class="sub">ECOSYSTEM HUB</span>
        </a>
        <nav class="nav-links">
          ${link("index.html", "Home", "home")}
          ${link("ecosystem.html", "Ecosystem", "eco")}
          ${link("studio.html", "Studio", "studio")}
          ${link("memes.html", "Memes", "memes")}
          ${link("community.html", "Community", "community")}
        </nav>
        <div class="nav-right">
          <a class="btn btn-ghost btn-sm hide-sm" href="${root}sealfolio.html">🦭&nbsp; Sealfolio</a>
          <button class="btn btn-dark btn-sm" data-connect>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:1px;"><path d="M3 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2"/><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M16 13.5h.01"/></svg>
            Connect Wallet
          </button>
        </div>
      </div>
    </header>`;
  }

  function footer(active) {
    const teamBand = active === "community" ? `
    <section class="band team-band" id="team">
      <div class="wrap">
        <span class="eyebrow" style="display:block;text-align:center;">▪ THE POD · CORE TEAM &amp; ECOSYSTEM</span>
        <h2 class="section-title" style="text-align:center;margin-top:12px;">Built by seals, for seals.</h2>
        <p class="section-sub" style="margin:14px auto 36px;text-align:center;">The Sappy-affiliated accounts steering the collection, the studio and the world — live from X.</p>
        <div class="team-grid" id="team-grid"></div>
      </div>
    </section>` : "";
    return teamBand + `
    <footer id="community-foot">
      <div class="wrap">
        <div class="foot-top">
          <div class="foot-brand">
            <div class="word">sappy<b>.</b></div>
            <p>The community hub for the Sappy Seals ecosystem.</p>
            <div class="foot-socials">
              <a href="${L.x}" target="_blank" rel="noopener">𝕏 @sappyseals</a>
              <a href="${L.discord}" target="_blank" rel="noopener"><img src="https://cdn.simpleicons.org/discord/ffffff" alt="" loading="lazy">Discord</a>
              <a href="${L.opensea}" target="_blank" rel="noopener"><img src="https://cdn.simpleicons.org/opensea/ffffff" alt="" loading="lazy">OpenSea</a>
              <a href="${L.omnia}" target="_blank" rel="noopener"><img src="https://www.google.com/s2/favicons?sz=64&domain=omnia.lol" alt="" loading="lazy">Omnia</a>
            </div>
          </div>
        </div>
        <div class="foot-bottom">
          <span>© 2026 sappy. ecosystem hub — a community-built fan hub. ARF ARF.</span>
          <span>Not affiliated with Sappy Brands LLC. Contracts &amp; art shown for reference.</span>
        </div>
      </div>
    </footer>`;
  }

  window.SappyLayout = {
    mount(active) {
      const h = document.getElementById("site-header");
      const f = document.getElementById("site-footer");
      if (h) h.innerHTML = header(active);
      if (f) f.innerHTML = footer(active);
      window.Sappy.renderTeam(document.getElementById("team-grid"));
      window.Sappy.renderDir(document.getElementById("dir"));
    },
  };
})();
