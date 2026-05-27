const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const mini = document.getElementById("minimap");
const mctx = mini.getContext("2d");

const MONAD_TESTNET = {
  chainId: "0x279f",
  chainName: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
};

const SUBMIT_RUN_SELECTOR = "0x68957b52";
const CONTRACT_STORAGE_KEY = "monad-raidfield-contract";
const RUN_STORAGE_KEY = "monad-raidfield-last-run";
const GAME_MODE = new URLSearchParams(window.location.search).get("mode") || "raidfield";
const GAME_MODES = {
  raidfield: {
    title: "Monad Raidfield",
    subtitle: "MOBA lanes, dungeon rooms, base raids",
    status: "Hybrid run loaded. Clear camps, build your keep, and crack the core.",
    quests: ["Clear 6 dungeon creeps", "Break the enemy core", "Build defenses before wave 3"],
  },
  mongeon: {
    title: "Mongeon",
    subtitle: "Dungeon-crawl route inside Raidfield",
    status: "Dungeon route loaded. Chain camp clears, pull enemies with Vortex, then push the boss core.",
    quests: ["Clear the packed dungeon wing", "Defeat the core guardian", "Exit with 30+ shards"],
  },
  monclash: {
    title: "Monclash",
    subtitle: "Base defense and counter-raid mode",
    status: "Siege route loaded. Stabilize the keep, build fast, then counter-raid the enemy base.",
    quests: ["Hold the keep above 50%", "Build 3 defenses", "Counter-raid the enemy core"],
  },
  monaba: {
    title: "Monaba",
    subtitle: "Lane brawler mode",
    status: "MOBA route loaded. Escort minions, win lane trades, and break both enemy towers.",
    quests: ["Win the mid-lane skirmish", "Destroy enemy towers", "Shatter the enemy core"],
  },
};
const art = new Image();
art.src = "./assets/raidfield-assets.png";
const spriteCache = new Map();

const sprites = {
  hero: { x: 70, y: 34, w: 190, h: 250 },
  heroDash: { x: 610, y: 70, w: 270, h: 170 },
  minion: { x: 830, y: 146, w: 126, h: 112 },
  golem: { x: 1168, y: 54, w: 270, h: 248 },
  tower: { x: 42, y: 330, w: 214, h: 248 },
  core: { x: 276, y: 326, w: 300, h: 230 },
  wall: { x: 1190, y: 612, w: 260, h: 152 },
};

const ui = {
  shards: document.getElementById("shards"),
  wave: document.getElementById("wave"),
  rank: document.getElementById("rank"),
  hp: document.getElementById("hp"),
  energy: document.getElementById("energy"),
  keepHp: document.getElementById("keepHp"),
  coreHp: document.getElementById("coreHp"),
  keepProgress: document.getElementById("keepProgress"),
  coreProgress: document.getElementById("coreProgress"),
  status: document.getElementById("status"),
  questMonsters: document.getElementById("questMonsters"),
  questBase: document.getElementById("questBase"),
  questBuild: document.getElementById("questBuild"),
  contractAddress: document.getElementById("contractAddress"),
  chainStatus: document.getElementById("chainStatus"),
  commitRun: document.getElementById("commitRun"),
};

const state = {
  keys: new Set(),
  selected: "slash",
  mouseTarget: null,
  shards: 18,
  wave: 1,
  cleared: 0,
  built: 0,
  won: false,
  lastCast: 0,
  lastSpawn: 0,
  cameraShake: 0,
};

const hero = {
  x: 230,
  y: 380,
  r: 18,
  hp: 100,
  energy: 100,
  shield: 0,
  facing: 1,
};

const keep = { x: 116, y: 365, hp: 100, r: 44 };
const core = { x: 1160, y: 354, hp: 100, r: 52 };
const lane = [
  { x: 116, y: 365 },
  { x: 270, y: 382 },
  { x: 430, y: 278 },
  { x: 610, y: 344 },
  { x: 792, y: 255 },
  { x: 955, y: 336 },
  { x: 1160, y: 354 },
];

