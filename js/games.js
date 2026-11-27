// ─────────────────────────────────────────────────────────────
//  YOUR GAMES LIST
//  This is the only file you need to edit to add or change a game.
//
//  status:  "playable" → shows a Play button
//           "dev"      → shows "In development"
//  play:    link to the playable web build (GitHub Pages or itch.io)
//  itch:    link to the game's itch.io page (optional)
//  embed:   true  → the game runs right on its page here
//           false → the Play button opens the game in a new tab
//  image:   a screenshot in the img folder (optional; without one,
//           the card uses the two colors in "colors")
// ─────────────────────────────────────────────────────────────

window.SITE = {
  name: "Flynn's Games",
  tagline: "Games I build live on stream. Play them free in your browser.",
  // The big spotlight card at the top of the home page (a game id from the list below)
  featured: "steelbind",
  // Show the competition banner on the home page (false hides it)
  competitionBanner: true,
  // Paste your links here. Any left empty are hidden.
  links: {
    youtube: "https://www.youtube.com/@Future_Flynn5",
    twitch: "",
    tiktok: "https://www.tiktok.com/@future.flynn",
    x: "https://x.com/FutureFlynn5",
    instagram: "https://www.instagram.com/future.flynn5/",
    discord: "https://discord.gg/CCHXj3mSJc",
    itch: "",
  },
};

