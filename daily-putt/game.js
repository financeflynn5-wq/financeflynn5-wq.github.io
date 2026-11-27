// The Daily Putt: prototype.
// One hole per day, generated from the New York date, so every player gets
// the same hole and nothing has to run on a server to "drop" it at midnight.
import * as THREE from "./vendor/three.module.min.js";

// ───────────────────────── Tuning (the numbers worth playing with) ─────────────────────────
const TUNE = {
  penalty: 10,          // seconds added for water / out of bounds
  maxDrive: 150,        // full swing distance from fairway, in yards
  maxPutt: 55,          // full putt distance
  carry: 0.82,          // share of a full shot spent in the air
  windPush: 0.4,        // sideways acceleration per mph while the ball is in the air
  friction: { green: 12, fairway: 14, rough: 38, sand: 110 },
  lie: { fairway: 1, green: 1, rough: 0.8, sand: 0.55 }, // distance multiplier by lie
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
function inEllipse(e, x, y, pad = 0) {
  const c = Math.cos(-e.rot), s = Math.sin(-e.rot), dx = x - e.x, dy = y - e.y;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return (lx * lx) / ((e.rx + pad) ** 2) + (ly * ly) / ((e.ry + pad) ** 2) < 1;
}
function distToLine(line, x, y) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
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
  const greenside = 1 + (r() < 0.6 ? 1 : 0);
  for (let tries = 0; tries < 30 && bunkers.length < greenside; tries++) {
    const a = rand(0, Math.PI * 2), ry = rand(4, 6);
    const e = { x: green.x + Math.cos(a) * (green.r + ry + 2), y: green.y + Math.sin(a) * (green.r + ry + 2),
      rx: rand(6, 10), ry, rot: a + Math.PI / 2 };
    if (bunkers.some((q) => dist(e.x, e.y, q.x, q.y) < e.rx + q.rx + 2)) continue;
    bunkers.push(e);
  }
  const wantBunkers = bunkers.length + 1 + (r() < 0.5 ? 1 : 0);
  for (let tries = 0; tries < 40 && bunkers.length < wantBunkers; tries++) {
    const p = at(rand(0.3, 0.85)), off = sign() * rand(hw - 3, hw + 6);
    const e = { x: p.x + p.nx * off, y: p.y + p.ny * off, rx: rand(6, 9), ry: rand(4, 7), rot: rand(0, Math.PI) };
    if (dist(e.x, e.y, green.x, green.y) < green.r + e.rx + 6) continue;
    if (ponds.some((q) => dist(e.x, e.y, q.x, q.y) < e.rx + q.rx + 3)) continue;
    if (bunkers.some((q) => dist(e.x, e.y, q.x, q.y) < e.rx + q.rx + 3)) continue;
    bunkers.push(e);
  }

  // Things the cart (and a rolling ball) bump into.
  const obstacles = [];
  const clearOfHazards = (x, y, pad) =>
    !ponds.some((q) => inEllipse(q, x, y, pad)) && !bunkers.some((q) => inEllipse(q, x, y, pad));
  for (let tries = 0; tries < 400 && obstacles.length < 45; tries++) {
    const x = rand(bounds.minX + 5, bounds.maxX - 5), y = rand(bounds.minY + 5, bounds.maxY - 5), rad = rand(3, 5.5);
    if (distToLine(line, x, y) < hw + rad + 5) continue;
    if (dist(x, y, green.x, green.y) < green.r + rad + 7) continue;
    if (dist(x, y, 0, 0) < 16) continue;
    if (!clearOfHazards(x, y, rad + 2)) continue;
    if (obstacles.some((o) => dist(x, y, o.x, o.y) < rad + o.r + 6)) continue;
    obstacles.push({ x, y, r: rad, kind: "tree" });
  }
  const wantRocks = 1 + Math.floor(r() * 3);
  for (let tries = 0, n = 0; tries < 40 && n < wantRocks; tries++) {
    const p = at(rand(0.2, 0.85)), off = rand(-hw + 3, hw - 3);
    const x = p.x + p.nx * off, y = p.y + p.ny * off;
    if (!clearOfHazards(x, y, 5) || dist(x, y, green.x, green.y) < green.r + 10) continue;
    obstacles.push({ x, y, r: rand(1.8, 2.4), kind: "rock" }); n++;
  }

  const wa = rand(0, Math.PI * 2);
  const wind = { angle: wa, mph: Math.round(rand(0, 14)) };

  return { seed, L, line, hw, green, cup, bounds, ponds, bunkers, obstacles, wind };
}

