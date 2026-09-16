// Goal registry and detection glue for both decks (cards and tiles).
import { CARD_GOALS, CARD_DETAILS } from './cardgoals.js';
import { TILE_GOALS, TILE_DETAILS } from './tilegoals.js';
import { NUM_GOALS, NUM_DETAILS } from './numgoals.js';
import {
  isPiece, rowIdxs, colIdxs, openRows, openCols, openRowCount, openColCount,
  pathsThrough, allPaths, groupsThrough, allGroups, segmentsThrough, allSegments,
  squaresThrough, allSquares, plusThrough, allPluses, fullLine, diagsThrough, allDiags,
} from './shapes.js';

export * from './shapes.js';

export const SIDES = ['top', 'right', 'bottom', 'left'];
export const GOAL_DEFS = [...CARD_GOALS, ...TILE_GOALS, ...NUM_GOALS];
export const GOAL_BY_ID = Object.fromEntries(GOAL_DEFS.map((d) => [d.id, d]));
export const GOAL_DETAILS = { ...CARD_DETAILS, ...TILE_DETAILS, ...NUM_DETAILS };

export const FAMILY_LABEL = {
  match: 'Matching', run: 'Runs', suit: 'Suits', sum: 'Sums', color: 'Colors', tier: 'Rank tiers', variety: 'Variety', fill: 'Filling',
  mono: 'One color', rainbow: 'Many colors', symbol: 'Symbols', blank: 'Blanks', marked: 'Marked', pattern: 'Patterns', block: 'Blocks', board: 'Board-wide',
  product: 'Products', parity: 'Odds & evens', property: 'Number tricks', geometry: 'Geometry', placement: 'Placement',
};

// Which tile attributes a goal cares about, for the two flags on every goal card.
const COLOR_FAMILIES = new Set(['mono', 'rainbow', 'color', 'suit', 'pattern']);
const VALUE_FAMILIES = new Set(['symbol', 'blank', 'marked', 'match', 'run', 'sum', 'product', 'parity', 'property', 'tier', 'variety']);
export function goalUses(def) {
  if (def.uses) return def.uses;
  const fams = goalFamilies(def);
  return { color: fams.some((f) => COLOR_FAMILIES.has(f)), num: fams.some((f) => VALUE_FAMILIES.has(f)) };
}
export function valueWord(s) { return s.deckType === 'num' ? 'numbers' : s.deckType === 'tiles' ? 'symbols' : 'ranks'; }

export function goalDeck(def) { return def.deck || 'cards'; }
export function goalFamilies(def) { return def.family || []; }
export function pieceWord(s) { return s.deckType === 'cards' ? 'card' : 'tile'; }

export function goalCount(def, s) {
  return typeof def.count === 'function' ? def.count(s) : (def.count || 0);
}

export function goalSizeRange(def, s) {
  if (def.shape === 'square') return [4, 4];
  if (def.shape === 'plus') return [5, 5];
  if (def.shape === 'spot') return [1, 1];
  if (def.shape === 'board') { const c = goalCount(def, s); return [c, c]; }
  const sz = typeof def.size === 'function' ? def.size(s) : def.size;
  if (Array.isArray(sz)) return sz;
  if (sz == null) return [0, 0];
  return [sz, sz];
}

export function goalIsOrdered(def, s) {
  return typeof def.ordered === 'function' ? def.ordered(s) : !!def.ordered;
}

export function goalDesc(def, s) {
  return typeof def.desc === 'function' ? def.desc(s) : def.desc;
}

export function goalPoints(def, s) {
  const v = s.goalPoints && s.goalPoints[def.id];
  return Number.isFinite(v) ? v : def.points;
}

export function goalEnabled(def, s) {
  const v = s.goalsEnabled && s.goalsEnabled[def.id];
  return v == null ? true : !!v;
}

export function goalDetail(def, s) {
  const f = GOAL_DETAILS[def.id];
  return f ? f(s) : goalDesc(def, s);
}

export function goalMinLen(def, s) {
  const m = typeof def.minLen === 'function' ? def.minLen(s) : (def.minLen || 1);
  return Math.max(s.lineMinLen || 1, m);
}

// Can this goal be completed at all inside the current walls?
export function goalFeasible(def, s, b) {
  const rows = openRowCount(b), cols = openColCount(b);
  if (rows <= 0 || cols <= 0) return false;
  if (typeof def.feasible === 'function' && !def.feasible(s, b)) return false;
  const area = rows * cols;
  const [minN] = goalSizeRange(def, s);
  switch (def.shape) {
    case 'chain': return minN <= area;
    case 'line': return minN <= Math.max(rows, cols);
    case 'row': return cols >= goalMinLen(def, s);
    case 'col': return rows >= goalMinLen(def, s);
    case 'rowcol': return cols >= goalMinLen(def, s) || rows >= goalMinLen(def, s);
    case 'square': return rows >= 2 && cols >= 2;
    case 'plus': return rows >= 3 && cols >= 3;
    case 'diag': return minN <= Math.min(rows, cols);
    case 'spot': return true;
    case 'board': return goalCount(def, s) <= area;
    default: return true;
  }
}

