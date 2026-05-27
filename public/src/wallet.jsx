/* global React, shortAddr, pushToast */
// Wallet + on-chain leaderboard for Moncade.
// Uses the SAME deployed MonergeRuns contract on Monad Mainnet — game ID is
// packed into the upper 4 bits of `difficulty` so an indexer can split runs
// by game off the single 0xb842…8ddd address.

const { useState, useEffect, useCallback, useRef } = React;

// ============================================================
// CHAIN + CONTRACT CONFIG
// ============================================================
const MONAD_CHAIN = {
  id: 143,
  hex: '0x8f',
  name: 'Monad Mainnet',
  rpc: 'https://rpc.monad.xyz',
  explorer: 'https://monadscan.com',
  symbol: 'MON',
};

const MONCADE_CONTRACT = '0xb8428c30293d1cd66d9187d1aec259deef508ddd';

// Game IDs encoded into the high nibble of `difficulty` so all three games
// share the contract.
const GAME_IDS = {
  monerge: 1,
  snake:   2,
  blob:    3,
};

function encodeDifficulty(gameId, difficulty = 1) {
  // [4 bits game id][4 bits per-game difficulty]
  return ((gameId & 0xF) << 4) | (difficulty & 0xF);
}

// ============================================================
// LOCAL MOCK STATE
// ============================================================
// We attempt to connect a real EIP-1193 wallet when available. If none is
// present (or the user explicitly chooses guest mode) we fall back to a
// deterministic mock address so the leaderboard demo still flows.

const WALLET_KEY = 'moncade.wallet.v1';
const LB_KEY     = 'moncade.leaderboard.v1';
const PROFILE_KEY = 'moncade.profile.v1';

function loadWalletCache() {
  try { return JSON.parse(localStorage.getItem(WALLET_KEY) || 'null'); }
  catch (_) { return null; }
}
function saveWalletCache(state) {
  try { localStorage.setItem(WALLET_KEY, JSON.stringify(state || {})); } catch (_) {}
}

