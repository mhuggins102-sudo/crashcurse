// Pure game engine: no DOM, fully deterministic given (settings, seed).
// The UI, the bot and the tests all drive this class.

import { makeRng, hashSeed, randomSeedString } from './rng.js';
import { makeCard, makeTile, makeNum, makeCurse, pieceKey } from './cards.js';
import { GOAL_DEFS, GOAL_BY_ID, SIDES, findSatisfying, goalPoints, goalEnabled, goalIsOrdered, goalFamilies, goalFeasible, goalDeck } from './goals.js';

export const OVER_REASONS = {
  nospace: 'No empty cell for the drawn card',
  crushed: 'The walls crushed the board',
  deck: 'The deck ran out',
  curse: 'A curse had nowhere to go',
  stuck: 'The board is stuck: nothing can be placed',
};

export class Game {
  constructor(settings, seedStr) {
    const s = (this.s = settings);
    this.seed = seedStr || s.seed || randomSeedString();
    this.rng = makeRng(hashSeed(this.seed));
    this.W = s.gridW;
    this.H = s.gridH;
    this.cells = new Array(this.W * this.H).fill(null);
    this.inset = { top: 0, right: 0, bottom: 0, left: 0 };
    this.nextId = 1;
    this.deck = [];
    this.discard = [];
    this.current = null;
    this.goals = { top: null, right: null, bottom: null, left: null };
    this.score = 0;
    this.scoreFrac = 0;
    this.combo = 0;
    this.wards = 0;
    this.level = 1;
    this.elapsed = 0;
    this.levelElapsed = 0;
    this.placements = 0;
    this.levelPlacements = 0;
    this.goalBase = this.clock === 'time' ? s.goalSeconds : s.goalTurns;
    this.curseCount = s.curseCount;
    this.levelLen = this.clock === 'time' ? s.levelSeconds : s.levelTurns;
    this.levelLeft = this.levelLen;
    this.globalLeft = this.globalInterval();
    this.rotateIdx = 0;
    this.placementLeft = 0;
    this.status = 'playing';
    this.overReason = '';
    this.lastPlaced = null;   // { idx, piece } of the most recent placement
    this.prevPlaced = null;   // the placement before that (for Echo / Encore)
    this.events = [];
    this.stats = {
      placements: 0, clears: 0, goalsOffered: {}, goalsCleared: {}, goalsExpired: 0, goalsExpiredBy: {},
      multiClears: {}, cursesDrawn: 0, cursesRemoved: 0, cursesCrushed: 0, cardsCrushed: 0,
      wallMoves: { top: 0, right: 0, bottom: 0, left: 0 }, wallRetreats: 0, maxCombo: 0,
      wardsEarned: 0, wardsSpent: 0, rerolls: 0, extends: 0, retreatsBought: 0, refreshes: 0, reshuffles: 0, levels: 1, discards: 0, autoplaced: 0, wallClears: 0, undos: 0,
    };
    this.buildDeck();
    this.goalDeck = [];
    this.buildGoalDeck();
    for (const side of SIDES) this.newGoal(side);
    this.draw();
  }

  get clock() { return this.s.clock; }

  // ---------- geometry ----------
  idx(r, c) { return r * this.W + c; }
  rc(i) { return [(i / this.W) | 0, i % this.W]; }
  rows() { return this.H - this.inset.top - this.inset.bottom; }
  cols() { return this.W - this.inset.left - this.inset.right; }
  inBounds(i) {
    const [r, c] = this.rc(i);
    return r >= this.inset.top && r < this.H - this.inset.bottom && c >= this.inset.left && c < this.W - this.inset.right;
  }
  openCells() { const out = []; for (let i = 0; i < this.cells.length; i++) if (this.inBounds(i)) out.push(i); return out; }
  emptyCells() { return this.openCells().filter((i) => this.cells[i] == null); }
  curseCells() { return this.openCells().filter((i) => this.cells[i] && this.cells[i].kind === 'curse'); }
  cardCells() { return this.openCells().filter((i) => this.cells[i] && this.cells[i].kind !== 'curse'); }
  legalCells() { return this.status === 'playing' && this.current ? this.emptyCells() : []; }
  cursesInDeck() { return this.deck.filter((c) => c.kind === 'curse').length; }
  upcoming(n) { const out = []; for (let i = this.deck.length - 1; i >= 0 && out.length < n; i--) out.push(this.deck[i]); return out; }

  emit(type, data) { this.events.push({ type, t: this.elapsed, ...data }); }
  drain() { const ev = this.events; this.events = []; return ev; }

