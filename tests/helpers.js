import { makeCard, makeCurse, makeTile, makeNum } from '../public/js/cards.js';
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

// Card-deck settings (the tests below were written against the card goals).
export function settings(overrides = {}) {
  return { ...defaultSettings(), deckType: 'cards', ...overrides };
}

export function tileSettings(overrides = {}) {
  return { ...defaultSettings(), deckType: 'tiles', ...overrides };
}

export function numSettings(overrides = {}) {
  return { ...defaultSettings(), deckType: 'num', ...overrides };
}

// "R5" -> red 5, "B9" -> blue 9
export function parseNum(tok) {
  if (tok === '..' || tok === '.') return null;
  if (tok === 'XX') return makeCurse(nextId++);
  return makeNum(COLOR_OF[tok[0]], Number(tok.slice(1)), nextId++);
}

export function numBoard(rows, inset = {}) {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const H = grid.length, W = grid[0].length;
  const cells = [];
  for (const row of grid) for (const tok of row) cells.push(parseNum(tok));
  return { W, H, cells, inset: { top: 0, right: 0, bottom: 0, left: 0, ...inset } };
}

const COLOR_OF = { R: 0, Y: 1, G: 2, B: 3, P: 4, T: 5 };
const SYM_OF = { '.': 0, d: 1, t: 2, s: 3 };

// "R." -> red blank, "Bd" -> blue dot, "Gt" -> green triangle, "Ps" -> purple star
export function parseTile(tok) {
  if (tok === '..' || tok === '.') return null;
  if (tok === 'XX') return makeCurse(nextId++);
  return makeTile(COLOR_OF[tok[0]], SYM_OF[tok[1]], nextId++);
}

export function tileBoard(rows, inset = {}) {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const H = grid.length, W = grid[0].length;
  const cells = [];
  for (const row of grid) for (const tok of row) cells.push(parseTile(tok));
  return { W, H, cells, inset: { top: 0, right: 0, bottom: 0, left: 0, ...inset } };
}

export const idx = (b, r, c) => r * b.W + c;
