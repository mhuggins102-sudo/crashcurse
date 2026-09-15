// Goals for the numbered-tile deck. Pieces are {kind:'num', color 0..c-1, n 1..max}.
import { allPieces } from './shapes.js';

const nums = (ts) => ts.map((t) => t.n);
const sum = (ts) => nums(ts).reduce((a, b) => a + b, 0);
const product = (ts) => nums(ts).reduce((a, b) => a * b, 1);
const sameColor = (ts) => ts.every((t) => t.color === ts[0].color);
const distinctColors = (ts) => new Set(ts.map((t) => t.color)).size === ts.length;
const allSameNum = (ts) => ts.every((t) => t.n === ts[0].n);
const distinctNums = (ts) => new Set(nums(ts)).size === ts.length;
const numCounts = (ts) => {
  const m = new Map();
  for (const t of ts) m.set(t.n, (m.get(t.n) || 0) + 1);
  return [...m.values()].sort((a, b) => a - b);
};
const isRunSet = (ts) => distinctNums(ts) && Math.max(...nums(ts)) - Math.min(...nums(ts)) === ts.length - 1;
const isRunSeq = (ts) => {
  const r = nums(ts);
  let asc = true, desc = true;
  for (let i = 1; i < r.length; i++) { if (r[i] !== r[i - 1] + 1) asc = false; if (r[i] !== r[i - 1] - 1) desc = false; }
  return asc || desc;
};
const isSkipRunSet = (ts) => {
  const r = nums(ts).slice().sort((a, b) => a - b);
  for (let i = 1; i < r.length; i++) if (r[i] - r[i - 1] !== 2) return false;
  return true;
};
const isDoubling = (ts) => {
  const r = nums(ts);
  let up = true, down = true;
  for (let i = 1; i < r.length; i++) { if (r[i] !== r[i - 1] * 2) up = false; if (r[i] * 2 !== r[i - 1]) down = false; }
  return up || down;
};
const allEven = (ts) => ts.every((t) => t.n % 2 === 0);
const allOdd = (ts) => ts.every((t) => t.n % 2 === 1);
const sameParity = (ts) => allEven(ts) || allOdd(ts);
const alternatingParity = (ts) => ts.every((t, i) => i === 0 || t.n % 2 !== ts[i - 1].n % 2);
const PRIMES = new Set([2, 3, 5, 7]);
const SQUARES = new Set([1, 4, 9]);
const twoColorAlternating = (ts) => ts.length >= 2 && ts[0].color !== ts[1].color && ts.every((t, i) => i < 2 || t.color === ts[i - 2].color);
const strictlySorted = (ts) => {
  let asc = true, desc = true;
  for (let i = 1; i < ts.length; i++) { if (ts[i].n <= ts[i - 1].n) asc = false; if (ts[i].n >= ts[i - 1].n) desc = false; }
  return asc || desc;
};

function colorCountFind(b, s, placedIdx, must, count) {
  const tiles = allPieces(b);
  const colors = must && placedIdx != null ? [b.cells[placedIdx].color] : [...new Set(tiles.map((i) => b.cells[i].color))];
  for (const c of colors) {
    const idxs = tiles.filter((i) => b.cells[i].color === c);
    if (idxs.length >= count) return idxs;
  }
  return null;
}
function numberCountFind(b, s, placedIdx, must, count) {
  const tiles = allPieces(b);
  const ns = must && placedIdx != null ? [b.cells[placedIdx].n] : [...new Set(tiles.map((i) => b.cells[i].n))];
  for (const n of ns) {
    const idxs = tiles.filter((i) => b.cells[i].n === n);
    if (idxs.length >= count) return idxs;
  }
  return null;
}
function fullSuitFind(b, s, placedIdx, must) {
  const tiles = allPieces(b);
  const colors = must && placedIdx != null ? [b.cells[placedIdx].color] : [...new Set(tiles.map((i) => b.cells[i].color))];
  for (const c of colors) {
    const idxs = tiles.filter((i) => b.cells[i].color === c);
    const have = new Set(idxs.map((i) => b.cells[i].n));
    let ok = true;
    for (let n = 1; n <= s.numMax; n++) if (!have.has(n)) { ok = false; break; }
    if (ok) return idxs;
  }
  return null;
}

