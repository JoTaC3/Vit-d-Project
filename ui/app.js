/**
 * VITAMINA D SIMULATOR V7.1
 * Motor Farmacocinético Compartimental ODE (RK4)
 * Colecalciferol (D3) + Calcifediol 25(OH)D3 + Gestor Multi-Perfil Persistente
 */

const NG_TO_NMOL = 2.496;
const STORAGE_KEY_PROFILES = "vitd_sim_v7_profiles";
const STORAGE_KEY_THEME = "vitd_sim_v7_theme";

// ============================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ============================================================================
function createDefaultProfileState() {
  return {
    unit: "ng/mL",
    bodyProfile: {
      sex: "male",
      age: 22,
      height: 180,
      weight: 110,
      bodyFat: 32,
      skinTone: 1.0,
      sunExposure: 0,
      simWeeks: 24
    },
    bloodMeasurements: [
      { id: cryptoId(), week: 0, valueNg: 23.5, note: "Basal inicial" }
    ],
    anthropometryLogs: [],
    doses: [
      {
        id: cryptoId(),
        type: "d3",
        iu: 4000,
        freq: "daily",
        startWeek: 0,
        endWeek: 12
      },
      {
        id: cryptoId(),
        type: "d3",
        iu: 2000,
        freq: "daily",
        startWeek: 12,
        endWeek: 24
      }
    ]
  };
}

let profilesStore = {
  activeProfileId: null,
  profiles: []
};

let appState = createDefaultProfileState();
let savedSimulations = [];

let bloodChart = null;
let adiposeChart = null;
let intakeChart = null;

// ============================================================================
// UTILIDADES GENERALES Y CONVERSIÓN DE UNIDADES
// ============================================================================
function cryptoId() {
  return "id_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function $id(id) {
  return document.getElementById(id);
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function toDisplayUnit(valNg, unit = appState.unit) {
  if (valNg == null || isNaN(valNg)) return 0;
  return unit === "nmol/L" ? valNg * NG_TO_NMOL : valNg;
}

function fromDisplayUnit(valDisplay, unit = appState.unit) {
  if (valDisplay == null || isNaN(valDisplay)) return 0;
  return unit === "nmol/L" ? valDisplay / NG_TO_NMOL : valDisplay;
}

function formatLevel(valNg, decimals = 1, unit = appState.unit) {
  const converted = toDisplayUnit(valNg, unit);
  return `${converted.toFixed(decimals)} ${unit}`;
}

function formatNumber(val, decimals = 1) {
  return Number(val).toFixed(decimals);
}

function showToast(message) {
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

// ============================================================================
// GESTIÓN MULTI-PERFIL Y PERSISTENCIA UNIFICADA
// ============================================================================
function initializeProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        profilesStore = parsed;
      }
    }
  } catch (e) {
    console.warn("Error leyendo perfiles:", e);
  }

  if (profilesStore.profiles.length === 0) {
    const defaultId = cryptoId();
    profilesStore = {
      activeProfileId: defaultId,
      profiles: [
        {
          id: defaultId,
          name: "Perfil Principal",
          updatedAt: new Date().toISOString(),
          state: createDefaultProfileState(),
          savedSimulations: []
        }
      ]
    };
    persistProfilesStore();
  }

  const active = getActiveProfile();
  if (active) {
    appState = sanitizeState(active.state);
    savedSimulations = Array.isArray(active.savedSimulations) ? active.savedSimulations : [];
  }
}

