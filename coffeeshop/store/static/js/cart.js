import { $, $$ } from './dom.js';
import { centsToLabel, showToast } from './utils.js';
import { getJSON, postJSON, CSRF } from './api.js';
import { displayName, updateCartHeaderCustomerFromCart, updateCartHeaderCustomer} from './customers.js'
import { openOrderModal} from './orders.js'
const isPOS = () => document.body?.dataset?.page === 'pos';
export function setupCartRadios() {
  // Discount radios → PATCH
  $$('input[name="discount"]').forEach((r) => {
    r.addEventListener('change', async (e) => {
      try {
      //call backend to apply discount to cart
        const { cart } = await postJSON('/cart/discount/', { discount_code: e.target.value });
       renderCart(cart);
      } catch (err) { console.error('Discount update failed:', err); }
    });
  });

  $$('input[name="pm"]').forEach((r) => {
    r.addEventListener('change', async (e) => {
      try {
        const { cart } = await postJSON('/cart/discount/', { payment_method: e.target.value });
        renderCart(cart);
      } catch (err) {
        console.error('Payment update failed:', err);
      }
    });
  });
 }

//REDEEM POINTS
export function wireRedeemToggle() {
  const redeem = document.getElementById('redeem');
  if (!redeem || redeem.dataset.wired) return;
  redeem.dataset.wired = '1';
  redeem.addEventListener('change', async (e) => {
    try {
      const { cart } = await postJSON('/cart/discount/', { redeem: e.target.checked });
      renderCart(cart);
    } catch (err) {
      console.error(err);
      showToast?.('Could not update redemption', { type: 'error' });
      e.target.checked = !e.target.checked; // revert UI
    }
  });
}
// Tag the buttons that are default on first render to reapply them after a reset
export function tagDefaultOptionChips(){
$$('.modal-backdrop .group .mods .chip-btn')
    .forEach(btn => {
      if (btn.classList.contains('active')) {
        btn.dataset.default = '1';
      }
    });
}

// ------- RENDERING --------

export function renderCart(cart) {
  if (!isPOS()) return;

  const linesLst  = document.getElementById('cart-lines');
  const subRow    = document.getElementById('cart-subtotal');
  const discRow   = document.getElementById('cart-discount');
  const taxRow    = document.getElementById('cart-tax');
  const totalRow  = document.getElementById('cart-total');

  const sub   = subRow?.querySelector('span:last-child')  || null;
  const disc  = discRow?.querySelector('span:last-child') || null;
  const tax   = taxRow?.querySelector('span:last-child')  || null;
  const total = totalRow?.querySelector('span:last-child')|| null;

  const roundingPill  = document.getElementById('rounding-pill');
  const roundingDelta = document.getElementById('rounding-delta');

  const loyRow = document.getElementById('cart-loyalty');
  const amtL   = document.getElementById('loyalty-amount');

  if (!linesLst || !sub || !tax) {
    console.warn('renderCart: required DOM nodes missing');
    return;
  }

  // clear
  linesLst.innerHTML = '';

  // empty state
  if (!Array.isArray(cart.lines) || cart.lines.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'line';
    empty.innerHTML = `<div class="cart-row muted">Cart is empty</div>`;
    linesLst.appendChild(empty);
    if (roundingPill) roundingPill.style.display = 'none';
  }

  // lines
  (cart.lines || []).forEach(line => {
    const li = document.createElement('li');
    li.className = 'cart-line';
    li.dataset.lineId = line.id;
    li.dataset.qty = String(line.qty);

    li.innerHTML = `
      <div class="cart-row">
        <h4>${line.item_name} ${line.variant_name ? `<span class="muted">· ${line.variant_name}</span>` : ''}</h4>
      </div>
      ${line.summary ? `<div class="muted" style="font-size:.9em">${line.summary}</div>` : ''}
      <div class="qty-controls" style="margin-top:6px;">
        <span class="qty-pill">Qty: x<span class="qty-val">${line.qty}</span></span>
      </div>

      <div style="text-align:right;">
        <div class="line-total">${line.line_total_label ?? centsToLabel((line.unit_total_cents||0) * (line.qty||1))}</div>
        <button class="btn ghost qty-decrease" aria-label="Decrease">–1</button>
        <button class="btn ghost qty-increase" aria-label="Increase">+1</button>
        <button class="btn ghost remove-line" style="margin-top:6px;">Remove</button>
      </div>
    `;
    linesLst.appendChild(li);
  });

  // header/customer
  updateCartHeaderCustomerFromCart(cart);

  // totals
  sub.textContent   = cart.subtotal_label ?? centsToLabel(cart.subtotal_cents || 0);
  if (disc)  disc.textContent  = cart.discount_label ?? centsToLabel(cart.discount_cents || 0);
  tax.textContent   = cart.tax_label ?? centsToLabel(cart.tax_cents || 0);
  if (total) total.textContent = cart.total_label  ?? centsToLabel(cart.total_cents || 0);

  // loyalty redemption row
  const lp = Number(cart.loyalty_redemption_cents || 0);
  if (loyRow) loyRow.style.display = lp > 0 ? '' : 'none';
  if (lp > 0 && amtL) {
    const lbl = cart.loyalty_redemption_label ?? centsToLabel(lp);
    amtL.textContent = '-' + lbl;
  }

  // rounding (cash only)
  if (roundingPill && roundingDelta) {
    if (cart.payment_method === 'CASH' && typeof cart.rounding_delta_label === 'string') {
      const lbl = cart.rounding_delta_label.startsWith('-')
        ? cart.rounding_delta_label
        : (cart.rounding_delta_label === '$0.00' ? '$0.00' : '+' + cart.rounding_delta_label);
      roundingDelta.textContent = lbl;
      roundingPill.style.display = '';
    } else {
      roundingPill.style.display = 'none';
    }
  }

  // radios
  if (cart.discount_code) {
    const d = document.querySelector(`input[name="discount"][value="${cart.discount_code}"]`);
    if (d) d.checked = true;
  }
  if (cart.payment_method) {
    const p = document.querySelector(`input[name="pm"][value="${cart.payment_method}"]`);
    if (p) p.checked = true;
  }

  // redeem toggle eligibility
  const pts = Number(cart?.loyalty?.projected_points ?? 0);   // <- nil safe
  const subC = Number(cart.subtotal_cents ?? 0);
  const disC = Number(cart.discount_cents ?? 0);
  const eligible = pts >= 80 && (subC - disC) > 0;

  const redeem = document.getElementById('redeem');
  const redeemLabel = document.getElementById('redeem-label');
  if (redeemLabel) redeemLabel.style.display = eligible ? 'inline' : 'none';
  if (redeem) {
    redeem.disabled = !eligible;
    redeem.checked  = lp > 0;
  }
}

