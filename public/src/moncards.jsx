/* global React, MONANIMALS, fmt, submitRunOnChain, submitToLeaderboard */
// Moncards — memory match. Flip Monanimal pairs as fast as you can.

const { useState, useEffect, useRef, useCallback } = React;

const PAIRS = 8; // 16 cards = 4×4

function shuffled() {
  const pool = [];
  const pick = MONANIMALS.slice(0, PAIRS).flatMap((m) => [m, m]);
  while (pick.length) {
    const i = Math.floor(Math.random() * pick.length);
    pool.push({ monanimal: pick[i], flipped: false, matched: false, id: pool.length });
    pick.splice(i, 1);
  }
  return pool;
}

function MoncardsGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('start');
  const [cards, setCards] = useState(shuffled);
  const [flipped, setFlipped] = useState([]); // index list
  const [moves, setMoves] = useState(0);
  const [matched, setMatched] = useState(0);
  const [time, setTime] = useState(0);
  const timerRef = useRef(null);
  const [final, setFinal] = useState(null);
  const [txState, setTxState] = useState(null);

  const startGame = useCallback(() => {
    setCards(shuffled());
    setFlipped([]); setMoves(0); setMatched(0); setTime(0);
    setFinal(null); setTxState(null);
    setPhase('playing');
  }, []);

  // timer
  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const handleFlip = (idx) => {
    if (phase !== 'playing') return;
    if (cards[idx].matched || cards[idx].flipped) return;
    if (flipped.length >= 2) return;
    const next = cards.map((c, i) => i === idx ? { ...c, flipped: true } : c);
    setCards(next);
    const nextFlipped = [...flipped, idx];
    setFlipped(nextFlipped);
    if (nextFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = nextFlipped;
      if (next[a].monanimal.id === next[b].monanimal.id) {
        setTimeout(() => {
          setCards((cur) => cur.map((c, i) => (i === a || i === b) ? { ...c, matched: true } : c));
          setMatched((m) => {
            const nm = m + 1;
            if (nm === PAIRS) setTimeout(() => endRun(nm), 600);
            return nm;
          });
          setFlipped([]);
        }, 500);
      } else {
        setTimeout(() => {
          setCards((cur) => cur.map((c, i) => (i === a || i === b) ? { ...c, flipped: false } : c));
          setFlipped([]);
        }, 900);
      }
    }
  };

  const endRun = useCallback(async (matchedCount) => {
    // score: base 1000, bonus for low moves & low time
    const baseScore = 1000 + Math.max(0, 600 - moves * 30) + Math.max(0, 800 - time * 10);
    setFinal({ score: baseScore, time, moves });
    setPhase('over');
    if (wallet.address) {
      setTxState({ state: 'pending' });
      const result = await submitRunOnChain({
        game: 'moncards', walletState: wallet,
        score: baseScore, actual: baseScore, maxTile: PAIRS, moves, difficulty: 1,
      });
      if (result.ok) {
        setTxState({ state: 'ok', txHash: result.txHash });
        submitToLeaderboard('moncards', {
          wallet: wallet.address,
          name: localStorage.getItem('moncade.name') || 'YOU',
          monanimal: 'molandak',
          score: baseScore, actual: baseScore,
          meta: `${moves} moves · ${time}s`,
          seconds: time, timestamp: Date.now(),
          txHash: result.txHash, onChain: !result.mock,
        });
        window.dispatchEvent(new CustomEvent('moncade-lb-update'));
      } else setTxState({ state: 'err', error: result.error });
    }
  }, [moves, time, wallet]);

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <div className="left">
          <button className="game-back" onClick={onExit}>← Exit</button>
          <div className="gname">Moncards <em>memory</em></div>
        </div>
        <div className="right">
          <div className="hud-card"><div className="l">Time</div><div className="v">{time}s</div></div>
          <div className="hud-card purple"><div className="l">Moves</div><div className="v">{moves}</div></div>
          <div className="hud-card pink"><div className="l">Pairs</div><div className="v">{matched}/{PAIRS}</div></div>
        </div>
      </div>
      <div className="game-stage mc-stage">
        <div className="mc-board">
          {cards.map((c, i) => (
            <button
              key={c.id}
              className={`mc-card ${c.flipped ? 'flipped' : ''} ${c.matched ? 'matched' : ''}`}
              onClick={() => handleFlip(i)}
              disabled={c.matched}
            >
              <div className="mc-card-inner">
                <div className="mc-card-back">
                  <div className="mc-card-glyph">M</div>
                </div>
                <div className="mc-card-front" style={{ borderColor: c.monanimal.color }}>
                  <img src={c.monanimal.sprite} alt={c.monanimal.name} />
                  <div className="mc-card-name">{c.monanimal.name}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
        {phase === 'start' && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Moncards · memory · solo</div>
              <h2>Match the<br />Monanimals</h2>
              <p className="sub">8 pairs. Flip two at a time. Score rewards fewer moves and faster times.</p>
              <div className="stats">
                <div className="stat"><div className="l">Pairs</div><div className="v">{PAIRS}</div></div>
                <div className="stat"><div className="l">Grid</div><div className="v">4×4</div></div>
                <div className="stat"><div className="l">Time</div><div className="v">∞</div></div>
              </div>
              <div className="actions">
                <button onClick={onExit}>Back</button>
                <button className="primary" onClick={startGame}>Start</button>
              </div>
            </div>
          </div>
        )}
        {phase === 'over' && final && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Cleared</div>
              <h2>{final.time}s · {final.moves} moves</h2>
              <p className="sub">All pairs matched.</p>
              <div className="stats">
                <div className="stat"><div className="l">Score</div><div className="v">{fmt(final.score)}</div></div>
                <div className="stat"><div className="l">Time</div><div className="v">{final.time}s</div></div>
                <div className="stat"><div className="l">Moves</div><div className="v">{final.moves}</div></div>
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

Object.assign(window, { MoncardsGame });
