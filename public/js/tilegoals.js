// Goals for the tile deck. Tiles are {color 0..n-1, sym 0..3} where sym 0 is
// blank, 1 dot, 2 triangle, 3 star. "Marked" means the tile carries a symbol.
import { SYMBOL_NAMES } from './cards.js';
import { allPieces } from './shapes.js';

const sameColor = (ts) => ts.every((t) => t.color === ts[0].color);
const allBlank = (ts) => ts.every((t) => t.sym === 0);
const allMarked = (ts) => ts.every((t) => t.sym !== 0);
const distinctColors = (ts) => new Set(ts.map((t) => t.color)).size === ts.length;
const sameSymbol = (ts) => ts.every((t) => t.sym !== 0 && t.sym === ts[0].sym);
const symSet = (ts) => new Set(ts.filter((t) => t.sym).map((t) => t.sym));
const colorCounts = (ts) => {
  const m = new Map();
  for (const t of ts) m.set(t.color, (m.get(t.color) || 0) + 1);
  return [...m.values()].sort((a, b) => a - b);
};
// Exactly two colors, alternating: A-B-A-B…
const twoColorAlternating = (ts) => ts.length >= 2 && ts[0].color !== ts[1].color && ts.every((t, i) => i < 2 || t.color === ts[i - 2].color);
const noAdjacentSameColor = (ts) => ts.every((t, i) => i === 0 || t.color !== ts[i - 1].color);
const alternatingMarked = (ts) => ts.every((t, i) => i === 0 || (t.sym !== 0) !== (ts[i - 1].sym !== 0));
const symbolIs = (k) => (ts) => ts.every((t) => t.sym === k);

// Board-wide finders: return every matching tile when the count is reached.
function floodFind(b, s, placedIdx, must, count) {
  const tiles = allPieces(b);
  if (must && placedIdx != null && !b.cells[placedIdx]) return null;
  const colors = must && placedIdx != null ? [b.cells[placedIdx].color] : [...new Set(tiles.map((i) => b.cells[i].color))];
  for (const c of colors) {
    const idxs = tiles.filter((i) => b.cells[i].color === c);
    if (idxs.length >= count) return idxs;
  }
  return null;
}
function symbolCountFind(b, s, placedIdx, must, count, onlySym) {
  const tiles = allPieces(b);
  let syms;
  if (onlySym) syms = [onlySym];
  else if (must && placedIdx != null) syms = b.cells[placedIdx] && b.cells[placedIdx].sym ? [b.cells[placedIdx].sym] : [];
  else syms = [1, 2, 3];
  if (must && placedIdx != null && b.cells[placedIdx] && !syms.includes(b.cells[placedIdx].sym)) return null;
  for (const k of syms) {
    const idxs = tiles.filter((i) => b.cells[i].sym === k);
    if (idxs.length >= count) return idxs;
  }
  return null;
}

