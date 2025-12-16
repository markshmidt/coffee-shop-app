import { getJSON } from "./api.js";

let paymentChart;

/* -------------------------
   Helpers
-------------------------- */
const $ = id => document.getElementById(id);

function centsToDollars(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

function normalizePayments(rows) {
  const map = { Cash: 0, Card: 0, Other: 0 };

  rows.forEach(r => {
    const m = (r.payment_method || "").toLowerCase();
    if (m.includes("cash")) map.Cash += r.count;
    else if (m.includes("card")) map.Card += r.count;
    else map.Other += r.count;
  });

  return map;
}

/* -------------------------
   Payment Chart
-------------------------- */
function renderPaymentChart(counts) {
  const canvas = $("paymentChart");
  const wrapper = canvas.parentElement;

  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const total = values.reduce((a, b) => a + b, 0);

  // No data state
  if (!total) {
    wrapper.innerHTML = `<div class="chart-empty">No payments yet</div>`;
    return;
  }

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
            const index = item.index;
            legend.chart.toggleDataVisibility(index);
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

/* -------------------------
   Dashboard Refresh
-------------------------- */
async function refreshDashboard() {
  const data = await getJSON("/analytics/api/summary/?minutes=60");

  $("kpi-orders").textContent = data.last.orders;
  $("kpi-total").textContent = centsToDollars(data.last.total_cents);
  $("server-time").textContent = data.server_time;
  $("win-min").textContent = data.window_minutes;

  const payments = normalizePayments(data.payment);
  renderPaymentChart(payments);
}

/* -------------------------
   Boot
-------------------------- */
refreshDashboard();
setInterval(refreshDashboard, 5000);
