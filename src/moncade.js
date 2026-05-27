const MONCADE_RUNS_KEY = "moncade-local-runs";
const MONCADE_CHAT_KEY = "moncade-chat";
const MONAD_TESTNET = {
  chainId: "0x279f",
  chainName: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
};

const sampleScores = [
  { game: "MonRaidfield", name: "gerry.eth", score: 18420 },
  { game: "MonRaidfield", name: "0xnad...44", score: 15370 },
  { game: "Monerge", name: "mokadel", score: 8192 },
  { game: "Monbubble", name: "chog", score: 6120 },
  { game: "Monslither", name: "salmonad", score: 5440 },
  { game: "Moncards", name: "mouch", score: 4200 },
];

const botLines = [
  ["Mokadel", "MonRaidfield folded Mongeon, Monclash, and Monaba into one cabinet."],
  ["Chog", "Hall of Nads is running local proofs until the contract is deployed."],
  ["Salmonad", "Press the featured cabinet and commit a run when the core cracks."],
  ["Emonad", "Moncade bundle read. Vaporwave cabinet energy: imported."],
];
const cabinetModes = {
  raidfield: {
    title: "MonRaidfield",
    version: "v0.2",
    src: "./moncade-game.html",
    line: "Mongeon + Monclash + Monaba merged into one run",
    description: "Control a champion, clear dungeon camps, build your keep, and crack the enemy core.",
    badges: ["MOBA", "Crawler", "Siege", "Monad-ready"],
  },
  mongeon: {
    title: "Mongeon",
    version: "dungeon",
    src: "./moncade-game.html?mode=mongeon",
    line: "Dungeon route loaded inside the playable Raidfield engine",
    description: "Chain room clears, pull packed creeps with Vortex, and spend shards before the boss push.",
    badges: ["Crawler", "Camps", "Vortex", "Shard run"],
  },
  monclash: {
    title: "Monclash",
    version: "siege",
    src: "./moncade-game.html?mode=monclash",
    line: "Base defense and counter-raid mode",
    description: "Start under pressure, build towers and walls, stabilize the keep, then counter-raid the core.",
    badges: ["Base raid", "Defense", "Builds", "Waves"],
  },
  monaba: {
    title: "Monaba",
    version: "lane",
    src: "./moncade-game.html?mode=monaba",
    line: "MOBA lane-brawler route",
    description: "Fight around the lane path, escort allied minions, win trades, and break through enemy towers.",
    badges: ["MOBA", "Lane", "Minions", "Towers"],
  },
};
let activeMode = "raidfield";

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
}

async function connectWallet() {
  if (!window.ethereum) {
    setWalletStatus("wallet unavailable");
    return;
  }
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD_TESTNET.chainId }] });
  } catch {
    try {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [MONAD_TESTNET] });
    } catch {}
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  setWalletStatus(shortAddress(accounts[0]));
}

function setWalletStatus(text) {
  document.getElementById("walletStatus").textContent = text;
  document.getElementById("connectWallet").textContent = text.includes("0x") ? text : "Connect Wallet";
}

function commitRun(source = "hero") {
  const mode = cabinetModes[activeMode] || cabinetModes.raidfield;
  const runs = safeJson(MONCADE_RUNS_KEY, []);
  const run = {
    game: mode.title,
    name: document.getElementById("walletStatus").textContent.includes("0x") ? document.getElementById("walletStatus").textContent : "local-player",
    score: 9000 + Math.floor(Math.random() * 9000),
    source,
    at: new Date().toISOString(),
  };
  runs.unshift(run);
  saveJson(MONCADE_RUNS_KEY, runs.slice(0, 12));
  document.getElementById("commitStatus").textContent = `Local run saved: ${run.score.toLocaleString()} pts`;
  renderLeaderboard();
}

function renderLeaderboard() {
  const entries = [...safeJson(MONCADE_RUNS_KEY, []), ...sampleScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const groups = ["MonRaidfield", "Monerge", "Monbubble"].map((game) => entries.filter((entry) => entry.game === game).slice(0, 4));
  document.getElementById("leaderboard").innerHTML = groups
    .map((group, index) => {
      const title = ["MonRaidfield", "Monerge", "Monbubble"][index];
      const rows = (group.length ? group : [{ name: "no runs yet", score: 0 }])
        .map((entry, rowIndex) => `<div class="score-row"><b>${rowIndex + 1}</b><span>${entry.name}</span><strong>${Number(entry.score || 0).toLocaleString()}</strong></div>`)
        .join("");
      return `<article class="leaderboard-card"><h3>${title}</h3>${rows}</article>`;
    })
    .join("");
}

function renderChat() {
  const log = document.getElementById("chatLog");
  const messages = safeJson(MONCADE_CHAT_KEY, botLines.map(([name, text]) => ({ name, text }))).slice(-16);
  log.innerHTML = messages.map((msg) => `<div class="chat-message"><strong>${msg.name}</strong><span>${msg.text}</span></div>`).join("");
  log.scrollTop = log.scrollHeight;
}

function addChat(name, text) {
  const messages = safeJson(MONCADE_CHAT_KEY, botLines.map(([botName, botText]) => ({ name: botName, text: botText })));
  messages.push({ name, text });
  saveJson(MONCADE_CHAT_KEY, messages.slice(-30));
  renderChat();
}

function drawPreview(canvas, type) {
  const ctx = canvas.getContext("2d");
  let tick = 0;
  function frame() {
    const w = canvas.width;
    const h = canvas.height;
    tick += 0.022;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#130828");
    grad.addColorStop(1, "#071019");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(140,247,240,.12)";
    for (let x = -w; x < w * 2; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(tick) * 8, 0);
      ctx.lineTo(x - 80, h);
      ctx.stroke();
    }
    if (type === "snake") drawSnake(ctx, w, h, tick);
    if (type === "blob") drawBlob(ctx, w, h, tick);
    if (type === "merge") drawMerge(ctx, w, h, tick);
    if (type === "raidfield") drawRaidfield(ctx, w, h, tick);
    requestAnimationFrame(frame);
  }
  frame();
}

