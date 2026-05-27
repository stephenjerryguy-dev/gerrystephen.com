/* global React, MONANIMALS, randomBotName, randomMonanimal, shortAddr, fmt, rand,
          MONAD_CHAIN, pushToast */
// Moncade social — Dynamic-powered unified auth (wallet + X) + wallet-signed chat.
//
// ARCHITECTURE
// ============
// Dynamic (dynamic.xyz) is the single entry point for connecting to Moncade.
// One modal, multiple methods:
//   • Continue with X         → Dynamic provisions an MPC wallet + binds the X handle
//   • Continue with Google    → MPC wallet, no social handle
//   • Continue with email     → MPC wallet, no social handle
//   • Continue with wallet    → External wallet (MetaMask / Rabby / WalletConnect)
//
// After auth, both `useDynamicWallet()` and `useDynamicTwitter()` return what
// the modal produced. They share state through the same module-level store,
// so a single "Continue with X" click populates both. The hooks have the same
// shape as the previous `useWallet` + `useTwitter` so consumers don't change.
//
// In production this file would import:
//   import { DynamicContextProvider, useDynamicContext } from '@dynamic-labs/sdk-react-core';
//   import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
//   import { TwitterSocialWalletConnectors } from '@dynamic-labs/social-twitter';
// and the body of `openDynamicAuth()` would call `setShowAuthFlow(true)`.

const { useState, useEffect, useRef, useCallback } = React;

// ============================================================
// DYNAMIC — unified auth store
// ============================================================
const DYNAMIC_ENV_ID = 'moncade-mainnet-1a4f9c2b';
const DYNAMIC_KEY    = 'moncade.dynamic.v2';

function loadDynamicCache() {
  try { return JSON.parse(localStorage.getItem(DYNAMIC_KEY) || 'null'); }
  catch (_) { return null; }
}
function saveDynamicCache(state) {
  try { localStorage.setItem(DYNAMIC_KEY, JSON.stringify(state || {})); } catch (_) {}
}

// Module-level reactive store — both hooks subscribe.
const dynamicState = {
  wallet:  { address: '', balance: '', chainOk: false, mock: false, source: '' },
  twitter: { handle: '', displayName: '', avatar: '', verified: false, followers: 0 },
};
(function hydrate() {
  const cached = loadDynamicCache();
  if (cached) {
    if (cached.wallet)  Object.assign(dynamicState.wallet,  cached.wallet);
    if (cached.twitter) Object.assign(dynamicState.twitter, cached.twitter);
  }
})();
const dynamicListeners = new Set();
function setDynamic(partial) {
  if (partial.wallet)  Object.assign(dynamicState.wallet,  partial.wallet);
  if (partial.twitter) Object.assign(dynamicState.twitter, partial.twitter);
  saveDynamicCache(dynamicState);
  dynamicListeners.forEach((cb) => cb());
}
function useDynamicSlice(slice) {
  const [, bump] = useState(0);
  useEffect(() => {
    const cb = () => bump((x) => x + 1);
    dynamicListeners.add(cb);
    return () => dynamicListeners.delete(cb);
  }, []);
  return dynamicState[slice];
}

// ============================================================
// HOOKS
// ============================================================
function useDynamicWallet() {
  const state = useDynamicSlice('wallet');

  const connect = useCallback(async () => {
    const result = await openDynamicAuth({ prefer: 'wallet' });
    if (!result) return null;
    if (result.wallet)  setDynamic({ wallet:  result.wallet });
    if (result.twitter) setDynamic({ twitter: result.twitter });
    pushToast?.('Connected via Dynamic', 'cyan');
    return result.wallet;
  }, []);

  const disconnect = useCallback(() => {
    setDynamic({ wallet: { address: '', balance: '', chainOk: false, mock: false, source: '' } });
    pushToast?.('Disconnected', '');
  }, []);

  return { ...state, connect, disconnect };
}

