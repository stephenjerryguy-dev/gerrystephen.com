// The homepage hero scene: a block iglu on an ice floe in a warm sea.
// Rendered offline (render.mjs) into a seamless loop, so it can afford
// shadows, clearcoat, and environment lighting that would be too heavy live.
// Everything is a pure function of `t` (seconds) so frames are deterministic
// and frame 0 == frame N.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const TAU = Math.PI * 2;
const HORIZON = new THREE.Color('#e7f3ee');

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function angleDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function skyTexture(width, height, portrait) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#a7dcea');
  sky.addColorStop(0.3, '#cdeef4');
  sky.addColorStop(0.5, '#e9f5f1');
  sky.addColorStop(0.62, `#${HORIZON.getHexString()}`);
  sky.addColorStop(1, `#${HORIZON.getHexString()}`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * (portrait ? 0.74 : 0.8);
  const sunY = height * (portrait ? 0.16 : 0.2);
  const unit = Math.min(width, height);
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, unit * 0.62);
  halo.addColorStop(0, 'rgba(255, 196, 120, 0.72)');
  halo.addColorStop(0.35, 'rgba(255, 188, 111, 0.28)');
  halo.addColorStop(1, 'rgba(255, 188, 111, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  const disc = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, unit * 0.075);
  disc.addColorStop(0, 'rgba(255, 250, 236, 1)');
  disc.addColorStop(0.7, 'rgba(255, 226, 170, 0.95)');
  disc.addColorStop(1, 'rgba(255, 210, 150, 0)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sunX, sunY, unit * 0.075, 0, TAU);
  ctx.fill();

  const aqua = ctx.createRadialGradient(width * 0.1, height * 0.45, 0, width * 0.1, height * 0.45, unit * 0.7);
  aqua.addColorStop(0, 'rgba(129, 232, 226, 0.22)');
  aqua.addColorStop(1, 'rgba(129, 232, 226, 0)');
  ctx.fillStyle = aqua;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Tileable height field -> normal map, so scrolling it by whole tiles loops.
function waterNormalTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const waves = [
    [3, 1, 0.9, 0.2], [1, 4, 0.7, 1.3], [5, -2, 0.45, 2.1], [-2, 7, 0.35, 0.7], [8, 3, 0.25, 2.9], [6, -9, 0.18, 4.4],
    [11, 5, 0.14, 1.9], [-7, 12, 0.12, 3.3], [13, -4, 0.1, 5.1], [4, 15, 0.08, 0.4],
  ];
  const height = (x, y) => waves.reduce((sum, [kx, ky, amp, phase]) => sum + amp * Math.sin(TAU * (kx * x + ky * y) + phase), 0);
  const e = 1 / size;
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const x = i / size;
      const y = j / size;
      const dx = (height(x + e, y) - height(x - e, y)) * 0.9;
      const dy = (height(x, y + e) - height(x, y - e)) * 0.9;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const k = (j * size + i) * 4;
      image.data[k] = (n.x * 0.5 + 0.5) * 255;
      image.data[k + 1] = (n.y * 0.5 + 0.5) * 255;
      image.data[k + 2] = (n.z * 0.5 + 0.5) * 255;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  return texture;
}

function softDotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function floeGeometry(radius, thickness) {
  const bevel = 0.22;
  const points = [
    new THREE.Vector2(0, thickness / 2),
    new THREE.Vector2(radius - bevel, thickness / 2),
  ];
  for (let i = 1; i <= 8; i += 1) {
    const a = (i / 8) * (Math.PI / 2);
    points.push(new THREE.Vector2(radius - bevel + Math.sin(a) * bevel, thickness / 2 - bevel + Math.cos(a) * bevel));
  }
  points.push(new THREE.Vector2(radius * 0.97, -thickness / 2));
  points.push(new THREE.Vector2(0, -thickness / 2));
  // Lathe wants the profile bottom-to-top for outward-facing normals.
  return new THREE.LatheGeometry(points.reverse(), 96);
}

export function createIgluScene({ canvas, width, height, portrait, loopSeconds, pudgy }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = skyTexture(width, height, portrait);
  scene.fog = new THREE.Fog(HORIZON, 36, 135);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(portrait ? 38 : 30, width / height, 0.1, 200);
  const target = new THREE.Vector3(0, 0.1, 0);
  // Frame the iglu right of the copy on wide screens and low-centre on tall ones.
  if (portrait) camera.setViewOffset(width, height, 0, -height * 0.2, width, height);
  else camera.setViewOffset(width, height, -width * 0.19, -height * 0.02, width, height);

  // Light
  scene.add(new THREE.HemisphereLight(0xeefaff, 0x2c8f8a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff0d4, 3.8);
  sun.position.set(-7, 11, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 6;
  sun.shadow.blurSamples = 16;
  scene.add(sun);
  const aqua = new THREE.PointLight(0x58eadb, 30, 22, 1.8);
  aqua.position.set(6, 1.5, -3);
  scene.add(aqua);
  const coral = new THREE.PointLight(0xff8b68, 16, 18, 1.8);
  coral.position.set(-6, -0.5, 4);
  scene.add(coral);

  // Sea
  const water = waterNormalTexture();
  water.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.MeshPhysicalMaterial({
      color: 0x3cb9b6,
      roughness: 0.16,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      normalMap: water,
      normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 0.9,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -2.55;
  sea.receiveShadow = true;
  scene.add(sea);

  // Floe + iglu share one bobbing group.
  const floeGroup = new THREE.Group();
  scene.add(floeGroup);
  const floe = new THREE.Mesh(
    floeGeometry(4.9, 0.62),
    new THREE.MeshPhysicalMaterial({ color: 0xeafcfb, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
  );
  floe.position.y = -2.2;
  floe.receiveShadow = true;
  floe.castShadow = true;
  floeGroup.add(floe);

  const colors = [0xf8fdff, 0xdff8fa, 0xc5eef1, 0xaee5e4, 0xffd8af, 0xffa27e];
  const materials = colors.map((color, index) => new THREE.MeshPhysicalMaterial({
    color,
    roughness: index > 3 ? 0.46 : 0.3,
    metalness: 0.02,
    clearcoat: index > 3 ? 0.35 : 0.75,
    clearcoatRoughness: 0.22,
  }));
  const blockGeometry = new RoundedBoxGeometry(1.06, 0.62, 0.72, 5, 0.14);
  const rings = [
    { y: -1.6, r: 3.45, count: 17 },
    { y: -0.86, r: 3.2, count: 16 },
    { y: -0.11, r: 2.78, count: 14 },
    { y: 0.62, r: 2.3, count: 12 },
    { y: 1.32, r: 1.72, count: 9 },
    { y: 1.93, r: 1.02, count: 6 },
  ];
  const rand = mulberry32(20260928);
  const blocks = [];
  const addBlock = (home, rotationY, driftTo) => {
    const index = blocks.length;
    const mesh = new THREE.Mesh(blockGeometry, materials[index % materials.length]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const radial = home.clone().setY(0).normalize();
    const lift = 0.35 + (home.y + 1.7) * 0.28 + rand() * 0.35;
    const push = 0.75 + rand() * 0.55;
    blocks.push({
      mesh,
      home,
      rotationY,
      drift: driftTo ?? home.clone().add(radial.multiplyScalar(push)).add(new THREE.Vector3(0, lift, 0)),
      spinX: (rand() - 0.5) * 0.7,
      spinY: (rand() - 0.5) * 0.8,
      spinZ: (rand() - 0.5) * 0.5,
      phase: rand() * TAU,
      delay: rand() * 0.06,
    });
    floeGroup.add(mesh);
  };
  rings.forEach((ring, ringIndex) => {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * TAU + (ringIndex % 2 ? 0.15 : 0);
      const opening = ringIndex < 3 && angleDistance(angle, Math.PI / 2) < (ringIndex === 0 ? 0.46 : 0.31);
      if (opening) continue;
      addBlock(new THREE.Vector3(Math.cos(angle) * ring.r, ring.y, Math.sin(angle) * ring.r * 0.74), -angle + Math.PI / 2);
    }
  });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.78, 40, 20, 0, TAU, 0, Math.PI / 2), materials[1]);
  cap.scale.set(1, 0.55, 0.8);
  cap.castShadow = true;
  blocks.push({
    mesh: cap,
    home: new THREE.Vector3(0, 2.2, 0),
    rotationY: 0,
    drift: new THREE.Vector3(0, 3.6, 0),
    spinX: 0.25, spinY: 0.6, spinZ: -0.15, phase: 1.2, delay: 0.03,
  });
  floeGroup.add(cap);

  const archCount = 11;
  for (let i = 0; i < archCount; i += 1) {
    const angle = Math.PI - (i / (archCount - 1)) * Math.PI;
    const home = new THREE.Vector3(Math.cos(angle) * 1.22, -1.43 + Math.sin(angle) * 1.62, 2.9);
    // The doorway lifts like a gate instead of flying forward into the Pudgy standee.
    addBlock(home, -angle + Math.PI / 2, home.clone().add(new THREE.Vector3(home.x * 0.25, 1.05 + (home.y + 1.43) * 0.35, 0.2)));
  }

  // Warm light spilling from the doorway.
  const hearth = new THREE.PointLight(0xffb46b, 22, 7, 1.6);
  hearth.position.set(0, -1.1, 1.9);
  floeGroup.add(hearth);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softDotTexture(),
    color: 0xffc98c,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  glow.scale.set(3.2, 2.4, 1);
  glow.position.set(0, -1.2, 2.2);
  floeGroup.add(glow);

  // Gerry's Pudgy as an acrylic standee: the exact PFP art (unlit, so colours
  // stay true) on a white-bordered cutout that casts a real shadow on the floe.
  if (pudgy) {
    const crop = { x: 130, y: 170, w: 790, h: 830 };
    const pad = 22;
    const art = document.createElement('canvas');
    art.width = crop.w + pad * 2;
    art.height = crop.h + pad;
    const artCtx = art.getContext('2d');
    artCtx.drawImage(pudgy, crop.x, crop.y, crop.w, crop.h, pad, pad, crop.w, crop.h);
    const border = document.createElement('canvas');
    border.width = art.width;
    border.height = art.height;
    const borderCtx = border.getContext('2d');
    for (let step = 0; step < 48; step += 1) {
      const a = (step / 48) * TAU;
      borderCtx.drawImage(art, Math.cos(a) * 16, Math.sin(a) * 16);
    }
    borderCtx.globalCompositeOperation = 'source-in';
    borderCtx.fillStyle = '#ffffff';
    borderCtx.fillRect(0, 0, border.width, border.height);
    const artTexture = new THREE.CanvasTexture(art);
    artTexture.colorSpace = THREE.SRGBColorSpace;
    artTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const borderTexture = new THREE.CanvasTexture(border);
    borderTexture.colorSpace = THREE.SRGBColorSpace;

    const standeeHeight = 2.45;
    const standeeWidth = standeeHeight * (art.width / art.height);
    const plane = new THREE.PlaneGeometry(standeeWidth, standeeHeight);
    const standee = new THREE.Group();
    const backing = new THREE.Mesh(plane, new THREE.MeshPhysicalMaterial({
      map: borderTexture,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.25,
      clearcoat: 0.8,
    }));
    backing.castShadow = true;
    backing.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: borderTexture, alphaTest: 0.5 });
    standee.add(backing);
    const front = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: artTexture, alphaTest: 0.5, toneMapped: false }));
    front.position.z = 0.006;
    standee.add(front);
    standee.position.set(0, standeeHeight / 2 - 0.03, 0);

    const base = new THREE.Mesh(
      new RoundedBoxGeometry(standeeWidth * 0.62, 0.12, 0.5, 4, 0.05),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.85, thickness: 0.4, roughness: 0.08, ior: 1.45 }),
    );
    base.position.y = 0.03;
    base.castShadow = true;

    const mount = new THREE.Group();
    mount.add(standee, base);
    mount.position.set(0.55, -1.89, 3.85);
    mount.rotation.y = -0.34;
    floeGroup.add(mount);
  }

  // Distant bergs for depth.
  const bergMaterial = new THREE.MeshStandardMaterial({ color: 0xd9f4f3, roughness: 0.6, flatShading: true });
  const bergs = [
    [-30, -46, 3.2, 0.2], [-13, -66, 4.6, 1.1], [22, -54, 3.4, 2.3], [40, -72, 5.6, 3.4], [-48, -78, 5.2, 4.2],
  ].map(([x, z, s, phase], index) => {
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    const pos = geometry.attributes.position;
    const seed = index * 1.7 + 0.3;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const bump = 1 + 0.16 * Math.sin(3.1 * x + seed) * Math.cos(2.7 * z - seed) + 0.1 * Math.sin(4.3 * y + seed * 2);
      pos.setXYZ(i, x * bump, Math.max(-0.15, y) * bump * 0.8, z * bump);
    }
    geometry.computeVertexNormals();
    const berg = new THREE.Mesh(geometry, bergMaterial);
    berg.scale.set(s * 1.5, s, s * 1.1);
    berg.position.set(x, -3.1, z);
    berg.rotation.y = phase;
    scene.add(berg);
    return { berg, phase };
  });

  // Drifting snow; each flake falls exactly one box height per loop.
  const flakeCount = 320;
  const box = { x: 22, y: 12, z: 16 };
  const flakeSeeds = [];
  const flakePositions = new Float32Array(flakeCount * 3);
  const flakeRand = mulberry32(7);
  for (let i = 0; i < flakeCount; i += 1) {
    flakeSeeds.push({
      x: (flakeRand() - 0.5) * box.x,
      y: flakeRand() * box.y,
      z: (flakeRand() - 0.5) * box.z + 1,
      sway: 0.1 + flakeRand() * 0.25,
      k: 1 + Math.floor(flakeRand() * 3),
      phase: flakeRand() * TAU,
      laps: flakeRand() > 0.6 ? 2 : 1,
    });
  }
  const flakes = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(flakePositions, 3)),
    new THREE.PointsMaterial({ size: 0.075, map: softDotTexture(), transparent: true, opacity: 0.9, depthWrite: false, color: 0xffffff }),
  );
  scene.add(flakes);

  const cameraRadius = portrait ? 33 : 21.5;
  const pitch = THREE.MathUtils.degToRad(portrait ? 13 : 11.5);
  const baseAzimuth = -0.3;

  function renderAt(seconds) {
    const u = (((seconds / loopSeconds) % 1) + 1) % 1;
    const wave = TAU * u;

    // Blocks breathe apart and reassemble once per loop (zero slope at the seam).
    const apart = smoothstep(0.26, 0.5, u) - smoothstep(0.6, 0.86, u);
    blocks.forEach((block) => {
      const local = Math.min(1, Math.max(0, apart * (1 + block.delay * 4) - block.delay));
      const eased = local * local * (3 - 2 * local);
      block.mesh.position.lerpVectors(block.home, block.drift, eased);
      block.mesh.position.y += Math.sin(wave * 2 + block.phase) * 0.07 * eased;
      block.mesh.rotation.set(block.spinX * eased, block.rotationY + block.spinY * eased, block.spinZ * eased);
    });

    floeGroup.position.y = Math.sin(wave) * 0.06;
    floeGroup.rotation.z = Math.sin(wave + 0.8) * 0.012;
    floeGroup.rotation.x = Math.sin(wave * 2 + 0.3) * 0.008;
    hearth.intensity = 22 + Math.sin(wave * 3) * 3 + apart * 10;
    glow.material.opacity = (0.5 + Math.sin(wave * 3) * 0.04) * (1 - apart * 0.85);

    water.offset.set(u, u * 2);
    bergs.forEach(({ berg, phase }) => {
      berg.position.y = -3.1 + Math.sin(wave + phase) * 0.12;
    });

    const pos = flakes.geometry.attributes.position;
    flakeSeeds.forEach((f, i) => {
      const y = (((f.y - u * box.y * f.laps) % box.y) + box.y) % box.y - 2.4;
      pos.setXYZ(i, f.x + Math.sin(wave * f.k + f.phase) * f.sway, y, f.z + Math.cos(wave * f.k + f.phase) * f.sway * 0.5);
    });
    pos.needsUpdate = true;

    const azimuth = baseAzimuth + Math.sin(wave) * 0.3;
    camera.position.set(
      target.x + Math.sin(azimuth) * Math.cos(pitch) * cameraRadius,
      target.y + Math.sin(pitch) * cameraRadius,
      target.z + Math.cos(azimuth) * Math.cos(pitch) * cameraRadius,
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  return { renderAt };
}
