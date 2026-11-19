/**
 * Módulo de Interfaz de Usuario, Tablas, Planificador, Memorias y Perfiles
 */

import {
  store,
  cryptoId,
  sanitizeState,
  toDisplayUnit,
  fromDisplayUnit,
  formatLevel,
  getInitialBaselineNg,
  getActiveProfile,
  persistProfilesStore,
  autoSaveCurrentState
} from "./state.js";
import { solveDoseWithRK4, estimateSafeWeeksRK4, simulateCurrentState } from "./pkEngine.js";
import { renderCharts } from "./charts.js";

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
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-content").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `tab-${tabName}`);
  });
}

function classifyVitaminDStatus(valNg) {
  if (valNg < 20) return { label: "Deficiencia (< 20 ng/mL)", tone: "danger" };
  if (valNg < 30) return { label: "Insuficiencia (20–30 ng/mL)", tone: "warning" };
  if (valNg <= 60) return { label: "Rango Óptimo (30–60 ng/mL)", tone: "success" };
  if (valNg <= 100) return { label: "Elevado / Supervisión (60–100 ng/mL)", tone: "warning" };
  return { label: "Riesgo de Toxicidad (> 100 ng/mL)", tone: "danger" };
}

function updateKPIs(traj, initialParams, totalWeeks) {
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
  $id("kpiPeakWeek").textContent = `Alcanzado en semana ${peakWeek.toFixed(1)}`;

  $id("kpiEndWeekNum").textContent = totalWeeks;
  $id("kpiEnd").textContent = formatLevel(endNg, 1);
  const endStatus = classifyVitaminDStatus(endNg);
  $id("kpiEndStatus").textContent = endStatus.label;

  $id("kpiDailyAvg").textContent = `${Math.round(avgDailyIU)} UI/d`;
  $id("kpiVdInfo").textContent = `Vd: ${initialParams.effectiveVolume.toFixed(1)} L • IMC: ${initialParams.bmi.toFixed(1)}`;

  const banner = $id("safetyBanner");
  if (banner) {
    banner.className = `alert-banner ${endStatus.tone}`;
    if (peakNg > 100) {
      banner.innerHTML = `<strong>⚠️ Alerta de Seguridad:</strong> El pico proyectado (${formatLevel(peakNg, 1)}) supera el umbral seguro de ${formatLevel(100, 0)}. Reduce la dosis o acorta la fase de carga.`;
    } else if (endNg >= 30 && endNg <= 60) {
      banner.innerHTML = `<strong>✅ Protocolo Equilibrado:</strong> Al finalizar la semana ${totalWeeks}, tus niveles proyectados (${formatLevel(endNg, 1)}) se mantienen dentro del rango fisiológico óptimo (${formatLevel(30, 0)} – ${formatLevel(60, 0)}).`;
    } else if (endNg < 30) {
      banner.innerHTML = `<strong>ℹ️ Nivel Subóptimo:</strong> El esquema actual proyecta ${formatLevel(endNg, 1)} al final del periodo. Considera usar el Planificador de Objetivo para ajustar la dosis.`;
    } else {
      banner.innerHTML = `<strong>⚠️ Nivel Alto:</strong> Proyección final en ${formatLevel(endNg, 1)}. Se recomienda control sérico y de calcio si se mantiene a largo plazo.`;
    }
  }
}

export function runSimulationAndRender() {
  const { totalWeeks, initialParams, mainTraj, lowerTraj, upperTraj } = simulateCurrentState();
  updateKPIs(mainTraj, initialParams, totalWeeks);
  renderCharts(mainTraj, lowerTraj, upperTraj, totalWeeks);
}

export function updateUnitLabels() {
  const unit = store.appState.unit;
  document.querySelectorAll(".unit-text").forEach((el) => {
    el.textContent = unit;
  });
  const examUnitLabel = $id("examUnitLabel");
  if (examUnitLabel) examUnitLabel.textContent = unit;

  document.querySelectorAll("#unitToggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.unit === unit);
  });
}

export function renderExamsTable() {
  const tbody = $id("examsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...store.appState.bloodMeasurements].sort((a, b) => a.week - b.week);
  sorted.forEach((exam) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${exam.week}</td>
      <td><strong>${toDisplayUnit(exam.valueNg).toFixed(1)}</strong></td>
      <td>${escapeHTML(exam.note || "-")}</td>
      <td><button class="btn-del" aria-label="Eliminar examen">&times;</button></td>
    `;
    tr.querySelector(".btn-del").addEventListener("click", () => {
      store.appState.bloodMeasurements = store.appState.bloodMeasurements.filter((e) => e.id !== exam.id);
      autoSaveCurrentState();
      renderExamsTable();
      runSimulationAndRender();
    });
    tbody.appendChild(tr);
  });
}

export function renderAnthroTable() {
  const tbody = $id("anthroTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...store.appState.anthropometryLogs].sort((a, b) => a.week - b.week);
  sorted.forEach((log) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${log.week}</td>
      <td>${log.weight} kg</td>
      <td>${log.bodyFat}%</td>
      <td><button class="btn-del" aria-label="Eliminar registro">&times;</button></td>
    `;
    tr.querySelector(".btn-del").addEventListener("click", () => {
      store.appState.anthropometryLogs = store.appState.anthropometryLogs.filter((a) => a.id !== log.id);
      autoSaveCurrentState();
      renderAnthroTable();
      runSimulationAndRender();
    });
    tbody.appendChild(tr);
  });
}

