import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSatisfying, GOAL_BY_ID, pathsThrough, groupsThrough, allGroups } from '../public/js/goals.js';
import { board, settings, idx } from './helpers.js';

const find = (b, s, id, placed) => findSatisfying(b, s, GOAL_BY_ID[id], placed);

test('pair: adjacent same rank clears, diagonal does not', () => {
  const b = board(['7S 7H ..', '.. .. ..', '.. .. 7D']);
  const s = settings();
  assert.deepEqual(find(b, s, 'pair', idx(b, 0, 0)).sort(), [0, 1]);
  assert.equal(find(b, s, 'pair', idx(b, 2, 2)), null);
});

test('flush follows a bent snake path', () => {
  const b = board([
    '2H 5H ..',
    '.. 9H ..',
    '.. KH ..',
  ]);
  const s = settings({ flushLen: 4 });
  const found = find(b, s, 'flush', idx(b, 2, 1));
  assert.ok(found, 'bent 4-chain of hearts should be a flush');
  assert.equal(found.length, 4);
  // placing a non-heart does not help
  b.cells[idx(b, 1, 0)] = null;
  assert.equal(find(b, s, 'flush', idx(b, 0, 0)).length, 4);
});

test('placed card must be part of the chain when mustIncludePlaced is on', () => {
  const b = board([
    '2H 5H 9H KH',
    '.. .. .. 3C',
  ]);
  const s = settings({ flushLen: 4, mustIncludePlaced: true });
  assert.equal(find(b, s, 'flush', idx(b, 1, 3)), null);
  const s2 = settings({ flushLen: 4, mustIncludePlaced: false });
  assert.ok(find(b, s2, 'flush', idx(b, 1, 3)));
});

test('plus shape: not a snake path, but a valid connected group', () => {
  const b = board([
    '.. 2H ..',
    '3H 4H 5H',
    '.. 6H ..',
  ]);
  const center = idx(b, 1, 1);
  const path = settings({ flushLen: 5, chainShape: 'path' });
  const group = settings({ flushLen: 5, chainShape: 'group' });
  assert.equal(find(b, path, 'flush', center), null);
  const g = find(b, group, 'flush', center);
  assert.ok(g);
  assert.equal(g.length, 5);
});

test('group enumeration counts connected sets containing the root exactly once', () => {
  const b = board(['2H 3H 4H', '5H 6H 7H', '8H 9H 10H']);
  const seen = new Set();
  let n = 0;
  groupsThrough(b, 0, 3, (idxs) => { n++; seen.add(idxs.slice().sort((a, b2) => a - b2).join(',')); return false; });
  assert.equal(n, seen.size, 'no duplicates');
  assert.equal(n, 5); // corner cell of a 3x3: 5 trominoes contain it
  let all = 0;
  allGroups(b, 2, () => { all++; return false; });
  assert.equal(all, 12); // dominoes on a 3x3 board
});

test('path enumeration finds every self-avoiding walk through a cell', () => {
  const b = board(['2H 3H 4H', '5H 6H 7H', '8H 9H 10H']);
  const paths = new Set();
  pathsThrough(b, 4, 3, (p) => { paths.add(p.join(',')); return false; });
  // 3-cell paths through the center of a 3x3 grid: center in the middle (6 straight/bent) or at an end (8 more, times direction)
  // Count undirected paths: center-middle: C(4,2)=6; center-end: 4 directions × 2 continuations = 8 → 14 undirected, 28 directed.
  assert.equal(paths.size, 28);
});

