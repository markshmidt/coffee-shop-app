import { $, on } from "./dom.js";
import { getJSON, postJSON } from "./api.js";

let editingId = null;

const API = {
  LIST: "/api/customers/",
  DETAIL: id => `/api/customers/${id}/`,
  ORDERS: id => `/api/customers/${id}/orders/?limit=5`,
  CREATE: "/api/customers/add/",
  UPDATE: id => `/api/customers/${id}/update/`,
  DELETE: id => `/api/customers/${id}/delete/`,
};

export function initCustomersManage() {
  if (!$("#customers-feed")) return;

  loadCustomers();
  wireEvents();
}

function wireEvents() {
  $("#btn-add-customer")?.addEventListener("click", () => openManageModal(null));
  $("#manage-modal-close")?.addEventListener("click", closeManageModal);
  $("#manage-save")?.addEventListener("click", saveCustomer);

  // OPEN confirm modal instead of deleting immediately
  $("#manage-delete")?.addEventListener("click", openConfirmDelete);

  $("#btn-confirm-yes")?.addEventListener("click", confirmDelete);
  $("#btn-confirm-no")?.addEventListener("click", closeConfirmModal);

  on(document, "click", ".customer-card", (_, el) => {
    openManageModal(Number(el.dataset.id));
  });

  $("#btn-load-more")?.addEventListener("click", () => {
    loadCustomers(false);
  });
  const searchInput = $("#cust-search");

let searchTimeout = null;

searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimeout);

  searchTimeout = setTimeout(() => {
    nextCursor = null;        // reset pagination
    loadCustomers(true);     // reload from scratch
  }, 300);                   // debounce
});
}


let nextCursor = null;

async function loadCustomers(reset = true) {
  const q = $("#cust-search")?.value?.trim();

  let url;

  if (nextCursor) {
    url = `${API.LIST}?cursor=${nextCursor}`;
  } else {
    url = `${API.LIST}?limit=20`;
  }

  if (q) {
    url += (url.includes("?") ? "&" : "?") + `q=${encodeURIComponent(q)}`;
  }
  const data = await getJSON(url);

  const feed = $("#customers-feed");
  if (reset) feed.innerHTML = "";

  data.customers.forEach(c => {
  feed.insertAdjacentHTML("beforeend", `
    <div class="customer-card" data-id="${c.id}">
      <header class="customer-card__header">
        <div>
          <h3>${c.name || "Unnamed"}</h3>
          <div class="muted">ID #${c.id}</div>
        </div>
        <span class="points-pill">
          ⭐ ${c.points_balance ?? 0} pts
        </span>
      </header>

      <div class="customer-card__body">
        ${c.phone ? `<div class="row"><span>📞</span><span>${c.phone}</span></div>` : ""}
        ${c.email ? `<div class="row"><span>✉️</span><span>${c.email}</span></div>` : ""}
      </div>
    </div>
  `);
});


   nextCursor = data.next_cursor || null;
  $("#customers-more")?.classList.toggle("hidden", !nextCursor);
}

async function openManageModal(id) {
  const modal = $("#customer-manage-modal");
  editingId = id;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const deleteBtn = $("#manage-delete");
if (deleteBtn) {
  deleteBtn.classList.toggle("hidden", !id);
}

  $("#manage-modal-title").textContent = id ? `Customer #${id}` : "New customer";

  $("#manage-recent-orders").innerHTML = "";

  if (!id) {
    clearForm();
    return;
  }

  const { customer } = await getJSON(API.DETAIL(id));
  fillForm(customer);

  const orders = await getJSON(API.ORDERS(id));
  orders.orders.forEach(o => {
    $("#manage-recent-orders").insertAdjacentHTML(
      "beforeend",
      `<li>#${o.id} · ${o.totals.grand_total_label}</li>`
    );
  });
}

function closeManageModal() {
  $("#customer-manage-modal").classList.add("hidden");
  document.body.style.overflow = "";
  editingId = null;
}

function fillForm(c) {
  $("#manage-fname").value = c.fname || "";
  $("#manage-lname").value = c.lname || "";
  $("#manage-phone").value = c.phone || "";
  $("#manage-email").value = c.email || "";
  $("#manage-points").value = c.points_balance || 0;
}

function clearForm() {
  fillForm({});
}

async function saveCustomer() {
  const payload = {
    fname: $("#manage-fname").value,
    lname: $("#manage-lname").value,
    phone: $("#manage-phone").value,
    email: $("#manage-email").value,
    points_balance: Number($("#manage-points").value || 0),
  };

  const url = editingId ? API.UPDATE(editingId) : API.CREATE;
  await postJSON(url, payload);

  closeManageModal();
  loadCustomers();
}

async function deleteCustomer() {
  if (!editingId) return;
  await postJSON(API.DELETE(editingId), {});
  closeManageModal();
  loadCustomers();
}
function openConfirmDelete() {
  $("#confirm-modal")?.classList.remove("hidden");
}

function closeConfirmModal() {
  $("#confirm-modal")?.classList.add("hidden");
}

async function confirmDelete() {
  if (!editingId) return;

  await postJSON(API.DELETE(editingId), {});
  closeConfirmModal();
  closeManageModal();
  loadCustomers();
}
