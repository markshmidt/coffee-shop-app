// customers-manage.js (module)

import { $, $$, on } from "./dom.js";
import { getJSON, postJSON, CSRF } from "./api.js";

let customers = [];
let nextCursor = null;
let currentQuery = "";
let editingId = null;

// API endpoints
const API = {
    LIST: "/api/customers/",
    DETAIL: id => `/api/customers/${id}/`,
    ORDERS: id => `/api/customers/${id}/orders/`,
    UPDATE: id => `/api/customers/${id}/update/`,
    DELETE: id => `/api/customers/${id}/delete/`,
    CREATE: "/api/customers/add/",
}
// ============================================================================
// INIT ENTRY
// ============================================================================
export function initCustomersManage() {
    console.log("Customers Manage INIT");

    if (!$("#customers-feed")) return;

    setupEvents();
    loadCustomers();
}

// ============================================================================
// EVENT SETUP
// ============================================================================
function setupEvents() {
    const searchInput = $("#cust-search");

    // Search with debounce
    let timer = null;
    searchInput?.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            currentQuery = searchInput.value.trim();
            customers = [];
            nextCursor = null;
            $("#customers-feed").innerHTML = "";
            loadCustomers();
        }, 250);
    });

    $("#btn-load-more")?.addEventListener("click", () => {
        if (nextCursor) loadCustomers();
    });

    $("#btn-add-customer")?.addEventListener("click", () => openCustomerModal(null));

    // Delegated: clicking a customer-card opens modal
    on(document, "click", ".customer-card", (_, card) => {
        openCustomerModal(Number(card.dataset.id));
    });

    // Modal controls
    $("#cust-modal-close").addEventListener("click", hideModal);
    $("#customer-modal .modal-backdrop").addEventListener("click", hideModal);

    $("#btn-save-customer").addEventListener("click", saveCustomer);
    $("#btn-delete-customer").addEventListener("click", deleteCustomer);
}

// ============================================================================
// LOAD CUSTOMERS
// ============================================================================
async function loadCustomers() {
    let url = `${API.LIST}?limit=16&with_orders=brief`;

    if (currentQuery) url += `&q=${encodeURIComponent(currentQuery)}`;
    if (nextCursor) url += `&cursor=${nextCursor}`;

    console.log("📡 Loading:", url);
    const data = await getJSON(url);

    if (!data.ok) return;

    customers = customers.concat(data.customers);
    nextCursor = data.next_cursor;

    renderCustomers();
}

// ============================================================================
// RENDER LIST
// ============================================================================
function renderCustomers() {
    const feed = $("#customers-feed");
    feed.innerHTML = "";

    customers.forEach(c => {
        const last = c.last_order
            ? `${c.last_order.when} — ${c.last_order.total_label}`
            : "No recent orders";

        feed.insertAdjacentHTML("beforeend", `
            <div class="customer-card" data-id="${c.id}">
                <header><h3>${c.name || "(No name)"}</h3></header>

                <div class="section">
                    <div class="muted">📞 ${c.phone || "-"}</div>
                    <div class="muted">✉️ ${c.email || "-"}</div>
                </div>

                <div class="section">
                    <span class="pill">Points: ${c.points_balance ?? 0}</span>
                    <span class="pill">Orders: ${c.order_count ?? 0}</span>
                </div>

                <div class="section muted">Last: ${last}</div>
            </div>
        `);
    });
}

// ============================================================================
// MODAL
// ============================================================================
function showModal() {
    const modal = $("#customer-modal");
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
}

function hideModal() {
    const modal = $("#customer-modal");
    modal.classList.add("hidden");
    modal.style.display = "none";
    document.body.style.overflow = "";
    editingId = null;
}


async function openCustomerModal(id) {
    showModal();
    console.log("openCustomerModal worked!")

    editingId = id;

    const title = $("#cust-modal-title");
    const delBtn = $("#btn-delete-customer");


    if (id === null) {
        title.textContent = "New Customer";
        delBtn.classList.add("hidden");
        fillModalFields({ fname: "", lname: "", phone: "", email: "", points_balance: 0 });
        $("#cust-recent-orders").innerHTML = "";
        return;
    }

    title.textContent = `Customer #${id}`;
    delBtn.classList.remove("hidden");

    const data = await getJSON(API.DETAIL(id));
    if (!data.ok) return alert("Customer not found");

    fillModalFields(data.customer);

    const orderData = await getJSON(API.ORDERS(id));
    renderCustomerOrders(orderData.orders);
}

function fillModalFields(c) {
    $("#cust-fname").value = c.fname || "";
    $("#cust-lname").value = c.lname || "";
    $("#cust-phone").value = c.phone || "";
    $("#cust-email").value = c.email || "";
    $("#cust-points").value = c.points_balance ?? 0;
}

function renderCustomerOrders(list) {
    const ul = $("#cust-recent-orders");
    ul.innerHTML = "";

    list.forEach(o => {
        ul.insertAdjacentHTML("beforeend", `
            <li>#${o.id} • ${o.created_at} • ${o.total_label}</li>
        `);
    });
}

// ============================================================================
// SAVE CUSTOMER
// ============================================================================
async function saveCustomer() {
    const payload = {
        fname: $("#cust-fname").value.trim(),
        lname: $("#cust-lname").value.trim(),
        phone: $("#cust-phone").value.trim(),
        email: $("#cust-email").value.trim(),
        points_balance: Number($("#cust-points").value) || 0,
        csrfmiddlewaretoken: CSRF,
    };

    let url = editingId ? API.UPDATE(editingId) : API.CREATE;

    const res = await postJSON(url, payload);
    if (!res.ok) return alert("Save failed!");

    hideModal();

    // Better UX: reload customers list without page refresh
    customers = [];
    nextCursor = null;
    loadCustomers();
}

// ============================================================================
// DELETE CUSTOMER
// ============================================================================
async function deleteCustomer() {
    if (!editingId) return;

    if (!confirm("Delete customer?")) return;

    const res = await postJSON(API.DELETE(editingId), { csrfmiddlewaretoken: CSRF });
    if (!res.ok) return alert("Delete failed!");

    hideModal();

    customers = customers.filter(c => c.id !== editingId);
    renderCustomers();
}
