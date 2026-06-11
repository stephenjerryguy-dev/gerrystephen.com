import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DynamicContextProvider,
  dynamicEvents,
  useDynamicContext,
  useDynamicModals,
  useUserWallets
} from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { defineChain, encodeFunctionData, keccak256, toHex } from 'viem';
import {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakSlider,
  TweakToggle,
  TweakSelect,
} from './tweaks-panel.jsx';
import './styles.css';

const SITE_BUILD_VERSION = 'ecosystems-app-93';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_) {
    return null;
  }
}

function storageGet(key, fallback = '') {
  try {
    return safeStorage()?.getItem(key) ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    safeStorage()?.setItem(key, value);
  } catch (_) {}
}

function storageRemove(key) {
  try {
    safeStorage()?.removeItem(key);
  } catch (_) {}
}

function storageKeys() {
  try {
    const store = safeStorage();
    return store ? Object.keys(store) : [];
  } catch (_) {
    return [];
  }
}

function safeNow() {
  try {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  } catch (_) {
    return Date.now();
  }
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-error-screen">
          <section>
            <p>App recovery</p>
            <h1>Reload the iglu.</h1>
            <span>{this.state.error?.message || 'The app hit a browser runtime issue.'}</span>
            <button type="button" onClick={() => window.location.reload()}>Reload</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "parallaxIntensity": 60,
  "snowfall": true,
  "warmChapters": true,
  "displayFont": "Inter Tight",
  "accentHue": 210
} /*EDITMODE-END*/;

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {setY(window.scrollY);raf = 0;});
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {window.removeEventListener('scroll', onScroll);if (raf) cancelAnimationFrame(raf);};
  }, []);
  return y;
}

function useMediaQuery(query, fallback = false) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return fallback;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    media.addListener?.(sync);
    return () => {
      media.removeEventListener?.('change', sync);
      media.removeListener?.(sync);
    };
  }, [query]);
  return matches;
}

function useMouse() {
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => {
    if (window.matchMedia?.('(pointer: coarse), (max-width: 900px)').matches) return undefined;
    const onMove = (e) => setPos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return pos;
}

function useAmbientScrollSound(y, enabled = true) {
  const audioRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const MASTER_VOLUME = 0.08;

    function fadeMaster(audio, target = MASTER_VOLUME, seconds = 1.8) {
      const now = audio.ctx.currentTime;
      audio.master.gain.cancelScheduledValues(now);
      audio.master.gain.setValueAtTime(audio.master.gain.value, now);
      audio.master.gain.linearRampToValueAtTime(target, now + seconds);
    }

    function makeNoiseBuffer(ctx, seconds = 2) {
      const length = ctx.sampleRate * seconds;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i += 1) {
        last = last * 0.98 + (Math.random() * 2 - 1) * 0.02;
        data[i] = last * 3.4;
      }
      return buffer;
    }

    function createSource(ctx, buffer, filterType, frequency, q = 0.7) {
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      source.buffer = buffer;
      source.loop = true;
      filter.type = filterType;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      source.connect(filter);
      source.start();
      return { source, filter };
    }

    function startAmbience() {
      if (!enabled) return;
      if (audioRef.current) {
        const audio = audioRef.current;
        audio.ctx.resume?.().then?.(() => {
          fadeMaster(audio);
          setReady(audio.ctx.state === 'running');
        });
        return;
      }

      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const noise = makeNoiseBuffer(ctx);
      const master = ctx.createGain();
      const beachGain = ctx.createGain();
      const snowGain = ctx.createGain();
      const beach = createSource(ctx, noise, 'lowpass', 720, 0.8);
      const snow = createSource(ctx, noise, 'highpass', 1600, 0.4);

      master.gain.value = 0;
      beachGain.gain.value = 0.7;
      snowGain.gain.value = 0;
      beach.filter.connect(beachGain).connect(master);
      snow.filter.connect(snowGain).connect(master);
      master.connect(ctx.destination);

      audioRef.current = { ctx, master, beachGain, snowGain, beach, snow };
      ctx.resume?.().then?.(() => {
        fadeMaster(audioRef.current);
        setReady(ctx.state === 'running');
      });
    }

    startAmbience();
    const opts = { passive: true };
    window.addEventListener('scroll', startAmbience, opts);
    window.addEventListener('pointerdown', startAmbience, opts);
    window.addEventListener('wheel', startAmbience, opts);
    window.addEventListener('touchstart', startAmbience, opts);
    window.addEventListener('keydown', startAmbience);
    return () => {
      window.removeEventListener('pointerdown', startAmbience);
      window.removeEventListener('scroll', startAmbience);
      window.removeEventListener('wheel', startAmbience);
      window.removeEventListener('touchstart', startAmbience);
      window.removeEventListener('keydown', startAmbience);
      const audio = audioRef.current;
      if (!audio) return;
      audio.beach.source.stop();
      audio.snow.source.stop();
      audio.ctx.close?.();
      audioRef.current = null;
      setReady(false);
    };
  }, [enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.ctx.currentTime;
    if (!enabled) {
      audio.master.gain.setTargetAtTime(0, now, 0.18);
      audio.beachGain.gain.setTargetAtTime(0, now, 0.18);
      audio.snowGain.gain.setTargetAtTime(0, now, 0.18);
      return;
    }
    audio.ctx.resume?.().then?.(() => {
      audio.master.gain.setTargetAtTime(0.08, audio.ctx.currentTime, 0.55);
      setReady(audio.ctx.state === 'running');
    });
  }, [enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const cold = Math.min(1, Math.max(0, y / maxScroll));
    const beachLevel = Math.max(0, 0.78 - cold * 0.84);
    const snowLevel = Math.max(0, (cold - 0.18) / 0.82) * 0.58;
    const now = audio.ctx.currentTime;
    audio.beachGain.gain.setTargetAtTime(beachLevel, now, 0.45);
    audio.snowGain.gain.setTargetAtTime(snowLevel, now, 0.55);
  }, [y, enabled]);

  return ready;
}

function useMonergeMusic(active = false) {
  const musicRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) {
      if (musicRef.current) {
        const music = musicRef.current;
        const now = music.ctx.currentTime;
        music.master.gain.setTargetAtTime(0, now, 0.12);
      }
      setReady(false);
      return undefined;
    }

    function startMusic() {
      if (musicRef.current) {
        const music = musicRef.current;
        music.ctx.resume?.();
        music.master.gain.setTargetAtTime(0.055, music.ctx.currentTime, 0.6);
        setReady(true);
        return;
      }

      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const master = ctx.createGain();
      const delay = ctx.createDelay(0.55);
      const feedback = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const notes = [196, 246.94, 293.66, 392, 329.63, 246.94];
      let step = 0;

      master.gain.value = 0;
      filter.type = 'lowpass';
      filter.frequency.value = 1250;
      delay.delayTime.value = 0.22;
      feedback.gain.value = 0.18;
      delay.connect(feedback).connect(delay);
      delay.connect(filter).connect(master).connect(ctx.destination);

      const tick = () => {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = step % 3 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(notes[step % notes.length], now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.09, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain).connect(delay);
        osc.start(now);
        osc.stop(now + 0.32);
        step += 1;
      };

      tick();
      const interval = window.setInterval(tick, 360);
      musicRef.current = { ctx, master, interval };
      ctx.resume?.().then?.(() => {
        master.gain.setTargetAtTime(0.055, ctx.currentTime, 0.6);
        setReady(true);
      });
    }

    const startOnce = () => startMusic();
    window.addEventListener('pointerdown', startOnce, { once: true, passive: true });
    window.addEventListener('keydown', startOnce, { once: true });
    window.addEventListener('monerge-audio-unlock', startOnce);
    startMusic();

    return () => {
      window.removeEventListener('pointerdown', startOnce);
      window.removeEventListener('keydown', startOnce);
      window.removeEventListener('monerge-audio-unlock', startOnce);
    };
  }, [active]);

  useEffect(() => () => {
    const music = musicRef.current;
    if (!music) return;
    window.clearInterval(music.interval);
    music.ctx.close?.();
    musicRef.current = null;
  }, []);

  return ready;
}

function useMonergeSfx(active = true) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (!active && audioRef.current) {
      audioRef.current.master.gain.setTargetAtTime(0, audioRef.current.ctx.currentTime, 0.08);
      return undefined;
    }

    function setup() {
      if (audioRef.current) {
        audioRef.current.ctx.resume?.();
        audioRef.current.master.gain.setTargetAtTime(0.18, audioRef.current.ctx.currentTime, 0.18);
        return;
      }
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const master = ctx.createGain();
      master.gain.value = active ? 0.18 : 0;
      master.connect(ctx.destination);
      audioRef.current = { ctx, master };
      ctx.resume?.();
    }

    setup();
    const unlock = () => setup();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('monerge-audio-unlock', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('monerge-audio-unlock', unlock);
    };
  }, [active]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.ctx.close?.();
    audioRef.current = null;
  }, []);

  return useCallback((type = 'tap') => {
    if (!active) return;
    const audio = audioRef.current;
    if (!audio) return;
    const { ctx, master } = audio;
    ctx.resume?.();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const settings = {
      move: { freq: 330, end: 420, dur: 0.09, type: 'triangle', level: 0.06 },
      merge: { freq: 520, end: 840, dur: 0.16, type: 'sine', level: 0.08 },
      lava: { freq: 120, end: 58, dur: 0.22, type: 'sawtooth', level: 0.1 },
      freeze: { freq: 920, end: 420, dur: 0.2, type: 'sine', level: 0.08 },
      reveal: { freq: 392, end: 784, dur: 0.34, type: 'triangle', level: 0.09 },
      start: { freq: 246, end: 492, dur: 0.2, type: 'triangle', level: 0.07 }
    }[type] || { freq: 420, end: 520, dur: 0.1, type: 'sine', level: 0.05 };
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'lava' ? 560 : 1800, now);
    osc.type = settings.type;
    osc.frequency.setValueAtTime(settings.freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, settings.end), now + settings.dur);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(settings.level, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings.dur);
    osc.connect(gain).connect(filter).connect(master);
    osc.start(now);
    osc.stop(now + settings.dur + 0.03);
  }, [active]);
}

function unlockMonergeAudio() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('monerge-audio-unlock'));
}

function useInView(ref, threshold = 0.15) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => {if (e.isIntersecting) setSeen(true);}, { threshold });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, threshold]);
  return seen;
}

function slowScrollTo(targetY, duration = 2600) {
  const startY = window.scrollY;
  const delta = targetY - startY;
  const start = safeNow();
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    window.scrollTo(0, startY + delta * ease(progress));
    if (progress < 1) requestAnimationFrame(frame);
  }

  window.scrollTo(0, startY + Math.sign(delta) * Math.min(Math.abs(delta), 48));
  requestAnimationFrame(frame);
}

