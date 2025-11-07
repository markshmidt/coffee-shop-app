//orders.js renders the order feed, opens a modal for order details,
// and provides print/email/refund/assign customer and notes creation

import { $, $$, on } from './dom.js';
import { getJSON } from './api.js';
import { showToast, centsToLabel } from './utils.js';


export async function openOrderModal(orderId) {
//fetches orders/id/, shows the modal and renderes it
  try {
    const { ok, order } = await getJSON(`/orders/${orderId}/`);
    if (!ok) throw new Error('Load failed');
    renderOrderModal(order);
  } catch (e) {
    console.error('openOrderModal failed:', e);
    showToast?.(e.message || 'Failed to load order', { type: 'error' });
  }
}

export function initOrdersFeed({
//registers one click listener for the orders feed,
  feedSel = '#orders-feed',
  loadMoreSel = '#orders-load-more',
  pageSize = 16,
  onAssignCustomer = null,
} = {}) {
  const feed = document.querySelector(feedSel);
  if (!feed) return;

  const loadMoreBtn = document.querySelector(loadMoreSel);
  let cursor = null;
  let loading = false;

  // Event delegation: open modal on click/keyboard
  on(feed, 'click', (e) => {
    const card = e.target.closest('.order-card');
    if (!card || !feed.contains(card)) return;
    openOrderModal(card.dataset.orderId, { onAssignCustomer });
  });

  // Fetch one page
  const fetchPage = async ({ reset = false } = {}) => {
    if (loading) return;
    loading = true;
    try {
      if (reset) {
        cursor = null;
        feed.innerHTML = '';
      }
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) params.set('cursor', String(cursor));

      const data = await getJSON(`/orders/list/?${params}`);
      (data.orders || []).forEach((o) => feed.appendChild(renderOrderCard(o)));
      cursor = data.next_cursor || null;
      if (loadMoreBtn) loadMoreBtn.style.display = cursor ? '' : 'none';
    } catch (e) {
      console.error(e);
      showToast?.('Could not load orders', { type: 'error' });
    } finally {
      loading = false;
    }
  };

  // Initial load + load-more
  fetchPage({ reset: true });
  loadMoreBtn?.addEventListener('click', () => fetchPage({ reset: false }));
}

// RENDER ORDER
export function renderOrderCard(o) {
//renders order card
    const card = document.createElement('article');
    card.className = 'order-card';
    card.dataset.orderId = o.id;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open order #${o.id}`);

card.innerHTML = `
    <header>
      <div><h3>#${o.id}</h3></div>
      <div class="muted">${o.when_label} · by ${o.created_by}</div>
    </header>
    <ul class="items">
      ${(o.items || []).map(it => `
        <li>
          <div class="left"><span class="order-badge">×${it.qty}</span> <span>${it.label}</span></div>
          <span>${it.line_label}</span>
        </li>`).join('')}
    </ul>
    <footer>
      <div>Total ${o.total_label}</div>
      <div class="status-pill status--${o.status?.toLowerCase() || ''}">${o.status || ''}</div>
      <div class="payment-pill payment--${o.payment_method?.toLowerCase() || ''}">${o.payment_method || ''}</div>
    </footer>
  `;
    return card;
  }
});

