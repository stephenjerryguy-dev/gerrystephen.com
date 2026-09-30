// Picks the lightest way to show a piece of NFT/asset art and a chain of
// fallbacks for when a source is down (public IPFS gateways rate-limit hard).

export type Media = { sources: string[]; video?: string; poster?: string };

// Animated GIFs that are far too heavy to hotlink; see scripts/media/optimize-images.mjs.
const ANIMATED_OVERRIDES: Record<string, { video: string; poster: string }> = {
  'KeyGIF.gif': { video: '/assets/nft/faithful-key.mp4', poster: '/assets/nft/faithful-key.webp' },
  'Water.gif': { video: '/assets/nft/omnia-pet-7262.mp4', poster: '/assets/nft/omnia-pet-7262.webp' },
};

const OPTIMIZED_LOCAL: Record<string, string> = {
  'pixl-logo.png': '/assets/opt/pixl-logo.webp',
  'pudgy-penguin.webp': '/assets/opt/pudgy-penguin.webp',
  'digital-artifact-93.jpg': '/assets/opt/digital-artifact-93.webp',
  'inkfinity-visionary.png': '/assets/opt/inkfinity-visionary.webp',
  'inkfinity-professor.png': '/assets/opt/inkfinity-professor.webp',
  'inkfinity-thoughts.png': '/assets/opt/inkfinity-thoughts.webp',
  'great-terriers-coming-soon.png': '/assets/opt/great-terriers-coming-soon.webp',
};

// OpenSea's IPFS gateway is fast and cache-friendly; the public gateways now rate-limit or time out.
const IPFS_GATEWAYS = ['https://ipfs2.seadn.io', 'https://gateway.pinata.cloud'];

// Hosts Vercel's image optimizer may fetch (mirrors `images.remotePatterns` in vercel.json).
const OPTIMIZABLE_HOSTS = new Set(['ipfs2.seadn.io', 'i2c.seadn.io', 'ipfs.filebase.io', 'gateway.pinata.cloud', 'storage.googleapis.com']);

function vercelImage(url: string, width: number) {
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=72`;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function ipfsPath(url: string) {
  const match = url.match(/\/ipfs\/(.+)$/) ?? url.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/);
  return match?.[1];
}

export function resolveMedia(image: string | undefined, width = 384): Media {
  if (!image) return { sources: [] };
  const animated = Object.entries(ANIMATED_OVERRIDES).find(([needle]) => image.includes(needle));
  if (animated) return { sources: [animated[1].poster], ...animated[1] };

  const file = image.split('?')[0].split('/').pop() ?? '';
  const isLocal = image.startsWith('/') || image.startsWith('assets/');
  if (isLocal) {
    const local = image.startsWith('/') ? image : `/${image}`;
    return { sources: OPTIMIZED_LOCAL[file] ? [OPTIMIZED_LOCAL[file], local] : [local] };
  }

  if (image.includes('cdn.dexscreener.com')) {
    return { sources: [image.replace(/width=\d+&height=\d+&quality=\d+/, 'width=256&height=256&quality=85'), image] };
  }

  const cidPath = ipfsPath(image);
  const direct = cidPath ? IPFS_GATEWAYS.map((gateway) => `${gateway}/ipfs/${cidPath}`) : [image];
  const optimized = import.meta.env.PROD
    ? direct.filter((url) => OPTIMIZABLE_HOSTS.has(hostname(url))).slice(0, 1).map((url) => vercelImage(url, width))
    : [];
  return { sources: [...new Set([...optimized, ...direct, image])] };
}