function sanitizeState(rawState) {
  const base = createDefaultProfileState();
  if (!rawState || typeof rawState !== "object") return base;

  const bp = rawState.bodyProfile || {};
  return {
    unit: rawState.unit === "nmol/L" ? "nmol/L" : "ng/mL",
    bodyProfile: {
      sex: bp.sex === "female" ? "female" : "male",
      age: clampNum(bp.age, 15, 100, 22),
      height: clampNum(bp.height, 120, 230, 180),
      weight: clampNum(bp.weight, 35, 250, 110),
      bodyFat: clampNum(bp.bodyFat, 4, 65, 32),
      skinTone: clampNum(bp.skinTone, 0.5, 1.5, 1.0),
      sunExposure: clampNum(bp.sunExposure, 0, 10000, 0),
      simWeeks: clampNum(bp.simWeeks, 4, 104, 24)
    },
    bloodMeasurements: Array.isArray(rawState.bloodMeasurements)
      ? rawState.bloodMeasurements.map((m) => ({
          id: String(m.id || cryptoId()),
          week: clampNum(m.week, 0, 104, 0),
          valueNg: clampNum(m.valueNg, 1, 500, 20),
          note: String(m.note || "").slice(0, 80)
        }))
      : base.bloodMeasurements,
    anthropometryLogs: Array.isArray(rawState.anthropometryLogs)
      ? rawState.anthropometryLogs.map((a) => ({
          id: String(a.id || cryptoId()),
          week: clampNum(a.week, 0.5, 104, 4),
          weight: clampNum(a.weight, 35, 250, 100),
          bodyFat: clampNum(a.bodyFat, 4, 65, 25)
        }))
      : [],
    doses: Array.isArray(rawState.doses)
      ? rawState.doses.map((d) => ({
          id: String(d.id || cryptoId()),
          type: d.type === "calcifediol" ? "calcifediol" : "d3",
          iu: clampNum(d.iu, 50, 1000000, 2000),
          freq: ["daily", "weekly", "biweekly", "monthly", "single"].includes(d.freq) ? d.freq : "daily",
          startWeek: clampNum(d.startWeek, 0, 104, 0),
          endWeek: clampNum(d.endWeek, 0.5, 104, 12)
        }))
      : base.doses
  };
}

function clampNum(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getActiveProfile() {
  return (
    profilesStore.profiles.find((p) => p.id === profilesStore.activeProfileId) ||
    profilesStore.profiles[0]
  );
}

function persistProfilesStore() {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profilesStore));
  } catch (e) {
    console.error("Error guardando perfiles:", e);
  }
}

function autoSaveCurrentState() {
  const active = getActiveProfile();
  if (active) {
    active.state = JSON.parse(JSON.stringify(appState));
    active.savedSimulations = JSON.parse(JSON.stringify(savedSimulations));
    active.updatedAt = new Date().toISOString();
    persistProfilesStore();
  }
}

function renderProfileSelector() {
  const sel = $id("profileSelector");
  if (!sel) return;
  sel.innerHTML = "";
  profilesStore.profiles.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === profilesStore.activeProfileId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function switchProfile(profileId) {
  autoSaveCurrentState();
  const target = profilesStore.profiles.find((p) => p.id === profileId);
  if (!target) return;

  profilesStore.activeProfileId = target.id;
  appState = sanitizeState(target.state);
  savedSimulations = Array.isArray(target.savedSimulations) ? target.savedSimulations : [];

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
  profilesStore.profiles.push({
    id: newId,
    name: cleanName,
    updatedAt: new Date().toISOString(),
    state: freshState,
    savedSimulations: []
  });
  profilesStore.activeProfileId = newId;
  appState = sanitizeState(freshState);
  savedSimulations = [];

  persistProfilesStore();
  syncUIWithState();
  runSimulationAndRender();
  renderMemoriesList();
  renderProfileSelector();
  renderProfilesModalList();
  showToast(`Perfil "${cleanName}" creado`);
}

function deleteProfile(profileId) {
  if (profilesStore.profiles.length <= 1) {
    showToast("Debe existir al menos un perfil activo");
    return;
  }
  profilesStore.profiles = profilesStore.profiles.filter((p) => p.id !== profileId);
  if (profilesStore.activeProfileId === profileId) {
    const next = profilesStore.profiles[0];
    profilesStore.activeProfileId = next.id;
    appState = sanitizeState(next.state);
    savedSimulations = Array.isArray(next.savedSimulations) ? next.savedSimulations : [];
  }
  persistProfilesStore();
  syncUIWithState();
  runSimulationAndRender();
  renderMemoriesList();
  renderProfileSelector();
  renderProfilesModalList();
  showToast("Perfil eliminado");
}

function renameProfile(profileId) {
  const prof = profilesStore.profiles.find((p) => p.id === profileId);
  if (!prof) return;
  const newName = prompt("Nuevo nombre para el perfil:", prof.name);
  if (newName && newName.trim()) {
    prof.name = newName.trim();
    prof.updatedAt = new Date().toISOString();
    persistProfilesStore();
    renderProfileSelector();
    renderProfilesModalList();
    showToast("Perfil renombrado");
  }
}

function renderProfilesModalList() {
  const container = $id("profilesListContainer");
  if (!container) return;
  container.innerHTML = "";

  profilesStore.profiles.forEach((p) => {
    const isActive = p.id === profilesStore.activeProfileId;
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
        ${profilesStore.profiles.length > 1 ? `<button class="btn-secondary small" data-action="delete" data-id="${p.id}" title="Eliminar">🗑️</button>` : ""}
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === "activate") {
        switchProfile(id);
        closeProfileManager();
      } else if (action === "rename") {
        renameProfile(id);
      } else if (action === "delete") {
        deleteProfile(id);
      }
    });
  });
}

