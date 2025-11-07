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


// CUSTOMER ASSIGN MODAL

// ---------- Small helpers ----------
async function apiGET(url){
  const r = await fetch(url,{credentials:'same-origin'});
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPOST(url, body){
  const r = await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-CSRFToken':CSRF},
    credentials:'same-origin',
    body: JSON.stringify(body||{})
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

function projectedEarnPoints(subtotalCents) {
  const pts = Math.floor(subtotalCents / 100) * 1;
  return Number.isFinite(pts) ? pts : 0;
}
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
    pick(c.display_name, c.name, String(c.phone ?? '')) ||
    'Customer';

   const rawPts = c.points_balance ?? c.points ?? null;
  const numPts = Number.isFinite(Number(rawPts)) ? Number(rawPts) : null;

  let earnSuffix = '';
  if (Number.isFinite(showProjectedEarn)) {
    const earn = projectedEarnPoints(showProjectedEarn);
    earnSuffix = ` (+${earn} pts)`;
  }

  // Show suffix only if points are known. If you prefer to hide 0, change to (numPts > 0)
  const ptsSuffix = numPts !== null ? ` • ${numPts} pts` : '';

  return base + ptsSuffix+ earnSuffix;
  }

// ---------- Elements ----------
const modal       = document.getElementById('customer-modal');
const inputSearch = document.getElementById('cust-search');
const resultsEl   = document.getElementById('cust-results');
const formCreate  = document.getElementById('cust-create');
const btnClose    = document.getElementById('cust-close');
const msgCreate   = document.getElementById('cust-create-msg');
const linkHeader  = document.getElementById('cart-customer-label');

// ---------- Open/close ----------
let assignOrderId = null; // null => cart mode; number => order mode
async function reloadOrderModal(orderId) {
  const { ok, order } = await apiGET(`/orders/${orderId}/`);
  if (ok && order) {
    const backdrop = document.getElementById('order-modal-backdrop');
    renderOrderModal(order);
    if (backdrop) {
      backdrop.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }
}

function openCustomerModal({ orderId = null, preset = '' } = {}){
 assignOrderId = (orderId !== null && Number.isFinite(Number(orderId))) ? Number(orderId) : null;
  console.debug('Customer modal mode:', assignOrderId ? 'ORDER' : 'CART', 'orderId=', assignOrderId);
  if(!modal) return;
  inputSearch.value = '';
  resultsEl.innerHTML = '';
  msgCreate.textContent = '';
  modal.classList.remove('hidden');
modal.style.display = 'flex';
document.body.style.overflow = 'hidden';
  inputSearch.focus();
}
function closeCustomerModal(){ modal.style.display = 'none';
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    assignOrderId = null;
 }

// ---------- Search  ----------
const doSearch = debounce(async (q)=>{
  if(!q || !q.trim()){ resultsEl.innerHTML=''; return; }
  try{
    const data = await apiGET(`/customers/list/?q=${encodeURIComponent(q)}&limit=20&with_orders=brief`);
    console.log(data)
    renderResults(data.customers || []);
  }catch(e){
    resultsEl.innerHTML = `<div class="row">Error searching</div>`;
  }
}, 250);

function renderResults(list){
  if(!list.length){ resultsEl.innerHTML = `<div class="row">No results</div>`; return; }
  resultsEl.innerHTML = '';
  for(const customer of list){
  const normalized = {
      ...customer,
      points_balance: customer.points_balance ?? null
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
function updateCartHeaderCustomer(name) {
  const el =
    document.getElementById('cart-customer-label') ||
    document.querySelector('a[data-role="customer-link"]');

  if (el) el.textContent = `${name || 'Guest'}`;

  // Optional: stash on window so other code can read it
  window.__cartCustomerName = name || 'Guest';
}

// Order modal header e.g.
// <div class="row"><strong>Customer:</strong> <span id="order-customer-label">Guest</span></div>
function updateOrderHeaderCustomer(name) {
  const el = document.getElementById('customerHtml');
  if (el) el.textContent = name || 'Guest';
  reloadOrderModal();
}
// ---------- Assign to CART ----------
function modeEndpoint() {
  return assignOrderId
    ? `/orders/${assignOrderId}/assign_customer/`
    : `/cart/assign_customer/`;
}
function afterAssignLabel(objOrName) {
  return typeof objOrName === 'string'
    ? objOrName
    : displayName(objOrName, { showProjectedEarn: subtotalCents });
}


async function
assignExistingToCart(customerId, customerObj) {
  const url = modeEndpoint();
  const currentOrderId = assignOrderId;

  await apiPOST(url, { customer_id: customerId });
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
        if (isPOS()) renderCart(cart);            // refresh UI
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



// ---------- Create & assign ----------
document.addEventListener('submit', async (e) => {
 const el = e.target;

  // Only handle our specific form, and guard types
  if (!(el instanceof HTMLFormElement) || el.id !== 'cust-create') return;

  const formEl = el;
  e.preventDefault();

  const fd = new FormData(formCreate);
  const payload = {
    create: {
      fname: (fd.get('fname') || '').trim(),
      lname: (fd.get('lname') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      email: (fd.get('email') || '').trim(),
    }
  };
  if (!payload.create.phone) {
    msgCreate.textContent = 'Phone is required';
    return;
  }

  try {
  const url = modeEndpoint();
  console.debug('CREATE →', url, 'assignOrderId=', assignOrderId);
    await apiPOST(modeEndpoint(), payload);
    if (assignOrderId) {
      await reloadOrderModal(assignOrderId);   // ORDER mode: DB create/attach
    } else {
      // CART mode: only remember intent; update header so UX reflects it
      updateCartHeaderCustomer(displayName(payload.create));
      if (btnRemove) btnRemove.style.display = 'inline';
    }
    closeCustomerModal();
  } catch (e) {
    msgCreate.textContent = 'Could not create/assign (maybe duplicate phone or invalid email)';
  }
});

// ---------- Wire header link + modal controls ----------
linkHeader?.addEventListener('click', (e)=>{ e.preventDefault(); openCustomerModal(); });
inputSearch?.addEventListener('input', (e)=> doSearch(e.target.value));
btnClose?.addEventListener('click', closeCustomerModal);

// ---------- Update header helper ----------
function updateCartHeaderCustomer(name){
  if(linkHeader) linkHeader.textContent = `${name || 'Guest'}`;
}
export function updateCartHeaderFromCart(cart) {
  const el = document.getElementById('cart-customer-label')
         || document.querySelector('a[data-role="customer-link"]');
  if (!el) return;
  if (cart?.customer) {
    const { fname='', lname='', phone='' } = cart.customer;
    const name = [fname, lname].filter(Boolean).join(' ') || phone || 'Customer';
    el.textContent = name;
    document.getElementById('cust-remove')?.classList.remove('hidden');
  } else {
    el.textContent = 'Guest';
    document.getElementById('cust-remove')?.classList.add('hidden');
  }
}