  // ---------- deck ----------
  cardPieces() {
    const onBoard = new Set(this.cells.filter((c) => c && c.kind === 'card').map(pieceKey));
    const out = [];
    for (let rank = 1; rank <= 13; rank++) for (let suit = 0; suit < 4; suit++) {
      if (!onBoard.has(rank * 4 + suit)) out.push(makeCard(rank, suit, this.nextId++));
    }
    return out;
  }

  // Tiles: per color, a configurable number of blanks, dots, triangles and
  // stars. Tiles still on the board are left out of the rebuilt deck.
  tilePieces() {
    const s = this.s;
    const need = new Map();
    const spec = [[0, s.tileBlanks], [1, s.tileDots], [2, s.tileTriangles], [3, s.tileStars]];
    for (let color = 0; color < s.tileColors; color++) for (const [sym, n] of spec) need.set(color * 4 + sym, n);
    for (const c of this.cells) {
      if (!c || c.kind !== 'tile') continue;
      const k = pieceKey(c);
      if ((need.get(k) || 0) > 0) need.set(k, need.get(k) - 1);
    }
    const out = [];
    for (const [k, n] of need) for (let i = 0; i < n; i++) out.push(makeTile(k >> 2, k & 3, this.nextId++));
    return out;
  }

  // Numbered tiles: every color carries the numbers 1..numMax, numCopies times.
  numPieces() {
    const s = this.s;
    const need = new Map();
    for (let color = 0; color < s.numColors; color++) for (let n = 1; n <= s.numMax; n++) need.set(color * 16 + n, s.numCopies);
    for (const c of this.cells) {
      if (!c || c.kind !== 'num') continue;
      const k = pieceKey(c);
      if ((need.get(k) || 0) > 0) need.set(k, need.get(k) - 1);
    }
    const out = [];
    for (const [k, n] of need) for (let i = 0; i < n; i++) out.push(makeNum(k >> 4, k & 15, this.nextId++));
    return out;
  }

  buildDeck() {
    const t = this.s.deckType;
    const cards = t === 'tiles' ? this.tilePieces() : t === 'num' ? this.numPieces() : this.cardPieces();
    this.rng.shuffle(cards);
    const nCurse = Math.max(0, Math.min(this.curseCount, 60));
    if (this.s.curseSpread === 'even' && nCurse > 0 && cards.length > 0) {
      const order = cards.slice().reverse(); // top of deck first
      const L = order.length / nCurse;
      const positions = [];
      for (let i = 0; i < nCurse; i++) positions.push(Math.min(order.length, Math.floor(i * L + this.rng() * L)));
      positions.sort((a, b) => b - a);
      for (const p of positions) order.splice(p, 0, makeCurse(this.nextId++));
      this.deck = order.reverse();
    } else {
      for (let i = 0; i < nCurse; i++) cards.push(makeCurse(this.nextId++));
      this.deck = this.rng.shuffle(cards);
    }
  }

  hasLegalMove() {
    if (this.emptyCells().length > 0) return true;
    const s = this.s;
    if (s.wardSpend !== 'manual') return false;
    if (s.wardCostCurse > 0 && this.wards >= s.wardCostCurse && this.curseCells().length > 0) return true;
    if (s.wardCostRetreat > 0 && this.wards >= s.wardCostRetreat && SIDES.some((side) => this.inset[side] > 0)) return true;
    return false;
  }

  draw() {
    let guard = 0;
    while (this.status === 'playing') {
      if (++guard > 400) { this.gameOver('stuck'); return; }
      if (!this.deck.length) {
        if (this.s.reshuffleDiscards && this.discard.length) {
          this.deck = this.rng.shuffle(this.discard);
          this.discard = [];
          this.stats.reshuffles++;
          this.emit('reshuffle', { count: this.deck.length });
        } else { this.gameOver('deck'); return; }
      }
      const card = this.deck.pop();
      if (card.kind === 'curse') { this.placeCurse(card, { fromDeck: true }); continue; }
      if (!this.hasLegalMove()) {
        if (this.s.noLegalPlacement === 'discard') {
          this.discard.push(card); this.stats.discards++;
          this.emit('discard', { card, reason: 'nospace' });
          continue;
        }
        this.gameOver('nospace');
        return;
      }
      this.current = card;
      this.placementLeft = this.s.placementSeconds || 0;
      this.emit('draw', { card });
      return;
    }
  }

  placeCurse(curse, { fromDeck = false } = {}) {
    if (fromDeck) this.stats.cursesDrawn++;
    const empties = this.emptyCells();
    if (!empties.length) {
      if (fromDeck && this.s.curseOnNoSpace === 'gameover') { this.gameOver('curse'); return false; }
      if (this.s.cursesReturn) this.discard.push(curse);
      this.emit('curseNoSpace', {});
      return false;
    }
    const i = this.rng.pick(empties);
    this.cells[i] = curse;
    this.emit('curse', { idx: i, fromDeck });
    return true;
  }