function openProfileManager() {
  renderProfilesModalList();
  $id("profileManagerModal")?.classList.remove("hidden");
}

function closeProfileManager() {
  $id("profileManagerModal")?.classList.add("hidden");
}

// ============================================================================
// MOTOR FARMACOCINÉTICO COMPARTIMENTAL (ODE + RK4)
// ============================================================================
function computePhysiologicalParameters(profile, weight, bodyFatPct) {
  const hMeters = (profile.height || 175) / 100;
  const bmi = weight / (hMeters * hMeters);
  const fatMass = weight * (bodyFatPct / 100);
  const leanMass = Math.max(25, weight - fatMass);

  // Volumen de distribución efectivo en litros equivalente
  const refFatPct = profile.sex === "female" ? 26 : 18;
  const excessFatFactor = Math.max(0, (bodyFatPct - refFatPct) / 100);
  const leanScaling = Math.pow(leanMass / 60, 0.75);
  const adipositySequestration = 1 + 1.45 * excessFatFactor + Math.max(0, (bmi - 25) * 0.012);

  const effectiveVolume = 13.8 * leanScaling * adipositySequestration;

  // Tasa de eliminación de 25(OH)D3 (~21 días semivida basal)
  const ageFactor = 1 - Math.max(0, (profile.age - 30) * 0.0022);
  const kElim25 = (Math.LN2 / 21.5) * ageFactor;

  // Constantes compartimento D3 -> 25(OH)D3
  const k25Conversion = 0.24;
  const kAdiposeCapture = 0.08 * (1 + 1.8 * excessFatFactor);
  const kAdiposeRelease = 0.016;
  const kLossD3 = 0.045;

  // Síntesis solar endógena
  const sunDailyIU = (profile.sunExposure || 0) * (profile.skinTone || 1.0) * ageFactor;

  return {
    effectiveVolume,
    kElim25,
    k25Conversion,
    kAdiposeCapture,
    kAdiposeRelease,
    kLossD3,
    sunDailyIU,
    bmi,
    leanMass,
    fatMass
  };
}

function computeDoseEfficiency(dose) {
  if (dose.type === "calcifediol") {
    return 3.15;
  }
  const iu = dose.iu;
  if (iu <= 2000) return 1.0;
  if (iu <= 5000) return 0.96;
  if (iu <= 10000) return 0.91;
  if (iu <= 50000) return 0.82;
  if (iu <= 100000) return 0.74;
  return 0.65;
}

function expandDosesToTimeline(doses, totalDays) {
  const events = [];
  doses.forEach((d) => {
    const startDay = Math.max(0, Math.round(d.startWeek * 7));
    const endDay = Math.min(totalDays, Math.round(d.endWeek * 7));
    const eff = computeDoseEfficiency(d);

    if (d.freq === "single") {
      if (startDay <= totalDays) {
        events.push({ day: startDay, type: d.type, iu: d.iu, efficiency: eff });
      }
      return;
    }

    const stepDays =
      d.freq === "daily" ? 1 :
      d.freq === "weekly" ? 7 :
      d.freq === "biweekly" ? 14 : 30;

    for (let day = startDay; day < endDay; day += stepDays) {
      events.push({ day, type: d.type, iu: d.iu, efficiency: eff });
    }
  });
  return events;
}

function buildBodyTimeline(totalDays, weightScale = 1.0) {
  const baseWeight = appState.bodyProfile.weight * weightScale;
  const baseFat = appState.bodyProfile.bodyFat;

  const sortedLogs = [...appState.anthropometryLogs]
    .map((l) => ({
      day: l.week * 7,
      weight: l.weight * weightScale,
      bodyFat: l.bodyFat
    }))
    .sort((a, b) => a.day - b.day);

  const points = [{ day: 0, weight: baseWeight, bodyFat: baseFat }];
  sortedLogs.forEach((l) => {
    if (l.day > 0) points.push(l);
  });

  const timeline = new Array(totalDays + 2);
  let idx = 0;

  for (let d = 0; d <= totalDays + 1; d++) {
    while (idx < points.length - 1 && points[idx + 1].day <= d) {
      idx++;
    }
    const p0 = points[idx];
    const p1 = points[Math.min(idx + 1, points.length - 1)];

    let w = p0.weight;
    let f = p0.bodyFat;

    if (p1.day > p0.day && d > p0.day) {
      const alpha = Math.min(1, (d - p0.day) / (p1.day - p0.day));
      w = p0.weight + alpha * (p1.weight - p0.weight);
      f = p0.bodyFat + alpha * (p1.bodyFat - p0.bodyFat);
    }

    timeline[d] = computePhysiologicalParameters(appState.bodyProfile, w, f);
  }
  return timeline;
}

