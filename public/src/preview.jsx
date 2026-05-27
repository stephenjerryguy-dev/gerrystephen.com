/* global React, SKIN_COLORS, MONANIMALS, loadSprite, rand */
// Tiny live previews shown inside each cabinet's CRT screen.
// Each preview is a self-contained canvas animation loop.

const { useEffect, useRef } = React;

// ============================================================
// SnakePreview — a few looping snakes drifting around with orbs.
// ============================================================
function SnakePreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false;

    function resize() {
      const r = cnv.getBoundingClientRect();
      cnv.width  = Math.max(1, Math.floor(r.width  * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    const W = () => cnv.width, H = () => cnv.height;

    const snakes = [0, 1, 2].map((i) => ({
      angle: Math.random() * Math.PI * 2,
      x: rand(0.2, 0.8) * 600,
      y: rand(0.2, 0.8) * 400,
      speed: rand(1.4, 2.4),
      turn:  rand(-0.03, 0.03),
      length: 18 + i * 8,
      trail: [],
      skin: SKIN_COLORS[i % SKIN_COLORS.length],
    }));
    const orbs = Array.from({ length: 30 }, () => ({
      x: Math.random(), y: Math.random(),
      r: rand(1.5, 3.5),
      hue: Math.floor(rand(0, 360)),
    }));

    function tick() {
      if (stopped) return;
      const w = W(), h = H();
      // bg
      ctx.fillStyle = '#0a0418';
      ctx.fillRect(0, 0, w, h);

      // grid
      ctx.strokeStyle = 'rgba(140,247,240,0.06)';
      ctx.lineWidth = 1 * devicePixelRatio;
      for (let x = 0; x < w; x += 40 * devicePixelRatio) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 40 * devicePixelRatio) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // orbs
      orbs.forEach((o) => {
        const px = o.x * w, py = o.y * h;
        const g = ctx.createRadialGradient(px, py, 0, px, py, o.r * 6 * devicePixelRatio);
        g.addColorStop(0, `hsla(${o.hue}, 90%, 70%, 0.9)`);
        g.addColorStop(1, `hsla(${o.hue}, 90%, 70%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, o.r * 6 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(px, py, o.r * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      });

      // snakes
      snakes.forEach((s) => {
        s.turn += rand(-0.02, 0.02);
        s.turn = Math.max(-0.06, Math.min(0.06, s.turn));
        s.angle += s.turn;
        s.x += Math.cos(s.angle) * s.speed;
        s.y += Math.sin(s.angle) * s.speed;
        // wrap
        if (s.x < -20) s.x = w / devicePixelRatio + 20;
        if (s.x > w / devicePixelRatio + 20) s.x = -20;
        if (s.y < -20) s.y = h / devicePixelRatio + 20;
        if (s.y > h / devicePixelRatio + 20) s.y = -20;
        s.trail.unshift({ x: s.x, y: s.y });
        if (s.trail.length > s.length) s.trail.length = s.length;

        // draw trail
        s.trail.forEach((p, idx) => {
          const t = 1 - idx / s.trail.length;
          const radius = (3 + 5 * t) * devicePixelRatio;
          ctx.fillStyle = s.skin.body + Math.floor(t * 200 + 40).toString(16).padStart(2, '0');
          ctx.beginPath(); ctx.arc(p.x * devicePixelRatio, p.y * devicePixelRatio, radius, 0, Math.PI * 2); ctx.fill();
        });
        // head glow
        const head = s.trail[0] || s;
        const headG = ctx.createRadialGradient(head.x * devicePixelRatio, head.y * devicePixelRatio, 0,
                                               head.x * devicePixelRatio, head.y * devicePixelRatio, 18 * devicePixelRatio);
        headG.addColorStop(0, s.skin.glow + 'cc');
        headG.addColorStop(1, s.skin.glow + '00');
        ctx.fillStyle = headG;
        ctx.beginPath(); ctx.arc(head.x * devicePixelRatio, head.y * devicePixelRatio, 18 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
        // head dot
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(head.x * devicePixelRatio, head.y * devicePixelRatio, 7 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      });

      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

// ============================================================
// BlobPreview — Monanimal-faced blobs orbit and merge in the void.
// ============================================================
function BlobPreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false;

    function resize() {
      const r = cnv.getBoundingClientRect();
      cnv.width  = Math.max(1, Math.floor(r.width  * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    const blobs = MONANIMALS.slice(0, 5).map((m, i) => ({
      x: rand(0.2, 0.8) * 600, y: rand(0.2, 0.8) * 400,
      r: 28 + i * 5,
      vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.6),
      monanimal: m,
      img: loadSprite(m.sprite),
    }));

    function tick() {
      if (stopped) return;
      const w = cnv.width, h = cnv.height;
      ctx.fillStyle = '#0a0418';
      ctx.fillRect(0, 0, w, h);

      // soft grid
      ctx.strokeStyle = 'rgba(159,124,255,0.06)';
      ctx.lineWidth = 1 * devicePixelRatio;
      for (let x = 0; x < w; x += 32 * devicePixelRatio) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 32 * devicePixelRatio) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      blobs.forEach((b) => {
        b.x += b.vx; b.y += b.vy;
        if (b.x < b.r) { b.x = b.r; b.vx *= -1; }
        if (b.y < b.r) { b.y = b.r; b.vy *= -1; }
        if (b.x > w / devicePixelRatio - b.r) { b.x = w / devicePixelRatio - b.r; b.vx *= -1; }
        if (b.y > h / devicePixelRatio - b.r) { b.y = h / devicePixelRatio - b.r; b.vy *= -1; }

        const cx = b.x * devicePixelRatio, cy = b.y * devicePixelRatio, rr = b.r * devicePixelRatio;

        // outer aura
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 1.2);
        g.addColorStop(0, b.monanimal.color + 'cc');
        g.addColorStop(1, b.monanimal.color + '00');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, rr * 1.2, 0, Math.PI * 2); ctx.fill();

        // body
        ctx.fillStyle = b.monanimal.color;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#13091F';
        ctx.lineWidth = 2 * devicePixelRatio;
        ctx.stroke();

        // sprite face
        if (b.img && b.img.complete && b.img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath(); ctx.arc(cx, cy, rr * 0.92, 0, Math.PI * 2); ctx.clip();
          const sz = rr * 1.8;
          ctx.drawImage(b.img, cx - sz / 2, cy - sz / 2, sz, sz);
          ctx.restore();
        }
      });

      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

// ============================================================
// MergePreview — Monerge cabinet teaser. Cycles tile values.
// ============================================================
function MergePreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false; let t = 0;

    function resize() {
      const r = cnv.getBoundingClientRect();
      cnv.width  = Math.max(1, Math.floor(r.width  * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    const tiles = [
      { v: 2,    color: '#8CF7F0' },
      { v: 4,    color: '#7AC9E8' },
      { v: 8,    color: '#9F7CFF' },
      { v: 16,   color: '#7B49B7' },
      { v: 32,   color: '#FFE66D' },
      { v: 64,   color: '#FF7A9E' },
      { v: 128,  color: '#D9417E' },
      { v: 256,  color: '#2DBFB0' },
      { v: 512,  color: '#C27C46' },
    ];

    function tick() {
      if (stopped) return;
      const w = cnv.width, h = cnv.height;
      ctx.fillStyle = '#0a0418';
      ctx.fillRect(0, 0, w, h);

      // 4x4 board, tiles fading in/out by phase
      const cols = 4, rows = 4;
      const pad = 6 * devicePixelRatio;
      const tw = (w - pad * (cols + 1)) / cols;
      const th = (h - pad * (rows + 1)) / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const phase = (t / 30 + idx * 0.4) % tiles.length;
          const tile = tiles[Math.floor(phase) % tiles.length];
          const fade = 0.5 + 0.5 * Math.sin(t / 12 + idx);
          const x = pad + c * (tw + pad);
          const y = pad + r * (th + pad);
          ctx.fillStyle = tile.color + Math.floor(60 + fade * 180).toString(16).padStart(2, '0');
          roundRect(ctx, x, y, tw, th, 6 * devicePixelRatio);
          ctx.fill();
          ctx.fillStyle = '#0a0418';
          ctx.font = `900 ${Math.floor(th * 0.42)}px Inter Tight, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(tile.v), x + tw / 2, y + th / 2);
        }
      }
      t++;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

// ============================================================
// MongeonPreview — top-down dungeon w/ player + enemies
// ============================================================
function MongeonPreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false; let t = 0;
    const resize = () => {
      const r = cnv.getBoundingClientRect();
      cnv.width = Math.max(1, Math.floor(r.width * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    const COLS = 14, ROWS = 10;
    const grid = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => Math.random() < 0.18 ? 1 : 0));
    for (let c = 0; c < COLS; c++) { grid[0][c] = 1; grid[ROWS - 1][c] = 1; }
    for (let r = 0; r < ROWS; r++) { grid[r][0] = 1; grid[r][COLS - 1] = 1; }
    // corridors
    for (let r = 2; r < ROWS; r += 3) for (let c = 1; c < COLS - 1; c++) grid[r][c] = 0;

    const player = { c: 2, r: 5, mon: 0 };
    const enemies = MONANIMALS.slice(1, 4).map((m, i) => ({
      c: 6 + i * 2, r: 2 + i * 2, m, img: loadSprite(m.sprite),
    }));
    const pmon = MONANIMALS[0];
    const pimg = loadSprite(pmon.sprite);

    function tick() {
      if (stopped) return;
      const W = cnv.width, H = cnv.height, dpr = devicePixelRatio;
      const tileSize = Math.min(W / COLS, H / ROWS);
      ctx.fillStyle = '#0a0418'; ctx.fillRect(0, 0, W, H);

      // slow walk
      if (t % 24 === 0) {
        if (player.c < COLS - 3) player.c++;
        else player.c = 2;
        enemies.forEach((e) => { e.c = (e.c + 1) % (COLS - 2); if (e.c === 0) e.c = 1; });
      }

      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const x = c * tileSize, y = r * tileSize;
        if (grid[r][c] === 1) {
          ctx.fillStyle = '#1a0b3e';
          ctx.fillRect(x, y, tileSize, tileSize);
        } else {
          ctx.fillStyle = ((r + c) % 2) ? '#13091F' : '#180d2d';
          ctx.fillRect(x, y, tileSize, tileSize);
        }
      }
      // loot orbs
      for (let i = 0; i < 5; i++) {
        const px = (3 + (i * 73 + t * 0.3) % (W - 60));
        const py = (40 + (i * 53) % (H - 60));
        ctx.fillStyle = '#FFE66D';
        ctx.beginPath(); ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2); ctx.fill();
      }
      // enemies
      enemies.forEach((e) => {
        const x = e.c * tileSize, y = e.r * tileSize;
        if (e.img.complete) ctx.drawImage(e.img, x + 2, y + 2, tileSize - 4, tileSize - 4);
      });
      // player
      const px = player.c * tileSize, py = player.r * tileSize;
      const aura = ctx.createRadialGradient(px + tileSize / 2, py + tileSize / 2, 0, px + tileSize / 2, py + tileSize / 2, tileSize);
      aura.addColorStop(0, '#8CF7F0aa'); aura.addColorStop(1, '#8CF7F000');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(px + tileSize / 2, py + tileSize / 2, tileSize, 0, Math.PI * 2); ctx.fill();
      if (pimg.complete) ctx.drawImage(pimg, px + 1, py + 1, tileSize - 2, tileSize - 2);

      t++;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

// ============================================================
// MonclashPreview — iglu shoots bolts at incoming raiders
// ============================================================
function MonclashPreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false; let t = 0;
    const resize = () => {
      const r = cnv.getBoundingClientRect();
      cnv.width = Math.max(1, Math.floor(r.width * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    const raiders = MONANIMALS.slice(0, 4).map((m, i) => ({
      x: 1 + i * 0.18, m, img: loadSprite(m.sprite),
    }));

    function tick() {
      if (stopped) return;
      const W = cnv.width, H = cnv.height, dpr = devicePixelRatio;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a0418'); sky.addColorStop(1, '#2e1466');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#13091F';
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      // iglu
      const igX = 50 * dpr, igY = H * 0.78;
      ctx.fillStyle = '#8CF7F0';
      ctx.beginPath(); ctx.arc(igX, igY, 36 * dpr, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0a0418'; ctx.lineWidth = 2 * dpr; ctx.stroke();
      // raiders
      raiders.forEach((r, i) => {
        r.x -= 0.0015;
        if (r.x < 0.1) r.x = 1.1;
        const rx = r.x * W, ry = H * 0.78 - 14 * dpr + Math.sin(t * 0.18 + i) * 3 * dpr;
        if (r.img.complete) ctx.drawImage(r.img, rx - 18 * dpr, ry - 18 * dpr, 36 * dpr, 36 * dpr);
        // bolts every 60 frames
        if ((t + i * 17) % 80 === 0) {
          ctx.strokeStyle = '#8CF7F0';
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath(); ctx.moveTo(igX, igY - 26 * dpr); ctx.lineTo(rx, ry); ctx.stroke();
        }
      });
      t++;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

// ============================================================
// MonabaPreview — arena with circling brawlers
// ============================================================
function MonabaPreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false; let t = 0;
    const resize = () => {
      const r = cnv.getBoundingClientRect();
      cnv.width = Math.max(1, Math.floor(r.width * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);
    const fighters = MONANIMALS.slice(0, 4).map((m, i) => ({ m, img: loadSprite(m.sprite), phase: i * (Math.PI * 2 / 4) }));

    function tick() {
      if (stopped) return;
      const W = cnv.width, H = cnv.height, dpr = devicePixelRatio;
      ctx.fillStyle = '#0a0418'; ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      // grid
      ctx.strokeStyle = 'rgba(159,124,255,0.1)';
      ctx.lineWidth = 1 * dpr;
      for (let g = 0; g < W; g += 20 * dpr) { ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, H); ctx.stroke(); }
      for (let g = 0; g < H; g += 20 * dpr) { ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(W, g); ctx.stroke(); }
      // ring
      ctx.strokeStyle = 'rgba(140,247,240,0.4)';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.36, 0, Math.PI * 2); ctx.stroke();
      // fighters
      fighters.forEach((f) => {
        const ang = f.phase + t * 0.02;
        const rad = Math.min(W, H) * 0.32;
        const fx = cx + Math.cos(ang) * rad, fy = cy + Math.sin(ang) * rad;
        ctx.fillStyle = f.m.color + 'aa';
        ctx.beginPath(); ctx.arc(fx, fy, 22 * dpr, 0, Math.PI * 2); ctx.fill();
        if (f.img.complete) ctx.drawImage(f.img, fx - 22 * dpr, fy - 22 * dpr, 44 * dpr, 44 * dpr);
      });
      // strike flash
      if (t % 80 < 8) {
        ctx.fillStyle = 'rgba(255,79,161,0.18)';
        ctx.fillRect(0, 0, W, H);
      }
      t++;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

// ============================================================
// MoncardsPreview — flipping card grid
// ============================================================
function MoncardsPreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false; let t = 0;
    const resize = () => {
      const r = cnv.getBoundingClientRect();
      cnv.width = Math.max(1, Math.floor(r.width * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    const cols = 4, rows = 4;
    const cards = [];
    for (let i = 0; i < cols * rows; i++) {
      const m = MONANIMALS[i % MONANIMALS.length];
      cards.push({ m, img: loadSprite(m.sprite), flipPhase: Math.random() * 100 });
    }

    function tick() {
      if (stopped) return;
      const W = cnv.width, H = cnv.height, dpr = devicePixelRatio;
      ctx.fillStyle = '#0a0418'; ctx.fillRect(0, 0, W, H);
      const pad = 6 * dpr;
      const cw = (W - pad * (cols + 1)) / cols;
      const ch = (H - pad * (rows + 1)) / rows;
      cards.forEach((c, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = pad + col * (cw + pad);
        const y = pad + row * (ch + pad);
        const f = ((t + c.flipPhase) % 240) / 240;
        const flipped = f > 0.4 && f < 0.7;
        // flip-skew effect
        const sk = Math.abs(Math.cos(f * Math.PI * 2));
        ctx.save();
        ctx.translate(x + cw / 2, y + ch / 2);
        ctx.scale(sk, 1);
        if (flipped) {
          ctx.fillStyle = c.m.color;
          ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
          if (c.img.complete) {
            ctx.drawImage(c.img, -cw / 2 + 4 * dpr, -ch / 2 + 4 * dpr, cw - 8 * dpr, ch - 8 * dpr);
          }
        } else {
          ctx.fillStyle = '#1a0b3e';
          ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
          ctx.fillStyle = '#9F7CFF';
          ctx.font = `900 ${Math.floor(ch * 0.5)}px Inter Tight, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('M', 0, 2);
        }
        ctx.restore();
      });
      t++;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

// ============================================================
// MonpartyPreview — whack-a-mole pop-ups in a 3x3 grid
// ============================================================
function MonpartyPreview() {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false; let t = 0;
    const resize = () => {
      const r = cnv.getBoundingClientRect();
      cnv.width = Math.max(1, Math.floor(r.width * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    const holes = Array.from({ length: 9 }, (_, i) => ({
      m: MONANIMALS[i % MONANIMALS.length],
      img: loadSprite(MONANIMALS[i % MONANIMALS.length].sprite),
      phase: i * 23, alive: false, bomb: i === 4,
    }));

    function tick() {
      if (stopped) return;
      const W = cnv.width, H = cnv.height, dpr = devicePixelRatio;
      ctx.fillStyle = '#0a0418'; ctx.fillRect(0, 0, W, H);
      const pad = 8 * dpr;
      const cs = (Math.min(W, H) - pad * 4) / 3;
      const startX = (W - cs * 3 - pad * 2) / 2;
      const startY = (H - cs * 3 - pad * 2) / 2;
      holes.forEach((h, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const x = startX + col * (cs + pad);
        const y = startY + row * (cs + pad);
        // hole
        ctx.fillStyle = '#13091F';
        ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2 + cs * 0.25, cs * 0.4, 0, Math.PI * 2); ctx.fill();
        // popup phase
        const ph = ((t + h.phase) % 180) / 180;
        const popping = ph < 0.45;
        const popY = popping ? Math.sin(ph / 0.45 * Math.PI) * cs * 0.4 : 0;
        if (popY > 4 * dpr) {
          const ix = x + cs * 0.1, iy = y + cs * 0.5 - popY;
          if (h.bomb) {
            ctx.fillStyle = '#FF4FA1';
            ctx.beginPath(); ctx.arc(x + cs / 2, iy + cs * 0.4, cs * 0.36, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `900 ${cs * 0.5}px Inter Tight`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('×', x + cs / 2, iy + cs * 0.4);
          } else if (h.img.complete) {
            ctx.drawImage(h.img, ix, iy, cs * 0.8, cs * 0.8);
          }
        }
      });
      t++;
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} />;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

Object.assign(window, {
  SnakePreview, BlobPreview, MergePreview,
  MongeonPreview, MonclashPreview, MonabaPreview, MoncardsPreview, MonpartyPreview,
  roundRect,
});
