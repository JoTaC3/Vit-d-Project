/**
 * Módulo de Estado, Perfiles y Persistencia
 */

export const APP_VERSION = "0.3.28";
export const NG_TO_NMOL = 2.496;
export const STORAGE_KEY_PROFILES = "vitd_sim_v7_profiles";
export const STORAGE_KEY_THEME = "vitd_sim_v7_theme";

export function cryptoId() {
  return "id_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function clampNum(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getTodayDateString() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

let cachedStartDateStr = null;
let cachedStartDateMs = NaN;

export function getDateForWeek(startDateStr, weekNum) {
  if (!startDateStr || typeof startDateStr !== "string") return "";
  if (startDateStr !== cachedStartDateStr) {
    cachedStartDateStr = startDateStr;
    const parts = startDateStr.split("-");
    if (parts.length !== 3) {
      cachedStartDateMs = NaN;
      return "";
    }
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const base = new Date(y, m, d);
    cachedStartDateMs = base.getTime();
  }
  if (isNaN(cachedStartDateMs)) return "";
  const target = new Date(cachedStartDateMs + Math.round(Number(weekNum) * 7 * 86400000));
  const day = String(target.getDate()).padStart(2, "0");
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const year = target.getFullYear();
  return `${day}/${month}/${year}`;
}

export function cloneData(obj) {
  return typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

export function createDefaultProfileState() {
  return {
    unit: "ng/mL",
    bodyProfile: {
      sex: "male",
      age: 22,
      height: 180,
      weight: 110,
      bodyFat: 32,
      startDate: getTodayDateString(),
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
        amount: 4000,
        iu: 4000,
        ug: 100,
        freq: "daily",
        startWeek: 0,
        endWeek: 12
      },
      {
        id: cryptoId(),
        type: "d3",
        amount: 2000,
        iu: 2000,
        ug: 50,
        freq: "daily",
        startWeek: 12,
        endWeek: 24
      }
    ]
  };
}

export function sanitizeState(rawState) {
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
      startDate: (bp.startDate && /^\d{4}-\d{2}-\d{2}$/.test(String(bp.startDate)))
        ? String(bp.startDate)
        : getTodayDateString(),
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
      ? rawState.doses.map((d) => {
          const isCalci = d.type === "calcifediol";
          let amount;
          if (isCalci) {
            if (d.amount != null) amount = clampNum(d.amount, 10, 5000, 266);
            else if (d.ug != null) amount = clampNum(d.ug, 10, 5000, 266);
            else if (d.iu != null && d.iu > 1000) amount = clampNum(Math.round(d.iu / 60), 10, 5000, 266);
            else amount = 266;
          } else {
            amount = clampNum(d.amount ?? d.iu, 50, 1000000, 2000);
          }
          return {
            id: String(d.id || cryptoId()),
            type: isCalci ? "calcifediol" : "d3",
            amount,
            iu: isCalci ? Math.round(amount * 60) : amount,
            ug: isCalci ? amount : Math.round(amount / 40),
            freq: ["daily", "weekly", "biweekly", "monthly", "single"].includes(d.freq) ? d.freq : "daily",
            startWeek: clampNum(d.startWeek, 0, 104, 0),
            endWeek: clampNum(d.endWeek, 0.5, 104, 12)
          };
        })
      : base.doses
  };
}

export const store = {
  profilesStore: {
    activeProfileId: null,
    profiles: []
  },
  appState: createDefaultProfileState(),
  savedSimulations: []
};

export function toDisplayUnit(valNg, unit = store.appState.unit) {
  if (valNg == null || isNaN(valNg)) return 0;
  return unit === "nmol/L" ? valNg * NG_TO_NMOL : valNg;
}

export function fromDisplayUnit(valDisplay, unit = store.appState.unit) {
  if (valDisplay == null || isNaN(valDisplay)) return 0;
  return unit === "nmol/L" ? valDisplay / NG_TO_NMOL : valDisplay;
}

export function formatLevel(valNg, decimals = 1, unit = store.appState.unit) {
  return `${toDisplayUnit(valNg, unit).toFixed(decimals)} ${unit}`;
}

export function getInitialBaselineNg() {
  const exams = store.appState.bloodMeasurements;
  if (!exams || exams.length === 0) return 22.0;
  let minExam = exams[0];
  for (let i = 0; i < exams.length; i++) {
    const ex = exams[i];
    if (ex.week === 0) return ex.valueNg;
    if (ex.week < minExam.week) minExam = ex;
  }
  return minExam.valueNg;
}

export function getActiveProfile() {
  return (
    store.profilesStore.profiles.find((p) => p.id === store.profilesStore.activeProfileId) ||
    store.profilesStore.profiles[0]
  );
}

export function persistProfilesStore() {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(store.profilesStore));
  } catch (e) {
    console.error("Error guardando perfiles:", e);
  }
}

let autoSaveTimer = null;

export function autoSaveCurrentState() {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  const active = getActiveProfile();
  if (active) {
    active.state = cloneData(store.appState);
    active.savedSimulations = cloneData(store.savedSimulations);
    active.updatedAt = new Date().toISOString();
    persistProfilesStore();
  }
}

export function scheduleAutoSave(delayMs = 400) {
  if (autoSaveTimer !== null) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    autoSaveCurrentState();
  }, delayMs);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && autoSaveTimer !== null) {
      autoSaveCurrentState();
    }
  });
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (autoSaveTimer !== null) {
      autoSaveCurrentState();
    }
  });
}

export function initializeProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        store.profilesStore = parsed;
      }
    }
  } catch (e) {
    console.warn("Error leyendo perfiles:", e);
  }

  if (store.profilesStore.profiles.length === 0) {
    const defaultId = cryptoId();
    store.profilesStore = {
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
    store.appState = sanitizeState(active.state);
    store.savedSimulations = Array.isArray(active.savedSimulations) ? active.savedSimulations : [];
  }
}