const sumGoal = (id, name, target, size, points) => ({
  id, family: ['sum'], name, cat: 'Sums', shape: 'chain', size, points,
  desc: () => `A chain (${size[0]}–${size[1]} tiles) whose numbers add up to exactly ${target}`, test: (ts) => sum(ts) === target,
});
const productGoal = (id, name, target, size, points) => ({
  id, family: ['product'], name, cat: 'Products', shape: 'chain', size, points,
  desc: () => `A chain (${size[0]}–${size[1]} tiles) whose numbers multiply to exactly ${target}`, test: (ts) => product(ts) === target,
});

export const NUM_GOALS = [
  // ---- Sums ----
  sumGoal('nSum10', 'Sum 10', 10, [2, 3], 20),
  sumGoal('nSum15', 'Sum 15', 15, [2, 4], 30),
  sumGoal('nSum21', 'Sum 21', 21, [3, 5], 50),
  sumGoal('nSum30', 'Sum 30', 30, [4, 6], 80),
  { id: 'nLowSum', family: ['sum'], name: 'Featherweight', cat: 'Sums', shape: 'chain', size: 4, points: 60,
    desc: () => 'A 4-chain whose numbers add up to 12 or less', test: (ts) => sum(ts) <= 12 },
  { id: 'nHighSum', family: ['sum'], name: 'Heavyweight', cat: 'Sums', shape: 'chain', size: 3, points: 60,
    desc: () => 'A 3-chain whose numbers add up to 24 or more', test: (ts) => sum(ts) >= 24 },
  { id: 'nSumLine15', family: ['sum'], name: 'Fifteen Line', cat: 'Sums', shape: 'line', size: 3, points: 40,
    desc: () => 'Three in a straight line adding up to exactly 15', test: (ts) => sum(ts) === 15 },

  // ---- Products ----
  productGoal('nProd12', 'Product 12', 12, [2, 3], 30),
  productGoal('nProd24', 'Product 24', 24, [2, 3], 40),
  productGoal('nProd36', 'Product 36', 36, [2, 4], 50),
  productGoal('nProd48', 'Product 48', 48, [2, 4], 60),
  productGoal('nProd72', 'Product 72', 72, [2, 4], 80),
  productGoal('nProd100', 'Product 100', 100, [3, 4], 100),
  { id: 'nRoundProduct', family: ['product'], name: 'Round Product', cat: 'Products', shape: 'chain', size: 3, points: 40,
    desc: () => 'A 3-chain whose numbers multiply to a multiple of 10', test: (ts) => product(ts) % 10 === 0 },

  // ---- Runs ----
  { id: 'nRun3', family: ['run'], name: 'Run of 3', cat: 'Runs', shape: 'chain', size: 3, points: 30,
    desc: () => 'A 3-chain of consecutive numbers, any order', test: isRunSet },
  { id: 'nRun4', family: ['run'], name: 'Run of 4', cat: 'Runs', shape: 'chain', size: 4, points: 60,
    desc: () => 'A 4-chain of consecutive numbers, any order', test: isRunSet },
  { id: 'nRun5', family: ['run'], name: 'Run of 5', cat: 'Runs', shape: 'chain', size: 5, points: 120,
    desc: () => 'A 5-chain of consecutive numbers, any order', test: isRunSet },
  { id: 'nStaircase', family: ['run'], name: 'Staircase', cat: 'Runs', shape: 'chain', size: 4, points: 80, ordered: true,
    desc: () => 'A 4-chain that climbs or falls by 1 at every step along the chain', test: isRunSeq },
  { id: 'nSkipRun', family: ['run'], name: 'Skip Run', cat: 'Runs', shape: 'chain', size: 3, points: 50,
    desc: () => 'A 3-chain of numbers two apart (like 3-5-7), any order', test: isSkipRunSet },
  { id: 'nDoubling', family: ['run'], name: 'Doubling', cat: 'Runs', shape: 'chain', size: 3, points: 70, ordered: true,
    desc: () => 'A 3-chain where each number doubles the last (1-2-4, 2-4-8) or halves it', test: isDoubling },
  { id: 'nColorRun', family: ['run', 'mono'], name: 'Color Run', cat: 'Runs', shape: 'chain', size: 3, points: 100,
    desc: () => 'A 3-chain of consecutive numbers in one color', test: (ts) => isRunSet(ts) && sameColor(ts) },
  { id: 'nRainbowRun', family: ['run', 'rainbow'], name: 'Rainbow Run', cat: 'Runs', shape: 'chain', size: 4, points: 100,
    desc: () => 'A 4-chain of consecutive numbers in four different colors', test: (ts) => isRunSet(ts) && distinctColors(ts) },
  { id: 'nLadderLine', family: ['run'], name: 'Ladder Line', cat: 'Runs', shape: 'line', size: 3, points: 60, ordered: true,
    desc: () => 'Three in a straight line stepping by exactly 1, in order', test: isRunSeq },

  // ---- Colors ----
  { id: 'nFlush4', family: ['mono'], name: 'Flush', cat: 'Colors', shape: 'chain', size: 4, points: 50,
    desc: () => 'A 4-chain of one color', test: sameColor },
  { id: 'nFlush5', family: ['mono'], name: 'Big Flush', cat: 'Colors', shape: 'chain', size: 5, points: 100,
    desc: () => 'A 5-chain of one color', test: sameColor },
  { id: 'nPalette', family: ['rainbow'], name: 'Palette', cat: 'Colors', shape: 'chain', size: 3, points: 20,
    desc: () => 'A 3-chain of three different colors', test: distinctColors },
  { id: 'nRainbow', family: ['rainbow'], name: 'Rainbow', cat: 'Colors', shape: 'chain', size: (s) => s.numColors, points: 100,
    desc: (s) => `A ${s.numColors}-chain showing every color`, test: distinctColors },
  { id: 'nColorLine', family: ['mono'], name: 'Color Line', cat: 'Colors', shape: 'line', size: 3, points: 40,
    desc: () => 'Three of one color in a straight line', test: sameColor },
  { id: 'nTwoTone', family: ['pattern'], name: 'Two-Tone', cat: 'Colors', shape: 'chain', size: 4, points: 50, ordered: true,
    desc: () => 'A 4-chain alternating between two colors', test: twoColorAlternating },

  // ---- Poker hands ----
  { id: 'nPair', family: ['match'], name: 'Pair', cat: 'Poker hands', shape: 'chain', size: 2, points: 10,
    desc: () => 'Two touching tiles with the same number', test: allSameNum },
  { id: 'nThreeKind', family: ['match'], name: 'Three of a Kind', cat: 'Poker hands', shape: 'chain', size: 3, points: 60,
    desc: () => 'A 3-chain of the same number', test: allSameNum },
  { id: 'nFourKind', family: ['match'], name: 'Four of a Kind', cat: 'Poker hands', shape: 'chain', size: 4, points: 200,
    desc: () => 'A 4-chain of the same number', test: allSameNum },
  { id: 'nTwoPair', family: ['match'], name: 'Two Pair', cat: 'Poker hands', shape: 'chain', size: 4, points: 50,
    desc: () => 'A 4-chain made of two different pairs',
    test: (ts) => { const k = numCounts(ts); return k.length === 2 && k[0] === 2; } },
  { id: 'nFullHouse', family: ['match'], name: 'Full House', cat: 'Poker hands', shape: 'chain', size: 5, points: 150,
    desc: () => 'A 5-chain of three of a number plus a pair',
    test: (ts) => { const k = numCounts(ts); return k.length === 2 && k[0] === 2 && k[1] === 3; } },
  { id: 'nColorPair', family: ['match', 'mono'], name: 'Twins', cat: 'Poker hands', shape: 'chain', size: 2, points: 60, feasible: (s) => s.numCopies > 1,
    desc: () => 'Two touching tiles with the same number and the same color',
    test: (ts) => allSameNum(ts) && sameColor(ts) },

  // ---- Odds & evens ----
  { id: 'nSameParity', family: ['parity'], name: 'Same Parity', cat: 'Odds & evens', shape: 'chain', size: 4, points: 40,
    desc: () => 'A 4-chain of all odd or all even numbers', test: sameParity },
  { id: 'nZigzag', family: ['parity'], name: 'Zigzag', cat: 'Odds & evens', shape: 'chain', size: 4, points: 50, ordered: true,
    desc: () => 'A 4-chain alternating odd and even along the chain', test: alternatingParity },
  { id: 'nEvenLine', family: ['parity'], name: 'Even Line', cat: 'Odds & evens', shape: 'line', size: 3, points: 40,
    desc: () => 'Three even numbers in a straight line', test: allEven },
  { id: 'nOddLine', family: ['parity'], name: 'Odd Line', cat: 'Odds & evens', shape: 'line', size: 3, points: 40,
    desc: () => 'Three odd numbers in a straight line', test: allOdd },
  { id: 'nEvenRow', family: ['parity'], name: 'Even Row', cat: 'Odds & evens', shape: 'row', points: 100, minLen: 3,
    desc: () => 'Fill a row with even numbers only', test: allEven },
  { id: 'nOddRow', family: ['parity'], name: 'Odd Row', cat: 'Odds & evens', shape: 'row', points: 100, minLen: 3,
    desc: () => 'Fill a row with odd numbers only', test: allOdd },

  // ---- Number tricks ----
  { id: 'nPrimes', family: ['property'], name: 'Primes', cat: 'Number tricks', shape: 'chain', size: 3, points: 50,
    desc: () => 'A 3-chain of primes (2, 3, 5, 7)', test: (ts) => ts.every((t) => PRIMES.has(t.n)) },
  { id: 'nBig', family: ['property'], name: 'Big Three', cat: 'Number tricks', shape: 'chain', size: 3, points: 40,
    desc: () => 'A 3-chain of 7s, 8s and 9s', test: (ts) => ts.every((t) => t.n >= 7) },
  { id: 'nSmall', family: ['property'], name: 'Small Three', cat: 'Number tricks', shape: 'chain', size: 3, points: 40,
    desc: () => 'A 3-chain of 1s, 2s and 3s', test: (ts) => ts.every((t) => t.n <= 3) },
  { id: 'nTriples', family: ['property'], name: 'Triples', cat: 'Number tricks', shape: 'chain', size: 3, points: 50,
    desc: () => 'A 3-chain of multiples of 3 (3, 6, 9)', test: (ts) => ts.every((t) => t.n % 3 === 0) },
  { id: 'nSquares', family: ['property'], name: 'Perfect Squares', cat: 'Number tricks', shape: 'chain', size: 3, points: 60,
    desc: () => 'A 3-chain of square numbers (1, 4, 9)', test: (ts) => ts.every((t) => SQUARES.has(t.n)) },
  { id: 'nNines', family: ['property'], name: 'Nine Lives', cat: 'Number tricks', shape: 'chain', size: [2, 3], points: 40,
    desc: () => 'A chain (2–3 tiles) of numbers adding up to a multiple of 9', test: (ts) => sum(ts) % 9 === 0 },

  // ---- Full rows & columns ----
  { id: 'nFillRow', family: ['fill'], name: 'Fill a Row', cat: 'Full rows & columns', shape: 'row', points: 30,
    desc: () => 'Fill every open cell of a row', test: () => true },
  { id: 'nFillCol', family: ['fill'], name: 'Fill a Column', cat: 'Full rows & columns', shape: 'col', points: 30,
    desc: () => 'Fill every open cell of a column', test: () => true },
  { id: 'nLightRow', family: ['sum'], name: 'Light Row', cat: 'Full rows & columns', shape: 'row', points: 80, minLen: 3,
    desc: () => 'Fill a row whose numbers average 3 or less', test: (ts) => sum(ts) <= 3 * ts.length },
  { id: 'nHeavyRow', family: ['sum'], name: 'Heavy Row', cat: 'Full rows & columns', shape: 'row', points: 80, minLen: 3,
    desc: () => 'Fill a row whose numbers average 7 or more', test: (ts) => sum(ts) >= 7 * ts.length },
  { id: 'nRoundRow', family: ['sum'], name: 'Round Row', cat: 'Full rows & columns', shape: 'row', points: 60, minLen: 3,
    desc: () => 'Fill a row whose numbers add up to a multiple of 10', test: (ts) => sum(ts) % 10 === 0 },
  { id: 'nSortedRow', family: ['run', 'pattern'], name: 'Sorted Row', cat: 'Full rows & columns', shape: 'row', points: 150, minLen: 3,
    desc: () => 'Fill a row with numbers strictly rising or falling left to right', test: strictlySorted },
  { id: 'nDistinctRow', family: ['match'], name: 'Distinct Row', cat: 'Full rows & columns', shape: 'row', points: 50, minLen: 3,
    desc: () => 'Fill a row with no repeated number', test: distinctNums },
  { id: 'nMonoRow', family: ['mono'], name: 'Mono Row', cat: 'Full rows & columns', shape: 'row', points: 200, minLen: 3,
    desc: () => 'Fill a row with one color', test: sameColor },
  { id: 'nRainbowRow', family: ['rainbow'], name: 'Rainbow Row', cat: 'Full rows & columns', shape: 'row', points: 150, minLen: (s) => s.numColors,
    desc: () => 'Fill a row that shows every color', test: (ts, s) => new Set(ts.map((t) => t.color)).size === s.numColors },
  { id: 'nCheckeredRow', family: ['pattern'], name: 'Checkered Row', cat: 'Full rows & columns', shape: 'row', points: 120, minLen: 3,
    desc: () => 'Fill a row alternating two colors', test: twoColorAlternating },
  { id: 'nBookends', family: ['match'], name: 'Bookends', cat: 'Full rows & columns', shape: 'row', points: 40, minLen: 3,
    desc: () => 'Fill a row whose two end tiles show the same number', test: (ts) => ts[0].n === ts[ts.length - 1].n },
  { id: 'nColumnSum', family: ['sum'], name: 'Twenty Column', cat: 'Full rows & columns', shape: 'col', points: 70, minLen: 3,
    desc: () => 'Fill a column whose numbers add up to exactly 20', test: (ts) => sum(ts) === 20 },

  // ---- Blocks & shapes ----
  { id: 'nSquare20', family: ['sum', 'block'], name: 'Twenty Block', cat: 'Blocks & shapes', shape: 'square', points: 80,
    desc: () => 'A 2×2 block whose numbers add up to exactly 20', test: (ts) => sum(ts) === 20 },
  { id: 'nColorSquare', family: ['mono', 'block'], name: 'Color Block', cat: 'Blocks & shapes', shape: 'square', points: 100,
    desc: () => 'A 2×2 block of one color', test: sameColor },
  { id: 'nRainbowSquare', family: ['rainbow', 'block'], name: 'Rainbow Block', cat: 'Blocks & shapes', shape: 'square', points: 80,
    desc: () => 'A 2×2 block of four different colors', test: distinctColors },
  { id: 'nEvenSquare', family: ['parity', 'block'], name: 'Even Block', cat: 'Blocks & shapes', shape: 'square', points: 80,
    desc: () => 'A 2×2 block of even numbers', test: allEven },
  { id: 'nBalancedBlock', family: ['block'], name: 'Balanced Block', cat: 'Blocks & shapes', shape: 'square', points: 100,
    desc: () => 'A 2×2 block whose two diagonals add up to the same total',
    test: (ts) => ts[0].n + ts[3].n === ts[1].n + ts[2].n },
  { id: 'nSummit', family: ['pattern', 'block'], name: 'Summit', cat: 'Blocks & shapes', shape: 'plus', points: 80,
    desc: () => 'A tile bigger than all four of its neighbours', test: (ts) => ts.slice(1).every((t) => t.n < ts[0].n) },
  { id: 'nValley', family: ['pattern', 'block'], name: 'Valley', cat: 'Blocks & shapes', shape: 'plus', points: 80,
    desc: () => 'A tile smaller than all four of its neighbours', test: (ts) => ts.slice(1).every((t) => t.n > ts[0].n) },

  // ---- Board-wide ----
  { id: 'nFlood', family: ['board', 'mono'], name: 'Flood', cat: 'Board-wide', shape: 'board', count: 6, points: 100,
    desc: () => 'Six tiles of the placed tile’s color anywhere on the board; they all clear',
    find: (b, s, placedIdx, must) => colorCountFind(b, s, placedIdx, must, 6) },
  { id: 'nNumberSweep', family: ['board', 'match'], name: 'Sweep', cat: 'Board-wide', shape: 'board', count: 4, points: 120,
    desc: () => 'Four tiles showing the placed tile’s number anywhere on the board; they all clear',
    find: (b, s, placedIdx, must) => numberCountFind(b, s, placedIdx, must, 4) },
  { id: 'nFullSuit', family: ['board', 'mono'], name: 'Full Suit', cat: 'Board-wide', shape: 'board', count: (s) => s.numMax, points: 500,
    desc: (s) => `Every number from 1 to ${s.numMax} in the placed tile’s color on the board; they all clear`,
    find: fullSuitFind },
].map((d) => ({ ...d, deck: 'num' }));