export const TILE_GOALS = [
  // ---- Color chains ----
  { id: 'tTwins', family: ['mono'], name: 'Twins', cat: 'Color chains', shape: 'chain', size: 2, points: 10,
    desc: () => 'Two touching tiles of one color', test: sameColor },
  { id: 'tTriplet', family: ['mono'], name: 'Triplet', cat: 'Color chains', shape: 'chain', size: 3, points: 30,
    desc: () => 'A 3-chain of one color', test: sameColor },
  { id: 'tQuad', family: ['mono'], name: 'Quad', cat: 'Color chains', shape: 'chain', size: 4, points: 60,
    desc: () => 'A 4-chain of one color', test: sameColor },
  { id: 'tQuint', family: ['mono'], name: 'Quint', cat: 'Color chains', shape: 'chain', size: 5, points: 120,
    desc: () => 'A 5-chain of one color', test: sameColor },
  { id: 'tPureTriplet', family: ['mono', 'blank'], name: 'Pure Triplet', cat: 'Color chains', shape: 'chain', size: 3, points: 50,
    desc: () => 'A 3-chain of one color, all blank', test: (ts) => sameColor(ts) && allBlank(ts) },
  { id: 'tPureQuad', family: ['mono', 'blank'], name: 'Pure Quad', cat: 'Color chains', shape: 'chain', size: 4, points: 100,
    desc: () => 'A 4-chain of one color, all blank', test: (ts) => sameColor(ts) && allBlank(ts) },
  { id: 'tMarkedTriplet', family: ['mono', 'marked'], name: 'Marked Triplet', cat: 'Color chains', shape: 'chain', size: 3, points: 80,
    desc: () => 'A 3-chain of one color, every tile marked', test: (ts) => sameColor(ts) && allMarked(ts) },
  { id: 'tFullSet', family: ['mono', 'symbol'], name: 'Full Set', cat: 'Color chains', shape: 'chain', size: [3, 5], points: 200,
    desc: () => 'A chain of one color holding a dot, a triangle and a star', test: (ts) => sameColor(ts) && symSet(ts).size === 3 },
  { id: 'tTwoTone', family: ['pattern'], name: 'Two-Tone', cat: 'Color chains', shape: 'chain', size: 4, points: 60, ordered: true,
    desc: () => 'A 4-chain alternating between two colors', test: twoColorAlternating },
  { id: 'tTwoPairs', family: ['match'], name: 'Two Pairs', cat: 'Color chains', shape: 'chain', size: 4, points: 40,
    desc: () => 'A 4-chain: two tiles of one color and two of another',
    test: (ts) => { const k = colorCounts(ts); return k.length === 2 && k[0] === 2; } },
  { id: 'tFullHouse', family: ['match'], name: 'Full House', cat: 'Color chains', shape: 'chain', size: 5, points: 100,
    desc: () => 'A 5-chain: three of one color and two of another',
    test: (ts) => { const k = colorCounts(ts); return k.length === 2 && k[0] === 2 && k[1] === 3; } },

  // ---- Rainbow chains ----
  { id: 'tPalette', family: ['rainbow'], name: 'Palette', cat: 'Rainbow chains', shape: 'chain', size: 3, points: 20,
    desc: () => 'A 3-chain of three different colors', test: distinctColors },
  { id: 'tSpectrum', family: ['rainbow'], name: 'Spectrum', cat: 'Rainbow chains', shape: 'chain', size: 4, points: 50,
    desc: () => 'A 4-chain of four different colors', test: distinctColors },
  { id: 'tRainbow', family: ['rainbow'], name: 'Rainbow', cat: 'Rainbow chains', shape: 'chain', size: (s) => s.tileColors, points: 120,
    desc: (s) => `A ${s.tileColors}-chain showing every color`, test: distinctColors },
  { id: 'tPureRainbow', family: ['rainbow', 'blank'], name: 'Pure Rainbow', cat: 'Rainbow chains', shape: 'chain', size: (s) => s.tileColors, points: 250,
    desc: (s) => `A ${s.tileColors}-chain showing every color, all blank`, test: (ts) => distinctColors(ts) && allBlank(ts) },
  { id: 'tMarkedSpectrum', family: ['rainbow', 'marked'], name: 'Marked Spectrum', cat: 'Rainbow chains', shape: 'chain', size: 4, points: 150,
    desc: () => 'A 4-chain of four different colors, every tile marked', test: (ts) => distinctColors(ts) && allMarked(ts) },

  // ---- Symbol chains ----
  { id: 'tDotTrail', family: ['symbol'], name: 'Dot Trail', cat: 'Symbol chains', shape: 'chain', size: 3, points: 80,
    desc: () => 'A 3-chain of dots, any colors', test: symbolIs(1) },
  { id: 'tTriangleTrail', family: ['symbol'], name: 'Triangle Trail', cat: 'Symbol chains', shape: 'chain', size: 3, points: 80,
    desc: () => 'A 3-chain of triangles, any colors', test: symbolIs(2) },
  { id: 'tStarPair', family: ['symbol'], name: 'Star Pair', cat: 'Symbol chains', shape: 'chain', size: 2, points: 100,
    desc: () => 'Two touching stars', test: symbolIs(3) },
  { id: 'tConstellation', family: ['symbol'], name: 'Constellation', cat: 'Symbol chains', shape: 'chain', size: 3, points: 500,
    desc: () => 'A 3-chain of stars', test: symbolIs(3) },
  { id: 'tMatchingMarks', family: ['symbol', 'rainbow'], name: 'Matching Marks', cat: 'Symbol chains', shape: 'chain', size: 3, points: 100,
    desc: () => 'A 3-chain of one symbol in three different colors', test: (ts) => sameSymbol(ts) && distinctColors(ts) },
  { id: 'tSymbolSalad', family: ['symbol'], name: 'Symbol Salad', cat: 'Symbol chains', shape: 'chain', size: 3, points: 120,
    desc: () => 'A 3-chain holding a dot, a triangle and a star', test: (ts) => allMarked(ts) && symSet(ts).size === 3 },
  { id: 'tBlankSlate', family: ['blank'], name: 'Blank Slate', cat: 'Symbol chains', shape: 'chain', size: 4, points: 30,
    desc: () => 'A 4-chain of blank tiles, any colors', test: allBlank },
  { id: 'tBlankRun', family: ['blank'], name: 'Blank Run', cat: 'Symbol chains', shape: 'chain', size: 6, points: 80,
    desc: () => 'A 6-chain of blank tiles, any colors', test: allBlank },
  { id: 'tAllMarked', family: ['marked'], name: 'All Marked', cat: 'Symbol chains', shape: 'chain', size: 4, points: 60,
    desc: () => 'A 4-chain in which every tile carries a symbol', test: allMarked },
  { id: 'tOnOff', family: ['pattern', 'marked'], name: 'On-Off', cat: 'Symbol chains', shape: 'chain', size: 4, points: 50, ordered: true,
    desc: () => 'A 4-chain alternating marked and blank tiles', test: alternatingMarked },

  // ---- Straight lines ----
  { id: 'tColorLine', family: ['mono'], name: 'Color Line', cat: 'Straight lines', shape: 'line', size: 3, points: 40,
    desc: () => 'Three of one color in a straight line', test: sameColor },
  { id: 'tLongColorLine', family: ['mono'], name: 'Long Color Line', cat: 'Straight lines', shape: 'line', size: 4, points: 90,
    desc: () => 'Four of one color in a straight line', test: sameColor },
  { id: 'tSymbolLine', family: ['symbol'], name: 'Symbol Line', cat: 'Straight lines', shape: 'line', size: 3, points: 100,
    desc: () => 'Three tiles with the same symbol in a straight line', test: sameSymbol },
  { id: 'tRainbowLine', family: ['rainbow'], name: 'Rainbow Line', cat: 'Straight lines', shape: 'line', size: 4, points: 80,
    desc: () => 'Four different colors in a straight line', test: distinctColors },
  { id: 'tBlankLine', family: ['blank'], name: 'Blank Line', cat: 'Straight lines', shape: 'line', size: 4, points: 40,
    desc: () => 'Four blank tiles in a straight line', test: allBlank },
  { id: 'tCheckeredLine', family: ['pattern'], name: 'Checkered Line', cat: 'Straight lines', shape: 'line', size: 4, points: 90,
    desc: () => 'Four in a straight line alternating two colors', test: twoColorAlternating },
  { id: 'tMarkedLine', family: ['marked'], name: 'Marked Line', cat: 'Straight lines', shape: 'line', size: 3, points: 60,
    desc: () => 'Three marked tiles in a straight line', test: allMarked },
  { id: 'tSandwich', family: ['pattern'], name: 'Sandwich', cat: 'Straight lines', shape: 'line', size: 3, points: 30,
    desc: () => 'Three in a straight line: matching colors at both ends, a different color between',
    test: (ts) => ts[0].color === ts[2].color && ts[1].color !== ts[0].color },

  // ---- Full rows & columns ----
  { id: 'tFillRow', family: ['fill'], name: 'Fill a Row', cat: 'Full rows & columns', shape: 'row', points: 30,
    desc: () => 'Fill every open cell of a row', test: () => true },
  { id: 'tFillCol', family: ['fill'], name: 'Fill a Column', cat: 'Full rows & columns', shape: 'col', points: 30,
    desc: () => 'Fill every open cell of a column', test: () => true },
  { id: 'tCheckeredRow', family: ['pattern'], name: 'Checkered Row', cat: 'Full rows & columns', shape: 'row', points: 120, minLen: 3,
    desc: () => 'Fill a row alternating two colors', test: twoColorAlternating },
  { id: 'tCheckeredCol', family: ['pattern'], name: 'Checkered Column', cat: 'Full rows & columns', shape: 'col', points: 120, minLen: 3,
    desc: () => 'Fill a column alternating two colors', test: twoColorAlternating },
  { id: 'tMotleyRow', family: ['pattern'], name: 'Motley Row', cat: 'Full rows & columns', shape: 'row', points: 60, minLen: 3,
    desc: () => 'Fill a row with no two neighbours sharing a color', test: noAdjacentSameColor },
  { id: 'tMonoRow', family: ['mono'], name: 'Mono Row', cat: 'Full rows & columns', shape: 'row', points: 200, minLen: 3,
    desc: () => 'Fill a row with one color', test: sameColor },
  { id: 'tMonoCol', family: ['mono'], name: 'Mono Column', cat: 'Full rows & columns', shape: 'col', points: 200, minLen: 3,
    desc: () => 'Fill a column with one color', test: sameColor },
  { id: 'tBlankRow', family: ['blank'], name: 'Blank Row', cat: 'Full rows & columns', shape: 'row', points: 80, minLen: 3,
    desc: () => 'Fill a row with blank tiles', test: allBlank },
  { id: 'tMarkedRow', family: ['marked'], name: 'Marked Row', cat: 'Full rows & columns', shape: 'row', points: 150, minLen: 3,
    desc: () => 'Fill a row with marked tiles only', test: allMarked },
  { id: 'tRainbowRow', family: ['rainbow'], name: 'Rainbow Row', cat: 'Full rows & columns', shape: 'row', points: 150, minLen: (s) => s.tileColors,
    desc: () => 'Fill a row that shows every color', test: (ts, s) => new Set(ts.map((t) => t.color)).size === s.tileColors },
  { id: 'tBookends', family: ['pattern'], name: 'Bookends', cat: 'Full rows & columns', shape: 'row', points: 40, minLen: 3,
    desc: () => 'Fill a row whose two end tiles share a color', test: (ts) => ts[0].color === ts[ts.length - 1].color },
  { id: 'tMajorityRow', family: ['mono'], name: 'Majority Row', cat: 'Full rows & columns', shape: 'row', points: 80, minLen: 3,
    desc: () => 'Fill a row in which one color takes more than half the tiles',
    test: (ts) => Math.max(...colorCounts(ts)) * 2 > ts.length },

  // ---- Blocks & patterns ----
  { id: 'tSquare', family: ['mono', 'block'], name: 'Square', cat: 'Blocks & patterns', shape: 'square', points: 100,
    desc: () => 'A 2×2 block of one color', test: sameColor },
  { id: 'tBlankSquare', family: ['blank', 'block'], name: 'Blank Square', cat: 'Blocks & patterns', shape: 'square', points: 50,
    desc: () => 'A 2×2 block of blank tiles', test: allBlank },
  { id: 'tRainbowSquare', family: ['rainbow', 'block'], name: 'Rainbow Square', cat: 'Blocks & patterns', shape: 'square', points: 80,
    desc: () => 'A 2×2 block of four different colors', test: distinctColors },
  { id: 'tMarkedSquare', family: ['marked', 'block'], name: 'Marked Square', cat: 'Blocks & patterns', shape: 'square', points: 120,
    desc: () => 'A 2×2 block of marked tiles', test: allMarked },
  { id: 'tSymbolSquare', family: ['symbol', 'block'], name: 'Symbol Square', cat: 'Blocks & patterns', shape: 'square', points: 400,
    desc: () => 'A 2×2 block of one symbol', test: sameSymbol },
  { id: 'tFlower', family: ['pattern', 'block'], name: 'Flower', cat: 'Blocks & patterns', shape: 'plus', points: 200,
    desc: () => 'A tile whose four neighbours all share one color different from its own',
    test: (ts) => { const [c, ...petals] = ts; return petals.every((p) => p.color === petals[0].color) && petals[0].color !== c.color; } },
  { id: 'tCross', family: ['mono', 'block'], name: 'Cross', cat: 'Blocks & patterns', shape: 'plus', points: 250,
    desc: () => 'A plus of five tiles of one color', test: sameColor },

  // ---- Board-wide ----
  { id: 'tFlood', family: ['board', 'mono'], name: 'Flood', cat: 'Board-wide', shape: 'board', count: 6, points: 100,
    desc: () => 'Six tiles of the placed tile’s color anywhere on the board; they all clear',
    find: (b, s, placedIdx, must) => floodFind(b, s, placedIdx, must, 6) },
  { id: 'tStarfield', family: ['board', 'symbol'], name: 'Starfield', cat: 'Board-wide', shape: 'board', count: 3, points: 150,
    desc: () => 'Three stars anywhere on the board (place a star); they all clear',
    find: (b, s, placedIdx, must) => symbolCountFind(b, s, placedIdx, must, 3, 3) },
  { id: 'tSweep', family: ['board', 'symbol'], name: 'Sweep', cat: 'Board-wide', shape: 'board', count: 5, points: 100,
    desc: () => 'Five tiles with the placed tile’s symbol anywhere on the board; they all clear',
    find: (b, s, placedIdx, must) => symbolCountFind(b, s, placedIdx, must, 5, null) },
].map((d) => ({ ...d, deck: 'tiles' }));