function useDynamicTwitter() {
  const state = useDynamicSlice('twitter');

  const connect = useCallback(async () => {
    const result = await openDynamicAuth({ prefer: 'twitter' });
    if (!result) return null;
    if (result.wallet)  setDynamic({ wallet:  result.wallet });
    if (result.twitter) setDynamic({ twitter: result.twitter });
    return result.twitter;
  }, []);

  const disconnect = useCallback(() => {
    setDynamic({ twitter: { handle: '', displayName: '', avatar: '', verified: false, followers: 0 } });
  }, []);

  return { ...state, connect, disconnect };
}

// Legacy aliases — keep existing consumers working
const useWallet  = useDynamicWallet;
const useTwitter = useDynamicTwitter;

// ============================================================
// AUTH MODAL — Dynamic-branded popup with wallet + social options
// ============================================================
const HANDLE_POOL = [
  'gerrydoteth', 'nadgod', 'pixelmonad', 'salmonking', 'iglu_dev', 'monad_qt',
  'chog_lord', 'snek_dev', 'hashstar', 'monfren', 'parallel_io', 'tipsy_mon',
  'opal_4', 'breakfast_eth', 'wenmainnet', 'monalisa_x', 'gradient_eth', 'mononoke',
];
const DISPLAY_NAMES = [
  'Gerry Stephen', 'Nadgod', 'Pixel Monad', 'Salmon King', 'iglu.dev', 'Monad Cutie',
  'Chog Lord', 'Snake', 'hashstar', 'monfren', 'Parallel.io', 'Tipsy Mon',
  'Opal Four', 'Breakfast', 'wen mainnet', 'monalisa', 'gradient', 'mononoke',
];
function pickHandle() { return HANDLE_POOL[Math.floor(Math.random() * HANDLE_POOL.length)]; }
function pickAvatar(handle) {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) >>> 0;
  return MONANIMALS[h % MONANIMALS.length].sprite;
}

function makeMpcWallet() {
  // Mocks Dynamic's MPC wallet provisioning.
  return {
    address: '0x' + Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
    balance: rand(1.5, 24.0).toFixed(2),
    chainOk: true,
    mock: true,
    source: 'dynamic-mpc',
  };
}

function synthTwitter() {
  const handle = pickHandle();
  const idx = HANDLE_POOL.indexOf(handle);
  return {
    handle,
    displayName: DISPLAY_NAMES[idx] || handle,
    avatar: pickAvatar(handle),
    verified: Math.random() < 0.35,
    followers: Math.floor(rand(200, 14500)),
    dynamicUserId: 'dyn_' + Math.random().toString(36).slice(2, 14),
  };
}

// Detects + uses a real injected wallet if the user picks "external wallet".
async function connectExternalWallet() {
  const eth = window.ethereum;
  if (!eth) return null;
  try {
    const accs = await eth.request({ method: 'eth_requestAccounts' });
    if (!accs?.[0]) return null;
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN.hex }] });
    } catch (err) {
      if (err && err.code === 4902) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: MONAD_CHAIN.hex,
              chainName: MONAD_CHAIN.name,
              rpcUrls: [MONAD_CHAIN.rpc],
              nativeCurrency: { name: 'Monad', symbol: MONAD_CHAIN.symbol, decimals: 18 },
              blockExplorerUrls: [MONAD_CHAIN.explorer],
            }],
          });
        } catch (_) {}
      }
    }
    const chainHex = await eth.request({ method: 'eth_chainId' });
    const chainOk = (chainHex || '').toLowerCase() === MONAD_CHAIN.hex;
    let balance = '';
    if (chainOk) {
      try {
        const wei = await eth.request({ method: 'eth_getBalance', params: [accs[0], 'latest'] });
        balance = (Number(BigInt(wei)) / 1e18).toFixed(2);
      } catch (_) {}
    }
    return { address: accs[0], balance, chainOk, mock: false, source: 'injected' };
  } catch (_) { return null; }
}

