import test from 'node:test';
import assert from 'node:assert/strict';
import { samplePlan } from './harness/sample-plan.js';
import { defaultPlan, normalizePlan } from '../public/js/fire/defaults.js';
import { roadmap, runPlan } from '../public/js/fire/engine.js';

const plan = normalizePlan({ ...defaultPlan({ today: '2026-11-04' }), ...samplePlan() }); plan.spending.retirement = { ...(plan.spending.retirement || {}), monthly: 450000 };   // a bigger retirement lifestyle, so there is a gap to close
test('roadmap: the amount it gives really closes the gap, and waiting costs more', () => {
  const R = roadmap(plan, { today: '2026-11-04' }); assert.ok(R.gap > 0 && R.rows.length >= 3);
  const ok = R.rows.filter((r) => r.extra != null);
  for (let i = 1; i < ok.length; i++) assert.ok(ok[i].extra > ok[i - 1].extra, 'later start needs more each month');
  for (const r of ok) {   // apply it: gap must be ~0
    const base = runPlan(plan, { today: '2026-11-04' }), st = R.st, k = r.k;
    const res = runPlan(plan, { today: '2026-11-04', overrides: { extraMonthly: r.extra / Math.pow(1 + st, k), extraStartYears: k } });
    assert.ok(Math.abs(res.gap.amount) < Math.max(5000, base.gap.amount * 0.002), `start +${k}y leaves gap ${res.gap.amount}`);
  }
});