  // ---------- turns ----------
  canPlace(i) {
    return this.status === 'playing' && !!this.current && i >= 0 && i < this.cells.length && this.inBounds(i) && this.cells[i] == null;
  }

  evaluate(i) {
    const out = [];
    for (const side of SIDES) {
      const g = this.goals[side];
      if (!g) continue;
      const found = findSatisfying(this, this.s, g.def, i);
      if (found) out.push({ side, goal: g, cells: found });
    }
    return out;
  }

  // Non-mutating: which goals would clear if the current card went on cell i.
  preview(i) {
    if (!this.canPlace(i)) return null;
    this.cells[i] = this.current;
    const res = this.evaluate(i);
    this.cells[i] = null;
    return res;
  }

  place(i) {
    if (!this.canPlace(i)) return false;
    const card = this.current;
    this.current = null;
    this.placementLeft = 0;
    this.cells[i] = card;
    this.placements++;
    this.levelPlacements++;
    this.stats.placements++;
    this.prevPlaced = this.lastPlaced;
    this.lastPlaced = { idx: i, piece: card };
    this.emit('place', { idx: i, card });
    const cleared = this.evaluate(i);
    const clearedSides = this.resolveClears(cleared, i);
    if (this.status !== 'playing') return true;
    this.afterTurn(clearedSides);
    if (this.status !== 'playing') return true;
    this.draw();
    return true;
  }

  resolveClears(cleared, placedIdx, { viaWall = false } = {}) {
    const s = this.s;
    if (!cleared.length) {
      if (s.comboEnabled && !viaWall) this.combo = 0;
      return [];
    }
    const n = cleared.length;
    const base = cleared.reduce((a, c) => a + goalPoints(c.goal.def, s), 0);
    const multi = n >= 2 ? Math.pow(s.multiMult, n - 1) : 1;
    const comboMult = s.comboEnabled && !viaWall ? 1 + this.combo * s.comboBonus : 1;
    const pts = Math.round(base * multi * comboMult);
    const comboBefore = this.combo;
    this.score += pts;
    if (!viaWall) {
      this.combo += 1;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    } else this.stats.wallClears += n;
    this.stats.clears += n;
    for (const c of cleared) this.stats.goalsCleared[c.goal.def.id] = (this.stats.goalsCleared[c.goal.def.id] || 0) + 1;
    if (n >= 2) this.stats.multiClears[n] = (this.stats.multiClears[n] || 0) + 1;

    const removed = [];
    const set = new Set();
    for (const c of cleared) for (const i of c.cells) set.add(i);
    for (const i of set) {
      const card = this.cells[i];
      if (!card) continue;
      if (card.kind === 'curse') {
        // A goal that names a curse (Exorcist) lifts it, whatever the removal setting.
        if (s.cursesReturn) this.discard.push(card);
        this.stats.cursesRemoved++;
        this.cells[i] = null;
        removed.push({ idx: i, card });
      } else if (s.clearedCardsRemoved) {
        this.discard.push(card);
        this.cells[i] = null;
        removed.push({ idx: i, card });
      }
    }

    let wardsGained = n * s.wardsPerClear;
    const perks = [];
    if (n >= 2) {
      if (s.perkExtraWard) { wardsGained += 1; perks.push('+1 extra ward'); }
      if (s.perkClearAllCurses) { const k = this.removeAllCurses(); if (k) perks.push(`${k} curse${k > 1 ? 's' : ''} purged from the board`); }
      if (s.perkPushAllWalls) { let k = 0; for (const side of SIDES) if (this.retreatWall(side)) k++; if (k) perks.push('walls pushed back'); }
      if (s.perkPurgeDeckCurses > 0) { const k = this.purgeDeckCurses(s.perkPurgeDeckCurses); if (k) perks.push(`${k} curse${k > 1 ? 's' : ''} removed from the deck`); }
      if (s.perkExtraSeconds > 0 && this.clock === 'time') {
        for (const side of SIDES) if (this.goals[side]) this.goals[side].timeLeft += s.perkExtraSeconds;
        perks.push(`+${s.perkExtraSeconds}s on every goal`);
      }
    }
    this.wards += wardsGained;
    this.stats.wardsEarned += wardsGained;
    if (s.clearPushesWallBack) for (const c of cleared) this.retreatWall(c.side);

    const clearedSides = cleared.map((c) => c.side);
    this.emit('clear', {
      clears: cleared.map((c) => ({ side: c.side, id: c.goal.def.id, name: c.goal.def.name, cells: c.cells, points: goalPoints(c.goal.def, s) })),
      points: pts, n, multi, comboMult, combo: comboBefore, removed, wardsGained, perks, placedIdx, source: viaWall ? 'wall' : 'place',
    });
    for (const side of clearedSides) this.newGoal(side);
    if (s.wardSpend === 'auto') this.autoSpendWards();
    return clearedSides;
  }