function terrainAt(H, x, y) {
  const b = H.bounds;
  if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) return "ob";
  if (H.ponds.some((e) => inEllipse(e, x, y))) return "water";
  if (dist(x, y, H.green.x, H.green.y) < H.green.r) return "green";
  if (H.bunkers.some((e) => inEllipse(e, x, y))) return "sand";
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
const $ = (id) => document.getElementById(id);
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#1d3b24");
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.z = 100;
const cam = { x: 0, y: 0, rot: 0, upp: 0.5 }; // upp = world units per screen pixel
let W = 1, Hpx = 1;
function resize() {
  W = window.innerWidth; Hpx = window.innerHeight;
  renderer.setSize(W, Hpx, false);
}
window.addEventListener("resize", resize);
resize();

const CIRCLE = new THREE.CircleGeometry(1, 40);
const PLANE = new THREE.PlaneGeometry(1, 1);
const mat = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity });
function disc(color, x, y, z, rx, ry = rx, rot = 0, opacity = 1) {
  const m = new THREE.Mesh(CIRCLE, mat(color, opacity));
  m.position.set(x, y, z); m.scale.set(rx, ry, 1); m.rotation.z = rot;
  return m;
}
function bar(color, opacity = 1) { return new THREE.Mesh(PLANE, mat(color, opacity)); }
function setBar(m, ax, ay, bx, by, width, z) {
  m.position.set((ax + bx) / 2, (ay + by) / 2, z);
  m.rotation.z = Math.atan2(by - ay, bx - ax);
  m.scale.set(Math.max(0.001, dist(ax, ay, bx, by)), width, 1);
}

let course = null; // group holding the current hole's meshes
function buildCourse(H) {
  if (course) scene.remove(course);
  course = new THREE.Group();
  const b = H.bounds, add = (m) => (course.add(m), m);

  const rough = bar("#3f7d3a");
  rough.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0);
  rough.scale.set(b.maxX - b.minX, b.maxY - b.minY, 1);
  add(rough);
  // White out-of-bounds line.
  for (const [ax, ay, bx, by] of [[b.minX, b.minY, b.maxX, b.minY], [b.maxX, b.minY, b.maxX, b.maxY],
    [b.maxX, b.maxY, b.minX, b.maxY], [b.minX, b.maxY, b.minX, b.minY]]) {
    setBar(add(bar("#ffffff", 0.8)), ax, ay, bx, by, 0.8, 0.05);
  }

  // Fairway ribbon.
  const pos = [], idx = [];
  H.line.forEach(([x, y], i) => {
    const [px, py] = H.line[Math.max(i - 1, 0)], [qx, qy] = H.line[Math.min(i + 1, H.line.length - 1)];
    const l = dist(px, py, qx, qy) || 1, nx = -(qy - py) / l, ny = (qx - px) / l;
    pos.push(x + nx * H.hw, y + ny * H.hw, 0.1, x - nx * H.hw, y - ny * H.hw, 0.1);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k, k - 1, k + 1); }
  });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  fg.setIndex(idx);
  const fm = mat("#5fae4e"); fm.side = THREE.DoubleSide;
  add(new THREE.Mesh(fg, fm));
  add(disc("#5fae4e", 0, 0, 0.1, Math.max(9, H.hw)));
  const tee = bar("#7cc765"); tee.position.set(0, 0, 0.15); tee.scale.set(9, 5, 1); add(tee);

  for (const e of H.bunkers) add(disc("#e8d79a", e.x, e.y, 0.2, e.rx, e.ry, e.rot));
  add(disc("#8fd46a", H.green.x, H.green.y, 0.3, H.green.r));
  for (const e of H.ponds) {
    add(disc("#2f77b8", e.x, e.y, 0.35, e.rx, e.ry, e.rot));
    add(disc("#4a9be0", e.x, e.y, 0.36, e.rx - 1.2, e.ry - 1.2, e.rot));
  }
  add(disc("#0c1a0c", H.cup.x, H.cup.y, 0.4, 0.9));
  setBar(add(bar("#f4f4f4")), H.cup.x, H.cup.y, H.cup.x, H.cup.y + 5, 0.3, 6);
  const flag = bar("#ff4136"); flag.position.set(H.cup.x + 1.4, H.cup.y + 4.2, 6); flag.scale.set(2.8, 1.7, 1); add(flag);

  for (const o of H.obstacles) {
    if (o.kind === "tree") {
      add(disc("#1f4d24", o.x, o.y, 2, o.r));
      add(disc("#2f6b33", o.x - o.r * 0.15, o.y + o.r * 0.15, 2.1, o.r * 0.68));
    } else {
      add(disc("#5b5f66", o.x, o.y, 2, o.r));
      add(disc("#8a9099", o.x - 0.3, o.y + 0.3, 2.1, o.r * 0.6));
    }
  }
  scene.add(course);
}

