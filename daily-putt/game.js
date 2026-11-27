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
// The game logic is flat (x, y on the ground). Drawing is 3D with z as height.
const $ = (id) => document.getElementById(id);
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#9fd8ff");
scene.fog = new THREE.Fog("#c4e8ff", 260, 950);
const sky = new THREE.HemisphereLight("#ffffff", "#5b8a52", 2.4);
sky.position.set(0, 0, 1);
const sun = new THREE.DirectionalLight("#fff4d6", 2.2);
sun.position.set(-60, -80, 150);
scene.add(sky, sun);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2500);
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

const CIRCLE = new THREE.CircleGeometry(1, 40);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CONE = new THREE.ConeGeometry(1, 1, 10);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const ROCK = new THREE.DodecahedronGeometry(1);
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
// Flat paint on the ground. It is drawn first, in "order", and never hides 3D objects.
const paint = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
// See-through marks lying on the ground (shadows, the aim line).
const decal = (c, opacity) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
function disc(material, x, y, order, rx, ry = rx, rot = 0) {
  const m = new THREE.Mesh(CIRCLE, material);
  m.position.set(x, y, 0.03); m.scale.set(rx, ry, 1); m.rotation.z = rot; m.renderOrder = order;
  return m;
}
function bar(material, order) { const m = new THREE.Mesh(PLANE, material); m.renderOrder = order; return m; }
function setBar(m, ax, ay, bx, by, width) {
  m.position.set((ax + bx) / 2, (ay + by) / 2, 0.03);
  m.rotation.z = Math.atan2(by - ay, bx - ax);
  m.scale.set(Math.max(0.001, dist(ax, ay, bx, by)), width, 1);
}
// A solid standing on the ground: w wide, h tall, with its base at height z.
function solid(geo, material, w, h, z = 0, d = w) {
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = Math.PI / 2; m.scale.set(w, h, d); m.position.z = z + h / 2;
  return m;
}

const outer = bar(paint("#3a7a3c"), -110);
outer.scale.set(6000, 6000, 1);
scene.add(outer);

let course = null; // group holding the current hole's meshes
function buildCourse(H) {
  if (course) scene.remove(course);
  course = new THREE.Group();
  const b = H.bounds, add = (m) => (course.add(m), m);

  const rough = bar(paint("#3f8a3d"), -100);
  rough.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0);
  rough.scale.set(b.maxX - b.minX, b.maxY - b.minY, 1);
  add(rough);
  // White out-of-bounds line.
  for (const [ax, ay, bx, by] of [[b.minX, b.minY, b.maxX, b.minY], [b.maxX, b.minY, b.maxX, b.maxY],
    [b.maxX, b.maxY, b.minX, b.maxY], [b.minX, b.maxY, b.minX, b.minY]]) {
    setBar(add(bar(paint("#f2f2f2"), -99)), ax, ay, bx, by, 1);
  }

  // Fairway ribbon.
  const pos = [], idx = [];
  H.line.forEach(([x, y], i) => {
    const [px, py] = H.line[Math.max(i - 1, 0)], [qx, qy] = H.line[Math.min(i + 1, H.line.length - 1)];
    const l = dist(px, py, qx, qy) || 1, nx = -(qy - py) / l, ny = (qx - px) / l;
    pos.push(x + nx * H.hw, y + ny * H.hw, 0, x - nx * H.hw, y - ny * H.hw, 0);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k, k - 1, k + 1); }
  });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  fg.setIndex(idx);
  const fairway = new THREE.Mesh(fg, paint("#62b552")); fairway.renderOrder = -98; add(fairway);
  add(disc(paint("#62b552"), 0, 0, -98, Math.max(9, H.hw)));
  const tee = bar(paint("#80cf69"), -97); tee.position.set(0, 0, 0); tee.scale.set(9, 5, 1); add(tee);

  for (const e of H.bunkers) {
    add(disc(paint("#cdbb7c"), e.x, e.y, -96, e.rx + 0.6, e.ry + 0.6, e.rot));
    add(disc(paint("#eedd9f"), e.x, e.y, -95, e.rx, e.ry, e.rot));
  }
  add(disc(paint("#93db6d"), H.green.x, H.green.y, -94, H.green.r));
  for (const e of H.ponds) {
    add(disc(paint("#2f77b8"), e.x, e.y, -93, e.rx, e.ry, e.rot));
    add(disc(paint("#56a8ec"), e.x, e.y, -92, e.rx - 1.2, e.ry - 1.2, e.rot));
  }
  add(disc(paint("#0c1a0c"), H.cup.x, H.cup.y, -91, 0.9));
  const pin = new THREE.Group();
  pin.add(solid(CYL, lam("#f4f4f4"), 0.14, 10));
  const flag = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ color: "#ff3b30", side: THREE.DoubleSide }));
  flag.rotation.x = Math.PI / 2; flag.scale.set(3.4, 2, 1); flag.position.set(1.7, 0, 9);
  pin.add(flag); pin.position.set(H.cup.x, H.cup.y, 0);
  H.pin = add(pin);

  for (const o of H.obstacles) {
    const g = new THREE.Group();
    if (o.kind === "tree") {
      const h = o.r * 3.4;
      g.add(solid(CYL, lam("#6b4a2b"), o.r * 0.22, h * 0.3));
      g.add(solid(CONE, lam("#1f6a2c"), o.r, h * 0.62, h * 0.22));
      g.add(solid(CONE, lam("#2f8a3b"), o.r * 0.72, h * 0.48, h * 0.56));
    } else {
      const rock = new THREE.Mesh(ROCK, lam("#8a9099"));
      rock.scale.set(o.r, o.r, o.r * 0.75); rock.position.z = o.r * 0.35; rock.rotation.z = o.x;
      g.add(rock);
    }
    g.position.set(o.x, o.y, 0);
    o.mesh = add(g);
    add(disc(decal("#000000", 0.22), o.x + o.r * 0.25, o.y + o.r * 0.25, -50, o.r * 1.05));
  }
  scene.add(course);
}

