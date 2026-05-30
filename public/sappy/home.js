/* ============ home.js — homepage init ============ */
(function () {
  const LOCAL_HOST = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

  function formatNumber(value, options) {
    return Number(value).toLocaleString("en-US", options || {});
  }

  async function fetchJsonWithProdFallback(path) {
    const endpoints = [path];
    if (LOCAL_HOST) endpoints.push(`https://www.gerrystephen.com${path}`);

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { headers: { accept: "application/json" } });
        const type = response.headers.get("content-type") || "";
        if (!response.ok || !type.includes("application/json")) continue;
        return await response.json();
      } catch (error) {}
    }
    return null;
  }

  function setStat(selector, text, dataTo) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = text;
    if (dataTo !== undefined) el.dataset.to = String(dataTo);
    el.dataset.live = "1";
  }

  function mountLiveStats() {
    fetchJsonWithProdFallback("/api/sappy-stats").then((stats) => {
      if (!stats) return;
      const floorEth = Number(stats.floorEth);
      const floorUsd = Number(stats.floorUsd);
      const change24h = Number(stats.change24h);
      const sales24h = Number(stats.sales24h);
      const volume24h = Number(stats.volume24h);
      const holders = Number(stats.holders);

      if (Number.isFinite(floorEth)) {
        setStat("[data-stat='floor']", `${formatNumber(floorEth, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} Ξ`, floorEth);
      }
      if (Number.isFinite(floorUsd) && floorUsd > 0) {
        setStat("[data-stat='floor-meta']", `$${formatNumber(Math.round(floorUsd))} · Sappy Seals`);
      } else if (Number.isFinite(floorEth)) {
        setStat("[data-stat='floor-meta']", "live floor · Sappy Seals");
      }
      if (Number.isFinite(sales24h)) {
        const volumeText = Number.isFinite(volume24h)
          ? `${formatNumber(volume24h, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETH volume`
          : "OpenSea 24h activity";
        setStat("[data-stat='change-label']", "▸ 24H SALES");
        setStat("[data-stat='change']", formatNumber(Math.round(sales24h)), sales24h);
        setStat("[data-stat='change-meta']", volumeText);
        const changeEl = document.querySelector("[data-stat='change']");
        if (changeEl) changeEl.classList.remove("down");
      } else if (Number.isFinite(change24h)) {
        const sign = change24h >= 0 ? "+" : "";
        const changeEl = document.querySelector("[data-stat='change']");
        setStat("[data-stat='change']", `${sign}${formatNumber(change24h, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`, change24h);
        setStat("[data-stat='change-meta']", "floor is moving");
        if (changeEl) changeEl.classList.toggle("down", change24h < 0);
      }
      if (Number.isFinite(holders)) {
        const holderText = formatNumber(Math.round(holders));
        setStat("[data-stat='holders']", holderText, holders);
        const holderLine = document.querySelector("[data-stat='holder-line']");
        if (holderLine) holderLine.innerHTML = `<b>${holderText} holders</b> and growing — you're early. you're sappy.`;
      }
    });
  }

  function mountParallax() {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const art = document.querySelector(".hero-art");
    const floats = [...document.querySelectorAll(".hero-art .float")];
    const big = document.querySelector(".seal-big");
    const teaser = document.querySelector(".eco-teaser");
    if (!art || !floats.length) return;

    art.addEventListener("pointermove", (event) => {
      const rect = art.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      floats.forEach((node, index) => {
        const depth = 10 + index * 4;
        node.style.setProperty("--parallax-x", `${x * depth}px`);
        node.style.setProperty("--parallax-y", `${y * depth}px`);
      });
      if (big) {
        big.style.setProperty("--parallax-x", `${x * -8}px`);
        big.style.setProperty("--parallax-y", `${y * -8}px`);
      }
    });

    art.addEventListener("pointerleave", () => {
      [...floats, big].filter(Boolean).forEach((node) => {
        node.style.setProperty("--parallax-x", "0px");
        node.style.setProperty("--parallax-y", "0px");
      });
    });

    const onScroll = () => {
      const y = Math.min(1, window.scrollY / 600);
      document.documentElement.style.setProperty("--scroll-lift", `${y * -24}px`);
      if (teaser) teaser.style.setProperty("--teaser-shift", `${y * 18}px`);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  window.Sappy.ready(function () {
    window.SappyLayout.mount("home");
    window.Sappy.init();
    mountLiveStats();
    mountParallax();
  });
})();
