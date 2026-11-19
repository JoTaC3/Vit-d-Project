/**
 * Módulo de Estado, Perfiles y Persistencia
 */

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

export function createDefaultProfileState() {
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
  const sortedExams = [...store.appState.bloodMeasurements].sort((a, b) => a.week - b.week);
  const weekZero = sortedExams.find((e) => e.week === 0);
  if (weekZero) return weekZero.valueNg;
  if (sortedExams.length > 0) return sortedExams[0].valueNg;
  return 22.0;
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

export function autoSaveCurrentState() {
  const active = getActiveProfile();
  if (active) {
    active.state = JSON.parse(JSON.stringify(store.appState));
    active.savedSimulations = JSON.parse(JSON.stringify(store.savedSimulations));
    active.updatedAt = new Date().toISOString();
    persistProfilesStore();
  }
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