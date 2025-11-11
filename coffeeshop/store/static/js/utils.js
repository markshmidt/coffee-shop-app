export const isPOS = () => document.body?.dataset?.page === 'pos';

export const centsToLabel = (c = 0) => '$' + ((+c || 0) / 100).toFixed(2);

export const to_int = (v, d = 0) => Number.parseInt(v, 10) || d;

export function debounce(fn, ms = 250) {
//delays a function until the user stops triggering it
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
}
}

export function showToast(message, { type = 'info', duration = 3000 } = {}) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  t.addEventListener('click', () => t.remove());
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, duration);
}

export function startClocks(ids = []) {
  const update = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0'); //01:05 instead of 1:5
    const mm = String(d.getMinutes()).padStart(2, '0');
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${hh}:${mm}`;
    });
  };
  update();
  return setInterval(update, 1000);
}