const allies = Array.from({ length: 3 }, (_, i) => ({
  x: 155 - i * 18,
  y: 410 + i * 24,
  hp: 34,
  speed: 34 + i * 4,
  t: i * 0.04,
  attack: 0,
}));

let enemies = [
  enemy(450, 250, "creep"),
  enemy(520, 316, "creep"),
  enemy(650, 405, "golem"),
  enemy(790, 242, "creep"),
  enemy(900, 318, "golem"),
  enemy(1012, 396, "guard"),
];

const buildings = [
  { kind: "tower", x: 1025, y: 272, hp: 100, enemy: true, cooldown: 0 },
  { kind: "tower", x: 1048, y: 430, hp: 100, enemy: true, cooldown: 0 },
  { kind: "wall", x: 1090, y: 324, hp: 120, enemy: true },
];

const particles = [];
let last = performance.now();

function enemy(x, y, type) {
  const stats = {
    creep: { hp: 36, r: 14, speed: 25, damage: 4 },
    golem: { hp: 72, r: 20, speed: 18, damage: 8 },
    guard: { hp: 96, r: 18, speed: 22, damage: 10 },
    raider: { hp: 48, r: 15, speed: 32, damage: 7 },
  }[type];
  return { x, y, type, maxHp: stats.hp, hp: stats.hp, r: stats.r, speed: stats.speed, damage: stats.damage, attack: 0 };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function sx(x) {
  return (x / 1280) * canvas.clientWidth;
}

function sy(y) {
  return (y / 720) * canvas.clientHeight;
}

function drawSprite(name, x, y, width, height, flip = false) {
  const sprite = sprites[name];
  if (!sprite || !art.complete || art.naturalWidth === 0) return false;
  const spriteCanvas = getSpriteCanvas(name);
  if (!spriteCanvas) return false;

  ctx.save();
  if (flip) {
    ctx.translate(sx(x), sy(y));
    ctx.scale(-1, 1);
    ctx.drawImage(spriteCanvas, -sx(width / 2), -sy(height), sx(width), sy(height));
  } else {
    ctx.drawImage(spriteCanvas, sx(x - width / 2), sy(y - height), sx(width), sy(height));
  }
  ctx.restore();
  return true;
}

function getSpriteCanvas(name) {
  if (spriteCache.has(name)) return spriteCache.get(name);
  const sprite = sprites[name];
  if (!sprite || !art.complete || art.naturalWidth === 0) return null;

  const crop = document.createElement("canvas");
  crop.width = sprite.w;
  crop.height = sprite.h;
  const cropCtx = crop.getContext("2d", { willReadFrequently: true });
  cropCtx.drawImage(art, sprite.x, sprite.y, sprite.w, sprite.h, 0, 0, sprite.w, sprite.h);

  const imageData = cropCtx.getImageData(0, 0, crop.width, crop.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const neutralDark = max < 44 && max - min < 13;
    const nearBlack = r < 24 && g < 28 && b < 32;
    if (neutralDark || nearBlack) {
      pixels[i + 3] = 0;
    }
  }
  cropCtx.putImageData(imageData, 0, 0);
  spriteCache.set(name, crop);
  return crop;
}

function wx(x) {
  return (x / canvas.clientWidth) * 1280;
}

function wy(y) {
  return (y / canvas.clientHeight) * 720;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function moveToward(unit, target, speed, dt) {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  const d = Math.hypot(dx, dy) || 1;
  unit.x += (dx / d) * speed * dt;
  unit.y += (dy / d) * speed * dt;
}

function cast(action) {
  if (performance.now() - state.lastCast < 220 || hero.energy < 8) return;
  state.lastCast = performance.now();
  const costs = { slash: 8, shield: 14, dash: 18, vortex: 26 };
  if (hero.energy < costs[action]) return;
  hero.energy -= costs[action];

  if (action === "slash") {
    hitEnemies(72, 24);
    burst(hero.x + hero.facing * 28, hero.y, "#62f4dd", 18);
    setStatus("Veya cleaves the lane.");
  }
  if (action === "shield") {
    hero.shield = 3.5;
    burst(hero.x, hero.y, "#a98cff", 24);
    setStatus("Crystal shield raised.");
  }
  if (action === "dash") {
    hero.x = Math.max(70, Math.min(1210, hero.x + hero.facing * 115));
    hitEnemies(58, 18);
    burst(hero.x, hero.y, "#f2c36a", 22);
    setStatus("Dash through the dungeon line.");
  }
  if (action === "vortex") {
    enemies.forEach((e) => {
      if (dist(hero, e) < 145) {
        moveToward(e, hero, 125, 0.22);
        e.hp -= 18;
      }
    });
    burst(hero.x, hero.y, "#a98cff", 42);
    setStatus("Vortex drags nearby creeps.");
  }
}

function hitEnemies(range, damage) {
  enemies.forEach((e) => {
    if (dist(hero, e) < range + e.r) e.hp -= damage;
  });
  buildings.forEach((b) => {
    if (b.enemy && dist(hero, b) < range + 28) b.hp -= damage * 0.7;
  });
  if (dist(hero, core) < range + core.r) core.hp -= damage * 0.5;
  state.cameraShake = 6;
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 160;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45 + Math.random() * 0.45, color });
  }
}

