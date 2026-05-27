/* global React, MONANIMALS, loadSprite, fmt, submitRunOnChain, submitToLeaderboard, pushToast */
// Monerge — the exact 2048 game with Monanimal tiles. Smooth slide + merge.
//
// MECHANICS (canonical 2048):
//   • 4×4 grid. Start with two spawn tiles (90% "2", 10% "4").
//   • Arrow / WASD / swipe moves all tiles to that wall, merging same-value
//     neighbors in the direction of travel. Each tile may merge at most once
//     per move (the standard 2048 rule).
//   • A move that changes nothing is rejected (no spawn).
//   • After each valid move, spawn one new tile.
//   • Game over when no moves possible.
//
// RENDERING:
//   Each tile carries a stable id so React reconciles position changes as
//   CSS transform transitions. Merged tiles get a brief scale-pop. New
//   tiles pop in. This is what makes 2048 *feel* like 2048.

const { useState, useEffect, useRef, useCallback } = React;

const SIZE = 4;
const TIERS = [
  { v: 2,    label: '2',    img: 'molandak',  color: '#9F7CFF', textOn: 'dark'  },
  { v: 4,    label: '4',    img: 'chog',      color: '#FF7BB1', textOn: 'dark'  },
  { v: 8,    label: '8',    img: 'mouch',     color: '#8CF7F0', textOn: 'dark'  },
  { v: 16,   label: '16',   img: 'salmonad',  color: '#C27C46', textOn: 'light' },
  { v: 32,   label: '32',   img: 'mokadel',   color: '#7B49B7', textOn: 'light' },
  { v: 64,   label: '64',   img: 'emonad',    color: '#FFE66D', textOn: 'dark'  },
  { v: 128,  label: '128',  img: null,        color: '#FF4FA1', textOn: 'light' },
  { v: 256,  label: '256',  img: null,        color: '#2DBFB0', textOn: 'dark'  },
  { v: 512,  label: '512',  img: null,        color: '#7AC9E8', textOn: 'dark'  },
  { v: 1024, label: '1024', img: null,        color: '#FFE66D', textOn: 'dark'  },
  { v: 2048, label: '2048', img: null,        color: '#FF4FA1', textOn: 'light' },
  { v: 4096, label: '4k',   img: null,        color: '#9F7CFF', textOn: 'light' },
  { v: 8192, label: '8k',   img: null,        color: '#8CF7F0', textOn: 'dark'  },
];

let TILE_ID = 1;
function newTile(row, col, tier) {
  return { id: TILE_ID++, row, col, tier, isNew: true, mergedThisMove: false };
}

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
}

function gridFromTiles(tiles) {
  const g = emptyGrid();
  tiles.forEach((t) => { if (!t.absorbedBy) g[t.row][t.col] = t; });
  return g;
}

function spawnTile(tiles) {
  const g = gridFromTiles(tiles);
  const empty = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!g[r][c]) empty.push([r, c]);
  if (!empty.length) return tiles;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const tier = Math.random() < 0.9 ? 0 : 1;
  return [...tiles, newTile(r, c, tier)];
}

