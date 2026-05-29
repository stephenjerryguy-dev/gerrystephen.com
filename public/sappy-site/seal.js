/* seal.js — procedural cute pixel-art "Sappy"-style seals on canvas.
   drawSeal(canvasEl, seed, opts?) renders a deterministic chubby seal.
   Recognizable chibi seal: one egg-shaped body, big belly, two side flippers,
   two bottom flippers, big eyes, blush cheeks, snout, + a seeded accessory.
   Rendered on a 36x36 grid then nearest-neighbour upscaled => pixel look. */
(function () {
  // ---- deterministic PRNG ----
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    s = String(s); let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ---- palettes (ocean + pop) ----
  const BG = ['#7FD0EC', '#FFB7D5', '#B9E66B', '#FFD66B', '#C7A8FF', '#FF9E6B',
              '#8FE0C8', '#9FD0FF', '#FF8FA3', '#7FE0D6', '#FFC07A', '#C0F08A'];
  const BODY = ['#7FB6E6', '#9AA7B6', '#B58CE6', '#F2A65A', '#73CBB0', '#E87DA0',
                '#6C7B8A', '#4FAE8C', '#E0A04A', '#88A0E0'];
  const BELLY = '#FBF3E2';
  const OUTLINE = '#26313b';
  const CHEEK = '#FF7FA6';

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + amt));
    g = Math.max(0, Math.min(255, g + amt));
    b = Math.max(0, Math.min(255, b + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function ellipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // main
  function drawSeal(canvas, seed, opts) {
    opts = opts || {};
    const rnd = mulberry32(hashStr(seed));
    const G = 36;                       // internal grid
    const display = canvas.width;       // CSS-driven backing store set below
    // set up an offscreen low-res canvas
    const off = document.createElement('canvas');
    off.width = G; off.height = G;
    const c = off.getContext('2d');

    const bg = opts.bg || BG[Math.floor(rnd() * BG.length)];
    const body = opts.body || BODY[Math.floor(rnd() * BODY.length)];
    const bodyDark = shade(body, -34);

    // background
    if (opts.transparent) { c.clearRect(0, 0, G, G); }
    else { c.fillStyle = bg; c.fillRect(0, 0, G, G); }

    const cx = 18;
    // bottom flippers
    ellipse(c, 13, 33, 4, 2.3, bodyDark);
    ellipse(c, 23, 33, 4, 2.3, bodyDark);
    // side flippers (behind body)
    ellipse(c, 6.5, 23, 3.2, 5.2, bodyDark);
    ellipse(c, 29.5, 23, 3.2, 5.2, bodyDark);
    // body outline + body (egg/blob, chubby low)
    ellipse(c, cx, 19.5, 12.4, 14.4, OUTLINE);
    ellipse(c, cx, 19.5, 11.2, 13.2, body);
    // belly
    ellipse(c, cx, 23, 7.4, 9.2, BELLY);
    // cheeks
    ellipse(c, 10.5, 20.5, 2, 1.6, CHEEK);
    ellipse(c, 25.5, 20.5, 2, 1.6, CHEEK);

    // ---- accessory chosen before eyes if behind, after if front ----
    const ACC_POOL = [0, 1, 2, 3, 5, 5, 0, 2]; // weight bare/beanie/glasses; skip clippy sprout
    const acc = opts.accessory !== undefined ? opts.accessory : ACC_POOL[Math.floor(rnd() * ACC_POOL.length)];
    // eyes
    const eyeY = 15;
    ellipse(c, 13.5, eyeY, 2.2, 2.7, OUTLINE);
    ellipse(c, 22.5, eyeY, 2.2, 2.7, OUTLINE);
    // highlights
    c.fillStyle = '#ffffff';
    c.fillRect(14, eyeY - 1.8, 1.4, 1.4);
    c.fillRect(23, eyeY - 1.8, 1.4, 1.4);
    // snout / nose
    ellipse(c, 18, 19, 1.6, 1.2, OUTLINE);
    // smile
    c.strokeStyle = OUTLINE; c.lineWidth = 1; c.lineCap = 'round';
    c.beginPath(); c.moveTo(15.5, 21.5); c.quadraticCurveTo(18, 23.5, 20.5, 21.5); c.stroke();
    // whiskers
    c.beginPath();
    c.moveTo(9.5, 19.5); c.lineTo(13, 20); c.moveTo(9.5, 21.5); c.lineTo(13, 21.5);
    c.moveTo(26.5, 19.5); c.lineTo(23, 20); c.moveTo(26.5, 21.5); c.lineTo(23, 21.5);
    c.stroke();

    // accessories (front)
    if (acc === 0) {            // beanie
      const col = ['#FF5D73', '#2C9CD6', '#5CC98C', '#FFC93C', '#9B7BE8'][Math.floor(rnd() * 5)];
      c.fillStyle = OUTLINE; c.fillRect(7, 7, 22, 5);
      c.fillStyle = col; c.fillRect(8, 4, 20, 5);
      c.fillStyle = '#fff'; c.fillRect(16, 1.5, 4, 3);
    } else if (acc === 1) {     // party hat
      const col = ['#FF7DAE', '#FFC93C', '#5CC98C', '#2C9CD6'][Math.floor(rnd() * 4)];
      c.fillStyle = OUTLINE;
      c.beginPath(); c.moveTo(18, -1); c.lineTo(11.5, 9); c.lineTo(24.5, 9); c.closePath(); c.fill();
      c.fillStyle = col;
      c.beginPath(); c.moveTo(18, 1); c.lineTo(13, 8.5); c.lineTo(23, 8.5); c.closePath(); c.fill();
      c.fillStyle = '#fff'; ellipse(c, 18, 0, 1.6, 1.6, '#fff');
    } else if (acc === 2) {     // sunglasses
      c.fillStyle = OUTLINE;
      c.fillRect(9, 12.5, 7.5, 5); c.fillRect(19.5, 12.5, 7.5, 5); c.fillRect(16, 13.5, 4, 1.4);
      c.fillStyle = '#46c8ff'; c.fillRect(10, 13.5, 5, 2);
    } else if (acc === 3) {     // headband
      const col = ['#FF5D73', '#5CC98C', '#FFC93C'][Math.floor(rnd() * 3)];
      c.fillStyle = col; c.fillRect(8, 9.5, 20, 3);
      c.fillStyle = OUTLINE; c.fillRect(8, 12, 20, 1);
    } else if (acc === 4) {     // halo / sprout (cute antenna)
      c.strokeStyle = '#4FAE8C'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(18, 7); c.lineTo(18, 3); c.stroke();
      ellipse(c, 18, 2, 2, 2.2, '#5CC98C');
    } // acc 5 = bare

    // upscale into the visible canvas
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, display, canvas.height);
    ctx.drawImage(off, 0, 0, G, G, 0, 0, display, canvas.height);
    return { bg: bg, body: body };
  }

  // auto-render any <canvas class="seal" data-seed=..> ; honor data-bg/body/acc
  function renderAll(root) {
    (root || document).querySelectorAll('canvas.seal').forEach(function (cv) {
      const px = cv.getAttribute('data-px') ? +cv.getAttribute('data-px') : 240;
      cv.width = px; cv.height = px;
      const opts = {};
      if (cv.dataset.bg) opts.bg = cv.dataset.bg;
      if (cv.dataset.body) opts.body = cv.dataset.body;
      if (cv.dataset.acc) opts.accessory = +cv.dataset.acc;
      if (cv.dataset.transparent === 'true') opts.transparent = true;
      drawSeal(cv, cv.getAttribute('data-seed') || Math.random(), opts);
    });
  }

  window.SappySeal = { draw: drawSeal, renderAll: renderAll, BG: BG, BODY: BODY };
  if (document.readyState !== 'loading') renderAll();
  else document.addEventListener('DOMContentLoaded', function () { renderAll(); });
})();
