/**
 * Módulo de Interfaz de Usuario, Tablas, Planificador, Memorias y Perfiles
 */

import {
  APP_VERSION,
  store,
  cryptoId,
  sanitizeState,
  toDisplayUnit,
  fromDisplayUnit,
  formatLevel,
  getInitialBaselineNg,
  getActiveProfile,
  persistProfilesStore,
  autoSaveCurrentState,
  getDateForWeek,
  getTodayDateString,
  cloneData
} from "./state.js";
import { solveDoseWithRK4, estimateSafeWeeksRK4, simulateCurrentState, getCurrentCalibration } from "./pkEngine.js";
import { renderCharts, flushChartsIfDirty } from "./charts.js";

function $id(id) {
  return document.getElementById(id);
}

export function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

export function showToast(message) {
  const container = $id("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

export function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isMatch = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isMatch);
    btn.setAttribute("aria-selected", String(isMatch));
  });
  document.querySelectorAll(".tab-content").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `tab-${tabName}`);
  });
  if (tabName === "simulador") {
    flushChartsIfDirty();
  }
}

function classifyVitaminDStatus(valNg) {
  if (valNg < 20) return { label: `Deficiencia (< ${formatLevel(20, 0)})`, tone: "danger" };
  if (valNg < 30) return { label: `Insuficiencia (${toDisplayUnit(20).toFixed(0)}–${formatLevel(30, 0)})`, tone: "warning" };
  if (valNg <= 60) return { label: `Rango Óptimo (${toDisplayUnit(30).toFixed(0)}–${formatLevel(60, 0)})`, tone: "success" };
  if (valNg <= 100) return { label: `Elevado / Supervisión (${toDisplayUnit(60).toFixed(0)}–${formatLevel(100, 0)})`, tone: "warning" };
  return { label: `Riesgo de Toxicidad (> ${formatLevel(100, 0)})`, tone: "danger" };
}