  afterTurn(clearedSides) {
    const s = this.s;
    if (this.clock !== 'turns') return;
    if (s.wallMode === 'goal') {
      const before = SIDES.map((side) => (this.goals[side] ? this.goals[side].id : null));
      for (let i = 0; i < SIDES.length; i++) {
        const side = SIDES[i];
        if (clearedSides.includes(side)) continue;
        const g = this.goals[side];
        if (!g || g.id !== before[i]) continue; // fresh goals (from a crush clear) start with a full timer
        g.timeLeft -= 1;
        if (g.timeLeft <= 0) { this.expireGoal(side); if (this.status !== 'playing') return; }
      }
    } else if (s.wallMode === 'global') {
      this.globalLeft -= 1;
      if (this.globalLeft <= 0) { this.globalAdvance(); if (this.status !== 'playing') return; this.globalLeft = this.globalInterval(); }
    }
    if (s.mode === 'survival') {
      this.levelLeft -= 1;
      if (this.levelLeft <= 0) this.levelUp();
    }
  }

  // After a wall moves in, goals the board already satisfies clear even though
  // nothing was just placed (a shorter row may now be complete, for instance).
  crushCheck() {
    const s = this.s;
    if (s.crushCheck === 'off' || this.status !== 'playing') return;
    const loose = { ...s, mustIncludePlaced: false };
    const cleared = [];
    for (const side of SIDES) {
      const g = this.goals[side];
      if (!g) continue;
      if (s.crushCheck === 'lines' && !(g.def.shape === 'row' || g.def.shape === 'col' || g.def.shape === 'rowcol')) continue;
      const found = findSatisfying(this, loose, g.def, null);
      if (found) cleared.push({ side, goal: g, cells: found });
    }
    if (cleared.length) this.resolveClears(cleared, null, { viaWall: true });
  }

  tick(dt) {
    const s = this.s;
    if (this.status !== 'playing' || !(dt > 0)) return;
    this.elapsed += dt;
    this.levelElapsed += dt;
    if (s.survivalPointsPerSec > 0) {
      this.scoreFrac += s.survivalPointsPerSec * dt;
      const whole = Math.floor(this.scoreFrac);
      if (whole > 0) { this.score += whole; this.scoreFrac -= whole; }
    }
    if (this.clock !== 'time') return;
    if (s.wallMode === 'goal') {
      for (const side of SIDES) {
        const g = this.goals[side];
        if (!g) continue;
        g.timeLeft -= dt;
        if (g.timeLeft <= 0) { this.expireGoal(side); if (this.status !== 'playing') return; }
      }
    } else if (s.wallMode === 'global') {
      this.globalLeft -= dt;
      if (this.globalLeft <= 0) { this.globalAdvance(); if (this.status !== 'playing') return; this.globalLeft += this.globalInterval(); }
    }
    if (s.placementSeconds > 0 && this.current) {
      this.placementLeft -= dt;
      if (this.placementLeft <= 0) { this.placementTimeout(); if (this.status !== 'playing') return; }
    }
    if (s.mode === 'survival') {
      this.levelLeft -= dt;
      if (this.levelLeft <= 0) this.levelUp();
    }
    this.ensurePlayable();
  }

  // A timer-driven wall move or spawned curse can leave the held card with
  // nowhere to go; resolve that the same way a stuck draw is resolved.
  ensurePlayable() {
    if (this.status !== 'playing' || !this.current || this.hasLegalMove()) return;
    if (this.s.noLegalPlacement === 'discard') {
      const card = this.current;
      this.current = null;
      this.discard.push(card);
      this.stats.discards++;
      this.emit('discard', { card, reason: 'nospace' });
      this.draw();
      return;
    }
    this.gameOver('nospace');
  }

  placementTimeout() {
    const card = this.current;
    if (!card) return;
    const empties = this.emptyCells();
    if (this.s.placementTimeout === 'random' && empties.length) {
      const i = this.rng.pick(empties);
      this.stats.autoplaced++;
      this.emit('autoplace', { idx: i, card });
      this.place(i);
      return;
    }
    this.current = null;
    this.discard.push(card);
    this.stats.discards++;
    this.emit('discard', { card, reason: 'timeout' });
    this.draw();
  }

