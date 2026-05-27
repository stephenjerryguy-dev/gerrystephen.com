/* global React, MONANIMALS, MONANIMAL_BY_ID, loadSprite, rand, clamp,
          submitRunOnChain, submitToLeaderboard, pushToast, fmt */
// Mongeon — top-down grid dungeon crawler. Real combat feel: damage numbers,
// screen shake, fog-of-war lighting, items, status effects, depth scaling.

const { useState, useEffect, useRef, useCallback } = React;

const TILE = 32;
const COLS = 22;
const ROWS = 14;

const T_FLOOR = 0;
const T_WALL  = 1;
const T_EXIT  = 2;
const T_LOOT  = 3;       // gold pile
const T_CHEST = 4;       // potion / item
const T_TRAP  = 5;       // spike trap (visible)

// ============================================================
// Procedural dungeon (carved corridors + rooms)
// ============================================================
function genDungeon(floor) {
  const grid = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => T_WALL));
  // carve rooms
  const rooms = [];
  const roomCount = 5 + Math.min(3, Math.floor(floor / 2));
  for (let i = 0; i < roomCount; i++) {
    const w = 3 + Math.floor(Math.random() * 4);
    const h = 3 + Math.floor(Math.random() * 3);
    const x = 1 + Math.floor(Math.random() * (COLS - w - 2));
    const y = 1 + Math.floor(Math.random() * (ROWS - h - 2));
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) grid[r][c] = T_FLOOR;
  }
  // connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    const stepX = a.cx < b.cx ? 1 : -1;
    for (let x = a.cx; x !== b.cx; x += stepX) grid[a.cy][x] = T_FLOOR;
    const stepY = a.cy < b.cy ? 1 : -1;
    for (let y = a.cy; y !== b.cy; y += stepY) grid[y][b.cx] = T_FLOOR;
  }
  // sprinkle loot in rooms
  const lootCount = 4 + floor;
  for (let i = 0; i < lootCount; i++) placeOn(grid, T_FLOOR, T_LOOT);
  // 1-2 chests per floor
  for (let i = 0; i < 1 + Math.min(1, Math.floor(floor / 3)); i++) placeOn(grid, T_FLOOR, T_CHEST);
  // traps
  for (let i = 0; i < floor + 2; i++) placeOn(grid, T_FLOOR, T_TRAP);
  // exit in last room
  const exitRoom = rooms[rooms.length - 1];
  grid[exitRoom.cy][exitRoom.cx] = T_EXIT;
  // start room
  const start = rooms[0];
  return { grid, start: { r: start.cy, c: start.cx }, rooms };
}

function placeOn(grid, want, place) {
  for (let tries = 0; tries < 80; tries++) {
    const r = 1 + Math.floor(Math.random() * (ROWS - 2));
    const c = 1 + Math.floor(Math.random() * (COLS - 2));
    if (grid[r][c] === want) { grid[r][c] = place; return; }
  }
}

function spawnEnemies(grid, floor, playerPos) {
  const enemies = [];
  const ids = MONANIMALS.map((m) => m.id);
  const wanted = 4 + floor;
  for (let tries = 0; tries < wanted * 10 && enemies.length < wanted; tries++) {
    const r = 1 + Math.floor(Math.random() * (ROWS - 2));
    const c = 1 + Math.floor(Math.random() * (COLS - 2));
    if (grid[r][c] !== T_FLOOR) continue;
    if (Math.abs(r - playerPos.r) + Math.abs(c - playerPos.c) < 5) continue;
    const tier = Math.random() < 0.18 + floor * 0.04 ? 'elite' : 'normal';
    enemies.push({
      r, c,
      monanimal: ids[Math.floor(Math.random() * ids.length)],
      hp: tier === 'elite' ? 3 + Math.floor(floor / 2) : 1 + Math.floor(floor / 3),
      maxHp: 0,
      tier,
      cool: 0,
      flash: 0,
      bob: Math.random() * Math.PI * 2,
    });
  }
  enemies.forEach((e) => { e.maxHp = e.hp; });
  return enemies;
}