// ------- card buttons handlers ------
export function wireCartLineButtons() {
document.getElementById('cart-lines')?.addEventListener('click', async (e) => {
  const lineEl = e.target.closest('.cart-line');
  if (!lineEl) return;

  const lineId  = lineEl.dataset.lineId;
  const qtySpan = lineEl.querySelector('.qty-val');
  const qty     = parseInt(qtySpan?.textContent || lineEl.dataset.qty || '1', 10);

 try {
    //+1
    if (e.target.closest('.qty-increase')) {
      const { cart } = await postJSON('/cart/update-line/', { line_id: lineId, qty: qty + 1 });
      renderCart(cart);
      return;
    }
    //-1
    if (e.target.closest('.qty-decrease')) {
      const newQty = qty - 1;
      const body = newQty > 0 ? { line_id: lineId, qty: newQty } : { line_id: lineId };
      const { cart } = await postJSON('/cart/update-line/', body);
      renderCart(cart);
      return;
    }
    //remove explicitly
    if (e.target.closest('.remove-line')) {
      const { cart } = await postJSON('/cart/update-line/', { line_id: lineId });
      if (cart?.customer) window.__currentCustomer__ = cart.customer;
      renderCart(cart);
      return;
    }
  } catch (err) {
    console.error('Line update failed:', err);
    showToast?.('Could not update line', { type: 'error' });
  }
});
}


