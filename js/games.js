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
  // Paste your links here. Any left empty are hidden.
  links: {
    youtube: "",
    twitch: "",
    itch: "",
    discord: "",
  },
};

window.GAMES = [
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
    status: "dev",
    genre: "Multiplayer shooter",
    engine: "Three.js",
    tagline: "12v12 sci-fi conquest.",
    description: [
      "A multiplayer sci-fi shooter. Conquest on Alien Valley, Team Deathmatch and Free For All.",
    ],
    colors: ["#4cc9f0", "#1b1f3b"],
  },
  {
    id: "flynn-fall",
    title: "Flynn Fall",
    status: "dev",
    genre: "Battle royale",
    engine: "Three.js",
    tagline: "A battle royale on a future colony at dusk.",
    description: ["Drop onto Helios Reach and be the last one standing."],
    colors: ["#f72585", "#3a0ca3"],
  },
];
