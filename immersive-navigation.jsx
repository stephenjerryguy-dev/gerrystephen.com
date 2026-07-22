import { useEffect, useState } from 'react';

const CHAPTERS = [
  { id: 'top', label: 'Iglu' },
  { id: 'journey', label: 'Journey' },
  { id: 'nfts', label: 'Ecosystems' },
  { id: 'inkfinity', label: 'Inkfinity' },
  { id: 'monerge', label: 'Monerge' },
  { id: 'ventures', label: 'Ventures' },
  { id: 'contact', label: 'Hello' },
];

export function ImmersiveChapterRail({ scrollY = 0 }) {
  const [active, setActive] = useState('top');

  useEffect(() => {
    const sections = CHAPTERS
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean);
    if (!sections.length || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]?.target?.id) setActive(visible[0].target.id);
    }, {
      rootMargin: '-24% 0px -54% 0px',
      threshold: [0, 0.05, 0.2, 0.45],
    });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const maxScroll = typeof document === 'undefined'
    ? 1
    : Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, scrollY / maxScroll));

  return (
    <>
      <nav className="immersive-chapter-rail" aria-label="Explore Gerry's Iglu">
        {CHAPTERS.map((chapter, index) => (
          <a
            key={chapter.id}
            href={`#${chapter.id}`}
            className={active === chapter.id ? 'active' : ''}
            aria-current={active === chapter.id ? 'location' : undefined}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <b>{chapter.label}</b>
            <i aria-hidden="true" />
          </a>
        ))}
      </nav>
      <div className="immersive-page-progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${progress})` }} />
      </div>
    </>
  );
}
