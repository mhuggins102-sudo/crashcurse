// Piece models: playing cards and tiles, plus the curse.
// Cards: ranks 1..13 (A=1, J=11, Q=12, K=13), suits 0..3.
// Tiles: color 0..n-1, sym 0 (blank) | 1 (dot) | 2 (triangle) | 3 (star).

export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const TILE_COLOR_NAMES = ['red', 'yellow', 'green', 'blue', 'purple', 'teal'];
export const TILE_COLORS = ['#e5484d', '#f2b32b', '#3fb950', '#3b82f6', '#a855f7', '#14b8a6'];
export const SYMBOL_NAMES = ['blank', 'dot', 'triangle', 'star'];
export const SYMBOL_GLYPHS = ['', '●', '▲', '★'];

export function isRed(suit) {
  return suit === 1 || suit === 2;
}

// "Pip" value used by every sum-based card goal: A=1, 2..10 face value, J/Q/K=10.
export function pip(rank) {
  return Math.min(rank, 10);
}

export function makeCard(rank, suit, id) {
  return { kind: 'card', rank, suit, id, red: isRed(suit) };
}

export function makeTile(color, sym, id) {
  return { kind: 'tile', color, sym, id };
}

export function makeCurse(id) {
  return { kind: 'curse', id };
}

export function cardLabel(c) {
  return pieceLabel(c);
}

export function pieceLabel(p) {
  if (!p) return '';
  if (p.kind === 'curse') return 'a curse';
  if (p.kind === 'tile') return `${TILE_COLOR_NAMES[p.color] || 'color ' + p.color} ${p.sym ? SYMBOL_NAMES[p.sym] : 'blank'}`;
  return RANK_LABELS[p.rank] + SUITS[p.suit];
}

// Identity of a piece's face, used to rebuild a deck around pieces still on the board.
export function pieceKey(p) {
  return p.kind === 'tile' ? p.color * 4 + p.sym : p.rank * 4 + p.suit;
}

export const cardKey = pieceKey;
