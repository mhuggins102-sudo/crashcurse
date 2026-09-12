// Web Worker wrapper so long simulations don't freeze the page.
import { runSimulation } from './bot.js';

self.onmessage = (e) => {
  const { settings, games, secPerMove, seed } = e.data;
  try {
    const result = runSimulation(settings, {
      games, secPerMove, seed,
      onProgress: (done, total) => self.postMessage({ type: 'progress', done, total }),
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.stack || err) });
  }
};
