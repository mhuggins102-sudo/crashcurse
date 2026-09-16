// Goals for the numbered-tile deck. Pieces are {kind:'num', color 0..c-1, n 1..max}.
import { allPieces, neighbors, rowIdxs, colIdxs, openRows, openCols, perimeterIdxs, isStraightIdxs, turnsEveryStep } from './shapes.js';

// A cell counts as filled for the plain fill goals: a tile, or (by default) a curse too.
const filled = (b, s, i) => !!b.cells[i] && (b.cells[i].kind !== 'curse' || !!s.cursesFill);

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

// Which attributes each goal cares about (colors, numbers), shown as two flags on the card.
const NUM_USES = {
  nSum10: { color: false, num: true },
  nSum15: { color: false, num: true },
  nSum21: { color: false, num: true },
  nSum30: { color: false, num: true },
  nLowSum: { color: false, num: true },
  nHighSum: { color: false, num: true },
  nSumLine15: { color: false, num: true },
  nProd12: { color: false, num: true },
  nProd24: { color: false, num: true },
  nProd36: { color: false, num: true },
  nProd48: { color: false, num: true },
  nProd72: { color: false, num: true },
  nProd100: { color: false, num: true },
  nRoundProduct: { color: false, num: true },
  nRun3: { color: false, num: true },
  nRun4: { color: false, num: true },
  nRun5: { color: false, num: true },
  nStaircase: { color: false, num: true },
  nSkipRun: { color: false, num: true },
  nDoubling: { color: false, num: true },
  nColorRun: { color: true, num: true },
  nRainbowRun: { color: true, num: true },
  nLadderLine: { color: false, num: true },
  nFlush4: { color: true, num: false },
  nFlush5: { color: true, num: false },
  nPalette: { color: true, num: false },
  nRainbow: { color: true, num: false },
  nColorLine: { color: true, num: false },
  nTwoTone: { color: true, num: false },
  nPair: { color: false, num: true },
  nThreeKind: { color: false, num: true },
  nFourKind: { color: false, num: true },
  nTwoPair: { color: false, num: true },
  nFullHouse: { color: false, num: true },
  nColorPair: { color: true, num: true },
  nSameParity: { color: false, num: true },
  nZigzag: { color: false, num: true },
  nEvenLine: { color: false, num: true },
  nOddLine: { color: false, num: true },
  nEvenRow: { color: false, num: true },
  nOddRow: { color: false, num: true },
  nPrimes: { color: false, num: true },
  nBig: { color: false, num: true },
  nSmall: { color: false, num: true },
  nTriples: { color: false, num: true },
  nSquares: { color: false, num: true },
  nNines: { color: false, num: true },
  nFillRow: { color: false, num: false },
  nFillCol: { color: false, num: false },
  nLightRow: { color: false, num: true },
  nHeavyRow: { color: false, num: true },
  nRoundRow: { color: false, num: true },
  nSortedRow: { color: false, num: true },
  nDistinctRow: { color: false, num: true },
  nMonoRow: { color: true, num: false },
  nRainbowRow: { color: true, num: false },
  nCheckeredRow: { color: true, num: false },
  nBookends: { color: false, num: true },
  nColumnSum: { color: false, num: true },
  nSquare20: { color: false, num: true },
  nColorSquare: { color: true, num: false },
  nRainbowSquare: { color: true, num: false },
  nEvenSquare: { color: false, num: true },
  nBalancedBlock: { color: false, num: true },
  nSummit: { color: false, num: true },
  nValley: { color: false, num: true },
  nFlood: { color: true, num: false },
  nNumberSweep: { color: false, num: true },
  nFullSuit: { color: true, num: true },
  nSum12: { color: false, num: true },
  nSum18: { color: false, num: true },
  nSum25: { color: false, num: true },
  nLucky13: { color: false, num: true },
  nTens: { color: false, num: true },
  nDozenLine: { color: false, num: true },
  nSplit: { color: false, num: true },
  nTimesTable: { color: false, num: true },
  nMidpoint: { color: false, num: true },
  nThirtyRow: { color: false, num: true },
  nHeavyColumn: { color: false, num: true },
  nBigGap: { color: false, num: true },
  nNextDoor: { color: false, num: true },
  nDoubleTrouble: { color: false, num: true },
  nFiveMiddle: { color: false, num: true },
  nEndsOfEarth: { color: false, num: true },
  nFibonacci: { color: false, num: true },
  nTriangular: { color: false, num: true },
  nOddOneOut: { color: false, num: true },
  nTwinPrimes: { color: false, num: true },
  nLuckySevens: { color: false, num: true },
  nSnakeEyes: { color: false, num: true },
  nMirrorLine: { color: false, num: true },
  nClimbingLine: { color: false, num: true },
  nSkipLine: { color: false, num: true },
  nPrimeLine: { color: false, num: true },
  nSquareLine: { color: false, num: true },
  nSortedColumn: { color: false, num: true },
  nEvenColumn: { color: false, num: true },
  nOddColumn: { color: false, num: true },
  nPrimeRow: { color: false, num: true },
  nMirrorRow: { color: true, num: false },
  nDuotoneRow: { color: true, num: false },
  nTrioRow: { color: true, num: false },
  nColorBookends: { color: true, num: false },
  nSuitedFifteen: { color: true, num: true },
  nSuitedTen: { color: true, num: true },
  nRainbowFifteen: { color: true, num: true },
  nTwoColorRun: { color: true, num: true },
  nOddSuit: { color: true, num: true },
  nEvenSuit: { color: true, num: true },
  nBigSuit: { color: true, num: true },
  nTenBlock: { color: false, num: true },
  nRunBlock: { color: false, num: true },
  nPairBlock: { color: false, num: true },
  nDiagonalBlock: { color: true, num: false },
  nCheckerBlock: { color: false, num: true },
  nRainbowPlus: { color: true, num: false },
  nOddPlus: { color: false, num: true },
  nPetals: { color: true, num: false },
  nRinged: { color: true, num: false },
  nCross25: { color: false, num: true },
  nDiagonalTrio: { color: true, num: false },
  nDiagonalRun: { color: false, num: true },
  nDiagonalPair: { color: false, num: true },
  nElbow: { color: true, num: false },
  nWiggle: { color: false, num: false },
  nStraightFour: { color: false, num: true },
  nCleanSweep: { color: false, num: false },
  nPictureFrame: { color: false, num: false },
  nCrossroads: { color: false, num: false },
  nDoubleDecker: { color: false, num: false },
  nNumberStack: { color: false, num: true },
  nFullSpectrum: { color: true, num: true },
  nDeluge: { color: true, num: false },
  nHeadCount: { color: false, num: true },
  nEcho: { color: false, num: true },
  nEncore: { color: true, num: false },
  nExorcist: { color: false, num: false },
  nCornerstone: { color: true, num: false },
  nHermit: { color: false, num: false },
};

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
  { id: 'nFillRow', family: ['fill'], repeatable: true, cursesFill: true, name: 'Fill a Row', cat: 'Full rows & columns', shape: 'row', points: 30,
    desc: () => 'Fill every open cell of a row', test: () => true },
  { id: 'nFillCol', family: ['fill'], repeatable: true, cursesFill: true, name: 'Fill a Column', cat: 'Full rows & columns', shape: 'col', points: 30,
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

  // ---- More sums & arithmetic ----
  sumGoal('nSum12', 'Sum 12', 12, [2, 3], 25),
  sumGoal('nSum18', 'Sum 18', 18, [2, 4], 40),
  sumGoal('nSum25', 'Sum 25', 25, [3, 5], 60),
  { id: 'nLucky13', family: ['sum'], name: 'Lucky 13', cat: 'Sums', shape: 'chain', size: [2, 4], points: 40,
    desc: () => 'A chain (2–4 tiles) adding up to exactly 13', test: (ts) => sum(ts) === 13 },
  { id: 'nTens', family: ['sum'], name: 'Tens', cat: 'Sums', shape: 'chain', size: 4, points: 50,
    desc: () => 'A 4-chain adding up to a multiple of 10', test: (ts) => sum(ts) % 10 === 0 },
  { id: 'nDozenLine', family: ['sum'], name: 'Dozen Line', cat: 'Sums', shape: 'line', size: 3, points: 40,
    desc: () => 'Three in a straight line adding up to exactly 12', test: (ts) => sum(ts) === 12 },
  { id: 'nSplit', family: ['sum'], name: 'Split', cat: 'Sums', shape: 'chain', size: 3, points: 50,
    desc: () => 'A 3-chain where one number is the sum of the other two',
    test: (ts) => { const [a, b, c] = nums(ts).sort((x, y) => x - y); return a + b === c; } },
  { id: 'nTimesTable', family: ['product'], name: 'Times Table', cat: 'Products', shape: 'chain', size: 3, points: 70,
    desc: () => 'A 3-chain where one number is the product of the other two',
    test: (ts) => { const [a, b, c] = nums(ts).sort((x, y) => x - y); return a * b === c; } },
  { id: 'nMidpoint', family: ['sum'], name: 'Midpoint', cat: 'Sums', shape: 'line', size: 3, points: 50,
    desc: () => 'Three in a straight line where the middle number is the average of the ends',
    test: (ts) => ts[0].n + ts[2].n === 2 * ts[1].n },
  { id: 'nThirtyRow', family: ['sum'], name: 'Thirty Row', cat: 'Full rows & columns', shape: 'row', points: 80, minLen: 3,
    desc: () => 'Fill a row whose numbers add up to exactly 30', test: (ts) => sum(ts) === 30 },
  { id: 'nHeavyColumn', family: ['sum'], name: 'Heavy Column', cat: 'Full rows & columns', shape: 'col', points: 80, minLen: 3,
    desc: () => 'Fill a column whose numbers average 7 or more', test: (ts) => sum(ts) >= 7 * ts.length },
  { id: 'nBigGap', family: ['property'], name: 'Big Gap', cat: 'Number tricks', shape: 'chain', size: 2, points: 30,
    desc: () => 'Two touching tiles at least 7 apart (1 & 8, 1 & 9, 2 & 9)', test: (ts) => Math.abs(ts[0].n - ts[1].n) >= 7 },
  { id: 'nNextDoor', family: ['run'], name: 'Next Door', cat: 'Runs', shape: 'chain', size: 2, points: 15,
    desc: () => 'Two touching tiles exactly 1 apart', test: (ts) => Math.abs(ts[0].n - ts[1].n) === 1 },
  { id: 'nDoubleTrouble', family: ['product'], name: 'Double Trouble', cat: 'Products', shape: 'chain', size: 2, points: 30,
    desc: () => 'Two touching tiles where one is double the other', test: (ts) => ts[0].n === 2 * ts[1].n || ts[1].n === 2 * ts[0].n },
  { id: 'nFiveMiddle', family: ['property'], name: 'Five in the Middle', cat: 'Number tricks', shape: 'chain', size: 3, points: 50,
    desc: () => 'A 3-chain whose middle value, once sorted, is a 5', test: (ts) => nums(ts).sort((x, y) => x - y)[1] === 5 },
  { id: 'nEndsOfEarth', family: ['property'], name: 'Ends of the Earth', cat: 'Number tricks', shape: 'chain', size: 3, points: 60,
    desc: () => 'A 3-chain holding both a 1 and a 9', test: (ts) => nums(ts).includes(1) && nums(ts).includes(9) },
  { id: 'nFibonacci', family: ['run'], name: 'Fibonacci', cat: 'Runs', shape: 'chain', size: 3, points: 70,
    desc: () => 'Three consecutive Fibonacci numbers (1-2-3, 2-3-5 or 3-5-8), any order',
    test: (ts) => { const k = nums(ts).sort((x, y) => x - y).join('-'); return k === '1-2-3' || k === '2-3-5' || k === '3-5-8'; } },
  { id: 'nTriangular', family: ['property'], name: 'Triangular Trio', cat: 'Number tricks', shape: 'chain', size: 3, points: 70,
    desc: () => 'A 3-chain of 1, 3 and 6, the first triangular numbers', test: (ts) => nums(ts).sort((x, y) => x - y).join('-') === '1-3-6' },
  { id: 'nOddOneOut', family: ['parity'], name: 'Odd One Out', cat: 'Odds & evens', shape: 'chain', size: 4, points: 50,
    desc: () => 'A 4-chain where exactly one tile differs in parity from the other three',
    test: (ts) => { const odd = ts.filter((t) => t.n % 2 === 1).length; return odd === 1 || odd === 3; } },
  { id: 'nTwinPrimes', family: ['property'], name: 'Twin Primes', cat: 'Number tricks', shape: 'chain', size: 2, points: 40,
    desc: () => 'Two touching primes two apart: 3 & 5 or 5 & 7',
    test: (ts) => { const k = nums(ts).sort((x, y) => x - y).join('-'); return k === '3-5' || k === '5-7'; } },
  { id: 'nLuckySevens', family: ['match'], name: 'Lucky Sevens', cat: 'Poker hands', shape: 'chain', size: 2, points: 40,
    desc: () => 'Two touching 7s', test: (ts) => ts.every((t) => t.n === 7) },
  { id: 'nSnakeEyes', family: ['match'], name: 'Snake Eyes', cat: 'Poker hands', shape: 'chain', size: 2, points: 30,
    desc: () => 'Two touching 1s', test: (ts) => ts.every((t) => t.n === 1) },
  { id: 'nMirrorLine', family: ['match'], name: 'Mirror Line', cat: 'Poker hands', shape: 'line', size: 3, points: 40,
    desc: () => 'Three in a straight line with the same number at both ends', test: (ts) => ts[0].n === ts[2].n },
  { id: 'nClimbingLine', family: ['run'], name: 'Climbing Line', cat: 'Runs', shape: 'line', size: 3, points: 40, ordered: true,
    desc: () => 'Three in a straight line rising or falling in order, by any step', test: strictlySorted },
  { id: 'nSkipLine', family: ['run'], name: 'Skip Line', cat: 'Runs', shape: 'line', size: 3, points: 60, ordered: true,
    desc: () => 'Three in a straight line stepping by exactly 2 in order (3-5-7 or 7-5-3)',
    test: (ts) => (ts[1].n - ts[0].n === 2 && ts[2].n - ts[1].n === 2) || (ts[0].n - ts[1].n === 2 && ts[1].n - ts[2].n === 2) },
  { id: 'nPrimeLine', family: ['property'], name: 'Prime Line', cat: 'Number tricks', shape: 'line', size: 3, points: 60,
    desc: () => 'Three primes in a straight line', test: (ts) => ts.every((t) => PRIMES.has(t.n)) },
  { id: 'nSquareLine', family: ['property'], name: 'Square Line', cat: 'Number tricks', shape: 'line', size: 3, points: 70,
    desc: () => 'Three square numbers (1, 4, 9) in a straight line', test: (ts) => ts.every((t) => SQUARES.has(t.n)) },
  { id: 'nSortedColumn', family: ['run', 'pattern'], name: 'Sorted Column', cat: 'Full rows & columns', shape: 'col', points: 150, minLen: 3,
    desc: () => 'Fill a column with numbers strictly rising or falling top to bottom', test: strictlySorted },
  { id: 'nEvenColumn', family: ['parity'], name: 'Even Column', cat: 'Odds & evens', shape: 'col', points: 100, minLen: 3,
    desc: () => 'Fill a column with even numbers only', test: allEven },
  { id: 'nOddColumn', family: ['parity'], name: 'Odd Column', cat: 'Odds & evens', shape: 'col', points: 100, minLen: 3,
    desc: () => 'Fill a column with odd numbers only', test: allOdd },
  { id: 'nPrimeRow', family: ['property'], name: 'Prime Row', cat: 'Full rows & columns', shape: 'row', points: 150, minLen: 3,
    desc: () => 'Fill a row with primes only (2, 3, 5, 7)', test: (ts) => ts.every((t) => PRIMES.has(t.n)) },
  { id: 'nMirrorRow', family: ['pattern'], name: 'Mirror Row', cat: 'Full rows & columns', shape: 'row', points: 120, minLen: 3,
    desc: () => 'Fill a row whose colors read the same from either end',
    test: (ts) => ts.every((t, i) => t.color === ts[ts.length - 1 - i].color) },
  { id: 'nDuotoneRow', family: ['pattern'], name: 'Duotone Row', cat: 'Full rows & columns', shape: 'row', points: 70, minLen: 3,
    desc: () => 'Fill a row using exactly two colors, in any arrangement', test: (ts) => new Set(ts.map((t) => t.color)).size === 2 },
  { id: 'nTrioRow', family: ['pattern'], name: 'Trio Row', cat: 'Full rows & columns', shape: 'row', points: 60, minLen: 4,
    desc: () => 'Fill a row using exactly three colors', test: (ts) => new Set(ts.map((t) => t.color)).size === 3 },
  { id: 'nColorBookends', family: ['pattern'], name: 'Color Bookends', cat: 'Full rows & columns', shape: 'row', points: 40, minLen: 3,
    desc: () => 'Fill a row whose two end tiles share a color', test: (ts) => ts[0].color === ts[ts.length - 1].color },
  { id: 'nSuitedFifteen', family: ['sum', 'mono'], name: 'Suited Fifteen', cat: 'Colors', shape: 'chain', size: 3, points: 80,
    desc: () => 'A 3-chain of one color adding up to 15', test: (ts) => sameColor(ts) && sum(ts) === 15 },
  { id: 'nSuitedTen', family: ['sum', 'mono'], name: 'Suited Ten', cat: 'Colors', shape: 'chain', size: 2, points: 50,
    desc: () => 'Two touching tiles of one color adding up to 10', test: (ts) => sameColor(ts) && sum(ts) === 10 },
  { id: 'nRainbowFifteen', family: ['sum', 'rainbow'], name: 'Rainbow Fifteen', cat: 'Colors', shape: 'chain', size: 3, points: 70,
    desc: () => 'A 3-chain of three different colors adding up to 15', test: (ts) => distinctColors(ts) && sum(ts) === 15 },
  { id: 'nTwoColorRun', family: ['run', 'pattern'], name: 'Two-Color Run', cat: 'Runs', shape: 'chain', size: 4, points: 80,
    desc: () => 'A run of 4 consecutive numbers using exactly two colors', test: (ts) => isRunSet(ts) && new Set(ts.map((t) => t.color)).size === 2 },
  { id: 'nOddSuit', family: ['parity', 'mono'], name: 'Odd Suit', cat: 'Colors', shape: 'chain', size: 3, points: 60,
    desc: () => 'A 3-chain of odd numbers in one color', test: (ts) => allOdd(ts) && sameColor(ts) },
  { id: 'nEvenSuit', family: ['parity', 'mono'], name: 'Even Suit', cat: 'Colors', shape: 'chain', size: 3, points: 60,
    desc: () => 'A 3-chain of even numbers in one color', test: (ts) => allEven(ts) && sameColor(ts) },
  { id: 'nBigSuit', family: ['property', 'mono'], name: 'Big Suit', cat: 'Colors', shape: 'chain', size: 3, points: 70,
    desc: () => 'A 3-chain of 7s, 8s and 9s in one color', test: (ts) => ts.every((t) => t.n >= 7) && sameColor(ts) },

  // ---- More blocks & shapes ----
  { id: 'nTenBlock', family: ['sum', 'block'], name: 'Ten Block', cat: 'Blocks & shapes', shape: 'square', points: 90,
    desc: () => 'A 2×2 block adding up to exactly 10', test: (ts) => sum(ts) === 10 },
  { id: 'nRunBlock', family: ['run', 'block'], name: 'Run Block', cat: 'Blocks & shapes', shape: 'square', points: 120,
    desc: () => 'A 2×2 block of four consecutive numbers', test: isRunSet },
  { id: 'nPairBlock', family: ['match', 'block'], name: 'Pair Block', cat: 'Blocks & shapes', shape: 'square', points: 90,
    desc: () => 'A 2×2 block made of two pairs of numbers', test: (ts) => { const k = numCounts(ts); return k.length === 2 && k[0] === 2; } },
  { id: 'nDiagonalBlock', family: ['pattern', 'block'], name: 'Diagonal Block', cat: 'Blocks & shapes', shape: 'square', points: 80,
    desc: () => 'A 2×2 block where each diagonal shares a color and the two diagonals differ',
    test: (ts) => ts[0].color === ts[3].color && ts[1].color === ts[2].color && ts[0].color !== ts[1].color },
  { id: 'nCheckerBlock', family: ['parity', 'block'], name: 'Checker Block', cat: 'Blocks & shapes', shape: 'square', points: 80,
    desc: () => 'A 2×2 block where diagonal tiles share a parity and side neighbours differ',
    test: (ts) => ts[0].n % 2 === ts[3].n % 2 && ts[1].n % 2 === ts[2].n % 2 && ts[0].n % 2 !== ts[1].n % 2 },
  { id: 'nRainbowPlus', family: ['rainbow', 'block'], name: 'Rainbow Plus', cat: 'Blocks & shapes', shape: 'plus', points: 150,
    desc: () => 'A plus of five different colors', test: distinctColors },
  { id: 'nOddPlus', family: ['parity', 'block'], name: 'Odd Plus', cat: 'Blocks & shapes', shape: 'plus', points: 100,
    desc: () => 'A plus of five odd numbers', test: allOdd },
  { id: 'nPetals', family: ['pattern', 'block'], name: 'Petals', cat: 'Blocks & shapes', shape: 'plus', points: 150,
    desc: () => 'A tile whose four neighbours all share one color different from its own',
    test: (ts) => { const [c, ...p] = ts; return p.every((t) => t.color === p[0].color) && p[0].color !== c.color; } },
  { id: 'nRinged', family: ['pattern', 'block'], name: 'Ringed', cat: 'Blocks & shapes', shape: 'plus', points: 80,
    desc: () => 'A tile whose four neighbours are all a different color from it',
    test: (ts) => ts.slice(1).every((t) => t.color !== ts[0].color) },
  { id: 'nCross25', family: ['sum', 'block'], name: 'Cross of 25', cat: 'Blocks & shapes', shape: 'plus', points: 120,
    desc: () => 'A plus of five tiles adding up to exactly 25', test: (ts) => sum(ts) === 25 },

  // ---- Geometry ----
  { id: 'nDiagonalTrio', family: ['mono', 'geometry'], name: 'Diagonal Trio', cat: 'Geometry', shape: 'diag', size: 3, points: 60,
    desc: () => 'Three tiles of one color on a diagonal', test: sameColor },
  { id: 'nDiagonalRun', family: ['run', 'geometry'], name: 'Diagonal Run', cat: 'Geometry', shape: 'diag', size: 3, points: 70,
    desc: () => 'Three consecutive numbers on a diagonal, any order', test: isRunSet },
  { id: 'nDiagonalPair', family: ['match', 'geometry'], name: 'Diagonal Pair', cat: 'Geometry', shape: 'diag', size: 2, points: 30,
    desc: () => 'Two tiles with the same number touching at a corner', test: allSameNum },
  { id: 'nElbow', family: ['mono', 'geometry'], name: 'Elbow', cat: 'Geometry', shape: 'chain', size: 3, points: 40, ordered: true,
    geometry: (idxs, b) => !isStraightIdxs(b, idxs),
    desc: () => 'A bent 3-chain of one color: an L, not a straight line', test: sameColor },
  { id: 'nWiggle', family: ['geometry'], name: 'Wiggle', cat: 'Geometry', shape: 'chain', size: 4, points: 60, ordered: true,
    geometry: (idxs, b) => turnsEveryStep(b, idxs),
    desc: () => 'A 4-chain that turns at every step; colors and numbers do not matter', test: () => true },
  { id: 'nStraightFour', family: ['geometry', 'sum'], name: 'Dead Straight', cat: 'Geometry', shape: 'line', size: 4, points: 60,
    desc: () => 'Four in a straight line adding up to 20', test: (ts) => sum(ts) === 20 },

  // ---- Board-wide & big shapes ----
  { id: 'nCleanSweep', family: ['board', 'fill'], cursesFill: true, name: 'Clean Sweep', cat: 'Board-wide', shape: 'board', count: 0, countText: 'all', points: 500,
    desc: () => 'Fill every open cell between the walls; the whole board clears',
    find: (b, s, placedIdx, must) => {
      const idxs = [];
      for (const r of openRows(b)) for (const i of rowIdxs(b, r)) { if (!filled(b, s, i)) return null; idxs.push(i); }
      return idxs.length ? idxs : null;
    } },
  { id: 'nPictureFrame', family: ['board', 'fill'], cursesFill: true, name: 'Picture Frame', cat: 'Board-wide', shape: 'board', count: 0, countText: 'edge', points: 300,
    desc: () => 'Fill every cell along the border of the open board; the frame clears',
    feasible: (s, b) => (b.H - b.inset.top - b.inset.bottom) >= 3 && (b.W - b.inset.left - b.inset.right) >= 3,
    find: (b, s, placedIdx, must) => {
      const per = perimeterIdxs(b);
      if (per.length < 4 || per.some((i) => !filled(b, s, i))) return null;
      if (must && placedIdx != null && !per.includes(placedIdx)) return null;
      return per;
    } },
  { id: 'nCrossroads', family: ['board', 'fill'], cursesFill: true, name: 'Crossroads', cat: 'Board-wide', shape: 'board', count: 0, countText: '+', points: 200,
    desc: () => 'Complete a full row and a full column that cross at the placed tile; both clear',
    feasible: (s, b) => (b.H - b.inset.top - b.inset.bottom) >= 2 && (b.W - b.inset.left - b.inset.right) >= 2,
    find: (b, s, placedIdx, must) => {
      const full = (idxs) => idxs.length >= 2 && idxs.every((i) => filled(b, s, i));
      const tryCell = (i) => { const r = (i / b.W) | 0, c = i % b.W; const ri = rowIdxs(b, r), ci = colIdxs(b, c); return full(ri) && full(ci) ? [...new Set([...ri, ...ci])] : null; };
      if (must && placedIdx != null) return tryCell(placedIdx);
      for (const i of allPieces(b)) { const f = tryCell(i); if (f) return f; }
      return null;
    } },
  { id: 'nDoubleDecker', family: ['board', 'fill'], cursesFill: true, name: 'Double Decker', cat: 'Board-wide', shape: 'board', count: 0, countText: '2 rows', points: 250,
    desc: () => 'Complete two neighbouring full rows, one of them holding the placed tile; both clear',
    feasible: (s, b) => (b.H - b.inset.top - b.inset.bottom) >= 2 && (b.W - b.inset.left - b.inset.right) >= 2,
    find: (b, s, placedIdx, must) => {
      const full = (r) => { const idxs = rowIdxs(b, r); return idxs.length >= 2 && idxs.every((i) => filled(b, s, i)) ? idxs : null; };
      const rows = openRows(b);
      const cand = must && placedIdx != null ? [(placedIdx / b.W) | 0] : rows;
      for (const r of cand) for (const r2 of [r - 1, r + 1]) {
        if (!rows.includes(r2)) continue;
        const a = full(r), c = full(r2);
        if (a && c) return a.concat(c);
      }
      return null;
    } },
  { id: 'nNumberStack', family: ['match'], name: 'Number Stack', cat: 'Full rows & columns', shape: 'col', points: 300, minLen: 3,
    desc: () => 'Fill a column with the same number all the way down', test: allSameNum },
  { id: 'nFullSpectrum', family: ['board', 'match', 'rainbow'], name: 'Full Spectrum', cat: 'Board-wide', shape: 'board', count: (s) => s.numColors, points: 200,
    desc: (s) => `The placed tile's number in all ${s.numColors} colors somewhere on the board; they all clear`,
    find: (b, s, placedIdx, must) => {
      const tiles = allPieces(b);
      const ns = must && placedIdx != null ? [b.cells[placedIdx].n] : [...new Set(tiles.map((i) => b.cells[i].n))];
      for (const n of ns) {
        const idxs = tiles.filter((i) => b.cells[i].n === n);
        if (new Set(idxs.map((i) => b.cells[i].color)).size >= s.numColors) return idxs;
      }
      return null;
    } },
  { id: 'nDeluge', family: ['board', 'mono'], name: 'Deluge', cat: 'Board-wide', shape: 'board', count: 9, points: 200,
    desc: () => 'Nine tiles of the placed tile’s color anywhere on the board; they all clear',
    find: (b, s, placedIdx, must) => colorCountFind(b, s, placedIdx, must, 9) },

  // ---- Placement: about the tile you just put down ----
  { id: 'nHeadCount', family: ['placement'], name: 'Head Count', cat: 'Placement', shape: 'spot', points: 60,
    desc: () => 'Place a tile whose number equals how many tiles it touches (1 to 4); it and its neighbours clear',
    find: (b, s, placedIdx) => {
      if (placedIdx == null) return null;
      const ns = neighbors(b, placedIdx).filter((i) => b.cells[i] && b.cells[i].kind !== 'curse');
      return ns.length >= 1 && ns.length === b.cells[placedIdx].n ? [placedIdx, ...ns] : null;
    } },
  { id: 'nEcho', family: ['placement', 'match'], name: 'Echo', cat: 'Placement', shape: 'spot', points: 40,
    desc: () => 'Place a tile showing the same number as the tile you placed just before; both clear',
    find: (b, s, placedIdx) => {
      const p = b.prevPlaced;
      if (placedIdx == null || !p || p.idx === placedIdx || b.cells[p.idx] !== p.piece) return null;
      return b.cells[placedIdx].n === p.piece.n ? [placedIdx, p.idx] : null;
    } },
  { id: 'nEncore', family: ['placement', 'mono'], name: 'Encore', cat: 'Placement', shape: 'spot', points: 30,
    desc: () => 'Place a tile of the same color as the tile you placed just before; both clear',
    find: (b, s, placedIdx) => {
      const p = b.prevPlaced;
      if (placedIdx == null || !p || p.idx === placedIdx || b.cells[p.idx] !== p.piece) return null;
      return b.cells[placedIdx].color === p.piece.color ? [placedIdx, p.idx] : null;
    } },
  { id: 'nExorcist', family: ['placement'], name: 'Exorcist', cat: 'Placement', shape: 'spot', points: 50,
    desc: () => 'Place a tile touching a curse; the tile and the curse both vanish',
    find: (b, s, placedIdx) => {
      if (placedIdx == null) return null;
      const curses = neighbors(b, placedIdx).filter((i) => b.cells[i] && b.cells[i].kind === 'curse');
      return curses.length ? [placedIdx, ...curses] : null;
    } },
  { id: 'nCornerstone', family: ['placement', 'geometry'], name: 'Cornerstone', cat: 'Placement', shape: 'spot', points: 40,
    desc: () => 'Place a tile in a corner of the open board next to a tile of the same color; both clear',
    find: (b, s, placedIdx) => {
      if (placedIdx == null) return null;
      const r = (placedIdx / b.W) | 0, c = placedIdx % b.W;
      const corner = (r === b.inset.top || r === b.H - 1 - b.inset.bottom) && (c === b.inset.left || c === b.W - 1 - b.inset.right);
      if (!corner) return null;
      const mate = neighbors(b, placedIdx).find((i) => b.cells[i] && b.cells[i].kind !== 'curse' && b.cells[i].color === b.cells[placedIdx].color);
      return mate != null ? [placedIdx, mate] : null;
    } },
  { id: 'nHermit', family: ['placement'], name: 'Hermit', cat: 'Placement', shape: 'spot', points: 20,
    desc: () => 'Place a tile with no other tile touching it at all; it clears on its own',
    find: (b, s, placedIdx) => {
      if (placedIdx == null) return null;
      const ns = neighbors(b, placedIdx).filter((i) => b.cells[i] && b.cells[i].kind !== 'curse');
      return ns.length === 0 ? [placedIdx] : null;
    } },
].map((d) => ({ ...d, deck: 'num', uses: NUM_USES[d.id] || { color: false, num: true } }));

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
  nFillRow: (s) => (s.cursesFill ? 'Every open cell of one row, from wall to wall, holds a tile or a curse. The row clears and every curse in it is lifted.' : 'Every open cell of one row, from wall to wall, holds a tile. A curse in the row blocks it.'),
  nFillCol: (s) => (s.cursesFill ? 'Every open cell of one column, from wall to wall, holds a tile or a curse. The column clears and every curse in it is lifted.' : 'Every open cell of one column, from wall to wall, holds a tile. A curse in the column blocks it.'),
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

  nSum12: () => 'A chain of 2 or 3 connected tiles adding up to exactly 12 (3+9, 5+7, 2+4+6…). Colors do not matter.',
  nSum18: () => 'A chain of 2 to 4 connected tiles adding up to exactly 18 (9+9, 4+6+8, 1+2+6+9…). Colors do not matter.',
  nSum25: () => 'A chain of 3 to 5 connected tiles adding up to exactly 25. Colors do not matter.',
  nLucky13: () => 'A chain of 2 to 4 connected tiles adding up to exactly 13 (4+9, 6+7, 1+3+9…). Colors do not matter.',
  nTens: () => 'A chain of 4 connected tiles adding up to 10, 20 or 30. Colors do not matter.',
  nDozenLine: () => 'Three tiles side by side in a single row or column adding up to exactly 12. No bends. Colors do not matter.',
  nSplit: () => 'A chain of 3 connected tiles where the largest number equals the other two added together (2+3=5, 4+5=9…). Colors do not matter.',
  nTimesTable: () => 'A chain of 3 connected tiles where the largest number equals the other two multiplied (2×3=6, 2×4=8, 3×3=9, 1×n=n). Colors do not matter.',
  nMidpoint: () => 'Three tiles side by side in a single row or column whose middle number is exactly the average of the two ends (3-5-7, 2-2-2, 9-6-3). Colors do not matter.',
  nThirtyRow: () => 'A completely filled row (wall to wall) whose numbers add up to exactly 30.',
  nHeavyColumn: () => 'A completely filled column (wall to wall) whose numbers add up to at least 7 × its length.',
  nBigGap: () => 'Two tiles sitting next to each other whose numbers differ by 7 or more: 1 & 8, 1 & 9 or 2 & 9. Colors do not matter.',
  nNextDoor: () => 'Two tiles sitting next to each other whose numbers differ by exactly 1. Colors do not matter.',
  nDoubleTrouble: () => 'Two tiles sitting next to each other where one number is exactly double the other (1 & 2, 2 & 4, 3 & 6, 4 & 8). Colors do not matter.',
  nFiveMiddle: () => 'A chain of 3 connected tiles whose numbers, sorted, have a 5 in the middle (2-5-9, 5-5-1, 3-5-5…). Colors do not matter.',
  nEndsOfEarth: () => 'A chain of 3 connected tiles that includes at least one 1 and at least one 9. Colors do not matter.',
  nFibonacci: () => 'A chain of 3 connected tiles showing three consecutive Fibonacci numbers: 1, 2, 3 or 2, 3, 5 or 3, 5, 8, in any order along the chain.',
  nTriangular: () => 'A chain of 3 connected tiles showing 1, 3 and 6 (one each), in any order along the chain. Colors do not matter.',
  nOddOneOut: () => 'A chain of 4 connected tiles where exactly one number is odd and three are even, or exactly one is even and three are odd. Colors do not matter.',
  nTwinPrimes: () => 'Two tiles sitting next to each other showing twin primes: 3 & 5 or 5 & 7. Colors do not matter.',
  nLuckySevens: () => 'Two 7s sitting next to each other. Colors do not matter.',
  nSnakeEyes: () => 'Two 1s sitting next to each other. Colors do not matter.',
  nMirrorLine: () => 'Three tiles side by side in a single row or column where the two outer tiles show the same number. No bends. Colors do not matter.',
  nClimbingLine: () => 'Three tiles side by side in a single row or column whose numbers strictly rise or strictly fall in order, by any step (2-5-9 or 8-4-3). Colors do not matter.',
  nSkipLine: () => 'Three tiles side by side in a single row or column stepping by exactly 2 in order: 1-3-5 up to 5-7-9, or the reverse. Colors do not matter.',
  nPrimeLine: () => 'Three prime numbers (2, 3, 5 or 7, repeats allowed) side by side in a single row or column. Colors do not matter.',
  nSquareLine: () => 'Three square numbers (1, 4 or 9, repeats allowed) side by side in a single row or column. Colors do not matter.',
  nSortedColumn: () => 'A completely filled column (wall to wall) whose numbers strictly rise or strictly fall from top to bottom. Equal neighbours break it.',
  nEvenColumn: () => 'A completely filled column (wall to wall) in which every number is even.',
  nOddColumn: () => 'A completely filled column (wall to wall) in which every number is odd.',
  nPrimeRow: () => 'A completely filled row (wall to wall) in which every number is prime: 2, 3, 5 or 7.',
  nMirrorRow: () => 'A completely filled row (wall to wall) whose sequence of colors is a palindrome: the same read from the left or the right. Numbers do not matter.',
  nDuotoneRow: () => 'A completely filled row (wall to wall) that uses exactly two colors, in any arrangement. Numbers do not matter.',
  nTrioRow: () => 'A completely filled row (wall to wall) that uses exactly three colors, in any arrangement. Numbers do not matter.',
  nColorBookends: () => 'A completely filled row (wall to wall) whose leftmost and rightmost tiles share a color. Numbers do not matter.',
  nSuitedFifteen: () => 'A chain of 3 connected tiles of one color whose numbers add up to exactly 15.',
  nSuitedTen: () => 'Two tiles of one color sitting next to each other whose numbers add up to exactly 10.',
  nRainbowFifteen: () => 'A chain of 3 connected tiles in three different colors whose numbers add up to exactly 15.',
  nTwoColorRun: () => 'A chain of 4 connected tiles with consecutive numbers (any order) that uses exactly two colors.',
  nOddSuit: () => 'A chain of 3 connected tiles of one color, all odd numbers.',
  nEvenSuit: () => 'A chain of 3 connected tiles of one color, all even numbers.',
  nBigSuit: () => 'A chain of 3 connected tiles of one color, each a 7, 8 or 9.',
  nTenBlock: () => 'Four tiles forming a 2×2 block whose numbers add up to exactly 10 (1+2+3+4, 1+1+4+4…). Colors do not matter.',
  nRunBlock: () => 'A 2×2 block whose four numbers are consecutive (like 3, 4, 5, 6 in any arrangement). Colors do not matter.',
  nPairBlock: () => 'A 2×2 block made of two numbers, each appearing twice (7, 7, 2, 2 in any arrangement). Colors do not matter.',
  nDiagonalBlock: () => 'A 2×2 block where the top-left and bottom-right tiles share one color, the other two share a second color, and the two colors differ. Numbers do not matter.',
  nCheckerBlock: () => 'A 2×2 block where tiles on each diagonal share a parity (both odd or both even) and tiles side by side differ, like a checkerboard of odds and evens. Colors do not matter.',
  nRainbowPlus: () => 'A plus shape (a centre and its four side neighbours) in five different colors. Numbers do not matter.',
  nOddPlus: () => 'A plus shape (a centre and its four side neighbours) of five odd numbers. Colors do not matter.',
  nPetals: () => 'A centre tile whose four side neighbours all share one color that differs from the centre. Numbers do not matter.',
  nRinged: () => 'A centre tile whose four side neighbours are each a different color from the centre (they may match each other). Numbers do not matter.',
  nCross25: () => 'A plus shape (a centre and its four side neighbours) whose five numbers add up to exactly 25. Colors do not matter.',
  nDiagonalTrio: () => 'Three tiles of one color in a diagonal line, touching only at their corners. Numbers do not matter.',
  nDiagonalRun: () => 'Three tiles with consecutive numbers in a diagonal line, touching only at their corners, any order. Colors do not matter.',
  nDiagonalPair: () => 'Two tiles showing the same number that touch at a corner (diagonally adjacent). Colors do not matter.',
  nElbow: () => 'A chain of 3 connected tiles of one color that bends: an L shape, not three in a straight line. Numbers do not matter.',
  nWiggle: () => 'A chain of 4 connected tiles that changes direction at every step (a zigzag or a hook). Colors and numbers do not matter at all.',
  nStraightFour: () => 'Four tiles side by side in a single row or column adding up to exactly 20. Colors do not matter.',
  nCleanSweep: (s) => (s.cursesFill ? 'Every open cell between the walls holds a tile or a curse. The whole board clears and every curse is lifted.' : 'Every open cell between the walls holds a tile. The whole board clears; a curse anywhere blocks it.'),
  nPictureFrame: (s) => (s.cursesFill ? 'Every cell along the border of the open board (just inside the walls) holds a tile or a curse, and the tile you just placed is on that border. The frame clears and its curses are lifted.' : 'Every cell along the border of the open board (just inside the walls) holds a tile, and the tile you just placed is on that border. The frame clears; a curse on it blocks it.'),
  nCrossroads: (s) => (s.cursesFill ? 'The row and the column through the tile you just placed are both completely filled (wall to wall), curses counting as filled. Both clear and their curses are lifted.' : 'The row and the column through the tile you just placed are both completely filled (wall to wall) with tiles. Both clear; a curse in either blocks it.'),
  nDoubleDecker: (s) => (s.cursesFill ? 'The row holding the tile you just placed and a row directly above or below it are both completely filled (wall to wall), curses counting as filled. Both rows clear and their curses are lifted.' : 'The row holding the tile you just placed and a row directly above or below it are both completely filled (wall to wall) with tiles. Both rows clear; a curse in either blocks it.'),
  nNumberStack: () => 'A completely filled column (wall to wall) in which every tile shows the same number. Only offered while the column is at least 3 long.',
  nFullSpectrum: (s) => `Tiles showing the number you just placed are present in all ${s.numColors} colors somewhere between the walls. Every tile of that number clears.`,
  nDeluge: () => 'At least nine tiles of the same color anywhere between the walls. The tile you just placed must be that color, and every tile of that color clears at once.',
  nHeadCount: () => 'The number on the tile you just placed equals how many tiles are touching it (up, down, left, right), from 1 to 4. The tile and those neighbours clear. Colors do not matter.',
  nEcho: () => 'The tile you just placed shows the same number as the tile you placed on the previous turn, and that tile is still on the board. Both clear. Colors do not matter.',
  nEncore: () => 'The tile you just placed is the same color as the tile you placed on the previous turn, and that tile is still on the board. Both clear. Numbers do not matter.',
  nExorcist: () => 'The tile you just placed sits next to at least one curse. The tile vanishes and so does every curse touching it, no ward needed.',
  nCornerstone: () => 'The tile you just placed sits in a corner of the open board and touches a tile of the same color. Both clear. Numbers do not matter.',
  nHermit: () => 'The tile you just placed has no tile touching it on any side (curses do not count as tiles). It clears by itself.',
};
