import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/js/engine.js';
import { settings, parseCard } from './helpers.js';
import { defaultSettings, normalizeSettings } from '../public/js/settings.js';
import { GOAL_BY_ID } from '../public/js/goals.js';
import { makeCard, makeCurse } from '../public/js/cards.js';
import { botStep } from '../public/js/bot.js';
import { makeRng } from '../public/js/rng.js';
import * as awaitGoals from '../public/js/goals.js';

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
  s.curseCount = 0;
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
  assert.equal(g.streak, 1);
});

test('a combo (2+ goals in one placement) applies the multiplier and perks', () => {
  const s = onlyGoals(['pair', 'fillRow']);
  s.gridW = 3; s.gridH = 3; s.comboMult = 2; s.perkExtraWard = true; s.perkPurgeDeckCurses = 0; s.allowDuplicateGoals = false;
  const g = new Game(s, 'multi');
  // Arrange goals: pair on top, fillRow on right
  g.goals.top = { def: g.goalPool().find((d) => d.id === 'pair'), side: 'top', duration: 40, timeLeft: 40, id: 1 };
  g.goals.right = { def: g.goalPool().find((d) => d.id === 'fillRow'), side: 'right', duration: 40, timeLeft: 40, id: 2 };
  g.goals.bottom = null; g.goals.left = null;
  g.cells.fill(null);
  g.cells[0] = makeCard(9, 1, 1); g.cells[1] = makeCard(5, 0, 2);
  g.current = makeCard(5, 2, 3);
  g.wards = 0; g.streak = 0;
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
  const s = settings({ clock: 'time', goalSeconds: 10, wallMode: 'goal', expiredGoalPenalty: 'wall', pressureRamp: 1 });
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
  const s = onlyGoals(['pair', 'fillRow', 'fillCol', 'parity']);
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
  const s = settings({ clock: 'time', gridW: 3, gridH: 3, wallMode: 'goal', goalSeconds: 10, curseCount: 0, minCells: 1, pressureRamp: 1, crushCheck: 'off' });
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


test('wards can replace a goal (keeping its time) and push a wall back', () => {
  const s = settings({ wardCostReroll: 1, wardCostRetreat: 2, rerollTimer: 'keep', wallMode: 'off', curseCount: 0 });
  const g = new Game(s, 'wardsx');
  g.wards = 3;
  const before = g.goals.top;
  before.timeLeft = 12.5;
  assert.equal(g.wardReroll('top'), true);
  assert.notEqual(g.goals.top.def.id, before.def.id, 'a different goal is drawn');
  assert.equal(g.goals.top.timeLeft, 12.5, 'remaining time carries over');
  assert.equal(g.wards, 2);
  assert.equal(g.wardRetreat('left'), false, 'nothing to push back yet');
  g.advanceWall('left', 'test');
  assert.equal(g.inset.left, 1);
  assert.equal(g.wardRetreat('left'), true);
  assert.equal(g.inset.left, 0);
  assert.equal(g.wards, 0);
  assert.equal(g.wardReroll('top'), false, 'no wards left');
  const ev = g.drain();
  assert.ok(ev.some((e) => e.type === 'reroll'));
  assert.ok(ev.some((e) => e.type === 'retreat' && e.reason === 'ward'));
});

test('a fresh-timer reroll resets the clock and a cost of 0 disables the use', () => {
  const s = settings({ wardCostReroll: 1, rerollTimer: 'reset', wardCostRetreat: 0, wallMode: 'off', curseCount: 0 });
  const g = new Game(s, 'wardsy');
  g.wards = 5;
  g.goals.top.timeLeft = 2;
  g.wardReroll('top');
  assert.equal(g.goals.top.timeLeft, g.goals.top.duration);
  g.advanceWall('top', 'test');
  assert.equal(g.wardRetreat('top'), false, 'retreat disabled by cost 0');
  assert.equal(g.wards, 4);
});

test('similar goals (same family) do not share the walls', () => {
  const { GOAL_DEFS, goalFamilies } = awaitGoals;
  const s = settings({ avoidSimilarGoals: true, allowDuplicateGoals: false });
  for (let n = 0; n < 40; n++) {
    const g = new Game(s, 'fam' + n);
    const fams = Object.values(g.goals).filter(Boolean).flatMap((x) => goalFamilies(x.def));
    assert.equal(new Set(fams).size, fams.length, `families overlap in game ${n}: ${fams.join(',')}`);
  }
  assert.ok(GOAL_DEFS.every((d) => goalFamilies(d).length > 0), 'every goal has a family');
});

test('a banked ward that can push a wall back keeps a full board alive', () => {
  const s = settings({ gridW: 3, gridH: 3, wallMode: 'off', curseCount: 0, minCells: 1, wardCostRetreat: 1 });
  const g = new Game(s, 'retreatlive');
  g.advanceWall('top', 'test');
  for (let i = 3; i < 9; i++) g.cells[i] = makeCard(2 + (i % 9), i % 4, 100 + i);
  g.wards = 1;
  g.current = null;
  g.draw();
  assert.equal(g.status, 'playing', 'the player can buy the top row back');
});


test('new defaults: turn clock, 15 curses, two upcoming, curse with no cell ends the game, no wall push-back', () => {
  const d = defaultSettings();
  assert.equal(d.clock, 'turns');
  assert.equal(d.goalTurns, 15);
  assert.equal(d.curseCount, 15);
  assert.equal(d.peekCount, 2);
  assert.equal(d.curseOnNoSpace, 'gameover');
  assert.equal(d.wardCostRetreat, 0);
  assert.equal(d.numCopies, 2);
  assert.equal(d.crushCheck, 'all');
});

test('a replaced goal can keep its time plus a bonus, even beyond the base timer', () => {
  const s = settings({ clock: 'turns', goalTurns: 10, rerollTimer: 'add', rerollBonus: 5, wallMode: 'off', curseCount: 0 });
  const g = new Game(s, 'addbonus');
  g.wards = 2;
  g.goals.top.timeLeft = 3;
  assert.equal(g.wardReroll('top'), true);
  assert.equal(g.goals.top.timeLeft, 8, '3 remaining + 5 bonus');
  g.goals.top.timeLeft = 9;
  g.wardReroll('top');
  assert.equal(g.goals.top.timeLeft, 14, 'the bonus may exceed the base duration');
  assert.equal(g.goals.top.duration, 14, 'the bar scales to the longer timer');
});

test('after a wall crushes a column, a row that became full clears without a placement', () => {
  const s = settings({ gridW: 4, gridH: 3, wallMode: 'off', curseCount: 0, minCells: 1, lineMinLen: 2, crushCheck: 'all' });
  const g = new Game(s, 'crushclear');
  g.goals.top = { def: GOAL_BY_ID.fillRow, side: 'top', duration: 15, timeLeft: 15, id: 1 };
  g.goals.right = null; g.goals.bottom = null; g.goals.left = null;
  g.cells.fill(null);
  // row 0: three cards, the fourth (rightmost) cell empty; the right wall will crush that column
  g.cells[0] = makeCard(2, 0, 1); g.cells[1] = makeCard(5, 1, 2); g.cells[2] = makeCard(9, 2, 3);
  g.streak = 2;
  const before = g.score;
  g.advanceWall('right', 'test');
  assert.equal(g.cells[0], null, 'the completed row cleared');
  assert.ok(g.score > before);
  assert.equal(g.streak, 2, 'a wall clear does not touch the streak');
  assert.equal(g.stats.wallClears, 1);
  const ev = g.drain().find((e) => e.type === 'clear');
  assert.equal(ev.source, 'wall');
  assert.notEqual(g.goals.top.def.id, 'fillRow', 'a fresh goal was drawn');

  const s2 = settings({ gridW: 4, gridH: 3, wallMode: 'off', curseCount: 0, minCells: 1, lineMinLen: 2, crushCheck: 'off' });
  const g2 = new Game(s2, 'crushoff');
  g2.goals.top = { def: GOAL_BY_ID.fillRow, side: 'top', duration: 15, timeLeft: 15, id: 1 };
  g2.goals.right = null; g2.goals.bottom = null; g2.goals.left = null;
  g2.cells.fill(null);
  g2.cells[0] = makeCard(2, 0, 1); g2.cells[1] = makeCard(5, 1, 2); g2.cells[2] = makeCard(9, 2, 3);
  g2.advanceWall('right', 'test');
  assert.ok(g2.cells[0], 'nothing clears when the check is off');
});

test('the lines-only crush check ignores chain goals the board already satisfies', () => {
  const s = settings({ gridW: 4, gridH: 3, wallMode: 'off', curseCount: 0, minCells: 1, crushCheck: 'lines' });
  const g = new Game(s, 'crushlines');
  g.goals.top = { def: GOAL_BY_ID.pair, side: 'top', duration: 15, timeLeft: 15, id: 1 };
  g.goals.right = null; g.goals.bottom = null; g.goals.left = null;
  g.cells.fill(null);
  g.cells[4] = makeCard(7, 0, 1); g.cells[5] = makeCard(7, 1, 2);
  g.advanceWall('top', 'test');
  assert.ok(g.cells[4] && g.cells[5], 'the pair stays: chains are not part of the lines-only check');
  const s3 = settings({ gridW: 4, gridH: 3, wallMode: 'off', curseCount: 0, minCells: 1, crushCheck: 'all' });
  const g3 = new Game(s3, 'crushall');
  g3.goals.top = { def: GOAL_BY_ID.pair, side: 'top', duration: 15, timeLeft: 15, id: 1 };
  g3.goals.right = null; g3.goals.bottom = null; g3.goals.left = null;
  g3.cells.fill(null);
  g3.cells[4] = makeCard(7, 0, 1); g3.cells[5] = makeCard(7, 1, 2);
  g3.advanceWall('top', 'test');
  assert.equal(g3.cells[4], null, 'with every goal checked, the pair clears');
});


test('wards can extend the current goal by the configured bonus', () => {
  const s = settings({ clock: 'turns', goalTurns: 10, wardCostExtend: 1, extendBonus: 4, wallMode: 'off', curseCount: 0 });
  const g = new Game(s, 'extend');
  g.wards = 1;
  const id = g.goals.top.id;
  g.goals.top.timeLeft = 3;
  assert.equal(g.wardExtend('top'), true);
  assert.equal(g.goals.top.id, id, 'the goal itself stays');
  assert.equal(g.goals.top.timeLeft, 7);
  assert.equal(g.wards, 0);
  assert.equal(g.wardExtend('top'), false, 'no wards left');
  assert.ok(g.drain().some((e) => e.type === 'extend' && e.bonus === 4));
  const off = settings({ wardCostExtend: 0, wallMode: 'off', curseCount: 0 });
  const g2 = new Game(off, 'extendoff');
  g2.wards = 3;
  assert.equal(g2.wardExtend('top'), false, 'cost 0 disables the use');
  assert.equal(g2.wards, 3);
});

test('undo restores the board, timers, stats and the random state', () => {
  const s = settings({ clock: 'turns', curseCount: 8, wallMode: 'goal', goalTurns: 4 });
  const g = new Game(s, 'undo-seed');
  const rng = makeRng(3);
  botStep(g, rng); botStep(g, rng);
  const snap = g.snapshot();
  const before = { cells: g.cells.map((c) => (c ? c.id : null)), deck: g.deck.map((c) => c.id), current: g.current.id, score: g.score, wards: g.wards, goals: Object.values(g.goals).map((x) => x && x.id), rng: g.rng.state(), placements: g.placements };
  // play on, then rewind
  for (let i = 0; i < 6; i++) botStep(g, rng);
  g.restore(snap);
  const after = { cells: g.cells.map((c) => (c ? c.id : null)), deck: g.deck.map((c) => c.id), current: g.current.id, score: g.score, wards: g.wards, goals: Object.values(g.goals).map((x) => x && x.id), rng: g.rng.state(), placements: g.placements };
  assert.deepEqual(after, before);
  // replaying the same move from the restored state reproduces the same outcome
  const cell = g.emptyCells()[0];
  const g2 = new Game(s, 'undo-seed');
  const rng2 = makeRng(3);
  botStep(g2, rng2); botStep(g2, rng2);
  g.place(cell); g2.place(cell);
  assert.deepEqual(g.deck.map((c) => c.id), g2.deck.map((c) => c.id), 'the draw after undo is the same draw');
  assert.equal(g.current.id, g2.current.id);
});

test('a ward can skip the upcoming tiles, dodging a visible curse', () => {
  const s = settings({ peekCount: 2, wardCostRefresh: 1, wallMode: 'off', curseCount: 0, cursesReturn: true });
  const g = new Game(s, 'refresh');
  const top = g.deck[g.deck.length - 1], second = g.deck[g.deck.length - 2];
  g.deck[g.deck.length - 1] = { kind: 'curse', id: 4242 };
  g.wards = 1;
  const deckBefore = g.deck.length, discardBefore = g.discard.length, current = g.current;
  assert.equal(g.wardRefresh(), true);
  assert.equal(g.deck.length, deckBefore - 2, 'the two shown tiles left the deck');
  assert.equal(g.discard.length, discardBefore + 2, 'both went to the discard pile (curses return)');
  assert.ok(g.deck.every((c) => c.id !== second.id && c.id !== 4242));
  assert.equal(g.current, current, 'the drawn tile is untouched');
  assert.equal(g.wards, 0);
  assert.equal(g.wardRefresh(), false, 'no wards left');
  assert.ok(g.drain().some((e) => e.type === 'refresh' && e.count === 2));
  const s2 = settings({ wardCostRefresh: 0, wallMode: 'off', curseCount: 0 });
  const g2 = new Game(s2, 'refresh2');
  g2.wards = 3;
  assert.equal(g2.wardRefresh(), false, 'cost 0 disables the use');
  assert.equal(defaultSettings().undoLimit, 50, 'undo defaults to the unlimited sentinel');
  assert.equal(defaultSettings().wardCostRefresh, 1);
});

test('goals cycle through the whole pool before repeating, and a wall never gets the same goal back to back', () => {
  const { GOAL_BY_ID: BY, GOAL_DEFS: DEFS, goalDeck } = awaitGoals;
  const s = { ...defaultSettings(), deckType: 'num', wallMode: 'off', curseCount: 0, goalCycle: true, gridW: 8, gridH: 8 };
  const g = new Game(s, 'cycle');
  const nonRepeatable = DEFS.filter((d) => goalDeck(d) === 'num' && !d.repeatable && s.goalsEnabled[d.id] !== false).length;
  const seen = [];
  let prev = g.goals.top.def.id;
  for (let i = 0; i < 90; i++) {
    g.newGoal('top');
    const id = g.goals.top.def.id;
    assert.notEqual(id, prev, 'a replaced goal differs from the outgoing one');
    prev = id;
    seen.push(id);
  }
  const counts = {};
  for (const id of seen) if (!BY[id].repeatable) counts[id] = (counts[id] || 0) + 1;
  const dupes = Object.entries(counts).filter(([, n]) => n > 1);
  assert.ok(nonRepeatable > 100, 'the numbered pool is large enough for this test');
  assert.deepEqual(dupes, [], 'no non-repeatable goal appeared twice within the first cycle');
  assert.ok(g.goalDeck.includes('nFillRow') || g.goalDeck.includes('nFillCol') || seen.some((id) => BY[id].repeatable), 'repeatable goals stay in the deck');
  // Keep drawing: the first repeat of a non-repeatable goal only comes once the
  // cycle is exhausted (the four opening goals came from the same deck, and a
  // few cards can be held back because they sit on another wall right now).
  const seenSet = new Set([...seen, ...Object.values(g.goals).map((x) => x.def.id)]);
  let draws = seen.length, firstRepeatAt = -1;
  while (firstRepeatAt < 0 && draws < nonRepeatable + 20) {
    g.newGoal('top');
    draws++;
    const id = g.goals.top.def.id;
    if (!BY[id].repeatable && seenSet.has(id)) firstRepeatAt = draws;
    seenSet.add(id);
  }
  assert.ok(firstRepeatAt >= nonRepeatable - 8, `first repeat came at draw ${firstRepeatAt} of a ${nonRepeatable}-goal pool`);
  const snap = g.snapshot();
  g.newGoal('top');
  g.restore(snap);
  assert.deepEqual(g.goalDeck, snap.goalDeck, 'undo restores the goal deck too');
});

test('renamed settings keys (multiMult, comboEnabled, comboBonus) still load from old saves and links', () => {
  const s = normalizeSettings({ multiMult: 3, comboEnabled: false, comboBonus: 0.5 });
  assert.equal(s.comboMult, 3);
  assert.equal(s.streakEnabled, false);
  assert.equal(s.streakBonus, 0.5);
  assert.equal(normalizeSettings({ multiMult: 3, comboMult: 1.5 }).comboMult, 1.5, 'a new key wins over an old one');
});

test('combo and streak multiply together: 50 + 100 + 200 at once is ×4, and a streak of 1 adds ×1.25', () => {
  const s = onlyGoals(['pair', 'fillRow']);
  s.gridW = 3; s.gridH = 3; s.comboMult = 2; s.streakEnabled = true; s.streakBonus = 0.25; s.perkPurgeDeckCurses = 0; s.allowDuplicateGoals = false;
  s.goalPoints = { ...s.goalPoints, pair: 50, fillRow: 100 };
  const g = new Game(s, 'combo-streak');
  g.goals.top = { def: g.goalPool().find((d) => d.id === 'pair'), side: 'top', duration: 40, timeLeft: 40, id: 1 };
  g.goals.right = { def: g.goalPool().find((d) => d.id === 'fillRow'), side: 'right', duration: 40, timeLeft: 40, id: 2 };
  g.goals.bottom = null; g.goals.left = null;
  g.cells.fill(null);
  g.cells[0] = makeCard(9, 1, 1); g.cells[1] = makeCard(5, 0, 2);
  g.current = makeCard(5, 2, 3);
  g.streak = 1; // the previous placement cleared something
  const before = g.score;
  g.place(2);
  const ev = g.drain().find((e) => e.type === 'clear');
  assert.equal(ev.n, 2);
  assert.equal(ev.comboMult, 2);
  assert.equal(ev.streakMult, 1.25);
  assert.equal(ev.points, Math.round((50 + 100) * 2 * 1.25));
  assert.equal(g.score, before + 375);
  assert.equal(g.streak, 2, 'the streak grows by one per clearing placement, whatever the size of the combo');
});

// ---------- choosing which tiles clear a goal ----------
const twoWayPair = (overrides = {}) => {
  const s = { ...onlyGoals(['pair']), curseCount: 0, chooseClears: true, ...overrides };
  const g = new Game(s, 'choose');
  g.goals.right = null; g.goals.bottom = null; g.goals.left = null;
  g.cells.fill(null);
  // 7S at (0,0) and 7D at (0,2); placing a 7H at (0,1) makes a pair either way.
  g.cells[0] = makeCard(7, 0, 900); g.cells[2] = makeCard(7, 2, 902);
  g.current = makeCard(7, 1, 901);
  g.drain();
  return g;
};

test('findAllSatisfying lists every distinct set once, in search order', () => {
  const g = twoWayPair();
  g.cells[1] = g.current;
  const sets = awaitGoals.findAllSatisfying(g, g.s, GOAL_BY_ID.pair, 1);
  assert.deepEqual(sets.map((x) => x.slice().sort((a, b) => a - b)), [[0, 1], [1, 2]], 'the same pair reached from either end counts once');
  assert.deepEqual(awaitGoals.findSatisfying(g, g.s, GOAL_BY_ID.pair, 1).slice().sort((a, b) => a - b), [0, 1], 'the first set is the default choice');
});

test('a placement with two ways to clear a goal waits for the player, then resolves with the chosen set', () => {
  const g = twoWayPair();
  const before = g.score;
  assert.equal(g.place(1, { ask: true }), true);
  assert.equal(g.status, 'choosing');
  assert.equal(g.current, null, 'nothing is drawn while choosing');
  assert.equal(g.score, before, 'nothing scores while choosing');
  assert.ok(g.cells[0] && g.cells[2], 'no tile is removed while choosing');
  const ev = g.drain().find((e) => e.type === 'choose');
  assert.equal(ev.side, 'top'); assert.equal(ev.options, 2); assert.equal(ev.placedIdx, 1);
  assert.equal(g.choiceStep().choice, 0);
  assert.equal(g.selectChoice(5), false, 'out-of-range selections are refused');
  assert.equal(g.choose(1), true, 'take the second set');
  assert.equal(g.status, 'playing');
  assert.equal(g.pending, null);
  assert.equal(g.score, before + 10);
  assert.ok(g.cells[0], 'the 7S of the other option stays on the board');
  assert.equal(g.cells[1], null); assert.equal(g.cells[2], null);
  assert.ok(g.current, 'the next tile is drawn once the choice is made');
  const clear = g.drain().find((e) => e.type === 'clear');
  assert.deepEqual(clear.clears[0].cells.slice().sort((a, b) => a - b), [1, 2]);
  g.tick(1);
});

test('with the choose rule off, or without ask, the first set is taken at once', () => {
  let g = twoWayPair({ chooseClears: false });
  g.place(1, { ask: true });
  assert.equal(g.status, 'playing');
  assert.equal(g.cells[0], null, 'first set: the placed tile and its left neighbour'); assert.ok(g.cells[2]);
  g = twoWayPair();
  g.place(1);
  assert.equal(g.status, 'playing', 'bots and timeouts never ask');
  assert.equal(g.cells[0], null); assert.ok(g.cells[2]);
});

test('only one qualifying set: no choice is asked', () => {
  const g = twoWayPair();
  g.cells[2] = null;
  g.place(1, { ask: true });
  assert.equal(g.status, 'playing');
  assert.equal(g.cells[0], null);
});

test('autoChoose resolves a pending choice with the selected set, and undo restores the moment before the placement', () => {
  const g = twoWayPair();
  const snap = g.snapshot();
  g.place(1, { ask: true });
  assert.equal(g.status, 'choosing');
  const mid = g.snapshot();
  assert.equal(mid.status, 'choosing'); assert.equal(mid.pending.clears[0].sets.length, 2);
  g.restore(snap);
  assert.equal(g.status, 'playing'); assert.equal(g.pending, null); assert.ok(g.cells[0] && g.cells[2] && g.cells[1] == null && g.current);
  g.restore(mid);
  assert.equal(g.status, 'choosing');
  assert.equal(g.choiceStep().goal, g.goals.top, 'a restored choice points at the live goal');
  g.selectChoice(1);
  g.autoChoose();
  assert.equal(g.status, 'playing');
  assert.ok(g.cells[0]); assert.equal(g.cells[2], null);
});

test('timers do not run while a choice is pending', () => {
  const g = twoWayPair({ clock: 'time', goalSeconds: 30 });
  g.place(1, { ask: true });
  const left = g.goals.top.timeLeft, elapsed = g.elapsed;
  g.tick(5);
  assert.equal(g.goals.top.timeLeft, left);
  assert.equal(g.elapsed, elapsed);
});