function build(kind) {
  const cost = { tower: 12, wall: 6, minion: 9 }[kind];
  if (state.shards < cost) {
    setStatus("Not enough shards.");
    return;
  }
  state.shards -= cost;
  state.built += 1;
  if (kind === "minion") {
    allies.push({ x: keep.x + 40, y: keep.y + 34, hp: 34, speed: 42, t: 0, attack: 0 });
  } else {
    buildings.push({
      kind,
      x: keep.x + 66 + state.built * 22,
      y: keep.y - 82 + (state.built % 4) * 48,
      hp: kind === "tower" ? 90 : 110,
      enemy: false,
      cooldown: 0,
    });
  }
  burst(keep.x + 70, keep.y, kind === "tower" ? "#62f4dd" : "#79e28c", 18);
  setStatus(`${kind[0].toUpperCase() + kind.slice(1)} built at your keep.`);
}

function update(dt, time) {
  const speed = hero.shield > 0 ? 150 : 185;
  let vx = 0;
  let vy = 0;
  if (state.keys.has("w") || state.keys.has("arrowup")) vy -= 1;
  if (state.keys.has("s") || state.keys.has("arrowdown")) vy += 1;
  if (state.keys.has("a") || state.keys.has("arrowleft")) vx -= 1;
  if (state.keys.has("d") || state.keys.has("arrowright")) vx += 1;
  if (state.mouseTarget && Math.hypot(state.mouseTarget.x - hero.x, state.mouseTarget.y - hero.y) > 8) {
    moveToward(hero, state.mouseTarget, speed, dt);
  }
  if (vx || vy) {
    const len = Math.hypot(vx, vy);
    hero.x += (vx / len) * speed * dt;
    hero.y += (vy / len) * speed * dt;
    state.mouseTarget = null;
  }
  if (vx !== 0) hero.facing = Math.sign(vx);
  hero.x = Math.max(40, Math.min(1235, hero.x));
  hero.y = Math.max(80, Math.min(650, hero.y));
  hero.energy = Math.min(100, hero.energy + 13 * dt);
  hero.shield = Math.max(0, hero.shield - dt);

  allies.forEach((a) => {
    const target = enemies.find((e) => dist(a, e) < 90) || core;
    if (dist(a, target) > 30) moveToward(a, target, a.speed, dt);
    else if ((a.attack -= dt) <= 0) {
      target.hp -= 5;
      a.attack = 0.8;
      burst(target.x, target.y, "#79e28c", 4);
    }
  });

  enemies.forEach((e) => {
    const defensiveTargets = [hero, keep, ...allies, ...buildings.filter((b) => !b.enemy)];
    const target = defensiveTargets.sort((a, b) => dist(e, a) - dist(e, b))[0];
    if (dist(e, target) > e.r + (target.r || 18) + 6) moveToward(e, target, e.speed, dt);
    else if ((e.attack -= dt) <= 0) {
      const damage = hero.shield > 0 && target === hero ? Math.ceil(e.damage * 0.35) : e.damage;
      target.hp -= damage;
      e.attack = 0.9;
      burst(target.x, target.y, "#ff6a78", 4);
    }
  });

  buildings.forEach((b) => {
    if (b.kind !== "tower") return;
    b.cooldown -= dt;
    const target = b.enemy
      ? [hero, ...allies].filter((u) => dist(b, u) < 155).sort((a, c) => dist(b, a) - dist(b, c))[0]
      : enemies.filter((e) => dist(b, e) < 170).sort((a, c) => dist(b, a) - dist(b, c))[0];
    if (target && b.cooldown <= 0) {
      target.hp -= b.enemy ? 8 : 10;
      b.cooldown = 0.85;
      burst(target.x, target.y, b.enemy ? "#ff6a78" : "#62f4dd", 5);
    }
  });

  const before = enemies.length;
  enemies = enemies.filter((e) => e.hp > 0);
  const killed = before - enemies.length;
  if (killed) {
    state.cleared += killed;
    state.shards += killed * 4;
    setStatus(`Creep camp cleared. +${killed * 4} shards.`);
  }

  for (let i = buildings.length - 1; i >= 0; i--) {
    if (buildings[i].hp <= 0) {
      if (buildings[i].enemy) state.shards += 8;
      buildings.splice(i, 1);
    }
  }

  if (time - state.lastSpawn > 14000 && !state.won) {
    state.lastSpawn = time;
    state.wave += 1;
    enemies.push(enemy(1120, 338, "raider"), enemy(1184, 390, "raider"));
    if (state.wave % 2 === 0) enemies.push(enemy(990, 288, "golem"));
    setStatus(`Wave ${state.wave} is marching on your keep.`);
  }

  allies.forEach((a) => (a.hp = Math.max(0, a.hp)));
  enemies.forEach((e) => (e.hp = Math.max(0, e.hp)));
  hero.hp = Math.max(0, Math.min(100, hero.hp));
  keep.hp = Math.max(0, Math.min(100, keep.hp));
  core.hp = Math.max(0, Math.min(100, core.hp));

  if (hero.hp <= 0) {
    hero.hp = 100;
    hero.x = keep.x + 90;
    hero.y = keep.y + 10;
    state.shards = Math.max(0, state.shards - 8);
    setStatus("You were routed and returned to the keep.");
  }

  if (core.hp <= 0 && !state.won) {
    state.won = true;
    state.shards += 50;
    burst(core.x, core.y, "#f2c36a", 80);
    setStatus("Enemy core shattered. Commit the run to Monad.");
  }

  if (keep.hp <= 0) {
    keep.hp = 58;
    core.hp = Math.min(100, core.hp + 15);
    enemies = enemies.slice(0, 4);
    setStatus("Keep breached. Emergency reset stabilized the shard gate.");
  }

  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  while (particles.length && particles[0].life <= 0) particles.shift();
  state.cameraShake = Math.max(0, state.cameraShake - 28 * dt);
  updateUi();
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (state.cameraShake > 0) {
    ctx.translate((Math.random() - 0.5) * state.cameraShake, (Math.random() - 0.5) * state.cameraShake);
  }
  drawTerrain(w, h);
  drawLane();
  drawBase(keep, "#62f4dd", false);
  drawBase(core, "#ff6a78", true);
  buildings.forEach(drawBuilding);
  allies.forEach(drawAlly);
  enemies.forEach(drawEnemy);
  drawHero();
  particles.forEach(drawParticle);
  ctx.restore();
  drawMinimap();
}

