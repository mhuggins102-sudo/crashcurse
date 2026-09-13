import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSatisfying, GOAL_BY_ID, GOAL_DEFS, goalDeck, goalFamilies, goalFeasible } from '../public/js/goals.js';
import { Game } from '../public/js/engine.js';
import { botStep } from '../public/js/bot.js';
import { makeRng } from '../public/js/rng.js';
import { tileBoard, tileSettings, idx } from './helpers.js';

const find = (b, s, id, placed) => findSatisfying(b, s, GOAL_BY_ID[id], placed);

test('the tile deck has colors × (blanks + dots + triangles + stars) tiles plus curses', () => {
  const s = tileSettings({ curseCount: 4 });
  const g = new Game(s, 'tiledeck');
  const pieces = g.deck.concat(g.current ? [g.current] : [], g.cells.filter(Boolean));
  const tiles = pieces.filter((p) => p.kind === 'tile');
  assert.equal(tiles.length, 50);
  assert.equal(pieces.filter((p) => p.kind === 'curse').length, 4);
  for (let color = 0; color < 5; color++) {
    const of = tiles.filter((t) => t.color === color);
    assert.equal(of.length, 10);
    assert.equal(of.filter((t) => t.sym === 0).length, 5);
    assert.equal(of.filter((t) => t.sym === 1).length, 2);
    assert.equal(of.filter((t) => t.sym === 2).length, 2);
    assert.equal(of.filter((t) => t.sym === 3).length, 1);
  }
  assert.ok(Object.values(g.goals).every((x) => goalDeck(x.def) === 'tiles'), 'only tile goals are offered');
});

test('color chains: triplet, pure quad, marked triplet, full set', () => {
  const s = tileSettings();
  const b = tileBoard([
    'R. Rd Rt',
    '.. .. Rs',
    '.. .. R.',
  ]);
  assert.ok(find(b, s, 'tTriplet', idx(b, 0, 0)));
  assert.equal(find(b, s, 'tPureQuad', idx(b, 0, 0)), null, 'marked tiles break a pure chain');
  assert.ok(find(b, s, 'tMarkedTriplet', idx(b, 1, 2)), 'dot-triangle-star of one color');
  const fullSet = find(b, s, 'tFullSet', idx(b, 1, 2));
  assert.ok(fullSet, 'dot, triangle and star of one color in a chain');
  const pure = tileBoard(['B. B. B. B.']);
  assert.ok(find(pure, s, 'tPureQuad', 0));
});

test('two-tone needs strict alternation; two pairs ignores order', () => {
  const s = tileSettings();
  assert.ok(find(tileBoard(['R. B. Rd Bt']), s, 'tTwoTone', 0));
  assert.equal(find(tileBoard(['R. B. B. R.']), s, 'tTwoTone', 0), null);
  assert.ok(find(tileBoard(['R. B. B. R.']), s, 'tTwoPairs', 0));
  assert.equal(find(tileBoard(['R. R. R. R.']), s, 'tTwoPairs', 0), null);
});

test('rainbow chains scale with the number of colors', () => {
  const s = tileSettings({ tileColors: 5 });
  assert.ok(find(tileBoard(['R. Y. G. B. P.']), s, 'tRainbow', 2));
  assert.equal(find(tileBoard(['R. Y. G. B. R.']), s, 'tRainbow', 2), null);
  const s4 = tileSettings({ tileColors: 4 });
  assert.ok(find(tileBoard(['R. Y. G. B.']), s4, 'tPureRainbow', 0));
  assert.equal(find(tileBoard(['R. Yd G. B.']), s4, 'tPureRainbow', 0), null, 'a marked tile spoils a pure rainbow');
});