function drawRaidfield(ctx, w, h, t) {
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(159,124,255,.42)";
  ctx.beginPath();
  ctx.moveTo(28, 118);
  ctx.lineTo(90, 100);
  ctx.lineTo(150, 118);
  ctx.lineTo(226, 74);
  ctx.lineTo(292, 96);
  ctx.stroke();
  [["#8cf7f0", 42, 116], ["#ff4fa1", 286, 94], ["#9f7cff", 164 + Math.sin(t) * 20, 112]].forEach(([color, x, y]) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSnake(ctx, w, h, t) {
  for (let i = 0; i < 13; i++) {
    ctx.fillStyle = i ? "#9f7cff" : "#8cf7f0";
    ctx.beginPath();
    ctx.arc(60 + i * 15, 90 + Math.sin(t * 3 + i * 0.6) * 24, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBlob(ctx, w, h, t) {
  [["#8cf7f0", 92, 92, 34], ["#ff4fa1", 205, 84, 24], ["#ffe66d", 250, 128, 15]].forEach(([color, x, y, r], i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t + i) * 12, y + Math.cos(t + i) * 8, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawMerge(ctx, w, h, t) {
  [2, 4, 8, 16].forEach((value, i) => {
    const x = 56 + (i % 2) * 80;
    const y = 48 + Math.floor(i / 2) * 62;
    ctx.fillStyle = i % 2 ? "rgba(159,124,255,.78)" : "rgba(140,247,240,.75)";
    ctx.fillRect(x + Math.sin(t + i) * 3, y, 58, 46);
    ctx.fillStyle = "#0a0418";
    ctx.font = "900 18px system-ui";
    ctx.fillText(value, x + 19, y + 30);
  });
}

function bootCabinet(modeName) {
  const mode = cabinetModes[modeName] || cabinetModes.raidfield;
  activeMode = modeName in cabinetModes ? modeName : "raidfield";
  document.getElementById("featuredGame").src = mode.src;
  document.getElementById("featuredCabinetName").textContent = mode.title;
  document.getElementById("featuredCabinetVersion").textContent = mode.version;
  document.getElementById("featuredModeLine").textContent = mode.line;
  document.getElementById("runTitle").textContent = mode.title;
  document.getElementById("runDescription").textContent = mode.description;
  document.getElementById("runBadges").innerHTML = mode.badges.map((badge) => `<span>${badge}</span>`).join("");
  document.getElementById("commitStatus").textContent = `${mode.title} booted. Commit a local proof after the run.`;
  document.querySelectorAll("[data-mode]").forEach((node) => node.classList.toggle("active", node.dataset.mode === activeMode));
  document.querySelectorAll(".cabinet[data-mode]").forEach((node) => node.classList.toggle("selected", node.dataset.mode === activeMode));
  document.getElementById("featured").scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll("canvas[data-preview]").forEach((canvas) => drawPreview(canvas, canvas.dataset.preview));
document.getElementById("connectWallet").addEventListener("click", connectWallet);
document.getElementById("commitHeroRun").addEventListener("click", () => commitRun("hero"));
document.getElementById("submitCabinetRun").addEventListener("click", () => commitRun("cabinet"));
document.querySelectorAll(".boot-cabinet, .mode-chip").forEach((button) => {
  button.addEventListener("click", () => bootCabinet(button.dataset.mode));
});
document.querySelectorAll(".cabinet[data-mode]").forEach((cabinet) => {
  cabinet.addEventListener("dblclick", () => bootCabinet(cabinet.dataset.mode));
});
document.getElementById("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text) return;
  addChat("local-player", text);
  input.value = "";
});

setInterval(() => {
  const [name, text] = botLines[Math.floor(Math.random() * botLines.length)];
  if (Math.random() > 0.55) addChat(name, text);
}, 9000);

renderLeaderboard();
renderChat();
