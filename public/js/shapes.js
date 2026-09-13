// Board geometry and shape enumerators shared by every goal type.
// A board is { W, H, cells, inset:{top,right,bottom,left} }. cells[i] is
// null | a piece ({kind:'card'|'tile', ...}) | {kind:'curse'}. Crushed cells
// (outside the walls) are always null.

export const isPiece = (b, i) => b.cells[i] != null && b.cells[i].kind !== 'curse';

export function neighbors(b, i) {
  const r = (i / b.W) | 0, c = i % b.W;
  const out = [];
  if (r > 0) out.push(i - b.W);
  if (r < b.H - 1) out.push(i + b.W);
  if (c > 0) out.push(i - 1);
  if (c < b.W - 1) out.push(i + 1);
  return out;
}

export function openRowCount(b) { return b.H - b.inset.top - b.inset.bottom; }
export function openColCount(b) { return b.W - b.inset.left - b.inset.right; }

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

export function allPieces(b) {
  const out = [];
  for (let i = 0; i < b.cells.length; i++) if (isPiece(b, i)) out.push(i);
  return out;
}

// Each enumerator takes cb(idxs) which returns true to stop the search.

// Simple paths (self-avoiding, orthogonal) of exactly N pieces that contain `start`.
export function pathsThrough(b, start, N, cb) {
  if (!isPiece(b, start)) return false;
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
        if (!visited[n] && isPiece(b, n)) {
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
        if (!visited[n] && isPiece(b, n)) {
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

// All simple paths of exactly N pieces anywhere on the board.
export function allPaths(b, N, cb) {
  const visited = new Uint8Array(b.W * b.H);
  const path = [];
  let done = false;
  const dfs = (cur, rem) => {
    if (done) return;
    if (rem === 0) { if (cb(path.slice())) done = true; return; }
    for (const n of neighbors(b, cur)) {
      if (done) return;
      if (!visited[n] && isPiece(b, n)) {
        visited[n] = 1; path.push(n);
        dfs(n, rem - 1);
        path.pop(); visited[n] = 0;
      }
    }
  };
  for (let i = 0; i < b.W * b.H && !done; i++) {
    if (!isPiece(b, i)) continue;
    visited[i] = 1; path.push(i);
    dfs(i, N - 1);
    path.pop(); visited[i] = 0;
  }
  return done;
}

// Connected groups (unordered) of exactly N pieces containing `root`, each
// enumerated once (Redelmeier's method). `ok(i)` filters candidate cells.
function groupsFrom(b, root, N, ok, cb) {
  if (!isPiece(b, root)) return false;
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
  return groupsFrom(b, root, N, (i) => isPiece(b, i), cb);
}

export function allGroups(b, N, cb) {
  for (let root = 0; root < b.W * b.H; root++) {
    if (!isPiece(b, root)) continue;
    if (groupsFrom(b, root, N, (i) => i > root && isPiece(b, i), cb)) return true;
  }
  return false;
}

function segmentAt(b, r, c, dr, dc, N) {
  const idxs = [];
  for (let k = 0; k < N; k++) {
    const rr = r + dr * k, cc = c + dc * k;
    if (rr < 0 || rr >= b.H || cc < 0 || cc >= b.W) return null;
    const i = rr * b.W + cc;
    if (!isPiece(b, i)) return null;
    idxs.push(i);
  }
  return idxs;
}

// Straight horizontal/vertical segments of N pieces containing idx.
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

// 2x2 blocks. Order: top-left, top-right, bottom-left, bottom-right.
function squareAt(b, r, c) {
  if (r < 0 || c < 0 || r + 1 >= b.H || c + 1 >= b.W) return null;
  const idxs = [r * b.W + c, r * b.W + c + 1, (r + 1) * b.W + c, (r + 1) * b.W + c + 1];
  return idxs.every((i) => isPiece(b, i)) ? idxs : null;
}

export function squaresThrough(b, idx, cb) {
  const r = (idx / b.W) | 0, c = idx % b.W;
  for (const [dr, dc] of [[0, 0], [0, -1], [-1, 0], [-1, -1]]) {
    const sq = squareAt(b, r + dr, c + dc);
    if (sq && cb(sq)) return true;
  }
  return false;
}

export function allSquares(b, cb) {
  for (let r = 0; r + 1 < b.H; r++) for (let c = 0; c + 1 < b.W; c++) {
    const sq = squareAt(b, r, c);
    if (sq && cb(sq)) return true;
  }
  return false;
}

// Plus shapes: a centre and its four orthogonal neighbours.
// Order: centre, up, right, down, left.
function plusAt(b, r, c) {
  if (r < 1 || c < 1 || r + 1 >= b.H || c + 1 >= b.W) return null;
  const idxs = [r * b.W + c, (r - 1) * b.W + c, r * b.W + c + 1, (r + 1) * b.W + c, r * b.W + c - 1];
  return idxs.every((i) => isPiece(b, i)) ? idxs : null;
}

export function plusThrough(b, idx, cb) {
  const r = (idx / b.W) | 0, c = idx % b.W;
  for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const p = plusAt(b, r + dr, c + dc);
    if (p && cb(p)) return true;
  }
  return false;
}

export function allPluses(b, cb) {
  for (let r = 1; r + 1 < b.H; r++) for (let c = 1; c + 1 < b.W; c++) {
    const p = plusAt(b, r, c);
    if (p && cb(p)) return true;
  }
  return false;
}

export function fullLine(b, idxs, minLen) {
  return idxs.length >= Math.max(1, minLen || 1) && idxs.every((i) => isPiece(b, i));
}
