const isPOS = () => document.body?.dataset?.page === 'pos';

// ------- Category filter -------
document.addEventListener('DOMContentLoaded', () => {
  if (!isPOS()) return;

   const barTop   = document.getElementById('cat-bar');   // the top-level category bar
  const grid     = document.getElementById('menu-grid'); // the grid with all items
  if (!barTop || !grid) return;   // additional safety
  const barSub   = document.getElementById('sub-bar');   // the subcategory bar (starts hidden)
  const pool     = document.getElementById('all-subcats'); // hidden pool with ALL categories

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

});

// === Per-item modal open/close + variant filtering =====
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


// ===== PRICE UPDATE =====
(() => {
  const fmt = c => '$' + (c/100).toFixed(2);
  const int = v => parseInt(v, 10);

  async function getJSON(url) {
  const r = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }});
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok || !data || data.ok === false) {
    const msg = (data && data.error) ? data.error : 'Request failed';
    throw new Error(msg);
  }
  return data;
}
  // Calculate total for one modal
  function total_modal(modal) {
    let total = 0;
    // If this item has variants, require one and use its price.

    const variantActive = modal.querySelector('.variant-row .chip-btn.active'); //selected size button
    const hasVariants = !!modal.querySelector('.variant-row [data-variant-id]');


   if (hasVariants) {
      if (variantActive && variantActive.dataset.priceCents) {
        total = int(variantActive.dataset.priceCents);        // use selected size
      } else {
        total = int(modal.dataset.baseCents);                 // show base before pick
      }
    } else {
      total = int(modal.dataset.baseCents);
    }

    // Add all selected option deltas
    modal.querySelectorAll('.group .mods .chip-btn.active').forEach(btn => {
      total += int(btn.dataset.deltaCents || '0');
    });

    // Check each group's min requirement
    let groupsOK = true;
    modal.querySelectorAll('.group').forEach(group => {
      const min = int(group.dataset.min || '0');
      if (min > 0) {
        const count = group.querySelectorAll('.mods .chip-btn.active').length;
        if (count < min) groupsOK = false;
      }
    });

    // Update preview + button
    const addBtn = modal.querySelector('.modal-footer .btn');
    const priceEl = modal.querySelector('.modal-footer .muted strong');

    if (total === null) {
      if (priceEl) priceEl.textContent = '—';
      if (addBtn) addBtn.disabled = true; //If total is null → show dash and disable Add
    } else {
      if (priceEl) priceEl.textContent = fmt(total);
      if (addBtn) addBtn.disabled = !groupsOK;
      // stash current total for later add-to-cart
      modal.dataset.totalCents = String(total);
    }
  }


    // resetting modal
    function resetModal(modal) {
      if (!modal) return;

      // Clear selected size (variants) completely
      modal.querySelectorAll('.variant-row .chip-btn.active')
           .forEach(b => b.classList.remove('active'));

      // Clear all selected options
      modal.querySelectorAll('.group .mods .chip-btn.active')
           .forEach(b => b.classList.remove('active'));

      //  re-apply the original defaults we tagged on load
      modal.querySelectorAll('.group .mods .chip-btn[data-default="1"]')
           .forEach(b => b.classList.add('active'));

      // Recompute preview & button state
      total_modal(modal);
    }

  // Toggle logic for options
  function handleOptionClick(btn) {
    const group = btn.closest('.group');
    const type  = (group.dataset.selection || 'MULTI').toUpperCase();
    const max   = group.dataset.max === 'Infinity' ? Infinity : int(group.dataset.max || '9999');

    if (type === 'SINGLE') {
      // radio behavior: exactly one active
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
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('button[data-modal-id][data-item-id]');
    if (!opener) return;

    const modal = document.getElementById(opener.dataset.modalId);
    if (!modal) return;

    // stash base price so the modal can use it if there are no variants
    modal.dataset.baseCents = opener.dataset.baseCents || '0';

    // disable Add until valid
    const addBtn = modal.querySelector('.modal-footer .btn');
    if (addBtn) addBtn.disabled = true;

    total_modal(modal);
  });

  // Clicks inside modals: variants & options & add
  document.addEventListener('click', async (e) => {
    // variant (size)
    const variantBtn = e.target.closest('.modal .variant-row .chip-btn');
    if (variantBtn) {
      const modal = variantBtn.closest('.modal-backdrop');
      if (!modal) return;
      variantBtn.closest('.variant-row').querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
      variantBtn.classList.add('active');
      total_modal(modal);
      return;
    }

    // option
    const optionBtn = e.target.closest('.modal .group .mods .chip-btn');
    if (optionBtn) {
      const modal = optionBtn.closest('.modal-backdrop');
      if (!modal) return;
      handleOptionClick(optionBtn);
      total_modal(modal);
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

// === HELPERS ====

// Cart casche
let CART_CACHE = null;
function getCurrentCart() { return CART_CACHE; }

// Simple toast helper to show errors in ui
function showToast(message, opts = {}) {
  const { type = 'info', duration = 3000 } = opts;

  // container
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  // toast element
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;

  // close on click
  t.addEventListener('click', () => t.remove());

  container.appendChild(t);

  // animate in
  requestAnimationFrame(() => t.classList.add('show'));

  // auto-remove
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, duration);
}



// ---- GET JSON helper
function getJSON(url) {
  return fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(r => r.json().catch(() => null)
      .then(data => {
        if (!r.ok || !data || data.ok === false) {
          const msg = (data && data.error) ? data.error : 'Request failed';
          throw new Error(msg);
        }
        return data;
      }));
}


// Client side formatting
function centsToLabel(c){ return '$' + (c/100).toFixed(2); }

// read the csrftoken cookie set by Django.
function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? m.pop() : '';
}
const CSRF = getCookie('csrftoken');


//  help to POST JSON and parse JSON reply
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': CSRF
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok || !data || data.ok === false) {
    const msg = (data && data.error) ? data.error : 'Request failed';
    throw new Error(msg);
  }
  return data;
}

