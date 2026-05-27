/* global React, MONANIMALS, MONANIMAL_BY_ID, SKIN_COLORS, loadSprite,
          clamp, rand, randomBotName, randomMonanimal, fmt, shortAddr,
          submitRunOnChain, submitToLeaderboard, useToasts, pushToast, useWallet */
// Monslither — slither.io-style PvP with Monanimal heads.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ============================================================
// GAME CONSTANTS
// ============================================================
const WORLD = 3200;
const MAX_BOTS = 12;
const ORB_COUNT = 320;
const BASE_SPEED = 2.8;
const BOOST_SPEED = 5.2;
const TURN_RATE = 0.07;
const SEG_GAP = 6.5;
const HEAD_R = 12;
const BOOST_COST_RATE = 0.03; // length per frame while boosting

// ============================================================
// FACTORIES
// ============================================================
function makeSnake({ x, y, name, monanimalId, skin, isPlayer = false }) {
  const startLen = 30;
  const angle = Math.random() * Math.PI * 2;
  const seg = [];
  for (let i = 0; i < startLen; i++) seg.push({ x: x - Math.cos(angle) * i * SEG_GAP, y: y - Math.sin(angle) * i * SEG_GAP });
  return {
    name,
    monanimal: monanimalId,
    skin: skin || SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)],
    isPlayer,
    alive: true,
    boosting: false,
    angle,
    targetAngle: angle,
    seg, length: startLen, score: 0, kills: 0,
    // bot AI state
    aiTarget: null,
    aiTimer: 0,
    deathFlash: 0,
  };
}

function makeOrb() {
  const palette = ['#9F7CFF','#FF4FA1','#8CF7F0','#FFE66D','#2DBFB0','#C27C46','#d8c7ff'];
  return {
    x: rand(40, WORLD - 40),
    y: rand(40, WORLD - 40),
    r: rand(2.5, 4.5),
    color: palette[Math.floor(Math.random() * palette.length)],
    value: 1,
  };
}

function spawnSnakeAtEdge({ name, monanimalId, skin, isPlayer = false }) {
  const margin = 200;
  const side = Math.floor(Math.random() * 4);
  let x, y;
  if (side === 0)      { x = rand(margin, WORLD - margin); y = margin; }
  else if (side === 1) { x = WORLD - margin; y = rand(margin, WORLD - margin); }
  else if (side === 2) { x = rand(margin, WORLD - margin); y = WORLD - margin; }
  else                 { x = margin; y = rand(margin, WORLD - margin); }
  return makeSnake({ x, y, name, monanimalId, skin, isPlayer });
}

