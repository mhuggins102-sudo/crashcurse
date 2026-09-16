// Headless playtest: node scripts/sim.js [games] [secPerMove] [preset] [key=value ...]
import { runSimulation } from '../public/js/bot.js';
import { defaultSettings, applyPreset, normalizeSettings, PRESETS } from '../public/js/settings.js';

const args = process.argv.slice(2);
const games = Number(args[0] || 20);
const secPerMove = Number(args[1] || 1.5);
const preset = args[2] || 'Default';
if (!PRESETS[preset]) { console.error(`Unknown preset "${preset}". Options: ${Object.keys(PRESETS).join(', ')}`); process.exit(1); }
let s = applyPreset(defaultSettings(), preset);
for (const kv of args.slice(3)) {
  const [k, v] = kv.split('=');
  if (k in s) s[k] = typeof s[k] === 'boolean' ? v === 'true' : typeof s[k] === 'number' ? Number(v) : v;
  else if (k.startsWith('goal:')) s.goalsEnabled[k.slice(5)] = v === 'true';
}
s = normalizeSettings(s);
const t0 = Date.now();
const r = runSimulation(s, { games, secPerMove, seed: 'cli' });
const f = (m) => `${m.mean.toFixed(1)} (med ${m.median.toFixed(1)}, ${m.min}–${m.max})`;
console.log(`Preset ${preset}: ${games} games, bot at ${secPerMove}s/move, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('  score        ', f(r.score));
console.log('  survived (s) ', f(r.elapsed));
console.log('  level        ', f(r.level));
console.log('  placements   ', f(r.placements));
console.log('  clears       ', f(r.clears));
console.log('  combos       ', f(r.combos));
console.log('  expired      ', f(r.goalsExpired));
console.log('  wall moves   ', f(r.wallMoves));
console.log('  curses drawn ', f(r.cursesDrawn), ' removed', f(r.cursesRemoved));
console.log('  game over    ', JSON.stringify(r.reasons));
console.log('  goal                offered cleared expired  rate');
for (const g of r.goals.sort((a, b) => b.rate - a.rate)) {
  console.log(`  ${g.name.padEnd(18)} ${String(g.offered).padStart(7)} ${String(g.cleared).padStart(7)} ${String(g.expired).padStart(7)}  ${(g.rate * 100).toFixed(0).padStart(3)}%`);
}
