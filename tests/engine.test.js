import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/js/engine.js';
import { settings, parseCard } from './helpers.js';
import { makeCard, makeCurse } from '../public/js/cards.js';
import { botStep } from '../public/js/bot.js';
import { makeRng } from '../public/js/rng.js';

const onlyGoals = (ids) => {
  const s = settings();
  for (const k of Object.keys(s.goalsEnabled)) s.goalsEnabled[k] = ids.includes(k);
  return s;
};

test('same seed and settings reproduce the same game', () => {
  const s = settings();
  const a = new Game(s, 'abc'), b = new Game(s, 'abc');
  assert.deepEqual(a.deck.map((c) => c.kind + c.rank + c.suit), b.deck.map((c) => c.kind + c.rank + c.suit));
  assert.deepEqual(Object.values(a.goals).map((g) => g.def.id), Object.values(b.goals).map((g) => g.def.id));
});

test('deck has 52 cards plus the configured curses', () => {
  const g = new Game(settings({ curseCount: 7, curseSpread: 'even' }), 'x');
  const total = g.deck.length + (g.current ? 1 : 0) + g.cells.filter(Boolean).length;
  assert.equal(total, 59);
  assert.equal(g.cursesInDeck() + g.curseCells().length, 7);
});

test('placing a card that completes a goal scores, removes the cards and grants a ward', () => {
  const s = onlyGoals(['pair']);
  s.wardsPerClear = 1;
  const g = new Game(s, 'seed');
  // Only one wall carries a goal, so a pair clears exactly one goal
  g.goals.right = null; g.goals.bottom = null; g.goals.left = null;
  // Force a known board: put a 7S at (0,0) and hand the player a 7H
  g.cells.fill(null);
  g.cells[0] = makeCard(7, 0, 900);
  g.current = makeCard(7, 1, 901);
  const before = g.score;
  assert.equal(g.place(1), true);
  assert.equal(g.score, before + 10);
  assert.equal(g.cells[0], null, 'cleared cards leave the board');
  assert.equal(g.cells[1], null);
  assert.equal(g.wards, 1);
  const ev = g.drain().find((e) => e.type === 'clear');
  assert.ok(ev);
  assert.equal(ev.n, 1);
  assert.equal(g.combo, 1);
});

test('multi-clear applies the multiplier and perks', () => {
  const s = onlyGoals(['pair', 'fillRow']);
  s.gridW = 3; s.gridH = 3; s.multiMult = 2; s.perkExtraWard = true; s.perkPurgeDeckCurses = 0; s.allowDuplicateGoals = false;
  const g = new Game(s, 'multi');
  // Arrange goals: pair on top, fillRow on right
  g.goals.top = { def: g.goalPool().find((d) => d.id === 'pair'), side: 'top', duration: 40, timeLeft: 40, id: 1 };
  g.goals.right = { def: g.goalPool().find((d) => d.id === 'fillRow'), side: 'right', duration: 40, timeLeft: 40, id: 2 };
  g.goals.bottom = null; g.goals.left = null;
  g.cells.fill(null);
  g.cells[0] = makeCard(9, 1, 1); g.cells[1] = makeCard(5, 0, 2);
  g.current = makeCard(5, 2, 3);
  g.wards = 0; g.combo = 0;
  g.place(2);
  const ev = g.drain().find((e) => e.type === 'clear');
  assert.equal(ev.n, 2);
  assert.equal(ev.points, (10 + 30) * 2);
  assert.equal(g.wards, 2 + 1, 'two clears plus the extra-ward perk');
});

test('spending a ward removes a curse; auto mode spends immediately', () => {
  const s = onlyGoals(['pair']);
  const g = new Game(s, 'ward');
  g.cells.fill(null);
  g.cells[5] = makeCurse(77);
  g.wards = 1;
  assert.equal(g.spendWard(5), true);
  assert.equal(g.cells[5], null);
  assert.equal(g.wards, 0);
  assert.equal(g.spendWard(5), false);

  const s2 = onlyGoals(['pair']); s2.wardSpend = 'auto'; s2.curseCount = 0;
  const g2 = new Game(s2, 'ward2');
  g2.goals.right = null; g2.goals.bottom = null; g2.goals.left = null;
  g2.cells.fill(null);
  g2.cells[8] = makeCurse(78);
  g2.cells[0] = makeCard(3, 0, 1);
  g2.current = makeCard(3, 3, 2);
  g2.place(1);
  assert.equal(g2.curseCells().length, 0, 'curse auto-removed after the clear');
  assert.equal(g2.wards, 0);
});

test('walls crush the outer line and end the game below minCells', () => {
  const s = settings({ gridW: 4, gridH: 4, minCells: 4, wallMode: 'off' });
  const g = new Game(s, 'walls');
  g.cells.fill(null);
  g.cells[0] = makeCard(2, 0, 1); g.cells[1] = makeCard(3, 0, 2);
  g.advanceWall('top', 'test');
  assert.equal(g.inset.top, 1);
  assert.equal(g.cells[0], null);
  assert.equal(g.stats.cardsCrushed, 2);
  assert.equal(g.discard.length >= 2, true);
  g.advanceWall('bottom', 'test');
  g.advanceWall('left', 'test');
  assert.equal(g.status, 'playing'); // 2 rows x 3 cols = 6 >= 4
  g.advanceWall('right', 'test'); // 2x2 = 4, still fine
  assert.equal(g.status, 'playing');
  g.advanceWall('top', 'test'); // 1x2 = 2 < 4
  assert.equal(g.status, 'over');
  assert.equal(g.overReason, 'crushed');
});

