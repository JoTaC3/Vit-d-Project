export const QUADA_STORAGE_KEY = "quada_sim_v1_profiles";

export const QUADA_MUSCLES = [
  "Pectoral", "Espalda", "Deltoides", "Bíceps", "Tríceps",
  "Cuádriceps", "Isquiotibiales", "Glúteos", "Pantorrillas", "Abdomen/Core"
];

export const QUADA_SPLIT_LABELS = {
  1: "1d Full Body",
  2: "2d Torso/Pierna",
  3: "3d Full Body",
  4: "4d Upper/Lower",
  5: "5d ULPPL",
  6: "6d PPL ×2"
};

export const QUADA_ENVS = [
  { id: "gym", label: "Gimnasio completo" },
  { id: "home_basic", label: "Casa equipada básica" },
  { id: "home_min", label: "Casa minimalista" }
];

export const QUADA_LEVELS = [
  { id: "novice", label: "Novato", mult: 0.78, loadMult: 0.65 },
  { id: "inter", label: "Intermedio", mult: 1.0, loadMult: 1.0 },
  { id: "adv", label: "Avanzado", mult: 1.22, loadMult: 1.35 }
];

export const QUADA_EXERCISES = {
  Pectoral: {
    gym: [
      { name: "Press inclinado con mancuernas", reps: "6–10", rir: "1–2", rest: 150, tempo: "3-1-1-0", syn: ["Deltoides", "Tríceps"], note: "Estiramiento clavicular profundo" },
      { name: "Cruces en polea baja-alta", reps: "10–15", rir: "0–1", rest: 90, tempo: "2-1-1-1", syn: ["Deltoides"], note: "Tensión constante en aducción" }
    ],
    home_basic: [
      { name: "Press inclinado c/ mancuernas en banco", reps: "8–12", rir: "1–2", rest: 135, tempo: "3-1-1-0", syn: ["Deltoides", "Tríceps"], note: "Banco a 30°" },
      { name: "Aperturas con mancuernas", reps: "10–15", rir: "1", rest: 90, tempo: "3-1-1-0", syn: [], note: "Rango controlado en estiramiento" }
    ],
    home_min: [
      { name: "Flexiones con déficit y mochila", reps: "8–15", rir: "1", rest: 120, tempo: "3-1-1-0", syn: ["Deltoides", "Tríceps"], note: "Pies elevados o déficit en bloques" },
      { name: "Aducción unilateral con banda", reps: "12–18", rir: "0–1", rest: 75, tempo: "2-1-1-1", syn: [], note: "Pico de contracción" }
    ]
  },
  Espalda: {
    gym: [
      { name: "Jalón al pecho agarre neutro", reps: "8–12", rir: "1–2", rest: 135, tempo: "2-1-1-1", syn: ["Bíceps"], note: "Depresión escapular completa" },
      { name: "Remo apoyado en pecho (máquina)", reps: "8–12", rir: "1", rest: 135, tempo: "2-1-1-1", syn: ["Bíceps", "Deltoides"], note: "Tracción horizontal estable" }
    ],
    home_basic: [
      { name: "Dominadas pronas / supinas en barra", reps: "6–10", rir: "1–2", rest: 150, tempo: "2-1-1-0", syn: ["Bíceps"], note: "Lastre si supera 10 reps" },
      { name: "Remo a una mano con mancuerna", reps: "8–12", rir: "1", rest: 105, tempo: "2-1-1-1", syn: ["Bíceps"], note: "Apoyado en banco" }
    ],
    home_min: [
      { name: "Remo invertido bajo mesa / banda", reps: "10–15", rir: "1", rest: 105, tempo: "2-1-1-1", syn: ["Bíceps"], note: "Pausa 1s en retracción" },
      { name: "Pullover con banda anclada", reps: "12–18", rir: "0–1", rest: 75, tempo: "3-1-1-0", syn: [], note: "Aislamiento dorsal en estiramiento" }
    ]
  },
  Deltoides: {
    gym: [
      { name: "Elevaciones laterales en polea", reps: "12–16", rir: "0–1", rest: 75, tempo: "2-1-1-0", syn: [], note: "Perfil de resistencia en estiramiento" },
      { name: "Pájaros en máquina pec-deck", reps: "12–16", rir: "0–1", rest: 75, tempo: "2-1-1-1", syn: ["Espalda"], note: "Deltoide posterior" }
    ],
    home_basic: [
      { name: "Elevaciones laterales con mancuernas", reps: "12–18", rir: "0–1", rest: 75, tempo: "2-1-1-0", syn: [], note: "Plano escapular 30°" },
      { name: "Press militar con mancuernas", reps: "8–12", rir: "1–2", rest: 120, tempo: "2-1-1-0", syn: ["Tríceps"], note: "Sentado en banco" }
    ],
    home_min: [
      { name: "Flexiones en pica con déficit", reps: "8–14", rir: "1", rest: 105, tempo: "3-1-1-0", syn: ["Tríceps"], note: "Carga vertical" },
      { name: "Elevación lateral con banda", reps: "15–20", rir: "0–1", rest: 60, tempo: "2-1-1-0", syn: [], note: "Tensión constante" }
    ]
  },
  "Bíceps": {
    gym: [
      { name: "Curl inclinado en banco 45°", reps: "8–12", rir: "0–1", rest: 90, tempo: "3-1-1-0", syn: [], note: "Cabeza larga en estiramiento" }
    ],
    home_basic: [
      { name: "Curl inclinado con mancuernas", reps: "8–12", rir: "0–1", rest: 90, tempo: "3-1-1-0", syn: [], note: "Hombro en extensión" }
    ],
    home_min: [
      { name: "Curl con banda pisada (codo atrás)", reps: "12–16", rir: "0–1", rest: 75, tempo: "3-1-1-0", syn: [], note: "Énfasis en estiramiento" }
    ]
  },
  "Tríceps": {
    gym: [
      { name: "Extensión de tríceps sobre cabeza en polea", reps: "10–14", rir: "0–1", rest: 90, tempo: "3-1-1-0", syn: [], note: "Cabeza larga en máximo estiramiento" }
    ],
    home_basic: [
      { name: "Copa de tríceps sobre cabeza c/ mancuerna", reps: "10–14", rir: "0–1", rest: 90, tempo: "3-1-1-0", syn: [], note: "Flexión completa de hombro (sobre cabeza)" }
    ],
    home_min: [
      { name: "Extensión sobre cabeza con banda", reps: "12–16", rir: "0–1", rest: 75, tempo: "3-1-1-0", syn: [], note: "Sobre cabeza para cabeza larga" }
    ]
  },
  "Cuádriceps": {
    gym: [
      { name: "Prensa inclinada / Hack Squat", reps: "8–12", rir: "1–2", rest: 180, tempo: "3-1-1-0", syn: ["Glúteos"], note: "Vastos lateral y medial (multiarticular)" },
      { name: "Extensión de cuádriceps en máquina", reps: "10–15", rir: "0–1", rest: 90, tempo: "2-1-1-1", syn: [], note: "Aislamiento recto femoral (cadera fija)" }
    ],
    home_basic: [
      { name: "Sentadilla búlgara con mancuernas", reps: "8–12", rir: "1–2", rest: 150, tempo: "3-1-1-0", syn: ["Glúteos"], note: "Vastos lateral y medial" },
      { name: "Sissy squat asistida / extensión c/ banda", reps: "10–15", rir: "0–1", rest: 90, tempo: "3-1-1-0", syn: [], note: "Aislamiento recto femoral" }
    ],
    home_min: [
      { name: "Sentadilla búlgara con mochila", reps: "10–15", rir: "1", rest: 120, tempo: "3-1-1-0", syn: ["Glúteos"], note: "Vastos lateral y medial" },
      { name: "Reverse Nordic excéntrico", reps: "8–12", rir: "1", rest: 90, tempo: "4-0-1-0", syn: [], note: "Recto femoral en estiramiento" }
    ]
  },
  Isquiotibiales: {
    gym: [
      { name: "Curl femoral sentado", reps: "10–14", rir: "0–1", rest: 105, tempo: "3-1-1-0", syn: [], note: "Flexión de cadera = mayor estiramiento" },
      { name: "Peso muerto rumano con barra/mancuernas", reps: "6–10", rir: "1–2", rest: 165, tempo: "3-1-1-0", syn: ["Glúteos", "Espalda"], note: "Bisagra de cadera" }
    ],
    home_basic: [
      { name: "Peso muerto rumano con mancuernas", reps: "8–12", rir: "1–2", rest: 150, tempo: "3-1-1-0", syn: ["Glúteos"], note: "Estiramiento proximal" },
      { name: "Curl femoral sentado con banda", reps: "12–16", rir: "0–1", rest: 90, tempo: "3-1-1-0", syn: [], note: "Cadera flexionada en banco" }
    ],
    home_min: [
      { name: "Curl femoral deslizante en suelo (sliders)", reps: "10–15", rir: "0–1", rest: 90, tempo: "3-1-1-0", syn: ["Glúteos"], note: "Control excéntrico" },
      { name: "Buenos días con banda y mochila", reps: "12–15", rir: "1", rest: 90, tempo: "3-1-1-0", syn: ["Glúteos"], note: "Bisagra de cadera" }
    ]
  },
  "Glúteos": {
    gym: [
      { name: "Hip Thrust en máquina / barra", reps: "8–12", rir: "1", rest: 135, tempo: "2-1-1-1", syn: ["Isquiotibiales"], note: "Pico de acortamiento" }
    ],
    home_basic: [
      { name: "Hip Thrust con mancuerna en banco", reps: "10–14", rir: "1", rest: 120, tempo: "2-1-1-1", syn: ["Isquiotibiales"], note: "Pausa 1s arriba" }
    ],
    home_min: [
      { name: "Puente de glúteo unilateral", reps: "12–18", rir: "0–1", rest: 75, tempo: "2-1-1-1", syn: [], note: "Pie elevado" }
    ]
  },
  Pantorrillas: {
    gym: [
      { name: "Elevación de gemelos de pie en máquina", reps: "10–15", rir: "0–1", rest: 75, tempo: "3-2-1-0", syn: [], note: "Rodilla extendida (gastrocnemio)" }
    ],
    home_basic: [
      { name: "Gemelos de pie unilateral con mancuerna", reps: "10–16", rir: "0–1", rest: 75, tempo: "3-2-1-0", syn: [], note: "Rodilla extendida + pausa 2s abajo" }
    ],
    home_min: [
      { name: "Gemelos de pie unilateral en escalón", reps: "12–20", rir: "0–1", rest: 60, tempo: "3-2-1-0", syn: [], note: "Rodilla extendida en déficit" }
    ]
  },
  "Abdomen/Core": {
    gym: [
      { name: "Crunch en polea alta de rodillas", reps: "10–15", rir: "1", rest: 75, tempo: "2-1-1-1", syn: [], note: "Flexión torácica cargada" }
    ],
    home_basic: [
      { name: "Elevaciones de piernas colgado en barra", reps: "10–15", rir: "1", rest: 75, tempo: "2-1-1-0", syn: [], note: "Retroversión pélvica" }
    ],
    home_min: [
      { name: "Crunch inverso con banda", reps: "12–18", rir: "0–1", rest: 60, tempo: "2-1-1-1", syn: [], note: "Control excéntrico" }
    ]
  }
};

