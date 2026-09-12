// Goal definitions and the detection engine.
//
// Shapes:
//   chain  – any orthogonally connected chain of N cards (a bendy path, or an
//            unordered connected group when settings.chainShape === 'group')
//   line   – N cards in a straight horizontal or vertical segment
//   row    – every open cell of a row (between the walls) is filled with cards
//   col    – same for a column
//   rowcol – either a full row or a full column
//
// Every def has a `test(cards, settings)` predicate. Cards are passed in
// chain / line order so order-sensitive tests (straight-in-order, alternating
// colors) work. Defs marked `ordered` are dropped from the pool when the
// chain shape is 'group' because a group has no order.

import { pip } from './cards.js';

export const SIDES = ['top', 'right', 'bottom', 'left'];

// ---------- predicate helpers ----------
const rankCounts = (cs) => {
  const m = new Map();
  for (const c of cs) m.set(c.rank, (m.get(c.rank) || 0) + 1);
  return [...m.values()].sort((a, b) => a - b);
};
const allSameRank = (cs) => cs.every((c) => c.rank === cs[0].rank);
const allSameSuit = (cs) => cs.every((c) => c.suit === cs[0].suit);
const allSameColor = (cs) => cs.every((c) => c.red === cs[0].red);
const distinctRanks = (cs) => new Set(cs.map((c) => c.rank)).size === cs.length;
const pipSum = (cs) => cs.reduce((a, c) => a + pip(c.rank), 0);
const alternatingColors = (cs) => cs.every((c, i) => i === 0 || c.red !== cs[i - 1].red);

function isStraightSet(cs) {
  // Unordered: the ranks form a consecutive run; ace may be low (A-2-3) or high (Q-K-A).
  if (!distinctRanks(cs)) return false;
  const n = cs.length;
  const lo = cs.map((c) => c.rank);
  const hi = cs.map((c) => (c.rank === 1 ? 14 : c.rank));
  const span = (a) => Math.max(...a) - Math.min(...a);
  return span(lo) === n - 1 || span(hi) === n - 1;
}

function isStraightSeq(cs) {
  // Ordered along the chain: each step is +1 or each step is -1, ace low or high.
  for (const aceHigh of [false, true]) {
    const r = cs.map((c) => (c.rank === 1 && aceHigh ? 14 : c.rank));
    let asc = true, desc = true;
    for (let i = 1; i < r.length; i++) {
      if (r[i] !== r[i - 1] + 1) asc = false;
      if (r[i] !== r[i - 1] - 1) desc = false;
    }
    if (asc || desc) return true;
  }
  return false;
}

function monotonicRanks(cs) {
  let asc = true, desc = true;
  for (let i = 1; i < cs.length; i++) {
    if (cs[i].rank <= cs[i - 1].rank) asc = false;
    if (cs[i].rank >= cs[i - 1].rank) desc = false;
  }
  return asc || desc;
}

const straightTest = (cs, s) => (s.straightOrdered ? isStraightSeq(cs) : isStraightSet(cs));

