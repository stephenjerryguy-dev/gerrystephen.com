/* ============ sappy. ecosystem hub — shared engine (core.js) ============ */
window.Sappy = (function () {
  "use strict";

  const GW = [
    "https://ipfs.io/ipfs/",
    "https://dweb.link/ipfs/",
    "https://nftstorage.link/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://flk-ipfs.xyz/ipfs/",
  ];
  const PROXY = (u) => "https://api.codetabs.com/v1/proxy/?quest=" + u;
  const SEAL_CID = "QmUs4WQP47QKGwzPLjVMmhqTbspJfAC344abDEE2UT52HF"; // verified Sappy Seals image base
  const SEAL_SUPPLY = 10000;
  const RPCS = {
    eth: ["https://ethereum-rpc.publicnode.com", "https://rpc.ankr.com/eth", "https://eth.llamarpc.com", "https://1rpc.io/eth"],
    polygon: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com", "https://1rpc.io/matic"],
  };

  const randId = (n) => Math.floor(Math.random() * (n || SEAL_SUPPLY));
  const sealUrls = (id) => GW.map((g) => g + SEAL_CID + "/" + id + ".png");
  const ipfsToHttp = (u) => {
    if (/^https?:/.test(u)) return [u];
    const p = u.replace(/^ipfs:\/\//, "").replace(/^ipfs\//, "");
    return GW.map((g) => g + p);
  };

  // ---- on-chain reads ----
  const TIMEOUT = (ms) => (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
  async function ethCall(rpcs, to, data) {
    for (const rpc of rpcs) {
      try {
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, signal: TIMEOUT(7000),
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }) });
        const j = await r.json();
        if (j && j.result && j.result.length > 2) return j.result;
      } catch (e) {}
    }
    return null;
  }
  function decodeAbiString(hex) {
    const c = hex.slice(2);
    if (c.length < 128) return null;
    const len = parseInt(c.slice(64, 128), 16);
    if (!len || len > 4096) return null;
    const d = c.slice(128); let s = "";
    for (let i = 0; i < len; i++) { const b = parseInt(d.substr(i * 2, 2), 16); if (b) s += String.fromCharCode(b); }
    return s;
  }
  async function fetchJson(url) {
    try { const r = await fetch(url, { signal: TIMEOUT(8000) }); if (r.ok) return await r.json(); } catch (e) {}
    try { const r = await fetch(PROXY(url), { signal: TIMEOUT(9000) }); if (r.ok) return await r.json(); } catch (e) {}
    return null;
  }

  // ---- image loading with polished loading treatment ----
  function addLoader(frame) {
    let loader = frame.querySelector(".seal-loader");
    if (loader) return loader;
    loader = document.createElement("div");
    loader.className = "seal-loader";
    loader.innerHTML = '<span class="seal-loader-mark">sappy.</span><span class="seal-loader-ring"></span>';
    frame.appendChild(loader);
    return loader;
  }
  function clearLoader(frame) {
    const loader = frame.querySelector(".seal-loader");
    if (loader) loader.remove();
  }
  function addPhoto(frame, urls, onFail) {
    if (!urls || !urls.length) { if (onFail) onFail(); return; }
    addLoader(frame);
    const img = new Image();
    img.className = "seal-photo"; img.decoding = "async"; img.alt = "";
    let i = 0;
    img.onload = () => { img.classList.add("show"); clearLoader(frame); };
    img.onerror = () => { i++; if (i < urls.length) img.src = urls[i]; else { img.remove(); frame.classList.add("load-failed"); if (onFail) onFail(); } };
    img.src = urls[0]; frame.appendChild(img); return img;
  }
  function loadSealPhoto(frame, attempt) {
    attempt = attempt || 0;
    const id = frame.dataset.id !== undefined ? +frame.dataset.id : randId();
    frame.dataset.tokenId = id;
    const cur = frame.querySelector("img.seal-photo"); if (cur) cur.remove();
    addPhoto(frame, sealUrls(id), () => { if (frame.dataset.id === undefined && attempt < 4) loadSealPhoto(frame, attempt + 1); });
  }
  async function resolveContract(frame, chain) {
    const contract = frame.dataset.contract;
    const rpcs = RPCS[chain] || RPCS.eth;
    let ids;
    if (frame.dataset.id !== undefined) ids = [+frame.dataset.id];
    else {
      const pool = [4, 5, 6, 7, 8, 9, 11, 13, 17, 21, 33];
      for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
      ids = [1, 2, 3].concat(pool.slice(0, 5));
    }
    for (const id of ids) {
      const idHex = id.toString(16).padStart(64, "0");
      let uri = null;
      for (const sel of ["0xc87b56dd", "0x0e89341c"]) {
        const res = await ethCall(rpcs, contract, sel + idHex);
        if (res) { const s = decodeAbiString(res); if (s && s.length > 3) { uri = s; break; } }
      }
      if (!uri) continue;
      uri = uri.replace(/0x\{id\}|\{id\}/gi, idHex);
      let meta = null;
      for (const u of ipfsToHttp(uri)) { meta = await fetchJson(u); if (meta) break; }
      const img = meta && (meta.image || meta.image_url || meta.imageUrl);
      if (img) { frame.dataset.tokenId = id; addPhoto(frame, ipfsToHttp(img)); return; }
    }
  }

  function buildFrame(frame) {
    const kind = frame.dataset.kind || "seal";
    if (kind !== "none") addLoader(frame);
    if (kind === "seal") loadSealPhoto(frame);
    else if (kind === "eth") resolveContract(frame, "eth");
    else if (kind === "polygon") resolveContract(frame, "polygon");
    else if (kind === "none") addLoader(frame);
  }
  function hydrate(root) {
    (root || document).querySelectorAll(".sealframe:not([data-built])").forEach((f) => {
      f.setAttribute("data-built", "1"); buildFrame(f);
    });
  }
  function reroll() {
    document.querySelectorAll(".sealframe").forEach((f) => {
      if (f.dataset.pin === "1") return; // keep pinned ids
      f.querySelectorAll(".seal-loader, .seal-photo").forEach((n) => n.remove());
      f.removeAttribute("data-built"); if (f.dataset.id === undefined) delete f.dataset.tokenId;
    });
    hydrate();
  }

  // ---- copy buttons ----
  function wireCopy() {
    document.addEventListener("click", (e) => {
      const b = e.target.closest(".copy-btn"); if (!b) return;
      const addr = b.getAttribute("data-addr");
      const done = () => { const t = b.textContent; b.textContent = "Copied ✓"; b.classList.add("done");
        setTimeout(() => { b.textContent = t; b.classList.remove("done"); }, 1300); };
      if (navigator.clipboard) navigator.clipboard.writeText(addr).then(done, done); else done();
    });
  }

  // ---- count-up ----
  function countUp(el, target, o) {
    o = o || {}; const dur = 1100, t0 = performance.now();
    const dec = o.dec || 0, pre = o.pre || "", suf = o.suf || "";
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = target * e;
      el.textContent = pre + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function runStats(root) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return; io.unobserve(en.target); const el = en.target;
      countUp(el, +el.dataset.to, { dec: +el.dataset.dec || 0, pre: el.dataset.pre || "", suf: el.dataset.suf || "" });
    }), { threshold: .4 });
    (root || document).querySelectorAll("[data-to]").forEach((el) => io.observe(el));
  }

  // ---- brand links + assets (from sappy.lol / omnia.lol) ----
  const LINKS = {
    x: "https://x.com/sappyseals",
    opensea: "https://opensea.io/collection/sappy-seals",
    meme: "https://mememachine.sappyseals.io/",
    omnia: "https://omnia.lol",
    omniaWorld: "https://www.sappy.lol/~/omnia",
    omniaX: "https://x.com/ExploreOmnia",
    discord: "https://discord.com/invite/z9e2sHtSrm",
    site: "https://www.sappy.lol/",
    pixl: "https://app.uniswap.org/explore/tokens/ethereum/0x427a03fb96d9a94a6727fbcfbba143444090dd64",
  };
  const BRAND_BASE = "https://www.sappy.lol/_next/image?url=%2Fseals-static%2F_next%2Fstatic%2Fmedia%2F";
  const BRAND_DPL = "&w=1920&q=90&dpl=dpl_2ZVv1uGqUurxmNXzk5yh6JENfpwh";
  const brand = (file) => BRAND_BASE + file + BRAND_DPL;
  const BRAND = {
    glow: brand("seal-glow.977fd6f5.png"),
    camping: brand("seal-camping.c933f6ed.png"),
    peaking: brand("seal-peaking.8d058776.png"),
    questioning: brand("seal-questioning.2c05faf7.png"),
    crowd: brand("seal-crowd.68dc754a.png"),
    happy: brand("happy-seals.1e8b6995.png"),
    chilling: brand("chilling-bro.eb9290a0.png"),
  };

  // ---- team (real people from @SappySeals X affiliates — live X pfps via unavatar) ----
  const TEAM = [
    { h: "wabdoteth", name: "wab.eth", role: "Founder & CEO", seed: "wab" },
    { h: "diakou", name: "Diakou", role: "Co-founder · Divine Protector", seed: "diakou" },
    { h: "stormrdoteth", name: "stormr", role: "Product", seed: "stormr" },
    { h: "DylanKentish", name: "Dylan “Kent”", role: "Software Engineer", seed: "dylan" },
    { h: "lilstovetop", name: "lilstovetop", role: "Collector · affiliate", seed: "lils" },
  ];
  const pfp = (h) => "https://unavatar.io/twitter/" + h + "?fallback=https://unavatar.io/" + h;
  function renderTeam(el) {
    if (!el) return;
    el.innerHTML = TEAM.map((m) => `
      <a class="team-card" href="https://x.com/${m.h}" target="_blank" rel="noopener">
        <div class="team-pic sealframe" data-seed="${m.seed}" data-kind="none" data-px="160">
          <img class="seal-photo" decoding="async" alt="@${m.h}" referrerpolicy="no-referrer"
               src="${pfp(m.h)}" onload="this.classList.add('show');this.parentElement.querySelector('.seal-loader')?.remove()" onerror="this.remove();this.parentElement.classList.add('load-failed')">
        </div>
        <div class="team-meta">
          <div class="team-name">${m.name}</div>
          <div class="team-role">${m.role}</div>
          <div class="team-handle">@${m.h}</div>
        </div>
      </a>`).join("");
    el.querySelectorAll(".team-pic").forEach((f) => addLoader(f));
  }

  // ---- directory (random pod sample) ----
  const HOLDERS = [
    { h: "wabdoteth", t: "Seal Father", n: 47, seed: "wab" },
    { h: "pixlpilled", t: "Diamond Flipper", n: 12, seed: "pixlpilled" },
    { h: "arfarf.eth", t: "ARF ARF", n: 8, seed: "arfarf" },
    { h: "sealmaxi", t: "Pod Leader", n: 21, seed: "sealmaxi" },
    { h: "coldwater", t: "New Collector", n: 1, seed: "coldwater" },
    { h: "blubber.eth", t: "Staker", n: 5, seed: "blubber" },
    { h: "icefloe", t: "Collector", n: 3, seed: "icefloe" },
    { h: "frostbite", t: "Whale", n: 33, seed: "frostbite" },
  ];
  function renderDir(el, count) {
    if (!el) return;
    el.innerHTML = HOLDERS.slice(0, count || HOLDERS.length).map((p) => `
      <a class="dir-row" href="#">
        <div class="sealframe" data-kind="seal" data-seed="${p.seed}" data-px="90"></div>
        <div><div class="n">${p.h}</div><div class="t">${p.t}</div></div>
        <span class="cnt">${p.n} ${p.n === 1 ? "SEAL" : "SEALS"}</span>
      </a>`).join("");
  }

  // ---- toast + login/connect modal ----
  let modalEl = null;
  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement("div");
    modalEl.id = "sappy-modal";
    modalEl.innerHTML = `
      <div class="sm-backdrop"></div>
      <div class="sm-card" role="dialog" aria-modal="true">
        <button class="sm-close" aria-label="Close">✕</button>
        <div class="sm-body"></div>
      </div>`;
    document.body.appendChild(modalEl);
    modalEl.querySelector(".sm-backdrop").addEventListener("click", closeModal);
    modalEl.querySelector(".sm-close").addEventListener("click", closeModal);
    return modalEl;
  }
  function closeModal() { if (modalEl) modalEl.classList.remove("show"); }
  function openModal(html) { ensureModal(); modalEl.querySelector(".sm-body").innerHTML = html; modalEl.classList.add("show"); }

  function setConnected(handle, kind) {
    if (kind === "wallet") {
      document.querySelectorAll("[data-connect]").forEach((b) => { b.innerHTML = "✓&nbsp; " + handle; });
      closeModal(); toast("Wallet connected — " + handle);
    } else {
      try { localStorage.setItem("sappy_" + (kind || "x"), handle); } catch (e) {}
      closeModal(); toast("🦭  Welcome, " + handle + " — loading your Sealfolio…");
      if (window.__sappyConnectedX) window.__sappyConnectedX(handle);
    }
  }

  function xModal() {
    startXLogin();
  }

  async function syncDelegate(address) {
    if (!address) return;
    try {
      const r = await fetch("https://api.delegate.xyz/registry/v2/" + encodeURIComponent(address), { signal: TIMEOUT(8000) });
      if (!r.ok) throw new Error("delegate_api");
      const j = await r.json();
      const incoming = Array.isArray(j.incoming) ? j.incoming.length : Array.isArray(j.delegateTo) ? j.delegateTo.length : 0;
      const outgoing = Array.isArray(j.outgoing) ? j.outgoing.length : Array.isArray(j.delegations) ? j.delegations.length : 0;
      try { localStorage.setItem("sappy_delegate_" + address.toLowerCase(), JSON.stringify({ incoming, outgoing, checkedAt: Date.now() })); } catch (e) {}
      toast("Delegate.xyz checked — " + (incoming + outgoing) + " delegation" + (incoming + outgoing === 1 ? "" : "s") + " found.");
    } catch (e) {
      toast("Wallet connected. Delegate.xyz will be checked again in production.");
    }
  }
  function dynamicHost() {
    return document.querySelector("#dynamic-widget, #sappy-dynamic-widget .dynamic-shadow-dom, #sappy-dynamic-widget button, #sappy-dynamic-widget [role='button']");
  }
  function dynamicAuthOpen() {
    const htmlLocked = document.documentElement.classList.contains("dynamic-no-scroll");
    const bodyLocked = document.body.classList.contains("dynamic-no-scroll");
    const shadowHost = document.querySelector(".dynamic-shadow-dom");
    const shadow = shadowHost && shadowHost.shadowRoot;
    const shadowDialog = shadow?.querySelector?.("[role='dialog'], [data-testid*='modal'], [data-testid*='auth'], [class*='modal'], [class*='Modal'], [class*='auth'], [class*='Auth']");
    const pageDialog = document.querySelector("[data-testid*='dynamic'], [class*='dynamic-modal'], [class*='DynamicModal']");
    return Boolean(htmlLocked || bodyLocked || shadowDialog || pageDialog);
  }
  function dynamicSetupModal(kind) {
    const label = kind === "discord" ? "Discord" : kind === "twitter" || kind === "x" ? "X" : "wallet";
    openModal(`
      <div class="sm-logo"><span class="word">sappy<b>.</b></span></div>
      <div class="sm-title">Dynamic ${label} connect needs setup</div>
      <p class="sm-sub">The Dynamic SDK is on the page, but the hosted widget did not finish opening. This usually means a wallet or social provider is disabled in the Live environment, or the browser blocked the auth popup.</p>
      <div class="sm-fine">
        Environment ID: <code>7f5ed078-ee9f-49aa-b9d6-8a90434aaf40</code><br>
        Allowed domain should be <code>https://gerrystephen.com</code>. Paths such as <code>/sappy</code> do not need separate entries.<br>
        Wallets, X, and Discord must be enabled for this Live environment.
      </div>
    `);
  }
  function openDynamicWallet() {
    window.__sappyPendingDynamicWallet = true;
    if (window.sappyOpenDynamic) {
      window.sappyOpenDynamic();
      window.setTimeout(() => {
        if (!dynamicAuthOpen()) dynamicSetupModal("wallet");
      }, 1600);
      return true;
    }
    const host = dynamicHost();
    if (host) {
      host.click();
      window.setTimeout(() => {
        if (!dynamicAuthOpen()) dynamicSetupModal("wallet");
      }, 1200);
      return true;
    }
    window.dispatchEvent(new CustomEvent("sappy-dynamic-wallet-request"));
    window.setTimeout(() => { if (!window.sappyOpenDynamic) dynamicSetupModal("wallet"); }, 1600);
    return true;
  }
  function walletModal() {
    if (openDynamicWallet()) {
      toast("Opening Dynamic wallet connect...");
      return;
    }
    toast("Wallet connect is loading. Try again in a moment.");
  }

  function openDynamicSocial(provider) {
    window.__sappyPendingDynamicSocial = provider;
    if (window.sappyOpenDynamicSocial && !window.sappyOpenDynamicSocial.isFallback) {
      window.sappyOpenDynamicSocial(provider);
      return true;
    }
    if (!window.sappyOpenDynamicSocial || window.sappyOpenDynamicSocial.isFallback) {
      window.setTimeout(() => dynamicSetupModal(provider), 1600);
    }
    window.dispatchEvent(new CustomEvent("sappy-dynamic-social-request", { detail: { provider } }));
    return true;
  }

  async function startXLogin() {
    closeModal();
    if (openDynamicSocial("twitter")) return;
    toast("Dynamic X connect is loading. Try again in a moment.");
  }

  async function startDiscordLogin() {
    closeModal();
    if (openDynamicSocial("discord")) return;
    toast("Dynamic Discord connect is loading. Try again in a moment.");
  }

  let toastEl = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.getElementById("x-toast") || (function () { const d = document.createElement("div"); d.id = "x-toast"; document.body.appendChild(d); return d; })(); }
    toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  function wireLogin() {
    if (!window.__sappyDelegatedConnects) {
      window.__sappyDelegatedConnects = true;
      document.addEventListener("click", (event) => {
        const connectButton = event.target.closest?.("[data-connect]");
        if (connectButton) {
          event.preventDefault();
          walletModal();
          return;
        }
        const xButton = event.target.closest?.("[data-x-login]");
        if (xButton) {
          event.preventDefault();
          xModal();
          return;
        }
        const discordButton = event.target.closest?.("[data-discord-login]");
        if (discordButton) {
          event.preventDefault();
          startDiscordLogin();
        }
      }, true);
    }
    document.querySelectorAll("[data-x-login]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); xModal(); }));
    document.querySelectorAll("[data-connect]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); walletModal(); }));
    window.addEventListener("sappy-wallet-connected", (event) => {
      const address = event.detail && event.detail.address;
      if (!address) {
        try {
          localStorage.removeItem("sappy_wallet");
          localStorage.removeItem("sappy_wallet_label");
        } catch (e) {}
        document.querySelectorAll("[data-connect]").forEach((b) => { b.innerHTML = "Connect Wallet"; });
        return;
      }
      const label = event.detail.label || (address.slice(0, 6) + "..." + address.slice(-4));
      setConnected(label, "wallet");
      syncDelegate(address);
    });
    window.addEventListener("sappy-wallet-status", (event) => {
      if (event.detail && event.detail.status) toast(event.detail.status);
    });
    window.addEventListener("sappy-dynamic-init-failed", (event) => {
      if (event.detail && event.detail.status) toast(event.detail.status);
      if (!dynamicAuthOpen() && (window.__sappyPendingDynamicWallet || window.__sappyPendingDynamicSocial)) {
        dynamicSetupModal(window.__sappyPendingDynamicSocial || "wallet");
      }
    });
    window.addEventListener("sappy-social-connected", (event) => {
      const detail = event.detail || {};
      const provider = String(detail.provider || "").toLowerCase();
      const handle = detail.handle || detail.displayName || detail.publicIdentifier || "";
      if (!detail.connected) return;
      if (provider === "twitter") {
        try { localStorage.setItem("sappy_x", handle); } catch (e) {}
        toast(handle ? "X connected — @" + handle : "X connected through Dynamic.");
        if (window.__sappyConnectedX && handle) window.__sappyConnectedX(handle);
      }
      if (provider === "discord") {
        try {
          localStorage.setItem("sappy_discord", JSON.stringify({
            user: {
              id: detail.accountId,
              username: handle || detail.displayName || "Discord",
              avatar: detail.avatar || "",
              source: "dynamic",
            },
            roles: [],
            connectedAt: Date.now(),
          }));
        } catch (e) {}
        toast(handle ? "Discord connected — " + handle : "Discord connected through Dynamic.");
      }
    });
    window.sappyXLogin = xModal; window.sappyWallet = walletModal; window.sappyDiscordLogin = startDiscordLogin;
  }

  function init() {
    wireCopy(); wireLogin(); runStats();
    // defer image hydration until after the base page load event so the page
    // reports "loaded" quickly; seal art then streams in over the fallbacks.
    const go = () => setTimeout(hydrate, 30);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    window.__sappyHydrate = hydrate; window.__sappyReroll = reroll;
  }
  function ready(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  return { GW, SEAL_CID, sealUrls, ipfsToHttp, randId, ethCall, decodeAbiString, fetchJson,
    addPhoto, resolveContract, hydrate, reroll, buildFrame, runStats, countUp,
    renderTeam, renderDir, toast, xModal, walletModal, discordLogin: startDiscordLogin, init, ready, TEAM, HOLDERS, LINKS, BRAND };
})();
