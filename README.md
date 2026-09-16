# Crash Curse

A grid puzzle prototype built for playtesting. A deck of numbered tiles (or,
optionally, symbol tiles or a standard 52-card deck) is mixed with curse cards. Each turn you draw a piece
and place it anywhere on the grid. The four walls around the grid each show a
goal: a pattern made from a bendy chain of pieces, a straight line, a full
row or column, a 2×2 block, a plus shape, or a board-wide count. Complete a
goal with the piece you just placed and it clears: you score, earn a ward,
and the wall draws a new goal. Let a goal expire and its wall crashes inward,
crushing whatever is in its way, until nothing can be placed.

**Three decks**, each with its own goal pool (Settings → Deck):

- **Numbered tiles** (default): 5 colors × the numbers 1–9, two of each, 90
  tiles. Colors, top number and copies per tile are sliders. 140 goals in
  twelve categories: sums, products, runs, colors, poker hands, odds & evens,
  number tricks, full rows & columns, blocks & shapes, geometry (diagonals,
  elbows, wiggles), board-wide (Flood, Clean Sweep, Picture Frame,
  Crossroads…) and placement goals about the tile you just put down (Head
  Count, Echo, Exorcist…). Every goal card carries two flags saying whether
  colors and whether numbers matter to it.
- **Symbol tiles**: 5 colors × (5 blank, 2 dot, 2 triangle, 1 star), 50 tiles,
  56 goals.
- **Playing cards**: the standard 52, 29 goals.

Every rule that could be a knob is a knob: the **Settings** panel exposes
about 60 sliders, toggles and selects plus a per-goal on/off + points table,
presets, JSON import/export, share links, and a headless simulation that
plays a rule set with a greedy bot and reports which goals get cleared and
how games end.

## Running it

It is a static site with no build step.

```bash
# local preview (any static server works)
npm run serve            # python3 http.server on http://localhost:8080
# or: npx serve public

# tests (goal detection + engine flows)
npm test

# headless balance check from the terminal
npm run sim                            # 20 games, default preset
node scripts/sim.js 50 1.2 Action      # 50 games, bot at 1.2 s/move, "Action" preset
node scripts/sim.js 30 1.5 Default curseCount=10 goalSeconds=30 goal:pair=true
```

The page uses ES modules, so open it through a server rather than `file://`.

## Deploying to Cloudflare Pages

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick this repo, then use exactly these values:

| Setting | Value |
| --- | --- |
| Production branch | the branch that has the code (currently `claude/card-grid-puzzle-game-0wka0e`; it is the only branch, so it is also the repo default) |
| Framework preset | `None` |
| Build command | leave empty |
| Build output directory | `public` |
| Root directory | leave empty (`/`) |

Save and deploy. Every push to the production branch redeploys.

From the CLI instead: `npx wrangler pages deploy public --project-name crashcurse`.

### Blank page? Check these in order

1. **A completely blank page is Cloudflare's empty 404 response.** It means the build output directory has no `index.html` at its top level, almost always because it was left at `/` instead of `public`. Fix it under *Settings → Builds & deployments → Build output directory*, then *Retry deployment*. (As a safety net, the repo root also carries an `index.html` that forwards to `public/`, so a root output directory works from this commit onward, just with `/public/` in the URL.)
2. **Wrong production branch.** If the project was created with `main` as the production branch, there is nothing to deploy because `main` does not exist yet. Either point the project at the branch above, or create `main` from it on GitHub and keep deploying `main`.
3. **The build failed.** With no build command Cloudflare copies the files as they are; if a build command such as `npm run build` was entered, remove it (there is no build step). The *Deployments* tab shows the log.
4. **Still blank with the correct directory?** Open `https://<your-site>.pages.dev/js/main.js` directly. A 404 there means the output directory is still wrong; if the file loads, open the browser console and send me the error.

## Playing

On a phone the whole game fits on one screen: the board in the middle, the drawn tile and quick stats in a tray at the bottom, and everything else behind the ☰ menu (pause, new game, hints, bot, stats & log, rules, settings). The page ships a web manifest and icons, so "Add to Home Screen" installs it full-screen.

- Click an empty cell to place the drawn card (hover previews it).
- When more than one set of tiles could clear a goal, the game waits (timers included) and lights up the candidates: tap a dotted tile to switch to a set that uses it, tap the tile you just placed to cycle through the options, and tap a lit tile (or "Use these") to confirm. `[` `]` cycle, `Enter` confirms. Turn it off in Settings → Placement & clearing to always take the first set found (the smallest, then the one reaching up or left from the placed tile).
- Click a glowing curse to remove it with a ward.
- Arrow keys move a cursor; Enter/Space acts on it.
- `U` (or `Ctrl`+`Z`) undoes the last placement or ward use, clock and draw included; undo is unlimited by default, with a per-game slider and an optional ward cost in Settings.
- `R` (or the ⏭ button by "Next") spends a ward to skip the upcoming tiles shown in the tray.
- `P` pause, `N` new game, `H` hints (highlights cells that would clear a goal), `B` bot autoplay, `Esc` close/pause.

## How the rules fit together