// ============================================================
// MAIN COMPONENT
// ============================================================
function SnakeGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('lobby'); // lobby | playing | dead
  const [monanimalId, setMonanimalId] = useState('molandak');
  const [name, setName] = useState(() => localStorage.getItem('moncade.name') || '');
  const [hud, setHud] = useState({ score: 0, length: 30, kills: 0, rank: 1, alive: true });
  const [topboard, setTopboard] = useState([]);
  const [runStats, setRunStats] = useState(null);
  const [txState, setTxState] = useState(null); // { state, txHash, error }

  const stageRef = useRef(null);
  const cnvRef = useRef(null);
  const miniRef = useRef(null);
  const stateRef = useRef(null); // game state lives in ref to avoid React re-renders per frame
  const inputRef = useRef({ mx: 0.5, my: 0.5, boost: false, focused: false });
  const startTimeRef = useRef(0);

  // ============================================================
  // GAME INIT
  // ============================================================
  const startGame = useCallback(() => {
    if (name.trim()) localStorage.setItem('moncade.name', name.trim());
    const monanimal = MONANIMAL_BY_ID[monanimalId] || MONANIMALS[0];
    const player = makeSnake({
      x: WORLD / 2, y: WORLD / 2,
      name: name.trim() || 'YOU',
      monanimalId: monanimal.id,
      skin: SKIN_COLORS[0],
      isPlayer: true,
    });
    // apply monanimal modifier to player's effective speed via state
    player.speedMul = monanimal.snakeStat.speed;
    player.turnMul  = monanimal.snakeStat.turn;
    player.sizeMul  = monanimal.snakeStat.size;

    const bots = [];
    for (let i = 0; i < MAX_BOTS; i++) {
      const m = randomMonanimal();
      const b = spawnSnakeAtEdge({
        name: randomBotName() + (Math.random() < 0.2 ? '.eth' : ''),
        monanimalId: m.id,
        skin: SKIN_COLORS[(i + 1) % SKIN_COLORS.length],
      });
      b.speedMul = m.snakeStat.speed;
      b.turnMul  = m.snakeStat.turn;
      b.sizeMul  = m.snakeStat.size;
      // give bots varying starting lengths so leaderboard isn't a tie
      const extra = Math.floor(rand(0, 60));
      for (let k = 0; k < extra; k++) b.seg.push({ ...b.seg[b.seg.length - 1] });
      b.length = b.seg.length;
      b.score  = (b.length - 30) * 10 + Math.floor(rand(0, 400));
      bots.push(b);
    }
    const orbs = Array.from({ length: ORB_COUNT }, makeOrb);

    stateRef.current = {
      player,
      snakes: [player, ...bots],
      orbs,
      cam: { x: WORLD / 2, y: WORLD / 2 },
      t: 0,
    };
    startTimeRef.current = performance.now();
    setHud({ score: 0, length: 30, kills: 0, rank: bots.length + 1, alive: true });
    setRunStats(null);
    setTxState(null);
    setPhase('playing');
  }, [name, monanimalId]);

  // ============================================================
  // INPUT
  // ============================================================
  useEffect(() => {
    if (phase !== 'playing') return;
    const stage = stageRef.current;
    if (!stage) return;
    const onMove = (e) => {
      const rect = stage.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      inputRef.current.mx = cx / rect.width;
      inputRef.current.my = cy / rect.height;
      inputRef.current.focused = true;
    };
    const onDown = (e) => {
      inputRef.current.boost = true;
      if (e.touches) onMove(e);
    };
    const onUp = () => { inputRef.current.boost = false; };
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        inputRef.current.boost = true;
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') inputRef.current.boost = false;
    };
    stage.addEventListener('mousemove', onMove);
    stage.addEventListener('mousedown', onDown);
    stage.addEventListener('mouseup',   onUp);
    stage.addEventListener('mouseleave', onUp);
    stage.addEventListener('touchstart', onDown, { passive: true });
    stage.addEventListener('touchmove',  onMove, { passive: true });
    stage.addEventListener('touchend',   onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      stage.removeEventListener('mousemove', onMove);
      stage.removeEventListener('mousedown', onDown);
      stage.removeEventListener('mouseup',   onUp);
      stage.removeEventListener('mouseleave', onUp);
      stage.removeEventListener('touchstart', onDown);
      stage.removeEventListener('touchmove',  onMove);
      stage.removeEventListener('touchend',   onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, [phase]);

  // ============================================================
  // GAME LOOP
  // ============================================================
  useEffect(() => {
    if (phase !== 'playing') return;
    const cnv = cnvRef.current;
    const mini = miniRef.current;
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

      // sync hud occasionally
      if (s.t % 6 === 0) {
        const ranks = s.snakes.filter((sn) => sn.alive).slice().sort((a, b) => b.score - a.score);
        const playerRank = ranks.findIndex((sn) => sn.isPlayer) + 1 || ranks.length + 1;
        setHud({
          score: Math.floor(s.player.score),
          length: s.player.length,
          kills: s.player.kills,
          rank: playerRank || 1,
          alive: s.player.alive,
        });
        setTopboard(ranks.slice(0, 8));
      }

      // detect death
      if (!s.player.alive && phase === 'playing') {
        const elapsed = Math.floor((performance.now() - startTimeRef.current) / 1000);
        setRunStats({
          score: Math.floor(s.player.score),
          length: s.player.length,
          kills: s.player.kills,
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
  // STEP — physics, AI, collisions
  // ============================================================
  function step(s) {
    const p = s.player;
    // === player input ===
    if (p.alive) {
      const cnv = cnvRef.current;
      const r = cnv.getBoundingClientRect();
      const wx = s.cam.x + (inputRef.current.mx - 0.5) * r.width;
      const wy = s.cam.y + (inputRef.current.my - 0.5) * r.height;
      p.targetAngle = Math.atan2(wy - p.seg[0].y, wx - p.seg[0].x);
      p.boosting = inputRef.current.boost && p.length > 32;
    }

    // === AI for bots ===
    s.snakes.forEach((sn) => {
      if (sn.isPlayer || !sn.alive) return;
      sn.aiTimer--;
      if (sn.aiTimer <= 0 || !sn.aiTarget) {
        // pick: nearest 3 orbs OR aggression target (if larger than nearby snake)
        const head = sn.seg[0];
        let nearOrb = null; let nearOrbD = Infinity;
        for (let i = 0; i < s.orbs.length; i += 3) {
          const o = s.orbs[i];
          const d = (o.x - head.x) ** 2 + (o.y - head.y) ** 2;
          if (d < nearOrbD) { nearOrbD = d; nearOrb = o; }
        }
        // aggression: if substantially larger than player, head toward player
        if (sn.length > p.length * 1.4 && p.alive && Math.random() < 0.5) {
          sn.aiTarget = { x: p.seg[0].x, y: p.seg[0].y };
        } else if (nearOrb) {
          sn.aiTarget = { x: nearOrb.x + rand(-40, 40), y: nearOrb.y + rand(-40, 40) };
        } else {
          sn.aiTarget = { x: WORLD/2, y: WORLD/2 };
        }
        sn.aiTimer = 30 + Math.floor(rand(0, 40));
      }
      // avoid walls
      const head = sn.seg[0];
      if (head.x < 200) sn.aiTarget = { x: WORLD/2, y: head.y };
      if (head.x > WORLD - 200) sn.aiTarget = { x: WORLD/2, y: head.y };
      if (head.y < 200) sn.aiTarget = { x: head.x, y: WORLD/2 };
      if (head.y > WORLD - 200) sn.aiTarget = { x: head.x, y: WORLD/2 };
      sn.targetAngle = Math.atan2(sn.aiTarget.y - head.y, sn.aiTarget.x - head.x);
      // occasional boost
      sn.boosting = (Math.random() < 0.005 && sn.length > 50);
    });

    // === move ===
    s.snakes.forEach((sn) => {
      if (!sn.alive) return;
      // turn toward target
      let diff = sn.targetAngle - sn.angle;
      while (diff > Math.PI)  diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = TURN_RATE * (sn.turnMul || 1);
      sn.angle += clamp(diff, -turn, turn);
      const speed = (sn.boosting ? BOOST_SPEED : BASE_SPEED) * (sn.speedMul || 1);
      const head = sn.seg[0];
      const nx = head.x + Math.cos(sn.angle) * speed;
      const ny = head.y + Math.sin(sn.angle) * speed;
      // wall collide → die
      if (nx < 6 || nx > WORLD - 6 || ny < 6 || ny > WORLD - 6) {
        killSnake(s, sn);
        return;
      }
      sn.seg.unshift({ x: nx, y: ny });
      // length budget
      let want = Math.max(20, Math.floor(sn.length));
      if (sn.seg.length > want) sn.seg.length = want;
      // boost cost
      if (sn.boosting) {
        sn.length = Math.max(20, sn.length - BOOST_COST_RATE);
        if (Math.random() < 0.4) {
          // drop orbs while boosting
          const tail = sn.seg[sn.seg.length - 1];
          if (tail) {
            s.orbs.push({ x: tail.x + rand(-6, 6), y: tail.y + rand(-6, 6), r: 3, color: sn.skin.body, value: 1 });
          }
        }
      }
    });

    // === orb collisions ===
    s.snakes.forEach((sn) => {
      if (!sn.alive) return;
      const head = sn.seg[0];
      const r = (HEAD_R + 14) * (sn.sizeMul || 1);
      for (let i = s.orbs.length - 1; i >= 0; i--) {
        const o = s.orbs[i];
        const dx = o.x - head.x, dy = o.y - head.y;
        if (dx * dx + dy * dy < r * r) {
          sn.length += 0.7;
          sn.score  += o.value;
          s.orbs.splice(i, 1);
        }
      }
    });
    // top up orbs
    while (s.orbs.length < ORB_COUNT) s.orbs.push(makeOrb());

    // === snake-vs-snake (head touches other body) ===
    s.snakes.forEach((sn) => {
      if (!sn.alive) return;
      const head = sn.seg[0];
      const myR = HEAD_R * (sn.sizeMul || 1);
      for (const other of s.snakes) {
        if (other === sn || !other.alive) continue;
        // skip first few segs to avoid self-kill on tight turns
        for (let i = 6; i < other.seg.length; i += 2) {
          const seg = other.seg[i];
          const dx = seg.x - head.x, dy = seg.y - head.y;
          const segR = 7 * (other.sizeMul || 1);
          if (dx * dx + dy * dy < (myR + segR) ** 2) {
            // sn died, other gets kill
            killSnake(s, sn);
            other.kills = (other.kills || 0) + 1;
            other.score += Math.floor(sn.length * 5);
            return;
          }
        }
      }
    });

    // respawn dead bots after a delay so the world feels alive
    s.snakes.forEach((sn, idx) => {
      if (sn.isPlayer || sn.alive) return;
      sn.deathFlash = (sn.deathFlash || 0) + 1;
      if (sn.deathFlash > 240) {
        const m = randomMonanimal();
        const fresh = spawnSnakeAtEdge({
          name: randomBotName() + (Math.random() < 0.2 ? '.eth' : ''),
          monanimalId: m.id,
          skin: SKIN_COLORS[(idx + Math.floor(rand(0, 6))) % SKIN_COLORS.length],
        });
        fresh.speedMul = m.snakeStat.speed;
        fresh.turnMul  = m.snakeStat.turn;
        fresh.sizeMul  = m.snakeStat.size;
        s.snakes[idx] = fresh;
      }
    });

    // === camera follow ===
    if (p.alive) {
      s.cam.x = lerp(s.cam.x, p.seg[0].x, 0.18);
      s.cam.y = lerp(s.cam.y, p.seg[0].y, 0.18);
    }
  }

  function killSnake(s, sn) {
    sn.alive = false;
    // explode into orbs
    sn.seg.forEach((seg, i) => {
      if (i % 2 === 0) {
        s.orbs.push({ x: seg.x + rand(-8, 8), y: seg.y + rand(-8, 8), r: rand(2.5, 4.5), color: sn.skin.body, value: 2 });
      }
    });
  }

  // ============================================================
  // RENDER
  // ============================================================
  function draw(ctx, cnv, s) {
    const w = cnv.width, h = cnv.height;
    const dpr = devicePixelRatio;
    const camX = s.cam.x, camY = s.cam.y;
    const offX = w / 2 - camX * dpr;
    const offY = h / 2 - camY * dpr;

    // background
    ctx.fillStyle = '#0a0418';
    ctx.fillRect(0, 0, w, h);

    // world bounds + grid
    ctx.save();
    ctx.translate(offX, offY);
    // grid lines
    ctx.strokeStyle = 'rgba(159,124,255,0.08)';
    ctx.lineWidth = 1;
    const gridSize = 80;
    const startX = Math.floor((camX - w / dpr / 2) / gridSize) * gridSize;
    const endX   = Math.ceil((camX + w / dpr / 2) / gridSize) * gridSize;
    const startY = Math.floor((camY - h / dpr / 2) / gridSize) * gridSize;
    const endY   = Math.ceil((camY + h / dpr / 2) / gridSize) * gridSize;
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x * dpr, Math.max(0, startY) * dpr); ctx.lineTo(x * dpr, Math.min(WORLD, endY) * dpr); ctx.stroke();
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(Math.max(0, startX) * dpr, y * dpr); ctx.lineTo(Math.min(WORLD, endX) * dpr, y * dpr); ctx.stroke();
    }
    // world border
    ctx.strokeStyle = 'rgba(140,247,240,0.4)';
    ctx.lineWidth = 4 * dpr;
    ctx.strokeRect(0, 0, WORLD * dpr, WORLD * dpr);

    // orbs
    for (const o of s.orbs) {
      const x = o.x * dpr, y = o.y * dpr;
      // cull
      if (x < -20 * dpr - offX || x > w - offX + 20 * dpr) continue;
      if (y < -20 * dpr - offY || y > h - offY + 20 * dpr) continue;
      const r = o.r * dpr;
      // glow
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, o.color + 'aa');
      g.addColorStop(1, o.color + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // snakes (back-to-front by length so big ones overlap small)
    const drawOrder = s.snakes.filter((sn) => sn.alive).sort((a, b) => a.length - b.length);
    for (const sn of drawOrder) drawSnake(ctx, sn, dpr);

    ctx.restore();

    // boost meter (top-left HUD-adjacent)
    // crosshair / aim
    // none — head + arrow direction is enough
  }

  function drawSnake(ctx, sn, dpr) {
    const seg = sn.seg;
    if (!seg.length) return;
    const baseR = 10 * (sn.sizeMul || 1) * dpr;
    // boost shimmer
    const boostBoost = sn.boosting ? 1.15 : 1.0;
    // body — gradient from glow at edges to body color
    for (let i = seg.length - 1; i >= 1; i--) {
      const p = seg[i];
      const r = baseR * boostBoost * (1 + 0.18 * Math.sin(i * 0.3 + sn.seg.length));
      ctx.fillStyle = sn.skin.body;
      ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, r, 0, Math.PI * 2); ctx.fill();
      // ridge highlight
      if (i % 6 === 0) {
        ctx.fillStyle = sn.skin.glow + '66';
        ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, r * 0.55, 0, Math.PI * 2); ctx.fill();
      }
    }
    // outer outline along body using stroke connecting segments
    // (skipped for performance; head shading is the focus)

    // head with monanimal sprite
    const head = seg[0];
    const monanimal = MONANIMAL_BY_ID[sn.monanimal] || MONANIMALS[0];
    const headR = baseR * 1.5 * boostBoost;
    // glow
    if (sn.boosting) {
      const g = ctx.createRadialGradient(head.x * dpr, head.y * dpr, 0, head.x * dpr, head.y * dpr, headR * 2.4);
      g.addColorStop(0, sn.skin.glow + 'cc');
      g.addColorStop(1, sn.skin.glow + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(head.x * dpr, head.y * dpr, headR * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // body bg
    ctx.fillStyle = sn.skin.body;
    ctx.beginPath(); ctx.arc(head.x * dpr, head.y * dpr, headR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a0418';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    // sprite face
    const img = loadSprite(monanimal.sprite);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(head.x * dpr, head.y * dpr);
      ctx.rotate(sn.angle + Math.PI / 2);
      ctx.translate(-head.x * dpr, -head.y * dpr);
      ctx.save();
      ctx.beginPath(); ctx.arc(head.x * dpr, head.y * dpr, headR * 0.92, 0, Math.PI * 2); ctx.clip();
      const sz = headR * 1.9;
      ctx.drawImage(img, head.x * dpr - sz / 2, head.y * dpr - sz / 2, sz, sz);
      ctx.restore();
      ctx.restore();
    }
    // name tag
    if (sn.length > 24) {
      ctx.fillStyle = sn.isPlayer ? '#8CF7F0' : 'rgba(238,246,251,0.7)';
      ctx.font = `700 ${Math.floor(10 * dpr)}px JetBrains Mono, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(sn.name, head.x * dpr, head.y * dpr - headR - 6 * dpr);
    }
  }

  function drawMinimap(ctx, cnv, s) {
    const w = cnv.width, h = cnv.height;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    // world border
    ctx.strokeStyle = 'rgba(140,247,240,0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    // snakes
    const scaleX = w / WORLD;
    const scaleY = h / WORLD;
    s.snakes.forEach((sn) => {
      if (!sn.alive) return;
      const p = sn.seg[0];
      ctx.fillStyle = sn.isPlayer ? '#8CF7F0' : sn.skin.body;
      ctx.beginPath();
      ctx.arc(p.x * scaleX, p.y * scaleY, sn.isPlayer ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // view rectangle
    const cnvSize = cnvRef.current ? cnvRef.current.getBoundingClientRect() : { width: 800, height: 600 };
    const viewW = cnvSize.width  * scaleX;
    const viewH = cnvSize.height * scaleY;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.cam.x * scaleX - viewW / 2, s.cam.y * scaleY - viewH / 2, viewW, viewH);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ============================================================
  // ON DEATH — submit run
  // ============================================================
  const onSubmitRun = useCallback(async () => {
    if (!runStats) return;
    setTxState({ state: 'pending' });
    const monanimal = MONANIMAL_BY_ID[monanimalId];
    const profileHash = '0x' + Array.from({ length: 64 }, () => '0').join('');
    const res = await submitRunOnChain({
      game: 'snake',
      walletState: wallet,
      score: runStats.score,
      actual: runStats.kills,
      maxTile: clamp(runStats.length, 0, 65535),
      moves: clamp(runStats.seconds, 0, 65535),
      difficulty: 1,
      profileHash,
    });
    if (res.ok) {
      setTxState({ state: 'submitted', txHash: res.txHash, mock: res.mock });
      submitToLeaderboard('snake', {
        wallet: wallet.address,
        name: name.trim() || 'YOU',
        monanimal: monanimalId,
        score: runStats.score,
        actual: runStats.kills,
        meta: `len ${runStats.length} · ${runStats.kills} kills`,
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
  // RENDER
  // ============================================================
  return (
    <div className="game-shell">
      <header className="game-topbar">
        <div className="left">
          <button className="game-back" onClick={onExit}>← LOBBY</button>
          <span className="gname">Monslither<em>.io</em></span>
        </div>
        <div className="right">
          <span className="chip"><span className="dot live"></span> {MAX_BOTS + 1} on stage</span>
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
              <div className="hud-card purple"><div className="l">Length</div><div className="v">{Math.floor(hud.length)}</div></div>
              <div className="hud-card pink"><div className="l">Kills</div><div className="v">{hud.kills}</div></div>
              <div className="hud-card"><div className="l">Rank</div><div className="v">#{hud.rank}</div></div>
            </div>

            <div className="hud-right">
              <div className="minimap">
                <span className="mm-label">Map</span>
                <canvas ref={miniRef} />
              </div>
              <div className="lb-mini">
                <div className="lbm-title">Live Top 8</div>
                {topboard.map((sn, i) => (
                  <div key={sn.name + i} className={`lbm-row ${sn.isPlayer ? 'you' : ''}`}>
                    <span className="nm">
                      <span className="sw" style={{ background: sn.skin.body }}></span>
                      {sn.name}
                    </span>
                    <span className="sc">{fmt(sn.score)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* control hint, fades after a few seconds */}
            <ControlHint />
          </>
        )}

        {phase === 'lobby' && (
          <SnakeLobbyOverlay
            monanimalId={monanimalId} setMonanimalId={setMonanimalId}
            name={name} setName={setName}
            onPlay={startGame} onExit={onExit}
          />
        )}

        {phase === 'dead' && runStats && (
          <GameOverOverlay
            game="snake"
            stats={[
              { l: 'Score',   v: fmt(runStats.score) },
              { l: 'Length',  v: runStats.length },
              { l: 'Kills',   v: runStats.kills },
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

// ============================================================
// CONTROL HINT
// ============================================================
function ControlHint() {
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
      Move with your cursor · Click or [SPACE] to boost
    </div>
  );
}

// ============================================================
// LOBBY / DEATH OVERLAYS (shared with blob via inline impl)
// ============================================================
function SnakeLobbyOverlay({ monanimalId, setMonanimalId, name, setName, onPlay, onExit }) {
  return (
    <div className="game-overlay">
      <div className="game-card">
        <div className="kicker">Cabinet 01</div>
        <h2>Monslither</h2>
        <p className="sub">Eat the orbs. Coil the slow ones. Boost only when you're sure.</p>
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
          <button className="primary" onClick={onPlay}>▶ Slither</button>
        </div>
      </div>
    </div>
  );
}

function GameOverOverlay({ stats, onPlay, onExit, txState, onSubmit, wallet, game }) {
  return (
    <div className="game-overlay">
      <div className="game-card">
        <div className="kicker">{game === 'snake' ? 'You expired' : 'You got eaten'}</div>
        <h2>Game Over</h2>
        <div className="stats">
          {stats.map((s) => (
            <div key={s.l} className="stat">
              <div className="l">{s.l}</div>
              <div className="v">{s.v}</div>
            </div>
          ))}
        </div>
        {txState?.state === 'submitted' ? (
          <div className="tx-receipt">
            <div className="tx-line"><strong>{txState.mock ? 'Mock receipt' : 'Run on Monad'}</strong><span>{txState.mock ? 'demo' : 'chain 143'}</span></div>
            <div className="tx-line">
              <span>tx</span>
              <span><a href={`https://monadscan.com/tx/${txState.txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan-bright)' }}>{txState.txHash.slice(0, 10)}…{txState.txHash.slice(-6)}</a></span>
            </div>
          </div>
        ) : txState?.state === 'pending' ? (
          <div className="tx-receipt pending">
            <div className="tx-line"><strong>Submitting…</strong><span>waiting for wallet</span></div>
          </div>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!wallet.address}
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 10,
              borderRadius: 8, border: '1px solid var(--line)',
              background: wallet.address ? 'linear-gradient(135deg, #9F7CFF, #7AC9E8)' : 'rgba(255,255,255,0.04)',
              color: wallet.address ? '#0a0418' : 'var(--ink-mute)',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 900,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              cursor: wallet.address ? 'pointer' : 'not-allowed',
            }}>
            {wallet.address ? 'Post run on Monad' : 'Connect wallet to post'}
          </button>
        )}
        <div className="actions">
          <button onClick={onExit}>← Lobby</button>
          <button className="primary" onClick={onPlay}>▶ Run it back</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SnakeGame, GameOverOverlay });
