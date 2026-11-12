// Star Dodger - esquiva meteoritos, atrapa estrellas.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

// ---------- Audio generado con osciladores (sin archivos) ----------
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
// Reproduce un tono: tipo de onda, frecuencia inicial/final, duración y volumen.
function tone(type, f1, f2, dur, vol = 0.15, delay = 0) {
  const a = getAudio();
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}
const sfx = {
  start()    { tone("square", 330, 330, 0.1); tone("square", 440, 440, 0.1, 0.15, 0.1); tone("square", 660, 660, 0.2, 0.15, 0.2); },
  star()     { tone("sine", 880, 1760, 0.15, 0.2); },
  hit()      { tone("sawtooth", 220, 40, 0.35, 0.25); },
  gameOver() { tone("triangle", 440, 440, 0.25); tone("triangle", 330, 330, 0.25, 0.15, 0.25); tone("triangle", 220, 110, 0.6, 0.15, 0.5); },
};

// ---------- Estado ----------
const keys = {};
let state = "menu"; // menu | playing | over
let player, rocks, stars, particles, bgStars;
let score, lives, spawnTimer, starTimer, elapsed, invincible, lastTime;
let best = Number(localStorage.getItem("starDodgerBest") || 0);

function reset() {
  player = { x: W / 2, y: H - 60, w: 36, h: 40, speed: 360 };
  rocks = []; stars = []; particles = [];
  score = 0; lives = 3; spawnTimer = 0; starTimer = 0; elapsed = 0; invincible = 0;
}
bgStars = Array.from({ length: 70 }, () => ({
  x: Math.random() * W, y: Math.random() * H, s: Math.random() * 2 + 0.5,
}));
reset();

// Dificultad: sube con el puntaje.
function difficulty() { return 1 + score / 150; }

// ---------- Entrada ----------
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if ([" ", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
  if ((e.key === " " || e.key === "Enter") && state !== "playing") startGame();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

let touchX = null;
function touchPos(e) {
  const r = canvas.getBoundingClientRect();
  return (e.touches[0].clientX - r.left) * (W / r.width);
}
canvas.addEventListener("touchstart", (e) => { e.preventDefault(); if (state !== "playing") startGame(); touchX = touchPos(e); }, { passive: false });
canvas.addEventListener("touchmove", (e) => { e.preventDefault(); touchX = touchPos(e); }, { passive: false });
canvas.addEventListener("touchend", () => { touchX = null; });
canvas.addEventListener("mousedown", () => { if (state !== "playing") startGame(); });

function startGame() { reset(); state = "playing"; sfx.start(); }

// ---------- Lógica ----------
function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, sp = Math.random() * 150 + 40;
    particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.5, color });
  }
}

