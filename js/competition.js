// ─────────────────────────────────────────────────────────────
//  GAME DEV COMPETITION
//  Edit the settings in COMPETITION to change dates, prizes or
//  where entries are sent. The page itself is competition.html.
//
//  deadline / reviewStart: ISO dates with a time zone offset,
//    e.g. "2026-12-04T23:59:00-05:00" (US Eastern).
//  channel: the Discord channel where players post their entry.
//    The form builds the entry text for them to copy and post.
//  channelLink: the Discord invite used on this page (optional;
//    without one, the page uses the invite in games.js).
//  open: false closes entries and hides the form.
// ─────────────────────────────────────────────────────────────

window.COMPETITION = {
  name: "Flynn's Game Dev Competition",
  open: true,
  deadline: "2026-12-04T23:59:00-05:00",
  deadlineLabel: "Friday, December 4 at 11:59 PM ET",
  reviewStart: "2026-12-05T12:00:00-05:00",
  reviewLabel: "Saturday, December 5, live on stream",
  voteLabel: "Saturday, December 5 to Monday, December 7, in a Discord poll",
  winnerLabel: "Monday, December 7",
  prizeValue: "$25",
  channel: "#competition-submissions",
  channelLink: "https://discord.gg/QZXRnxMSZ",
};

(function () {
  if (document.body.dataset.page !== "competition") return;
  const C = window.COMPETITION;
  const SITE = window.SITE;
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Fill in the dates, prize and links from the settings above
  document.querySelectorAll("[data-c]").forEach((el) => {
    const v = C[el.dataset.c];
    if (v != null) el.textContent = v;
  });
  document.querySelectorAll("[data-link]").forEach((el) => {
    const url = el.dataset.link === "discord" && C.channelLink ? C.channelLink : SITE.links?.[el.dataset.link];
    if (url) el.href = url;
    else el.removeAttribute("href");
  });

  // Countdown to the deadline
  const deadline = new Date(C.deadline);
  const cd = $("countdown");
  const closed = () => !C.open || Date.now() > deadline;
  function tick() {
    const ms = deadline - Date.now();
    if (closed()) {
      cd.innerHTML = `<div class="cd-closed">Entries are closed. See you on stream!</div>`;
      return false;
    }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    cd.innerHTML = [[d, "days"], [h, "hours"], [m, "min"], [s, "sec"]]
      .map(([n, l]) => `<div class="cd-cell"><b>${String(n).padStart(2, "0")}</b><span>${l}</span></div>`)
      .join("");
    return true;
  }
  if (tick()) setInterval(tick, 1000);

  const form = $("entry-form");
  if (closed()) {
    form.hidden = true;
    $("form-closed").hidden = false;
    return;
  }

  const TYPE_LABEL = { roblox: "Roblox", github: "GitHub", itch: "itch.io", other: "Other" };

  // Link type: show the matching hint and check the link fits it
  const RULES = {
    roblox: { hint: "Your game's page on roblox.com, like roblox.com/games/123456/My-Game", ok: (h) => /(^|\.)roblox\.com$/.test(h) },
    github: { hint: "A GitHub repo or a GitHub Pages link, like you.github.io/my-game", ok: (h) => /(^|\.)github\.(com|io)$/.test(h) },
    itch: { hint: "Your game's itch.io page, like you.itch.io/my-game", ok: (h) => /(^|\.)itch\.io$/.test(h) },
    other: { hint: "Any other link. Message Flynn on Discord first so he can check it works on stream.", ok: () => true },
  };
  const link = form.elements.link;
  const linkHint = $("link-hint");
  const otherNote = $("other-note");
  function onType() {
    const t = form.elements.linkType.value;
    linkHint.textContent = RULES[t]?.hint || "Pick where your game lives first.";
    otherNote.hidden = t !== "other";
    form.elements.otherOk.required = t === "other";
    checkLink();
  }
  function checkLink() {
    const t = form.elements.linkType.value;
    let msg = "";
    if (link.value && t) {
      try {
        const u = new URL(/^https?:\/\//i.test(link.value) ? link.value : "https://" + link.value);
        if (!RULES[t].ok(u.hostname.toLowerCase())) msg = `That link doesn't match ${TYPE_LABEL[t]}. Check the link, or pick a different option above.`;
      } catch {
        msg = "That doesn't look like a link.";
      }
    }
    link.setCustomValidity(msg);
  }
  form.querySelectorAll("[name=linkType]").forEach((r) => r.addEventListener("change", onType));
  link.addEventListener("input", checkLink);
  onType();

  const PRIZE_LABEL = { robux: `${C.prizeValue} of Robux`, amazon: `${C.prizeValue} Amazon gift card` };
  const discordUrl = C.channelLink || SITE.links?.discord;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.classList.add("was-checked");
    checkLink();
    if (!form.reportValidity()) return;
    if (form.elements.website.value) return; // bot trap

    const f = form.elements;
    const text = [
      `🎮 Competition entry`,
      `Call me: ${f.name.value.trim()}`,
      `Game: ${f.gameTitle.value.trim()}`,
      `Link (${TYPE_LABEL[f.linkType.value]}): ${f.link.value.trim()}`,
      f.howToPlay.value.trim() ? `How to play: ${f.howToPlay.value.trim()}` : "",
      `Prize if I win: ${PRIZE_LABEL[f.prize.value]}`,
    ].filter(Boolean).join("\n");

    $("entry-done").innerHTML = `
      <div class="done-icon" aria-hidden="true">✓</div>
      <h3>One last step</h3>
      <p>Copy your entry and post it in <b>${esc(C.channel)}</b> on Flynn's Discord. Your entry counts once it's posted there.</p>
      <pre class="entry-copy">${esc(text)}</pre>
      <div class="btn-row">
        <button class="btn fire" type="button" id="copy-entry">Copy my entry</button>
        ${discordUrl ? `<a class="btn" href="${esc(discordUrl)}" target="_blank" rel="noopener">Open Discord</a>` : ""}
      </div>
      <p class="muted-sm">Flynn plays every entry ${esc(C.reviewLabel)}, then the Discord votes for a winner. <button class="linkish" type="button" id="edit-entry">Edit my entry</button></p>`;
    form.hidden = true;
    $("entry-done").hidden = false;
    $("entry-done").scrollIntoView({ behavior: "smooth", block: "center" });
    const copy = $("copy-entry");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(text); copy.textContent = "Copied!"; }
      catch { copy.textContent = "Select the text above and copy it"; }
    });
    $("edit-entry").addEventListener("click", () => {
      $("entry-done").hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
})();