function getInitialBaselineNg() {
  const sortedExams = [...appState.bloodMeasurements].sort((a, b) => a.week - b.week);
  const weekZero = sortedExams.find((e) => e.week === 0);
  if (weekZero) return weekZero.valueNg;
  if (sortedExams.length > 0) return sortedExams[0].valueNg;
  return 22.0;
}

function integrateTrajectory(totalDays, doseEvents, opts, bodyTimeline) {
  const dt = 0.25; // pasos de 6 horas para alta precisión RK4
  const steps = Math.round(totalDays / dt);

  const dosesByDay = new Map();
  doseEvents.forEach((ev) => {
    const arr = dosesByDay.get(ev.day) || [];
    arr.push(ev);
    dosesByDay.set(ev.day, arr);
  });

  const p0 = bodyTimeline[0];
  let C2 = opts.baseline;
  let A1 = (C2 * p0.effectiveVolume * p0.kElim25) / (p0.k25Conversion || 0.24);
  let A_adip = A1 * (p0.kAdiposeCapture / (p0.kAdiposeRelease || 0.016));

  const weeks = [];
  const levels = [];
  const adiposeReserve = [];
  const freeD3 = [];
  const dailyEquivIU = [];

  for (let s = 0; s <= steps; s++) {
    const tDays = s * dt;
    const dayInt = Math.floor(tDays);
    const params = bodyTimeline[Math.min(dayInt, bodyTimeline.length - 1)];

    // Aplicar bolos al inicio del día
    if (Math.abs(tDays - dayInt) < 1e-6) {
      const todaysEvents = dosesByDay.get(dayInt) || [];
      todaysEvents.forEach((ev) => {
        if (ev.type === "d3") {
          A1 += (ev.iu / 1000) * ev.efficiency;
        } else {
          // Calcifediol entra directamente al compartimento sérico
          const deltaC = ((ev.iu / 1000) * ev.efficiency * 0.28) / params.effectiveVolume;
          C2 += deltaC;
        }
      });
    }

    if (s % 4 === 0) {
      weeks.push(Number((tDays / 7).toFixed(2)));
      levels.push(Math.max(1, C2));
      adiposeReserve.push(Math.max(0, A_adip));
      freeD3.push(Math.max(0, A1));

      const todaysEvents = dosesByDay.get(dayInt) || [];
      const exogIU = todaysEvents.reduce((acc, ev) => acc + ev.iu * ev.efficiency, 0);
      dailyEquivIU.push(Math.round(exogIU + params.sunDailyIU));
    }

    if (s === steps) break;

    const sunKiloIU = params.sunDailyIU / 1000;
    const Vd = params.effectiveVolume;

    const derivatives = (a1, aAdip, c2) => {
      const satConversion = (params.k25Conversion * a1) / (1 + a1 / 65);
      const da1 =
        sunKiloIU +
        params.kAdiposeRelease * aAdip -
        (satConversion + params.kAdiposeCapture + params.kLossD3) * a1;

      const daAdip = params.kAdiposeCapture * a1 - params.kAdiposeRelease * aAdip;
      const dc2 = (satConversion * 0.30) / Vd - params.kElim25 * c2;
      return [da1, daAdip, dc2];
    };

    const [k1a, k1ad, k1c] = derivatives(A1, A_adip, C2);
    const [k2a, k2ad, k2c] = derivatives(
      A1 + 0.5 * dt * k1a,
      A_adip + 0.5 * dt * k1ad,
      C2 + 0.5 * dt * k1c
    );
    const [k3a, k3ad, k3c] = derivatives(
      A1 + 0.5 * dt * k2a,
      A_adip + 0.5 * dt * k2ad,
      C2 + 0.5 * dt * k2c
    );
    const [k4a, k4ad, k4c] = derivatives(
      A1 + dt * k3a,
      A_adip + dt * k3ad,
      C2 + dt * k3c
    );

    A1 = Math.max(0, A1 + (dt / 6) * (k1a + 2 * k2a + 2 * k3a + k4a));
    A_adip = Math.max(0, A_adip + (dt / 6) * (k1ad + 2 * k2ad + 2 * k3ad + k4ad));
    C2 = Math.max(1, C2 + (dt / 6) * (k1c + 2 * k2c + 2 * k3c + k4c));
  }

  return { weeks, levels, adiposeReserve, freeD3, dailyEquivIU };
}