function drawTerrain(w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0c1917");
  grad.addColorStop(0.45, "#14202b");
  grad.addColorStop(1, "#150f1e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(121, 226, 140, 0.12)";
  for (let i = 0; i < 34; i++) {
    const x = sx((i * 97) % 1280);
    const y = sy(80 + ((i * 151) % 550));
    ctx.beginPath();
    ctx.ellipse(x, y, sx(34 + (i % 5) * 9), sy(18 + (i % 4) * 7), i, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(98, 244, 221, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - w * 0.25, h);
    ctx.stroke();
  }
}

function drawLane() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(48, 39, 57, 0.94)";
  ctx.lineWidth = sx(82);
  pathLane();
  ctx.stroke();
  ctx.strokeStyle = "rgba(169, 140, 255, 0.24)";
  ctx.lineWidth = sx(5);
  pathLane();
  ctx.stroke();
  lane.forEach((p, i) => {
    ctx.fillStyle = i % 2 ? "rgba(98, 244, 221, 0.18)" : "rgba(242, 195, 106, 0.12)";
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.y), sx(34), sy(14), -0.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function pathLane() {
  ctx.beginPath();
  ctx.moveTo(sx(lane[0].x), sy(lane[0].y));
  lane.slice(1).forEach((p) => ctx.lineTo(sx(p.x), sy(p.y)));
}

function drawBase(base, color, enemyBase) {
  ctx.save();
  ctx.translate(sx(base.x), sy(base.y));
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, sy(32), sx(base.r * 1.15), sy(16), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (drawSprite(enemyBase ? "core" : "tower", base.x, base.y + 48, enemyBase ? 124 : 88, enemyBase ? 104 : 112)) {
    return;
  }

  ctx.save();
  ctx.translate(sx(base.x), sy(base.y));
  ctx.fillStyle = enemyBase ? "#321723" : "#112b29";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-sx(base.r), -sy(base.r), sx(base.r * 2), sy(base.r * 1.75), 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -sy(base.r + 28));
  ctx.lineTo(sx(22), -sy(8));
  ctx.lineTo(0, sy(14));
  ctx.lineTo(-sx(22), -sy(8));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHero() {
  ctx.save();
  ctx.translate(sx(hero.x), sy(hero.y));
  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.beginPath();
  ctx.ellipse(0, sy(18), sx(24), sy(10), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const spriteName = state.selected === "dash" ? "heroDash" : "hero";
  if (drawSprite(spriteName, hero.x, hero.y + 36, state.selected === "dash" ? 74 : 58, state.selected === "dash" ? 52 : 76, hero.facing < 0)) {
    if (hero.shield > 0) {
      ctx.strokeStyle = "rgba(169, 140, 255, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx(hero.x), sy(hero.y), sx(31), 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }

  ctx.save();
  ctx.translate(sx(hero.x), sy(hero.y));
  if (hero.shield > 0) {
    ctx.strokeStyle = "rgba(169, 140, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, sx(31), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#eefbf5";
  ctx.beginPath();
  ctx.arc(0, -sy(8), sx(15), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a98cff";
  ctx.fillRect(-sx(10), sy(4), sx(20), sy(26));
  ctx.strokeStyle = "#62f4dd";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx(hero.facing * 14), -sy(2));
  ctx.lineTo(sx(hero.facing * 46), -sy(30));
  ctx.stroke();
  ctx.restore();
}

function drawAlly(a) {
  ctx.save();
  ctx.translate(sx(a.x), sy(a.y));
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.beginPath();
  ctx.ellipse(0, sy(10), sx(15), sy(7), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (drawSprite("minion", a.x, a.y + 24, 34, 38)) {
    ctx.strokeStyle = "rgba(240,255,249,0.7)";
    ctx.strokeRect(sx(a.x - 12), sy(a.y - 17), sx(24 * (a.hp / 34)), sy(3));
    return;
  }

  ctx.save();
  ctx.translate(sx(a.x), sy(a.y));
  ctx.fillStyle = "#79e28c";
  ctx.beginPath();
  ctx.arc(0, 0, sx(10), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(240,255,249,0.7)";
  ctx.strokeRect(-sx(12), -sy(17), sx(24 * (a.hp / 34)), sy(3));
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(sx(e.x), sy(e.y));
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, sy(13), sx(e.r * 1.25), sy(8), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (e.type === "golem" && drawSprite("golem", e.x, e.y + 36, 68, 62)) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(sx(e.x - e.r), sy(e.y - e.r - 10), sx(e.r * 2 * (e.hp / e.maxHp)), sy(4));
    return;
  }

  ctx.save();
  ctx.translate(sx(e.x), sy(e.y));
  ctx.fillStyle = e.type === "golem" ? "#7b4bd9" : e.type === "guard" ? "#ff6a78" : "#c95a6b";
  ctx.beginPath();
  ctx.arc(0, 0, sx(e.r), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(-sx(e.r), -sy(e.r + 10), sx(e.r * 2 * (e.hp / e.maxHp)), sy(4));
  ctx.restore();
}

function drawBuilding(b) {
  if (b.kind === "tower" && drawSprite("tower", b.x, b.y + 42, 72, 92)) {
    return;
  }
  if (b.kind === "wall" && drawSprite("wall", b.x, b.y + 34, 78, 44)) {
    return;
  }

  ctx.save();
  ctx.translate(sx(b.x), sy(b.y));
  ctx.fillStyle = b.enemy ? "#361823" : "#123532";
  ctx.strokeStyle = b.enemy ? "#ff6a78" : "#62f4dd";
  ctx.lineWidth = 2;
  if (b.kind === "tower") {
    ctx.beginPath();
    ctx.moveTo(0, -sy(32));
    ctx.lineTo(sx(24), sy(22));
    ctx.lineTo(-sx(24), sy(22));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(-sx(30), -sy(12), sx(60), sy(24));
    ctx.strokeRect(-sx(30), -sy(12), sx(60), sy(24));
  }
  ctx.restore();
}

function drawParticle(p) {
  ctx.globalAlpha = Math.max(0, p.life);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(sx(p.x), sy(p.y), sx(2 + p.life * 4), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawMinimap() {
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = "#07100f";
  mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.strokeStyle = "rgba(98,244,221,0.28)";
  mctx.lineWidth = 8;
  mctx.beginPath();
  mctx.moveTo((lane[0].x / 1280) * 180, (lane[0].y / 720) * 180);
  lane.slice(1).forEach((p) => mctx.lineTo((p.x / 1280) * 180, (p.y / 720) * 180));
  mctx.stroke();
  dot(hero, "#f0fff9", 4);
  dot(keep, "#62f4dd", 5);
  dot(core, "#ff6a78", 5);
  enemies.forEach((e) => dot(e, "#ff6a78", 2));
  allies.forEach((a) => dot(a, "#79e28c", 2));
}

function dot(unit, color, r) {
  mctx.fillStyle = color;
  mctx.beginPath();
  mctx.arc((unit.x / 1280) * 180, (unit.y / 720) * 180, r, 0, Math.PI * 2);
  mctx.fill();
}

function updateUi() {
  ui.shards.textContent = state.shards;
  ui.wave.textContent = state.wave;
  ui.rank.textContent = state.won ? "Conqueror" : state.cleared >= 6 ? "Raider" : "Scout";
  ui.hp.value = hero.hp;
  ui.energy.value = hero.energy;
  ui.keepProgress.value = keep.hp;
  ui.coreProgress.value = core.hp;
  ui.keepHp.textContent = `${Math.ceil(keep.hp)}%`;
  ui.coreHp.textContent = `${Math.ceil(core.hp)}%`;
  ui.questMonsters.classList.toggle("done", state.cleared >= 6);
  ui.questBase.classList.toggle("done", core.hp <= 0);
  ui.questBuild.classList.toggle("done", state.built >= 2 && state.wave >= 3);
}

function setStatus(text) {
  ui.status.textContent = text;
}

function applyGameMode() {
  const mode = GAME_MODES[GAME_MODE] || GAME_MODES.raidfield;
  document.title = `${mode.title} · Moncade`;
  document.getElementById("gameTitle").textContent = mode.title;
  document.getElementById("gameSubtitle").textContent = mode.subtitle;
  [ui.questMonsters, ui.questBase, ui.questBuild].forEach((item, index) => {
    item.textContent = mode.quests[index];
  });

  if (GAME_MODE === "mongeon") {
    state.shards = 10;
    state.wave = 1;
    hero.x = 210;
    hero.y = 430;
    enemies = [
      enemy(360, 218, "creep"),
      enemy(416, 262, "creep"),
      enemy(492, 318, "creep"),
      enemy(590, 386, "golem"),
      enemy(710, 280, "creep"),
      enemy(805, 342, "guard"),
      enemy(925, 378, "golem"),
    ];
  }

  if (GAME_MODE === "monclash") {
    state.shards = 36;
    state.wave = 3;
    keep.hp = 72;
    hero.x = keep.x + 86;
    hero.y = keep.y + 8;
    enemies = [
      enemy(310, 340, "raider"),
      enemy(360, 394, "raider"),
      enemy(460, 300, "golem"),
      enemy(640, 384, "guard"),
      enemy(905, 318, "golem"),
    ];
    buildings.push(
      { kind: "tower", x: keep.x + 112, y: keep.y - 70, hp: 90, enemy: false, cooldown: 0 },
      { kind: "wall", x: keep.x + 156, y: keep.y + 38, hp: 110, enemy: false }
    );
  }

  if (GAME_MODE === "monaba") {
    state.shards = 22;
    state.wave = 2;
    hero.x = 390;
    hero.y = 306;
    allies.push({ x: 278, y: 360, hp: 34, speed: 44, t: 0, attack: 0 });
    enemies = [
      enemy(520, 300, "creep"),
      enemy(620, 342, "creep"),
      enemy(720, 270, "guard"),
      enemy(838, 332, "creep"),
      enemy(968, 296, "golem"),
    ];
  }

  setStatus(mode.status);
}

function setChainStatus(text, tone = "") {
  ui.chainStatus.textContent = text;
  ui.chainStatus.className = tone;
}

function safeStorageSet(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch (error) {
    return false;
  }
  return true;
}

function safeStorageGet(key) {
  try {
    return window.localStorage?.getItem(key) || "";
  } catch (error) {
    return "";
  }
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function abiWord(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function encodeSubmitRun(payload) {
  return (
    SUBMIT_RUN_SELECTOR +
    [
      payload.wave,
      payload.cleared,
      payload.shards,
      payload.keepHp,
      payload.coreHp,
      payload.won ? 1 : 0,
    ]
      .map(abiWord)
      .join("")
  );
}

function getRunSnapshot() {
  return {
    cleared: state.cleared,
    wave: state.wave,
    shards: state.shards,
    keepHp: Math.ceil(keep.hp),
    coreHp: Math.ceil(core.hp),
    won: state.won,
    timestamp: Date.now(),
  };
}

async function ensureMonadNetwork() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId?.toLowerCase() === MONAD_TESTNET.chainId) return;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD_TESTNET.chainId }] });
  } catch (error) {
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [MONAD_TESTNET] });
  }
}

async function commitRun() {
  const payload = getRunSnapshot();
  safeStorageSet(RUN_STORAGE_KEY, JSON.stringify(payload));

  const contractAddress = ui.contractAddress.value.trim();
  if (!contractAddress) {
    setChainStatus("Local snapshot saved", "ready");
    setStatus("Run snapshot saved locally. Paste a deployed settlement contract to submit on Monad.");
    return;
  }

  if (!isAddress(contractAddress)) {
    setChainStatus("Invalid contract address", "error");
    setStatus("Settlement address must be a full 0x contract address.");
    return;
  }

  if (!window.ethereum) {
    setChainStatus("Wallet required", "error");
    setStatus("No injected wallet found. Connect a Monad-compatible EVM wallet to submit.");
    return;
  }

  ui.commitRun.disabled = true;
  setChainStatus("Preparing Monad tx...", "ready");
  try {
    await ensureMonadNetwork();
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: accounts[0],
          to: contractAddress,
          data: encodeSubmitRun(payload),
          value: "0x0",
        },
      ],
    });
    setChainStatus(`${txHash.slice(0, 10)}...${txHash.slice(-6)}`, "ready");
    setStatus("Run submitted to Monad Testnet.");
  } catch (error) {
    setChainStatus("Transaction not sent", "error");
    setStatus(error?.message || "Monad transaction was not sent.");
  } finally {
    ui.commitRun.disabled = false;
  }
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt, now);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  state.keys.add(key);
  const actions = { q: "slash", w: "shield", e: "dash", r: "vortex" };
  if (actions[key]) cast(actions[key]);
  const builds = { 1: "tower", 2: "wall", 3: "minion" };
  if (builds[key]) build(builds[key]);
});
window.addEventListener("keyup", (event) => state.keys.delete(event.key.toLowerCase()));
canvas.addEventListener("pointerdown", (event) => {
  const rect = canvas.getBoundingClientRect();
  state.mouseTarget = { x: wx(event.clientX - rect.left), y: wy(event.clientY - rect.top) };
});

