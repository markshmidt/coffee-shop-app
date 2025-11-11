//returns the first match
export const $  = (sel, root = document) => root.querySelector(sel);

//returns array matches, not a NodeList
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

//attaches one listener to stable parent
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  });
}
