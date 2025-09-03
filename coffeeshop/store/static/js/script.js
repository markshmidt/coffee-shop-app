
// ------- Category filter -------
  const barTop   = document.getElementById('cat-bar');   // the top-level category bar
  const barSub   = document.getElementById('sub-bar');   // the subcategory bar (starts hidden)
  const pool     = document.getElementById('all-subcats'); // hidden pool with ALL categories
  const grid     = document.getElementById('menu-grid'); // the grid with all items
  const cards    = Array.from(grid.querySelectorAll('.item')); // every item card

  const hideAllItems = () => cards.forEach(c => c.style.display = 'none');

  // If a category has no children, show only the items where data-cat="<that category id>"
  const showOnlyItemsOf = (catId) => {
    hideAllItems();
    barSub.style.display = 'none';
    cards.forEach(c => {
      c.style.display = (String(c.dataset.cat) === String(catId)) ? '' : 'none';
    });
  };

  function showChildrenOf(catId){
    // find children in the hidden pool
    const children = Array.from(pool.querySelectorAll(`[data-parent="${catId}"]`));

    // highlight the clicked top-level button
    barTop.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    const activeTop = barTop.querySelector(`.cat-btn[data-cat="${catId}"]`);
    if (activeTop) activeTop.classList.add('active');

    if (children.length === 0) {
      // no children → show items
      showOnlyItemsOf(catId);
      barSub.style.display = 'flex';
      return;
    }

    // has children → build buttons in sub-bar
    barSub.innerHTML = '';
    children.forEach(btn => {
      const clone = btn.cloneNode(true);  // copy button from hidden pool
      clone.addEventListener('click', () => showChildrenOf(clone.dataset.cat));
      barSub.appendChild(clone);
    });
    barSub.style.display = 'flex';
    hideAllItems(); // don’t show items yet until user picks a subcategory
}


  // attach clicks to top-level categories
  barTop.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => showChildrenOf(btn.dataset.cat));
  });

  // initial state: hide everything (or open a default)
  hideAllItems();
  // Example: open "Hot drinks" by default if you know its id:
  // showChildrenOf("{{ hot_drinks_id }}");

    // ---- Clock and modal windows JS
    const clk = document.getElementById('clock');
    setInterval(() => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      clk.textContent = `${hh}:${mm}`;
    }, 1000);
    const clock = document.getElementById('clock2');
    setInterval(() => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      clock.textContent = `${hh}:${mm}`;
    }, 1000);

// === Per-item modal open/close + variant filtering
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    // OPEN
    const openBtn = e.target.closest('button[data-modal-id][data-item-id]');
    if (openBtn) {
      e.preventDefault();

      const modalId   = openBtn.dataset.modalId;          // e.g. "modal-42"
      const itemId    = openBtn.dataset.itemId;           // "42"
      const modalName = openBtn.dataset.modalName || '';  // from data-modal-name

      const modal = document.getElementById(modalId);
      if (!modal) { console.warn('Modal not found:', modalId); return; }

      // Set the title inside the modal
      const titleEl = modal.querySelector('.modal-header h4');
      if (titleEl && modalName) titleEl.textContent = modalName;

      // Show only the item's variants
      const vlist = modal.querySelector('.variant-row');
      if (vlist) {
        vlist.querySelectorAll('[data-variant-id]').forEach(btn => {
          btn.style.display = (String(btn.dataset.itemId) === String(itemId)) ? '' : 'none';
        });
      }

      modal.style.display = 'flex';
      return;
    }

    // CLOSE via the "X" button
    const closeBtn = e.target.closest('.close-modal');
    if (closeBtn) {
      const modal = document.getElementById(closeBtn.dataset.modalId) || closeBtn.closest('.modal-backdrop');
      if (modal) modal.style.display = 'none';
      return;
    }

    // CLOSE by clicking the backdrop
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.style.display = 'none';
    }
  });
});
