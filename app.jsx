/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo } = React;

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

function useMouse() {
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => {
    const onMove = (e) => setPos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return pos;
}

function useAmbientScrollSound(y) {
  const audioRef = useRef(null);

  useEffect(() => {
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
      if (audioRef.current) {
        audioRef.current.ctx.resume?.();
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

      master.gain.value = 0.08;
      beachGain.gain.value = 0.7;
      snowGain.gain.value = 0;
      beach.filter.connect(beachGain).connect(master);
      snow.filter.connect(snowGain).connect(master);
      master.connect(ctx.destination);

      audioRef.current = { ctx, beachGain, snowGain, beach, snow };
      ctx.resume?.();
    }

    const opts = { passive: true };
    window.addEventListener('pointerdown', startAmbience, opts);
    window.addEventListener('wheel', startAmbience, opts);
    window.addEventListener('touchstart', startAmbience, opts);
    window.addEventListener('keydown', startAmbience);
    return () => {
      window.removeEventListener('pointerdown', startAmbience);
      window.removeEventListener('wheel', startAmbience);
      window.removeEventListener('touchstart', startAmbience);
      window.removeEventListener('keydown', startAmbience);
      const audio = audioRef.current;
      if (!audio) return;
      audio.beach.source.stop();
      audio.snow.source.stop();
      audio.ctx.close?.();
      audioRef.current = null;
    };
  }, []);

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
  }, [y]);
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
  const start = performance.now();
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    window.scrollTo(0, startY + delta * ease(progress));
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} className={`reveal ${seen ? 'in' : ''} ${className}`} style={{ transitionDelay: delay + 'ms' }}>
      {children}
    </div>);

}