  // ---------- goals ----------
  pressureMult() {
    const s = this.s;
    const units = this.clock === 'time' ? this.levelElapsed / 60 : this.levelPlacements / 20;
    return Math.max(s.pressureFloor, Math.pow(s.pressureRamp, units));
  }

  goalDuration() {
    const d = this.goalBase * this.pressureMult();
    return this.clock === 'time' ? Math.max(3, d) : Math.max(1, Math.round(d));
  }

  globalInterval() {
    const base = this.clock === 'time' ? this.s.globalSeconds : this.s.globalTurns;
    const d = base * this.pressureMult();
    return this.clock === 'time' ? Math.max(2, d) : Math.max(1, Math.round(d));
  }

  goalPool() {
    const s = this.s;
    const deck = s.deckType || 'cards';
    return GOAL_DEFS.filter((d) => goalDeck(d) === deck && goalEnabled(d, s)
      && !(s.chainShape === 'group' && d.shape === 'chain' && goalIsOrdered(d, s))
      && goalFeasible(d, s, this));
  }

  // After the walls move, a goal that can no longer fit is replaced for free.
  swapInfeasibleGoals() {
    for (const side of SIDES) {
      const g = this.goals[side];
      if (!g || goalFeasible(g.def, this.s, this)) continue;
      this.newGoal(side, { exclude: g.def.id, keepTime: g.timeLeft, allowOverflow: true });
      this.emit('goalSwap', { side, from: g.def.name, to: this.goals[side] ? this.goals[side].def.name : null });
    }
  }

  // Every enabled goal (whether or not it currently fits) in a shuffled order.
  goalPoolAll() {
    const s = this.s;
    const deck = s.deckType || 'cards';
    return GOAL_DEFS.filter((d) => goalDeck(d) === deck && goalEnabled(d, s)
      && !(s.chainShape === 'group' && d.shape === 'chain' && goalIsOrdered(d, s)));
  }

  // A fresh shuffled cycle. With keepLeft, cards still waiting in the current
  // cycle (skipped because they do not fit the board right now) stay in front
  // of the new cycle instead of being thrown away.
  buildGoalDeck(keepLeft = false) {
    const left = keepLeft ? this.goalDeck.filter((id) => GOAL_BY_ID[id] && !GOAL_BY_ID[id].repeatable) : [];
    const have = new Set(left);
    this.goalDeck = left.concat(this.rng.shuffle(this.goalPoolAll().map((d) => d.id).filter((id) => !have.has(id))));
  }

  // First eligible card of the goal deck. Non-repeatable goals leave the deck
  // when drawn. Repeatable ones (Fill a Row / Column) are only offered once they
  // have come around to the front, and then go back in a good way down, so they
  // return now and then without ever taking over. When no non-repeatable goal in
  // the deck can be offered at all, the next cycle starts.
  drawFromGoalDeck(ok) {
    const LOOK = 6, BACK = 20;
    const live = (id) => { const d = GOAL_BY_ID[id]; return !!d && !d.repeatable && ok(d, false); };
    if (!this.goalDeck.some(live)) this.buildGoalDeck(true);
    for (const strict of [true, false]) {
      for (let i = 0; i < this.goalDeck.length; i++) {
        const d = GOAL_BY_ID[this.goalDeck[i]];
        if (!d || (d.repeatable && i >= LOOK) || !ok(d, strict)) continue;
        this.goalDeck.splice(i, 1);
        // A used repeatable goes back in at least BACK cards deep; near the end of
        // a cycle it sits out until the next shuffle instead, so the last few
        // cards can never turn into Fill a Row / Fill a Column forever.
        if (d.repeatable && this.goalDeck.length >= BACK) {
          this.goalDeck.splice(BACK + this.rng.int(this.goalDeck.length - BACK + 1), 0, d.id);
        }
        return d;
      }
    }
    return null;
  }

