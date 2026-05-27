/* global React */
// Shared data & UI primitives for Moncade.

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ============================================================
// MONANIMAL ROSTER
// ============================================================
const MONANIMALS = [
  {
    id: 'molandak',
    name: 'Molandak',
    tag: 'OG',
    sprite: 'assets/monanimals/molandak-official-sprite.png',
    color: '#9F7CFF',   // primary skin color (purple)
    accent: '#FFB07A',  // beak/mouth (orange)
    blurb: 'The OG purple hedgehog. Speed +5%, ferocity +5%.',
    snakeStat: { speed: 1.05, turn: 1.0,  size: 0.95 },
    blobStat:  { speed: 1.05, mass: 0.95, vision: 1.0 },
  },
  {
    id: 'chog',
    name: 'Chog',
    tag: 'KAWAII',
    sprite: 'assets/monanimals/chog-official-sprite.png',
    color: '#6E47D6',
    accent: '#FF7BB1',
    blurb: 'Big-eyed cat-bat hybrid. Tight turns, polite manners.',
    snakeStat: { speed: 0.98, turn: 1.15, size: 1.0 },
    blobStat:  { speed: 1.08, mass: 0.92, vision: 1.05 },
  },
  {
    id: 'mouch',
    name: 'Mouch',
    tag: 'GLITCH',
    sprite: 'assets/monanimals/mouch-sprite-tight.png',
    color: '#7C4FE8',
    accent: '#8CF7F0',
    blurb: 'The bug. Erratic, irritating, hard to catch.',
    snakeStat: { speed: 1.12, turn: 1.05, size: 0.85 },
    blobStat:  { speed: 1.15, mass: 0.85, vision: 0.95 },
  },
  {
    id: 'salmonad',
    name: 'Salmonad',
    tag: 'SHRED',
    sprite: 'assets/monanimals/salmonad-sprite-tight.png',
    color: '#8155DC',
    accent: '#C27C46',
    blurb: 'Upstream salmon. Slow but absurd mass.',
    snakeStat: { speed: 0.88, turn: 0.92, size: 1.2 },
    blobStat:  { speed: 0.88, mass: 1.18, vision: 1.0 },
  },
  {
    id: 'mokadel',
    name: 'Mokadel',
    tag: 'LORE',
    sprite: 'assets/monanimals/mokadel-sprite-tight.png',
    color: '#7B49B7',
    accent: '#5A3088',
    blurb: 'Deep-lore. Camouflages on the gravel.',
    snakeStat: { speed: 0.95, turn: 1.0,  size: 1.1 },
    blobStat:  { speed: 0.95, mass: 1.1,  vision: 1.1 },
  },
  {
    id: 'emonad',
    name: 'Emonad',
    tag: '$EMO',
    sprite: 'assets/monanimals/emonad-sprite.png',
    color: '#2A1F3D',
    accent: '#9F7CFF',
    blurb: 'Final iglu form. All stats average. All feelings huge.',
    snakeStat: { speed: 1.0,  turn: 1.0,  size: 1.0 },
    blobStat:  { speed: 1.0,  mass: 1.0,  vision: 1.0 },
  },
  {
    id: 'hypernad',
    name: 'Hypernad',
    tag: 'HYPER',
    sprite: 'assets/monanimals/hypernad-clean.svg',
    color: '#8CF7F0',
    accent: '#FF4FA1',
    blurb: 'High-voltage Monad creature. Fast, twitchy, built for escapes.',
    snakeStat: { speed: 1.16, turn: 1.08, size: 0.82 },
    blobStat:  { speed: 1.18, mass: 0.84, vision: 1.02 },
  },
  {
    id: 'mondana',
    name: 'Mondana',
    tag: 'BLOOM',
    sprite: 'assets/monanimals/mondana-clean.svg',
    color: '#FF7BB1',
    accent: '#FFE66D',
    blurb: 'Floral menace. Graceful turns, surprisingly sharp.',
    snakeStat: { speed: 1.0, turn: 1.18, size: 0.92 },
    blobStat:  { speed: 1.04, mass: 0.95, vision: 1.14 },
  },
  {
    id: 'mosferatu',
    name: 'Mosferatu',
    tag: 'NIGHT',
    sprite: 'assets/monanimals/mosferatu-clean.svg',
    color: '#5B3CC4',
    accent: '#8CF7F0',
    blurb: 'Nocturnal drainer. Slower, heavier, hard to push around.',
    snakeStat: { speed: 0.92, turn: 0.98, size: 1.16 },
    blobStat:  { speed: 0.92, mass: 1.16, vision: 1.06 },
  },
  {
    id: 'moyaki',
    name: 'Moyaki',
    tag: 'SPARK',
    sprite: 'assets/monanimals/moyaki-clean.svg',
    color: '#FFE66D',
    accent: '#FF4FA1',
    blurb: 'Tiny spark, huge attitude. Quick starts and clean jukes.',
    snakeStat: { speed: 1.1, turn: 1.12, size: 0.88 },
    blobStat:  { speed: 1.12, mass: 0.88, vision: 1.0 },
  },
  {
    id: 'nadbot',
    name: 'Nadbot',
    tag: 'BOT',
    sprite: 'assets/monanimals/nadbot-clean.svg',
    color: '#7AC9E8',
    accent: '#9F7CFF',
    blurb: 'Synthetic Monad unit. Balanced, precise, annoyingly consistent.',
    snakeStat: { speed: 1.02, turn: 1.04, size: 1.0 },
    blobStat:  { speed: 1.02, mass: 1.0, vision: 1.08 },
  },
  {
    id: 'shramp',
    name: 'Shramp',
    tag: 'SNAP',
    sprite: 'assets/monanimals/shramp-clean.svg',
    color: '#C27C46',
    accent: '#8CF7F0',
    blurb: 'Crusty little snapper. Dense body, strong late-game scaling.',
    snakeStat: { speed: 0.96, turn: 1.02, size: 1.08 },
    blobStat:  { speed: 0.96, mass: 1.12, vision: 0.98 },
  },
];