test('goal expiry moves its wall and draws a new goal (time clock)', () => {
  const s = settings({ goalSeconds: 10, wallMode: 'goal', expiredGoalPenalty: 'wall', pressureRamp: 1 });
  const g = new Game(s, 'expire');
  const before = g.goals.top.id;
  g.tick(9.5);
  assert.equal(g.inset.top, 0);
  g.tick(1);
  assert.equal(g.inset.top, 1, 'top wall moved in');
  assert.notEqual(g.goals.top.id, before, 'fresh goal on top');
  assert.equal(g.stats.goalsExpired >= 1, true);
});

test('turn clock ages goals per placement and skips the goal that was just cleared', () => {
  const s = onlyGoals(['pair', 'fillRow', 'fillCol', 'evens']);
  s.clock = 'turns'; s.goalTurns = 3; s.wallMode = 'goal'; s.pressureRamp = 1;
  const g = new Game(s, 'turns');
  g.cells.fill(null);
  g.current = makeCard(2, 0, 1);
  const tl = Object.fromEntries(Object.entries(g.goals).map(([k, v]) => [k, v.timeLeft]));
  g.place(g.emptyCells()[0]);
  for (const side of Object.keys(tl)) {
    const goal = g.goals[side];
    if (goal.timeLeft === goal.duration) continue; // it cleared and was replaced
    assert.equal(goal.timeLeft, tl[side] - 1);
  }
});

test('survival mode levels up and rebuilds the deck with more curses', () => {
  const s = settings({ mode: 'survival', clock: 'turns', levelTurns: 10, levelCurseGrowth: 2, levelBoard: 'clearCurses', wallMode: 'off' });
  const g = new Game(s, 'level');
  const rng = makeRng(1);
  let guard = 0;
  while (g.status === 'playing' && guard++ < 50) botStep(g, rng);
  assert.equal(g.status, 'levelup');
  assert.equal(g.level, 2);
  assert.equal(g.curseCount, s.curseCount + 2);
  assert.equal(g.curseCells().length, 0, 'curses removed at level up');
  const ev = g.drain().find((e) => e.type === 'levelup');
  assert.ok(ev);
  g.continueLevel();
  assert.equal(g.status, 'playing');
  assert.ok(g.current);
});

test('no empty cell for a drawn card ends the game unless wards can free a curse', () => {
  const s = settings({ gridW: 3, gridH: 3, wallMode: 'off', curseCount: 0 });
  const g = new Game(s, 'full');
  for (let i = 0; i < 9; i++) g.cells[i] = makeCard(2 + (i % 9), i % 4, 100 + i);
  g.current = null;
  g.draw();
  assert.equal(g.status, 'over');
  assert.equal(g.overReason, 'nospace');

  const g2 = new Game(s, 'full2');
  for (let i = 0; i < 9; i++) g2.cells[i] = makeCard(2 + (i % 9), i % 4, 100 + i);
  g2.cells[4] = makeCurse(5);
  g2.wards = 1;
  g2.current = null;
  g2.draw();
  assert.equal(g2.status, 'playing', 'a banked ward keeps the game alive');
});

test('deck reshuffles from the discard pile when enabled and ends otherwise', () => {
  const s = settings({ reshuffleDiscards: true, wallMode: 'off', curseCount: 0 });
  const g = new Game(s, 'shuffle');
  g.discard = [makeCard(4, 0, 1), makeCard(5, 1, 2)];
  g.deck = [];
  g.current = null;
  g.cells.fill(null);
  g.draw();
  assert.equal(g.stats.reshuffles, 1);
  assert.ok(g.current);
  const s2 = settings({ reshuffleDiscards: false, wallMode: 'off', curseCount: 0 });
  const g2 = new Game(s2, 'noshuffle');
  g2.deck = []; g2.current = null;
  g2.draw();
  assert.equal(g2.status, 'over');
  assert.equal(g2.overReason, 'deck');
});

test('bot plays a full default game to completion', () => {
  const g = new Game(settings(), 'botgame');
  const rng = makeRng(7);
  let n = 0;
  while (g.status !== 'over' && n < 1000) { if (!botStep(g, rng)) break; g.tick(1.5); n++; }
  assert.equal(g.status, 'over');
  assert.ok(g.placements > 10);
  assert.ok(g.score > 0);
});

test('a wall crushing the last empty cells while a card is held ends the game', () => {
  const s = settings({ gridW: 3, gridH: 3, wallMode: 'goal', goalSeconds: 10, curseCount: 0, minCells: 1, pressureRamp: 1 });
  const g = new Game(s, 'stuck');
  g.cells.fill(null);
  // Fill everything except one cell in the top row
  for (let i = 1; i < 9; i++) g.cells[i] = makeCard(2 + i, i % 4, 200 + i);
  g.current = makeCard(9, 0, 300);
  g.goals.top.timeLeft = 0.5;
  g.tick(1);
  assert.equal(g.inset.top, 1);
  assert.equal(g.status, 'over');
  assert.equal(g.overReason, 'nospace');
});
