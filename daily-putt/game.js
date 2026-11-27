// The Daily Putt: prototype.
// One hole per day, generated from the New York date, so every player gets
// the same hole and nothing has to run on a server to "drop" it at midnight.
import * as THREE from "./vendor/three.module.min.js";
import { EffectComposer } from "./vendor/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "./vendor/postprocessing/RoundedBoxGeometry.js";

// ───────────────────────── Tuning (the numbers worth playing with) ─────────────────────────
const TUNE = {
  penalty: 10,          // seconds added for water / out of bounds
  maxDrive: 150,        // full swing distance from fairway, in yards
  maxPutt: 55,          // full putt distance
  carry: 0.8,          // share of a full shot spent in the air
  windPush: 0.4,        // sideways acceleration per mph while the ball is in the air
  friction: { green: 12, fairway: 14, rough: 38, sand: 110, path: 9 },
  bounce: { green: 0.3, fairway: 0.38, rough: 0.22, sand: 0.05, path: 0.6 },   // how much a landing ball springs back up
  grip: { green: 0.5, fairway: 0.6, rough: 0.4, sand: 0.15, path: 0.8 },        // forward speed kept on landing
  slopePull: 28,        // how hard hills pull a rolling ball downhill
  lie: { fairway: 1, green: 1, path: 1, rough: 0.8, sand: 0.55 }, // distance multiplier by lie
  cupRadius: 1.2,
  cupSpeed: 14,         // faster than this and the ball rolls over the cup
  cartSpeed: 36,
  cartTurn: 4.0,        // radians per second
  cartRadius: 2.2,
  arrive: 7,            // how close the cart must get to the ball
  walk: 16,             // shots shorter than this: no cart needed
};
const TZ = "America/New_York";
const LAUNCH = "2026-11-27"; // hole #1

// ───────────────────────── Dates and seeded randomness ─────────────────────────
function nyDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function secondsToNyMidnight() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" })
    .formatToParts(new Date());
  const n = (t) => +p.find((x) => x.type === t).value;
  return 86400 - (n("hour") * 3600 + n("minute") * 60 + n("second"));
}
function holeNumber(date) {
  const u = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((u(date) - u(LAUNCH)) / 864e5) + 1;
}
function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ───────────────────────── Hole generation ─────────────────────────
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }; // works for a > b too
const lerp = (a, b, t) => a + (b - a) * t;
function ellM(e, x, y) { // 0 at the centre of an ellipse, 1 on its edge
  const c = Math.cos(-e.rot), s = Math.sin(-e.rot), dx = x - e.x, dy = y - e.y;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return Math.sqrt((lx * lx) / (e.rx * e.rx) + (ly * ly) / (e.ry * e.ry));
}
function inEllipse(e, x, y, pad = 0) {
  return ellM({ x: e.x, y: e.y, rot: e.rot, rx: e.rx + pad, ry: e.ry + pad }, x, y) < 1;
}
function distToLine(line, x, y) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    const vx = bx - ax, vy = by - ay;
    const t = clamp01(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy));
    best = Math.min(best, dist(x, y, ax + vx * t, ay + vy * t));
  }
  return best;
}

// The day's weather. Wind is the main challenge, so each kind has its own range of wind speeds.
// wet slows a rolling ball and deadens its bounce. The rest is how the day looks.
const WEATHER = {
  sunny:  { name: "Sunny", chance: 0.3, wind: [4, 11], wet: 1, tint: [1, 1, 1], sat: 1.35, haze: 0, fog: ["#a3adc4", 1.45, 420, 2400], sun: ["#ffe9c0", 3.2], sky: 1.5, rain: 0 },
  golden: { name: "Golden hour", chance: 0.2, wind: [3, 10], wet: 1, tint: [1.2, 0.84, 0.62], sat: 1.25, haze: 0.3, fog: ["#f0b98c", 1.25, 300, 1900], sun: ["#ffae66", 3.3], sky: 1.15, rain: 0 },
  windy:  { name: "Windy", chance: 0.22, wind: [13, 22], wet: 1, tint: [0.86, 0.9, 1], sat: 0.85, haze: 0.1, fog: ["#a6b0c2", 1.2, 380, 2200], sun: ["#fff4e0", 2.5], sky: 1.7, rain: 0 },
  rain:   { name: "Rain", chance: 0.16, wind: [7, 16], wet: 1.35, tint: [0.5, 0.55, 0.63], sat: 0.25, haze: 0.6, fog: ["#8e98a8", 0.8, 50, 750], sun: ["#dfe6f0", 0.9], sky: 2.0, rain: 1 },
  mist:   { name: "Morning mist", chance: 0.12, wind: [0, 5], wet: 1.12, tint: [1, 1, 1], sat: 0.7, haze: 1, fog: ["#e3e9ee", 1.15, 20, 400], sun: ["#fff1d8", 1.9], sky: 1.8, rain: 0 },
};
function generateHole(seed) {
  const r = mulberry32(hashStr("daily-putt:" + seed));
  const rand = (a, b) => a + (b - a) * r();
  const sign = () => (r() < 0.5 ? -1 : 1);

  const L = rand(330, 430); // a par 4
  const ctrl = [[0, 0]];
  for (let i = 1, x = 0; i <= 4; i++) { x += sign() * rand(14, 50); ctrl.push([x, (L * i) / 4]); } // up to four bends
  const o3 = ctrl[4][0];
  const line = [];
  for (let i = 0; i < 4; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, 4)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      line.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  line.push(ctrl[4]);
  const at = (t) => { // point and sideways normal at 0..1 along the fairway
    const i = Math.min(line.length - 2, Math.floor(t * (line.length - 1)));
    const [ax, ay] = line[i], [bx, by] = line[i + 1], l = dist(ax, ay, bx, by) || 1;
    return { x: ax, y: ay, nx: -(by - ay) / l, ny: (bx - ax) / l };
  };

  const hw = rand(14, 19);
  const green = { x: o3, y: L, r: rand(15, 20) };
  const ca = rand(0, Math.PI * 2), cd = rand(0, green.r * 0.55);
  const cup = { x: green.x + Math.cos(ca) * cd, y: green.y + Math.sin(ca) * cd };
  const xs = line.map((p) => p[0]);
  const bounds = { minX: Math.min(...xs) - 55, maxX: Math.max(...xs) + 55, minY: -28, maxY: L + green.r + 22 };

  const ponds = [];
  // Most days a creek cuts right across the fairway, with one bridge for the cart.
  let creek = null, bridge = null;
  if (r() < 0.65) {
    const p = at(rand(0.3, 0.62));
    creek = { x: p.x, y: p.y, rx: rand(50, 62), ry: rand(3.5, 5), rot: Math.atan2(p.ny, p.nx), creek: true };
    ponds.push(creek);
    bridge = { x: p.x, y: p.y, tx: p.ny, ty: -p.nx, half: creek.ry + 4, w: 4.6 };
  }
  const wantPonds = ponds.length + 1 + (r() < 0.6 ? 1 : 0) + (r() < 0.3 ? 1 : 0);
  for (let tries = 0; tries < 60 && ponds.length < wantPonds; tries++) {
    const p = at(rand(0.2, 0.85));
    const off = r() < 0.3 ? rand(-5, 5) : sign() * rand(hw * 0.6, hw + 18);
    const e = { x: p.x + p.nx * off, y: p.y + p.ny * off, rx: rand(13, 24), ry: rand(9, 17), rot: rand(0, Math.PI) };
    if (dist(e.x, e.y, 0, 0) < e.rx + 30) continue;
    if (dist(e.x, e.y, green.x, green.y) < green.r + e.rx + 5) continue;
    if (ponds.some((q) => dist(e.x, e.y, q.x, q.y) < e.rx + q.rx + 8)) continue;
    ponds.push(e);
  }

  const bunkers = [];
  const greenside = 1 + (r() < 0.7 ? 1 : 0) + (r() < 0.3 ? 1 : 0);
  for (let tries = 0; tries < 40 && bunkers.length < greenside; tries++) {
    const a = rand(0, Math.PI * 2), ry = rand(4, 6);
    const e = { x: green.x + Math.cos(a) * (green.r + ry + 2), y: green.y + Math.sin(a) * (green.r + ry + 2),
      rx: rand(6, 10), ry, rot: a + Math.PI / 2 };
    if (bunkers.some((q) => dist(e.x, e.y, q.x, q.y) < e.rx + q.rx + 2)) continue;
    bunkers.push(e);
  }
  const wantBunkers = bunkers.length + 2 + (r() < 0.6 ? 1 : 0) + (r() < 0.4 ? 1 : 0);
  for (let tries = 0; tries < 90 && bunkers.length < wantBunkers; tries++) {
    const p = at(rand(0.2, 0.9)), off = sign() * rand(hw - 3, hw + 6);
    const e = { x: p.x + p.nx * off, y: p.y + p.ny * off, rx: rand(6, 10), ry: rand(4, 7), rot: rand(0, Math.PI) };
    if (dist(e.x, e.y, green.x, green.y) < green.r + e.rx + 6) continue;
    if (ponds.some((q) => dist(e.x, e.y, q.x, q.y) < e.rx + q.rx + 3)) continue;
    if (bunkers.some((q) => dist(e.x, e.y, q.x, q.y) < e.rx + q.rx + 3)) continue;
    bunkers.push(e);
  }
  const clearOfHazards = (x, y, pad) =>
    !ponds.some((q) => inEllipse(q, x, y, pad)) && !bunkers.some((q) => inEllipse(q, x, y, pad));

  // A cart path down one side of the fairway, when a side is free of water and sand.
  let path = null;
  for (const side of creek ? [] : r() < 0.5 ? [1, -1] : [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const p = at((i / 40) * 0.93);
      pts.push([p.x + p.nx * side * (hw + 6), p.y + p.ny * side * (hw + 6)]);
    }
    if (pts.every(([x, y]) => clearOfHazards(x, y, 3))) { path = pts; break; }
  }

  // Things the cart (and the ball) bump into.
  const obstacles = [];
  for (let tries = 0; tries < 900 && obstacles.length < 85; tries++) {
    const x = rand(bounds.minX + 5, bounds.maxX - 5), y = rand(bounds.minY + 5, bounds.maxY - 5), rad = rand(3, 5.5);
    const pine = r() < 0.6;
    if (distToLine(line, x, y) < hw + rad + 5) continue;
    if (path && distToLine(path, x, y) < rad + 3) continue;
    if (dist(x, y, green.x, green.y) < green.r + rad + 7) continue;
    if (dist(x, y, 0, 0) < 16) continue;
    if (!clearOfHazards(x, y, rad + 2)) continue;
    if (obstacles.some((o) => dist(x, y, o.x, o.y) < rad + o.r + 6)) continue;
    obstacles.push({ x, y, r: rad, kind: "tree", pine, h: rad * (pine ? 3.4 : 2.7) });
  }
  const wantRocks = 2 + Math.floor(r() * 3);
  for (let tries = 0, n = 0; tries < 40 && n < wantRocks; tries++) {
    const p = at(rand(0.2, 0.85)), off = rand(-hw + 3, hw - 3);
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (!clearOfHazards(x, y, 5) || dist(x, y, green.x, green.y) < green.r + 10) continue;
    if (bridge && dist(x, y, bridge.x, bridge.y) < 16) continue;
    obstacles.push({ x, y, r: rand(1.8, 2.4), kind: "rock" }); n++;
  }

  // A mower that drives back and forth across the fairway. It blocks the cart and a rolling ball.
  for (let tries = 0; tries < 20; tries++) {
    const p = at(rand(0.18, 0.85)), span = hw + 6;
    if ([-1, -0.5, 0, 0.5, 1].some((k) => !clearOfHazards(p.x + p.nx * span * k, p.y + p.ny * span * k, 4))) continue;
    if (bridge && dist(p.x, p.y, bridge.x, bridge.y) < 30) continue;
    obstacles.push({ kind: "mower", cx: p.x, cy: p.y, nx: p.nx, ny: p.ny, span, period: rand(8, 12), x: p.x, y: p.y, r: 2.6, a: 0 });
    break;
  }

  let weather = "sunny";
  { // pick the day's weather, or take ?weather=rain and so on from the link
    let t = r();
    for (const k in WEATHER) { if (t < WEATHER[k].chance) { weather = k; break; } t -= WEATHER[k].chance; }
    const asked = typeof location !== "undefined" && new URLSearchParams(location.search).get("weather");
    if (WEATHER[asked]) weather = asked;
  }
  const wr = WEATHER[weather].wind;
  const wind = { angle: rand(0, Math.PI * 2), mph: Math.round(rand(wr[0], wr[1])) };
  // Trees turn colour on some days: autumn, blossom, or plain summer green.
  const season = ["summer", "autumn", "blossom"][Math.floor(r() * 3)];

  // Rolling ground: a few long waves, plus a tilt on the green so putts break.
  const waves = [[260, 3.8], [150, 2.5], [80, 1.3], [48, 0.6]].map(([len, amp]) => {
    const a = rand(0, Math.PI * 2), k = (Math.PI * 2) / len;
    return { kx: Math.cos(a) * k, ky: Math.sin(a) * k, ph: rand(0, 7), amp };
  });
  const ta = rand(0, Math.PI * 2), tilt = rand(0.012, 0.04);
  const greenTilt = { x: Math.cos(ta) * tilt, y: Math.sin(ta) * tilt };

  const ramp = rand(-0.022, 0.022); // the whole hole climbs or drops from tee to green
  const H = { seed, L, line, hw, green, cup, bounds, ponds, bunkers, obstacles, wind, weather, season, wet: WEATHER[weather].wet, path, waves, greenTilt, creek, bridge, ramp };
  buildHeights(H);
  return H;
}