function updateKPIs(traj, initialParams, totalWeeks, calibration = null) {
  const startNg = traj.levels[0];
  const endNg = traj.levels[traj.levels.length - 1];
  let peakNg = startNg;
  let peakWeek = 0;

  traj.levels.forEach((lvl, idx) => {
    if (lvl > peakNg) {
      peakNg = lvl;
      peakWeek = traj.weeks[idx];
    }
  });

  const avgDailyIU =
    traj.dailyEquivIU.reduce((acc, v) => acc + v, 0) / Math.max(1, traj.dailyEquivIU.length);

  $id("kpiStart").textContent = formatLevel(startNg, 1);
  $id("kpiStartStatus").textContent = classifyVitaminDStatus(startNg).label;

  $id("kpiPeak").textContent = formatLevel(peakNg, 1);
  $id("kpiPeakWeek").textContent = `Semana ${peakWeek.toFixed(1)}`;
  const peakStatus = classifyVitaminDStatus(peakNg);
  const peakCard = $id("kpiPeakCard");
  if (peakCard) {
    peakCard.classList.remove("status-success", "status-warning", "status-danger");
    peakCard.classList.add(`status-${peakStatus.tone}`);
  }

  const dateStr = getDateForWeek(store.appState.bodyProfile.startDate, totalWeeks);
  $id("kpiEndWeekNum").textContent = `${totalWeeks}${dateStr ? " • " + dateStr : ""}`;
  $id("kpiEnd").textContent = formatLevel(endNg, 1);
  const endStatus = classifyVitaminDStatus(endNg);
  $id("kpiEndStatus").textContent = endStatus.label;
  const endCard = $id("kpiEndCard");
  if (endCard) {
    endCard.classList.remove("status-success", "status-warning", "status-danger");
    endCard.classList.add(`status-${endStatus.tone}`);
  }

  $id("kpiDailyAvg").textContent = `${Math.round(avgDailyIU).toLocaleString()} UI/d`;
  const mapSuffix = calibration?.calibrated
    ? ` • MAP (${calibration.examCount} ex., RMSE ${formatLevel(calibration.rmseNg, 1)})`
    : "";
  $id("kpiVdInfo").textContent = `Vd: ${initialParams.effectiveVolume.toFixed(1)} L • IMC: ${initialParams.bmi.toFixed(1)}${mapSuffix}`;

  // Resúmenes vivos en acordeones 01-03
  const bp = store.appState.bodyProfile || {};
  const exams = store.appState.bloodMeasurements || [];
  const anthro = store.appState.anthropometryLogs || [];
  const sumProfEl = $id("summaryProfile");
  if (sumProfEl) sumProfEl.textContent = `${Math.round(bp.weight || 0)} kg · ${bp.bodyFat || 0}% GC · ${totalWeeks} sem`;
  const sumExEl = $id("summaryExams");
  if (sumExEl) sumExEl.textContent = `${exams.length} ${exams.length === 1 ? "examen" : "exámenes"}`;
  const sumAnEl = $id("summaryAnthro");
  if (sumAnEl) sumAnEl.textContent = `${anthro.length} ${anthro.length === 1 ? "control" : "controles"}`;
  const dosesCount = (store.appState.doses || []).length;
  const sumDoses = $id("summaryDoses");
  if (sumDoses) sumDoses.textContent = `${dosesCount} ${dosesCount === 1 ? "tramo" : "tramos"}`;

  // Micro-instrumento clínico 0-120 ng/mL en #kpiEndCard
  const startPct = Math.max(0, Math.min(100, (startNg / 120) * 100));
  const endPct = Math.max(0, Math.min(100, (endNg / 120) * 100));
  const gStart = $id("gaugeStartDot");
  const gEnd = $id("gaugeEndDot");
  const gTrail = $id("gaugeTrail");
  if (gStart) gStart.style.left = `${startPct}%`;
  if (gEnd) gEnd.style.left = `${endPct}%`;
  if (gTrail) {
    gTrail.style.left = `${Math.min(startPct, endPct)}%`;
    gTrail.style.width = `${Math.abs(endPct - startPct)}%`;
  }

  const banner = $id("safetyBanner");
  if (banner) {
    banner.className = `status-banner ${endStatus.tone}`;
    if (peakNg > 100) {
      banner.innerHTML = `<strong>Alerta de Seguridad:</strong> El pico proyectado (${formatLevel(peakNg, 1)}) supera el umbral de ${formatLevel(100, 0)}. Reduce la dosis o acorta la fase de carga.`;
    } else if (endNg >= 30 && endNg <= 60) {
      banner.innerHTML = `<strong>Protocolo Equilibrado:</strong> Al cierre de la semana ${totalWeeks}, la concentración proyectada (${formatLevel(endNg, 1)}) permanece dentro del rango óptimo (${formatLevel(30, 0)} – ${formatLevel(60, 0)}).`;
    } else if (endNg < 30) {
      banner.innerHTML = `<strong>Nivel Subóptimo:</strong> El esquema actual proyecta ${formatLevel(endNg, 1)} al final del periodo. Usa el Planificador Inverso para ajustar la dosis.`;
    } else {
      banner.innerHTML = `<strong>Nivel Alto:</strong> Proyección final en ${formatLevel(endNg, 1)}. Se sugiere control sérico y calcemia si se sostiene a largo plazo.`;
    }
  }
}

let lastSimResult = null;

export function runSimulationAndRender() {
  const sim = simulateCurrentState();
  lastSimResult = sim;
  updateKPIs(sim.mainTraj, sim.initialParams, sim.totalWeeks, sim.calibration);
  renderCharts(sim.mainTraj, sim.lowerTraj, sim.upperTraj, sim.totalWeeks);
}

export function refreshDisplayFromLastSim() {
  if (!lastSimResult) return false;
  updateKPIs(lastSimResult.mainTraj, lastSimResult.initialParams, lastSimResult.totalWeeks, lastSimResult.calibration);
  renderCharts(lastSimResult.mainTraj, lastSimResult.lowerTraj, lastSimResult.upperTraj, lastSimResult.totalWeeks);
  return true;
}

