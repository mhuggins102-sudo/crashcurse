# Crash Curse

A grid puzzle prototype built for playtesting. A deck of tiles (or, optionally,
a standard 52-card deck) is mixed with curse cards. Each turn you draw a piece
and place it anywhere on the grid. The four walls around the grid each show a
goal: a pattern made from a bendy chain of pieces, a straight line, a full
row or column, a 2×2 block, a plus shape, or a board-wide count. Complete a
goal with the piece you just placed and it clears: you score, earn a ward,
and the wall draws a new goal. Let a goal expire and its wall crashes inward,
crushing whatever is in its way, until nothing can be placed.

**The tile deck** (default): 5 colors × 10 tiles = 50 tiles. Each color has 5
blank tiles, 2 with a dot, 2 with a triangle and 1 with a star. The colors,
the counts per color and the number of curses are all settings. About 54 tile
goals ship in six categories (color chains, rainbow chains, symbol chains,
straight lines, full rows & columns, blocks & patterns, board-wide); the
playing-card deck keeps its own 30 goals.

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

- Click an empty cell to place the drawn card (hover previews it).
- Click a glowing curse to remove it with a ward.
- Arrow keys move a cursor; Enter/Space acts on it.
- `P` pause, `N` new game, `H` hints (highlights cells that would clear a goal), `B` bot autoplay, `Esc` close/pause.

## How the rules fit together

| Piece | Default | Where to tune |
| --- | --- | --- |
| Grid | 6×6, game over below 4 open cells | Board |
| Deck | tiles (5 colors × 5 blank + 2 dot + 2 triangle + 1 star) or 52 cards, plus 6 curses; discards reshuffle back in | Deck & curses |
| Chains | snake paths (bends, no branching); for cards, straights and flushes are 4 long | Placement & clearing |
| Clearing | the placed card must be part of the goal; cleared cards leave the board | Placement & clearing |
| Walls | each wall's goal has 40 s; expiry moves that wall in; timers shrink 10 % per minute | Walls & timing |
| Wards | one per clear (plus one for a multi-clear); spend on removing a curse, replacing a goal, or pushing a wall back, each with its own cost | Wards |
| Multi-clear | ×2 points per extra goal, +1 ward, 1 curse purged from the deck | Multi-clear perks |
| Scoring | per-goal base points, combo +25 % per consecutive clearing placement | Scoring, Goal pool |
| Mode | endless; survival mode adds level timers, extra curses and faster timers per level | Mode & levels |

Presets (Chill, Action, Brutal, Turn-based, Global timer, Survival, Playing cards, Poker only)
are starting points; load one, tweak, apply.

### Goal shapes

- **Chain** goals accept any orthogonally connected snake of exactly N cards that includes the card you just placed. Bends are fine; a branch (a plus shape) is not a snake. Switch *Chain shape* to "any connected group" to allow branches.
- **Straight line** goals need N cards in one row or column segment.
- **Row / column** goals need every open cell of that row or column (between the current walls) filled, so they get easier as the walls close in.
- **Block** goals need a 2×2 square; **plus** goals a centre and its four side neighbours; **board-wide** goals count matching tiles anywhere between the walls and clear all of them at once.
- A goal that can no longer fit between the walls (a Rainbow Row on a 4-wide board, a plus on a 2-row board) is never offered, and an active one is swapped for free when a wall makes it impossible.

Card sums use pips: ace 1, faces 10. Straights allow ace low or high, no wrap-around.

Every goal shows a badge with a shape icon (snake = chain, grid = connected group, crossed arrows = straight line, ↔ = whole row, ↕ = whole column) and the number of cards it takes; for rows and columns that number is the live length between the walls. Goals also belong to a family (matching ranks, runs, suits, sums, colors, rank tiers, variety, filling), and by default two goals from one family never sit on the walls at the same time, so the four active goals always feel distinct. Tap a goal for its precise wording and for the ward actions.

## Code layout

```
public/
  index.html, css/style.css        shell and styling
  js/rng.js                        seeded RNG (a seed reproduces a whole game)
  js/cards.js                      card model
  js/shapes.js                     chain / line / row / block / plus enumerators
  js/cardgoals.js, js/tilegoals.js goal definitions for each deck
  js/goals.js                      goal registry, feasibility and detection glue
  js/settings.js                   settings schema, defaults, presets, persistence
  js/engine.js                     pure game engine (no DOM), drives everything
  js/bot.js, js/simworker.js       greedy bot, headless simulation, web worker
  js/ui.js, js/main.js             rendering, input, generated settings panel
tests/                             node:test suites for detection and engine
scripts/sim.js                     CLI simulation
```

Adding a goal is one entry in `TILE_GOALS` or `CARD_GOALS` (shape, size, family, points, predicate, plus a sentence in the details map); adding a setting is one entry in `SETTINGS_SCHEMA`. The panel, presets, JSON export and validation pick it up automatically.