// Moving things.
const ballShadow = disc(decal("#000000", 0.35), 0, 0, -40, 0.7);
const ballMesh = new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ color: "#ffffff" }));
ballMesh.scale.setScalar(0.6);
const beacon = solid(CYL, new THREE.MeshBasicMaterial({ color: "#ffe14d", transparent: true, opacity: 0.45, depthWrite: false }), 0.6, 40);
function makeGolfer() {
  const g = new THREE.Group();
  g.add(solid(BOX, lam("#2b3a55"), 0.9, 1.3, 0, 0.6));
  g.add(solid(CYL, lam("#ffd23f"), 0.55, 1.5, 1.3));
  const head = new THREE.Mesh(SPHERE, lam("#f0c8a0")); head.scale.setScalar(0.45); head.position.z = 3.2; g.add(head);
  g.add(solid(CYL, lam("#c23b22"), 0.5, 0.25, 3.45));
  return g;
}
const golferMesh = makeGolfer();
const cartMesh = new THREE.Group(); // built facing +x
{
  const white = lam("#f5f5f0"), dark = lam("#1a1a1a");
  const box = (m, x, y, z, sx, sy, sz) => { const b = new THREE.Mesh(BOX, m); b.position.set(x, y, z); b.scale.set(sx, sy, sz); cartMesh.add(b); };
  box(white, 0, 0, 1.0, 4.8, 2.6, 0.9);          // body
  box(white, 1.9, 0, 1.6, 1.0, 2.4, 0.5);        // nose
  box(lam("#2b6cb0"), -0.5, 0, 1.75, 1.3, 2.3, 0.6); // seat
  box(lam("#2b6cb0"), -1.2, 0, 2.3, 0.3, 2.3, 1.2);  // seat back
  box(white, -0.3, 0, 4.1, 3.6, 2.7, 0.2);       // roof
  for (const [x, y] of [[1.3, 1.2], [1.3, -1.2], [-1.9, 1.2], [-1.9, -1.2]]) box(dark, x, y, 2.75, 0.14, 0.14, 2.6);
  box(lam("#ffe14d"), 2.42, 0, 1.3, 0.1, 1.6, 0.3); // headlights
  for (const [x, y] of [[1.5, 1.35], [1.5, -1.35], [-1.5, 1.35], [-1.5, -1.35]]) {
    const w = new THREE.Mesh(CYL, dark); w.scale.set(0.65, 0.5, 0.65); w.position.set(x, y, 0.65); cartMesh.add(w);
  }
  cartMesh.add(disc(decal("#000000", 0.3), 0, 0, -45, 3, 1.9));
}
const driver = makeGolfer(); driver.scale.setScalar(0.85); driver.position.set(-0.5, 0.5, 1.2); cartMesh.add(driver);
const aimBar = bar(decal("#ffffff", 0.9), -30), aimCarry = disc(decal("#ffe14d", 1), 0, 0, -28, 1.3), aimEnd = disc(decal("#ffffff", 0.55), 0, 0, -29, 2.2);
scene.add(ballShadow, ballMesh, beacon, golferMesh, cartMesh, aimBar, aimCarry, aimEnd);

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
    b.apex = 4 + 22 * p; b.rollD = plan.D * (1 - TUNE.carry);
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
// Third person: behind the golfer for swings, behind the cart when driving.
function updateCamera(dt) {
  const b = G.ball;
  let fx = b.x, fy = b.y, lookZ = 0, turn = 4;
  if (G.mode === "aim" || G.mode === "title") {
    if (onGreen()) {
      const d = dist(b.x, b.y, H.cup.x, H.cup.y);
      cam.back = 9 + d * 0.3; cam.height = 5 + d * 0.2; cam.ahead = d * 0.6;
    } else { cam.back = 26; cam.height = 17; cam.ahead = 36; }
    if (!G.aim) cam.rotTarget = aimAngle();
  } else if (G.mode === "flight") {
    if (b.air) { cam.back = 26; cam.height = 17 + b.h * 0.4; cam.ahead = 24; lookZ = b.h * 0.8; }
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
  const ux = -Math.sin(cam.rot), uy = Math.cos(cam.rot);
  const gx = fx - ux * cam.back, gy = fy - uy * cam.back;
  const k = cam.snap ? 1 : 1 - Math.exp(-dt * 5);
  cam.pos.x += (gx - cam.pos.x) * k; cam.pos.y += (gy - cam.pos.y) * k; cam.pos.z += (cam.height - cam.pos.z) * k;
  cam.look.x += (fx + ux * cam.ahead - cam.look.x) * k; cam.look.y += (fy + uy * cam.ahead - cam.look.y) * k;
  cam.look.z += (lookZ - cam.look.z) * k;
  cam.fx = fx; cam.fy = fy; cam.snap = false;
  camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.updateMatrixWorld();
}

const tmp = new THREE.Vector3();
function draw() {
  const b = G.ball;
  ballMesh.position.set(b.x, b.y, 0.6 + b.h);
  ballShadow.position.set(b.x, b.y, 0.03);
  ballMesh.visible = ballShadow.visible = G.mode !== "done";
  beacon.visible = G.mode === "drive"; beacon.position.x = b.x; beacon.position.y = b.y;
  if (H.pin) H.pin.visible = !(onGreen() && dist(b.x, b.y, H.cup.x, H.cup.y) < 6 && G.mode !== "done");

  const rx = Math.cos(cam.rot), ry = Math.sin(cam.rot);
  golferMesh.visible = G.mode === "aim" || G.mode === "flight" || G.mode === "title";
  golferMesh.position.set(G.golfer.x - rx * 1.6, G.golfer.y - ry * 1.6, 0);
  golferMesh.rotation.z = cam.rot;
  driver.visible = G.mode === "drive";
  cartMesh.position.set(G.cart.x, G.cart.y, 0); cartMesh.rotation.z = G.cart.a;

  // Hide trees standing between the camera and what it follows.
  for (const o of H.obstacles) {
    if (o.kind !== "tree") continue;
    const vx = cam.fx - cam.pos.x, vy = cam.fy - cam.pos.y;
    const t = Math.max(0, Math.min(1, ((o.x - cam.pos.x) * vx + (o.y - cam.pos.y) * vy) / (vx * vx + vy * vy || 1)));
    o.mesh.visible = dist(o.x, o.y, cam.pos.x + vx * t, cam.pos.y + vy * t) > o.r + 1.5;
  }

  const aiming = G.mode === "aim" && G.aim && G.aim.p >= 0.06;
  aimBar.visible = aimEnd.visible = !!aiming; aimCarry.visible = false;
  $("power").style.display = G.mode === "aim" && G.aim ? "block" : "none";
  if (G.mode === "aim" && G.aim) $("power").firstElementChild.style.width = G.aim.p * 100 + "%";
  if (aiming) {
    const plan = shotPlan(G.aim.p), ex = b.x + G.aim.dx * plan.D, ey = b.y + G.aim.dy * plan.D;
    setBar(aimBar, b.x, b.y, ex, ey, plan.putt ? 0.25 : 0.7);
    aimEnd.position.set(ex, ey, 0.03); aimEnd.scale.setScalar(plan.putt ? 0.8 : 2.2);
    if (!plan.putt) {
      aimCarry.visible = true;
      aimCarry.position.set(b.x + G.aim.dx * plan.D * TUNE.carry, b.y + G.aim.dy * plan.D * TUNE.carry, 0.03);
    }
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
    tmp.set(b.x, b.y, 1).applyMatrix4(camera.matrixWorldInverse);
    let sx, sy;
    if (tmp.z < -0.1) {
      tmp.set(b.x, b.y, 1).project(camera);
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
  draw();
  requestAnimationFrame(frame);
}

showTitle();
requestAnimationFrame(frame);

// For testing and tuning from the browser console.
window.__dp = { G, TUNE, cam, generateHole, terrainAt, hole: () => H, shoot };