const MONANIMAL_BY_ID = Object.fromEntries(MONANIMALS.map((m) => [m.id, m]));

// ============================================================
// ON-CHAIN TIER — per-game commitment level
//   T2: Optimistic — client play, on-chain anchor + fraud-proof window
//   T3: Fully on-chain — every move is a tx, contract is the game state
// ============================================================
const ONCHAIN_TIERS = {
  // turn-based → fully on-chain
  monerge:  { tier: 3, label: 'Fully On-Chain',  short: 'T3', color: '#8CF7F0', desc: 'Every move is a Monad tx. Contract is the game state.' },
  moncards: { tier: 3, label: 'Fully On-Chain',  short: 'T3', color: '#8CF7F0', desc: 'Each flip is a tx. Contract reveals the deck.' },
  mongeon:  { tier: 3, label: 'Fully On-Chain',  short: 'T3', color: '#8CF7F0', desc: 'Movement, combat, loot — all contract-resolved.' },
  // real-time → optimistic w/ fraud-proof
  snake:    { tier: 2, label: 'Verified On-Chain', short: 'T2', color: '#9F7CFF', desc: 'Replay seed + input log committed. Disputable for 200 blocks.' },
  blob:     { tier: 2, label: 'Verified On-Chain', short: 'T2', color: '#9F7CFF', desc: 'Replay seed + input log committed. Disputable for 200 blocks.' },
  monaba:   { tier: 2, label: 'Verified On-Chain', short: 'T2', color: '#9F7CFF', desc: 'Replay seed + input log committed. Disputable for 200 blocks.' },
  monclash: { tier: 2, label: 'Verified On-Chain', short: 'T2', color: '#9F7CFF', desc: 'Replay seed + input log committed. Disputable for 200 blocks.' },
  monparty: { tier: 2, label: 'Verified On-Chain', short: 'T2', color: '#9F7CFF', desc: 'Replay seed + input log committed. Disputable for 200 blocks.' },
};

