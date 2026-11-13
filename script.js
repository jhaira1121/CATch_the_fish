// ---------- Grab page elements ----------
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const livesEl = document.getElementById("lives");
const timeEl = document.getElementById("time");
const startScreen = document.getElementById("startScreen");
const pauseScreen = document.getElementById("pauseScreen");
const endScreen = document.getElementById("endScreen");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");

// ---------- Game settings ----------
const GAME_SECONDS = 60;
const FISH = ["🐟", "🐠", "🐡"];   // different colors
const TRASH = ["🥫", "🧴"];         // can and plastic bottle

// ---------- Game variables ----------
let W = 300, H = 400;              // canvas size in pixels
let state = "start";               // start, playing, paused, over
let score = 0, lives = 3, timeLeft = GAME_SECONDS;
let highScore = 0;
let cat = { x: 150, size: 60 };
let items = [];                    // falling fish and trash
let popups = [];                   // "Yummy! +1" messages
let bubbles = [];
let spawnTimer = 0, elapsed = 0, lastTime = 0;
let keys = { left: false, right: false };
let dragging = false;

// Load high score (wrapped in try/catch in case storage is blocked)
try { highScore = Number(localStorage.getItem("catchFishBest")) || 0; } catch (e) {}
bestEl.textContent = highScore;

// ---------- Sound effects (made with the browser, no files needed) ----------
let audioCtx = null;
function beep(freq, duration, type) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}
const soundYum = () => { beep(660, 0.12); setTimeout(() => beep(880, 0.15), 90); };
const soundOops = () => beep(150, 0.35, "sawtooth");

// ---------- Resize the canvas to fit the screen ----------
function resize() {
  const oldW = W;
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W;
  canvas.height = H;
  cat.size = Math.max(48, W * 0.17);
  cat.x = (cat.x / oldW) * W;      // keep the cat in the same spot
  bubbles = [];
  for (let i = 0; i < 14; i++) {
    bubbles.push({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 5, s: 10 + Math.random() * 20 });
  }
}
window.addEventListener("resize", resize);

// ---------- Start / reset the game ----------
function resetGame() {
  score = 0; lives = 3; timeLeft = GAME_SECONDS;
  items = []; popups = [];
  spawnTimer = 0; elapsed = 0;
  cat.x = W / 2;
  updateHud();
}

function startGame() {
  resetGame();
  state = "playing";
  startScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  pauseBtn.disabled = false;
  restartBtn.disabled = false;
  pauseBtn.textContent = "Pause";
  lastTime = performance.now();
  beep(520, 0.1);
}

function togglePause() {
  if (state === "playing") {
    state = "paused";
    pauseScreen.classList.remove("hidden");
    pauseBtn.textContent = "Resume";
  } else if (state === "paused") {
    state = "playing";
    pauseScreen.classList.add("hidden");
    pauseBtn.textContent = "Pause";
    lastTime = performance.now();
  }
}

function endGame(reason) {
  state = "over";
  pauseBtn.disabled = true;
  document.getElementById("endTitle").textContent = lives <= 0 ? "Game Over 😿" : "Time's Up! ⏰";
  document.getElementById("endReason").textContent = reason;
  document.getElementById("finalScore").textContent = score;
  const newBest = score > highScore;
  document.getElementById("newBest").textContent = newBest ? "🎉 New high score!" : "";
  if (newBest) {
    highScore = score;
    bestEl.textContent = highScore;
    try { localStorage.setItem("catchFishBest", highScore); } catch (e) {}
  }
  endScreen.classList.remove("hidden");
}

function updateHud() {
  scoreEl.textContent = score;
  livesEl.textContent = "❤️".repeat(lives) + "🖤".repeat(3 - lives);
  timeEl.textContent = Math.ceil(timeLeft);
}

// ---------- Falling objects ----------
function spawnItem() {
  const isTrash = Math.random() < 0.25;           // 25% of objects are trash
  const size = isTrash ? 34 + Math.random() * 10 : 28 + Math.random() * 26;  // fish have different sizes
  items.push({
    x: size / 2 + Math.random() * (W - size),
    y: -size,
    size: size,
    trash: isTrash,
    emoji: isTrash ? TRASH[Math.floor(Math.random() * TRASH.length)] : FISH[Math.floor(Math.random() * FISH.length)],
    wobble: Math.random() * 6
  });
}

function showPopup(text, x, y, color) {
  popups.push({ text, x, y, color, life: 1 });
}

