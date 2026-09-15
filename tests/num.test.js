import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSatisfying, GOAL_BY_ID, GOAL_DEFS, goalDeck, goalFamilies, goalFeasible } from '../public/js/goals.js';
import { Game } from '../public/js/engine.js';
import { botStep } from '../public/js/bot.js';
import { makeRng } from '../public/js/rng.js';
import { numBoard, numSettings, idx } from './helpers.js';

const find = (b, s, id, placed) => findSatisfying(b, s, GOAL_BY_ID[id], placed);

test('the numbered deck is colors × 1..max × copies, and only numbered goals are offered', () => {
  const g = new Game(numSettings({ curseCount: 3 }), 'numdeck');
  const pieces = g.deck.concat(g.current ? [g.current] : [], g.cells.filter(Boolean));
  const tiles = pieces.filter((p) => p.kind === 'num');
  assert.equal(tiles.length, 45);
  for (let color = 0; color < 5; color++) {
    const ns = tiles.filter((t) => t.color === color).map((t) => t.n).sort((a, b) => a - b);
    assert.deepEqual(ns, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
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