// Returns { tiles, moved, gained }
// dir: 0=left, 1=up, 2=right, 3=down
function move(tiles, dir) {
  // Strategy: process tiles row-by-row (or col-by-col) in the direction of
  // travel. For each row/col, walk the tiles in travel order and place them
  // at the "next free" slot, merging when the previous-placed tile has the
  // same tier and hasn't already merged this move.
  let moved = false;
  let gained = 0;
  const all = tiles.filter((t) => !t.absorbedBy).map((t) => ({ ...t, isNew: false, mergedThisMove: false, justSpawned: false }));
  const grid = emptyGrid();
  all.forEach((t) => { grid[t.row][t.col] = t; });

  const horizontal = dir === 0 || dir === 2;
  const positive   = dir === 2 || dir === 3; // moving toward higher index?

  for (let line = 0; line < SIZE; line++) {
    // collect tiles in this row/col in travel order
    const seq = [];
    for (let i = 0; i < SIZE; i++) {
      const r = horizontal ? line : i;
      const c = horizontal ? i    : line;
      if (grid[r][c]) seq.push(grid[r][c]);
    }
    if (positive) seq.reverse();

    let cursor = 0;  // next free slot index (from the wall)
    let lastPlaced = null;

    for (const tile of seq) {
      const wallPos = positive ? (SIZE - 1 - cursor) : cursor;
      if (lastPlaced && lastPlaced.tier === tile.tier && !lastPlaced.mergedThisMove && lastPlaced.tier < TIERS.length - 1) {
        // merge into lastPlaced
        lastPlaced.tier += 1;
        lastPlaced.mergedThisMove = true;
        gained += TIERS[lastPlaced.tier].v;
        // mark this tile as absorbed — it'll animate INTO lastPlaced's cell, then despawn
        tile.absorbedBy = lastPlaced.id;
        // move tile to lastPlaced's coordinates (so it slides there and pops out)
        const nr = horizontal ? line : lastPlaced.row;
        const nc = horizontal ? lastPlaced.col : line;
        if (tile.row !== nr || tile.col !== nc) moved = true;
        tile.row = nr; tile.col = nc;
      } else {
        const nr = horizontal ? line : wallPos;
        const nc = horizontal ? wallPos : line;
        if (tile.row !== nr || tile.col !== nc) moved = true;
        tile.row = nr; tile.col = nc;
        lastPlaced = tile;
        cursor += 1;
      }
    }
  }

  return { tiles: all, moved, gained };
}

function isGameOver(tiles) {
  const live = tiles.filter((t) => !t.absorbedBy);
  if (live.length < SIZE * SIZE) return false;
  const g = gridFromTiles(live);
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (!g[r][c]) return false;
    if (c + 1 < SIZE && g[r][c + 1] && g[r][c].tier === g[r][c + 1].tier) return false;
    if (r + 1 < SIZE && g[r + 1][c] && g[r][c].tier === g[r + 1][c].tier) return false;
  }
  return true;
}

function maxTierOf(tiles) {
  let m = 0;
  tiles.forEach((t) => { if (!t.absorbedBy && t.tier > m) m = t.tier; });
  return m;
}

