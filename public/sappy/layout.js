/* ============ sappy. ecosystem hub — shared header + footer (layout.js) ============ */
(function () {
  const L = window.Sappy.LINKS;
  const sealEmoji = '<video class="sappy-emoji" autoplay muted loop playsinline poster="/sappy/assets/sappy-seal-emoji.webp" aria-hidden="true"><source src="/sappy/assets/sappy-seal-emoji.webm" type="video/webm"></video>';

  function header(active) {
    const root = "/sappy/";
    const link = (href, label, id) => {
      const className = [id === active ? "active" : "", id === "studio" ? "nav-studio" : ""].filter(Boolean).join(" ");
      const labelHtml = id === "studio"
        ? '<span class="nav-studio-signature">Gerry Stephen</span><span>Studio</span>'
        : label;
      return `<a href="${root}${href}"${className ? ` class="${className}"` : ""}>${labelHtml}</a>`;
    };
    const aboutLink = '<a href="https://sappy.lol/seals" target="_blank" rel="noopener">About</a>';
    const links = `
      ${link("index.html", "Home", "home")}
      ${link("ecosystem.html", "Ecosystem", "eco")}
      ${link("studio.html", "Studio", "studio")}
      ${aboutLink}
      ${link("community.html", "Community", "community")}
    `;
    return `
    <header>
      <div class="wrap nav">
        <a class="brand" href="/sappy" aria-label="sappy. ecosystem hub">
          <span class="word">sappy<b>.</b></span>
          <span class="sub">ECOSYSTEM HUB</span>
        </a>
        <nav class="nav-links">
          ${links}
        </nav>
        <div class="nav-right">
          <button class="mobile-menu-btn" type="button" aria-expanded="false" aria-controls="sappy-mobile-menu" aria-label="Open menu">
            <span></span><span></span><span></span>
          </button>
          <a class="btn btn-ghost btn-sm hide-sm" href="${root}sealfolio.html">${sealEmoji}<span>Sealfolio</span></a>
          <button class="btn btn-dark btn-sm" data-connect>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:1px;"><path d="M3 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2"/><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M16 13.5h.01"/></svg>
            Connect Wallet
          </button>
        </div>
      </div>
      <nav class="mobile-menu" id="sappy-mobile-menu" hidden>
        <div class="wrap mobile-menu-inner">
          ${links}
          <a href="${root}sealfolio.html">${sealEmoji}<span>Sealfolio</span></a>
        </div>
      </nav>
    </header>`;
  }

  function footer(active) {
    return `
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
      wireMobileMenu(h);
      window.Sappy.renderDir(document.getElementById("dir"));
    },
  };

  function wireMobileMenu(headerRoot) {
    const button = headerRoot?.querySelector?.(".mobile-menu-btn");
    const menu = headerRoot?.querySelector?.("#sappy-mobile-menu");
    if (!button || !menu) return;
    button.addEventListener("click", () => {
      const open = menu.hasAttribute("hidden");
      menu.toggleAttribute("hidden", !open);
      button.setAttribute("aria-expanded", String(open));
      button.classList.toggle("open", open);
    });
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      menu.setAttribute("hidden", "");
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("open");
    }));
  }
})();