function Snowfall({ count = 50, intensity = 1 }) {
  const flakes = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 2 + Math.random() * 4,
    delay: Math.random() * -20,
    dur: 14 + Math.random() * 18,
    drift: (Math.random() - 0.5) * 50,
    op: 0.4 + Math.random() * 0.5
  })), [count]);
  return (
    <div className="snowfall" aria-hidden="true">
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
        <a href="#nfts">Ecosystems</a>
        <a href="#inkfinity">Inkfinity</a>
        <a href="#monad-game">Monad Game</a>
        <a href="#now">Now</a>
        <a href="#bluestar">Hospitality</a>
        <a href="#zeppole">Cafe</a>
        <a href="#contact">Contact</a>
      </nav>
      <a href="https://opensea.io/profile/gerrystephen" target="_blank" rel="noopener" className="top-cta">OpenSea</a>
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
function Hero({ y, mouse, intensity }) {
  const k = intensity / 100;
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const top = window.scrollY + r.top;
      const len = Math.max(1, ref.current.offsetHeight - window.innerHeight);
      const p = Math.max(0, Math.min(1, (window.scrollY - top) / len));
      setProgress(p);
    };
    const onScroll = () => {if (!raf) raf = requestAnimationFrame(compute);};
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const px = (mouse.x - 0.5) * 30 * k;
  const py = (mouse.y - 0.5) * 20 * k;
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
    slowScrollTo(target, 3600);
  };

  return (
    <section className="hero" id="top" ref={ref}>
      <div className="hero-pin">
        <div className="cold-wash" style={{ opacity: Math.min(0.82, progress * 1.25) }} />
        <div className="layer sky" style={{ transform: `translate3d(0, ${skyY}px, 0)` }}>
          <div className="aurora" />
          <div className="sun" style={{ transform: `translate3d(${px * 0.3}px, ${progress * -40}px, 0)` }} />
        </div>
        <div className="cloud c1" style={{ transform: `translate3d(${y * 0.25 * k - 60 + px * 0.4}px, ${progress * -20}px, 0)` }} />
        <div className="cloud c2" style={{ transform: `translate3d(${y * -0.18 * k + 60 - px * 0.4}px, ${progress * -10}px, 0)` }} />
        <div className="cloud c3" style={{ transform: `translate3d(${y * 0.12 * k + px * 0.2}px, ${progress * -30}px, 0)` }} />

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
          <div className="wave w1" style={{ transform: `translateX(${(progress * 60 + y * 0.05) * -1}px)` }} />
          <div className="wave w2" style={{ transform: `translateX(${progress * 80 + y * 0.04}px)` }} />
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
          <div className="hero-cta">
            <a className="btn primary" href="#journey" onClick={rideParallax}>Scroll to discover →</a>
            <a className="btn ghost" href="#nfts">My community ecosystems</a>
          </div>
        </div>

        <div className="terminal-copy terminal-left" style={{ opacity: copyOpacity }}>
          <strong>IGLU // GERRY STEPHEN</strong>
          <span>Copyright © 2026</span>
          <span>Business / Web3 / Legacy</span>
        </div>

        <div className="terminal-copy terminal-right" style={{ opacity: copyOpacity }}>
          <strong>///// Manifesto</strong>
          <span>Build useful things at the intersection of community, hospitality, AI, and crypto.</span>
        </div>

        <div className="father-note" style={{ opacity: copyOpacity }}>
          <span>Strength before beauty</span>
          <small>Eric Guy</small>
        </div>

        <div className="hero-bigtitle" style={{ opacity: titleOp, transform: `translate3d(0, ${(1 - titleOp) * 60}px, 0) scale(${0.96 + titleOp * 0.04})` }}>
          <div className="bt-kicker">welcome to</div>
          <div className="bt-title">THE IGLU</div>
          <div className="bt-sub">a small home on the internet · gerrystephen.eth</div>
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
{ year: '2021', tag: 'Inkfinity Canvas · family craft', body: 'Eric Guy signed the work by hand. Inkfinity Canvas put that signature somewhere permanent.' },
{ year: '2022', tag: 'The Guy standard', body: 'My dad ran construction for decades. I spent fifteen years beside him learning how real work gets scoped, built, and carried forward. His legacy now lives on forever.' },
{ year: '2022', tag: 'Lil Pudgy chapter', body: 'I had a Lil Pudgy early, sold it, and kept circling the ecosystem from the outside.' },
{ year: '2023', tag: 'Community & tools', body: 'I kept showing up for Sappy Seals with constant memes across X, Instagram, TikTok, and YouTube Shorts while supporting the whole ecosystem. I still do.' },
{ year: '2024', tag: 'IRL bridge', body: 'Fifteen years building beside my dad turned into a new chapter: hospitality, food, local operations, and community.' },
{ year: '2025', tag: 'AI expansion', body: 'The huge uptick in AI capability changed what I could build: operations, memes, trades, and Great Terriers, a collection I started in 2022.' },
{ year: '2026', tag: 'Actual Pudgy era', body: 'This is when I became an actual Pudgy Penguin holder. The iglu finally had its mascot.' }];


function Timeline() {
  return (
    <section className="timeline" id="journey">
      <Chapter num="01" kicker="On-chain" title="The road from collector to operator." />
      <div className="rail">
        <div className="rail-line" />
        {TIMELINE.map((t, i) =>
        <Reveal key={t.year} delay={i * 60} className={`rail-item ${i % 2 ? 'right' : 'left'}`}>
            <div className="rail-card">
              <div className="rc-year">{t.year}</div>
              <div className="rc-tag">{t.tag}</div>
              <p>{t.body}</p>
            </div>
            <div className="rail-pin"><div /></div>
          </Reveal>
        )}
      </div>
    </section>);

}