function solveDoseWithRK4(targetNg, baselineNg, loadWeeks, maintWeeks, freq, doseType) {
  const loadDays = Math.max(7, Math.round(loadWeeks * 7));
  const maintDays = Math.max(0, Math.round(maintWeeks * 7));
  const totalDays = loadDays + maintDays;

  const stepDays =
    freq === "daily" ? 1 :
    freq === "weekly" ? 7 :
    freq === "biweekly" ? 14 : 30;

  const timeline = buildBodyTimeline(totalDays, 1.0);

  // 1. Búsqueda binaria para dosis de carga
  let low = 100;
  let high = doseType === "calcifediol" ? 150000 : 300000;
  let bestLoadIU = 2000;

  for (let iter = 0; iter < 24; iter++) {
    const mid = (low + high) / 2;
    const eff = computeDoseEfficiency({ type: doseType, iu: mid });
    const events = [];
    for (let d = 0; d < loadDays; d += stepDays) {
      events.push({ day: d, type: doseType, iu: mid, efficiency: eff });
    }
    const traj = integrateTrajectory(loadDays, events, { baseline: baselineNg }, timeline);
    const endLevel = traj.levels[traj.levels.length - 1];

    if (endLevel < targetNg) {
      low = mid;
    } else {
      high = mid;
    }
    bestLoadIU = mid;
  }

  const roundStep = freq === "daily" ? 100 : 500;
  bestLoadIU = Math.max(roundStep, Math.round(bestLoadIU / roundStep) * roundStep);

  // 2. Búsqueda binaria para dosis de mantenimiento diario
  let bestMaintIU = 2000;
  if (maintDays > 0) {
    let mLow = 200;
    let mHigh = 20000;
    const loadEff = computeDoseEfficiency({ type: doseType, iu: bestLoadIU });
    const loadEvents = [];
    for (let d = 0; d < loadDays; d += stepDays) {
      loadEvents.push({ day: d, type: doseType, iu: bestLoadIU, efficiency: loadEff });
    }

    for (let iter = 0; iter < 20; iter++) {
      const mMid = (mLow + mHigh) / 2;
      const mEff = computeDoseEfficiency({ type: "d3", iu: mMid });
      const events = [...loadEvents];
      for (let d = loadDays; d < totalDays; d += 1) {
        events.push({ day: d, type: "d3", iu: mMid, efficiency: mEff });
      }
      const traj = integrateTrajectory(totalDays, events, { baseline: baselineNg }, timeline);
      const finalLevel = traj.levels[traj.levels.length - 1];

      if (finalLevel < targetNg) {
        mLow = mMid;
      } else {
        mHigh = mMid;
      }
      bestMaintIU = mMid;
    }
    bestMaintIU = Math.max(200, Math.round(bestMaintIU / 100) * 100);
  }

  // Simular curva completa resultante
  const finalEvents = [];
  const lEff = computeDoseEfficiency({ type: doseType, iu: bestLoadIU });
  for (let d = 0; d < loadDays; d += stepDays) {
    finalEvents.push({ day: d, type: doseType, iu: bestLoadIU, efficiency: lEff });
  }
  const mEff = computeDoseEfficiency({ type: "d3", iu: bestMaintIU });
  for (let d = loadDays; d < totalDays; d += 1) {
    finalEvents.push({ day: d, type: "d3", iu: bestMaintIU, efficiency: mEff });
  }

  const fullTraj = integrateTrajectory(totalDays, finalEvents, { baseline: baselineNg }, timeline);
  const peakNg = Math.max(...fullTraj.levels);
  const endNg = fullTraj.levels[fullTraj.levels.length - 1];
  const dailyLoadEq = bestLoadIU / stepDays;

  return {
    loadIU: bestLoadIU,
    maintIU: bestMaintIU,
    dailyLoadEq,
    peakNg,
    endNg,
    stepDays
  };
}