test('symbol chains: dot trail, star pair, matching marks, symbol salad', () => {
  const s = tileSettings();
  assert.ok(find(tileBoard(['Rd Bd', '.. Gd']), s, 'tDotTrail', 0));
  assert.ok(find(tileBoard(['Rs Bs']), s, 'tStarPair', 1));
  assert.ok(find(tileBoard(['Rt Bt Gt']), s, 'tMatchingMarks', 1));
  assert.equal(find(tileBoard(['Rt Rt Gt']), s, 'tMatchingMarks', 1), null, 'colors must differ');
  assert.ok(find(tileBoard(['Rd Bt Gs']), s, 'tSymbolSalad', 0));
  assert.equal(find(tileBoard(['Rd Bt G.']), s, 'tSymbolSalad', 0), null);
});

test('straight-line tile goals: sandwich, checkered line', () => {
  const s = tileSettings();
  assert.ok(find(tileBoard(['R. B. R.']), s, 'tSandwich', 1));
  assert.equal(find(tileBoard(['R. R. R.']), s, 'tSandwich', 1), null);
  assert.ok(find(tileBoard(['R. B. R. B.']), s, 'tCheckeredLine', 0));
  const bent = tileBoard(['R. B. R. ..', '.. .. B. ..']);
  assert.equal(find(bent, s, 'tCheckeredLine', idx(bent, 1, 2)), null, 'lines cannot bend');
});

test('full rows respect walls: checkered, motley, majority, bookends, rainbow row feasibility', () => {
  const s = tileSettings({ lineMinLen: 2 });
  const b = tileBoard([
    'XX R. B. R. B. XX',
    'XX R. G. B. Y. XX',
    'XX R. R. R. B. XX',
  ], { left: 1, right: 1 });
  assert.ok(find(b, s, 'tCheckeredRow', idx(b, 0, 1)));
  assert.equal(find(b, s, 'tCheckeredRow', idx(b, 1, 1)), null, 'more than two colors');
  assert.ok(find(b, s, 'tMotleyRow', idx(b, 1, 1)));
  assert.ok(find(b, s, 'tMajorityRow', idx(b, 2, 1)), 'three reds of four');
  assert.equal(find(b, s, 'tBookends', idx(b, 2, 1)), null, 'R…B ends differ');
  assert.ok(find(b, s, 'tBookends', idx(b, 1, 1)) === null, 'R…Y ends differ');
  assert.equal(goalFeasible(GOAL_BY_ID.tRainbowRow, s, b), false, 'only 4 open columns for 5 colors');
  assert.equal(goalFeasible(GOAL_BY_ID.tFillRow, s, b), true);
});

test('blocks and pluses: square, rainbow square, flower, cross', () => {
  const s = tileSettings();
  const sq = tileBoard(['R. Rd', 'Rt R.']);
  assert.ok(find(sq, s, 'tSquare', 3));
  assert.equal(find(sq, s, 'tBlankSquare', 3), null);
  assert.ok(find(tileBoard(['R. B.', 'G. Y.']), s, 'tRainbowSquare', 0));
  const flower = tileBoard([
    '.. B. ..',
    'B. R. B.',
    '.. B. ..',
  ]);
  assert.ok(find(flower, s, 'tFlower', idx(flower, 1, 1)));
  assert.ok(find(flower, s, 'tFlower', idx(flower, 0, 1)), 'a petal counts as the placed tile');
  assert.equal(find(flower, s, 'tCross', idx(flower, 1, 1)), null);
  const cross = tileBoard(['.. G. ..', 'G. G. G.', '.. G. ..']);
  assert.ok(find(cross, s, 'tCross', idx(cross, 2, 1)));
  assert.equal(goalFeasible(GOAL_BY_ID.tFlower, s, { ...cross, inset: { top: 0, bottom: 1, left: 0, right: 0 } }), false);
});

test('board-wide goals count anywhere and return every matching tile', () => {
  const s = tileSettings();
  const b = tileBoard([
    'R. .. Rd .. ..',
    '.. Rt .. R. ..',
    'Rs .. .. .. R.',
  ]);
  const flood = find(b, s, 'tFlood', idx(b, 2, 4));
  assert.ok(flood);
  assert.equal(flood.length, 6, 'all six reds clear');
  const b2 = tileBoard(['Rs B. Gs', '.. Ps ..']);
  assert.ok(find(b2, s, 'tStarfield', idx(b2, 1, 1)));
  assert.equal(find(b2, s, 'tStarfield', idx(b2, 0, 1)), null, 'the placed tile must be a star');
  const noMust = tileSettings({ mustIncludePlaced: false });
  assert.ok(find(b2, noMust, 'tStarfield', idx(b2, 0, 1)));
});