// Moving things.
const ballShadow = disc("#000000", 0, 0, 3, 0.6, 0.6, 0, 0.3);
const ballRim = disc("#1a1a1a", 0, 0, 7, 0.8);
const ballMesh = disc("#ffffff", 0, 0, 7.1, 0.6);
const golferMesh = new THREE.Group();
golferMesh.add(disc("#1a1a1a", 0, 0, 0, 1.35), disc("#ffd23f", 0, 0, 0.1, 1.1), disc("#c23b22", 0.2, 0, 0.2, 0.55));
golferMesh.position.z = 4;
const cartMesh = new THREE.Group();
{
  const part = (c, x, y, w, h, z) => { const m = bar(c); m.position.set(x, y, z); m.scale.set(w, h, 1); cartMesh.add(m); };
  for (const [x, y] of [[-1.5, 1.5], [1.5, 1.5], [-1.5, -1.5], [1.5, -1.5]]) part("#111111", x, y, 1.3, 0.7, 0);
  part("#1a1a1a", 0, 0, 4.9, 3.1, 0.1);
  part("#f5f5f0", 0, 0, 4.5, 2.7, 0.2);
  part("#2b6cb0", -0.4, 0, 2.6, 2.3, 0.3);
  part("#ffe14d", 2.0, 0, 0.4, 1.6, 0.3);
  cartMesh.position.z = 4;
}
const aimBar = bar("#ffffff", 0.85), aimCarry = disc("#ffe14d", 0, 0, 5.2, 1.1), aimEnd = disc("#ffffff", 0, 0, 5.1, 1.6, 1.6, 0, 0.5);
scene.add(ballShadow, ballRim, ballMesh, golferMesh, cartMesh, aimBar, aimCarry, aimEnd);

// ───────────────────────── Game state ─────────────────────────
let H = null;
const G = {
  mode: "title", // title | aim | flight | drive | done
  date: nyDate(), seed: null, practice: false,
  ball: { x: 0, y: 0, vx: 0, vy: 0, h: 0, air: false, t: 0, T: 1, apex: 0, rollD: 0 },
  last: { x: 0, y: 0 }, golfer: { x: 0, y: 0 }, cart: { x: 0, y: 0, a: Math.PI / 2, v: 0 },
  strokes: 0, penalties: 0, start: 0, time: 0,
  aim: null,  // { sx, sy, dx, dy, p } while dragging a swing
  stick: null, // { sx, sy, x, y } while dragging the cart joystick
  keys: {},
};

function loadHole(seed) {
  G.seed = seed;
  H = generateHole(seed);
  buildCourse(H);
  Object.assign(G.ball, { x: 0, y: 0, vx: 0, vy: 0, h: 0, air: false });
  G.last = { x: 0, y: 0 }; G.golfer = { x: 0, y: 0 };
  Object.assign(G.cart, { x: -7, y: -4, a: Math.PI / 2, v: 0 });
  G.strokes = 0; G.penalties = 0; G.aim = null; G.stick = null;
  cam.rot = aimAngle(); cam.x = 0; cam.y = 40;
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
  G.mode = "aim"; G.aim = null; G.stick = null;
  G.golfer = { x: G.ball.x, y: G.ball.y };
  setHint(onGreen() ? "Putt: drag back and let go" : "Drag back and let go to swing");
}
function enterDrive() {
  G.mode = "drive"; G.stick = null;
  setHint("Hold and drag to drive to your ball");
}

