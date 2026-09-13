// Goals for the playing-card deck. Cards are {rank 1..13, suit 0..3, red}.
import { pip } from './cards.js';

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
  if (!distinctRanks(cs)) return false;
  const n = cs.length;
  const lo = cs.map((c) => c.rank);
  const hi = cs.map((c) => (c.rank === 1 ? 14 : c.rank));
  const span = (a) => Math.max(...a) - Math.min(...a);
  return span(lo) === n - 1 || span(hi) === n - 1;
}

function isStraightSeq(cs) {
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

export const CARD_GOALS = [
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

  // Full rows / columns
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
].map((d) => ({ ...d, deck: 'cards' }));

export const CARD_DETAILS = {
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
