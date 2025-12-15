
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
  const r = await fetch(url);
  if (!r.ok) throw new Error("Request failed");
  return r.json();
}

export async function postJSON(url, data = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": CSRF,
    },
    body: JSON.stringify(data),
  });

  const json = await r.json().catch(() => {
    throw new Error("Invalid JSON");
  });

  if (!r.ok || json.ok === false) {
    throw new Error(json.error || "Request failed");
  }
  return json;
}
const isPOS = () => {
  const page = document.body?.dataset?.page;
  if (!page) console.warn('⚠️ data-page is missing on <body>');
  return page === 'pos';
};
