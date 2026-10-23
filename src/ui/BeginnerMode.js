const STORAGE_KEY = 'pocket-field.beginner.v1';
let enabled = true;
let control = null;

export const isBeginnerMode = () => enabled;

function updateView() {
  document.documentElement.classList.toggle('beginner-mode', enabled);
  if (control) control.checked = enabled;
}

export function setBeginnerMode(value) {
  enabled = Boolean(value);
  updateView();
  try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* Help still works when saving is unavailable. */ }
  document.dispatchEvent(new Event('beginner-mode-change'));
}

export function initializeBeginnerMode() {
  try { enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { enabled = true; }
  control = document.querySelector('#beginner-mode');
  updateView();
  control?.addEventListener('change', () => setBeginnerMode(control.checked));
}
