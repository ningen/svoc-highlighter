import { readStats } from './storage.ts';

function requiredElement<T extends Element>(selector: string, type: { new(): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing element: ${selector}`);
  return element;
}

const checkbox = requiredElement('#enabled', HTMLInputElement);
const confidence = requiredElement('#confidence', HTMLElement);
const processed = requiredElement('#processed', HTMLElement);
const diagnostics = requiredElement('#diagnostics', HTMLButtonElement);

void chrome.storage.local.get({ enabled: true, svocStats: {} }).then((stored) => {
  checkbox.checked = Boolean(stored.enabled);
  const stats = readStats(stored.svocStats);
  const average = stats.processed ? stats.totalConfidence / stats.processed : 0;
  confidence.textContent = average ? `${Math.round(average * 100)}%` : '—';
  processed.textContent = `${stats.processed} sentences processed`;
});

checkbox.addEventListener('change', async () => {
  const enabled = checkbox.checked;
  await chrome.storage.local.set({ enabled });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) void chrome.tabs.sendMessage(tab.id, { type: 'SVOC_SET_ENABLED', enabled }).catch(() => undefined);
});

diagnostics.addEventListener('click', () => void chrome.runtime.openOptionsPage());