function estimateSafeWeeksRK4(initialLevelNg, targetLevelNg) {
  if (targetLevelNg <= initialLevelNg) return 1;
  const maxTestWeeks = 104;
  const maxTestDays = maxTestWeeks * 7;
  const timeline = buildBodyTimeline(maxTestDays, 1.0);
  const eff = computeDoseEfficiency({ type: "d3", iu: 4000 });
  const events = [];
  for (let d = 0; d < maxTestDays; d++) {
    events.push({ day: d, type: "d3", iu: 4000, efficiency: eff });
  }
  const traj = integrateTrajectory(maxTestDays, events, { baseline: initialLevelNg }, timeline);
  for (let i = 0; i < traj.levels.length; i++) {
    if (traj.levels[i] >= targetLevelNg) {
      return Math.max(1, Math.ceil(traj.weeks[i]));
    }
  }
  return maxTestWeeks;
}

// ============================================================================
// EJECUCIÓN DE SIMULACIÓN Y ACTUALIZACIÓN DE KPIs / GRÁFICOS
// ============================================================================
function runSimulationAndRender() {
  const totalWeeks = appState.bodyProfile.simWeeks || 24;
  const totalDays = Math.round(totalWeeks * 7);
  const baselineNg = getInitialBaselineNg();

  const bodyTimeline = buildBodyTimeline(totalDays, 1.0);
  const bodyTimelineLow = buildBodyTimeline(totalDays, 0.92);
  const bodyTimelineHigh = buildBodyTimeline(totalDays, 1.08);

  const doseEvents = expandDosesToTimeline(appState.doses, totalDays);

  const mainTraj = integrateTrajectory(totalDays, doseEvents, { baseline: baselineNg }, bodyTimeline);
  const lowerTraj = integrateTrajectory(totalDays, doseEvents, { baseline: baselineNg * 0.94 }, bodyTimelineHigh);
  const upperTraj = integrateTrajectory(totalDays, doseEvents, { baseline: baselineNg * 1.06 }, bodyTimelineLow);

  updateKPIs(mainTraj, bodyTimeline[0], totalWeeks);
  renderCharts(mainTraj, lowerTraj, upperTraj, totalWeeks);
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

// ============================================================================
// RENDERIZADO DE GRÁFICOS (CHART.JS)
// ============================================================================
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

function renderCharts(mainTraj, lowerTraj, upperTraj, totalWeeks) {
  const colors = getChartThemeColors();
  const unit = appState.unit;

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

  const examPoints = appState.bloodMeasurements
    .filter((e) => e.week <= totalWeeks)
    .map((e) => ({
      x: e.week,
      y: Number(toDisplayUnit(e.valueNg, unit).toFixed(2)),
      note: e.note || "Examen"
    }));

  const optLow = Number(toDisplayUnit(30, unit).toFixed(1));
  const optHigh = Number(toDisplayUnit(60, unit).toFixed(1));
  const toxThresh = Number(toDisplayUnit(100, unit).toFixed(1));

  const maxDataY = Math.max(
    toxThresh * 1.05,
    ...upperPoints.map((p) => p.y * 1.1),
    ...examPoints.map((p) => p.y * 1.15)
  );

  const bloodCtx = $id("bloodChart")?.getContext("2d");
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

  // Gráfico 2: Reserva Adiposa y D3 Libre
  const adipCtx = $id("adiposeChart")?.getContext("2d");
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

  // Gráfico 3: Aporte Diario Equivalente
  const intakeCtx = $id("intakeChart")?.getContext("2d");
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

// ============================================================================
// PLANIFICADOR DE OBJETIVOS (TAB 2)
// ============================================================================
function generateTargetPlans() {
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
      appState.doses = [
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
        appState.doses.push({
          id: cryptoId(),
          type: "d3",
          iu: solved.maintIU,
          freq: "daily",
          startWeek: loadWeeks,
          endWeek: loadWeeks + maintWeeks
        });
      }
      appState.bodyProfile.simWeeks = loadWeeks + maintWeeks;
      $id("simWeeks").value = appState.bodyProfile.simWeeks;

      autoSaveCurrentState();
      renderDosesTable();
      runSimulationAndRender();
      switchTab("simulador");
      showToast(`Protocolo "${strat.title}" aplicado al simulador`);
    });

    resultsGrid.appendChild(card);
  });
}

