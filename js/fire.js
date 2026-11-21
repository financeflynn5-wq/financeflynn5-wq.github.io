// ─────────────────────────────────────────────────────────────
//  Fire around a game card's border while you hover it.
//  One full-screen canvas draws flames along the hovered card's edges.
// ─────────────────────────────────────────────────────────────
(function () {
  if (!matchMedia("(hover: hover)").matches) return;               // phones and tablets: no hover
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const cvs = document.createElement("canvas");
  cvs.id = "fire-fx";
  document.body.appendChild(cvs);
  const ctx = cvs.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  function resize() {
    W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, 2);
    cvs.width = W * DPR; cvs.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  function sprite(stops) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  // Hot core → orange → red → smoke, as a flame cools
  const SPR = [
    sprite([[0, "rgba(255,255,230,1)"], [0.3, "rgba(255,220,120,0.8)"], [1, "rgba(255,160,40,0)"]]),
    sprite([[0, "rgba(255,200,90,0.95)"], [0.35, "rgba(255,120,30,0.6)"], [1, "rgba(255,60,0,0)"]]),
    sprite([[0, "rgba(255,90,30,0.8)"], [0.4, "rgba(200,30,10,0.4)"], [1, "rgba(120,0,0,0)"]]),
  ];

  let active = null;
  const parts = [];
  let running = false, last = 0, spawnAcc = 0;

  function setActive(el) {
    if (active === el) return;
    active?.classList.remove("is-burning");
    active = el;
    if (el) { el.classList.add("is-burning"); wake(); }
  }
  document.addEventListener("pointerover", (e) => {
    const card = e.target.closest?.(".card, .fire-hover");
    if (card) setActive(card);
  });
  document.addEventListener("pointerout", (e) => {
    if (!active) return;
    const to = e.relatedTarget;
    if (!to || !active.contains(to)) setActive(null);
  });
  addEventListener("blur", () => setActive(null));
  window.__burn = setActive; // used by the screenshot test

  function wake() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function radiusOf(el) {
    return parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  }

  // A point on the rounded-rectangle border, plus which way is "outward"
  function edgePoint(r, rad) {
    const w = r.width, h = r.height;
    const pick = Math.random();
    // Weight the top and sides more: flames lick upward
    if (pick < 0.32) return { x: r.left + rad + Math.random() * (w - 2 * rad), y: r.top, nx: 0, ny: -1 };
    if (pick < 0.56) return { x: r.left, y: r.top + rad + Math.random() * (h - 2 * rad), nx: -1, ny: 0 };
    if (pick < 0.8) return { x: r.right, y: r.top + rad + Math.random() * (h - 2 * rad), nx: 1, ny: 0 };
    if (pick < 0.92) return { x: r.left + rad + Math.random() * (w - 2 * rad), y: r.bottom, nx: 0, ny: 1 };
    // corners
    const c = Math.floor(Math.random() * 4);
    const a = (Math.random() * Math.PI) / 2 + [Math.PI, Math.PI * 1.5, 0, Math.PI * 0.5][c];
    const cx = c === 0 || c === 3 ? r.left + rad : r.right - rad;
    const cy = c === 0 || c === 1 ? r.top + rad : r.bottom - rad;
    return { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, nx: Math.cos(a), ny: Math.sin(a) };
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (active && document.contains(active)) {
      const r = active.getBoundingClientRect();
      const rad = Math.min(radiusOf(active), r.width / 2, r.height / 2);
      const perim = 2 * (r.width + r.height);
      spawnAcc += dt * perim * 0.32;      // flames per second scale with the card's size
      while (spawnAcc >= 1) {
        spawnAcc--;
        const p = edgePoint(r, rad);
        const ember = Math.random() < 0.07;
        parts.push({
          x: p.x + p.nx * (Math.random() * 3), y: p.y + p.ny * (Math.random() * 3),
          vx: p.nx * (8 + Math.random() * 18) + (Math.random() - 0.5) * 14,
          vy: -(35 + Math.random() * 80) + p.ny * 10,
          life: 0,
          max: ember ? 1.1 + Math.random() * 0.8 : 0.35 + Math.random() * 0.45,
          size: ember ? 2 + Math.random() * 1.5 : 7 + Math.random() * 11,
          seed: Math.random() * 100,
          ember,
        });
      }
    } else if (active) {
      setActive(null);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { parts.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(now / 90 + p.seed) * 22) * dt;   // flicker
      p.y += p.vy * dt;
      p.vy -= 40 * dt;                                         // hot air rises faster
      const s = p.ember ? p.size : p.size * (1 - k * 0.65);
      ctx.globalAlpha = Math.pow(1 - k, 1.3) * (p.ember ? 1 : 0.85);
      ctx.drawImage(SPR[p.ember ? 0 : Math.min(2, Math.floor(k * 3))], p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;

    if (active || parts.length) requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }
})();