// General notes that apply to a goal under the current settings.
export function goalNotes(def, s) {
  const w = pieceWord(s);
  const notes = [];
  if (def.shape === 'chain') {
    notes.push(s.chainShape === 'group'
      ? `A chain here is any group of ${w}s connected up/down/left/right; branching is fine.`
      : `A chain is a snake of ${w}s connected up/down/left/right: it may bend, but it may not branch, and each ${w} is used once.`);
  }
  if (def.shape === 'line') notes.push('A straight line is one row or one column, no bends.');
  if (def.shape === 'row' || def.shape === 'col' || def.shape === 'rowcol') {
    const m = goalMinLen(def, s);
    notes.push(`Only the cells between the current walls count, and the line needs at least ${m} open cell${m === 1 ? '' : 's'}.`);
  }
  if (def.shape === 'diag') notes.push(`A diagonal runs corner to corner through ${w}s that touch only at their corners.`);
  if (def.shape === 'spot') notes.push(`This one is about the ${w} you just placed and what surrounds it.`);
  if (def.shape === 'square') notes.push(`A block is a 2×2 square of four ${w}s.`);
  if (def.shape === 'plus') notes.push(`A plus is a centre ${w} and its four side neighbours (up, down, left, right).`);
  if (def.shape === 'board') notes.push(`Counts every ${w} between the walls; all the matching ${w}s clear at once.`);
  if (s.mustIncludePlaced) notes.push(`The ${w} you just placed must be part of it.`);
  return notes;
}

// Returns the cell indices that satisfy the goal, or null.
// placedIdx: the cell that was just placed (or null when not applicable).
// Walk every set of cells that satisfies the goal, in a fixed order: the
// smallest size first, then the shape's own scan order (through the placed
// piece when the rules require it). onFound(idxs) returns true to stop.
function enumerateSatisfying(b, s, def, placedIdx, onFound) {
  const must = !!s.mustIncludePlaced && placedIdx != null;
  if (must && !isPiece(b, placedIdx)) return;
  if (typeof def.find === 'function') {
    const r = def.find(b, s, must ? placedIdx : null, must);
    if (r) onFound(r.slice());
    return;
  }
  const test = (idxs) => (!def.geometry || def.geometry(idxs, b)) && def.test(idxs.map((i) => b.cells[i]), s);
  let stop = false;
  const cb = (idxs) => { if (!stop && test(idxs) && onFound(idxs.slice())) stop = true; return stop; };

  switch (def.shape) {
    case 'chain': {
      const [minN, maxN] = goalSizeRange(def, s);
      for (let n = minN; n <= maxN && !stop; n++) {
        if (s.chainShape === 'group') {
          if (must) groupsThrough(b, placedIdx, n, cb); else allGroups(b, n, cb);
        } else if (must) pathsThrough(b, placedIdx, n, cb);
        else allPaths(b, n, cb);
      }
      return;
    }
    case 'line': {
      const [minN, maxN] = goalSizeRange(def, s);
      for (let n = minN; n <= maxN && !stop; n++) {
        if (must) segmentsThrough(b, placedIdx, n, cb); else allSegments(b, n, cb);
      }
      return;
    }
    case 'square':
      if (must) squaresThrough(b, placedIdx, cb); else allSquares(b, cb);
      return;
    case 'diag': {
      const [minN, maxN] = goalSizeRange(def, s);
      for (let n = minN; n <= maxN && !stop; n++) {
        if (must) diagsThrough(b, placedIdx, n, cb); else allDiags(b, n, cb);
      }
      return;
    }
    case 'plus':
      if (must) plusThrough(b, placedIdx, cb); else allPluses(b, cb);
      return;
    case 'row':
    case 'col':
    case 'rowcol': {
      const minLen = goalMinLen(def, s);
      const tryRow = (r) => { const idxs = rowIdxs(b, r); return fullLine(b, idxs, minLen) && cb(idxs); };
      const tryCol = (c) => { const idxs = colIdxs(b, c); return fullLine(b, idxs, minLen) && cb(idxs); };
      const wantRow = def.shape !== 'col', wantCol = def.shape !== 'row';
      if (must) {
        const r = (placedIdx / b.W) | 0, c = placedIdx % b.W;
        if (wantRow && tryRow(r)) return;
        if (wantCol) tryCol(c);
        return;
      }
      if (wantRow) for (const r of openRows(b)) if (tryRow(r)) return;
      if (wantCol) for (const c of openCols(b)) if (tryCol(c)) return;
      return;
    }
    default:
      return;
  }
}

// The first set of cells that satisfies the goal, or null.
export function findSatisfying(b, s, def, placedIdx) {
  let found = null;
  enumerateSatisfying(b, s, def, placedIdx, (idxs) => { found = idxs; return true; });
  return found;
}

// Every distinct set of cells that satisfies the goal (the same cells reached
// in another order count once), in search order, up to `limit` of them.
export function findAllSatisfying(b, s, def, placedIdx, limit = 12) {
  const out = [], seen = new Set();
  enumerateSatisfying(b, s, def, placedIdx, (idxs) => {
    const key = idxs.slice().sort((x, y) => x - y).join(',');
    if (!seen.has(key)) { seen.add(key); out.push(idxs); }
    return out.length >= limit;
  });
  return out;
}
