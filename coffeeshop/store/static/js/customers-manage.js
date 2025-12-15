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
  $("#manage-delete")?.addEventListener("click", deleteCustomer);

  on(document, "click", ".customer-card", (_, el) => {
    openManageModal(Number(el.dataset.id));
  });
}

async function loadCustomers() {
  const { customers } = await getJSON(`${API.LIST}?limit=20`);
  const feed = $("#customers-feed");
  feed.innerHTML = "";

  customers.forEach(c => {
    feed.insertAdjacentHTML("beforeend", `
      <div class="customer-card" data-id="${c.id}">
        <h3>${c.name || "Unnamed"}</h3>
        <div class="muted">${c.phone || ""}</div>
      </div>
    `);
  });
}

async function openManageModal(id) {
  const modal = $("#customer-manage-modal");
  editingId = id;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  $("#manage-delete").style.display = id ? "inline-block" : "none";
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
