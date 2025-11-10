import { $, $$ } from './dom.js';
import { to_int} from './utils.js'
// === Per-item modal open/close + variant filtering =====
function initModals(){
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
};

// ===== PRICE UPDATE =====
function computeTotal(modal) => {
  // Calculate total for one modal
    let total = 0;

    const variantActive = modal.querySelector('.variant-row .chip-btn.active'); //selected size button
    const hasVariants = !!modal.querySelector('.variant-row [data-variant-id]');


   if (hasVariants) {
      if (variantActive && variantActive.dataset.priceCents) {
        total = to_int(variantActive.dataset.priceCents);        // use selected size
      } else {
        total = to_int(modal.dataset.baseCents);
      }
    } else {
      total = to_int(modal.dataset.baseCents);
    }

    // Add all selected option deltas
    $$('.group .mods .chip-btn.active', modal).forEach(btn => {
      total += to_int(btn.dataset.deltaCents || '0');
    });

    // Check each group's min requirement
    let groupsOK = true;
    $$('.group', modal).forEach(group => {
      const min = to_int(group.dataset.min || '0');
      if (min > 0) {
        const count = $$('.mods .chip-btn.active', group).length;
        if (count < min) groupsOK = false;
      }
    });

    // Update preview + button
    const addBtn = modal.querySelector('.modal-footer .btn');
    const priceEl = modal.querySelector('.modal-footer .muted strong');

    if (total === null) {
      if (priceEl) priceEl.textContent = '$0.00';
      if (addBtn) addBtn.disabled = true;
    } else {
      if (priceEl) priceEl.textContent = fmt(total);
      if (addBtn) addBtn.disabled = !groupsOK;
      // stash current total for later add-to-cart
      modal.dataset.totalCents = String(total);
    }
  }
function ensureRequiredVariantSelected(modal) {
  const row = modal.querySelector('.variant-row');
  if (!row) return;

  const requireVariant = modal.dataset.requireVariant === '1';
  if (!requireVariant) return;

  const chips = $$('.chip-btn[data-variant-id]', row));
  if (!chips.length) return;

  // Already selected?
  const active = chips.find(c => c.classList.contains('active'));
  if (active) return;

  // choosing middle ad it is the most popular size
  const middle = chips[Math.floor((chips.length - 1) / 2)];
  const pick = middle || chips[0];

  chips.forEach(c => {
    const on = c === pick;
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

    // resetting modal
    function resetModal(modal) {
      if (!modal) return;
      modal.querySelectorAll('.variant-row .chip-btn.active')
           .forEach(b => b.classList.remove('active'));

      modal.querySelectorAll('.group .mods .chip-btn.active')
           .forEach(b => b.classList.remove('active'));

      //  re-apply the original defaults tagged on load
      modal.querySelectorAll('.group .mods .chip-btn[data-default="1"]')
           .forEach(b => b.classList.add('active'));

      // Recompute preview & button state
      computeTotal(modal);
    }

  // Toggle logic for options
  function handleOptionClick(btn) {
    const group = btn.closest('.group');
    const type  = (group.dataset.selection || 'MULTI').toUpperCase();
    const max   = group.dataset.max === 'Infinity' ? Infinity : int(group.dataset.max || '9999');

    if (type === 'SINGLE') {
      //exactly one active
      group.querySelectorAll('.mods .chip-btn.active').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    } else {
      if (btn.classList.contains('active')) {
        btn.classList.remove('active');
      } else {
        const count = group.querySelectorAll('.mods .chip-btn.active').length;
        if (count >= max) return;      // reached max; ignore
        btn.classList.add('active');
      }
    }
  }

  // copy base price from the opener when opening the model
//  document.addEventListener('click', (e) => {
//    const opener = e.target.closest('button[data-modal-id][data-item-id]');
//    if (!opener) return;
//
//    const modal = document.getElementById(opener.dataset.modalId);
//    if (!modal) return;
//
//    // stash base price so the modal can use it if there are no variants
//    modal.dataset.baseCents = opener.dataset.baseCents || '0';
////
////    if (!('requireVariant' in modal.dataset)) {
////    const hasVariants = !!modal.querySelector('.variant-row [data-variant-id]');
////    if (hasVariants) modal.dataset.requireVariant = '1';
////  }
//
//    // disable Add until valid
//    const addBtn = modal.querySelector('.modal-footer .btn');
//    if (addBtn) addBtn.disabled = true;
//
//    computeTotall(modal);
//  });

  // Clicks inside modals: variants & options & add
  document.addEventListener('click', async (e) => {
    // variant (size)
    const variantBtn = e.target.closest('.modal .variant-row .chip-btn');
    if (variantBtn) {
      const modal = variantBtn.closest('.modal-backdrop');
      if (!modal) return;
      variantBtn.closest('.variant-row').querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      variantBtn.classList.add('active');
      computeTotal(modal);
      return;
    }

    // option
    const optionBtn = e.target.closest('.modal .group .mods .chip-btn');
    if (optionBtn) {
      const modal = optionBtn.closest('.modal-backdrop');
      if (!modal) return;
      handleOptionClick(optionBtn);
      computeTotal(modal);
      return;
    }

    // Add ×1 → POST to server then render cart
    const addBtn = e.target.closest('.modal .modal-footer .btn');
    if (addBtn) {
      const modal = addBtn.closest('.modal-backdrop');
      const itemId = modal.id.replace('modal-', '');

      const variant = modal.querySelector('.variant-row .chip-btn.active');
      const variantId = variant ? variant.dataset.variantId : null;

      const selections = [];
      modal.querySelectorAll('.group').forEach(g => {
        const groupId = g.dataset.groupId;
        const optionIds = Array.from(g.querySelectorAll('.mods .chip-btn.active'))
            .map(b => b.dataset.optionId);
        if (optionIds.length) selections.push({group_id: groupId, option_ids: optionIds});
      });

      const payload = {
        item_id: itemId,
        variant_id: variantId,
        qty: 1,
        selections,
        unit_total_cents: parseInt(modal.dataset.totalCents || '0', 10),
      };

      try {
        const {cart} = await postJSON('/cart/add-line/', payload);
       if (isPOS()) renderCart(cart);
        resetModal(modal)// <-- re-render
        modal.style.display = 'none';                             // close modal
      } catch (err) {
        console.error(err);
      }
    }
  });
})();
