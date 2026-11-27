// The Daily Putt: prototype.
// One hole per day, generated from the New York date, so every player gets
// the same hole and nothing has to run on a server to "drop" it at midnight.
import * as THREE from "./vendor/three.module.min.js";

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

function generateHole(seed) {
  const r = mulberry32(hashStr("daily-putt:" + seed));
  const rand = (a, b) => a + (b - a) * r();
  const sign = () => (r() < 0.5 ? -1 : 1);

  const L = rand(230, 370);
  const o1 = sign() * rand(10, 45), o2 = o1 + sign() * rand(15, 55), o3 = o2 + rand(-25, 25);
  const ctrl = [[0, 0], [o1, L * 0.35], [o2, L * 0.7], [o3, L]];
  const line = [];
  for (let i = 0; i < 3; i++) {
    const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, 3)];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      line.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  line.push(ctrl[3]);
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
  const wantPonds = 1 + (r() < 0.45 ? 1 : 0);
  for (let tries = 0; tries < 40 && ponds.length < wantPonds; tries++) {
    const p = at(rand(0.28, 0.8));
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
  const wantBunkers = bunkers.length + 1 + (r() < 0.6 ? 1 : 0) + (r() < 0.3 ? 1 : 0);
  for (let tries = 0; tries < 60 && bunkers.length < wantBunkers; tries++) {
    const p = at(rand(0.3, 0.85)), off = sign() * rand(hw - 3, hw + 6);
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
  for (const side of r() < 0.5 ? [1, -1] : [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const p = at((i / 40) * 0.93);
      pts.push([p.x + p.nx * side * (hw + 6), p.y + p.ny * side * (hw + 6)]);
    }
    if (pts.every(([x, y]) => clearOfHazards(x, y, 3))) { path = pts; break; }
  }

  // Things the cart (and the ball) bump into.
  const obstacles = [];
  for (let tries = 0; tries < 400 && obstacles.length < 45; tries++) {
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
  const wantRocks = 1 + Math.floor(r() * 3);
  for (let tries = 0, n = 0; tries < 40 && n < wantRocks; tries++) {
    const p = at(rand(0.2, 0.85)), off = rand(-hw + 3, hw - 3);
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (!clearOfHazards(x, y, 5) || dist(x, y, green.x, green.y) < green.r + 10) continue;
    obstacles.push({ x, y, r: rand(1.8, 2.4), kind: "rock" }); n++;
  }

  const wind = { angle: rand(0, Math.PI * 2), mph: Math.round(rand(0, 14)) };

  // Rolling ground: a few long waves, plus a tilt on the green so putts break.
  const waves = [[220, 2.4], [130, 1.7], [75, 1.0], [48, 0.5]].map(([len, amp]) => {
    const a = rand(0, Math.PI * 2), k = (Math.PI * 2) / len;
    return { kx: Math.cos(a) * k, ky: Math.sin(a) * k, ph: rand(0, 7), amp };
  });
  const ta = rand(0, Math.PI * 2), tilt = rand(0.012, 0.04);
  const greenTilt = { x: Math.cos(ta) * tilt, y: Math.sin(ta) * tilt };

  const H = { seed, L, line, hw, green, cup, bounds, ponds, bunkers, obstacles, wind, path, waves, greenTilt };
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
    return h * lerp(0.4, 1.25, smooth(H.hw * 0.5, H.hw + 50, distToLine(H.line, x, y))); // gentler on the fairway
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

function terrainAt(H, x, y) {
  const b = H.bounds;
  if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return "ob";
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
const $ = (id) => document.getElementById(id);
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#cfe9fb", 320, 1500);
const skyLight = new THREE.HemisphereLight("#dff1ff", "#6f9a5c", 1.7);
skyLight.position.set(0, 0, 1);
const sun = new THREE.DirectionalLight("#fff1cf", 2.7);
const SUN_DIR = new THREE.Vector3(-0.55, -0.45, 0.7).normalize();
sun.castShadow = true;
sun.shadow.mapSize.setScalar(Math.min(window.innerWidth, window.innerHeight) < 700 ? 1024 : 2048); // lighter on phones
Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 700 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(skyLight, sun, sun.target);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 4000);
camera.up.set(0, 0, 1);
// rot is the camera's heading: "up the screen" points along (-sin rot, cos rot) on the ground.
const cam = { rot: 0, rotTarget: null, pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true,
  back: 26, height: 17, ahead: 36, fx: 0, fy: 0 };
let W = 1, Hpx = 1;
function resize() {
  W = window.innerWidth; Hpx = window.innerHeight;
  renderer.setSize(W, Hpx, false);
  camera.aspect = W / Hpx;
  camera.fov = camera.aspect < 1 ? 70 : 52; // taller view on a phone held upright
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const CIRCLE = new THREE.CircleGeometry(1, 32);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const TRUNK = new THREE.CylinderGeometry(0.7, 1, 1, 7);
const CONE = new THREE.ConeGeometry(1, 1, 8);
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const ROCK = new THREE.DodecahedronGeometry(1);
const lam = (c, flat = false) => new THREE.MeshLambertMaterial({ color: c, flatShading: flat });
const basic = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
// A solid standing on the ground: w wide, h tall, with its base at height z.
function solid(geo, material, w, h, z = 0, d = w) {
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = Math.PI / 2; m.scale.set(w, h, d); m.position.z = z + h / 2; m.castShadow = true;
  return m;
}

// Sky dome, clouds and far hills. These never change between holes.
{
  const cv = document.createElement("canvas"); cv.width = 4; cv.height = 256;
  const c = cv.getContext("2d"), g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#2f7fd6"); g.addColorStop(0.42, "#7fbdf0"); g.addColorStop(0.5, "#cfe9fb"); g.addColorStop(1, "#cfe9fb");
  c.fillStyle = g; c.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.rotation.x = Math.PI / 2; dome.renderOrder = -10;
  scene.add(dome);
  const r = mulberry32(7);
  const cloudMat = new THREE.MeshBasicMaterial({ color: "#ffffff", fog: false, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, d = 700 + r() * 1300, cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(SPHERE, cloudMat), s = 50 + r() * 60;
      puff.scale.set(s * 1.6, s, s * 0.45); puff.position.set((k - 1.5) * 70 + r() * 30, r() * 40, r() * 18);
      cloud.add(puff);
    }
    cloud.position.set(Math.cos(a) * d, Math.sin(a) * d + 150, 330 + r() * 250); cloud.rotation.z = a + Math.PI / 2;
    scene.add(cloud);
  }
  const hillMats = [lam("#5d9a6a", true), lam("#4f8a66", true), lam("#6aa873", true)];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.2, d = 800 + r() * 500, s = 220 + r() * 260;
    const hill = new THREE.Mesh(BLOB, hillMats[i % 3]);
    hill.scale.set(s * 1.5, s, s * (0.3 + r() * 0.3)); hill.position.set(Math.cos(a) * d, Math.sin(a) * d + 150, -20); hill.rotation.z = r() * 6;
    scene.add(hill);
  }
  const far = new THREE.Mesh(PLANE, lam("#2d6a30")); far.scale.set(8000, 8000, 1); far.position.z = -6.5; far.receiveShadow = false;
  scene.add(far);
}

// Paint the whole course, seen from above, into one texture laid over the ground.
function paintCourse(H) {
  const e = H.ext, s = Math.min(4.2, 2800 / Math.max(e.w, e.h));
  const cv = document.createElement("canvas"); cv.width = Math.round(e.w * s); cv.height = Math.round(e.h * s);
  const c = cv.getContext("2d");
  const X = (x) => (x - e.minX) * s, Y = (y) => (e.maxY - y) * s;
  const r = mulberry32(hashStr("paint:" + H.seed));
  const poly = (k, pts) => { k.beginPath(); pts.forEach(([x, y], i) => (i ? k.lineTo(X(x), Y(y)) : k.moveTo(X(x), Y(y)))); };
  const ell = (k, q, pad) => { k.beginPath(); k.ellipse(X(q.x), Y(q.y), Math.max(0.1, q.rx + pad) * s, Math.max(0.1, q.ry + pad) * s, -q.rot, 0, 7); };
  const circ = (k, x, y, rad) => { k.beginPath(); k.arc(X(x), Y(y), rad * s, 0, 7); };
  // Draw a shape on its own layer, then lay mowing stripes over just that shape.
  const striped = (shape, base, stripe, width, angle) => {
    const o = document.createElement("canvas"); o.width = cv.width; o.height = cv.height;
    const k = o.getContext("2d");
    k.fillStyle = k.strokeStyle = base; k.lineCap = k.lineJoin = "round";
    shape(k);
    k.globalCompositeOperation = "source-atop"; k.fillStyle = stripe;
    k.translate(o.width / 2, o.height / 2); k.rotate(angle);
    const far = o.width + o.height;
    for (let x = -far; x < far; x += width * s * 2) k.fillRect(x, -far, width * s, far * 2);
    c.drawImage(o, 0, 0);
  };
  const b = H.bounds;
  c.fillStyle = "#2d6a30"; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = "#3b8138"; c.fillRect(X(b.minX), Y(b.maxY), (b.maxX - b.minX) * s, (b.maxY - b.minY) * s);
  for (let i = 0; i < 2600; i++) { // darker and lighter patches in the rough
    c.fillStyle = r() < 0.5 ? "rgba(20,60,20,0.10)" : "rgba(150,200,90,0.07)";
    circ(c, e.minX + r() * e.w, e.minY + r() * e.h, 2 + r() * 7); c.fill();
  }
  c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 0.6 * s;
  c.strokeRect(X(b.minX), Y(b.maxY), (b.maxX - b.minX) * s, (b.maxY - b.minY) * s);

  c.lineCap = c.lineJoin = "round";
  c.strokeStyle = c.fillStyle = "#4a9543"; // first cut around the fairway
  poly(c, H.line); c.lineWidth = (H.hw * 2 + 5) * s; c.stroke();
  circ(c, 0, 0, Math.max(9, H.hw) + 2.5); c.fill();
  striped((k) => {
    poly(k, H.line); k.lineWidth = H.hw * 2 * s; k.stroke();
    k.beginPath(); k.arc(X(0), Y(0), Math.max(9, H.hw) * s, 0, 7); k.fill();
  }, "#5db04d", "rgba(255,255,255,0.10)", 5, 0.6);
  if (H.path) {
    c.strokeStyle = "#8d8778"; poly(c, H.path); c.lineWidth = 3.4 * s; c.stroke();
    c.strokeStyle = "#c2bba8"; poly(c, H.path); c.lineWidth = 2.6 * s; c.stroke();
  }
  c.fillStyle = "#86d06c"; c.fillRect(X(-5), Y(3), 10 * s, 6 * s); // tee box
  for (const p of H.ponds) {
    c.fillStyle = "#4f8a41"; ell(c, p, 2.5); c.fill();
    c.fillStyle = "#8c8259"; ell(c, p, 0.4); c.fill();
    c.fillStyle = "#1c5a8a"; ell(c, p, -1); c.fill();
  }
  c.fillStyle = "#6dbb57"; circ(c, H.green.x, H.green.y, H.green.r + 2.4); c.fill(); // fringe
  striped((k) => { k.beginPath(); k.arc(X(H.green.x), Y(H.green.y), H.green.r * s, 0, 7); k.fill(); },
    "#8cd76c", "rgba(255,255,255,0.11)", 2.5, -0.5);
  for (const q of H.bunkers) {
    c.fillStyle = "#62a84e"; ell(c, q, 1.4); c.fill();
    c.fillStyle = "#c9b57a"; ell(c, q, 0.3); c.fill();
    c.fillStyle = "#f0e2ad"; ell(c, q, -0.5); c.fill();
  }
  c.fillStyle = "#0c1a0c"; circ(c, H.cup.x, H.cup.y, 0.9); c.fill();
  for (let i = 0; i < 70000; i++) { // fine grain everywhere
    c.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    c.fillRect(r() * cv.width, r() * cv.height, 1 + r() * 2, 1 + r() * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

let course = null; // group holding the current hole's meshes
const Q_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), Q_ID = new THREE.Quaternion();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function buildCourse(H) {
  if (course) {
    scene.remove(course);
    course.traverse((o) => { if (o.userData.own) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  }
  course = new THREE.Group();
  const add = (m) => (course.add(m), m), hAt = (x, y) => heightAt(H, x, y);

  // Ground mesh from the height grid.
  const { nx, ny, ext } = H, pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), idx = [];
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
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: paintCourse(H) }));
  ground.receiveShadow = true; ground.userData.own = true;
  add(ground);

  const waterMat = new THREE.MeshPhongMaterial({ color: "#3f97dd", transparent: true, opacity: 0.8, shininess: 120, specular: "#ffffff" });
  for (const p of H.ponds) {
    const w = new THREE.Mesh(CIRCLE, waterMat);
    w.position.set(p.x, p.y, p.level - 0.6); w.scale.set(p.rx + 1, p.ry + 1, 1); w.rotation.z = p.rot;
    add(w);
  }

  const cupZ = hAt(H.cup.x, H.cup.y);
  const hole = new THREE.Mesh(CIRCLE, new THREE.MeshBasicMaterial({ color: "#0a140a", polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  hole.position.set(H.cup.x, H.cup.y, cupZ + 0.02); hole.scale.setScalar(0.9); add(hole);
  const pin = new THREE.Group();
  pin.add(solid(CYL, lam("#f4f4f4"), 0.13, 10));
  const flag = new THREE.Mesh(PLANE, new THREE.MeshLambertMaterial({ color: "#ff3b30", side: THREE.DoubleSide }));
  flag.rotation.x = Math.PI / 2; flag.scale.set(3.4, 2, 1); flag.position.set(1.7, 0, 9); flag.castShadow = true;
  pin.add(flag); pin.position.set(H.cup.x, H.cup.y, cupZ);
  H.pin = add(pin);
  for (const sx of [-3.5, 3.5]) { // tee markers
    const m = new THREE.Mesh(SPHERE, lam("#e0392b")); m.scale.setScalar(0.45); m.position.set(sx, 1.5, hAt(sx, 1.5) + 0.4); m.castShadow = true; add(m);
  }

  // Trees are drawn in a few batches, so many of them stay cheap on a phone.
  const r = mulberry32(hashStr("trees:" + H.seed)), b = H.bounds;
  const trees = H.obstacles.filter((o) => o.kind === "tree").map((o) => ({ ...o, src: o }));
  for (let tries = 0; tries < 600 && trees.length < 150; tries++) { // forest outside the course, just for looks
    const x = ext.minX + 15 + r() * (ext.w - 30), y = ext.minY + 15 + r() * (ext.h - 30);
    if (x > b.minX - 6 && x < b.maxX + 6 && y > b.minY - 6 && y < b.maxY + 6) continue;
    const rad = 3 + r() * 4, pine = r() < 0.6;
    trees.push({ x, y, r: rad, pine, h: rad * (pine ? 3.4 : 2.7) });
  }
  const mats = { trunk: lam("#6e4b2c", true), pineA: lam("#1f6a2c", true), pineB: lam("#2f8a3b", true), leafA: lam("#3f9440", true), leafB: lam("#58ad4a", true) };
  const batch = { trunk: [], pineA: [], pineB: [], leafA: [], leafB: [] };
  const M = (x, y, z, q, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  for (const t of trees) {
    const z = hAt(t.x, t.y) - 0.3, h = t.h, parts = [];
    const put = (name, m) => { batch[name].push(m); parts.push([name, batch[name].length - 1, m]); };
    if (t.pine) {
      put("trunk", M(t.x, t.y, z + h * 0.15, Q_UP, t.r * 0.2, h * 0.3, t.r * 0.2));
      put("pineA", M(t.x, t.y, z + h * 0.22 + h * 0.31, Q_UP, t.r, h * 0.62, t.r));
      put("pineB", M(t.x, t.y, z + h * 0.56 + h * 0.24, Q_UP, t.r * 0.72, h * 0.48, t.r * 0.72));
    } else {
      put("trunk", M(t.x, t.y, z + h * 0.25, Q_UP, t.r * 0.2, h * 0.5, t.r * 0.2));
      put("leafA", M(t.x, t.y, z + h * 0.62, Q_ID, t.r, t.r, h * 0.38));
      put("leafB", M(t.x + t.r * 0.35, t.y - t.r * 0.2, z + h * 0.8, Q_ID, t.r * 0.65, t.r * 0.65, h * 0.24));
    }
    if (t.src) { t.src.parts = parts; t.src.shown = true; }
  }
  H.batches = {};
  for (const name in batch) {
    const geo2 = name === "trunk" ? TRUNK : name.startsWith("pine") ? CONE : BLOB;
    const im = new THREE.InstancedMesh(geo2, mats[name], Math.max(1, batch[name].length));
    batch[name].forEach((m, i) => im.setMatrixAt(i, m));
    im.count = batch[name].length; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    H.batches[name] = add(im);
  }
  for (const o of H.obstacles) {
    if (o.kind !== "rock") continue;
    const rock = new THREE.Mesh(ROCK, lam("#8a9099", true));
    rock.scale.set(o.r, o.r, o.r * 0.75); rock.position.set(o.x, o.y, hAt(o.x, o.y) + o.r * 0.3); rock.rotation.z = o.x;
    rock.castShadow = rock.receiveShadow = true; add(rock);
  }
  scene.add(course);
}
function showTree(o, shown) {
  if (o.shown === shown) return;
  o.shown = shown;
  for (const [name, i, m] of o.parts) { H.batches[name].setMatrixAt(i, shown ? m : ZERO); H.batches[name].instanceMatrix.needsUpdate = true; }
}

// Moving things.
const ballShadow = new THREE.Mesh(CIRCLE, new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
ballShadow.scale.setScalar(0.7);
const ballMesh = new THREE.Mesh(SPHERE, new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#666666" }));
ballMesh.scale.setScalar(0.6); ballMesh.castShadow = true;
const beacon = solid(CYL, basic("#ffe14d", 0.45), 0.6, 40); beacon.castShadow = false;
function makeGolfer(withClub) { // faces +x
  const g = new THREE.Group(), navy = lam("#26334d"), shirt = lam("#f4c430"), skin = lam("#f0c8a0");
  for (const y of [-0.3, 0.3]) { const leg = solid(BOX, navy, 0.42, 1.5, 0, 0.42); leg.position.y = y; g.add(leg); }
  g.add(solid(BOX, shirt, 0.7, 1.4, 1.5, 1.0));
  const head = new THREE.Mesh(SPHERE, skin); head.scale.setScalar(0.42); head.position.z = 3.35; head.castShadow = true; g.add(head);
  g.add(solid(CYL, lam("#c23b22"), 0.44, 0.22, 3.55));
  const brim = solid(BOX, lam("#c23b22"), 0.5, 0.06, 3.55, 0.6); brim.position.x = 0.5; g.add(brim);
  if (withClub) {
    const arms = new THREE.Group(); arms.position.set(0.35, 0, 2.7);
    const club = new THREE.Mesh(BOX, lam("#d9d9d9")); club.scale.set(0.09, 0.09, 3.0); club.position.set(0.55, 0, -1.3); club.rotation.y = -0.4; club.castShadow = true;
    const arm = new THREE.Mesh(BOX, shirt); arm.scale.set(0.3, 0.9, 1.1); arm.position.set(0.2, 0, -0.45); arm.rotation.y = -0.4; arm.castShadow = true;
    arms.add(club, arm); g.add(arms); g.userData.arms = arms;
  }
  return g;
}
const golferMesh = makeGolfer(true);
const cartMesh = new THREE.Group(), cartBody = new THREE.Group(); // body is built facing +x
cartMesh.add(cartBody);
{
  const white = lam("#f7f7f2"), dark = lam("#1a1a1a"), blue = lam("#2b6cb0");
  const box = (m, x, y, z, sx, sy, sz) => { const b = new THREE.Mesh(BOX, m); b.position.set(x, y, z); b.scale.set(sx, sy, sz); b.castShadow = true; cartBody.add(b); return b; };
  box(white, 0, 0, 1.0, 4.8, 2.6, 0.9);            // body
  box(white, 1.9, 0, 1.6, 1.0, 2.4, 0.5);          // nose
  box(dark, 0, 0, 0.62, 4.9, 2.7, 0.18);           // bumper strip
  box(blue, -0.5, 0, 1.75, 1.3, 2.3, 0.6);         // seat
  box(blue, -1.2, 0, 2.3, 0.3, 2.3, 1.2);          // seat back
  box(white, -0.3, 0, 4.1, 3.6, 2.7, 0.2);         // roof
  box(lam("#3a2a1a"), -2.1, 0, 2.0, 0.7, 1.6, 1.8); // golf bag
  for (const [x, y] of [[1.3, 1.2], [1.3, -1.2], [-1.9, 1.2], [-1.9, -1.2]]) box(dark, x, y, 2.75, 0.14, 0.14, 2.6);
  box(basic("#fff3a0"), 2.42, 0.8, 1.3, 0.1, 0.5, 0.3); box(basic("#fff3a0"), 2.42, -0.8, 1.3, 0.1, 0.5, 0.3); // headlights
  for (const [x, y] of [[1.5, 1.35], [1.5, -1.35], [-1.5, 1.35], [-1.5, -1.35]]) {
    const w = new THREE.Mesh(CYL, dark); w.scale.set(0.65, 0.5, 0.65); w.position.set(x, y, 0.65); w.castShadow = true; cartBody.add(w);
  }
}
const driver = makeGolfer(false); driver.scale.setScalar(0.85); driver.position.set(-0.5, 0.5, 1.2); cartBody.add(driver);
// The aim preview: dots along the ball's path, a landing spot, and where it should stop.
const dotMat = basic("#ffffff", 0.9), dots = [];
for (let i = 0; i < 34; i++) { const d = new THREE.Mesh(SPHERE, dotMat); d.scale.setScalar(0.32); d.visible = false; dots.push(d); scene.add(d); }
const landMark = new THREE.Mesh(SPHERE, basic("#ffe14d")); landMark.scale.set(1.2, 1.2, 0.35);
const endMark = new THREE.Mesh(SPHERE, basic("#ffffff", 0.8)); endMark.scale.set(1.6, 1.6, 0.3);
scene.add(ballShadow, ballMesh, beacon, golferMesh, cartMesh, landMark, endMark);

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
  Object.assign(G.ball, { x: 0, y: 0, z: heightAt(H, 0, 0), vx: 0, vy: 0, vz: 0, air: false });
  G.last = { x: 0, y: 0 }; G.golfer = { x: 0, y: 0 };
  Object.assign(G.cart, { x: -7, y: -4, a: Math.PI / 2, v: 0 });
  G.strokes = 0; G.penalties = 0; G.aim = null; G.stick = null; G.preview = null;
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
    const v = Math.sqrt(2 * TUNE.friction.green * plan.D);
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
    const grip = TUNE.grip[lie] * (b.bounces === 0 ? b.spin : 1), e = TUNE.bounce[lie];
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
    const s = slopeAt(H, b.x, b.y), pull = TUNE.slopePull * Math.hypot(s.x, s.y), fr = TUNE.friction[lie];
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
function stepBall(dt) {
  const b = G.ball, wasHit = b.hitTree, ev = stepPhysics(b, dt, H.wind);
  if (b.hitTree && !wasHit) toast("Tree!");
  if (ev === "water") penalty("Splash!");
  else if (ev === "ob") penalty("Out of bounds!");
  else if (ev === "holed") finish();
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
    for (let i = 0; i < 30 && inEllipse(e, c.x, c.y, R); i++) {
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
  const facts = [["Length", `${Math.round(dist(0, 0, H.cup.x, H.cup.y))} yds`], ["Wind", `${H.wind.mph} mph`],
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
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 300);
}

const tmp = new THREE.Vector3(), UPZ = new THREE.Vector3(0, 0, 1);
function draw(dt) {
  const b = G.ball, hAt = (x, y) => heightAt(H, x, y);
  ballMesh.position.set(b.x, b.y, b.z + 0.6);
  ballShadow.position.set(b.x, b.y, hAt(b.x, b.y) + 0.05);
  ballMesh.visible = ballShadow.visible = G.mode !== "done";
  beacon.visible = G.mode === "drive"; beacon.position.set(b.x, b.y, b.z + 20);
  H.pin.visible = !(onGreen() && dist(b.x, b.y, H.cup.x, H.cup.y) < 6 && G.mode !== "done");

  const rx = Math.cos(cam.rot), ry = Math.sin(cam.rot);
  golferMesh.visible = G.mode === "aim" || G.mode === "flight" || G.mode === "title";
  const gx = G.golfer.x - rx * 1.7, gy = G.golfer.y - ry * 1.7;
  golferMesh.position.set(gx, gy, hAt(gx, gy));
  golferMesh.rotation.z = cam.rot;
  // Swing: wind up while aiming, whip through on release.
  G.swing = Math.min(1, G.swing + dt * 3.2);
  const back = G.mode === "aim" && G.aim ? -0.4 - G.aim.p * 1.9 : 0;
  golferMesh.userData.arms.rotation.x = G.swing < 1 ? lerp(-2.2, 2.4, G.swing) * (1 - G.swing * G.swing) : back;

  const c = G.cart, cs = slopeAt(H, c.x, c.y);
  cartMesh.position.set(c.x, c.y, hAt(c.x, c.y));
  cartMesh.quaternion.setFromUnitVectors(UPZ, tmp.set(-cs.x, -cs.y, 1).normalize()); // lean with the hill
  cartBody.rotation.z = c.a;
  driver.visible = G.mode === "drive";

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
  $("windArrow").style.transform = `rotate(${(-(H.wind.angle - cam.rot) * 180) / Math.PI}deg)`;

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

  renderer.render(scene, camera);
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - prev) / 1000); prev = now;
  if (G.mode === "flight") stepBall(dt);
  else if (G.mode === "drive") stepCart(dt);
  updateCamera(dt);
  draw(dt);
  requestAnimationFrame(frame);
}

showTitle();
requestAnimationFrame(frame);

// For testing and tuning from the browser console.
window.__dp = { G, TUNE, cam, generateHole, terrainAt, heightAt, hole: () => H, shoot };