// ============================================================================
// MEMORIAS GUARDADAS Y EXPORTACIÓN / IMPORTACIÓN (TAB 3)
// ============================================================================
function saveCurrentSimulationToMemory() {
  const titleInput = $id("simTitleInput");
  const activeProf = getActiveProfile();
  const title =
    (titleInput?.value || "").trim() ||
    `Simulación ${new Date().toLocaleDateString("es-CL")} (${formatLevel(getInitialBaselineNg(), 1)})`;

  const entry = {
    id: cryptoId(),
    title,
    profileName: activeProf ? activeProf.name : "Perfil",
    createdAt: new Date().toISOString(),
    stateSnapshot: JSON.parse(JSON.stringify(appState))
  };

  savedSimulations.unshift(entry);
  autoSaveCurrentState();
  if (titleInput) titleInput.value = "";
  renderMemoriesList();
  showToast("Simulación guardada en memoria");
}

function renderMemoriesList() {
  const grid = $id("memoriesGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (savedSimulations.length === 0) {
    grid.innerHTML = `<p class="hint">No hay simulaciones guardadas en este perfil todavía. Usa el botón "💾 Guardar en Memoria" sobre el gráfico principal.</p>`;
    return;
  }

  savedSimulations.forEach((item) => {
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
      appState = sanitizeState(item.stateSnapshot);
      autoSaveCurrentState();
      syncUIWithState();
      runSimulationAndRender();
      switchTab("simulador");
      showToast(`Simulación "${item.title}" restaurada`);
    });

    card.querySelector(".del-mem-btn").addEventListener("click", () => {
      savedSimulations = savedSimulations.filter((m) => m.id !== item.id);
      autoSaveCurrentState();
      renderMemoriesList();
      showToast("Memoria eliminada");
    });

    grid.appendChild(card);
  });
}

async function exportMemoriesJSON() {
  const payload = {
    app: "Vitamina D Simulator V7.1",
    exportedAt: new Date().toISOString(),
    profilesStore
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
      // Fallback a descarga estándar
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

function importMemoriesJSON(file) {
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
        profilesStore = parsed.profilesStore;
        const active = getActiveProfile();
        profilesStore.activeProfileId = active.id;
        appState = sanitizeState(active.state);
        savedSimulations = Array.isArray(active.savedSimulations) ? active.savedSimulations : [];

        persistProfilesStore();
        syncUIWithState();
        runSimulationAndRender();
        renderMemoriesList();
        renderProfileSelector();
        showToast("Perfiles y memorias importados correctamente");
      } else {
        showToast("Archivo JSON sin estructura válida de perfiles");
      }
    } catch (err) {
      showToast("Error al leer el archivo JSON");
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// SINCRONIZACIÓN DE INTERFAZ Y TABLAS
// ============================================================================
function syncUIWithState() {
  const bp = appState.bodyProfile;
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

function updateUnitLabels() {
  const unit = appState.unit;
  document.querySelectorAll(".unit-text").forEach((el) => {
    el.textContent = unit;
  });
  const examUnitLabel = $id("examUnitLabel");
  if (examUnitLabel) examUnitLabel.textContent = unit;

  document.querySelectorAll("#unitToggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.unit === unit);
  });
}

function renderExamsTable() {
  const tbody = $id("examsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...appState.bloodMeasurements].sort((a, b) => a.week - b.week);
  sorted.forEach((exam) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${exam.week}</td>
      <td><strong>${formatNumber(toDisplayUnit(exam.valueNg), 1)}</strong></td>
      <td>${escapeHTML(exam.note || "-")}</td>
      <td><button class="btn-del" aria-label="Eliminar examen">&times;</button></td>
    `;
    tr.querySelector(".btn-del").addEventListener("click", () => {
      appState.bloodMeasurements = appState.bloodMeasurements.filter((e) => e.id !== exam.id);
      autoSaveCurrentState();
      renderExamsTable();
      runSimulationAndRender();
    });
    tbody.appendChild(tr);
  });
}

function renderAnthroTable() {
  const tbody = $id("anthroTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...appState.anthropometryLogs].sort((a, b) => a.week - b.week);
  sorted.forEach((log) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${log.week}</td>
      <td>${log.weight} kg</td>
      <td>${log.bodyFat}%</td>
      <td><button class="btn-del" aria-label="Eliminar registro">&times;</button></td>
    `;
    tr.querySelector(".btn-del").addEventListener("click", () => {
      appState.anthropometryLogs = appState.anthropometryLogs.filter((a) => a.id !== log.id);
      autoSaveCurrentState();
      renderAnthroTable();
      runSimulationAndRender();
    });
    tbody.appendChild(tr);
  });
}

function renderDosesTable() {
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

  appState.doses.forEach((d) => {
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
      appState.doses = appState.doses.filter((item) => item.id !== d.id);
      autoSaveCurrentState();
      renderDosesTable();
      runSimulationAndRender();
    });
    tbody.appendChild(tr);
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-content").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `tab-${tabName}`);
  });
}