test('straight: unordered set vs ordered along chain, ace low and high', () => {
  const b = board(['5S 3H 4D 6C', '.. .. .. ..']);
  const unordered = settings({ straightLen: 4, straightOrdered: false });
  const ordered = settings({ straightLen: 4, straightOrdered: true });
  assert.ok(find(b, unordered, 'straight', 0));
  assert.equal(find(b, ordered, 'straight', 0), null);
  const b2 = board(['QS KH AD 2C']);
  assert.ok(find(b2, settings({ straightLen: 3 }), 'straight', 0), 'Q-K-A is a straight');
  assert.equal(find(b2, settings({ straightLen: 4 }), 'straight', 0), null, 'K-A-2 does not wrap');
  const b3 = board(['AS 2H 3D']);
  assert.ok(find(b3, ordered, 'rankLadder', 0) || find(b3, settings({ straightLen: 3, straightOrdered: true }), 'straight', 0));
});

test('two pair, full house, four of a kind, royal flush', () => {
  const s = settings();
  assert.ok(find(board(['9S 9H 4D 4C']), s, 'twoPair', 0));
  assert.equal(find(board(['9S 9H 9D 4C']), s, 'twoPair', 0), null);
  assert.ok(find(board(['9S 9H 9D 4C 4S']), s, 'fullHouse', 0));
  assert.ok(find(board(['9S 9H 9D 9C']), s, 'fourKind', 0));
  assert.ok(find(board(['10H JH QH KH AH']), s, 'royalFlush', 2));
  assert.equal(find(board(['10H JH QS KH AH']), s, 'royalFlush', 2), null);
});

test('blackjack accepts any chain length in range with a soft ace', () => {
  const s = settings();
  assert.ok(find(board(['AS KH']), s, 'blackjack', 0));
  assert.ok(find(board(['7S 7H 7D']), s, 'blackjack', 1));
  assert.equal(find(board(['7S 7H']), s, 'blackjack', 1), null);
  assert.ok(find(board(['5S 10H']), s, 'fifteen', 0));
});

test('rows respect the walls: only open cells count, and lineMinLen applies', () => {
  const b = board([
    '2S 3H 4D 5C',
    'XX 6S 7H ..',
    '8S 9H 10D JC',
  ], { left: 1, right: 1 });
  const s = settings({ lineMinLen: 2 });
  // row 1 open cells are cols 1..2 → 6S 7H : full row
  assert.deepEqual(find(b, s, 'fillRow', idx(b, 1, 1)), [5, 6]);
  // row 2 open cells: 9H 10D → light row? pips 9+10=19 > 4*2, no; heavy row 19 >= 18 yes
  assert.ok(find(b, s, 'heavyRow', idx(b, 2, 2)));
  assert.equal(find(b, s, 'lightRow', idx(b, 2, 2)), null);
  // column 1 open rows 0..2: 3H 6S 9H → fill column yes, suited no
  assert.ok(find(b, s, 'fillCol', idx(b, 1, 1)));
  assert.equal(find(b, s, 'suitedCol', idx(b, 1, 1)), null);
  const strict = settings({ lineMinLen: 3 });
  assert.equal(find(b, strict, 'fillRow', idx(b, 1, 1)), null);
});

test('curses block rows and chains', () => {
  const b = board(['2H XX 3H']);
  const s = settings();
  assert.equal(find(b, s, 'fillRow', 0), null);
  assert.equal(find(b, s, 'pair', 0), null);
});

test('straight-line goals need a straight segment', () => {
  const s = settings();
  const bent = board(['2H 3H ..', '.. 4H ..']);
  assert.equal(find(bent, s, 'suitedLine', idx(bent, 1, 1)), null);
  const straight = board(['2H 3H 4H']);
  assert.ok(find(straight, s, 'suitedLine', 1));
  assert.ok(find(straight, s, 'rankLadder', 1));
  const col = board(['4C', '3C', '2C']);
  assert.ok(find(col, s, 'rankLadder', 1));
});

test('zebra needs alternation along the path', () => {
  const s = settings();
  assert.ok(find(board(['2H 3S 4D 5C']), s, 'zebra', 0));
  assert.equal(find(board(['2H 3D 4S 5C']), s, 'zebra', 0), null);
});
