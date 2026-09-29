import { useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { BUILDANYTHING_STATS, MONANIMALS } from '../data/content';
import { Chapter } from './Chapter';
import { Reveal } from './Reveal';

// A static preview board; the real game only loads when someone asks to play.
const PREVIEW_BOARD = [0, 1, 0, 2, 3, 0, 1, 0, 0, 4, 2, 0, 1, 0, 5, 3];

function GameConsole() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="absolute -inset-10 rounded-full bg-violet/25 blur-3xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[40px] bg-night-800/80 p-3 ring-1 ring-white/15 shadow-[0_50px_100px_-40px_rgb(0_0_0/0.8)] backdrop-blur">
        <div className="flex items-center justify-between px-4 pt-2 pb-3 font-mono text-[10px] tracking-[0.2em] text-lilac/80 uppercase">
          <span>Monerge</span>
          <span>{playing ? 'live' : 'preview'}</span>
        </div>
        <div className="relative aspect-[9/14] overflow-hidden rounded-[30px] bg-night-950">
          <AnimatePresence mode="wait" initial={false}>
            {playing ? (
              <m.iframe
                key="game"
                src="/monerge"
                title="Monerge game"
                className="absolute inset-0 size-full border-0"
                allow="clipboard-write; fullscreen"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              />
            ) : (
              <m.div key="preview" className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6" exit={{ opacity: 0, scale: 0.96 }}>
                <div className="grid w-full grid-cols-4 gap-2" aria-hidden="true">
                  {PREVIEW_BOARD.map((tile, index) => (
                    <span key={index} className={`grid aspect-square place-items-center rounded-2xl ${tile ? 'bg-white/10 ring-1 ring-white/15' : 'bg-white/[0.04]'}`}>
                      {tile > 0 && <img src={MONANIMALS[tile - 1].image} alt="" loading="lazy" className="size-[70%] animate-float object-contain" style={{ animationDelay: `${index * -0.37}s` }} />}
                    </span>
                  ))}
                </div>
                <button type="button" onClick={() => setPlaying(true)} className="btn bg-violet text-white shadow-[0_18px_40px_-14px_var(--color-violet)] hover:bg-lilac hover:text-night-900">
                  Play here <span aria-hidden="true">▶</span>
                </button>
                <p className="text-center text-[13px] text-lilac/70">Merge the Monanimals. Remember your hidden score.</p>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export function Biome() {
  return (
    <section id="monerge" className="relative overflow-hidden bg-night-900 py-24 text-white sm:py-32">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgb(152_127_255/0.35),transparent_40%),radial-gradient(circle_at_85%_80%,rgb(88_234_219/0.18),transparent_45%)]"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.5)_1px,transparent_1.5px)] [background-size:44px_44px] opacity-25 [mask-image:linear-gradient(180deg,black,transparent_85%)]" aria-hidden="true" />

      <div className="shell relative grid grid-cols-1 gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="min-w-0">
          <Chapter
            num="04"
            kicker="Built on Monad"
            tone="dark"
            title={<span className="bg-[linear-gradient(100deg,white,var(--color-lilac)_45%,var(--color-aqua))] bg-clip-text text-[1.35em] text-transparent">Biome.</span>}
          />
          <Reveal>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-white/75">
              Biome is being built on Monad testnet as my game network for Moncade, Monerge, and future creature games: proof-of-play, wallet profiles, and runs that connect back to the iglu.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <a
              href="https://buildanything.so/students/gerry"
              target="_blank"
              rel="noopener"
              className="group mt-8 flex flex-col gap-4 rounded-[28px] bg-white/[0.06] p-4 ring-1 ring-white/12 transition-colors hover:bg-white/10 sm:flex-row sm:items-center"
              aria-label="Open Gerry on BuildAnything"
            >
              <img src="/assets/opt/buildanything-student-card.webp" alt="BuildAnything student card for Gerry" loading="lazy" className="w-full rounded-2xl sm:w-52" />
              <dl className="grid flex-1 grid-cols-2 gap-3">
                {BUILDANYTHING_STATS.map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-white/[0.05] px-4 py-3">
                    <dt className="kicker text-[9.5px] text-lilac/75">{stat.label}</dt>
                    <dd className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em]">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </a>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/60">
              I completed BuildAnything coursework to sharpen how I take a vibe-coded Monad app from an idea to a working public launch. Those lessons now feed directly into how I am building Biome, Moncade, and Monerge.
            </p>
          </Reveal>

          <ul className="no-scrollbar mt-8 flex gap-2 overflow-x-auto pb-1" aria-label="Monad character inspirations">
            {MONANIMALS.map((monanimal) => (
              <li key={monanimal.name} className="flex shrink-0 items-center gap-2 rounded-full bg-white/[0.07] py-1.5 pr-4 pl-1.5 ring-1 ring-white/10">
                <img src={monanimal.image} alt="" loading="lazy" className="size-8 rounded-full bg-white/10 object-contain p-0.5" />
                <span className="text-[13px]">
                  <strong className="font-semibold">{monanimal.name}</strong> <span className="text-white/55">{monanimal.note}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <a className="btn bg-white text-night-900 hover:bg-lilac" href="https://biome.gerrystephen.com" target="_blank" rel="noopener">
              Open Biome <span aria-hidden="true">→</span>
            </a>
            <a className="btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20" href="/monerge">
              Monerge full screen <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              ['01 · Monad network', 'Testnet now, network next.', 'Biome is being shaped on Monad testnet so games, profiles, and proof-of-play records can connect before the larger launch.'],
              ['02 · Moncade', 'The game hub.', 'A creature-game arcade layer for what gets built next across the Monad ecosystem.'],
            ].map(([kicker, title, body]) => (
              <div key={kicker} className="rounded-3xl border border-white/10 p-5">
                <p className="kicker text-[10px] text-aqua/80">{kicker}</p>
                <p className="mt-2 font-display text-xl font-semibold tracking-[-0.02em]">{title}</p>
                <p className="mt-2 text-[14px] leading-relaxed text-white/60">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <Reveal delay={0.1}>
          <GameConsole />
        </Reveal>
      </div>
    </section>
  );
}
