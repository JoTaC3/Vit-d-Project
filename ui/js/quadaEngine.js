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
  { id: "novice", label: "Novato", mult: 0.78 },
  { id: "inter", label: "Intermedio", mult: 1.0 },
  { id: "adv", label: "Avanzado", mult: 1.22 }
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

export function createDefaultQuadaState() {
  return {
    days: 4,
    env: "gym",
    level: "inter",
    supersets: true,
    focus: ["Cuádriceps", "Espalda"]
  };
}

export function loadQuadaState() {
  try {
    const raw = localStorage.getItem(QUADA_STORAGE_KEY);
    if (!raw) return createDefaultQuadaState();
    const parsed = JSON.parse(raw);
    const def = createDefaultQuadaState();
    return {
      days: Number.isInteger(parsed.days) && parsed.days >= 1 && parsed.days <= 6 ? parsed.days : def.days,
      env: QUADA_ENVS.some((e) => e.id === parsed.env) ? parsed.env : def.env,
      level: QUADA_LEVELS.some((l) => l.id === parsed.level) ? parsed.level : def.level,
      supersets: typeof parsed.supersets === "boolean" ? parsed.supersets : def.supersets,
      focus: Array.isArray(parsed.focus)
        ? parsed.focus.filter((m) => QUADA_MUSCLES.includes(m)).slice(0, 3)
        : def.focus
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
  let maxSessionDirect = 0;
  let totalMinutes = 0;

  const daysOut = template.map((day, dIdx) => {
    const rows = [];
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

      rows.push({
        muscle: m,
        exName: ex.name,
        note: ex.note,
        sets,
        reps: ex.reps,
        rir: ex.rir,
        restSec,
        tempo: ex.tempo,
        ssTag,
        isFocus
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
    return { title: day.title, rows, daySets, mins };
  });

  const totalWeeklySets = Object.values(fracVol).reduce((a, b) => a + b, 0);
  return {
    fracVol,
    daysOut,
    maxSessionDirect,
    totalWeeklySets,
    avgMins: Math.round(totalMinutes / Math.max(1, daysOut.length))
  };
}
