/* global React, MONANIMALS, MONANIMAL_BY_ID, SKIN_COLORS, loadSprite,
          clamp, rand, randomBotName, randomMonanimal, fmt, shortAddr,
          submitRunOnChain, submitToLeaderboard, pushToast, GameOverOverlay */
// Monbubble — agar.io-style with Monanimal-faced blobs.

const { useState, useEffect, useRef, useCallback } = React;

// ============================================================
// CONSTANTS
// ============================================================
const B_WORLD = 4000;
const B_PELLET_COUNT = 600;
const B_VIRUS_COUNT = 14;
const B_BOTS = 14;
const B_START_MASS = 18;
const B_MAX_CELLS = 6;
const B_BASE_SPEED = 2.4;
const B_SPLIT_BOOST = 18;

function massToRadius(m) { return Math.sqrt(m) * 5.5; }
function speedFromMass(m) { return B_BASE_SPEED * (50 / (massToRadius(m) + 10)); }

// ============================================================
// FACTORIES
// ============================================================
function makeBlob({ name, monanimalId, isPlayer = false, x, y, mass }) {
  return {
    name, monanimal: monanimalId, isPlayer,
    cells: [{ x, y, mass: mass || B_START_MASS, vx: 0, vy: 0, mergeAt: 0 }],
    alive: true, score: 0, eats: 0, deathFlash: 0,
    targetX: x, targetY: y,
    aiTimer: 0,
  };
}
function makePellet() {
  const palette = ['#9F7CFF','#FF4FA1','#8CF7F0','#FFE66D','#2DBFB0','#C27C46','#d8c7ff','#FF7A9E'];
  return { x: rand(20, B_WORLD - 20), y: rand(20, B_WORLD - 20), color: palette[Math.floor(Math.random() * palette.length)], mass: 1 };
}
function makeVirus() {
  return { x: rand(200, B_WORLD - 200), y: rand(200, B_WORLD - 200), mass: 120 };
}
function spawnBotBlob(idx) {
  const m = randomMonanimal();
  const b = makeBlob({
    name: randomBotName() + (Math.random() < 0.2 ? '.eth' : ''),
    monanimalId: m.id,
    x: rand(200, B_WORLD - 200),
    y: rand(200, B_WORLD - 200),
    mass: rand(20, 220),
  });
  b.speedMul  = m.blobStat.speed;
  b.massMul   = m.blobStat.mass;
  b.visionMul = m.blobStat.vision;
  return b;
}