function openDynamicAuth({ prefer = 'wallet' } = {}) {
  return new Promise((resolve) => {
    const w = window.open('', 'dynamic-auth', 'width=440,height=720');
    if (!w) {
      setTimeout(() => resolve({ wallet: makeMpcWallet(), twitter: prefer === 'twitter' ? synthTwitter() : null }), 800);
      return;
    }
    w.document.write(dynamicAuthHtml(prefer));
    const checkInt = setInterval(async () => {
      if (w.closed) {
        clearInterval(checkInt);
        resolve(null);
        return;
      }
      try {
        const choice = w.__moncade_auth_choice;
        if (choice) {
          clearInterval(checkInt);
          let wallet = null, twitter = null;
          if (choice === 'twitter') { wallet = makeMpcWallet(); twitter = synthTwitter(); }
          else if (choice === 'google') { wallet = makeMpcWallet(); }
          else if (choice === 'email')  { wallet = makeMpcWallet(); }
          else if (choice === 'wallet') {
            const ext = await connectExternalWallet();
            wallet = ext || makeMpcWallet();
          }
          w.close();
          resolve({ wallet, twitter });
        }
      } catch (_) {}
    }, 200);
  });
}

function dynamicAuthHtml(prefer) {
  return `<!doctype html><html><head><title>Sign in · Dynamic</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; background: #0a0a0d; color: #fff; min-height: 100vh; display: grid; place-items: center; padding: 20px; }
  .modal { width: 100%; max-width: 380px; background: #14141a; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 32px 28px; box-shadow: 0 28px 80px rgba(0,0,0,0.6); }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; font-size: 14px; font-weight: 700; }
  .brand-mark { width: 24px; height: 24px; border-radius: 6px; background: linear-gradient(135deg, #6f5cff, #00d4ff); display: grid; place-items: center; font-size: 13px; font-weight: 900; color: #000; }
  .brand-mark::before { content: "D"; }
  .brand-tag { color: rgba(255,255,255,0.4); font-weight: 400; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.01em; }
  .sub { color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
  .x-btn { width: 100%; padding: 14px; background: #fff; color: #000; border: 0; border-radius: 999px; font-size: 15px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; transition: all 160ms; }
  .x-btn:hover { background: #e8e8e8; }
  .x-glyph { font-size: 16px; font-weight: 900; }
  .divider { display: flex; align-items: center; gap: 12px; margin: 20px 0 16px; color: rgba(255,255,255,0.3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; }
  .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: rgba(255,255,255,0.08); }
  .alt-list { display: flex; flex-direction: column; gap: 8px; }
  .alt-btn { width: 100%; padding: 12px; background: rgba(255,255,255,0.04); color: #fff; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 10px; transition: all 160ms; }
  .alt-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.16); }
  .alt-ico { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 11px; font-weight: 900; flex-shrink: 0; }
  .foot { margin-top: 28px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; }
  .secured { font-size: 11px; color: rgba(255,255,255,0.4); display: flex; align-items: center; gap: 6px; }
  .powered { font-size: 11px; color: rgba(255,255,255,0.4); }
  .powered strong { color: #6f5cff; }
  .loading { display: none; flex-direction: column; align-items: center; padding: 24px 0; }
  .loading.active { display: flex; }
  .spinner { width: 36px; height: 36px; border: 3px solid rgba(111,92,255,0.18); border-top-color: #6f5cff; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 14px; }
  .loading-text { color: rgba(255,255,255,0.7); font-size: 13px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .main.hidden { display: none; }
</style></head><body>
<div class="modal">
  <div class="brand"><div class="brand-mark"></div><span>Dynamic</span><span class="brand-tag">× Moncade</span></div>
  <div class="main" id="main">
    <h1>Sign in to Moncade</h1>
    <p class="sub">Connect a wallet or sign in with social — Dynamic provisions an MPC wallet for you instantly.</p>
    <button class="x-btn" id="btn-x" data-choice="${prefer === 'twitter' ? 'twitter' : 'wallet'}">
      ${prefer === 'twitter'
        ? '<span class="x-glyph">𝕏</span>Continue with X'
        : '<span style="font-size:18px">🦊</span>Continue with Wallet'}
    </button>
    <div class="divider">or</div>
    <div class="alt-list">
      ${prefer === 'twitter' ? '' : `
      <button class="alt-btn" data-choice="twitter">
        <div class="alt-ico" style="background: #000; color: #fff;">𝕏</div>
        Continue with X
      </button>`}
      <button class="alt-btn" data-choice="google">
        <div class="alt-ico" style="background: #fff; color: #000;">G</div>
        Continue with Google
      </button>
      <button class="alt-btn" data-choice="email">
        <div class="alt-ico" style="background: #6f5cff;">@</div>
        Continue with email
      </button>
      ${prefer === 'twitter' ? `
      <button class="alt-btn" data-choice="wallet">
        <div class="alt-ico" style="background: linear-gradient(135deg, #f6851b, #e2761b);">🦊</div>
        Continue with wallet
      </button>` : ''}
    </div>
  </div>
  <div class="loading" id="loading">
    <div class="spinner"></div>
    <div class="loading-text" id="loading-text">Authorizing…</div>
  </div>
  <div class="foot">
    <span class="secured">🔒 Securely powered by</span>
    <span class="powered"><strong>Dynamic</strong></span>
  </div>
</div>
<script>
  document.querySelectorAll('[data-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-choice');
      document.getElementById('main').classList.add('hidden');
      document.getElementById('loading').classList.add('active');
      const labels = { twitter: 'Authorizing with X…', google: 'Authorizing with Google…', email: 'Sending magic link…', wallet: 'Connecting wallet…' };
      document.getElementById('loading-text').textContent = labels[choice] || 'Connecting…';
      setTimeout(() => { window.__moncade_auth_choice = choice; }, 1100);
    });
  });
</script>
</body></html>`;
}

