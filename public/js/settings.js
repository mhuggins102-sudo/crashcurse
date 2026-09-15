// Every tunable variable lives here. The settings panel is generated from
// SETTINGS_SCHEMA, so adding a knob is a one-line change.

import { GOAL_DEFS } from './goals.js';

export const SETTINGS_SCHEMA = [
  {
    group: 'Board',
    items: [
      { key: 'gridW', label: 'Grid width', type: 'range', min: 3, max: 10, step: 1, def: 6 },
      { key: 'gridH', label: 'Grid height', type: 'range', min: 3, max: 10, step: 1, def: 6 },
      { key: 'minCells', label: 'Game over when open cells fall below', type: 'range', min: 1, max: 16, step: 1, def: 4,
        help: 'The walls have "crashed in" once fewer than this many cells remain between them.' },
    ],
  },
  {
    group: 'Deck & curses',
    items: [
      { key: 'deckType', label: 'Deck', type: 'select', def: 'num',
        options: [['num', 'Numbered tiles: 1–9 in colors'], ['tiles', 'Symbol tiles: colors and symbols'], ['cards', 'Playing cards']],
        help: 'Each deck has its own goal pool. The sliders below only apply to the chosen deck.' },
      { key: 'numColors', label: 'Numbered tiles: colors', type: 'range', min: 3, max: 6, step: 1, def: 5 },
      { key: 'numMax', label: 'Numbered tiles: highest number', type: 'range', min: 5, max: 9, step: 1, def: 9 },
      { key: 'numCopies', label: 'Numbered tiles: copies of each tile', type: 'range', min: 1, max: 3, step: 1, def: 2,
        help: 'The deck is colors × highest number × copies (90 by default). Twins needs 2 or more.' },
      { key: 'tileColors', label: 'Tile colors', type: 'range', min: 3, max: 6, step: 1, def: 5 },
      { key: 'tileBlanks', label: 'Blank tiles per color', type: 'range', min: 0, max: 8, step: 1, def: 5 },
      { key: 'tileDots', label: 'Dot tiles per color', type: 'range', min: 0, max: 4, step: 1, def: 2 },
      { key: 'tileTriangles', label: 'Triangle tiles per color', type: 'range', min: 0, max: 4, step: 1, def: 2 },
      { key: 'tileStars', label: 'Star tiles per color', type: 'range', min: 0, max: 4, step: 1, def: 1 },
      { key: 'curseCount', label: 'Curses in the deck', type: 'range', min: 0, max: 30, step: 1, def: 15 },
      { key: 'curseSpread', label: 'Curse distribution', type: 'select', def: 'random',
        options: [['random', 'Random shuffle'], ['even', 'Evenly spaced']],
        help: 'Evenly spaced guarantees a steady drip of curses instead of clumps.' },
      { key: 'cursesReturn', label: 'Removed curses return to the discard pile', type: 'bool', def: true,
        help: 'Off means every curse you clear is gone for good. On keeps curse density constant when the deck reshuffles.' },
      { key: 'crushedCurses', label: 'When a wall crushes a curse', type: 'select', def: 'destroyed',
        options: [['destroyed', 'It is destroyed'], ['relocate', 'It jumps to a random open cell']] },
      { key: 'curseOnNoSpace', label: 'Curse drawn with no empty cell', type: 'select', def: 'gameover',
        options: [['discard', 'Discard it'], ['gameover', 'Game over']] },
      { key: 'reshuffleDiscards', label: 'Reshuffle discards when the deck runs out', type: 'bool', def: true,
        help: 'Discards are crushed cards, cleared cards and (optionally) removed curses. Off means the deck is finite.' },
      { key: 'peekCount', label: 'Upcoming cards shown', type: 'range', min: 0, max: 3, step: 1, def: 2 },
      { key: 'seed', label: 'Seed (blank = random each game)', type: 'text', def: '',
        help: 'Same seed + same settings = same deck and same goal order.' },
    ],
  },
  {
    group: 'Placement & clearing',
    items: [
      { key: 'mustIncludePlaced', label: 'The placed card must be part of the completed goal', type: 'bool', def: true,
        help: 'Off lets a freshly drawn goal be cleared by any placement if the board already satisfies it.' },
      { key: 'clearedCardsRemoved', label: 'Cleared cards leave the board', type: 'bool', def: true,
        help: 'On: clearing frees space (match-3 style). Off: cards stay and can be reused.' },
      { key: 'chainShape', label: 'Chain shape', type: 'select', def: 'path',
        options: [['path', 'Snake path (bends allowed, no branching)'], ['group', 'Any connected group']],
        help: 'Order-dependent chain goals (Zebra, ordered Straight) are dropped from the pool in group mode.' },
      { key: 'straightOrdered', label: 'Straights must run in order along the chain', type: 'bool', def: false },
      { key: 'straightLen', label: 'Straight length', type: 'range', min: 3, max: 5, step: 1, def: 4 },
      { key: 'flushLen', label: 'Flush length', type: 'range', min: 3, max: 6, step: 1, def: 4 },
      { key: 'lineLowAvg', label: 'Light Row: max average pip', type: 'range', min: 2, max: 6, step: 0.5, def: 4.5 },
      { key: 'lineHighAvg', label: 'Heavy Row: min average pip', type: 'range', min: 7, max: 10, step: 0.5, def: 8.5 },
      { key: 'lineMinLen', label: 'Row/column goals need at least this many open cells', type: 'range', min: 1, max: 6, step: 1, def: 2 },
      { key: 'allowDuplicateGoals', label: 'The same goal may show on two walls', type: 'bool', def: false },
      { key: 'avoidSimilarGoals', label: 'Keep similar goals off the walls at the same time', type: 'bool', def: true,
        help: 'Goals belong to families (matching ranks, runs, suits, sums, colors, rank tiers, variety, filling). With this on, two goals from one family never show together.' },
      { key: 'noLegalPlacement', label: 'Drawn card has no legal cell', type: 'select', def: 'gameover',
        options: [['gameover', 'Game over'], ['discard', 'Discard it and draw again']] },
    ],
  },
  {
    group: 'Walls & timing',
    items: [
      { key: 'clock', label: 'Clock', type: 'select', def: 'turns',
        options: [['time', 'Real time (seconds)'], ['turns', 'Card placements (turns)']],
        help: 'Everything below that mentions seconds uses turns instead when the clock is placements.' },
      { key: 'wallMode', label: 'What moves the walls', type: 'select', def: 'goal',
        options: [['goal', 'A goal expiring moves its own wall'], ['global', 'A global timer moves one wall at a time'], ['off', 'Walls never move']] },
      { key: 'goalSeconds', label: 'Goal time limit (seconds)', type: 'range', min: 10, max: 180, step: 5, def: 40 },
      { key: 'goalTurns', label: 'Goal time limit (turns)', type: 'range', min: 2, max: 40, step: 1, def: 15 },
      { key: 'expiredGoalPenalty', label: 'When a goal expires', type: 'select', def: 'wall',
        options: [['wall', 'Its wall moves in'], ['curse', 'A curse appears'], ['both', 'Wall moves in and a curse appears'], ['none', 'Nothing, just a new goal']] },
      { key: 'globalSeconds', label: 'Global wall interval (seconds)', type: 'range', min: 5, max: 120, step: 5, def: 20 },
      { key: 'globalTurns', label: 'Global wall interval (turns)', type: 'range', min: 1, max: 30, step: 1, def: 6 },
      { key: 'globalOrder', label: 'Global mode wall order', type: 'select', def: 'rotate',
        options: [['rotate', 'Top → right → bottom → left'], ['random', 'Random wall']] },
      { key: 'pressureRamp', label: 'Pressure ramp (timer multiplier per minute / per 20 turns)', type: 'range', min: 0.5, max: 1, step: 0.01, def: 0.9,
        help: '0.9 means goal timers are 10% shorter after one minute, 19% after two, and so on.' },
      { key: 'pressureFloor', label: 'Ramp floor (fraction of the base timer)', type: 'range', min: 0.05, max: 1, step: 0.05, def: 0.25 },
      { key: 'clearPushesWallBack', label: 'Clearing a goal pushes its wall back out one step', type: 'bool', def: false },
      { key: 'crushCheck', label: 'After a wall moves in, check goals without the placed-tile rule', type: 'select', def: 'all',
        options: [['all', 'Every goal'], ['lines', 'Only full row / column goals'], ['off', 'Off']],
        help: 'A wall can complete a row or column by shortening it. This check clears goals the board already satisfies right after a crush, even though nothing was just placed. Such clears do not count toward the combo.' },
      { key: 'placementSeconds', label: 'Placement timer (seconds, 0 = off)', type: 'range', min: 0, max: 30, step: 1, def: 0 },
      { key: 'placementTimeout', label: 'When the placement timer runs out', type: 'select', def: 'random',
        options: [['random', 'The card is placed on a random cell'], ['discard', 'The card is discarded']] },
    ],
  },
  {
    group: 'Wards',
    items: [
      { key: 'wardsPerClear', label: 'Wards earned per goal cleared', type: 'range', min: 0, max: 3, step: 1, def: 1,
        help: 'Wards bank until spent. Spend them on a curse (tap it), or tap a goal to replace it or push its wall back.' },
      { key: 'wardSpend', label: 'How wards are spent', type: 'select', def: 'manual',
        options: [['manual', 'Player chooses (tap a curse or a goal)'], ['auto', 'Automatically on a random curse, nothing else']] },
      { key: 'wardCostCurse', label: 'Ward cost: remove a curse (0 = not allowed)', type: 'range', min: 0, max: 3, step: 1, def: 1 },
      { key: 'wardCostReroll', label: 'Ward cost: replace a goal (0 = not allowed)', type: 'range', min: 0, max: 3, step: 1, def: 1 },
      { key: 'wardCostRetreat', label: 'Ward cost: push a wall back one step (0 = not allowed)', type: 'range', min: 0, max: 3, step: 1, def: 0 },
      { key: 'rerollTimer', label: 'A replaced goal', type: 'select', def: 'add',
        options: [['keep', 'Keeps the remaining time'], ['add', 'Keeps the remaining time plus a bonus'], ['reset', 'Starts with a fresh timer']] },
      { key: 'rerollBonus', label: 'Bonus added to a replaced goal (turns or seconds)', type: 'range', min: 1, max: 30, step: 1, def: 5 },
      { key: 'wardCostExtend', label: 'Ward cost: extend the current goal (0 = not allowed)', type: 'range', min: 0, max: 3, step: 1, def: 1 },
      { key: 'extendBonus', label: 'Time added by an extension (turns or seconds)', type: 'range', min: 1, max: 30, step: 1, def: 5 },
    ],
  },
  {
    group: 'Multi-clear perks (2+ goals in one placement)',
    items: [
      { key: 'multiMult', label: 'Score multiplier per extra goal', type: 'range', min: 1, max: 4, step: 0.5, def: 2,
        help: 'Two goals at once: points × M. Three at once: points × M².' },
      { key: 'perkExtraWard', label: 'Extra ward', type: 'bool', def: true },
      { key: 'perkClearAllCurses', label: 'All curses on the board are removed', type: 'bool', def: false },
      { key: 'perkPushAllWalls', label: 'Every wall is pushed back out one step', type: 'bool', def: false },
      { key: 'perkPurgeDeckCurses', label: 'Curses removed from the remaining deck', type: 'range', min: 0, max: 5, step: 1, def: 1 },
      { key: 'perkExtraSeconds', label: 'Seconds added to every goal timer', type: 'range', min: 0, max: 30, step: 1, def: 0 },
    ],
  },
  {
    group: 'Scoring',
    items: [
      { key: 'comboEnabled', label: 'Combo: consecutive clearing placements multiply points', type: 'bool', def: true },
      { key: 'comboBonus', label: 'Combo bonus per step (×(1 + step × bonus))', type: 'range', min: 0, max: 1, step: 0.05, def: 0.25 },
      { key: 'survivalPointsPerSec', label: 'Points per second survived', type: 'range', min: 0, max: 10, step: 1, def: 0 },
      { key: 'crushPenalty', label: 'Points lost per card crushed by a wall', type: 'range', min: 0, max: 50, step: 5, def: 0 },
      { key: 'expirePenaltyPoints', label: 'Points lost when a goal expires', type: 'range', min: 0, max: 200, step: 10, def: 0 },
    ],
  },
  {
    group: 'Mode & levels',
    items: [
      { key: 'mode', label: 'Mode', type: 'select', def: 'endless',
        options: [['endless', 'Endless: score until the walls win'], ['survival', 'Survival: outlast the level timer to advance']] },
      { key: 'levelSeconds', label: 'Level length (seconds)', type: 'range', min: 30, max: 300, step: 10, def: 90 },
      { key: 'levelTurns', label: 'Level length (turns)', type: 'range', min: 10, max: 100, step: 5, def: 30 },
      { key: 'levelSecondsGrowth', label: 'Level length growth per level (seconds)', type: 'range', min: 0, max: 60, step: 5, def: 15 },
      { key: 'levelTurnsGrowth', label: 'Level length growth per level (turns)', type: 'range', min: 0, max: 30, step: 1, def: 5 },
      { key: 'levelCurseGrowth', label: 'Extra curses per level', type: 'range', min: 0, max: 3, step: 1, def: 1 },
      { key: 'levelPressureGrowth', label: 'Goal timer multiplier per level', type: 'range', min: 0.5, max: 1, step: 0.05, def: 0.9 },
      { key: 'levelResetWalls', label: 'Walls reset at each new level', type: 'bool', def: true },
      { key: 'levelBoard', label: 'Board at each new level', type: 'select', def: 'clearCurses',
        options: [['clearCurses', 'Keep cards, remove curses'], ['keep', 'Keep everything'], ['clear', 'Clear the board']] },
      { key: 'levelBonus', label: 'Level completion bonus (× level number)', type: 'range', min: 0, max: 1000, step: 50, def: 100 },
    ],
  },
  {
    group: 'Playtest aids',
    items: [
      { key: 'hints', label: 'Highlight cells that would clear a goal', type: 'bool', def: false },
      { key: 'showCursesInDeck', label: 'Show how many curses remain in the deck', type: 'bool', def: true },
      { key: 'botDelay', label: 'Bot delay between moves (ms)', type: 'range', min: 100, max: 3000, step: 100, def: 600 },
    ],
  },
];

