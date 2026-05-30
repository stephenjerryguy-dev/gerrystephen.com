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

  let xClientIdPromise = null;
  async function getXClientId() {
    if (window.SAPPY_X_CLIENT_ID) return window.SAPPY_X_CLIENT_ID;
    if (!xClientIdPromise) {
      xClientIdPromise = fetch("/api/x-config", { headers: { accept: "application/json" } })
        .then((r) => r.ok ? r.json() : {})
        .then((j) => j.clientId || "")
        .catch(() => "");
    }
    return xClientIdPromise;
  }

  let discordClientIdPromise = null;
  async function getDiscordClientId() {
    if (window.SAPPY_DISCORD_CLIENT_ID) return window.SAPPY_DISCORD_CLIENT_ID;
    if (!discordClientIdPromise) {
      discordClientIdPromise = fetch("/api/discord-config", { headers: { accept: "application/json" } })
        .then((r) => r.ok ? r.json() : {})
        .then((j) => j.clientId || "")
        .catch(() => "");
    }
    return discordClientIdPromise;
  }

  function xModal() {
    openModal(`
      <div class="sm-logo"><span class="word">sappy<b>.</b></span></div>
      <h3 class="sm-title">Connect your X</h3>
      <p class="sm-sub">Link your X to claim your Sealfolio identity and display your profile alongside your connected wallet collection.</p>
      <button class="btn btn-x sm-x">𝕏&nbsp; Continue with X</button>
      <p class="sm-fine">You will be sent to X to authorize the public profile connection.</p>`);
    modalEl.querySelector(".sm-x").addEventListener("click", startXLogin);
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
  function openDynamicWallet() {
    if (window.sappyOpenDynamic) {
      window.sappyOpenDynamic();
      return true;
    }
    const host = document.querySelector("#sappy-dynamic-widget .dynamic-shadow-dom");
    const btn = host && host.shadowRoot && host.shadowRoot.querySelector('[data-testid="ConnectButton"], button');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }
  function walletModal() {
    if (openDynamicWallet()) {
      toast("Opening Dynamic wallet connect...");
      return;
    }
    toast("Wallet connect is loading. Try again in a moment.");
  }

  async function startXLogin() {
    const cid = await getXClientId();
    if (cid) {
      const redirect = location.origin + "/sappy/x-callback.html";
      const state = Math.random().toString(36).slice(2);
      const verifier = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      try {
        localStorage.setItem("sappy_x_oauth", JSON.stringify({ state, verifier, next: location.href, createdAt: Date.now() }));
      } catch (e) {}
      const url = "https://twitter.com/i/oauth2/authorize?response_type=code&client_id=" + encodeURIComponent(cid) +
        "&redirect_uri=" + encodeURIComponent(redirect) + "&scope=" + encodeURIComponent("tweet.read users.read") +
        "&state=" + encodeURIComponent(state) + "&code_challenge=" + encodeURIComponent(verifier) + "&code_challenge_method=plain";
      location.href = url;
      toast("Opening X authorization...");
    } else {
      toast("X login needs the X app client id configured first.");
    }
  }

  async function startDiscordLogin() {
    const cid = await getDiscordClientId();
    if (cid) {
      const redirect = location.origin + "/sappy/discord-callback.html";
      const state = Math.random().toString(36).slice(2);
      try {
        localStorage.setItem("sappy_discord_oauth", JSON.stringify({ state, next: location.href, createdAt: Date.now() }));
      } catch (e) {}
      const url = "https://discord.com/oauth2/authorize?response_type=code&client_id=" + encodeURIComponent(cid) +
        "&redirect_uri=" + encodeURIComponent(redirect) + "&scope=" + encodeURIComponent("identify guilds.members.read") +
        "&state=" + encodeURIComponent(state);
      location.href = url;
      toast("Opening Discord authorization...");
    } else {
      toast("Discord connection needs the Discord app client id configured first.");
    }
  }

  let toastEl = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.getElementById("x-toast") || (function () { const d = document.createElement("div"); d.id = "x-toast"; document.body.appendChild(d); return d; })(); }
    toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  function wireLogin() {
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
