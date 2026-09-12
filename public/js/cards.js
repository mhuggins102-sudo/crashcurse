// Card model. Ranks are 1..13 (A=1, J=11, Q=12, K=13); suits are 0..3.

export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function isRed(suit) {
  return suit === 1 || suit === 2;
}

// "Pip" value used by every sum-based goal: A=1, 2..10 face value, J/Q/K=10.
export function pip(rank) {
  return Math.min(rank, 10);
}

export function makeCard(rank, suit, id) {
  return { kind: 'card', rank, suit, id, red: isRed(suit) };
}

export function makeCurse(id) {
  return { kind: 'curse', id };
}

export function cardLabel(c) {
  if (!c) return '';
  if (c.kind === 'curse') return 'CURSE';
  return RANK_LABELS[c.rank] + SUITS[c.suit];
}

export function cardKey(c) {
  return c.rank * 4 + c.suit;
}