// ---------- Projects ----------
const PROJECTS = [
{ title: 'Inkfinity Canvas', kind: 'Signed work · 2021', note: 'Eric Guy signed canvases, preserved as a permanent collection of craft and authorship.', glyph: 'EG', href: 'https://opensea.io/collection/inkfinity-canvas' },
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

const NFT_ECOSYSTEMS = [
{
  id: 'sappy',
  label: 'Sappy Seals ecosystem',
  note: 'Seals, Omnia Pets, Omnia items, and PIXL.',
  keywords: ['sappy', 'pixl', 'omnia', 'pets'],
  fallback: [
  { name: 'Sappy Seals ecosystem', collection: 'Owned-token images only', glyph: 'SS', tokenId: 'pending', contract: 'pending' },
  { name: 'PIXL', collection: 'Omnia ecosystem', glyph: 'PIXL', tokenId: 'asset', amount: 'syncing', chain: 'Ethereum' },
  { name: 'Omnia items', collection: 'Owned-token images only', glyph: 'OM', tokenId: 'pending', contract: 'pending' }]
},
{
  id: 'pudgy',
  label: 'Pudgy Penguins ecosystem',
  note: 'The penguin, Lil Pudgy, Pudgy Rods, and PENGU.',
  keywords: ['pudgy', 'penguin', 'lil pudgy', 'rod', 'pengu'],
  fallback: [
  { name: 'Pudgy Penguin', collection: 'Pudgy Penguins ecosystem', image: 'assets/pudgy-penguin.webp', tokenId: 'pending', contract: 'pending' },
  { name: 'PENGU', collection: 'Pudgy Penguins ecosystem', glyph: 'PENGU', tokenId: 'asset', amount: 'syncing', chain: 'Abstract' },
  { name: 'Lil Pudgy and Rods', collection: 'Owned-token images only', glyph: 'PP', tokenId: 'pending', contract: 'pending' }]
},
{
  id: 'inkfinity',
  label: 'Inkfinity Canvas',
  note: 'Eric Guy signed canvases and the permanent collection around them.',
  keywords: ['inkfinity', 'nftvisionary', 'nuttyprofessor', 'thunderofthoughts', 'e. guy'],
  fallback: [
  { name: 'NFTVisionary', collection: 'Inkfinity Canvas', image: 'assets/inkfinity-visionary.svg', href: 'https://opensea.io/collection/inkfinity-canvas', tokenId: 'canvas', contract: 'inkfinity' },
  { name: 'NuttyProfessor', collection: 'Inkfinity Canvas', image: 'assets/inkfinity-professor.svg', href: 'https://opensea.io/collection/inkfinity-canvas', tokenId: 'canvas', contract: 'inkfinity' },
  { name: 'ThunderOfThoughts', collection: 'Inkfinity Canvas', image: 'assets/inkfinity-thoughts.svg', href: 'https://opensea.io/collection/inkfinity-canvas', tokenId: 'canvas', contract: 'inkfinity' }]
},
{
  id: 'great-terriers',
  label: 'Great Terriers',
  note: 'A collection started in 2022, coming into the next build cycle.',
  keywords: ['great terriers'],
  fallback: [
  { name: 'Great Terriers', collection: 'Coming soon', image: 'assets/great-terriers-coming-soon.png', tokenId: 'soon', contract: 'soon', comingSoon: true }]
}];

function ecosystemForNft(nft) {
  if (nft?.ecosystem) return NFT_ECOSYSTEMS.find((ecosystem) => ecosystem.id === nft.ecosystem);
  const haystack = `${nft?.collection || ''} ${nft?.name || ''}`.toLowerCase();
  return NFT_ECOSYSTEMS.find((ecosystem) =>
    ecosystem.id === 'inkfinity' && ecosystem.keywords.some((keyword) => haystack.includes(keyword))
  );
}

function buildEcosystemSlides(items) {
  const slides = NFT_ECOSYSTEMS.map((ecosystem) => {
    const ecosystemItems = items.filter((nft) => ecosystemForNft(nft)?.id === ecosystem.id);
    return {
      ...ecosystem,
      items: (ecosystemItems.length ? ecosystemItems : ecosystem.fallback)
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

function NftCarousel() {
  const [groups, setGroups] = useState(() => buildEcosystemSlides([]));
  const [source, setSource] = useState('curated');
  const [index, setIndex] = useState(0);
  const [assetData, setAssetData] = useState([]);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadNfts() {
      try {
        const apiResponse = await fetch('/api/nfts', { signal: controller.signal });
        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          const apiItems = (apiData?.nfts || []).filter((nft) => nft.href?.includes('/assets/'));
          if (apiItems.length) {
            setGroups(buildEcosystemSlides(apiItems));
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
        .filter((nft) => nft.name && nft.image && nft.href?.includes('/assets/'))
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
    const controller = new AbortController();
    fetch('/api/ecosystem-assets', { signal: controller.signal })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('asset api unavailable')))
      .then((data) => setAssetData(data?.assets || []))
      .catch(() => setAssetData([]));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (groups.length <= 1 || paused || expanded) return undefined;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % groups.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, [groups.length, paused, expanded]);

  const next = () => {
    setExpanded(false);
    setPaused(false);
    setIndex((i) => (i + 1) % groups.length);
  };
  const prev = () => {
    setExpanded(false);
    setPaused(false);
    setIndex((i) => (i - 1 + groups.length) % groups.length);
  };
  const groupsWithAssets = groups.map((group) => ({
    ...group,
    items: [...assetData.filter((asset) => asset.ecosystem === group.id), ...(group.items || [])]
  }));
  const activeGroup = groupsWithAssets[index] || groupsWithAssets[0];
  const visible = activeGroup?.items || [];
  const shouldLoop = !paused && !expanded && visible.length > 1 && visible.length < 5;
  const smartItems = shouldLoop ? [...visible, ...visible].slice(0, Math.max(4, visible.length * 2)) : visible;

  return (
    <section className="nft-showcase" id="nfts">
      <div className="nft-head">
        <Chapter num="02" kicker="My community ecosystems" title="Sappy, Pudgy, Inkfinity, and what comes next." />
        <div className="nft-actions">
          <button type="button" className="icon-btn" aria-label="Previous NFT" onClick={prev}>‹</button>
          <button type="button" className="icon-btn" aria-label="Next NFT" onClick={next}>›</button>
        </div>
      </div>
      <p className="lede nft-lede">
        {source === 'wallet' ? `${activeGroup?.note} Cards open the matching asset, collection, or explorer page.` : `${activeGroup?.note} Waiting on exact metadata for this ecosystem.`}
      </p>
      <div
        className={`ecosystem-stage ${activeGroup?.id || ''} ${expanded ? 'is-expanded' : ''}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => !expanded && setPaused(false)}
        onFocusCapture={() => setPaused(true)}>
        <div className="ecosystem-tabs" aria-label="NFT ecosystem carousel position">
          {groupsWithAssets.map((group, i) =>
          <button key={group.id} type="button" className={i === index ? 'active' : ''} onClick={() => {
            setIndex(i);
            setPaused(true);
            setExpanded(true);
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
            <strong>{visible.length} featured items {paused || expanded ? '· paused' : ''}</strong>
            <button type="button" className="mini-link" onClick={() => {
              if (expanded) {
                setExpanded(false);
                setPaused(false);
              } else {
                setExpanded(true);
                setPaused(true);
              }
            }}>{expanded ? 'Resume carousel' : 'View all'}</button>
          </div>
        </div>
        <div className={`nft-track smart-track ${shouldLoop ? 'is-looped' : ''}`}>
          {smartItems.map((nft, i) =>
          <a key={`${nft.name}-${nft.tokenId}-${i}`} className={`nft-card ${nft.tokenId === 'pending' || nft.tokenId === 'soon' ? 'disabled' : ''} ${nft.tokenId === 'asset' ? 'asset-card' : ''} ${nft.comingSoon ? 'coming-soon-card' : ''}`} href={nft.href || '#nfts'} target="_blank" rel="noopener" style={{ '--i': i }}>
              <div className="nft-art">
                {nft.image ? <img src={nft.image} alt={nft.name} loading="lazy" /> : <div className="nft-glyph">{nft.glyph}</div>}
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
    </section>);
}

// ---------- Monad Game ----------
const MONAD_TESTNET = {
  chainId: '0x279f',
  chainName: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com']
};

const GAME_NAME = 'Iglu Merge';

function shortWallet(account) {
  return account ? `${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect wallet';
}

function hexFromText(text) {
  return '0x' + Array.from(new TextEncoder().encode(text))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const MONAD_TILE_NAMES = {
  2: 'M',
  4: 'MON',
  8: 'NAD',
  16: 'CHOG',
  32: 'DAK',
  64: 'MOUCH',
  128: 'MOKA',
  256: 'MOYAKI',
  512: 'SALMONAD',
  1024: 'FOCUS',
  2048: 'HYPER'
};

const MONAD_CHARACTERS = [
  { name: 'Molandak', note: 'spiky mascot energy' },
  { name: 'Chog', note: 'catlike chaos' },
  { name: 'Salmonad', note: 'timeline spam power' }
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
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState('');
  const [walletState, setWalletState] = useState('Ready');
  const [board, setBoard] = useState(() => makeBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem('monadMergeBest') || 0));
  const [moves, setMoves] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [txHash, setTxHash] = useState('');
  const isMonad = chainId?.toLowerCase() === MONAD_TESTNET.chainId;
  const maxTile = Math.max(...board);

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
    if (score > best) {
      setBest(score);
      localStorage.setItem('monadMergeBest', String(score));
    }
  }, [score, best]);

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
  }, [board, gameOver]);

  async function connectMonad() {
    if (!window.ethereum) {
      setWalletState('Install a mobile or desktop wallet to connect.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts?.[0] || '');
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MONAD_TESTNET.chainId }]
        });
      } catch (switchError) {
        if (switchError?.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [MONAD_TESTNET]
          });
        } else {
          throw switchError;
        }
      }
      const nextChain = await window.ethereum.request({ method: 'eth_chainId' });
      setChainId(nextChain);
      setWalletState('Monad ready');
    } catch (error) {
      setWalletState(error?.message || 'Wallet connection cancelled.');
    }
  }

  function newGame() {
    setBoard(makeBoard());
    setScore(0);
    setMoves(0);
    setGameOver(false);
    setTxHash('');
  }

  function makeMove(direction) {
    if (gameOver) return;
    const result = moveBoard(board, direction);
    if (!result.moved) return;
    const nextBoard = addRandomTile(result.board);
    setBoard(nextBoard);
    setScore((value) => value + result.gained);
    setMoves((value) => value + 1);
    if (!canMove(nextBoard)) setGameOver(true);
  }

  function handleTouchEnd(event) {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    setTouchStart(null);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    makeMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  async function submitScore() {
    if (!account) {
      await connectMonad();
      return;
    }
    if (!isMonad) {
      await connectMonad();
      return;
    }
    try {
      setWalletState('Awaiting score signature');
      const hash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: account,
          value: '0x0',
          data: hexFromText(`gerrystephen.com ${GAME_NAME} score=${score} maxTile=${maxTile}`)
        }]
      });
      setTxHash(hash);
      setWalletState('Score posted');
    } catch (error) {
      setWalletState(error?.message || 'Score not posted.');
    }
  }

  return (
    <section className="monad-game" id="monad-game">
      <div className="game-copy">
        <Chapter num="04" kicker="Built on Monad" title={`${GAME_NAME}.`} />
        <p className="lede">A fast focus game for BuildAnything: merge Monad-coded tiles, climb the monanimal ladder, and post a score receipt on Monad Testnet.</p>
        <div className="monanimal-strip" aria-label="Monad character inspirations">
          {MONAD_CHARACTERS.map((character) =>
          <span key={character.name}><strong>{character.name}</strong>{character.note}</span>
          )}
        </div>
        <div className="game-actions">
          <button type="button" className="btn primary" onClick={connectMonad}>{shortWallet(account)}</button>
          <button type="button" className="btn ghost" onClick={newGame}>New run</button>
          <a className="btn ghost" href="/?app=iglu-merge#monad-game" target="_blank" rel="noopener">Open app window</a>
          <button type="button" className="btn ghost" onClick={submitScore} disabled={!score}>Submit score</button>
        </div>
        <div className="game-status">
          <span>{walletState}</span>
          <span>{isMonad ? 'Monad Testnet' : 'Wrong network'}</span>
          <span>PWA ready</span>
          <span>Telegram / Farcaster / Roblox path</span>
          {txHash && <a href={`https://testnet.monadexplorer.com/tx/${txHash}`} target="_blank" rel="noopener">View score tx</a>}
        </div>
      </div>
      <div className="game-shell" role="application" aria-label={`${GAME_NAME} game`}>
        <div className="game-hud">
          <div><span>Score</span><strong>{score}</strong></div>
          <div><span>Best</span><strong>{best}</strong></div>
          <div><span>Tile</span><strong>{maxTile}</strong></div>
        </div>
        <div
          className="game-board merge-board"
          role="grid"
          aria-label={`${GAME_NAME} board`}
          onTouchStart={(event) => setTouchStart({ x: event.touches[0].clientX, y: event.touches[0].clientY })}
          onTouchEnd={handleTouchEnd}>
          {board.map((value, cell) =>
          <div
            key={cell}
            role="gridcell"
            className={`game-cell merge-cell ${value ? 'filled' : ''} tile-${value}`}
            aria-label={value ? `${value} tile` : 'Empty tile'}>
              {value ? <><strong>{value}</strong><span>{MONAD_TILE_NAMES[value] || 'MON'}</span></> : null}
            </div>
          )}
          {gameOver && <div className="game-over"><strong>Board locked</strong><button type="button" onClick={newGame}>Run it back</button></div>}
        </div>
        <div className="game-controls" aria-label="Move controls">
          <button type="button" onClick={() => makeMove('up')}>↑</button>
          <button type="button" onClick={() => makeMove('left')}>←</button>
          <button type="button" onClick={() => makeMove('down')}>↓</button>
          <button type="button" onClick={() => makeMove('right')}>→</button>
        </div>
        <div className="game-prompt">
          <strong>{gameOver ? 'Score it, or start fresh.' : maxTile >= 2048 ? 'Hyperfocus unlocked.' : 'Merge matching monanimals.'}</strong>
          <span>{moves} moves · arrow keys, swipe, or tap the controls</span>
        </div>
      </div>
    </section>);
}

