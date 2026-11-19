/**
 * Módulo de Gráficos (Chart.js)
 */

import { store, toDisplayUnit } from "./state.js";

let bloodChart = null;
let adiposeChart = null;
let intakeChart = null;

function getChartThemeColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    text: isDark ? "#cbd5e1" : "#475569",
    grid: isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)",
    accent: isDark ? "#38bdf8" : "#0284c7",
    accentFill: isDark ? "rgba(56, 189, 248, 0.16)" : "rgba(2, 132, 199, 0.14)",
    bandFill: isDark ? "rgba(56, 189, 248, 0.08)" : "rgba(2, 132, 199, 0.08)",
    optLine: isDark ? "rgba(74, 222, 128, 0.55)" : "rgba(22, 163, 74, 0.55)",
    warnLine: isDark ? "rgba(248, 113, 113, 0.55)" : "rgba(220, 38, 38, 0.55)"
  };
}

export function renderCharts(mainTraj, lowerTraj, upperTraj, totalWeeks) {
  const colors = getChartThemeColors();
  const unit = store.appState.unit;

  const mainPoints = mainTraj.weeks.map((w, i) => ({
    x: w,
    y: Number(toDisplayUnit(mainTraj.levels[i], unit).toFixed(2))
  }));

  const lowerPoints = lowerTraj.weeks.map((w, i) => ({
    x: w,
    y: Number(toDisplayUnit(lowerTraj.levels[i], unit).toFixed(2))
  }));

  const upperPoints = upperTraj.weeks.map((w, i) => ({
    x: w,
    y: Number(toDisplayUnit(upperTraj.levels[i], unit).toFixed(2))
  }));

  const examPoints = store.appState.bloodMeasurements
    .filter((e) => e.week <= totalWeeks)
    .map((e) => ({
      x: e.week,
      y: Number(toDisplayUnit(e.valueNg, unit).toFixed(2)),
      note: e.note || "Examen"
    }));

  const optLow = Number(toDisplayUnit(30, unit).toFixed(1));
  const toxThresh = Number(toDisplayUnit(100, unit).toFixed(1));

  const maxDataY = Math.max(
    toxThresh * 1.05,
    ...upperPoints.map((p) => p.y * 1.1),
    ...examPoints.map((p) => p.y * 1.15)
  );

  const bloodCtx = document.getElementById("bloodChart")?.getContext("2d");
  if (bloodCtx) {
    const datasets = [
      {
        label: `25(OH)D Estimada (${unit})`,
        data: mainPoints,
        borderColor: colors.accent,
        backgroundColor: colors.accentFill,
        borderWidth: 3,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.25,
        fill: false
      },
      {
        label: "Banda Variabilidad Superior (+8%)",
        data: upperPoints,
        borderColor: "transparent",
        backgroundColor: colors.bandFill,
        pointRadius: 0,
        fill: "+1",
        tension: 0.25
      },
      {
        label: "Banda Variabilidad Inferior (-8%)",
        data: lowerPoints,
        borderColor: "transparent",
        backgroundColor: "transparent",
        pointRadius: 0,
        fill: false,
        tension: 0.25
      },
      {
        label: "Exámenes Reales",
        data: examPoints,
        type: "scatter",
        backgroundColor: "#ef4444",
        borderColor: "#ffffff",
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8
      },
      {
        label: `Límite Inferior Óptimo (${optLow} ${unit})`,
        data: [{ x: 0, y: optLow }, { x: totalWeeks, y: optLow }],
        borderColor: colors.optLine,
        borderDash: [6, 6],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      },
      {
        label: `Umbral Alto (${toxThresh} ${unit})`,
        data: [{ x: 0, y: toxThresh }, { x: totalWeeks, y: toxThresh }],
        borderColor: colors.warnLine,
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      }
    ];

    if (bloodChart) {
      bloodChart.data.datasets = datasets;
      bloodChart.options.scales.x.max = totalWeeks;
      bloodChart.options.scales.x.ticks.color = colors.text;
      bloodChart.options.scales.x.title.color = colors.text;
      bloodChart.options.scales.x.grid.color = colors.grid;
      bloodChart.options.scales.y.max = Math.ceil(maxDataY);
      bloodChart.options.scales.y.title.text = `Concentración Sérica (${unit})`;
      bloodChart.options.scales.y.ticks.color = colors.text;
      bloodChart.options.scales.y.title.color = colors.text;
      bloodChart.options.scales.y.grid.color = colors.grid;
      bloodChart.options.plugins.legend.labels.color = colors.text;
      bloodChart.update("none");
    } else {
      bloodChart = new Chart(bloodCtx, {
        type: "line",
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: false },
          plugins: {
            legend: {
              labels: {
                color: colors.text,
                filter: (item) => !item.text.includes("Banda Variabilidad")
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const raw = ctx.raw;
                  if (raw && raw.note) {
                    return `${raw.note}: ${raw.y} ${unit} (Sem ${raw.x})`;
                  }
                  return `${ctx.dataset.label}: ${ctx.parsed.y} ${unit} (Sem ${ctx.parsed.x})`;
                }
              }
            }
          },
          scales: {
            x: {
              type: "linear",
              min: 0,
              max: totalWeeks,
              title: { display: true, text: "Tiempo (Semanas)", color: colors.text },
              ticks: { color: colors.text },
              grid: { color: colors.grid }
            },
            y: {
              min: 0,
              max: Math.ceil(maxDataY),
              title: { display: true, text: `Concentración Sérica (${unit})`, color: colors.text },
              ticks: { color: colors.text },
              grid: { color: colors.grid }
            }
          }
        }
      });
    }
  }

  const adipCtx = document.getElementById("adiposeChart")?.getContext("2d");
  if (adipCtx) {
    const adipDatasets = [
      {
        label: "Reserva Adiposa D3 (kUI)",
        data: mainTraj.weeks.map((w, i) => ({ x: w, y: Number(mainTraj.adiposeReserve[i].toFixed(2)) })),
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.14)",
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.25
      },
      {
        label: "Pool Circulante D3 (kUI)",
        data: mainTraj.weeks.map((w, i) => ({ x: w, y: Number(mainTraj.freeD3[i].toFixed(2)) })),
        borderColor: "#10b981",
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.25
      }
    ];

    if (adiposeChart) {
      adiposeChart.data.datasets = adipDatasets;
      adiposeChart.options.scales.x.max = totalWeeks;
      adiposeChart.options.scales.x.ticks.color = colors.text;
      adiposeChart.options.scales.x.grid.color = colors.grid;
      adiposeChart.options.scales.y.ticks.color = colors.text;
      adiposeChart.options.scales.y.grid.color = colors.grid;
      adiposeChart.options.plugins.legend.labels.color = colors.text;
      adiposeChart.update("none");
    } else {
      adiposeChart = new Chart(adipCtx, {
        type: "line",
        data: { datasets: adipDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { type: "linear", min: 0, max: totalWeeks, ticks: { color: colors.text }, grid: { color: colors.grid } },
            y: { min: 0, ticks: { color: colors.text }, grid: { color: colors.grid } }
          }
        }
      });
    }
  }

  const intakeCtx = document.getElementById("intakeChart")?.getContext("2d");
  if (intakeCtx) {
    const intakeDatasets = [
      {
        label: "Aporte Equivalente (UI/día)",
        data: mainTraj.weeks.map((w, i) => ({ x: w, y: mainTraj.dailyEquivIU[i] })),
        borderColor: "#8b5cf6",
        backgroundColor: "rgba(139, 92, 246, 0.16)",
        borderWidth: 2,
        stepped: true,
        pointRadius: 0,
        fill: true
      }
    ];

    if (intakeChart) {
      intakeChart.data.datasets = intakeDatasets;
      intakeChart.options.scales.x.max = totalWeeks;
      intakeChart.options.scales.x.ticks.color = colors.text;
      intakeChart.options.scales.x.grid.color = colors.grid;
      intakeChart.options.scales.y.ticks.color = colors.text;
      intakeChart.options.scales.y.grid.color = colors.grid;
      intakeChart.options.plugins.legend.labels.color = colors.text;
      intakeChart.update("none");
    } else {
      intakeChart = new Chart(intakeCtx, {
        type: "line",
        data: { datasets: intakeDatasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text } } },
          scales: {
            x: { type: "linear", min: 0, max: totalWeeks, ticks: { color: colors.text }, grid: { color: colors.grid } },
            y: { min: 0, ticks: { color: colors.text }, grid: { color: colors.grid } }
          }
        }
      });
    }
  }
}