// Heights are stored on a grid. The ground mesh and the physics read the same grid.
const CELL = 3, MARGIN = 120;
function buildHeights(H) {
  const b = H.bounds;
  const ext = H.ext = { minX: b.minX - MARGIN, minY: b.minY - MARGIN, maxX: b.maxX + MARGIN, maxY: b.maxY + MARGIN };
  ext.w = ext.maxX - ext.minX; ext.h = ext.maxY - ext.minY;
  const nx = H.nx = Math.ceil(ext.w / CELL) + 1, ny = H.ny = Math.ceil(ext.h / CELL) + 1;
  const raw = (x, y) => {
    let h = 0;
    for (const w of H.waves) h += w.amp * Math.sin(w.kx * x + w.ky * y + w.ph);
    return h * lerp(0.4, 1.25, smooth(H.hw * 0.5, H.hw + 50, distToLine(H.line, x, y))) + H.ramp * (y - H.L / 2); // gentler on the fairway
  };
  const teeH = raw(0, 0) + 1.2, greenH = raw(H.green.x, H.green.y) + 1;
  for (const p of H.ponds) p.level = raw(p.x, p.y) - 1.2;
  const g = H.grid = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = ext.minX + i * CELL, y = ext.minY + j * CELL;
    let h = raw(x, y);
    h = lerp(h, teeH, smooth(24, 9, dist(x, y, 0, 0)));
    for (const p of H.ponds) {
      const m = ellM(p, x, y);
      h = lerp(h, p.level, smooth(2.1, 1.2, m)) - 2.4 * smooth(1.05, 0.72, m);
    }
    if (H.bridge) { // a strip of land across the creek
      const q = H.bridge, dx = x - q.x, dy = y - q.y, along = Math.abs(dx * q.tx + dy * q.ty), side = Math.abs(-dx * q.ty + dy * q.tx);
      h = lerp(h, H.creek.level + 0.5, smooth(q.w + 4, q.w + 0.5, side) * smooth(q.half + 9, q.half + 1, along));
    }
    const gd = dist(x, y, H.green.x, H.green.y) / H.green.r;
    h = lerp(h, greenH + H.greenTilt.x * (x - H.green.x) + H.greenTilt.y * (y - H.green.y), smooth(1.7, 1.05, gd));
    for (const e of H.bunkers) {
      const m = ellM(e, x, y);
      h += 0.45 * smooth(1.6, 1.15, m) * smooth(0.85, 1.15, m) - 1.1 * smooth(1.0, 0.5, m); // raised lip, sunken sand
    }
    const edge = Math.min(x - ext.minX, ext.maxX - x, y - ext.minY, ext.maxY - y);
    g[j * nx + i] = lerp(-7, h, smooth(0, 50, edge)); // the land falls away at the far edge
  }
}
function heightAt(H, x, y) {
  const fx = Math.max(0, Math.min(H.nx - 1.001, (x - H.ext.minX) / CELL)), fy = Math.max(0, Math.min(H.ny - 1.001, (y - H.ext.minY) / CELL));
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, g = H.grid, k = j * H.nx + i;
  return lerp(lerp(g[k], g[k + 1], u), lerp(g[k + H.nx], g[k + H.nx + 1], u), v);
}
function slopeAt(H, x, y) {
  return { x: (heightAt(H, x + 1, y) - heightAt(H, x - 1, y)) / 2, y: (heightAt(H, x, y + 1) - heightAt(H, x, y - 1)) / 2 };
}

function onBridge(H, x, y, pad = 0) {
  const q = H.bridge;
  if (!q) return false;
  const dx = x - q.x, dy = y - q.y;
  return Math.abs(dx * q.tx + dy * q.ty) < q.half + pad && Math.abs(-dx * q.ty + dy * q.tx) < q.w;
}
function terrainAt(H, x, y) {
  const b = H.bounds;
  if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return "ob";
  if (onBridge(H, x, y)) return "path";
  if (H.ponds.some((e) => inEllipse(e, x, y))) return "water";
  if (dist(x, y, H.green.x, H.green.y) < H.green.r) return "green";
  if (H.bunkers.some((e) => inEllipse(e, x, y))) return "sand";
  if (H.path && distToLine(H.path, x, y) < 1.5) return "path";
  if (dist(x, y, 0, 0) < 9 || distToLine(H.line, x, y) < H.hw) return "fairway";
  return "rough";
}

// ───────────────────────── Leaderboard (local stub) ─────────────────────────
// Same two calls a real backend (Supabase / Firebase) would provide.
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const Leaderboard = {
  async submit(date, entry) {
    const list = store.get("dailyputt:lb:" + date, []);
    list.push(entry);
    store.set("dailyputt:lb:" + date, list);
  },
  async top(date) {
    return store.get("dailyputt:lb:" + date, []).sort((a, b) => a.score - b.score).slice(0, 20);
  },
};

// ───────────────────────── Scene ─────────────────────────
// The game logic is flat (x, y on the ground). Drawing is 3D with z as height.
// Two quality levels: "high" for computers, "low" for phones. Add ?q=high or ?q=low to the link to force one.
const QUALITY = (() => {
  const q = new URLSearchParams(location.search).get("q");
  if (q === "low" || q === "high") return q;
  return matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 700 ? "low" : "high";
})();
const HI = QUALITY === "high";
const $ = (id) => document.getElementById(id);
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HI ? 2 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// The sky is a real photo (free from Poly Haven, see assets/CREDITS.md). The sun sits where it is in the photo.
const SKY_GAIN = 1.45;
const SKY = { zenith: new THREE.Color("#0f55c8"), horizon: new THREE.Color("#a3adc4").multiplyScalar(SKY_GAIN), sun: new THREE.Color("#fff0cc") };
const SUN_EL = 47.3 * Math.PI / 180, SUN_AZ = Math.atan2(-0.35, -0.6);
const SUN_DIR = new THREE.Vector3(Math.cos(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL));
const loader = new THREE.TextureLoader();
function loadTex(file, { srgb = false, repeat = 0, done = null } = {}) {
  const t = loader.load("assets/" + file, done || undefined);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 8;
  return t;
}
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY.horizon, 420, 2400);
const skyLight = new THREE.HemisphereLight("#cfe2ff", "#8a9a5c", 1.5);
skyLight.position.set(0, 0, 1);
const sun = new THREE.DirectionalLight("#ffe9c0", 3.2);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(HI ? 2048 : 1024);
const SHADOW = HI ? 130 : 95;
Object.assign(sun.shadow.camera, { left: -SHADOW, right: SHADOW, top: SHADOW, bottom: -SHADOW, near: 1, far: 800 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.7;
scene.add(skyLight, sun, sun.target);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 6000);
camera.up.set(0, 0, 1);
// rot is the camera's heading: "up the screen" points along (-sin rot, cos rot) on the ground.
const cam = { rot: 0, rotTarget: null, pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true,
  back: 26, height: 17, ahead: 36, fx: 0, fy: 0 };
// On computers the picture goes through a glow pass before it reaches the screen.
let composer = null;
if (HI) {
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.8, 0.92));
  composer.addPass(new OutputPass());
}
let W = 1, Hpx = 1;
function resize() {
  W = window.innerWidth; Hpx = window.innerHeight;
  renderer.setSize(W, Hpx, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, Hpx); }
  camera.aspect = W / Hpx;
  camera.fov = camera.aspect < 1 ? 70 : 52; // taller view on a phone held upright
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const CIRCLE = new THREE.CircleGeometry(1, 40);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const TRUNK = new THREE.CylinderGeometry(0.65, 1, 1, 8);
const CONE = new THREE.ConeGeometry(1, 1, 11);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 20, 14);
// Lumpy shapes for leaves and rocks: a ball with its surface pushed in and out.
function lumpy(detail, amount, seed, faceted = false) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 2) * Math.sin(v.z * 4.7 + seed * 3);
    v.multiplyScalar(1 + n * amount); p.setXYZ(i, v.x, v.y, v.z);
  }
  if (faceted) g.computeVertexNormals();
  else g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(p.array).map((_, i, a) => { const k = i - (i % 3); return a[i] / Math.hypot(a[k], a[k + 1], a[k + 2]); }), 3)); // rounded shading
  return g;
}
const LEAF = lumpy(3, 0.3, 1.3), ROCK = lumpy(1, 0.3, 4.1, true);
let plainRock = null;
const std = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });
const lam = std;
plainRock = std("#8d9299", 0.9);
const basic = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
// A solid standing on the ground: w wide, h tall, with its base at height z.
function solid(geo, material, w, h, z = 0, d = w) {
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = Math.PI / 2; m.scale.set(w, h, d); m.position.z = z + h / 2; m.castShadow = true;
  return m;
}
const TONE = "\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n";

// Sky with a sun and far hills. These never change between holes.
const skyU = { skyTint: { value: new THREE.Vector3(1, 1, 1) }, skySat: { value: 1 }, skyHaze: { value: 0 }, skyMap: { value: null }, skyOn: { value: 0 }, skyTurn: { value: 0.5947 - SUN_AZ / (Math.PI * 2) }, skyGain: { value: SKY_GAIN },
  zenith: { value: SKY.zenith }, horizon: { value: SKY.horizon }, sunCol: { value: SKY.sun }, sunDir: { value: SUN_DIR } };
skyU.skyMap.value = loadTex(HI ? "sky-8k.jpg" : "sky-4k.jpg", { srgb: true, done: () => { skyU.skyOn.value = 1; } });
skyU.skyMap.value.wrapS = THREE.RepeatWrapping; skyU.skyMap.value.generateMipmaps = false; skyU.skyMap.value.minFilter = THREE.LinearFilter;
// Colour of the sky in direction d: the photo once it has loaded, a plain gradient until then.
const SKY_GLSL = `uniform sampler2D skyMap; uniform float skyOn, skyTurn, skyGain, skySat, skyHaze; uniform vec3 skyTint; uniform vec3 zenith, horizon, sunCol, sunDir;
  vec3 skyColor(vec3 d){
    float h = clamp(d.z, 0.0, 1.0);
    vec3 grad = mix(horizon, zenith, pow(h, 0.5));
    float t = 0.5 - asin(clamp(d.z, -1.0, 1.0)) * 0.31830989;
    vec2 uv = vec2(atan(d.y, d.x) * 0.15915494 + skyTurn, 1.0 - min(t, 0.56) / 0.5625);
    vec3 photo = texture2D(skyMap, uv).rgb * skyGain;
    vec3 col = mix(grad, photo, skyOn);
    col = mix(vec3(dot(col, vec3(0.3, 0.6, 0.1))), col, skySat) * skyTint;
    col = mix(col, horizon, skyHaze * (1.0 - smoothstep(0.0, 0.55, d.z)));
    return mix(col, horizon, smoothstep(0.03, -0.04, d.z));
  }`;
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 20), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `${SKY_GLSL} varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      vec3 col = skyColor(d);
      float s = max(dot(d, sunDir), 0.0);
      col += sunCol * (pow(s, 1500.0) * 6.0 + pow(s, 90.0) * 0.25) * (1.0 - skyHaze) * min(1.0, skySat * 1.5 - 0.3);
      gl_FragColor = vec4(col, 1.0);${TONE}}`,
}));
skyDome.renderOrder = -10; skyDome.frustumCulled = false;
scene.add(skyDome);
{
  const r = mulberry32(11);
  const hillMats = [std("#4f8f5c", 1), std("#4a7d74", 1), std("#5a9468", 1)];
  const HILL = lumpy(4, 0.16, 2.2);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.2, d = 1500 + r() * 900, s = 240 + r() * 300;
    const hill = new THREE.Mesh(HILL, hillMats[i % 3]);
    hill.scale.set(s * 1.8, s, s * (0.1 + r() * 0.16)); hill.position.set(Math.cos(a) * d, Math.sin(a) * d + 250, -25); hill.rotation.z = r() * 6;
    scene.add(hill);
  }
  const far = new THREE.Mesh(PLANE, std("#3c7a35", 1)); far.scale.set(12000, 12000, 1); far.position.z = -6.5;
  scene.add(far);
}