// Tag the buttons that are default on first render to reapply them after a reset
document.addEventListener('DOMContentLoaded', () => {
  document
    .querySelectorAll('.modal-backdrop .group .mods .chip-btn')
    .forEach(btn => {
      if (btn.classList.contains('active')) {
        btn.dataset.default = '1';
      }
    });
});

// ------- RENDERING --------
function renderCart(cart) {
  if (!isPOS()) return;
  // --- Cache DOM references once per render ---
  const linesLst  = document.getElementById('cart-lines');          // container for all lines
  const subRow    = document.getElementById('cart-subtotal');       // subtotal
  const discRow   = document.getElementById('cart-discount');
  const taxRow    = document.getElementById('cart-tax');            // tax
  const totalRow  = document.getElementById('cart-total');

  // last <span> in each row (the $ label)
  const sub   = subRow  ? subRow.querySelector('span:last-child')  : null;
  const disc  = discRow ? discRow.querySelector('span:last-child') : null;
  const tax   = taxRow  ? taxRow.querySelector('span:last-child')  : null;
  const total = totalRow? totalRow.querySelector('span:last-child') : null;

  // cash rounding
  const roundingPill   = document.getElementById('rounding-pill');
  const roundingDelta  = document.getElementById('rounding-delta');


   if (!linesLst || !sub || !tax) {
    // if critical elements are missing
    console.warn('renderCart: required DOM nodes missing');
    return;
  }

  // 1) clear current DOM
  linesLst.innerHTML = '';

  // 2) if empty, show a message
  if ((!cart.lines || cart.lines.length === 0)){
    const empty = document.createElement('div');
    empty.className = 'line';
    empty.innerHTML = `<div class="cart-row muted">Cart is empty</div>`;
    linesLst.appendChild(empty);
    sub.textContent = '$0.00'
    tax.textContent='$0.00'
    if (disc)  disc.textContent  = cart.discount || '$0.00';
    if (total) total.textContent = cart.total || '$0.00';

    // hide rounding pill when empty or non-cash
    if (roundingPill) roundingPill.style.display = 'none';
    // Do not return; still continue in case server gave non-zero totals for some reason
  }

  // add each line as a li
  cart.lines.forEach(line => {
    const li = document.createElement('li');
    li.className = 'cart-line';

    // 3) add line id and qty — store as data-*
    li.dataset.lineId = line.id;
    li.dataset.qty    = String(line.qty);
    console.log(li.dataset.lineId)
    console.log(li.dataset.qty)

    // 4) layout
    li.innerHTML = `
      <div class="cart-row">
        <h4>${line.item_name} ${line.variant_name ? `<span class="muted">· ${line.variant_name}</span>` : ''}</h4>
      </div>
      ${line.summary ? `<div class="muted" style="font-size:.9em">${line.summary}</div>` : ''}
       <div class="qty-controls" style="margin-top:6px;">
          <span class="qty-pill">Qty: x<span class="qty-val">${line.qty}</span></span>
        </div>
      
        <div style="text-align:right;">
           <div class="line-total">${centsToLabel(line.unit_total_cents * line.qty)}</div>
          <button class="btn ghost qty-dec" aria-label="Decrease">–1</button>
          <button class="btn ghost qty-inc" aria-label="Increase">+1</button>
           <button class="btn ghost remove-line" style="margin-top:6px;">Remove</button>
      </div>
    `;
    linesLst.appendChild(li);
  });

      // --- Totals
    sub.textContent   = cart.subtotal_label ?? centsToLabel(cart.subtotal_cents || 0);
    if (disc)  disc.textContent  = cart.discount_label ?? centsToLabel(cart.discount_cents || 0);
    tax.textContent   = cart.tax_label      ?? centsToLabel(cart.tax_cents || 0);
    if (total) total.textContent = cart.total_label    ?? centsToLabel(cart.total_cents || 0);



  // --- Rounding(only for CASH) ---
  if (roundingPill && roundingDelta) {
    if (cart.payment_method === 'CASH' && typeof cart.rounding_delta_label === 'string') {
      // If server label is positive but lacks a sign, show explicit "+"
      const lbl = cart.rounding_delta_label.startsWith('-')
        ? cart.rounding_delta_label
        : (cart.rounding_delta_label === '$0.00' ? '$0.00' : '+' + cart.rounding_delta_label);
      roundingDelta.textContent = lbl;
      roundingPill.style.display = '';
    } else {
      roundingPill.style.display = 'none';
    }
  }
   // (optional) keep radios in sync with server truth
  if (cart.discount_code) {
    const d = document.querySelector(`input[name="discount"][value="${cart.discount_code}"]`);
    if (d) d.checked = true;
  }
  if (cart.payment_method) {
    const p = document.querySelector(`input[name="pm"][value="${cart.payment_method}"]`);
    if (p) p.checked = true;
}}