function loadLeaderboard() {
  try {
    const raw = JSON.parse(localStorage.getItem(LB_KEY) || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch (_) {}
  return seedLeaderboard();
}
function saveLeaderboard(lb) {
  try { localStorage.setItem(LB_KEY, JSON.stringify(lb)); } catch (_) {}
}

// Seed with believable mock runs across all 3 games so the lobby leaderboard
// looks lived-in before the player has played.
function seedLeaderboard() {
  const seedNames = [
    { n: 'gerry.eth',   a: '0x4f7a3aB2D08e1c7a2Cc1d12F1e0a51Bc3CA0c1b9', m: 'molandak' },
    { n: 'nadgod',      a: '0xa8B2cC7e51E2901aC4D0b8E2F61B5d22F2e9aD51', m: 'chog' },
    { n: 'pixelmonad',  a: '0x9c1Df58e7D2b54aF3a73810b1C2D1d4E0bA1FC50', m: 'mouch' },
    { n: 'salmonking',  a: '0x55E1aCc8B92AaD08c8E2c7F3D2c8F4c4d6E1B8A1', m: 'salmonad' },
    { n: 'iglu.cz',     a: '0x71b3e6E4FF7a2C3D4e1A5B6c7D8e9F0a1B2C3D4E', m: 'mokadel' },
    { n: 'monalisa',    a: '0xBaD0c0fFee1234567890abcDeF1234567890bEEf', m: 'emonad' },
    { n: '0xchog',      a: '0xCAB0AdF21cD7B8a9c01d2e3f4a5B6c7D8e9F0a1B', m: 'chog' },
    { n: 'gradient',    a: '0x12345abcdef67890fedcba0987654321fedcba98', m: 'molandak' },
  ];
  const games = ['monerge', 'snake', 'blob'];
  const seed = { monerge: [], snake: [], blob: [] };
  games.forEach((g) => {
    seedNames.forEach((p, i) => {
      const baseScore = g === 'monerge' ? 1024 + Math.floor(Math.random() * 8000)
                     : g === 'snake'   ? 1800 + Math.floor(Math.random() * 6500)
                     :                   3200 + Math.floor(Math.random() * 9000);
      seed[g].push({
        wallet: p.a,
        name: p.n,
        monanimal: p.m,
        score: baseScore - i * 230 + Math.floor(Math.random() * 400),
        actual: Math.floor(baseScore * 0.7),
        meta: g === 'snake' ? `len ${20 + Math.floor(Math.random() * 280)}`
            : g === 'blob'  ? `${1 + Math.floor(Math.random() * 14)} eaten`
            :                  `tile ${[64, 128, 256, 512, 1024][Math.floor(Math.random() * 5)]}`,
        seconds: 40 + Math.floor(Math.random() * 280),
        timestamp: Date.now() - Math.floor(Math.random() * 86400 * 6 * 1000),
        txHash: '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''),
        onChain: true,
      });
    });
    seed[g].sort((a, b) => b.score - a.score);
  });
  return seed;
}

// ============================================================
// WALLET HOOK — returns state + actions
// ============================================================
function useWallet() {
  const [state, setState] = useState(() => loadWalletCache() || { address: '', balance: '', chainOk: false, mock: false });
  const providerRef = useRef(null);

  const detectProvider = () => {
    if (typeof window === 'undefined') return null;
    return window.ethereum || null;
  };

  // Listen for account / chain changes.
  useEffect(() => {
    const eth = detectProvider();
    if (!eth) return;
    providerRef.current = eth;
    const onAccounts = (accs) => {
      if (!accs || !accs.length) {
        const next = { address: '', balance: '', chainOk: false, mock: false };
        setState(next); saveWalletCache(next);
      } else {
        refreshBalance(accs[0]);
      }
    };
    const onChain = () => refreshBalance(state.address);
    eth.on?.('accountsChanged', onAccounts);
    eth.on?.('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  // eslint-disable-next-line
  }, []);

  const refreshBalance = useCallback(async (addr) => {
    const eth = providerRef.current || detectProvider();
    if (!eth || !addr) return;
    try {
      const chainHex = await eth.request({ method: 'eth_chainId' });
      const chainOk = (chainHex || '').toLowerCase() === MONAD_CHAIN.hex;
      let balance = '';
      if (chainOk) {
        const wei = await eth.request({ method: 'eth_getBalance', params: [addr, 'latest'] });
        const mon = Number(BigInt(wei)) / 1e18;
        balance = mon.toFixed(2);
      }
      const next = { address: addr, balance, chainOk, mock: false };
      setState(next); saveWalletCache(next);
    } catch (_) {}
  }, []);

  const connect = useCallback(async () => {
    const eth = detectProvider();
    if (!eth) {
      // No injected wallet — fall back to mock.
      const mockAddr = '0xMonCade' + Math.random().toString(16).slice(2, 36);
      const next = { address: mockAddr, balance: '12.50', chainOk: true, mock: true };
      setState(next); saveWalletCache(next);
      pushToast('Demo wallet connected', 'cyan');
      return;
    }
    try {
      const accs = await eth.request({ method: 'eth_requestAccounts' });
      if (accs?.[0]) {
        // Try switch to Monad mainnet (chain 143). Add if missing.
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
            } catch (_) { /* ignore */ }
          }
        }
        await refreshBalance(accs[0]);
        pushToast('Wallet connected', 'cyan');
      }
    } catch (e) {
      pushToast('Wallet connect cancelled', 'pink');
    }
  }, [refreshBalance]);

  const disconnect = useCallback(() => {
    const next = { address: '', balance: '', chainOk: false, mock: false };
    setState(next); saveWalletCache(next);
    pushToast('Disconnected', '');
  }, []);

  return { ...state, connect, disconnect, refreshBalance };
}

