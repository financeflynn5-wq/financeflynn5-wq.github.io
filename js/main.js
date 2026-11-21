(function () {
  const SITE = window.SITE;
  const GAMES = window.GAMES;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const LINK_LABELS = { youtube: "YouTube", twitch: "Twitch", itch: "itch.io", discord: "Discord" };
  const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function socialLinks(cls) {
    return Object.entries(SITE.links || {})
      .filter(([, url]) => url)
      .map(([k, url]) => `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener">${LINK_LABELS[k] || k}</a>`)
      .join("");
  }

  function cover(g, withBadge) {
    const style = `--c1:${esc(g.colors?.[0])};--c2:${esc(g.colors?.[1])}`;
    const art = g.image
      ? `<img src="${esc(g.image)}" alt="" loading="lazy">`
      : `<div class="title-art">${esc(g.short || g.title)}</div>`;
    const badge = !withBadge
      ? ""
      : g.status === "playable"
        ? '<span class="badge live">Play now</span>'
        : '<span class="badge dev">In development</span>';
    return `<div class="cover" style="${style}">${art}${badge}</div>`;
  }

  function card(g) {
    return `
      <a class="card" href="game.html?id=${encodeURIComponent(g.id)}">
        ${cover(g, true)}
        <div class="body">
          <h3>${esc(g.title)}</h3>
          <p>${esc(g.tagline)}</p>
          <div class="meta"><span class="tag">${esc(g.genre)}</span><span class="tag">${esc(g.engine)}</span></div>
        </div>
      </a>`;
  }

  function header() {
    const el = document.getElementById("topbar");
    if (!el) return;
    el.innerHTML = `
      <div class="wrap">
        <a class="brand" href="./">${esc(SITE.name).replace(/^(.*?)('s)?(\s)/, "<span>$1$2</span>$3")}</a>
        <nav class="nav-links">
          <a href="./#play">Play</a>
          <a href="./#dev" class="hide-sm">In development</a>
          ${socialLinks("hide-sm")}
        </nav>
      </div>`;
  }

  function footer() {
    const el = document.getElementById("footer");
    if (!el) return;
    el.innerHTML = `
      <div class="wrap">
        <span>© ${new Date().getFullYear()} ${esc(SITE.name)}</span>
        <span class="nav-links">${socialLinks("")}</span>
      </div>`;
  }

  function home() {
    document.getElementById("site-tagline").textContent = SITE.tagline;
    const social = socialLinks("btn");
    document.getElementById("hero-links").insertAdjacentHTML("beforeend", social);

    const playable = GAMES.filter((g) => g.status === "playable");
    const dev = GAMES.filter((g) => g.status !== "playable");
    document.getElementById("play-grid").innerHTML = playable.map(card).join("") || '<p class="empty">Nothing playable yet. Soon!</p>';
    document.getElementById("dev-grid").innerHTML = dev.map(card).join("");
    document.getElementById("play-count").textContent = `${playable.length} game${playable.length === 1 ? "" : "s"}`;
    document.getElementById("dev-count").textContent = `${dev.length} in the works`;
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

    const playable = g.status === "playable" && g.play;
    let player = "";
    if (playable && g.embed) {
      player = `
        <div class="player" id="player">
          ${cover(g, false)}
          <div class="start">
            <button class="btn play" id="start">${playIcon} Play ${esc(g.short || g.title)}</button>
            <small>Runs in your browser. Best with a keyboard and mouse.</small>
          </div>
        </div>
        <div class="player-bar">
          <button class="btn" id="fullscreen" hidden>Fullscreen</button>
          <a class="btn" href="${esc(g.play)}" target="_blank" rel="noopener">Open in a new tab</a>
          ${g.itch ? `<a class="btn" href="${esc(g.itch)}" target="_blank" rel="noopener">itch.io page</a>` : ""}
        </div>`;
    } else if (playable) {
      player = `
        <div class="player">${cover(g, false)}
          <div class="start"><a class="btn play" href="${esc(g.play)}" target="_blank" rel="noopener">${playIcon} Play ${esc(g.short || g.title)}</a></div>
        </div>`;
    } else {
      player = `<div class="player">${cover(g, true)}</div>`;
    }

    const facts = [
      ["Status", playable ? "Playable" : "In development"],
      ["Genre", g.genre],
      ["Made with", g.engine],
      g.controls ? ["Controls", g.controls] : null,
    ].filter(Boolean);

    main.innerHTML = `
      <div class="game-head">
        <a class="back" href="./">← All games</a>
        <h1>${esc(g.title)}</h1>
        <p class="tagline">${esc(g.tagline)}</p>
      </div>
      ${player}
      <div class="game-body">
        <div>
          <h2>About</h2>
          ${(g.description || []).map((p) => `<p>${esc(p)}</p>`).join("")}
          ${playable ? "" : '<p class="note">This one is still being built, mostly live on stream. Check back soon.</p>'}
        </div>
        <aside class="facts"><dl>${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></aside>
      </div>`;

    const start = document.getElementById("start");
    if (start) {
      start.addEventListener("click", () => {
        const box = document.getElementById("player");
        box.innerHTML = `<iframe src="${esc(g.play)}" title="${esc(g.title)}" allow="fullscreen; autoplay; gamepad; pointer-lock" allowfullscreen></iframe>`;
        const iframe = box.querySelector("iframe");
        iframe.focus();
        const fs = document.getElementById("fullscreen");
        fs.hidden = false;
        fs.addEventListener("click", () => (box.requestFullscreen || box.webkitRequestFullscreen)?.call(box));
      });
    }
  }

  header();
  footer();
  if (document.body.dataset.page === "home") home();
  if (document.body.dataset.page === "game") gamePage();
})();
