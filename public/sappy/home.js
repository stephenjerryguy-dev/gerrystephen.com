/* ============ home.js — homepage init ============ */
(function () {
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
    mountParallax();
  });
})();