// ============================================================
// CHAT — global + per-game. Each message wallet-signed via personal_sign.
// ============================================================
const CHAT_KEY = 'moncade.chat.v1';
const CHAT_ROOMS = [
  { id: 'lobby',    label: 'Lobby',    icon: '◆' },
  { id: 'snake',    label: 'Monslither', icon: '~' },
  { id: 'blob',     label: 'Monbubble',  icon: '○' },
  { id: 'monerge',  label: 'Monerge',    icon: '⊞' },
  { id: 'mongeon',  label: 'Mongeon',    icon: '⌂' },
  { id: 'monclash', label: 'Monclash',   icon: '⚔' },
  { id: 'monaba',   label: 'Monaba',     icon: '◉' },
  { id: 'moncards', label: 'Moncards',   icon: '♠' },
  { id: 'monparty', label: 'Monparty',   icon: '◊' },
];

const SEED_MSGS = [
  { who: 'gerrydoteth', text: 'just hit 2048 on monerge LFG', verified: true, room: 'monerge' },
  { who: 'nadgod', text: 'who wants to lobby up snake', room: 'snake' },
  { who: 'pixelmonad', text: 'monparty bombs are EVIL', room: 'monparty' },
  { who: 'salmonking', text: 'getting destroyed in monaba lol', room: 'monaba' },
  { who: 'iglu_dev', text: 'gn iglus 🌙', room: 'lobby' },
  { who: 'monad_qt', text: 'mongeon floor 7 personal best', room: 'mongeon' },
  { who: 'chog_lord', text: 'anyone solving moncards in <20s?', room: 'moncards' },
  { who: 'snek_dev', text: 'just posted my run on chain', room: 'lobby' },
  { who: 'parallel_io', text: 'monclash wave 14 is unfair', room: 'monclash' },
  { who: 'monfren', text: 'blob is way slower now, way better', room: 'blob' },
];

const BOT_LINES = {
  lobby:    ['gm', 'gn', 'who playing tonight', 'building anything?', 'wagmi', 'monad gas so cheap', 'iglu szn', '🦔', 'time to grind', 'fully onchain szn'],
  snake:    ['lobby up', 'kill steal incoming', 'biggest snake wins', 'longest run was 340 segs', 'orange dot food'],
  blob:     ['split to chase!', 'feed me', 'gg', 'mass overrated', 'don\'t merge yet'],
  monerge:  ['so close to 1024', 'rng kinda brutal', 'corners only', 'one more tile'],
  mongeon:  ['floor 5 a wall', 'gold > kills', 'salmonad too tanky', 'careful at exit'],
  monclash: ['use the bombs', 'wave 10 is a wall', 'click faster', 'mouch is fast'],
  monaba:   ['dash is OP', 'space attack better', 'gg ez', 'wp'],
  moncards: ['memorize the corners', 'easy 1000', 'speed > moves'],
  monparty: ['BOMBS', 'combo break 😭', 'so close to 1k', 'this is chaos'],
};