export function renderDosesTable() {
  const tbody = $id("dosesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const freqMap = {
    daily: "/día",
    weekly: "/sem",
    biweekly: "/14d",
    monthly: "/mes",
    single: "única"
  };

  store.appState.doses.forEach((d) => {
    const tr = document.createElement("tr");
    const isCalci = d.type === "calcifediol";
    const tramoText = d.freq === "single" ? `Sem ${d.startWeek}` : `${d.startWeek}–${d.endWeek}`;
    tr.innerHTML = `
      <td><span class="badge-pill ${isCalci ? "badge-calci" : "badge-d3"}">${isCalci ? "25OHD" : "D3"}</span></td>
      <td>${d.iu.toLocaleString()} ${freqMap[d.freq] || ""}</td>
      <td>${tramoText}</td>
      <td><button class="btn-del" aria-label="Eliminar dosis">&times;</button></td>
    `;
    tr.querySelector(".btn-del").addEventListener("click", () => {
      store.appState.doses = store.appState.doses.filter((item) => item.id !== d.id);
      autoSaveCurrentState();
      renderDosesTable();
      runSimulationAndRender();
    });
    tbody.appendChild(tr);
  });
}

export function syncUIWithState() {
  const bp = store.appState.bodyProfile;
  $id("sex").value = bp.sex;
  $id("age").value = bp.age;
  $id("height").value = bp.height;
  $id("weight").value = bp.weight;
  $id("bodyFat").value = bp.bodyFat;
  $id("skinTone").value = String(bp.skinTone);
  $id("sunExposure").value = String(bp.sunExposure);
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
    alertBox.className = "alert-banner warning mt-12";
    alertBox.innerHTML = `El nivel objetivo (${formatLevel(targetLevelNg, 1)}) debe ser mayor al nivel actual (${formatLevel(initialLevelNg, 1)}).`;
    return;
  }

  const safeMinWeeks = estimateSafeWeeksRK4(initialLevelNg, targetLevelNg);

  if (loadWeeks < safeMinWeeks) {
    alertBox.className = "alert-banner warning mt-12";
    alertBox.innerHTML = `<strong>⚠️ Plazo exigente:</strong> Alcanzar ${formatLevel(targetLevelNg, 1)} desde ${formatLevel(initialLevelNg, 1)} en ${loadWeeks} semanas requiere dosis altas. Con un protocolo diario estándar de 4.000 UI/día tomaría ~<strong>${safeMinWeeks} semanas</strong>.`;
  } else {
    alertBox.className = "alert-banner success mt-12";
    alertBox.innerHTML = `<strong>✅ Plazo Fisiológico Adecuado:</strong> ${loadWeeks} semanas permiten una reposición gradual y segura hacia ${formatLevel(targetLevelNg, 1)}.`;
  }

  const strategies = [
    {
      title: "Estrategia 1: D3 Diaria Fisiológica",
      tag: "Más Estable • Recomendada",
      recommended: true,
      freq: "daily",
      doseType: "d3",
      freqLabel: "diarios",
      desc: "Absorción constante sin picos enzimáticos ni saturación de hidroxilasas."
    },
    {
      title: "Estrategia 2: D3 Bolo Semanal",
      tag: "Alta Adherencia",
      recommended: false,
      freq: "weekly",
      doseType: "d3",
      freqLabel: "semanales",
      desc: "Una toma cada 7 días. Ideal si prefieres evitar cápsulas diarias."
    },
    {
      title: "Estrategia 3: Calcifediol 25(OH)D3",
      tag: "Acción Rápida (~3.2×)",
      recommended: false,
      freq: "weekly",
      doseType: "calcifediol",
      freqLabel: "semanales (equiv. UI)",
      desc: "Omite el paso hepático y el secuestro adiposo; eleva niveles más rápido en IMC alto."
    }
  ];

  strategies.forEach((strat) => {
    const solved = solveDoseWithRK4(
      targetLevelNg,
      initialLevelNg,
      loadWeeks,
      maintWeeks,
      strat.freq,
      strat.doseType
    );

    const card = document.createElement("div");
    card.className = `strategy-card ${strat.recommended ? "recommended" : ""}`;
    card.innerHTML = `
      <div>
        <span class="strategy-tag">${strat.tag}</span>
        <h3>${strat.title}</h3>
        <p class="hint">${strat.desc}</p>
        <div class="strategy-metrics">
          <div><strong>Fase Carga (Sem 0–${loadWeeks}):</strong> ${solved.loadIU.toLocaleString()} UI ${strat.freqLabel}</div>
          ${maintWeeks > 0 ? `<div><strong>Mantenimiento (Sem ${loadWeeks}–${loadWeeks + maintWeeks}):</strong> ${solved.maintIU.toLocaleString()} UI D3/día</div>` : ""}
          <div><strong>Pico estimado:</strong> ${formatLevel(solved.peakNg, 1)}</div>
          <div><strong>Nivel final proyectado:</strong> ${formatLevel(solved.endNg, 1)}</div>
        </div>
      </div>
      <button class="btn-primary full-width apply-plan-btn">Aplicar en Simulador</button>
    `;

    card.querySelector(".apply-plan-btn").addEventListener("click", () => {
      store.appState.doses = [
        {
          id: cryptoId(),
          type: strat.doseType,
          iu: solved.loadIU,
          freq: strat.freq,
          startWeek: 0,
          endWeek: loadWeeks
        }
      ];
      if (maintWeeks > 0) {
        store.appState.doses.push({
          id: cryptoId(),
          type: "d3",
          iu: solved.maintIU,
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
      showToast(`Protocolo "${strat.title}" aplicado al simulador`);
    });

    resultsGrid.appendChild(card);
  });
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
    stateSnapshot: JSON.parse(JSON.stringify(store.appState))
  });

  autoSaveCurrentState();
  if (titleInput) titleInput.value = "";
  renderMemoriesList();
  showToast("Simulación guardada en memoria");
}

