
export function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? m.pop() : '';
}
export const CSRF = getCookie('csrftoken');

export async function parseJsonSafe(r) {
  let data = null;
  try { data = await r.json(); } catch {}
  return data;
}

export async function getJSON(url) {
  const r = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' });
  const data = await parseJsonSafe(r);
  if (!r.ok || !data || data.ok === false) throw new Error(data?.error || 'Request failed');
  return data;
}

export async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
    credentials: 'same-origin',
    body: JSON.stringify(body || {}),
  });
  const data = await parseJsonSafe(r);
  if (!r.ok || !data || data.ok === false) throw new Error(data?.error || 'Request failed');
  return data;
}

