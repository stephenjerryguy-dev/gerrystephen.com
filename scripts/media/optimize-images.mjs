// Builds the homepage's optimized images:
//   public/assets/opt/*.webp   resized WebP copies of the site's PNG/JPG assets
//   public/assets/nft/*        tiny looping MP4 + WebP poster for heavy NFT GIFs
//
//   npm run optimize-images
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../../public/assets');
const optDir = join(assets, 'opt');
const nftDir = join(assets, 'nft');

// [source relative to public/assets, max width, quality]
const IMAGES = [
  ['pudgy-penguin-cutout.png', 560, 82],
  ['great-terriers-coming-soon.png', 720, 76],
  ['seal-stay-logo.png', 420, 82],
  ['bluestar-logo.png', 420, 86],
  ['bluestar-property.jpg', 1400, 72],
  ['zeppole-shop.jpg', 1400, 72],
  ['zeppole-logo.png', 360, 86],
  ['inkfinity-visionary.png', 900, 78],
  ['inkfinity-professor.png', 900, 78],
  ['inkfinity-thoughts.png', 900, 78],
  ['buildanything-student-card.png', 900, 80],
  ['abstract-gold-tier-card.png', 640, 82],
  ['pixl-logo.png', 360, 86],
  ['pudgy-penguin.webp', 560, 80],
  ['digital-artifact-93.jpg', 640, 76],
  ['monanimals/chog-official-sprite.png', 240, 84],
  ['monanimals/molandak-official-sprite.png', 240, 84],
  ['monanimals/mouch-sprite-tight.png', 240, 84],
  ['monanimals/mokadel-sprite-tight.png', 240, 84],
  ['monanimals/salmonad-sprite-tight.png', 240, 84],
  ['monanimals/emonad-sprite.png', 240, 84],
];

// Animated NFT art that is far too heavy to hotlink (the Faithful Key GIF is 18 MB).
const NFT_GIFS = [
  ['faithful-key', 'https://gateway.pinata.cloud/ipfs/QmUYJi27E6p9f4BpvqEijtEe2kKyztqrtcEwr7iM3RAqLi/KeyGIF.gif'],
  ['omnia-pet-7262', 'https://ipfs.filebase.io/ipfs/QmWrbaUmFYMga5uXNo32ff8fEbHEDGvCinGGmEsph4bY2c/Water.gif'],
];

function run(argv) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpegPath, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

const kb = async (file) => `${((await stat(file)).size / 1024).toFixed(1)} KB`;

await mkdir(optDir, { recursive: true });
await mkdir(nftDir, { recursive: true });

for (const [source, width, quality] of IMAGES) {
  const input = join(assets, source);
  const name = source.split('/').pop().replace(/\.(png|jpe?g|webp)$/i, '.webp');
  const output = join(optDir, name);
  await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6, alphaQuality: 90 }).toFile(output);
  console.log(`${source.padEnd(42)} ${(await kb(input)).padStart(10)} -> ${(await kb(output)).padStart(9)}`);
}

// Small tab icon (the 512px PNG stays for home-screen icons).
await sharp(join(assets, 'gerrys-iglu-icon-512.png')).resize({ width: 64 }).png({ compressionLevel: 9, palette: true }).toFile(join(optDir, 'gerrys-iglu-icon-64.png'));

for (const [name, url] of NFT_GIFS) {
  const gif = join(here, 'out', `${name}.gif`);
  await mkdir(dirname(gif), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  await writeFile(gif, Buffer.from(await response.arrayBuffer()));
  const video = join(nftDir, `${name}.mp4`);
  await run([
    '-y', '-hide_banner', '-loglevel', 'warning', '-i', gif,
    '-vf', "scale='min(480,iw)':-2:flags=lanczos,format=yuv420p",
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0', '-preset', 'slow', '-crf', '26',
    '-movflags', '+faststart', '-an', video,
  ]);
  await sharp(gif, { animated: false }).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(nftDir, `${name}.webp`));
  console.log(`${name.padEnd(42)} ${(await kb(gif)).padStart(10)} -> ${(await kb(video)).padStart(9)} mp4 + ${await kb(join(nftDir, `${name}.webp`))} poster`);
}