// ============================================================
// MAIN COMPONENT
// ============================================================
function BlobGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('lobby');
  const [monanimalId, setMonanimalId] = useState('chog');
  const [name, setName] = useState(() => localStorage.getItem('moncade.name') || '');
  const [hud, setHud] = useState({ score: 0, mass: 18, eats: 0, rank: 1 });
  const [topboard, setTopboard] = useState([]);
  const [runStats, setRunStats] = useState(null);
  const [txState, setTxState] = useState(null);

  const stageRef = useRef(null);
  const cnvRef = useRef(null);
  const miniRef = useRef(null);
  const stateRef = useRef(null);
  const inputRef = useRef({ mx: 0.5, my: 0.5, split: 0, eject: 0 });
  const startTimeRef = useRef(0);

  // ============================================================
  // INIT
  // ============================================================
  const startGame = useCallback(() => {
    if (name.trim()) localStorage.setItem('moncade.name', name.trim());
    const m = MONANIMAL_BY_ID[monanimalId] || MONANIMALS[0];
    const player = makeBlob({
      name: name.trim() || 'YOU',
      monanimalId: m.id,
      isPlayer: true,
      x: B_WORLD / 2, y: B_WORLD / 2,
      mass: B_START_MASS,
    });
    player.speedMul  = m.blobStat.speed;
    player.massMul   = m.blobStat.mass;
    player.visionMul = m.blobStat.vision;
    const bots = Array.from({ length: B_BOTS }, (_, i) => spawnBotBlob(i));
    const pellets = Array.from({ length: B_PELLET_COUNT }, makePellet);
    const viruses = Array.from({ length: B_VIRUS_COUNT }, makeVirus);
    stateRef.current = {
      player, blobs: [player, ...bots], pellets, viruses,
      cam: { x: player.cells[0].x, y: player.cells[0].y, zoom: 1 },
      t: 0,
    };
    startTimeRef.current = performance.now();
    setHud({ score: 0, mass: B_START_MASS, eats: 0, rank: bots.length + 1 });
    setRunStats(null); setTxState(null);
    setPhase('playing');
  }, [name, monanimalId]);

  // ============================================================
  // INPUT
  // ============================================================
  useEffect(() => {
    if (phase !== 'playing') return;
    const stage = stageRef.current; if (!stage) return;
    const onMove = (e) => {
      const r = stage.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      inputRef.current.mx = cx / r.width;
      inputRef.current.my = cy / r.height;
    };
    const onKey = (e) => {
      if (e.code === 'Space') { e.preventDefault(); inputRef.current.split = 1; }
      if (e.code === 'KeyW')  { inputRef.current.eject = 1; }
    };
    stage.addEventListener('mousemove', onMove);
    stage.addEventListener('touchmove', onMove, { passive: true });
    stage.addEventListener('touchstart', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      stage.removeEventListener('mousemove', onMove);
      stage.removeEventListener('touchmove', onMove);
      stage.removeEventListener('touchstart', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [phase]);

  // ============================================================
  // LOOP
  // ============================================================
  useEffect(() => {
    if (phase !== 'playing') return;
    const cnv = cnvRef.current, mini = miniRef.current;
    if (!cnv || !mini) return;
    const ctx = cnv.getContext('2d');
    const mctx = mini.getContext('2d');
    let raf = 0; let stopped = false;
    function resize() {
      const r = cnv.getBoundingClientRect();
      cnv.width  = Math.max(1, Math.floor(r.width  * devicePixelRatio));
      cnv.height = Math.max(1, Math.floor(r.height * devicePixelRatio));
      const r2 = mini.getBoundingClientRect();
      mini.width  = Math.max(1, Math.floor(r2.width  * devicePixelRatio));
      mini.height = Math.max(1, Math.floor(r2.height * devicePixelRatio));
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);
    window.addEventListener('resize', resize);

    function tick() {
      if (stopped) return;
      const s = stateRef.current; if (!s) return;
      s.t++;
      step(s);
      draw(ctx, cnv, s);
      drawMinimap(mctx, mini, s);
      if (s.t % 6 === 0) {
        const ranks = s.blobs.filter((b) => b.alive).slice().sort((a, b) => totalMass(b) - totalMass(a));
        const playerRank = ranks.findIndex((b) => b.isPlayer) + 1 || ranks.length + 1;
        setHud({
          score: Math.floor(s.player.score),
          mass: Math.floor(totalMass(s.player)),
          eats: s.player.eats,
          rank: playerRank || 1,
        });
        setTopboard(ranks.slice(0, 8));
      }
      if (!s.player.alive && phase === 'playing') {
        const elapsed = Math.floor((performance.now() - startTimeRef.current) / 1000);
        setRunStats({
          score: Math.floor(s.player.score),
          mass: Math.floor(stateRef.current.player.lastMass || 0),
          eats: s.player.eats,
          seconds: elapsed,
        });
        setPhase('dead');
        stopped = true;
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', resize); };
  // eslint-disable-next-line
  }, [phase]);

  // ============================================================
  // STEP
  // ============================================================
  function totalMass(b) { return b.cells.reduce((acc, c) => acc + c.mass, 0); }
  function biggestCell(b) {
    let big = b.cells[0];
    for (const c of b.cells) if (c.mass > big.mass) big = c;
    return big;
  }

  function step(s) {
    const p = s.player;
    // === player aim & actions ===
    if (p.alive) {
      const cnv = cnvRef.current;
      const r = cnv.getBoundingClientRect();
      const tot = totalMass(p);
      const big = biggestCell(p);
      const zoomTarget = clamp(1.4 - tot * 0.0008, 0.55, 1.4) * (p.visionMul || 1);
      s.cam.zoom = s.cam.zoom + (zoomTarget - s.cam.zoom) * 0.05;
      const wx = s.cam.x + (inputRef.current.mx - 0.5) * (r.width / s.cam.zoom);
      const wy = s.cam.y + (inputRef.current.my - 0.5) * (r.height / s.cam.zoom);
      p.targetX = wx; p.targetY = wy;
      if (inputRef.current.split && p.cells.length < B_MAX_CELLS) {
        splitBlob(p);
      }
      inputRef.current.split = 0;
      if (inputRef.current.eject) {
        ejectMass(s, p);
        inputRef.current.eject = 0;
      }
      // remember pre-death mass for receipt
      if (tot > 0) p.lastMass = tot;
    }

    // === bot AI ===
    s.blobs.forEach((b) => {
      if (b.isPlayer || !b.alive) return;
      b.aiTimer--;
      if (b.aiTimer <= 0) {
        const big = biggestCell(b);
        let target = null;
        // 1) eat smaller blobs
        for (const other of s.blobs) {
          if (other === b || !other.alive) continue;
          const oBig = biggestCell(other);
          if (big.mass > oBig.mass * 1.25) {
            if (!target || dist2(oBig, big) < dist2(target, big)) target = { x: oBig.x, y: oBig.y };
          }
        }
        // 2) flee bigger blobs
        if (!target) {
          for (const other of s.blobs) {
            if (other === b || !other.alive) continue;
            const oBig = biggestCell(other);
            if (oBig.mass > big.mass * 1.25 && dist2(oBig, big) < 200 * 200) {
              target = { x: big.x - (oBig.x - big.x), y: big.y - (oBig.y - big.y) };
              break;
            }
          }
        }
        // 3) nearest pellet
        if (!target) {
          let nearD = Infinity; let near = null;
          for (let i = 0; i < s.pellets.length; i += 4) {
            const o = s.pellets[i];
            const d = (o.x - big.x) ** 2 + (o.y - big.y) ** 2;
            if (d < nearD) { nearD = d; near = o; }
          }
          if (near) target = { x: near.x + rand(-40, 40), y: near.y + rand(-40, 40) };
        }
        if (!target) target = { x: B_WORLD / 2, y: B_WORLD / 2 };
        b.targetX = target.x; b.targetY = target.y;
        b.aiTimer = 12 + Math.floor(rand(0, 18));
      }
    });

    // === move cells ===
    s.blobs.forEach((b) => {
      if (!b.alive) return;
      b.cells.forEach((c) => {
        const dx = b.targetX - c.x, dy = b.targetY - c.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = speedFromMass(c.mass) * (b.speedMul || 1);
        // ease toward target
        const ux = dx / d, uy = dy / d;
        c.x += ux * sp + c.vx;
        c.y += uy * sp + c.vy;
        c.vx *= 0.92; c.vy *= 0.92;
        // mass decay (slow)
        if (c.mass > 50) c.mass *= 0.9994;
        // clamp world
        const r = massToRadius(c.mass);
        c.x = clamp(c.x, r, B_WORLD - r);
        c.y = clamp(c.y, r, B_WORLD - r);
      });
      // resolve overlap between own cells (push apart unless mergeable)
      for (let i = 0; i < b.cells.length; i++) {
        for (let j = i + 1; j < b.cells.length; j++) {
          const a = b.cells[i], cc = b.cells[j];
          const ar = massToRadius(a.mass), br = massToRadius(cc.mass);
          const dx = cc.x - a.x, dy = cc.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const merging = Date.now() > a.mergeAt && Date.now() > cc.mergeAt;
          if (merging && d < (ar + br) * 0.4) {
            // MERGE
            a.mass += cc.mass; b.cells.splice(j, 1); j--; continue;
          }
          if (d < ar + br) {
            const push = (ar + br - d) / 2;
            const px = (dx / d) * push, py = (dy / d) * push;
            a.x -= px; a.y -= py; cc.x += px; cc.y += py;
          }
        }
      }
    });

    // === pellet eating ===
    s.blobs.forEach((b) => {
      if (!b.alive) return;
      b.cells.forEach((c) => {
        const r = massToRadius(c.mass);
        for (let i = s.pellets.length - 1; i >= 0; i--) {
          const o = s.pellets[i];
          const dx = o.x - c.x, dy = o.y - c.y;
          if (dx * dx + dy * dy < (r + 6) ** 2) {
            c.mass += o.mass * (b.massMul || 1);
            b.score += 1;
            s.pellets.splice(i, 1);
          }
        }
      });
    });
    while (s.pellets.length < B_PELLET_COUNT) s.pellets.push(makePellet());

    // === virus collisions: large cell touching a virus splits it ===
    s.blobs.forEach((b) => {
      if (!b.alive) return;
      for (let i = s.viruses.length - 1; i >= 0; i--) {
        const v = s.viruses[i];
        const vR = massToRadius(v.mass);
        for (const c of b.cells) {
          const cR = massToRadius(c.mass);
          const dx = c.x - v.x, dy = c.y - v.y;
          if (dx * dx + dy * dy < (cR - vR / 2) ** 2 && c.mass > v.mass * 1.15) {
            // pop the player
            virusSplit(b, c);
            s.viruses.splice(i, 1);
            s.viruses.push(makeVirus());
            break;
          }
        }
      }
    });

    // === blob-vs-blob eating ===
    for (const eater of s.blobs) {
      if (!eater.alive) continue;
      for (const prey of s.blobs) {
        if (prey === eater || !prey.alive) continue;
        for (const ec of eater.cells) {
          for (let pi = prey.cells.length - 1; pi >= 0; pi--) {
            const pc = prey.cells[pi];
            if (ec.mass < pc.mass * 1.25) continue;
            const dx = ec.x - pc.x, dy = ec.y - pc.y;
            const ecR = massToRadius(ec.mass);
            if (dx * dx + dy * dy < (ecR - massToRadius(pc.mass) * 0.5) ** 2) {
              ec.mass += pc.mass * (eater.massMul || 1);
              eater.score += Math.floor(pc.mass);
              prey.cells.splice(pi, 1);
            }
          }
        }
        if (prey.cells.length === 0) {
          prey.alive = false;
          eater.eats = (eater.eats || 0) + 1;
          eater.score += 200;
        }
      }
    }

    // === respawn dead bots ===
    s.blobs.forEach((b, idx) => {
      if (b.isPlayer || b.alive) return;
      b.deathFlash = (b.deathFlash || 0) + 1;
      if (b.deathFlash > 180) {
        s.blobs[idx] = spawnBotBlob(idx);
      }
    });

    // === camera ===
    if (p.alive) {
      const big = biggestCell(p);
      s.cam.x = lerp(s.cam.x, big.x, 0.12);
      s.cam.y = lerp(s.cam.y, big.y, 0.12);
    }
  }

  function dist2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function splitBlob(b) {
    const newCells = [];
    for (const c of b.cells) {
      if (c.mass >= 36 && b.cells.length + newCells.length < B_MAX_CELLS) {
        const ang = Math.atan2(b.targetY - c.y, b.targetX - c.x);
        const piece = {
          x: c.x + Math.cos(ang) * 6,
          y: c.y + Math.sin(ang) * 6,
          mass: c.mass / 2,
          vx: Math.cos(ang) * B_SPLIT_BOOST,
          vy: Math.sin(ang) * B_SPLIT_BOOST,
          mergeAt: Date.now() + 10_000,
        };
        c.mass /= 2;
        c.mergeAt = Date.now() + 10_000;
        newCells.push(piece);
      }
    }
    b.cells.push(...newCells);
  }
  function virusSplit(b, c) {
    if (b.cells.length >= B_MAX_CELLS) { c.mass *= 0.85; return; }
    const splits = Math.min(5, B_MAX_CELLS - b.cells.length);
    const each = c.mass / (splits + 1);
    c.mass = each;
    for (let i = 0; i < splits; i++) {
      const ang = (i / splits) * Math.PI * 2 + Math.random();
      b.cells.push({
        x: c.x, y: c.y, mass: each,
        vx: Math.cos(ang) * 14, vy: Math.sin(ang) * 14,
        mergeAt: Date.now() + 14_000,
      });
    }
    c.mergeAt = Date.now() + 14_000;
  }
  function ejectMass(s, b) {
    for (const c of b.cells) {
      if (c.mass < 24) continue;
      c.mass -= 16;
      const ang = Math.atan2(b.targetY - c.y, b.targetX - c.x);
      s.pellets.push({
        x: c.x + Math.cos(ang) * (massToRadius(c.mass) + 6),
        y: c.y + Math.sin(ang) * (massToRadius(c.mass) + 6),
        color: '#9F7CFF', mass: 12,
      });
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  function draw(ctx, cnv, s) {
    const w = cnv.width, h = cnv.height;
    const dpr = devicePixelRatio;
    const zoom = s.cam.zoom;
    const offX = w / 2 - s.cam.x * dpr * zoom;
    const offY = h / 2 - s.cam.y * dpr * zoom;

    ctx.fillStyle = '#0a0418';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(zoom, zoom);

    // grid
    ctx.strokeStyle = 'rgba(159,124,255,0.07)';
    ctx.lineWidth = 1 / zoom;
    const gridSize = 100;
    const view = { x: s.cam.x - (w / dpr) / 2 / zoom, y: s.cam.y - (h / dpr) / 2 / zoom,
                   w: (w / dpr) / zoom, h: (h / dpr) / zoom };
    const startX = Math.floor(view.x / gridSize) * gridSize;
    const endX   = Math.ceil((view.x + view.w) / gridSize) * gridSize;
    const startY = Math.floor(view.y / gridSize) * gridSize;
    const endY   = Math.ceil((view.y + view.h) / gridSize) * gridSize;
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x * dpr, Math.max(0, startY) * dpr); ctx.lineTo(x * dpr, Math.min(B_WORLD, endY) * dpr); ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(Math.max(0, startX) * dpr, y * dpr); ctx.lineTo(Math.min(B_WORLD, endX) * dpr, y * dpr); ctx.stroke();
    }
    // border
    ctx.strokeStyle = 'rgba(140,247,240,0.4)';
    ctx.lineWidth = 4 / zoom;
    ctx.strokeRect(0, 0, B_WORLD * dpr, B_WORLD * dpr);

    // pellets
    for (const o of s.pellets) {
      const x = o.x * dpr, y = o.y * dpr;
      // cull
      if (o.x < view.x - 20 || o.x > view.x + view.w + 20) continue;
      if (o.y < view.y - 20 || o.y > view.y + view.h + 20) continue;
      ctx.fillStyle = o.color;
      ctx.beginPath(); ctx.arc(x, y, 6 * dpr / 2, 0, Math.PI * 2); ctx.fill();
    }

    // viruses (spiky cyan)
    for (const v of s.viruses) {
      const x = v.x * dpr, y = v.y * dpr, r = massToRadius(v.mass) * dpr;
      ctx.fillStyle = '#2DBFB0';
      ctx.beginPath();
      const spikes = 18;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.82;
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0f8c8a';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
    }

    // blobs (sorted small→big so big draw on top)
    const order = s.blobs.filter((b) => b.alive).flatMap((b) => b.cells.map((c) => ({ b, c })));
    order.sort((a, z) => a.c.mass - z.c.mass);
    for (const { b, c } of order) drawBlob(ctx, b, c, dpr, zoom);

    ctx.restore();
  }

  function drawBlob(ctx, b, c, dpr, zoom) {
    const r = massToRadius(c.mass) * dpr;
    const x = c.x * dpr, y = c.y * dpr;
    const monanimal = MONANIMAL_BY_ID[b.monanimal] || MONANIMALS[0];
    // outer aura for player
    if (b.isPlayer) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.25);
      g.addColorStop(0, '#8CF7F0aa');
      g.addColorStop(1, '#8CF7F000');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.fill();
    }
    // body
    ctx.fillStyle = monanimal.color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a0418';
    ctx.lineWidth = 2 * dpr / zoom;
    ctx.stroke();
    // wobble highlight
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.4, r * 0.25, -0.5, 0, Math.PI * 2); ctx.fill();
    // sprite face
    const img = loadSprite(monanimal.sprite);
    if (img && img.complete && img.naturalWidth > 0 && r > 12) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, Math.PI * 2); ctx.clip();
      const sz = r * 1.85;
      ctx.drawImage(img, x - sz / 2, y - sz / 2, sz, sz);
      ctx.restore();
    }
    // name + mass
    if (r > 18) {
      ctx.fillStyle = b.isPlayer ? '#8CF7F0' : '#fff';
      ctx.font = `800 ${Math.max(11, Math.floor(r * 0.28))}px Inter Tight, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#0a0418cc';
      ctx.lineWidth = 3 / zoom;
      ctx.strokeText(b.name, x, y - r * 0.15);
      ctx.fillText(b.name, x, y - r * 0.15);
      ctx.font = `700 ${Math.max(10, Math.floor(r * 0.22))}px JetBrains Mono, monospace`;
      ctx.strokeText(Math.floor(c.mass), x, y + r * 0.2);
      ctx.fillText(Math.floor(c.mass), x, y + r * 0.2);
    }
  }

  function drawMinimap(ctx, cnv, s) {
    const w = cnv.width, h = cnv.height;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(140,247,240,0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    const sx = w / B_WORLD, sy = h / B_WORLD;
    s.viruses.forEach((v) => {
      ctx.fillStyle = '#2DBFB0';
      ctx.beginPath(); ctx.arc(v.x * sx, v.y * sy, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    s.blobs.forEach((b) => {
      if (!b.alive) return;
      const big = biggestCell(b);
      const m = MONANIMAL_BY_ID[b.monanimal] || MONANIMALS[0];
      ctx.fillStyle = b.isPlayer ? '#8CF7F0' : m.color;
      ctx.beginPath();
      ctx.arc(big.x * sx, big.y * sy, b.isPlayer ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // view rect
    const stage = cnvRef.current ? cnvRef.current.getBoundingClientRect() : { width: 800, height: 600 };
    const z = s.cam.zoom || 1;
    const viewW = (stage.width / z) * sx;
    const viewH = (stage.height / z) * sy;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.cam.x * sx - viewW / 2, s.cam.y * sy - viewH / 2, viewW, viewH);
  }

  // ============================================================
  // SUBMIT
  // ============================================================
  const onSubmitRun = useCallback(async () => {
    if (!runStats) return;
    setTxState({ state: 'pending' });
    const res = await submitRunOnChain({
      game: 'blob',
      walletState: wallet,
      score: runStats.score,
      actual: runStats.eats,
      maxTile: clamp(runStats.mass, 0, 65535),
      moves: clamp(runStats.seconds, 0, 65535),
      difficulty: 1,
      profileHash: '0x' + '0'.repeat(64),
    });
    if (res.ok) {
      setTxState({ state: 'submitted', txHash: res.txHash, mock: res.mock });
      submitToLeaderboard('blob', {
        wallet: wallet.address,
        name: name.trim() || 'YOU',
        monanimal: monanimalId,
        score: runStats.score,
        actual: runStats.eats,
        meta: `${runStats.eats} eaten · ${runStats.mass} mass`,
        seconds: runStats.seconds,
        timestamp: Date.now(),
        txHash: res.txHash,
        onChain: !res.mock,
      });
      window.dispatchEvent(new Event('moncade-lb-update'));
      pushToast(res.mock ? 'Run saved (demo)' : 'Run posted on Monad', 'cyan');
    } else {
      setTxState({ state: 'error', error: res.error || 'failed' });
      pushToast('Tx failed: ' + (res.error || ''), 'pink');
    }
  }, [runStats, wallet, monanimalId, name]);

  // ============================================================
  // RENDER ROOT
  // ============================================================
  return (
    <div className="game-shell">
      <header className="game-topbar">
        <div className="left">
          <button className="game-back" onClick={onExit}>← LOBBY</button>
          <span className="gname">Monbubble<em>.io</em></span>
        </div>
        <div className="right">
          <span className="chip"><span className="dot live"></span> {B_BOTS + 1} on stage</span>
          {wallet.address ? (
            <span className="chip active">{shortAddr(wallet.address)}{wallet.balance ? ` · ${wallet.balance} MON` : ''}</span>
          ) : (
            <span className="chip">No wallet</span>
          )}
        </div>
      </header>
      <div className="game-stage" ref={stageRef}>
        <canvas ref={cnvRef} />

        {phase === 'playing' && (
          <>
            <div className="hud">
              <div className="hud-card"><div className="l">Score</div><div className="v">{fmt(hud.score)}</div></div>
              <div className="hud-card purple"><div className="l">Mass</div><div className="v">{hud.mass}</div></div>
              <div className="hud-card pink"><div className="l">Eaten</div><div className="v">{hud.eats}</div></div>
              <div className="hud-card"><div className="l">Rank</div><div className="v">#{hud.rank}</div></div>
            </div>
            <div className="hud-right">
              <div className="minimap">
                <span className="mm-label">Map</span>
                <canvas ref={miniRef} />
              </div>
              <div className="lb-mini">
                <div className="lbm-title">Live Top 8</div>
                {topboard.map((b, i) => {
                  const m = MONANIMAL_BY_ID[b.monanimal] || MONANIMALS[0];
                  return (
                    <div key={b.name + i} className={`lbm-row ${b.isPlayer ? 'you' : ''}`}>
                      <span className="nm">
                        <span className="sw" style={{ background: m.color }}></span>
                        {b.name}
                      </span>
                      <span className="sc">{Math.floor(totalMass(b))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <BlobHint />
          </>
        )}

        {phase === 'lobby' && (
          <BlobLobbyOverlay
            monanimalId={monanimalId} setMonanimalId={setMonanimalId}
            name={name} setName={setName}
            onPlay={startGame} onExit={onExit}
          />
        )}

        {phase === 'dead' && runStats && (
          <GameOverOverlay
            game="blob"
            stats={[
              { l: 'Score', v: fmt(runStats.score) },
              { l: 'Mass',  v: runStats.mass },
              { l: 'Eaten', v: runStats.eats },
            ]}
            onPlay={startGame} onExit={onExit}
            txState={txState} onSubmit={onSubmitRun}
            wallet={wallet}
          />
        )}
      </div>
    </div>
  );
}

function BlobHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 5500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      padding: '10px 16px',
      background: 'rgba(0,0,0,0.55)', border: '1px solid var(--line)', borderRadius: 8,
      backdropFilter: 'blur(12px)',
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: 'var(--ink-soft)', textAlign: 'center',
    }}>
      Move with cursor · [SPACE] to split · [W] to eject mass · Avoid the spikes
    </div>
  );
}

function BlobLobbyOverlay({ monanimalId, setMonanimalId, name, setName, onPlay, onExit }) {
  return (
    <div className="game-overlay">
      <div className="game-card">
        <div className="kicker">Cabinet 02</div>
        <h2>Monbubble</h2>
        <p className="sub">Eat smaller. Dodge bigger. Split into pieces to chase the chompers.</p>
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 18))}
          placeholder="Your handle"
          maxLength={18}
        />
        <div className="character-pick">
          {MONANIMALS.map((m) => (
            <button key={m.id}
              className={monanimalId === m.id ? 'selected' : ''}
              onClick={() => setMonanimalId(m.id)}
              title={m.name + ' · ' + m.blurb}
            >
              <img src={m.sprite} alt={m.name} />
              <span className="char-tag">{m.name}</span>
            </button>
          ))}
        </div>
        <div className="actions">
          <button onClick={onExit}>← Back</button>
          <button className="primary" onClick={onPlay}>▶ Drop in</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BlobGame });