document.querySelectorAll(".skill").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".skill").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    state.selected = button.dataset.action;
    cast(state.selected);
  });
});

document.querySelectorAll("[data-build]").forEach((button) => {
  button.addEventListener("click", () => build(button.dataset.build));
});

document.getElementById("connectWallet").addEventListener("click", async () => {
  if (!window.ethereum) {
    setStatus("No injected wallet found. Install a Monad-compatible EVM wallet.");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  setStatus(`Wallet connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
});

document.getElementById("switchMonad").addEventListener("click", async () => {
  if (!window.ethereum) {
    setStatus("No injected wallet found.");
    return;
  }
  try {
    await ensureMonadNetwork();
    setStatus("Wallet switched to Monad Testnet.");
  } catch (error) {
    setStatus(error?.message || "Could not switch to Monad Testnet.");
  }
});

ui.contractAddress.value = window.RAIDFIELD_CONTRACT_ADDRESS || safeStorageGet(CONTRACT_STORAGE_KEY);
if (ui.contractAddress.value && isAddress(ui.contractAddress.value)) {
  setChainStatus("Monad submit ready", "ready");
}

ui.contractAddress.addEventListener("input", () => {
  const address = ui.contractAddress.value.trim();
  safeStorageSet(CONTRACT_STORAGE_KEY, address);
  if (!address) {
    setChainStatus("Local snapshot mode");
  } else if (isAddress(address)) {
    setChainStatus("Monad submit ready", "ready");
  } else {
    setChainStatus("Invalid contract address", "error");
  }
});

ui.commitRun.addEventListener("click", commitRun);
window.MONAD_RAIDFIELD = { encodeSubmitRun, getRunSnapshot, MONAD_TESTNET };

applyGameMode();
resizeCanvas();
updateUi();
requestAnimationFrame(loop);
