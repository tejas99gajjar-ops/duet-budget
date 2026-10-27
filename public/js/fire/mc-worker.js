// Runs Monte Carlo off the main thread so the screen stays smooth. Messages: {id, kind:'run'|'byAge', plan, opts, mc}
import { buildModel } from './engine.js';
import { runMonteCarlo, successByAge } from './mc.js';

self.onmessage = (e) => {
  const { id, kind, plan, opts, mc, from, to } = e.data;
  try {
    if (kind === 'run') {
      const res = runMonteCarlo(buildModel(plan, opts), mc, (done, total) => self.postMessage({ id, type: 'progress', done, total }));
      self.postMessage({ id, type: 'done', result: res });
    } else if (kind === 'byAge') {
      const res = successByAge(plan, opts, mc, from, to, (done, total) => self.postMessage({ id, type: 'progress', done, total }));
      self.postMessage({ id, type: 'done', result: res });
    }
  } catch (err) { self.postMessage({ id, type: 'error', message: String(err?.message || err) }); }
};