export function updateUnitLabels() {
  const unit = store.appState.unit;
  document.querySelectorAll(".unit-text").forEach((el) => {
    el.textContent = unit;
  });
  const examUnitLabel = $id("examUnitLabel");
  if (examUnitLabel) examUnitLabel.textContent = unit;

  const isNmol = unit === "nmol/L";
  const examValEl = $id("examValue");
  if (examValEl) examValEl.max = isNmol ? "1250" : "500";
  const planCurEl = $id("planCurrentLevel");
  if (planCurEl) planCurEl.max = isNmol ? "750" : "300";
  const planTgtEl = $id("planTargetLevel");
  if (planTgtEl) planTgtEl.max = isNmol ? "500" : "200";

  document.querySelectorAll("#unitToggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.unit === unit);
  });
}

export function renderExamsTable() {
  const tbody = $id("examsTableBody");
  if (!tbody) return;

  if (tbody.dataset.delegated !== "true") {
    tbody.dataset.delegated = "true";
    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-del");
      if (!btn || !btn.dataset.id) return;
      const id = btn.dataset.id;
      store.appState.bloodMeasurements = store.appState.bloodMeasurements.filter((item) => item.id !== id);
      autoSaveCurrentState();
      renderExamsTable();
      runSimulationAndRender();
    });
  }

  const frag = document.createDocumentFragment();
  const sorted = [...store.appState.bloodMeasurements].sort((a, b) => a.week - b.week);
  sorted.forEach((exam) => {
    const tr = document.createElement("tr");
    const safeNote = escapeHTML(exam.note || "—");
    const dateStr = getDateForWeek(store.appState.bodyProfile.startDate, exam.week);
    const weekCell = dateStr
      ? `<div>${exam.week}</div><small class="hint-date">${dateStr}</small>`
      : `${exam.week}`;
    tr.innerHTML = `
      <td>${weekCell}</td>
      <td><strong>${toDisplayUnit(exam.valueNg).toFixed(1)}</strong></td>
      <td title="${safeNote}">${safeNote}</td>
      <td><button type="button" class="btn-del" data-id="${escapeHTML(exam.id)}" aria-label="Eliminar examen">&times;</button></td>
    `;
    frag.appendChild(tr);
  });

  tbody.innerHTML = "";
  tbody.appendChild(frag);
}

export function renderAnthroTable() {
  const tbody = $id("anthroTableBody");
  if (!tbody) return;

  if (tbody.dataset.delegated !== "true") {
    tbody.dataset.delegated = "true";
    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-del");
      if (!btn || !btn.dataset.id) return;
      const id = btn.dataset.id;
      store.appState.anthropometryLogs = store.appState.anthropometryLogs.filter((a) => a.id !== id);
      autoSaveCurrentState();
      renderAnthroTable();
      runSimulationAndRender();
    });
  }

  const frag = document.createDocumentFragment();
  const sorted = [...store.appState.anthropometryLogs].sort((a, b) => a.week - b.week);
  sorted.forEach((log) => {
    const tr = document.createElement("tr");
    const dateStr = getDateForWeek(store.appState.bodyProfile.startDate, log.week);
    const weekCell = dateStr
      ? `<div>${log.week}</div><small class="hint-date">${dateStr}</small>`
      : `${log.week}`;
    tr.innerHTML = `
      <td>${weekCell}</td>
      <td>${log.weight} kg</td>
      <td>${log.bodyFat}%</td>
      <td><button type="button" class="btn-del" data-id="${escapeHTML(log.id)}" aria-label="Eliminar registro">&times;</button></td>
    `;
    frag.appendChild(tr);
  });

  tbody.innerHTML = "";
  tbody.appendChild(frag);
}

let editingDoseId = null;

export function getEditingDoseId() {
  return editingDoseId;
}

export function clearDoseEditMode() {
  editingDoseId = null;
  const addBtnSpan = document.querySelector("#addDoseBtn span");
  if (addBtnSpan) addBtnSpan.textContent = "Agregar Tramo";
  $id("cancelDoseEditBtn")?.classList.add("hidden");
  renderDosesTable();
}