// ============================================================
// BOT NAMES — mock player roster for slither/blob lobbies
// ============================================================
const BOT_NAMES = [
  'gerry.eth', 'nadgod', 'pixelmonad', 'salmonking', 'iglu.cz', 'monad.qt',
  '0xchog', 'snek.lol', 'hashstar', 'monfren', 'parallel', 'tipsy.mon',
  'opal.4', 'breakfast', 'wenmainnet', 'monalisa', 'gradient', 'mononoke',
  'chainsaw', 'qubit', 'lurkernad', 'mochi.nad', 'spectra', 'glitch'
];

function randomBotName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}
function randomMonanimal() {
  return MONANIMALS[Math.floor(Math.random() * MONANIMALS.length)];
}

// ============================================================
// COLOR PALETTE (shared with CSS — keep in sync)
// ============================================================
const PALETTE = {
  purple: '#9F7CFF',
  cyan:   '#7AC9E8',
  cyanBright: '#8CF7F0',
  teal:   '#2DBFB0',
  pink:   '#FF4FA1',
  amber:  '#FFE66D',
  bgDeep: '#0a0418',
  bgMid:  '#1a0b3e',
  ink:    '#EEF6FB',
  inkMute: 'rgba(238,246,251,0.5)',
};

// Skins used by snake (head/body trail colors) and blob bot painting.
const SKIN_COLORS = [
  { body: '#9F7CFF', glow: '#d8c7ff' }, // purple
  { body: '#FF4FA1', glow: '#ffb1d2' }, // pink
  { body: '#8CF7F0', glow: '#d4fbf8' }, // cyan
  { body: '#FFE66D', glow: '#fff6c0' }, // amber
  { body: '#2DBFB0', glow: '#a5e9e1' }, // teal
  { body: '#C27C46', glow: '#ecc69a' }, // orange
];

// ============================================================
// SPRITE LOADING — preload all character images, cache by id
// ============================================================
const SPRITE_CACHE = {};
function loadSprite(url) {
  if (SPRITE_CACHE[url]) return SPRITE_CACHE[url];
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  SPRITE_CACHE[url] = img;
  return img;
}
MONANIMALS.forEach((m) => loadSprite(m.sprite));

// ============================================================
// TINY UTILS
// ============================================================
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist2(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function shortAddr(a) {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'm';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return Math.floor(n).toString();
}
function nowSec() { return Math.floor(Date.now() / 1000); }

// Used by both games' minimap and HUD.
function rankList(entities) {
  return entities.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
}

// ============================================================
// TOAST QUEUE — tiny global notification system
// ============================================================
const toastListeners = new Set();
let toastSeq = 0;
function pushToast(text, tone = '') {
  const t = { id: ++toastSeq, text, tone, ts: Date.now() };
  toastListeners.forEach((cb) => cb(t));
}
function useToasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const onPush = (t) => {
      setList((cur) => [...cur, t]);
      setTimeout(() => setList((cur) => cur.filter((x) => x.id !== t.id)), 2400);
    };
    toastListeners.add(onPush);
    return () => toastListeners.delete(onPush);
  }, []);
  return list;
}
function ToastStack() {
  const list = useToasts();
  return (
    <div className="toast-stack">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>
      ))}
    </div>
  );
}

// ============================================================
// EXPORT
// ============================================================
Object.assign(window, {
  MONANIMALS, MONANIMAL_BY_ID, BOT_NAMES, PALETTE, SKIN_COLORS,
  ONCHAIN_TIERS,
  loadSprite, SPRITE_CACHE,
  randomBotName, randomMonanimal,
  clamp, lerp, dist2, rand, shortAddr, fmt, nowSec, rankList,
  pushToast, useToasts, ToastStack,
});