export function renderMemoriesList() {
  const grid = $id("memoriesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (store.savedSimulations.length === 0) {
    grid.innerHTML = `<p class="hint">No hay simulaciones guardadas en este perfil todavía. Usa el botón "💾 Guardar en Memoria" sobre el gráfico principal.</p>`;
    return;
  }

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
        <button class="btn-primary small load-mem-btn">Cargar</button>
        <button class="btn-secondary small del-mem-btn">🗑️</button>
      </div>
    `;

    card.querySelector(".load-mem-btn").addEventListener("click", () => {
      store.appState = sanitizeState(item.stateSnapshot);
      autoSaveCurrentState();
      syncUIWithState();
      runSimulationAndRender();
      switchTab("simulador");
      showToast(`Simulación "${item.title}" restaurada`);
    });

    card.querySelector(".del-mem-btn").addEventListener("click", () => {
      store.savedSimulations = store.savedSimulations.filter((m) => m.id !== item.id);
      autoSaveCurrentState();
      renderMemoriesList();
      showToast("Memoria eliminada");
    });

    grid.appendChild(card);
  });
}

export async function exportMemoriesJSON() {
  const payload = {
    app: "Vitamina D Simulator v0.3.4",
    exportedAt: new Date().toISOString(),
    profilesStore: store.profilesStore
  };
  const jsonString = JSON.stringify(payload, null, 2);
  const fileName = `vitamina_d_respaldo_${new Date().toISOString().slice(0, 10)}.json`;

  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([jsonString], fileName, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Respaldo Vitamina D Simulator" });
        return;
      }
    } catch (_) {
      // Fallback a descarga directa
    }
  }

  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Respaldo JSON descargado");
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
        showToast("Perfiles y memorias importados correctamente");
      } else {
        showToast("Archivo JSON sin estructura válida de perfiles");
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
  store.profilesStore.profiles.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === store.profilesStore.activeProfileId) opt.selected = true;
    sel.appendChild(opt);
  });
}

export function renderProfilesModalList(onActivate, onRename, onDelete) {
  const container = $id("profilesListContainer");
  if (!container) return;
  container.innerHTML = "";

  store.profilesStore.profiles.forEach((p) => {
    const isActive = p.id === store.profilesStore.activeProfileId;
    const bp = p.state?.bodyProfile || {};
    const item = document.createElement("div");
    item.className = `profile-item ${isActive ? "active-profile" : ""}`;
    item.innerHTML = `
      <div class="profile-item-info">
        <strong>${escapeHTML(p.name)} ${isActive ? "• (Activo)" : ""}</strong>
        <span>${bp.weight || "--"} kg • ${bp.bodyFat || "--"}% grasa • ${(p.savedSimulations || []).length} memorias</span>
      </div>
      <div class="profile-item-btns">
        ${!isActive ? `<button class="btn-primary small" data-action="activate" data-id="${p.id}">Activar</button>` : ""}
        <button class="btn-secondary small" data-action="rename" data-id="${p.id}" title="Renombrar">✏️</button>
        ${store.profilesStore.profiles.length > 1 ? `<button class="btn-secondary small" data-action="delete" data-id="${p.id}" title="Eliminar">🗑️</button>` : ""}
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === "activate") onActivate(id);
      else if (action === "rename") onRename(id);
      else if (action === "delete") onDelete(id);
    });
  });
}