// Fine grass grain, repeated across the ground so it still looks sharp up close.
const detailTex = loadTex("grass.jpg", { repeat: 1 }), sandTex = loadTex("sand.jpg", { repeat: 1 });
const grassNormal = loadTex("grass-normal.jpg", { repeat: 1 });
const barkTex = loadTex("bark.jpg", { srgb: true, repeat: 1 });
barkTex.repeat.set(2, 3);
const leafNormal = loadTex("grass-normal.jpg", { repeat: 3 });
// A real scanned rock, loaded in the background; plain lumpy rocks stand in until it arrives.
const rockLook = { geo: null, mat: null, waiting: [] };
fetch("assets/rock.bin").then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((buf) => {
  const [nv, ni] = new Uint32Array(buf, 0, 2), f = (off, n) => new Float32Array(buf, 8 + off * 4, n);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(f(0, nv * 3), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(f(nv * 3, nv * 3), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(f(nv * 6, nv * 2), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, 8 + nv * 32, ni), 1));
  const map = loadTex("rock.jpg", { srgb: true }), normalMap = loadTex("rock-normal.jpg");
  map.flipY = normalMap.flipY = false;
  rockLook.geo = g; rockLook.mat = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.95, metalness: 0, color: "#f4f1ec" });
  for (const fn of rockLook.waiting.splice(0)) fn();
}).catch(() => {});
// Tall golden grass for the rough: two crossed cards with blades painted on.
const tuftTex = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const c = cv.getContext("2d"), r = mulberry32(9);
  for (let i = 0; i < 46; i++) {
    const x0 = 64 + (r() - 0.5) * 50, lean = (r() - 0.5) * 70, top = 8 + r() * 60;
    const g = c.createLinearGradient(0, 128, 0, top);
    g.addColorStop(0, "#3f7a2c"); g.addColorStop(0.55, "#7f9c40"); g.addColorStop(1, "#cdbd72");
    c.strokeStyle = g; c.lineWidth = 2 + r() * 2.5; c.lineCap = "round";
    c.beginPath(); c.moveTo(x0, 128); c.quadraticCurveTo(x0 + lean * 0.2, 70, x0 + lean, top); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const TUFT = (() => {
  const g = new THREE.BufferGeometry(), p = [], uv = [], n = [], idx = [];
  for (const [ax, ay] of [[1, 0], [0, 1], [0.7, 0.7]]) {
    const k = p.length / 3;
    p.push(-ax / 2, -ay / 2, 0, ax / 2, ay / 2, 0, ax / 2, ay / 2, 1, -ax / 2, -ay / 2, 1);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1); n.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  g.setIndex(idx);
  return g;
})();
// Flower heads: pale dots that each patch tints its own colour.
const flowerMat = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const c = cv.getContext("2d"), r = mulberry32(21);
  for (let i = 0; i < 7; i++) {
    const x = 8 + r() * 48, y = 6 + r() * 30;
    c.strokeStyle = "#5d8f3c"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(32 + (x - 32) * 0.4, 64); c.stroke();
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill();
    c.fillStyle = "#fff2b0"; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide });
})();
const tuftMat = new THREE.MeshBasicMaterial({ map: tuftTex, alphaTest: 0.35, side: THREE.DoubleSide }); // unlit, so both faces match
// Water that ripples, mirrors the sky and glints in the sun.
const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: { time: { value: 0 }, ...skyU },
  vertexShader: "varying vec3 wp; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
  fragmentShader: `${SKY_GLSL} uniform float time; varying vec3 wp; varying vec2 vUv;
    void main(){
      vec2 p = wp.xy * 0.55;
      vec2 g = vec2(cos(p.x * 1.3 + time * 1.3) * 1.3 + cos((p.x + p.y) * 0.9 + time * 0.8) * 0.9 + cos(p.x * 3.7 - time * 2.1) * 0.6,
                    cos(p.y * 1.7 - time * 1.1) * 1.7 + cos((p.x + p.y) * 0.9 + time * 0.8) * 0.9 + cos(p.y * 4.1 + time * 1.7) * 0.6);
      vec3 N = normalize(vec3(-g * 0.045, 1.0));
      vec3 V = normalize(cameraPosition - wp);
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 R = reflect(-V, N);
      vec3 skyc = skyColor(normalize(vec3(R.xy, max(R.z, 0.03))));
      vec3 col = mix(vec3(0.02, 0.3, 0.4), skyc, 0.12 + 0.7 * fres);
      col += sunCol * pow(max(dot(R, sunDir), 0.0), 260.0) * 5.0 * (1.0 - skyHaze) * min(1.0, skySat);
      float edge = smoothstep(1.0, 0.9, length(vUv - 0.5) * 2.0);
      gl_FragColor = vec4(col, 0.93 * edge);${TONE}}`,
});

