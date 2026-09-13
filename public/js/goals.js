// Goal registry and detection glue for both decks (cards and tiles).
import { CARD_GOALS, CARD_DETAILS } from './cardgoals.js';
import { TILE_GOALS, TILE_DETAILS } from './tilegoals.js';
import {
  isPiece, rowIdxs, colIdxs, openRows, openCols, openRowCount, openColCount,
  pathsThrough, allPaths, groupsThrough, allGroups, segmentsThrough, allSegments,
  squaresThrough, allSquares, plusThrough, allPluses, fullLine,
} from './shapes.js';

export * from './shapes.js';

export const SIDES = ['top', 'right', 'bottom', 'left'];
export const GOAL_DEFS = [...CARD_GOALS, ...TILE_GOALS];
export const GOAL_BY_ID = Object.fromEntries(GOAL_DEFS.map((d) => [d.id, d]));
export const GOAL_DETAILS = { ...CARD_DETAILS, ...TILE_DETAILS };

export const FAMILY_LABEL = {
  match: 'Matching', run: 'Runs', suit: 'Suits', sum: 'Sums', color: 'Colors', tier: 'Rank tiers', variety: 'Variety', fill: 'Filling',
  mono: 'One color', rainbow: 'Many colors', symbol: 'Symbols', blank: 'Blanks', marked: 'Marked', pattern: 'Patterns', block: 'Blocks', board: 'Board-wide',
};

export function goalDeck(def) { return def.deck || 'cards'; }
export function goalFamilies(def) { return def.family || []; }
export function pieceWord(s) { return s.deckType === 'tiles' ? 'tile' : 'card'; }

export function goalSizeRange(def, s) {
  if (def.shape === 'square') return [4, 4];
  if (def.shape === 'plus') return [5, 5];
  if (def.shape === 'board') return [def.count || 0, def.count || 0];
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
    case 'board': return (def.count || 0) <= area;
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
  if (def.shape === 'square') notes.push(`A block is a 2×2 square of four ${w}s.`);
  if (def.shape === 'plus') notes.push(`A plus is a centre ${w} and its four side neighbours (up, down, left, right).`);
  if (def.shape === 'board') notes.push(`Counts every ${w} between the walls; all the matching ${w}s clear at once.`);
  if (s.mustIncludePlaced) notes.push(`The ${w} you just placed must be part of it.`);
  return notes;
}

// Returns the cell indices that satisfy the goal, or null.
// placedIdx: the cell that was just placed (or null when not applicable).
export function findSatisfying(b, s, def, placedIdx) {
  const must = !!s.mustIncludePlaced && placedIdx != null;
  if (must && !isPiece(b, placedIdx)) return null;
  if (typeof def.find === 'function') return def.find(b, s, must ? placedIdx : null, must) || null;
  const test = (idxs) => def.test(idxs.map((i) => b.cells[i]), s);
  let found = null;
  const cb = (idxs) => { if (test(idxs)) { found = idxs.slice(); return true; } return false; };

  switch (def.shape) {
    case 'chain': {
      const [minN, maxN] = goalSizeRange(def, s);
      for (let n = minN; n <= maxN; n++) {
        if (s.chainShape === 'group') {
          if (must) groupsThrough(b, placedIdx, n, cb); else allGroups(b, n, cb);
        } else if (must) pathsThrough(b, placedIdx, n, cb);
        else allPaths(b, n, cb);
        if (found) return found;
      }
      return null;
    }
    case 'line': {
      const [minN, maxN] = goalSizeRange(def, s);
      for (let n = minN; n <= maxN; n++) {
        if (must) segmentsThrough(b, placedIdx, n, cb); else allSegments(b, n, cb);
        if (found) return found;
      }
      return null;
    }
    case 'square': {
      if (must) squaresThrough(b, placedIdx, cb); else allSquares(b, cb);
      return found;
    }
    case 'plus': {
      if (must) plusThrough(b, placedIdx, cb); else allPluses(b, cb);
      return found;
    }
    case 'row':
    case 'col':
    case 'rowcol': {
      const minLen = goalMinLen(def, s);
      const tryRow = (r) => { const idxs = rowIdxs(b, r); return fullLine(b, idxs, minLen) && cb(idxs); };
      const tryCol = (c) => { const idxs = colIdxs(b, c); return fullLine(b, idxs, minLen) && cb(idxs); };
      const wantRow = def.shape !== 'col', wantCol = def.shape !== 'row';
      if (must) {
        const r = (placedIdx / b.W) | 0, c = placedIdx % b.W;
        if (wantRow && tryRow(r)) return found;
        if (wantCol && tryCol(c)) return found;
        return null;
      }
      if (wantRow) for (const r of openRows(b)) if (tryRow(r)) return found;
      if (wantCol) for (const c of openCols(b)) if (tryCol(c)) return found;
      return null;
    }
    default:
      return null;
  }
}