const S = SYMBOL_NAMES;
export const TILE_DETAILS = {
  tTwins: () => 'Two tiles of the same color sitting next to each other (up, down, left or right). Symbols do not matter.',
  tTriplet: () => 'A chain of 3 connected tiles that all share one color. Symbols do not matter.',
  tQuad: () => 'A chain of 4 connected tiles that all share one color. Symbols do not matter.',
  tQuint: () => 'A chain of 5 connected tiles that all share one color. Symbols do not matter.',
  tPureTriplet: () => 'A chain of 3 connected tiles of one color, none of which carries a symbol.',
  tPureQuad: () => 'A chain of 4 connected tiles of one color, none of which carries a symbol.',
  tMarkedTriplet: () => 'A chain of 3 connected tiles of one color, each carrying a symbol (any mix of dots, triangles and stars).',
  tFullSet: () => 'A chain of 3 to 5 connected tiles of one color that includes at least one dot, one triangle and one star. Blank tiles of that color may fill the gaps.',
  tTwoTone: () => 'A chain of 4 connected tiles that alternates between exactly two colors along the chain: A, B, A, B. Symbols do not matter.',
  tTwoPairs: () => 'A chain of exactly 4 connected tiles made of two tiles of one color and two of another, in any order along the chain. Four of one color does not count.',
  tFullHouse: () => 'A chain of exactly 5 connected tiles: three of one color plus two of another, in any order along the chain.',
  tPalette: () => 'A chain of 3 connected tiles showing 3 different colors. Symbols do not matter.',
  tSpectrum: () => 'A chain of 4 connected tiles showing 4 different colors. Symbols do not matter.',
  tRainbow: (s) => `A chain of ${s.tileColors} connected tiles showing every one of the ${s.tileColors} colors once. Symbols do not matter.`,
  tPureRainbow: (s) => `A chain of ${s.tileColors} connected tiles showing every color once, none of which carries a symbol.`,
  tMarkedSpectrum: () => 'A chain of 4 connected tiles showing 4 different colors, each carrying a symbol.',
  tDotTrail: () => 'A chain of 3 connected tiles that all carry a dot. Colors do not matter.',
  tTriangleTrail: () => 'A chain of 3 connected tiles that all carry a triangle. Colors do not matter.',
  tStarPair: () => 'Two tiles carrying a star sitting next to each other. Colors do not matter.',
  tConstellation: () => 'A chain of 3 connected tiles that all carry a star. Colors do not matter.',
  tMatchingMarks: () => 'A chain of 3 connected tiles that all carry the same symbol, in 3 different colors.',
  tSymbolSalad: () => 'A chain of 3 connected tiles carrying one dot, one triangle and one star, in any order and any colors.',
  tBlankSlate: () => 'A chain of 4 connected tiles with no symbols. Colors do not matter.',
  tBlankRun: () => 'A chain of 6 connected tiles with no symbols. Colors do not matter.',
  tAllMarked: () => 'A chain of 4 connected tiles, each carrying any symbol. Colors do not matter.',
  tOnOff: () => 'A chain of 4 connected tiles alternating marked and blank along the chain: marked, blank, marked, blank (or the reverse). Colors do not matter.',
  tColorLine: () => 'Three tiles of one color side by side in a single row or column. No bends. Symbols do not matter.',
  tLongColorLine: () => 'Four tiles of one color side by side in a single row or column. No bends. Symbols do not matter.',
  tSymbolLine: () => 'Three tiles carrying the same symbol side by side in a single row or column. Colors do not matter.',
  tRainbowLine: () => 'Four tiles of four different colors side by side in a single row or column.',
  tBlankLine: () => 'Four blank tiles side by side in a single row or column. Colors do not matter.',
  tCheckeredLine: () => 'Four tiles side by side in a single row or column alternating exactly two colors: A, B, A, B. Symbols do not matter.',
  tMarkedLine: () => 'Three marked tiles side by side in a single row or column. Colors and symbols do not need to match.',
  tSandwich: () => 'Three tiles side by side in a single row or column where the two outer tiles share a color and the middle tile is a different color.',
  tFillRow: () => 'Every open cell of one row, from wall to wall, holds a tile. A curse in the row blocks it.',
  tFillCol: () => 'Every open cell of one column, from wall to wall, holds a tile. A curse in the column blocks it.',
  tCheckeredRow: () => 'A completely filled row (wall to wall) that alternates exactly two colors from left to right: A, B, A, B… Symbols do not matter.',
  tCheckeredCol: () => 'A completely filled column (wall to wall) that alternates exactly two colors from top to bottom. Symbols do not matter.',
  tMotleyRow: () => 'A completely filled row (wall to wall) in which no two neighbouring tiles share a color. Any number of colors may appear.',
  tMonoRow: () => 'A completely filled row (wall to wall) in which every tile is the same color.',
  tMonoCol: () => 'A completely filled column (wall to wall) in which every tile is the same color.',
  tBlankRow: () => 'A completely filled row (wall to wall) in which no tile carries a symbol.',
  tMarkedRow: () => 'A completely filled row (wall to wall) in which every tile carries a symbol.',
  tRainbowRow: (s) => `A completely filled row (wall to wall) in which every one of the ${s.tileColors} colors appears at least once. Only offered while the row is long enough.`,
  tBookends: () => 'A completely filled row (wall to wall) whose leftmost and rightmost tiles share a color.',
  tMajorityRow: () => 'A completely filled row (wall to wall) in which a single color occupies more than half of the tiles.',
  tSquare: () => 'Four tiles of one color forming a 2×2 block. Symbols do not matter.',
  tBlankSquare: () => 'Four blank tiles forming a 2×2 block. Colors do not matter.',
  tRainbowSquare: () => 'A 2×2 block of four tiles in four different colors.',
  tMarkedSquare: () => 'A 2×2 block of four tiles that each carry a symbol.',
  tSymbolSquare: () => 'A 2×2 block of four tiles that all carry the same symbol.',
  tFlower: () => 'A centre tile whose four side neighbours (up, down, left, right) all share one color that is different from the centre’s color. Symbols do not matter.',
  tCross: () => 'A plus shape of five tiles of one color: a centre and its four side neighbours. Symbols do not matter.',
  tFlood: () => 'At least six tiles of the same color anywhere between the walls. The tile you just placed must be that color, and every tile of that color clears at once.',
  tStarfield: () => 'At least three tiles carrying a star anywhere between the walls. The tile you just placed must be a star, and every star clears at once.',
  tSweep: () => `At least five tiles carrying the same symbol anywhere between the walls. The tile you just placed must carry that symbol (${S[1]}, ${S[2]} or ${S[3]}), and every tile with it clears at once.`,
};