function setupCartRadios() {
  // Discount radios → PATCH
  document.querySelectorAll('input[name="discount"]').forEach(r => {
    r.addEventListener('change', async (e) => {
      try {
        const { cart } = await postJSON('/cart/discount/', { discount_code: e.target.value });
       if (isPOS()) renderCart(cart);

      } catch (err) { console.error('Discount update failed:', err); }
    });
  });

  // Payment radios → PATCH
  document.querySelectorAll('input[name="pm"]').forEach(r => {
    r.addEventListener('change', async (e) => {
      try {
        const { cart } = await postJSON('/cart/discount/', { payment_method: e.target.value });
      if (isPOS()) renderCart(cart);
;
      } catch (err) { console.error('Payment update failed:', err); }
    });
  });
}

// call it!
document.addEventListener('DOMContentLoaded', async () => {
  setupCartRadios();
  renderCart({
    lines: [],
    subtotal_cents: 0, discount_cents: 0, tax_cents: 0, total_cents: 0,
    subtotal_label: '$0.00', discount_label: '$0.00', tax_label: '$0.00', total_label: '$0.00',
    payment_method: 'CARD', discount_code: 'NONE', rounding_delta_label: '$0.00',
  });
  try { const { cart } = await getJSON('/cart/'); renderCart(cart); }
  catch (e) { console.warn('Could not load cart on start:', e.message); }
});

// Discard → POST /cart/clear/ -> render snapshot
document.getElementById('btn-discard')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const btn = e.currentTarget;

  btn.disabled = true;
  try {
    const { cart } = await postJSON('/cart/clear/', {});
    renderCart(cart);  // will show empty state, $0.00 totals, radios reset
  } catch (err) {
    console.error('Clear cart failed:', err);
  } finally {
    btn.disabled = false;
  }
});
// ------- card buttons handlers ------

document.getElementById('cart-lines')?.addEventListener('click', async (e) => {
  const lineEl = e.target.closest('.cart-line');
  if (!lineEl) return;

  const lineId  = lineEl.dataset.lineId;
  const qtySpan = lineEl.querySelector('.qty-val');
  const qty     = parseInt(qtySpan?.textContent || lineEl.dataset.qty || '1', 10);

  // +1
  if (e.target.closest('.qty-inc')) {
    const { cart } = await postJSON('/cart/update-line/', { line_id: lineId, qty: qty + 1 });
    if (isPOS()) renderCart(cart);

    return;
  }

  // –1 (remove if goes to 0)
  if (e.target.closest('.qty-dec')) {
    const newQty = qty - 1;
    const url  = newQty > 0 ? '/cart/update-line/' : '/cart/remove-line/';
    const body = newQty > 0 ? { line_id: lineId, qty: newQty } : { line_id: lineId };
    const { cart } = await postJSON(url, body);
    if (isPOS()) renderCart(cart);

    return;
  }

  // remove explicitly
  if (e.target.closest('.remove-line')) {
    const { cart } = await postJSON('/cart/remove-line/', { line_id: lineId });
    if (isPOS()) renderCart(cart);

    return;
  }
});

