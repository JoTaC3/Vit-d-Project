/**
 * Punto de Entrada Principal (ES Modules)
 */

import { estimateBodyFatCUNBAE } from "./pkEngine.js";
import {
  store,
  STORAGE_KEY_THEME,
  cryptoId,
  clampNum,
  createDefaultProfileState,
  sanitizeState,
  fromDisplayUnit,
  getActiveProfile,
  persistProfilesStore,
  autoSaveCurrentState,
  scheduleAutoSave,
  initializeProfiles
} from "./state.js";
import {
  showToast,
  switchTab,
  runSimulationAndRender,
  renderExamsTable,
  renderAnthroTable,
  renderDosesTable,
  syncUIWithState,
  generateTargetPlans,
  saveCurrentSimulationToMemory,
  renderMemoriesList,
  exportMemoriesJSON,
  importMemoriesJSON,
  renderProfileSelector,
  renderProfilesModalList,
  getEditingDoseId,
  clearDoseEditMode
} from "./ui.js";
import * as chartsMod from "./charts.js";

function $id(id) {
  return document.getElementById(id);
}

const SUN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const MOON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY_THEME, theme);
  chartsMod.invalidateChartThemeCache?.();
  const icon = $id("themeIcon");
  const text = $id("themeText");
  if (icon && text) {
    icon.innerHTML = theme === "dark" ? SUN_SVG : MOON_SVG;
    text.textContent = theme === "dark" ? "Claro" : "Oscuro";
  }
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME);
  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
    return;
  }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function safeRenderAll() {
  try {
    runSimulationAndRender();
  } catch (err) {
    console.error("Error al renderizar simulación/gráficos:", err);
  }
}

function openProfileManager() {
  renderProfilesModalList(
    (id) => {
      switchProfile(id);
      closeProfileManager();
    },
    (id, newName) => renameProfile(id, newName),
    (id) => deleteProfile(id)
  );
  $id("profileManagerModal")?.classList.remove("hidden");
}

function closeProfileManager() {
  $id("profileManagerModal")?.classList.add("hidden");
}

function switchProfile(profileId) {
  autoSaveCurrentState();
  const target = store.profilesStore.profiles.find((p) => p.id === profileId);
  if (!target) return;

  store.profilesStore.activeProfileId = target.id;
  store.appState = sanitizeState(target.state);
  store.savedSimulations = Array.isArray(target.savedSimulations) ? target.savedSimulations : [];

  persistProfilesStore();
  syncUIWithState();
  safeRenderAll();
  renderMemoriesList();
  renderProfileSelector();
  showToast(`Perfil cargado: ${target.name}`);
}

function createNewProfile(name) {
  const cleanName = (name || "").trim();
  if (!cleanName) {
    showToast("Ingresa un nombre válido para el perfil");
    return;
  }
  autoSaveCurrentState();

  const newId = cryptoId();
  const freshState = createDefaultProfileState();
  store.profilesStore.profiles.push({
    id: newId,
    name: cleanName,
    updatedAt: new Date().toISOString(),
    state: freshState,
    savedSimulations: []
  });
  store.profilesStore.activeProfileId = newId;
  store.appState = sanitizeState(freshState);
  store.savedSimulations = [];

  persistProfilesStore();
  syncUIWithState();
  safeRenderAll();
  renderMemoriesList();
  renderProfileSelector();
  openProfileManager();
  showToast(`Perfil "${cleanName}" creado`);
}

function deleteProfile(profileId) {
  if (store.profilesStore.profiles.length <= 1) {
    showToast("Debe existir al menos un perfil activo");
    return;
  }
  store.profilesStore.profiles = store.profilesStore.profiles.filter((p) => p.id !== profileId);
  if (store.profilesStore.activeProfileId === profileId) {
    const next = store.profilesStore.profiles[0];
    store.profilesStore.activeProfileId = next.id;
    store.appState = sanitizeState(next.state);
    store.savedSimulations = Array.isArray(next.savedSimulations) ? next.savedSimulations : [];
  }
  persistProfilesStore();
  syncUIWithState();
  safeRenderAll();
  renderMemoriesList();
  renderProfileSelector();
  openProfileManager();
  showToast("Perfil eliminado");
}

function renameProfile(profileId, newName) {
  const prof = store.profilesStore.profiles.find((p) => p.id === profileId);
  if (!prof) return;
  const clean = (newName || "").trim();
  if (clean) {
    prof.name = clean;
    prof.updatedAt = new Date().toISOString();
    persistProfilesStore();
    renderProfileSelector();
    openProfileManager();
    showToast("Perfil renombrado");
  }
}

async function checkDesktopUpdate() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;

  try {
    const info = await invoke("check_and_install_update", { install: false });
    if (info && info.available) {
      showToast(`Nueva versión v${info.version} detectada. Descargando e instalando...`);
      await invoke("check_and_install_update", { install: true });
    }
  } catch (err) {
    console.warn("Error comprobando actualización:", err);
  }
}

function bindUIEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll(".sidebar .panel-head").forEach((head) => {
    head.addEventListener("click", () => {
      head.closest(".panel-card")?.classList.toggle("collapsed");
    });
  });

  $id("themeToggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
    if (!chartsMod.rerenderChartsFromSnapshot?.()) safeRenderAll();
  });

  document.querySelectorAll("#unitToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextUnit = btn.dataset.unit;
      if (nextUnit === store.appState.unit) return;
      store.appState.unit = nextUnit;
      autoSaveCurrentState();
      syncUIWithState();
      safeRenderAll();
    });
  });

  $id("profileSelector")?.addEventListener("change", (e) => switchProfile(e.target.value));
  $id("openProfileModalBtn")?.addEventListener("click", openProfileManager);
  $id("closeProfileModalBtn")?.addEventListener("click", closeProfileManager);
  $id("profileManagerModal")?.addEventListener("click", (e) => {
    if (e.target.id === "profileManagerModal") closeProfileManager();
  });
  $id("createProfileBtn")?.addEventListener("click", () => {
    const input = $id("newProfileNameInput");
    if (!input) return;
    createNewProfile(input.value);
    input.value = "";
  });
  $id("saveProfileBtn")?.addEventListener("click", () => {
    autoSaveCurrentState();
    showToast(`Cambios guardados en "${getActiveProfile()?.name}"`);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = $id("profileManagerModal");
      if (modal && !modal.classList.contains("hidden")) {
        closeProfileManager();
      }
    }
  });

  $id("chartScrubber")?.addEventListener("input", (e) => {
    chartsMod.setInspectedWeek?.(Number(e.target.value), true);
  });

  $id("zoomInBtn")?.addEventListener("click", () => {
    chartsMod.adjustChartZoom?.("in", store.appState.bodyProfile.simWeeks);
  });
  $id("zoomOutBtn")?.addEventListener("click", () => {
    chartsMod.adjustChartZoom?.("out", store.appState.bodyProfile.simWeeks);
  });
  $id("resetZoomBtn")?.addEventListener("click", () => {
    chartsMod.adjustChartZoom?.("reset", store.appState.bodyProfile.simWeeks);
  });

  [
    ["toggleZonesBtn", "zones"],
    ["toggleBandBtn", "band"],
    ["toggleDosesBtn", "doses"]
  ].forEach(([btnId, layerKey]) => {
    const btn = $id(btnId);
    btn?.addEventListener("click", () => {
      if (!chartsMod.toggleChartLayer) return;
      const active = chartsMod.toggleChartLayer(layerKey);
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  });

  const profileInputs = ["sex", "age", "height", "weight", "bodyFat", "simWeeks"];
  let profileInputTimer = null;
  const applyProfileInputs = () => {
    const bp = store.appState.bodyProfile;
    if ($id("sex")) bp.sex = $id("sex").value;
    if ($id("age")) bp.age = clampNum($id("age").value, 15, 100, 22);
    if ($id("height")) bp.height = clampNum($id("height").value, 120, 230, 180);
    if ($id("weight")) bp.weight = clampNum($id("weight").value, 35, 250, 110);
    if ($id("bodyFat")) bp.bodyFat = clampNum($id("bodyFat").value, 4, 65, 32);
    if ($id("simWeeks")) bp.simWeeks = clampNum($id("simWeeks").value, 4, 104, 24);

    scheduleAutoSave();
    safeRenderAll();
  };
  profileInputs.forEach((id) => {
    $id(id)?.addEventListener("input", () => {
      if (profileInputTimer !== null) clearTimeout(profileInputTimer);
      profileInputTimer = setTimeout(() => {
        profileInputTimer = null;
        applyProfileInputs();
      }, 120);
    });
  });

  $id("startDate")?.addEventListener("change", (e) => {
    store.appState.bodyProfile.startDate = e.target.value;
    autoSaveCurrentState();
    safeRenderAll();
    renderExamsTable();
    renderAnthroTable();
    renderDosesTable();
  });

  $id("estimateBodyFatBtn")?.addEventListener("click", () => {
    const bp = store.appState.bodyProfile;
    const sex = $id("sex")?.value || bp.sex || "male";
    const age = clampNum($id("age")?.value, 15, 100, bp.age || 22);
    const weight = clampNum($id("weight")?.value, 35, 250, bp.weight || 110);
    const height = clampNum($id("height")?.value, 120, 230, bp.height || 180);
    const bf = estimateBodyFatCUNBAE(sex, age, weight, height);
    bp.sex = sex;
    bp.age = age;
    bp.weight = weight;
    bp.height = height;
    bp.bodyFat = bf;
    if ($id("bodyFat")) $id("bodyFat").value = String(bf);
    scheduleAutoSave();
    safeRenderAll();
    showToast(`Grasa corporal estimada (CUN-BAE): ${bf}%`);
  });

  function updateDoseTypeUI() {
    const type = $id("doseType")?.value;
    const label = $id("doseAmountLabel");
    const input = $id("doseAmount");
    const hint = $id("doseHintText");
    if (!type || !label || !input) return;

    if (type === "calcifediol") {
      label.textContent = "Dosis por toma (µg)";
      if (hint) hint.textContent = "Hidroferol cápsula blanda: 266 µg (0,266 mg) • ~16.000 UI eq.";
      input.min = "10";
      input.max = "5000";
      input.step = "266";
      if (Number(input.value) > 5000 || Number(input.value) <= 100) {
        input.value = "266";
      }
    } else {
      label.textContent = "Dosis por toma (UI)";
      if (hint) hint.textContent = "Colecalciferol D3: 1.000 – 50.000 UI por toma";
      input.min = "100";
      input.max = "600000";
      input.step = "500";
      if (Number(input.value) <= 1000) {
        input.value = "4000";
      }
    }
  }

  $id("doseType")?.addEventListener("change", updateDoseTypeUI);

  $id("addExamBtn")?.addEventListener("click", () => {
    const week = clampNum($id("examWeek")?.value, 0, 104, 0);
    const rawVal = parseFloat($id("examValue")?.value);
    if (!Number.isFinite(rawVal) || rawVal <= 0) {
      showToast("Ingresa un valor de examen válido");
      return;
    }
    const valueNg = fromDisplayUnit(rawVal);
    const note = ($id("examNote")?.value || "").trim();

    store.appState.bloodMeasurements.push({ id: cryptoId(), week, valueNg, note });
    if ($id("examNote")) $id("examNote").value = "";
    autoSaveCurrentState();
    renderExamsTable();
    safeRenderAll();
    showToast("Examen registrado");
  });

  $id("addAnthroBtn")?.addEventListener("click", () => {
    const week = clampNum($id("anthroWeek")?.value, 0.5, 104, 4);
    const weight = clampNum($id("anthroWeight")?.value, 35, 250, 100);
    const bodyFat = clampNum($id("anthroFat")?.value, 4, 65, 25);

    store.appState.anthropometryLogs.push({ id: cryptoId(), week, weight, bodyFat });
    autoSaveCurrentState();
    renderAnthroTable();
    safeRenderAll();
    showToast("Control antropométrico registrado");
  });

  $id("addDoseBtn")?.addEventListener("click", () => {
    const type = $id("doseType")?.value || "d3";
    const rawAmount = parseFloat($id("doseAmount")?.value);
    const freq = $id("doseFreq")?.value || "daily";
    const startWeek = clampNum($id("doseStartWeek")?.value, 0, 104, 0);
    const endWeek = clampNum($id("doseEndWeek")?.value, 0.5, 104, 12);

    if (freq !== "single" && endWeek <= startWeek) {
      showToast("La semana final debe ser mayor a la inicial");
      return;
    }

    const isCalci = type === "calcifediol";
    let amount;
    let iu;
    let ug;
    if (isCalci) {
      amount = clampNum(rawAmount, 10, 5000, 266);
      ug = amount;
      iu = Math.round(amount * 60);
    } else {
      amount = clampNum(rawAmount, 50, 1000000, 2000);
      iu = amount;
      ug = Math.round(amount / 40);
    }

    const editId = getEditingDoseId();
    if (editId) {
      const idx = store.appState.doses.findIndex((item) => item.id === editId);
      if (idx >= 0) {
        store.appState.doses[idx] = {
          id: editId,
          type,
          amount,
          iu,
          ug,
          freq,
          startWeek,
          endWeek
        };
      }
      autoSaveCurrentState();
      clearDoseEditMode();
      safeRenderAll();
      showToast(`Tramo de ${isCalci ? "Hidroferol" : "D3"} actualizado`);
      return;
    }

    store.appState.doses.push({
      id: cryptoId(),
      type,
      amount,
      iu,
      ug,
      freq,
      startWeek,
      endWeek
    });
    autoSaveCurrentState();
    renderDosesTable();
    safeRenderAll();
    showToast(`Tramo de ${isCalci ? "Hidroferol" : "D3"} agregado`);
  });

  $id("cancelDoseEditBtn")?.addEventListener("click", clearDoseEditMode);

  $id("clearDosesBtn")?.addEventListener("click", () => {
    store.appState.doses = [];
    autoSaveCurrentState();
    clearDoseEditMode();
    safeRenderAll();
    showToast("Tramos de dosis eliminados");
  });

  $id("calculatePlanBtn")?.addEventListener("click", generateTargetPlans);
  $id("saveSimBtn")?.addEventListener("click", saveCurrentSimulationToMemory);
  $id("exportMemoriesBtn")?.addEventListener("click", exportMemoriesJSON);
  $id("importMemoriesInput")?.addEventListener("change", (e) => {
    importMemoriesJSON(e.target.files?.[0]);
    e.target.value = "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  bindUIEvents();

  try {
    initializeProfiles();
    renderProfileSelector();
    syncUIWithState();
    safeRenderAll();
    renderMemoriesList();
  } catch (err) {
    console.error("Error inicializando estado:", err);
  }

  checkDesktopUpdate();
});