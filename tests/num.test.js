import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSatisfying, GOAL_BY_ID, GOAL_DEFS, goalDeck, goalFamilies, goalFeasible } from '../public/js/goals.js';
import { Game } from '../public/js/engine.js';
import { botStep } from '../public/js/bot.js';
import { makeRng } from '../public/js/rng.js';
import { numBoard, numSettings, idx } from './helpers.js';
import * as awaitGoals from '../public/js/goals.js';

const find = (b, s, id, placed) => findSatisfying(b, s, GOAL_BY_ID[id], placed);

test('the numbered deck is colors × 1..max × copies, and only numbered goals are offered', () => {
  const g = new Game(numSettings({ curseCount: 3, numCopies: 1 }), 'numdeck');
  const pieces = g.deck.concat(g.current ? [g.current] : [], g.cells.filter(Boolean));
  const tiles = pieces.filter((p) => p.kind === 'num');
  assert.equal(tiles.length, 45);
  for (let color = 0; color < 5; color++) {
    const ns = tiles.filter((t) => t.color === color).map((t) => t.n).sort((a, b) => a - b);
    assert.deepEqual(ns, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  const gd = new Game(numSettings({ curseCount: 0 }), 'numdefault');
  const td = gd.deck.concat(gd.current ? [gd.current] : [], gd.cells.filter(Boolean)).filter((p) => p.kind === 'num');
  assert.equal(td.length, 90, 'the default deck carries two copies of each tile');
  assert.ok(Object.values(g.goals).every((x) => goalDeck(x.def) === 'num'));
  const g2 = new Game(numSettings({ numCopies: 2, numMax: 6, numColors: 4, curseCount: 0 }), 'numdeck2');
  const t2 = g2.deck.concat(g2.current ? [g2.current] : [], g2.cells.filter(Boolean)).filter((p) => p.kind === 'num');
  assert.equal(t2.length, 48);
});

test('sums: exact targets with size ranges, featherweight and heavyweight', () => {
  const s = numSettings();
  assert.ok(find(numBoard(['R4 B6']), s, 'nSum10', 0));
  assert.ok(find(numBoard(['R2 B3 G5']), s, 'nSum10', 1));
  assert.equal(find(numBoard(['R4 B5']), s, 'nSum10', 0), null);
  assert.ok(find(numBoard(['R1 B2 G3 Y9']), s, 'nSum15', 0));
  assert.ok(find(numBoard(['R1 B2 G3 Y4']), s, 'nLowSum', 0));
  assert.equal(find(numBoard(['R1 B2 G3 Y7']), s, 'nLowSum', 0), null);
  assert.ok(find(numBoard(['R7 B8 G9']), s, 'nHighSum', 1));
  assert.ok(find(numBoard(['R4 B9 G2']), s, 'nSumLine15', 1));
});

test('products: factor chains and round products', () => {
  const s = numSettings();
  assert.ok(find(numBoard(['R3 B8']), s, 'nProd24', 0));
  assert.ok(find(numBoard(['R2 B3 G4']), s, 'nProd24', 2));
  assert.equal(find(numBoard(['R5 B5']), s, 'nProd24', 0), null);
  assert.ok(find(numBoard(['R4 B5 G5']), s, 'nProd100', 0));
  assert.ok(find(numBoard(['R2 B5 G7']), s, 'nRoundProduct', 1));
  assert.equal(find(numBoard(['R3 B5 G7']), s, 'nRoundProduct', 1), null, 'no even factor');
});

test('runs: any order vs staircase, skip run, doubling, color and rainbow runs', () => {
  const s = numSettings();
  assert.ok(find(numBoard(['R4 B6 G5']), s, 'nRun3', 0));
  assert.ok(find(numBoard(['R4 B6 G5 Y7']), s, 'nRun4', 0));
  assert.equal(find(numBoard(['R4 B6 G5 Y7']), s, 'nStaircase', 0), null, 'not in order');
  assert.ok(find(numBoard(['R4 B5 G6 Y7']), s, 'nStaircase', 0));
  assert.ok(find(numBoard(['R7 B6 G5 Y4']), s, 'nStaircase', 3), 'falling works too');
  assert.ok(find(numBoard(['R3 B7 G5']), s, 'nSkipRun', 0));
  assert.ok(find(numBoard(['R1 B2 G4']), s, 'nDoubling', 0));
  assert.ok(find(numBoard(['R8 B4 G2']), s, 'nDoubling', 0));
  assert.equal(find(numBoard(['R1 B4 G2']), s, 'nDoubling', 0), null);
  assert.ok(find(numBoard(['R3 R4 R5']), s, 'nColorRun', 1));
  assert.equal(find(numBoard(['R3 B4 R5']), s, 'nColorRun', 1), null);
  assert.ok(find(numBoard(['R3 B4 G5 Y6']), s, 'nRainbowRun', 1));
  assert.equal(find(numBoard(['R3 B4 R5 Y6']), s, 'nRainbowRun', 1), null);
  assert.ok(find(numBoard(['R5 B6 G7']), s, 'nLadderLine', 1));
});

test('poker hands on numbers, and Twins only exists with extra copies', () => {
  const s = numSettings();
  assert.ok(find(numBoard(['R7 B7 G7']), s, 'nThreeKind', 1));
  assert.ok(find(numBoard(['R7 B2 G7 Y2']), s, 'nTwoPair', 0));
  assert.ok(find(numBoard(['R7 B2 G7 Y2 P7']), s, 'nFullHouse', 0));
  const one = numSettings({ numCopies: 1 });
  const two = numSettings({ numCopies: 2 });
  const board = numBoard(['R7 R7 .. ..', '.. .. .. ..', '.. .. .. ..', '.. .. .. ..']);
  assert.equal(goalFeasible(GOAL_BY_ID.nColorPair, one, board), false);
  assert.equal(goalFeasible(GOAL_BY_ID.nColorPair, two, board), true);
  assert.ok(find(board, two, 'nColorPair', 0));
});

test('odds and evens: chains, lines and rows between walls', () => {
  const s = numSettings({ lineMinLen: 3 });
  assert.ok(find(numBoard(['R2 B4 G6 Y8']), s, 'nSameParity', 0));
  assert.ok(find(numBoard(['R1 B4 G7 Y8']), s, 'nZigzag', 0));
  assert.equal(find(numBoard(['R1 B3 G7 Y8']), s, 'nZigzag', 0), null);
  assert.ok(find(numBoard(['R2 B4 G6']), s, 'nEvenLine', 1));
  const b = numBoard([
    'XX R1 B3 G5 Y7 XX',
    'XX R2 B4 G6 Y9 XX',
  ], { left: 1, right: 1 });
  assert.ok(find(b, s, 'nOddRow', idx(b, 0, 1)));
  assert.equal(find(b, s, 'nEvenRow', idx(b, 1, 1)), null, 'a 9 spoils it');
});

test('number tricks: primes, squares, triples, nine lives', () => {
  const s = numSettings();
  assert.ok(find(numBoard(['R2 B7 G5']), s, 'nPrimes', 0));
  assert.equal(find(numBoard(['R2 B9 G5']), s, 'nPrimes', 0), null);
  assert.ok(find(numBoard(['R1 B4 G9']), s, 'nSquares', 0));
  assert.ok(find(numBoard(['R3 B9 G6']), s, 'nTriples', 0));
  assert.ok(find(numBoard(['R4 B5']), s, 'nNines', 0));
  assert.ok(find(numBoard(['R9 B9']), s, 'nNines', 0));
  assert.ok(find(numBoard(['R3 B6 G9']), s, 'nNines', 0), '3+6+9 = 18');
});

test('rows: sorted, round, twenty column, distinct, bookends', () => {
  const s = numSettings({ lineMinLen: 3 });
  const b = numBoard([
    'R2 B3 G5 Y8',
    'R4 B1 G3 Y2',
    'R9 B2 G7 Y9',
    'R5 B4 G1 Y1',
  ]);
  assert.ok(find(b, s, 'nSortedRow', 0));
  assert.equal(find(b, s, 'nSortedRow', idx(b, 1, 0)), null);
  assert.ok(find(b, s, 'nRoundRow', idx(b, 1, 0)), '4+1+3+2 = 10');
  assert.ok(find(b, s, 'nBookends', idx(b, 2, 0)), '9 at both ends');
  assert.equal(find(b, s, 'nDistinctRow', idx(b, 2, 0)), null);
  assert.ok(find(b, s, 'nDistinctRow', 0));
  assert.ok(find(b, s, 'nColumnSum', idx(b, 0, 0)), 'column 2+4+9+5 = 20');
});

test('blocks and pluses: twenty block, balanced block, summit, valley', () => {
  const s = numSettings();
  assert.ok(find(numBoard(['R3 B7', 'G6 Y4']), s, 'nSquare20', 0));
  assert.ok(find(numBoard(['R3 B6', 'G4 Y7']), s, 'nBalancedBlock', 3), '3+7 = 6+4');
  assert.equal(find(numBoard(['R3 B6', 'G4 Y8']), s, 'nBalancedBlock', 3), null);
  const plus = numBoard(['.. R2 ..', 'B3 G9 Y4', '.. P1 ..']);
  assert.ok(find(plus, s, 'nSummit', idx(plus, 1, 1)));
  assert.equal(find(plus, s, 'nValley', idx(plus, 1, 1)), null);
  const valley = numBoard(['.. R7 ..', 'B8 G2 Y9', '.. P5 ..']);
  assert.ok(find(valley, s, 'nValley', idx(valley, 0, 1)), 'a neighbour counts as the placed tile');
});

test('board-wide: sweep by number and full suit', () => {
  const s = numSettings();
  const b = numBoard([
    'R7 B2 G7 ..',
    '.. Y7 .. ..',
    'P7 .. .. ..',
  ]);
  const sweep = find(b, s, 'nNumberSweep', idx(b, 2, 0));
  assert.ok(sweep);
  assert.equal(sweep.length, 4);
  assert.equal(find(b, s, 'nNumberSweep', 1), null, 'placed tile must show the number');
  const suit = numBoard([
    'R1 R2 R3 B1',
    'R4 R5 R6 B2',
    'R7 R8 R9 B3',
  ]);
  const s6 = numSettings({ numMax: 9 });
  const found = find(suit, s6, 'nFullSuit', idx(suit, 2, 2));
  assert.ok(found);
  assert.equal(found.length, 9);
  assert.equal(find(suit, s6, 'nFullSuit', 3), null, 'blue is incomplete');
});

test('every numbered goal has a family and a detail; walls stay family-distinct; the bot completes a game', () => {
  const s = numSettings();
  for (const d of GOAL_DEFS.filter((x) => goalDeck(x) === 'num')) assert.ok(goalFamilies(d).length > 0, d.id);
  for (let n = 0; n < 30; n++) {
    const g = new Game(s, 'nfam' + n);
    const fams = Object.values(g.goals).filter(Boolean).flatMap((x) => goalFamilies(x.def));
    assert.equal(new Set(fams).size, fams.length, `families overlap in game ${n}: ${fams.join(',')}`);
  }
  const g = new Game(s, 'numbot');
  const rng = makeRng(5);
  let k = 0;
  while (g.status !== 'over' && k < 1500) { if (!botStep(g, rng)) break; g.tick(1.5); k++; }
  assert.equal(g.status, 'over');
  assert.ok(g.placements > 10);
});

test('new geometry goals: diagonal trio, elbow, wiggle', () => {
  const s = numSettings();
  const diag = numBoard(['R1 .. ..', '.. R5 ..', '.. .. R9']);
  assert.ok(find(diag, s, 'nDiagonalTrio', idx(diag, 1, 1)));
  assert.ok(find(diag, s, 'nDiagonalTrio', idx(diag, 2, 2)), 'any tile of the diagonal may be the placed one');
  const anti = numBoard(['.. .. B3', '.. B4 ..', 'B5 .. ..']);
  assert.ok(find(anti, s, 'nDiagonalRun', idx(anti, 0, 2)));
  const straight = numBoard(['G2 G7 G4']);
  assert.equal(find(straight, s, 'nElbow', 1), null, 'a straight trio is not an elbow');
  const bent = numBoard(['G2 G7', '.. G4']);
  assert.ok(find(bent, s, 'nElbow', idx(bent, 1, 1)));
  const wiggle = numBoard(['R1 B2 G3', '.. .. Y4']);
  assert.equal(find(wiggle, s, 'nWiggle', 0), null, 'right, right, down repeats a direction, so it is not a wiggle');
  const zig = numBoard(['R1 B2', 'Y4 G3']);
  assert.ok(find(zig, s, 'nWiggle', 0), 'right, down, left turns at every step');
});

test('placement goals: head count, echo, encore, exorcist, hermit, cornerstone', () => {
  const s = numSettings({ wallMode: 'off', curseCount: 0, gridW: 4, gridH: 4, minCells: 1 });
  const g = new Game(s, 'spot');
  const only = (id) => { g.goals.top = { def: GOAL_BY_ID[id], side: 'top', duration: 15, timeLeft: 15, id: 1 }; g.goals.right = null; g.goals.bottom = null; g.goals.left = null; };
  const tile = (color, n) => ({ kind: 'num', color, n, id: Math.floor(Math.random() * 1e9) });
  // Head Count: a 2 touching exactly two tiles
  only('nHeadCount');
  g.cells.fill(null);
  g.cells[1] = tile(0, 5); g.cells[4] = tile(1, 8);
  g.current = tile(2, 2);
  g.place(0);
  assert.equal(g.cells[0], null, 'placed tile cleared');
  assert.equal(g.cells[1], null, 'neighbour cleared');
  assert.equal(g.cells[4], null, 'neighbour cleared');
  // Echo: same number as the previous placement
  only('nEcho');
  g.cells.fill(null);
  g.current = tile(0, 7);
  g.place(5);
  only('nEcho');
  g.current = tile(3, 7);
  g.place(10);
  assert.equal(g.cells[5], null, 'previous tile cleared');
  assert.equal(g.cells[10], null, 'echo tile cleared');
  // Exorcist: touching a curse lifts it
  only('nExorcist');
  g.cells.fill(null);
  g.cells[6] = { kind: 'curse', id: 777 };
  g.current = tile(1, 3);
  g.place(5);
  assert.equal(g.cells[6], null, 'the curse is gone');
  assert.equal(g.cells[5], null, 'the placed tile is gone');
  // Hermit: no neighbours
  only('nHermit');
  g.cells.fill(null);
  g.current = tile(4, 9);
  g.place(0);
  assert.equal(g.cells[0], null);
  // Cornerstone: corner + same color neighbour
  only('nCornerstone');
  g.cells.fill(null);
  g.cells[1] = tile(2, 4);
  g.current = tile(2, 8);
  g.place(0);
  assert.equal(g.cells[1], null, 'the colour mate cleared with the corner tile');
});

test('board goals: clean sweep, picture frame, crossroads, double decker, full spectrum', () => {
  const s = numSettings({ numColors: 3, lineMinLen: 2 });
  const full = numBoard(['R1 B2 G3', 'B4 R5 G6', 'G7 B8 R9']);
  assert.equal(find(full, s, 'nCleanSweep', 4).length, 9);
  const frame = numBoard(['R1 B2 G3', 'B4 .. G6', 'G7 B8 R9']);
  assert.equal(find(frame, s, 'nPictureFrame', 0).length, 8);
  assert.equal(find(frame, s, 'nCleanSweep', 0), null);
  const cross = numBoard(['.. B2 ..', 'B4 R5 G6', '.. B8 ..']);
  assert.equal(find(cross, s, 'nCrossroads', 4).length, 5);
  assert.equal(find(cross, s, 'nCrossroads', 1), null, 'the placed tile must be at the crossing');
  const decker = numBoard(['R1 B2 G3', 'B4 R5 G6', '.. .. ..']);
  assert.equal(find(decker, s, 'nDoubleDecker', 0).length, 6);
  // curses count as filled cells for the fill goals, and are part of the cleared set
  const cursed = numBoard(['R1 B2 G3', 'B4 R5 G6', '.. .. ..']);
  cursed.cells[4] = { kind: 'curse' };
  assert.equal(find(cursed, s, 'nDoubleDecker', 0).length, 6);
  assert.ok(find(cursed, s, 'nDoubleDecker', 0).includes(4));
  assert.equal(find(cursed, numSettings({ numColors: 3, lineMinLen: 2, cursesFill: false }), 'nDoubleDecker', 0), null);
  const cursedFrame = numBoard(['R1 XX G3', 'B4 .. G6', 'G7 B8 R9']);
  cursedFrame.cells[1] = { kind: 'curse' };
  assert.equal(find(cursedFrame, s, 'nPictureFrame', 0).length, 8);
  assert.equal(find(cursedFrame, s, 'nCleanSweep', 0), null, 'the middle cell is still empty');
  const cursedCross = numBoard(['.. B2 ..', 'B4 R5 G6', '.. B8 ..']);
  cursedCross.cells[3] = { kind: 'curse' };
  assert.equal(find(cursedCross, s, 'nCrossroads', 4).length, 5);
  const spectrum = numBoard(['R7 .. B7', '.. G7 ..', '.. .. ..']);
  assert.equal(find(spectrum, s, 'nFullSpectrum', 4).length, 3);
  assert.equal(find(spectrum, s, 'nFullSpectrum', 0) && find(numBoard(['R7 .. B7']), s, 'nFullSpectrum', 0), null);
});

test('arithmetic novelties: split, times table, midpoint, fibonacci, odd one out, twin primes', () => {
  const s = numSettings();
  assert.ok(find(numBoard(['R2 B5 G3']), s, 'nSplit', 0));
  assert.equal(find(numBoard(['R2 B5 G4']), s, 'nSplit', 0), null);
  assert.ok(find(numBoard(['R2 B8 G4']), s, 'nTimesTable', 0));
  assert.ok(find(numBoard(['R3 B5 G7']), s, 'nMidpoint', 1));
  assert.equal(find(numBoard(['R3 B4 G7']), s, 'nMidpoint', 1), null);
  assert.ok(find(numBoard(['R3 B8 G5']), s, 'nFibonacci', 0));
  assert.ok(find(numBoard(['R1 B4 G6 Y8']), s, 'nOddOneOut', 0));
  assert.equal(find(numBoard(['R1 B3 G6 Y8']), s, 'nOddOneOut', 0), null);
  assert.ok(find(numBoard(['R5 B7']), s, 'nTwinPrimes', 0));
  assert.equal(find(numBoard(['R3 B7']), s, 'nTwinPrimes', 0), null);
  assert.ok(find(numBoard(['R3 B6', 'G4 Y5']), s, 'nDiagonalBlock', 0) === null);
  assert.ok(find(numBoard(['R3 B6', 'B4 R5']), s, 'nDiagonalBlock', 0));
  assert.ok(find(numBoard(['R3 B6', 'G4 Y5']), s, 'nCheckerBlock', 0), 'odd/even/even/odd checkerboard');
});

test('every numbered goal declares what it looks at, and flags match a few known cases', () => {
  const { goalUses } = awaitGoals;
  for (const d of GOAL_DEFS.filter((x) => goalDeck(x) === 'num')) assert.ok(d.uses && typeof d.uses.color === 'boolean' && typeof d.uses.num === 'boolean', d.id);
  assert.deepEqual(goalUses(GOAL_BY_ID.nFlush4), { color: true, num: false });
  assert.deepEqual(goalUses(GOAL_BY_ID.nSum10), { color: false, num: true });
  assert.deepEqual(goalUses(GOAL_BY_ID.nColorRun), { color: true, num: true });
  assert.deepEqual(goalUses(GOAL_BY_ID.nWiggle), { color: false, num: false });
  assert.deepEqual(goalUses(GOAL_BY_ID.tQuad), { color: true, num: false }, 'symbol-tile goals derive their flags from families');
});