// ---- PAY BUTTON ---
// Always return a 'CARD' or 'CASH'
export function getSelectedPaymentMethod({ allowRandom = false } = {}) {
  const checked = $('input[name="pm"]:checked');
  let val = (checked?.value || '').toString().trim().toUpperCase();

  if (val !== 'CARD' && val !== 'CASH') {
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

// adding recent orders to ui
// cart.js (or wherever addInvoiceChip lives)
export function addInvoiceChip(label, orderId, containerId = 'prev-invoices-list', maxChips = 2) {
  const row = document.getElementById(containerId);
  if (!row) return;

  const more = row.querySelector('#orders-more-chip'); // your anchor
  if (!more) return;

  // already present? bail
  if (row.querySelector(`.pill[data-order-id="${orderId}"]`)) return;

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'pill';
  chip.dataset.orderId = String(orderId);
  chip.textContent = label || `Order #${orderId}`;
  chip.addEventListener('click', () => openOrderModal(orderId));

  // insert as the first *real* chip (before current first, which might be "More…")
  const firstRealChip = Array.from(row.children).find(el => el !== more);
  if (firstRealChip) {
    row.insertBefore(chip, firstRealChip);    // newest on the left
  } else {
    row.insertBefore(chip, more);             // if no chips yet, place before "More…"
  }

  // keep "More…" at the end
  row.appendChild(more);

  // trim to maxChips (exclude the More… anchor)
  const chips = Array.from(row.querySelectorAll('.pill')).filter(el => el !== more);
  if (chips.length > maxChips) chips.slice(maxChips).forEach(el => el.remove());
}




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

  const pm = getSelectedPaymentMethod({ allowRandom: true });
  try { await postJSON('/cart/discount/', { payment_method: pm }); } catch {}

  try {
    const res = await fetch('/order/pay/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF },
      credentials: 'same-origin',
      body: JSON.stringify({}), // server reads session cart
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data?.error || `Payment failed (${res.status})`);

    //  clear cart
    try {
     const fresh = await getJSON('/cart/');
     renderCart(fresh.cart);

    } catch {
    console.log("Backend did not render fresh cart. Rendering from JS instead)")
      renderCart({
        lines: [],
        subtotal_cents: 0, discount_cents: 0, tax_cents: 0, total_cents: 0,
        subtotal_label: '$0.00', discount_label: '$0.00', tax_label: '$0.00', total_label: '$0.00',
        payment_method: 'CARD', rounding_delta_label: '$0.00',
      });
    }

    addInvoiceChip(
      data.chip_label,       // e.g. "$5.65 Card"
      data.order_id,
      'prev-invoices-list',
      data.created_by
    );

    if (data.customer && data.loyalty) {
  const customerObj = { ...data.customer, points_balance: data.loyalty.customer_points_balance };
  updateCartHeaderCustomer(
    displayName(customerObj, { showProjectedEarn: null })
  );
}

    showToast?.(`Order #${data.order_id} created — ${data.total_label || data.chip_label}`, { type: 'success' });
  } catch (err) {
    console.error(err);
    showToast?.(err.message || 'Something went wrong while paying', { type: 'error' });
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    updateCartHeaderCustomerFromCart(cart);
    const btnRemove = document.getElementById('cust-remove');
    if (btnRemove) btnRemove.style.display = 'none';
  }
}

export function wirePayButton() {
  document.getElementById('pay-btn')?.addEventListener('click', onPayClick);
}

//REMOVE CUSTOMER BUTTON
export function wireRemoveButton() {
const btnRemove = document.getElementById('cust-remove');
if (btnRemove) {
  btnRemove.addEventListener('click', async (e) => {
    e.preventDefault();

    btnRemove.disabled = true;
    try {
      await postJSON('/cart/assign_customer/', { customer_id: null });
      window.__currentCustomer__ = null;
      updateCartHeaderCustomer('Guest');
      btnRemove.style.display = 'none';
      showToast?.('Customer removed from cart', { type: 'success' });
    } catch (err) {
      console.error('Remove failed:', err);
      showToast?.('Failed to remove customer', { type: 'error' });
    } finally {
      btnRemove.disabled = false;
    }
  });
}
}

// Discard -> POST /cart/clear/ -> render snapshot
export function wireDiscard() {
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
}

// BOOTSTRAP
document.addEventListener('DOMContentLoaded', async () => {
  setupCartRadios();
  wireRedeemToggle();
  wireCartLineButtons();
  wirePayButton();
  wireDiscard();
  tagDefaultOptionChips();

  // Optional skeleton
  renderCart({
    lines: [],
    discount_code: 'NONE',
    payment_method: 'CARD',
    subtotal_cents: 0, discount_cents: 0, tax_cents: 0, total_cents: 0,
    subtotal_label: '$0.00', discount_label: '$0.00', tax_label: '$0.00', total_label: '$0.00',
    rounding_delta_label: '$0.00',
    loyalty: { projected_points: 0 },
    loyalty_redemption_cents: 0,
    customer: null,
  });

  try {
    const { cart } = await getJSON('/cart/');
    renderCart(cart);
  } catch (e) {
    console.warn('Could not load cart on start:', e.message);
  }
  try {
    const data = await getJSON('/orders/list/?limit=2');
    const orders = (data.orders || []).slice().reverse();
    for (const o of orders) {
      const pm = (o.payment_method === 'CASH') ? 'Cash' : 'Card';
      addInvoiceChip(`${o.total_label} ${pm}`, o.id, 'prev-invoices-list', 2);
    }
  } catch (e) {
    console.warn('Could not load previous invoices:', e);
  }
});