// Paint the whole course, seen from above, into one texture laid over the ground.
function paintCourse(H, trees) {
  const e = H.ext, cap = Math.min(renderer.capabilities.maxTextureSize, HI ? 4096 : 3072);
  const s = Math.min(HI ? 5 : 4, cap / Math.max(e.w, e.h));
  const cv = document.createElement("canvas"); cv.width = Math.round(e.w * s); cv.height = Math.round(e.h * s);
  const c = cv.getContext("2d");
  const X = (x) => (x - e.minX) * s, Y = (y) => (e.maxY - y) * s;
  const r = mulberry32(hashStr("paint:" + H.seed));
  const poly = (k, pts) => { k.beginPath(); pts.forEach(([x, y], i) => (i ? k.lineTo(X(x), Y(y)) : k.moveTo(X(x), Y(y)))); };
  const ell = (k, q, pad) => { k.beginPath(); k.ellipse(X(q.x), Y(q.y), Math.max(0.1, q.rx + pad) * s, Math.max(0.1, q.ry + pad) * s, -q.rot, 0, 7); };
  const circ = (k, x, y, rad) => { k.beginPath(); k.arc(X(x), Y(y), rad * s, 0, 7); };
  // Draw a shape on its own layer, then lay criss-cross mowing stripes over just that shape.
  const striped = (shape, base, stripe, width, angle) => {
    const o = document.createElement("canvas"); o.width = cv.width; o.height = cv.height;
    const k = o.getContext("2d");
    k.fillStyle = k.strokeStyle = base; k.lineCap = k.lineJoin = "round";
    shape(k);
    k.globalCompositeOperation = "source-atop"; k.fillStyle = stripe;
    const far = o.width + o.height;
    for (const a of [angle, angle + Math.PI / 2]) {
      k.setTransform(1, 0, 0, 1, 0, 0); k.translate(o.width / 2, o.height / 2); k.rotate(a);
      for (let x = -far; x < far; x += width * s * 2) k.fillRect(x, -far, width * s, far * 2);
    }
    c.drawImage(o, 0, 0);
  };
  const b = H.bounds;
  c.fillStyle = "#3a7732"; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#3f923c"; c.fillRect(X(b.minX), Y(b.maxY), (b.maxX - b.minX) * s, (b.maxY - b.minY) * s);
  for (let i = 0; i < 5200; i++) { // darker, lighter and dry patches in the rough
    const t = r();
    c.fillStyle = t < 0.45 ? "rgba(20,60,20,0.10)" : t < 0.85 ? "rgba(150,200,90,0.08)" : "rgba(200,190,110,0.07)";
    circ(c, e.minX + r() * e.w, e.minY + r() * e.h, 2 + r() * 8); c.fill();
  }
  c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 0.5 * s;
  c.strokeRect(X(b.minX), Y(b.maxY), (b.maxX - b.minX) * s, (b.maxY - b.minY) * s);

  c.lineCap = c.lineJoin = "round";
  c.strokeStyle = c.fillStyle = "#53983f"; // first cut around the fairway
  poly(c, H.line); c.lineWidth = (H.hw * 2 + 5) * s; c.stroke();
  circ(c, 0, 0, Math.max(9, H.hw) + 2.5); c.fill();
  striped((k) => {
    poly(k, H.line); k.lineWidth = H.hw * 2 * s; k.stroke();
    k.beginPath(); k.arc(X(0), Y(0), Math.max(9, H.hw) * s, 0, 7); k.fill();
  }, "#5cbc42", "rgba(255,255,255,0.07)", 4, 0.6);
  if (H.path) {
    c.strokeStyle = "#8d8778"; poly(c, H.path); c.lineWidth = 3.4 * s; c.stroke();
    c.strokeStyle = "#c9c2ae"; poly(c, H.path); c.lineWidth = 2.6 * s; c.stroke();
  }
  c.fillStyle = "#86cf62"; c.fillRect(X(-5), Y(3), 10 * s, 6 * s); // tee box
  for (const p of H.ponds) {
    c.fillStyle = "#4f8a3c"; ell(c, p, 2.5); c.fill();
    c.fillStyle = "#8c8259"; ell(c, p, 0.5); c.fill();
    c.fillStyle = "#1a4f6e"; ell(c, p, -0.6); c.fill();
  }
  if (H.bridge) { // stone bridge over the creek
    const q = H.bridge, corner = (a, l) => [q.x + q.tx * a - q.ty * l, q.y + q.ty * a + q.tx * l], hl = q.half + 3;
    c.fillStyle = "#b9b3a2"; poly(c, [corner(-hl, -q.w), corner(hl, -q.w), corner(hl, q.w), corner(-hl, q.w)]); c.fill();
    c.strokeStyle = "rgba(60,55,45,0.35)"; c.lineWidth = 0.18 * s;
    for (let a = -hl; a <= hl; a += 1.2) { poly(c, [corner(a, -q.w), corner(a, q.w)]); c.stroke(); }
  }
  c.fillStyle = "#6bb850"; circ(c, H.green.x, H.green.y, H.green.r + 2.4); c.fill(); // fringe
  striped((k) => { k.beginPath(); k.arc(X(H.green.x), Y(H.green.y), H.green.r * s, 0, 7); k.fill(); },
    "#8fe05c", "rgba(255,255,255,0.09)", 2.5, -0.5);
  for (const q of H.bunkers) {
    c.fillStyle = "#6fb052"; ell(c, q, 1.4); c.fill();
    c.fillStyle = "#c2ad72"; ell(c, q, 0.3); c.fill();
    const g = c.createRadialGradient(X(q.x), Y(q.y), 0, X(q.x), Y(q.y), q.rx * s);
    g.addColorStop(0, "#f6ebbe"); g.addColorStop(0.7, "#eddc9f"); g.addColorStop(1, "#d6c285");
    c.fillStyle = g; ell(c, q, -0.5); c.fill();
  }
  c.fillStyle = "#0c1a0c"; circ(c, H.cup.x, H.cup.y, 0.9); c.fill();
  // Soft painted shadows under every tree, so far-off trees still sit on the ground.
  const sx = -SUN_DIR.x / SUN_DIR.z, sy = -SUN_DIR.y / SUN_DIR.z, ang = Math.atan2(-sy, sx);
  for (const t of trees) {
    const len = t.h * 0.55, px = X(t.x + sx * len * 0.5), py = Y(t.y + sy * len * 0.5);
    c.save(); c.translate(px, py); c.rotate(ang); c.scale(len * 0.75 * s, t.r * 1.05 * s);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(8,30,18,0.34)"); g.addColorStop(0.6, "rgba(8,30,18,0.22)"); g.addColorStop(1, "rgba(8,30,18,0)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, 7); c.fill(); c.restore();
  }
  for (let i = 0; i < (HI ? 160000 : 70000); i++) { // fine grain everywhere
    c.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.045)";
    c.fillRect(r() * cv.width, r() * cv.height, 1 + r() * 2, 1 + r() * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

let course = null; // group holding the current hole's meshes
const Q_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), Q_ID = new THREE.Quaternion();
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function buildCourse(H) {
  if (course) {
    scene.remove(course);
    course.traverse((o) => { if (o.userData.own) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  }
  course = new THREE.Group();
  const add = (m) => (course.add(m), m), hAt = (x, y) => heightAt(H, x, y);
  const { nx, ny, ext } = H, b = H.bounds, r = mulberry32(hashStr("trees:" + H.seed));

  // Every tree: the ones in play, plus a forest around the course just for looks.
  const trees = H.obstacles.filter((o) => o.kind === "tree").map((o) => ({ ...o, src: o }));
  for (let tries = 0; tries < 1500 && trees.length < (HI ? 330 : 190); tries++) {
    const x = ext.minX + 15 + r() * (ext.w - 30), y = ext.minY + 15 + r() * (ext.h - 30);
    if (x > b.minX - 6 && x < b.maxX + 6 && y > b.minY - 6 && y < b.maxY + 6) continue;
    const rad = 3 + r() * 4.5, pine = r() < 0.6;
    trees.push({ x, y, r: rad, pine, h: rad * (pine ? 3.4 : 2.7) });
  }

  // Ground mesh from the height grid.
  const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = ext.minX + i * CELL, y = ext.minY + j * CELL;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = H.grid[k];
    uv[k * 2] = (x - ext.minX) / ext.w; uv[k * 2 + 1] = (y - ext.minY) / ext.h;
    if (i < nx - 1 && j < ny - 1) idx.push(k, k + 1, k + nx, k + 1, k + nx + 1, k + nx);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  grassNormal.repeat.set(ext.w / 6, ext.h / 6);
  const groundMat = new THREE.MeshStandardMaterial({ map: paintCourse(H, trees), roughness: 1, metalness: 0, normalMap: grassNormal, normalScale: new THREE.Vector2(0.55, 0.55) });
  groundMat.onBeforeCompile = (sh) => { // multiply in the repeating grass grain, at two sizes
    sh.uniforms.detailMap = { value: detailTex }; sh.uniforms.sandMap = { value: sandTex };
    sh.uniforms.detailScale = { value: new THREE.Vector2(ext.w / 6, ext.h / 6) };
    sh.fragmentShader = "uniform sampler2D detailMap, sandMap; uniform vec2 detailScale;\n" + sh.fragmentShader.replace("#include <map_fragment>",
      `#include <map_fragment>
      float sandy = smoothstep(0.0, 0.05, diffuseColor.r - diffuseColor.g);
      vec3 near = mix(texture2D(detailMap, vMapUv * detailScale).rgb, texture2D(sandMap, vMapUv * detailScale * 1.7).rgb, sandy) * 1.99;
      vec3 fine = mix(texture2D(detailMap, vMapUv * detailScale * 4.3).rgb, texture2D(sandMap, vMapUv * detailScale * 5.9).rgb, sandy) * 1.99;
      vec3 wide = texture2D(detailMap, vMapUv * detailScale * 0.11).rgb * 1.99;
      diffuseColor.rgb *= max(vec3(0.3), 1.0 + (near - 1.0) * 1.3) * max(vec3(0.3), 1.0 + (fine - 1.0) * 0.9) * mix(vec3(1.0), wide, 0.5);`);
  };
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true; ground.userData.own = true;
  add(ground);

  for (const p of H.ponds) {
    const w = new THREE.Mesh(CIRCLE, waterMat);
    w.position.set(p.x, p.y, p.level - 0.6); w.scale.set(p.rx + 1, p.ry + 1, 1); w.rotation.z = p.rot;
    add(w);
  }
  if (H.bridge) { // low stone walls along the bridge
    const q = H.bridge, wall = std("#a9a393", 0.95);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(BOX, wall), x = q.x - q.ty * side * q.w, y = q.y + q.tx * side * q.w;
      m.scale.set((q.half + 3) * 2, 0.7, 1.3); m.position.set(x, y, hAt(q.x, q.y) + 0.5); m.rotation.z = Math.atan2(q.ty, q.tx);
      m.castShadow = m.receiveShadow = true; add(m);
    }
  }

  const cupZ = hAt(H.cup.x, H.cup.y);
  const hole = new THREE.Mesh(CIRCLE, new THREE.MeshBasicMaterial({ color: "#050a05", polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  hole.position.set(H.cup.x, H.cup.y, cupZ + 0.02); hole.scale.setScalar(0.9); add(hole);
  const pin = new THREE.Group();
  pin.add(solid(CYL, std("#f4f4f4", 0.4), 0.11, 10));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 10, 1), new THREE.MeshStandardMaterial({ color: "#e8281c", side: THREE.DoubleSide, roughness: 0.8 }));
  flag.rotation.x = Math.PI / 2; flag.scale.set(3.6, 2, 1); flag.position.set(1.8, 0, 9); flag.castShadow = true; flag.userData.own = true;
  pin.add(flag); pin.position.set(H.cup.x, H.cup.y, cupZ);
  H.pin = add(pin); H.flag = flag;
  for (const tx of [-3.5, 3.5]) { // tee markers
    const m = new THREE.Mesh(SPHERE, std("#d8281c", 0.4)); m.scale.setScalar(0.45); m.position.set(tx, 1.5, hAt(tx, 1.5) + 0.4); m.castShadow = true; add(m);
  }

  // Trees, bushes and long grass are drawn in a few big batches, which keeps hundreds of them cheap.
  const batch = { trunk: [], cone: [], leaf: [] };
  const M = (x, y, z, q, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  const tint = (a, c2, t) => new THREE.Color(a).lerp(new THREE.Color(c2), t);
  const spin = () => new THREE.Quaternion().setFromAxisAngle(AXIS_Z, r() * 6.3);
  const accent = { summer: [["#2f8f3a", "#8fd14a"]], autumn: [["#c8501e", "#f2a03a"], ["#b02a20", "#e8642c"], ["#d9a21e", "#f6d24a"]],
    blossom: [["#e86aa6", "#ffc1dc"], ["#f29ac0", "#fff0f6"]] }[H.season], accentShare = H.season === "summer" ? 0.25 : 0.6;
  for (const t of trees) {
    const z = hAt(t.x, t.y) - 0.3, h = t.h, parts = [];
    const put = (name, m, col) => { batch[name].push([m, col]); parts.push([name, batch[name].length - 1, m]); };
    if (t.pine) {
      const shade = r() * 0.5;
      put("trunk", M(t.x, t.y, z + h * 0.14, Q_UP, t.r * 0.17, h * 0.28, t.r * 0.17), tint("#5c3d22", "#7a5634", r()));
      for (let k = 0; k < 4; k++) { // four tiers of branches, smaller and lighter toward the top
        const base = h * (0.16 + 0.19 * k), th = h * (0.36 - k * 0.02), rad = t.r * (1 - k * 0.21);
        put("cone", M(t.x, t.y, z + base + th / 2, spin().multiply(Q_UP), rad, th, rad), tint("#17512a", "#3f9146", k * 0.22 + shade * 0.5));
      }
    } else {
      const shade = r(), pal = r() < accentShare ? accent[Math.floor(r() * accent.length)] : ["#2c7a2e", "#6fbb45"];
      put("trunk", M(t.x, t.y, z + h * 0.25, Q_UP, t.r * 0.16, h * 0.5, t.r * 0.16), tint("#5a4630", "#7d6548", r()));
      put("leaf", M(t.x, t.y, z + h * 0.64, spin(), t.r * 0.95, t.r * 0.95, h * 0.36), tint(pal[0], pal[1], shade * 0.5));
      for (let k = 0; k < 5; k++) { // smaller clumps around the crown
        const a = r() * 6.3, d = t.r * (0.35 + r() * 0.3), s2 = t.r * (0.45 + r() * 0.25);
        put("leaf", M(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, z + h * (0.52 + r() * 0.34), spin(), s2, s2, s2 * 0.85), tint(pal[0], pal[1], shade * 0.6 + r() * 0.4));
      }
    }
    if (t.src) { t.src.parts = parts; t.src.shown = true; }
  }
  for (let tries = 0, n = 0; tries < 600 && n < (HI ? 110 : 60); tries++) { // bushes in the rough
    const x = b.minX + r() * (b.maxX - b.minX), y = b.minY + r() * (b.maxY - b.minY), s2 = 1 + r() * 1.3;
    if (terrainAt(H, x, y) !== "rough" || distToLine(H.line, x, y) < H.hw + 5) continue;
    batch.leaf.push([M(x, y, hAt(x, y) + s2 * 0.45, spin(), s2 * 1.3, s2 * 1.3, s2 * 0.8), tint("#2f6f2c", "#5c9a3a", r())]); n++;
  }
  const mats = { trunk: std("#ffffff", 0.95), cone: std("#ffffff", 0.9), leaf: std("#ffffff", 0.9) };
  mats.trunk.map = barkTex; mats.trunk.color.set("#d8cbbd");
  mats.leaf.normalMap = mats.cone.normalMap = leafNormal; mats.leaf.normalScale.setScalar(1.6); mats.cone.normalScale.setScalar(1.3);
  const geos = { trunk: TRUNK, cone: CONE, leaf: LEAF };
  H.batches = {};
  for (const name in batch) {
    const im = new THREE.InstancedMesh(geos[name], mats[name], Math.max(1, batch[name].length));
    batch[name].forEach(([m, col], i) => { im.setMatrixAt(i, m); im.setColorAt(i, col); });
    im.count = batch[name].length; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    H.batches[name] = add(im);
  }
  // Clumps of tall grass in the rough.
  const tufts = [];
  for (let tries = 0; tries < 900 && tufts.length < (HI ? 5200 : 1800); tries++) {
    const cx = b.minX - 20 + r() * (b.maxX - b.minX + 40), cy = b.minY - 20 + r() * (b.maxY - b.minY + 40), spread = 4 + r() * 9;
    const inPlay = (x, y) => x > b.minX && x < b.maxX && y > b.minY && y < b.maxY;
    if (inPlay(cx, cy) && (terrainAt(H, cx, cy) !== "rough" || distToLine(H.line, cx, cy) < H.hw + 14)) continue;
    for (let k = 0; k < 10 + r() * 18; k++) {
      const a = r() * 6.3, d = Math.sqrt(r()) * spread, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (inPlay(x, y) && terrainAt(H, x, y) !== "rough") continue;
      const w = 1.2 + r() * 1.2;
      tufts.push([M(x, y, hAt(x, y) - 0.1, spin(), w, w, 0.8 + r() * 1.0), tint("#8f9a5c", "#d9d6a0", r())]);
    }
  }
  const blooms = [], petals = ["#ff5fa2", "#ffd23f", "#ffffff", "#ff8a3d", "#b47cff", "#5fc8ff"];
  for (let tries = 0; tries < 400 && blooms.length < (HI ? 1500 : 600); tries++) { // patches of wild flowers
    const cx = b.minX + r() * (b.maxX - b.minX), cy = b.minY + r() * (b.maxY - b.minY), spread = 3 + r() * 6, col = petals[Math.floor(r() * petals.length)];
    if (terrainAt(H, cx, cy) !== "rough" || distToLine(H.line, cx, cy) < H.hw + 6) continue;
    for (let k = 0; k < 14 + r() * 22; k++) {
      const a = r() * 6.3, d = Math.sqrt(r()) * spread, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (terrainAt(H, x, y) !== "rough") continue;
      const w = 0.7 + r() * 0.5;
      blooms.push([M(x, y, hAt(x, y) - 0.05, spin(), w, w, 0.55 + r() * 0.4), new THREE.Color(col)]);
    }
  }
  const flowers = new THREE.InstancedMesh(TUFT, flowerMat, Math.max(1, blooms.length));
  blooms.forEach(([m, col], i) => { flowers.setMatrixAt(i, m); flowers.setColorAt(i, col); });
  flowers.count = blooms.length; flowers.frustumCulled = false;
  add(flowers);
  const grass = new THREE.InstancedMesh(TUFT, tuftMat, Math.max(1, tufts.length));
  tufts.forEach(([m, col], i) => { grass.setMatrixAt(i, m); grass.setColorAt(i, col); });
  grass.count = tufts.length; grass.frustumCulled = false; grass.receiveShadow = true;
  add(grass);

  const rocks = [];
  const addRock = (x, y, size, sink) => {
    const rock = new THREE.Mesh(ROCK, plainRock);
    rock.userData = { size, sink, x, y }; rock.rotation.z = x * 1.7 + y;
    rock.castShadow = rock.receiveShadow = true; rocks.push(add(rock));
  };
  for (const o of H.obstacles) if (o.kind === "rock") addRock(o.x, o.y, o.r, 0.12);
  for (const p of H.ponds) { // loose stones around the water's edge
    for (let k = 0, n = HI ? 5 : 2; k < n; k++) {
      const a = r() * 6.3, ca = Math.cos(a), sa = Math.sin(a), cr = Math.cos(p.rot), sr = Math.sin(p.rot);
      const ex = ca * (p.rx + 1.2), ey = sa * (p.ry + 1.2), x = p.x + ex * cr - ey * sr, y = p.y + ex * sr + ey * cr;
      if (terrainAt(H, x, y) !== "rough") continue;
      addRock(x, y, 0.7 + r() * 0.9, 0.3);
    }
  }
  const dress = () => { // swap in the scanned rock once it is here
    for (const m of rocks) {
      const { size, sink, x, y } = m.userData, real = !!rockLook.geo;
      if (real) { m.geometry = rockLook.geo; m.material = rockLook.mat; m.scale.setScalar(size * 1.45); m.position.set(x, y, hAt(x, y) - size * sink); }
      else { m.scale.set(size * 1.1, size * 1.1, size * 0.8); m.position.set(x, y, hAt(x, y) + size * 0.3); }
    }
  };
  dress();
  if (!rockLook.geo) rockLook.waiting.push(dress);
  scene.add(course);
}
function showTree(o, shown) {
  if (o.shown === shown) return;
  o.shown = shown;
  for (const [name, i, m] of o.parts) { H.batches[name].setMatrixAt(i, shown ? m : ZERO); H.batches[name].instanceMatrix.needsUpdate = true; }
}

// Rain: streaks that fall around the camera.
const RAIN_N = HI ? 900 : 420;
const rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#d6e6f5", transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
rain.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAIN_N * 6), 3));
rain.frustumCulled = false; rain.visible = false;
const drops = Array.from({ length: RAIN_N }, () => ({ x: (Math.random() - 0.5) * 70, y: (Math.random() - 0.5) * 70, z: Math.random() * 40 }));
scene.add(rain);
function stepRain(dt, wind) {
  if (!rain.visible) return;
  const p = rain.geometry.attributes.position.array, wx = Math.cos(wind.angle) * wind.mph * 0.5, wy = Math.sin(wind.angle) * wind.mph * 0.5;
  drops.forEach((d, i) => {
    d.z -= 60 * dt; d.x += wx * dt; d.y += wy * dt;
    if (d.z < -6) { d.z += 40; d.x = (Math.random() - 0.5) * 70; d.y = (Math.random() - 0.5) * 70; }
    const x = cam.pos.x + d.x, y = cam.pos.y + d.y, z = cam.pos.z - 14 + d.z, k = i * 6;
    p[k] = x; p[k + 1] = y; p[k + 2] = z; p[k + 3] = x + wx * 0.03; p[k + 4] = y + wy * 0.03; p[k + 5] = z + 1.8;
  });
  rain.geometry.attributes.position.needsUpdate = true;
}
// Set the light, sky and haze for the day's weather.
function applyWeather(w) {
  skyU.skyTint.value.set(...w.tint); skyU.skySat.value = w.sat; skyU.skyHaze.value = w.haze;
  SKY.horizon.set(w.fog[0]).multiplyScalar(w.fog[1]);
  scene.fog.color.copy(SKY.horizon); scene.fog.near = w.fog[2]; scene.fog.far = w.fog[3];
  sun.color.set(w.sun[0]); sun.intensity = w.sun[1]; skyLight.intensity = w.sky;
  rain.visible = !!w.rain;
}

// Moving things.
const ballShadow = new THREE.Mesh(CIRCLE, new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
ballShadow.scale.setScalar(0.7);
const ballMesh = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35, emissive: "#555555" }));
ballMesh.scale.setScalar(0.6); ballMesh.castShadow = true;
const TRAIL_N = 26;
const trail = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3)),
  new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 }));
trail.frustumCulled = false; trail.visible = false;
const beacon = solid(CYL, basic("#ffe14d", 0.4), 0.6, 40); beacon.castShadow = false;
// ── People and vehicles: low-poly figures with joints, so they can swing, sit, steer and wave. ──
const flat = (c, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0, flatShading: true });
const part = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
const joint = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const rbox = (parent, mat, x, y, z, sx, sy, sz, rad = 0.12) => part(new RoundedBoxGeometry(sx, sy, sz, 1, Math.min(rad, sx / 2.1, sy / 2.1, sz / 2.1)), mat, parent, x, y, z);
const limbGeo = (rad, len) => new THREE.CapsuleGeometry(rad, len, 2, 7).rotateX(Math.PI / 2).translate(0, 0, -len / 2); // hangs down from its joint
const ball3 = (rad, detail = 1) => new THREE.IcosahedronGeometry(rad, detail);
const tube = (r1, r2, len, sides = 8) => new THREE.CylinderGeometry(r1, r2, len, sides).rotateX(Math.PI / 2); // stands along z
const DOME = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
const dark = flat("#1b1b1f", 0.6), chrome = new THREE.MeshStandardMaterial({ color: "#d5d9de", roughness: 0.3, metalness: 0.1, flatShading: true });