export function renderDosesTable() {
  const tbody = $id("dosesTableBody");
  if (!tbody) return;

  if (tbody.dataset.delegated !== "true") {
    tbody.dataset.delegated = "true";
    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-del");
      if (btn && btn.dataset.id) {
        const id = btn.dataset.id;
        store.appState.doses = store.appState.doses.filter((item) => item.id !== id);
        if (editingDoseId === id) {
          editingDoseId = null;
          const addBtnSpan = document.querySelector("#addDoseBtn span");
          if (addBtnSpan) addBtnSpan.textContent = "Agregar Tramo";
          $id("cancelDoseEditBtn")?.classList.add("hidden");
        }
        autoSaveCurrentState();
        renderDosesTable();
        runSimulationAndRender();
        return;
      }

      const row = e.target.closest("tr[data-id]");
      if (!row) return;
      const d = store.appState.doses.find((item) => item.id === row.dataset.id);
      if (!d) return;

      editingDoseId = d.id;
      const typeEl = $id("doseType");
      if (typeEl) {
        typeEl.value = d.type;
        typeEl.dispatchEvent(new Event("change"));
      }
      if ($id("doseAmount")) {
        $id("doseAmount").value = String(d.type === "calcifediol" ? (d.amount ?? d.ug ?? 266) : (d.amount ?? d.iu ?? 2000));
      }
      if ($id("doseFreq")) $id("doseFreq").value = d.freq || "daily";
      if ($id("doseStartWeek")) $id("doseStartWeek").value = String(d.startWeek ?? 0);
      if ($id("doseEndWeek")) $id("doseEndWeek").value = String(d.endWeek ?? 12);

      const addBtnSpan = document.querySelector("#addDoseBtn span");
      if (addBtnSpan) addBtnSpan.textContent = "Actualizar Tramo";
      $id("cancelDoseEditBtn")?.classList.remove("hidden");
      renderDosesTable();
    });
  }

  const freqMap = {
    daily: "/d",
    weekly: "/sem",
    biweekly: "/14d",
    monthly: "/mes",
    single: "única"
  };

  const frag = document.createDocumentFragment();
  store.appState.doses.forEach((d) => {
    const tr = document.createElement("tr");
    tr.dataset.id = d.id;
    if (d.id === editingDoseId) tr.classList.add("editing-row");
    const isCalci = d.type === "calcifediol";
    let doseStr = "";
    if (isCalci) {
      const ugVal = d.amount ?? d.ug ?? 266;
      const caps = (ugVal / 266).toFixed(1).replace(/\.0$/, "");
      doseStr = `${ugVal} µg (${caps} cáp.) ${freqMap[d.freq] || ""}`;
    } else {
      const iuVal = d.amount ?? d.iu ?? 2000;
      doseStr = `${iuVal.toLocaleString()} UI ${freqMap[d.freq] || ""}`;
    }

    const startD = getDateForWeek(store.appState.bodyProfile.startDate, d.startWeek);
    const endD = getDateForWeek(store.appState.bodyProfile.startDate, d.endWeek);
    let tramoText = "";
    if (d.freq === "single") {
      tramoText = `<div>Sem ${d.startWeek}</div>${startD ? `<small class="hint-date">${startD}</small>` : ""}`;
    } else {
      tramoText = `<div>${d.startWeek}–${d.endWeek}</div>${startD && endD ? `<small class="hint-date">${startD} al ${endD}</small>` : ""}`;
    }

    tr.innerHTML = `
      <td><span class="badge-pill ${isCalci ? "badge-calci" : "badge-d3"}">${isCalci ? "Hidroferol" : "D3"}</span></td>
      <td title="${doseStr}">${doseStr}</td>
      <td>${tramoText}</td>
      <td><button type="button" class="btn-del" data-id="${escapeHTML(d.id)}" aria-label="Eliminar dosis">&times;</button></td>
    `;
    frag.appendChild(tr);
  });

  tbody.innerHTML = "";
  tbody.appendChild(frag);
}