// prerender the cart
document.addEventListener('DOMContentLoaded', async () => {
  renderCart({ lines: [], subtotal_cents: 0, subtotal_label: '$0.00', subtotal_tax: '$0.00'});

  try {
    const { cart } = await getJSON('/cart/');
    if (isPOS()) renderCart(cart);

  } catch (e) {
    console.warn('Could not load cart on start:', e.message);
  }
});


// ---- PAY BUTTON ---
document.addEventListener('DOMContentLoaded', () => {
 document.getElementById('pay-btn')?.addEventListener('click', onPayClick);
});

// Always return a 'CARD' or 'CASH'. If nothing is selected, pick random (for learning purposes)
 function getSelectedPaymentMethod({ allowRandom = false } = {}) {
  //choose which method is selected
  const checked = document.querySelector('input[name="pm"]:checked');
  let val = (checked?.value || '').toString().trim().toUpperCase();

  if (val !== 'CARD' && val !== 'CASH') {
    // Pick a random value if missing
    val = allowRandom ? (Math.random() < 0.5 ? 'CARD' : 'CASH') : 'CARD';

    //show in ui
    const radio = document.querySelector(`input[name="pm"][value="${val}"]`);
    if (radio) radio.checked = true;

    // sync server-side cart (refactored to catch errors asynchronously)
    try {
      const { cart } = postJSON('/cart/discount/', { payment_method: val });
      renderCart(cart);
    } catch (err) {
      console.error('Payment method application failed:', err);
      showToast?.('Error with payment method .', { type: 'error' });
    }
  }

  return val;
}

// tiny helper
function getCSRFToken() {
  return getCookie('csrftoken');
}

// adding recent orders to ui
function addInvoiceChip(
  label,
  orderId,
  containerId = 'prev-invoices-list',
  maxChips = 2
) {
  const row = document.getElementById(containerId);
  if (!row) return;

  //  if a chip for this order already exists, do nothing
  if (row.querySelector(`[data-order-id="${orderId}"]`)) return;

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'pill';
  chip.dataset.orderId = String(orderId);
  chip.textContent = label || `Order #${orderId}`;

  //  future: open order details
  chip.addEventListener('click', () => {
    // For now just log
    console.debug('Open order detail for', orderId);
  });

  row.prepend(chip);

  const chips = Array.from(row.querySelectorAll('.pill')); //returns a nodeList of elements inside row that match .pill. than converts to array again
  if (chips.length > maxChips) {
    chips.slice(maxChips).forEach(el => el.remove()); // remove oldest extras
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const row = document.getElementById('prev-invoices-list');
  if (!row) return; // not on the POS page

  try {
    const data = await getJSON('/orders/list/?limit=2');
    //safe default to an empty array + reverse because prepend was used
    const orders = (data.orders || []).slice().reverse();

    for (const o of orders) {
      const pm = (o.payment_method === 'CASH') ? 'Cash' : 'Card';

     const label = `${o.total_label} ${pm}`; // "$5.65" -> "5.65 Card"
      addInvoiceChip(label, o.id, 'prev-invoices-list', o.created_by, 2);
    }
  } catch (e) {
    console.warn('Could not load previous invoices:', e);
  }
});