// ============================================================================
// TEMA CLARO / OSCURO
// ============================================================================
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME) || "light";
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY_THEME, theme);
  const icon = $id("themeIcon");
  const text = $id("themeText");
  if (icon && text) {
    icon.textContent = theme === "dark" ? "☀️" : "🌙";
    text.textContent = theme === "dark" ? "Claro" : "Oscuro";
  }
}

// ============================================================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initializeProfiles();
  renderProfileSelector();
  syncUIWithState();
  runSimulationAndRender();
  renderMemoriesList();

  // Navegación de pestañas
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Cambio de tema
  $id("themeToggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
    runSimulationAndRender();
  });

  // Cambio de unidades ng/mL <-> nmol/L
  document.querySelectorAll("#unitToggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextUnit = btn.dataset.unit;
      if (nextUnit === appState.unit) return;
      appState.unit = nextUnit;
      autoSaveCurrentState();
      syncUIWithState();
      runSimulationAndRender();
    });
  });

  // Perfiles
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

  // Cierre modal con tecla Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = $id("profileManagerModal");
      if (modal && !modal.classList.contains("hidden")) {
        closeProfileManager();
      }
    }
  });

  // Listeners del Perfil Fisiológico
  const profileInputs = ["sex", "age", "height", "weight", "bodyFat", "skinTone", "sunExposure", "simWeeks"];
  profileInputs.forEach((id) => {
    $id(id)?.addEventListener("input", () => {
      const bp = appState.bodyProfile;
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

  // Agregar examen de laboratorio
  $id("addExamBtn")?.addEventListener("click", () => {
    const week = clampNum($id("examWeek").value, 0, 104, 0);
    const rawVal = parseFloat($id("examValue").value);
    if (!Number.isFinite(rawVal) || rawVal <= 0) {
      showToast("Ingresa un valor de examen válido");
      return;
    }
    const valueNg = fromDisplayUnit(rawVal);
    const note = ($id("examNote").value || "").trim();

    appState.bloodMeasurements.push({ id: cryptoId(), week, valueNg, note });
    $id("examNote").value = "";
    autoSaveCurrentState();
    renderExamsTable();
    runSimulationAndRender();
    showToast("Examen registrado");
  });

  // Agregar cambio antropométrico
  $id("addAnthroBtn")?.addEventListener("click", () => {
    const week = clampNum($id("anthroWeek").value, 0.5, 104, 4);
    const weight = clampNum($id("anthroWeight").value, 35, 250, 100);
    const bodyFat = clampNum($id("anthroFat").value, 4, 65, 25);

    appState.anthropometryLogs.push({ id: cryptoId(), week, weight, bodyFat });
    autoSaveCurrentState();
    renderAnthroTable();
    runSimulationAndRender();
    showToast("Evolución antropométrica registrada");
  });

  // Agregar tramo de dosis
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

    appState.doses.push({ id: cryptoId(), type, iu, freq, startWeek, endWeek });
    autoSaveCurrentState();
    renderDosesTable();
    runSimulationAndRender();
    showToast("Tramo de dosis agregado");
  });

  // Limpiar dosis
  $id("clearDosesBtn")?.addEventListener("click", () => {
    appState.doses = [];
    autoSaveCurrentState();
    renderDosesTable();
    runSimulationAndRender();
    showToast("Tramos de dosis eliminados");
  });

  // Planificador de objetivo
  $id("calculatePlanBtn")?.addEventListener("click", generateTargetPlans);

  // Memorias
  $id("saveSimBtn")?.addEventListener("click", saveCurrentSimulationToMemory);
  $id("exportMemoriesBtn")?.addEventListener("click", exportMemoriesJSON);
  $id("importMemoriesInput")?.addEventListener("change", (e) => {
    importMemoriesJSON(e.target.files?.[0]);
    e.target.value = "";
  });
});