import { $, $$ } from './dom.js';
import { centsToLabel, showToast, debounce} from './utils.js';
import { getJSON, postJSON, CSRFToken } from './api.js';
import {renderOrderModal} from './orders.js'

const modal       = document.getElementById('customer-modal');
const inputSearch = document.getElementById('cust-search');
const resultsEl   = document.getElementById('cust-results');
const formCreate  = document.getElementById('cust-create');
const btnClose    = document.getElementById('cust-close');
const msgCreate   = document.getElementById('cust-create-msg');
const linkHeader  = document.getElementById('cart-customer-label');

export function displayName(c = {}, opts = {}){
 const { showProjectedEarn = null } = opts;
  const pick = (...vals) =>
    vals.find(v => typeof v === 'string' && v.trim().length > 0)?.trim();

  // Build the best "name" we can
  const first = pick(c.fname,);
  const last  = pick(c.lname);
  const combo = pick([first, last].filter(Boolean).join(' ')); // "" if both missing

  // Fallbacks if combo is empty
  const base =
    combo ||
    pick(c.name, String(c.phone ?? '')) ||
    'Customer';

   const rawPts = c.points_balance ?? null;
  const numPts = Number.isFinite(Number(rawPts)) ? Number(rawPts) : null;

  let earnSuffix = '';
  if (Number.isFinite(showProjectedEarn)) {
    const earn =Math.floor(showProjectedEarn / 100);
    earnSuffix = ` (+${earn} pts)`;
  }
  const ptsSuffix = numPts !== null ? ` • ${numPts} pts` : '';

  return base + ptsSuffix+ earnSuffix;
  }

function updateCartHeaderCustomer(name) {
  const el =
    document.getElementById('cart-customer-label') ||
    document.querySelector('a[data-role="customer-link"]');

  if (el) el.textContent = `${name || 'Guest'}`;
//  window.__cartCustomerName = name || 'Guest';
}

// Order modal header e.g.
// <div class="row"><strong>Customer:</strong> <span id="order-customer-label">Guest</span></div>
function updateOrderHeaderCustomer(name) {
  const el = document.getElementById('customerHtml');
  if (el) el.textContent = name || 'Guest';
  reloadOrderModal();
}

// ---------- Open/close ----------
export function openCustomerModal({ orderId = null, preset = '' } = {}){
 assignOrderId = (orderId !== null && Number.isFinite(Number(orderId))) ? Number(orderId) : null;
  if(!modal) return;
  inputSearch.value = '';
  resultsEl.innerHTML = '';
  msgCreate.textContent = '';
  modal.classList.remove('hidden');
modal.style.display = 'flex';
document.body.style.overflow = 'hidden';
  inputSearch.focus();
}
export function closeCustomerModal(){ modal.style.display = 'none';
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    assignOrderId = null;
 }