function loadChat() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch (_) {}
  return seedChat();
}
function saveChat(c) {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(c)); } catch (_) {}
}
function seedChat() {
  const c = {};
  CHAT_ROOMS.forEach((r) => { c[r.id] = []; });
  SEED_MSGS.forEach((m, i) => {
    if (!c[m.room]) c[m.room] = [];
    c[m.room].push({
      id: Date.now() - (SEED_MSGS.length - i) * 60000 + i,
      who: m.who,
      avatar: pickAvatar(m.who),
      text: m.text,
      ts: Date.now() - (SEED_MSGS.length - i) * 60000,
      verified: !!m.verified,
      isBot: true,
      sigOk: true,
      sigShort: '0x' + Math.random().toString(16).slice(2, 10),
    });
  });
  return c;
}

const chatListeners = new Set();
function emitChat() { chatListeners.forEach((cb) => cb()); }

function postMessage(room, msg) {
  const c = loadChat();
  if (!c[room]) c[room] = [];
  c[room].push(msg);
  if (c[room].length > 80) c[room] = c[room].slice(-80);
  saveChat(c);
  emitChat();
}

function useChat(room) {
  const [, setBump] = useState(0);
  useEffect(() => {
    const cb = () => setBump((x) => x + 1);
    chatListeners.add(cb);
    return () => chatListeners.delete(cb);
  }, []);
  const c = loadChat();
  return c[room] || [];
}

