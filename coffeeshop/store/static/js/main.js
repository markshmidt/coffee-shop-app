import { initOrdersFeed } from './orders.js';
import { initModals } from './modals.js';
import { postJSON } from './api.js';
import { renderCart } from './cart.js';

document.addEventListener('DOMContentLoaded', () => {
  initOrdersFeed({
    feedSel: '#orders-feed',
    loadMoreSel: '#orders-load-more',
    pageSize: 16,
    onAssignCustomer: ({ orderId }) => {
      // open your customer modal here
       openCustomerModal({ orderId });
    }
  });
});
document.addEventListener('DOMContentLoaded', () => {
  initModals({ renderCart, postJSON });
})