// ---------- definitions ----------
export const GOAL_DEFS = [
  // Poker chains
  { id: 'pair', family: ['match'], name: 'Pair', cat: 'Poker chains', shape: 'chain', size: 2, points: 10,
    desc: () => '2 connected cards of the same rank', test: allSameRank },
  { id: 'twoPair', family: ['match'], name: 'Two Pair', cat: 'Poker chains', shape: 'chain', size: 4, points: 40,
    desc: () => 'A 4-chain made of two different pairs',
    test: (cs) => { const k = rankCounts(cs); return k.length === 2 && k[0] === 2; } },
  { id: 'threeKind', family: ['match'], name: 'Three of a Kind', cat: 'Poker chains', shape: 'chain', size: 3, points: 40,
    desc: () => 'A 3-chain of the same rank', test: allSameRank },
  { id: 'straight', family: ['run'], name: 'Straight', cat: 'Poker chains', shape: 'chain', size: (s) => s.straightLen, points: 60,
    ordered: (s) => !!s.straightOrdered,
    desc: (s) => `${s.straightLen}-chain of consecutive ranks${s.straightOrdered ? ', in order along the chain' : ''}`,
    test: straightTest },
  { id: 'flush', family: ['suit'], name: 'Flush', cat: 'Poker chains', shape: 'chain', size: (s) => s.flushLen, points: 60,
    desc: (s) => `${s.flushLen}-chain of one suit`, test: allSameSuit },
  { id: 'fullHouse', family: ['match'], name: 'Full House', cat: 'Poker chains', shape: 'chain', size: 5, points: 120,
    desc: () => 'A 5-chain of three of a kind plus a pair',
    test: (cs) => { const k = rankCounts(cs); return k.length === 2 && k[0] === 2 && k[1] === 3; } },
  { id: 'fourKind', family: ['match'], name: 'Four of a Kind', cat: 'Poker chains', shape: 'chain', size: 4, points: 200,
    desc: () => 'A 4-chain of the same rank', test: allSameRank },
  { id: 'straightFlush', family: ['run', 'suit'], name: 'Straight Flush', cat: 'Poker chains', shape: 'chain', size: (s) => s.straightLen, points: 300,
    ordered: (s) => !!s.straightOrdered,
    desc: (s) => `${s.straightLen}-chain of consecutive ranks in one suit`,
    test: (cs, s) => allSameSuit(cs) && straightTest(cs, s) },
  { id: 'royalFlush', family: ['run', 'suit'], name: 'Royal Flush', cat: 'Poker chains', shape: 'chain', size: 5, points: 1000,
    desc: () => '10-J-Q-K-A of one suit, connected',
    test: (cs) => allSameSuit(cs) && distinctRanks(cs) && cs.every((c) => c.rank === 1 || c.rank >= 10) },

  // Special chains
  { id: 'blackjack', family: ['sum'], name: 'Blackjack', cat: 'Special chains', shape: 'chain', size: [2, 5], points: 50,
    desc: () => 'A chain (2–5 cards) whose pips total 21; faces 10, ace 1 or 11',
    test: (cs) => {
      const base = pipSum(cs);
      const aces = cs.filter((c) => c.rank === 1).length;
      for (let k = 0; k <= aces; k++) if (base + 10 * k === 21) return true;
      return false;
    } },
  { id: 'fifteen', family: ['sum'], name: 'Fifteen', cat: 'Special chains', shape: 'chain', size: [2, 4], points: 30,
    desc: () => 'A chain (2–4 cards) whose pips total exactly 15; faces 10, ace 1',
    test: (cs) => pipSum(cs) === 15 },
  { id: 'rainbow', family: ['variety'], name: 'Rainbow', cat: 'Special chains', shape: 'chain', size: 4, points: 40,
    desc: () => 'A 4-chain showing all four suits',
    test: (cs) => new Set(cs.map((c) => c.suit)).size === 4 },
  { id: 'sameColor', family: ['color'], name: 'Monochrome', cat: 'Special chains', shape: 'chain', size: 5, points: 30,
    desc: () => 'A 5-chain of one color', test: allSameColor },
  { id: 'zebra', family: ['color'], name: 'Zebra', cat: 'Special chains', shape: 'chain', size: 4, points: 40, ordered: true,
    desc: () => 'A 4-chain alternating red and black along the chain', test: alternatingColors },
  { id: 'court', family: ['tier'], name: 'Royal Court', cat: 'Special chains', shape: 'chain', size: 3, points: 40,
    desc: () => 'A 3-chain of face cards (J, Q, K)', test: (cs) => cs.every((c) => c.rank >= 11) },
  { id: 'lowRoad', family: ['tier'], name: 'Low Road', cat: 'Special chains', shape: 'chain', size: 4, points: 40,
    desc: () => 'A 4-chain of cards ranked 5 or lower (ace counts as 1)', test: (cs) => cs.every((c) => c.rank <= 5) },
  { id: 'highRoad', family: ['tier'], name: 'High Road', cat: 'Special chains', shape: 'chain', size: 4, points: 40,
    desc: () => 'A 4-chain of 10s, faces and aces', test: (cs) => cs.every((c) => c.rank >= 10 || c.rank === 1) },
  { id: 'parity', family: ['tier'], name: 'Parity', cat: 'Special chains', shape: 'chain', size: 3, points: 30,
    desc: () => 'A 3-chain of all odd or all even ranks', test: (cs) => cs.every((c) => c.rank % 2 === cs[0].rank % 2) },

  // Straight lines
  { id: 'suitedLine', family: ['suit'], name: 'Suited Line', cat: 'Straight lines', shape: 'line', size: 3, points: 40,
    desc: () => '3 cards of one suit in a straight row or column', test: allSameSuit },
  { id: 'rankLadder', family: ['run'], name: 'Rank Ladder', cat: 'Straight lines', shape: 'line', size: 3, points: 50,
    desc: () => '3 consecutive ranks in order along a straight row or column', test: isStraightSeq },

  // Full rows / columns (length changes as the walls move)
  { id: 'fillRow', family: ['fill'], name: 'Fill a Row', cat: 'Full rows & columns', shape: 'row', points: 30,
    desc: () => 'Fill every open cell of a row', test: () => true },
  { id: 'fillCol', family: ['fill'], name: 'Fill a Column', cat: 'Full rows & columns', shape: 'col', points: 30,
    desc: () => 'Fill every open cell of a column', test: () => true },
  { id: 'lightRow', family: ['sum'], name: 'Light Row', cat: 'Full rows & columns', shape: 'row', points: 80,
    desc: (s) => `Fill a row whose pips average ${s.lineLowAvg} or less (sum ≤ ${s.lineLowAvg} × length)`,
    test: (cs, s) => pipSum(cs) <= s.lineLowAvg * cs.length },
  { id: 'heavyRow', family: ['sum'], name: 'Heavy Row', cat: 'Full rows & columns', shape: 'row', points: 80,
    desc: (s) => `Fill a row whose pips average ${s.lineHighAvg} or more (sum ≥ ${s.lineHighAvg} × length)`,
    test: (cs, s) => pipSum(cs) >= s.lineHighAvg * cs.length },
  { id: 'monoRow', family: ['color'], name: 'Mono Row', cat: 'Full rows & columns', shape: 'row', points: 60,
    desc: () => 'Fill a row with cards of one color', test: allSameColor },
  { id: 'checkerRow', family: ['color'], name: 'Checker Row', cat: 'Full rows & columns', shape: 'row', points: 70,
    desc: () => 'Fill a row with colors alternating left to right', test: alternatingColors },
  { id: 'distinctRow', family: ['variety'], name: 'Distinct Row', cat: 'Full rows & columns', shape: 'row', points: 50,
    desc: () => 'Fill a row with no repeated rank', test: distinctRanks },
  { id: 'suitedCol', family: ['suit'], name: 'Suited Column', cat: 'Full rows & columns', shape: 'col', points: 120,
    desc: () => 'Fill a column with cards of one suit', test: allSameSuit },
  { id: 'ladderCol', family: ['run'], name: 'Ladder Column', cat: 'Full rows & columns', shape: 'col', points: 150,
    desc: () => 'Fill a column with ranks strictly rising or falling top to bottom', test: monotonicRanks },
];