// ============================================================
// SUBMIT RUN — calls submitRun() on the shared contract.
// Falls back to local-only when wallet is mock or chain unavailable.
// ============================================================
async function submitRunOnChain({ game, walletState, score, actual, maxTile, moves, difficulty, profileHash }) {
  if (!walletState || !walletState.address) {
    return { ok: false, error: 'wallet_missing' };
  }
  const gameId = GAME_IDS[game] || 0;
  const packedDifficulty = encodeDifficulty(gameId, difficulty || 1);

  // Build a deterministic 32-byte runId from the player + score + ts.
  const runIdSeed = `${walletState.address}|${game}|${score}|${Date.now()}|${Math.random()}`;
  const runId = await keccak256Hex(runIdSeed);

  if (walletState.mock || !walletState.chainOk) {
    // Local-only — fake a tx hash so the receipt UI still renders.
    const txHash = '0x' + Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    await sleep(900); // simulate network latency
    return { ok: true, txHash, runId, mock: true };
  }

  // Real submission via injected provider.
  const eth = window.ethereum;
  if (!eth) return { ok: false, error: 'no_provider' };

  try {
    // Encode submitRun(bytes32,uint256,uint256,uint16,uint16,uint8,bytes32)
    const data = encodeSubmitRun({
      runId,
      score: BigInt(score | 0),
      actual: BigInt(actual | 0),
      maxTile: maxTile & 0xFFFF,
      moves: moves & 0xFFFF,
      difficulty: packedDifficulty & 0xFF,
      profileHash: profileHash || ('0x' + '00'.repeat(32)),
    });
    const txHash = await eth.request({
      method: 'eth_sendTransaction',
      params: [{ from: walletState.address, to: MONCADE_CONTRACT, data }],
    });
    return { ok: true, txHash, runId, mock: false };
  } catch (e) {
    return { ok: false, error: e?.message || 'tx_failed' };
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// keccak256 — pure JS implementation (no deps).
// Adapted from public-domain SHA-3 implementations. Used to build runId
// and to compute the function selector for `submitRun(...)`.
// ============================================================
function keccak256(input) {
  // input: Uint8Array → Uint8Array(32)
  // Constants
  const RC = [
    0x00000001, 0x00000000, 0x00008082, 0x00000000, 0x0000808a, 0x80000000,
    0x80008000, 0x80000000, 0x0000808b, 0x00000000, 0x80000001, 0x00000000,
    0x80008081, 0x80000000, 0x00008009, 0x80000000, 0x0000008a, 0x00000000,
    0x00000088, 0x00000000, 0x80008009, 0x00000000, 0x8000000a, 0x00000000,
    0x8000808b, 0x00000000, 0x0000008b, 0x80000000, 0x00008089, 0x80000000,
    0x00008003, 0x80000000, 0x00008002, 0x80000000, 0x00000080, 0x80000000,
    0x0000800a, 0x00000000, 0x8000000a, 0x80000000, 0x80008081, 0x80000000,
    0x00008080, 0x80000000, 0x80000001, 0x00000000, 0x80008008, 0x80000000,
  ];
  const r = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];

  const state = new Uint32Array(50); // 25 lanes × 2 (hi, lo)

  const rate = 136; // 1088 / 8
  const pad = new Uint8Array((Math.ceil((input.length + 1) / rate)) * rate);
  pad.set(input);
  pad[input.length] = 0x01; // keccak (not SHA-3) pad
  pad[pad.length - 1] |= 0x80;

  for (let off = 0; off < pad.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      const j = i * 2;
      state[j]     ^= (pad[off + i*8    ])       | (pad[off + i*8 + 1] << 8)
                    | (pad[off + i*8 + 2] << 16) | (pad[off + i*8 + 3] << 24);
      state[j + 1] ^= (pad[off + i*8 + 4])       | (pad[off + i*8 + 5] << 8)
                    | (pad[off + i*8 + 6] << 16) | (pad[off + i*8 + 7] << 24);
    }
    keccakF(state, RC, r);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const lo = state[i * 2], hi = state[i * 2 + 1];
    out[i*8    ] =  lo         & 0xFF;
    out[i*8 + 1] = (lo >>>  8) & 0xFF;
    out[i*8 + 2] = (lo >>> 16) & 0xFF;
    out[i*8 + 3] = (lo >>> 24) & 0xFF;
    out[i*8 + 4] =  hi         & 0xFF;
    out[i*8 + 5] = (hi >>>  8) & 0xFF;
    out[i*8 + 6] = (hi >>> 16) & 0xFF;
    out[i*8 + 7] = (hi >>> 24) & 0xFF;
  }
  return out;
}