// ---------- Inkfinity Canvas ----------
const INKFINITY = [
{ title: 'NFTVisionary', tag: 'Featured', note: 'The piece that started it.', featured: true, variant: 'visionary' },
{ title: 'NuttyProfessor', tag: 'Canvas', note: 'Pen on paper. Signed E. Guy.', variant: 'professor' },
{ title: 'ThunderOfThoughts', tag: 'Canvas', note: 'A crowded mind, distilled.', variant: 'thunder' }];

function InkfinityGallery() {
  return (
    <section className="inkfinity" id="inkfinity">
      <Chapter num="03" kicker="Eric Guy · Inkfinity Canvas" title="Signed work, carried forward." />
      <p className="lede inkfinity-lede">Inkfinity Canvas brings my dad's hand-signed work into the builder story: craft, signature, permanence, and a family standard that still shapes how I move.</p>
      <div className="ink-grid">
        {INKFINITY.map((p, i) =>
        <Reveal key={p.title} delay={i * 100}>
            <a className={`ink-card ${p.featured ? 'featured' : ''}`} href="https://opensea.io/collection/inkfinity-canvas" target="_blank" rel="noopener">
              <div className="ink-canvas">
                <div className={`ink-frame ink-art ${p.variant}`}>
                  <span className="ink-line l1" />
                  <span className="ink-line l2" />
                  <span className="ink-line l3" />
                  <span className="ink-orb o1" />
                  <span className="ink-orb o2" />
                  <div className="ink-mark">E.G.</div>
                  <div className="ink-stamp">{p.tag}</div>
                </div>
              </div>
              <div className="ink-meta">
                <div className="ink-title">{p.title}</div>
                <div className="ink-note">{p.note}</div>
              </div>
            </a>
          </Reveal>
        )}
      </div>
      <a className="btn primary ink-cta" href="https://opensea.io/collection/inkfinity-canvas" target="_blank" rel="noopener">View the collection on OpenSea →</a>
    </section>);

}