const SPLIT_TEMPLATES = {
  1: [{ title: "Día 1 · Full Body Completo", muscles: QUADA_MUSCLES }],
  2: [
    { title: "Día 1 · Torso", muscles: ["Pectoral", "Espalda", "Deltoides", "Bíceps", "Tríceps"] },
    { title: "Día 2 · Pierna + Core", muscles: ["Cuádriceps", "Isquiotibiales", "Glúteos", "Pantorrillas", "Abdomen/Core"] }
  ],
  3: [
    { title: "Día 1 · Full Body A", muscles: ["Pectoral", "Espalda", "Cuádriceps", "Bíceps", "Pantorrillas"] },
    { title: "Día 2 · Full Body B", muscles: ["Deltoides", "Isquiotibiales", "Glúteos", "Tríceps", "Abdomen/Core"] },
    { title: "Día 3 · Full Body C", muscles: ["Pectoral", "Espalda", "Cuádriceps", "Isquiotibiales", "Deltoides"] }
  ],
  4: [
    { title: "Día 1 · Torso A", muscles: ["Pectoral", "Espalda", "Deltoides", "Bíceps", "Tríceps"] },
    { title: "Día 2 · Pierna A", muscles: ["Cuádriceps", "Isquiotibiales", "Glúteos", "Pantorrillas", "Abdomen/Core"] },
    { title: "Día 3 · Torso B", muscles: ["Espalda", "Pectoral", "Deltoides", "Tríceps", "Bíceps"] },
    { title: "Día 4 · Pierna B", muscles: ["Isquiotibiales", "Cuádriceps", "Glúteos", "Pantorrillas", "Abdomen/Core"] }
  ],
  5: [
    { title: "Día 1 · Torso", muscles: ["Pectoral", "Espalda", "Deltoides", "Bíceps", "Tríceps"] },
    { title: "Día 2 · Pierna", muscles: ["Cuádriceps", "Isquiotibiales", "Glúteos", "Pantorrillas", "Abdomen/Core"] },
    { title: "Día 3 · Empuje", muscles: ["Pectoral", "Deltoides", "Tríceps"] },
    { title: "Día 4 · Tirón", muscles: ["Espalda", "Bíceps", "Deltoides"] },
    { title: "Día 5 · Pierna + Core", muscles: ["Cuádriceps", "Isquiotibiales", "Glúteos", "Pantorrillas", "Abdomen/Core"] }
  ],
  6: [
    { title: "Día 1 · Empuje A", muscles: ["Pectoral", "Deltoides", "Tríceps"] },
    { title: "Día 2 · Tirón A", muscles: ["Espalda", "Bíceps", "Deltoides"] },
    { title: "Día 3 · Pierna A", muscles: ["Cuádriceps", "Isquiotibiales", "Glúteos", "Pantorrillas", "Abdomen/Core"] },
    { title: "Día 4 · Empuje B", muscles: ["Pectoral", "Deltoides", "Tríceps"] },
    { title: "Día 5 · Tirón B", muscles: ["Espalda", "Bíceps", "Deltoides"] },
    { title: "Día 6 · Pierna B", muscles: ["Isquiotibiales", "Cuádriceps", "Glúteos", "Pantorrillas", "Abdomen/Core"] }
  ]
};

