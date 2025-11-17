import { $, $$ } from './dom.js';
import { to_int, centsToLabel, isPOS, showToast } from './utils.js';
import { postJSON, getJSON, CSRF } from './api.js';

// ---- small helpers ----
function visibleChips(container, itemId) {
  const all = Array.from(container.querySelectorAll('.chip-btn[data-variant-id]'));
  return all.filter(b =>
    String(b.dataset.itemId) === String(itemId) &&
    b.style.display !== 'none' &&
    b.offsetParent !== null
  );
}
function ensureRequiredVariantSelected(modal, itemId) {
  const row = modal.querySelector('.variant-row');
  if (!row) return;
  const chips = visibleChips(row, itemId);
  if (!chips.length) return;
  if (chips.some(c => c.classList.contains('active'))) return;

  // pick the middle (most common) or first
  const pick = chips[Math.floor((chips.length - 1) / 2)] || chips[0];
  chips.forEach(c => {
    const on = c === pick;
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function computeTotal(modal) {
  let total = 0;
  const variantActive = modal.querySelector('.variant-row .chip-btn.active');
  if (variantActive?.dataset.priceCents) {
    total = to_int(variantActive.dataset.priceCents);
  } else {
    total = to_int(modal.dataset.baseCents || '0');
  }
  $$('.group .mods .chip-btn.active', modal).forEach(btn => {
    total += to_int(btn.dataset.deltaCents || '0');
  });

  // min-select validation
  let groupsOK = true;
  $$('.group', modal).forEach(group => {
    const min = to_int(group.dataset.min || '0');
    if (min > 0) {
      const count = $$('.mods .chip-btn.active', group).length;
      if (count < min) groupsOK = false;
    }
  });

  const addBtn = modal.querySelector('.modal-footer .btn');
  const priceEl = modal.querySelector('.modal-footer .muted strong');
  if (priceEl) priceEl.textContent = centsToLabel(total || 0);
  if (addBtn) addBtn.disabled = !groupsOK;
  modal.dataset.totalCents = String(total || 0);
}
function handleOptionClick(btn) {
  const group = btn.closest('.group');
  const type  = (group.dataset.selection || 'MULTI').toUpperCase();
  const max   = group.dataset.max === 'Infinity' ? Infinity : to_int(group.dataset.max || '9999');
  if (type === 'SINGLE') {
    group.querySelectorAll('.mods .chip-btn.active').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  } else {
    if (btn.classList.contains('active')) btn.classList.remove('active');
    else {
      const count = group.querySelectorAll('.mods .chip-btn.active').length;
      if (count >= max) return;
      btn.classList.add('active');
    }
  }
}
function resetModal(modal, itemId) {
  if (!modal) return;
  $$('.variant-row .chip-btn.active', modal).forEach(b => b.classList.remove('active'));
  $$('.group .mods .chip-btn.active', modal).forEach(b => b.classList.remove('active'));
  $$('.group .mods .chip-btn[data-default="1"]', modal).forEach(b => b.classList.add('active'));
  ensureRequiredVariantSelected(modal, itemId);
  computeTotal(modal);
}

// ---- public init ----
export function initModals({ renderCart }) {
  // OPEN
  document.addEventListener('click', (e) => {
    const openBtn = e.target.closest('button[data-modal-id][data-item-id]');
    if (!openBtn) return;

    e.preventDefault();
    const modalId   = openBtn.dataset.modalId;
    const itemId    = openBtn.dataset.itemId;
    const modalName = openBtn.dataset.modalName || '';
    const modal = document.getElementById(modalId);
    if (!modal) { console.warn('Modal not found:', modalId); return; }

    // title
    const titleEl = modal.querySelector('.modal-header h4');
    if (titleEl && modalName) titleEl.textContent = modalName;

    // filter visible variants for this item
    const vlist = modal.querySelector('.variant-row');
    if (vlist) {
      vlist.querySelectorAll('[data-variant-id]').forEach((btn) => {
        btn.style.display = (String(btn.dataset.itemId) === String(itemId)) ? '' : 'none';
      });
    }

    // base price & flags
    modal.dataset.baseCents = openBtn.dataset.baseCents || modal.dataset.baseCents || '0';

    // require a variant if any visible chips exist
    const chips = visibleChips(vlist || modal, itemId);
    modal.dataset.requireVariant = chips.length ? '1' : '0';

    // pick default if required
    ensureRequiredVariantSelected(modal, itemId);

    // compute footer total
    computeTotal(modal);

    modal.style.display = 'flex';
  });

  // CLOSE
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.close-modal');
    if (closeBtn) {
      const modal = document.getElementById(closeBtn.dataset.modalId) || closeBtn.closest('.modal-backdrop');
      if (modal) modal.style.display = 'none';
      return;
    }
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.style.display = 'none';
    }
  });

  // VARIANT click
  document.addEventListener('click', (e) => {
    const variantBtn = e.target.closest('.modal .variant-row .chip-btn');
    if (!variantBtn) return;
    const modal = variantBtn.closest('.modal-backdrop');
    if (!modal) return;
    variantBtn.closest('.variant-row').querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
    variantBtn.classList.add('active');
    computeTotal(modal);
  });

  // OPTION click
  document.addEventListener('click', (e) => {
    const optionBtn = e.target.closest('.modal .group .mods .chip-btn');
    if (!optionBtn) return;
    const modal = optionBtn.closest('.modal-backdrop');
    if (!modal) return;
    handleOptionClick(optionBtn);
    computeTotal(modal);
  });

  // ADD ×1
  document.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('.modal .modal-footer .btn');
    if (!addBtn) return;

    const modal = addBtn.closest('.modal-backdrop');
    const itemIdStr = (modal.id || '').replace('modal-', '');
    const itemId = Number(itemIdStr);

    const vrow = modal.querySelector('.variant-row');
    const active = vrow?.querySelector('.chip-btn.active');
    const visible = visibleChips(vrow || modal, itemId);
    const firstVisible = visible[0];

    // strong variant resolution order:
    let variantId =
      (active && Number(active.dataset.variantId)) ||
      (firstVisible && Number(firstVisible.dataset.variantId)) ||
      Number(modal.dataset.baseVariantId);

    if (!Number.isFinite(variantId)) {
      showToast?.('Please choose a size for this item.', { type: 'warning' });
      return;
    }

    // selections → numeric
    const selections = [];
    modal.querySelectorAll('.group').forEach(g => {
      const gid = Number(g.dataset.groupId);
      const oids = Array.from(g.querySelectorAll('.mods .chip-btn.active'))
        .map(b => Number(b.dataset.optionId))
        .filter(Number.isFinite);
      if (Number.isFinite(gid) && oids.length) selections.push({ group_id: gid, option_ids: oids });
    });

    const payload = { item_id: itemId, variant_id: variantId, qty: 1, selections };

    try {
      const { ok, cart, error } = await postJSON('/cart/add-line/', payload);
      if (!ok) throw new Error(error || 'Add line failed');

      // cache customer if server returns it (prevents “Guest” flicker)
      if (cart?.customer) window.__currentCustomer__ = cart.customer;

      if (isPOS()) renderCart(cart);
      resetModal(modal, itemId);
      modal.style.display = 'none';
    } catch (err) {
      console.error('add-line failed:', err);
      showToast?.(err.message || 'Could not add item', { type: 'error' });
    }
  });
}
