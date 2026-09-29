import { useEffect, useRef } from 'react';
import type Hls from 'hls.js';

// Pre-rendered three.js loop (scripts/media/render.mjs). The iglu sits right of
// centre in `land` and low-centre in `port`, so each crop keeps it in frame.
const MEDIA_ROOT = '/media/iglu-v1';

export type HeroVariant = 'land' | 'port';

export function heroVariant(): HeroVariant {
  return window.matchMedia('(max-aspect-ratio: 1/1)').matches ? 'port' : 'land';
}

export const heroPoster = (variant: HeroVariant) => `${MEDIA_ROOT}/${variant}/poster-${variant === 'land' ? 1920 : 1080}.webp`;

const isAppleSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

type Connection = { saveData?: boolean; downlink?: number; effectiveType?: string };

// 1080p portrait is ~1.9 MB per loop; phones get it only on a clearly fast link.
const allowTopLevel = (variant: HeroVariant, connection?: Connection) =>
  variant === 'land' || (connection?.effectiveType === '4g' && (connection.downlink ?? 0) >= 8);

export function HeroVideo({ variant }: { variant: HeroVariant }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || connection?.saveData) return undefined;

    const master = `${MEDIA_ROOT}/${variant}/master.m3u8`;
    let hls: Hls | undefined;
    let cancelled = false;
    let visible = true;

    const play = () => {
      if (visible && !document.hidden) void video.play().catch(() => {});
    };

    const attach = async () => {
      // Safari streams HLS natively (and adaptively); everyone else gets hls.js.
      if (isAppleSafari() && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = master;
      } else {
        const { default: HlsLight } = await import('hls.js/light');
        if (cancelled) return;
        if (HlsLight.isSupported()) {
          const player = new HlsLight({
            capLevelToPlayerSize: true,
            maxBufferLength: 14,
            // Seed ABR from the browser's bandwidth hint so fast links skip the 480p warm-up.
            abrEwmaDefaultEstimate: connection?.downlink ? connection.downlink * 1_000_000 * 0.8 : 2_500_000,
          });
          if (!allowTopLevel(variant, connection)) {
            player.on(HlsLight.Events.MANIFEST_PARSED, (_event, data) => {
              player.autoLevelCapping = data.levels.reduce((best, level, index) => (level.height <= 1280 ? index : best), 0);
            });
          }
          player.loadSource(master);
          player.attachMedia(video);
          hls = player;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = master;
        } else {
          video.src = `${MEDIA_ROOT}/${variant}/fallback.mp4`;
        }
      }
      play();
    };

    // The poster is the first paint; stream only once the page has fully loaded
    // and gone idle, so video never competes with the critical path.
    const useIdle = typeof window.requestIdleCallback === 'function';
    let handle = 0;
    const schedule = () => {
      handle = useIdle ? window.requestIdleCallback(() => void attach(), { timeout: 2000 }) : window.setTimeout(() => void attach(), 300);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    // Stop decoding when the hero is off screen or the tab is hidden.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else video.pause();
    });
    observer.observe(video);
    const onVisibility = () => (document.hidden ? video.pause() : play());
    document.addEventListener('visibilitychange', onVisibility);
    const onPlaying = () => (video.dataset.playing = 'true');
    video.addEventListener('playing', onPlaying);

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      video.removeEventListener('playing', onPlaying);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [variant]);

  return (
    <video
      ref={videoRef}
      className={`absolute inset-0 size-full object-cover ${variant === 'land' ? 'object-[64%_50%]' : 'object-[50%_72%]'}`}
      poster={heroPoster(variant)}
      muted
      loop
      playsInline
      preload="none"
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
