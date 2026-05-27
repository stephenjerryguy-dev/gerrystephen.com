/* global React, MONANIMALS, MONANIMAL_BY_ID, loadSprite, rand, clamp, fmt,
          submitRunOnChain, submitToLeaderboard */
// Monclash — defend your iglu. Click incoming raiders to zap them.

const { useState, useEffect, useRef, useCallback } = React;

function MonclashGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('start');
  const [monanimalId, setMonanimalId] = useState('molandak');
  const [hud, setHud] = useState({ hp: 100, wave: 1, score: 0 });
  const [final, setFinal] = useState(null);
  const [txState, setTxState] = useState(null);
  const stageRef = useRef(null);
  const cnvRef = useRef(null);
  const stateRef = useRef(null);

  const startGame = useCallback(() => {
    stateRef.current = {
      raiders: [],
      bolts: [],
      hp: 100, maxHp: 100, wave: 1, score: 0,
      spawnTimer: 0, waveTimer: 600,
      shake: 0,
    };
    setHud({ hp: 100, wave: 1, score: 0 });
    setFinal(null);
    setTxState(null);
    setPhase('playing');
  }, []);

  const onClick = useCallback((e) => {
    const s = stateRef.current; if (!s) return;
    const cnv = cnvRef.current;
    const rect = cnv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (cnv.width / rect.width);
    const my = (e.clientY - rect.top) * (cnv.height / rect.height);
    // hit closest raider within radius
    let best = null, bd = Infinity;
    s.raiders.forEach((r) => {
      const d = (r.x - mx) ** 2 + (r.y - my) ** 2;
      if (d < (40 * devicePixelRatio) ** 2 && d < bd) { best = r; bd = d; }
    });
    if (best) {
      best.hp -= 1;
      s.bolts.push({ tx: best.x, ty: best.y, life: 12 });
      if (best.hp <= 0) {
        s.score += 10 * s.wave;
        s.raiders = s.raiders.filter((r) => r !== best);
      }
    }
  }, []);

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
      const s = stateRef.current;
      const W = cnv.width, H = cnv.height, dpr = devicePixelRatio;

      // background
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a0418'); sky.addColorStop(1, '#2e1466');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      // ground
      ctx.fillStyle = '#13091F';
      ctx.fillRect(0, H * 0.78, W, H * 0.22);
      // iglu (player base) on left
      const igX = 80 * dpr, igY = H * 0.78;
      ctx.fillStyle = '#8CF7F0';
      ctx.beginPath(); ctx.arc(igX, igY, 70 * dpr, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0a0418'; ctx.lineWidth = 4 * dpr; ctx.stroke();
      ctx.fillStyle = '#0a0418';
      ctx.fillRect(igX - 18 * dpr, igY - 26 * dpr, 36 * dpr, 26 * dpr);

      // spawn
      s.spawnTimer--;
      if (s.spawnTimer <= 0) {
        const m = MONANIMALS[Math.floor(Math.random() * MONANIMALS.length)];
        s.raiders.push({
          x: W + 40 * dpr,
          y: H * 0.78 - rand(10, 30) * dpr,
          vx: -(0.6 + s.wave * 0.15) * dpr,
          hp: 1 + Math.floor(s.wave / 3),
          monanimal: m.id,
          bob: Math.random() * Math.PI * 2,
        });
        s.spawnTimer = Math.max(40, 100 - s.wave * 6);
      }
      s.waveTimer--;
      if (s.waveTimer <= 0) { s.wave++; s.waveTimer = 600; s.hp = Math.min(s.maxHp, s.hp + 10); }

      // raiders move
      s.raiders.forEach((r) => {
        r.x += r.vx;
        r.bob += 0.18;
        r.y = H * 0.78 - 18 * dpr + Math.sin(r.bob) * 4 * dpr;
        if (r.x < igX + 50 * dpr) {
          s.hp -= 8;
          s.shake = 12;
          r.hp = 0;
        }
      });
      s.raiders = s.raiders.filter((r) => r.hp > 0);

      // draw raiders
      s.raiders.forEach((r) => {
        const m = MONANIMAL_BY_ID[r.monanimal];
        const img = loadSprite(m.sprite);
        const sz = 56 * dpr;
        ctx.save();
        if (s.shake > 0) ctx.translate(rand(-1, 1) * dpr, rand(-1, 1) * dpr);
        ctx.fillStyle = m.color + 'aa';
        ctx.beginPath(); ctx.arc(r.x, r.y, sz * 0.5, 0, Math.PI * 2); ctx.fill();
        if (img.complete) ctx.drawImage(img, r.x - sz / 2, r.y - sz / 2, sz, sz);
        // hp pip
        if (r.hp > 1) {
          ctx.fillStyle = '#FF4FA1';
          ctx.fillRect(r.x - sz / 2, r.y - sz / 2 - 6 * dpr, (r.hp / 4) * sz, 3 * dpr);
        }
        ctx.restore();
      });

      // bolts
      s.bolts.forEach((b) => {
        const a = b.life / 12;
        ctx.strokeStyle = `rgba(140,247,240,${a})`;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath(); ctx.moveTo(igX, igY - 26 * dpr); ctx.lineTo(b.tx, b.ty); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(b.tx, b.ty, 6 * dpr * a, 0, Math.PI * 2); ctx.fill();
        b.life--;
      });
      s.bolts = s.bolts.filter((b) => b.life > 0);

      // scanlines
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

      if (s.shake > 0) s.shake--;

      setHud({ hp: Math.max(0, Math.floor(s.hp)), wave: s.wave, score: s.score });

      if (s.hp <= 0) {
        endRun();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    cnv.addEventListener('click', onClick);
    return () => {
      stopped = true; cancelAnimationFrame(raf); ro.disconnect();
      cnv.removeEventListener('click', onClick);
    };
  }, [phase, onClick]);

  const endRun = useCallback(async () => {
    const s = stateRef.current; if (!s) return;
    setFinal({ score: s.score, wave: s.wave });
    setPhase('over');
    if (wallet.address) {
      setTxState({ state: 'pending' });
      const result = await submitRunOnChain({
        game: 'monclash', walletState: wallet,
        score: s.score, actual: s.score, maxTile: s.wave, moves: 0, difficulty: 1,
      });
      if (result.ok) {
        setTxState({ state: 'ok', txHash: result.txHash });
        submitToLeaderboard('monclash', {
          wallet: wallet.address,
          name: localStorage.getItem('moncade.name') || 'YOU',
          monanimal: monanimalId,
          score: s.score, actual: s.score,
          meta: `wave ${s.wave}`,
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
          <div className="gname">Monclash <em>siege</em></div>
        </div>
        <div className="right">
          <div className="hud-card pink"><div className="l">Iglu</div><div className="v">{hud.hp}</div></div>
          <div className="hud-card purple"><div className="l">Wave</div><div className="v">{hud.wave}</div></div>
          <div className="hud-card"><div className="l">Score</div><div className="v">{fmt(hud.score)}</div></div>
        </div>
      </div>
      <div className="game-stage" ref={stageRef}>
        <canvas ref={cnvRef} style={{ cursor: 'crosshair' }} />
        {phase === 'playing' && (
          <div className="game-help-bar">
            <strong style={{ color: 'var(--cyan-bright)' }}>Click raiders</strong> to zap them · don't let them reach the iglu
          </div>
        )}
        {phase === 'start' && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Monclash · siege · click-to-zap</div>
              <h2>Defend the<br />Iglu</h2>
              <p className="sub">Raiders approach from the right. Click them to fire bolts. Each wave gets faster, tougher, denser.</p>
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
                <button className="primary" onClick={startGame}>Hold the line</button>
              </div>
            </div>
          </div>
        )}
        {phase === 'over' && final && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Iglu fell</div>
              <h2>Wave {final.wave}</h2>
              <p className="sub">You held off {final.wave - 1} waves before they broke through.</p>
              <div className="stats">
                <div className="stat"><div className="l">Score</div><div className="v">{fmt(final.score)}</div></div>
                <div className="stat"><div className="l">Wave</div><div className="v">{final.wave}</div></div>
                <div className="stat"><div className="l">Game</div><div className="v">Clash</div></div>
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

Object.assign(window, { MonclashGame });