  newGoal(side, { exclude = null, keepTime = null, allowOverflow = false } = {}) {
    const s = this.s;
    // Never hand a wall the very goal it just had.
    if (exclude == null && this.goals[side]) exclude = this.goals[side].def.id;
    const others = SIDES.filter((x) => x !== side).map((x) => this.goals[x]).filter(Boolean);
    const activeIds = others.map((g) => g.def.id);
    const activeFamilies = new Set(others.flatMap((g) => goalFamilies(g.def)));
    let def = null;
    if (s.goalCycle) {
      const ok = (d, strict) => d.id !== exclude && goalFeasible(d, s, this)
        && (s.allowDuplicateGoals || !activeIds.includes(d.id))
        && (!strict || !s.avoidSimilarGoals || !goalFamilies(d).some((f) => activeFamilies.has(f)));
      def = this.drawFromGoalDeck(ok);
    }
    if (!def) {
      const pool = this.goalPool().filter((d) => d.id !== exclude);
      let candidates = s.allowDuplicateGoals ? pool : pool.filter((d) => !activeIds.includes(d.id));
      if (s.avoidSimilarGoals) {
        const distinct = candidates.filter((d) => !goalFamilies(d).some((f) => activeFamilies.has(f)));
        if (distinct.length) {
          // Draw a family first, then a goal inside it, so goals in small
          // families are not offered far more often than goals in big ones.
          const fams = [...new Set(distinct.flatMap((d) => goalFamilies(d)))];
          const fam = this.rng.pick(fams);
          candidates = distinct.filter((d) => goalFamilies(d).includes(fam));
        }
      }
      if (!candidates.length) candidates = pool;
      if (!candidates.length) candidates = this.goalPool();
      if (!candidates.length) { this.goals[side] = null; this.emit('goal', { side, id: null }); return; }
      def = this.rng.pick(candidates);
    }
    let duration = this.goalDuration();
    let timeLeft = duration;
    if (keepTime != null) {
      timeLeft = Math.max(1, allowOverflow ? keepTime : Math.min(keepTime, duration));
      duration = Math.max(duration, timeLeft);
    }
    this.goals[side] = { def, side, duration, timeLeft, id: this.nextId++ };
    this.stats.goalsOffered[def.id] = (this.stats.goalsOffered[def.id] || 0) + 1;
    this.emit('goal', { side, id: def.id, name: def.name, duration });
  }

  expireGoal(side) {
    const s = this.s;
    const g = this.goals[side];
    this.stats.goalsExpired++;
    if (g) this.stats.goalsExpiredBy[g.def.id] = (this.stats.goalsExpiredBy[g.def.id] || 0) + 1;
    if (s.expirePenaltyPoints > 0) this.score = Math.max(0, this.score - s.expirePenaltyPoints);
    this.emit('expire', { side, id: g ? g.def.id : null, name: g ? g.def.name : '' });
    const pen = s.expiredGoalPenalty;
    if (pen === 'wall' || pen === 'both') { this.advanceWall(side, 'expire'); if (this.status !== 'playing') return; }
    if (pen === 'curse' || pen === 'both') this.placeCurse(makeCurse(this.nextId++), { fromDeck: false });
    this.newGoal(side);
  }

  // ---------- walls ----------
  globalAdvance() {
    const side = this.s.globalOrder === 'random' ? this.rng.pick(SIDES) : SIDES[this.rotateIdx++ % SIDES.length];
    this.advanceWall(side, 'global');
  }

  advanceWall(side, reason) {
    const { top, right, bottom, left } = this.inset;
    const line = [];
    if (this.rows() > 0 && this.cols() > 0) {
      if (side === 'top') for (let c = left; c < this.W - right; c++) line.push(this.idx(top, c));
      if (side === 'bottom') for (let c = left; c < this.W - right; c++) line.push(this.idx(this.H - 1 - bottom, c));
      if (side === 'left') for (let r = top; r < this.H - bottom; r++) line.push(this.idx(r, left));
      if (side === 'right') for (let r = top; r < this.H - bottom; r++) line.push(this.idx(r, this.W - 1 - right));
    }
    const crushed = [];
    const relocate = [];
    for (const i of line) {
      const c = this.cells[i];
      if (!c) continue;
      if (c.kind !== 'curse') {
        this.discard.push(c);
        this.stats.cardsCrushed++;
        if (this.s.crushPenalty > 0) this.score = Math.max(0, this.score - this.s.crushPenalty);
      } else {
        this.stats.cursesCrushed++;
        if (this.s.crushedCurses === 'relocate') relocate.push(c);
        else if (this.s.cursesReturn) this.discard.push(c);
      }
      crushed.push({ idx: i, card: c });
      this.cells[i] = null;
    }
    this.inset[side]++;
    this.stats.wallMoves[side]++;
    this.emit('wall', { side, reason, crushed });
    for (const c of relocate) this.placeCurse(c, { fromDeck: false });
    const rows = this.rows(), cols = this.cols();
    if (rows <= 0 || cols <= 0 || rows * cols < this.s.minCells) { this.gameOver('crushed'); return; }
    this.swapInfeasibleGoals();
    this.crushCheck();
  }