export async function reloadOrderModal(orderId) {

try{
  const { ok, order } = await getJSON(`/orders/${orderId}/`);
  if (ok && order) {
    const backdrop = document.getElementById('order-modal-backdrop');
    renderOrderModal(order);
    if (backdrop) {
      backdrop.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }
  }catch(e){
  showToast?.('Could not reload order', { type: 'error' });
  }
}


function renderSearchResults(list){
  if(!list.length){ resultsEl.innerHTML = `<div class="row">No results</div>`; return; }
  resultsEl.innerHTML = '';
  for(const customer of list){
  const normalized = {
      ...customer,
      points_balance: customer.points_balance ?? 0
    };
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div>
        <div style="font-weight:600">${displayName(customer)}</div>
        <div style="opacity:.75; font-size:.9rem">${customer.phone||''}${customer.email? ' · '+customer.email : ''}</div>
      </div>
      <div><button class="btn primary">Assign</button></div>
    `;
    row.querySelector('button').onclick = () => assignExistingToCart(customer.id, customer);
    resultsEl.appendChild(row);
  }
}

// ---------- Assign to CART ----------
function modeEndpoint() {
  return assignOrderId
    ? `/orders/${assignOrderId}/assign_customer/`
    : `/cart/assign_customer/`;
}

async function assignExistingToCart(customerId, customerObj) {
  const url = modeEndpoint();
  const currentOrderId = assignOrderId;

 try {
    await postJSON(url, { customer_id: customerId });
  } catch (e) {
    showToast?.('Assign failed', { type: 'error' });
    return;
  }
  console.debug('POST →', url, 'assignOrderId=', assignOrderId);
    CURRENT_CUSTOMER = {
    ...customerObj,
    points_balance: customerObj.points_balance  ?? null
  };

  if (currentOrderId) {
    // ORDER mode
    await reloadOrderModal(currentOrderId);
  } else {
    // CART mode — fetch a fresh cart snapshot (don’t rely on cache here)
    try {
      const { cart } = await getJSON('/cart/');   // returns your full snapshot
      if (cart) {
        // keep your module cache current (no window usage)
        renderCart(cart);            // refresh UI
      }
    } catch (e) {
      console.warn('Could not fetch cart after assign:', e);
    }

    updateCartHeaderCustomer(
      displayName(customerObj, { showProjectedEarn: subtotalCents })
    );

    if (btnRemove) btnRemove.style.display = 'inline';
  }

  closeCustomerModal();
}
async function createAndAssignCustomer(fd) {
  const payload = {
    create: {
      fname: (fd.get('fname') || '').trim(),
      lname: (fd.get('lname') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      email: (fd.get('email') || '').trim(),
    }
  };
  if (!payload.create.phone) {
    if (msgCreate) msgCreate.textContent = 'Phone is required';
    return;
  }

  const url = modeEndpoint();
  try {
    await postJSON(url, payload);
    if (assignOrderId) {
      await reloadOrderModal(assignOrderId);
    } else {
      // UX-only header update; server cart will reflect on next render
      updateCartHeaderCustomer(displayName(payload.create));
      const removeBtn = document.getElementById('cust-remove');
      if (removeBtn) removeBtn.style.display = 'inline';
    }
    closeCustomerModal();
  } catch (e) {
    if (msgCreate) msgCreate.textContent = 'Could not create/assign (duplicate phone or invalid email?)';
  }
}


export function initCustomers( {renderCart, getCartSubtotal}={}) {
modal       = document.getElementById('customer-modal');
  inputSearch = document.getElementById('cust-search');
  resultsEl   = document.getElementById('cust-results');
  formCreate  = document.getElementById('cust-create');
  btnClose    = document.getElementById('cust-close');
  msgCreate   = document.getElementById('cust-create-msg');
  linkHeader  = document.getElementById('cart-customer-label');
  btnRemove   = document.getElementById('cust-remove');
const doSearch = debounce(async (q)=>{
  if(!q || !q.trim()){ resultsEl.innerHTML=''; return; }
  try{
    const data = await getJSON(`/customers/list/?q=${encodeURIComponent(q)}&limit=20&with_orders=brief`);
    console.log(data)
    renderSearchResults(data.customers || []);
  }catch(e){
    resultsEl.innerHTML = `<div class="row">Error searching</div>`;
  }
}, 250);
document.addEventListener('submit', async (e) => {
 const el = e.target;

  // Only handle our specific form, and guard types
  if (!(el instanceof HTMLFormElement) || el.id !== 'cust-create') return;

  const formEl = el;
  e.preventDefault();

  const fd = new FormData(formCreate);
  await createAndAssignCustomer(new FormData(formCreate));
});

// ---------- Wire header link + modal controls ----------
linkHeader?.addEventListener('click', (e)=>{ e.preventDefault(); openCustomerModal(); });
inputSearch?.addEventListener('input', (e)=> doSearch(e.target.value));
btnClose?.addEventListener('click', closeCustomerModal);

}