function shotPlan(p) { // how far a swing of power p (0..1) goes from the current lie
  const lie = terrainAt(H, G.ball.x, G.ball.y), curve = Math.pow(p, 1.3);
  if (lie === "green") return { putt: true, D: TUNE.maxPutt * curve };
  return { putt: false, D: TUNE.maxDrive * (TUNE.lie[lie] ?? 1) * curve };
}
function shoot(dx, dy, p) {
  const b = G.ball, plan = shotPlan(p);
  G.last = { x: b.x, y: b.y };
  G.strokes++;
  if (plan.putt) {
    const v = Math.sqrt(2 * TUNE.friction.green * plan.D);
    b.vx = dx * v; b.vy = dy * v; b.air = false;
  } else {
    b.T = 0.7 + 1.5 * p; b.t = 0; b.air = true;
    const v = (plan.D * TUNE.carry) / b.T;
    b.vx = dx * v; b.vy = dy * v;
    b.apex = 3 + 9 * p; b.rollD = plan.D * (1 - TUNE.carry);
  }
  G.mode = "flight"; setHint("");
}
function penalty(msg) {
  G.penalties += TUNE.penalty;
  toast(`${msg} +${TUNE.penalty}s`);
  Object.assign(G.ball, { x: G.last.x, y: G.last.y, vx: 0, vy: 0, h: 0, air: false });
  enterAim();
}
function ballStopped() {
  const b = G.ball; b.vx = b.vy = 0;
  cam.rotTarget = aimAngle();
  const cartClose = dist(b.x, b.y, G.cart.x, G.cart.y) < TUNE.arrive + 3;
  if (dist(b.x, b.y, G.golfer.x, G.golfer.y) < TUNE.walk || cartClose || (onGreen() && dist(G.golfer.x, G.golfer.y, H.green.x, H.green.y) < H.green.r + 10)) enterAim();
  else enterDrive();
}