// ---------- Stats ----------
function Stats() {
  return (
    <section className="stats">
      <div className="stat"><div className="num">5</div><div className="lbl">years on-chain</div></div>
      <div className="stat"><div className="num">15</div><div className="lbl">years building beside Eric</div></div>
      <div className="stat"><div className="num">1</div><div className="lbl">penguin in a flat cap</div></div>
      <div className="stat"><div className="num">40+</div><div className="lbl">years of construction craft</div></div>
    </section>);

}

// ---------- Now Building ----------
const NOW = [
{ title: 'AI Agents', note: 'Autonomous workers for hospitality ops, content systems, and the useful glue between them.', logo: 'assets/iglu-mark.svg', alt: 'Iglu mark' },
{ title: 'Blue Star Web3', note: 'Live now: ecosystem-holder benefits for vacation, worcation, and nomadic stays.', logo: 'assets/bluestar-logo.svg', alt: 'Blue Star logo' },
{ title: 'Seal Stay', note: 'Where Web3 meets hospitality. Stay tuned for the next stay layer.', logo: 'assets/seal-stay-logo.png', alt: 'Seal Stay logo' }];

function NowBuilding() {
  return (
    <section className="now-building" id="now">
      <Chapter num="05" kicker="Now" title="Currently building the next layer." />
      <div className="nb-grid">
        {NOW.map((n, i) =>
        <Reveal key={n.title} delay={i * 80}>
            <div className="nb-card">
              <img className="nb-logo" src={n.logo} alt={n.alt} />
              <div className="nb-title">{n.title}</div>
              <div className="nb-note">{n.note}</div>
            </div>
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
              <li><span>●</span> A booth in the back for builders</li>
            </ul>
            <a className="btn primary warm" href="https://www.instagram.com/zeppoledolci/" target="_blank" rel="noopener">Zeppole Instagram →</a>
          </div>
        </Reveal>
      </div>
    </section>);

}

// ---------- Contact ----------
function Contact() {
  const cards = [
  { kind: '@ x', handle: 'gerrydoteth', note: 'Builder notes, collector signal, and the occasional market thought.', href: 'https://x.com/gerrydoteth', label: 'Follow' },
  { kind: '◈ opensea', handle: 'gerrystephen', note: 'Penguins, seals, Inkfinity, and the public collector trail.', href: 'https://opensea.io/profile/gerrystephen', label: 'Browse' },
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
      <div className="dedication">Built from the Guy family standard. <span>Eric Guy · strength before beauty</span></div>
    </section>);

}

// ---------- App ----------
function App() {
  const [tweaks, setTweaks] = useTweaks(TWEAK_DEFAULTS);
  const y = useScrollY();
  const mouse = useMouse();
  useAmbientScrollSound(y);

  useEffect(() => {
    document.documentElement.style.setProperty('--display-font', `"${tweaks.displayFont}"`);
    document.documentElement.style.setProperty('--accent-hue', tweaks.accentHue);
  }, [tweaks.displayFont, tweaks.accentHue]);

  return (
    <div className="page" data-warm={tweaks.warmChapters}>
      <Topbar />
      <Hero y={y} mouse={mouse} intensity={tweaks.parallaxIntensity} />
      {tweaks.snowfall && <Snowfall count={60} intensity={tweaks.parallaxIntensity / 100} />}
      <Marquee items={['gerrystephen.eth', 'inkfinity canvas', 'great terriers', 'sappy seals', 'pudgy penguins', 'web3 since 2021', 'building IRL', 'hot weather, iced lattes']} />
      <Timeline />
      <NftCarousel />
      <InkfinityGallery />
      <MonadGame />
      <Stats />
      <NowBuilding />
      <BlueStar y={y} intensity={tweaks.parallaxIntensity} warm={tweaks.warmChapters} />
      <Zeppole y={y} intensity={tweaks.parallaxIntensity} warm={tweaks.warmChapters} />
      <Contact />
      <footer className="foot">
        <span>© {new Date().getFullYear()} gerrystephen.eth · the iglu</span>
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