export function syncUIWithState() {
  const bp = store.appState.bodyProfile;
  $id("sex").value = bp.sex;
  $id("age").value = bp.age;
  $id("height").value = bp.height;
  $id("weight").value = bp.weight;
  $id("bodyFat").value = bp.bodyFat;
  if ($id("startDate")) $id("startDate").value = bp.startDate || getTodayDateString();
  $id("simWeeks").value = bp.simWeeks;

  updateUnitLabels();
  renderExamsTable();
  renderAnthroTable();
  renderDosesTable();

  const planCur = $id("planCurrentLevel");
  if (planCur) {
    planCur.value = Number(toDisplayUnit(getInitialBaselineNg()).toFixed(1));
  }
}

export function generateTargetPlans() {
  const currentDisplay = parseFloat($id("planCurrentLevel").value) || 20;
  const targetDisplay = parseFloat($id("planTargetLevel").value) || 45;
  const loadWeeks = Math.max(2, parseInt($id("planWeeks").value, 10) || 12);
  const maintWeeks = Math.max(0, parseInt($id("planMaintWeeks").value, 10) || 12);

  const initialLevelNg = fromDisplayUnit(currentDisplay);
  const targetLevelNg = fromDisplayUnit(targetDisplay);

  const alertBox = $id("plannerAlertBox");
  const resultsGrid = $id("plannerResultsGrid");
  resultsGrid.innerHTML = "";

  if (targetLevelNg <= initialLevelNg) {
    alertBox.className = "status-banner warning mt-12";
    alertBox.innerHTML = `El nivel objetivo (${formatLevel(targetLevelNg, 1)}) debe superar el nivel actual (${formatLevel(initialLevelNg, 1)}).`;
    return;
  }

  const calibration = lastSimResult?.calibration || getCurrentCalibration();
  const safeMinWeeks = estimateSafeWeeksRK4(initialLevelNg, targetLevelNg, calibration);
  const mapNote = calibration.calibrated
    ? `<br><small>Protocolo personalizado mediante calibración Bayesiana MAP (${calibration.examCount} examen(es), RMSE ${formatLevel(calibration.rmseNg, 1)}).</small>`
    : "";

  if (loadWeeks < safeMinWeeks) {
    alertBox.className = "status-banner warning mt-12";
    alertBox.innerHTML = `<strong>Plazo exigente:</strong> Alcanzar ${formatLevel(targetLevelNg, 1)} desde ${formatLevel(initialLevelNg, 1)} en ${loadWeeks} semanas requiere dosis altas. A 4.000 UI/día estándar tomaría ~<strong>${safeMinWeeks} semanas</strong>.${mapNote}`;
  } else {
    alertBox.className = "status-banner success mt-12";
    alertBox.innerHTML = `<strong>Plazo Fisiológico Adecuado:</strong> ${loadWeeks} semanas permiten una reposición gradual hacia ${formatLevel(targetLevelNg, 1)}.${mapNote}`;
  }

  const strategies = [
    {
      title: "Estrategia 1: D3 Diaria Fisiológica",
      tag: "MÁS ESTABLE • RECOMENDADA",
      recommended: true,
      freq: "daily",
      doseType: "d3",
      freqLabel: "diarios",
      desc: "Absorción continua sin saturar la hidroxilación hepática CYP2R1."
    },
    {
      title: "Estrategia 2: D3 Bolo Semanal",
      tag: "ALTA ADHERENCIA",
      recommended: false,
      freq: "weekly",
      doseType: "d3",
      freqLabel: "semanales",
      desc: "Una toma cada 7 días para simplificar adherencia a largo plazo."
    },
    {
      title: "Estrategia 3: Hidroferol (Calcifediol)",
      tag: "ACCIÓN RÁPIDA • CÁPSULAS 266 µg",
      recommended: false,
      freq: "biweekly",
      doseType: "calcifediol",
      freqLabel: "quincenales",
      desc: "Cápsulas blandas de 0,266 mg (266 µg). Absorción directa en suero sin depender de hidroxilación hepática."
    }
  ];

  const frag = document.createDocumentFragment();
  strategies.forEach((strat) => {
    const solved = solveDoseWithRK4(
      targetLevelNg,
      initialLevelNg,
      loadWeeks,
      maintWeeks,
      strat.freq,
      strat.doseType,
      calibration
    );

    const isCalci = strat.doseType === "calcifediol";
    let loadDoseText = "";
    if (isCalci) {
      const caps = Math.round(solved.loadUg / 266);
      loadDoseText = `${solved.loadUg} µg (${caps} cáp. de 0,266 mg) ${strat.freqLabel}`;
    } else {
      loadDoseText = `${solved.loadIU.toLocaleString()} UI ${strat.freqLabel}`;
    }

    const card = document.createElement("div");
    card.className = `strategy-card ${strat.recommended ? "recommended" : ""}`;
    card.innerHTML = `
      <div>
        <span class="strategy-tag">${strat.tag}</span>
        <h3>${strat.title}</h3>
        <p class="hint">${strat.desc}</p>
        <div class="strategy-metrics">
          <div><strong>Carga (Sem 0–${loadWeeks}):</strong> ${loadDoseText}</div>
          ${maintWeeks > 0 ? `<div><strong>Mantención (Sem ${loadWeeks}–${loadWeeks + maintWeeks}):</strong> ${solved.maintIU.toLocaleString()} UI D3/día</div>` : ""}
          <div><strong>Pico máximo:</strong> ${formatLevel(solved.peakNg, 1)}</div>
          <div><strong>Cierre proyectado:</strong> ${formatLevel(solved.endNg, 1)}</div>
        </div>
      </div>
      <button type="button" class="btn-helio full-width apply-plan-btn">Aplicar en Simulador</button>
    `;

    card.querySelector(".apply-plan-btn").addEventListener("click", () => {
      store.appState.doses = [
        {
          id: cryptoId(),
          type: strat.doseType,
          amount: isCalci ? solved.loadUg : solved.loadIU,
          ug: isCalci ? solved.loadUg : Math.round(solved.loadIU / 40),
          iu: isCalci ? Math.round(solved.loadUg * 60) : solved.loadIU,
          freq: strat.freq,
          startWeek: 0,
          endWeek: loadWeeks
        }
      ];
      if (maintWeeks > 0) {
        store.appState.doses.push({
          id: cryptoId(),
          type: "d3",
          amount: solved.maintIU,
          iu: solved.maintIU,
          ug: Math.round(solved.maintIU / 40),
          freq: "daily",
          startWeek: loadWeeks,
          endWeek: loadWeeks + maintWeeks
        });
      }
      store.appState.bodyProfile.simWeeks = loadWeeks + maintWeeks;
      $id("simWeeks").value = store.appState.bodyProfile.simWeeks;

      autoSaveCurrentState();
      renderDosesTable();
      runSimulationAndRender();
      switchTab("simulador");
      showToast(`Protocolo "${strat.title}" aplicado`);
    });

    frag.appendChild(card);
  });
  resultsGrid.appendChild(frag);
}

