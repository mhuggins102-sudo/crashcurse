// DOM layer: renders the engine state, handles input, generates the settings
// panel from the schema, and runs the bot / simulation helpers.

import { Game, OVER_REASONS } from './engine.js';
import { SIDES, GOAL_DEFS, goalDesc, goalDetail, goalNotes, goalPoints, goalEnabled, goalSizeRange, goalFamilies, goalDeck, pieceWord, FAMILY_LABEL } from './goals.js';
import { SUITS, RANK_LABELS, TILE_COLORS, TILE_COLOR_NAMES, SYMBOL_GLYPHS, SYMBOL_NAMES, pieceLabel } from './cards.js';
import {
  SETTINGS_SCHEMA, SCHEMA_ITEMS, defaultSettings, loadSettings, saveSettings, normalizeSettings,
  PRESETS, applyPreset, settingsToJSON, settingsFromJSON,
} from './settings.js';
import { botStep, runSimulation } from './bot.js';
import { makeRng, randomSeedString } from './rng.js';

const SIDE_LABEL = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };
const SIDE_ARROW = { top: '▲', right: '▶', bottom: '▼', left: '◀' };
const MULTI_WORDS = ['', '', 'DOUBLE', 'TRIPLE', 'QUADRUPLE'];
const BEST_KEY = 'crashcurse.best.v1';
const DESC_KEYS = new Set(['straightLen', 'flushLen', 'straightOrdered', 'lineLowAvg', 'lineHighAvg', 'chainShape', 'tileColors', 'deckType', 'lineMinLen', 'numColors', 'numMax', 'numCopies']);

// Rows of the settings form that only matter for some combinations.
const ROW_VISIBLE = {
  numColors: (d) => d.deckType === 'num',
  numMax: (d) => d.deckType === 'num',
  numCopies: (d) => d.deckType === 'num',
  tileColors: (d) => d.deckType === 'tiles',
  tileBlanks: (d) => d.deckType === 'tiles',
  tileDots: (d) => d.deckType === 'tiles',
  tileTriangles: (d) => d.deckType === 'tiles',
  tileStars: (d) => d.deckType === 'tiles',
  straightOrdered: (d) => d.deckType === 'cards',
  straightLen: (d) => d.deckType === 'cards',
  flushLen: (d) => d.deckType === 'cards',
  lineLowAvg: (d) => d.deckType === 'cards',
  lineHighAvg: (d) => d.deckType === 'cards',
  goalSeconds: (d) => d.clock === 'time' && d.wallMode === 'goal',
  goalTurns: (d) => d.clock === 'turns' && d.wallMode === 'goal',
  expiredGoalPenalty: (d) => d.wallMode === 'goal',
  globalSeconds: (d) => d.clock === 'time' && d.wallMode === 'global',
  globalTurns: (d) => d.clock === 'turns' && d.wallMode === 'global',
  globalOrder: (d) => d.wallMode === 'global',
  pressureRamp: (d) => d.wallMode !== 'off',
  pressureFloor: (d) => d.wallMode !== 'off' && d.pressureRamp < 1,
  placementSeconds: (d) => d.clock === 'time',
  placementTimeout: (d) => d.clock === 'time' && d.placementSeconds > 0,
  levelSeconds: (d) => d.mode === 'survival' && d.clock === 'time',
  levelTurns: (d) => d.mode === 'survival' && d.clock === 'turns',
  levelSecondsGrowth: (d) => d.mode === 'survival' && d.clock === 'time',
  levelTurnsGrowth: (d) => d.mode === 'survival' && d.clock === 'turns',
  levelCurseGrowth: (d) => d.mode === 'survival',
  levelPressureGrowth: (d) => d.mode === 'survival',
  levelResetWalls: (d) => d.mode === 'survival',
  levelBoard: (d) => d.mode === 'survival',
  levelBonus: (d) => d.mode === 'survival',
  perkExtraSeconds: (d) => d.clock === 'time',
  comboBonus: (d) => d.comboEnabled,
  rerollBonus: (d) => d.rerollTimer === 'add' && d.wardCostReroll > 0 && d.wardSpend === 'manual',
  rerollTimer: (d) => d.wardCostReroll > 0 && d.wardSpend === 'manual',
  extendBonus: (d) => d.wardCostExtend > 0 && d.wardSpend === 'manual',
  crushCheck: (d) => d.wallMode !== 'off',
  crushedCurses: (d) => d.wallMode !== 'off',
  clearPushesWallBack: (d) => d.wallMode !== 'off',
};

const $ = (id) => document.getElementById(id);

// Shape icons: a snake for chains, a 2x2 grid for connected groups, double
// arrows for rows / columns, crossed double arrows for straight lines.
const SHAPE_SVG = {
  snake: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h6.5a2.5 2.5 0 0 1 0 5h-4a2 2 0 0 0 0 4H14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  group: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/></g></svg>',
  row: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12M5 4.5 1.5 8 5 11.5M11 4.5 14.5 8 11 11.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  col: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M4.5 5 8 1.5 11.5 5M4.5 11 8 14.5l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  line: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h12M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5M8 2v12M5.5 4.5 8 2l2.5 2.5M5.5 11.5 8 14l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  square: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 2v12M2 8h12" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 1.5h5v4h4v5h-4v4h-5v-4h-4v-5h4z" fill="currentColor"/></svg>',
  board: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.6"/><circle cx="8" cy="3" r="1.6"/><circle cx="13" cy="3" r="1.6"/><circle cx="3" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="13" cy="8" r="1.6"/><circle cx="3" cy="13" r="1.6"/><circle cx="8" cy="13" r="1.6"/><circle cx="13" cy="13" r="1.6"/></g></svg>',
};
const ICONS = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  new: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  hints: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bot: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="8" width="16" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8V4M9 4h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="13.5" r="1.5" fill="currentColor"/><circle cx="15" cy="13.5" r="1.5" fill="currentColor"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8M4 12h2M10 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  ward: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.3L21 10l-6.8 1.7L12 18l-2.2-6.3L3 10l6.8-1.7z" fill="currentColor"/></svg>',
  deck: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="13" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4h11a2 2 0 0 1 2 2v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  turns: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  level: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  combo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 14h6l-1 8 9-13h-6z" fill="currentColor"/></svg>',
  curse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.4 4.3 3 5.3V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.7c1.6-1 3-2.7 3-5.3a7 7 0 0 0-7-7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9.5" cy="11" r="1.5" fill="currentColor"/><circle cx="14.5" cy="11" r="1.5" fill="currentColor"/></svg>',
};

const ICON_REPLACE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 0 1-9.6 3.7M2.5 8a5.5 5.5 0 0 1 9.6-3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12.6 1.6v3.2H9.4M3.4 14.4v-3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_EXTEND = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 5.5v3l2 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const SHAPE_TITLE = {
  snake: 'Connected chain: bends allowed, no branching',
  group: 'Connected group: branching allowed',
  line: 'Straight line: one row or one column, no bends',
  row: 'A whole row between the walls',
  col: 'A whole column between the walls',
  square: 'A 2×2 block',
  plus: 'A plus shape: a centre and its four side neighbours',
  board: 'Anywhere on the board (a count between the walls)',
};
function shapeKey(def, s) {
  if (def.icon) return def.icon;
  if (def.shape === 'chain') return s.chainShape === 'group' ? 'group' : 'snake';
  if (def.shape === 'rowcol') return 'line';
  return def.shape;
}
function goalCountText(def, s, game) {
  if (def.shape === 'row') return game ? String(game.cols()) : 'all';
  if (def.shape === 'col') return game ? String(game.rows()) : 'all';
  if (def.shape === 'rowcol') return 'all';
  const [a, b] = goalSizeRange(def, s);
  return a === b ? String(a) : `${a}–${b}`;
}
function goalBadgeHTML(def, s, game) {
  const k = shapeKey(def, s);
  return `<span class="goal-badge shape-${k}" title="${SHAPE_TITLE[k]}">${SHAPE_SVG[k]}<span class="goal-count">${goalCountText(def, s, game)}</span></span>`;
}
function familyTagsHTML(def) {
  return goalFamilies(def).map((f) => `<span class="fam-tag">${FAMILY_LABEL[f] || f}</span>`).join('');
}

function h(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const SYM_SVG = {
  1: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.3"/></svg>',
  2: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.4 13.6 12.8H2.4z"/></svg>',
  3: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.3 6l4.7-.5z"/></svg>',
};

export function pieceHTML(p, extra = '') {
  if (!p) return '';
  if (p.kind === 'curse') return `<div class="curse ${extra}">☠</div>`;
  if (p.kind === 'tile') return `<div class="tile tc${p.color} ${extra}" title="${TILE_COLOR_NAMES[p.color]} ${p.sym ? SYMBOL_NAMES[p.sym] : 'blank'}">${p.sym ? SYM_SVG[p.sym] : ''}</div>`;
  if (p.kind === 'num') return `<div class="numtile tc${p.color} ${extra}" title="${TILE_COLOR_NAMES[p.color]} ${p.n}"><span>${p.n}</span></div>`;
  return `<div class="card ${p.red ? 'red' : 'black'} ${extra}"><span class="rank">${RANK_LABELS[p.rank]}</span><span class="suit">${SUITS[p.suit]}</span></div>`;
}
export const cardHTML = pieceHTML;

function cardText(p) {
  return pieceLabel(p);
}

function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function encodeShare(s) { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); }
function decodeShare(t) { return JSON.parse(decodeURIComponent(escape(atob(t)))); }