function update(dt) {
  bgStars.forEach((s) => { s.y += s.s * 30 * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } });
  particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
  particles = particles.filter((p) => p.life > 0);
  if (state !== "playing") return;

  elapsed += dt;
  const d = difficulty();

  // Movimiento
  let dir = 0;
  if (keys["arrowleft"] || keys["a"]) dir -= 1;
  if (keys["arrowright"] || keys["d"]) dir += 1;
  if (touchX !== null) player.x += Math.max(-1, Math.min(1, (touchX - player.x) / 20)) * player.speed * dt;
  else player.x += dir * player.speed * dt;
  player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));

  // Aparición de meteoritos y estrellas
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const size = 22 + Math.random() * 26;
    rocks.push({ x: Math.random() * (W - size), y: -size, w: size, h: size, vy: (140 + Math.random() * 80) * d, rot: 0, vr: Math.random() * 4 - 2 });
    spawnTimer = Math.max(0.25, 0.8 / d);
  }
  starTimer -= dt;
  if (starTimer <= 0) {
    stars.push({ x: Math.random() * (W - 24), y: -24, w: 24, h: 24, vy: 150 * Math.min(d, 2.5) });
    starTimer = 1.2 + Math.random();
  }

  rocks.forEach((r) => { r.y += r.vy * dt; r.rot += r.vr * dt; });
  stars.forEach((s) => { s.y += s.vy * dt; });
  if (invincible > 0) invincible -= dt;

  const pBox = { x: player.x - player.w / 2 + 4, y: player.y - player.h / 2 + 4, w: player.w - 8, h: player.h - 8 };

  // Colisiones con meteoritos
  for (const r of rocks) {
    if (invincible <= 0 && rectHit(pBox, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 })) {
      r.dead = true; lives--; invincible = 1.2;
      burst(player.x, player.y, "#ff5544", 20); sfx.hit();
      if (lives <= 0) {
        state = "over"; sfx.gameOver();
        if (score > best) { best = score; localStorage.setItem("starDodgerBest", best); }
      }
    }
  }
  // Colisiones con estrellas
  for (const s of stars) {
    if (rectHit(pBox, s)) { s.dead = true; score += 10; burst(s.x + 12, s.y + 12, "#ffe14d", 12); sfx.star(); }
  }
  rocks = rocks.filter((r) => !r.dead && r.y < H + 60);
  stars = stars.filter((s) => !s.dead && s.y < H + 40);
}

// ---------- Dibujo ----------
function drawStar(x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r, a = (Math.PI / 5) * i - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}
function centerText(text, y, size, color = "#fff") {
  ctx.fillStyle = color; ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(text, W / 2, y);
}

function draw() {
  ctx.fillStyle = "#0a0d24"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#9aa7ff";
  bgStars.forEach((s) => ctx.fillRect(s.x, s.y, s.s, s.s));

  stars.forEach((s) => drawStar(s.x + 12, s.y + 12, 13, "#ffe14d"));
  rocks.forEach((r) => {
    ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(r.rot);
    ctx.fillStyle = "#c0392b"; ctx.strokeStyle = "#ff8a75"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i, rad = (r.w / 2) * (i % 2 ? 0.8 : 1);
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  });

  // Nave (parpadea si es invencible)
  if (state !== "over" && (invincible <= 0 || Math.floor(invincible * 12) % 2 === 0)) {
    ctx.fillStyle = "#4dd2ff"; ctx.beginPath();
    ctx.moveTo(player.x, player.y - player.h / 2);
    ctx.lineTo(player.x + player.w / 2, player.y + player.h / 2);
    ctx.lineTo(player.x, player.y + player.h / 4);
    ctx.lineTo(player.x - player.w / 2, player.y + player.h / 2);
    ctx.closePath(); ctx.fill();
  }

  particles.forEach((p) => { ctx.globalAlpha = Math.max(p.life * 2, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); });
  ctx.globalAlpha = 1;

  // HUD
  ctx.fillStyle = "#fff"; ctx.font = "bold 18px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Puntos: " + score, 12, 28);
  ctx.textAlign = "right"; ctx.fillText("Récord: " + best, W - 12, 28);
  ctx.textAlign = "left"; ctx.fillText("❤".repeat(Math.max(lives, 0)), 12, 52);

  if (state === "menu") {
    centerText("STAR DODGER", H / 2 - 40, 44, "#ffe14d");
    centerText("Esquiva los meteoritos, atrapa estrellas", H / 2 + 5, 18);
    centerText("Pulsa ESPACIO o toca para jugar", H / 2 + 45, 20, "#4dd2ff");
  } else if (state === "over") {
    centerText("GAME OVER", H / 2 - 30, 48, "#ff5544");
    centerText("Puntos: " + score + (score >= best && score > 0 ? "  ¡Nuevo récord!" : ""), H / 2 + 12, 22);
    centerText("Pulsa ESPACIO para reintentar", H / 2 + 52, 20, "#4dd2ff");
  }
}

// ---------- Bucle principal ----------
function loop(now) {
  const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
