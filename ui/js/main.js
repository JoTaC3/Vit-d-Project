/**
 * Punto de Entrada Principal (ES Modules)
 */

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
  renderProfilesModalList
} from "./ui.js";
import { setInspectedWeek, adjustChartZoom, toggleChartLayer } from "./charts.js";

function $id(id) {
  return document.getElementById(id);
}

const SUN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const MOON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY_THEME, theme);
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

function openProfileManager() {
  renderProfilesModalList(
    (id) => {
      switchProfile(id);
      closeProfileManager();
    },
    (id) => renameProfile(id),
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
  runSimulationAndRender();
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
  runSimulationAndRender();
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
  runSimulationAndRender();
  renderMemoriesList();
  renderProfileSelector();
  openProfileManager();
  showToast("Perfil eliminado");
}

function renameProfile(profileId) {
  const prof = store.profilesStore.profiles.find((p) => p.id === profileId);
  if (!prof) return;
  const newName = prompt("Nuevo nombre para el perfil:", prof.name);
  if (newName && newName.trim()) {
    prof.name = newName.trim();
    prof.updatedAt = new Date().toISOString();
    persistProfilesStore();
    renderProfileSelector();
    openProfileManager();
    showToast("Perfil renombrado");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initializeProfiles();
  renderProfileSelector();
  syncUIWithState();
  runSimulationAndRender();
  renderMemoriesList();

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $id("themeToggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
    runSimulationAndRender();
  });

  document.querySelectorAll("#unitToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextUnit = btn.dataset.unit;
      if (nextUnit === store.appState.unit) return;
      store.appState.unit = nextUnit;
      autoSaveCurrentState();
      syncUIWithState();
      runSimulationAndRender();
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

  /* Interactive Chart Controls */
  $id("chartScrubber")?.addEventListener("input", (e) => {
    setInspectedWeek(Number(e.target.value), true);
  });

  $id("zoomInBtn")?.addEventListener("click", () => adjustChartZoom("in", store.appState.bodyProfile.simWeeks));
  $id("zoomOutBtn")?.addEventListener("click", () => adjustChartZoom("out", store.appState.bodyProfile.simWeeks));
  $id("resetZoomBtn")?.addEventListener("click", () => adjustChartZoom("reset", store.appState.bodyProfile.simWeeks));

  [
    ["toggleZonesBtn", "zones"],
    ["toggleBandBtn", "band"],
    ["toggleDosesBtn", "doses"]
  ].forEach(([btnId, layerKey]) => {
    const btn = $id(btnId);
    btn?.addEventListener("click", () => {
      const active = toggleChartLayer(layerKey);
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  });

  const profileInputs = ["sex", "age", "height", "weight", "bodyFat", "skinTone", "sunExposure", "simWeeks"];
  profileInputs.forEach((id) => {
    $id(id)?.addEventListener("input", () => {
      const bp = store.appState.bodyProfile;
      bp.sex = $id("sex").value;
      bp.age = clampNum($id("age").value, 15, 100, 22);
      bp.height = clampNum($id("height").value, 120, 230, 180);
      bp.weight = clampNum($id("weight").value, 35, 250, 110);
      bp.bodyFat = clampNum($id("bodyFat").value, 4, 65, 32);
      bp.skinTone = clampNum($id("skinTone").value, 0.5, 1.5, 1.0);
      bp.sunExposure = clampNum($id("sunExposure").value, 0, 10000, 0);
      bp.simWeeks = clampNum($id("simWeeks").value, 4, 104, 24);

      autoSaveCurrentState();
      runSimulationAndRender();
    });
  });

  $id("addExamBtn")?.addEventListener("click", () => {
    const week = clampNum($id("examWeek").value, 0, 104, 0);
    const rawVal = parseFloat($id("examValue").value);
    if (!Number.isFinite(rawVal) || rawVal <= 0) {
      showToast("Ingresa un valor de examen válido");
      return;
    }
    const valueNg = fromDisplayUnit(rawVal);
    const note = ($id("examNote").value || "").trim();

    store.appState.bloodMeasurements.push({ id: cryptoId(), week, valueNg, note });
    $id("examNote").value = "";
    autoSaveCurrentState();
    renderExamsTable();
    runSimulationAndRender();
    showToast("Examen registrado");
  });

  $id("addAnthroBtn")?.addEventListener("click", () => {
    const week = clampNum($id("anthroWeek").value, 0.5, 104, 4);
    const weight = clampNum($id("anthroWeight").value, 35, 250, 100);
    const bodyFat = clampNum($id("anthroFat").value, 4, 65, 25);

    store.appState.anthropometryLogs.push({ id: cryptoId(), week, weight, bodyFat });
    autoSaveCurrentState();
    renderAnthroTable();
    runSimulationAndRender();
    showToast("Control antropométrico registrado");
  });

  $id("addDoseBtn")?.addEventListener("click", () => {
    const type = $id("doseType").value;
    const iu = clampNum($id("doseIU").value, 50, 1000000, 2000);
    const freq = $id("doseFreq").value;
    const startWeek = clampNum($id("doseStartWeek").value, 0, 104, 0);
    const endWeek = clampNum($id("doseEndWeek").value, 0.5, 104, 12);

    if (freq !== "single" && endWeek <= startWeek) {
      showToast("La semana final debe ser mayor a la inicial");
      return;
    }

    store.appState.doses.push({ id: cryptoId(), type, iu, freq, startWeek, endWeek });
    autoSaveCurrentState();
    renderDosesTable();
    runSimulationAndRender();
    showToast("Tramo de dosis agregado");
  });

  $id("clearDosesBtn")?.addEventListener("click", () => {
    store.appState.doses = [];
    autoSaveCurrentState();
    renderDosesTable();
    runSimulationAndRender();
    showToast("Tramos de dosis eliminados");
  });

  $id("calculatePlanBtn")?.addEventListener("click", generateTargetPlans);

  $id("saveSimBtn")?.addEventListener("click", saveCurrentSimulationToMemory);
  $id("exportMemoriesBtn")?.addEventListener("click", exportMemoriesJSON);
  $id("importMemoriesInput")?.addEventListener("change", (e) => {
    importMemoriesJSON(e.target.files?.[0]);
    e.target.value = "";
  });
});