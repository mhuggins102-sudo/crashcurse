# Crash Curse

A card-grid puzzle prototype built for playtesting. A standard 52-card deck is
mixed with curse cards. Each turn you draw a card and place it anywhere on the
grid. The four walls around the grid each show a goal (a poker hand made from a
bendy chain of cards, or a row/column requirement). Complete a goal with the
card you just placed and it clears: you score, earn a ward that removes a
curse, and the wall draws a new goal. Let a goal expire and its wall crashes
inward, crushing whatever is in its way, until nothing can be placed.

Every rule that could be a knob is a knob: the **Settings** panel exposes about
50 sliders, toggles and selects plus a per-goal on/off + points table, presets,
JSON import/export, share links, and a headless simulation that plays a rule
set with a greedy bot and reports which goals get cleared and how games end.

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

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Framework preset: **None**. Build command: leave **empty**. Build output directory: **`public`**.
4. Save and deploy. Every push redeploys.

Or from the CLI: `npx wrangler pages deploy public --project-name crashcurse`.

## Playing

- Click an empty cell to place the drawn card (hover previews it).
- Click a glowing curse to remove it with a ward.
- Arrow keys move a cursor; Enter/Space acts on it.
- `P` pause, `N` new game, `H` hints (highlights cells that would clear a goal), `B` bot autoplay, `Esc` close/pause.

## How the rules fit together

| Piece | Default | Where to tune |
| --- | --- | --- |
| Grid | 6×6, game over below 4 open cells | Board |
| Deck | 52 cards + 6 curses, random spread, discards reshuffle back in | Deck & curses |
| Chains | snake paths (bends, no branching); straights and flushes are 4 long | Placement & clearing |
| Clearing | the placed card must be part of the goal; cleared cards leave the board | Placement & clearing |
| Walls | each wall's goal has 40 s; expiry moves that wall in; timers shrink 10 % per minute | Walls & timing |
| Curses | one ward per clear, spent by clicking a curse; removed curses return via the discard pile | Wards, Deck & curses |
| Multi-clear | ×2 points per extra goal, +1 ward, 1 curse purged from the deck | Multi-clear perks |
| Scoring | per-goal base points, combo +25 % per consecutive clearing placement | Scoring, Goal pool |
| Mode | endless; survival mode adds level timers, extra curses and faster timers per level | Mode & levels |

Presets (Chill, Action, Brutal, Turn-based, Global timer, Survival, Poker only)
are starting points; load one, tweak, apply.

### Goal shapes

- **Chain** goals accept any orthogonally connected snake of exactly N cards that includes the card you just placed. Bends are fine; a branch (a plus shape) is not a snake. Switch *Chain shape* to "any connected group" to allow branches.
- **Straight line** goals need N cards in one row or column segment.
- **Row / column** goals need every open cell of that row or column (between the current walls) filled, so they get easier as the walls close in.

Sum-based goals use pips: ace 1, faces 10. Straights allow ace low or high, no wrap-around.

## Code layout

```
public/
  index.html, css/style.css        shell and styling
  js/rng.js                        seeded RNG (a seed reproduces a whole game)
  js/cards.js                      card model
  js/goals.js                      goal definitions + chain/line/row detection
  js/settings.js                   settings schema, defaults, presets, persistence
  js/engine.js                     pure game engine (no DOM), drives everything
  js/bot.js, js/simworker.js       greedy bot, headless simulation, web worker
  js/ui.js, js/main.js             rendering, input, generated settings panel
tests/                             node:test suites for detection and engine
scripts/sim.js                     CLI simulation
```

Adding a goal is one entry in `GOAL_DEFS` (shape, size, points, predicate); adding a setting is one entry in `SETTINGS_SCHEMA`. The panel, presets, JSON export and validation pick it up automatically.