// A person facing +x with feet at height 0. Returns the joints that the animation turns.
function makePerson(o) {
  const root = new THREE.Group(), J = { root };
  const shirt = flat(o.shirt), trim = flat(o.trim || "#ffffff"), pants = flat(o.pants), skin = flat(o.skin || "#f2c49c", 0.65), hat = flat(o.hat, 0.7), shoe = flat(o.shoes || "#ffffff", 0.5), ink = flat("#2a2320");
  const body = J.body = joint(root, 0, 0, 1.72); // the hips: everything hangs off this
  part(ball3(0.42), pants, body).scale.set(0.85, 1.05, 0.72);
  part(tube(0.4, 0.4, 0.13, 9), flat(o.belt || "#3a2a1c"), body, 0, 0, 0.2).scale.set(0.82, 1, 1);
  J.legs = [-1, 1].map((s) => {
    const hip = joint(body, 0, s * 0.24, -0.05); part(limbGeo(0.2, 0.62), pants, hip);
    const knee = joint(hip, 0, 0, -0.78); part(limbGeo(0.16, 0.6), pants, knee);
    part(tube(0.19, 0.17, 0.16, 7), trim, knee, 0, 0, -0.62);                  // sock
    part(ball3(0.2), shoe, knee, 0.14, 0, -0.8).scale.set(1.9, 1.05, 0.8);
    part(ball3(0.2), ink, knee, 0.14, 0, -0.9).scale.set(1.95, 1.08, 0.3);      // sole
    return { hip, knee };
  });
  const torso = J.torso = joint(body, 0, 0, 0.12); torso.rotation.order = "YZX";
  part(new THREE.CapsuleGeometry(0.42, 0.6, 2, 8).rotateX(Math.PI / 2), shirt, torso, 0, 0, 0.62).scale.set(0.8, 1.06, 1);
  part(tube(0.345, 0.35, 0.12, 9), trim, torso, 0, 0, 0.72).scale.set(0.82, 1.08, 1); // chest stripe
  part(tube(0.19, 0.25, 0.16, 8), trim, torso, 0, 0, 1.3);                    // collar
  const head = J.head = joint(torso, 0, 0, 1.36);
  part(tube(0.15, 0.17, 0.2, 7), skin, head, 0, 0, 0.04);
  part(ball3(0.5), skin, head, 0, 0, 0.52);
  part(ball3(0.5), flat(o.hair || "#5b3b22", 0.9), head, -0.09, 0, 0.56).scale.set(1, 1.03, 0.98);
  for (const s of [-1, 1]) {
    part(ball3(0.07, 0), ink, head, 0.45, s * 0.18, 0.56);                    // eyes
    part(ball3(0.11, 0), skin, head, 0.02, s * 0.5, 0.5);                     // ears
  }
  part(ball3(0.08, 0), skin, head, 0.5, 0, 0.44);                             // nose
  if (o.straw) { // wide straw hat
    part(tube(0.95, 0.95, 0.06, 12), hat, head, 0, 0, 0.82);
    part(DOME, hat, head, 0, 0, 0.82).scale.set(0.5, 0.5, 0.42);
    part(tube(0.51, 0.51, 0.1, 12), flat(o.band || "#c8321e"), head, 0, 0, 0.88);
  } else { // golf cap with a brim
    part(DOME, hat, head, 0, 0, 0.66).scale.set(0.54, 0.54, 0.44);
    part(tube(0.4, 0.4, 0.06, 10), hat, head, 0.42, 0, 0.68).scale.set(1.15, 0.95, 1);
    part(ball3(0.07, 0), trim, head, 0, 0, 1.1);
  }
  // Both arms hang from one rig at the shoulders, so a two-handed swing is a single turn.
  const rig = J.rig = joint(torso, 0, 0, 1.12);
  J.arms = [-1, 1].map((s) => {
    const sh = joint(rig, 0, s * 0.5, 0); part(limbGeo(0.15, 0.42), shirt, sh);
    part(tube(0.16, 0.16, 0.08, 7), trim, sh, 0, 0, -0.5);                    // sleeve cuff
    const el = joint(sh, 0, 0, -0.6); part(limbGeo(0.12, 0.5), skin, el);
    part(ball3(0.16, 0), s > 0 && o.glove ? trim : skin, el, 0, 0, -0.62);
    return { sh, el };
  });
  if (o.club) {
    for (const [i, a] of J.arms.entries()) a.sh.rotation.x = (i ? -1 : 1) * 0.42; // hands meet on the grip
    const club = J.club = joint(rig, 0, 0, -1.08); club.rotation.y = -0.12;
    part(tube(0.05, 0.05, 0.5, 6), ink, club, 0, 0, 0.05);                    // grip
    part(tube(0.03, 0.03, 2.1, 5), chrome, club, 0, 0, -1.05);
    J.wood = part(ball3(0.2), flat("#22262e", 0.4), club, 0.12, 0, -2.08); J.wood.scale.set(1.25, 0.8, 0.7);
    J.putter = rbox(club, chrome, 0.1, 0, -2.1, 0.16, 0.5, 0.14, 0.04);
  }
  return J;
}
// Sit a person down: seat height is where its root is placed.
function sit(J, reach = 1.0) {
  J.body.position.z = 0.3;
  for (const l of J.legs) { l.hip.rotation.y = -1.42; l.knee.rotation.y = 1.3; }
  J.torso.rotation.y = 0.04;
  J.rig.rotation.y = -reach;
  for (const [i, a] of J.arms.entries()) { a.sh.rotation.x = (i ? -1 : 1) * 0.16; a.el.rotation.y = -0.35; }
}
// A wheel that can spin: a chunky tyre, a hub and spokes.
function makeWheel(parent, x, y, z, rad, hubCol = "#f4f4f4") {
  const holder = joint(parent, x, y, z), spin = joint(holder);
  part(new THREE.CylinderGeometry(rad, rad, rad * 0.62, 12), dark, spin);
  part(new THREE.CylinderGeometry(rad * 0.55, rad * 0.55, rad * 0.68, 8), flat(hubCol, 0.4), spin);
  for (const a of [0, Math.PI / 2]) { const sp = part(BOX, dark, spin); sp.scale.set(rad * 1.02, rad * 0.7, rad * 0.16); sp.rotation.y = a; }
  return { holder, spin, rad };
}
function steeringWheel(parent, x, y, z) {
  const col = part(tube(0.05, 0.05, 1.1, 5), dark, parent, x + 0.42, y, z - 0.36); col.rotation.y = 0.85;
  const g = joint(parent, x, y, z); g.rotation.y = -0.6;
  part(new THREE.TorusGeometry(0.33, 0.06, 5, 10), dark, g).rotation.y = Math.PI / 2;
  return g;
}

const golfer = makePerson({ shirt: "#2f7bff", trim: "#ffffff", pants: "#f4ead2", hat: "#e5352b", glove: true, club: true });
const golferMesh = golfer.root; golferMesh.scale.setScalar(1.0);

// The golf cart. The shell rides on springs above the wheels; body is built facing +x.
const cartMesh = new THREE.Group(), cartBody = new THREE.Group(), cartShell = new THREE.Group();
cartMesh.add(cartBody); cartBody.add(cartShell);
const cartWheels = [], driver = makePerson({ shirt: "#2f7bff", trim: "#ffffff", pants: "#f4ead2", hat: "#e5352b", glove: true });
let cartSteer = null, pennant = null;
const cartBags = [];
{
  const white = flat("#fbf7ee", 0.35), teal = flat("#12b3a6", 0.45), tan = flat("#e9a15c", 0.8), glass = new THREE.MeshStandardMaterial({ color: "#bfe9ff", transparent: true, opacity: 0.35, roughness: 0.1 });
  const s = cartShell;
  rbox(s, dark, 0, 0, 0.78, 4.7, 2.3, 0.3, 0.1);                 // chassis
  rbox(s, white, -0.15, 0, 1.2, 4.5, 2.55, 0.6, 0.22);           // tub
  rbox(s, teal, -0.15, 0, 0.98, 4.56, 2.61, 0.16, 0.06);         // colour band
  rbox(s, teal, 1.75, 0, 1.62, 1.3, 2.35, 0.75, 0.3);            // front cowl
  rbox(s, white, 1.78, 0, 1.98, 0.9, 1.5, 0.12, 0.05);           // cowl badge
  rbox(s, dark, 2.42, 0, 0.82, 0.22, 2.5, 0.26, 0.1);            // bumpers
  rbox(s, dark, -2.42, 0, 0.82, 0.22, 2.5, 0.26, 0.1);
  for (const y of [-0.78, 0.78]) { part(ball3(0.24), basic("#fff3a0"), s, 2.36, y, 1.6).scale.set(0.5, 1, 1); part(ball3(0.13, 0), basic("#ff4a3a"), s, -2.4, y * 1.3, 1.25); }
  rbox(s, white, -0.75, 0, 1.6, 1.35, 2.3, 0.36, 0.12);          // seat base
  rbox(s, tan, -0.72, 0, 1.87, 1.25, 2.2, 0.22, 0.1);            // cushion
  rbox(s, tan, -1.3, 0, 2.5, 0.3, 2.2, 1.1, 0.13).rotation.y = -0.12; // backrest
  for (const y of [-1.2, 1.2]) rbox(s, dark, -0.9, y, 2.25, 1.0, 0.08, 0.08, 0.03); // arm rails
  rbox(s, white, -2.0, 0, 1.6, 0.95, 2.4, 0.5, 0.15);            // bag deck
  for (const [y, col, lean] of [[0.55, "#e5352b", 0.1], [-0.55, "#ffb81f", -0.06]]) { // two golf bags with clubs
    const bag = joint(s, -2.0, y, 1.8); bag.rotation.y = -0.16; bag.rotation.x = lean; cartBags.push(bag);
    part(tube(0.4, 0.34, 1.9, 8), flat(col), bag, 0, 0, 0.95);
    part(tube(0.42, 0.42, 0.16, 8), white, bag, 0, 0, 1.5); part(tube(0.38, 0.38, 0.14, 8), white, bag, 0, 0, 0.5);
    rbox(bag, flat(col), 0.36, 0, 0.9, 0.2, 0.4, 0.7, 0.08);     // pocket
    for (const [cx, cy, h] of [[0.14, 0.1, 2.5], [-0.12, 0.14, 2.7], [0, -0.16, 2.35]]) {
      part(tube(0.03, 0.03, h - 1.6, 5), chrome, bag, cx, cy, 1.6 + (h - 1.6) / 2);
      part(ball3(0.14, 0), h > 2.6 ? flat("#22262e") : chrome, bag, cx + 0.08, cy, h).scale.set(1.3, 0.8, 0.8);
    }
  }
  for (const [x, y, lean] of [[1.25, 1.18, 0.16], [1.25, -1.18, 0.16], [-1.75, 1.18, 0], [-1.75, -1.18, 0]]) {
    const post = part(tube(0.06, 0.06, 3.0, 6), chrome, s, x - lean * 1.2, y, 3.0); post.rotation.y = -lean;
  }
  rbox(s, teal, -0.3, 0, 4.58, 4.0, 2.85, 0.2, 0.09);            // roof
  for (const y of [-0.95, 0, 0.95]) rbox(s, white, -0.3, y, 4.6, 4.04, 0.45, 0.2, 0.09); // roof stripes
  rbox(s, white, -0.3, 0, 4.44, 3.8, 2.6, 0.12, 0.05);
  const shield = part(new THREE.BoxGeometry(0.06, 2.25, 2.3), glass, s, 1.05, 0, 3.25); shield.rotation.y = -0.16; shield.castShadow = false;
  cartSteer = steeringWheel(s, 0.36, 0.5, 2.62);
  const pole = part(tube(0.025, 0.025, 2.2, 5), chrome, s, -2.2, -1.2, 5.6);
  pennant = joint(s, -2.2, -1.2, 6.5);
  const tri = new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.3, 0, 0, -0.3, -1.1, 0, 0], 3)), new THREE.MeshBasicMaterial({ color: "#ff8a1f", side: THREE.DoubleSide }));
  pennant.add(tri);
  for (const [x, y] of [[1.55, 1.3], [1.55, -1.3], [-1.55, 1.3], [-1.55, -1.3]]) {
    cartWheels.push(makeWheel(cartBody, x, y, 0.62, 0.62));
    rbox(s, teal, x, y * 0.98, 1.36, 1.5, 0.5, 0.14, 0.06);       // fender
  }
  sit(driver, 1.0); driver.root.scale.setScalar(0.8); driver.root.position.set(-0.6, 0.5, 1.98); s.add(driver.root);
}