function ensureOrderModal() {
//checks if the backdrop already exists and creates it
  let el = document.getElementById('order-modal-backdrop');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'order-modal-backdrop';
  el.className = 'modal-backdrop';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title">
      <div class="modal-header">
        <h4 id="order-modal-title">Order</h4>
        <button class="close-modal" aria-label="Close">✕</button>
      </div>

      <div class="modal-toolbar">
        <button id="order-btn-print">Print receipt</button>
         <button id="order-btn-email"> Email receipt </button>
        <button id="order-btn-refund">Refund</button>
        <button id="order-btn-assign" data-order-id="{{ order.id }}">Assign customer</button>

      </div>

      <div class="modal-body" id="order-modal-content"></div>
    </div>
  `;
  document.body.appendChild(el);

  // Close handlers
  el.addEventListener('click', (e) => { if (e.target === el) hideOrderModal(); });
  el.querySelector('.close-modal').addEventListener('click', hideOrderModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.style.display !== 'none') hideOrderModal();
  });

  return el;
}

function showOrderModal() {
//sets a loading placeholder in the body
  const m = ensureOrderModal();
  m.style.display = 'flex';
  document.body.style.overflow = 'hidden'; //prevent scroll
  const body = document.getElementById('order-modal-content');
  body.innerHTML = `<div class="muted">Loading order…</div>`;
}

function hideOrderModal() {
  const m = document.getElementById('order-modal-backdrop');
  document.body.style.overflow = '';
  if (m) m.style.display = 'none';
}


function renderOrderModal(order) {
  const m = ensureOrderModal();
  m.style.display = 'flex';
  document.getElementById('order-modal-title').textContent =
    `Order #${order.id}`;

  const itemsHtml = (order.items || []).map(it => {
    // fallbacks so we never print "undefined"
    const qty = it.qty || 1;

    const baseUnit = Number.isFinite(it.base_unit_cents)
      ? it.base_unit_cents
      : Math.max(0, (it.unit_cents || 0) - (it.mods_unit_cents || 0));

    const baseUnitLabel  = it.base_unit_label  || centsToLabel(baseUnit);
    const baseTotalLabel = it.base_total_label || centsToLabel(baseUnit * qty);

    const modsUnit       = Number.isFinite(it.mods_unit_cents) ? it.mods_unit_cents : 0;
    console.log(modsUnit)
    const modsUnitLabel  = it.mods_unit_label  || centsToLabel(modsUnit);
    const modsTotalLabel = it.mods_total_label || centsToLabel(modsUnit * qty);

    const modifiersHtml = (it.modifiers || []).map(m => {
    // support either price_* or delta_* naming
    const delta = Number.isFinite(m.price_cents) ? m.price_cents
                 : Number.isFinite(m.delta_cents) ? m.delta_cents
                 : 0;
    const unitLabel = m.price_label || m.delta_label || centsToLabel(delta);
    const signUnit  = delta > 0 ? `(+${unitLabel})` : `(${unitLabel})`; // shows (+$1.20), ($0.00) or (-$0.50)
    const extPart   = qty > 1 ? ` — ×${qty} = ${centsToLabel(delta * qty)}` : '';
    const groupTxt  = m.group ? `${m.group}: ` : '';
    const choiceTxt = m.choice || '';
    return `<div class="muted small">${groupTxt}${choiceTxt} ${signUnit}${extPart}</div>`;
  }).join('');
    // base vs mods breakdown
    const breakdown = `
      <div class="muted small">
        base ${baseUnitLabel} ×${qty} = ${baseTotalLabel}

      </div>
    `;

    return `
      <li class="li-line">
        <div class="left">
          <span class="qty">×${qty}</span> ${it.name}
          ${it.variant ? `<span class="muted">· ${it.variant}</span>` : ''}
          ${breakdown}
          ${modifiersHtml}
        </div>
        <div class="right">${it.line_label}</div>
      </li>
    `;
  }).join('');

  const t = order.totals || {};
  const paymentHtml = order.payment_method || '';

  const customerHtml = order.customer
    ? `${order.customer.fname} ${order.customer.phone ? `• ${order.customer.phone}` : ''}`
    : '<span class="muted">Guest customer</span>';
console.debug('[order modal] order.totals =', order?.totals);
console.debug('[order modal] order.loyalty_redemption_cents =', order?.loyalty_redemption_cents);
console.debug('[order modal] loyalty block =', order?.loyalty);

    const redCents =
  (t.loyalty_redemption_cents ?? 0);
  if (redCents===0){
  console.log ("Red cents are 0 from the backend. Computing lable in js...")}
const redLabel =
  t.loyalty_redemption_label
  ?? centsToLabel(redCents);

const loyaltyTotalsLi = redCents > 0
  ? `<li><span>Loyalty</span><span>-${redLabel}</span></li>`
  : '';

const loyaltySummaryHtml =
  (order.loyalty && Number(order.loyalty.redeemed_points) > 0)
    ? `<div class="muted">Redeemed ${order.loyalty.redeemed_points} pts</div>`
    : '';

  document.getElementById('order-modal-content').innerHTML = `
    <section class="section summary">
      <div class="row"><strong>Status:</strong> <span class="status-pill status--${String(order.status || '').toLowerCase()}">${(order.status || '')}</span></div>
      <div class="row"><strong>When:</strong> ${(order.when_label || '')}</div>
      <div class="row"><strong>Customer:</strong> ${customerHtml}</div>
        ${loyaltySummaryHtml}
         ${loyaltyTotalsLi}

    </section>

    <section class="section items">
      <h4>Items: </h5>
      <ul class="list">${itemsHtml}</ul>
    </section>

    <section class="section totals">
      <ul class="list">
        <li><span>Subtotal</span><span>${t.subtotal_label || ''}</span></li>
        <li><span>Discount</span><span>${t.discount_label || '$0.00'}</span></li>
        <li><span>Tax</span><span>${t.tax_label || ''}</span></li>
        <li><span>Rounding</span><span>${t.rounding_label || '$0.00'}</span></li>
        <li class="grand"><span>Total</span><span>${t.grand_total_label || ''}</span></li>
      </ul>
    </section>

    <section class="section payments">
      <h4>Payment: ${paymentHtml} </h5>
    </section>

    <section class="section notes">
      <h5>Notes</h5>
      <textarea id="order-note-input" rows="3" placeholder="Add a note to the order." ${order.permissions?.can_add_note ? '' : 'disabled'}></textarea>
      <div><button id="order-note-save" ${order.permissions?.can_add_note ? '' : 'disabled'}>Save note</button></div>
    </section>
  `;


  // Toolbar buttons
  const perms = order.permissions || {};
  const btnRefund = document.getElementById('order-btn-refund');
  const btnAssign = document.getElementById('order-btn-assign');
  const btnPrint  = document.getElementById('order-btn-print');
  const btnEmail = document.getElementById('order-btn-email')

  btnRefund.classList.toggle('is-disabled', !perms.can_refund);
  btnRefund.setAttribute('aria-disabled', String(!perms.can_refund))
  btnAssign.disabled = !perms.can_assign_customer;
  btnRefund.onclick = () => {
  if (btnRefund.getAttribute('aria-disabled') === 'true') {
    showToast?.('You do not have permission to refund this order.', { type: 'warning' });
    return;
  }
  showToast?.('Not implemented yet', { type: 'info' });
  };
  btnAssign.onclick = () => openCustomerModal({ orderId: Number(order.id) });;


  btnPrint.onclick  = () => {
      openReceipt(`${order.id}`);
      showToast?.('CSV receipt opened in new tab', { type: 'success' });
      }

  btnEmail.onclick  = () => showToast?.('Not implemented yet', { type: 'info' });

    $('order-note-save').onclick = () => {
    const txt = (document.getElementById('order-note-input').value || '').trim();
    if (!txt) return;
    showToast?.('Note saved (stub)', { type: 'success' });
  };
}

// RECEIPT HANDLING
function openReceipt(orderId) {
  const id = orderId;
  if (!id) { showToast?.('Missing order id for receipt', { type: 'error' }); return; }
  // open in a new tab
  window.open(`/orders/${encodeURIComponent(id)}/receipt/`, '_blank', 'noopener,noreferrer');
}