export const SCHEMA_ITEMS = SETTINGS_SCHEMA.flatMap((g) => g.items);
export const SCHEMA_BY_KEY = Object.fromEntries(SCHEMA_ITEMS.map((it) => [it.key, it]));

const DEFAULT_DISABLED_GOALS = new Set(['pair', 'fullHouse', 'fourKind', 'straightFlush', 'royalFlush', 'suitedCol', 'ladderCol',
  'tTwins', 'tConstellation', 'tSymbolSquare', 'tCross', 'nPair', 'nFourKind', 'nFullSuit']);

export function defaultSettings() {
  const s = {};
  for (const it of SCHEMA_ITEMS) s[it.key] = it.def;
  s.goalsEnabled = {};
  s.goalPoints = {};
  for (const d of GOAL_DEFS) {
    s.goalsEnabled[d.id] = !DEFAULT_DISABLED_GOALS.has(d.id);
    s.goalPoints[d.id] = d.points;
  }
  return s;
}

export const PRESETS = {
  'Default': {},
  'Chill': { gridW: 7, gridH: 7, curseCount: 4, goalSeconds: 75, pressureRamp: 0.95, levelSeconds: 120 },
  'Action': { curseCount: 8, goalSeconds: 25, pressureRamp: 0.85, placementSeconds: 8, mode: 'survival', levelSeconds: 60 },
  'Brutal': { gridW: 5, gridH: 5, curseCount: 12, goalSeconds: 20, pressureRamp: 0.8, expiredGoalPenalty: 'both', multiMult: 3, crushedCurses: 'relocate' },
  'Turn-based': { clock: 'turns', goalTurns: 8, mode: 'endless' },
  'Global timer': { wallMode: 'global', globalSeconds: 25, expiredGoalPenalty: 'none' },
  'Survival': { mode: 'survival', levelSeconds: 90 },
  'Number tiles': { deckType: 'num' },
  'Symbol tiles': { deckType: 'tiles' },
  'Playing cards': { deckType: 'cards' },
  'Poker only': { deckType: 'cards', goalsEnabled: Object.fromEntries(GOAL_DEFS.map((d) => [d.id, d.cat === 'Poker chains' && d.id !== 'royalFlush'])) },
};

