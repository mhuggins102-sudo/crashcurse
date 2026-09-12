// DOM layer: renders the engine state, handles input, generates the settings
// panel from the schema, and runs the bot / simulation helpers.

import { Game, OVER_REASONS } from './engine.js';
import { SIDES, GOAL_DEFS, goalDesc, goalDetail, goalNotes, goalPoints, goalEnabled } from './goals.js';
import { SUITS, RANK_LABELS } from './cards.js';
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
const DESC_KEYS = new Set(['straightLen', 'flushLen', 'straightOrdered', 'lineLowAvg', 'lineHighAvg', 'chainShape']);

// Rows of the settings form that only matter for some combinations.
const ROW_VISIBLE = {
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
  crushedCurses: (d) => d.wallMode !== 'off',
  clearPushesWallBack: (d) => d.wallMode !== 'off',
};

const $ = (id) => document.getElementById(id);

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

export function cardHTML(card, extra = '') {
  if (!card) return '';
  if (card.kind === 'curse') return `<div class="curse ${extra}">☠</div>`;
  return `<div class="card ${card.red ? 'red' : 'black'} ${extra}"><span class="rank">${RANK_LABELS[card.rank]}</span><span class="suit">${SUITS[card.suit]}</span></div>`;
}

function cardText(card) {
  return card.kind === 'curse' ? 'a curse' : RANK_LABELS[card.rank] + SUITS[card.suit];
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
      arena: $('arena'), grid: $('grid'), fx: $('fx'), pops: $('pops'),
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
      this.el.goal[side].addEventListener('click', (e) => { e.stopPropagation(); this.showGoalPopup(side); });
    }
    document.addEventListener('click', () => this.hideGoalPopup());
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => { if (this.game) { this.computeSize(); } });
    window.addEventListener('orientationchange', () => { if (this.game) { this.computeSize(); } });
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
    this.el.btnPause.textContent = 'Pause';
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
    const vh = window.innerHeight;
    const sideBySide = vw > 980;
    const availW = sideBySide ? vw - 32 - 300 - 24 : vw - 24;
    const availH = Math.max(320, vh - 96);
    const narrow = availW < 600;
    const wallLR = narrow ? 78 : 124;
    const wallTB = narrow ? 70 : 84;
    let cell = Math.floor((availW - 2 * wallLR) / g.W);
    cell = Math.min(cell, Math.floor((availH - 2 * wallTB) / g.H), 60);
    cell = Math.max(cell, 26);
    const a = this.el.arena;
    a.style.setProperty('--cell', cell + 'px');
    a.style.setProperty('--wall-lr', wallLR + 'px');
    a.style.setProperty('--wall-tb', wallTB + 'px');
    a.style.setProperty('--cols', g.W);
    a.style.setProperty('--rows', g.H);
    a.classList.toggle('narrow', narrow || cell < 40);
    this.cell = cell;
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
    const ghost = g.current ? RANK_LABELS[g.current.rank] + SUITS[g.current.suit] : '';
    for (let i = 0; i < this.cellEls.length; i++) {
      const cell = this.cellEls[i];
      const inner = cell.firstChild;
      const v = g.cells[i];
      const open = g.inBounds(i);
      const sig = v ? `${v.kind}:${v.rank}:${v.suit}` : 'empty';
      if (sig !== this.cellSig[i]) { inner.innerHTML = cardHTML(v); this.cellSig[i] = sig; }
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
      if (!v && open) { inner.dataset.ghost = ghost; inner.classList.toggle('ghost-red', !!(g.current && g.current.red)); }
      else { delete inner.dataset.ghost; inner.classList.remove('ghost-red'); }
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
          `<div class="goal-name">${esc(goal.def.name)}</div>` +
          `<div class="goal-desc">${esc(goalDesc(goal.def, s))}</div>` +
          `<div class="goal-meta"><span class="pts">${goalPoints(goal.def, s)} pts</span><span class="timer-text"></span></div>` +
          `<div class="goal-bar"><div class="goal-bar-fill"></div></div>`;
        box.title = `${goal.def.name}: ${goalDetail(goal.def, s)} Tap for details.`;
      }
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
    pop.innerHTML =
      `<div class="goal-pop-head"><span class="goal-pop-name" style="color: var(--${side})">${SIDE_ARROW[side]} ${esc(goal.def.name)}</span>` +
      `<span class="goal-pop-meta">${goalPoints(goal.def, s)} pts · ${left}</span></div>` +
      `<div class="goal-pop-body">${esc(goalDetail(goal.def, s))}</div>` +
      `<ul class="goal-pop-notes">${goalNotes(goal.def, s).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` +
      `<div class="goal-pop-hint">tap anywhere to dismiss</div>`;
    pop.addEventListener('click', (e) => { e.stopPropagation(); this.hideGoalPopup(); });
    this.el.arena.appendChild(pop);
    this.goalPop = pop;
    this.goalPopTimer = setTimeout(() => this.hideGoalPopup(), 7000);
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
      this.el.current.innerHTML = cardHTML(g.current, 'bigcard');
    } else if (g.status === 'over') {
      this.el.current.innerHTML = '<div class="placeholder">Game over</div>';
    } else if (g.status === 'levelup') {
      this.el.current.innerHTML = '<div class="placeholder">Level complete</div>';
    } else {
      this.el.current.innerHTML = '<div class="placeholder">—</div>';
    }
    const peek = g.upcoming(s.peekCount);
    this.el.upcoming.innerHTML = s.peekCount ? peek.map((c) => cardHTML(c, 'smallcard')).join('') : '<span class="hint-text">hidden</span>';
    let hint = '';
    if (g.status === 'playing') {
      if (g.current) hint = 'Click an empty cell to place the card.';
      if (s.wardSpend === 'manual' && g.wards > 0 && g.curseCells().length) hint += ' Click a glowing curse to remove it.';
    }
    this.el.hintText.textContent = hint;
    this.el.btnBot.textContent = `Bot: ${this.bot ? 'on' : 'off'}`;
    this.el.btnBot.classList.toggle('on', this.bot);
    this.el.btnHints.textContent = `Hints: ${s.hints ? 'on' : 'off'}`;
    this.el.btnHints.classList.toggle('on', s.hints);
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
          const word = ev.n >= 2 ? `${MULTI_WORDS[Math.min(ev.n, 4)]} CLEAR! ` : '';
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
          this.toast(`${SIDE_LABEL[ev.side]} wall pushed back`, 'good');
          this.log(`${SIDE_LABEL[ev.side]} wall pushed back`, 'good');
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
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2300);
  }

  log(msg, kind = '') {
    const li = h('li', { class: kind, text: msg });
    this.el.log.prepend(li);
    while (this.el.log.children.length > 14) this.el.log.lastChild.remove();
  }

  ghost(idx, card, cls) {
    const [r, c] = this.game.rc(idx);
    const e = h('div', { class: `ghost ${cls}`, style: `--r:${r};--c:${c}` }, cardHTML(card));
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
    this.el.btnPause.textContent = this.paused ? 'Resume' : 'Pause';
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
  modalOpen() { return !this.el.settings.hidden || !this.el.help.hidden; }

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
    this.el.btnPause.textContent = 'Pause';
  }

  // ---------- help ----------
  openHelp() {
    const lines = this.rulesSummary(this.settings);
    this.el.helpBody.className = 'modal-body help-body';
    this.el.helpBody.innerHTML =
      `<p>Cards are drawn one at a time. Click an empty cell to place the drawn card. Each of the four walls shows a goal; complete one with the card you just placed and it clears: you score, earn a ward, and the wall draws a new goal. Let a goal's timer run out and that wall crashes inward, crushing whatever sits in its way. Curses in the deck land on random cells and block them until you spend a ward on them. The game ends when a card cannot be placed or the walls close in.</p>` +
      `<h3>Controls</h3><ul>` +
      `<li>Click or tap an empty cell to place the card; hover shows a preview.</li>` +
      `<li>Click a glowing curse to remove it with a ward.</li>` +
      `<li><kbd>←↑↓→</kbd> move a cursor, <kbd>Enter</kbd> or <kbd>Space</kbd> acts on it.</li>` +
      `<li><kbd>P</kbd> pause · <kbd>N</kbd> new game · <kbd>H</kbd> hints · <kbd>B</kbd> bot autoplay · <kbd>Esc</kbd> close / pause</li>` +
      `</ul>` +
      `<h3>Definitions</h3><ul>` +
      `<li><b>Chain</b>: ${this.settings.chainShape === 'group' ? 'any group of cards connected up/down/left/right, branching allowed.' : 'a snake of cards connected up/down/left/right. It may bend as often as it likes but may not branch (a plus shape is not a chain), and each card is used once.'} Diagonals never connect.</li>` +
      `<li><b>Straight line</b>: cards side by side in a single row or a single column, no bends.</li>` +
      `<li><b>Full row / column</b>: every open cell between the current walls holds a card. Curses count as gaps. The line needs at least ${this.settings.lineMinLen} open cell${this.settings.lineMinLen === 1 ? '' : 's'}, and it gets shorter (easier) as the walls close in.</li>` +
      `<li><b>Pips</b> (for sums): number cards count face value, J/Q/K count 10, aces count 1 (Blackjack also lets an ace be 11).</li>` +
      `<li><b>Ace</b> in straights: low (A-2-3) or high (Q-K-A), never both (K-A-2 does not count). Ace is 1 for Low Road, Odds and pip sums, and counts as high for High Road.</li>` +
      `<li>${this.settings.mustIncludePlaced ? 'The card you just placed must be part of the goal you complete.' : 'A goal clears after any placement if the board satisfies it.'} ${this.settings.clearedCardsRemoved ? 'Cleared cards leave the board.' : 'Cleared cards stay on the board.'}</li>` +
      `</ul>` +
      `<h3>Goal cards</h3><p class="help-p">Greyed goals are switched off in the current pool (Settings → Goal pool). Points are base values before combo and multi-clear bonuses.</p>` +
      this.goalListHTML(this.settings) +
      `<h3>Other cards</h3><dl class="goal-list"><dt>☠ Curse</dt><dd>Not a playing card. When drawn it lands on a random empty cell and blocks it: nothing can be placed there, chains cannot pass through it, and a row or column containing it cannot be completed. Remove it by spending a ward (earned by clearing goals) or let a wall crush it.</dd></dl>` +
      `<h3>Current rules</h3><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` +
      `<h3>Playtesting tips</h3><ul>` +
      `<li>Turn on <b>Hints</b> to see which cells would clear a goal; gold = one goal, red = two or more.</li>` +
      `<li>Turn on the <b>Bot</b> to watch a rule set play itself, or run the simulation in Settings for numbers.</li>` +
      `<li>Set a <b>seed</b> in Settings to replay the same deck with different rules.</li>` +
      `</ul>`;
    this.el.help.hidden = false;
  }

  goalListHTML(s) {
    let html = '';
    for (const cat of [...new Set(GOAL_DEFS.map((d) => d.cat))]) {
      html += `<h4>${esc(cat)}</h4><dl class="goal-list">`;
      for (const d of GOAL_DEFS.filter((x) => x.cat === cat)) {
        const on = goalEnabled(d, s) && !(s.chainShape === 'group' && d.shape === 'chain' && (typeof d.ordered === 'function' ? d.ordered(s) : !!d.ordered));
        html += `<dt class="${on ? '' : 'off'}">${esc(d.name)} <span class="pts">${goalPoints(d, s)} pts</span>${on ? '' : ' <span class="offtag">off</span>'}</dt><dd class="${on ? '' : 'off'}">${esc(goalDetail(d, s))}</dd>`;
      }
      html += '</dl>';
    }
    return html;
  }

  rulesSummary(s) {
    const t = s.clock === 'time';
    const lines = [];
    lines.push(`Grid ${s.gridW}×${s.gridH}. Deck: 52 cards + ${s.curseCount} curses (${s.curseSpread === 'even' ? 'evenly spaced' : 'randomly shuffled'}). Game over when fewer than ${s.minCells} cells remain between the walls.`);
    if (s.wallMode === 'goal') {
      const pen = { wall: 'that wall moves in one step', curse: 'a curse appears', both: 'that wall moves in and a curse appears', none: 'a new goal simply replaces it' }[s.expiredGoalPenalty];
      lines.push(`Each wall's goal lasts ${t ? s.goalSeconds + ' seconds' : s.goalTurns + ' placements'}; when it expires, ${pen}.`);
    } else if (s.wallMode === 'global') {
      lines.push(`Every ${t ? s.globalSeconds + ' seconds' : s.globalTurns + ' placements'} a wall moves in (${s.globalOrder === 'rotate' ? 'top, right, bottom, left in turn' : 'a random wall'}).`);
    } else lines.push('Walls never move.');
    if (s.wallMode !== 'off' && s.pressureRamp < 1) lines.push(`Timers shrink by ${Math.round((1 - s.pressureRamp) * 100)}% per ${t ? 'minute' : '20 placements'}, down to ${Math.round(s.pressureFloor * 100)}% of the base.`);
    lines.push(`Chains are ${s.chainShape === 'path' ? 'snake paths (bends allowed, no branching)' : 'any connected group'}. Straights are ${s.straightLen} cards${s.straightOrdered ? ' and must run in order' : ''}; flushes are ${s.flushLen} cards.`);
    lines.push(`${s.mustIncludePlaced ? 'The card you just placed must be part of the goal you complete.' : 'Any placement clears a goal the board already satisfies.'} ${s.clearedCardsRemoved ? 'Cleared cards leave the board.' : 'Cleared cards stay on the board.'}`);
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
  }

  buildGoalsFieldset() {
    const fs = h('fieldset');
    fs.appendChild(h('legend', { text: 'Goal pool' }));
    fs.appendChild(h('p', { class: 'help-p', text: 'The four walls draw from the enabled goals (no duplicates unless allowed above). Points are the base value for clearing that goal. Rows and columns must be completely filled between the walls.' }));
    const tools = h('div', { class: 'goal-tools' });
    const mk = (label, fn) => { const b = h('button', { type: 'button', text: label }); b.onclick = fn; tools.appendChild(b); };
    mk('All on', () => this.setGoals(() => true));
    mk('All off', () => this.setGoals(() => false));
    for (const cat of [...new Set(GOAL_DEFS.map((d) => d.cat))]) {
      mk(`Toggle ${cat.toLowerCase()}`, () => {
        const anyOff = GOAL_DEFS.some((d) => d.cat === cat && !this.draft.goalsEnabled[d.id]);
        this.setGoals((d) => (d.cat === cat ? anyOff : this.draft.goalsEnabled[d.id]));
      });
    }
    fs.appendChild(tools);
    const table = h('table', { class: 'goals' }, '<thead><tr><th>On</th><th>Goal</th><th>Requirement</th><th>Points</th></tr></thead>');
    const tb = h('tbody');
    let lastCat = null;
    for (const d of GOAL_DEFS) {
      if (d.cat !== lastCat) { lastCat = d.cat; tb.appendChild(h('tr', { class: 'cat' }, `<td colspan="4">${esc(d.cat)}</td>`)); }
      const tr = h('tr');
      const on = h('input', { type: 'checkbox' });
      const pts = h('input', { type: 'number', min: 0, step: 5, class: 'pts' });
      const desc = h('td', { class: 'desc' });
      on.onchange = () => { this.draft.goalsEnabled[d.id] = on.checked; };
      pts.onchange = () => { this.draft.goalPoints[d.id] = Math.max(0, Math.round(Number(pts.value) || 0)); pts.value = this.draft.goalPoints[d.id]; };
      const tdOn = h('td'); tdOn.appendChild(on);
      const tdPts = h('td'); tdPts.appendChild(pts);
      tr.append(tdOn, h('td', { class: 'name', text: d.name }), desc, tdPts);
      tb.appendChild(tr);
      this.goalInputs[d.id] = { on, pts, desc };
    }
    table.appendChild(tb);
    fs.appendChild(table);
    return fs;
  }

  setGoals(fn) {
    for (const d of GOAL_DEFS) this.draft.goalsEnabled[d.id] = !!fn(d);
    this.syncForm();
  }

  refreshGoalDescs() {
    for (const d of GOAL_DEFS) this.goalInputs[d.id].desc.textContent = goalDesc(d, this.draft);
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