function stepBall(dt) {
  const b = G.ball;
  if (b.air) {
    b.t += dt;
    b.vx += Math.cos(H.wind.angle) * H.wind.mph * TUNE.windPush * dt;
    b.vy += Math.sin(H.wind.angle) * H.wind.mph * TUNE.windPush * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.h = Math.sin(Math.PI * Math.min(1, b.t / b.T)) * b.apex;
    if (b.t >= b.T) {
      b.air = false; b.h = 0;
      const lie = terrainAt(H, b.x, b.y);
      if (lie === "water") return penalty("Splash!");
      if (lie === "ob") return penalty("Out of bounds!");
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const v = Math.sqrt(2 * TUNE.friction.fairway * b.rollD) * (lie === "sand" ? 0.3 : 1);
      b.vx = (b.vx / sp) * v; b.vy = (b.vy / sp) * v;
    }
    return;
  }
  const N = 4, h = dt / N;
  for (let i = 0; i < N; i++) {
    const lie = terrainAt(H, b.x, b.y);
    if (lie === "water") return penalty("Splash!");
    if (lie === "ob") return penalty("Out of bounds!");
    let sp = Math.hypot(b.vx, b.vy);
    if (dist(b.x, b.y, H.cup.x, H.cup.y) < TUNE.cupRadius && sp < TUNE.cupSpeed) return finish();
    const ns = sp - TUNE.friction[lie] * h;
    if (ns <= 0) return ballStopped();
    b.vx *= ns / sp; b.vy *= ns / sp;
    b.x += b.vx * h; b.y += b.vy * h;
    for (const o of H.obstacles) {
      const d = dist(b.x, b.y, o.x, o.y), min = o.r + 0.5;
      if (d < min && d > 0) {
        const nx = (b.x - o.x) / d, ny = (b.y - o.y) / d, dot = b.vx * nx + b.vy * ny;
        b.x = o.x + nx * min; b.y = o.y + ny * min;
        if (dot < 0) { b.vx = (b.vx - 2 * dot * nx) * 0.35; b.vy = (b.vy - 2 * dot * ny) * 0.35; }
      }
    }
  }
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
  const maxV = TUNE.cartSpeed * (lie === "sand" ? 0.45 : lie === "rough" ? 0.8 : 1);
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
  for (const o of H.obstacles) if (pushFrom(o.x, o.y, o.r + R)) c.v = Math.min(c.v, 10);
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
  Object.assign(G.ball, { x: H.cup.x, y: H.cup.y, vx: 0, vy: 0 });
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
    G.aim.p = Math.min(1, len / maxPull());
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
function toScreen(x, y) {
  const rx = x - cam.x, ry = y - cam.y, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
  return { x: W / 2 + (rx * c + ry * s) / cam.upp, y: Hpx / 2 - (-rx * s + ry * c) / cam.upp };
}
function updateCamera(dt) {
  const b = G.ball, ux = -Math.sin(cam.rot), uy = Math.cos(cam.rot); // world "up the screen"
  let tx = b.x, ty = b.y, upp = cam.upp;
  if (G.mode === "aim" || G.mode === "title") {
    if (onGreen()) {
      upp = Math.max(75 / Hpx, 46 / W);
      tx = (b.x + H.cup.x) / 2; ty = (b.y + H.cup.y) / 2;
    } else {
      upp = Math.max(200 / Hpx, 100 / W);
      const ahead = Math.min(70, dist(b.x, b.y, H.cup.x, H.cup.y) * 0.5);
      tx = b.x + ux * ahead; ty = b.y + uy * ahead;
    }
    cam.rotTarget = G.aim ? cam.rotTarget : aimAngle();
  } else if (G.mode === "drive") {
    upp = Math.max(130 / Hpx, 80 / W);
    const c = G.cart, d = dist(c.x, c.y, b.x, b.y) || 1, look = Math.min(18, d * 0.4);
    tx = c.x + ((b.x - c.x) / d) * look; ty = c.y + ((b.y - c.y) / d) * look;
  } else if (G.mode === "done") {
    upp = Math.max(60 / Hpx, 40 / W); tx = H.cup.x; ty = H.cup.y;
  }
  const k = 1 - Math.exp(-dt * 5);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.upp += (upp - cam.upp) * k;
  if (cam.rotTarget != null) {
    const d = Math.atan2(Math.sin(cam.rotTarget - cam.rot), Math.cos(cam.rotTarget - cam.rot));
    cam.rot += d * (1 - Math.exp(-dt * 4));
  }
  camera.left = (-W / 2) * cam.upp; camera.right = (W / 2) * cam.upp;
  camera.top = (Hpx / 2) * cam.upp; camera.bottom = (-Hpx / 2) * cam.upp;
  camera.position.x = cam.x; camera.position.y = cam.y; camera.rotation.z = cam.rot;
  camera.updateProjectionMatrix();
}

function draw() {
  const b = G.ball, lift = 1 + b.h * 0.06;
  ballMesh.position.set(b.x, b.y + b.h * 0.5, 7.1); ballMesh.scale.set(0.6 * lift, 0.6 * lift, 1);
  ballRim.position.set(b.x, b.y + b.h * 0.5, 7); ballRim.scale.set(0.8 * lift, 0.8 * lift, 1);
  ballShadow.position.set(b.x, b.y, 3); ballShadow.visible = b.h > 0.2;
  ballMesh.visible = ballRim.visible = G.mode !== "done";

  const rx = Math.cos(cam.rot), ry = Math.sin(cam.rot);
  golferMesh.visible = G.mode === "aim" || G.mode === "flight" || G.mode === "title";
  golferMesh.position.set(G.golfer.x - rx * 2, G.golfer.y - ry * 2, 4);
  cartMesh.position.set(G.cart.x, G.cart.y, 4); cartMesh.rotation.z = G.cart.a;

  const aiming = G.mode === "aim" && G.aim && G.aim.p >= 0.06;
  aimBar.visible = aimEnd.visible = !!aiming; aimCarry.visible = false;
  $("power").style.display = G.mode === "aim" && G.aim ? "block" : "none";
  if (G.mode === "aim" && G.aim) $("power").firstElementChild.style.width = G.aim.p * 100 + "%";
  if (aiming) {
    const plan = shotPlan(G.aim.p), ex = b.x + G.aim.dx * plan.D, ey = b.y + G.aim.dy * plan.D;
    const thick = Math.max(0.35, cam.upp * 3);
    setBar(aimBar, b.x, b.y, ex, ey, thick, 5);
    aimEnd.position.set(ex, ey, 5.1); aimEnd.scale.setScalar(Math.max(1.2, cam.upp * 7));
    if (!plan.putt) {
      aimCarry.visible = true;
      aimCarry.position.set(b.x + G.aim.dx * plan.D * TUNE.carry, b.y + G.aim.dy * plan.D * TUNE.carry, 5.2);
      aimCarry.scale.setScalar(Math.max(0.9, cam.upp * 5));
    }
  }

  // HUD
  const running = G.mode === "aim" || G.mode === "flight" || G.mode === "drive";
  if (running) $("time").textContent = fmt((Date.now() - G.start) / 1000);
  $("pen").textContent = G.penalties ? `+${G.penalties}` : "";
  $("strokes").textContent = G.strokes;
  $("pin").textContent = Math.round(dist(b.x, b.y, H.cup.x, H.cup.y));
  $("windArrow").style.transform = `rotate(${(-(H.wind.angle - cam.rot) * 180) / Math.PI}deg)`;

  const m = $("marker");
  if (G.mode === "drive") {
    const p = toScreen(b.x, b.y), pad = 34;
    m.style.display = "block";
    m.style.left = Math.max(pad, Math.min(W - pad, p.x)) + "px";
    m.style.top = Math.max(pad + 60, Math.min(Hpx - pad - 50, p.y)) + "px";
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
  draw();
  requestAnimationFrame(frame);
}

showTitle();
cam.upp = Math.max(200 / Hpx, 100 / W);
requestAnimationFrame(frame);

// For testing and tuning from the browser console.
window.__dp = { G, TUNE, cam, generateHole, terrainAt, hole: () => H, shoot, toScreen };
