// Renders scene.js in headless Chrome and packages the frames as adaptive HLS
// (fMP4, H.264) plus WebP posters for the homepage hero.
//
//   npm install && npm run render                 # full render -> public/media/iglu-v1
//   node render.mjs --preview                     # a few stills in ./out/preview
//   node render.mjs --encode-only                 # re-package existing ./out/frames
//   CHROME_PATH=/path/to/chrome node render.mjs   # if Chrome is not in /Applications
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const preview = args.has('--preview');
const encodeOnly = args.has('--encode-only');
const only = [...args].find((arg) => arg.startsWith('--only='))?.slice(7);
const FPS = 30;
const LOOP_SECONDS = 12;
const MEDIA_VERSION = 'iglu-v1';
const outDir = resolve(here, '../../public/media', MEDIA_VERSION);
const frameRoot = join(here, 'out', preview ? 'preview' : 'frames');

const VARIANTS = {
  land: {
    width: 1920,
    height: 1080,
    renditions: [
      { name: '1080p', w: 1920, h: 1080, crf: 22, maxrate: '4200k', bandwidth: 4200000 },
      { name: '720p', w: 1280, h: 720, crf: 23, maxrate: '2000k', bandwidth: 2000000 },
      { name: '480p', w: 854, h: 480, crf: 24, maxrate: '900k', bandwidth: 900000 },
    ],
    posters: [1920, 1280],
  },
  port: {
    width: 1080,
    height: 1920,
    renditions: [
      { name: '1080p', w: 1080, h: 1920, crf: 23, maxrate: '3600k', bandwidth: 3600000 },
      { name: '720p', w: 720, h: 1280, crf: 24, maxrate: '1600k', bandwidth: 1600000 },
      { name: '480p', w: 480, h: 854, crf: 25, maxrate: '750k', bandwidth: 750000 },
    ],
    posters: [1080, 720],
  },
};

function run(bin, argv) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${bin} exited ${code}`))));
  });
}

async function bundleScene() {
  const result = await build({
    entryPoints: [join(here, 'scene.js')],
    bundle: true,
    format: 'iife',
    globalName: 'IgluScene',
    write: false,
    minify: true,
  });
  return result.outputFiles[0].text;
}

async function renderFrames(browser, sceneSource, key, variant) {
  const dir = join(frameRoot, key);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  page.on('console', (message) => console.log(`[page] ${message.text()}`));
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000"><canvas id="c"></canvas><script>${sceneSource}</script></body></html>`);
  const gpu = await page.evaluate(({ width, height, portrait, loopSeconds }) => {
    const canvas = document.getElementById('c');
    window.igluScene = window.IgluScene.createIgluScene({ canvas, width, height, portrait, loopSeconds });
    const gl = canvas.getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  }, { width: variant.width, height: variant.height, portrait: key === 'port', loopSeconds: LOOP_SECONDS });
  console.log(`${key}: WebGL renderer = ${gpu}`);

  const total = FPS * LOOP_SECONDS;
  const frames = preview ? [0, 90, 150, 200, 270] : Array.from({ length: total }, (_, i) => i);
  const started = Date.now();
  for (const [n, frame] of frames.entries()) {
    const dataUrl = await page.evaluate((seconds) => {
      window.igluScene.renderAt(seconds);
      return document.getElementById('c').toDataURL('image/png');
    }, frame / FPS);
    const name = preview ? `${key}-${String(frame).padStart(4, '0')}.png` : `${String(n).padStart(4, '0')}.png`;
    await writeFile(join(dir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    if (n % 30 === 0) console.log(`${key}: frame ${n + 1}/${frames.length} (${((Date.now() - started) / (n + 1)).toFixed(0)} ms/frame)`);
  }
  await page.close();
  return dir;
}

async function packageHls(key, variant, frameDir) {
  const target = join(outDir, key);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const count = variant.renditions.length;
  const split = variant.renditions.map((_, i) => `[s${i}]`).join('');
  const scales = variant.renditions
    .map((r, i) => `[s${i}]scale=${r.w}:${r.h}:flags=lanczos,format=yuv420p[v${i}]`)
    .join(';');
  const argv = [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-framerate', String(FPS), '-i', join(frameDir, '%04d.png'),
    '-filter_complex', `[0:v]split=${count}${split};${scales}`,
  ];
  variant.renditions.forEach((r, i) => {
    argv.push(
      '-map', `[v${i}]`,
      `-c:v:${i}`, 'libx264', `-profile:v:${i}`, 'high', `-level:v:${i}`, '4.0', `-crf:v:${i}`, String(r.crf),
      `-maxrate:v:${i}`, r.maxrate, `-bufsize:v:${i}`, `${parseInt(r.maxrate, 10) * 2}k`,
    );
  });
  argv.push(
    '-preset', 'slow', '-tune', 'animation', '-r', String(FPS),
    '-g', String(FPS * 2), '-keyint_min', String(FPS * 2), '-sc_threshold', '0',
    '-movflags', '+faststart',
    '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', join(target, '%v', 'seg_%03d.m4s'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', variant.renditions.map((r, i) => `v:${i},name:${r.name}`).join(' '),
    join(target, '%v', 'index.m3u8'),
  );
  await run(ffmpegPath, argv);

  // Progressive MP4 of the middle rendition: fallback for browsers with
  // neither native HLS nor Media Source Extensions.
  const mid = variant.renditions[1];
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'warning',
    '-framerate', String(FPS), '-i', join(frameDir, '%04d.png'),
    '-vf', `scale=${mid.w}:${mid.h}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0', '-preset', 'slow', '-tune', 'animation', '-crf', String(mid.crf + 1),
    '-movflags', '+faststart', '-an', join(target, 'fallback.mp4'),
  ]);

  for (const width of variant.posters) {
    await sharp(join(frameDir, '0000.png'))
      .resize({ width })
      .webp({ quality: 74, effort: 6 })
      .toFile(join(target, `poster-${width}.webp`));
  }
}

if (encodeOnly) {
  for (const [key, variant] of Object.entries(VARIANTS)) {
    if (only && only !== key) continue;
    await packageHls(key, variant, join(frameRoot, key));
  }
  console.log(`HLS written to ${outDir}`);
  process.exit(0);
}

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  protocolTimeout: 0,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--enable-unsafe-swiftshader'],
});
try {
  const sceneSource = await bundleScene();
  for (const [key, variant] of Object.entries(VARIANTS)) {
    if (only && only !== key) continue;
    const frameDir = await renderFrames(browser, sceneSource, key, variant);
    if (!preview) await packageHls(key, variant, frameDir);
  }
} finally {
  await browser.close();
}
console.log(preview ? `Preview stills in ${join(frameRoot)}` : `HLS written to ${outDir}`);