const LOAD_PROFILES = {
  "Prensa inclinada / Hack Squat": { bwMult: 1.35, step: 2.5, isBodyweight: false },
  "Hip Thrust en máquina / barra": { bwMult: 1.20, step: 2.5, isBodyweight: false },
  "Peso muerto rumano con barra/mancuernas": { bwMult: 1.05, step: 2.5, isBodyweight: false },
  "Elevación de gemelos de pie en máquina": { bwMult: 0.90, step: 2.5, isBodyweight: false },
  "Jalón al pecho agarre neutro": { bwMult: 0.68, step: 2.5, isBodyweight: false },
  "Remo apoyado en pecho (máquina)": { bwMult: 0.65, step: 2.5, isBodyweight: false },
  "Extensión de cuádriceps en máquina": { bwMult: 0.65, step: 2.5, isBodyweight: false },
  "Press inclinado con mancuernas": { bwMult: 0.56, step: 2, isBodyweight: false },
  "Curl femoral sentado": { bwMult: 0.55, step: 2.5, isBodyweight: false },
  "Crunch en polea alta de rodillas": { bwMult: 0.45, step: 2.5, isBodyweight: false },
  "Extensión de tríceps sobre cabeza en polea": { bwMult: 0.28, step: 2.5, isBodyweight: false },
  "Cruces en polea baja-alta": { bwMult: 0.26, step: 2.5, isBodyweight: false },
  "Pájaros en máquina pec-deck": { bwMult: 0.26, step: 2.5, isBodyweight: false },
  "Curl inclinado en banco 45°": { bwMult: 0.24, step: 1, isBodyweight: false },
  "Elevaciones laterales en polea": { bwMult: 0.11, step: 1, isBodyweight: false },

  "Peso muerto rumano con mancuernas": { bwMult: 0.62, step: 1, isBodyweight: false },
  "Sentadilla búlgara con mancuernas": { bwMult: 0.52, step: 1, isBodyweight: false },
  "Press inclinado c/ mancuernas en banco": { bwMult: 0.50, step: 1, isBodyweight: false },
  "Hip Thrust con mancuerna en banco": { bwMult: 0.50, step: 1, isBodyweight: false },
  "Press militar con mancuernas": { bwMult: 0.42, step: 1, isBodyweight: false },
  "Remo a una mano con mancuerna": { bwMult: 0.36, step: 1, isBodyweight: false },
  "Gemelos de pie unilateral con mancuerna": { bwMult: 0.30, step: 1, isBodyweight: false },
  "Copa de tríceps sobre cabeza c/ mancuerna": { bwMult: 0.26, step: 1, isBodyweight: false },
  "Aperturas con mancuernas": { bwMult: 0.24, step: 1, isBodyweight: false },
  "Curl inclinado con mancuernas": { bwMult: 0.22, step: 1, isBodyweight: false },
  "Elevaciones laterales con mancuernas": { bwMult: 0.13, step: 1, isBodyweight: false },
  "Sissy squat asistida / extensión c/ banda": { bwMult: 0.16, step: 1, isBodyweight: false },
  "Curl femoral sentado con banda": { bwMult: 0.20, step: 1, isBodyweight: false },

  "Dominadas pronas / supinas en barra": { bwMult: 0, step: 1, isBodyweight: true },
  "Elevaciones de piernas colgado en barra": { bwMult: 0, step: 1, isBodyweight: true },
  "Flexiones con déficit y mochila": { bwMult: 0, step: 1, isBodyweight: true },
  "Remo invertido bajo mesa / banda": { bwMult: 0, step: 1, isBodyweight: true },
  "Flexiones en pica con déficit": { bwMult: 0, step: 1, isBodyweight: true },
  "Sentadilla búlgara con mochila": { bwMult: 0, step: 1, isBodyweight: true },
  "Reverse Nordic excéntrico": { bwMult: 0, step: 1, isBodyweight: true },
  "Curl femoral deslizante en suelo (sliders)": { bwMult: 0, step: 1, isBodyweight: true },
  "Puente de glúteo unilateral": { bwMult: 0, step: 1, isBodyweight: true },
  "Gemelos de pie unilateral en escalón": { bwMult: 0, step: 1, isBodyweight: true },
  "Crunch inverso con banda": { bwMult: 0, step: 1, isBodyweight: true },
  "Aducción unilateral con banda": { bwMult: 0.16, step: 1, isBodyweight: false },
  "Pullover con banda anclada": { bwMult: 0.22, step: 1, isBodyweight: false },
  "Elevación lateral con banda": { bwMult: 0.10, step: 1, isBodyweight: false },
  "Curl con banda pisada (codo atrás)": { bwMult: 0.18, step: 1, isBodyweight: false },
  "Extensión sobre cabeza con banda": { bwMult: 0.20, step: 1, isBodyweight: false },
  "Buenos días con banda y mochila": { bwMult: 0.25, step: 1, isBodyweight: false }
};

