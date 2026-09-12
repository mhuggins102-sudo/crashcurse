import { makeCard, makeCurse } from '../public/js/cards.js';
import { defaultSettings } from '../public/js/settings.js';

const SUIT_OF = { S: 0, H: 1, D: 2, C: 3 };
const RANK_OF = { A: 1, J: 11, Q: 12, K: 13 };

let nextId = 1000;

// "AS" -> ace of spades, "10H" -> ten of hearts, "XX" -> curse, ".." -> empty
export function parseCard(tok) {
  if (tok === '..' || tok === '.') return null;
  if (tok === 'XX') return makeCurse(nextId++);
  const suit = SUIT_OF[tok.slice(-1)];
  const r = tok.slice(0, -1);
  const rank = RANK_OF[r] || Number(r);
  return makeCard(rank, suit, nextId++);
}

// rows: array of strings, tokens separated by spaces
export function board(rows, inset = {}) {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const H = grid.length, W = grid[0].length;
  const cells = [];
  for (const row of grid) for (const tok of row) cells.push(parseCard(tok));
  return { W, H, cells, inset: { top: 0, right: 0, bottom: 0, left: 0, ...inset } };
}

export function settings(overrides = {}) {
  return { ...defaultSettings(), ...overrides };
}

export const idx = (b, r, c) => r * b.W + c;
