import { getJSON } from "./api.js";

/* =========================================================
   State
========================================================= */
let paymentChart = null;

/* =========================================================
   DOM helpers (safe)
========================================================= */
const $ = (id) => document.getElementById(id);

function setText(id, value, fallback = "--") {
  const el = $(id);
  if (!el) return;

  el.textContent =
    value === null || value === undefined || value === ""
      ? fallback
      : value;
}

/* =========================================================
   Format helpers
========================================================= */
function centsToDollars(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

/* =========================================================
   Payment normalization
   Converts backend rows → { Cash, Card, Other }
========================================================= */
function normalizePayments(rows) {
  const result = {
    Cash: 0,
    Card: 0,
    Other: 0,
  };

  if (!Array.isArray(rows)) return result;

  rows.forEach((row) => {
    const method = (row.payment_method || "").toLowerCase();
    const count = Number(row.count) || 0;

    if (method.includes("cash")) result.Cash += count;
    else if (method.includes("card")) result.Card += count;
    else result.Other += count;
  });

  return result;
}

/* =========================================================
   Payment Split Chart (Chart.js)
========================================================= */
function renderPaymentChart(counts) {
  const canvas = $("paymentChart");
  const empty = $("payment-empty");

  if (!canvas) return;

  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const total = values.reduce((a, b) => a + b, 0);

  // ---------- EMPTY ----------
  if (!total) {
    if (empty) empty.classList.remove("hidden");
    canvas.style.display = "none";
    return;
  }

  // ---------- HAS DATA ----------
  if (empty) empty.classList.add("hidden");
  canvas.style.display = "block";

  const percents = values.map(v =>
    ((v / total) * 100).toFixed(1)
  );

  const colors = ["#c9a46b", "#8b5e3c", "#b08968"];

  if (paymentChart) {
    paymentChart.data.datasets[0].data = values;
    paymentChart.update();
    return;
  }

  paymentChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#f7efe2"
      }]
    },
    options: {
      cutout: "68%",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            generateLabels(chart) {
              const d = chart.data.datasets[0];
              return chart.data.labels.map((label, i) => ({
                text: `${label} • ${percents[i]}%`,
                fillStyle: d.backgroundColor[i],
                hidden: !chart.getDataVisibility(i),
                index: i
              }));
            }
          },
          onClick(_, item, legend) {
            legend.chart.toggleDataVisibility(item.index);
            legend.chart.update();
          }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              return `${ctx.label}: ${ctx.raw} orders (${percents[ctx.dataIndex]}%)`;
            }
          }
        }
      }
    }
  });
}


/* =========================================================
   Dashboard refresh
========================================================= */
async function refreshDashboard() {
  try {
    const response = await getJSON("/analytics/api/summary/?minutes=60");

    /* =========================
       KPIs
    ========================= */
    setText("kpi-orders", response?.all_time?.orders);
    setText(
      "kpi-total",
      centsToDollars(response?.all_time?.revenue_cents)
    );
    setText("kpi-refunded", response?.all_time?.refunded_orders);
    setText(
      "kpi-refund-rate",
      response?.all_time?.refund_rate != null
        ? `${response.all_time.refund_rate}%`
        : "--%"
    );

    setText("server-time", response?.server_time);
    setText("win-min", response?.window_minutes);

    /* =========================
       Payment Split (Chart.js)
    ========================= */
    const paymentCounts = normalizePayments(response?.payment);
    renderPaymentChart(paymentCounts);

    /* =========================
       Daily Trends (Plotly)
    ========================= */
    renderDailyPlotly(response?.data);

  } catch (error) {
    console.error("Analytics refresh failed:", error);
  }
}

function buildDailySeries(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const days = [...new Set(rows.map(r => r.day))].sort();

  const cash = {};
  const card = {};

  days.forEach(d => {
    cash[d] = 0;
    card[d] = 0;
  });

  rows.forEach(r => {
    if (r.payment_method === "CASH") cash[r.day] += r.orders;
    if (r.payment_method === "CARD") card[r.day] += r.orders;
  });

  return {
    days,
    cash: days.map(d => cash[d]),
    card: days.map(d => card[d]),
  };
}
function renderDailyPlotly(rows) {
  const container = document.getElementById("dailyChart");
  if (!container) return;

  const series = buildDailySeries(rows);
  if (!series) {
    container.innerHTML = "<div class='chart-empty'>No daily data yet</div>";
    return;
  }

  const traces = [
    {
      x: series.days,
      y: series.cash,
      name: "Cash",
      type: "bar",
      marker: { color: "#c9a46b" }
    },
    {
      x: series.days,
      y: series.card,
      name: "Card",
      type: "bar",
      marker: { color: "#8b5e3c" }
    }
  ];

  const layout = {
    barmode: "stack",
    margin: { t: 20 },
    legend: { orientation: "h", y: -0.25 },
    xaxis: { title: "Date" },
    yaxis: { title: "Orders" },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)"
  };

  Plotly.newPlot(container, traces, layout, { responsive: true });
}

/* =========================================================
   Boot
========================================================= */
refreshDashboard();
setInterval(refreshDashboard, 5000);