export function parseRepMid(repsStr) {
  const nums = String(repsStr || "").match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return 10;
  if (nums.length === 1) return parseFloat(nums[0]);
  return (parseFloat(nums[0]) + parseFloat(nums[1])) / 2;
}

export function parseRirMid(rirStr) {
  const nums = String(rirStr || "").match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return 1;
  if (nums.length === 1) return parseFloat(nums[0]);
  return (parseFloat(nums[0]) + parseFloat(nums[1])) / 2;
}

function roundToStep(val, step) {
  const s = step > 0 ? step : 1;
  return Math.round(val / s) * s;
}

export function getExerciseLoadProfile(exName, muscle, env) {
  if (LOAD_PROFILES[exName]) return LOAD_PROFILES[exName];
  if (env === "home_min") return { bwMult: 0.18, step: 1, isBodyweight: false };
  const fallbackMult = muscle === "Cuádriceps" || muscle === "Isquiotibiales" ? 0.65 : 0.35;
  return { bwMult: fallbackMult, step: env === "gym" ? 2.5 : 1, isBodyweight: false };
}

export function createDefaultQuadaState() {
  return {
    days: 4,
    env: "gym",
    level: "inter",
    supersets: true,
    focus: ["Cuádriceps", "Espalda"],
    bodyWeightKg: 75,
    sex: "male",
    customWeights: {}
  };
}