// The greenkeeper's ride-on mower, which drives back and forth across the fairway.
const mowerMesh = new THREE.Group(), mowerShell = new THREE.Group(), mowerWheels = [];
mowerMesh.add(mowerShell);
const keeper = makePerson({ shirt: "#ff9a2e", trim: "#fff3c4", pants: "#2f8f4a", hat: "#f1cf6b", straw: true, hair: "#3a2a1c", shoes: "#6b4a2c" });
const mowerLamp = basic("#ff9d1c");
{
  const red = flat("#e0352b", 0.4), yellow = flat("#ffcf2e", 0.5), s = mowerShell;
  rbox(s, red, -0.15, 0, 0.98, 3.1, 1.6, 0.6, 0.2);              // body
  rbox(s, red, 1.0, 0, 1.55, 1.5, 1.45, 0.75, 0.28);             // engine hood
  rbox(s, yellow, 1.0, 0, 1.95, 1.2, 0.3, 0.06, 0.02);           // hood stripe
  rbox(s, dark, 1.78, 0, 1.5, 0.1, 1.1, 0.5, 0.04);              // grille
  for (const y of [-0.5, 0.5]) part(ball3(0.14, 0), basic("#fff3a0"), s, 1.8, y, 1.78);
  rbox(s, yellow, 2.05, 0, 0.5, 1.3, 2.9, 0.34, 0.12);           // cutting deck
  rbox(s, dark, 2.05, 0, 0.36, 1.36, 2.96, 0.12, 0.04);
  rbox(s, yellow, 2.05, -1.65, 0.55, 0.7, 0.5, 0.3, 0.08).rotation.x = 0.4; // chute where the cuttings fly out
  part(tube(0.07, 0.07, 1.0, 6), chrome, s, 1.15, 0.5, 2.3); part(tube(0.1, 0.1, 0.3, 6), dark, s, 1.15, 0.5, 2.85); // exhaust
  rbox(s, dark, -0.95, 0, 1.62, 0.95, 1.15, 0.36, 0.14);         // seat
  rbox(s, dark, -1.42, 0, 2.3, 0.24, 1.15, 1.1, 0.1).rotation.y = -0.1;
  for (const y of [-1.02, 1.02]) rbox(s, red, -1.0, y, 1.6, 1.7, 0.55, 0.14, 0.06); // rear fenders
  part(tube(0.04, 0.04, 1.4, 5), dark, s, -1.6, 0.5, 3.3);
  part(ball3(0.17, 0), mowerLamp, s, -1.6, 0.5, 4.05);            // flashing lamp
  steeringWheel(s, -0.1, 0, 2.5);
  for (const [x, y, rad] of [[1.0, 0.95, 0.48], [1.0, -0.95, 0.48], [-1.0, 1.02, 0.74], [-1.0, -1.02, 0.74]]) mowerWheels.push(makeWheel(mowerMesh, x, y, rad, rad, "#ffcf2e"));
  sit(keeper, 1.0); keeper.root.scale.setScalar(0.78); keeper.root.position.set(-0.95, 0, 1.8); s.add(keeper.root);
}
// Bring the people and vehicles to life each frame.
const anim = { arm: 0, from: -2, steer: 0, lastA: 0, lastV: 0, acc: 0, mx: 0, my: 0, puff: 0 };
function animate(dt, now) {
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v)), ease = (cur, to, rate) => cur + (to - cur) * Math.min(1, dt * rate);
  // Golfer: address the ball, wind up with the drag, swing through and hold the finish.
  const J = golfer, putting = onGreen(), finish = putting ? 0.7 : 2.75;
  if (G.swing === 0) anim.from = anim.arm;
  G.swing = Math.min(1, G.swing + dt * (putting ? 2.4 : 3.4));
  let A;
  if (G.mode === "done") A = 0;
  else if (G.swing < 1) A = lerp(anim.from, finish, 1 - Math.pow(1 - G.swing, 2.4));
  else if (G.mode === "flight") A = ease(anim.arm, finish * 0.9, 3);
  else A = ease(anim.arm, G.mode === "aim" && G.aim ? (putting ? -0.12 - G.aim.p * 0.6 : -0.5 - G.aim.p * 2.1) : Math.sin(now * 2.3) * 0.06, 14);
  anim.arm = A;
  const cheer = G.mode === "done", breathe = Math.sin(now * 2.1) * 0.02, through = Math.max(0, A);
  J.wood.visible = !putting; J.putter.visible = putting;
  J.body.position.z = 1.66 + breathe + (cheer ? Math.abs(Math.sin(now * 7)) * 0.9 : 0);
  J.body.rotation.z = clampN(A * 0.14, -0.3, 0.45);
  J.torso.rotation.set(0, cheer ? 0 : putting ? 0.42 : 0.3, clampN(A * 0.3, -0.75, 0.9));
  J.rig.rotation.set(cheer ? Math.sin(now * 14) * 0.25 : A, cheer ? -2.7 : -0.2, 0);
  J.head.rotation.set(0, through > 1.2 || cheer ? -0.25 : 0.1, through > 1.2 ? ease(J.head.rotation.z, 1.0, 8) : clampN(-A * 0.3, -0.5, 0.6));
  J.legs.forEach((l, i) => { // knees flex; the back foot comes up on its toe in the finish
    const back = i === 0 ? through * 0.22 : 0;
    l.hip.rotation.y = cheer ? 0 : -0.28 - back * 0.4; l.knee.rotation.y = cheer ? 0 : 0.46 + back;
  });

  // Cart: springs, leaning into turns, spinning wheels, a driver who steers and bounces.
  const c = G.cart, speed = Math.abs(c.v) / TUNE.cartSpeed;
  let da = c.a - anim.lastA; da = Math.atan2(Math.sin(da), Math.cos(da));
  anim.steer = ease(anim.steer, dt > 0 ? clampN(da / dt / TUNE.cartTurn, -1, 1) : 0, 8);
  anim.acc = ease(anim.acc, dt > 0 ? clampN((c.v - anim.lastV) / dt / 60, -1, 1) : 0, 6);
  anim.lastA = c.a; anim.lastV = c.v;
  const rough = terrainAt(H, c.x, c.y) === "rough" ? 2 : 1, bump = (Math.sin(now * 13) * 0.03 + Math.sin(now * 21.7) * 0.02) * speed * rough;
  cartShell.position.z = bump + Math.sin(now * 2) * 0.008;
  cartShell.rotation.set(-anim.steer * speed * 0.09, -anim.acc * 0.07 + Math.sin(now * 17) * 0.006 * speed * rough, 0);
  cartWheels.forEach((w, i) => { w.spin.rotation.y += (c.v * dt) / w.rad; if (i < 2) w.holder.rotation.z = anim.steer * 0.5; });
  cartSteer.rotation.x = -anim.steer * 1.6;
  cartBags.forEach((bag, i) => { bag.rotation.x = (i ? -0.06 : 0.1) + Math.sin(now * 15 + i * 2) * 0.05 * speed * rough + anim.steer * speed * 0.1; });
  pennant.rotation.z = Math.sin(now * 9) * 0.35 + anim.steer * 0.6; pennant.scale.x = 0.85 + Math.sin(now * 13) * 0.15;
  driver.root.visible = G.mode === "drive";
  driver.root.position.z = 1.98 + Math.abs(bump) * 1.5;
  driver.torso.rotation.set(anim.steer * speed * 0.16, 0.04 - anim.acc * 0.1, 0);
  driver.head.rotation.set(0, 0, anim.steer * 0.55);
  driver.rig.rotation.set(-anim.steer * 0.35, -1.0, 0);
  if (speed > 0.55 && Math.random() < dt * 9) burst(c.x - Math.cos(c.a) * 2.4, c.y - Math.sin(c.a) * 2.4, heightAt(H, c.x, c.y), BITS[terrainAt(H, c.x, c.y)] || BITS.rough, 1, 4);

  // Mower: shakes, puffs smoke, throws cuttings, and the greenkeeper waves when you come close.
  const o = H.mower;
  if (o) {
    const moved = Math.hypot(o.x - anim.mx, o.y - anim.my), near = dist(o.x, o.y, cam.fx, cam.fy);
    anim.mx = o.x; anim.my = o.y;
    for (const w of mowerWheels) w.spin.rotation.y += Math.min(moved, 2) / w.rad;
    mowerShell.position.z = Math.sin(now * 46) * 0.018; mowerShell.rotation.x = Math.sin(now * 31) * 0.008;
    mowerLamp.color.set(Math.sin(now * 8) > 0 ? "#ffb21c" : "#7a3a00");
    const wave = near < 40;
    keeper.rig.rotation.set(0, -1.0, 0);
    keeper.arms[1].sh.rotation.set(wave ? -0.9 + Math.sin(now * 10) * 0.35 : -0.16, wave ? -1.5 : 0, 0);
    keeper.arms[1].el.rotation.y = wave ? -0.2 : -0.35;
    const look = Math.atan2(cam.fy - o.y, cam.fx - o.x) - o.a;
    keeper.head.rotation.z = wave ? clampN(Math.atan2(Math.sin(look), Math.cos(look)), -1.3, 1.3) : Math.sin(now * 0.7) * 0.3;
    keeper.root.position.z = 1.8 + Math.abs(Math.sin(now * 23)) * 0.02;
    anim.puff -= dt;
    if (anim.puff < 0 && near < 160) {
      anim.puff = 0.12;
      const ca = Math.cos(o.a), sa = Math.sin(o.a), z = heightAt(H, o.x, o.y);
      burst(o.x + ca * 2 + sa * 1.9, o.y + sa * 2 - ca * 1.9, z + 0.3, ["#6fb84f", "#9bd45c", "#4c9a3c"], 1, 6);
      if (Math.random() < 0.4) burst(o.x + ca * 1.1 - sa * 0.5, o.y + sa * 1.1 + ca * 0.5, z + 2.9, ["#d9d9d9", "#bdbdbd"], 1, 2.5);
    }
  }
}
// Bits that fly up: turf, sand, splashes, confetti.
const bits = [];
for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(SPHERE, basic("#ffffff")); m.visible = false; bits.push({ m, life: 0, vx: 0, vy: 0, vz: 0 }); scene.add(m); }
function burst(x, y, z, colors, n, speed = 9) {
  for (const p of bits) {
    if (n <= 0) break;
    if (p.life > 0) continue;
    const a = Math.random() * 6.3, s = speed * (0.3 + Math.random() * 0.7);
    p.m.position.set(x, y, z + 0.3); p.m.scale.setScalar(0.12 + Math.random() * 0.2); p.m.material.color.set(colors[n % colors.length]);
    p.vx = Math.cos(a) * s * 0.5; p.vy = Math.sin(a) * s * 0.5; p.vz = s; p.life = 0.9 + Math.random() * 0.5; p.m.visible = true; n--;
  }
}
// The aim preview: dots along the ball's path, a landing spot, and where it should stop.
const dotMat = basic("#ffffff", 0.9), dots = [];
for (let i = 0; i < 34; i++) { const d = new THREE.Mesh(SPHERE, dotMat); d.scale.setScalar(0.32); d.visible = false; dots.push(d); scene.add(d); }
const landMark = new THREE.Mesh(SPHERE, basic("#ffe14d")); landMark.scale.set(1.2, 1.2, 0.35);
const endMark = new THREE.Mesh(SPHERE, basic("#ffffff", 0.8)); endMark.scale.set(1.6, 1.6, 0.3);
scene.add(ballShadow, ballMesh, trail, beacon, golferMesh, cartMesh, mowerMesh, landMark, endMark);

// ───────────────────────── Game state ─────────────────────────
let H = null;
const G = {
  mode: "title", // title | aim | flight | drive | done
  date: nyDate(), seed: null, practice: false,
  ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, air: false },
  last: { x: 0, y: 0 }, golfer: { x: 0, y: 0 }, cart: { x: 0, y: 0, a: Math.PI / 2, v: 0 },
  strokes: 0, penalties: 0, start: 0, time: 0, swing: 1,
  aim: null,  // { sx, sy, dx, dy, p } while dragging a swing
  stick: null, // { sx, sy, x, y } while dragging the cart joystick
  keys: {},
};

function loadHole(seed) {
  G.seed = seed;
  H = generateHole(seed);
  buildCourse(H);
  applyWeather(WEATHER[H.weather]);
  Object.assign(G.ball, { x: 0, y: 0, z: heightAt(H, 0, 0), vx: 0, vy: 0, vz: 0, air: false });
  G.last = { x: 0, y: 0 }; G.golfer = { x: 0, y: 0 };
  Object.assign(G.cart, { x: -7, y: -4, a: Math.PI / 2, v: 0 });
  G.strokes = 0; G.penalties = 0; G.aim = null; G.stick = null; G.preview = null;
  H.mower = H.obstacles.find((o) => o.kind === "mower") || null;
  cam.rot = aimAngle(); cam.snap = true;
  $("windMph").textContent = H.wind.mph;
}
function aimAngle() {
  const dx = H.cup.x - G.ball.x, dy = H.cup.y - G.ball.y;
  return Math.hypot(dx, dy) > 3 ? Math.atan2(dy, dx) - Math.PI / 2 : cam.rot;
}
const onGreen = () => terrainAt(H, G.ball.x, G.ball.y) === "green";

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 1300);
}
function setHint(s) { $("hint").textContent = s; }
function enterAim() {
  G.mode = "aim"; G.aim = null; G.stick = null; G.preview = null;
  G.golfer = { x: G.ball.x, y: G.ball.y };
  setHint(onGreen() ? "Putt: drag back and let go. Watch the slope." : "Drag back and let go to swing");
}
function enterDrive() {
  G.mode = "drive"; G.stick = null;
  setHint("Hold and drag to drive to your ball");
}