test('a goal that stops fitting between the walls is swapped for free', () => {
  const s = tileSettings({ gridW: 5, gridH: 5, wallMode: 'off', curseCount: 0, minCells: 1 });
  const g = new Game(s, 'swap');
  g.goals.top = { def: GOAL_BY_ID.tRainbowRow, side: 'top', duration: 40, timeLeft: 33, id: 999 };
  g.advanceWall('left', 'test');
  assert.notEqual(g.goals.top.def.id, 'tRainbowRow', 'Rainbow Row needs 5 columns');
  assert.equal(g.goals.top.timeLeft, 33, 'the replacement keeps the remaining time');
  assert.ok(g.drain().some((e) => e.type === 'goalSwap'));
});

test('every tile goal has a family and a detail, and the walls stay family-distinct', () => {
  const s = tileSettings();
  for (const d of GOAL_DEFS.filter((x) => goalDeck(x) === 'tiles')) assert.ok(goalFamilies(d).length > 0, d.id);
  for (let n = 0; n < 30; n++) {
    const g = new Game(s, 'tfam' + n);
    const fams = Object.values(g.goals).filter(Boolean).flatMap((x) => goalFamilies(x.def));
    assert.equal(new Set(fams).size, fams.length, `families overlap in game ${n}: ${fams.join(',')}`);
  }
});

test('the bot plays a full tile game and rebuilds the deck around kept tiles at level up', () => {
  const g = new Game(tileSettings(), 'tilebot');
  const rng = makeRng(11);
  let n = 0;
  while (g.status !== 'over' && n < 1000) { if (!botStep(g, rng)) break; g.tick(1.5); n++; }
  assert.equal(g.status, 'over');
  assert.ok(g.placements > 10);

  const s = tileSettings({ mode: 'survival', clock: 'turns', levelTurns: 8, levelBoard: 'keep', wallMode: 'off', curseCount: 0 });
  const g2 = new Game(s, 'tilelevel');
  let guard = 0;
  while (g2.status === 'playing' && guard++ < 40) botStep(g2, rng);
  assert.equal(g2.status, 'levelup');
  const onBoard = g2.cells.filter((c) => c && c.kind === 'tile').length;
  assert.equal(g2.deck.filter((p) => p.kind === 'tile').length, 50 - onBoard, 'kept tiles are not duplicated in the new deck');
});

test('cleared tiles leave the board and crushed tiles go to the discard pile', () => {
  const s = tileSettings({ wallMode: 'off', curseCount: 0, gridW: 4, gridH: 4, minCells: 1 });
  const g = new Game(s, 'tileclear');
  g.goals.top = { def: GOAL_BY_ID.tTriplet, side: 'top', duration: 40, timeLeft: 40, id: 1 };
  g.goals.right = null; g.goals.bottom = null; g.goals.left = null;
  g.cells.fill(null);
  g.cells[0] = { kind: 'tile', color: 2, sym: 0, id: 500 };
  g.cells[1] = { kind: 'tile', color: 2, sym: 1, id: 501 };
  g.current = { kind: 'tile', color: 2, sym: 3, id: 502 };
  const discardBefore = g.discard.length;
  g.place(2);
  assert.equal(g.cells[0], null);
  assert.equal(g.cells[1], null);
  assert.equal(g.cells[2], null);
  assert.equal(g.discard.length, discardBefore + 3, 'the three tiles went to the discard pile');
  g.cells[4] = { kind: 'tile', color: 0, sym: 0, id: 600 };
  g.cells[5] = { kind: 'tile', color: 1, sym: 0, id: 601 };
  g.advanceWall('left', 'test');
  assert.equal(g.cells[4], null);
  assert.equal(g.stats.cardsCrushed, 1);
  assert.equal(g.discard.length, discardBefore + 4);
});
