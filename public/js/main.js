import { UI } from './ui.js';

try {
  window.ui = new UI();
} catch (err) {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#ff6b6b;padding:16px;white-space:pre-wrap;font:13px ui-monospace,monospace';
  pre.textContent = 'Crash Curse failed to start:\n' + (err && err.stack || err);
  document.body.prepend(pre);
  throw err;
}