window.GAMES = [
  {
    id: "daily-putt",
    title: "The Daily Putt",
    status: "playable",
    genre: "Daily golf",
    engine: "Three.js",
    tagline: "One new golf hole every day. Fastest time wins.",
    description: [
      "Everyone gets the same par 4 each day, and a new one arrives at midnight Eastern. Swing, drive the cart to your ball and putt it in.",
      "Your score is your time, plus 10 seconds for every ball in the water or out of bounds. The weather and wind change by the day. Your first finished round of the day is the one that counts.",
    ],
    controls: "Drag back and let go to swing. Hold and drag to drive the cart, or use WASD or the arrow keys.",
    play: "https://financeflynn5-wq.github.io/daily-putt/",
    embed: true,
    image: "img/daily-putt.jpg",
    colors: ["#2fae4a", "#ffe14d"],
  },
  {
    id: "fta6",
    title: "Flynn Theft Auto: Sunset Coast",
    short: "FTA 6",
    status: "playable",
    genre: "Open world",
    engine: "Three.js",
    tagline: "Steal a ride, grab a gun, lose the cops, keep the cash.",
    description: [
      "You are Rocco the raccoon in a small open-world crime city. Walk the streets, steal a car and outrun the cops.",
      "Story mode has 12 jobs for Big Sal, Scrap, Tiff and Officer Dale. Free roam gives you the whole map: races, stunt jumps, a pizza run, a demolition derby, a zoo, boats, helicopters and 40 golden tins to find.",
    ],
    controls: "WASD to walk and drive, mouse to look, E to steal a car.",
    play: "https://financeflynn5-wq.github.io/fta6/",
    embed: true,
    image: "img/fta6.jpg",
    colors: ["#ff4f7b", "#ffb347"],
  },
  {
    id: "steelbind",
    title: "Steelbind",
    status: "playable",
    genre: "Fencing duel",
    engine: "Three.js",
    tagline: "A medieval fencing duel. Three touches win.",
    description: [
      "Your blade holds one of three lines: high, mid or low. A thrust that arrives on the line you hold is parried on its own, so thrust where their blade is not.",
      "A parry binds the blades and gives you the riposte. A hit knocks the plate off that line, and a hit on a bare line is a touch.",
    ],
    play: "https://financeflynn5-wq.github.io/steelbind/",
    embed: true,
    image: "img/steelbind.jpg",
    colors: ["#c9a24a", "#3b2a14"],
  },
  {
    id: "flynnland",
    title: "Flynnland",
    status: "playable",
    genre: "Dark fantasy RPG",
    engine: "Three.js",
    tagline: "First-person dark medieval, with D&D dice under the hood.",
    description: [
      "Real-time sword-and-shield combat and sneaking, with hidden dice deciding how well things land and whether you're noticed.",
      "Make your own Oathwarden and play through the episodes of The Drowned Oath.",
    ],
    controls: "WASD to move, left click to swing, right click to raise your shield.",
    play: "https://financeflynn5-wq.github.io/flynnland-play/",
    embed: true,
    image: "img/flynnland.jpg",
    colors: ["#5a4632", "#0f0c0a"],
  },
  {
    id: "deepward",
    title: "Deepward",
    status: "dev",
    genre: "Roguelike",
    engine: "Three.js",
    tagline: "Nine stages down. The Warden waits at the bottom.",
    description: [
      "A top-down medieval roguelike with classes and online co-op. Fight through nine stages with a boss at the end of every third, then face the Warden of the Deep.",
      "Win a run to unlock harder Dread tiers.",
    ],
    colors: ["#3f7d6e", "#10161c"],
  },
  {
    id: "ring-rampage",
    title: "Ring Rampage",
    status: "dev",
    genre: "Wrestling",
    engine: "Three.js",
    tagline: "Pro-wrestling chaos with a referee who doesn't like being hit.",
    description: [
      "Entrances with pyro, rope rebounds, top-rope dives, grapples, finishers, chairs, ladders, a steel cage and a ladder match.",
    ],
    colors: ["#e63946", "#1d1b3a"],
  },
  {
    id: "restopia",
    title: "Restopia",
    status: "dev",
    genre: "Platformer",
    engine: "Godot",
    tagline: "A 2D platformer built in Godot.",
    description: ["A 2D platformer with a town hub, traders and gems to collect."],
    colors: ["#7bd389", "#2b4c7e"],
  },
  {
    id: "dirt-rush",
    title: "Dirt Rush",
    status: "dev",
    genre: "Racing",
    engine: "Three.js",
    tagline: "Dirt bikes: races, freestyle and trail riding.",
    description: ["Race, pull freestyle tricks or just ride the trails."],
    colors: ["#d98c3f", "#3d2614"],
  },
  {
    id: "fire-crew",
    title: "Fire Crew",
    status: "dev",
    genre: "Co-op",
    engine: "Three.js",
    tagline: "A cozy co-op firefighter game.",
    description: ["Hop on the truck, climb the ladder and put the fires out together."],
    colors: ["#ff6b35", "#7a1f1f"],
  },
  {
    id: "exfil",
    title: "Exfil",
    status: "dev",
    genre: "Extraction shooter",
    engine: "Three.js",
    tagline: "Survive the ruin, tame the beasts, get out alive.",
    description: [
      "An extraction shooter with survival and tameable fantasy beasts. Drop into an overgrown ruin, keep yourself fed and patched up, fight bandits and make it to extraction.",
    ],
    colors: ["#6b8f3a", "#1a2414"],
  },
  {
    id: "time-of-war",
    title: "Time of War",
    status: "playable",
    genre: "Multiplayer shooter",
    engine: "Three.js",
    tagline: "12v12 sci-fi conquest.",
    description: [
      "A multiplayer sci-fi shooter. Conquest on Alien Valley, Team Deathmatch and Free For All.",
    ],
    play: "https://tow.5-222-13-73.sslip.io/",
    embed: true,
    image: "img/time-of-war.jpg",
    colors: ["#4cc9f0", "#1b1f3b"],
  },
  {
    id: "flynn-fall",
    title: "Flynn Fall",
    status: "playable",
    genre: "Battle royale",
    engine: "Three.js",
    tagline: "A battle royale on a future colony at dusk.",
    description: ["Drop onto Helios Reach and be the last one standing."],
    play: "https://fall.5-222-13-73.sslip.io/",
    embed: true,
    image: "img/flynn-fall.jpg",
    colors: ["#f72585", "#3a0ca3"],
  },
  {
    id: "scrapforge",
    title: "Scrapforge",
    status: "playable",
    genre: "Robot brawler",
    engine: "Three.js",
    tagline: "Bolt on scrap parts, then break the other robots.",
    description: [
      "Everyone starts as the same basic robot. Every part you pick up bolts on and changes what you can do: guns, rotors, optics and abilities.",
      "Get scrapped and everything you built drops as loot for whoever finishes you.",
    ],
    controls: "WASD to move, mouse to aim, left click to fire, E to swap parts, G to throw a bomb.",
    play: "https://scrap.5-222-13-73.sslip.io/",
    embed: true,
    image: "img/scrapforge.jpg",
    colors: ["#9aa5b1", "#2b2d33"],
  },
  {
    id: "battlebot-benchmark",
    title: "BattleBot Benchmark",
    status: "playable",
    genre: "AI benchmark",
    engine: "Three.js",
    tagline: "AI models build robot armies, code their commanders and fight it out.",
    description: [
      "Claude and GPT models each get the same rulebook. They design a robot army part by part, write the code that commands it, then fight on maps none of them have seen. Once a match starts, nobody can help them.",
      "Watch any of the thousands of recorded matches, see each model's robot designs, and compare the models on win rate, Elo and cost per entry. Early results; full tournaments are coming.",
    ],
    controls: "Pick a match from the Matches tab. Drag to orbit the camera, scroll to zoom, and use the timeline to scrub.",
    play: "https://financeflynn5-wq.github.io/battlebot-benchmark/",
    embed: false,
    image: "img/battlebot-benchmark.jpg",
    colors: ["#ff7a2f", "#2fd0ff"],
  },
];