async function onPayClick(e) {
  e.preventDefault();
  const btn = e.currentTarget;

  // fetch newest cart
  let cart;
  try {
    ({ cart } = await getJSON('/cart/'));
  } catch {
    showToast?.('Could not load cart. Try again.', { type: 'error' });
    return;
  }

  console.debug('Cart before pay:', cart?.lines?.length, cart);

  // empty cart prevention
  if (!cart?.lines?.length) return;

  // Double-click prevention
  if (btn.disabled) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');

  // random payment method selection
  const paymentMethod = getSelectedPaymentMethod({ allowRandom: true });
  console.log("Payment method is: ", paymentMethod)

  try {
  //build payload
    const payload = {
      payment_method: paymentMethod,
      discount_cents: cart.discount_cents || 0,
      lines: cart.lines.map(l => ({
        item_id: l.item_id,
        variant_id: l.variant_id ?? null,
        qty: l.qty,
        selections: l.selections || [],
      })),
    };

    // pay
    const res = await fetch('/order/pay/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data?.error || `Payment failed (${res.status})`);
    }

    //  clear cart
    try {
      const fresh = await getJSON('/cart/');
     if (isPOS()) renderCart(fresh.cart);

    } catch {
      renderCart({
        lines: [],
        subtotal_cents: 0, discount_cents: 0, tax_cents: 0, total_cents: 0,
        subtotal_label: '$0.00', discount_label: '$0.00', tax_label: '$0.00', total_label: '$0.00',
        payment_method: 'CARD', rounding_delta_label: '$0.00',
      });
    }

    // inside onPayClick success:
    addInvoiceChip(
      data.chip_label,       // e.g. "$5.65 Card"
      data.order_id,
      'prev-invoices-list',
      data.created_by
    );

    // toast for debug
    showToast?.(`Order #${data.order_id} created — ${data.total_label || data.chip_label}`, { type: 'success' });

  } catch (err) {
    console.error(err);
    showToast?.(err.message || 'Something went wrong while paying', { type: 'error' });
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}
;
// ---- ORDERS PAGE ----
document.addEventListener('DOMContentLoaded', () => {
  const feed = document.getElementById('orders-feed');
  if (!feed) return;

// pagination
  const loadMoreBtn = document.getElementById('orders-load-more');
  let cursor = null;
  let loading = false;

// RENDER ORDER
  function renderOrderCard(o) {
    const card = document.createElement('article');
    card.className = 'order-card';
    card.dataset.orderId = o.id;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open order #${o.id}`);

    // header
    const header = document.createElement('header');
    const hLeft = document.createElement('div');
    const hRight = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = `#${o.id}`;
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `${o.when_label} · by ${o.created_by}`;
    hLeft.appendChild(title);
    hRight.appendChild(meta);
    header.appendChild(hLeft);
    header.appendChild(hRight);
    card.appendChild(header);

    // items preview
    const ul = document.createElement('ul');
    ul.className = 'items';
    (o.items || []).forEach(it => {
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.className = 'left';
      const badge = document.createElement('span');
      badge.className = 'order-badge';
      badge.textContent = `×${it.qty}`;
      const label = document.createElement('span');
      label.textContent = it.label;
      left.appendChild(badge);
      left.appendChild(label);
      const amt = document.createElement('span');
      amt.textContent = it.line_label;
      li.appendChild(left);
      li.appendChild(amt);
      ul.appendChild(li);
    });
    card.appendChild(ul);

    // footer (TOTAL + STATUS PILL)
    const footer = document.createElement('footer');
    const total = document.createElement('div');
    total.textContent = `Total ${o.total_label}`;
    const paymentPill = document.createElement('div')
    const statusPill = document.createElement('div');
    paymentPill.className = `payment-pill payment--${o.payment_method.toLowerCase()}`;
    paymentPill.textContent = o.payment_method;
    statusPill.className = `status-pill status--${o.status.toLowerCase()}`;
    statusPill.textContent = o.status;
    footer.appendChild(total);
    footer.appendChild(statusPill);
    footer.appendChild(paymentPill)
    card.appendChild(footer);

    return card;
  }
  async function openOrderModal(orderId) {
  try {
    const { ok, order } = await getJSON(`/orders/${orderId}/`);
    if (!ok) throw new Error('Load failed');
//    renderOrderModal(order); //for future clickable card
  } catch (e) {
    console.error('openOrderModal failed:', e);
    showToast?.(e.message || 'Failed to load order', { type: 'error' });
  }
}

    // one listener on the container
  feed.addEventListener('click', (e) => {
    const card = e.target.closest('.order-card');
    if (!card || !feed.contains(card)) return;
    openOrderModal(card.dataset.orderId);
  });

  feed.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.order-card');
    if (!card || !feed.contains(card)) return;
    e.preventDefault();
    openOrderModal(card.dataset.orderId);
  });

  async function fetchPage({ reset=false } = {}) {

  //from overlapping fetches
    if (loading) return;
    loading = true;

    try {
      if (reset) {
      //manual “refresh
        cursor = null;
        feed.innerHTML = '';
      }
      const params = new URLSearchParams({ limit: '16' }); //how many shon on page
      if (cursor) params.set('cursor', String(cursor));

      const data = await getJSON(`/orders/list/?${params}`);

      (data.orders || []).forEach(o => feed.appendChild(renderOrderCard(o))); //defensive default
      cursor = data.next_cursor || null;
    // null/undefined means no more pages
      if (loadMoreBtn) loadMoreBtn.style.display = cursor ? '' : 'none';
    } catch (e) {
      console.error(e);
      showToast?.('Could not load orders', { type: 'error' });
    } finally {
      loading = false;
    }
  }

  // initial load + load more
  fetchPage({ reset: true });
  loadMoreBtn?.addEventListener('click', () => fetchPage({ reset: false }));
});