export const GOAL_BY_ID = Object.fromEntries(GOAL_DEFS.map((d) => [d.id, d]));

export function goalSizeRange(def, s) {
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

export const FAMILY_LABEL = {
  match: 'Matching ranks', run: 'Runs', suit: 'Suits', sum: 'Sums', color: 'Colors',
  tier: 'Rank tiers', variety: 'Variety', fill: 'Filling',
};

export function goalFamilies(def) {
  return def.family || [];
}

export function goalPoints(def, s) {
  const v = s.goalPoints && s.goalPoints[def.id];
  return Number.isFinite(v) ? v : def.points;
}

export function goalEnabled(def, s) {
  const v = s.goalsEnabled && s.goalsEnabled[def.id];
  return v == null ? true : !!v;
}

// ---------- board helpers ----------
// A board is { W, H, cells, inset:{top,right,bottom,left} }. cells[i] is
// null | {kind:'card',...} | {kind:'curse'}. Crushed cells are always null.
const isCard = (b, i) => b.cells[i] != null && b.cells[i].kind === 'card';

function neighbors(b, i) {
  const r = (i / b.W) | 0, c = i % b.W;
  const out = [];
  if (r > 0) out.push(i - b.W);
  if (r < b.H - 1) out.push(i + b.W);
  if (c > 0) out.push(i - 1);
  if (c < b.W - 1) out.push(i + 1);
  return out;
}

export function rowIdxs(b, r) {
  const out = [];
  for (let c = b.inset.left; c < b.W - b.inset.right; c++) out.push(r * b.W + c);
  return out;
}

export function colIdxs(b, c) {
  const out = [];
  for (let r = b.inset.top; r < b.H - b.inset.bottom; r++) out.push(r * b.W + c);
  return out;
}

export function openRows(b) {
  const out = [];
  for (let r = b.inset.top; r < b.H - b.inset.bottom; r++) out.push(r);
  return out;
}

export function openCols(b) {
  const out = [];
  for (let c = b.inset.left; c < b.W - b.inset.right; c++) out.push(c);
  return out;
}

// ---------- enumerators ----------
// Each takes a callback cb(idxs) that returns true to stop the search.

// Simple paths (self-avoiding, orthogonal) of exactly N cards that contain `start`.
export function pathsThrough(b, start, N, cb) {
  if (!isCard(b, start)) return false;
  if (N === 1) return !!cb([start]);
  const visited = new Uint8Array(b.W * b.H);
  visited[start] = 1;
  const armA = [start];
  let done = false;
  for (let a = 0; a < N && !done; a++) {
    const bLen = N - 1 - a;
    const dfsB = (cur, rem, armB) => {
      if (done) return;
      if (rem === 0) {
        const path = armA.slice().reverse().concat(armB.slice(1));
        if (cb(path)) done = true;
        return;
      }
      for (const n of neighbors(b, cur)) {
        if (done) return;
        if (!visited[n] && isCard(b, n)) {
          visited[n] = 1; armB.push(n);
          dfsB(n, rem - 1, armB);
          armB.pop(); visited[n] = 0;
        }
      }
    };
    const dfsA = (cur, rem) => {
      if (done) return;
      if (rem === 0) { dfsB(start, bLen, [start]); return; }
      for (const n of neighbors(b, cur)) {
        if (done) return;
        if (!visited[n] && isCard(b, n)) {
          visited[n] = 1; armA.push(n);
          dfsA(n, rem - 1);
          armA.pop(); visited[n] = 0;
        }
      }
    };
    dfsA(start, a);
  }
  return done;
}

// All simple paths of exactly N cards anywhere on the board.
export function allPaths(b, N, cb) {
  const visited = new Uint8Array(b.W * b.H);
  const path = [];
  let done = false;
  const dfs = (cur, rem) => {
    if (done) return;
    if (rem === 0) { if (cb(path.slice())) done = true; return; }
    for (const n of neighbors(b, cur)) {
      if (done) return;
      if (!visited[n] && isCard(b, n)) {
        visited[n] = 1; path.push(n);
        dfs(n, rem - 1);
        path.pop(); visited[n] = 0;
      }
    }
  };
  for (let i = 0; i < b.W * b.H && !done; i++) {
    if (!isCard(b, i)) continue;
    visited[i] = 1; path.push(i);
    dfs(i, N - 1);
    path.pop(); visited[i] = 0;
  }
  return done;
}

// Connected groups (unordered) of exactly N cards containing `root`, each
// enumerated once (Redelmeier's method). `ok(i)` filters candidate cells.
function groupsFrom(b, root, N, ok, cb) {
  if (!isCard(b, root)) return false;
  if (N === 1) return !!cb([root]);
  const reached = new Uint8Array(b.W * b.H);
  reached[root] = 1;
  const S = [root];
  let done = false;
  const rec = (untried) => {
    while (untried.length && !done) {
      const c = untried.shift();
      S.push(c);
      if (S.length === N) {
        if (cb(S.slice())) done = true;
      } else {
        const added = [];
        for (const n of neighbors(b, c)) {
          if (!reached[n] && ok(n)) { reached[n] = 1; added.push(n); }
        }
        rec(untried.concat(added));
        for (const n of added) reached[n] = 0;
      }
      S.pop();
    }
  };
  const init = [];
  for (const n of neighbors(b, root)) if (ok(n)) { reached[n] = 1; init.push(n); }
  rec(init);
  return done;
}

export function groupsThrough(b, root, N, cb) {
  return groupsFrom(b, root, N, (i) => isCard(b, i), cb);
}

export function allGroups(b, N, cb) {
  for (let root = 0; root < b.W * b.H; root++) {
    if (!isCard(b, root)) continue;
    if (groupsFrom(b, root, N, (i) => i > root && isCard(b, i), cb)) return true;
  }
  return false;
}

function segmentAt(b, r, c, dr, dc, N) {
  const idxs = [];
  for (let k = 0; k < N; k++) {
    const rr = r + dr * k, cc = c + dc * k;
    if (rr < 0 || rr >= b.H || cc < 0 || cc >= b.W) return null;
    const i = rr * b.W + cc;
    if (!isCard(b, i)) return null;
    idxs.push(i);
  }
  return idxs;
}

// Straight horizontal/vertical segments of N cards containing idx.
export function segmentsThrough(b, idx, N, cb) {
  const r = (idx / b.W) | 0, c = idx % b.W;
  for (let k = 0; k < N; k++) {
    const seg = segmentAt(b, r, c - k, 0, 1, N);
    if (seg && cb(seg)) return true;
  }
  for (let k = 0; k < N; k++) {
    const seg = segmentAt(b, r - k, c, 1, 0, N);
    if (seg && cb(seg)) return true;
  }
  return false;
}

export function allSegments(b, N, cb) {
  for (let r = 0; r < b.H; r++) for (let c = 0; c + N <= b.W; c++) {
    const seg = segmentAt(b, r, c, 0, 1, N);
    if (seg && cb(seg)) return true;
  }
  for (let c = 0; c < b.W; c++) for (let r = 0; r + N <= b.H; r++) {
    const seg = segmentAt(b, r, c, 1, 0, N);
    if (seg && cb(seg)) return true;
  }
  return false;
}

function fullLine(b, idxs, s) {
  const minLen = Math.max(1, s.lineMinLen || 1);
  return idxs.length >= minLen && idxs.every((i) => isCard(b, i));
}

// ---------- main entry ----------
// Returns the cell indices that satisfy the goal, or null.
// placedIdx: the cell that was just placed (or null when not applicable).
export function findSatisfying(b, s, def, placedIdx) {
  const test = (idxs) => def.test(idxs.map((i) => b.cells[i]), s);
  const must = !!s.mustIncludePlaced && placedIdx != null;
  if (must && !isCard(b, placedIdx)) return null;
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
    case 'row':
    case 'col':
    case 'rowcol': {
      const tryRow = (r) => { const idxs = rowIdxs(b, r); return fullLine(b, idxs, s) && cb(idxs); };
      const tryCol = (c) => { const idxs = colIdxs(b, c); return fullLine(b, idxs, s) && cb(idxs); };
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

// ---------- precise, settings-aware explanations (popups and the rules page) ----------
export const GOAL_DETAILS = {
  pair: () => 'Two cards of the same rank sitting next to each other (up, down, left or right).',
  twoPair: () => 'A chain of exactly 4 connected cards made of two pairs of different ranks, in any order along the chain (for example 9-4-9-4). Four cards of one rank do not count.',
  threeKind: () => 'A chain of 3 connected cards that all share one rank.',
  straight: (s) => `A chain of ${s.straightLen} connected cards whose ranks form a consecutive run${s.straightOrdered ? ', rising or falling step by step along the chain (5-6-7-8 or 8-7-6-5)' : ' in any order along the chain (6-4-7-5 counts)'}. The ace can be low (A-2-3…) or high (…Q-K-A), but the run cannot wrap around: K-A-2 does not count.`,
  flush: (s) => `A chain of ${s.flushLen} connected cards that all share one suit. Ranks do not matter.`,
  fullHouse: () => 'A chain of exactly 5 connected cards: three of one rank plus two of another, in any order along the chain.',
  fourKind: () => 'A chain of 4 connected cards that all share one rank.',
  straightFlush: (s) => `A straight of ${s.straightLen} connected cards (consecutive ranks${s.straightOrdered ? ', in order along the chain' : ', any order along the chain'}) whose cards also all share one suit.`,
  royalFlush: () => 'The 10, J, Q, K and A of a single suit, connected in a chain of 5, in any order along the chain.',
  blackjack: () => 'A chain of 2 to 5 connected cards whose pips total exactly 21. Number cards count face value, J/Q/K count 10, and an ace counts 1 or 11, whichever makes 21.',
  fifteen: () => 'A chain of 2 to 4 connected cards whose pips total exactly 15. Number cards count face value, J/Q/K count 10, aces count 1.',
  rainbow: () => 'A chain of 4 connected cards showing all four suits: one spade, one heart, one diamond and one club.',
  sameColor: () => 'A chain of 5 connected cards of one color: all red (hearts and diamonds) or all black (spades and clubs).',
  zebra: () => 'A chain of 4 connected cards whose colors alternate along the chain: red, black, red, black (or the reverse).',
  court: () => 'A chain of 3 connected face cards: any mix of jacks, queens and kings.',
  lowRoad: () => 'A chain of 4 connected cards each ranked 5 or lower: A, 2, 3, 4 or 5 (the ace counts as 1).',
  highRoad: () => 'A chain of 4 connected cards each ranked 10 or higher: 10, J, Q, K or A.',
  parity: () => 'A chain of 3 connected cards whose ranks are all odd (A, 3, 5, 7, 9, J, K) or all even (2, 4, 6, 8, 10, Q). Ace counts 1, jack 11, queen 12, king 13.',
  suitedLine: () => 'Three cards of one suit side by side in a single row or a single column. No bends allowed.',
  rankLadder: () => 'Three cards side by side in a single row or column whose ranks step by exactly one, in order (5-6-7 or 7-6-5). The ace can be low (A-2-3) or high (Q-K-A).',
  fillRow: () => 'Every open cell of one row, from wall to wall, holds a card. A curse in the row blocks it.',
  fillCol: () => 'Every open cell of one column, from wall to wall, holds a card. A curse in the column blocks it.',
  lightRow: (s) => `A completely filled row (wall to wall) whose pips add up to at most ${s.lineLowAvg} × the row length, so the cards average ${s.lineLowAvg} pips or less. Number cards count face value, J/Q/K count 10, aces count 1.`,
  heavyRow: (s) => `A completely filled row (wall to wall) whose pips add up to at least ${s.lineHighAvg} × the row length, so the cards average ${s.lineHighAvg} pips or more. Number cards count face value, J/Q/K count 10, aces count 1.`,
  monoRow: () => 'A completely filled row (wall to wall) in which every card is the same color.',
  checkerRow: () => 'A completely filled row (wall to wall) whose colors alternate from left to right: red, black, red, black (or the reverse).',
  distinctRow: () => 'A completely filled row (wall to wall) in which no rank appears twice.',
  suitedCol: () => 'A completely filled column (wall to wall) in which every card is the same suit.',
  ladderCol: () => 'A completely filled column (wall to wall) whose ranks strictly rise or strictly fall from top to bottom, by any step size (2-5-6-K counts, 2-5-5-K does not).',
};

export function goalDetail(def, s) {
  const f = GOAL_DETAILS[def.id];
  return f ? f(s) : goalDesc(def, s);
}

// General notes that apply to a goal under the current settings.
export function goalNotes(def, s) {
  const notes = [];
  if (def.shape === 'chain') {
    notes.push(s.chainShape === 'group'
      ? 'A chain here is any group of cards connected up/down/left/right; branching is fine.'
      : 'A chain is a snake of cards connected up/down/left/right: it may bend, but it may not branch, and each card is used once.');
  }
  if (def.shape === 'line') notes.push('A straight line is one row or one column, no bends.');
  if (def.shape === 'row' || def.shape === 'col' || def.shape === 'rowcol') {
    notes.push(`Only the cells between the current walls count, and the line needs at least ${s.lineMinLen} open cell${s.lineMinLen === 1 ? '' : 's'}.`);
  }
  if (s.mustIncludePlaced) notes.push('The card you just placed must be part of it.');
  return notes;
}
