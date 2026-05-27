/* global React, MONANIMALS, fmt, rand, submitRunOnChain, submitToLeaderboard */
// Monparty — whack-a-Monanimal. 30 seconds. Tap the pop-ups.

const { useState, useEffect, useRef, useCallback } = React;

const HOLES = 9; // 3x3
const ROUND_SECS = 30;

function MonpartyGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('start');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [time, setTime] = useState(ROUND_SECS);
  const [active, setActive] = useState(() => Array(HOLES).fill(null));
  const [bursts, setBursts] = useState([]);
  const [final, setFinal] = useState(null);
  const [txState, setTxState] = useState(null);
  const stateRef = useRef({ active: Array(HOLES).fill(null), score: 0, combo: 0 });

  const startGame = useCallback(() => {
    stateRef.current = { active: Array(HOLES).fill(null), score: 0, combo: 0 };
    setActive(Array(HOLES).fill(null));
    setScore(0); setCombo(0); setTime(ROUND_SECS);
    setFinal(null); setTxState(null);
    setPhase('playing');
  }, []);

  // spawn loop
  useEffect(() => {
    if (phase !== 'playing') return;
    let spawnInt = setInterval(() => {
      const s = stateRef.current;
      // pick a random empty hole
      const empty = s.active.map((v, i) => v === null ? i : -1).filter((i) => i >= 0);
      if (!empty.length) return;
      const idx = empty[Math.floor(Math.random() * empty.length)];
      const mon = MONANIMALS[Math.floor(Math.random() * MONANIMALS.length)];
      const isBomb = Math.random() < 0.18; // 18% chance trap
      const lifespan = 600 + Math.random() * 700;
      const ent = {
        monanimal: mon, bomb: isBomb,
        spawnAt: Date.now(), lifespan,
      };
      s.active[idx] = ent;
      setActive([...s.active]);
      // auto-despawn
      setTimeout(() => {
        if (stateRef.current.active[idx] === ent) {
          stateRef.current.active[idx] = null;
          setActive([...stateRef.current.active]);
          if (!ent.bomb) {
            // missed a friendly → combo break
            stateRef.current.combo = 0;
            setCombo(0);
          }
        }
      }, lifespan);
    }, 320);

    let timerInt = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          clearInterval(spawnInt); clearInterval(timerInt);
          endRun();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => { clearInterval(spawnInt); clearInterval(timerInt); };
  }, [phase]);

  const handleHit = (idx) => {
    const s = stateRef.current;
    const ent = s.active[idx];
    if (!ent) return;
    s.active[idx] = null;
    setActive([...s.active]);
    if (ent.bomb) {
      s.score = Math.max(0, s.score - 30);
      s.combo = 0;
      setScore(s.score); setCombo(0);
      setBursts((b) => [...b, { idx, kind: 'bomb', id: Math.random() }]);
    } else {
      s.combo += 1;
      const points = 10 + s.combo * 2;
      s.score += points;
      setScore(s.score); setCombo(s.combo);
      setBursts((b) => [...b, { idx, kind: 'hit', id: Math.random(), points }]);
    }
    setTimeout(() => setBursts((b) => b.slice(1)), 600);
  };

  const endRun = useCallback(async () => {
    const s = stateRef.current;
    setFinal({ score: s.score });
    setPhase('over');
    if (wallet.address) {
      setTxState({ state: 'pending' });
      const result = await submitRunOnChain({
        game: 'monparty', walletState: wallet,
        score: s.score, actual: s.score, maxTile: s.combo, moves: 0, difficulty: 1,
      });
      if (result.ok) {
        setTxState({ state: 'ok', txHash: result.txHash });
        submitToLeaderboard('monparty', {
          wallet: wallet.address,
          name: localStorage.getItem('moncade.name') || 'YOU',
          monanimal: 'chog',
          score: s.score, actual: s.score,
          meta: `${ROUND_SECS}s`,
          seconds: ROUND_SECS, timestamp: Date.now(),
          txHash: result.txHash, onChain: !result.mock,
        });
        window.dispatchEvent(new CustomEvent('moncade-lb-update'));
      } else setTxState({ state: 'err', error: result.error });
    }
  }, [wallet]);

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <div className="left">
          <button className="game-back" onClick={onExit}>← Exit</button>
          <div className="gname">Monparty <em>whack</em></div>
        </div>
        <div className="right">
          <div className="hud-card"><div className="l">Time</div><div className="v">{time}s</div></div>
          <div className="hud-card pink"><div className="l">Combo</div><div className="v">×{combo}</div></div>
          <div className="hud-card purple"><div className="l">Score</div><div className="v">{fmt(score)}</div></div>
        </div>
      </div>
      <div className="game-stage mp-stage">
        <div className="mp-board">
          {active.map((ent, i) => (
            <button key={i} className="mp-hole" onClick={() => handleHit(i)}>
              <div className="mp-hole-inner">
                {ent && (
                  <div className={`mp-popup ${ent.bomb ? 'bomb' : ''}`} style={{ borderColor: ent.bomb ? '#FF4FA1' : ent.monanimal.color }}>
                    <img src={ent.monanimal.sprite} alt={ent.monanimal.name} />
                    {ent.bomb && <div className="mp-bomb-x">×</div>}
                  </div>
                )}
                {bursts.filter((b) => b.idx === i).map((b) => (
                  <div key={b.id} className={`mp-burst ${b.kind}`}>
                    {b.kind === 'hit' ? `+${b.points}` : '−30'}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
        {phase === 'playing' && (
          <div className="game-help-bar">
            Tap pop-ups · avoid the <strong style={{ color: 'var(--pink-bright)' }}>×bombs×</strong> · build combo
          </div>
        )}
        {phase === 'start' && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Monparty · 30s · party</div>
              <h2>Whack the<br />Monanimals</h2>
              <p className="sub">Tap pop-ups to score. Don't tap the bomb-marked ones. Build combo, don't break it.</p>
              <div className="stats">
                <div className="stat"><div className="l">Time</div><div className="v">{ROUND_SECS}s</div></div>
                <div className="stat"><div className="l">Holes</div><div className="v">{HOLES}</div></div>
                <div className="stat"><div className="l">Bombs</div><div className="v">18%</div></div>
              </div>
              <div className="actions">
                <button onClick={onExit}>Back</button>
                <button className="primary" onClick={startGame}>GO</button>
              </div>
            </div>
          </div>
        )}
        {phase === 'over' && final && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Time's up</div>
              <h2>{fmt(final.score)}</h2>
              <p className="sub">{ROUND_SECS} seconds done.</p>
              <div className="stats">
                <div className="stat"><div className="l">Score</div><div className="v">{fmt(final.score)}</div></div>
                <div className="stat"><div className="l">Time</div><div className="v">{ROUND_SECS}s</div></div>
                <div className="stat"><div className="l">Game</div><div className="v">Monparty</div></div>
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

Object.assign(window, { MonpartyGame });
