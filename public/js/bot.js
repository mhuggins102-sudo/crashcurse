// A greedy bot: takes any placement that clears goals (most points first),
// otherwise builds "potential" next to matching cards. Used for the on-screen
// autoplay and for headless simulations that estimate how a rule set plays.

import { Game } from './engine.js';
import { GOAL_DEFS, goalPoints } from './goals.js';
import { makeRng, hashSeed } from './rng.js';

function potential(game, i) {
  const [r, c] = game.rc(i);
  const W = game.W, H = game.H;
  const card = game.current;
  let v = 0;
  const neigh = [];
  if (r > 0) neigh.push(i - W);
  if (r < H - 1) neigh.push(i + W);
  if (c > 0) neigh.push(i - 1);
  if (c < W - 1) neigh.push(i + 1);
  for (const n of neigh) {
    const o = game.cells[n];
    if (!o) continue;
    if (o.kind === 'curse') { v -= 0.5; continue; }
    v += 0.6;
    if (card.kind === 'num') {
      if (o.color === card.color) v += 2;
      if (o.n === card.n) v += 2.5;
      if (Math.abs(o.n - card.n) === 1) v += 1.5;
      if (o.n % 2 === card.n % 2) v += 0.3;
      continue;
    }
    if (card.kind === 'tile') {
      if (o.color === card.color) v += 2.5;
      if (o.sym && o.sym === card.sym) v += 2;
      if (!o.sym && !card.sym) v += 0.7;
      continue;
    }
    if (o.suit === card.suit) v += 2;
    if (o.rank === card.rank) v += 2.5;
    if (Math.abs(o.rank - card.rank) === 1) v += 1.2;
    if (o.red === card.red) v += 0.3;
  }
  // Avoid the row/column next to a wall whose goal is about to expire.
  if (game.s.wallMode === 'goal' && game.s.clock === 'time') {
    const danger = (side) => { const g = game.goals[side]; return g && g.duration > 0 && g.timeLeft / g.duration < 0.3; };
    if (r === game.inset.top && danger('top')) v -= 3;
    if (r === H - 1 - game.inset.bottom && danger('bottom')) v -= 3;
    if (c === game.inset.left && danger('left')) v -= 3;
    if (c === W - 1 - game.inset.right && danger('right')) v -= 3;
  }
  return v;
}

export function chooseMove(game, rng) {
  const legal = game.legalCells();
  if (!legal.length) return null;
  let best = null;
  for (const i of legal) {
    const cl = game.preview(i) || [];
    let pts = 0;
    for (const c of cl) pts += goalPoints(c.goal.def, game.s);
    if (cl.length >= 2) pts *= Math.pow(game.s.comboMult, cl.length - 1);
    const v = pts * 100 + potential(game, i) + rng() * 0.4;
    if (!best || v > best.v) best = { idx: i, v, clears: cl.length };
  }
  return best.idx;
}

export function botStep(game, rng) {
  if (game.status === 'choosing') { game.autoChoose(); return true; }
  if (game.status === 'levelup') { game.continueLevel(); return true; }
  if (game.status !== 'playing') return false;
  if (game.s.wardSpend === 'manual' && game.wards > 0) {
    if (game.canAffordWard('refresh') && game.upcoming(game.s.peekCount).some((c) => c.kind === 'curse')) game.wardRefresh();
    const curses = game.curseCells();
    if (game.canAffordWard('curse') && curses.length) game.spendWard(rng.pick(curses));
    else if (game.canAffordWard('retreat') && game.emptyCells().length < 4) {
      const closed = ['top', 'right', 'bottom', 'left'].filter((side) => game.inset[side] > 0);
      if (closed.length) game.wardRetreat(rng.pick(closed));
    }
  }
  if (!game.current) return false;
  const i = chooseMove(game, rng);
  if (i == null) return false;
  return game.place(i);
}

// Run `games` headless games and aggregate the results.
export function runSimulation(settings, { games = 20, secPerMove = 1.5, seed = 'sim', maxMoves = 600, onProgress } = {}) {
  const results = [];
  for (let g = 0; g < games; g++) {
    const rng = makeRng(hashSeed(`${seed}-bot-${g}`));
    const game = new Game(settings, `${seed}-${g}`);
    let moves = 0;
    while (game.status !== 'over' && moves < maxMoves) {
      if (!botStep(game, rng)) break;
      moves++;
      game.tick(secPerMove);
      game.drain();
    }
    results.push({
      score: game.score, elapsed: game.elapsed, level: game.level, placements: game.placements,
      reason: game.status === 'over' ? game.overReason : 'capped', stats: game.stats,
    });
    if (onProgress) onProgress(g + 1, games);
  }
  return aggregate(results, settings);
}

function meanOf(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function medianOf(arr) { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

export function aggregate(results, settings) {
  const metric = (f) => { const a = results.map(f); return { mean: meanOf(a), median: medianOf(a), min: Math.min(...a), max: Math.max(...a) }; };
  const reasons = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  const goals = GOAL_DEFS.map((d) => {
    const offered = results.reduce((a, r) => a + (r.stats.goalsOffered[d.id] || 0), 0);
    const cleared = results.reduce((a, r) => a + (r.stats.goalsCleared[d.id] || 0), 0);
    const expired = results.reduce((a, r) => a + (r.stats.goalsExpiredBy[d.id] || 0), 0);
    return { id: d.id, name: d.name, offered, cleared, expired, rate: offered ? cleared / offered : 0, points: goalPoints(d, settings) };
  }).filter((g) => g.offered > 0);
  return {
    games: results.length,
    score: metric((r) => r.score),
    elapsed: metric((r) => r.elapsed),
    level: metric((r) => r.level),
    placements: metric((r) => r.placements),
    clears: metric((r) => r.stats.clears),
    combos: metric((r) => Object.values(r.stats.combos).reduce((a, b) => a + b, 0)),
    cursesDrawn: metric((r) => r.stats.cursesDrawn),
    cursesRemoved: metric((r) => r.stats.cursesRemoved),
    wallMoves: metric((r) => Object.values(r.stats.wallMoves).reduce((a, b) => a + b, 0)),
    goalsExpired: metric((r) => r.stats.goalsExpired),
    maxStreak: metric((r) => r.stats.maxStreak),
    reasons,
    goals,
  };
}
