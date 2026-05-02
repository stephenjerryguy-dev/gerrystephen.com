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
      <img src="assets/penguin.jpg" alt="gerry the penguin" />
    </div>);

}

// ---------- Topbar ----------
function Topbar() {
  return (
    <header className="topbar" data-screen-label="topbar">
      <div className="brand">
        <div className="brand-mark">
          <img src="assets/penguin.jpg" alt="" />
        </div>
        <div className="brand-text">gerrystephen<span>.eth</span></div>
      </div>
      <nav className="topnav">
        <a href="#journey">Journey</a>
        <a href="#projects">Projects</a>
        <a href="#inkfinity">Inkfinity</a>
        <a href="#now">Now</a>
        <a href="#bluestar">Blue Star</a>
        <a href="#zeppole">Zeppole</a>
        <a href="#contact">Contact</a>
      </nav>
      <a href="https://hub.xyz/gerry" target="_blank" rel="noopener" className="top-cta">opensea.io/profile/gerrystephen</a>
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

  return (
    <section className="hero" id="top" ref={ref}>
      <div className="hero-pin">
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
          <div className="eyebrow"><span className="dot live" /> A FAMILY NAME · ONCHAIN FOREVER</div>
          <h1 className="display">A penguin<br />on a<br /><em>warm beach</em><br />building cool things.</h1>
          <p className="lede">Gerry. Web3 native, hospitality operator, frozen-drink-adjacent. An iglu on the sand.</p>
          <div className="hero-cta">
            <a className="btn primary" href="#journey">Enter the iglu →</a>
            <a className="btn ghost" href="#contact">Say hi</a>
          </div>
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
        {[...items, ...items, ...items].map((it, i) =>
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
      <h2 className="chapter-title" style={{ width: "476px" }}>{title}</h2>
    </div>);

}

// ---------- Timeline ----------
const TIMELINE = [
{ year: '2021', tag: 'First mint · Sappy Seals', body: 'Minted my first NFT at 3am — a Sappy Seal. Refreshed the page twice. Wife asked what I was doing. I said "real estate."' },
{ year: '2021', tag: 'Inkfinity Canvas · for Dad', body: 'Put my dad\'s signed canvases on chain — Eric Guy. Inkfinity Canvas. The family name, immutable forever.' },
{ year: '2022', tag: 'In memoriam · Eric Guy', body: 'Lost my dad. Kept his signature on chain. Some part of him is still minting alongside me.' },
{ year: '2022', tag: 'Pudgy era', body: 'Adopted a penguin in a flat cap and goggles. Never looked back. Cold weather, warm community.' },
{ year: '2023', tag: 'Tools & community', body: 'Shipped tools for collectors, talked at meetups, made friends I\'ll never see in person but trust with my keys.' },
{ year: '2024', tag: 'Builder', body: 'Stopped just collecting. Started building — agents, trading desks, the kinds of tools I wished existed.' },
{ year: '2025', tag: 'IRL bridge', body: 'Started bridging on-chain energy into real businesses — apartments by the sea, a bakery on a corner.' },
{ year: '2026', tag: 'One OS', body: 'A little iglu on the internet. You are standing inside it. One name, every chain.' }];


function Timeline() {
  return (
    <section className="timeline" id="journey">
      <Chapter num="01" kicker="On-chain" title="The Web3 journey." />
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
{ title: 'Inkfinity Canvas', kind: 'For Dad · 2021', note: 'Eric Guy — my late father. His signed canvases, on chain forever.', glyph: '✎', href: 'https://opensea.io/collection/inkfinity-canvas' },
{ title: 'Sappy Seals', kind: 'First mint · 2021', note: 'Where the journey started. Still hold.', glyph: '◐' },
{ title: 'Pudgy Penguins', kind: 'Holder', note: 'Flat cap, goggles, warm community.', glyph: '❄' },
{ title: 'gerrystephen.eth', kind: 'Identity', note: 'One name across every chain.', glyph: '⌬' },
{ title: 'OpenSea', kind: 'Marketplace', note: '@gerrystephen — the rolodex.', glyph: '◈' },
{ title: 'Hub Profile', kind: 'Link-in-bio', note: 'hub.xyz/gerry.', glyph: '✦' }];


function Projects() {
  return (
    <section className="projects" id="projects">
      <Chapter num="02" kicker="Featured" title="Things I've touched." />
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

// ---------- Inkfinity Canvas (gallery for Dad) ----------
const INKFINITY = [
{ title: 'NFTVisionary', tag: 'Featured', note: 'The piece that started it.', featured: true },
{ title: 'NuttyProfessor', tag: 'Canvas', note: 'Pen on paper. Signed E. Guy.' },
{ title: 'ThunderOfThoughts', tag: 'Canvas', note: 'A crowded mind, distilled.' }];

function InkfinityGallery() {
  return (
    <section className="inkfinity" id="inkfinity">
      <Chapter num="03" kicker="For Dad · Inkfinity Canvas" title="Eric Guy signed canvases." />
      <p className="lede inkfinity-lede">My late father's hand-signed work, brought on chain in 2021. Each piece is a paper canvas he drew, signed, and dated. They live now where they can\'t be lost.</p>
      <div className="ink-grid">
        {INKFINITY.map((p, i) =>
        <Reveal key={p.title} delay={i * 100}>
            <a className={`ink-card ${p.featured ? 'featured' : ''}`} href="https://opensea.io/collection/inkfinity-canvas" target="_blank" rel="noopener">
              <div className="ink-canvas">
                <div className="ink-frame">
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
      <div className="stat"><div className="num">2</div><div className="lbl">businesses standing</div></div>
      <div className="stat"><div className="num">1</div><div className="lbl">penguin in a flat cap</div></div>
      <div className="stat"><div className="num">∞</div><div className="lbl">cups of coffee</div></div>
    </section>);

}

// ---------- Now Building ----------
const NOW = [
{ glyph: '⚙', title: 'AI Agents', note: 'Autonomous workers for on-chain ops, content, and the boring glue between them.' },
{ glyph: '↗', title: 'Trading', note: 'Systems for spotting and executing — quant-flavored, vibes-tuned.' },
{ glyph: '▽', title: 'Seal Stay', note: 'Where Web3 meets hospitality. Stay tuned — opening soon.' }];

function NowBuilding() {
  return (
    <section className="now-building" id="now">
      <Chapter num="04" kicker="Now" title="Currently building." />
      <div className="nb-grid">
        {NOW.map((n, i) =>
        <Reveal key={n.title} delay={i * 80}>
            <div className="nb-card">
              <div className="nb-glyph">{n.glyph}</div>
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
            <Chapter num="05" kicker="IRL · Hospitality" title="Blue Star Apartments & Hotel." />
            <p className="lede big">A blue door, a key, the sea. Apartments and hotel where the wifi is fast, the coffee is strong, and the balconies face something better than your inbox.


            </p>
            <ul className="venture-bullets">
              <li><span>★</span> Long & short-stay suites</li>
              <li><span>★</span> Sea-facing balconies</li>
              <li><span>★</span> Crypto accepted, of course</li>
            </ul>
            <a className="btn primary blue" href="#contact">Book a stay →</a>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="venture-vis">
            <div className="window-frame">
              <div className="pane">
                <div className="ph-stripe a" />
                <div className="ph-stripe b" />
                <div className="ph-stripe c" />
                <div className="ph-label">[ photo · balcony at golden hour ]</div>
              </div>
              <div className="pane">
                <div className="ph-stripe a" />
                <div className="ph-stripe b" />
                <div className="ph-stripe c" />
                <div className="ph-label">[ photo · the blue door ]</div>
              </div>
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
            <div className="z-card">
              <div className="z-stamp">
                <div>ZEPPOLE</div>
                <div>DOLCI</div>
                <div className="tiny">EST. WARM</div>
              </div>
              <div className="ph-stripe a" />
              <div className="ph-stripe b" />
              <div className="ph-stripe c" />
              <div className="ph-label">[ photo · tray of zeppole ]</div>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <div className="venture-copy">
            <Chapter num="06" kicker="IRL · Eatery + Bakery" title={<>Zeppole Dolci<br />Café. Eatery. Bakery</>} />
            <p className="lede big">
              Sugar, dough, a small machine that makes espresso. A café that takes pastry
              seriously and itself less so. Fried to order. Cornetti at sunrise.
            </p>
            <ul className="venture-bullets warm">
              <li><span>●</span> Fresh pastries, daily</li>
              <li><span>●</span> American/Italian cuisine - Brunch!</li>
              <li><span>●</span> A booth in the back for builders</li>
            </ul>
            <a className="btn primary warm" href="#contact">Find the café →</a>
          </div>
        </Reveal>
      </div>
    </section>);

}

// ---------- Contact ----------
function Contact() {
  const cards = [
  { kind: '@ x', handle: 'gerrydoteth', note: 'Shitposts, signal, occasional alpha.', href: 'https://x.com/gerrydoteth', label: 'Follow' },
  { kind: '⌬ hub', handle: 'hub.xyz/gerry', note: 'Every link, one rolodex.', href: 'https://hub.xyz/gerry', label: 'Open' },
  { kind: '◈ opensea', handle: 'gerrystephen', note: 'The collection — penguins, pixels, ephemera.', href: 'https://opensea.io/profile/gerrystephen', label: 'Browse' },
  { kind: '✦ ventures', handle: 'Blue Star · Zeppole', note: 'Stay over, eat well, tell a friend.', href: '#bluestar', label: 'Visit', warm: true }];

  return (
    <section className="contact" id="contact">
      <Chapter num="07" kicker="Hello" title="Knock on the iglu." />
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
      <div className="signoff">Eric Guy signed canvases.<br />I sign blocks.</div>
      <div className="dedication">For my dad, Eric Guy. <span>—2022 · in memoriam</span></div>
      <div className="wallets">
        <div className="wallets-lbl">Wallets · gerrystephen.eth resolves to</div>
        <div className="wallets-list">
          <span>0xCf3b8981AbAa56a8E41117b0c721C05F608400A7</span>
          <span>0x382556a543aad855c07678e7f8e820d0d90429bb</span>
          <span>0xc3ce1eb539c1cc031ecd7b95e8c00768bf324403</span>
        </div>
      </div>
    </section>);

}

// ---------- App ----------
function App() {
  const [tweaks, setTweaks] = useTweaks(TWEAK_DEFAULTS);
  const y = useScrollY();
  const mouse = useMouse();

  useEffect(() => {
    document.documentElement.style.setProperty('--display-font', `"${tweaks.displayFont}"`);
    document.documentElement.style.setProperty('--accent-hue', tweaks.accentHue);
  }, [tweaks.displayFont, tweaks.accentHue]);

  return (
    <div className="page" data-warm={tweaks.warmChapters}>
      <Topbar />
      <Hero y={y} mouse={mouse} intensity={tweaks.parallaxIntensity} />
      {tweaks.snowfall && <Snowfall count={60} intensity={tweaks.parallaxIntensity / 100} />}
      <Marquee items={['gerrystephen.eth', 'inkfinity canvas ✎', 'eric guy', 'sappy seals', 'pudgy holder', 'web3 since 2021', 'building IRL', 'hot weather, iced lattes', 'opensea / gerrystephen']} />
      <Timeline />
      <Projects />
      <InkfinityGallery />
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
      <TweakSection title="Atmosphere">
        <TweakSlider label="Parallax intensity" value={tweaks.parallaxIntensity} min={0} max={100} step={5} onChange={(v) => setTweak('parallaxIntensity', v)} />
        <TweakToggle label="Snowfall" value={tweaks.snowfall} onChange={(v) => setTweak('snowfall', v)} />
        <TweakToggle label="Warm chapter palette" value={tweaks.warmChapters} onChange={(v) => setTweak('warmChapters', v)} />
      </TweakSection>
      <TweakSection title="Type & color">
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