  retreatWall(side, reason = 'perk') {
    if (this.inset[side] <= 0) return false;
    this.inset[side]--;
    this.stats.wallRetreats++;
    this.emit('retreat', { side, reason });
    return true;
  }

  // ---------- curses & wards ----------
  removeCurseAt(i, how) {
    const c = this.cells[i];
    if (!c || c.kind !== 'curse') return false;
    this.cells[i] = null;
    if (this.s.cursesReturn) this.discard.push(c);
    this.stats.cursesRemoved++;
    this.emit('curseRemoved', { idx: i, how });
    return true;
  }

  canAffordWard(kind) {
    const s = this.s;
    const cost = { curse: s.wardCostCurse, reroll: s.wardCostReroll, retreat: s.wardCostRetreat, extend: s.wardCostExtend, refresh: s.wardCostRefresh }[kind] || 0;
    return this.status === 'playing' && s.wardSpend === 'manual' && cost > 0 && this.wards >= cost ? cost : 0;
  }

  // Ward use 1: remove a curse from the board.
  spendWard(i) {
    const cost = this.canAffordWard('curse');
    if (!cost) return false;
    if (!this.inBounds(i) || !this.cells[i] || this.cells[i].kind !== 'curse') return false;
    this.wards -= cost;
    this.stats.wardsSpent += cost;
    this.removeCurseAt(i, 'ward');
    return true;
  }

  // Ward use 2: replace a wall's goal with a different one.
  wardReroll(side) {
    const cost = this.canAffordWard('reroll');
    const g = this.goals[side];
    if (!cost || !g) return false;
    if (this.goalPool().filter((d) => d.id !== g.def.id).length === 0) return false;
    this.wards -= cost;
    this.stats.wardsSpent += cost;
    this.stats.rerolls++;
    const mode = this.s.rerollTimer;
    const keepTime = mode === 'keep' ? g.timeLeft : mode === 'add' ? g.timeLeft + this.s.rerollBonus : null;
    this.newGoal(side, { exclude: g.def.id, keepTime, allowOverflow: mode === 'add' });
    this.emit('reroll', { side, from: g.def.name, to: this.goals[side] ? this.goals[side].def.name : null });
    return true;
  }

  // Ward use 3: add time to the current goal on a wall.
  wardExtend(side) {
    const cost = this.canAffordWard('extend');
    const g = this.goals[side];
    if (!cost || !g) return false;
    this.wards -= cost;
    this.stats.wardsSpent += cost;
    this.stats.extends++;
    g.timeLeft += this.s.extendBonus;
    g.duration = Math.max(g.duration, g.timeLeft);
    this.emit('extend', { side, name: g.def.name, bonus: this.s.extendBonus });
    return true;
  }

  // Ward use 4: skip the upcoming tiles (the ones shown as "next"); they go to the discard pile.
  wardRefresh() {
    const cost = this.canAffordWard('refresh');
    if (!cost || this.deck.length === 0) return false;
    const n = Math.max(1, this.s.peekCount || 0);
    const skipped = [];
    for (let k = 0; k < n && this.deck.length; k++) {
      const c = this.deck.pop();
      skipped.push(c);
      if (c.kind !== 'curse' || this.s.cursesReturn) this.discard.push(c);
    }
    this.wards -= cost;
    this.stats.wardsSpent += cost;
    this.stats.refreshes++;
    this.emit('refresh', { count: skipped.length, cards: skipped });
    return true;
  }

  // Ward use 5: push a wall back out one step.
  wardRetreat(side) {
    const cost = this.canAffordWard('retreat');
    if (!cost || this.inset[side] <= 0) return false;
    this.wards -= cost;
    this.stats.wardsSpent += cost;
    this.stats.retreatsBought++;
    this.retreatWall(side, 'ward');
    return true;
  }

  autoSpendWards() {
    const cost = Math.max(1, this.s.wardCostCurse);
    while (this.wards >= cost) {
      const curses = this.curseCells();
      if (!curses.length) return;
      this.wards -= cost;
      this.stats.wardsSpent += cost;
      this.removeCurseAt(this.rng.pick(curses), 'auto');
    }
  }

  removeAllCurses() {
    let k = 0;
    for (const i of this.curseCells()) if (this.removeCurseAt(i, 'perk')) k++;
    return k;
  }

  purgeDeckCurses(n) {
    let k = 0;
    for (let i = this.deck.length - 1; i >= 0 && k < n; i--) {
      if (this.deck[i].kind === 'curse') { this.deck.splice(i, 1); k++; }
    }
    for (let i = this.discard.length - 1; i >= 0 && k < n; i--) {
      if (this.discard[i].kind === 'curse') { this.discard.splice(i, 1); k++; }
    }
    if (k) this.emit('purge', { count: k });
    return k;
  }

