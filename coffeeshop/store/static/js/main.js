
import { getJSON, postJSON } from './api.js';
import { renderCart, setupCartRadios, wireCartLineButtons, wireDiscard, wirePayButton, addInvoiceChip, tagDefaultOptionChips, wireRedeemToggle, wireRemoveButton } from './cart.js';
import { initOrdersFeed } from './orders.js';
import { initCustomers } from './customers.js';
import { startClocks, isPOS } from './utils.js';
import { initCategories } from './categories.js';
import { initModals } from './items.js';

function bootstrap() {
  if (!isPOS()) return;

  startClocks(['clock', 'clock2']);
  initCategories();

  initModals({ renderCart, postJSON });

  setupCartRadios(renderCart);
  wireCartLineButtons(renderCart);
  wireDiscard(renderCart);
  wirePayButton(renderCart);
  wireRedeemToggle(renderCart);
  wireRemoveButton();
  tagDefaultOptionChips();

  initOrdersFeed({ feedSel: '#orders-feed', loadMoreSel: '#orders-load-more', pageSize: 16 });

  initCustomers({
    renderCart,
    getCartSubtotal: (cart) => cart?.subtotal_cents ?? 0,
  });

  // skeleton then load real cart
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

  getJSON('/cart/').then(({ cart }) => renderCart(cart)).catch(() => {});

  // preload a couple of recent invoices
  getJSON('/orders/list/?limit=2').then((data) => {
    const orders = (data.orders || []).slice().reverse();
    for (const o of orders) {
      const pm = (o.payment_method === 'CASH') ? 'Cash' : 'Card';
      addInvoiceChip(`${o.total_label} ${pm}`, o.id, 'prev-invoices-list', 2);
    }
  }).catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
