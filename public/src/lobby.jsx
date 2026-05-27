/* global React, MONANIMALS, ONCHAIN_TIERS, SnakePreview, BlobPreview, MergePreview,
          MongeonPreview, MonclashPreview, MonabaPreview, MoncardsPreview, MonpartyPreview,
          useWallet, useTwitter, ChatPanel, TwitterChip, ShowcaseGrid,
          getLeaderboard, shortAddr, fmt, MONAD_CHAIN, MONCADE_CONTRACT */
// Moncade Lobby — arcade floor of cabinets + chat + leaderboard + showcase.

const { useState, useEffect, useMemo } = React;

// ============================================================
// CABINET CONFIG
// ============================================================
const CABINETS = [
  {
    id: 'snake',
    name: 'Monslither',
    sub: '',
    blurb: 'Coil around enemies, eat the orbs, become the longest worm on Monad.',
    tags: [
      { label: 'Multiplayer', tone: 'cyan' },
      { label: 'Slither',     tone: 'purple' },
      { label: 'PvP',         tone: 'pink' },
    ],
    Preview: 'SnakePreview',
    featured: true,
    cta: 'Enter Lobby',
  },
  {
    id: 'blob',
    name: 'Monbubble',
    sub: '',
    blurb: 'Eat smaller Monanimals, dodge bigger ones, split to chase the chompers.',
    tags: [
      { label: 'Multiplayer', tone: 'cyan' },
      { label: 'Agar',        tone: 'purple' },
      { label: 'Mass',        tone: 'pink' },
    ],
    Preview: 'BlobPreview',
    cta: 'Enter Lobby',
  },
  {
    id: 'monerge',
    name: 'Monerge',
    sub: 'puzzle',
    blurb: 'Merge Monanimal tiles, push for the 2048 tile, post your run on Monad.',
    tags: [
      { label: 'Solo',   tone: 'cyan' },
      { label: 'Puzzle', tone: 'purple' },
      { label: 'Reveal', tone: 'pink' },
    ],
    Preview: 'MergePreview',
    cta: 'Enter Lobby',
  },
  {
    id: 'mongeon',
    name: 'Mongeon',
    sub: 'crawler',
    blurb: 'Procedural dungeon crawl. Bump enemies, loot floors, descend deeper.',
    tags: [
      { label: 'Solo',     tone: 'cyan' },
      { label: 'Roguelike',tone: 'purple' },
      { label: 'Bump',     tone: 'pink' },
    ],
    Preview: 'MongeonPreview',
    cta: 'Enter Lobby',
  },
  {
    id: 'monclash',
    name: 'Monclash',
    sub: 'siege',
    blurb: 'Defend your iglu. Click incoming raiders to zap them. Survive waves.',
    tags: [
      { label: 'Click',  tone: 'cyan' },
      { label: 'Waves',  tone: 'purple' },
      { label: 'Solo',   tone: 'pink' },
    ],
    Preview: 'MonclashPreview',
    cta: 'Enter Lobby',
  },
  {
    id: 'monaba',
    name: 'Monaba',
    sub: 'arena',
    blurb: '1v3 closed-ring brawler. Dash-strike, dodge, rack up KOs.',
    tags: [
      { label: 'Arena',  tone: 'cyan' },
      { label: 'PvE',    tone: 'purple' },
      { label: 'WASD',   tone: 'pink' },
    ],
    Preview: 'MonabaPreview',
    cta: 'Enter Lobby',
  },
  {
    id: 'moncards',
    name: 'Moncards',
    sub: 'memory',
    blurb: 'Memory match. Flip pairs, fewer moves and lower time = bigger score.',
    tags: [
      { label: 'Solo',   tone: 'cyan' },
      { label: 'Memory', tone: 'purple' },
      { label: 'Speed',  tone: 'pink' },
    ],
    Preview: 'MoncardsPreview',
    cta: 'Enter Lobby',
  },
  {
    id: 'monparty',
    name: 'Monparty',
    sub: 'whack',
    blurb: '30 seconds. Whack pop-up Monanimals. Avoid the bombs. Build combo.',
    tags: [
      { label: 'Party', tone: 'cyan' },
      { label: 'Reflex',tone: 'purple' },
      { label: 'Combo', tone: 'pink' },
    ],
    Preview: 'MonpartyPreview',
    cta: 'Enter Lobby',
  },
];

// Live counts per game.
const PLAYER_COUNTS = {
  snake:    { live: 248, peak: 12480 },
  blob:     { live: 184, peak:  9120 },
  monerge:  { live:  62, peak:  3411 },
  mongeon:  { live:  37, peak:  1842 },
  monclash: { live:  29, peak:  1604 },
  monaba:   { live:  41, peak:  2210 },
  moncards: { live:  18, peak:   920 },
  monparty: { live:  74, peak:  4180 },
};

