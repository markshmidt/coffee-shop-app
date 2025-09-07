
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

// ===== Price update =====
(() => {
  const fmt = c => '$' + (c/100).toFixed(2);
  const int = v => parseInt(v, 10);
const dollarsToCents = v => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
  // Calculate total for one modal
  function total_modal(modal) {
    let total = 0;
    // If this item has variants, require one and use its price.

    const variantActive = modal.querySelector('.variant-row .chip-btn.active'); //selected size button
    const hasVariants = !!modal.querySelector('.variant-row [data-variant-id]');


   if (hasVariants) {
    if (!variantActive) {
      total = null;                         // require a size
    } else {
      total = int(variantActive.dataset.priceCents);

   console.log(int(variantActive.dataset.priceCents))// <-- CENTS
      if (!variantActive.dataset.priceCents) {
        console.warn('Missing data-price-cents on variant button:', variantActive);
      }
    }
  } else {
    total = int(modal.dataset.baseCents);         // <-- CENTS
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
        renderCart(cart);                                         // <-- re-render
        modal.style.display = 'none';                             // close modal
      } catch (err) {
        console.error(err);
      }
    }
  });
})();



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

// ------- rendering --------
function renderCart(cart) {
  const linesLst = document.getElementById('cart-lines');     // container for all lines
  const sub  = document.querySelector('#cart-subtotal span:last-child');  // subtotal
  if (!linesLst || !sub) return;

  // 1) clear current DOM
  linesLst.innerHTML = '';

  // 2) if empty, show a message
  if (!cart.lines || cart.lines.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'line';
    empty.innerHTML = `<div class="cart-row muted">Cart is empty</div>`;
    linesLst.appendChild(empty);
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

  // set subtotal label
  sub.textContent = cart.subtotal_label || centsToLabel(cart.subtotal_cents);
}


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