function Reveal({ children, delay = 0, className = '', style }) {
  const ref = useRef(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`} style={{ ...style, transitionDelay: delay + 'ms' }}>
      {children}
    </div>);

}

function Snowfall({ count = 50, intensity = 1, scrollY = 0 }) {
  const flakes = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 2 + Math.random() * 4,
    delay: Math.random() * -20,
    dur: 14 + Math.random() * 18,
    drift: (Math.random() - 0.5) * 50,
    op: 0.4 + Math.random() * 0.5
  })), [count]);
  const viewport = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const coldFade = clamp((scrollY - viewport * 1.08) / (viewport * 1.25), 0, 1);
  return (
    <div className="snowfall" aria-hidden="true" style={{ opacity: coldFade }}>
      {flakes.map((f) =>
      <span key={f.id} style={{
        left: f.left + '%', width: f.size, height: f.size,
        opacity: f.op * intensity,
        animationDelay: f.delay + 's', animationDuration: f.dur + 's',
        '--drift': f.drift + 'px'
      }} />
      )}
    </div>);

}

function PenguinCard({ size = 380, float = true, style = {} }) {
  return (
    <div className={`pengcard ${float ? 'float' : ''}`} style={{ width: size, ...style }}>
      <img src="assets/pudgy-penguin-cutout.png" alt="Gerry Stephen's Pudgy Penguin" />
    </div>);

}

// ---------- Topbar ----------
function Topbar() {
  return (
    <header className="topbar" data-screen-label="topbar">
      <div className="brand">
        <div className="brand-mark">
          <img src="assets/pudgy-penguin-cutout.png" alt="" />
        </div>
        <div className="brand-text">gerrystephen<span>.com</span></div>
      </div>
      <nav className="topnav">
        <a href="#journey">Journey</a>
        <a href="#nfts">Communities</a>
        <a href="#inkfinity">Inkfinity</a>
        <a href="#monerge">Biome</a>
        <a href="#now">Now</a>
        <a href="#bluestar">Hospitality</a>
        <a href="https://sappy.gerrystephen.com" target="_blank" rel="noopener">Sappy</a>
        <a href="#contact">Contact</a>
      </nav>
      <div className="top-actions">
        <a href="https://x.com/gerrydoteth" target="_blank" rel="noopener" className="top-cta icon" aria-label="Gerry Stephen on X">
          <span aria-hidden="true">𝕏</span>
          <strong>X</strong>
        </a>
        <a href="https://opensea.io/profile/gerrystephen" target="_blank" rel="noopener" className="top-cta">OpenSea</a>
      </div>
    </header>);

}

// ---------- Igloo SVG ----------
function Igloo({ width = 620 }) {
  return (
    <svg viewBox="0 0 600 360" width={width} aria-hidden="true">
      <defs>
        <linearGradient id="igDome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#E6F0F7" />
          <stop offset="100%" stopColor="#BFD9E8" />
        </linearGradient>
        <radialGradient id="igEntry" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#E9C9A1" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#7AA8C2" />
          <stop offset="100%" stopColor="#0B2230" />
        </radialGradient>
      </defs>
      <ellipse cx="300" cy="335" rx="240" ry="14" fill="#7AA8C2" opacity="0.35" />
      <path d="M70 320 Q 70 110, 300 100 Q 530 110, 530 320 Z" fill="url(#igDome)" stroke="#7AA8C2" strokeWidth="2" />
      {["M90 290 Q 300 270, 510 290", "M85 250 Q 300 225, 515 250", "M95 210 Q 300 185, 505 210", "M115 170 Q 300 148, 485 170", "M150 135 Q 300 118, 450 135"].map((d, i) =>
      <path key={i} d={d} fill="none" stroke="#BFD9E8" strokeWidth="1.5" opacity="0.85" />
      )}
      <path d="M220 320 Q 220 240, 300 235 Q 380 240, 380 320 Z" fill="#E6F0F7" stroke="#7AA8C2" strokeWidth="2" />
      <ellipse cx="300" cy="295" rx="55" ry="42" fill="url(#igEntry)" />
    </svg>);

}

// ---------- Hero (cinematic parallax, sticky) ----------
function Hero({ y, mouse, intensity, lite = false }) {
  const k = (intensity / 100) * (lite ? 0.42 : 1);
  const ref = useRef(null);
  const viewport = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const heroTop = ref.current?.offsetTop || 0;
  const heroLength = ref.current ? Math.max(1, ref.current.offsetHeight - viewport) : Math.max(1, viewport * 1.3);
  const progress = clamp((y - heroTop) / heroLength, 0, 1);

  const px = (mouse.x - 0.5) * 30 * k;
  const py = (mouse.y - 0.5) * 20 * k;
  const scrollMotion = lite ? 0 : 1;
  const skyY = progress * -120 * k;
  const farY = progress * 60 * k;
  const midY = progress * 160 * k;
  const nearY = progress * 280 * k;
  const groundY = progress * 380 * k;
  const iglooScale = 1 + progress * 1.8 * k;
  const iglooY = progress * 320 * k;
  const penguinScale = 1 + progress * 0.7 * k;
  const penguinY = progress * -200 * k;
  const copyOpacity = Math.max(0, 1 - progress * 2.4);
  const copyY = progress * -90;
  const titleOp = progress > 0.55 ? Math.min(1, (progress - 0.55) * 4) : 0;
  const rideParallax = (e) => {
    e.preventDefault();
    const target = ref.current
      ? ref.current.offsetTop + ref.current.offsetHeight - window.innerHeight + 4
      : window.innerHeight * 1.9;
    slowScrollTo(target, 2400);
  };

  return (
    <section className="hero" id="top" ref={ref}>
      <div className="hero-pin">
        <div className="cold-wash" style={{ opacity: Math.min(0.82, progress * 1.25) }} />
        <div className="layer sky" style={{ transform: `translate3d(0, ${skyY}px, 0)` }}>
          <div className="aurora" />
          <div className="sun" style={{ transform: `translate3d(${px * 0.3}px, ${progress * -40}px, 0)` }} />
        </div>
        <div className="cloud c1" style={{ transform: `translate3d(${y * 0.25 * k * scrollMotion - 60 + px * 0.4}px, ${progress * -20}px, 0)` }} />
        <div className="cloud c2" style={{ transform: `translate3d(${y * -0.18 * k * scrollMotion + 60 - px * 0.4}px, ${progress * -10}px, 0)` }} />
        <div className="cloud c3" style={{ transform: `translate3d(${y * 0.12 * k * scrollMotion + px * 0.2}px, ${progress * -30}px, 0)` }} />

        <svg className="layer mountains far" viewBox="0 0 1600 500" preserveAspectRatio="none"
        style={{ transform: `translate3d(${-progress * 80 * k + px * 0.6}px, ${farY + py * 0.3}px, 0)` }}>
          <path d="M0 500 L0 380 Q 80 360 160 365 Q 240 350 340 360 Q 420 380 480 370 L 600 380 Q 700 350 820 340 Q 940 360 1040 355 Q 1180 330 1300 345 Q 1420 355 1520 360 L 1600 370 L 1600 500 Z" fill="#A6CFC8" />
        </svg>
        <svg className="layer mountains mid" viewBox="0 0 1600 500" preserveAspectRatio="none"
        style={{ transform: `translate3d(${progress * 100 * k + px * 1.2}px, ${midY + py * 0.6}px, 0)` }}>
          <path d="M0 500 L0 410 Q 100 360 220 370 Q 320 320 420 360 Q 540 310 660 350 Q 760 320 880 360 Q 1000 320 1120 360 Q 1260 320 1380 365 Q 1500 340 1600 360 L 1600 500 Z" fill="#7AB8AE" />
          <path d="M0 500 L0 430 Q 100 390 220 400 Q 340 360 460 395 Q 580 360 700 395 Q 820 360 940 400 Q 1080 360 1200 400 Q 1340 360 1480 400 Q 1560 380 1600 395 L 1600 500 Z" fill="rgba(255,255,255,0.25)" />
        </svg>
        <svg className="layer mountains near" viewBox="0 0 1600 500" preserveAspectRatio="none"
        style={{ transform: `translate3d(${px * 1.8}px, ${nearY + py}px, 0)` }}>
          <path d="M0 500 L0 440 Q 120 410 260 425 Q 400 395 540 425 Q 680 400 820 425 Q 980 395 1120 430 Q 1260 400 1400 425 Q 1520 410 1600 425 L 1600 500 Z" fill="#3F9E94" />
        </svg>

        {/* Sea behind ground */}
        <div className="layer sea" style={{ transform: `translate3d(0, ${nearY * 0.6 + py * 0.8}px, 0)` }}>
          <div className="sea-shimmer" />
          <div className="wave w1" style={{ transform: `translateX(${(progress * 60 + y * 0.05 * scrollMotion) * -1}px)` }} />
          <div className="wave w2" style={{ transform: `translateX(${progress * 80 + y * 0.04 * scrollMotion}px)` }} />
          <div className="wave w3" style={{ transform: `translateX(${progress * 120 * -1}px)` }} />
        </div>

        {/* Palm trees layer */}
        <svg className="layer palms" viewBox="0 0 1600 360" preserveAspectRatio="none"
        style={{ transform: `translate3d(${px * 1.4}px, ${nearY * 0.9 + py * 1.1}px, 0)` }}>
          {/* Left palm */}
          <g transform="translate(120,360)">
            <path d="M0 0 Q -10 -120 8 -240" stroke="#4A2E1A" strokeWidth="10" fill="none" strokeLinecap="round" />
            <g transform="translate(8,-240)" fill="#2F6B4F">
              <path d="M0 0 Q -40 -30 -110 -10 Q -70 -22 -2 -2 Z" />
              <path d="M0 0 Q 30 -50 110 -50 Q 50 -40 2 -2 Z" />
              <path d="M0 0 Q -30 -60 -90 -90 Q -50 -50 -2 -4 Z" />
              <path d="M0 0 Q 40 -40 130 -10 Q 70 -22 2 -2 Z" />
              <path d="M0 0 Q 10 -70 50 -130 Q 25 -60 2 -4 Z" />
              <circle cx="-6" cy="6" r="3" fill="#7A4A1F" />
              <circle cx="4" cy="10" r="3" fill="#7A4A1F" />
            </g>
          </g>
          {/* Right palm */}
          <g transform="translate(1420,360)">
            <path d="M0 0 Q 14 -130 -6 -260" stroke="#4A2E1A" strokeWidth="11" fill="none" strokeLinecap="round" />
            <g transform="translate(-6,-260)" fill="#2F6B4F">
              <path d="M0 0 Q 40 -30 120 -10 Q 70 -22 2 -2 Z" />
              <path d="M0 0 Q -30 -55 -120 -50 Q -55 -42 -2 -2 Z" />
              <path d="M0 0 Q 30 -65 100 -100 Q 50 -55 2 -4 Z" />
              <path d="M0 0 Q -45 -45 -140 -15 Q -75 -25 -2 -2 Z" />
              <path d="M0 0 Q -10 -75 -60 -140 Q -28 -65 -2 -4 Z" />
            </g>
          </g>
          {/* Far smaller palm */}
          <g transform="translate(280,360) scale(0.55)" opacity="0.85">
            <path d="M0 0 Q -8 -110 6 -220" stroke="#4A2E1A" strokeWidth="10" fill="none" strokeLinecap="round" />
            <g transform="translate(6,-220)" fill="#3B7A57">
              <path d="M0 0 Q -35 -25 -100 -8 Q -65 -20 -2 -2 Z" />
              <path d="M0 0 Q 30 -45 100 -40 Q 50 -35 2 -2 Z" />
              <path d="M0 0 Q -25 -55 -80 -80 Q -45 -45 -2 -4 Z" />
              <path d="M0 0 Q 35 -35 115 -10 Q 60 -20 2 -2 Z" />
            </g>
          </g>
        </svg>

        <div className="layer ground" style={{ transform: `translate3d(0, ${groundY + py * 1.4}px, 0)` }}>
          <div className="ground-shine" />
        </div>

        <div className="scene" style={{ transform: `translate3d(${px * 2}px, ${iglooY + py * 1.6}px, 0)` }}>
          <div className="igloo-wrap" style={{ transform: `scale(${iglooScale})` }}>
            <Igloo width={620} />
          </div>
          <div className="penguin-wrap" style={{ transform: `translate(-50%, ${penguinY}px) scale(${penguinScale})` }}>
            <PenguinCard size={260} float={false} />
          </div>
        </div>

        <div className="hero-copy" style={{ opacity: copyOpacity, transform: `translate3d(0, ${copyY}px, 0)` }}>
          <h1 className="display">Welcome to<br />Gerry's<br /><em>iglu.</em></h1>
          <p className="lede">A one-page home base for the journey: business, Web3, family legacy, and the Pudgy that made the cold internet feel warm.</p>
          <div className="hero-values" aria-label="Personal values">
            <span>God first</span>
            <span>Husband</span>
            <span>Father</span>
            <span>Builder</span>
          </div>
          <div className="hero-cta">
            <a className="btn primary" href="#journey" onClick={rideParallax}>Scroll to discover →</a>
            <a className="btn ghost" href="#nfts">My community ecosystems</a>
          </div>
        </div>

        <div className="terminal-copy terminal-left" style={{ opacity: copyOpacity }}>
          <strong>WELCOME TO GERRY'S IGLU</strong>
          <span>Copyright © 2026</span>
          <span>Business / Web3 / Legacy</span>
        </div>

        <div className="terminal-copy terminal-right" style={{ opacity: copyOpacity }}>
          <strong>///// Manifesto</strong>
          <span>Build useful things at the intersection of community, hospitality, AI, and crypto.</span>
        </div>

        <div className="father-note" style={{ opacity: copyOpacity }}>
          <span>Strength before beauty</span>
          <small>ericgoodguy</small>
        </div>

        <div className="hero-bigtitle" style={{ opacity: titleOp, transform: `translate3d(0, ${(1 - titleOp) * 60}px, 0) scale(${0.96 + titleOp * 0.04})` }}>
          <div className="bt-kicker">welcome to</div>
          <div className="bt-title">THE IGLU</div>
          <div className="bt-sub">a small home on the internet · gerrystephen.eth</div>
          <a className="abstract-veteran-card" href="https://abscan.org/address/0x382556A543aAd855C07678E7F8e820d0d90429BB" target="_blank" rel="noopener" aria-label="Abstract Gold II veteran wallet">
            <img src="assets/abstract-gold-tier-card.png?v=gold-tier-ii-reference-notch" alt="Abstract wallet Gold Tier II" />
          </a>
        </div>

        <div className="scroll-hint"><span>scroll</span><div className="scroll-line" /></div>
      </div>
    </section>);

}

// ---------- Marquee ----------
function Marquee({ items }) {
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {[...items, ...items].map((it, i) =>
        <span key={i} className="marquee-item">
            <span className="m-dot" /> {it}
          </span>
        )}
      </div>
    </div>);

}

// ---------- Section header ----------
function Chapter({ num, kicker, title }) {
  return (
    <div className="chapter">
      <div className="chapter-meta">
        <span className="chapter-num">{num}</span>
        <span className="chapter-kicker">{kicker}</span>
      </div>
      <h2 className="chapter-title">{title}</h2>
    </div>);

}

// ---------- Timeline ----------
const TIMELINE = [
{ year: '2021', tag: 'First NFT purchase · Sappy Seals', body: 'The rabbit hole opened through community, identity, and the feeling that ownership could become culture.' },
{ year: '2021', tag: 'Permanent work', body: 'ericgoodguy signed canvases, and gerrydoteth curated. Now the Inkfinity Canvas craft lives on-chain.' },
{ year: '2022', tag: 'The Guy standard', body: 'Fifteen years beside my dad taught me how real work gets scoped, built, and carried forward. After his passing, his legacy now lives on forever.' },
{ year: '2022', tag: 'Lil Pudgy chapter', body: 'I had a Lil Pudgy early, sold it, and kept circling the ecosystem from the outside.' },
{ year: '2023', tag: 'Community & tools', body: 'I kept showing up for Sappy Seals with constant memes across X, Instagram, TikTok, and YouTube Shorts while supporting the whole ecosystem. I still do.' },
{ year: '2024', tag: 'IRL bridge', body: 'Fifteen years building beside my dad turned into a new chapter: hospitality, food, local operations, and community.' },
{ year: '2025', tag: 'AI expansion', body: 'The huge uptick in AI capability changed what I could build: operations, memes, trades, and Great Terriers, a collection I started in 2022.' },
{ year: '2026', tag: 'Actual Pudgy era', body: 'This is when I became an actual Pudgy Penguin holder. The iglu finally had its mascot.' }];


function Timeline({ y = 0, intensity = 60 }) {
  const sectionRef = useRef(null);
  const railRef = useRef(null);
  const [railMetrics, setRailMetrics] = useState({ fullTravel: 0, compactTravel: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const depth = intensity / 100;
  useEffect(() => {
    let frame = 0;
    let settleTimer = 0;
    const updateTravel = () => {
      const rail = railRef.current;
      if (!rail) return;
      const viewportWidth = rail.parentElement?.getBoundingClientRect().width || Math.min(window.innerWidth - 48, 1120);
      setViewportSize({
        width: window.innerWidth || viewportWidth,
        height: window.innerHeight || 800
      });
      const fullTravel = Math.max(0, rail.scrollWidth - viewportWidth);
      const lastItem = rail.querySelector('.rail-item:last-child');
      const compactTravel = lastItem
        ? Math.max(0, Math.min(fullTravel, lastItem.offsetLeft + lastItem.offsetWidth - viewportWidth))
        : fullTravel;
      setRailMetrics({ fullTravel, compactTravel });
    };
    frame = requestAnimationFrame(updateTravel);
    settleTimer = window.setTimeout(updateTravel, 350);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateTravel) : null;
    if (observer && railRef.current) {
      observer.observe(railRef.current);
      if (railRef.current.parentElement) observer.observe(railRef.current.parentElement);
    }
    window.addEventListener('resize', updateTravel);
    window.addEventListener('orientationchange', updateTravel);
    window.addEventListener('load', updateTravel);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      observer?.disconnect();
      window.removeEventListener('resize', updateTravel);
      window.removeEventListener('orientationchange', updateTravel);
      window.removeEventListener('load', updateTravel);
    };
  }, []);
  const section = sectionRef.current;
  const viewport = viewportSize.height || (typeof window !== 'undefined' ? window.innerHeight || 800 : 800);
  const viewportWidth = viewportSize.width || (typeof window !== 'undefined' ? window.innerWidth || 390 : 390);
  const isCompactTimeline = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px), (max-height: 560px)').matches;
  const mobileCardWidth = Math.min(viewportWidth * 0.74, 286);
  const mobileRailWidth = TIMELINE.length * mobileCardWidth + Math.max(0, TIMELINE.length - 1) * 16;
  const mobileViewportWidth = Math.max(0, viewportWidth - 40);
  const mobileFallbackTravel = Math.max(0, mobileRailWidth - mobileViewportWidth);
  const measuredTravel = isCompactTimeline ? railMetrics.compactTravel : railMetrics.fullTravel;
  const effectiveRailTravel = measuredTravel || (isCompactTimeline ? mobileFallbackTravel : 0);
  const startOffset = isCompactTimeline ? 0 : viewport * 0.08;
  const readHold = isCompactTimeline ? 0 : 0.08;
  const releaseHold = isCompactTimeline ? 0 : 0.04;
  const scrollDistance = isCompactTimeline
    ? Math.max(viewport * 1.18, Math.min(viewport * 1.58, effectiveRailTravel * 0.72))
    : Math.max(viewport * 1.8, (effectiveRailTravel * 1.08) / (1 - readHold - releaseHold));
  const timelineHeight = viewport + scrollDistance;
  const sectionTop = section ? section.getBoundingClientRect().top : 0;
  const sectionPageTop = section ? sectionTop + y : 0;
  const pinProgress = section
    ? isCompactTimeline
      ? clamp((y - sectionPageTop) / scrollDistance, 0, 1)
      : clamp((startOffset - sectionTop) / scrollDistance, 0, 1)
    : 0;
  const rawProgress = clamp((pinProgress - readHold) / (1 - readHold - releaseHold), 0, 1);
  const easedProgress = isCompactTimeline ? rawProgress : rawProgress * rawProgress * (3 - 2 * rawProgress);
  return (
    <section ref={sectionRef} className="timeline" id="journey" style={{ '--scroll': y, '--timeline-depth': depth, '--timeline-progress': easedProgress, '--timeline-height': `${timelineHeight}px` }}>
      <div className="timeline-sticky">
        <Chapter num="01" kicker="On-chain" title="The road from collector to operator." />
        <div className="rail-viewport">
          <div
            ref={railRef}
            className="rail"
            style={{ transform: `translate3d(${-effectiveRailTravel * easedProgress}px, 0, 0)` }}>
            <div className="rail-line" />
            {TIMELINE.map((t, i) =>
            <Reveal key={`${t.year}-${t.tag}`} delay={i * 60} className="rail-item" style={{ '--rail-i': i }}>
                <div className="rail-pin"><div /></div>
                <div className="rail-card">
                  <div className="rc-year">{t.year}</div>
                  <div className="rc-tag">{t.tag}</div>
                  <p>{t.body}</p>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </section>);

}

// ---------- Projects ----------
const PROJECTS = [
{ title: 'Inkfinity Canvas', kind: 'Signed work · 2021', note: 'ericgoodguy signed canvases, preserved as a permanent collection of craft and authorship.', glyph: 'EG', href: 'https://opensea.io/collection/inkfinity-canvas' },
{ title: 'Sappy Seals', kind: 'First NFT purchase', note: 'The community that pulled the first thread and made Web3 feel human.', glyph: 'SS' },
{ title: 'Pudgy Penguins', kind: 'Holder', note: 'The flat-cap penguin energy that shaped the iglu visual language.', glyph: 'PP' },
{ title: 'gerrystephen.eth', kind: 'Identity', note: 'One name for collections, experiments, and public reputation.', glyph: 'Ξ' },
{ title: 'OpenSea', kind: 'Collection', note: 'The public gallery for penguins, seals, Inkfinity, and ephemera.', glyph: 'OS', href: 'https://opensea.io/profile/gerrystephen' }];


function Projects() {
  return (
    <section className="projects" id="projects">
      <Chapter num="02" kicker="Web3 identity" title="A collector profile with builder fingerprints." />
      <div className="proj-grid">
        {PROJECTS.map((p, i) => {
          const Tag = p.href ? 'a' : 'div';
          const linkProps = p.href ? { href: p.href, target: '_blank', rel: 'noopener' } : {};
          return (
            <Reveal key={p.title} delay={i * 40}>
              <Tag className="proj-card" {...linkProps}>
                <div className="proj-glyph">{p.glyph}</div>
                <div className="proj-kind">{p.kind}</div>
                <div className="proj-title">{p.title}</div>
                <div className="proj-note">{p.note}</div>
                <div className="proj-arrow">→</div>
              </Tag>
            </Reveal>);
        })}
      </div>
    </section>);

}

// ---------- NFT Carousel ----------
const NFT_WALLETS = [
'0xCf3b8981AbAa56a8E41117b0c721C05F608400A7',
'0x382556a543aad855c07678e7f8e820d0d90429bb',
'0xc3ce1eb539c1cc031ecd7b95e8c00768bf324403'];

const LIVE_API_ORIGIN = 'https://gerrystephen.com';

function shouldUseLiveApiFallback() {
  return window.location.protocol === 'file:'
    || ['127.0.0.1', 'localhost'].includes(window.location.hostname);
}

async function fetchAppJson(path, signal) {
  const versionedPath = `${path}${path.includes('?') ? '&' : '?'}v=ecosystems-app-93`;
  const localResponse = await fetch(versionedPath, { signal, cache: 'no-store' }).catch(() => undefined);
  if (localResponse?.ok && localResponse.headers.get('content-type')?.includes('application/json')) {
    return localResponse.json();
  }

  if (!shouldUseLiveApiFallback()) return null;

  const liveResponse = await fetch(`${LIVE_API_ORIGIN}${versionedPath}`, { signal, cache: 'no-store' }).catch(() => undefined);
  return liveResponse?.ok ? liveResponse.json() : null;
}

const NFT_ECOSYSTEMS = [
{
  id: 'sappy',
  label: 'Sappy Seals ecosystem',
  note: 'My Sappy-side collection: $PIXL, Sappy Faithful Key, Sappy Seals, Omnia Pets, Omnia items, Pixseals, and a Bitcoin ordinal.',
    keywords: ['sappy', 'pixl', 'omnia', 'pets', 'pixseals', 'sappy key', 'pixlverse items'],
    fallback: [
  { name: 'Sappy Seals ecosystem', collection: 'Owned-token images only', glyph: 'SS', tokenId: 'pending', contract: 'pending' },
  { name: '$PIXL', collection: 'Omnia ecosystem', glyph: '$PIXL', tokenId: 'asset', amount: 'syncing', chain: 'Ethereum' },
  { name: 'Pixseal #525', collection: 'Pixseals by Sappy Seals', image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/525.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/525', tokenId: '525', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
  { name: 'Pixseal #3600', collection: 'Pixseals by Sappy Seals', image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/3600.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/3600', tokenId: '3600', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
  { name: 'Pixseal #9690', collection: 'Pixseals by Sappy Seals', image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9690.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/9690', tokenId: '9690', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
  { name: 'Pixseal #9815', collection: 'Pixseals by Sappy Seals', image: 'https://dweb.link/ipfs/QmTf7L21LjxdALt1bpLdfB9bm9z8R7Gi76pPtYEiw9o9j4/9815.png', href: 'https://opensea.io/item/polygon/0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b/9815', tokenId: '9815', contract: '0x9ae64ca2e16e6f14dad30f9e440f870a78fc323b' },
  { name: 'Digital Artifact #93', collection: 'Digital Artifact', image: 'assets/digital-artifact-93.jpg', href: 'https://opensea.io/item/ethereum/0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a/93', tokenId: '93', contract: '0xb1cdf2bfab043ea1d81d0a73b3b849efaac1d31a' },
  { name: 'Omnia items', collection: 'Pixlverse item metadata accepted', glyph: 'OM', tokenId: 'pending', contract: 'pending' },
  { name: 'Pixseals and Sappy Keys', collection: 'Owned-token images only', glyph: 'KEY', tokenId: 'pending', contract: 'pending' }]
},
{
  id: 'pudgy',
  label: 'Pudgy Penguins ecosystem',
  note: 'Pudgy Penguin, Lil Pudgy, Pudgy Rods, and $PENGU.',
  keywords: ['pudgy', 'penguin', 'lil pudgy', 'rod', 'pengu'],
  fallback: [
  { name: 'Pudgy Penguin', collection: 'Pudgy Penguins ecosystem', image: 'assets/pudgy-penguin.webp', tokenId: 'pending', contract: 'pending' },
  { name: '$PENGU', collection: 'Pudgy Penguins ecosystem', glyph: '$PENGU', tokenId: 'asset', amount: 'syncing', chain: 'Abstract' },
  { name: 'Lil Pudgy and Pudgy Rods', collection: 'Owned-token images only', glyph: 'PP', tokenId: 'pending', contract: 'pending' }]
},
{
  id: 'inkfinity',
  label: 'Inkfinity Canvas',
  note: 'ericgoodguy signed canvases and the permanent collection around them.',
  keywords: ['inkfinity', 'nftvisionary', 'nuttyprofessor', 'thunderofthoughts', 'e. guy'],
  fallback: [
  { name: 'NFTVisionary', collection: 'Inkfinity Canvas', image: 'assets/inkfinity-visionary.png', href: 'https://opensea.io/assets/ethereum/0x4de49a57235cc0d4d22baad106a4dc302c8d935e/1', tokenId: '1', contract: '0x4de49a57235cc0d4d22baad106a4dc302c8d935e' },
  { name: 'NuttyProfessor', collection: 'Inkfinity Canvas', image: 'assets/inkfinity-professor.png', href: 'https://opensea.io/assets/ethereum/0x4de49a57235cc0d4d22baad106a4dc302c8d935e/2', tokenId: '2', contract: '0x4de49a57235cc0d4d22baad106a4dc302c8d935e' },
  { name: 'ThunderOfThoughts', collection: 'Inkfinity Canvas', image: 'assets/inkfinity-thoughts.png', href: 'https://opensea.io/assets/ethereum/0x4de49a57235cc0d4d22baad106a4dc302c8d935e/3', tokenId: '3', contract: '0x4de49a57235cc0d4d22baad106a4dc302c8d935e' }]
},
{
  id: 'great-terriers',
  label: 'Great Terriers',
  note: 'A collection started in 2022, coming into the next build cycle.',
  keywords: ['great terriers'],
  fallback: [
  { name: 'Great Terriers', collection: 'Coming soon', image: 'assets/great-terriers-coming-soon.png', tokenId: 'soon', contract: 'soon', comingSoon: true }]
}].filter((ecosystem) => !['inkfinity', 'great-terriers'].includes(ecosystem.id));

function ecosystemForNft(nft) {
  if (nft?.ecosystem) return NFT_ECOSYSTEMS.find((ecosystem) => ecosystem.id === nft.ecosystem);
  const haystack = `${nft?.collection || ''} ${nft?.name || ''}`.toLowerCase();
  return NFT_ECOSYSTEMS.find((ecosystem) =>
    ecosystem.id === 'inkfinity' && ecosystem.keywords.some((keyword) => haystack.includes(keyword))
  );
}

function numericTokenId(nft) {
  const value = Number.parseInt(String(nft?.tokenId || '').replace(/\D/g, ''), 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function pudgyAssetRank(nft) {
  const haystack = `${nft?.collection || ''} ${nft?.name || ''}`.toLowerCase();
  if (nft?.tokenId === 'asset' && haystack.includes('pengu')) return 0;
  if (haystack.includes('pudgy penguin')) return 1;
  if (haystack.includes('lil pudgy')) return 2;
  if (haystack.includes('rod') || haystack.includes('present')) return 3;
  return 4;
}

function sappyAssetRank(nft) {
  const collection = `${nft?.collection || ''}`.toLowerCase();
  const name = `${nft?.name || ''}`.toLowerCase();
  const haystack = `${collection} ${name}`;
  if (nft?.tokenId === 'asset' && haystack.includes('pixl')) return 0;
  if (haystack.includes('faithful key') || haystack.includes('sappy soulbounds')) return 1;
  if (collection.includes('stakedseals') || /^sappy seal\s*#/.test(name)) return 2;
  if (haystack.includes('omnia pet')) return 3;
  if (haystack.includes('omnia item') || haystack.includes('pixlverse')) return 4;
  if (haystack.includes('pixseal')) return 5;
  if (haystack.includes('ordinal') || haystack.includes('bitcoin')) return 6;
  return 6;
}

function orderEcosystemItems(ecosystem, items) {
  if (ecosystem.id === 'pudgy') {
    return [...items].sort((a, b) =>
      (pudgyAssetRank(a) - pudgyAssetRank(b)) || (numericTokenId(a) - numericTokenId(b))
    );
  }
  if (ecosystem.id !== 'sappy') return items;
  return [...items].sort((a, b) =>
    (sappyAssetRank(a) - sappyAssetRank(b)) || (numericTokenId(a) - numericTokenId(b))
  );
}

function nftIdentity(nft) {
  const contract = String(nft?.contract || nft?.collection || 'unknown').toLowerCase();
  const tokenId = String(nft?.tokenId || nft?.name || '').toLowerCase();
  if (nft?.tokenId === 'asset') return `asset:${String(nft.name || nft.symbol || nft.glyph || '').toLowerCase()}`;
  return `${contract}:${tokenId}`;
}

function mergeEcosystemItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = nftIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildEcosystemSlides(items) {
  const slides = NFT_ECOSYSTEMS.map((ecosystem) => {
    const ecosystemItems = items.filter((nft) => ecosystemForNft(nft)?.id === ecosystem.id);
    return {
      ...ecosystem,
      items: orderEcosystemItems(ecosystem, ecosystemItems.length ? ecosystemItems : ecosystem.fallback)
    };
  });
  return slides;
}

function normalizeNft(item, wallet) {
  const token = item?.token || item;
  const collection = token?.collection || {};
  const contract = token?.contract;
  const tokenId = token?.tokenId || token?.token_id;
  return {
    name: token?.name || `${collection?.name || 'NFT'} #${tokenId || ''}`.trim(),
    collection: collection?.name || token?.collectionName || 'Collected NFT',
    image: token?.imageSmall || token?.image || token?.imageUrl || token?.metadata?.image,
    href: contract && tokenId ? `https://opensea.io/assets/ethereum/${contract}/${tokenId}` : undefined,
    contract,
    tokenId,
    wallet: wallet.slice(0, 6) + '...' + wallet.slice(-4)
  };
}