export function loadQuadaState() {
  try {
    const raw = localStorage.getItem(QUADA_STORAGE_KEY);
    if (!raw) return createDefaultQuadaState();
    const parsed = JSON.parse(raw);
    const def = createDefaultQuadaState();
    const bw = parseFloat(parsed.bodyWeightKg);
    const customWeights = {};
    if (parsed.customWeights && typeof parsed.customWeights === "object" && !Array.isArray(parsed.customWeights)) {
      for (const [k, arr] of Object.entries(parsed.customWeights)) {
        if (Array.isArray(arr)) {
          customWeights[k] = arr.map((v) => {
            const n = parseFloat(v);
            return Number.isFinite(n) && n >= 0 ? Math.min(500, n) : 0;
          });
        }
      }
    }
    return {
      days: Number.isInteger(parsed.days) && parsed.days >= 1 && parsed.days <= 6 ? parsed.days : def.days,
      env: QUADA_ENVS.some((e) => e.id === parsed.env) ? parsed.env : def.env,
      level: QUADA_LEVELS.some((l) => l.id === parsed.level) ? parsed.level : def.level,
      supersets: typeof parsed.supersets === "boolean" ? parsed.supersets : def.supersets,
      focus: Array.isArray(parsed.focus)
        ? parsed.focus.filter((m) => QUADA_MUSCLES.includes(m)).slice(0, 3)
        : def.focus,
      bodyWeightKg: Number.isFinite(bw) ? Math.max(35, Math.min(250, Math.round(bw * 2) / 2)) : def.bodyWeightKg,
      sex: parsed.sex === "female" ? "female" : "male",
      customWeights
    };
  } catch {
    return createDefaultQuadaState();
  }
}