| Piece | Default | Where to tune |
| --- | --- | --- |
| Grid | 6×6, game over below 4 open cells | Board |
| Deck | numbered tiles (5 colors × 1–9 × 2 copies), symbol tiles, or 52 cards, plus 15 curses; discards reshuffle back in | Deck & curses |
| Chains | snake paths (bends, no branching); for cards, straights and flushes are 4 long | Placement & clearing |
| Clearing | the placed card must be part of the goal; cleared cards leave the board | Placement & clearing |
| Walls | turn clock: each wall's goal lasts 15 placements; expiry moves that wall in; timers shrink 10 % per 20 placements; right after a crush, goals the board already satisfies clear | Walls & timing |
| Wards | one per clear (plus one for a combo); spend on removing a curse, replacing a goal (keeps its time plus a bonus by default), extending a goal by a few turns, or skipping the upcoming tiles; pushing a wall back is available but off by default; every use has its own cost | Wards |
| Combo (2+ goals in one placement) | ×2 points per extra goal, +1 ward, 1 curse purged from the deck | Combo perks |
| Scoring | per-goal base points; streak +25 % per consecutive clearing placement | Scoring, Goal pool |
| Mode | endless; survival mode adds level timers, extra curses and faster timers per level | Mode & levels |

Presets (Chill, Action, Brutal, Turn-based, Global timer, Survival, Number tiles, Symbol tiles, Playing cards, Poker only)
are starting points; load one, tweak, apply.

### Scoring

Every clearing placement scores

```
points = round( sum of base points × comboMult^(goals − 1) × (1 + streak × streakBonus) )
```

- **Combo** = two or more goals cleared by one placement. Their base points are added up, then multiplied by `comboMult` (default 2) for each goal beyond the first: 50 + 100 at once is 150 × 2 = 300; 50 + 100 + 200 at once is 350 × 4 = 1400. A combo also grants the combo perks (an extra ward and a curse purged from the deck by default).
- **Streak** = consecutive placements that each cleared something. The streak counter is how many clearing placements came before this one in a row, so the first clear is ×1, the next placement that clears is ×1.25, then ×1.5, and so on (`streakBonus` 0.25 per step). A placement that clears nothing resets it. Combo and streak multiply together: a two-goal combo right after another clear is ×2 × ×1.25 = ×2.5. The streak chip in the tray shows the multiplier your next clear would get.
- **Wall clears** (a wall completing a line by shortening it) score base points only and leave the streak untouched.
- A **crushed curse** leaves the board and follows *Removed curses return to the discard pile*: on (default) it goes to the discard pile and comes back with the next reshuffle, off means it is gone for good. *When a wall crushes a curse* can instead make it jump to a random open cell.

### Goal shapes

- **Chain** goals accept any orthogonally connected snake of exactly N cards that includes the card you just placed. Bends are fine; a branch (a plus shape) is not a snake. Switch *Chain shape* to "any connected group" to allow branches.
- **Straight line** goals need N cards in one row or column segment.
- **Row / column** goals need every open cell of that row or column (between the current walls) filled, so they get easier as the walls close in. For the plain fill goals (Fill a Row, Fill a Column, Double Decker, Crossroads, Picture Frame, Clean Sweep) a curse counts as a filled cell by default and is lifted when the goal clears, which is one more way to get curses off the board; *Curses count as filled cells for fill goals* switches that off.
- **Block** goals need a 2×2 square; **plus** goals a centre and its four side neighbours; **board-wide** goals count matching tiles anywhere between the walls and clear all of them at once.
- A goal that can no longer fit between the walls (a Rainbow Row on a 4-wide board, a plus on a 2-row board) is never offered, and an active one is swapped for free when a wall makes it impossible.

Card sums use pips: ace 1, faces 10. Straights allow ace low or high, no wrap-around.

Every goal shows a badge with a shape icon (snake = chain, grid = connected group, crossed arrows = straight line, ↔ = whole row, ↕ = whole column) and the number of cards it takes; for rows and columns that number is the live length between the walls. Goals also belong to a family (matching ranks, runs, suits, sums, colors, rank tiers, variety, filling), and by default two goals from one family never sit on the walls at the same time, so the four active goals always feel distinct. Tap a goal for its precise wording and for the ward actions.

Goals are dealt from a shuffled deck of the enabled pool, so no goal comes back until every other enabled goal has had its turn (Fill a Row and Fill a Column are exempt and can return sooner), and a goal that clears or expires is never replaced by the very same goal. Turn *Cycle through every enabled goal* off in Settings for plain random draws.

The four goal cards are identical rectangles, as long as the starting grid and as thick as the wall band, with fixed rows for the name, description, points and timer, progress bar, and ward buttons, so nothing on a card moves when its goal changes or the walls close in. The side cards are turned to lie along their walls (left reads bottom-up, right reads top-down).

## Code layout

```
public/
  index.html, css/style.css        shell and styling
  js/rng.js                        seeded RNG (a seed reproduces a whole game)
  js/cards.js                      card model
  js/shapes.js                     chain / line / row / block / plus enumerators
  js/cardgoals.js, js/tilegoals.js, js/numgoals.js   goal definitions for each deck
  js/goals.js                      goal registry, feasibility and detection glue
  js/settings.js                   settings schema, defaults, presets, persistence
  js/engine.js                     pure game engine (no DOM), drives everything
  js/bot.js, js/simworker.js       greedy bot, headless simulation, web worker
  js/ui.js, js/main.js             rendering, input, generated settings panel
tests/                             node:test suites for detection and engine
scripts/sim.js                     CLI simulation
```

Adding a goal is one entry in `NUM_GOALS`, `TILE_GOALS` or `CARD_GOALS` (shape, size, family, points, predicate, plus a sentence in the details map); adding a setting is one entry in `SETTINGS_SCHEMA`. The panel, presets, JSON export and validation pick it up automatically.
