document.addEventListener('DOMContentLoaded', () => {
  const feed = document.getElementById('orders-feed');
  if (!feed) return; // not on /orders/ page

  const loadMoreBtn = document.getElementById('orders-load-more');
  let cursor = null;
  let loading = false;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function renderOrderCard(o) {
    const card = document.createElement('article');
    card.className = 'order-card';

    // header
    const header = document.createElement('header');
    const hLeft = document.createElement('div');
    const hRight = document.createElement('div');

    const title = document.createElement('h3');
    title.textContent = `#${o.id}`;
    hLeft.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `${o.when_label} · by ${o.created_by}`;
    hRight.appendChild(meta);

    header.appendChild(hLeft);
    header.appendChild(hRight);
    card.appendChild(header);

    // items
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

    // footer
    const footer = document.createElement('footer');
    const total = document.createElement('div');
    total.textContent = `Total ${o.total_label}`;
    const pm = document.createElement('div');
    pm.className = `pm-badge ${o.payment_method}`;
    pm.textContent = o.payment_method;  // CARD/CASH
    footer.appendChild(total);
    footer.appendChild(pm);
    card.appendChild(footer);

    return card;
  }

  async function fetchPage({ reset=false } = {}) {
    if (loading) return;
    loading = true;

    try {
      if (reset) {
        cursor = null;
        feed.innerHTML = '';
      }

      const params = new URLSearchParams({ limit: '12' });
      if (cursor) params.set('cursor', String(cursor));

      const data = await getJSON(`/orders/list/?${params.toString()}`);
      (data.orders || []).forEach(o => feed.appendChild(renderOrderCard(o)));

      cursor = data.next_cursor || null;
      loadMoreBtn.style.display = cursor ? '' : 'none';
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
        renderCart(cart);
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
        renderCart(cart);
      } catch (err) { console.error('Discount update failed:', err); }
    });
  });

  // Payment radios → PATCH
  document.querySelectorAll('input[name="pm"]').forEach(r => {
    r.addEventListener('change', async (e) => {
      try {
        const { cart } = await postJSON('/cart/discount/', { payment_method: e.target.value });
        renderCart(cart);
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
    renderCart(cart);
    return;
  }

  // –1 (remove if goes to 0)
  if (e.target.closest('.qty-dec')) {
    const newQty = qty - 1;
    const url  = newQty > 0 ? '/cart/update-line/' : '/cart/remove-line/';
    const body = newQty > 0 ? { line_id: lineId, qty: newQty } : { line_id: lineId };
    const { cart } = await postJSON(url, body);
    renderCart(cart);
    return;
  }

  // remove explicitly
  if (e.target.closest('.remove-line')) {
    const { cart } = await postJSON('/cart/remove-line/', { line_id: lineId });
    renderCart(cart);
    return;
  }
});

// prerender the cart
document.addEventListener('DOMContentLoaded', async () => {
  renderCart({ lines: [], subtotal_cents: 0, subtotal_label: '$0.00', subtotal_tax: '$0.00'});

  try {
    const { cart } = await getJSON('/cart/');
    renderCart(cart);
  } catch (e) {
    console.warn('Could not load cart on start:', e.message);
  }
});


// ---- PAY BUTTON ---
document.addEventListener('DOMContentLoaded', () => {
  if (!window.__payHandlerBound) {
    window.__payHandlerBound = true;
    document.getElementById('pay-btn')?.addEventListener('click', onPayClick);
  }
});

// Always return a valid 'CARD' or 'CASH'. If nothing is selected, pick CARD by default.
function getSelectedPaymentMethod({ allowRandom = false } = {}) {
  const checked = document.querySelector('input[name="pm"]:checked');
  let val = (checked?.value || '').toString().trim().toUpperCase();

  if (val !== 'CARD' && val !== 'CASH') {
    // Pick a valid value if missing
    val = allowRandom ? (Math.random() < 0.5 ? 'CARD' : 'CASH') : 'CARD';

    //show in ui
    const radio = document.querySelector(`input[name="pm"][value="${val}"]`);
    if (radio) radio.checked = true;

    // sync server-side cart (
    try { postJSON('/cart/discount/', { payment_method: val }).then(({cart}) => renderCart(cart)); } catch {}
  }

  return val;
}

function getCSRFToken() {
  return getCookie('csrftoken');
}
function addInvoiceChip(label, orderId, containerId = 'recent-orders', createdBy = null) {
  const box = document.getElementById(containerId);
  if (!box) return;

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'pill';
  chip.dataset.orderId = String(orderId);
  if (createdBy) chip.title = `Taken by: ${createdBy}`;
  chip.textContent = label || `Order #${orderId}`;

  chip.addEventListener('click', () => {
    // could open detail later
    console.debug('Open order detail for', orderId);
  });

  box.prepend(chip);
}

async function onPayClick(e) {
  e.preventDefault();
  const btn = e.currentTarget;

  // Always fetch authoritative cart
  let cart;
  try {
    ({ cart } = await getJSON('/cart/'));
  } catch {
    showToast?.('Could not load cart. Try again.', { type: 'error' });
    return;
  }

  console.debug('Cart before pay:', cart?.lines?.length, cart);

  // If empty
  if (!cart?.lines?.length) return;

  // Double-click prevention
  if (btn.disabled) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');

  // random payment method selection
  const pmRaw = getSelectedPaymentMethod({ allowRandom: true });

  const paymentMethod = (pmRaw || '').toString().trim().toUpperCase();
  if (paymentMethod !== 'CARD' && paymentMethod !== 'CASH') {
    console.warn('Fixing invalid payment_method:', pmRaw);
    // Force to CARD if somehow still invalid
    const fallback = 'CARD';
    const radio = document.querySelector(`input[name="pm"][value="${fallback}"]`);
    if (radio) radio.checked = true;
    try { postJSON('/cart/discount/', { payment_method: fallback }).then(({cart}) => renderCart(cart)); } catch {}
  }
  try {
    const payload = {
      payment_method: (paymentMethod === 'CARD' || paymentMethod === 'CASH') ? paymentMethod : 'CARD',
      discount_cents: cart.discount_cents || 0,
      lines: cart.lines.map(l => ({
        item_id: l.item_id,
        variant_id: l.variant_id ?? null,
        qty: l.qty,
        selections: l.selections || [],
      })),
      // Diagnostics
      client_subtotal_cents: cart.subtotal_cents,
      client_tax_cents: cart.tax_cents,
      client_total_cents: cart.total_cents,
    };

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
      renderCart(fresh.cart);
    } catch {
      renderCart({
        lines: [],
        subtotal_cents: 0, discount_cents: 0, tax_cents: 0, total_cents: 0,
        subtotal_label: '$0.00', discount_label: '$0.00', tax_label: '$0.00', total_label: '$0.00',
        payment_method: 'CARD', rounding_delta_label: '$0.00',
      });
    }

    addInvoiceChip(data.chip_label, data.order_id, 'recent-orders', data.created_by);
    if (data.diagnostics) console.warn('Server re-priced:', data.diagnostics);
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