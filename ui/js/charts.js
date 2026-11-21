/**
 * Módulo de Gráficos Interactivos (Chart.js + Plugins Custom Canvas)
 */

import { store, toDisplayUnit, getDateForWeek } from "./state.js";

let bloodChart = null;
let adiposeChart = null;
let intakeChart = null;

let lastSimSnapshot = null;
let activeCursorWeek = null;
let zoomRange = { min: 0, max: null };
let themePalette = null;
let rafPending = false;
let inspectorRefs = null;

function round2(v) {
  return Math.round(v * 100) / 100;
}
let chartsDirty = false;

export const chartLayers = {
  zones: true,
  band: true,
  doses: true
};

export function invalidateChartThemeCache() {
  themePalette = null;
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || "").trim();
  if (raw.startsWith("rgb")) {
    const nums = raw.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
    }
  }
  let clean = raw.replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(48, 105, 152, ${alpha})`;
}

function getThemePalette() {
  if (themePalette) return themePalette;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const cs = getComputedStyle(document.documentElement);
  const readVar = (name, fb) => cs.getPropertyValue(name).trim() || fb;

  const surface = readVar("--bg-card", isDark ? "#172635" : "#FFFFFF");
  const well = readVar("--bg-well", isDark ? "#111D29" : "#DEEAF5");
  const text = readVar("--text-secondary", isDark ? "#BFD4E8" : "#2B455E");
  const muted = readVar("--text-muted", isDark ? "#8BA8C4" : "#4C6985");
  const helio = readVar("--helio", isDark ? "#F4D175" : "#306998");
  const serum = readVar("--serum", isDark ? "#74B9FF" : "#1E4C73");
  const viridian = readVar("--success", isDark ? "#4ADE80" : "#0E7A48");
  const warning = readVar("--warning", isDark ? "#F4D175" : "#B45309");
  const danger = readVar("--danger", isDark ? "#FF7B7B" : "#C91D22");
  const monoFont = readVar("--font-mono", '"Cascadia Mono", Consolas, monospace');

  themePalette = {
    isDark,
    surface,
    well,
    text,
    muted,
    helio,
    serum,
    viridian,
    warning,
    danger,
    monoFont,
    grid: hexToRgba(muted, isDark ? 0.16 : 0.12),
    crosshair: hexToRgba(helio, 0.78),
    serumFill: hexToRgba(serum, isDark ? 0.14 : 0.10),
    bandFill: hexToRgba(serum, isDark ? 0.10 : 0.08),
    helioFill: hexToRgba(helio, isDark ? 0.16 : 0.12),
    optZone: hexToRgba(viridian, isDark ? 0.10 : 0.08)
  };
  return themePalette;
}

/* Plugin: Bandas Fisiológicas Clínicas de Fondo */
const clinicalZonesPlugin = {
  id: "clinicalZonesPlugin",
  beforeDatasetsDraw(chart) {
    if (chart.canvas.id !== "bloodChart" || !chartLayers.zones) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y) return;

    const palette = getThemePalette();
    const unit = store.appState.unit;
    const y20 = toDisplayUnit(20, unit);
    const y30 = toDisplayUnit(30, unit);
    const y60 = toDisplayUnit(60, unit);
    const y100 = toDisplayUnit(100, unit);

    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();

    const top60 = scales.y.getPixelForValue(y60);
    const bot30 = scales.y.getPixelForValue(y30);
    if (bot30 > top60) {
      ctx.fillStyle = palette.optZone;
      ctx.fillRect(chartArea.left, top60, chartArea.width, bot30 - top60);
    }

    const px20 = scales.y.getPixelForValue(y20);
    const px100 = scales.y.getPixelForValue(y100);

    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexToRgba(palette.danger, 0.45);
    ctx.beginPath();
    ctx.moveTo(chartArea.left, px20);
    ctx.lineTo(chartArea.right, px20);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba(palette.viridian, 0.45);
    ctx.beginPath();
    ctx.moveTo(chartArea.left, top60);
    ctx.lineTo(chartArea.right, top60);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = `700 9px ${palette.monoFont}`;
    ctx.textAlign = "right";
    ctx.fillStyle = hexToRgba(palette.danger, 0.85);
    ctx.fillText(`DEF. < ${y20.toFixed(0)}`, chartArea.right - 8, px20 - 4);
    ctx.fillStyle = hexToRgba(palette.viridian, 0.9);
    ctx.fillText("ÓPTIMO", chartArea.right - 8, top60 + 12);
    ctx.fillStyle = hexToRgba(palette.danger, 0.85);
    ctx.fillText(`LÍMITE ${y100.toFixed(0)}`, chartArea.right - 8, px100 - 4);

    ctx.restore();
  }
};

/* Plugin: Retícula Vertical Sincronizada (Crosshair + Scrubber) */
const verticalReticlePlugin = {
  id: "verticalReticlePlugin",
  afterDatasetsDraw(chart) {
    if (activeCursorWeek == null) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) return;

    const xPx = scales.x.getPixelForValue(activeCursorWeek);
    if (xPx < chartArea.left || xPx > chartArea.right) return;

    const palette = getThemePalette();
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.crosshair;
    ctx.moveTo(xPx, chartArea.top);
    ctx.lineTo(xPx, chartArea.bottom);
    ctx.stroke();

    if (chart.canvas.id === "bloodChart" && lastSimSnapshot) {
      const idx = findClosestWeekIndex(lastSimSnapshot.mainTraj.weeks, activeCursorWeek);
      if (idx >= 0) {
        const yVal = toDisplayUnit(lastSimSnapshot.mainTraj.levels[idx], store.appState.unit);
        const yPx = scales.y.getPixelForValue(yVal);
        if (yPx >= chartArea.top && yPx <= chartArea.bottom) {
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(xPx, yPx, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = palette.helio;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = palette.surface;
          ctx.stroke();
        }
      }

      // Anotación discreta del pico máximo proyectado
      const peak = lastSimSnapshot.peak;
      if (peak && scales.y) {
        const peakWeek = peak.week;
        const peakVal = toDisplayUnit(peak.levelNg, store.appState.unit);
        const px = scales.x.getPixelForValue(peakWeek);
        const py = scales.y.getPixelForValue(peakVal);
        if (px >= chartArea.left && px <= chartArea.right && py >= chartArea.top && py <= chartArea.bottom) {
          ctx.setLineDash([]);
          ctx.fillStyle = palette.helio;
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fill();

          const label = `Pico ${peakVal.toFixed(1)} (S${peakWeek.toFixed(1)})`;
          ctx.font = `700 10px ${palette.monoFont}`;
          const tw = ctx.measureText(label).width + 10;
          const tx = Math.min(chartArea.right - tw - 4, Math.max(chartArea.left + 4, px - tw / 2));
          const ty = Math.max(chartArea.top + 4, py - 24);
          ctx.fillStyle = palette.surface;
          ctx.strokeStyle = palette.helio;
          ctx.lineWidth = 1;
          ctx.fillRect(tx, ty, tw, 17);
          ctx.strokeRect(tx, ty, tw, 17);
          ctx.fillStyle = palette.helio;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(label, tx + 5, ty + 8.5);
        }
      }
    }
    ctx.restore();
  }
};

function findClosestWeekIndex(weeksArr, targetWeek) {
  if (!weeksArr || weeksArr.length === 0) return -1;
  return Math.max(0, Math.min(weeksArr.length - 1, Math.round(targetWeek * 7)));
}

function getInspectorRefs() {
  if (!inspectorRefs) {
    inspectorRefs = {
      weekBadge: document.getElementById("scrubberWeekLabel"),
      concVal: document.getElementById("scrubberConcVal"),
      adipVal: document.getElementById("scrubberAdipVal"),
      intakeVal: document.getElementById("scrubberIntakeVal"),
      readout: document.getElementById("scrubberReadout"),
      scrubber: document.getElementById("chartScrubber")
    };
  }
  return inspectorRefs;
}

function updateInspectorUI(week) {
  if (!lastSimSnapshot) return;
  const { mainTraj, lowerTraj, upperTraj } = lastSimSnapshot;
  const idx = findClosestWeekIndex(mainTraj.weeks, week);
  if (idx < 0) return;

  const w = mainTraj.weeks[idx];
  const unit = store.appState.unit;
  const cMain = toDisplayUnit(mainTraj.levels[idx], unit).toFixed(1);
  const cLow = toDisplayUnit(lowerTraj.levels[idx], unit).toFixed(1);
  const cHigh = toDisplayUnit(upperTraj.levels[idx], unit).toFixed(1);
  const adip = mainTraj.adiposeReserve[idx].toFixed(1);
  const intake = mainTraj.dailyEquivIU[idx].toLocaleString();

  const { weekBadge, concVal, adipVal, intakeVal, readout, scrubber } = getInspectorRefs();

  const dateStr = getDateForWeek(store.appState.bodyProfile.startDate, w);
  if (weekBadge) weekBadge.textContent = `SEM ${w.toFixed(1)}${dateStr ? " • " + dateStr : ""}`;
  if (concVal && adipVal && intakeVal) {
    concVal.textContent = `${cMain} ${unit} [${cLow}–${cHigh}]`;
    adipVal.textContent = `${adip} kUI`;
    intakeVal.textContent = `${intake} UI/d`;
  } else if (readout) {
    readout.textContent = `25(OH)D: ${cMain} ${unit} [${cLow}–${cHigh}] • Reserva D3: ${adip} kUI • Aporte: ${intake} UI/d`;
  }
  if (scrubber && Math.abs(Number(scrubber.value) - w) > 0.01) {
    scrubber.value = String(w);
  }
}

export function setInspectedWeek(week, redraw = true) {
  activeCursorWeek = week;
  if (!redraw) {
    updateInspectorUI(week);
    return;
  }
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    updateInspectorUI(activeCursorWeek);
    bloodChart?.draw();
    adiposeChart?.draw();
    intakeChart?.draw();
  });
}

function bindCanvasPointerSync(canvas, getChart) {
  if (!canvas || canvas.dataset.pointerBound === "true") return;
  canvas.dataset.pointerBound = "true";

  const handlePointer = (clientX) => {
    const chart = getChart?.();
    if (!chart || !lastSimSnapshot) return;
    const rect = canvas.getBoundingClientRect();
    const relX = clientX - rect.left;
    const xScale = chart.scales?.x;
    if (!xScale) return;
    const rawWeek = xScale.getValueForPixel(relX);
    const clamped = Math.max(0, Math.min(lastSimSnapshot.totalWeeks, Number(rawWeek.toFixed(2))));
    setInspectedWeek(clamped, true);
  };

  canvas.addEventListener("mousemove", (e) => handlePointer(e.clientX));
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length > 0) handlePointer(e.touches[0].clientX);
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 0) handlePointer(e.touches[0].clientX);
    },
    { passive: true }
  );
}

function buildDoseMarkers(totalWeeks, baselineY) {
  const d3Markers = [];
  const calciMarkers = [];
  const startDate = store.appState.bodyProfile.startDate;

  store.appState.doses.forEach((d) => {
    const startW = Math.max(0, d.startWeek);
    const endW = Math.min(totalWeeks, d.endWeek);
    const isCalci = d.type === "calcifediol";
    const target = isCalci ? calciMarkers : d3Markers;
    const compound = isCalci ? "Hidroferol (Calcifediol)" : "Colecalciferol D3";
    const doseText = isCalci
      ? `${d.amount || d.ug || 266} µg`
      : `${(d.amount || d.iu || 2000).toLocaleString()} UI`;

    if (d.freq === "single") {
      if (startW <= totalWeeks) {
        const dateStr = getDateForWeek(startDate, startW);
        target.push({
          x: startW,
          y: baselineY,
          note: `${compound} (${doseText}, bolo único)${dateStr ? " • " + dateStr : ""}`
        });
      }
      return;
    }

    const stepW =
      d.freq === "daily" ? 1 :
      d.freq === "weekly" ? 1 :
      d.freq === "biweekly" ? 2 : 4.28;

    for (let w = startW; w < endW; w += stepW) {
      const wk = Number(w.toFixed(2));
      const dateStr = getDateForWeek(startDate, wk);
      target.push({
        x: wk,
        y: baselineY,
        note: `${compound} (${doseText}, ${d.freq})${dateStr ? " • " + dateStr : ""}`
      });
    }
  });
  return { d3Markers, calciMarkers };
}

export function adjustChartZoom(action, totalWeeks) {
  const maxW = totalWeeks || lastSimSnapshot?.totalWeeks || 24;
  if (action === "reset") {
    zoomRange = { min: 0, max: maxW };
  } else {
    const curMin = zoomRange.min ?? 0;
    const curMax = zoomRange.max ?? maxW;
    const span = curMax - curMin;
    const center = activeCursorWeek != null ? activeCursorWeek : (curMin + curMax) / 2;

    if (action === "in") {
      const nextSpan = Math.max(4, span * 0.6);
      const nextMin = Math.max(0, center - nextSpan / 2);
      const nextMax = Math.min(maxW, nextMin + nextSpan);
      zoomRange = { min: Number(nextMin.toFixed(1)), max: Number(nextMax.toFixed(1)) };
    } else if (action === "out") {
      const nextSpan = Math.min(maxW, span * 1.5);
      const nextMin = Math.max(0, center - nextSpan / 2);
      const nextMax = Math.min(maxW, nextMin + nextSpan);
      zoomRange = { min: Number(nextMin.toFixed(1)), max: Number(nextMax.toFixed(1)) };
    }
  }

  if (!bloodChart) {
    rerenderChartsFromSnapshot();
    return;
  }
  [bloodChart, adiposeChart, intakeChart].forEach((chart) => {
    if (!chart) return;
    chart.options.scales.x.min = zoomRange.min;
    chart.options.scales.x.max = zoomRange.max;
    chart.update("none");
  });
}

export function toggleChartLayer(layerKey) {
  if (layerKey in chartLayers) {
    chartLayers[layerKey] = !chartLayers[layerKey];
  }
  if (layerKey === "zones" && bloodChart) {
    bloodChart.update("none");
  } else {
    rerenderChartsFromSnapshot();
  }
  return chartLayers[layerKey];
}

export function rerenderChartsFromSnapshot() {
  if (!lastSimSnapshot) return false;
  renderCharts(
    lastSimSnapshot.mainTraj,
    lastSimSnapshot.lowerTraj,
    lastSimSnapshot.upperTraj,
    lastSimSnapshot.totalWeeks
  );
  return true;
}

export function flushChartsIfDirty() {
  if (chartsDirty && lastSimSnapshot) {
    chartsDirty = false;
    rerenderChartsFromSnapshot();
  }
}

export function renderCharts(mainTraj, lowerTraj, upperTraj, totalWeeks) {
  let peak = null;
  if (mainTraj?.levels?.length > 0) {
    let peakIdx = 0;
    for (let i = 1; i < mainTraj.levels.length; i++) {
      if (mainTraj.levels[i] > mainTraj.levels[peakIdx]) peakIdx = i;
    }
    peak = {
      idx: peakIdx,
      week: mainTraj.weeks[peakIdx],
      levelNg: mainTraj.levels[peakIdx]
    };
  }
  lastSimSnapshot = { mainTraj, lowerTraj, upperTraj, totalWeeks, peak };
  const bloodCanvas = document.getElementById("bloodChart");
  if (bloodCanvas && bloodCanvas.offsetParent === null) {
    chartsDirty = true;
    return;
  }
  chartsDirty = false;

  const colors = getThemePalette();
  const unit = store.appState.unit;

  if (zoomRange.max == null || zoomRange.max > totalWeeks) {
    zoomRange = { min: 0, max: totalWeeks };
  }

  const scrubber = getInspectorRefs().scrubber;
  if (scrubber) {
    scrubber.max = String(totalWeeks);
    if (activeCursorWeek == null || activeCursorWeek > totalWeeks) {
      activeCursorWeek = round2(totalWeeks / 2);
    }
    scrubber.value = String(activeCursorWeek);
    updateInspectorUI(activeCursorWeek);
  }

  const mainPoints = mainTraj.weeks.map((w, i) => ({
    x: w,
    y: round2(toDisplayUnit(mainTraj.levels[i], unit))
  }));

  const lowerPoints = lowerTraj.weeks.map((w, i) => ({
    x: w,
    y: round2(toDisplayUnit(lowerTraj.levels[i], unit))
  }));

  const upperPoints = upperTraj.weeks.map((w, i) => ({
    x: w,
    y: round2(toDisplayUnit(upperTraj.levels[i], unit))
  }));

  const examPoints = store.appState.bloodMeasurements
    .filter((e) => e.week <= totalWeeks)
    .map((e) => ({
      x: e.week,
      y: round2(toDisplayUnit(e.valueNg, unit)),
      note: e.note || "Examen clínico"
    }));

  const optLow = Number(toDisplayUnit(30, unit).toFixed(1));
  const toxThresh = Number(toDisplayUnit(100, unit).toFixed(1));

  let maxDataY = toxThresh * 1.06;
  for (let i = 0; i < upperPoints.length; i++) {
    const val = upperPoints[i].y * 1.12;
    if (val > maxDataY) maxDataY = val;
  }
  for (let i = 0; i < examPoints.length; i++) {
    const val = examPoints[i].y * 1.15;
    if (val > maxDataY) maxDataY = val;
  }

  const { d3Markers, calciMarkers } = chartLayers.doses
    ? buildDoseMarkers(totalWeeks, Math.ceil(maxDataY) * 0.025)
    : { d3Markers: [], calciMarkers: [] };

  const bloodCtx = bloodCanvas?.getContext("2d");
  if (bloodCtx) {
    bindCanvasPointerSync(bloodCanvas, () => bloodChart);

    const datasets = [
      {
        label: `25(OH)D3 Proyectada (${unit})`,
        data: mainPoints,
        borderColor: colors.serum,
        backgroundColor: colors.serumFill,
        borderWidth: 2.8,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.24,
        fill: !chartLayers.band
      },
      {
        label: "Banda IC 90% superior",
        data: chartLayers.band ? upperPoints : [],
        borderColor: "transparent",
        backgroundColor: colors.bandFill,
        pointRadius: 0,
        fill: "+1",
        tension: 0.24
      },
      {
        label: "Banda IC 90% inferior",
        data: chartLayers.band ? lowerPoints : [],
        borderColor: "transparent",
        backgroundColor: "transparent",
        pointRadius: 0,
        fill: false,
        tension: 0.24
      },
      {
        label: "Exámenes Reales",
        data: examPoints,
        type: "scatter",
        backgroundColor: colors.danger,
        borderColor: colors.surface,
        borderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8
      },
      {
        label: "Tomas D3",
        data: d3Markers,
        type: "scatter",
        pointStyle: "triangle",
        backgroundColor: colors.helio,
        borderColor: "transparent",
        pointRadius: 4.5,
        pointHoverRadius: 6.5
      },
      {
        label: "Tomas Hidroferol",
        data: calciMarkers,
        type: "scatter",
        pointStyle: "rectRot",
        backgroundColor: colors.serum,
        borderColor: colors.surface,
        borderWidth: 1,
        pointRadius: 5.5,
        pointHoverRadius: 7.5
      },
      {
        label: `Óptimo (${optLow} ${unit})`,
        data: [{ x: 0, y: optLow }, { x: totalWeeks, y: optLow }],
        borderColor: colors.viridian,
        borderDash: [5, 5],
        borderWidth: 1.4,
        pointRadius: 0,
        fill: false
      },
      {
        label: `Umbral Alto (${toxThresh} ${unit})`,
        data: [{ x: 0, y: toxThresh }, { x: totalWeeks, y: toxThresh }],
        borderColor: colors.danger,
        borderDash: [3, 4],
        borderWidth: 1.3,
        pointRadius: 0,
        fill: false
      }
    ];

    if (bloodChart) {
      bloodChart.data.datasets = datasets;
      bloodChart.options.scales.x.min = zoomRange.min;
      bloodChart.options.scales.x.max = zoomRange.max;
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
        plugins: [clinicalZonesPlugin, verticalReticlePlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: false },
          onClick: (_evt, elements) => {
            if (elements && elements.length > 0) {
              const el = elements[0];
              const pt = bloodChart.data.datasets[el.datasetIndex]?.data[el.index];
              if (pt && typeof pt.x === "number") {
                setInspectedWeek(pt.x, true);
              }
            }
          },
          plugins: {
            legend: {
              labels: {
                color: colors.text,
                boxWidth: 12,
                font: { size: 11, weight: "600" },
                filter: (item) => !item.text.includes("Banda IC 90%")
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const raw = ctx.raw;
                  const dateStr = getDateForWeek(store.appState.bodyProfile.startDate, ctx.parsed.x);
                  const datePart = dateStr ? ` • ${dateStr}` : "";
                  if (raw && raw.note) {
                    return raw.note.includes("•") ? `${raw.note} (Sem ${raw.x})` : `${raw.note} • Sem ${raw.x}${datePart}`;
                  }
                  const cleanLabel = ctx.dataset.label.replace(/\s*\([^)]*\)$/, "");
                  return `${cleanLabel}: ${ctx.parsed.y} ${unit} (Sem ${ctx.parsed.x}${datePart})`;
                }
              }
            }
          },
          scales: {
            x: {
              type: "linear",
              min: zoomRange.min,
              max: zoomRange.max,
              title: { display: true, text: "Tiempo (Semanas)", color: colors.text, font: { size: 11, weight: "600" } },
              ticks: { color: colors.text, font: { family: colors.monoFont, size: 10 } },
              grid: { color: colors.grid }
            },
            y: {
              min: 0,
              max: Math.ceil(maxDataY),
              title: { display: true, text: `Concentración Sérica (${unit})`, color: colors.text, font: { size: 11, weight: "600" } },
              ticks: { color: colors.text, font: { family: colors.monoFont, size: 10 } },
              grid: { color: colors.grid }
            }
          }
        }
      });
    }
  }

  const adipCanvas = document.getElementById("adiposeChart");
  const adipCtx = adipCanvas?.getContext("2d");
  if (adipCtx) {
    bindCanvasPointerSync(adipCanvas, () => adiposeChart);
    const adipDatasets = [
      {
        label: "Reserva Adiposa (kUI)",
        data: mainTraj.weeks.map((w, i) => ({ x: w, y: round2(mainTraj.adiposeReserve[i]) })),
        borderColor: colors.helio,
        backgroundColor: colors.helioFill,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.24
      },
      {
        label: "Pool Circulante D3 (kUI)",
        data: mainTraj.weeks.map((w, i) => ({ x: w, y: round2(mainTraj.freeD3[i]) })),
        borderColor: colors.viridian,
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.24
      }
    ];

    if (adiposeChart) {
      adiposeChart.data.datasets = adipDatasets;
      adiposeChart.options.scales.x.min = zoomRange.min;
      adiposeChart.options.scales.x.max = zoomRange.max;
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
        plugins: [verticalReticlePlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: colors.text, boxWidth: 11, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const dateStr = getDateForWeek(store.appState.bodyProfile.startDate, ctx.parsed.x);
                  const datePart = dateStr ? ` • ${dateStr}` : "";
                  return `${ctx.dataset.label}: ${ctx.parsed.y} (Sem ${ctx.parsed.x}${datePart})`;
                }
              }
            }
          },
          scales: {
            x: {
              type: "linear",
              min: zoomRange.min,
              max: zoomRange.max,
              ticks: { color: colors.text, font: { family: colors.monoFont, size: 10 } },
              grid: { color: colors.grid }
            },
            y: {
              min: 0,
              ticks: { color: colors.text, font: { family: colors.monoFont, size: 10 } },
              grid: { color: colors.grid }
            }
          }
        }
      });
    }
  }

  const intakeCanvas = document.getElementById("intakeChart");
  const intakeCtx = intakeCanvas?.getContext("2d");
  if (intakeCtx) {
    bindCanvasPointerSync(intakeCanvas, () => intakeChart);
    const intakeDatasets = [
      {
        label: "Aporte Equivalente (UI/día)",
        data: mainTraj.weeks.map((w, i) => ({ x: w, y: mainTraj.dailyEquivIU[i] })),
        borderColor: colors.serum,
        backgroundColor: colors.serumFill,
        borderWidth: 2,
        stepped: true,
        pointRadius: 0,
        fill: true
      }
    ];

    if (intakeChart) {
      intakeChart.data.datasets = intakeDatasets;
      intakeChart.options.scales.x.min = zoomRange.min;
      intakeChart.options.scales.x.max = zoomRange.max;
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
        plugins: [verticalReticlePlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: colors.text, boxWidth: 11, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const dateStr = getDateForWeek(store.appState.bodyProfile.startDate, ctx.parsed.x);
                  const datePart = dateStr ? ` • ${dateStr}` : "";
                  return `${ctx.dataset.label}: ${ctx.parsed.y} (Sem ${ctx.parsed.x}${datePart})`;
                }
              }
            }
          },
          scales: {
            x: {
              type: "linear",
              min: zoomRange.min,
              max: zoomRange.max,
              ticks: { color: colors.text, font: { family: colors.monoFont, size: 10 } },
              grid: { color: colors.grid }
            },
            y: {
              min: 0,
              ticks: { color: colors.text, font: { family: colors.monoFont, size: 10 } },
              grid: { color: colors.grid }
            }
          }
        }
      });
    }
  }
}