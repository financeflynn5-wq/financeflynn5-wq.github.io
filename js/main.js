(function () {
  const SITE = window.SITE;
  const GAMES = window.GAMES;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const LINK_LABELS = { youtube: "YouTube", twitch: "Twitch", itch: "itch.io", discord: "Discord" };
  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.8 3.1z"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  };
  const isPlayable = (g) => g.status === "playable" && g.play;
  const pageLink = (g) => `game.html?id=${encodeURIComponent(g.id)}`;

  function socialLinks(cls) {
    return Object.entries(SITE.links || {})
      .filter(([, url]) => url)
      .map(([k, url]) => `<a class="${cls} ${k === "youtube" ? "yt" : ""}" href="${esc(url)}" target="_blank" rel="noopener">${LINK_LABELS[k] || k}</a>`)
      .join("");
  }

  function cover(g, { badge = true, overlay = true } = {}) {
    const style = `--c1:${esc(g.colors?.[0])};--c2:${esc(g.colors?.[1])}`;
    const art = g.image
      ? `<img src="${esc(g.image)}" alt="" loading="lazy">`
      : `<div class="title-art">${esc(g.short || g.title)}</div>`;
    const b = !badge ? "" : isPlayable(g) ? '<span class="badge live">Play now</span>' : '<span class="badge dev">In development</span>';
    const o = !overlay ? "" : isPlayable(g) ? `<span class="bubble">${ICON.play}</span>` : '<span class="soon">Coming soon</span>';
    return `<div class="cover" style="${style}">${art}${b}${o}</div>`;
  }

  function card(g) {
    return `
      <a class="card reveal" href="${pageLink(g)}" data-id="${esc(g.id)}">
        ${cover(g)}
        <div class="body">
          <h3>${esc(g.title)}</h3>
          <p>${esc(g.tagline)}</p>
          <div class="meta">
            <span class="tag">${esc(g.genre)}</span><span class="tag">${esc(g.engine)}</span>
            <span class="go">${isPlayable(g) ? "Play →" : "Details →"}</span>
          </div>
        </div>
      </a>`;
  }

  function header() {
    const el = document.getElementById("topbar");
    if (!el) return;
    const [first, ...rest] = SITE.name.split(" ");
    el.innerHTML = `
      <div class="wrap">
        <a class="brand" href="./"><span class="logo" aria-hidden="true"></span><span>${esc(first)}</span>${rest.length ? " " + esc(rest.join(" ")) : ""}</a>
        <nav class="nav-links">
          <a href="./#games" class="hide-sm">Games</a>
          ${socialLinks("")}
        </nav>
      </div>`;
  }

  function footer() {
    const el = document.getElementById("footer");
    if (!el) return;
    el.innerHTML = `
      <div class="wrap">
        <span>© ${new Date().getFullYear()} ${esc(SITE.name)} · Made live on stream</span>
        <span class="nav-links">${socialLinks("")}</span>
      </div>`;
  }

  // Fade things in as they scroll into view
  function reveal() {
    const els = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en, i) => {
        if (!en.isIntersecting) return;
        setTimeout(() => en.target.classList.add("in"), Math.min(i, 6) * 60);
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
    // Safety net: never leave anything invisible
    setTimeout(() => document.querySelectorAll(".reveal:not(.in)").forEach((e) => e.classList.add("in")), 1500);
  }

  function home() {
    document.getElementById("site-tagline").textContent = SITE.tagline;
    if (SITE.links?.youtube) {
      document.getElementById("hero-links").insertAdjacentHTML(
        "beforeend",
        `<a class="btn yt" href="${esc(SITE.links.youtube)}" target="_blank" rel="noopener">${ICON.youtube} Watch on YouTube</a>`
      );
    }

    const playable = GAMES.filter(isPlayable);
    const dev = GAMES.filter((g) => !isPlayable(g));
    const engines = new Set(GAMES.map((g) => g.engine));
    document.getElementById("stats").innerHTML = `
      <div class="stat"><b>${playable.length}</b>playable now</div>
      <div class="stat"><b>${dev.length}</b>in development</div>
      <div class="stat"><b>${engines.size}</b>engines</div>`;

    const f = GAMES.find((g) => g.id === SITE.featured) || playable[0];
    if (f) {
      document.getElementById("featured").innerHTML = `
        <a class="featured fire-hover" href="${pageLink(f)}">
          ${cover(f, { badge: false, overlay: false })}
          <div class="info">
            <div class="label">★ Featured</div>
            <h2>${esc(f.title)}</h2>
            <p>${esc(f.tagline)}</p>
            <span class="btn ${isPlayable(f) ? "play" : ""}">${ICON.play} ${isPlayable(f) ? "Play " + esc(f.short || f.title) : "See the game"}</span>
          </div>
        </a>`;
    }

    // Filters + search
    let filter = "all";
    const chips = [
      ["all", "All games", GAMES.length],
      ["play", "Play now", playable.length],
      ["dev", "In development", dev.length],
    ];
    const chipBox = document.getElementById("chips");
    chipBox.innerHTML = chips
      .map(([k, label, n]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filter}">${label}<span class="n">${n}</span></button>`)
      .join("");
    const search = document.getElementById("search");

    function render() {
      const q = search.value.trim().toLowerCase();
      const match = (g) => !q || [g.title, g.short, g.genre, g.engine, g.tagline].join(" ").toLowerCase().includes(q);
      const p = playable.filter(match), d = dev.filter(match);
      const showP = filter !== "dev", showD = filter !== "play";
      document.getElementById("play").hidden = !showP || !p.length;
      document.getElementById("dev").hidden = !showD || !d.length;
      document.getElementById("play-grid").innerHTML = p.map(card).join("");
      document.getElementById("dev-grid").innerHTML = d.map(card).join("");
      document.getElementById("play-count").textContent = `${p.length} game${p.length === 1 ? "" : "s"}`;
      document.getElementById("dev-count").textContent = `${d.length} in the works`;
      document.getElementById("no-results").hidden = (showP && p.length) || (showD && d.length);
      reveal();
    }
    chipBox.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      filter = b.dataset.f;
      chipBox.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
      render();
    });
    search.addEventListener("input", render);
    render();

    if (SITE.links?.youtube) {
      document.getElementById("live-band").innerHTML = `
        <div class="live-band reveal">
          <div>
            <h2>Watch them get built live</h2>
            <p>Every game here is made on stream, from the first line of code to the boss fights. Come hang out, suggest features and play the builds as they happen.</p>
          </div>
          <a class="btn yt" href="${esc(SITE.links.youtube)}" target="_blank" rel="noopener">${ICON.youtube} Subscribe on YouTube</a>
        </div>`;
    }
    reveal();
  }

  function gamePage() {
    const id = new URLSearchParams(location.search).get("id");
    const g = GAMES.find((x) => x.id === id);
    const main = document.getElementById("game");
    if (!g) {
      main.innerHTML = `<div class="game-head"><a class="back" href="./">← All games</a><h1>Game not found</h1></div>`;
      return;
    }
    document.title = `${g.title} · ${SITE.name}`;

    const playable = isPlayable(g);
    let player;
    if (playable && g.embed) {
      player = `
        <div class="player fire-hover" id="player">
          ${cover(g, { badge: false, overlay: false })}
          <div class="start">
            <button class="btn fire" id="start">${ICON.play} Play ${esc(g.short || g.title)}</button>
            <small>Runs in your browser. Best with a keyboard and mouse.</small>
          </div>
        </div>
        <div class="player-bar">
          <button class="btn" id="fullscreen" hidden>${ICON.expand} Fullscreen</button>
          <a class="btn" href="${esc(g.play)}" target="_blank" rel="noopener">${ICON.external} Open in a new tab</a>
          ${g.itch ? `<a class="btn" href="${esc(g.itch)}" target="_blank" rel="noopener">itch.io page</a>` : ""}
        </div>`;
    } else if (playable) {
      player = `
        <div class="player fire-hover">${cover(g, { badge: false, overlay: false })}
          <div class="start"><a class="btn fire" href="${esc(g.play)}" target="_blank" rel="noopener">${ICON.play} Play ${esc(g.short || g.title)}</a></div>
        </div>`;
    } else {
      player = `<div class="player">${cover(g, { badge: true, overlay: false })}</div>`;
    }

    const facts = [
      ["Status", playable ? "Playable now" : "In development"],
      ["Genre", g.genre],
      ["Made with", g.engine],
      g.controls ? ["Controls", g.controls] : null,
    ].filter(Boolean);

    const others = GAMES.filter((x) => x.id !== g.id).sort((a, b) => isPlayable(b) - isPlayable(a)).slice(0, 3);

    main.innerHTML = `
      <div class="game-head">
        <a class="back" href="./">← All games</a>
        <h1>${esc(g.title)}</h1>
        <p class="tagline">${esc(g.tagline)}</p>
        <div class="meta"><span class="tag">${esc(g.genre)}</span><span class="tag">${esc(g.engine)}</span></div>
      </div>
      ${player}
      <div class="game-body">
        <div class="panel">
          <h2>About</h2>
          ${(g.description || []).map((p) => `<p>${esc(p)}</p>`).join("")}
          ${playable ? "" : `<p class="note">This one is still being built, mostly live on stream. ${SITE.links?.youtube ? `<a href="${esc(SITE.links.youtube)}" target="_blank" rel="noopener">Follow along on YouTube</a>.` : "Check back soon."}</p>`}
        </div>
        <aside class="panel facts"><h2>Details</h2><dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></aside>
      </div>
      <section class="more">
        <div class="section-head"><h2>More games</h2></div>
        <div class="grid small">${others.map(card).join("")}</div>
      </section>`;

    const start = document.getElementById("start");
    if (start) {
      start.addEventListener("click", () => {
        const box = document.getElementById("player");
        box.classList.remove("fire-hover");
        box.innerHTML = `<iframe src="${esc(g.play)}" title="${esc(g.title)}" allow="fullscreen; autoplay; gamepad; pointer-lock" allowfullscreen></iframe>`;
        box.querySelector("iframe").focus();
        const fs = document.getElementById("fullscreen");
        fs.hidden = false;
        fs.addEventListener("click", () => (box.requestFullscreen || box.webkitRequestFullscreen)?.call(box));
      });
    }
    reveal();
  }

  header();
  footer();
  if (document.body.dataset.page === "home") home();
  if (document.body.dataset.page === "game") gamePage();
})();