function NftArt({ nft }) {
  const [failed, setFailed] = useState(false);
  if (nft.image && !failed) {
    return <img src={nft.image} alt={nft.name} loading="lazy" onError={() => setFailed(true)} />;
  }
  return <div className="nft-glyph">{nft.glyph || nft.name?.slice(0, 2) || 'NFT'}</div>;
}

function NftCarousel() {
  const [groups, setGroups] = useState(() => buildEcosystemSlides([]));
  const [source, setSource] = useState('curated');
  const [index, setIndex] = useState(0);
  const [assetData, setAssetData] = useState([]);
  const [paused, setPaused] = useState(false);
  const [trackPaused, setTrackPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isMobileCarousel, setIsMobileCarousel] = useState(() => window.matchMedia?.('(max-width: 700px)').matches || false);
  const trackRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadNfts() {
      try {
        const apiData = await fetchAppJson('/api/nfts', controller.signal);
        if (apiData) {
          const apiItems = (apiData?.nfts || []).filter((nft) => nft?.image || nft?.animationUrl || nft?.tokenId === 'asset');
          const pixlTotal = Number(apiData?.pixlBalance || 0);
          if (pixlTotal > 0) {
            apiItems.unshift({
              ecosystem: 'sappy',
              name: '$PIXL',
              collection: 'Omnia ecosystem',
              glyph: '$PIXL',
              tokenId: 'asset',
              amount: pixlTotal.toLocaleString('en-US', { maximumFractionDigits: 2 }),
              chain: 'Ethereum',
              contract: '0x427A03fb96D9A94a6727fBCfbBA143444090dD64',
              href: 'https://etherscan.io/token/0x427A03fb96D9A94a6727fBCfbBA143444090dD64',
            });
          }
          if (apiItems.length) {
            setGroups(buildEcosystemSlides(mergeEcosystemItems(apiItems)));
            setSource('wallet');
            setIndex(0);
            return;
          }
        }
        const requests = NFT_WALLETS.map((wallet) =>
          fetch(`https://api.reservoir.tools/users/${wallet}/tokens/v10?limit=12&sortBy=floorAskPrice`, {
            signal: controller.signal,
            headers: { accept: 'application/json' }
          })
          .then((res) => res.ok ? res.json() : Promise.reject(new Error('NFT API unavailable')))
          .then((data) => (data?.tokens || []).map((item) => normalizeNft(item, wallet)))
        );
        const loaded = (await Promise.allSettled(requests))
        .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
        .filter((nft) => nft.name && nft.image)
        .filter((nft) => ecosystemForNft(nft))
        .slice(0, 24);
        if (loaded.length) {
          setGroups(buildEcosystemSlides(loaded));
          setSource('wallet');
          setIndex(0);
        }
      } catch (e) {
        setGroups(buildEcosystemSlides([]));
      }
    }
    loadNfts();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 700px)');
    if (!query) return undefined;
    const sync = () => setIsMobileCarousel(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAppJson('/api/ecosystem-assets', controller.signal)
      .then((data) => setAssetData(data?.assets || []))
      .catch(() => setAssetData([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (groups.length <= 1 || paused || expanded) return undefined;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % groups.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [groups.length, paused, expanded]);

  const next = () => {
    setExpanded(false);
    setPaused(false);
    setTrackPaused(false);
    setIndex((i) => (i + 1) % groups.length);
  };
  const prev = () => {
    setExpanded(false);
    setPaused(false);
    setTrackPaused(false);
    setIndex((i) => (i - 1 + groups.length) % groups.length);
  };
  const groupsWithAssets = groups.map((group) => ({
    ...group,
    items: orderEcosystemItems(group, mergeEcosystemItems([...(group.items || []), ...assetData.filter((asset) => asset.ecosystem === group.id)]))
  }));
  const activeGroup = groupsWithAssets[index] || groupsWithAssets[0];
  const visible = activeGroup?.items || [];
  const shouldLoop = !expanded && visible.length > 1;
  const smartItems = shouldLoop ? [...visible, ...visible].slice(0, Math.max(4, visible.length * 2)) : visible;

  useEffect(() => {
    const track = trackRef.current;
    if (!shouldLoop || trackPaused || !track) return undefined;
    let frame = 0;
    let last = 0;
    const step = (now) => {
      if (!last) last = now;
      const delta = now - last;
      last = now;
      track.scrollLeft += 1.36 * (delta / 16.67);
      const midpoint = track.scrollWidth / 2;
      if (midpoint > 0 && track.scrollLeft >= midpoint) track.scrollLeft -= midpoint;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [shouldLoop, trackPaused, activeGroup?.id, visible.length]);

  return (
    <section className="nft-showcase" id="nfts">
      <div className="nft-head">
        <Chapter num="02" kicker="My community ecosystems" title="My forever communities - Pudgy & Sappy." />
      </div>
      <p className="lede nft-lede">
        {source === 'wallet'
          ? `A curated view of my owned collection: ${activeGroup?.note} Cards open the matching asset, collection, or explorer page.`
          : `A curated view of my owned collection: ${activeGroup?.note} Waiting on exact metadata for this ecosystem.`}
      </p>
      <div
        className={`ecosystem-stage ${activeGroup?.id || ''} ${expanded ? 'is-expanded' : ''}`}
        onFocusCapture={() => setPaused(true)}>
        <div className="nft-actions stage-nav" aria-label="NFT carousel controls">
          <button type="button" className="icon-btn" aria-label="Previous NFT" onClick={prev}>‹</button>
          <button type="button" className="icon-btn" aria-label="Next NFT" onClick={next}>›</button>
        </div>
        <div className="ecosystem-tabs" aria-label="NFT ecosystem carousel position">
          {groupsWithAssets.map((group, i) =>
          <button key={group.id} type="button" className={i === index ? 'active' : ''} onClick={() => {
            setIndex(i);
            setPaused(false);
            setTrackPaused(false);
            setExpanded(false);
          }}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <strong>{group.label}</strong>
              <i aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="ecosystem-focus">
            <span>{activeGroup?.label}</span>
          <div className="ecosystem-status">
            <strong>{visible.length} featured items {paused ? '· paused' : ''}</strong>
            <button type="button" className="mini-link" onClick={() => {
              setExpanded(true);
              setPaused(true);
            }}>View all</button>
          </div>
        </div>
        <div
          ref={trackRef}
          className={`nft-track smart-track ${shouldLoop ? 'is-looped' : ''}`}
          onTouchStart={() => {
            setTrackPaused(true);
          }}
          onTouchEnd={() => {
            setTrackPaused(false);
          }}>
          {smartItems.map((nft, i) =>
          <a key={`${nft.name}-${nft.tokenId}-${i}`} className={`nft-card ${nft.tokenId === 'pending' || nft.tokenId === 'soon' ? 'disabled' : ''} ${nft.tokenId === 'asset' ? 'asset-card' : ''} ${nft.comingSoon ? 'coming-soon-card' : ''}`} href={nft.href || '#nfts'} target="_blank" rel="noopener" style={{ '--i': i }}>
              <div className="nft-art">
                <NftArt nft={nft} />
              </div>
              <div className="nft-meta">
                <span>{nft.collection}</span>
                <strong>{nft.name}</strong>
                <small>
                  {nft.tokenId === 'asset'
                    ? `${nft.amount || 'syncing'} · ${nft.chain}`
                    : nft.tokenId === 'soon'
                      ? 'Coming soon'
                      : nft.tokenId && nft.tokenId !== 'pending'
                        ? `${String(nft.contract).slice(0, 6)}...${String(nft.contract).slice(-4)} / #${nft.tokenId}`
                        : 'Exact token data pending'}
                </small>
              </div>
            </a>
          )}
        </div>
      </div>
      {expanded &&
      <div className="nft-modal" role="dialog" aria-modal="true" aria-label={`${activeGroup?.label} collection preview`}>
          <button type="button" className="nft-modal-scrim" aria-label="Close collection preview" onClick={() => {
            setExpanded(false);
            setPaused(false);
          }} />
          <div className={`nft-modal-panel ${activeGroup?.id || ''}`}>
            <div className="nft-modal-head">
              <div>
                <span>{activeGroup?.label}</span>
                <strong>{visible.length} featured items</strong>
              </div>
              <button type="button" className="icon-btn" aria-label="Close collection preview" onClick={() => {
                setExpanded(false);
                setPaused(false);
              }}>×</button>
            </div>
            <div className="nft-modal-grid">
              {visible.map((nft, i) =>
              <a key={`${nft.name}-${nft.tokenId}-modal-${i}`} className={`nft-card ${nft.tokenId === 'pending' || nft.tokenId === 'soon' ? 'disabled' : ''} ${nft.tokenId === 'asset' ? 'asset-card' : ''} ${nft.comingSoon ? 'coming-soon-card' : ''}`} href={nft.href || '#nfts'} target="_blank" rel="noopener" style={{ '--i': i }}>
                  <div className="nft-art">
                    <NftArt nft={nft} />
                  </div>
                  <div className="nft-meta">
                    <span>{nft.collection}</span>
                    <strong>{nft.name}</strong>
                    <small>
                      {nft.tokenId === 'asset'
                        ? `${nft.amount || 'syncing'} · ${nft.chain}`
                        : nft.tokenId === 'soon'
                          ? 'Coming soon'
                          : nft.tokenId && nft.tokenId !== 'pending'
                            ? `${String(nft.contract).slice(0, 6)}...${String(nft.contract).slice(-4)} / #${nft.tokenId}`
                            : 'Exact token data pending'}
                    </small>
                  </div>
                </a>
              )}
            </div>
          </div>
        </div>
      }
    </section>);
}

// ---------- Monad Game ----------
const MONAD_NETWORK = {
  chainId: '0x8f',
  chainName: 'Monad Mainnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://rpc.monad.xyz'],
  blockExplorerUrls: ['https://monadscan.com']
};
const monadMainnet = defineChain({
  id: 143,
  name: MONAD_NETWORK.chainName,
  nativeCurrency: MONAD_NETWORK.nativeCurrency,
  rpcUrls: {
    default: { http: MONAD_NETWORK.rpcUrls },
    public: { http: MONAD_NETWORK.rpcUrls }
  },
  blockExplorers: {
    default: { name: 'MonadScan', url: MONAD_NETWORK.blockExplorerUrls[0] }
  }
});
const MONERGE_RUNS_CONTRACT = String(import.meta.env.VITE_MONERGE_RUNS_CONTRACT || '').trim();
const MONERGE_RUNS_ABI = [{
  type: 'function',
  name: 'submitRun',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'runId', type: 'bytes32' },
    { name: 'score', type: 'uint256' },
    { name: 'actual', type: 'uint256' },
    { name: 'maxTile', type: 'uint16' },
    { name: 'moves', type: 'uint16' },
    { name: 'difficulty', type: 'uint8' },
    { name: 'profileHash', type: 'bytes32' }
  ],
  outputs: []
}];
const DIFFICULTY_CHAIN_CODES = {
  Chill: 0,
  Classic: 1,
  Hazard: 2,
  Hardest: 3
};
const DYNAMIC_ENV_ID = '794ab3a5-8cf5-43fb-963a-9a81e4a3dae7';
const queryClient = new QueryClient();
const wagmiConfig = createConfig({
  chains: [monadMainnet],
  transports: { [monadMainnet.id]: http(MONAD_NETWORK.rpcUrls[0]) }
});
const MONERGE_APP_PATH = '/monerge';
const METAMASK_APP_LINK = `https://metamask.app.link/dapp/${window.location.host}${MONERGE_APP_PATH}`;

function monergeWalletsFilter(options = []) {
  const list = Array.isArray(options) ? options : [];
  return list.filter((opt) => {
    const supported = opt?.walletConnector?.supportedChains;
    if (Array.isArray(supported) && supported.includes('EVM')) return true;
    const key = String(opt?.key ?? opt?.walletKey ?? '').toLowerCase();
    const group = String(opt?.chainGroup ?? opt?.walletGroup ?? '').toLowerCase();
    return (
      group.includes('evm') ||
      group.includes('eth') ||
      /metamask|walletconnect|coinbase|rainbow|rabby|zerion|trust|okx|phantom/.test(key)
    );
  });
}

const DYNAMIC_SETTINGS = {
  appName: 'Monerge',
  appLogoUrl: `${window.location.origin}/assets/monerge-icon-512.png`,
  environmentId: DYNAMIC_ENV_ID,
  initialAuthenticationMode: 'connect-and-sign',
  enableVisitTrackingOnConnectOnly: true,
  theme: 'dark',
  defaultNumberOfWalletsToShow: 8,
  overrides: {
    evmNetworks: [
      {
        blockExplorerUrls: MONAD_NETWORK.blockExplorerUrls,
        chainId: 143,
        chainName: MONAD_NETWORK.chainName,
        key: 'monad',
        name: MONAD_NETWORK.chainName,
        nativeCurrency: MONAD_NETWORK.nativeCurrency,
        networkId: 143,
        rpcUrls: MONAD_NETWORK.rpcUrls,
        shortName: 'monad',
        vanityName: 'Monad'
      }
    ]
  },
  walletConnectors: [EthereumWalletConnectors],
  walletsFilter: monergeWalletsFilter,
  events: {
    onAuthFlowOpen: () => window.dispatchEvent(new CustomEvent('monerge-wallet-status', { detail: { status: 'Dynamic wallet modal open' } })),
    onAuthInit: () => window.dispatchEvent(new CustomEvent('monerge-wallet-status', { detail: { status: 'Connecting with Dynamic' } })),
    onAuthSuccess: () => window.dispatchEvent(new CustomEvent('monerge-wallet-status', { detail: { status: 'Dynamic wallet connected' } })),
    onAuthFailure: () => window.dispatchEvent(new CustomEvent('monerge-wallet-status', { detail: { status: 'Dynamic connect needs another try' } })),
    onAuthCancel: () => window.dispatchEvent(new CustomEvent('monerge-wallet-status', { detail: { status: 'Wallet connect cancelled' } })),
    onLogout: () => window.dispatchEvent(new CustomEvent('monerge-wallet', { detail: { address: '' } }))
  },
  cssOverrides: `
    .dynamic-shadow-dom { --dynamic-font-family-primary: inherit; }
    :host {
      --dynamic-brand-primary-color: #8f6bff;
      --dynamic-brand-secondary-color: #7fd2e7;
      --dynamic-background-color: #160f36;
      --dynamic-base-1: #160f36;
      --dynamic-base-2: #24184f;
      --dynamic-base-3: #332263;
      --dynamic-base-4: #493078;
      --dynamic-overlay: rgba(8,7,24,0.76);
      --dynamic-modal-backdrop-background: rgba(8,7,24,0.76);
      --dynamic-header-background: #160f36;
      --dynamic-footer-background: #160f36;
      --dynamic-wallet-list-tile-background: #24184f;
      --dynamic-wallet-list-tile-background-hover: #332263;
      --dynamic-wallet-list-tile-border: 1px solid rgba(127,210,231,0.22);
      --dynamic-wallet-list-tile-border-hover: 1px solid rgba(166,139,255,0.48);
      --dynamic-connect-button-background: linear-gradient(135deg, #8f6bff, #7fd2e7);
      --dynamic-connect-button-background-hover: linear-gradient(135deg, #a68bff, #8cf7f0);
      --dynamic-connect-button-color: #0e1f2c;
      --dynamic-button-primary-background: #8f6bff;
      --dynamic-button-secondary-background: #332263;
      --dynamic-text-primary: #ffffff;
      --dynamic-text-primary-color: #ffffff;
      --dynamic-text-secondary: rgba(255,255,255,0.74);
      --dynamic-text-secondary-color: rgba(255,255,255,0.74);
      --dynamic-text-link: #7fd2e7;
      --dynamic-border: rgba(255,255,255,0.12);
      --dynamic-border-color: rgba(255,255,255,0.12);
      --dynamic-wallet-list-tile-background: rgba(255,255,255,0.08);
      --dynamic-wallet-list-tile-background-hover: rgba(127,210,231,0.18);
      --dynamic-wallet-list-tile-border: 1px solid rgba(238,246,251,0.16);
      --dynamic-wallet-list-tile-border-hover: 1px solid rgba(127,210,231,0.38);
      --dynamic-border-radius: 16px;
      --dynamic-shadow-down-3: 0 24px 48px rgba(0,0,0,0.55);
    }
  `
};

const dynamicBridgeRef = { current: null };
const DYNAMIC_AUTH_OPTIONS = {
  initializeWalletConnect: true,
  clearErrors: true,
  performMultiWalletChecks: false
};

function showMonergeAuthFlow(setShowAuthFlow) {
  try {
    setShowAuthFlow?.(true, DYNAMIC_AUTH_OPTIONS);
  } catch (_) {
    setShowAuthFlow?.(true);
  }
}

function purgeDynamicWalletCache() {
  try {
    storageKeys().forEach((key) => {
      if (/^dynamic_|^@dynamic|walletconnect|wallet-connect|wc@|appkit|w3m/i.test(key)) {
        storageRemove(key);
      }
    });
  } catch (_) {}
}

function MonergeDynamicBridge() {
  const ctx = useDynamicContext();
  const { setShowAuthFlow, handleLogOut, user, primaryWallet } = ctx;
  const { setShowLinkNewWalletModal } = useDynamicModals();
  const wallets = useUserWallets();

  useEffect(() => {
    dynamicBridgeRef.current = {
      open: () => {
        const authenticated = Boolean(user || primaryWallet?.address || wallets?.length);
        if (authenticated) {
          try {
            setShowLinkNewWalletModal?.(true);
            return;
          } catch (_) {}
        }
        showMonergeAuthFlow(setShowAuthFlow);
      },
      logout: async () => {
        await handleLogOut?.();
        purgeDynamicWalletCache();
      },
      isAuthenticated: () => Boolean(user || primaryWallet?.address || wallets?.length)
    };
    return () => {
      dynamicBridgeRef.current = null;
    };
  }, [setShowAuthFlow, setShowLinkNewWalletModal, handleLogOut, user, primaryWallet, wallets]);

  useEffect(() => {
    const syncFromDynamic = (params) => {
      const userWallets = Array.isArray(params?.userWallets) ? params.userWallets : Array.isArray(params) ? params : [];
      const wallet = userWallets?.find?.((item) => /^EVM|ETH$/i.test(String(item?.chain || ''))) || userWallets?.[0] || params?.wallet || params?.primaryWallet;
      if (wallet?.address) window.dispatchEvent(new CustomEvent('monerge-wallet', { detail: { address: wallet.address } }));
    };
    const onLogout = () => window.dispatchEvent(new CustomEvent('monerge-wallet', { detail: { address: '' } }));
    const syncPrimaryWallet = (wallet) => syncFromDynamic({ wallet });
    const syncWalletFailure = () => {
      window.dispatchEvent(new CustomEvent('monerge-wallet-status', { detail: { status: 'Dynamic wallet connect did not finish. Please try again.' } }));
    };
    try { dynamicEvents.on('userWalletsChanged', syncFromDynamic); } catch (_) {}
    try { dynamicEvents.on('userWalletsPopulated', syncFromDynamic); } catch (_) {}
    try { dynamicEvents.on('primaryWalletChanged', syncPrimaryWallet); } catch (_) {}
    try { dynamicEvents.on('walletAdded', (_wallet, userWallets) => syncFromDynamic({ userWallets })); } catch (_) {}
    try { dynamicEvents.on('walletRemoved', (_wallet, userWallets) => syncFromDynamic({ userWallets })); } catch (_) {}
    try { dynamicEvents.on('walletConnectionFailed', syncWalletFailure); } catch (_) {}
    try { dynamicEvents.on('logout', onLogout); } catch (_) {}
    return () => {
      try { dynamicEvents.off('userWalletsChanged', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('userWalletsPopulated', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('primaryWalletChanged', syncPrimaryWallet); } catch (_) {}
      try { dynamicEvents.off('walletAdded', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('walletRemoved', syncFromDynamic); } catch (_) {}
      try { dynamicEvents.off('walletConnectionFailed', syncWalletFailure); } catch (_) {}
      try { dynamicEvents.off('logout', onLogout); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const stripIfOrphaned = () => {
      const html = document.documentElement;
      const body = document.body;
      if (!html.classList.contains('dynamic-no-scroll') && !body.classList.contains('dynamic-no-scroll')) return;
      const host = document.querySelector('.dynamic-shadow-dom');
      const hasModal = Boolean(host?.shadowRoot?.querySelector('[data-testid*="modal"], [data-testid*="auth"], [class*="DynamicModal"], [class*="AuthFlow"]'));
      if (!hasModal) {
        html.classList.remove('dynamic-no-scroll');
        body.classList.remove('dynamic-no-scroll');
      }
    };
    stripIfOrphaned();
    window.addEventListener('focus', stripIfOrphaned);
    document.addEventListener('visibilitychange', stripIfOrphaned);
    return () => {
      window.removeEventListener('focus', stripIfOrphaned);
      document.removeEventListener('visibilitychange', stripIfOrphaned);
    };
  }, []);

  return null;
}

function getAppMode() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === MONERGE_APP_PATH) return 'monerge';
  return new URLSearchParams(window.location.search).get('app');
}

function SocialIcon({ name, color = 'DCF2F7' }) {
  if (name === 'X') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M18.9 2h3.3l-7.2 8.23L23.5 22h-6.65l-5.2-6.8L5.7 22H2.4l7.7-8.8L2 2h6.82l4.7 6.22L18.9 2Zm-1.16 17.93h1.83L7.82 3.96H5.86l11.88 15.97Z"
        />
      </svg>
    );
  }
  if (name === 'LinkedIn') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.32 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.54V9H7.1v11.45ZM22.23 0H1.76C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.76 24h20.47c.97 0 1.77-.77 1.77-1.72V1.72C24 .77 23.2 0 22.23 0Z"
        />
      </svg>
    );
  }
  const slug = {
    X: 'x',
    Instagram: 'instagram',
    TikTok: 'tiktok',
    Farcaster: 'farcaster',
    LinkedIn: 'linkedin',
    Telegram: 'telegram',
    Twitch: 'twitch'
  }[name];
  return <img src={`https://cdn.simpleicons.org/${slug}/${color}`} alt="" aria-hidden="true" loading="lazy" />;
}

const GAME_NAME = 'Monerge';
const GAME_DURATION_SECONDS = 120;
const SCOREBOARD_KEY = 'monergeScoreboard';
const LEADERBOARD_KEY = 'monergeLeaderboard';
const PROFILE_KEY = 'monergeProfile';
const PROFILE_SIGNATURE_KEY = 'monergeProfileSignature';
const PROFILE_SIGNATURE_WALLET_KEY = 'monergeProfileSignatureWallet';
const LEADERBOARD_API = '/api/monerge-leaderboard';
const LAVA_DIRECTIONS = ['left', 'up', 'right', 'down'];
const GAME_DIFFICULTIES = {
  chill: {
    label: 'Chill',
    tag: 'Untimed',
    timed: false,
    hazards: false,
    duration: 0,
    multiplier: 1,
    note: 'No clock, no lava, no freeze. Pure merge focus.'
  },
  classic: {
    label: 'Classic',
    tag: 'Timed',
    timed: true,
    hazards: false,
    duration: GAME_DURATION_SECONDS,
    multiplier: 1.12,
    note: 'Timed run with clean walls.'
  },
  hazard: {
    label: 'Hazard',
    tag: 'Lava + freeze',
    timed: true,
    hazards: true,
    duration: GAME_DURATION_SECONDS,
    multiplier: 1.35,
    note: 'Random lava and freeze turns.'
  },
  hardest: {
    label: 'Hardest',
    tag: 'Max bonus',
    timed: true,
    hazards: true,
    duration: 90,
    multiplier: 1.75,
    note: 'Short clock, hazards every action, biggest score multiplier.'
  }
};
const DIFFICULTY_ORDER = ['chill', 'classic', 'hazard', 'hardest'];
const DIRECTION_LABELS = {
  left: 'Left wall',
  right: 'Right wall',
  up: 'Ceiling',
  down: 'Floor'
};
function randomDirection(except) {
  const choices = LAVA_DIRECTIONS.filter((direction) => direction !== except);
  return choices[Math.floor(Math.random() * choices.length)];
}
function randomHazards(previousLava, forceFreeze = false) {
  const lavaChoices = LAVA_DIRECTIONS.filter((direction) => direction !== previousLava);
  const lava = lavaChoices[Math.floor(Math.random() * lavaChoices.length)] || randomDirection();
  const freeze = forceFreeze || Math.random() < 0.74 ? randomDirection(lava) : '';
  return { lava, freeze };
}

function shortWallet(account) {
  return account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect wallet';
}

function cleanProfile(profile = {}) {
  const username = String(profile.username || '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 24);
  const rawPfp = String(profile.pfp || '').trim();
  const pfp = /^https?:\/\//i.test(rawPfp) || /^data:image\//i.test(rawPfp) ? rawPfp.slice(0, 1200000) : '';
  return { username, pfp };
}

function walletProfileKey(wallet = '') {
  const normalized = String(wallet || '').trim().toLowerCase();
  return normalized ? `${PROFILE_KEY}:${normalized}` : PROFILE_KEY;
}

function walletSignatureKey(wallet = '') {
  const normalized = String(wallet || '').trim().toLowerCase();
  return normalized ? `${PROFILE_SIGNATURE_KEY}:${normalized}` : PROFILE_SIGNATURE_KEY;
}

function readStoredProfileSignature(wallet = '') {
  try {
    const normalized = String(wallet || '').trim().toLowerCase();
    if (normalized) {
      const walletSignature = storageGet(walletSignatureKey(normalized)) || '';
      if (walletSignature) return walletSignature;
    }
    const globalSignature = storageGet(PROFILE_SIGNATURE_KEY) || '';
    const savedWallet = (storageGet(PROFILE_SIGNATURE_WALLET_KEY) || '').toLowerCase();
    if (!normalized || !savedWallet || savedWallet === normalized) return globalSignature;
    return '';
  } catch (_) {
    return '';
  }
}

function loadProfileSignature(wallet = '') {
  return readStoredProfileSignature(wallet);
}

function loadProfile() {
  try {
    return cleanProfile(JSON.parse(storageGet(PROFILE_KEY) || '{}'));
  } catch (_) {
    return { username: '', pfp: '' };
  }
}

function resizeProfileImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 320;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = size;
      canvas.height = size;
      const scale = Math.max(size / img.width, size / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      const x = (size - width) / 2;
      const y = (size - height) / 2;
      context.fillStyle = '#1d1740';
      context.fillRect(0, 0, size, size);
      context.drawImage(img, x, y, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Profile image could not be read.'));
    };
    img.src = url;
  });
}

function playerName(entry = {}) {
  return entry.username || (entry.wallet ? shortWallet(entry.wallet) : 'Guest player');
}

function MonergeWalletButton({
  account,
  label = 'Connect wallet',
  onClick,
  onSignOut,
  onSign,
  signed = false
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!account) {
    return (
      <div className="monerge-wallet-menu" ref={menuRef}>
        <button type="button" className="monerge-dynamic-btn" onClick={onClick}>
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className="monerge-wallet-menu" ref={menuRef}>
      <button
        type="button"
        className="monerge-dynamic-btn connected"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {shortWallet(account)}
      </button>
      {open && (
        <div className="wallet-dropdown" role="menu">
          <span>{signed ? 'Profile signed' : 'Signature needed'}</span>
          {!signed && <button type="button" role="menuitem" onClick={() => { setOpen(false); onSign?.(); }}>Sign profile</button>}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onClick?.(); }}>Wallet settings</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut?.(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function MonergeProfileEditor({ profile, account, onProfileChange, onPfpUpload, compact = false }) {
  const cleanPlayerProfile = cleanProfile(profile);
  return (
    <div className={`monerge-profile ${compact ? 'compact' : ''}`} aria-label="Player profile">
      <div className="profile-preview">
        {cleanPlayerProfile.pfp ? <img src={cleanPlayerProfile.pfp} alt="" /> : <span>{(cleanPlayerProfile.username || account || 'M').slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="profile-fields">
        <label>
          <span>Username</span>
          <input
            value={profile.username}
            onChange={(event) => onProfileChange({ ...profile, username: event.target.value })}
            placeholder="gerrydoteth"
            maxLength={24}
            autoComplete="nickname"
          />
        </label>
        <label className="profile-upload">
          <span>Profile photo</span>
          <input
            type="file"
            accept="image/*"
            onChange={onPfpUpload}
          />
          <b>{cleanPlayerProfile.pfp ? 'Change photo' : 'Upload, photo, or camera'}</b>
        </label>
      </div>
    </div>
  );
}

function loadLeaderboard() {
  try {
    const parsed = JSON.parse(storageGet(LEADERBOARD_KEY) || storageGet(SCOREBOARD_KEY) || '[]');
    return Array.isArray(parsed) ? dedupeLeaderboard(parsed).slice(0, 50) : [];
  } catch (_) {
    return [];
  }
}

function saveLeaderboard(entries) {
  storageSet(LEADERBOARD_KEY, JSON.stringify(dedupeLeaderboard(entries).slice(0, 50)));
}

function sortLeaderboard(entries) {
  return [...entries].sort((a, b) => {
    const signedDelta = Number(Boolean(b.signature)) - Number(Boolean(a.signature));
    if (signedDelta) return signedDelta;
    return (b.score || 0) - (a.score || 0);
  });
}

function leaderboardPlayerKey(entry = {}) {
  const wallet = String(entry.wallet || '').trim().toLowerCase();
  if (wallet) return `wallet:${wallet}`;
  const username = String(entry.username || '').trim().toLowerCase();
  if (username) return `user:${username}`;
  return `id:${entry.id || Math.random()}`;
}

function dedupeLeaderboard(entries = []) {
  const byPlayer = new Map();
  sortLeaderboard(entries).forEach((entry) => {
    const key = leaderboardPlayerKey(entry);
    const current = byPlayer.get(key);
    if (!current || (entry.score || 0) > (current.score || 0)) byPlayer.set(key, entry);
  });
  return sortLeaderboard([...byPlayer.values()]);
}

function mergeLeaderboardEntry(entries, entry) {
  const withoutSameRun = entries.filter((item) => item.id !== entry.id);
  return dedupeLeaderboard([entry, ...withoutSameRun]).slice(0, 50);
}

async function fetchPublicLeaderboard() {
  const response = await fetch(LEADERBOARD_API, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('leaderboard unavailable');
  const data = await response.json();
  return Array.isArray(data?.entries) ? dedupeLeaderboard(data.entries).slice(0, 50) : [];
}

async function publishLeaderboardRun(entry) {
  const response = await fetch(LEADERBOARD_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(entry)
  });
  if (!response.ok) throw new Error('leaderboard publish unavailable');
  const data = await response.json();
  return Array.isArray(data?.entries) ? dedupeLeaderboard(data.entries).slice(0, 50) : [];
}

function monergeRunHash(value = '') {
  return keccak256(toHex(String(value || '')));
}

function monergeProfileHash(entry = {}) {
  return keccak256(toHex(JSON.stringify({
    wallet: String(entry.wallet || '').toLowerCase(),
    username: entry.username || '',
    pfp: entry.pfp ? 'custom' : 'default',
    signature: entry.signature || ''
  })));
}

function shareMonergeRunUrl(entry = {}) {
  const text = [
    `I just revealed a ${Number(entry.score || 0).toLocaleString()} Monerge run on Monad.`,
    `${entry.difficulty || 'Classic'} · max tile ${entry.maxTile || 2} · ${entry.moves || 0} moves`,
    'Play: https://biome.gerrystephen.com/monerge'
  ].join('\n');
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function monergeWinnerCardFilename(entry = {}) {
  const score = Number(entry.score || 0);
  return `monerge-${score || 'run'}-${String(entry.id || Date.now()).slice(0, 12)}.png`;
}

function drawMonergeWinnerCard(context, entry = {}) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const score = Number(entry.score || 0);
  const maxTile = Number(entry.maxTile || 2);
  const character = MONAD_TILE_CHARACTERS[maxTile] || MONAD_TILE_NAMES[maxTile] || 'MON';
  const player = playerName(entry);
  const verified = entry.txHash ? 'Monad verified' : entry.signature ? 'Profile signed' : 'Revealed run';

  const sky = context.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, '#100b31');
  sky.addColorStop(0.44, '#24145c');
  sky.addColorStop(1, '#7ee8f1');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(860, 140, 10, 860, 140, 440);
  glow.addColorStop(0, 'rgba(255, 230, 109, 0.9)');
  glow.addColorStop(0.42, 'rgba(255, 79, 161, 0.45)');
  glow.addColorStop(1, 'rgba(255, 79, 161, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(238, 246, 251, 0.1)';
  context.lineWidth = 2;
  for (let x = -80; x < width + 160; x += 64) {
    context.beginPath();
    context.moveTo(x, height);
    context.lineTo(x + 260, 340);
    context.stroke();
  }
  for (let y = 370; y < height; y += 44) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.fillStyle = 'rgba(10, 4, 24, 0.72)';
  context.roundRect(72, 70, 1056, 490, 34);
  context.fill();
  context.strokeStyle = 'rgba(140, 247, 240, 0.38)';
  context.stroke();

  context.fillStyle = '#8cf7f0';
  context.font = '700 30px Inter, system-ui, sans-serif';
  context.fillText('MONERGE WINNER CARD', 118, 130);

  context.fillStyle = '#eef6fb';
  context.font = '900 122px Inter Tight, Inter, system-ui, sans-serif';
  context.fillText(score.toLocaleString(), 112, 272);

  context.fillStyle = 'rgba(238, 246, 251, 0.76)';
  context.font = '700 34px Inter, system-ui, sans-serif';
  context.fillText(`${entry.difficulty || 'Classic'} run by ${player}`, 118, 326);

  context.fillStyle = 'rgba(255, 255, 255, 0.08)';
  context.roundRect(118, 370, 294, 96, 18);
  context.roundRect(452, 370, 294, 96, 18);
  context.roundRect(786, 370, 294, 96, 18);
  context.fill();

  context.fillStyle = '#ff4fa1';
  context.font = '800 24px JetBrains Mono, monospace';
  context.fillText('MAX TILE', 146, 408);
  context.fillText('MOVES', 480, 408);
  context.fillText('STATUS', 814, 408);

  context.fillStyle = '#fff';
  context.font = '900 38px Inter, system-ui, sans-serif';
  context.fillText(`${maxTile} ${character}`, 146, 448);
  context.fillText(String(entry.moves || 0), 480, 448);
  context.fillText(verified, 814, 448);

  context.fillStyle = 'rgba(238, 246, 251, 0.62)';
  context.font = '600 22px Inter, system-ui, sans-serif';
  context.fillText('Play: biome.gerrystephen.com/monerge', 118, 520);
}

function downloadMonergeWinnerCard(entry = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext('2d');
  if (!context) return;
  drawMonergeWinnerCard(context, entry);
  const saveBlob = (blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = monergeWinnerCardFilename(entry);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (canvas.toBlob) {
    canvas.toBlob(saveBlob, 'image/png');
  } else {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = monergeWinnerCardFilename(entry);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

function hexFromText(text) {
  return '0x' + Array.from(new TextEncoder().encode(text))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const MONAD_TILE_NAMES = {
  2: 'CHOG',
  4: 'DAK',
  8: 'MOUCH',
  16: 'MOS',
  32: 'MOYAKI',
  64: 'SHRAMP',
  128: 'MOKA',
  256: 'NADBOT',
  512: 'SALMONAD',
  1024: 'HYPERNAD',
  2048: 'EMONAD'
};

const MONAD_TILE_CHARACTERS = {
  2: 'Chog',
  4: 'Molandak',
  8: 'Mouch',
  16: 'Mosferatu',
  32: 'Moyaki',
  64: 'Shramp',
  128: 'Mokadel',
  256: 'Nadbot',
  512: 'Salmonad',
  1024: 'Hypernad',
  2048: 'Emonad'
};

const MONAD_CHARACTER_IMAGES = {
  Chog: 'assets/monanimals/chog-official-sprite.png',
  Molandak: 'assets/monanimals/molandak-official-sprite.png',
  Mouch: 'assets/monanimals/mouch-sprite-tight.png',
  Mosferatu: 'assets/monanimals/mosferatu-clean.svg',
  Moyaki: 'assets/monanimals/moyaki-clean.svg',
  Shramp: 'assets/monanimals/shramp-clean.svg',
  Moka: 'assets/monanimals/mokadel-clean.svg',
  Mokadel: 'assets/monanimals/mokadel-sprite-tight.png',
  Nadbot: 'assets/monanimals/nadbot-clean.svg',
  Salmonad: 'assets/monanimals/salmonad-sprite-tight.png',
  Mondana: 'assets/monanimals/mondana-clean.svg',
  Hypernad: 'assets/monanimals/hypernad-clean.svg',
  Emonad: 'assets/monanimals/emonad-sprite.png'
};

const MONAD_TILE_LADDER = [
{ value: 2, code: 'CHOG', character: 'Chog', note: 'starter focus' },
{ value: 4, code: 'DAK', character: 'Molandak', note: 'purple charge' },
{ value: 8, code: 'MOUCH', character: 'Mouch', note: 'quick reaction' },
{ value: 16, code: 'MOS', character: 'Mosferatu', note: 'night focus' },
{ value: 32, code: 'MOYAKI', character: 'Moyaki', note: 'side quest energy' },
{ value: 64, code: 'SHRAMP', character: 'Shramp', note: 'combo current' },
{ value: 128, code: 'MOKA', character: 'Mokadel', note: 'deep-lore monanimal' },
{ value: 256, code: 'NADBOT', character: 'Nadbot', note: 'automation mode' },
{ value: 512, code: 'SALMONAD', character: 'Salmonad', note: 'salmoposting power' },
{ value: 1024, code: 'HYPERNAD', character: 'Hypernad', note: 'hyperfocus tier' },
{ value: 2048, code: 'EMONAD', character: 'Emonad', note: 'final iglu state' }];

const MONAD_CHARACTERS = [
  { name: 'Chog', note: 'starter focus', value: 2 },
  { name: 'Molandak', note: 'purple charge', value: 4 },
  { name: 'Mouch', note: 'quick reaction', value: 8 },
  { name: 'Mokadel', note: 'deep-lore monanimal', value: 128 },
  { name: 'Salmonad', note: 'salmoposting power', value: 512 },
  { name: 'Emonad', note: 'final iglu state', value: 2048 }
];

function addRandomTile(board) {
  const empty = board
    .map((value, index) => value ? null : index)
    .filter((index) => index !== null);
  if (!empty.length) return board;
  const next = [...board];
  const index = empty[Math.floor(Math.random() * empty.length)];
  next[index] = Math.random() < 0.88 ? 2 : 4;
  return next;
}

function makeBoard() {
  return addRandomTile(addRandomTile(Array(16).fill(0)));
}

function sameBoard(a, b) {
  return a.every((value, index) => value === b[index]);
}

function compressLine(line) {
  const values = line.filter(Boolean);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === values[i + 1]) {
      const nextValue = values[i] * 2;
      merged.push(nextValue);
      gained += nextValue;
      i += 1;
    } else {
      merged.push(values[i]);
    }
  }
  while (merged.length < 4) merged.push(0);
  return { line: merged, gained };
}

function moveBoard(board, direction) {
  const next = Array(16).fill(0);
  let gained = 0;

  for (let lane = 0; lane < 4; lane += 1) {
    const source = [];
    for (let offset = 0; offset < 4; offset += 1) {
      const index = direction === 'left' || direction === 'right'
        ? lane * 4 + offset
        : offset * 4 + lane;
      source.push(board[index]);
    }
    const ordered = direction === 'right' || direction === 'down' ? source.reverse() : source;
    const result = compressLine(ordered);
    const line = direction === 'right' || direction === 'down' ? result.line.reverse() : result.line;
    gained += result.gained;

    for (let offset = 0; offset < 4; offset += 1) {
      const index = direction === 'left' || direction === 'right'
        ? lane * 4 + offset
        : offset * 4 + lane;
      next[index] = line[offset];
    }
  }

  return { board: next, gained, moved: !sameBoard(board, next) };
}

function canMove(board) {
  if (board.some((value) => !value)) return true;
  return ['left', 'right', 'up', 'down'].some((direction) => moveBoard(board, direction).moved);
}

function MonadGame() {
  const dynamicContext = useDynamicContext();
  const {
    primaryWallet,
    setShowAuthFlow,
    handleLogOut,
    user,
    sdkHasLoaded,
    projectSettings,
    showAuthFlow
  } = dynamicContext;
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState('');
  const [walletState, setWalletState] = useState('Ready');
  const [dynamicTimedOut, setDynamicTimedOut] = useState(false);
  const [board, setBoard] = useState(() => makeBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(storageGet('monergeBlindBest') || storageGet('igluMergeBlindBest') || 0));
  const [moves, setMoves] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [profileSignature, setProfileSignature] = useState(() => loadProfileSignature());
  const [difficulty, setDifficulty] = useState('classic');
  const [lavaDirection, setLavaDirection] = useState(() => LAVA_DIRECTIONS[Math.floor(Math.random() * LAVA_DIRECTIONS.length)]);
  const [freezeDirection, setFreezeDirection] = useState(() => randomDirection(lavaDirection));
  const [frozenTurns, setFrozenTurns] = useState(0);
  const [hazardHit, setHazardHit] = useState('');
  const [hazardPulse, setHazardPulse] = useState(0);
  const [scoreGuess, setScoreGuess] = useState('');
  const [scoreReveal, setScoreReveal] = useState(null);
  const [lastRevealedEntry, setLastRevealedEntry] = useState(null);
  const [onChainRun, setOnChainRun] = useState({ status: MONERGE_RUNS_CONTRACT ? 'ready' : 'not-configured', txHash: '', error: '' });
  const [leaderboard, setLeaderboard] = useState(() => loadLeaderboard());
  const [profile, setProfile] = useState(() => loadProfile());
  const [gameMessage, setGameMessage] = useState('Score is hidden. Track the merges in your head.');
  const [gameStarted, setGameStarted] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [gameMusic, setGameMusic] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [installPromptDismissed, setInstallPromptDismissed] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [pressedDirection, setPressedDirection] = useState('');
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_SECONDS);
  const pendingProfileSignRef = useRef(false);
  const isMonad = chainId?.toLowerCase() === MONAD_NETWORK.chainId;
  const maxTile = Math.max(...board);
  const appMode = getAppMode();
  const isGameApp = appMode === 'monerge' || appMode === 'iglu-merge';
  const musicReady = useMonergeMusic(isGameApp && gameMusic);
  const playSfx = useMonergeSfx(isGameApp && sfxEnabled);
  const currentDifficulty = GAME_DIFFICULTIES[difficulty] || GAME_DIFFICULTIES.classic;
  const hazardsEnabled = Boolean(currentDifficulty.hazards);
  const finalScore = scoreReveal?.final ?? null;
  const timeBonus = currentDifficulty.timed ? Math.max(0, timeLeft) * 2 : 0;
  const difficultyBonus = scoreReveal?.difficultyBonus ?? 0;
  const dynamicReady = Boolean(sdkHasLoaded);
  const dynamicStatus = dynamicReady ? 'Dynamic ready' : dynamicTimedOut ? 'Dynamic settings blocked' : 'Dynamic loading';
  const cleanPlayerProfile = cleanProfile(profile);
  const profileSigned = Boolean(account && profileSignature);
  const canPromptInstall = isGameApp
    && !installPromptDismissed
    && typeof window !== 'undefined'
    && window.matchMedia?.('(max-width: 760px)')?.matches
    && !window.matchMedia?.('(display-mode: standalone)')?.matches;

  useEffect(() => {
    if (!isGameApp) return undefined;
    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      setInstallPromptDismissed(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [isGameApp]);

  function updateProfile(nextProfile) {
    const next = {
      username: String(nextProfile.username || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24),
      pfp: String(nextProfile.pfp || '').trim().slice(0, 1200000)
    };
    setProfile(next);
    storageSet(PROFILE_KEY, JSON.stringify(next));
    if (account) storageSet(walletProfileKey(account), JSON.stringify(next));
    if (account && profileSignature) {
      setWalletState('Profile saved. Your wallet stays signed.');
    }
  }

  async function handlePfpUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !file.type?.startsWith('image/')) return;
    try {
      const image = await resizeProfileImage(file);
      updateProfile({ ...profile, pfp: image });
    } catch (_) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          updateProfile({ ...profile, pfp: reader.result.slice(0, 1200000) });
        }
      };
      reader.readAsDataURL(file);
    } finally {
      event.target.value = '';
    }
  }

  async function promptInstallApp() {
    unlockMonergeAudio();
    if (installPromptEvent?.prompt) {
      installPromptEvent.prompt();
      await installPromptEvent.userChoice.catch(() => undefined);
      setInstallPromptEvent(null);
      setInstallPromptDismissed(true);
      return;
    }
    setInstallGuideOpen(true);
  }

  useEffect(() => {
    if (!gameStarted || gameOver || scoreReveal || !currentDifficulty.timed) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          setGameOver(true);
          setGameMessage('Time. Guess the score before the iglu closes.');
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentDifficulty.timed, gameStarted, gameOver, scoreReveal]);

  useEffect(() => {
    let active = true;
    fetchPublicLeaderboard()
      .then((entries) => {
        if (!active || !entries.length) return;
        const next = dedupeLeaderboard([...entries, ...loadLeaderboard()]).slice(0, 50);
        setLeaderboard(next);
        saveLeaderboard(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isGameApp) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const preventPageMove = (event) => {
      const dynamicHost = event.target?.closest?.('.dynamic-shadow-dom');
      const openPanel = event.target?.closest?.('.game-menu-panel, .leaderboard-panel');
      if (dynamicHost) return;
      if (openPanel) return;
      event.preventDefault();
    };
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    window.addEventListener('touchmove', preventPageMove, { passive: false });
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      window.removeEventListener('touchmove', preventPageMove);
    };
  }, [isGameApp]);

  useEffect(() => {
    window.__monergeDynamicDebug = {
      appMode,
      environmentId: DYNAMIC_ENV_ID,
      hasProjectSettings: Boolean(projectSettings),
      origin: window.location.origin,
      sdkHasLoaded: Boolean(sdkHasLoaded),
      showAuthFlow: Boolean(showAuthFlow),
      timestamp: new Date().toISOString(),
      walletAddress: primaryWallet?.address || account || ''
    };
  }, [account, appMode, primaryWallet, projectSettings, sdkHasLoaded, showAuthFlow]);

  useEffect(() => {
    if (dynamicReady) {
      setDynamicTimedOut(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setDynamicTimedOut(true), 4500);
    return () => window.clearTimeout(timer);
  }, [dynamicReady]);

  useEffect(() => {
    if (!primaryWallet?.address) return;
    let cancelled = false;
    const address = primaryWallet.address;
    setAccount(address);
    setWalletState('Dynamic wallet connected');
    unlockMonergeAudio();
    (async () => {
      try {
        await primaryWallet.switchNetwork?.(143);
        const network = await primaryWallet.getNetwork?.();
        if (!cancelled && network) setChainId(`0x${Number(network).toString(16)}`);
        const storedSignature = readStoredProfileSignature(address);
        if (!cancelled && storedSignature && storedSignature !== profileSignature) {
          setProfileSignature(storedSignature);
          storageSet(PROFILE_SIGNATURE_KEY, storedSignature);
          storageSet(PROFILE_SIGNATURE_WALLET_KEY, address);
        }
        if (!cancelled && user && !storedSignature) {
          const dynamicSignature = `dynamic-auth:${user.userId || user.id || address}`;
          setProfileSignature(dynamicSignature);
          storageSet(PROFILE_SIGNATURE_KEY, dynamicSignature);
          storageSet(PROFILE_SIGNATURE_WALLET_KEY, address);
          storageSet(walletSignatureKey(address), dynamicSignature);
          pendingProfileSignRef.current = false;
          setWalletState('Profile signed');
        } else if (!cancelled && pendingProfileSignRef.current && !profileSignature && !storedSignature) {
          pendingProfileSignRef.current = false;
          setWalletState('Dynamic connected. Sign profile from the wallet menu.');
        }
      } catch (_) {
        const storedSignature = readStoredProfileSignature(address);
        if (!cancelled && storedSignature && storedSignature !== profileSignature) {
          setProfileSignature(storedSignature);
          storageSet(PROFILE_SIGNATURE_KEY, storedSignature);
          storageSet(PROFILE_SIGNATURE_WALLET_KEY, address);
        }
        if (!cancelled && user && !storedSignature) {
          const dynamicSignature = `dynamic-auth:${user.userId || user.id || address}`;
          setProfileSignature(dynamicSignature);
          storageSet(PROFILE_SIGNATURE_KEY, dynamicSignature);
          storageSet(PROFILE_SIGNATURE_WALLET_KEY, address);
          storageSet(walletSignatureKey(address), dynamicSignature);
          pendingProfileSignRef.current = false;
          setWalletState('Profile signed');
        } else if (!cancelled && pendingProfileSignRef.current && !profileSignature && !storedSignature) {
          pendingProfileSignRef.current = false;
          setWalletState('Dynamic connected. Sign profile from the wallet menu.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primaryWallet, profileSignature, user]);

  useEffect(() => {
    if (!account) return;
    let walletProfile = { username: '', pfp: '' };
    try {
      walletProfile = cleanProfile(JSON.parse(storageGet(walletProfileKey(account)) || '{}'));
    } catch (_) {
      walletProfile = { username: '', pfp: '' };
    }
    if ((walletProfile.username || walletProfile.pfp) && (
      walletProfile.username !== cleanPlayerProfile.username ||
      walletProfile.pfp !== cleanPlayerProfile.pfp
    )) {
      setProfile(walletProfile);
      storageSet(PROFILE_KEY, JSON.stringify(walletProfile));
    }
    const storedSignature = readStoredProfileSignature(account);
    if (storedSignature && storedSignature !== profileSignature) {
      setProfileSignature(storedSignature);
      storageSet(PROFILE_SIGNATURE_KEY, storedSignature);
      storageSet(PROFILE_SIGNATURE_WALLET_KEY, account);
      return;
    }
    const savedWallet = storageGet(PROFILE_SIGNATURE_WALLET_KEY) || '';
    if (profileSignature && !storedSignature && (!savedWallet || savedWallet.toLowerCase() !== account.toLowerCase())) {
      setProfileSignature('');
      storageRemove(PROFILE_SIGNATURE_KEY);
      storageRemove(PROFILE_SIGNATURE_WALLET_KEY);
    }
  }, [account, profileSignature, cleanPlayerProfile.username, cleanPlayerProfile.pfp]);

  useEffect(() => {
    if (!window.ethereum) return undefined;
    const syncAccounts = (accounts) => setAccount(accounts?.[0] || '');
    const syncChain = (id) => setChainId(id || '');
    window.ethereum.request({ method: 'eth_accounts' }).then(syncAccounts).catch(() => {});
    window.ethereum.request({ method: 'eth_chainId' }).then(syncChain).catch(() => {});
    window.ethereum.on?.('accountsChanged', syncAccounts);
    window.ethereum.on?.('chainChanged', syncChain);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', syncAccounts);
      window.ethereum.removeListener?.('chainChanged', syncChain);
    };
  }, []);

  useEffect(() => {
    const syncDynamicWallet = (event) => {
      const address = event.detail?.address || '';
      setAccount(address);
      if (address) {
        unlockMonergeAudio();
        setWalletState('Dynamic wallet connected');
        if (pendingProfileSignRef.current && !profileSignature) {
          pendingProfileSignRef.current = false;
          window.setTimeout(() => signProfile(address, true), 250);
        }
      }
    };
    const syncDynamicStatus = (event) => {
      const status = event.detail?.status;
      if (status) setWalletState(status);
    };
    window.addEventListener('monerge-wallet', syncDynamicWallet);
    window.addEventListener('monerge-wallet-status', syncDynamicStatus);
    return () => {
      window.removeEventListener('monerge-wallet', syncDynamicWallet);
      window.removeEventListener('monerge-wallet-status', syncDynamicStatus);
    };
  }, [profileSignature]);

  useEffect(() => {
    const onKey = (event) => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      makeMove(direction);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [board, gameOver, hazardsEnabled, lavaDirection, freezeDirection, frozenTurns]);

  function rotateHazards(moveCount = moves + 1, options = {}) {
    if (!hazardsEnabled) {
      setLavaDirection('');
      setFreezeDirection('');
      setHazardHit('');
      return { lava: '', freeze: '' };
    }
    if (difficulty === 'hardest') options.forceFreeze = true;
    const nextHazards = randomHazards(lavaDirection, options.forceFreeze || moveCount % 3 === 0);
    setLavaDirection(nextHazards.lava);
    setFreezeDirection(nextHazards.freeze);
    setHazardPulse((value) => value + 1);
    setHazardHit('');
    return nextHazards;
  }

  function hitHazard(kind) {
    playSfx(kind === 'freeze' ? 'freeze' : 'lava');
    setHazardHit('');
    window.setTimeout(() => setHazardHit(kind), 20);
    window.setTimeout(() => setHazardHit(''), 420);
  }

  function rotateLava(moveCount = moves + 1) {
    const next = rotateHazards(moveCount).lava;
    return next;
  }

  function openDynamicFlow(message = 'Opening Dynamic wallet connect.') {
    if (!dynamicReady) {
      setWalletState('Dynamic settings are not loaded for this domain yet.');
      window.dispatchEvent(new CustomEvent('monerge-wallet-status', {
        detail: { status: 'Dynamic settings blocked or still loading.' }
      }));
      return;
    }
    setWalletState(sdkHasLoaded ? message : 'Loading wallet connector...');
    if (dynamicBridgeRef.current) dynamicBridgeRef.current.open();
    else showMonergeAuthFlow(setShowAuthFlow);
    window.setTimeout(() => {
      setWalletState((current) => (
        current === message || current === 'Loading wallet connector...'
          ? 'Dynamic did not open yet. Check allowed domains and popup blockers.'
          : current
      ));
    }, 6500);
  }

  async function connectMonad() {
    unlockMonergeAudio();
    if (primaryWallet) {
      try {
        await primaryWallet.switchNetwork?.(143);
        const network = await primaryWallet.getNetwork?.();
        if (network) setChainId(`0x${Number(network).toString(16)}`);
        const connectedAddress = primaryWallet.address || account;
        setAccount(connectedAddress);
        const storedSignature = readStoredProfileSignature(connectedAddress);
        if (storedSignature) {
          setProfileSignature(storedSignature);
          storageSet(PROFILE_SIGNATURE_KEY, storedSignature);
          storageSet(PROFILE_SIGNATURE_WALLET_KEY, connectedAddress);
          pendingProfileSignRef.current = false;
          setWalletState('Dynamic wallet ready');
        } else if (user) {
          const dynamicSignature = `dynamic-auth:${user.userId || user.id || connectedAddress}`;
          setProfileSignature(dynamicSignature);
          storageSet(PROFILE_SIGNATURE_KEY, dynamicSignature);
          storageSet(PROFILE_SIGNATURE_WALLET_KEY, connectedAddress);
          storageSet(walletSignatureKey(connectedAddress), dynamicSignature);
          pendingProfileSignRef.current = false;
          setWalletState('Profile signed');
        } else {
          pendingProfileSignRef.current = true;
          setWalletState('Dynamic connected. Sign profile from the wallet menu.');
        }
      } catch (error) {
        setWalletState(error?.message || 'Open Dynamic to finish wallet setup.');
        showMonergeAuthFlow(setShowAuthFlow);
      }
      return;
    }
    pendingProfileSignRef.current = !readStoredProfileSignature(account);
    openDynamicFlow();
  }

  async function disconnectWallet() {
    try {
      await handleLogOut?.();
    } catch (_) {
      // Dynamic can fail logout when the session is already gone; local state still needs to clear.
    }
    setAccount('');
    setChainId('');
    setWalletState('Wallet disconnected');
    setProfileSignature('');
    storageRemove(PROFILE_SIGNATURE_KEY);
    storageRemove(PROFILE_SIGNATURE_WALLET_KEY);
  }

  function newGame() {
    unlockMonergeAudio();
    playSfx('start');
    setGameStarted(true);
    setBoard(makeBoard());
    setScore(0);
    setMoves(0);
    setGameOver(false);
    setScoreGuess('');
    setScoreReveal(null);
    setLastRevealedEntry(null);
    setOnChainRun({ status: MONERGE_RUNS_CONTRACT ? 'ready' : 'not-configured', txHash: '', error: '' });
    setFrozenTurns(0);
    setTimeLeft(currentDifficulty.duration);
    const firstHazards = currentDifficulty.hazards ? randomHazards(undefined, true) : { lava: '', freeze: '' };
    setLavaDirection(firstHazards.lava);
    setFreezeDirection(firstHazards.freeze);
    setHazardPulse((value) => value + 1);
    setHazardHit('');
    setGameMessage(currentDifficulty.hazards
      ? 'Score is hidden. Track the merges and dodge the hazards.'
      : 'Score is hidden. Clean walls. Track the merges in your head.');
  }

  function returnToMonergeHome() {
    unlockMonergeAudio();
    setGameStarted(false);
    setGameMenuOpen(false);
    setLeaderboardOpen(false);
    setTouchStart(null);
    setPressedDirection('');
  }

  async function submitRunOnMonad(entry) {
    if (!MONERGE_RUNS_CONTRACT) {
      setOnChainRun({ status: 'not-configured', txHash: '', error: '' });
      return '';
    }
    if (!account) {
      setOnChainRun({ status: 'wallet-needed', txHash: '', error: 'Connect wallet to verify on Monad.' });
      return '';
    }
    try {
      setOnChainRun({ status: 'pending', txHash: '', error: '' });
      if (!isMonad) await connectMonad();
      const data = encodeFunctionData({
        abi: MONERGE_RUNS_ABI,
        functionName: 'submitRun',
        args: [
          monergeRunHash(entry.id),
          BigInt(entry.score || 0),
          BigInt(entry.actual || 0),
          Number(entry.maxTile || 2),
          Number(entry.moves || 0),
          DIFFICULTY_CHAIN_CODES[entry.difficulty] ?? 1,
          monergeProfileHash(entry)
        ]
      });

      let txHash = '';
      const walletClient = await primaryWallet?.connector?.getWalletClient?.();
      if (walletClient?.sendTransaction) {
        txHash = await walletClient.sendTransaction({
          account,
          to: MONERGE_RUNS_CONTRACT,
          data,
          chain: monadMainnet
        });
      } else if (primaryWallet?.connector?.sendTransaction) {
        txHash = await primaryWallet.connector.sendTransaction({
          to: MONERGE_RUNS_CONTRACT,
          data,
          chainId: 143
        });
      } else if (window.ethereum?.request) {
        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: account, to: MONERGE_RUNS_CONTRACT, data }]
        });
      } else {
        throw new Error('Wallet transaction signer unavailable.');
      }

      setOnChainRun({ status: 'submitted', txHash, error: '' });
      return txHash;
    } catch (error) {
      const message = error?.shortMessage || error?.message || 'Monad verification was cancelled.';
      setOnChainRun({ status: 'error', txHash: '', error: message });
      return '';
    }
  }

  function makeMove(direction) {
    if (gameOver) return;
    if (hazardsEnabled && frozenTurns > 0) {
      const blockedBoard = addRandomTile(board);
      setBoard(blockedBoard);
      setFrozenTurns((value) => Math.max(0, value - 1));
      const nextHazards = rotateHazards(moves + 1, { forceFreeze: true });
      setMoves((value) => value + 1);
      hitHazard('freeze');
      setGameMessage(`Frozen. Move skipped and an extra block entered. New lava: ${DIRECTION_LABELS[nextHazards.lava]}.`);
      if (!canMove(blockedBoard)) setGameOver(true);
      return;
    }
    if (hazardsEnabled && direction === lavaDirection) {
      const penalty = Math.max(12, Math.min(96, Math.round((maxTile || 2) / 2)));
      setScore((value) => Math.max(0, value - penalty));
      const nextHazards = rotateHazards(moves + 1);
      setMoves((value) => value + 1);
      hitHazard('lava');
      setGameMessage(`${DIRECTION_LABELS[direction]} is lava. -${penalty}. New lava: ${DIRECTION_LABELS[nextHazards.lava]}.`);
      return;
    }
    if (hazardsEnabled && direction === freezeDirection) {
      const nextHazards = rotateHazards(moves + 1, { forceFreeze: true });
      setFrozenTurns(1);
      setMoves((value) => value + 1);
      hitHazard('freeze');
      setGameMessage(`${DIRECTION_LABELS[direction]} froze the iglu. Next move gets skipped. New lava: ${DIRECTION_LABELS[nextHazards.lava]}.`);
      return;
    }
    const result = moveBoard(board, direction);
    if (!result.moved) return;
    playSfx(result.gained ? 'merge' : 'move');
    const nextBoard = addRandomTile(result.board);
    const nextMoves = moves + 1;
    const streakBonus = result.gained && nextMoves % 4 === 0 ? Math.max(8, maxTile / 4) : 0;
    setBoard(nextBoard);
    setScore((value) => value + result.gained + streakBonus);
    setMoves(nextMoves);
    const nextHazards = rotateHazards(nextMoves);
    const hazardCopy = hazardsEnabled
      ? ` Avoid ${DIRECTION_LABELS[nextHazards.lava]}${nextHazards.freeze ? ` and frozen ${DIRECTION_LABELS[nextHazards.freeze]}` : ''}.`
      : ' Clean walls.';
    setGameMessage(result.gained
      ? `Merge landed${streakBonus ? ` +${streakBonus} streak bonus` : ''}.${hazardCopy}`
      : `Clean slide.${hazardCopy}`);
    if (!canMove(nextBoard)) setGameOver(true);
  }

  function pressMove(direction) {
    setPressedDirection(direction);
    window.setTimeout(() => {
      setPressedDirection((current) => current === direction ? '' : current);
    }, 220);
    makeMove(direction);
  }

  function revealBlindScore(event) {
    event?.preventDefault?.();
    const guess = Number.parseInt(scoreGuess, 10);
    if (!Number.isFinite(guess)) {
      setGameMessage('Make a score guess first.');
      return;
    }
    const miss = Math.abs(score - guess);
    const baseAfterGuess = Math.max(0, score - miss + timeBonus);
    const difficultyBonusValue = Math.max(0, Math.round(baseAfterGuess * (currentDifficulty.multiplier - 1)));
    const final = baseAfterGuess + difficultyBonusValue;
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const reveal = {
      id: runId,
      actual: score,
      guess,
      miss,
      timeBonus,
      difficulty: currentDifficulty.label,
      difficultyBonus: difficultyBonusValue,
      final
    };
    setScoreReveal(reveal);
    playSfx('reveal');
    const revealedEntry = {
      id: runId,
      wallet: account || '',
      username: cleanPlayerProfile.username,
      pfp: cleanPlayerProfile.pfp,
      score: final,
      actual: score,
      difficulty: currentDifficulty.label,
      maxTile,
      moves,
      signature: profileSignature || '',
      signedAt: profileSignature ? new Date().toISOString() : '',
      revealedAt: new Date().toISOString()
    };
    setLastRevealedEntry(revealedEntry);
    const nextBoard = mergeLeaderboardEntry(leaderboard, revealedEntry);
    setLeaderboard(nextBoard);
    saveLeaderboard(nextBoard);
    publishLeaderboardRun(revealedEntry)
      .then((entries) => {
        const merged = dedupeLeaderboard([...entries, ...nextBoard]).slice(0, 50);
        setLeaderboard(merged);
        saveLeaderboard(merged);
      })
      .catch(() => {});
    if (account && MONERGE_RUNS_CONTRACT) {
      submitRunOnMonad(revealedEntry).then((txHash) => {
        if (!txHash) return;
        const verifiedEntry = { ...revealedEntry, txHash };
        const verifiedBoard = mergeLeaderboardEntry(loadLeaderboard(), verifiedEntry);
        setLastRevealedEntry(verifiedEntry);
        setLeaderboard(verifiedBoard);
        saveLeaderboard(verifiedBoard);
        publishLeaderboardRun(verifiedEntry).catch(() => {});
      });
    } else if (!MONERGE_RUNS_CONTRACT) {
      setOnChainRun({ status: 'not-configured', txHash: '', error: '' });
    } else if (!account) {
      setOnChainRun({ status: 'wallet-needed', txHash: '', error: 'Connect wallet to verify this run on Monad.' });
    }
    if (final > best) {
      setBest(final);
      storageSet('monergeBlindBest', String(final));
    }
    setGameMessage(`Actual ${score}. Off by ${miss}. ${currentDifficulty.label} bonus ${difficultyBonusValue}. Final score ${final}. Run uploaded${account ? ' with your wallet.' : '.'}`);
  }

  function handleTouchEnd(event) {
    if (event.target.closest('input, button, textarea, label, a')) return;
    event.preventDefault();
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    setTouchStart(null);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    makeMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  async function signProfile(address = account, assumeMonad = false) {
    const signingAddress = address || account;
    if (!signingAddress) {
      await connectMonad();
      return;
    }
    if (!assumeMonad && !isMonad) {
      await connectMonad();
      return;
    }
    try {
      setWalletState('Sign profile to save player');
      const message = [
        `gerrystephen.com ${GAME_NAME} profile`,
        `wallet=${signingAddress}`,
        `username=${cleanPlayerProfile.username || shortWallet(signingAddress)}`,
        `pfp=${cleanPlayerProfile.pfp ? 'custom' : 'default'}`,
        `issued=${new Date().toISOString()}`
      ].join('\n');
      let signature = '';
      if (primaryWallet?.connector?.signMessage) {
        signature = await primaryWallet.connector.signMessage(message);
      } else if (primaryWallet?.signMessage) {
        signature = await primaryWallet.signMessage(message);
      } else if (window.ethereum) {
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [hexFromText(message), signingAddress]
        });
      } else {
        throw new Error('Wallet signer unavailable.');
      }
      const nextSignature = signature || 'signed';
      setProfileSignature(nextSignature);
      storageSet(PROFILE_SIGNATURE_KEY, nextSignature);
      storageSet(PROFILE_SIGNATURE_WALLET_KEY, signingAddress);
      storageSet(walletSignatureKey(signingAddress), nextSignature);
      setWalletState('Profile signed');
      setGameMessage('Profile signed. Revealed runs upload automatically.');
    } catch (error) {
      setWalletState(error?.message || 'Profile not signed.');
    }
  }

  return (
    <section className={`monad-game ${isGameApp ? 'app-mode' : ''} ${isGameApp && !gameStarted ? 'start-mode' : ''}`} id="monerge">
      <div className="game-copy">
        <Chapter num="04" kicker="Built on Monad" title={<span className="monerge-logo">{isGameApp ? 'Monerge.' : 'Biome.'}</span>} />
        <p className="lede">
          {isGameApp
            ? 'A wallet-backed focus game for BuildAnything. Merge Monad-coded tiles, choose your difficulty, remember the hidden points, then reveal your run. Connect once; profile signing is remembered so scores can upload without another signature.'
            : 'Biome is currently being built on Monad testnet as my game network: the home for Moncade, Monerge, and future creature games. The story is proof-of-play: connect a wallet, play, build a profile, and let each run become part of the larger Biome.'}
        </p>
        <div className="monanimal-strip" aria-label="Monad character inspirations">
          {MONAD_CHARACTERS.map((character) =>
          <span key={character.name} className={`monanimal-chip tile-${character.value}`}>
            {MONAD_CHARACTER_IMAGES[character.name] ? <img src={MONAD_CHARACTER_IMAGES[character.name]} alt="" aria-hidden="true" /> : <i aria-hidden="true" />}
            <strong>{character.name}</strong>{character.note}
          </span>
          )}
        </div>
        <div className="game-actions">
          {isGameApp
            ? <MonergeWalletButton account={account} label="Connect wallet" onClick={connectMonad} onSignOut={disconnectWallet} onSign={() => signProfile(account)} signed={profileSigned} />
            : <a className="btn primary" href="https://biome.gerrystephen.com" target="_blank" rel="noopener">Open Biome →</a>}
          {isGameApp
            ? <button type="button" className="btn ghost" onClick={newGame}>New run</button>
            : <a className="btn ghost" href="/monerge">Play Monerge →</a>}
        </div>
        {!isGameApp && <div className="desktop-game-details">
          <div className="biome-story-stack">
            <span>01 · Monad network</span>
            <strong>Testnet now, network next.</strong>
            <p>Biome is being shaped on Monad testnet so games, profiles, and proof-of-play records can connect before the larger launch.</p>
          </div>
          <div className="biome-story-stack">
            <span>02 · Moncade</span>
            <strong>The game hub.</strong>
            <p>A creature-game arcade layer for what gets built next across the Monad ecosystem.</p>
          </div>
          <div className="biome-story-stack">
            <span>03 · Monerge</span>
            <strong>The first playable signal.</strong>
            <p>A wallet-connected focus game where runs, profiles, and leaderboards start to prove the loop.</p>
          </div>
        </div>}
      </div>
      <div className="game-shell" role="application" aria-label={`${GAME_NAME} game`}>
        {isGameApp && <button type="button" className="game-hamburger" onClick={() => setGameMenuOpen(true)} aria-label="Open Monerge menu">
          <span></span><span></span><span></span>
        </button>}
        {isGameApp && gameStarted && <button type="button" className="leaderboard-toggle" onClick={() => setLeaderboardOpen(true)} aria-label="Open Monerge leaderboard">
          <span>Leaderboard</span>
          <strong>{leaderboard.length || 0}</strong>
        </button>}
        {isGameApp && !gameStarted && <div className="game-start-screen">
          <div className="start-orbit" aria-hidden="true">
            {MONAD_TILE_LADDER.slice(0, 3).map((tile) =>
              <span key={tile.value} className={`tile-${tile.value} start-monanimal`}>
                <img src={MONAD_CHARACTER_IMAGES[tile.character]} alt="" aria-hidden="true" />
                <strong>{tile.character}</strong>
              </span>
            )}
          </div>
          <div className="start-brand">
            <span>Built on Monad</span>
            <strong className="monerge-wordmark">Monerge</strong>
          </div>
          <p>Pick a mode, merge the tiles, then guess your hidden score. Hardest mode earns the biggest bonus.</p>
          <div className="difficulty-select start-difficulty" aria-label="Difficulty">
            {DIFFICULTY_ORDER.map((key) =>
              <button key={key} type="button" className={difficulty === key ? 'active' : ''} onClick={() => setDifficulty(key)}>
                <strong>{GAME_DIFFICULTIES[key].label}</strong>
                <span>{GAME_DIFFICULTIES[key].tag}</span>
              </button>
            )}
          </div>
          <div className="start-actions">
            <button type="button" onClick={newGame}>Play</button>
            <MonergeWalletButton account={account} label="Connect" onClick={connectMonad} onSignOut={disconnectWallet} onSign={() => signProfile(account)} signed={profileSigned} />
          </div>
          <small>{account ? `${profileSigned ? 'Profile signed' : 'Connected'} as ${cleanPlayerProfile.username || shortWallet(account)}` : 'Connect before reveal to save your run'}</small>
          <p className="wallet-safety-note">Wallet connect is read-only. Monerge asks for a profile signature, never token approvals.</p>
          <div className="install-float-banner home-only" role="note">
            <button type="button" onClick={promptInstallApp}>Add Monerge to Home Screen</button>
            <span>Swipe the board or tap arrows to move.</span>
          </div>
        </div>}
        <div className="game-shell-head">
          <div>
            <span>{isGameApp ? 'Game app' : 'Playable embed'}</span>
            <strong className="monerge-wordmark">Monerge</strong>
          </div>
          <div className="game-shell-menu-actions">
            {!isGameApp && <a href={MONERGE_APP_PATH} target="_blank" rel="noopener">Open app</a>}
          </div>
        </div>
        {gameMenuOpen && <div className="game-menu-panel" role="dialog" aria-modal="true" aria-label={`${GAME_NAME} menu`}>
          <div className="game-menu-card">
            <div className="game-menu-head">
              <div>
                <span>Game menu</span>
                <strong className="monerge-wordmark">Monerge</strong>
              </div>
              <button type="button" onClick={() => setGameMenuOpen(false)} aria-label="Close menu">×</button>
            </div>
            <p>Choose the intensity, keep the hidden score in your head, reveal it at the end, and let Monerge publish the run. Profile signing is remembered per wallet.</p>
            <MonergeProfileEditor profile={profile} account={account} onProfileChange={updateProfile} onPfpUpload={handlePfpUpload} />
            <div className="difficulty-select" aria-label="Difficulty">
              {DIFFICULTY_ORDER.map((key) =>
                <button key={key} type="button" className={difficulty === key ? 'active' : ''} onClick={() => setDifficulty(key)}>
                  <strong>{GAME_DIFFICULTIES[key].label}</strong>
                  <span>{GAME_DIFFICULTIES[key].tag}</span>
                </button>
              )}
            </div>
            <div className="game-menu-actions">
              <MonergeWalletButton account={account} label="Connect wallet" onClick={connectMonad} onSignOut={disconnectWallet} onSign={() => signProfile(account)} signed={profileSigned} />
              {isGameApp && gameStarted && <button type="button" onClick={returnToMonergeHome}>Home</button>}
              <button type="button" onClick={() => { newGame(); setGameMenuOpen(false); }}>New run</button>
              {isGameApp && <button type="button" onClick={() => { unlockMonergeAudio(); setGameMusic((value) => !value); }}>{gameMusic && musicReady ? 'Music off' : 'Music on'}</button>}
              {isGameApp && <button type="button" onClick={() => { unlockMonergeAudio(); setSfxEnabled((value) => !value); }}>{sfxEnabled ? 'SFX off' : 'SFX on'}</button>}
              {isGameApp && canPromptInstall && <button type="button" onClick={promptInstallApp}>Add to Home Screen</button>}
              {isGameApp && <button type="button" onClick={() => { unlockMonergeAudio(); setLeaderboardOpen(true); }}>Leaderboard</button>}
            </div>
            <div className="game-menu-characters" aria-label="Monad character progression">
              {MONAD_TILE_LADDER.map((tile) =>
              <span key={tile.value} className={`tile-${tile.value} ${maxTile >= tile.value ? 'unlocked' : ''}`}>
                {tile.character && MONAD_CHARACTER_IMAGES[tile.character] ? <img className={`character-${tile.character.toLowerCase()}`} src={MONAD_CHARACTER_IMAGES[tile.character]} alt="" aria-hidden="true" /> : <i aria-hidden="true" />}
                <small>{tile.value}</small>
                <strong>{tile.character || tile.code}</strong>
              </span>
              )}
            </div>
            <div className="game-status menu-status">
          <span>{walletState}</span>
          <span>{isMonad ? 'Monad mainnet' : 'Wrong network'}</span>
          <span>{dynamicStatus}</span>
          <span>{moves} moves</span>
              {profileSigned && <span>Profile signed</span>}
            </div>
          </div>
        </div>}
        {leaderboardOpen && <div className="leaderboard-panel" role="dialog" aria-modal="true" aria-label={`${GAME_NAME} leaderboard`}>
          <div className="leaderboard-card">
            <div className="game-menu-head">
              <div>
                <span>Public runs</span>
                <strong>Leaderboard</strong>
              </div>
              <button type="button" onClick={() => setLeaderboardOpen(false)} aria-label="Close leaderboard">×</button>
            </div>
            <Leaderboard entries={leaderboard} limit={50} />
          </div>
        </div>}
        {installGuideOpen && <div className="install-panel" role="dialog" aria-modal="true" aria-label="Add Monerge to home screen">
          <div className="install-card">
            <div className="game-menu-head">
              <div>
                <span>Mobile app</span>
                <strong>Add Monerge</strong>
              </div>
              <button type="button" onClick={() => setInstallGuideOpen(false)} aria-label="Close install instructions">×</button>
            </div>
            <div className="install-steps">
              <div>
                <strong>iPhone</strong>
                <p>Open this page in Safari, tap Share, then choose Add to Home Screen. Name it Monerge and tap Add.</p>
              </div>
              <div>
                <strong>Android</strong>
                <p>Open this page in Chrome, tap the browser menu, then Install app or Add to Home screen.</p>
              </div>
            </div>
            <button type="button" className="install-primary" onClick={() => setInstallGuideOpen(false)}>Got it</button>
          </div>
        </div>}
        <div className="game-shell-actions" aria-label="Wallet controls">
          <MonergeWalletButton account={account} label="Connect" onClick={connectMonad} onSignOut={disconnectWallet} onSign={() => signProfile(account)} signed={profileSigned} />
        </div>
        <div className="game-hud">
          <div><span>Hidden score</span><strong>{scoreReveal ? score : '???'}</strong></div>
          <div><span>Best</span><strong>{best}</strong></div>
          <div className="hud-lava"><span>{hazardsEnabled ? 'Lava' : 'Mode'}</span><strong>{hazardsEnabled ? DIRECTION_LABELS[lavaDirection] : currentDifficulty.label}</strong></div>
          <div><span>Time</span><strong>{currentDifficulty.timed ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}` : 'Open'}</strong></div>
          <button type="button" className="hud-new-game" onClick={newGame}>New game</button>
        </div>
        <div className="game-side-panel">
          <div className="tile-ladder" aria-label="Monad tile progression">
            {MONAD_TILE_LADDER.map((tile) =>
            <div key={tile.value} className={`tile-ladder-card tile-${tile.value} ${maxTile >= tile.value ? 'unlocked' : ''}`}>
                {tile.character && MONAD_CHARACTER_IMAGES[tile.character] ? <img className={`ladder-character character-${tile.character.toLowerCase()}`} src={MONAD_CHARACTER_IMAGES[tile.character]} alt="" aria-hidden="true" /> : <i aria-hidden="true" />}
                <span>{tile.value}</span>
                <strong>{tile.character || tile.code}</strong>
                <small>{tile.code}</small>
              </div>
            )}
          </div>
          {isGameApp && <Leaderboard entries={leaderboard} compact limit={50} />}
        </div>
        <div
          className={`game-board merge-board ${hazardsEnabled ? `lava-${lavaDirection} ${freezeDirection ? `freeze-${freezeDirection}` : ''}` : 'no-hazards'} ${hazardHit ? `hit-${hazardHit}` : ''}`}
          style={{ '--hazard-pulse': hazardPulse }}
          role="grid"
          aria-label={`${GAME_NAME} board`}
          onTouchStart={(event) => {
            if (event.target.closest('input, button, textarea, label, a')) return;
            event.preventDefault();
            setTouchStart({ x: event.touches[0].clientX, y: event.touches[0].clientY });
          }}
          onTouchMove={(event) => {
            if (event.target.closest('input, button, textarea, label, a')) return;
            event.preventDefault();
          }}
          onTouchEnd={handleTouchEnd}>
          <div className={`freeze-wall ${freezeDirection ? `show freeze-${freezeDirection}` : ''}`} aria-hidden="true" />
          <div className={`hazard-burst ${hazardHit ? `show ${hazardHit}` : ''}`} aria-hidden="true" />
          {board.map((value, cell) =>
          <div
            key={cell}
            role="gridcell"
            className={`game-cell merge-cell ${value ? 'filled' : ''} ${MONAD_TILE_CHARACTERS[value] ? 'has-character' : ''} tile-${value}`}
            aria-label={value ? `${value} tile` : 'Empty tile'}>
              {value ? <>{MONAD_TILE_CHARACTERS[value] && MONAD_CHARACTER_IMAGES[MONAD_TILE_CHARACTERS[value]] ? <img className={`tile-character character-${MONAD_TILE_CHARACTERS[value].toLowerCase()}`} src={MONAD_CHARACTER_IMAGES[MONAD_TILE_CHARACTERS[value]]} alt="" aria-hidden="true" /> : null}<strong>{value}</strong><span>{MONAD_TILE_NAMES[value] || 'MON'}</span>{MONAD_TILE_CHARACTERS[value] && <em>{MONAD_TILE_CHARACTERS[value]}</em>}</> : null}
            </div>
          )}
          {gameOver && <form className="game-over" onSubmit={revealBlindScore} onTouchStart={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()} onTouchEnd={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <strong>{scoreReveal ? 'Score revealed' : 'Guess your score'}</strong>
            {scoreReveal
              ? <>
                <div className="winner-card-preview" aria-label="Monerge winner card preview">
                  <span>Winner card</span>
                  <strong>{Number(scoreReveal.final || 0).toLocaleString()}</strong>
                  <em>{lastRevealedEntry?.difficulty || currentDifficulty.label} · max tile {lastRevealedEntry?.maxTile || maxTile} · {lastRevealedEntry?.moves || moves} moves</em>
                  <small>{lastRevealedEntry ? playerName(lastRevealedEntry) : playerName({ wallet: account, username: cleanPlayerProfile.username })}</small>
                </div>
                <span>Actual {scoreReveal.actual} · off by {scoreReveal.miss} · time {scoreReveal.timeBonus} · mode {scoreReveal.difficultyBonus} · final {scoreReveal.final}</span>
              </>
              : <input inputMode="numeric" pattern="[0-9]*" value={scoreGuess} onChange={(event) => setScoreGuess(event.target.value)} placeholder="Your score guess" aria-label="Score guess" />}
            {scoreReveal && <small className={`chain-run-status ${onChainRun.status}`}>
              {onChainRun.status === 'submitted'
                ? `Monad verified ${shortWallet(onChainRun.txHash)}`
                : onChainRun.status === 'pending'
                  ? 'Confirming Monad run...'
                  : onChainRun.status === 'not-configured'
                    ? 'On-chain contract pending deployment'
                    : onChainRun.error || 'Run saved locally'}
            </small>}
            <div className="game-over-actions">
              {!scoreReveal && <button type="submit">Reveal</button>}
              {scoreReveal && lastRevealedEntry && <button type="button" onClick={() => downloadMonergeWinnerCard(lastRevealedEntry)}>Save card</button>}
              {scoreReveal && lastRevealedEntry && <a href={shareMonergeRunUrl(lastRevealedEntry)} target="_blank" rel="noopener">Post on X</a>}
              {scoreReveal && lastRevealedEntry && account && MONERGE_RUNS_CONTRACT && onChainRun.status !== 'submitted' && onChainRun.status !== 'pending' && <button type="button" onClick={() => submitRunOnMonad(lastRevealedEntry)}>Verify on Monad</button>}
              <button type="button" onClick={newGame}>Run it back</button>
            </div>
          </form>}
        </div>
        <div className="hazard-legend" aria-label="Current hazard rules">
          <span className="lava-dot">{hazardsEnabled ? `Lava blocks ${DIRECTION_LABELS[lavaDirection]}` : `${currentDifficulty.label}: lava off`}</span>
          <span className="freeze-dot">{hazardsEnabled ? (freezeDirection ? `Freeze skips after ${DIRECTION_LABELS[freezeDirection]}` : 'Freeze is clear') : `${currentDifficulty.tag}: freeze off`}</span>
        </div>
        <div className="game-controls" aria-label="Move controls">
          <button type="button" className={`${pressedDirection === 'up' ? 'is-pressed' : ''} ${hazardsEnabled && lavaDirection === 'up' ? 'is-lava' : ''} ${hazardsEnabled && freezeDirection === 'up' ? 'is-freeze' : ''}`} onClick={() => pressMove('up')}>↑</button>
          <button type="button" className={`${pressedDirection === 'left' ? 'is-pressed' : ''} ${hazardsEnabled && lavaDirection === 'left' ? 'is-lava' : ''} ${hazardsEnabled && freezeDirection === 'left' ? 'is-freeze' : ''}`} onClick={() => pressMove('left')}>←</button>
          <button type="button" className={`${pressedDirection === 'down' ? 'is-pressed' : ''} ${hazardsEnabled && lavaDirection === 'down' ? 'is-lava' : ''} ${hazardsEnabled && freezeDirection === 'down' ? 'is-freeze' : ''}`} onClick={() => pressMove('down')}>↓</button>
          <button type="button" className={`${pressedDirection === 'right' ? 'is-pressed' : ''} ${hazardsEnabled && lavaDirection === 'right' ? 'is-lava' : ''} ${hazardsEnabled && freezeDirection === 'right' ? 'is-freeze' : ''}`} onClick={() => pressMove('right')}>→</button>
        </div>
        <div className="game-prompt">
          <strong>{scoreReveal ? `Final ${scoreReveal.final}` : gameOver ? 'Board locked. Guess before you reveal.' : maxTile >= 2048 ? 'Emonad unlocked.' : gameMessage}</strong>
          <span>{moves} moves · max tile {maxTile} · {currentDifficulty.note}</span>
        </div>
      </div>
    </section>);
}

function Leaderboard({ entries, compact = false, limit }) {
  const maxEntries = limit ?? (compact ? 3 : 50);
  const boardEntries = entries?.length ? dedupeLeaderboard(entries).slice(0, maxEntries) : [];
  return (
    <div className={`leaderboard ${compact ? 'compact' : ''} ${maxEntries > 3 ? 'scrollable' : ''}`} aria-label="Monerge leaderboard">
      <div className="leaderboard-head">
        <span>Public runs</span>
        <strong>Leaderboard</strong>
      </div>
      {boardEntries.length ? (
        <ol>
          {boardEntries.map((entry, index) => (
            <li key={entry.id || `${entry.wallet}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div className="leaderboard-avatar" aria-hidden="true">
                {entry.pfp ? <img src={entry.pfp} alt="" /> : <i>{playerName(entry).slice(0, 1).toUpperCase()}</i>}
              </div>
              <strong>{entry.score}</strong>
              <em>{entry.txHash ? 'On-chain' : entry.signature ? 'Profile' : 'Revealed'} · {entry.difficulty}</em>
              <small><b>{playerName(entry)}</b> · {entry.wallet ? shortWallet(entry.wallet) : 'No wallet yet'} · max {entry.maxTile}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p>No runs yet. Reveal a score and it appears here.</p>
      )}
    </div>
  );
}

// ---------- Inkfinity Canvas ----------
const INKFINITY = [
{ title: 'NFTVisionary', tag: 'Featured', note: 'The piece that started it.', featured: true, image: 'assets/inkfinity-visionary.png' },
{ title: 'NuttyProfessor', tag: 'Canvas', note: 'Pen on paper. Signed E. Guy.', image: 'assets/inkfinity-professor.png' },
{ title: 'ThunderOfThoughts', tag: 'Canvas', note: 'A crowded mind, distilled.', image: 'assets/inkfinity-thoughts.png' }];

function InkfinityGallery() {
  const inkItems = [...INKFINITY, ...INKFINITY];
  return (
    <section className="inkfinity" id="inkfinity">
      <Chapter num="03" kicker="ericgoodguy · Inkfinity Canvas" title="Signed work, carried forward." />
      <p className="lede inkfinity-lede">Inkfinity Canvas brings my dad's hand-signed work into the builder story: craft, signature, permanence, and a family standard that still shapes how I move.</p>
      <div className="ink-grid">
        {inkItems.map((p, i) =>
            <a key={`${p.title}-${i}`} className={`ink-card ${p.featured ? 'featured' : ''} ${i >= INKFINITY.length ? 'ink-duplicate' : ''}`} href="https://opensea.io/collection/inkfinity-canvas" target="_blank" rel="noopener" style={{ '--i': i }}>
              <div className="ink-canvas">
                <div className="ink-frame real-ink-art">
                  <img src={p.image} alt={`${p.title} Inkfinity Canvas artwork`} loading="lazy" />
                  <div className="ink-stamp">{p.tag}</div>
                </div>
              </div>
              <div className="ink-meta">
                <div className="ink-title">{p.title}</div>
                <div className="ink-note">{p.note}</div>
              </div>
            </a>
        )}
      </div>
      <div className="ink-actions">
        <a className="btn primary ink-cta" href="https://opensea.io/collection/inkfinity-canvas" target="_blank" rel="noopener">View the collection on OpenSea →</a>
        <a className="btn primary ink-cta ink-x" href="https://x.com/inkfinitycanvas" target="_blank" rel="noopener" aria-label="Inkfinity Canvas on X">
          <SocialIcon name="X" />
        </a>
      </div>
    </section>);

}

// ---------- Stats ----------
function Stats() {
  return (
    <section className="stats">
      <div className="stat"><div className="num">5</div><div className="lbl">years on-chain</div></div>
      <div className="stat"><div className="num">15</div><div className="lbl">years building beside Eric</div></div>
      <div className="stat"><div className="num">1</div><div className="lbl">penguin in a flat cap</div></div>
      <div className="stat"><div className="num">40+</div><div className="lbl">family construction craft</div></div>
    </section>);

}

// ---------- Now Building ----------
const NOW = [
{ title: 'AI Agents', note: 'Autonomous workers for hospitality ops, content systems, and the useful glue between them.', logo: 'assets/pudgy-penguin-cutout.png', alt: 'Gerry Stephen Pudgy Penguin', className: 'pudgy-agent-logo', href: 'https://x.com/gerrydoteth' },
{ title: 'Blue Star Web3', note: 'Live now: ecosystem-holder benefits for vacation, worcation, and nomadic stays.', logo: 'assets/bluestar-logo.png', alt: 'Blue Star Apartments & Hotel logo', className: 'blue-star-logo', href: 'https://x.com/bluestarstay' },
{ title: 'Seal Stay', note: 'Where Web3 meets hospitality. Stay tuned for the next stay layer.', logo: 'assets/seal-stay-logo.png', alt: 'Seal Stay logo', href: 'https://x.com/sappylifestyle' },
{ title: 'Great Terriers', note: 'Coming soon: the AI-native collection featuring my dog, Reo. It started as a 2022 idea and keeps moving forward.', logo: 'assets/great-terriers-coming-soon.png', alt: 'Great Terriers coming soon artwork', className: 'great-terriers-logo', href: 'https://x.com/greatterriers' }];

function NowBuilding() {
  return (
    <section className="now-building" id="now">
      <Chapter num="05" kicker="Now" title="Currently building the next layer." />
      <div className="nb-grid">
        {NOW.map((n, i) =>
        <Reveal key={n.title} delay={i * 80}>
            <a className={`nb-card ${n.className || ''}`} href={n.href || '#now'} target={n.href ? '_blank' : undefined} rel={n.href ? 'noopener' : undefined}>
              {n.href && <span className="nb-x-mark" aria-hidden="true"><SocialIcon name="X" /></span>}
              {n.logo ? <img className={`nb-logo ${n.className || ''}`} src={n.logo} alt={n.alt} /> : <div className="nb-abstract-mark" aria-hidden="true">{n.glyph}</div>}
              <div className="nb-title">{n.title}</div>
              <div className="nb-note">{n.note}</div>
            </a>
          </Reveal>
        )}
      </div>
    </section>);

}

// ---------- Blue Star ----------
function BlueStar({ y, intensity, warm }) {
  const k = intensity / 100;
  return (
    <section className={`venture bluestar ${warm ? 'warm' : ''}`} id="bluestar">
      <div className="venture-bg" style={{ transform: `translate3d(0, ${y * 0.04 * k}px, 0)` }}>
        <div className="bs-sun" />
      </div>
      <div className="venture-grid">
        <Reveal>
          <div className="venture-copy">
            <Chapter num="06" kicker="IRL · Hospitality" title="Blue Star Apartments & Hotel." />
            <p className="lede big">Blue Star is part of the Guy family build story: construction roots, island hospitality, and years of work turned into a place people can actually stay.</p>
            <ul className="venture-bullets">
              <li><span>★</span> Long & short-stay suites</li>
              <li><span>★</span> Sea-facing balconies</li>
              <li><span>★</span> Local hospitality with digital-native operations</li>
            </ul>
            <a className="web3-callout" href="https://www.bluestarstay.com/web3" target="_blank" rel="noopener">
              <span>Web3 stays are live</span>
              <strong>Sappy Seals and Pudgy ecosystem holders get booking benefits. Inkfinity Canvas holders sit in the founders tier.</strong>
            </a>
            <div className="venture-actions">
              <a className="btn primary blue" href="https://www.bluestarstay.com/web3" target="_blank" rel="noopener">Book a stay →</a>
              <a className="btn ghost" href="https://www.instagram.com/bluestarstay/" target="_blank" rel="noopener">Instagram</a>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="venture-vis">
            <div className="hotel-scene" aria-label="Blue Star hotel visual">
              <img className="hotel-photo" src="assets/bluestar-property.jpg" alt="Blue Star Apartments and Hotel property and pool" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>);

}

// ---------- Zeppole ----------
function Zeppole({ y, intensity, warm }) {
  const k = intensity / 100;
  return (
    <section className={`venture zeppole ${warm ? 'warm' : ''}`} id="zeppole">
      <div className="venture-bg z-bg" style={{ transform: `translate3d(0, ${y * 0.03 * k}px, 0)` }} />
      <div className="venture-grid reverse">
        <Reveal>
          <div className="venture-vis">
            <div className="z-card z-photo-card">
              <img className="z-shop-photo" src="assets/zeppole-shop.jpg" alt="Zeppole Dolci outdoor seating and shopfront" />
              <img className="z-logo" src="assets/zeppole-logo.png" alt="Zeppole Dolci logo" />
              <div className="z-stamp">
                <div>ZEPPOLE</div>
                <div>DOLCI</div>
                <div className="tiny">EST. WARM</div>
              </div>
              <div className="z-note">fresh pastry · brunch · coffee</div>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="venture-copy">
            <Chapter num="07" kicker="IRL · Eatery + Bakery" title={<>Zeppole Dolci<br />Café. Eatery. Bakery</>} />
            <p className="lede big">
              Sugar, dough, a small machine that makes espresso. A café that takes pastry
              seriously and itself less so. Fried to order. Cornetti at sunrise.
            </p>
            <ul className="venture-bullets warm">
              <li><span>●</span> Fresh pastries, daily</li>
              <li><span>●</span> American/Italian cuisine - Brunch!</li>
              <li><span>●</span> Catering and events</li>
            </ul>
            <div className="venture-actions">
              <a className="btn primary warm" href="https://zeppoledolci.com/" target="_blank" rel="noopener">Order Now →</a>
              <a className="btn ghost warm" href="https://www.instagram.com/zeppoledolci/" target="_blank" rel="noopener">Instagram →</a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>);

}

function Ventures({ y, intensity, warm }) {
  const k = intensity / 100;
  return (
    <section className={`ventures-combo ${warm ? 'warm' : ''}`} id="ventures">
      <div className="ventures-bg" style={{ transform: `translate3d(0, ${y * 0.025 * k}px, 0)` }} />
      <Chapter num="06" kicker="IRL ventures" title="Stay, eat, and build from the same standard." />
      <div className="ventures-panel">
        <Reveal>
          <article className="venture-mini bluestar-mini" id="bluestar">
            <div className="venture-mini-photo">
              <img src="assets/bluestar-property.jpg" alt="Blue Star Apartments and Hotel property and pool" loading="lazy" />
              <img className="venture-mini-logo bluestar-photo-logo" src="assets/bluestar-logo.png" alt="Blue Star Apartments & Hotel logo" loading="lazy" />
            </div>
            <div className="venture-mini-copy">
              <span>Hospitality · Web3 live</span>
              <h3>Blue Star Apartments & Hotel</h3>
              <p>Family-built Grenada stays with Web3 booking benefits for Sappy Seals, Pudgy ecosystem, and Inkfinity Canvas holders.</p>
              <div className="venture-actions">
                <a className="btn primary blue" href="https://www.bluestarstay.com/web3" target="_blank" rel="noopener">Book a stay →</a>
                <a className="btn ghost" href="https://www.instagram.com/bluestarstay/" target="_blank" rel="noopener">Instagram</a>
              </div>
            </div>
          </article>
        </Reveal>
        <Reveal delay={100}>
          <article className="venture-mini zeppole-mini" id="zeppole">
            <div className="venture-mini-photo">
              <img src="assets/zeppole-shop.jpg" alt="Zeppole Dolci cafe interior with pastry case" loading="lazy" />
              <img className="venture-mini-logo" src="assets/zeppole-logo.png" alt="Zeppole Dolci logo" loading="lazy" />
            </div>
            <div className="venture-mini-copy">
              <span>Cafe · eatery · bakery</span>
              <h3>Zeppole Dolci</h3>
              <p>Fresh pastries, American/Italian brunch, coffee, catering, and events with a warm IRL counterpoint to the colder iglu energy.</p>
              <div className="venture-actions">
                <a className="btn primary warm" href="https://zeppoledolci.com/" target="_blank" rel="noopener">Order Now →</a>
                <a className="btn ghost warm" href="https://www.instagram.com/zeppoledolci/" target="_blank" rel="noopener">Instagram</a>
              </div>
            </div>
          </article>
        </Reveal>
      </div>
    </section>);

}

// ---------- Contact ----------
function Contact() {
  const socials = [
  { name: 'X', href: 'https://x.com/gerrydoteth' },
  { name: 'Instagram', href: 'https://www.instagram.com/gerrydoteth/' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@gerrydoteth' },
  { name: 'Farcaster', href: 'https://warpcast.com/gerrydoteth' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/in/gerrydoteth/' },
  { name: 'Telegram', href: 'https://t.me/gerrydoteth' },
  { name: 'Twitch', href: 'https://www.twitch.tv/gerrydoteth' }];
  const cards = [
  { kind: '◈ biome', handle: 'biome.gerrystephen.com', note: 'The creature-game ecosystem on Monad. A proof-of-play game coming soon.', href: 'https://biome.gerrystephen.com', label: 'Open' },
  { kind: '◆ sappy', handle: 'sappy.gerrystephen.com', note: 'The Sappy-side home base for the ecosystem, memes, and collector trail.', href: 'https://sappy.gerrystephen.com', label: 'Open' },
  { kind: '★ bluestar', handle: '@bluestarstay', note: 'Family-built hospitality in Grenada.', href: 'https://www.instagram.com/bluestarstay/', label: 'Open', warm: true },
  { kind: '● zeppole', handle: '@zeppoledolci', note: 'Cafe, eatery, bakery, and the daily coffee ritual.', href: 'https://www.instagram.com/zeppoledolci/', label: 'Open', warm: true }];

  return (
    <section className="contact" id="contact">
      <Chapter num="08" kicker="Hello" title="Come through the iglu." />
      <div className="contact-grid">
        {cards.map((c, i) =>
        <Reveal key={c.kind} delay={i * 80}>
            <a href={c.href} target={c.href.startsWith('#') ? undefined : '_blank'} rel="noopener" className={`cc ${c.warm ? 'warm' : ''}`}>
              <div className="cc-kind">{c.kind}</div>
              <div className="cc-handle">{c.handle}</div>
              <div className="cc-note">{c.note}</div>
              <div className="cc-link">{c.label} →</div>
            </a>
          </Reveal>
        )}
      </div>
      <div className="signoff">My father, a visionary, successfully built for decades.<br />I carry the standard forward.</div>
      <div className="dedication">Built from the Guy family standard. <span>ericgoodguy · strength before beauty</span></div>
      <div className="social-strip" aria-label="Gerry Stephen socials">
        {socials.map((social) =>
          <a key={social.name} href={social.href} target="_blank" rel="noopener" aria-label={`Gerry Stephen on ${social.name}`}>
            <SocialIcon name={social.name} />
          </a>
        )}
      </div>
    </section>);

}

// ---------- App ----------
function App() {
  const [tweaks, setTweaks] = useTweaks(TWEAK_DEFAULTS);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const y = useScrollY();
  const mouse = useMouse();
  const isMobileViewport = useMediaQuery('(max-width: 700px), (pointer: coarse)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const liteParallax = isMobileViewport || prefersReducedMotion;
  const appMode = getAppMode();
  const isGameApp = appMode === 'monerge' || appMode === 'iglu-merge';
  const soundReady = useAmbientScrollSound(y, soundEnabled);

  useEffect(() => {
    document.documentElement.style.setProperty('--display-font', `"${tweaks.displayFont}"`);
    document.documentElement.style.setProperty('--accent-hue', tweaks.accentHue);
  }, [tweaks.displayFont, tweaks.accentHue]);

  useEffect(() => {
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    const favicon = document.querySelector('link[rel="icon"]');
    if (isGameApp) {
      document.title = 'Monerge · Gerry Stephen';
      appleIcon?.setAttribute('href', '/assets/monerge-icon-512.png?v=ecosystems-app-93');
      favicon?.setAttribute('href', '/assets/monerge-icon-512.png?v=ecosystems-app-93');
      return;
    }
    document.title = 'Gerry Stephen · Business, Web3, and the Iglu';
    appleIcon?.setAttribute('href', '/assets/gerrys-iglu-icon-512.png?v=ecosystems-app-93');
    favicon?.setAttribute('href', '/assets/gerrys-iglu-icon-512.png?v=ecosystems-app-93');
  }, [isGameApp]);

  useEffect(() => {
    if (!window.location.hash) return;
    const rawId = window.location.hash.slice(1);
    const id = rawId === 'monad-game' ? 'monerge' : rawId;
    if (rawId === 'monad-game') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#monerge`);
    }
    const scrollToHash = () => {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ block: 'start' });
    };
    const frame = requestAnimationFrame(() => window.setTimeout(scrollToHash, 80));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (isGameApp) {
    return (
      <div className="page game-app-page" data-warm={tweaks.warmChapters}>
        <MonadGame />
      </div>
    );
  }

  return (
    <div className={`page ${isGameApp ? 'game-app-page' : ''}`} data-warm={tweaks.warmChapters}>
      <Topbar />
      <button
        type="button"
        className={`sound-toggle ${soundEnabled ? 'on' : 'off'}`}
        onClick={() => setSoundEnabled((value) => !value)}
        aria-pressed={soundEnabled}
        aria-label={soundEnabled ? 'Turn sound off' : 'Turn sound on'}
      >
        <span>Sound</span>
        <i>{soundReady && soundEnabled ? 'On' : 'Off'}</i>
      </button>
      <Hero y={y} mouse={mouse} intensity={tweaks.parallaxIntensity} lite={liteParallax} />
      {tweaks.snowfall && !prefersReducedMotion && <Snowfall count={isMobileViewport ? 22 : 60} intensity={(tweaks.parallaxIntensity / 100) * (isMobileViewport ? 0.62 : 1)} scrollY={y} />}
      <Marquee items={['gerrystephen.eth', 'inkfinity canvas', 'great terriers', 'sappy seals', 'pudgy penguins', 'web3 since 2021', 'building IRL', 'hot weather, iced coffee']} />
      <Timeline y={y} intensity={tweaks.parallaxIntensity} />
      <NftCarousel />
      <InkfinityGallery />
      <MonadGame />
      <Stats />
      <NowBuilding />
      <Ventures y={y} intensity={tweaks.parallaxIntensity} warm={tweaks.warmChapters} />
      <Contact />
      <footer className="foot">
        <span>© {new Date().getFullYear()} gerrystephen.eth · @gerrydoteth · the iglu</span>
        <span>MADE WITH COOL HANDS & WARM INTENTIONS</span>
      </footer>
      <TweaksUI tweaks={tweaks} setTweak={setTweaks} />
    </div>);

}

function TweaksUI({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks" defaultPosition={{ right: 24, bottom: 24 }}>
      <TweakSection label="Atmosphere">
        <TweakSlider label="Parallax intensity" value={tweaks.parallaxIntensity} min={0} max={100} step={5} onChange={(v) => setTweak('parallaxIntensity', v)} />
        <TweakToggle label="Snowfall" value={tweaks.snowfall} onChange={(v) => setTweak('snowfall', v)} />
        <TweakToggle label="Warm chapter palette" value={tweaks.warmChapters} onChange={(v) => setTweak('warmChapters', v)} />
      </TweakSection>
      <TweakSection label="Type & color">
        <TweakSelect label="Display font" value={tweaks.displayFont}
        options={[
        { label: 'Inter Tight', value: 'Inter Tight' },
        { label: 'Instrument Serif', value: 'Instrument Serif' },
        { label: 'Fraunces', value: 'Fraunces' },
        { label: 'Space Grotesk', value: 'Space Grotesk' }]
        }
        onChange={(v) => setTweak('displayFont', v)} />
        <TweakSlider label="Accent hue" value={tweaks.accentHue} min={150} max={280} step={5} onChange={(v) => setTweak('accentHue', v)} />
      </TweakSection>
    </TweaksPanel>);

}

function mountApp() {
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <AppErrorBoundary>
      <DynamicContextProvider settings={DYNAMIC_SETTINGS}>
          <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
              <DynamicWagmiConnector>
                <span className="build-version" aria-hidden="true">{SITE_BUILD_VERSION}</span>
                <MonergeDynamicBridge />
                <App />
              </DynamicWagmiConnector>
          </QueryClientProvider>
        </WagmiProvider>
      </DynamicContextProvider>
    </AppErrorBoundary>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp, { once: true });
} else {
  mountApp();
}
