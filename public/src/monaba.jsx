/* global React, MONANIMALS, MONANIMAL_BY_ID, loadSprite, rand, clamp, fmt,
          randomBotName, submitRunOnChain, submitToLeaderboard */
// Monaba — top-down arena brawler. WASD move, click to dash-strike.

const { useState, useEffect, useRef, useCallback } = React;

const ARENA = 800;

function MonabaGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('start');
  const [monanimalId, setMonanimalId] = useState('molandak');
  const [hud, setHud] = useState({ hp: 100, kills: 0, score: 0 });
  const [final, setFinal] = useState(null);
  const [txState, setTxState] = useState(null);
  const stageRef = useRef(null);
  const cnvRef = useRef(null);
  const stateRef = useRef(null);
  const keysRef = useRef({});

  const startGame = useCallback(() => {
    const player = {
      x: ARENA / 2, y: ARENA / 2, vx: 0, vy: 0,
      r: 24, hp: 100, maxHp: 100, attackCool: 0, dashTimer: 0,
      monanimal: monanimalId, name: 'YOU', isPlayer: true, kills: 0,
    };
    const enemies = Array.from({ length: 3 }, (_, i) => {
      const m = MONANIMALS[(i + 2) % MONANIMALS.length];
      const angle = (i / 3) * Math.PI * 2;
      return {
        x: ARENA / 2 + Math.cos(angle) * 280,
        y: ARENA / 2 + Math.sin(angle) * 280,
        vx: 0, vy: 0, r: 22, hp: 60, maxHp: 60,
        monanimal: m.id, name: randomBotName(), isPlayer: false,
        attackCool: 0, target: player,
      };
    });
    stateRef.current = { player, enemies, particles: [], shake: 0, time: 0 };
    setHud({ hp: 100, kills: 0, score: 0 });
    setFinal(null); setTxState(null);
    setPhase('playing');
  }, [monanimalId]);

  // input
  useEffect(() => {
    if (phase !== 'playing') return;
    const onDown = (e) => { keysRef.current[e.key.toLowerCase()] = true; };
    const onUp   = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [phase]);

  const doAttack = useCallback(() => {
    const s = stateRef.current; if (!s) return;
    const p = s.player; if (p.attackCool > 0) return;
    p.attackCool = 30;
    p.dashTimer = 8;
    // hit any enemy within range
    s.enemies.forEach((e) => {
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < p.r + e.r + 30) {
        e.hp -= 25;
        e.vx += (dx / d) * 8; e.vy += (dy / d) * 8;
        // particles
        for (let i = 0; i < 8; i++) {
          s.particles.push({
            x: e.x, y: e.y, vx: rand(-3, 3), vy: rand(-3, 3),
            life: 20, color: '#FF4FA1',
          });
        }
        s.shake = 6;
        if (e.hp <= 0) {
          p.kills += 1;
          // respawn
          const ang = Math.random() * Math.PI * 2;
          const m = MONANIMALS[Math.floor(Math.random() * MONANIMALS.length)];
          e.x = p.x + Math.cos(ang) * 350;
          e.y = p.y + Math.sin(ang) * 350;
          e.x = clamp(e.x, 40, ARENA - 40);
          e.y = clamp(e.y, 40, ARENA - 40);
          e.hp = 60 + p.kills * 5;
          e.maxHp = e.hp;
          e.monanimal = m.id;
          e.name = randomBotName();
        }
      }
    });
  }, []);

  // render + sim
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

    const onClick = () => doAttack();
    cnv.addEventListener('click', onClick);

    const tick = () => {
      if (stopped) return;
      const s = stateRef.current; if (!s) return;
      const W = cnv.width, H = cnv.height, dpr = devicePixelRatio;
      const scale = Math.min(W, H) / ARENA;
      const ox = (W - ARENA * scale) / 2 + (s.shake > 0 ? rand(-1, 1) * 3 * dpr : 0);
      const oy = (H - ARENA * scale) / 2 + (s.shake > 0 ? rand(-1, 1) * 3 * dpr : 0);

      // bg
      ctx.fillStyle = '#0a0418';
      ctx.fillRect(0, 0, W, H);
      // arena
      ctx.fillStyle = '#13091F';
      ctx.fillRect(ox, oy, ARENA * scale, ARENA * scale);
      // grid
      ctx.strokeStyle = 'rgba(159,124,255,0.1)';
      ctx.lineWidth = 1 * dpr;
      for (let g = 0; g <= ARENA; g += 40) {
        ctx.beginPath(); ctx.moveTo(ox + g * scale, oy); ctx.lineTo(ox + g * scale, oy + ARENA * scale); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + g * scale); ctx.lineTo(ox + ARENA * scale, oy + g * scale); ctx.stroke();
      }
      // ring
      ctx.strokeStyle = 'rgba(140,247,240,0.4)';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(ox + ARENA / 2 * scale, oy + ARENA / 2 * scale, 280 * scale, 0, Math.PI * 2);
      ctx.stroke();

      // input → player vel
      const p = s.player;
      const k = keysRef.current;
      let mvx = 0, mvy = 0;
      if (k['w'] || k['arrowup']) mvy -= 1;
      if (k['s'] || k['arrowdown']) mvy += 1;
      if (k['a'] || k['arrowleft']) mvx -= 1;
      if (k['d'] || k['arrowright']) mvx += 1;
      if (k[' ']) doAttack();
      const speed = (p.dashTimer > 0 ? 8 : 3.8);
      const len = Math.hypot(mvx, mvy) || 1;
      p.vx = (mvx / len) * speed;
      p.vy = (mvy / len) * speed;
      p.x += p.vx; p.y += p.vy;
      p.x = clamp(p.x, p.r, ARENA - p.r);
      p.y = clamp(p.y, p.r, ARENA - p.r);
      if (p.dashTimer > 0) p.dashTimer--;
      if (p.attackCool > 0) p.attackCool--;

      // enemy AI
      s.enemies.forEach((e) => {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > 60) {
          const sp = 2.0;
          e.vx = (dx / d) * sp; e.vy = (dy / d) * sp;
        } else {
          // attack
          if (e.attackCool <= 0) {
            p.hp -= 6;
            e.attackCool = 60;
            s.shake = 8;
            for (let i = 0; i < 6; i++) {
              s.particles.push({
                x: p.x, y: p.y, vx: rand(-3, 3), vy: rand(-3, 3),
                life: 20, color: '#FFE66D',
              });
            }
          }
          e.vx *= 0.85; e.vy *= 0.85;
        }
        e.x += e.vx; e.y += e.vy;
        e.x = clamp(e.x, e.r, ARENA - e.r);
        e.y = clamp(e.y, e.r, ARENA - e.r);
        if (e.attackCool > 0) e.attackCool--;
      });

      // particles
      s.particles.forEach((pa) => {
        pa.x += pa.vx; pa.y += pa.vy; pa.life--;
        pa.vx *= 0.92; pa.vy *= 0.92;
      });
      s.particles = s.particles.filter((p) => p.life > 0);

      // draw enemies
      [...s.enemies, p].sort((a, b) => a.y - b.y).forEach((ent) => {
        const m = MONANIMAL_BY_ID[ent.monanimal];
        const img = loadSprite(m.sprite);
        const ex = ox + ent.x * scale, ey = oy + ent.y * scale;
        const r = ent.r * scale;
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(ex, ey + r * 0.95, r * 0.8, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        // aura
        const aura = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 1.6);
        aura.addColorStop(0, (ent.isPlayer ? '#8CF7F0' : m.color) + 'aa');
        aura.addColorStop(1, '#0a041800');
        ctx.fillStyle = aura;
        ctx.beginPath(); ctx.arc(ex, ey, r * 1.6, 0, Math.PI * 2); ctx.fill();
        if (img.complete) {
          const sz = r * 2.4;
          ctx.drawImage(img, ex - sz / 2, ey - sz / 2, sz, sz);
        }
        // hp bar
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(ex - r, ey - r * 1.5, r * 2, 4 * dpr);
        ctx.fillStyle = ent.isPlayer ? '#8CF7F0' : '#FF4FA1';
        ctx.fillRect(ex - r, ey - r * 1.5, (ent.hp / ent.maxHp) * r * 2, 4 * dpr);
        // name
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${10 * dpr}px JetBrains Mono`;
        ctx.textAlign = 'center';
        ctx.fillText(ent.name.slice(0, 12), ex, ey - r * 1.5 - 6 * dpr);
      });

      // particles draw
      s.particles.forEach((pa) => {
        const a = pa.life / 20;
        ctx.fillStyle = pa.color + Math.floor(a * 255).toString(16).padStart(2, '0');
        ctx.beginPath(); ctx.arc(ox + pa.x * scale, oy + pa.y * scale, 3 * dpr * a, 0, Math.PI * 2); ctx.fill();
      });

      if (s.shake > 0) s.shake--;

      setHud({ hp: Math.max(0, Math.floor(p.hp)), kills: p.kills, score: p.kills * 100 });

      if (p.hp <= 0) { endRun(); return; }

      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      stopped = true; cancelAnimationFrame(raf); ro.disconnect();
      cnv.removeEventListener('click', onClick);
    };
  }, [phase, doAttack]);

  const endRun = useCallback(async () => {
    const s = stateRef.current; if (!s) return;
    const score = s.player.kills * 100;
    setFinal({ score, kills: s.player.kills });
    setPhase('over');
    if (wallet.address) {
      setTxState({ state: 'pending' });
      const result = await submitRunOnChain({
        game: 'monaba', walletState: wallet,
        score, actual: score, maxTile: s.player.kills, moves: 0, difficulty: 1,
      });
      if (result.ok) {
        setTxState({ state: 'ok', txHash: result.txHash });
        submitToLeaderboard('monaba', {
          wallet: wallet.address,
          name: localStorage.getItem('moncade.name') || 'YOU',
          monanimal: monanimalId,
          score, actual: score,
          meta: `${s.player.kills} KOs`,
          seconds: 0, timestamp: Date.now(),
          txHash: result.txHash, onChain: !result.mock,
        });
        window.dispatchEvent(new CustomEvent('moncade-lb-update'));
      } else setTxState({ state: 'err', error: result.error });
    }
  }, [wallet, monanimalId]);

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <div className="left">
          <button className="game-back" onClick={onExit}>← Exit</button>
          <div className="gname">Monaba <em>arena</em></div>
        </div>
        <div className="right">
          <div className="hud-card pink"><div className="l">HP</div><div className="v">{hud.hp}</div></div>
          <div className="hud-card"><div className="l">KOs</div><div className="v">{hud.kills}</div></div>
          <div className="hud-card purple"><div className="l">Score</div><div className="v">{fmt(hud.score)}</div></div>
        </div>
      </div>
      <div className="game-stage" ref={stageRef}>
        <canvas ref={cnvRef} style={{ cursor: 'crosshair' }} />
        {phase === 'playing' && (
          <div className="game-help-bar">
            <kbd>WASD</kbd> move · <kbd>click</kbd> or <kbd>space</kbd> dash-strike · KO enemies for score
          </div>
        )}
        {phase === 'start' && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Monaba · 1v3 · arena</div>
              <h2>Brawl in the<br />Pit</h2>
              <p className="sub">Three bots in a closed ring. Dash-strike to deal damage, dodge their counters, rack up KOs.</p>
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
                <button className="primary" onClick={startGame}>Enter Arena</button>
              </div>
            </div>
          </div>
        )}
        {phase === 'over' && final && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">KO'd</div>
              <h2>{final.kills} KO{final.kills !== 1 ? 's' : ''}</h2>
              <p className="sub">The pit took you down. Run it back.</p>
              <div className="stats">
                <div className="stat"><div className="l">Score</div><div className="v">{fmt(final.score)}</div></div>
                <div className="stat"><div className="l">KOs</div><div className="v">{final.kills}</div></div>
                <div className="stat"><div className="l">Game</div><div className="v">Monaba</div></div>
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

Object.assign(window, { MonabaGame });