// ───────────────────────── Ball physics ─────────────────────────
function shotPlan(p, b = G.ball) { // how far a swing of power p (0..1) goes on flat ground from this lie
  const lie = terrainAt(H, b.x, b.y), curve = Math.pow(p, 1.3);
  if (lie === "green") return { putt: true, D: TUNE.maxPutt * curve };
  return { putt: false, D: TUNE.maxDrive * (TUNE.lie[lie] ?? 1) * curve };
}
function launch(b, dx, dy, p) {
  const plan = shotPlan(p, b);
  b.z = heightAt(H, b.x, b.y); b.bounces = 0; b.landed = null;
  if (plan.putt) {
    const v = Math.sqrt(2 * TUNE.friction.green * H.wet * plan.D);
    b.vx = dx * v; b.vy = dy * v; b.vz = 0; b.air = false;
  } else {
    // Softer swings fly higher for their length and bite more when they land.
    const T = 0.7 + 1.5 * p, apex = 4 + 22 * p, v = (plan.D * TUNE.carry) / T;
    b.g = (8 * apex) / (T * T);
    b.vx = dx * v; b.vy = dy * v; b.vz = (b.g * T) / 2; b.air = true;
    b.spin = 0.5 + 0.5 * p;
  }
  return plan;
}
// Move a ball forward by dt. Returns "water", "ob", "holed", "stopped" or null while it is still moving.
function stepPhysics(b, dt, wind) {
  if (b.air) {
    if (wind) {
      b.vx += Math.cos(wind.angle) * wind.mph * TUNE.windPush * dt;
      b.vy += Math.sin(wind.angle) * wind.mph * TUNE.windPush * dt;
    }
    b.vz -= b.g * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    for (const o of H.obstacles) { // branches knock the ball down
      if (o.kind !== "tree") continue;
      const d = dist(b.x, b.y, o.x, o.y);
      if (d > o.r) continue;
      const rel = (b.z - heightAt(H, o.x, o.y)) / o.h;
      if (rel > 0.2 && rel < 1 && d < o.r * 0.85 * (o.pine ? 1 - rel * 0.8 : 1)) {
        b.vx *= 0.15; b.vy *= 0.15; b.vz = Math.min(b.vz, 0); b.hitTree = true;
      }
    }
    const gh = heightAt(H, b.x, b.y);
    if (b.z > gh) return null;
    const lie = terrainAt(H, b.x, b.y);
    if (lie === "water" || lie === "ob") return lie;
    if (!b.landed) b.landed = { x: b.x, y: b.y };
    // Bounce off the slope: lose some speed into the ground, and some along it.
    const s = slopeAt(H, b.x, b.y), nl = Math.hypot(s.x, s.y, 1), nx = -s.x / nl, ny = -s.y / nl, nz = 1 / nl;
    const vn = b.vx * nx + b.vy * ny + b.vz * nz;
    const grip = TUNE.grip[lie] * (b.bounces === 0 ? b.spin : 1), e = TUNE.bounce[lie] / (H.wet * H.wet);
    b.vx = (b.vx - vn * nx) * grip - e * vn * nx;
    b.vy = (b.vy - vn * ny) * grip - e * vn * ny;
    b.vz = (b.vz - vn * nz) * grip - e * vn * nz;
    b.z = gh; b.bounces++;
    if (b.vz < 3.5 || b.bounces > 4) { b.air = false; b.vz = 0; }
    return null;
  }
  const N = 4, h = dt / N;
  for (let i = 0; i < N; i++) {
    const lie = terrainAt(H, b.x, b.y);
    if (lie === "water" || lie === "ob") return lie;
    const sp = Math.hypot(b.vx, b.vy);
    if (dist(b.x, b.y, H.cup.x, H.cup.y) < TUNE.cupRadius && sp < TUNE.cupSpeed) return "holed";
    const s = slopeAt(H, b.x, b.y), pull = TUNE.slopePull * Math.hypot(s.x, s.y), fr = TUNE.friction[lie] * H.wet;
    if (sp < 0.5 && pull <= fr * 0.8) { b.z = heightAt(H, b.x, b.y); return "stopped"; }
    if (sp > 0) { const ns = Math.max(0, sp - fr * h); b.vx *= ns / sp; b.vy *= ns / sp; }
    b.vx -= TUNE.slopePull * s.x * h; b.vy -= TUNE.slopePull * s.y * h; // gravity pulls it downhill
    b.x += b.vx * h; b.y += b.vy * h;
    for (const o of H.obstacles) {
      const d = dist(b.x, b.y, o.x, o.y), min = (o.kind === "tree" ? o.r * 0.25 : o.r) + 0.5;
      if (d < min && d > 0) {
        const nx = (b.x - o.x) / d, ny = (b.y - o.y) / d, dot = b.vx * nx + b.vy * ny;
        b.x = o.x + nx * min; b.y = o.y + ny * min;
        if (dot < 0) { b.vx = (b.vx - 2 * dot * nx) * 0.35; b.vy = (b.vy - 2 * dot * ny) * 0.35; }
      }
    }
  }
  b.z = heightAt(H, b.x, b.y);
  return null;
}
// Play a shot forward with no wind, for the aim preview.
function simulate(dx, dy, p) {
  const b = { ...G.ball }, plan = launch(b, dx, dy, p), pts = [];
  if (plan.putt) { // putts show a straight line: reading the slope is the player's job
    for (let i = 1; i <= 12; i++) { const x = b.x + dx * plan.D * (i / 12), y = b.y + dy * plan.D * (i / 12); pts.push([x, y, heightAt(H, x, y) + 0.3]); }
    return { putt: true, pts, end: pts[pts.length - 1] };
  }
  let ev = null, i = 0;
  for (; i < 1200 && !ev; i++) {
    ev = stepPhysics(b, 1 / 60, null);
    if (!b.landed && i % 4 === 0) pts.push([b.x, b.y, b.z + 0.6]);
  }
  return { putt: false, pts, land: b.landed, end: [b.x, b.y, heightAt(H, b.x, b.y)], bad: ev === "water" || ev === "ob" };
}

function shoot(dx, dy, p) {
  const b = G.ball;
  G.last = { x: b.x, y: b.y };
  G.strokes++; G.swing = 0; G.preview = null; b.hitTree = false;
  launch(b, dx, dy, p);
  G.mode = "flight"; setHint("");
}
function penalty(msg) {
  G.penalties += TUNE.penalty;
  toast(`${msg} +${TUNE.penalty}s`);
  Object.assign(G.ball, { x: G.last.x, y: G.last.y, z: heightAt(H, G.last.x, G.last.y), vx: 0, vy: 0, vz: 0, air: false });
  enterAim();
}
function ballStopped() {
  const b = G.ball; b.vx = b.vy = b.vz = 0;
  cam.rotTarget = aimAngle();
  const cartClose = dist(b.x, b.y, G.cart.x, G.cart.y) < TUNE.arrive + 3;
  if (dist(b.x, b.y, G.golfer.x, G.golfer.y) < TUNE.walk || cartClose || (onGreen() && dist(G.golfer.x, G.golfer.y, H.green.x, H.green.y) < H.green.r + 10)) enterAim();
  else enterDrive();
}
// The wind gusts: its strength and direction drift while you play.
function windNow() {
  const t = G.mode === "title" ? 0 : (Date.now() - G.start) / 1000, w = H.wind;
  return { angle: w.angle + 0.3 * Math.sin(t * 0.21 + w.mph), mph: Math.max(0, w.mph * (1 + 0.45 * Math.sin(t * 0.47 + w.angle))) };
}
function stepMower() {
  const o = H.mower;
  if (!o) return;
  const t = (Date.now() / 1000 / o.period) * Math.PI * 2, s = Math.sin(t);
  o.x = o.cx + o.nx * o.span * s; o.y = o.cy + o.ny * o.span * s;
  o.a = Math.atan2(o.ny, o.nx) + (Math.cos(t) < 0 ? Math.PI : 0);
}
const BITS = { fairway: ["#4c9a3c", "#6fb84f"], rough: ["#3f7f33", "#5c9a3a"], green: ["#7fcf5c"], sand: ["#f0e2ad", "#d9c78c"], path: ["#c9c2ae"] };
function stepBall(dt) {
  const b = G.ball, wasHit = b.hitTree, bounces = b.bounces, ev = stepPhysics(b, dt, windNow());
  if (b.hitTree && !wasHit) { toast("Tree!"); burst(b.x, b.y, b.z, ["#2f8a3b", "#1f6a2c"], 10, 6); }
  if (b.bounces > bounces) burst(b.x, b.y, b.z, BITS[terrainAt(H, b.x, b.y)] || BITS.rough, b.bounces === 1 ? 12 : 5, b.bounces === 1 ? 8 : 4);
  if (ev === "water") { burst(b.x, b.y, heightAt(H, b.x, b.y) + 0.5, ["#ffffff", "#bfe3ff"], 22, 12); penalty("Splash!"); }
  else if (ev === "ob") penalty("Out of bounds!");
  else if (ev === "holed") { burst(H.cup.x, H.cup.y, b.z, ["#ffe14d", "#ff5b3a", "#56a8ec", "#ffffff", "#8ad25f"], 40, 14); finish(); }
  else if (ev === "stopped") ballStopped();
}

function driveInput() { // joystick or keys, as a world-space vector with length 0..1
  let sx = 0, sy = 0;
  if (G.stick) { sx = (G.stick.x - G.stick.sx) / 50; sy = -(G.stick.y - G.stick.sy) / 50; }
  const k = G.keys;
  if (k.ArrowLeft || k.a) sx -= 1; if (k.ArrowRight || k.d) sx += 1;
  if (k.ArrowUp || k.w) sy += 1; if (k.ArrowDown || k.s) sy -= 1;
  const l = Math.hypot(sx, sy);
  if (l > 1) { sx /= l; sy /= l; }
  const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
  return { x: sx * c - sy * s, y: sx * s + sy * c, len: Math.min(1, l) };
}
function stepCart(dt) {
  const c = G.cart, inp = driveInput(), lie = terrainAt(H, c.x, c.y);
  const sl = slopeAt(H, c.x, c.y), climb = sl.x * Math.cos(c.a) + sl.y * Math.sin(c.a); // slower uphill, quicker down
  const maxV = TUNE.cartSpeed * (lie === "sand" ? 0.45 : lie === "rough" ? 0.8 : lie === "path" ? 1.25 : 1) * Math.max(0.6, Math.min(1.25, 1 - climb * 1.5));
  let target = 0;
  if (inp.len > 0.08) {
    let diff = Math.atan2(inp.y, inp.x) - c.a;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const turn = TUNE.cartTurn * dt;
    c.a += Math.max(-turn, Math.min(turn, diff));
    target = maxV * inp.len * Math.max(0.15, Math.cos(diff));
  }
  c.v += Math.max(-70 * dt, Math.min(45 * dt, target - c.v));
  c.x += Math.cos(c.a) * c.v * dt; c.y += Math.sin(c.a) * c.v * dt;

  const R = TUNE.cartRadius;
  const pushFrom = (ox, oy, min) => {
    const d = dist(c.x, c.y, ox, oy);
    if (d < min) { const nx = (c.x - ox) / (d || 1), ny = (c.y - oy) / (d || 1); c.x = ox + nx * min; c.y = oy + ny * min; return true; }
    return false;
  };
  for (const o of H.obstacles) if (pushFrom(o.x, o.y, (o.kind === "tree" ? o.r * 0.55 : o.r) + R)) c.v = Math.min(c.v, 10);
  pushFrom(H.green.x, H.green.y, H.green.r + R); // no carts on the green
  for (const e of H.ponds) {
    for (let i = 0; i < 30 && inEllipse(e, c.x, c.y, R) && !onBridge(H, c.x, c.y, 6); i++) {
      const d = dist(c.x, c.y, e.x, e.y) || 1;
      c.x += ((c.x - e.x) / d) * 0.4; c.y += ((c.y - e.y) / d) * 0.4; c.v = Math.min(c.v, 10);
    }
  }
  const b = H.bounds;
  c.x = Math.max(b.minX + R, Math.min(b.maxX - R, c.x));
  c.y = Math.max(b.minY + R, Math.min(b.maxY - R, c.y));

  const atBall = dist(c.x, c.y, G.ball.x, G.ball.y) < TUNE.arrive;
  const atGreen = onGreen() && dist(c.x, c.y, H.green.x, H.green.y) < H.green.r + R + 4;
  if (atBall || atGreen) { c.v = 0; enterAim(); }
}

// ───────────────────────── Finish and leaderboard ─────────────────────────
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const officialKey = () => "dailyputt:official:" + G.date;
let lastEntry = null;

function finish() {
  G.mode = "done";
  G.time = (Date.now() - G.start) / 1000;
  Object.assign(G.ball, { x: H.cup.x, y: H.cup.y, vx: 0, vy: 0, air: false });
  setHint("");
  const score = G.time + G.penalties;
  const official = !G.practice && !store.get(officialKey(), null);
  lastEntry = { name: "", score, time: G.time, pen: G.penalties, strokes: G.strokes, official, at: Date.now() };
  if (official) store.set(officialKey(), lastEntry);
  $("endTitle").textContent = official ? "In the hole!" : "In the hole! (practice)";
  $("endScore").textContent = fmt(score);
  $("endDetail").textContent = `${fmt(G.time)} on the clock` + (G.penalties ? `, plus ${G.penalties}s in penalties` : "") +
    `. ${G.strokes} stroke${G.strokes === 1 ? "" : "s"}.`;
  $("nameRow").style.display = official ? "flex" : "none";
  $("name").value = store.get("dailyputt:name", "");
  $("share").hidden = !official;
  showBoard();
  setTimeout(() => $("end").classList.add("on"), 700);
}
async function showBoard(meAt) {
  const list = G.practice && G.seed !== G.date ? [] : await Leaderboard.top(G.date);
  $("board").innerHTML = "";
  list.forEach((e, i) => {
    const li = document.createElement("li");
    if (e.at === meAt) li.className = "me";
    const a = document.createElement("span"), b = document.createElement("span");
    a.textContent = `${i + 1}. ${e.name}`; b.textContent = `${fmt(e.score)}  (${e.strokes})`;
    li.append(a, b); $("board").append(li);
  });
}
$("save").onclick = async () => {
  const name = $("name").value.trim().slice(0, 12);
  if (!name || !lastEntry) return $("name").focus();
  store.set("dailyputt:name", name);
  lastEntry.name = name;
  store.set(officialKey(), lastEntry);
  await Leaderboard.submit(G.date, lastEntry);
  $("nameRow").style.display = "none";
  showBoard(lastEntry.at);
};
$("share").onclick = async () => {
  const e = store.get(officialKey(), lastEntry);
  const text = `⛳ The Daily Putt #${holeNumber(G.date)}: ${fmt(e.score)} in ${e.strokes} strokes`;
  try {
    if (navigator.share) await navigator.share({ text, url: location.href });
    else { await navigator.clipboard.writeText(`${text} ${location.href}`); toast("Copied!"); }
  } catch { /* cancelled */ }
};