// ============================================================
// MAIN
// ============================================================
function MongeonGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('start');
  const [monanimalId, setMonanimalId] = useState('molandak');
  const stageRef = useRef(null);
  const cnvRef = useRef(null);
  const stateRef = useRef(null);
  const [hud, setHud] = useState({ hp: 6, maxHp: 6, gold: 0, floor: 1, kills: 0, potions: 1 });
  const [final, setFinal] = useState(null);
  const [txState, setTxState] = useState(null);
  const [log, setLog] = useState([]);

  const pushLog = (text, tone = '') => {
    setLog((cur) => [...cur.slice(-3), { id: Math.random(), text, tone }]);
  };

  const startGame = useCallback(() => {
    const { grid, start } = genDungeon(1);
    stateRef.current = {
      grid,
      seen: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false)),
      player: {
        r: start.r, c: start.c, monanimal: monanimalId,
        hp: 6, maxHp: 6, gold: 0, kills: 0, floor: 1,
        potions: 1, atk: 1, def: 0, flash: 0,
      },
      enemies: [],
      damageNumbers: [],
      shake: 0,
      tick: 0,
    };
    stateRef.current.enemies = spawnEnemies(grid, 1, start);
    updateVisibility(stateRef.current);
    setHud({ hp: 6, maxHp: 6, gold: 0, floor: 1, kills: 0, potions: 1 });
    setLog([{ id: 1, text: 'Floor 1 — Mongeon awaits', tone: 'cyan' }]);
    setFinal(null);
    setTxState(null);
    setPhase('playing');
  }, [monanimalId]);

  const stepPlayer = (dr, dc) => {
    const s = stateRef.current; if (!s) return;
    const p = s.player;
    const nr = p.r + dr, nc = p.c + dc;
    if (s.grid[nr]?.[nc] === undefined) return;
    if (s.grid[nr][nc] === T_WALL) return;

    // attack if enemy on target tile
    const enemy = s.enemies.find((e) => e.r === nr && e.c === nc);
    if (enemy) {
      const dmg = p.atk + (Math.random() < 0.15 ? 1 : 0); // crit chance
      enemy.hp -= dmg;
      enemy.flash = 8;
      s.shake = 4;
      pushDmgNumber(s, enemy.c, enemy.r, dmg, dmg > 1 ? '#FFE66D' : '#FF4FA1');
      if (enemy.hp <= 0) {
        p.kills += 1;
        const loot = 4 + (enemy.tier === 'elite' ? 8 : 0);
        p.gold += loot;
        pushDmgNumber(s, enemy.c, enemy.r, `+${loot}g`, '#FFE66D');
        s.enemies = s.enemies.filter((e) => e !== enemy);
        pushLog(`Defeated ${MONANIMAL_BY_ID[enemy.monanimal].name}`, 'cyan');
      }
    } else {
      p.r = nr; p.c = nc;
      const tile = s.grid[nr][nc];
      if (tile === T_LOOT) {
        const g = 3 + Math.floor(Math.random() * 4);
        p.gold += g;
        s.grid[nr][nc] = T_FLOOR;
        pushDmgNumber(s, nc, nr, `+${g}g`, '#FFE66D');
      } else if (tile === T_CHEST) {
        const roll = Math.random();
        if (roll < 0.45) { p.potions += 1; pushLog('+1 potion', 'cyan'); }
        else if (roll < 0.7) { p.maxHp += 1; p.hp += 1; pushLog('+1 max HP', 'cyan'); }
        else if (roll < 0.88) { p.atk += 1; pushLog('+1 attack', 'cyan'); }
        else { p.gold += 30; pushDmgNumber(s, nc, nr, '+30g', '#FFE66D'); }
        s.grid[nr][nc] = T_FLOOR;
      } else if (tile === T_TRAP) {
        p.hp -= 1; p.flash = 16; s.shake = 8;
        pushDmgNumber(s, nc, nr, '-1', '#FF4FA1');
        pushLog('Spike trap!', 'pink');
        s.grid[nr][nc] = T_FLOOR;
      } else if (tile === T_EXIT) {
        p.floor += 1;
        p.hp = Math.min(p.maxHp, p.hp + 2);
        p.gold += 10;
        const { grid: ng, start } = genDungeon(p.floor);
        s.grid = ng;
        s.seen = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
        p.r = start.r; p.c = start.c;
        s.enemies = spawnEnemies(ng, p.floor, start);
        pushLog(`Descended to floor ${p.floor}`, 'cyan');
      }
    }

    // enemies step
    s.enemies.forEach((e) => {
      if (e.cool > 0) { e.cool--; return; }
      // simple greedy step
      const dx = Math.sign(p.c - e.c), dy = Math.sign(p.r - e.r);
      let mvR = 0, mvC = 0;
      if (Math.abs(p.c - e.c) > Math.abs(p.r - e.r)) mvC = dx; else mvR = dy;
      const tr = e.r + mvR, tc = e.c + mvC;
      if (tr === p.r && tc === p.c) {
        const dmg = (e.tier === 'elite' ? 2 : 1) - Math.min(p.def, 1);
        p.hp -= Math.max(1, dmg);
        s.shake = 10; p.flash = 14;
        pushDmgNumber(s, p.c, p.r, `-${Math.max(1, dmg)}`, '#FF4FA1');
        e.cool = 1;
        return;
      }
      if (s.grid[tr]?.[tc] === T_WALL || s.grid[tr]?.[tc] === undefined) return;
      if (s.enemies.some((o) => o !== e && o.r === tr && o.c === tc)) return;
      e.r = tr; e.c = tc;
    });

    updateVisibility(s);
    setHud({ hp: p.hp, maxHp: p.maxHp, gold: p.gold, floor: p.floor, kills: p.kills, potions: p.potions });
    if (p.hp <= 0) endRun();
  };

  const usePotion = () => {
    const s = stateRef.current; if (!s) return;
    const p = s.player;
    if (p.potions <= 0 || p.hp >= p.maxHp) return;
    p.potions -= 1;
    const heal = 3;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    pushDmgNumber(s, p.c, p.r, `+${heal}`, '#8CF7F0');
    setHud({ hp: p.hp, maxHp: p.maxHp, gold: p.gold, floor: p.floor, kills: p.kills, potions: p.potions });
    pushLog(`+${heal} HP (potion)`, 'cyan');
  };

  // keyboard
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e) => {
      const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
                    w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };
      const m = map[e.key]; if (m) { e.preventDefault(); stepPlayer(m[0], m[1]); return; }
      if (e.key === ' ' || e.key === '.' || e.key === 'q') { stepPlayer(0, 0); }   // wait
      if (e.key === 'e') { e.preventDefault(); usePotion(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const endRun = useCallback(async () => {
    const s = stateRef.current; if (!s) return;
    const p = s.player;
    const score = p.gold * 10 + p.kills * 25 + (p.floor - 1) * 150 + (p.maxHp - 6) * 50 + (p.atk - 1) * 60;
    setFinal({ score, gold: p.gold, kills: p.kills, floor: p.floor, atk: p.atk, maxHp: p.maxHp });
    setPhase('over');
    if (wallet.address) {
      setTxState({ state: 'pending' });
      const result = await submitRunOnChain({
        game: 'mongeon', walletState: wallet,
        score, actual: score, maxTile: p.floor, moves: p.kills, difficulty: 1,
      });
      if (result.ok) {
        setTxState({ state: 'ok', txHash: result.txHash });
        submitToLeaderboard('mongeon', {
          wallet: wallet.address,
          name: localStorage.getItem('moncade.name') || 'YOU',
          monanimal: monanimalId,
          score, actual: score,
          meta: `floor ${p.floor} · ${p.kills} kills`,
          seconds: 0, timestamp: Date.now(),
          txHash: result.txHash, onChain: !result.mock,
        });
        window.dispatchEvent(new CustomEvent('moncade-lb-update'));
      } else setTxState({ state: 'err', error: result.error });
    }
  }, [wallet, monanimalId]);

  // render loop
  useEffect(() => {
    if (phase !== 'playing') return;
    const cnv = cnvRef.current; const ctx = cnv.getContext('2d');
    let raf = 0; let stopped = false;
    const resize = () => {
      const r = stageRef.current.getBoundingClientRect();
      cnv.width = r.width * devicePixelRatio;
      cnv.height = r.height * devicePixelRatio;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(stageRef.current);

    const tick = () => {
      if (stopped) return;
      const s = stateRef.current; if (!s) return;
      const dpr = devicePixelRatio;
      const W = cnv.width, H = cnv.height;
      s.tick++;
      ctx.fillStyle = '#05030f';
      ctx.fillRect(0, 0, W, H);

      const scale = Math.min(W / (COLS * TILE), H / (ROWS * TILE));
      let ox = (W - COLS * TILE * scale) / 2;
      let oy = (H - ROWS * TILE * scale) / 2;
      if (s.shake > 0) { ox += rand(-1, 1) * 2 * dpr; oy += rand(-1, 1) * 2 * dpr; s.shake--; }

      // tiles
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!s.seen[r][c]) continue;
        const x = ox + c * TILE * scale, y = oy + r * TILE * scale, sz = TILE * scale;
        const v = s.grid[r][c];
        // base
        if (v === T_WALL) {
          ctx.fillStyle = '#1a0b3e';
          ctx.fillRect(x, y, sz, sz);
          ctx.fillStyle = 'rgba(159,124,255,0.2)';
          ctx.fillRect(x, y, sz, 3 * dpr);
        } else {
          ctx.fillStyle = ((r + c) % 2) ? '#0f0823' : '#140b30';
          ctx.fillRect(x, y, sz, sz);
          if (v === T_LOOT) {
            ctx.fillStyle = 'rgba(255,230,109,0.35)';
            ctx.beginPath(); ctx.arc(x + sz / 2, y + sz / 2, sz * 0.38, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#FFE66D';
            ctx.beginPath(); ctx.arc(x + sz / 2, y + sz / 2, sz * 0.18, 0, Math.PI * 2); ctx.fill();
          } else if (v === T_CHEST) {
            ctx.fillStyle = '#C27C46';
            ctx.fillRect(x + sz * 0.18, y + sz * 0.3, sz * 0.64, sz * 0.45);
            ctx.fillStyle = '#FFE66D';
            ctx.fillRect(x + sz * 0.42, y + sz * 0.42, sz * 0.16, sz * 0.16);
          } else if (v === T_TRAP) {
            ctx.strokeStyle = '#FF4FA1';
            ctx.lineWidth = 2 * dpr;
            ctx.beginPath();
            ctx.moveTo(x + sz * 0.3, y + sz * 0.7); ctx.lineTo(x + sz * 0.5, y + sz * 0.3); ctx.lineTo(x + sz * 0.7, y + sz * 0.7);
            ctx.stroke();
          } else if (v === T_EXIT) {
            ctx.fillStyle = '#8CF7F0';
            ctx.fillRect(x + sz * 0.2, y + sz * 0.2, sz * 0.6, sz * 0.6);
            ctx.fillStyle = '#0a0418';
            ctx.font = `900 ${sz * 0.5}px Inter Tight`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('↓', x + sz / 2, y + sz / 2);
          }
        }
      }
      // enemies — only if visible
      s.enemies.forEach((e) => {
        if (!s.seen[e.r][e.c]) return;
        const m = MONANIMAL_BY_ID[e.monanimal];
        const img = loadSprite(m.sprite);
        e.bob += 0.06;
        const bobY = Math.sin(e.bob) * 1.5 * dpr;
        const x = ox + e.c * TILE * scale, y = oy + e.r * TILE * scale + bobY, sz = TILE * scale;
        // elite halo
        if (e.tier === 'elite') {
          const g = ctx.createRadialGradient(x + sz / 2, y + sz / 2, 0, x + sz / 2, y + sz / 2, sz);
          g.addColorStop(0, '#FFE66Daa'); g.addColorStop(1, '#FFE66D00');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x + sz / 2, y + sz / 2, sz, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = m.color + (e.flash > 0 ? 'ff' : '88');
        ctx.beginPath(); ctx.arc(x + sz / 2, y + sz / 2, sz * 0.45, 0, Math.PI * 2); ctx.fill();
        if (img.complete) ctx.drawImage(img, x + sz * 0.05, y + sz * 0.05, sz * 0.9, sz * 0.9);
        // hp bar
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x + sz * 0.1, y - 4 * dpr, sz * 0.8, 3 * dpr);
        ctx.fillStyle = e.tier === 'elite' ? '#FFE66D' : '#FF4FA1';
        ctx.fillRect(x + sz * 0.1, y - 4 * dpr, sz * 0.8 * (e.hp / e.maxHp), 3 * dpr);
        if (e.flash > 0) e.flash--;
      });
      // player
      const p = s.player;
      const m = MONANIMAL_BY_ID[p.monanimal];
      const img = loadSprite(m.sprite);
      const px = ox + p.c * TILE * scale, py = oy + p.r * TILE * scale, sz = TILE * scale;
      const aura = ctx.createRadialGradient(px + sz / 2, py + sz / 2, 0, px + sz / 2, py + sz / 2, sz * 0.9);
      aura.addColorStop(0, '#8CF7F0aa'); aura.addColorStop(1, '#8CF7F000');
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(px + sz / 2, py + sz / 2, sz * 0.9, 0, Math.PI * 2); ctx.fill();
      if (img.complete) ctx.drawImage(img, px, py, sz, sz);
      if (p.flash > 0) { ctx.fillStyle = `rgba(255,79,161,${p.flash / 30})`; ctx.fillRect(0, 0, W, H); p.flash--; }

      // fog of war on unseen tiles
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (s.seen[r][c]) continue;
        const x = ox + c * TILE * scale, y = oy + r * TILE * scale;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, TILE * scale, TILE * scale);
      }
      // dim distance
      const cx = px + sz / 2, cy = py + sz / 2;
      const dim = ctx.createRadialGradient(cx, cy, 4 * TILE * scale, cx, cy, 9 * TILE * scale);
      dim.addColorStop(0, 'rgba(0,0,0,0)');
      dim.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, W, H);

      // damage numbers
      s.damageNumbers.forEach((d) => {
        const x = ox + d.c * TILE * scale + sz / 2;
        const y = oy + d.r * TILE * scale - d.t * 1.5 * dpr;
        const a = 1 - d.t / 30;
        ctx.fillStyle = d.color + Math.floor(a * 255).toString(16).padStart(2, '0');
        ctx.font = `900 ${14 * dpr}px Inter Tight`;
        ctx.textAlign = 'center';
        ctx.fillText(d.text, x, y);
        d.t++;
      });
      s.damageNumbers = s.damageNumbers.filter((d) => d.t < 30);

      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect(); };
  }, [phase]);

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <div className="left">
          <button className="game-back" onClick={onExit}>← Exit</button>
          <div className="gname">Mongeon <em>crawler</em></div>
        </div>
        <div className="right">
          <HpBar hp={hud.hp} max={hud.maxHp} />
          <div className="hud-card"><div className="l">Gold</div><div className="v" style={{ color: '#FFE66D' }}>{hud.gold}</div></div>
          <div className="hud-card purple"><div className="l">Floor</div><div className="v">{hud.floor}</div></div>
          <div className="hud-card"><div className="l">Kills</div><div className="v">{hud.kills}</div></div>
          <button className="mg-potion" onClick={usePotion} disabled={hud.potions <= 0 || hud.hp >= hud.maxHp}>
            <span className="mg-pot-icon">🧪</span>
            <span>×{hud.potions}</span>
          </button>
        </div>
      </div>
      <div className="game-stage" ref={stageRef}>
        <canvas ref={cnvRef} />
        {phase === 'playing' && (
          <>
            <div className="game-help-bar">
              <kbd>WASD</kbd> step · walk into enemy to attack · <kbd>E</kbd> potion · find <strong style={{ color: 'var(--cyan-bright)' }}>↓</strong> exit
            </div>
            <div className="mg-log">
              {log.map((l) => (
                <div key={l.id} className={`mg-log-line ${l.tone}`}>{l.text}</div>
              ))}
            </div>
          </>
        )}
        {phase === 'start' && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Mongeon · solo · roguelike</div>
              <h2>Crawl the<br />Mongeon</h2>
              <p className="sub">Procedural rooms. Bump enemies to attack. Loot, potions, traps, elites. The deeper you go, the meaner it gets.</p>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-mute)', marginBottom: 10 }}>Pick your champion</div>
              <div className="character-pick">
                {MONANIMALS.map((m) => (
                  <button key={m.id} className={monanimalId === m.id ? 'selected' : ''} onClick={() => setMonanimalId(m.id)}>
                    <img src={m.sprite} alt={m.name} />
                    <div className="char-tag">{m.name}</div>
                  </button>
                ))}
              </div>
              <div className="actions">
                <button onClick={onExit}>Back</button>
                <button className="primary" onClick={startGame}>Descend</button>
              </div>
            </div>
          </div>
        )}
        {phase === 'over' && final && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">You died</div>
              <h2>Floor {final.floor}</h2>
              <p className="sub">{final.kills} kills · {final.gold} gold · ATK {final.atk} · {final.maxHp} max HP</p>
              <div className="stats">
                <div className="stat"><div className="l">Score</div><div className="v">{fmt(final.score)}</div></div>
                <div className="stat"><div className="l">Floor</div><div className="v">{final.floor}</div></div>
                <div className="stat"><div className="l">Kills</div><div className="v">{final.kills}</div></div>
              </div>
              {txState && (
                <div className={`tx-receipt ${txState.state === 'pending' ? 'pending' : ''}`}>
                  <div className="tx-line"><span>Status</span><strong>{txState.state === 'pending' ? 'Submitting…' : txState.state === 'ok' ? 'Confirmed' : 'Failed'}</strong></div>
                  {txState.txHash && <div className="tx-line"><span>Tx</span><strong>{txState.txHash.slice(0, 10)}…{txState.txHash.slice(-6)}</strong></div>}
                </div>
              )}
              <div className="actions" style={{ marginTop: 14 }}>
                <button onClick={onExit}>Lobby</button>
                <button className="primary" onClick={startGame}>Again</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HpBar({ hp, max }) {
  return (
    <div className="hud-card pink" style={{ minWidth: 110 }}>
      <div className="l">HP</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div className="v" style={{ fontSize: 18 }}>{hp}/{max}</div>
      </div>
      <div className="mg-hpbar">
        <div className="mg-hpbar-fill" style={{ width: `${Math.max(0, hp / max * 100)}%` }}></div>
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
function pushDmgNumber(s, c, r, text, color) {
  s.damageNumbers.push({ c, r: r - 0.2, text: String(text), color, t: 0 });
}

function updateVisibility(s) {
  const p = s.player;
  // simple line-of-sight: reveal all tiles within radius, and add seen
  const R = 6;
  for (let r = Math.max(0, p.r - R); r <= Math.min(ROWS - 1, p.r + R); r++) {
    for (let c = Math.max(0, p.c - R); c <= Math.min(COLS - 1, p.c + R); c++) {
      const dist = Math.max(Math.abs(r - p.r), Math.abs(c - p.c));
      if (dist <= R) s.seen[r][c] = true;
    }
  }
}

Object.assign(window, { MongeonGame });