export function saveQuadaState(state) {
  try {
    localStorage.setItem(QUADA_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("No se pudo persistir Quada:", err);
  }
}

export function computeQuadaPlan(state) {
  const lv = QUADA_LEVELS.find((x) => x.id === state.level) || QUADA_LEVELS[1];
  const template = SPLIT_TEMPLATES[state.days] || SPLIT_TEMPLATES[4];
  const fracVol = Object.fromEntries(QUADA_MUSCLES.map((m) => [m, 0]));
  const bodyWeightKg = Number.isFinite(state.bodyWeightKg) ? Math.max(35, Math.min(250, state.bodyWeightKg)) : 75;
  const sexMult = state.sex === "female" ? 0.68 : 1.0;
  const loadLevelMult = lv.loadMult ?? 1.0;
  const customMap = state.customWeights || {};

  let maxSessionDirect = 0;
  let totalMinutes = 0;
  let totalVolumeKg = 0;

  const daysOut = template.map((day, dIdx) => {
    const rows = [];
    let dayVolumeKg = 0;

    day.muscles.forEach((m) => {
      const pool = QUADA_EXERCISES[m][state.env] || QUADA_EXERCISES[m].gym;
      const isFocus = state.focus.includes(m);
      const baseSets = isFocus ? 4 : 3;
      const sets = Math.max(2, Math.min(6, Math.round(baseSets * lv.mult)));
      const ex = pool[dIdx % pool.length];
      const isPair = state.supersets && (
        m === "Pectoral" || m === "Espalda" || m === "Bíceps" || m === "Tríceps" || m === "Cuádriceps" || m === "Isquiotibiales"
      );
      const ssTag = isPair ? (
        (m === "Pectoral" || m === "Espalda") ? "A" :
        (m === "Bíceps" || m === "Tríceps") ? "B" : "C"
      ) : null;
      const restSec = state.supersets && isPair ? Math.round(ex.rest * 0.64) : ex.rest;

      const rowKey = `${dIdx}:${ex.name}`;
      const repMid = parseRepMid(ex.reps);
      const rirMid = parseRirMid(ex.rir);
      const effReps = repMid + rirMid;
      const pct1RM = 1 / (1 + effReps / 30);
      const profile = getExerciseLoadProfile(ex.name, m, state.env);

      const estKg = profile.isBodyweight
        ? 0
        : Math.max(profile.step, roundToStep(bodyWeightKg * profile.bwMult * loadLevelMult * sexMult * pct1RM, profile.step));
      const estimatedSets = Array.from({ length: sets }, () => estKg);
      const customArr = Array.isArray(customMap[rowKey]) ? customMap[rowKey] : null;
      const seriesKg = estimatedSets.map((est, sIdx) => {
        if (customArr && Number.isFinite(customArr[sIdx]) && customArr[sIdx] >= 0) {
          return customArr[sIdx];
        }
        return est;
      });
      const isCustom = Boolean(customArr && seriesKg.some((v, i) => v !== estimatedSets[i]));
      const rowVolumeKg = Math.round(
        seriesKg.reduce((sum, kg) => sum + (profile.isBodyweight ? bodyWeightKg * 0.65 + kg : kg) * repMid, 0)
      );

      dayVolumeKg += rowVolumeKg;
      rows.push({
        rowKey,
        muscle: m,
        exName: ex.name,
        note: ex.note,
        sets,
        reps: ex.reps,
        rir: ex.rir,
        restSec,
        tempo: ex.tempo,
        ssTag,
        isFocus,
        isBodyweight: profile.isBodyweight,
        estimatedSets,
        seriesKg,
        isCustom,
        rowVolumeKg
      });

      if (sets > maxSessionDirect) maxSessionDirect = sets;
      fracVol[m] += sets;
      ex.syn.forEach((sm) => {
        fracVol[sm] += sets * 0.5;
      });
    });

    const daySets = rows.reduce((a, r) => a + r.sets, 0);
    const avgRest = rows.reduce((a, r) => a + r.restSec, 0) / Math.max(1, rows.length);
    const mins = Math.round((daySets * (42 + avgRest)) / 60);
    totalMinutes += mins;
    totalVolumeKg += dayVolumeKg;
    return { title: day.title, rows, daySets, mins, dayVolumeKg };
  });

  const totalWeeklySets = Object.values(fracVol).reduce((a, b) => a + b, 0);
  return {
    fracVol,
    daysOut,
    maxSessionDirect,
    totalWeeklySets,
    totalVolumeKg,
    avgMins: Math.round(totalMinutes / Math.max(1, daysOut.length))
  };
}

function formatSeriesWeights(r) {
  return r.seriesKg
    .map((kg, idx) => {
      if (r.isBodyweight) {
        return kg > 0 ? `S${idx + 1}: Peso corporal +${kg} kg` : `S${idx + 1}: Peso corporal`;
      }
      return `S${idx + 1}: ${kg} kg`;
    })
    .join(" · ");
}

export function formatQuadaPlainText(state, plan) {
  const split = QUADA_SPLIT_LABELS[state.days] || `${state.days} días`;
  const env = QUADA_ENVS.find((e) => e.id === state.env)?.label || state.env;
  const lvl = QUADA_LEVELS.find((l) => l.id === state.level)?.label || state.level;
  const focusTxt = state.focus.length ? state.focus.join(", ") : "Equilibrado";
  const sexTxt = state.sex === "female" ? "Mujer" : "Hombre";

  const lines = [
    "HUMANIA · QUADA — RUTINA PERSONALIZADA",
    "========================================",
    `Estructura: ${split} | Entorno: ${env}`,
    `Nivel: ${lvl} | Sexo: ${sexTxt} | Peso ref.: ${state.bodyWeightKg} kg`,
    `Foco prioritario: ${focusTxt} | Superseries: ${state.supersets ? "Sí (-36% tiempo)" : "No"}`,
    `Tonelaje semanal estimado: ${Math.round(plan.totalVolumeKg)} kg (${plan.totalWeeklySets.toFixed(1)} series fraccionales)`,
    ""
  ];

  plan.daysOut.forEach((day) => {
    lines.push(`${day.title.toUpperCase()} (${day.daySets} series · ~${day.mins} min · ~${Math.round(day.dayVolumeKg)} kg)`);
    lines.push("-".repeat(day.title.length + 28));
    day.rows.forEach((r) => {
      const ss = r.ssTag ? `[Superserie ${r.ssTag}] ` : "";
      lines.push(`• ${ss}${r.exName} (${r.muscle})`);
      lines.push(`  ${r.sets} × ${r.reps} reps | RIR ${r.rir} | Descanso ${r.restSec}s | Tempo ${r.tempo}`);
      lines.push(`  Carga: ${formatSeriesWeights(r)}${r.isCustom ? " [fijado]" : " [est.]"}`);
      lines.push(`  Nota: ${r.note}`);
    });
    lines.push("");
  });

  lines.push("RESUMEN SEMANAL DE VOLUMEN FRACCIONAL");
  lines.push("-------------------------------------");
  QUADA_MUSCLES.forEach((m) => {
    const v = plan.fracVol[m];
    const zone = v >= 11 ? "Óptimo (11–18)" : v >= 5 ? "Máx. Eficiencia (5–10)" : v >= 4 ? "MEV (4)" : "Bajo MEV";
    lines.push(`- ${m}: ${v.toFixed(1)} series · ${zone}`);
  });

  return lines.join("\n");
}