export function saveCurrentSimulationToMemory() {
  const titleInput = $id("simTitleInput");
  const activeProf = getActiveProfile();
  const title =
    (titleInput?.value || "").trim() ||
    `Simulación ${new Date().toLocaleDateString("es-CL")} (${formatLevel(getInitialBaselineNg(), 1)})`;

  store.savedSimulations.unshift({
    id: cryptoId(),
    title,
    profileName: activeProf ? activeProf.name : "Perfil",
    createdAt: new Date().toISOString(),
    stateSnapshot: cloneData(store.appState)
  });

  autoSaveCurrentState();
  if (titleInput) titleInput.value = "";
  renderMemoriesList();
  showToast("Simulación guardada en memoria");
}

export function renderMemoriesList() {
  const grid = $id("memoriesGrid");
  if (!grid) return;
  if (grid.dataset.delegated !== "true") {
    grid.dataset.delegated = "true";
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const item = store.savedSimulations.find((m) => m.id === id);
      if (action === "load" && item) {
        store.appState = sanitizeState(item.stateSnapshot);
        autoSaveCurrentState();
        syncUIWithState();
        runSimulationAndRender();
        switchTab("simulador");
        showToast(`Escenario "${item.title}" restaurado`);
      } else if (action === "delete" && item) {
        store.savedSimulations = store.savedSimulations.filter((m) => m.id !== id);
        autoSaveCurrentState();
        renderMemoriesList();
        showToast("Memoria eliminada");
      }
    });
  }

  grid.innerHTML = "";

  if (store.savedSimulations.length === 0) {
    grid.innerHTML = `<p class="hint">No hay simulaciones guardadas en este perfil todavía. Usa "Guardar Memoria" sobre el gráfico principal.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  store.savedSimulations.forEach((item) => {
    const snap = item.stateSnapshot;
    const bp = snap.bodyProfile;
    const dateStr = new Date(item.createdAt).toLocaleString("es-CL", {
      dateStyle: "medium",
      timeStyle: "short"
    });

    const card = document.createElement("div");
    card.className = "memory-card";
    card.innerHTML = `
      <div>
        <h4>${escapeHTML(item.title)}</h4>
        <div class="memory-meta">${dateStr} • ${bp.weight} kg • ${bp.bodyFat}% grasa • ${bp.simWeeks} sem</div>
        <p class="hint mt-8">${snap.doses.length} tramo(s) de dosis • ${snap.bloodMeasurements.length} examen(es)</p>
      </div>
      <div class="memory-actions">
        <button type="button" class="btn-helio btn-sm load-mem-btn" data-action="load" data-id="${escapeHTML(item.id)}">Cargar Escenario</button>
        <button type="button" class="btn-danger-ghost btn-sm del-mem-btn" data-action="delete" data-id="${escapeHTML(item.id)}" aria-label="Eliminar memoria">Eliminar</button>
      </div>
    `;

    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

export async function exportMemoriesJSON() {
  const payload = {
    app: `Diol v${APP_VERSION}`,
    exportedAt: new Date().toISOString(),
    profilesStore: store.profilesStore
  };
  const jsonString = JSON.stringify(payload, null, 2);
  const fileName = `diol_respaldo_${new Date().toISOString().slice(0, 10)}.json`;

  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([jsonString], fileName, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Respaldo Diol" });
        return;
      }
    } catch (_) {
      // Fallback a descarga directa en escritorio o WebView
    }
  }

  try {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Respaldo JSON exportado");
  } catch (_) {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(jsonString);
      showToast("JSON copiado al portapapeles");
    }
  }
}

export function importMemoriesJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.profilesStore && Array.isArray(parsed.profilesStore.profiles) && parsed.profilesStore.profiles.length > 0) {
        parsed.profilesStore.profiles = parsed.profilesStore.profiles.map((p) => ({
          id: String(p.id || cryptoId()),
          name: String(p.name || "Perfil Importado").slice(0, 60),
          updatedAt: p.updatedAt || new Date().toISOString(),
          state: sanitizeState(p.state),
          savedSimulations: Array.isArray(p.savedSimulations) ? p.savedSimulations : []
        }));
        store.profilesStore = parsed.profilesStore;
        const active = getActiveProfile();
        store.profilesStore.activeProfileId = active.id;
        store.appState = sanitizeState(active.state);
        store.savedSimulations = Array.isArray(active.savedSimulations) ? active.savedSimulations : [];

        persistProfilesStore();
        syncUIWithState();
        runSimulationAndRender();
        renderMemoriesList();
        renderProfileSelector();
        showToast("Perfiles y memorias importados");
      } else {
        showToast("Archivo JSON sin estructura válida");
      }
    } catch (_) {
      showToast("Error al leer el archivo JSON");
    }
  };
  reader.readAsText(file);
}

export function renderProfileSelector() {
  const sel = $id("profileSelector");
  if (!sel) return;
  sel.innerHTML = "";
  const frag = document.createDocumentFragment();
  store.profilesStore.profiles.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === store.profilesStore.activeProfileId) opt.selected = true;
    frag.appendChild(opt);
  });
  sel.appendChild(frag);
}

let renamingProfileId = null;
let profileModalCallbacks = { onActivate: null, onRename: null, onDelete: null };

export function renderProfilesModalList(onActivate, onRename, onDelete) {
  profileModalCallbacks = { onActivate, onRename, onDelete };
  const container = $id("profilesListContainer");
  if (!container) return;
  container.innerHTML = "";

  const frag = document.createDocumentFragment();
  store.profilesStore.profiles.forEach((p) => {
    const isActive = p.id === store.profilesStore.activeProfileId;
    const bp = p.state?.bodyProfile || {};
    const item = document.createElement("div");
    item.className = `profile-item ${isActive ? "active-profile" : ""}`;

    if (renamingProfileId === p.id) {
      item.innerHTML = `
        <div class="profile-rename-inline">
          <input type="text" class="profile-rename-input" value="${escapeHTML(p.name)}" maxlength="60" aria-label="Nuevo nombre del perfil" />
          <button type="button" class="btn-helio btn-sm" data-action="save-rename" data-id="${escapeHTML(p.id)}">Guardar</button>
          <button type="button" class="btn-instrument btn-sm" data-action="cancel-rename">Cancelar</button>
        </div>
      `;
    } else {
      item.innerHTML = `
        <div class="profile-item-info">
          <strong>${escapeHTML(p.name)} ${isActive ? "• Activo" : ""}</strong>
          <span>${bp.weight || "--"} kg • ${bp.bodyFat || "--"}% grasa • ${(p.savedSimulations || []).length} memorias</span>
        </div>
        <div class="profile-item-btns">
          ${!isActive ? `<button type="button" class="btn-helio btn-sm" data-action="activate" data-id="${escapeHTML(p.id)}">Activar</button>` : ""}
          <button type="button" class="btn-instrument btn-sm" data-action="rename" data-id="${escapeHTML(p.id)}">Renombrar</button>
          ${store.profilesStore.profiles.length > 1 ? `<button type="button" class="btn-danger-ghost btn-sm" data-action="delete" data-id="${escapeHTML(p.id)}">Borrar</button>` : ""}
        </div>
      `;
    }
    frag.appendChild(item);
  });
  container.appendChild(frag);

  if (renamingProfileId) {
    const input = container.querySelector(".profile-rename-input");
    input?.focus();
    input?.select();
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = input.value.trim();
        const id = renamingProfileId;
        renamingProfileId = null;
        if (val) onRename(id, val);
        else renderProfilesModalList(onActivate, onRename, onDelete);
      } else if (e.key === "Escape") {
        renamingProfileId = null;
        renderProfilesModalList(onActivate, onRename, onDelete);
      }
    });
  }

  if (container.dataset.delegated !== "true") {
    container.dataset.delegated = "true";
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const { onActivate: actCb, onRename: renCb, onDelete: delCb } = profileModalCallbacks;
      if (action === "activate") {
        renamingProfileId = null;
        actCb?.(id);
      } else if (action === "rename") {
        renamingProfileId = id;
        renderProfilesModalList(actCb, renCb, delCb);
      } else if (action === "save-rename") {
        const input = btn.closest(".profile-rename-inline")?.querySelector(".profile-rename-input");
        const newName = input?.value.trim() || "";
        renamingProfileId = null;
        if (newName) renCb?.(id, newName);
        else renderProfilesModalList(actCb, renCb, delCb);
      } else if (action === "cancel-rename") {
        renamingProfileId = null;
        renderProfilesModalList(actCb, renCb, delCb);
      } else if (action === "delete") {
        renamingProfileId = null;
        delCb?.(id);
      }
    });
  }
}