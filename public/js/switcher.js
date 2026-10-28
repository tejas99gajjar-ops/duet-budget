// One section switcher for the whole app: Budget | FIRE. Shown on every top-level screen of both sections so moving between them always works the same way.
// Each side remembers where you were, so switching back lands on the same screen.
import { h } from './core.js';

const K = 'duet.last.';
const remember = (section, hash) => { try { sessionStorage.setItem(K + section, hash); } catch { /* private mode */ } };
const recall = (section, fallback) => { try { return sessionStorage.getItem(K + section) || fallback; } catch { return fallback; } };

export function renderSwitcher(el, section, hash) {
  if (!el) return;
  if (!section) { el.hidden = true; el.innerHTML = ''; return; }
  remember(section, hash);
  const budget = section === 'budget' ? '#/dashboard' : recall('budget', '#/dashboard'), fire = section === 'fire' ? '#/fire' : recall('fire', '#/fire');
  el.hidden = false; el.dataset.sec = section;
  el.innerHTML = h`<div class="appsw-in"><div class="appsw-seg" role="tablist" aria-label="App section"><a role="tab" href="${budget}" class="${section === 'budget' ? 'on' : ''}" aria-selected="${section === 'budget'}">💰 Budget</a><a role="tab" href="${fire}" class="${section === 'fire' ? 'on' : ''}" aria-selected="${section === 'fire'}">🔥 FIRE planner</a></div>${section === 'fire' ? h`<a class="appsw-help" href="#/fire/learn" aria-label="Guide and glossary">? <span>Guide</span></a>` : ''}</div>`.s;
}
