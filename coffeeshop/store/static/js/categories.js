import { $, $$ } from './dom.js';

export function initCategories(){
   const barTop   = document.getElementById('cat-bar');   // the top-level category bar
  const grid     = document.getElementById('menu-grid'); // the grid with all items
  if (!barTop || !grid) return;   // additional safety
  const barSub   = document.getElementById('sub-bar');   // the subcategory bar (starts hidden)
  const pool     = document.getElementById('all-subcats'); // hidden pool with ALL categories

  const cards    = $$('.item', grid); // every item card

  const hideAllItems = () => cards.forEach(c => c.style.display = 'none');

  // If a category has no children, show only the items where data-cat="<category id>"
  const showOnlyItemsOf = (categoryId) => {
    hideAllItems();
    barSub.style.display = 'none';
    cards.forEach(card => {
      card.style.display = (String(card.dataset.cat) === String(categoryId)) ? '' : 'none';
    });
  };

  function showSubCategoryOf(categoryId){
    // find children in the hidden pool
    const children = $$(`[data-parent="${categoryId}"]`, pool);

    // highlight the clicked top-level button
    $$('.cat-btn', barTop).forEach(b => b.classList.remove('active'));
    const activeTop = barTop.querySelector(`.cat-btn[data-cat="${categoryId}"]`);
    if (activeTop) activeTop.classList.add('active');

    if (children.length === 0) {
      // no children → show items
      showOnlyItemsOf(categoryId);
      barSub.style.display = 'flex';
      return;
    }

    // has children → build buttons in sub-bar
    barSub.innerHTML = '';
    children.forEach(btn => {
      const clone = btn.cloneNode(true);  // copy button from hidden pool
      clone.addEventListener('click', () => showSubCategoryOf(clone.dataset.cat));
      barSub.appendChild(clone);
    });
    barSub.style.display = 'flex';
    hideAllItems(); // don’t show items yet until user picks a subcategory
}


  // attach clicks to top-level categories
  $$('.cat-btn', barTop).forEach(btn => {
    btn.addEventListener('click', () => showSubCategoryOf(btn.dataset.cat));
  });

  // initial state: hide everything (or open a default)
  hideAllItems();
  // Example: open "Hot drinks" by default if you know its id:
  // showSubCategoryOf("{{ hot_drinks_id }}");
}