function keccakF(s, RC, R) {
  const C = new Uint32Array(10);
  const D = new Uint32Array(10);
  const B = new Uint32Array(50);
  for (let round = 0; round < 24; round++) {
    // Theta
    for (let x = 0; x < 5; x++) {
      const i = x * 2;
      C[i]   = s[i]   ^ s[i+10] ^ s[i+20] ^ s[i+30] ^ s[i+40];
      C[i+1] = s[i+1] ^ s[i+11] ^ s[i+21] ^ s[i+31] ^ s[i+41];
    }
    for (let x = 0; x < 5; x++) {
      const i = x * 2;
      const px = ((x + 4) % 5) * 2;
      const nx = ((x + 1) % 5) * 2;
      const rotLo = ((C[nx]   << 1) | (C[nx+1] >>> 31)) >>> 0;
      const rotHi = ((C[nx+1] << 1) | (C[nx]   >>> 31)) >>> 0;
      D[i]   = C[px]   ^ rotLo;
      D[i+1] = C[px+1] ^ rotHi;
    }
    for (let i = 0; i < 25; i++) {
      const xi = (i % 5) * 2;
      s[i*2]   ^= D[xi];
      s[i*2+1] ^= D[xi+1];
    }
    // Rho + Pi
    for (let i = 0; i < 25; i++) {
      const rot = R[i];
      const lo = s[i*2], hi = s[i*2+1];
      let nLo, nHi;
      if (rot === 0)      { nLo = lo;                                                 nHi = hi; }
      else if (rot < 32)  { nLo = ((lo << rot) | (hi >>> (32 - rot))) >>> 0;          nHi = ((hi << rot) | (lo >>> (32 - rot))) >>> 0; }
      else if (rot === 32){ nLo = hi;                                                 nHi = lo; }
      else                { const r2 = rot - 32;
                            nLo = ((hi << r2) | (lo >>> (32 - r2))) >>> 0;
                            nHi = ((lo << r2) | (hi >>> (32 - r2))) >>> 0; }
      // place at piIndex
      const piMap = [0,6,12,18,24, 3,9,10,16,22, 1,7,13,19,20, 4,5,11,17,23, 2,8,14,15,21];
      const tgt = piMap[i];
      B[tgt*2]   = nLo;
      B[tgt*2+1] = nHi;
    }
    // Chi
    for (let y = 0; y < 5; y++) {
      const row = y * 10;
      for (let x = 0; x < 5; x++) {
        const i = row + x * 2;
        const i1 = row + ((x + 1) % 5) * 2;
        const i2 = row + ((x + 2) % 5) * 2;
        s[i]   = B[i]   ^ ((~B[i1])   & B[i2]);
        s[i+1] = B[i+1] ^ ((~B[i1+1]) & B[i2+1]);
      }
    }
    // Iota
    s[0] ^= RC[round * 2];
    s[1] ^= RC[round * 2 + 1];
  }
}

async function keccak256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const out = keccak256(bytes);
  return '0x' + Array.from(out).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Function selector for submitRun(bytes32,uint256,uint256,uint16,uint16,uint8,bytes32)
const SUBMIT_RUN_SELECTOR = (() => {
  const sig = 'submitRun(bytes32,uint256,uint256,uint16,uint16,uint8,bytes32)';
  const out = keccak256(new TextEncoder().encode(sig));
  return '0x' + Array.from(out.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join('');
})();

function pad32Hex(hex) {
  hex = (hex || '').replace(/^0x/, '');
  return hex.padStart(64, '0');
}
function bigToHex(n) {
  let h = n.toString(16);
  if (h.length > 64) h = h.slice(-64);
  return h.padStart(64, '0');
}

function encodeSubmitRun({ runId, score, actual, maxTile, moves, difficulty, profileHash }) {
  const out = SUBMIT_RUN_SELECTOR
    + pad32Hex(runId)
    + bigToHex(score)
    + bigToHex(actual)
    + bigToHex(BigInt(maxTile))
    + bigToHex(BigInt(moves))
    + bigToHex(BigInt(difficulty))
    + pad32Hex(profileHash);
  return out;
}

// ============================================================
// LEADERBOARD HELPERS
// ============================================================
function submitToLeaderboard(game, entry) {
  const lb = loadLeaderboard();
  if (!lb[game]) lb[game] = [];
  lb[game].push(entry);
  lb[game].sort((a, b) => b.score - a.score);
  lb[game] = lb[game].slice(0, 20);
  saveLeaderboard(lb);
  return lb;
}
function getLeaderboard() { return loadLeaderboard(); }

// ============================================================
// EXPORTS
// ============================================================
Object.assign(window, {
  MONAD_CHAIN, MONCADE_CONTRACT, GAME_IDS, encodeDifficulty,
  submitRunOnChain,
  getLeaderboard, submitToLeaderboard, saveLeaderboard, loadLeaderboard,
  keccak256, keccak256Hex,
  PROFILE_KEY,
});