// ---------- Main update ----------
function update(dt) {
  elapsed += dt;
  timeLeft -= dt;
  if (timeLeft <= 0) { timeLeft = 0; updateHud(); endGame("You made it through 60 seconds!"); return; }

  // Move the cat with the keyboard
  const catSpeed = W * 0.9;
  if (keys.left) cat.x -= catSpeed * dt;
  if (keys.right) cat.x += catSpeed * dt;
  cat.x = Math.max(cat.size / 2, Math.min(W - cat.size / 2, cat.x));

  // Objects get faster and spawn more often over time
  const speedUp = 1 + elapsed / 25;
  const fallSpeed = H * 0.28 * speedUp;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnItem();
    spawnTimer = Math.max(0.35, 1 / speedUp + Math.random() * 0.4);
  }

  // Move items and check if the cat caught them
  const catTop = H - cat.size * 1.1;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.y += fallSpeed * dt;

    const caught = it.y + it.size / 2 > catTop && it.y < H - 4 &&
                   Math.abs(it.x - cat.x) < (cat.size + it.size) / 2.4;
    if (caught) {
      if (it.trash) {
        lives--;
        soundOops();
        showPopup("Oops! -1 Life", cat.x, catTop - 10, "#ff4d4d");
      } else {
        score++;
        soundYum();
        showPopup("Yummy! +1", cat.x, catTop - 10, "#ffe45e");
      }
      items.splice(i, 1);
      updateHud();
      if (lives <= 0) { endGame("You ran out of lives!"); return; }
    } else if (it.y > H + it.size) {
      items.splice(i, 1);   // fell off the screen
    }
  }

  // Move popups and bubbles
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].y -= 40 * dt;
    popups[i].life -= dt * 1.1;
    if (popups[i].life <= 0) popups.splice(i, 1);
  }
  updateHud();
}

// ---------- Drawing ----------
function drawEmoji(emoji, x, y, size) {
  ctx.font = size + "px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, x, y);
}

function draw(time) {
  // Ocean background
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#7fd6ff");
  g.addColorStop(1, "#1f7fc4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Bubbles floating up
  ctx.fillStyle = "rgba(255,255,255,.35)";
  bubbles.forEach(b => {
    if (state === "playing") { b.y -= b.s * 0.016; if (b.y < -10) { b.y = H + 10; b.x = Math.random() * W; } }
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  });

  // Sand at the bottom
  ctx.fillStyle = "#f6dc9b";
  ctx.fillRect(0, H - 14, W, 14);

  // Falling items (they wiggle a little)
  items.forEach(it => {
    drawEmoji(it.emoji, it.x + Math.sin(time / 250 + it.wobble) * 3, it.y, it.size);
  });

  // The cat (bounces slightly)
  const bounce = Math.sin(time / 200) * 2;
  drawEmoji("🐱", cat.x, H - cat.size * 0.6 + bounce, cat.size);

  // Popup messages
  popups.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.font = "bold " + Math.max(16, W * 0.05) + "px 'Trebuchet MS', Arial";
    ctx.textAlign = "center";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.strokeText(p.text, Math.max(70, Math.min(W - 70, p.x)), p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, Math.max(70, Math.min(W - 70, p.x)), p.y);
    ctx.globalAlpha = 1;
  });
}

// ---------- Game loop ----------
function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000);   // seconds since last frame
  lastTime = time;
  if (state === "playing") update(dt);
  draw(time);
  requestAnimationFrame(loop);
}

// ---------- Controls ----------
window.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") { keys.left = true; e.preventDefault(); }
  if (k === "arrowright" || k === "d") { keys.right = true; e.preventDefault(); }
  if (k === "p" || k === "escape") togglePause();
});
window.addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") keys.left = false;
  if (k === "arrowright" || k === "d") keys.right = false;
});

// Drag with finger or mouse
function moveCatTo(e) {
  const rect = canvas.getBoundingClientRect();
  cat.x = Math.max(cat.size / 2, Math.min(W - cat.size / 2, e.clientX - rect.left));
}
canvas.addEventListener("pointerdown", e => { dragging = true; moveCatTo(e); });
window.addEventListener("pointermove", e => { if (dragging && state === "playing") moveCatTo(e); });
window.addEventListener("pointerup", () => { dragging = false; });

// Buttons
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("againBtn").addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", startGame);
document.getElementById("resumeBtn").addEventListener("click", togglePause);
pauseBtn.addEventListener("click", togglePause);

// Pause automatically if the player switches tabs
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "playing") togglePause(); });

// ---------- Go! ----------
resize();
cat.x = W / 2;
requestAnimationFrame(loop);