export function applyPreset(base, name) {
  const p = PRESETS[name] || {};
  const out = normalizeSettings({ ...defaultSettings(), ...base });
  for (const [k, v] of Object.entries(p)) {
    if (k === 'goalsEnabled' || k === 'goalPoints') out[k] = { ...out[k], ...v };
    else out[k] = v;
  }
  return normalizeSettings(out);
}

// Clamp / validate every value against the schema; unknown keys are dropped.
export function normalizeSettings(raw) {
  const def = defaultSettings();
  const out = {};
  for (const it of SCHEMA_ITEMS) {
    let v = raw && raw[it.key] != null ? raw[it.key] : it.def;
    if (it.type === 'range') {
      v = Number(v);
      if (!Number.isFinite(v)) v = it.def;
      v = Math.min(it.max, Math.max(it.min, v));
      if (it.step >= 1) v = Math.round(v);
    } else if (it.type === 'bool') {
      v = !!v;
    } else if (it.type === 'select') {
      if (!it.options.some((o) => o[0] === v)) v = it.def;
    } else if (it.type === 'text') {
      v = String(v ?? '').slice(0, 64);
    }
    out[it.key] = v;
  }
  out.goalsEnabled = { ...def.goalsEnabled };
  out.goalPoints = { ...def.goalPoints };
  if (raw && raw.goalsEnabled) for (const d of GOAL_DEFS) if (raw.goalsEnabled[d.id] != null) out.goalsEnabled[d.id] = !!raw.goalsEnabled[d.id];
  if (raw && raw.goalPoints) for (const d of GOAL_DEFS) {
    const v = Number(raw.goalPoints[d.id]);
    if (Number.isFinite(v)) out.goalPoints[d.id] = Math.max(0, Math.round(v));
  }
  return out;
}

const STORAGE_KEY = 'crashcurse.settings.v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
  } catch (e) { /* ignore */ }
  return defaultSettings();
}

export function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export function settingsToJSON(s) {
  return JSON.stringify(s, null, 2);
}

export function settingsFromJSON(text) {
  return normalizeSettings(JSON.parse(text));
}