// ============================================================
// TILE COMPONENT
// ============================================================
function Tile({ tile, cellSize, gap }) {
  const t = TIERS[tile.tier];
  const sprite = t.img ? MONANIMALS.find((m) => m.id === t.img) : null;
  const x = tile.col * (cellSize + gap);
  const y = tile.row * (cellSize + gap);
  const cls = [
    'me-tile',
    tile.isNew ? 'me-tile-new' : '',
    tile.mergedThisMove ? 'me-tile-merged' : '',
    tile.absorbedBy ? 'me-tile-absorbed' : '',
    `me-tier-${tile.tier}`,
    t.textOn === 'light' ? 'me-text-light' : 'me-text-dark',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      style={{
        width: cellSize,
        height: cellSize,
        transform: `translate(${x}px, ${y}px)`,
        background: t.color,
      }}
    >
      <div className="me-tile-inner">
        {sprite ? (
          <img src={sprite.sprite} alt={sprite.name} className="me-tile-img" />
        ) : (
          <span className="me-tile-num" style={{ fontSize: tile.tier > 8 ? cellSize * 0.32 : cellSize * 0.4 }}>{t.label}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN
// ============================================================
function MergeGame({ wallet, onExit }) {
  const [phase, setPhase] = useState('start');
  const [tiles, setTiles] = useState([]);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('moncade.monerge.best') || 0));
  const [scorePop, setScorePop] = useState(null);
  const [txState, setTxState] = useState(null);
  const phaseRef = useRef(phase);
  const animRef = useRef(false);
  phaseRef.current = phase;

  const reset = useCallback(() => {
    let t = [];
    t = spawnTile(t);
    t = spawnTile(t);
    setTiles(t);
    setScore(0);
    setMoves(0);
    setTxState(null);
    setPhase('playing');
  }, []);

  const doMove = useCallback((dir) => {
    if (phaseRef.current !== 'playing') return;
    if (animRef.current) return;

    setTiles((cur) => {
      const res = move(cur, dir);
      if (!res.moved) return cur;
      animRef.current = true;
      setMoves((m) => m + 1);
      if (res.gained > 0) {
        setScore((s) => s + res.gained);
        const popId = Math.random();
        setScorePop({ id: popId, val: res.gained });
        setTimeout(() => setScorePop((p) => p && p.id === popId ? null : p), 600);
      }

      // After slide animation completes, clean up absorbed tiles & spawn new
      setTimeout(() => {
        setTiles((prev) => {
          const cleaned = prev.filter((t) => !t.absorbedBy);
          const next = spawnTile(cleaned);
          if (isGameOver(next)) setTimeout(() => endRun(next), 220);
          return next;
        });
        animRef.current = false;
      }, 120);

      return res.tiles;
    });
  }, []);

  const endRun = useCallback(async (finalTiles) => {
    setPhase('over');
    const top = maxTierOf(finalTiles);
    setScore((cur) => {
      const finalScore = cur;
      if (finalScore > best) {
        setBest(finalScore);
        localStorage.setItem('moncade.monerge.best', String(finalScore));
      }
      submitOnChain(finalScore, top);
      return cur;
    });
  }, [best]);

  const submitOnChain = useCallback(async (finalScore, top) => {
    if (!wallet.address) return;
    setTxState({ state: 'pending' });
    const result = await submitRunOnChain({
      game: 'monerge', walletState: wallet,
      score: finalScore, actual: finalScore,
      maxTile: TIERS[top].v, moves, difficulty: 1,
    });
    if (result.ok) {
      setTxState({ state: 'ok', txHash: result.txHash });
      submitToLeaderboard('monerge', {
        wallet: wallet.address,
        name: localStorage.getItem('moncade.name') || 'YOU',
        monanimal: TIERS[top].img || 'emonad',
        score: finalScore, actual: finalScore,
        meta: `tile ${TIERS[top].v}`,
        seconds: 0, timestamp: Date.now(),
        txHash: result.txHash, onChain: !result.mock,
      });
      window.dispatchEvent(new CustomEvent('moncade-lb-update'));
    } else {
      setTxState({ state: 'err', error: result.error });
    }
  }, [wallet, moves]);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (phaseRef.current !== 'playing') return;
      const map = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3,
                    a: 0, A: 0, w: 1, W: 1, d: 2, D: 2, s: 3, S: 3 };
      const dir = map[e.key];
      if (dir !== undefined) { e.preventDefault(); doMove(dir); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doMove]);

  // touch swipe
  const boardRef = useRef(null);
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    let sx = 0, sy = 0;
    const onTs = (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; };
    const onTe = (e) => {
      const t = e.changedTouches[0]; const dx = t.clientX - sx; const dy = t.clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 2 : 0);
      else doMove(dy > 0 ? 3 : 1);
    };
    el.addEventListener('touchstart', onTs, { passive: true });
    el.addEventListener('touchend', onTe);
    return () => { el.removeEventListener('touchstart', onTs); el.removeEventListener('touchend', onTe); };
  }, [doMove]);

  // board geometry — recompute on mount/resize
  const [boardSize, setBoardSize] = useState(420);
  useEffect(() => {
    const fit = () => {
      const w = Math.min(420, Math.max(280, Math.min(window.innerWidth - 48, window.innerHeight - 280)));
      setBoardSize(w);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const PAD = 10;
  const cellSize = (boardSize - PAD * (SIZE + 1)) / SIZE;
  const gap = PAD;

  const top = maxTierOf(tiles);

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <div className="left">
          <button className="game-back" onClick={onExit}>← Exit</button>
          <div className="gname">Monerge</div>
        </div>
        <div className="right">
          <div className="me-scorecard" style={{ position: 'relative' }}>
            <div className="me-sc-l">Score</div>
            <div className="me-sc-v">{fmt(score)}</div>
            {scorePop && <div key={scorePop.id} className="me-score-pop">+{scorePop.val}</div>}
          </div>
          <div className="me-scorecard purple">
            <div className="me-sc-l">Best</div>
            <div className="me-sc-v">{fmt(best)}</div>
          </div>
          <div className="me-scorecard pink">
            <div className="me-sc-l">Top</div>
            <div className="me-sc-v">{TIERS[top]?.label || '—'}</div>
          </div>
          <button className="me-undo" onClick={reset} title="New game">↻</button>
        </div>
      </div>
      <div className="game-stage me-stage">
        <div className="me-wrap">
          <div
            className="me-board"
            ref={boardRef}
            style={{ width: boardSize, height: boardSize, padding: PAD, gap }}
          >
            <div className="me-grid-bg" style={{ inset: PAD, gap }}>
              {Array.from({ length: SIZE * SIZE }).map((_, i) => (
                <div key={i} className="me-cell"></div>
              ))}
            </div>
            <div className="me-tiles" style={{ inset: PAD }}>
              {tiles.map((t) => (
                <Tile key={t.id} tile={t} cellSize={cellSize} gap={gap} />
              ))}
            </div>
          </div>
          <div className="me-controls">
            <div className="me-help">
              <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or <kbd>WASD</kbd> · swipe on mobile
            </div>
          </div>
        </div>

        {phase === 'start' && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Monerge · 2048 · Monanimal edition</div>
              <h2>Join the<br />Monanimals</h2>
              <p className="sub">Slide tiles. When two Monanimals of the same tier touch, they merge into the next. Push for <strong style={{ color: 'var(--cyan-bright)' }}>2048</strong>. Post your run on Monad.</p>
              <div className="stats">
                <div className="stat"><div className="l">Tiers</div><div className="v">13</div></div>
                <div className="stat"><div className="l">Grid</div><div className="v">4×4</div></div>
                <div className="stat"><div className="l">Best</div><div className="v">{fmt(best)}</div></div>
              </div>
              <div className="actions">
                <button onClick={onExit}>Back</button>
                <button className="primary" onClick={reset}>Start Run</button>
              </div>
            </div>
          </div>
        )}

        {phase === 'over' && (
          <div className="game-overlay">
            <div className="game-card">
              <div className="kicker">Game over</div>
              <h2>{score >= best ? 'New Best' : 'Run Done'}</h2>
              <p className="sub">Top tile: <strong style={{ color: 'var(--cyan-bright)' }}>{TIERS[top].label}</strong> · {moves} moves</p>
              <div className="stats">
                <div className="stat"><div className="l">Score</div><div className="v">{fmt(score)}</div></div>
                <div className="stat"><div className="l">Tile</div><div className="v">{TIERS[top].label}</div></div>
                <div className="stat"><div className="l">Moves</div><div className="v">{moves}</div></div>
              </div>
              {txState && (
                <div className={`tx-receipt ${txState.state === 'pending' ? 'pending' : ''}`}>
                  <div className="tx-line"><span>Status</span><strong>{txState.state === 'pending' ? 'Submitting…' : txState.state === 'ok' ? 'Confirmed' : 'Failed'}</strong></div>
                  {txState.txHash && <div className="tx-line"><span>Tx</span><strong>{txState.txHash.slice(0, 10)}…{txState.txHash.slice(-6)}</strong></div>}
                </div>
              )}
              <div className="actions" style={{ marginTop: 14 }}>
                <button onClick={onExit}>Lobby</button>
                <button className="primary" onClick={reset}>Play again</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { MergeGame, MERGE_TIERS: TIERS });