  // ---------- levels & end ----------
  levelUp() {
    const s = this.s;
    const bonus = s.levelBonus * this.level;
    this.score += bonus;
    this.level++;
    this.stats.levels = this.level;
    this.levelLen += this.clock === 'time' ? s.levelSecondsGrowth : s.levelTurnsGrowth;
    this.levelLeft = this.levelLen;
    this.levelElapsed = 0;
    this.levelPlacements = 0;
    this.curseCount += s.levelCurseGrowth;
    this.goalBase = this.clock === 'time' ? Math.max(3, this.goalBase * s.levelPressureGrowth) : Math.max(1, Math.round(this.goalBase * s.levelPressureGrowth));
    if (s.levelResetWalls) this.inset = { top: 0, right: 0, bottom: 0, left: 0 };
    if (s.levelBoard === 'clear') this.cells.fill(null);
    else if (s.levelBoard === 'clearCurses') for (let i = 0; i < this.cells.length; i++) if (this.cells[i] && this.cells[i].kind === 'curse') this.cells[i] = null;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] && !this.inBounds(i)) this.cells[i] = null;
    this.discard = [];
    this.current = null;
    this.buildDeck();
    for (const side of SIDES) this.newGoal(side);
    this.globalLeft = this.globalInterval();
    this.status = 'levelup';
    this.emit('levelup', { level: this.level, bonus, curseCount: this.curseCount, goalBase: this.goalBase, levelLen: this.levelLen });
  }

  continueLevel() {
    if (this.status !== 'levelup') return;
    this.status = 'playing';
    this.draw();
  }

  // ---------- undo support ----------
  snapshot() {
    const goals = {};
    for (const side of SIDES) {
      const g = this.goals[side];
      goals[side] = g ? { defId: g.def.id, side: g.side, duration: g.duration, timeLeft: g.timeLeft, id: g.id } : null;
    }
    return {
      cells: this.cells.slice(), inset: { ...this.inset }, deck: this.deck.slice(), discard: this.discard.slice(),
      current: this.current, goals, score: this.score, scoreFrac: this.scoreFrac, combo: this.combo, wards: this.wards,
      level: this.level, elapsed: this.elapsed, levelElapsed: this.levelElapsed, placements: this.placements,
      levelPlacements: this.levelPlacements, goalBase: this.goalBase, curseCount: this.curseCount, levelLen: this.levelLen,
      levelLeft: this.levelLeft, globalLeft: this.globalLeft, rotateIdx: this.rotateIdx, placementLeft: this.placementLeft,
      status: this.status, overReason: this.overReason, nextId: this.nextId, lastPlaced: this.lastPlaced, prevPlaced: this.prevPlaced,
      goalDeck: this.goalDeck.slice(),
      stats: JSON.parse(JSON.stringify(this.stats)), rng: this.rng.state(),
    };
  }

  restore(snap) {
    this.cells = snap.cells.slice(); this.inset = { ...snap.inset }; this.deck = snap.deck.slice(); this.discard = snap.discard.slice();
    this.current = snap.current;
    for (const side of SIDES) {
      const g = snap.goals[side];
      this.goals[side] = g ? { def: GOAL_BY_ID[g.defId], side: g.side, duration: g.duration, timeLeft: g.timeLeft, id: g.id } : null;
    }
    this.score = snap.score; this.scoreFrac = snap.scoreFrac; this.combo = snap.combo; this.wards = snap.wards;
    this.level = snap.level; this.elapsed = snap.elapsed; this.levelElapsed = snap.levelElapsed; this.placements = snap.placements;
    this.levelPlacements = snap.levelPlacements; this.goalBase = snap.goalBase; this.curseCount = snap.curseCount; this.levelLen = snap.levelLen;
    this.levelLeft = snap.levelLeft; this.globalLeft = snap.globalLeft; this.rotateIdx = snap.rotateIdx; this.placementLeft = snap.placementLeft;
    this.status = snap.status; this.overReason = snap.overReason; this.nextId = snap.nextId; this.lastPlaced = snap.lastPlaced; this.prevPlaced = snap.prevPlaced;
    this.stats = JSON.parse(JSON.stringify(snap.stats));
    this.goalDeck = (snap.goalDeck || []).slice();
    this.rng.setState(snap.rng);
    this.events = [];
  }

  gameOver(reason) {
    if (this.status === 'over') return;
    this.status = 'over';
    this.overReason = reason;
    this.stats.timeSurvived = this.elapsed;
    this.emit('over', { reason, text: OVER_REASONS[reason] || reason });
  }
}