// Sign a chat message with the user's connected wallet.
// Falls back to a mock signature when the wallet is in mock mode.
async function signChatMessage({ wallet, room, text }) {
  if (!wallet || !wallet.address) return { ok: false, error: 'no_wallet' };
  const ts = Date.now();
  const payload = `Moncade chat\nroom: ${room}\nts: ${ts}\nmsg: ${text}`;
  if (wallet.mock) {
    // mock sig — believable hex
    const sig = '0x' + Array.from({ length: 130 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    return { ok: true, sig, payload, ts, mock: true };
  }
  try {
    const eth = window.ethereum;
    if (!eth) return { ok: false, error: 'no_provider' };
    const sig = await eth.request({
      method: 'personal_sign',
      params: [payload, wallet.address],
    });
    return { ok: true, sig, payload, ts, mock: false };
  } catch (e) {
    return { ok: false, error: e?.message || 'sig_failed' };
  }
}

// background bots: every 8-15s a bot posts in some random room
let botInt = null;
function startBotChatter() {
  if (botInt) return;
  botInt = setInterval(() => {
    const room = CHAT_ROOMS[Math.floor(Math.random() * CHAT_ROOMS.length)].id;
    const lines = BOT_LINES[room] || BOT_LINES.lobby;
    const text = lines[Math.floor(Math.random() * lines.length)];
    const who = HANDLE_POOL[Math.floor(Math.random() * HANDLE_POOL.length)];
    postMessage(room, {
      id: Date.now() + Math.random(),
      who, avatar: pickAvatar(who), text, ts: Date.now(),
      verified: Math.random() < 0.2, isBot: true,
      sigOk: true,
      sigShort: '0x' + Math.random().toString(16).slice(2, 10),
    });
  }, 9000 + Math.random() * 6000);
}
startBotChatter();

// ============================================================
// CHAT PANEL UI
// ============================================================
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function ChatPanel({ twitter, wallet, onConnectTwitter, onDisconnectTwitter, currentRoom, setCurrentRoom, onClose }) {
  const [text, setText] = useState('');
  const [signing, setSigning] = useState(false);
  const messages = useChat(currentRoom);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, currentRoom]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !twitter.handle) return;
    if (!wallet || !wallet.address) {
      window.pushToast?.('Connect wallet to sign messages', 'pink');
      return;
    }
    setSigning(true);
    const sigResult = await signChatMessage({ wallet, room: currentRoom, text: trimmed });
    setSigning(false);
    if (!sigResult.ok) {
      window.pushToast?.('Signature rejected', 'pink');
      return;
    }
    postMessage(currentRoom, {
      id: Date.now() + Math.random(),
      who: twitter.handle, avatar: twitter.avatar, text: trimmed,
      ts: sigResult.ts, verified: twitter.verified, isBot: false, mine: true,
      sigOk: true, sigShort: sigResult.sig.slice(0, 10),
      wallet: wallet.address,
    });
    setText('');
  };

  const canSend = !!twitter.handle && !!wallet?.address && !signing;

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div className="chat-title">
          <span className="chat-dot"></span>
          <span>Lounge</span>
          <span className="chat-gasless" title="Off-chain wallet-signed messages — gasless">gasless · signed</span>
        </div>
        <button className="chat-x" onClick={onClose}>×</button>
      </div>
      <div className="chat-rooms">
        {CHAT_ROOMS.map((r) => (
          <button key={r.id}
            className={`chat-room ${currentRoom === r.id ? 'active' : ''}`}
            onClick={() => setCurrentRoom(r.id)}>
            <span className="chat-room-icon">{r.icon}</span>{r.label}
          </button>
        ))}
      </div>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">No messages in <strong>{CHAT_ROOMS.find((r) => r.id === currentRoom)?.label}</strong> yet. Be first.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : ''}`}>
            <img src={m.avatar} alt="" className="chat-avatar" />
            <div className="chat-body">
              <div className="chat-line1">
                <span className="chat-who">@{m.who}</span>
                {m.verified && <span className="chat-verified" title="X verified">✓</span>}
                {m.sigOk && <span className="chat-sig" title={`Signed: ${m.sigShort}…`}>🔏 sig</span>}
                <span className="chat-ts">{timeAgo(m.ts)}</span>
              </div>
              <div className="chat-text">{m.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        {twitter.handle ? (
          wallet?.address ? (
            <>
              <img src={twitter.avatar} alt="" className="chat-avatar" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder={signing ? 'Signing…' : `Message #${currentRoom} as @${twitter.handle}`}
                maxLength={200}
                disabled={signing}
              />
              <button className="chat-send" onClick={send} disabled={!canSend || !text.trim()}>
                {signing ? '…' : 'Send'}
              </button>
            </>
          ) : (
            <div className="chat-need-wallet">
              <span>🔏</span>
              Connect wallet to sign + send
            </div>
          )
        ) : (
          <button className="chat-connect-x" onClick={onConnectTwitter}>
            <span className="x-glyph">𝕏</span>
            Connect X via Dynamic
          </button>
        )}
      </div>
      {twitter.handle && (
        <button className="chat-disconnect" onClick={onDisconnectTwitter}>
          Disconnect @{twitter.handle}
          {twitter.displayName && <span style={{ color: 'var(--ink-mute)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · {twitter.displayName}</span>}
        </button>
      )}
    </div>
  );
}

// ============================================================
// TWITTER CHIP — small badge in top chrome
// ============================================================
function TwitterChip({ twitter, onConnect, onDisconnect }) {
  if (!twitter.handle) {
    return (
      <button className="chip chip-x" onClick={onConnect} title="Connect via Dynamic">
        <span className="x-glyph">𝕏</span>
        Connect X
      </button>
    );
  }
  return (
    <button className="chip chip-x connected" onClick={onDisconnect} title={`Disconnect @${twitter.handle}`}>
      <img src={twitter.avatar} alt="" className="chip-x-avatar" />
      <span>@{twitter.handle}</span>
      {twitter.verified && <span className="chat-verified">✓</span>}
    </button>
  );
}

Object.assign(window, {
  useDynamicWallet, useDynamicTwitter,
  useWallet, useTwitter,
  useChat, postMessage, signChatMessage,
  CHAT_ROOMS, DYNAMIC_ENV_ID,
  ChatPanel, TwitterChip, timeAgo, pickAvatar,
  openDynamicAuth,
});