// ============================================================
// CHROME
// ============================================================
function ChromeTop({ wallet, twitter, onConnect, onDisconnect, onConnectTwitter, onDisconnectTwitter, onToggleChat, onShowLeaderboard }) {
  return (
    <header className="chrome-top">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <div className="brand-name">MONCADE</div>
          <div className="brand-tag">Arcade · Built on Monad</div>
        </div>
      </div>
      <div className="chrome-right">
        <button className="chip" onClick={onToggleChat}>
          <span className="dot live"></span>
          Chat
        </button>
        <button className="chip" onClick={onShowLeaderboard}>
          <span className="dot live"></span>
          Leaderboard
        </button>
        <span className="chip" title={`Contract ${MONCADE_CONTRACT}`}>
          <span className="dot"></span>
          {MONAD_CHAIN.symbol} · Chain {MONAD_CHAIN.id}
        </span>
        <TwitterChip twitter={twitter} onConnect={onConnectTwitter} onDisconnect={onDisconnectTwitter} />
        {wallet.address ? (
          <button className="wallet-btn connected" onClick={onDisconnect} title="Disconnect">
            <span className="dot live"></span>
            <span className="addr">{shortAddr(wallet.address)}</span>
            {wallet.balance && <span className="balance">· {wallet.balance} {MONAD_CHAIN.symbol}</span>}
          </button>
        ) : (
          <button className="wallet-btn" onClick={onConnect}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}

// ============================================================
// CABINET CARD
// ============================================================
function Cabinet({ cab, onPlay }) {
  const PreviewComp = window[cab.Preview];
  const counts = PLAYER_COUNTS[cab.id] || { live: 0, peak: 0 };
  const tier = ONCHAIN_TIERS[cab.id];
  return (
    <article className={`cabinet ${cab.featured ? 'featured' : ''}`}>
      <div className="crt">
        <div className="crt-status">
          <span>● Live · {counts.live} online</span>
          {tier && (
            <span className={`crt-tier tier-${tier.tier}`} title={tier.desc}>
              <span className="crt-tier-dot"></span>
              {tier.short} · {tier.label}
            </span>
          )}
        </div>
        {PreviewComp && <PreviewComp />}
        <div className="crt-glow"></div>
      </div>
      <div className="cabinet-meta">
        <div>
          <h3>{cab.name}<em>{cab.sub}</em></h3>
          <div className="ticker">Peak <strong>{fmt(counts.peak)}</strong> · Now <strong>{counts.live}</strong></div>
        </div>
        <div className="players">
          <strong>{counts.live}</strong>
          <span>online</span>
        </div>
      </div>
      <p className="cabinet-blurb">{cab.blurb}</p>
      {tier && (
        <div className="cab-tier-row" title={tier.desc}>
          <span className={`cab-tier-pill tier-${tier.tier}`}>
            <span className="cab-tier-dot"></span>
            {tier.short}
          </span>
          <span className="cab-tier-label">{tier.label}</span>
          <span className="cab-tier-desc">{tier.desc}</span>
        </div>
      )}
      <div className="cabinet-tags">
        {cab.tags.map((t) => <span key={t.label} className={`cabinet-tag ${t.tone}`}>{t.label}</span>)}
      </div>
      <button className="cabinet-play" onClick={() => onPlay(cab)}>
        <span>▶ {cab.cta || 'Play'}</span>
        <span className="arrow">→</span>
      </button>
    </article>
  );
}

// ============================================================
// LEADERBOARD CARDS (lobby snapshot)
// ============================================================
function LeaderboardSnapshot({ wallet }) {
  const [lb, setLb] = useState(() => getLeaderboard());
  useEffect(() => {
    const onUpdate = () => setLb(getLeaderboard());
    window.addEventListener('moncade-lb-update', onUpdate);
    return () => window.removeEventListener('moncade-lb-update', onUpdate);
  }, []);

  return (
    <div className="leaderboard">
      <LeaderboardCard title="Monslither" game="snake" rows={lb.snake} wallet={wallet} />
      <LeaderboardCard title="Monbubble"  game="blob"  rows={lb.blob}  wallet={wallet} />
      <LeaderboardCard title="Monerge"    game="monerge" rows={lb.monerge}  wallet={wallet} />
      <LeaderboardCard title="Monparty"   game="monparty" rows={lb.monparty} wallet={wallet} />
    </div>
  );
}

function LeaderboardCard({ title, game, rows, wallet }) {
  const top = (rows || []).slice(0, 5);
  return (
    <div className="lb-card">
      <div className="lb-head">
        <div className="lb-title">{title} <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--cyan-bright)', fontSize: 16 }}>leaderboard</span></div>
        <div className="lb-chain">Monad · 0xb842…8ddd</div>
      </div>
      {top.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-mute)', fontFamily: 'var(--mono)', fontSize: 11 }}>
          No revealed runs yet. Be first.
        </div>
      )}
      {top.map((r, i) => {
        const monanimal = MONANIMALS.find((m) => m.id === r.monanimal) || MONANIMALS[0];
        const rankCls = ['gold', 'silver', 'bronze'][i] || '';
        const isYou = wallet.address && r.wallet && r.wallet.toLowerCase() === wallet.address.toLowerCase();
        return (
          <div key={(r.txHash || '') + i} className="lb-row">
            <span className={`rank ${rankCls}`}>{i + 1 < 10 ? '0' + (i + 1) : i + 1}</span>
            <span className="who">
              <img src={monanimal.sprite} alt="" />
              <div>
                <div className="who-name">{isYou ? 'YOU · ' : ''}{r.name || shortAddr(r.wallet)}</div>
                <div className="who-addr">{r.meta}</div>
              </div>
            </span>
            <span className="score">{fmt(r.score)}</span>
            <span className="tx">
              {r.txHash ? <a href={`${MONAD_CHAIN.explorer}/tx/${r.txHash}`} target="_blank" rel="noreferrer">{r.txHash.slice(0, 8)}…</a> : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// LOBBY ROOT
// ============================================================
function Lobby({ onPlay, onConnect, onDisconnect, wallet,
                 twitter, onConnectTwitter, onDisconnectTwitter,
                 chatOpen, setChatOpen, chatRoom, setChatRoom }) {
  const scrollToLb = () => {
    document.getElementById('lobby-lb')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const scrollToShowcase = () => {
    document.getElementById('lobby-showcase')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <>
      <ChromeTop
        wallet={wallet}
        twitter={twitter}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onConnectTwitter={onConnectTwitter}
        onDisconnectTwitter={onDisconnectTwitter}
        onToggleChat={() => setChatOpen((o) => !o)}
        onShowLeaderboard={scrollToLb}
      />
      <main className="lobby">
        <div className="lobby-inner">
          <div className="lobby-title">
            <span className="kicker">Monad Arcade · est. 2026</span>
            <h1>MONCADE</h1>
            <p>
              An arcade of fully on-chain games starring the official Monanimals.
              Connect your wallet, pick a cabinet, chat with the floor, post your run on Monad.
            </p>
            <div className="lobby-jumps">
              <button onClick={scrollToLb}>↓ Leaderboards</button>
              <button onClick={() => setChatOpen(true)}>↓ Chat</button>
              <button onClick={scrollToShowcase}>↓ Showcase</button>
            </div>
          </div>

          <div className="section-head">
            <h2>Now Playing<em>games</em></h2>
            <div className="meta">{CABINETS.length} live</div>
          </div>
          <div className="cabinets">
            {CABINETS.map((c) => <Cabinet key={c.id} cab={c} onPlay={onPlay} />)}
          </div>

          <div id="lobby-lb" className="section-head">
            <h2>Hall of Nads<em>on-chain</em></h2>
            <div className="meta">Live · MoncadeRuns @ 0xb842…8ddd</div>
          </div>
          <LeaderboardSnapshot wallet={wallet} />

          <div id="lobby-showcase" className="section-head">
            <h2>Showcase<em>buildanything.so</em></h2>
            <div className="meta">
              <a href="https://buildanything.so/showcase" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan-bright)' }}>
                48 live · buildanything.so/showcase ↗
              </a>
            </div>
          </div>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)', letterSpacing: '0.05em', marginBottom: 18 }}>
            Real shipped projects on Monad. Pulled from buildanything.so/showcase.
          </p>
          <ShowcaseGrid />

          <footer style={{ marginTop: 48, paddingTop: 24, borderTop: '1px dashed var(--line)', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            Moncade · A Gerry Stephen joint · Powered by Monad · gerrystephen.com/moncade
          </footer>
          <div className="spacer"></div>
        </div>
      </main>
      {chatOpen && (
        <ChatPanel
          twitter={twitter}
          wallet={wallet}
          onConnectTwitter={onConnectTwitter}
          onDisconnectTwitter={onDisconnectTwitter}
          currentRoom={chatRoom}
          setCurrentRoom={setChatRoom}
          onClose={() => setChatOpen(false)}
        />
      )}
    </>
  );
}

Object.assign(window, { Lobby, CABINETS });