function begin(seed, practice) {
  G.practice = practice;
  loadHole(seed);
  $("title").classList.remove("on"); $("end").classList.remove("on");
  G.start = Date.now();
  enterAim();
}
$("start").onclick = () => begin(G.date, !!store.get(officialKey(), null));
$("again").onclick = () => begin(G.date, true);
const randomHole = () => begin("practice-" + Math.random().toString(36).slice(2, 8), true);
$("random").onclick = randomHole; $("random2").onclick = randomHole;

function showTitle() {
  G.date = new URLSearchParams(location.search).get("date") || nyDate();
  loadHole(G.date);
  $("holeLine").textContent = `Hole #${holeNumber(G.date)} · ${G.date}`;
  const facts = [["Length", `${Math.round(dist(0, 0, H.cup.x, H.cup.y))} yds`], ["Par", "4"], ["Weather", WEATHER[H.weather].name], ["Wind", `${H.wind.mph} mph`],
    ["Water", `${H.ponds.length} pond${H.ponds.length === 1 ? "" : "s"}`]];
  $("facts").innerHTML = "";
  for (const [k, v] of facts) {
    const d = document.createElement("div"); d.className = "chip";
    const s = document.createElement("small"), b = document.createElement("b");
    s.textContent = k; b.textContent = v; d.append(s, b); $("facts").append(d);
  }
  const done = store.get(officialKey(), null);
  if (done) {
    $("already").hidden = false;
    $("already").textContent = `Your official time today: ${fmt(done.score)}. More rounds are practice.`;
    $("start").textContent = "Practice today's hole";
    $("random").hidden = false;
  }
}
setInterval(() => {
  const s = secondsToNyMidnight();
  $("next").textContent = `Next hole in ${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m (midnight Eastern).`;
}, 1000);

// ───────────────────────── Input ─────────────────────────
const maxPull = () => Math.min(W, Hpx) * 0.4;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (G.mode === "aim") G.aim = { sx: e.clientX, sy: e.clientY, dx: 0, dy: 1, p: 0 };
  else if (G.mode === "drive") {
    G.stick = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
    const s = $("stick"); s.style.display = "block"; s.style.left = e.clientX + "px"; s.style.top = e.clientY + "px";
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (G.mode === "aim" && G.aim) {
    // Pull back like a slingshot: the shot goes opposite the drag.
    const px = G.aim.sx - e.clientX, py = -(G.aim.sy - e.clientY), len = Math.hypot(px, py);
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    if (len > 1) { G.aim.dx = (px * c - py * s) / len; G.aim.dy = (px * s + py * c) / len; }
    G.aim.p = Math.min(1, len / maxPull()); G.preview = null;
  } else if (G.mode === "drive" && G.stick) {
    let dx = e.clientX - G.stick.sx, dy = e.clientY - G.stick.sy;
    const l = Math.hypot(dx, dy);
    if (l > 50) { dx *= 50 / l; dy *= 50 / l; }
    G.stick.x = G.stick.sx + dx; G.stick.y = G.stick.sy + dy;
    $("stick").firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
});
function release() {
  if (G.mode === "aim" && G.aim) {
    const a = G.aim; G.aim = null;
    if (a.p >= 0.06) shoot(a.dx, a.dy, a.p); else if (a.p > 0) toast("Pull back further");
  }
  G.stick = null;
  $("stick").style.display = "none"; $("stick").firstElementChild.style.transform = "";
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", () => { G.aim = null; release(); });
window.addEventListener("keydown", (e) => { G.keys[e.key] = true; });
window.addEventListener("keyup", (e) => { G.keys[e.key] = false; });
document.addEventListener("contextmenu", (e) => e.preventDefault());

// ───────────────────────── Camera, drawing, loop ─────────────────────────
// Third person: behind the golfer for swings, behind the cart when driving.
function updateCamera(dt) {
  const b = G.ball;
  let fx = b.x, fy = b.y, lookZ = 0, lift = 0, turn = 4;
  if (G.mode === "aim" || G.mode === "title") {
    if (onGreen()) {
      const d = dist(b.x, b.y, H.cup.x, H.cup.y);
      cam.back = 9 + d * 0.3; cam.height = 5 + d * 0.2; cam.ahead = d * 0.6;
    } else { cam.back = 26; cam.height = 17; cam.ahead = 36; }
    if (!G.aim) cam.rotTarget = aimAngle();
  } else if (G.mode === "flight") {
    if (b.air) { const up = b.z - heightAt(H, b.x, b.y); cam.back = 26; cam.height = 17; cam.ahead = 24; lift = up * 0.4; lookZ = up * 0.8; }
  } else if (G.mode === "drive") {
    fx = G.cart.x; fy = G.cart.y; cam.back = 19; cam.height = 11; cam.ahead = 14; turn = 2.4;
    cam.rotTarget = G.cart.a - Math.PI / 2;
  } else if (G.mode === "done") {
    fx = H.cup.x; fy = H.cup.y; cam.back = 15; cam.height = 8; cam.ahead = 0; turn = 1;
    cam.rotTarget = cam.rot + 0.4; // slow orbit around the pin
  }
  if (cam.rotTarget != null && !G.aim) { // hold still while the player is aiming
    const d = Math.atan2(Math.sin(cam.rotTarget - cam.rot), Math.cos(cam.rotTarget - cam.rot));
    cam.rot += cam.snap ? d : d * (1 - Math.exp(-dt * turn));
  }
  const ux = -Math.sin(cam.rot), uy = Math.cos(cam.rot), fz = heightAt(H, fx, fy);
  const gx = fx - ux * cam.back, gy = fy - uy * cam.back;
  const gz = Math.max(fz + cam.height + lift, heightAt(H, gx, gy) + 3); // never under a hill
  const k = cam.snap ? 1 : 1 - Math.exp(-dt * 5);
  cam.pos.x += (gx - cam.pos.x) * k; cam.pos.y += (gy - cam.pos.y) * k; cam.pos.z += (gz - cam.pos.z) * k;
  cam.look.x += (fx + ux * cam.ahead - cam.look.x) * k; cam.look.y += (fy + uy * cam.ahead - cam.look.y) * k;
  cam.look.z += (fz + lookZ - cam.look.z) * k;
  cam.fx = fx; cam.fy = fy; cam.snap = false;
  camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.updateMatrixWorld();
  // The sun's shadow area follows the action.
  sun.target.position.set(cam.look.x, cam.look.y, fz);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 400);
  skyDome.position.copy(cam.pos);
}

const tmp = new THREE.Vector3(), UPZ = new THREE.Vector3(0, 0, 1);
function draw(dt) {
  const b = G.ball, hAt = (x, y) => heightAt(H, x, y), now = performance.now() / 1000;
  waterMat.uniforms.time.value = now;
  stepRain(dt, windNow());
  { // the flag ripples
    const p = H.flag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) + 0.5; p.setZ(i, Math.sin(u * 7 - now * 7) * 0.13 * u); }
    p.needsUpdate = true;
  }
  mowerMesh.visible = !!H.mower;
  if (H.mower) { const o = H.mower; mowerMesh.position.set(o.x, o.y, hAt(o.x, o.y)); mowerMesh.rotation.z = o.a; }
  for (const p of bits) { // flying turf, sand and spray
    if (p.life <= 0) continue;
    p.life -= dt; p.vz -= 26 * dt;
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    if (p.life <= 0 || p.m.position.z < hAt(p.m.position.x, p.m.position.y)) { p.life = 0; p.m.visible = false; }
  }
  { // a white streak behind the ball in the air
    const tp = trail.geometry.attributes.position, flying = G.mode === "flight" && b.air;
    if (!flying) trail.userData.n = 0;
    else {
      const n = (trail.userData.n = Math.min(TRAIL_N, (trail.userData.n || 0) + 1));
      for (let i = TRAIL_N - 1; i > 0; i--) tp.setXYZ(i, tp.getX(i - 1), tp.getY(i - 1), tp.getZ(i - 1));
      tp.setXYZ(0, b.x, b.y, b.z + 0.6);
      for (let i = n; i < TRAIL_N; i++) tp.setXYZ(i, tp.getX(n - 1), tp.getY(n - 1), tp.getZ(n - 1));
      tp.needsUpdate = true;
    }
    trail.visible = flying && trail.userData.n > 1;
  }
  ballMesh.position.set(b.x, b.y, b.z + 0.6);
  ballShadow.position.set(b.x, b.y, hAt(b.x, b.y) + 0.05);
  ballMesh.visible = ballShadow.visible = G.mode !== "done";
  beacon.visible = G.mode === "drive"; beacon.position.set(b.x, b.y, b.z + 20);
  H.pin.visible = !(onGreen() && dist(b.x, b.y, H.cup.x, H.cup.y) < 6 && G.mode !== "done");

  const rx = Math.cos(cam.rot), ry = Math.sin(cam.rot);
  golferMesh.visible = G.mode !== "drive";
  const gx = G.golfer.x - rx * 2.1, gy = G.golfer.y - ry * 2.1;
  golferMesh.position.set(gx, gy, hAt(gx, gy));
  golferMesh.rotation.z = cam.rot;

  const c = G.cart, cs = slopeAt(H, c.x, c.y);
  cartMesh.position.set(c.x, c.y, hAt(c.x, c.y));
  cartMesh.quaternion.setFromUnitVectors(UPZ, tmp.set(-cs.x, -cs.y, 1).normalize()); // lean with the hill
  cartBody.rotation.z = c.a;
  animate(dt, now);

  // Hide trees standing between the camera and what it follows.
  for (const o of H.obstacles) {
    if (o.kind !== "tree") continue;
    const vx = cam.fx - cam.pos.x, vy = cam.fy - cam.pos.y;
    const t = clamp01(((o.x - cam.pos.x) * vx + (o.y - cam.pos.y) * vy) / (vx * vx + vy * vy || 1));
    showTree(o, dist(o.x, o.y, cam.pos.x + vx * t, cam.pos.y + vy * t) > o.r + 1.5);
  }

  // Aim preview
  const aiming = G.mode === "aim" && G.aim && G.aim.p >= 0.06;
  $("power").style.display = G.mode === "aim" && G.aim ? "block" : "none";
  if (G.mode === "aim" && G.aim) $("power").firstElementChild.style.width = G.aim.p * 100 + "%";
  const pv = aiming ? (G.preview ||= simulate(G.aim.dx, G.aim.dy, G.aim.p)) : null;
  const step = pv ? Math.max(1, Math.ceil(pv.pts.length / dots.length)) : 1;
  dots.forEach((d, i) => {
    const p = pv && pv.pts[i * step];
    d.visible = !!p;
    if (p) { d.position.set(p[0], p[1], p[2]); d.scale.setScalar(pv.putt ? 0.13 : 0.32); }
  });
  landMark.visible = !!(pv && pv.land); endMark.visible = !!pv;
  if (pv) {
    if (pv.land) landMark.position.set(pv.land.x, pv.land.y, hAt(pv.land.x, pv.land.y) + 0.2);
    endMark.position.set(pv.end[0], pv.end[1], hAt(pv.end[0], pv.end[1]) + 0.2);
    endMark.material.color.set(pv.bad ? "#ff4136" : "#ffffff"); // red: this shot ends in trouble
    endMark.scale.set(pv.putt ? 0.5 : 1.6, pv.putt ? 0.5 : 1.6, 0.3);
  }

  // HUD
  const running = G.mode === "aim" || G.mode === "flight" || G.mode === "drive";
  if (running) $("time").textContent = fmt((Date.now() - G.start) / 1000);
  $("pen").textContent = G.penalties ? `+${G.penalties}` : "";
  $("strokes").textContent = G.strokes;
  $("pin").textContent = Math.round(dist(b.x, b.y, H.cup.x, H.cup.y));
  // Arrow pointing up the screen means the wind blows away from you.
  const wn = windNow();
  $("windArrow").style.transform = `rotate(${(-(wn.angle - cam.rot) * 180) / Math.PI}deg)`;
  $("windMph").textContent = Math.round(wn.mph);

  const m = $("marker");
  if (G.mode === "drive") {
    tmp.set(b.x, b.y, b.z + 1).applyMatrix4(camera.matrixWorldInverse);
    let sx, sy;
    if (tmp.z < -0.1) {
      tmp.set(b.x, b.y, b.z + 1).project(camera);
      sx = ((tmp.x + 1) / 2) * W; sy = ((1 - tmp.y) / 2) * Hpx;
    } else { sx = tmp.x > 0 ? W : 0; sy = Hpx; } // the ball is behind you
    const pad = 34;
    m.style.display = "block";
    m.style.left = Math.max(pad, Math.min(W - pad, sx)) + "px";
    m.style.top = Math.max(pad + 60, Math.min(Hpx - pad - 50, sy)) + "px";
    m.firstElementChild.textContent = `${Math.round(dist(b.x, b.y, G.cart.x, G.cart.y))} yds`;
  } else m.style.display = "none";

  if (composer) composer.render(); else renderer.render(scene, camera);
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - prev) / 1000); prev = now;
  stepMower();
  if (G.mode === "flight") stepBall(dt);
  else if (G.mode === "drive") stepCart(dt);
  updateCamera(dt);
  draw(dt);
  requestAnimationFrame(frame);
}

showTitle();
requestAnimationFrame(frame);

// For testing and tuning from the browser console.
window.__dp = { G, TUNE, cam, QUALITY, onBridge, simulate, generateHole, terrainAt, heightAt, hole: () => H, shoot };