export class UI {
  constructor() {
    this.settings = this.settingsFromHash() || loadSettings();
    this.draft = null;
    this.game = null;
    this.paused = false;
    this.bot = false;
    this.botRng = makeRng((Date.now() & 0xffffffff) >>> 0);
    this.botAcc = 0;
    this.cursor = null;
    this.cellEls = [];
    this.cellSig = [];
    this.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    this.worker = null;
    this.goalPopTimer = null;
    this.cacheEls();
    this.buildSettingsForm();
    this.bindGlobal();
    this.newGame();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------- setup ----------
  cacheEls() {
    this.el = {
      arena: $('arena'), arenaWrap: $('arena-wrap'), hud: $('hud'), hudMore: $('hud-more'), chips: $('chips'),
      menu: $('menu'), menuSheet: $('menu-sheet'), btnMenu: $('btn-menu'), statsModal: $('modal-stats'), statsBody: $('stats-body'),
      grid: $('grid'), fx: $('fx'), pops: $('pops'),
      wall: Object.fromEntries(SIDES.map((s) => [s, $('wall-' + s)])),
      goal: Object.fromEntries(SIDES.map((s) => [s, $('wall-' + s).querySelector('.goal')])),
      current: $('current'), upcoming: $('upcoming'), hintText: $('hint-text'), placementTimer: $('placement-timer'),
      stats: $('stats'), log: $('log'), toasts: $('toasts'),
      topScore: $('top-score'), topBest: $('top-best'),
      btnNew: $('btn-new'), btnPause: $('btn-pause'), btnBot: $('btn-bot'), btnHints: $('btn-hints'), btnHelp: $('btn-help'), btnSettings: $('btn-settings'),
      overlay: $('modal-overlay'), overlayBox: $('overlay-box'),
      settings: $('modal-settings'), settingsBody: $('settings-body'),
      help: $('modal-help'), helpBody: $('help-body'),
    };
  }

  settingsFromHash() {
    try {
      const m = /[#&]s=([^&]+)/.exec(location.hash);
      if (!m) return null;
      const s = normalizeSettings(decodeShare(m[1]));
      saveSettings(s);
      history.replaceState(null, '', location.pathname);
      return s;
    } catch (e) { return null; }
  }

  bindGlobal() {
    for (const b of document.querySelectorAll('[data-icon]')) b.innerHTML = ICONS[b.dataset.icon] || '';
    this.el.btnMenu.onclick = (e) => { e.stopPropagation(); this.openMenu(); };
    this.el.menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-menu]');
      if (!item) { if (e.target === this.el.menu) this.closeMenu(); return; }
      this.closeMenu();
      this.menuAction(item.dataset.menu);
    });
    this.el.chips.onclick = () => this.openStats();
    $('stats-close').onclick = () => this.closeStats();
    this.el.statsModal.addEventListener('click', (e) => { if (e.target === this.el.statsModal) this.closeStats(); });
    this.el.btnNew.onclick = () => this.newGame();
    this.el.btnPause.onclick = () => this.togglePause();
    this.el.btnBot.onclick = () => this.toggleBot();
    this.el.btnHints.onclick = () => this.toggleHints();
    this.el.btnHelp.onclick = () => this.openHelp();
    this.el.btnSettings.onclick = () => this.openSettings();
    $('settings-close').onclick = () => this.closeSettings();
    $('settings-cancel').onclick = () => this.closeSettings();
    $('settings-apply').onclick = () => this.applySettings();
    $('settings-reset').onclick = () => { this.draft = defaultSettings(); this.syncForm(); this.toast('Defaults loaded into the form'); };
    $('help-close').onclick = () => { this.el.help.hidden = true; };
    this.el.overlay.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      if (act === 'resume') this.togglePause();
      else if (act === 'continue') this.continueLevel();
      else if (act === 'new') this.newGame();
      else if (act === 'settings') { this.hideOverlay(); this.openSettings(); }
      else if (act === 'close') this.hideOverlay();
    });
    for (const side of SIDES) {
      this.el.goal[side].addEventListener('click', (e) => {
        e.stopPropagation();
        const b = e.target.closest('[data-ward]');
        if (b) { if (!b.disabled) this.wardAction(b.dataset.ward, side); return; }
        this.showGoalPopup(side);
      });
    }
    document.addEventListener('click', () => this.hideGoalPopup());
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => { if (this.game) { this.computeSize(); } });
    window.addEventListener('orientationchange', () => { if (this.game) { this.computeSize(); } });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (this.game) this.computeSize(); }).observe(this.el.arenaWrap);
    // Mobile browsers can report a provisional viewport before the meta tag settles.
    window.addEventListener('load', () => { if (this.game) { this.computeSize(); } });
    requestAnimationFrame(() => { if (this.game) this.computeSize(); });
    setTimeout(() => { if (this.game) this.computeSize(); }, 400);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && this.game.status === 'playing' && !this.paused && this.settings.clock === 'time') this.togglePause();
    });
  }

  // ---------- game lifecycle ----------
  newGame() {
    const seed = this.settings.seed ? this.settings.seed : randomSeedString();
    this.game = new Game(this.settings, seed);
    this.paused = false;
    this.cursor = null;
    this.botAcc = 0;
    this.el.log.innerHTML = '';
    this.el.fx.innerHTML = '';
    this.el.pops.innerHTML = '';
    this.hideGoalPopup();
    this.buildGrid();
    this.buildHud();
    this.computeSize();
    this.hideOverlay();
    this.handleEvents(this.game.drain());
    this.renderAll();
  }

  continueLevel() {
    if (!this.game || this.game.status !== 'levelup') return;
    this.game.continueLevel();
    this.hideOverlay();
    this.buildHud();
    this.afterAction();
  }

  buildGrid() {
    const g = this.game;
    this.el.grid.innerHTML = '';
    this.cellEls = [];
    this.cellSig = [];
    for (let i = 0; i < g.W * g.H; i++) {
      const [r, c] = g.rc(i);
      const cell = h('div', { class: 'cell', style: `--r:${r};--c:${c}` });
      cell.appendChild(h('div', { class: 'cell-inner' }));
      cell.addEventListener('click', () => this.act(i));
      this.el.grid.appendChild(cell);
      this.cellEls.push(cell);
      this.cellSig.push(null);
    }
  }

  computeSize() {
    const g = this.game;
    const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    // Phone-style layout below 760px: tray at the bottom, everything else behind the menu.
    const narrowLayout = vw < 760;
    this.setNarrow(narrowLayout);
    const wrap = this.el.arenaWrap;
    const availW = Math.max(220, (wrap.clientWidth || vw) - 8);
    const availH = Math.max(220, (wrap.clientHeight || window.innerHeight - 160) - 8);
    const narrow = availW < 600;
    const wallLR = narrow ? 76 : 124;
    const wallTB = narrow ? 84 : 104;
    let cell = Math.floor((availW - 2 * wallLR) / g.W);
    cell = Math.min(cell, Math.floor((availH - 2 * wallTB) / g.H), 60);
    cell = Math.max(cell, 24);
    const a = this.el.arena;
    a.style.setProperty('--cell', cell + 'px');
    a.style.setProperty('--wall-lr', wallLR + 'px');
    a.style.setProperty('--wall-tb', wallTB + 'px');
    a.style.setProperty('--cols', g.W);
    a.style.setProperty('--rows', g.H);
    a.classList.toggle('narrow', narrow || cell < 40);
    this.cell = cell;
    document.documentElement.style.setProperty('--tray-h', (this.el.hud.offsetHeight || 92) + 'px');
  }

  // Phone layout: the detailed stats and the log live in a popup instead of a side panel.
  setNarrow(narrow) {
    if (this.narrow === narrow) return;
    this.narrow = narrow;
    document.body.classList.toggle('narrow', narrow);
    if (narrow) { if (this.el.hudMore.parentElement !== this.el.statsBody) this.el.statsBody.appendChild(this.el.hudMore); }
    else if (this.el.statsModal.hidden && this.el.hudMore.parentElement !== this.el.hud) this.el.hud.appendChild(this.el.hudMore);
  }

  // ---------- menu sheet & stats popup ----------
  openMenu() {
    this.hideGoalPopup();
    const g = this.game, s = this.settings;
    const item = (key, icon, label, state = '', on = false) =>
      `<button type="button" class="sheet-item${on ? ' on' : ''}" data-menu="${key}">${ICONS[icon]}<span>${label}</span>${state ? `<span class="state">${esc(state)}</span>` : ''}</button>`;
    const playing = g && g.status === 'playing';
    this.el.menuSheet.innerHTML =
      item('pause', this.paused ? 'play' : 'pause', this.paused ? 'Resume' : 'Pause', playing ? '' : 'not playing') +
      item('new', 'new', 'New game') +
      `<div class="sheet-sep"></div>` +
      item('hints', 'hints', 'Hints', s.hints ? 'on' : 'off', s.hints) +
      item('bot', 'bot', 'Bot autoplay', this.bot ? 'on' : 'off', this.bot) +
      `<div class="sheet-sep"></div>` +
      item('stats', 'stats', 'Stats & log', g ? `score ${g.score}` : '') +
      item('help', 'help', 'How to play') +
      item('settings', 'settings', 'Settings');
    this.el.menu.hidden = false;
  }

  closeMenu() { this.el.menu.hidden = true; }

  menuAction(key) {
    if (key === 'pause') this.togglePause();
    else if (key === 'new') this.newGame();
    else if (key === 'hints') this.toggleHints();
    else if (key === 'bot') this.toggleBot();
    else if (key === 'stats') this.openStats();
    else if (key === 'help') this.openHelp();
    else if (key === 'settings') this.openSettings();
  }

  openStats() {
    this.hideGoalPopup();
    if (this.el.hudMore.parentElement !== this.el.statsBody) this.el.statsBody.appendChild(this.el.hudMore);
    this.el.statsModal.hidden = false;
  }

  closeStats() {
    this.el.statsModal.hidden = true;
    if (!this.narrow && this.el.hudMore.parentElement !== this.el.hud) this.el.hud.appendChild(this.el.hudMore);
  }

  buildHud() {
    const s = this.settings;
    const rows = [
      ['score', 'Score'], ['combo', 'Combo'], ['wards', 'Wards'],
      ['level', 'Level', s.mode === 'survival'], ['levelTime', s.clock === 'time' ? 'Level ends in' : 'Level ends in', s.mode === 'survival'],
      ['global', 'Next wall in', s.wallMode === 'global'],
      ['elapsed', 'Time'], ['placed', 'Placed'],
      ['deck', 'Deck'], ['discard', 'Discard'],
      ['seed', 'Seed', true, 'wide seed'],
    ];
    this.el.stats.innerHTML = '';
    this.stat = {};
    for (const [key, label, show = true, cls = ''] of rows) {
      if (!show) continue;
      const d = h('div', { class: `stat ${cls}` });
      d.appendChild(h('span', { class: 'lbl', text: label }));
      const b = h('b', { text: '' });
      d.appendChild(b);
      this.el.stats.appendChild(d);
      this.stat[key] = { el: d, b };
    }
    this.stat.seed.b.title = 'Click to copy the seed';
    this.stat.seed.b.onclick = () => { navigator.clipboard?.writeText(this.game.seed); this.toast('Seed copied'); };

    // Compact chips shown next to the drawn tile (the whole row opens the stats popup).
    const chips = [
      ['wards', 'ward', 'Wards'], ['deck', 'deck', 'Tiles left in the deck · curses among them'],
      ['time', s.clock === 'time' ? 'clock' : 'turns', s.clock === 'time' ? 'Time' : 'Tiles placed'],
      ['level', 'level', 'Level · time left', s.mode === 'survival'],
      ['global', 'clock', 'Next wall in', s.wallMode === 'global'],
      ['combo', 'combo', 'Combo'],
    ];
    this.el.chips.innerHTML = '';
    this.chip = {};
    for (const [key, icon, title, show = true] of chips) {
      if (!show) continue;
      const c = h('span', { class: 'chip', title }, ICONS[icon] + '<b></b>');
      this.el.chips.appendChild(c);
      this.chip[key] = { el: c, b: c.querySelector('b') };
    }
  }

  renderChips() {
    const g = this.game, s = this.settings, c = this.chip;
    if (!c) return;
    c.wards.b.textContent = s.wardSpend === 'manual' ? g.wards : 'auto';
    c.wards.el.classList.toggle('hot', s.wardSpend === 'manual' && g.wards > 0);
    c.deck.b.innerHTML = `${g.deck.length}${s.showCursesInDeck ? ` <small>☠${g.cursesInDeck()}</small>` : ''}`;
    c.time.b.textContent = s.clock === 'time' ? fmtTime(g.elapsed) : g.placements;
    if (c.level) {
      c.level.b.textContent = `${g.level} · ${s.clock === 'time' ? fmtTime(g.levelLeft) : g.levelLeft}`;
      c.level.el.classList.toggle('warn', s.clock === 'time' ? g.levelLeft < 10 : g.levelLeft <= 3);
    }
    if (c.global) c.global.b.textContent = s.clock === 'time' ? `${Math.ceil(g.globalLeft)}s` : `${g.globalLeft}`;
    const mult = 1 + g.combo * s.comboBonus;
    c.combo.el.hidden = !(s.comboEnabled && g.combo > 0);
    c.combo.b.textContent = `×${mult.toFixed(2).replace(/\.?0+$/, '')}`;
  }

  // ---------- rendering ----------
  renderAll() {
    this.renderCells();
    this.renderWalls();
    this.renderHud();
    this.renderTimers();
  }

  renderCells() {
    const g = this.game, s = this.settings;
    const playing = g.status === 'playing';
    const hints = s.hints && playing && g.current;
    const wardable = playing && s.wardSpend === 'manual' && g.wards > 0;
    const cur = g.current;
    const ghost = cur ? (cur.kind === 'tile' ? SYMBOL_GLYPHS[cur.sym] : cur.kind === 'num' ? String(cur.n) : RANK_LABELS[cur.rank] + SUITS[cur.suit]) : '';
    const ghostBg = cur && (cur.kind === 'tile' || cur.kind === 'num') ? TILE_COLORS[cur.color] : '';
    for (let i = 0; i < this.cellEls.length; i++) {
      const cell = this.cellEls[i];
      const inner = cell.firstChild;
      const v = g.cells[i];
      const open = g.inBounds(i);
      const sig = v ? `${v.kind}:${v.rank}:${v.suit}:${v.color}:${v.sym}:${v.n}` : 'empty';
      if (sig !== this.cellSig[i]) { inner.innerHTML = pieceHTML(v); this.cellSig[i] = sig; }
      let cls = 'cell';
      if (!open) cls += ' crushed'; else cls += ' open';
      if (!v) cls += ' empty';
      if (v && v.kind === 'curse') cls += ' cursed';
      if (v && v.kind === 'curse' && open && wardable) cls += ' wardable';
      if (hints && !v && open) {
        const n = (g.preview(i) || []).length;
        if (n >= 2) cls += ' hint2'; else if (n === 1) cls += ' hint1';
      }
      if (this.cursor === i) cls += ' cursor';
      cell.className = cls;
      if (!v && open) {
        inner.dataset.ghost = ghost;
        inner.classList.toggle('ghost-red', !!(cur && cur.kind === 'card' && cur.red));
        inner.classList.toggle('ghost-tile', !!ghostBg);
        if (ghostBg) inner.style.setProperty('--ghost-bg', ghostBg); else inner.style.removeProperty('--ghost-bg');
      } else { delete inner.dataset.ghost; inner.classList.remove('ghost-red', 'ghost-tile'); inner.style.removeProperty('--ghost-bg'); }
    }
  }

  renderWalls() {
    const g = this.game, s = this.settings;
    const a = this.el.arena;
    a.style.setProperty('--it', g.inset.top);
    a.style.setProperty('--ir', g.inset.right);
    a.style.setProperty('--ib', g.inset.bottom);
    a.style.setProperty('--il', g.inset.left);
    for (const side of SIDES) {
      const box = this.el.goal[side];
      const goal = g.goals[side];
      if (!goal) {
        if (box.dataset.gid !== 'none') {
          box.dataset.gid = 'none';
          box.className = 'goal none';
          box.innerHTML = `<div class="goal-side">${SIDE_ARROW[side]} ${SIDE_LABEL[side]}</div><div class="goal-name">No goal</div><div class="goal-desc">Enable goals in Settings</div>`;
        }
        continue;
      }
      if (box.dataset.gid !== String(goal.id)) {
        box.dataset.gid = String(goal.id);
        box.className = 'goal';
        box.innerHTML = `<div class="goal-side">${SIDE_ARROW[side]} ${SIDE_LABEL[side]}</div>` +
          `<div class="goal-name">${goalBadgeHTML(goal.def, s, g)}<span class="goal-title">${esc(goal.def.name)}</span></div>` +
          `<div class="goal-desc">${esc(goalDesc(goal.def, s))}</div>` +
          `<div class="goal-meta"><span class="pts">${goalPoints(goal.def, s)} pts</span><span class="timer-text"></span></div>` +
          `<div class="goal-bar"><div class="goal-bar-fill"></div></div>` +
          this.goalActionsHTML();
        box.title = `${goal.def.name}: ${goalDetail(goal.def, s)} Tap for details.`;
      }
      const cnt = box.querySelector('.goal-count');
      if (cnt) cnt.textContent = goalCountText(goal.def, s, g);
      this.updateGoalButtons(side);
    }
  }

  // Two icon buttons under every goal: replace it, or add time to it.
  goalActionsHTML() {
    const s = this.settings;
    if (s.wardSpend !== 'manual' || (s.wardCostReroll <= 0 && s.wardCostExtend <= 0)) return '';
    const unit = s.clock === 'time' ? 's' : '';
    const parts = [];
    if (s.wardCostReroll > 0) parts.push(`<button type="button" class="goal-btn" data-ward="reroll">${ICON_REPLACE}</button>`);
    if (s.wardCostExtend > 0) parts.push(`<button type="button" class="goal-btn ext" data-ward="extend">${ICON_EXTEND}<span>+${s.extendBonus}${unit}</span></button>`);
    return `<div class="goal-actions">${parts.join('')}</div>`;
  }

  wardActionInfo(kind, side) {
    const g = this.game, s = this.settings;
    const unit = s.clock === 'time' ? 'seconds' : 'turns';
    if (kind === 'reroll') {
      const cost = s.wardCostReroll;
      const ok = g.status === 'playing' && g.wards >= cost;
      const how = s.rerollTimer === 'keep' ? 'keeps the remaining time' : s.rerollTimer === 'add' ? `keeps the remaining time +${s.rerollBonus} ${unit}` : 'starts with a fresh timer';
      return { cost, ok, label: 'Replace goal', title: ok ? `Replace this goal (${cost} ward${cost === 1 ? '' : 's'}); the new goal ${how}` : `Replace goal: needs ${cost} ward${cost === 1 ? '' : 's'}` };
    }
    if (kind === 'extend') {
      const cost = s.wardCostExtend;
      const ok = g.status === 'playing' && g.wards >= cost;
      return { cost, ok, label: `Extend +${s.extendBonus} ${unit}`, title: ok ? `Add ${s.extendBonus} ${unit} to this goal (${cost} ward${cost === 1 ? '' : 's'})` : `Extend: needs ${cost} ward${cost === 1 ? '' : 's'}` };
    }
    const cost = s.wardCostRetreat;
    const open = g.inset[side] > 0;
    const ok = g.status === 'playing' && open && g.wards >= cost;
    return { cost, ok, label: 'Push wall back', title: !open ? 'This wall is fully open' : ok ? `Reopen one row or column (${cost} ward${cost === 1 ? '' : 's'})` : `Push wall back: needs ${cost} ward${cost === 1 ? '' : 's'}` };
  }

  updateGoalButtons(side) {
    const box = this.el.goal[side];
    for (const b of box.querySelectorAll('[data-ward]')) {
      const info = this.wardActionInfo(b.dataset.ward, side);
      b.disabled = !info.ok;
      b.title = info.title;
      b.setAttribute('aria-label', info.label);
    }
  }

  // ---------- goal popup ----------
  showGoalPopup(side) {
    const g = this.game, s = this.settings;
    const goal = g.goals[side];
    this.hideGoalPopup();
    if (!goal) return;
    const t = s.clock === 'time';
    const left = s.wallMode === 'goal'
      ? (t ? `${Math.ceil(goal.timeLeft)}s left` : `${goal.timeLeft} turn${goal.timeLeft === 1 ? '' : 's'} left`)
      : 'no timer';
    const narrow = this.el.arena.getBoundingClientRect().width < 520;
    const pop = h('div', { class: `goal-pop from-${side}${narrow ? ' centered' : ''}` });
    pop.style.borderColor = `var(--${side})`;

    let actions = '';
    if (g.status === 'playing' && s.wardSpend === 'manual' && (s.wardCostReroll > 0 || s.wardCostExtend > 0 || s.wardCostRetreat > 0)) {
      const parts = [];
      for (const kind of ['reroll', 'extend', 'retreat']) {
        const cost = { reroll: s.wardCostReroll, extend: s.wardCostExtend, retreat: s.wardCostRetreat }[kind];
        if (!(cost > 0)) continue;
        const info = this.wardActionInfo(kind, side);
        parts.push(`<button type="button" class="goal-pop-btn" data-ward="${kind}"${info.ok ? '' : ' disabled'} title="${esc(info.title)}">${esc(info.label)} · ${cost} ward${cost === 1 ? '' : 's'}</button>`);
      }
      actions = `<div class="goal-pop-actions">${parts.join('')}<span class="goal-pop-wards">${g.wards} ward${g.wards === 1 ? '' : 's'} banked</span></div>`;
    }

    pop.innerHTML =
      `<div class="goal-pop-head"><span class="goal-pop-name" style="color: var(--${side})">${SIDE_ARROW[side]} ${goalBadgeHTML(goal.def, s, g)}${esc(goal.def.name)}</span>` +
      `<span class="goal-pop-meta">${goalPoints(goal.def, s)} pts · ${left}</span></div>` +
      `<div class="goal-pop-body">${esc(goalDetail(goal.def, s))}</div>` +
      `<ul class="goal-pop-notes">${goalNotes(goal.def, s).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` +
      actions +
      `<div class="goal-pop-hint">tap anywhere to dismiss</div>`;
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-ward]');
      if (b && !b.disabled) this.wardAction(b.dataset.ward, side);
      else this.hideGoalPopup();
    });
    this.el.arena.appendChild(pop);
    this.goalPop = pop;
    this.goalPopTimer = setTimeout(() => this.hideGoalPopup(), 8000);
  }

  wardAction(kind, side) {
    const g = this.game;
    let ok = false;
    if (kind === 'reroll') ok = g.wardReroll(side);
    else if (kind === 'extend') ok = g.wardExtend(side);
    else if (kind === 'retreat') ok = g.wardRetreat(side);
    this.hideGoalPopup();
    if (!ok) { this.toast('That ward action is not available right now', 'bad'); return; }
    this.afterAction();
  }

  hideGoalPopup() {
    if (this.goalPopTimer) { clearTimeout(this.goalPopTimer); this.goalPopTimer = null; }
    if (this.goalPop) { this.goalPop.remove(); this.goalPop = null; }
  }

  renderTimers() {
    const g = this.game, s = this.settings;
    for (const side of SIDES) {
      const box = this.el.goal[side];
      const goal = g.goals[side];
      if (!goal) continue;
      const fill = box.querySelector('.goal-bar-fill');
      const txt = box.querySelector('.timer-text');
      if (!fill) continue;
      if (s.wallMode === 'goal') {
        const frac = Math.max(0, Math.min(1, goal.timeLeft / goal.duration));
        fill.style.width = (frac * 100).toFixed(1) + '%';
        txt.textContent = s.clock === 'time' ? `${Math.ceil(goal.timeLeft)}s` : `${goal.timeLeft} turn${goal.timeLeft === 1 ? '' : 's'}`;
        box.classList.toggle('danger', frac < 0.25 && g.status === 'playing');
      } else {
        fill.style.width = '100%';
        txt.textContent = '';
        box.classList.remove('danger');
      }
    }
    const st = this.stat;
    st.elapsed.b.textContent = fmtTime(g.elapsed);
    if (st.levelTime) {
      st.levelTime.b.textContent = s.clock === 'time' ? fmtTime(g.levelLeft) : `${g.levelLeft} turns`;
      st.levelTime.el.classList.toggle('warn', s.clock === 'time' && g.levelLeft < 10);
    }
    if (st.global) st.global.b.textContent = s.clock === 'time' ? `${Math.ceil(g.globalLeft)}s` : `${g.globalLeft} turns`;
    this.renderChips();
    const pt = this.el.placementTimer;
    if (s.placementSeconds > 0 && s.clock === 'time' && g.current && g.status === 'playing') {
      pt.hidden = false;
      pt.firstElementChild.style.width = (Math.max(0, g.placementLeft / s.placementSeconds) * 100).toFixed(1) + '%';
    } else pt.hidden = true;
  }

  renderHud() {
    const g = this.game, s = this.settings;
    const st = this.stat;
    st.score.b.textContent = g.score;
    this.el.topScore.textContent = g.score;
    this.el.topBest.textContent = Math.max(this.best, g.score);
    if (s.comboEnabled) {
      const mult = 1 + g.combo * s.comboBonus;
      st.combo.b.textContent = g.combo > 0 ? `${g.combo} (×${mult.toFixed(2).replace(/\.?0+$/, '')})` : '—';
    } else st.combo.b.textContent = 'off';
    st.wards.b.textContent = s.wardSpend === 'manual' ? `${g.wards} ${g.wards === 1 ? 'ward' : 'wards'}` : 'auto';
    if (st.level) st.level.b.textContent = g.level;
    st.placed.b.textContent = g.placements;
    const curses = s.showCursesInDeck ? ` · ☠ ${g.cursesInDeck()}` : '';
    st.deck.b.textContent = `${g.deck.length}${curses}`;
    st.discard.b.textContent = g.discard.length;
    st.seed.b.textContent = g.seed;

    if (g.status === 'playing' && g.current) {
      this.el.current.innerHTML = pieceHTML(g.current, 'bigcard');
    } else if (g.status === 'over') {
      this.el.current.innerHTML = '<div class="placeholder">Game over</div>';
    } else if (g.status === 'levelup') {
      this.el.current.innerHTML = '<div class="placeholder">Level complete</div>';
    } else {
      this.el.current.innerHTML = '<div class="placeholder">—</div>';
    }
    const peek = g.upcoming(s.peekCount);
    this.el.upcoming.innerHTML = s.peekCount ? peek.map((c) => pieceHTML(c, 'smallcard')).join('') : '<span class="hint-text">hidden</span>';
    let hint = '';
    if (g.status === 'playing') {
      if (g.current) hint = `Tap an empty cell to place the ${pieceWord(s)}.`;
      if (s.wardSpend === 'manual' && g.wards > 0) {
        const uses = [];
        if (s.wardCostCurse > 0 && g.wards >= s.wardCostCurse && g.curseCells().length) uses.push('tap a glowing curse to remove it');
        if (s.wardCostReroll > 0 && g.wards >= s.wardCostReroll) uses.push('use the ↻ button under a goal to replace it');
        if (s.wardCostExtend > 0 && g.wards >= s.wardCostExtend) uses.push(`use the clock button to add ${s.extendBonus} ${s.clock === 'time' ? 'seconds' : 'turns'}`);
        if (s.wardCostRetreat > 0 && g.wards >= s.wardCostRetreat && SIDES.some((x) => g.inset[x] > 0)) uses.push('tap a goal to push its wall back');
        if (uses.length) hint += ` Wards: ${uses.join(', or ')}.`;
      }
    }
    this.el.hintText.textContent = hint;
    this.el.btnBot.classList.toggle('on', this.bot);
    this.el.btnHints.classList.toggle('on', s.hints);
    this.el.btnPause.innerHTML = ICONS[this.paused ? 'play' : 'pause'];
    this.el.btnPause.title = this.paused ? 'Resume (P)' : 'Pause (P)';
    this.renderChips();
  }

  // ---------- events → feedback ----------
  handleEvents(events) {
    const g = this.game;
    for (const ev of events) {
      switch (ev.type) {
        case 'place':
          this.flashCell(ev.idx, 'pop');
          break;
        case 'curse':
          this.flashCell(ev.idx, 'shake');
          this.toast(ev.fromDeck ? '☠ A curse lands on the board' : '☠ A curse appears', 'bad');
          this.log(ev.fromDeck ? 'Curse drawn from the deck' : 'Curse spawned', 'bad');
          break;
        case 'curseNoSpace':
          this.toast('A curse was drawn but had nowhere to go');
          break;
        case 'clear': {
          const names = ev.clears.map((c) => c.name).join(' + ');
          const word = (ev.source === 'wall' ? 'WALL CLEAR! ' : '') + (ev.n >= 2 ? `${MULTI_WORDS[Math.min(ev.n, 4)]} CLEAR! ` : '');
          this.toast(`${word}${names}  +${ev.points}`, ev.n >= 2 ? 'great' : 'good');
          this.log(`${word}${names} +${ev.points}${ev.comboMult > 1 ? ` (combo ×${ev.comboMult.toFixed(2).replace(/\.?0+$/, '')})` : ''}`, ev.n >= 2 ? 'great' : 'good');
          for (const r of ev.removed) this.ghost(r.idx, r.card, 'clear');
          if (!ev.removed.length) for (const c of ev.clears) for (const i of c.cells) this.flashCell(i, 'pop');
          this.pop(ev.placedIdx, `+${ev.points}`, ev.n >= 2 ? 'big' : '');
          for (const c of ev.clears) this.flashWall(c.side, 'cleared');
          for (const p of ev.perks) { this.toast(`Perk: ${p}`, 'great'); this.log(`Perk: ${p}`, 'great'); }
          if (ev.wardsGained > 0 && this.settings.wardSpend === 'manual') this.log(`+${ev.wardsGained} ward${ev.wardsGained > 1 ? 's' : ''}`);
          break;
        }
        case 'wall': {
          const n = ev.crushed.length;
          this.toast(`${SIDE_LABEL[ev.side]} wall closes in${n ? `, crushing ${n} card${n > 1 ? 's' : ''}` : ''}`, 'bad');
          this.log(`${SIDE_LABEL[ev.side]} wall moved in (${ev.reason === 'expire' ? 'goal expired' : 'timer'})${n ? `, ${n} crushed` : ''}`, 'bad');
          for (const c of ev.crushed) this.ghost(c.idx, c.card, 'crush');
          this.flashWall(ev.side, 'hit');
          break;
        }
        case 'retreat':
          this.toast(`${SIDE_LABEL[ev.side]} wall pushed back${ev.reason === 'ward' ? ' (ward)' : ''}`, 'good');
          this.log(`${SIDE_LABEL[ev.side]} wall pushed back${ev.reason === 'ward' ? ' with a ward' : ''}`, 'good');
          break;
        case 'goalSwap':
          this.toast(`${ev.from} no longer fits between the walls; replaced by ${ev.to}`);
          this.log(`${SIDE_LABEL[ev.side]} goal ${ev.from} no longer fits, replaced by ${ev.to}`);
          break;
        case 'extend':
          this.toast(`${ev.name} extended by ${ev.bonus} ${this.settings.clock === 'time' ? 'seconds' : 'turns'}`, 'good');
          this.log(`Ward spent: ${SIDE_LABEL[ev.side]} goal ${ev.name} extended +${ev.bonus}`, 'good');
          this.flashWall(ev.side, 'cleared');
          break;
        case 'reroll':
          this.toast(`Goal replaced: ${ev.from} → ${ev.to}`, 'good');
          this.log(`Ward spent: ${SIDE_LABEL[ev.side]} goal ${ev.from} replaced by ${ev.to}`, 'good');
          break;
        case 'expire':
          this.toast(`${SIDE_LABEL[ev.side]} goal expired: ${ev.name}`, 'bad');
          this.flashWall(ev.side, 'expired');
          break;
        case 'curseRemoved':
          this.ghost(ev.idx, { kind: 'curse' }, 'poof');
          if (ev.how === 'ward') { this.toast('Curse removed', 'good'); this.log('Ward spent: curse removed', 'good'); }
          else if (ev.how === 'auto') this.log('Ward auto-spent: curse removed', 'good');
          break;
        case 'levelup':
          this.log(`Level ${ev.level - 1} complete, +${ev.bonus}`, 'great');
          this.showLevelUp(ev);
          break;
        case 'over':
          this.log(`Game over: ${ev.text}`, 'bad');
          this.showGameOver(ev);
          break;
        case 'reshuffle':
          this.toast(`Deck reshuffled (${ev.count} cards)`);
          this.log('Deck reshuffled from the discard pile');
          break;
        case 'discard':
          this.toast(ev.reason === 'timeout' ? `Time up: ${cardText(ev.card)} discarded` : `No space: ${cardText(ev.card)} discarded`, 'bad');
          break;
        case 'autoplace':
          this.toast('Time up: the card was placed for you', 'bad');
          break;
        case 'purge':
          break;
        default:
          break;
      }
    }
  }

  toast(msg, kind = '') {
    const t = h('div', { class: `toast ${kind}`, text: msg });
    this.el.toasts.appendChild(t);
    const max = this.narrow ? 2 : 4;
    while (this.el.toasts.children.length > max) this.el.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, this.narrow ? 1900 : 2300);
  }

  log(msg, kind = '') {
    const li = h('li', { class: kind, text: msg });
    this.el.log.prepend(li);
    while (this.el.log.children.length > 14) this.el.log.lastChild.remove();
  }

  ghost(idx, card, cls) {
    const [r, c] = this.game.rc(idx);
    const e = h('div', { class: `ghost ${cls}`, style: `--r:${r};--c:${c}` }, pieceHTML(card));
    this.el.fx.appendChild(e);
    setTimeout(() => e.remove(), 720);
  }

  pop(idx, text, cls = '') {
    if (idx == null) return;
    const [r, c] = this.game.rc(idx);
    const e = h('div', { class: `pop ${cls}`, text, style: `left: calc(var(--wall-lr) + (${c} + 0.5) * var(--cell)); top: calc(var(--wall-tb) + (${r} + 0.5) * var(--cell));` });
    this.el.pops.appendChild(e);
    setTimeout(() => e.remove(), 1150);
  }

  flashCell(idx, cls) {
    const el = this.cellEls[idx];
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 520);
  }

  flashWall(side, cls) {
    const w = this.el.wall[side];
    w.classList.remove(cls);
    void w.offsetWidth;
    w.classList.add(cls);
    setTimeout(() => w.classList.remove(cls), 720);
  }

  // ---------- input ----------
  act(i) {
    const g = this.game;
    if (!g || this.paused || this.modalOpen() || g.status !== 'playing') return;
    if (g.canPlace(i)) {
      g.place(i);
    } else if (g.cells[i] && g.cells[i].kind === 'curse' && g.inBounds(i)) {
      if (!g.spendWard(i)) {
        if (this.settings.wardSpend === 'manual' && g.wards <= 0) this.toast('No wards: clear a goal to earn one', 'bad');
        return;
      }
    } else return;
    this.afterAction();
  }

  afterAction() {
    const ev = this.game.drain();
    if (ev.length) this.handleEvents(ev);
    this.renderAll();
  }

  onKey(e) {
    if (e.target && e.target.matches('input, textarea, select')) return;
    const k = e.key;
    if (k === 'Escape') {
      if (this.goalPop) { this.hideGoalPopup(); return; }
      if (!this.el.menu.hidden) { this.closeMenu(); return; }
      if (!this.el.statsModal.hidden) { this.closeStats(); return; }
      if (!this.el.settings.hidden) this.closeSettings();
      else if (!this.el.help.hidden) this.el.help.hidden = true;
      else this.togglePause();
      return;
    }
    if (this.modalOpen()) return;
    if (k === 'p' || k === 'P') this.togglePause();
    else if (k === 'n' || k === 'N') this.newGame();
    else if (k === 'h' || k === 'H') this.toggleHints();
    else if (k === 'b' || k === 'B') this.toggleBot();
    else if (k === 'ArrowUp') { e.preventDefault(); this.moveCursor(-1, 0); }
    else if (k === 'ArrowDown') { e.preventDefault(); this.moveCursor(1, 0); }
    else if (k === 'ArrowLeft') { e.preventDefault(); this.moveCursor(0, -1); }
    else if (k === 'ArrowRight') { e.preventDefault(); this.moveCursor(0, 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (this.cursor != null) this.act(this.cursor); }
  }

  moveCursor(dr, dc) {
    const g = this.game;
    if (!g) return;
    if (this.cursor == null) { this.cursor = g.idx(g.inset.top, g.inset.left); }
    else {
      let [r, c] = g.rc(this.cursor);
      r = Math.min(g.H - 1 - g.inset.bottom, Math.max(g.inset.top, r + dr));
      c = Math.min(g.W - 1 - g.inset.right, Math.max(g.inset.left, c + dc));
      this.cursor = g.idx(r, c);
    }
    this.renderCells();
  }

  togglePause() {
    const g = this.game;
    if (!g || g.status !== 'playing') return;
    this.paused = !this.paused;
    this.el.btnPause.innerHTML = ICONS[this.paused ? 'play' : 'pause'];
    if (this.paused) this.showOverlay('<h2>Paused</h2><p class="reason">Press P, Escape or the button to resume.</p><div class="btnrow"><button class="primary" data-action="resume">Resume</button><button data-action="new">New game</button></div>');
    else this.hideOverlay();
  }

  toggleBot() {
    this.bot = !this.bot;
    this.botAcc = 0;
    if (this.bot && this.game.status === 'over') this.newGame();
    this.renderHud();
    this.toast(this.bot ? 'Bot is playing (press B to stop)' : 'Bot stopped');
  }

  toggleHints() {
    this.settings.hints = !this.settings.hints;
    saveSettings(this.settings);
    this.renderAll();
  }

  // ---------- overlays ----------
  showOverlay(html) { this.el.overlayBox.innerHTML = html; this.el.overlay.hidden = false; }
  hideOverlay() { this.el.overlay.hidden = true; }
  modalOpen() { return !this.el.settings.hidden || !this.el.help.hidden || !this.el.menu.hidden || !this.el.statsModal.hidden; }

  showLevelUp(ev) {
    const s = this.settings;
    const t = s.clock === 'time';
    this.showOverlay(
      `<h2>Level ${ev.level - 1} complete!</h2>` +
      `<div class="over-score">+${ev.bonus}</div>` +
      `<p class="reason">Level ${ev.level} is coming: ${ev.curseCount} curses in the deck, goal timers of ${t ? Math.round(ev.goalBase) + 's' : ev.goalBase + ' turns'}, level length ${t ? fmtTime(ev.levelLen) : ev.levelLen + ' turns'}.</p>` +
      `<div class="btnrow"><button class="primary" data-action="continue">Continue</button><button data-action="new">New game</button></div>`
    );
  }

  showGameOver(ev) {
    const g = this.game, s = this.settings, st = g.stats;
    let bestNote = '';
    if (g.score > this.best) {
      this.best = g.score;
      try { localStorage.setItem(BEST_KEY, String(this.best)); } catch (e) { /* ignore */ }
      bestNote = '<div class="over-best">New best score!</div>';
    }
    const multi = Object.entries(st.multiClears).map(([n, k]) => `${k}× ${MULTI_WORDS[Math.min(+n, 4)].toLowerCase()}`).join(', ') || 'none';
    const walls = Object.values(st.wallMoves).reduce((a, b) => a + b, 0);
    const rows = [
      ['Time survived', fmtTime(g.elapsed)],
      ['Level reached', s.mode === 'survival' ? g.level : '—'],
      ['Cards placed', g.placements],
      ['Goals cleared', st.clears],
      ['Multi-clears', multi],
      ['Best combo', st.maxCombo],
      ['Goals expired', st.goalsExpired],
      ['Wall moves', walls],
      ['Cards crushed', st.cardsCrushed],
      ['Curses drawn / removed', `${st.cursesDrawn} / ${st.cursesRemoved}`],
      ['Wards earned / spent', `${st.wardsEarned} / ${st.wardsSpent}`],
      ['Goals replaced / extended', `${st.rerolls} / ${st.extends}`],
      ['Walls pushed back', st.retreatsBought],
      ['Seed', g.seed],
    ];
    const goalLines = GOAL_DEFS.filter((d) => st.goalsOffered[d.id]).map((d) => `${d.name} ${st.goalsCleared[d.id] || 0}/${st.goalsOffered[d.id]}`).join(' · ');
    this.showOverlay(
      `<h2>Game over</h2><p class="reason">${esc(ev.text)}</p>` +
      `<div class="over-score">${g.score}</div>${bestNote}` +
      `<table class="over-stats">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>` +
      `<div class="over-goals">Cleared / offered: ${esc(goalLines) || 'no goals'}</div>` +
      `<div class="btnrow"><button class="primary" data-action="new">New game</button><button data-action="settings">Settings</button><button data-action="close">Look at the board</button></div>`
    );
    this.el.btnPause.innerHTML = ICONS.pause;
  }

  // ---------- help ----------
  openHelp() {
    const lines = this.rulesSummary(this.settings);
    this.el.helpBody.className = 'modal-body help-body';
    const s0 = this.settings;
    const w = pieceWord(s0);
    const deckPara = s0.deckType === 'num'
      ? `<p><b>The tiles.</b> ${s0.numColors} colors (${TILE_COLOR_NAMES.slice(0, s0.numColors).join(', ')}), each carrying the numbers 1 to ${s0.numMax}${s0.numCopies > 1 ? `, ${s0.numCopies} copies of each` : ', one of each'}: ${s0.numColors * s0.numMax * s0.numCopies} tiles in all, plus ${s0.curseCount} curses. Sums and products use the printed numbers; runs are consecutive numbers in any order unless the goal says "in order".</p>`
      : s0.deckType === 'tiles'
      ? `<p><b>The tiles.</b> ${s0.tileColors} colors (${TILE_COLOR_NAMES.slice(0, s0.tileColors).join(', ')}). Each color has ${s0.tileBlanks} blank tile${s0.tileBlanks === 1 ? '' : 's'}, ${s0.tileDots} with a dot ${SYMBOL_GLYPHS[1]}, ${s0.tileTriangles} with a triangle ${SYMBOL_GLYPHS[2]} and ${s0.tileStars} with a star ${SYMBOL_GLYPHS[3]}: ${s0.tileColors * (s0.tileBlanks + s0.tileDots + s0.tileTriangles + s0.tileStars)} tiles in all, plus ${s0.curseCount} curses. A tile with a symbol is "marked".</p>`
      : `<p><b>The cards.</b> A standard 52-card deck plus ${s0.curseCount} curses.</p>`;
    this.el.helpBody.innerHTML =
      `<p>${w === 'tile' ? 'Tiles' : 'Cards'} are drawn one at a time. Tap an empty cell to place the drawn ${w}. Each of the four walls shows a goal; complete one with the ${w} you just placed and it clears: you score, earn a ward, and the wall draws a new goal. Let a goal's timer run out and that wall crashes inward, crushing whatever sits in its way. Curses in the deck land on random cells and block them until you spend a ward on them. The game ends when a ${w} cannot be placed or the walls close in.</p>` +
      deckPara +
      `<h3>Controls</h3><ul>` +
      `<li>Click or tap an empty cell to place the card; hover shows a preview.</li>` +
      `<li>Click a glowing curse to remove it with a ward. The two small buttons under each goal replace it (↻) or add time to it (clock); the goal itself opens its full description.</li>` +
      `<li><kbd>←↑↓→</kbd> move a cursor, <kbd>Enter</kbd> or <kbd>Space</kbd> acts on it.</li>` +
      `<li><kbd>P</kbd> pause · <kbd>N</kbd> new game · <kbd>H</kbd> hints · <kbd>B</kbd> bot autoplay · <kbd>Esc</kbd> close / pause</li>` +
      `</ul>` +
      `<h3>Definitions</h3><ul>` +
      `<li><b>Chain</b>: ${this.settings.chainShape === 'group' ? `any group of ${w}s connected up/down/left/right, branching allowed.` : `a snake of ${w}s connected up/down/left/right. It may bend as often as it likes but may not branch (a plus shape is not a chain), and each ${w} is used once.`} Diagonals never connect.</li>` +
      `<li><b>Straight line</b>: ${w}s side by side in a single row or a single column, no bends.</li>` +
      `<li><b>Full row / column</b>: every open cell between the current walls holds a ${w}. Curses count as gaps. The line needs at least ${this.settings.lineMinLen} open cell${this.settings.lineMinLen === 1 ? '' : 's'}, and it gets shorter (easier) as the walls close in. A goal that can no longer fit between the walls is replaced for free.</li>` +
      (s0.deckType !== 'cards'
        ? `<li><b>Block</b>: a 2×2 square of four tiles. <b>Plus</b>: a centre tile and its four side neighbours. <b>Board-wide</b> goals count matching tiles anywhere between the walls and clear all of them at once.</li>`
        : `<li><b>Pips</b> (for sums): number cards count face value, J/Q/K count 10, aces count 1 (Blackjack also lets an ace be 11).</li>` +
          `<li><b>Ace</b> in straights: low (A-2-3) or high (Q-K-A), never both (K-A-2 does not count). Ace is 1 for Low Road, Parity and pip sums, and counts as high for High Road.</li>`) +
      `<li>${this.settings.mustIncludePlaced ? `The ${w} you just placed must be part of the goal you complete.` : 'A goal clears after any placement if the board satisfies it.'} ${this.settings.clearedCardsRemoved ? `Cleared ${w}s leave the board.` : `Cleared ${w}s stay on the board.`}</li>` +
      `</ul>` +
      `<h3>Reading a goal card</h3><p>The badge before the name shows the shape and how many cards it takes:</p><ul class="icon-legend">` +
      `<li><span class="goal-badge shape-snake">${SHAPE_SVG.snake}<span class="goal-count">4</span></span> a connected chain of 4 cards (bends allowed, no branching)</li>` +
      `<li><span class="goal-badge shape-group">${SHAPE_SVG.group}<span class="goal-count">4</span></span> a connected group of 4 cards, branching allowed (shown instead of the snake when the chain shape setting is "group")</li>` +
      `<li><span class="goal-badge shape-line">${SHAPE_SVG.line}<span class="goal-count">3</span></span> 3 cards in a straight line, either a row or a column</li>` +
      `<li><span class="goal-badge shape-row">${SHAPE_SVG.row}<span class="goal-count">6</span></span> a whole row between the walls (the number is its current length and shrinks as the walls close in)</li>` +
      `<li><span class="goal-badge shape-col">${SHAPE_SVG.col}<span class="goal-count">6</span></span> a whole column between the walls</li>` +
      `<li><span class="goal-badge shape-square">${SHAPE_SVG.square}<span class="goal-count">4</span></span> a 2×2 block</li>` +
      `<li><span class="goal-badge shape-plus">${SHAPE_SVG.plus}<span class="goal-count">5</span></span> a plus: a centre and its four side neighbours</li>` +
      `<li><span class="goal-badge shape-board">${SHAPE_SVG.board}<span class="goal-count">6</span></span> that many matching ${w}s anywhere on the board</li>` +
      `</ul>` +
      this.wardRulesHTML(this.settings) +
      `<h3>Goal cards (${s0.deckType === 'num' ? 'numbered tiles' : s0.deckType === 'tiles' ? 'symbol tiles' : 'playing cards'})</h3><p class="help-p">Greyed goals are switched off in the current pool (Settings → Goal pool). Points are base values before combo and multi-clear bonuses. The tag names the goal's family${this.settings.avoidSimilarGoals ? '; two goals from one family never show on the walls at the same time' : ''}. Switch the deck in Settings to see the other deck's goals.</p>` +
      this.goalListHTML(this.settings) +
      `<h3>Other cards</h3><dl class="goal-list"><dt>☠ Curse</dt><dd>Not a ${w}. When drawn it lands on a random empty cell and blocks it: nothing can be placed there, chains cannot pass through it, and a row or column containing it cannot be completed. Remove it by spending a ward (earned by clearing goals) or let a wall crush it.</dd></dl>` +
      `<h3>Current rules</h3><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` +
      `<h3>Playtesting tips</h3><ul>` +
      `<li>Turn on <b>Hints</b> to see which cells would clear a goal; gold = one goal, red = two or more.</li>` +
      `<li>Turn on the <b>Bot</b> to watch a rule set play itself, or run the simulation in Settings for numbers.</li>` +
      `<li>Set a <b>seed</b> in Settings to replay the same deck with different rules.</li>` +
      `</ul>`;
    this.el.help.hidden = false;
  }

  wardRulesHTML(s) {
    if (s.wardSpend !== 'manual') return `<h3>Wards</h3><p>You earn ${s.wardsPerClear} ward${s.wardsPerClear === 1 ? '' : 's'} per goal cleared; they are spent automatically on a random curse.</p>`;
    const uses = [];
    if (s.wardCostCurse > 0) uses.push(`<li><b>Remove a curse</b> (${s.wardCostCurse}): tap a glowing curse.</li>`);
    if (s.wardCostReroll > 0) uses.push(`<li><b>Replace a goal</b> (${s.wardCostReroll}): the ↻ button under a goal (or the goal's popup). The new goal ${s.rerollTimer === 'keep' ? 'keeps the remaining time' : s.rerollTimer === 'add' ? `keeps the remaining time plus ${s.rerollBonus} ${s.clock === 'time' ? 'seconds' : 'turns'}` : 'starts with a fresh timer'}.</li>`);
    if (s.wardCostExtend > 0) uses.push(`<li><b>Extend a goal</b> (${s.wardCostExtend}): the clock button under a goal adds ${s.extendBonus} ${s.clock === 'time' ? 'seconds' : 'turns'} to it.</li>`);
    if (s.wardCostRetreat > 0) uses.push(`<li><b>Push a wall back</b> (${s.wardCostRetreat}): tap the goal on a wall that has moved in, then "Push wall back". The reopened row or column comes back empty.</li>`);
    return `<h3>Wards</h3><p>You earn ${s.wardsPerClear} ward${s.wardsPerClear === 1 ? '' : 's'} per goal cleared${s.perkExtraWard ? ', plus one extra for clearing two or more goals at once' : ''}. Wards bank until you spend them (cost in wards):</p><ul>${uses.join('') || '<li>No ward uses are enabled in Settings.</li>'}</ul>`;
  }

  goalListHTML(s) {
    let html = '';
    const deck = s.deckType || 'cards';
    const defs = GOAL_DEFS.filter((d) => goalDeck(d) === deck);
    for (const cat of [...new Set(defs.map((d) => d.cat))]) {
      html += `<h4>${esc(cat)}</h4><dl class="goal-list">`;
      for (const d of defs.filter((x) => x.cat === cat)) {
        const on = goalEnabled(d, s) && !(s.chainShape === 'group' && d.shape === 'chain' && (typeof d.ordered === 'function' ? d.ordered(s) : !!d.ordered));
        html += `<dt class="${on ? '' : 'off'}">${goalBadgeHTML(d, s, null)}${esc(d.name)} <span class="pts">${goalPoints(d, s)} pts</span>${familyTagsHTML(d)}${on ? '' : ' <span class="offtag">off</span>'}</dt><dd class="${on ? '' : 'off'}">${esc(goalDetail(d, s))}</dd>`;
      }
      html += '</dl>';
    }
    return html;
  }

  rulesSummary(s) {
    const t = s.clock === 'time';
    const lines = [];
    const deckDesc = s.deckType === 'num'
      ? `${s.numColors * s.numMax * s.numCopies} numbered tiles (${s.numColors} colors × 1–${s.numMax}${s.numCopies > 1 ? ` × ${s.numCopies} copies` : ''})`
      : s.deckType === 'tiles'
      ? `${s.tileColors * (s.tileBlanks + s.tileDots + s.tileTriangles + s.tileStars)} tiles (${s.tileColors} colors × ${s.tileBlanks} blank, ${s.tileDots} dot, ${s.tileTriangles} triangle, ${s.tileStars} star)`
      : '52 cards';
    lines.push(`Grid ${s.gridW}×${s.gridH}. Deck: ${deckDesc} + ${s.curseCount} curses (${s.curseSpread === 'even' ? 'evenly spaced' : 'randomly shuffled'}). Game over when fewer than ${s.minCells} cells remain between the walls.`);
    if (s.wallMode === 'goal') {
      const pen = { wall: 'that wall moves in one step', curse: 'a curse appears', both: 'that wall moves in and a curse appears', none: 'a new goal simply replaces it' }[s.expiredGoalPenalty];
      lines.push(`Each wall's goal lasts ${t ? s.goalSeconds + ' seconds' : s.goalTurns + ' placements'}; when it expires, ${pen}.`);
    } else if (s.wallMode === 'global') {
      lines.push(`Every ${t ? s.globalSeconds + ' seconds' : s.globalTurns + ' placements'} a wall moves in (${s.globalOrder === 'rotate' ? 'top, right, bottom, left in turn' : 'a random wall'}).`);
    } else lines.push('Walls never move.');
    if (s.wallMode !== 'off' && s.pressureRamp < 1) lines.push(`Timers shrink by ${Math.round((1 - s.pressureRamp) * 100)}% per ${t ? 'minute' : '20 placements'}, down to ${Math.round(s.pressureFloor * 100)}% of the base.`);
    if (s.wallMode !== 'off' && s.crushCheck !== 'off') lines.push(`Right after a wall moves in, ${s.crushCheck === 'lines' ? 'full row and column goals' : 'all goals'} the board already satisfies clear without needing a freshly placed ${pieceWord(s)}.`);
    const w = pieceWord(s);
    lines.push(`Chains are ${s.chainShape === 'path' ? 'snake paths (bends allowed, no branching)' : 'any connected group'}.${s.deckType === 'cards' ? ` Straights are ${s.straightLen} cards${s.straightOrdered ? ' and must run in order' : ''}; flushes are ${s.flushLen} cards.` : ''}`);
    lines.push(`${s.mustIncludePlaced ? `The ${w} you just placed must be part of the goal you complete.` : 'Any placement clears a goal the board already satisfies.'} ${s.clearedCardsRemoved ? `Cleared ${w}s leave the board.` : `Cleared ${w}s stay on the board.`}`);
    lines.push(`Each clear earns ${s.wardsPerClear} ward${s.wardsPerClear === 1 ? '' : 's'}; ${s.wardSpend === 'manual' ? 'click a curse to spend one' : 'they are spent automatically on a random curse'}.`);
    const perks = [];
    if (s.perkExtraWard) perks.push('an extra ward');
    if (s.perkClearAllCurses) perks.push('every curse on the board removed');
    if (s.perkPushAllWalls) perks.push('every wall pushed back one step');
    if (s.perkPurgeDeckCurses) perks.push(`${s.perkPurgeDeckCurses} curse${s.perkPurgeDeckCurses > 1 ? 's' : ''} purged from the deck`);
    if (s.perkExtraSeconds && t) perks.push(`+${s.perkExtraSeconds}s on every goal`);
    lines.push(`Clearing 2+ goals with one card multiplies the points by ${s.multiMult} per extra goal${perks.length ? ' and grants ' + perks.join(', ') : ''}.`);
    if (s.comboEnabled) lines.push(`Consecutive clearing placements build a combo worth +${Math.round(s.comboBonus * 100)}% per step.`);
    if (s.placementSeconds > 0 && t) lines.push(`You have ${s.placementSeconds}s to place each card, or it is ${s.placementTimeout === 'random' ? 'placed at random' : 'discarded'}.`);
    if (s.mode === 'survival') lines.push(`Survival: outlast ${t ? s.levelSeconds + ' seconds' : s.levelTurns + ' placements'} to finish a level (+${t ? s.levelSecondsGrowth + 's' : s.levelTurnsGrowth + ' turns'} each level). Each new level adds ${s.levelCurseGrowth} curse${s.levelCurseGrowth === 1 ? '' : 's'} and multiplies goal timers by ${s.levelPressureGrowth}.`);
    else lines.push('Endless: score as much as you can before the walls win.');
    return lines;
  }

  // ---------- settings panel ----------
  openSettings() {
    this.draft = normalizeSettings(JSON.parse(JSON.stringify(this.settings)));
    this.syncForm();
    this.el.settings.hidden = false;
    this.el.settingsBody.scrollTop = 0;
  }

  closeSettings() { this.el.settings.hidden = true; }

  applySettings() {
    this.settings = normalizeSettings(this.draft);
    saveSettings(this.settings);
    this.closeSettings();
    this.newGame();
    this.toast('Settings applied, new game started', 'good');
  }

  buildSettingsForm() {
    const body = this.el.settingsBody;
    body.innerHTML = '';
    this.inputs = {};
    this.goalInputs = {};
    this.rowEls = {};

    const pre = h('div', { class: 'presets' });
    const sel = h('select', { id: 'preset-select' });
    for (const name of Object.keys(PRESETS)) sel.appendChild(h('option', { value: name, text: name }));
    const btn = h('button', { type: 'button', text: 'Load preset' });
    btn.onclick = () => { this.draft = applyPreset(this.draft, sel.value); this.syncForm(); this.toast(`Preset "${sel.value}" loaded into the form`); };
    pre.append(h('span', { class: 'lbl', text: 'Preset' }), sel, btn);
    pre.appendChild(h('span', { class: 'note', text: 'Changes take effect when you press "Apply & new game". Settings are saved in this browser.' }));
    body.appendChild(pre);

    for (const group of SETTINGS_SCHEMA) {
      const fs = h('fieldset');
      fs.appendChild(h('legend', { text: group.group }));
      for (const it of group.items) fs.appendChild(this.buildSettingRow(it));
      body.appendChild(fs);
      if (group.group === 'Placement & clearing') body.appendChild(this.buildGoalsFieldset());
    }
    body.appendChild(this.buildSimFieldset());
    body.appendChild(this.buildShareFieldset());
  }

  buildSettingRow(it) {
    const row = h('div', { class: 'setting', 'data-key': it.key });
    const id = 'set-' + it.key;
    row.appendChild(h('label', { for: id, text: it.label }));
    const ctl = h('div', { class: 'ctl' });
    let inp, val;
    if (it.type === 'range') {
      inp = h('input', { type: 'range', id, min: it.min, max: it.max, step: it.step });
      val = h('span', { class: 'val' });
      inp.addEventListener('input', () => { this.draft[it.key] = parseFloat(inp.value); val.textContent = inp.value; this.afterDraftChange(it.key); });
      ctl.append(inp, val);
    } else if (it.type === 'bool') {
      inp = h('input', { type: 'checkbox', id });
      inp.addEventListener('change', () => { this.draft[it.key] = inp.checked; this.afterDraftChange(it.key); });
      ctl.appendChild(inp);
    } else if (it.type === 'select') {
      inp = h('select', { id });
      for (const [v, l] of it.options) inp.appendChild(h('option', { value: v, text: l }));
      inp.addEventListener('change', () => { this.draft[it.key] = inp.value; this.afterDraftChange(it.key); });
      ctl.appendChild(inp);
    } else {
      inp = h('input', { type: 'text', id, maxlength: 64 });
      inp.addEventListener('input', () => { this.draft[it.key] = inp.value.trim(); });
      ctl.appendChild(inp);
    }
    row.appendChild(ctl);
    if (it.help) row.appendChild(h('div', { class: 'help', text: it.help }));
    this.inputs[it.key] = { inp, val };
    this.rowEls[it.key] = row;
    return row;
  }

  afterDraftChange(key) {
    if (DESC_KEYS.has(key)) this.refreshGoalDescs();
    this.updateRowVisibility();
  }

  updateRowVisibility() {
    for (const [key, fn] of Object.entries(ROW_VISIBLE)) {
      const row = this.rowEls[key];
      if (row) row.hidden = !fn(this.draft);
    }
    const deck = this.draft.deckType || 'cards';
    for (const row of this.goalRows || []) row.hidden = row.dataset.deck !== deck;
    for (const [d, el] of Object.entries(this.goalTools || {})) el.hidden = d !== deck;
  }

  buildGoalsFieldset() {
    const fs = h('fieldset', { class: 'goals-fs' });
    fs.appendChild(h('legend', { text: 'Goal pool' }));
    fs.appendChild(h('p', { class: 'help-p', text: 'The four walls draw from the enabled goals (no duplicates unless allowed above). Points are the base value for clearing that goal. Rows and columns must be completely filled between the walls.' }));
    this.goalTools = {};
    for (const deck of ['num', 'tiles', 'cards']) {
      const tools = h('div', { class: 'goal-tools', 'data-deck': deck });
      const mk = (label, fn) => { const b = h('button', { type: 'button', text: label }); b.onclick = fn; tools.appendChild(b); };
      mk('All on', () => this.setGoals((d) => (goalDeck(d) === deck ? true : this.draft.goalsEnabled[d.id])));
      mk('All off', () => this.setGoals((d) => (goalDeck(d) === deck ? false : this.draft.goalsEnabled[d.id])));
      for (const cat of [...new Set(GOAL_DEFS.filter((d) => goalDeck(d) === deck).map((d) => d.cat))]) {
        mk(`Toggle ${cat.toLowerCase()}`, () => {
          const anyOff = GOAL_DEFS.some((d) => goalDeck(d) === deck && d.cat === cat && !this.draft.goalsEnabled[d.id]);
          this.setGoals((d) => (goalDeck(d) === deck && d.cat === cat ? anyOff : this.draft.goalsEnabled[d.id]));
        });
      }
      fs.appendChild(tools);
      this.goalTools[deck] = tools;
    }
    const table = h('table', { class: 'goals' }, '<thead><tr><th>On</th><th>Goal</th><th>Shape</th><th>Family</th><th>Requirement</th><th>Points</th></tr></thead>');
    const tb = h('tbody');
    let lastCat = null;
    this.goalRows = [];
    for (const d of GOAL_DEFS) {
      if (d.cat !== lastCat) {
        lastCat = d.cat;
        const catRow = h('tr', { class: 'cat', 'data-deck': goalDeck(d) }, `<td colspan="6">${esc(d.cat)}</td>`);
        tb.appendChild(catRow);
        this.goalRows.push(catRow);
      }
      const tr = h('tr', { 'data-deck': goalDeck(d) });
      this.goalRows.push(tr);
      const on = h('input', { type: 'checkbox' });
      const pts = h('input', { type: 'number', min: 0, step: 5, class: 'pts' });
      const desc = h('td', { class: 'desc' });
      const shape = h('td', { class: 'shape' });
      const fam = h('td', { class: 'fam' }, familyTagsHTML(d));
      on.onchange = () => { this.draft.goalsEnabled[d.id] = on.checked; };
      pts.onchange = () => { this.draft.goalPoints[d.id] = Math.max(0, Math.round(Number(pts.value) || 0)); pts.value = this.draft.goalPoints[d.id]; };
      const tdOn = h('td'); tdOn.appendChild(on);
      const tdPts = h('td'); tdPts.appendChild(pts);
      tr.append(tdOn, h('td', { class: 'name', text: d.name }), shape, fam, desc, tdPts);
      tb.appendChild(tr);
      this.goalInputs[d.id] = { on, pts, desc, shape };
    }
    table.appendChild(tb);
    const wrap = h('div', { class: 'sim-wrap' });
    wrap.appendChild(table);
    fs.appendChild(wrap);
    return fs;
  }

  setGoals(fn) {
    for (const d of GOAL_DEFS) this.draft.goalsEnabled[d.id] = !!fn(d);
    this.syncForm();
  }

  refreshGoalDescs() {
    for (const d of GOAL_DEFS) {
      this.goalInputs[d.id].desc.textContent = goalDesc(d, this.draft);
      this.goalInputs[d.id].shape.innerHTML = goalBadgeHTML(d, this.draft, null);
    }
  }

  syncForm() {
    for (const it of SCHEMA_ITEMS) {
      const ref = this.inputs[it.key];
      if (!ref) continue;
      const v = this.draft[it.key];
      if (it.type === 'bool') ref.inp.checked = !!v;
      else ref.inp.value = String(v);
      if (ref.val) ref.val.textContent = String(v);
    }
    for (const d of GOAL_DEFS) {
      const gi = this.goalInputs[d.id];
      gi.on.checked = !!this.draft.goalsEnabled[d.id];
      gi.pts.value = this.draft.goalPoints[d.id];
    }
    this.refreshGoalDescs();
    this.updateRowVisibility();
  }

  buildSimFieldset() {
    const fs = h('fieldset');
    fs.appendChild(h('legend', { text: 'Playtest simulation' }));
    fs.appendChild(h('p', { class: 'help-p', text: 'A greedy bot plays the settings currently in this form (not yet applied). It grabs any clear it can see and otherwise builds next to matching cards, so treat the numbers as relative: which goals get cleared, how fast the walls win, how often multi-clears happen.' }));
    const row = h('div', { class: 'simrow' });
    const games = h('input', { type: 'number', min: 1, max: 200, value: 20 });
    const spm = h('input', { type: 'number', min: 0.2, max: 10, step: 0.1, value: 1.5 });
    const l1 = h('label', { text: 'Games' }); l1.appendChild(games);
    const l2 = h('label', { text: 'Seconds per move' }); l2.appendChild(spm);
    const run = h('button', { type: 'button', class: 'primary', text: 'Run simulation' });
    row.append(l1, l2, run);
    fs.appendChild(row);
    const prog = h('div', { class: 'sim-progress' });
    const out = h('div', { class: 'sim-wrap' });
    fs.append(prog, out);
    run.onclick = () => this.runSim(Number(games.value) || 20, Number(spm.value) || 1.5, prog, out, run);
    return fs;
  }

  runSim(games, secPerMove, prog, out, btn) {
    const settings = normalizeSettings(this.draft);
    const seed = 'sim-' + randomSeedString();
    btn.disabled = true;
    prog.textContent = `Running 0 / ${games}…`;
    const finish = (result) => {
      btn.disabled = false;
      prog.textContent = `${result.games} games, bot at ${secPerMove}s per move.`;
      out.innerHTML = this.simResultsHTML(result);
    };
    const fail = (msg) => { btn.disabled = false; prog.textContent = 'Simulation failed: ' + msg; };
    let worker = null;
    try { worker = new Worker(new URL('./simworker.js', import.meta.url), { type: 'module' }); } catch (e) { worker = null; }
    if (!worker) {
      try { finish(runSimulation(settings, { games, secPerMove, seed })); } catch (e) { fail(String(e)); }
      return;
    }
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') prog.textContent = `Running ${m.done} / ${m.total}…`;
      else if (m.type === 'done') { finish(m.result); worker.terminate(); }
      else if (m.type === 'error') { fail(m.message); worker.terminate(); }
    };
    worker.onerror = (e) => {
      // Fall back to running on the main thread (e.g. file:// or a blocked worker).
      worker.terminate();
      try { finish(runSimulation(settings, { games, secPerMove, seed })); } catch (err) { fail(String(err) + ' / ' + (e.message || '')); }
    };
    worker.postMessage({ settings, games, secPerMove, seed });
  }

  simResultsHTML(r) {
    const f = (m, d = 1) => `<td>${m.mean.toFixed(d)}</td><td>${m.median.toFixed(d)}</td><td>${(+m.min).toFixed(d)}</td><td>${(+m.max).toFixed(d)}</td>`;
    const rows = [
      ['Score', r.score, 0], ['Time survived (s)', r.elapsed, 0], ['Level reached', r.level, 1], ['Cards placed', r.placements, 0],
      ['Goals cleared', r.clears, 1], ['Multi-clears', r.multiClears, 1], ['Goals expired', r.goalsExpired, 1], ['Wall moves', r.wallMoves, 1],
      ['Curses drawn', r.cursesDrawn, 1], ['Curses removed', r.cursesRemoved, 1], ['Best combo', r.maxCombo, 1],
    ];
    const reasons = Object.entries(r.reasons).map(([k, v]) => `${OVER_REASONS[k] || (k === 'capped' ? 'still alive at the move cap' : k)}: ${v}`).join(' · ');
    const goals = r.goals.slice().sort((a, b) => b.rate - a.rate);
    return `<table class="sim"><thead><tr><th>Metric</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th></tr></thead><tbody>` +
      rows.map(([k, m, d]) => `<tr><td>${k}</td>${f(m, d)}</tr>`).join('') + `</tbody></table>` +
      `<p class="help-p">How games ended — ${esc(reasons)}</p>` +
      `<table class="sim"><thead><tr><th>Goal</th><th>Offered</th><th>Cleared</th><th>Expired</th><th>Clear rate</th><th>Points</th></tr></thead><tbody>` +
      goals.map((g) => `<tr><td>${esc(g.name)}</td><td>${g.offered}</td><td>${g.cleared}</td><td>${g.expired}</td><td>${(g.rate * 100).toFixed(0)}%</td><td>${g.points}</td></tr>`).join('') +
      `</tbody></table>`;
  }

  buildShareFieldset() {
    const fs = h('fieldset');
    fs.appendChild(h('legend', { text: 'Share / backup' }));
    const ta = h('textarea', { class: 'json', spellcheck: 'false', placeholder: 'Settings JSON appears here' });
    const row = h('div', { class: 'btnrow tight' });
    const mk = (label, fn, cls = '') => { const b = h('button', { type: 'button', text: label, class: cls }); b.onclick = fn; row.appendChild(b); };
    mk('Export form to JSON', () => { ta.value = settingsToJSON(normalizeSettings(this.draft)); });
    mk('Copy JSON', () => { if (!ta.value) ta.value = settingsToJSON(normalizeSettings(this.draft)); navigator.clipboard?.writeText(ta.value); this.toast('JSON copied'); });
    mk('Load JSON into form', () => {
      try { this.draft = settingsFromJSON(ta.value); this.syncForm(); this.toast('JSON loaded into the form', 'good'); }
      catch (e) { this.toast('Could not parse that JSON', 'bad'); }
    });
    mk('Copy share link', () => {
      const url = `${location.origin}${location.pathname}#s=${encodeShare(normalizeSettings(this.draft))}`;
      navigator.clipboard?.writeText(url);
      this.toast('Link with these settings copied', 'good');
    });
    fs.append(ta, row);
    return fs;
  }

  // ---------- main loop ----------
  loop(t) {
    const dt = Math.min(0.25, (t - this.last) / 1000);
    this.last = t;
    const g = this.game;
    if (g) {
      const active = !this.paused && !this.modalOpen();
      if (g.status === 'playing' && active) {
        g.tick(dt);
        if (this.bot && g.status === 'playing') {
          this.botAcc += dt * 1000;
          if (this.botAcc >= this.settings.botDelay) { this.botAcc = 0; botStep(g, this.botRng); }
        }
        const ev = g.drain();
        if (ev.length) { this.handleEvents(ev); this.renderAll(); }
        else this.renderTimers();
      } else if (g.status === 'levelup' && this.bot && active) {
        this.botAcc += dt * 1000;
        if (this.botAcc >= 1200) { this.botAcc = 0; this.continueLevel(); }
      }
    }
    requestAnimationFrame((t2) => this.loop(t2));
  }
}