export const NUM_DETAILS = {
  nSum10: () => 'A chain of 2 or 3 connected tiles whose numbers add up to exactly 10 (1+9, 4+6, 2+3+5…). Colors do not matter.',
  nSum15: () => 'A chain of 2 to 4 connected tiles whose numbers add up to exactly 15 (6+9, 4+5+6, 1+2+3+9…). Colors do not matter.',
  nSum21: () => 'A chain of 3 to 5 connected tiles whose numbers add up to exactly 21. Colors do not matter.',
  nSum30: () => 'A chain of 4 to 6 connected tiles whose numbers add up to exactly 30. Colors do not matter.',
  nLowSum: () => 'A chain of 4 connected tiles whose numbers add up to 12 or less (for example 1+2+3+4 or 1+1+2+5). Colors do not matter.',
  nHighSum: () => 'A chain of 3 connected tiles whose numbers add up to 24 or more (7+8+9, 8+8+8, 6+9+9…). Colors do not matter.',
  nSumLine15: () => 'Three tiles side by side in a single row or column whose numbers add up to exactly 15, like a magic-square line. No bends.',
  nProd12: () => 'A chain of 2 or 3 connected tiles whose numbers multiply to exactly 12: 3×4, 2×6, 2×2×3, 1×3×4, 1×2×6. Colors do not matter.',
  nProd24: () => 'A chain of 2 or 3 connected tiles whose numbers multiply to exactly 24: 3×8, 4×6, 2×3×4, 2×2×6, 1×3×8, 1×4×6. Colors do not matter.',
  nProd36: () => 'A chain of 2 to 4 connected tiles whose numbers multiply to exactly 36: 4×9, 6×6, 2×2×9, 3×3×4, 2×3×6, 1×4×9… Colors do not matter.',
  nProd48: () => 'A chain of 2 to 4 connected tiles whose numbers multiply to exactly 48: 6×8, 2×4×6, 2×3×8, 3×4×4, 2×2×2×6… Colors do not matter.',
  nProd72: () => 'A chain of 2 to 4 connected tiles whose numbers multiply to exactly 72: 8×9, 2×4×9, 3×4×6, 2×6×6, 3×3×8, 2×2×2×9… Colors do not matter.',
  nProd100: () => 'A chain of 3 or 4 connected tiles whose numbers multiply to exactly 100: 4×5×5, 2×2×5×5, 1×4×5×5. You need two 5s. Colors do not matter.',
  nRoundProduct: () => 'A chain of 3 connected tiles whose numbers multiply to a multiple of 10 (…0), which means the chain holds a 5 and at least one even number. Colors do not matter.',
  nRun3: () => 'A chain of 3 connected tiles whose numbers are consecutive, in any order along the chain (4-6-5 counts). Colors do not matter.',
  nRun4: () => 'A chain of 4 connected tiles whose numbers are consecutive, in any order along the chain. Colors do not matter.',
  nRun5: () => 'A chain of 5 connected tiles whose numbers are consecutive, in any order along the chain. Colors do not matter.',
  nStaircase: () => 'A chain of 4 connected tiles whose numbers rise by exactly 1 at every step along the chain (3-4-5-6), or fall by 1 at every step (6-5-4-3). Colors do not matter.',
  nSkipRun: () => 'A chain of 3 connected tiles whose numbers are two apart from each other when sorted: 1-3-5, 2-4-6, 3-5-7, 4-6-8 or 5-7-9, in any order along the chain.',
  nDoubling: () => 'A chain of 3 connected tiles where each number is double the previous one along the chain (1-2-4 or 2-4-8), or each is half the previous one (4-2-1, 8-4-2).',
  nColorRun: () => 'A chain of 3 connected tiles of one color whose numbers are consecutive, in any order along the chain.',
  nRainbowRun: () => 'A chain of 4 connected tiles whose numbers are consecutive (any order) and whose colors are all different.',
  nLadderLine: () => 'Three tiles side by side in a single row or column whose numbers step by exactly 1 in order (5-6-7 or 7-6-5). No bends. Colors do not matter.',
  nFlush4: () => 'A chain of 4 connected tiles of one color. Numbers do not matter.',
  nFlush5: () => 'A chain of 5 connected tiles of one color. Numbers do not matter.',
  nPalette: () => 'A chain of 3 connected tiles in 3 different colors. Numbers do not matter.',
  nRainbow: (s) => `A chain of ${s.numColors} connected tiles showing every one of the ${s.numColors} colors once. Numbers do not matter.`,
  nColorLine: () => 'Three tiles of one color side by side in a single row or column. No bends. Numbers do not matter.',
  nTwoTone: () => 'A chain of 4 connected tiles alternating exactly two colors along the chain: A, B, A, B. Numbers do not matter.',
  nPair: () => 'Two tiles showing the same number sitting next to each other (up, down, left or right). Colors do not matter.',
  nThreeKind: () => 'A chain of 3 connected tiles showing the same number. Colors do not matter.',
  nFourKind: () => 'A chain of 4 connected tiles showing the same number. Colors do not matter.',
  nTwoPair: () => 'A chain of exactly 4 connected tiles made of two pairs of different numbers, in any order along the chain (7-2-7-2). Four of one number does not count.',
  nFullHouse: () => 'A chain of exactly 5 connected tiles: three of one number plus two of another, in any order along the chain.',
  nColorPair: () => 'Two tiles sitting next to each other that show the same number in the same color. Only possible when the deck holds more than one copy of each tile.',
  nSameParity: () => 'A chain of 4 connected tiles that are all odd (1, 3, 5, 7, 9) or all even (2, 4, 6, 8). Colors do not matter.',
  nZigzag: () => 'A chain of 4 connected tiles whose numbers alternate odd and even along the chain (odd, even, odd, even or the reverse). Colors do not matter.',
  nEvenLine: () => 'Three even numbers (2, 4, 6, 8) side by side in a single row or column. No bends. Colors do not matter.',
  nOddLine: () => 'Three odd numbers (1, 3, 5, 7, 9) side by side in a single row or column. No bends. Colors do not matter.',
  nEvenRow: () => 'A completely filled row (wall to wall) in which every number is even.',
  nOddRow: () => 'A completely filled row (wall to wall) in which every number is odd.',
  nPrimes: () => 'A chain of 3 connected tiles that are all prime numbers: 2, 3, 5 or 7, repeats allowed. Colors do not matter.',
  nBig: () => 'A chain of 3 connected tiles that are all 7, 8 or 9. Colors do not matter.',
  nSmall: () => 'A chain of 3 connected tiles that are all 1, 2 or 3. Colors do not matter.',
  nTriples: () => 'A chain of 3 connected tiles that are all multiples of 3: 3, 6 or 9. Colors do not matter.',
  nSquares: () => 'A chain of 3 connected tiles that are all square numbers: 1, 4 or 9. Colors do not matter.',
  nNines: () => 'A chain of 2 or 3 connected tiles whose numbers add up to 9, 18 or 27 (4+5, 2+7, 3+6+9, 9+9…). Colors do not matter.',
  nFillRow: () => 'Every open cell of one row, from wall to wall, holds a tile. A curse in the row blocks it.',
  nFillCol: () => 'Every open cell of one column, from wall to wall, holds a tile. A curse in the column blocks it.',
  nLightRow: () => 'A completely filled row (wall to wall) whose numbers add up to at most 3 × the row length, so they average 3 or less.',
  nHeavyRow: () => 'A completely filled row (wall to wall) whose numbers add up to at least 7 × the row length, so they average 7 or more.',
  nRoundRow: () => 'A completely filled row (wall to wall) whose numbers add up to a multiple of 10 (10, 20, 30…).',
  nSortedRow: () => 'A completely filled row (wall to wall) whose numbers strictly rise from left to right (2-3-5-8) or strictly fall. Equal neighbours break it.',
  nDistinctRow: () => 'A completely filled row (wall to wall) in which no number appears twice. Colors do not matter.',
  nMonoRow: () => 'A completely filled row (wall to wall) in which every tile is the same color.',
  nRainbowRow: (s) => `A completely filled row (wall to wall) in which every one of the ${s.numColors} colors appears at least once. Only offered while the row is long enough.`,
  nCheckeredRow: () => 'A completely filled row (wall to wall) that alternates exactly two colors from left to right. Numbers do not matter.',
  nBookends: () => 'A completely filled row (wall to wall) whose leftmost and rightmost tiles show the same number.',
  nColumnSum: () => 'A completely filled column (wall to wall) whose numbers add up to exactly 20.',
  nSquare20: () => 'Four tiles forming a 2×2 block whose numbers add up to exactly 20. Colors do not matter.',
  nColorSquare: () => 'Four tiles of one color forming a 2×2 block. Numbers do not matter.',
  nRainbowSquare: () => 'A 2×2 block of four tiles in four different colors. Numbers do not matter.',
  nEvenSquare: () => 'A 2×2 block of four even numbers. Colors do not matter.',
  nBalancedBlock: () => 'A 2×2 block in which the two diagonals add up to the same total: top-left + bottom-right = top-right + bottom-left (for example 3 and 7 on one diagonal, 6 and 4 on the other). Colors do not matter.',
  nSummit: () => 'A tile whose four side neighbours (up, down, left, right) all show smaller numbers than it. All five cells must hold tiles. Colors do not matter.',
  nValley: () => 'A tile whose four side neighbours (up, down, left, right) all show bigger numbers than it. All five cells must hold tiles. Colors do not matter.',
  nFlood: () => 'At least six tiles of the same color anywhere between the walls. The tile you just placed must be that color, and every tile of that color clears at once.',
  nNumberSweep: () => 'At least four tiles showing the same number anywhere between the walls. The tile you just placed must show that number, and every tile with it clears at once.',
  nFullSuit: (s) => `Every number from 1 to ${s.numMax} of a single color present between the walls at once. The tile you just placed must be that color, and all those tiles clear.`,
};
