import { useRef } from 'react';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function smooth(value, start, end) {
  const normalized = clamp((value - start) / Math.max(0.001, end - start));
  return normalized * normalized * (3 - 2 * normalized);
}

const BLOCKS = Array.from({ length: 28 }, (_, index) => ({
  index,
  column: index % 7,
  row: Math.floor(index / 7),
  depth: ((index * 17) % 9) - 4,
}));

export function ImmersivePortal({
  y = 0,
  mouse = { x: 0.5, y: 0.5 },
  number,
  kicker,
  title,
  copy,
  theme,
  image,
  imageAlt,
  target,
}) {
  const ref = useRef(null);
  const viewport = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const section = ref.current;
  const sectionTop = section ? section.getBoundingClientRect().top + y : y + viewport;
  const travel = section ? Math.max(1, section.offsetHeight - viewport) : viewport;
  const progress = clamp((y - sectionTop) / travel);
  const opening = smooth(progress, 0.08, 0.72);
  const reveal = smooth(progress, 0.12, 0.48) * (1 - smooth(progress, 0.86, 1));
  const pointerX = (mouse.x - 0.5) * 24;
  const pointerY = (mouse.y - 0.5) * 18;

  return (
    <section
      ref={ref}
      className={`immersive-portal portal-${theme}`}
      aria-label={`${number} ${title}`}
      style={{ '--portal-progress': progress }}
    >
      <div className="immersive-portal-pin">
        <div className="portal-grid" aria-hidden="true" />
        <div className="portal-orbit portal-orbit-a" aria-hidden="true" />
        <div className="portal-orbit portal-orbit-b" aria-hidden="true" />

        <div className="portal-block-field" aria-hidden="true">
          {BLOCKS.map((block) => {
            const centerX = block.column - 3;
            const centerY = block.row - 1.5;
            const side = centerX === 0 ? (block.index % 2 ? -1 : 1) : Math.sign(centerX);
            const lift = centerY === 0 ? (block.index % 3 - 1) : centerY;
            const baseX = centerX * 12.2;
            const baseY = centerY * 19;
            const escapeX = side * (34 + Math.abs(centerY) * 8) * opening;
            const escapeY = lift * 16 * opening;
            const rotateX = (centerY * 7 + block.depth * 2) * opening;
            const rotateY = (centerX * -8 + block.depth * 3) * opening;
            return (
              <i
                key={block.index}
                style={{
                  '--block-x': `${baseX + escapeX + pointerX * (0.05 + Math.abs(block.depth) * 0.012)}vw`,
                  '--block-y': `${baseY + escapeY + pointerY * (0.06 + Math.abs(block.depth) * 0.01)}vh`,
                  '--block-z': `${block.depth * 18 + opening * Math.abs(block.depth) * 34}px`,
                  '--block-scale': `${1 + block.depth * 0.018 + opening * Math.abs(block.depth) * 0.018}`,
                  '--block-rx': `${rotateX}deg`,
                  '--block-ry': `${rotateY}deg`,
                  '--block-delay': `${block.index * -0.14}s`,
                }}
              />
            );
          })}
        </div>

        <div
          className="portal-media"
          style={{
            opacity: 0.16 + reveal * 0.84,
            transform: `translate3d(${pointerX * -0.24}px, ${pointerY * -0.18 + (0.5 - progress) * 42}px, 0) scale(${0.9 + reveal * 0.1})`,
          }}
        >
          <span aria-hidden="true">{number}</span>
          <img src={image} alt={imageAlt} />
        </div>

        <div
          className="portal-copy"
          style={{
            opacity: reveal,
            transform: `translate3d(${pointerX * 0.12}px, ${(1 - reveal) * 56}px, 0)`,
          }}
        >
          <p><span>{number}</span>{kicker}</p>
          <h2>{title}</h2>
          <div className="portal-copy-bottom">
            <strong>{copy}</strong>
            <a href={`#${target}`}>Enter chapter <span aria-hidden="true">↓</span></a>
          </div>
        </div>

        <div className="portal-coordinate portal-coordinate-a" aria-hidden="true">SCENE {number} / {String(Math.round(progress * 100)).padStart(3, '0')}</div>
        <div className="portal-coordinate portal-coordinate-b" aria-hidden="true">GERRYSTEPHEN.ETH / LIVING INDEX</div>
      </div>
    </section>
  );
}
