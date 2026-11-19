/* ==========================================================================
   VITAMINA D SIMULATOR V7.0
   Motor Farmacocinético Poblacional (PopPK) con Integración ODE RK4,
   Escalamiento Alométrico Continuo FFM/FM, Saturación CYP2R1/CYP24A1,
   Calibración Bayesiana MAP + Nelder-Mead, Bandas IC 95%, Memoria,
   Administrador Multi-Perfil, Seguimiento Sérico y Planificador de Objetivos
   ========================================================================== */

const STORAGE_KEY_AUTOSAVE = "vitd_sim_v6_autosave";
const STORAGE_KEY_MEMORIES = "vitd_sim_v6_memories";
const STORAGE_KEY_PROFILES = "vitd_sim_v7_profiles";

// Estado global
let bloodChart = null;
let doseChart = null;
let currentMode = "simulation"; // 'simulation' | 'daily'
let currentTheme = "dark";      // 'dark' | 'clinical' | 'warm'

let simulationPhases = [];
let dailyPhases = [];
let bodyProfile = [];
let bloodMeasurements = [];
let customDoses = [];
let hydroferolDoses = [];
let savedSimulations = [];
let comparedMemoryIds = new Set();
let isRestoringState = false;
let lastResult = null;

// Estado del Administrador de Perfiles
let profilesStore = {
  activeProfileId: null,
  profiles: []
};
let lastGeneratedPlans = [];

/* ==========================================================================
   PARÁMETROS FARMACOCINÉTICOS POBLACIONALES (PopPK)
   Referencia: Adulto 70 kg, 20% grasa -> FFM_ref = 56 kg, FM_ref = 14 kg
   ========================================================================== */
const REF_FFM_KG = 56.0;
const REF_FM_KG = 14.0;

// Colecalciferol (D3): alta lipofilia (logP ~7.5) -> mayor partición en masa grasa
const PK_D3_ALPHA = 0.00041;          // ng/mL por UI efectiva (calibrado a ~14.8 ng/mL por 1000 UI/d a V_rel=1)
const PK_D3_D50_IU = 180000;          // Dosis semimáxima de saturación CYP2R1 / absorción en bolo (UI)
const PK_D3_HILL = 0.85;              // Exponente de Hill de saturación en bolo
const THETA_FFM_D3 = 0.40;            // Fracción alométrica de masa libre de grasa (FFM^0.75)
const THETA_FM_D3 = 0.60;             // Fracción de secuestro adiposo para D3

// Calcifediol / Hidroferol (25-OH-D3): hidrofílico, unido a DBP -> menor secuestro graso
const PK_25D_ALPHA = 0.068;           // ng/mL por µg absorbido (a V_rel=1)
const PK_25D_KA = 1.40;               // d^-1 (absorción rápida sin latencia hepática)
const PK_25D_D50_MG = 2.50;           // mg semimáximos de saturación intestinal
const THETA_FFM_25D = 0.78;           // Fracción alométrica FFM^0.75 para 25(OH)D3
const THETA_FM_25D = 0.22;            // Fracción de secuestro adiposo para 25(OH)D3
const CALCIFEDIOL_D3_EQ_PER_UG = 180; // Equivalencia orientativa en UI

// Retroalimentación catabólica CYP24A1 por concentración sérica elevada
const CYP24A1_THRESHOLD = 30.0;       // ng/mL
const CYP24A1_EMAX = 0.35;            // Hasta +35% aclaramiento catabólico a concentraciones altas
const CYP24A1_EC50 = 50.0;            // ng/mL sobre umbral

// Priors Bayesianos MAP y modelo de error analítico heterocedástico (LC-MS/MS / CLIA)
const ASSAY_SIGMA_ADD = 1.2;          // ng/mL error aditivo basal
const ASSAY_SIGMA_PROP = 0.065;       // 6.5% CV proporcional analítico
const PRIOR_SD_BASELINE = 6.0;        // ng/mL
const PRIOR_OMEGA_FACTOR = 0.22;      // Desviación log-normal de escala de distribución
const PRIOR_OMEGA_HALFLIFE = 0.25;    // Desviación log-normal de vida media

/* ==========================================================================
   1. SISTEMA DE TEMAS Y MODOS
   ========================================================================== */

function setTheme(theme) {
  const validThemes = ["dark", "clinical", "warm"];
  currentTheme = validThemes.includes(theme) ? theme : "dark";
  document.documentElement.setAttribute("data-theme", currentTheme);

  const btnDark = document.getElementById("btnThemeDark");
  const btnClin = document.getElementById("btnThemeClinical");
  const btnWarm = document.getElementById("btnThemeWarm");
  if (btnDark) btnDark.classList.toggle("active", currentTheme === "dark");
  if (btnClin) btnClin.classList.toggle("active", currentTheme === "clinical");
  if (btnWarm) btnWarm.classList.toggle("active", currentTheme === "warm");

  if (!isRestoringState) {
    autoSaveCurrentState();
    if (lastResult) {
      renderCharts(lastResult);
    }
  }
}

function setMode(mode) {
  currentMode = mode === "daily" ? "daily" : "simulation";

  const btnSim = document.getElementById("btnModeSimulation");
  const btnDaily = document.getElementById("btnModeDaily");
  if (btnSim) btnSim.classList.toggle("active", currentMode === "simulation");
  if (btnDaily) btnDaily.classList.toggle("active", currentMode === "daily");

  const simCtrl = document.getElementById("simulationControls");
  const dayCtrl = document.getElementById("dailyControls");
  if (simCtrl) simCtrl.classList.toggle("hidden", currentMode !== "simulation");
  if (dayCtrl) dayCtrl.classList.toggle("hidden", currentMode !== "daily");

  if (currentMode === "daily") {
    renderDailyPhases();
  }
  if (!isRestoringState) {
    calculate();
  }
}

/* ==========================================================================
   2. SISTEMA DE IMC, COMPOSICIÓN CORPORAL (FFM/FM) Y % GRASA OPCIONAL
   ========================================================================== */

function calculateBMI(weightKg, heightCm) {
  const heightMeters = heightCm / 100;
  if (!heightMeters || heightMeters <= 0 || !weightKg || weightKg <= 0) return 0;
  return weightKg / (heightMeters * heightMeters);
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return "Bajo peso";
  if (bmi < 25) return "Normopeso";
  if (bmi < 30) return "Sobrepeso";
  if (bmi < 35) return "Obesidad I";
  if (bmi < 40) return "Obesidad II";
  return "Obesidad III";
}

function bmiFactor(bmi) {
  if (bmi < 25) return 1.0;
  if (bmi < 30) return 1.5;
  if (bmi < 35) return 2.0;
  if (bmi < 40) return 2.5;
  return 3.0;
}

function bodyFatFactor(fatPercent) {
  if (fatPercent < 24) return 1.0;
  if (fatPercent < 30) return 1.5;
  if (fatPercent < 34) return 2.0;
  if (fatPercent < 40) return 2.5;
  return 3.0;
}

/**
 * Resuelve el % de grasa corporal cuando el usuario lo deja vacío (opcional),
 * estimándolo mediante ecuación ajustada por IMC si hay altura.
 */
function resolveEffectiveFatPercent(weightKg, heightCm, rawFatVal) {
  const parsed = parseFloat(rawFatVal);
  if (!isNaN(parsed) && parsed > 0) {
    return { fat: Math.min(75, parsed), isEstimated: false };
  }
  const bmi = calculateBMI(weightKg, heightCm);
  if (bmi > 0) {
    const est = Math.min(55, Math.max(8, 1.2 * bmi + 1.5));
    return { fat: Number(est.toFixed(1)), isEstimated: true };
  }
  return { fat: 20.0, isEstimated: true };
}

function computeAllometricVolumes(weightKg, fatPercent) {
  if (!weightKg || weightKg <= 0) {
    return { ffm: 0, fm: 0, vRelD3: 1.0, vRel25D: 1.0 };
  }

  const safeWeight = Math.max(1, weightKg);
  const clampedFat = Math.min(75, Math.max(0, fatPercent || 0));
  const fm = safeWeight * (clampedFat / 100);
  const ffm = Math.max(0, safeWeight - fm);

  const ffmRatio = Math.pow(ffm / REF_FFM_KG, 0.75);
  const fmRatio = fm / REF_FM_KG;

  const vRelD3 = Math.max(0.55, THETA_FFM_D3 * ffmRatio + THETA_FM_D3 * fmRatio);
  const vRel25D = Math.max(0.65, THETA_FFM_25D * ffmRatio + THETA_FM_25D * fmRatio);

  return { ffm, fm, vRelD3, vRel25D };
}

function syncInitialBodyPoint() {
  const weight = parseFloat(document.getElementById("inputWeight").value) || 0;
  const height = parseFloat(document.getElementById("inputHeight").value) || 0;
  const rawFat = document.getElementById("inputFat").value;
  const { fat } = resolveEffectiveFatPercent(weight, height, rawFat);

  const weekZeroIdx = bodyProfile.findIndex((p) => p.week === 0);
  if (weight <= 0) {
    if (weekZeroIdx >= 0) {
      bodyProfile.splice(weekZeroIdx, 1);
    }
  } else if (weekZeroIdx >= 0) {
    bodyProfile[weekZeroIdx].weight = weight;
    bodyProfile[weekZeroIdx].fat = fat;
  } else {
    bodyProfile.unshift({ week: 0, weight, fat });
  }
  renderBodyProfile();
}

function onMainAnthropometryChange() {
  const weight = parseFloat(document.getElementById("inputWeight").value) || 0;
  const height = parseFloat(document.getElementById("inputHeight").value) || 0;
  const rawFat = document.getElementById("inputFat").value;

  const active = getActiveProfile();
  if (active) {
    active.weight = weight;
    active.height = height;
    active.fat = rawFat !== "" && !isNaN(parseFloat(rawFat)) && parseFloat(rawFat) > 0
      ? parseFloat(rawFat)
      : null;
    saveProfilesStore();
    renderProfileSelectors();
  }

  syncInitialBodyPoint();
  updateIndicators();
  calculate();
}

function updateIndicators() {
  const weight = parseFloat(document.getElementById("inputWeight").value) || 0;
  const height = parseFloat(document.getElementById("inputHeight").value) || 0;
  const rawFat = document.getElementById("inputFat").value;
  const factorScale = parseFloat(document.getElementById("inputFactorOverride").value) || 1.0;

  const bmi = calculateBMI(weight, height);
  const resolvedFat = resolveEffectiveFatPercent(weight, height, rawFat);
  const vols = computeAllometricVolumes(weight, resolvedFat.fat);
  const effD3 = vols.vRelD3 * factorScale;
  const eff25D = vols.vRel25D * factorScale;

  document.getElementById("bmiValue").innerText = bmi > 0 ? bmi.toFixed(1) : "--";
  document.getElementById("bmiCategory").innerText = bmi > 0 ? getBMICategory(bmi) : "--";

  if (weight > 0) {
    document.getElementById("fatValue").innerText =
      resolvedFat.fat.toFixed(1) + "%" + (resolvedFat.isEstimated ? " (est.)" : "");
    document.getElementById("ffmFmDetail").innerText =
      `FFM ${vols.ffm.toFixed(1)} kg • FM ${vols.fm.toFixed(1)} kg`;
  } else {
    document.getElementById("fatValue").innerText = "--";
    document.getElementById("ffmFmDetail").innerText = "Masa magra / grasa";
  }

  const hintEl = document.getElementById("fatHintBadge");
  if (hintEl) {
    if (weight > 0 && resolvedFat.isEstimated) {
      hintEl.innerText =
        bmi > 0
          ? `% de grasa omitido: usando estimación por IMC (${resolvedFat.fat.toFixed(1)}%).`
          : `% de grasa omitido: usando referencia fisiológica estándar (20.0%).`;
    } else {
      hintEl.innerText = "";
    }
  }

  document.getElementById("factorValue").innerText = "x" + effD3.toFixed(2);
  document.getElementById("hydroFactorValue").innerText = "x" + eff25D.toFixed(2);
  updateHeaderProfilePill();
}

/* ==========================================================================
   3. PERFIL CORPORAL DINÁMICO E INTERPOLACIÓN
   ========================================================================== */

function addBodyPoint() {
  const week = parseFloat(document.getElementById("bodyWeek").value);
  const weight = parseFloat(document.getElementById("bodyWeight").value);
  const rawFat = document.getElementById("bodyFat").value;

  if (isNaN(week) || week < 0 || isNaN(weight) || weight <= 0) {
    return;
  }

  const height = parseFloat(document.getElementById("inputHeight").value) || 0;
  const { fat } = resolveEffectiveFatPercent(weight, height, rawFat);

  const existingIdx = bodyProfile.findIndex((p) => p.week === week);
  if (existingIdx >= 0) {
    bodyProfile[existingIdx] = { week, weight, fat };
  } else {
    bodyProfile.push({ week, weight, fat });
  }

  bodyProfile.sort((a, b) => a.week - b.week);

  if (week === 0) {
    document.getElementById("inputWeight").value = weight;
    if (rawFat !== "" && !isNaN(parseFloat(rawFat)) && parseFloat(rawFat) > 0) {
      document.getElementById("inputFat").value = fat;
    }
    const active = getActiveProfile();
    if (active) {
      active.weight = weight;
      if (rawFat !== "" && !isNaN(parseFloat(rawFat)) && parseFloat(rawFat) > 0) {
        active.fat = fat;
      }
      saveProfilesStore();
    }
    updateIndicators();
  }

  document.getElementById("bodyWeek").value = "";
  document.getElementById("bodyWeight").value = "";
  document.getElementById("bodyFat").value = "";

  renderBodyProfile();
  calculate();
}

function removeBodyPoint(index) {
  bodyProfile.splice(index, 1);
  renderBodyProfile();
  calculate();
}

function renderBodyProfile() {
  const tbody = document.getElementById("bodyProfileList");
  if (!tbody) return;

  if (bodyProfile.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin puntos corporales</td></tr>`;
    return;
  }

  tbody.innerHTML = bodyProfile
    .map(
      (p, idx) => `
      <tr>
        <td>Sem ${p.week}</td>
        <td>${p.weight.toFixed(1)} kg</td>
        <td>${p.fat.toFixed(1)}%</td>
        <td><button type="button" class="btn-del" onclick="removeBodyPoint(${idx})" title="Eliminar">×</button></td>
      </tr>`
    )
    .join("");
}

function getBodyAtWeek(week) {
  const fallbackWeight = parseFloat(document.getElementById("inputWeight").value) || 0;
  const fallbackHeight = parseFloat(document.getElementById("inputHeight").value) || 0;
  const rawFat = document.getElementById("inputFat").value;
  const fallbackFat = resolveEffectiveFatPercent(fallbackWeight, fallbackHeight, rawFat).fat;

  if (!bodyProfile || bodyProfile.length === 0) {
    return { weight: fallbackWeight, fat: fallbackFat };
  }

  const sorted = [...bodyProfile].sort((a, b) => a.week - b.week);

  if (week <= sorted[0].week) {
    return { weight: sorted[0].weight, fat: sorted[0].fat };
  }
  const last = sorted[sorted.length - 1];
  if (week >= last.week) {
    return { weight: last.weight, fat: last.fat };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    if (week >= p1.week && week <= p2.week) {
      const span = p2.week - p1.week;
      const ratio = span === 0 ? 0 : (week - p1.week) / span;
      return {
        weight: p1.weight + ratio * (p2.weight - p1.weight),
        fat: p1.fat + ratio * (p2.fat - p1.fat)
      };
    }
  }

  return { weight: fallbackWeight, fat: fallbackFat };
}

/* ==========================================================================
   4. SISTEMA DE REGISTRO DE HIDROFEROL (CALCIFEDIOL) EN CUALQUIER DÍA
   ========================================================================== */

function applyHydroPreset() {
  const preset = document.getElementById("hydroPreset").value;
  const mgInput = document.getElementById("hydroMg");
  if (preset === "0") {
    mgInput.value = "";
  } else if (preset !== "custom") {
    mgInput.value = preset;
  }
}

function syncHydroPresetFromInput() {
  const val = parseFloat(document.getElementById("hydroMg").value);
  const presetSelect = document.getElementById("hydroPreset");
  if (isNaN(val) || val <= 0) {
    presetSelect.value = "0";
    return;
  }
  const known = ["0.266", "0.532", "0.133"];
  const match = known.find((k) => Math.abs(parseFloat(k) - val) < 1e-4);
  presetSelect.value = match || "custom";
}

function addHydroferolDose() {
  const day = parseFloat(document.getElementById("hydroDay").value);
  const mg = parseFloat(document.getElementById("hydroMg").value);
  const noteInput = document.getElementById("hydroNote");
  const note = noteInput ? noteInput.value.trim() : "";

  if (isNaN(day) || day < 0 || isNaN(mg) || mg <= 0) return;

  hydroferolDoses.push({
    day: Number(day.toFixed(1)),
    mg: Number(mg.toFixed(4)),
    note
  });

  hydroferolDoses.sort((a, b) => a.day - b.day);

  document.getElementById("hydroDay").value = "";
  if (noteInput) noteInput.value = "";

  renderHydroferolDoses();
  calculate();
}

function deleteHydroferolDose(index) {
  hydroferolDoses.splice(index, 1);
  renderHydroferolDoses();
  calculate();
}

function renderHydroferolDoses() {
  const tbody = document.getElementById("hydroferolDosesList");
  if (!tbody) return;

  if (hydroferolDoses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin dosis de Hidroferol registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = hydroferolDoses
    .map((h, idx) => {
      const wk = (h.day / 7).toFixed(1);
      const ug = Math.round(h.mg * 1000);
      return `
      <tr>
        <td>Día ${h.day} <span style="color:var(--text-muted)">(S${wk})</span></td>
        <td>${h.mg.toFixed(3)} mg <span style="color:var(--text-muted)">(${ug} µg)</span></td>
        <td>${h.note || "—"}</td>
        <td><button type="button" class="btn-del" onclick="deleteHydroferolDose(${idx})" title="Eliminar">×</button></td>
      </tr>`;
    })
    .join("");
}

/* ==========================================================================
   5. SISTEMA DE MEDICIONES SÉRICAS
   ========================================================================== */

function toggleBloodPanel() {
  const body = document.getElementById("bloodPanelBody");
  const icon = document.getElementById("bloodToggleIcon");
  const isHidden = body.classList.toggle("hidden");
  icon.innerText = isHidden ? "▶" : "▼";
}

function addBloodPoint() {
  const week = parseFloat(document.getElementById("bloodWeek").value);
  const level = parseFloat(document.getElementById("bloodLevel").value);

  if (isNaN(week) || week < 0 || isNaN(level) || level < 0) return;

  const existingIdx = bloodMeasurements.findIndex((m) => m.week === week);
  if (existingIdx >= 0) {
    bloodMeasurements[existingIdx] = { week, level };
  } else {
    bloodMeasurements.push({ week, level });
  }

  bloodMeasurements.sort((a, b) => a.week - b.week);

  document.getElementById("bloodWeek").value = "";
  document.getElementById("bloodLevel").value = "";

  renderBloodRows();
  autoSaveCurrentState();
  if (lastResult) calculate();
}

function deleteBloodPoint(index) {
  bloodMeasurements.splice(index, 1);
  renderBloodRows();
  autoSaveCurrentState();
  if (lastResult) calculate();
}

function renderBloodRows() {
  const tbody = document.getElementById("bloodRowsList");
  if (!tbody) return;

  if (bloodMeasurements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Sin analíticas registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = bloodMeasurements
    .map(
      (m, idx) => `
      <tr>
        <td>Sem ${m.week}</td>
        <td>${m.level.toFixed(1)} ng/mL</td>
        <td><button type="button" class="btn-del" onclick="deleteBloodPoint(${idx})" title="Eliminar">×</button></td>
      </tr>`
    )
    .join("");
}

/* ==========================================================================
   6. SISTEMA DE DOSIS LIBRES, REPETIDAS Y CONSTRUCCIÓN DE SCHEDULE
   ========================================================================== */

function addCustomDose() {
  const week = parseFloat(document.getElementById("customWeek").value);
  const iu = parseFloat(document.getElementById("customIU").value);

  if (isNaN(week) || week < 0 || isNaN(iu) || iu <= 0) return;

  customDoses.push({ week, iu });
  customDoses.sort((a, b) => a.week - b.week);

  document.getElementById("customWeek").value = "";
  document.getElementById("customIU").value = "";

  renderCustomDoses();
  calculate();
}

function deleteCustomDose(index) {
  customDoses.splice(index, 1);
  renderCustomDoses();
  calculate();
}

function renderCustomDoses() {
  const tbody = document.getElementById("customDosesList");
  if (!tbody) return;

  if (customDoses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Sin dosis libres</td></tr>`;
    return;
  }

  tbody.innerHTML = customDoses
    .map(
      (d, idx) => `
      <tr>
        <td>Sem ${d.week}</td>
        <td>${d.iu.toLocaleString("es-CL")} UI</td>
        <td><button type="button" class="btn-del" onclick="deleteCustomDose(${idx})" title="Eliminar">×</button></td>
      </tr>`
    )
    .join("");
}

function addDailyPhase() {
  const startWeek = parseFloat(document.getElementById("dailyStart").value);
  const endWeek = parseFloat(document.getElementById("dailyEnd").value);
  const dailyIU = parseFloat(document.getElementById("dailyIU").value);

  if (isNaN(startWeek) || isNaN(endWeek) || endWeek <= startWeek || isNaN(dailyIU) || dailyIU <= 0) {
    return;
  }

  dailyPhases.push({
    name: `Fase ${dailyPhases.length + 1} (Diaria)`,
    startWeek,
    endWeek,
    dailyIU
  });

  document.getElementById("dailyStart").value = "";
  document.getElementById("dailyEnd").value = "";
  document.getElementById("dailyIU").value = "";

  renderDailyPhases();
  calculate();
}

function deleteDailyPhase(index) {
  dailyPhases.splice(index, 1);
  renderDailyPhases();
  calculate();
}

function renderDailyPhases() {
  const tbody = document.getElementById("dailyPhasesList");
  if (!tbody) return;

  if (dailyPhases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin fases diarias</td></tr>`;
    return;
  }

  tbody.innerHTML = dailyPhases
    .map(
      (p, idx) => `
      <tr>
        <td>${p.name}</td>
        <td>${p.startWeek}–${p.endWeek}</td>
        <td>${p.dailyIU.toLocaleString("es-CL")} UI</td>
        <td><button type="button" class="btn-del" onclick="deleteDailyPhase(${idx})" title="Eliminar">×</button></td>
      </tr>`
    )
    .join("");
}

function computeDoseEfficiency(dose) {
  if (dose.type === "calcifediol") {
    return 1.0 / (1.0 + Math.pow(dose.mg / PK_25D_D50_MG, PK_D3_HILL));
  }
  return 1.0 / (1.0 + Math.pow(dose.iu / PK_D3_D50_IU, PK_D3_HILL));
}

function buildSchedule() {
  const horizonWeeks = parseFloat(document.getElementById("inputHorizon").value) || 0;
  const horizonDays = horizonWeeks * 7;
  const doses = [];

  if (horizonWeeks <= 0) {
    simulationPhases = [];
    return { doses };
  }

  if (currentMode === "simulation") {
    const repIU = parseFloat(document.getElementById("repIU").value) || 0;
    const repInterval = parseFloat(document.getElementById("repInterval").value) || 0;
    const repCount = parseInt(document.getElementById("repCount").value, 10) || 0;
    const repStartWeek = parseFloat(document.getElementById("repStartWeek").value) || 0;

    simulationPhases = [];
    if (repIU > 0 && repCount > 0 && repInterval > 0) {
      for (let i = 0; i < repCount; i++) {
        const w = repStartWeek + i * repInterval;
        if (w <= horizonWeeks) {
          const item = {
            phase: "Dosis Repetida (D₃)",
            type: "d3",
            week: Number(w.toFixed(2)),
            day: w * 7,
            iu: repIU
          };
          item.efficiency = computeDoseEfficiency(item);
          simulationPhases.push(item);
          doses.push(item);
        }
      }
    }

    customDoses.forEach((cd) => {
      if (cd.week <= horizonWeeks && cd.iu > 0) {
        const item = {
          phase: "Dosis Libre (D₃)",
          type: "d3",
          week: Number(cd.week.toFixed(2)),
          day: cd.week * 7,
          iu: cd.iu
        };
        item.efficiency = computeDoseEfficiency(item);
        doses.push(item);
      }
    });
  } else {
    dailyPhases.forEach((dp) => {
      const startDay = Math.max(0, Math.round(dp.startWeek * 7));
      const endDay = Math.min(Math.round(horizonDays), Math.round(dp.endWeek * 7));
      for (let d = startDay; d < endDay; d++) {
        const item = {
          phase: dp.name,
          type: "d3",
          week: Number((d / 7).toFixed(2)),
          day: d,
          iu: dp.dailyIU
        };
        item.efficiency = computeDoseEfficiency(item);
        doses.push(item);
      }
    });
  }

  hydroferolDoses.forEach((hd) => {
    if (hd.day <= horizonDays && hd.mg > 0) {
      const ug = hd.mg * 1000;
      const item = {
        phase: "Hidroferol (25-OH-D₃)",
        type: "calcifediol",
        week: Number((hd.day / 7).toFixed(2)),
        day: hd.day,
        mg: hd.mg,
        ug,
        note: hd.note || "",
        iu: Math.round(ug * CALCIFEDIOL_D3_EQ_PER_UG)
      };
      item.efficiency = computeDoseEfficiency(item);
      doses.push(item);
    }
  });

  doses.sort((a, b) => a.day - b.day);
  return { doses };
}

/* ==========================================================================
   7. MOTOR FARMACOCINÉTICO EDO RK4 (CONSERVACIÓN DE MASA + CYP24A1)
   ========================================================================== */

function buildBodyTimeline(totalDays, stepDays) {
  const steps = Math.floor(totalDays / stepDays) + 1;
  const weights = new Float64Array(steps);
  const vRelD3Arr = new Float64Array(steps);
  const vRel25DArr = new Float64Array(steps);

  for (let idx = 0; idx < steps; idx++) {
    const w = (idx * stepDays) / 7;
    const body = getBodyAtWeek(w);
    const vols = computeAllometricVolumes(body.weight, body.fat);
    weights[idx] = body.weight;
    vRelD3Arr[idx] = vols.vRelD3;
    vRel25DArr[idx] = vols.vRel25D;
  }

  return { steps, weights, vRelD3Arr, vRel25DArr };
}

function integrateTrajectory(maxDay, doses, params, precomputedTimeline = null) {
  const { baseline, halfLife, ka, factorScale } = params;
  const keBase = Math.LN2 / Math.max(5, halfLife);
  const fScale = Math.max(0.4, factorScale || 1.0);
  const stepDays = 0.5;

  const timeline = precomputedTimeline || buildBodyTimeline(maxDay, stepDays);
  const steps = Math.min(timeline.steps, Math.floor(maxDay / stepDays) + 1);

  const weeks = new Array(steps);
  const levels = new Array(steps);
  const weights = new Array(steps);

  let gutD3 = 0.0;
  let gut25D = 0.0;
  let poolD3 = 0.0;
  let pool25D = 0.0;
  let doseIdx = 0;

  const calcKeEff = (conc) => {
    const excess = Math.max(0, conc - CYP24A1_THRESHOLD);
    if (excess <= 0) return keBase;
    return keBase * (1.0 + (CYP24A1_EMAX * excess) / (CYP24A1_EC50 + excess));
  };

  for (let idx = 0; idx < steps; idx++) {
    const day = idx * stepDays;

    while (doseIdx < doses.length && doses[doseIdx].day <= day + 1e-6) {
      const d = doses[doseIdx];
      const eff = d.efficiency !== undefined ? d.efficiency : computeDoseEfficiency(d);
      if (d.type === "calcifediol") {
        gut25D += d.ug * eff * PK_25D_ALPHA;
      } else {
        gutD3 += d.iu * eff * PK_D3_ALPHA;
      }
      doseIdx++;
    }

    const vD3 = timeline.vRelD3Arr[idx] * fScale;
    const v25D = timeline.vRel25DArr[idx] * fScale;
    const conc = baseline + poolD3 / vD3 + pool25D / v25D;

    weeks[idx] = Number((day / 7).toFixed(3));
    levels[idx] = Number(conc.toFixed(2));
    weights[idx] = Number(timeline.weights[idx].toFixed(1));

    if (idx === steps - 1) break;

    const h = stepDays;
    const vD3Next = timeline.vRelD3Arr[idx + 1] * fScale;
    const v25DNext = timeline.vRel25DArr[idx + 1] * fScale;
    const vD3Mid = 0.5 * (vD3 + vD3Next);
    const v25DMid = 0.5 * (v25D + v25DNext);

    const derivs = (g3, g25, p3, p25, vd3Curr, vd25Curr) => {
      const cCurr = baseline + p3 / vd3Curr + p25 / vd25Curr;
      const ke = calcKeEff(cCurr);
      const abs3 = ka * g3;
      const abs25 = PK_25D_KA * g25;
      return {
        dg3: -abs3,
        dg25: -abs25,
        dp3: abs3 - ke * p3,
        dp25: abs25 - ke * p25
      };
    };

    const k1 = derivs(gutD3, gut25D, poolD3, pool25D, vD3, v25D);
    const k2 = derivs(
      gutD3 + 0.5 * h * k1.dg3,
      gut25D + 0.5 * h * k1.dg25,
      poolD3 + 0.5 * h * k1.dp3,
      pool25D + 0.5 * h * k1.dp25,
      vD3Mid,
      v25DMid
    );
    const k3 = derivs(
      gutD3 + 0.5 * h * k2.dg3,
      gut25D + 0.5 * h * k2.dg25,
      poolD3 + 0.5 * h * k2.dp3,
      pool25D + 0.5 * h * k2.dp25,
      vD3Mid,
      v25DMid
    );
    const k4 = derivs(
      gutD3 + h * k3.dg3,
      gut25D + h * k3.dg25,
      poolD3 + h * k3.dp3,
      pool25D + h * k3.dp25,
      vD3Next,
      v25DNext
    );

    gutD3 = Math.max(0, gutD3 + (h / 6) * (k1.dg3 + 2 * k2.dg3 + 2 * k3.dg3 + k4.dg3));
    gut25D = Math.max(0, gut25D + (h / 6) * (k1.dg25 + 2 * k2.dg25 + 2 * k3.dg25 + k4.dg25));
    poolD3 = Math.max(0, poolD3 + (h / 6) * (k1.dp3 + 2 * k2.dp3 + 2 * k3.dp3 + k4.dp3));
    pool25D = Math.max(0, pool25D + (h / 6) * (k1.dp25 + 2 * k2.dp25 + 2 * k3.dp25 + k4.dp25));
  }

  return { weeks, levels, weights };
}

function interpolateTrajectoryAtDay(traj, day) {
  const stepDays = 0.5;
  const exactIdx = day / stepDays;
  const i0 = Math.max(0, Math.min(traj.levels.length - 1, Math.floor(exactIdx)));
  const i1 = Math.max(0, Math.min(traj.levels.length - 1, i0 + 1));
  const frac = exactIdx - i0;
  return traj.levels[i0] + frac * (traj.levels[i1] - traj.levels[i0]);
}

function simulatePoint(day, doses, params) {
  const traj = integrateTrajectory(Math.max(day, 0.5), doses, params);
  return interpolateTrajectoryAtDay(traj, day);
}

function computeUncertaintyBands(levels, baseline, measurementCount) {
  const n = Math.max(0, measurementCount || 0);
  const paramCV = 0.16 / Math.sqrt(1 + 0.85 * n);
  const baseSD = 2.6 / Math.sqrt(1 + 0.9 * n);

  const ciLow = new Array(levels.length);
  const ciHigh = new Array(levels.length);

  for (let i = 0; i < levels.length; i++) {
    const c = levels[i];
    const deltaC = Math.max(0, c - baseline);
    const assaySD = Math.sqrt(ASSAY_SIGMA_ADD * ASSAY_SIGMA_ADD + Math.pow(ASSAY_SIGMA_PROP * c, 2));
    const totalSD = Math.sqrt(Math.pow(paramCV * deltaC, 2) + baseSD * baseSD + assaySD * assaySD);

    ciLow[i] = Number(Math.max(0, c - 1.96 * totalSD).toFixed(2));
    ciHigh[i] = Number((c + 1.96 * totalSD).toFixed(2));
  }

  return { ciLow, ciHigh };
}

function runSimulation() {
  const horizonWeeks = parseFloat(document.getElementById("inputHorizon").value) || 0;
  const baseline = parseFloat(document.getElementById("inputBaseline").value) || 0;
  const halfLife = parseFloat(document.getElementById("inputHalfLife").value) || 25;
  const ka = parseFloat(document.getElementById("inputKa").value) || 0.28;
  const factorScale = parseFloat(document.getElementById("inputFactorOverride").value) || 1.0;

  const schedule = buildSchedule();

  if (horizonWeeks <= 0) {
    return {
      weeks: [],
      levels: [],
      ciLow: [],
      ciHigh: [],
      weights: [],
      schedule
    };
  }

  const totalDays = horizonWeeks * 7;
  const params = { baseline, halfLife, ka, factorScale };

  const traj = integrateTrajectory(totalDays, schedule.doses, params);
  const bands = computeUncertaintyBands(traj.levels, baseline, bloodMeasurements.length);

  return {
    weeks: traj.weeks,
    levels: traj.levels,
    ciLow: bands.ciLow,
    ciHigh: bands.ciHigh,
    weights: traj.weights,
    schedule
  };
}

/* ==========================================================================
   8. ESTIMACIÓN DE BASELINE Y CALIBRACIÓN BAYESIANA MAP + NELDER-MEAD + LOO-CV
   ========================================================================== */

function estimateBaseline() {
  const out = document.getElementById("calibrationOutput");
  if (!bloodMeasurements || bloodMeasurements.length === 0) {
    out.innerText = "Agregue al menos una medición sérica para estimar el baseline.";
    return null;
  }

  const schedule = buildSchedule();
  const halfLife = parseFloat(document.getElementById("inputHalfLife").value) || 25;
  const ka = parseFloat(document.getElementById("inputKa").value) || 0.28;
  const factorScale = parseFloat(document.getElementById("inputFactorOverride").value) || 1.0;

  const maxDay = Math.max(...bloodMeasurements.map((m) => m.week * 7), 1);
  const trajZero = integrateTrajectory(maxDay, schedule.doses, {
    baseline: 0,
    halfLife,
    ka,
    factorScale
  });

  let weightedSum = 0;
  let weightTotal = 0;
  bloodMeasurements.forEach((m) => {
    const exoGain = interpolateTrajectoryAtDay(trajZero, m.week * 7);
    const impliedBase = Math.max(0, m.level - exoGain);
    const w = 1.0 / (1.0 + 0.04 * exoGain);
    weightedSum += impliedBase * w;
    weightTotal += w;
  });

  const estimated = weightedSum / Math.max(1e-6, weightTotal);
  document.getElementById("inputBaseline").value = estimated.toFixed(1);

  out.innerHTML = `<strong>Baseline estimado (ponderado por sensibilidad):</strong> ${estimated.toFixed(1)} ng/mL.`;
  calculate();
  return estimated;
}

function nelderMead3D(objectiveFn, startPoint, steps, maxIter = 85) {
  let simplex = [
    { x: [...startPoint], fx: objectiveFn(startPoint) },
    { x: [startPoint[0] + steps[0], startPoint[1], startPoint[2]], fx: 0 },
    { x: [startPoint[0], startPoint[1] + steps[1], startPoint[2]], fx: 0 },
    { x: [startPoint[0], startPoint[1], startPoint[2] + steps[2]], fx: 0 }
  ];
  for (let i = 1; i < 4; i++) simplex[i].fx = objectiveFn(simplex[i].x);

  for (let iter = 0; iter < maxIter; iter++) {
    simplex.sort((a, b) => a.fx - b.fx);
    const centroid = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      centroid[0] += simplex[i].x[0] / 3;
      centroid[1] += simplex[i].x[1] / 3;
      centroid[2] += simplex[i].x[2] / 3;
    }

    const worst = simplex[3];
    const reflected = centroid.map((c, j) => c + (c - worst.x[j]));
    const fRef = objectiveFn(reflected);

    if (fRef < simplex[0].fx) {
      const expanded = centroid.map((c, j) => c + 2 * (reflected[j] - c));
      const fExp = objectiveFn(expanded);
      simplex[3] = fExp < fRef ? { x: expanded, fx: fExp } : { x: reflected, fx: fRef };
    } else if (fRef < simplex[2].fx) {
      simplex[3] = { x: reflected, fx: fRef };
    } else {
      const contracted = centroid.map((c, j) => c + 0.5 * (worst.x[j] - c));
      const fCon = objectiveFn(contracted);
      if (fCon < worst.fx) {
        simplex[3] = { x: contracted, fx: fCon };
      } else {
        for (let i = 1; i < 4; i++) {
          simplex[i].x = simplex[0].x.map((b, j) => b + 0.5 * (simplex[i].x[j] - b));
          simplex[i].fx = objectiveFn(simplex[i].x);
        }
      }
    }
  }

  simplex.sort((a, b) => a.fx - b.fx);
  return simplex[0];
}

function fitMAPSubset(measurementsSubset, doses, ka, priorBase, timeline) {
  const mapObjective = (theta) => {
    const [base, scale, hl] = theta;
    if (base < 0 || base > 65 || scale < 0.55 || scale > 1.85 || hl < 12 || hl > 45) {
      return 1e9;
    }

    const maxDay = Math.max(...measurementsSubset.map((m) => m.week * 7), 1);
    const traj = integrateTrajectory(maxDay, doses, {
      baseline: base,
      halfLife: hl,
      ka,
      factorScale: scale
    }, timeline);

    let logLikLoss = 0;
    for (let i = 0; i < measurementsSubset.length; i++) {
      const m = measurementsSubset[i];
      const pred = interpolateTrajectoryAtDay(traj, m.week * 7);
      const sigma = Math.sqrt(ASSAY_SIGMA_ADD * ASSAY_SIGMA_ADD + Math.pow(ASSAY_SIGMA_PROP * pred, 2));
      const z = (m.level - pred) / sigma;
      logLikLoss += z * z;
    }

    const priorPenalty =
      Math.pow((base - priorBase) / PRIOR_SD_BASELINE, 2) +
      Math.pow(Math.log(scale) / PRIOR_OMEGA_FACTOR, 2) +
      Math.pow(Math.log(hl / 25.0) / PRIOR_OMEGA_HALFLIFE, 2);

    return logLikLoss + priorPenalty;
  };

  let bestInit = [priorBase, 1.0, 25.0];
  let bestVal = mapObjective(bestInit);

  for (let b = Math.max(2, priorBase - 12); b <= Math.min(50, priorBase + 12); b += 4) {
    for (let s = 0.65; s <= 1.55; s += 0.15) {
      for (let h = 15; h <= 37; h += 5.5) {
        const val = mapObjective([b, s, h]);
        if (val < bestVal) {
          bestVal = val;
          bestInit = [b, s, h];
        }
      }
    }
  }

  const refined = nelderMead3D(mapObjective, bestInit, [1.5, 0.08, 2.0], 75);
  return {
    baseline: refined.x[0],
    factorScale: refined.x[1],
    halfLife: refined.x[2],
    obj: refined.fx
  };
}

function calibrateModel() {
  const out = document.getElementById("calibrationOutput");
  if (!bloodMeasurements || bloodMeasurements.length < 1) {
    out.innerText = "Se requiere al menos 1 medición sérica para ejecutar la calibración Bayesiana MAP.";
    return null;
  }

  const schedule = buildSchedule();
  const ka = parseFloat(document.getElementById("inputKa").value) || 0.28;
  const maxDay = Math.max(...bloodMeasurements.map((m) => m.week * 7), 1);
  const timeline = buildBodyTimeline(maxDay, 0.5);

  const earliest = [...bloodMeasurements].sort((a, b) => a.week - b.week)[0];
  const priorBase = earliest.week === 0 ? earliest.level : (parseFloat(document.getElementById("inputBaseline").value) || 0);

  const fit = fitMAPSubset(bloodMeasurements, schedule.doses, ka, priorBase, timeline);

  const trajFit = integrateTrajectory(maxDay, schedule.doses, {
    baseline: fit.baseline,
    halfLife: fit.halfLife,
    ka,
    factorScale: fit.factorScale
  }, timeline);

  let sqErr = 0;
  let absPctErr = 0;
  bloodMeasurements.forEach((m) => {
    const pred = interpolateTrajectoryAtDay(trajFit, m.week * 7);
    const err = pred - m.level;
    sqErr += err * err;
    absPctErr += Math.abs(err) / Math.max(1, m.level);
  });
  const rmse = Math.sqrt(sqErr / bloodMeasurements.length);
  const mape = (absPctErr / bloodMeasurements.length) * 100;

  let looText = "N=1 (prior activo)";
  if (bloodMeasurements.length >= 2) {
    let looSqErr = 0;
    for (let i = 0; i < bloodMeasurements.length; i++) {
      const subset = bloodMeasurements.filter((_, idx) => idx !== i);
      const subFit = fitMAPSubset(subset, schedule.doses, ka, priorBase, timeline);
      const subTraj = integrateTrajectory(maxDay, schedule.doses, {
        baseline: subFit.baseline,
        halfLife: subFit.halfLife,
        ka,
        factorScale: subFit.factorScale
      }, timeline);
      const heldOut = bloodMeasurements[i];
      const predOut = interpolateTrajectoryAtDay(subTraj, heldOut.week * 7);
      looSqErr += Math.pow(predOut - heldOut.level, 2);
    }
    const looRmse = Math.sqrt(looSqErr / bloodMeasurements.length);
    looText = `${looRmse.toFixed(2)} ng/mL`;
  }

  document.getElementById("inputBaseline").value = fit.baseline.toFixed(1);
  document.getElementById("inputHalfLife").value = fit.halfLife.toFixed(1);
  document.getElementById("inputFactorOverride").value = fit.factorScale.toFixed(3);
  updateIndicators();

  const w = parseFloat(document.getElementById("inputWeight").value) || 0;
  const h = parseFloat(document.getElementById("inputHeight").value) || 0;
  const rawF = document.getElementById("inputFat").value;
  const refVols = computeAllometricVolumes(w, resolveEffectiveFatPercent(w, h, rawF).fat);

  out.innerHTML = `
    <strong>Calibración Bayesiana MAP completada</strong><br/>
    &bull; RMSE ajuste: <b>${rmse.toFixed(2)} ng/mL</b> (MAPE: <b>${mape.toFixed(1)}%</b>)<br/>
    &bull; Error predictivo LOO-CV: <b>${looText}</b><br/>
    &bull; Baseline MAP: <b>${fit.baseline.toFixed(1)} ng/mL</b> | t½: <b>${fit.halfLife.toFixed(1)} d</b><br/>
    &bull; Escala factor: <b>${fit.factorScale.toFixed(3)}</b> (D₃ eff: x${(refVols.vRelD3 * fit.factorScale).toFixed(2)})
  `;

  calculate();
  return fit;
}

/* ==========================================================================
   9. MEMORIA DE SIMULACIONES Y SINCRONIZACIÓN CON PERFIL ACTIVO
   ========================================================================== */

function captureCurrentState() {
  const numVal = (id, fallback = 0) => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? fallback : v;
  };
  const rawFat = document.getElementById("inputFat").value;

  return {
    theme: currentTheme,
    mode: currentMode,
    inputs: {
      weight: numVal("inputWeight", 0),
      height: numVal("inputHeight", 0),
      fat: rawFat !== "" && !isNaN(parseFloat(rawFat)) && parseFloat(rawFat) > 0 ? parseFloat(rawFat) : "",
      horizon: numVal("inputHorizon", 0),
      baseline: numVal("inputBaseline", 0),
      halfLife: numVal("inputHalfLife", 25),
      ka: numVal("inputKa", 0.28),
      factorOverride: numVal("inputFactorOverride", 1.0),
      repIU: numVal("repIU", 0),
      repInterval: numVal("repInterval", 0),
      repCount: parseInt(document.getElementById("repCount").value, 10) || 0,
      repStartWeek: numVal("repStartWeek", 0)
    },
    bodyProfile: JSON.parse(JSON.stringify(bodyProfile)),
    hydroferolDoses: JSON.parse(JSON.stringify(hydroferolDoses)),
    customDoses: JSON.parse(JSON.stringify(customDoses)),
    dailyPhases: JSON.parse(JSON.stringify(dailyPhases)),
    bloodMeasurements: JSON.parse(JSON.stringify(bloodMeasurements))
  };
}

function formatOptionalZeroInput(val) {
  if (val === undefined || val === null || val === "" || Number(val) === 0) return "";
  return val;
}

function applyState(stateObj) {
  if (!stateObj || !stateObj.inputs) return;
  isRestoringState = true;

  try {
    const inp = stateObj.inputs;
    document.getElementById("inputWeight").value = formatOptionalZeroInput(inp.weight);
    document.getElementById("inputHeight").value = formatOptionalZeroInput(inp.height);
    document.getElementById("inputFat").value =
      inp.fat !== undefined && inp.fat !== null && inp.fat !== "" && Number(inp.fat) > 0 ? inp.fat : "";
    document.getElementById("inputHorizon").value = formatOptionalZeroInput(inp.horizon);
    document.getElementById("inputBaseline").value = formatOptionalZeroInput(inp.baseline);
    document.getElementById("inputHalfLife").value = inp.halfLife ?? 25;
    document.getElementById("inputKa").value = inp.ka ?? 0.28;
    document.getElementById("inputFactorOverride").value = inp.factorOverride ?? 1.0;

    document.getElementById("repIU").value = formatOptionalZeroInput(inp.repIU);
    document.getElementById("repInterval").value = formatOptionalZeroInput(inp.repInterval);
    document.getElementById("repCount").value = formatOptionalZeroInput(inp.repCount);
    document.getElementById("repStartWeek").value = formatOptionalZeroInput(inp.repStartWeek);

    bodyProfile = Array.isArray(stateObj.bodyProfile) ? JSON.parse(JSON.stringify(stateObj.bodyProfile)) : [];
    hydroferolDoses = Array.isArray(stateObj.hydroferolDoses) ? JSON.parse(JSON.stringify(stateObj.hydroferolDoses)) : [];
    customDoses = Array.isArray(stateObj.customDoses) ? JSON.parse(JSON.stringify(stateObj.customDoses)) : [];
    dailyPhases = Array.isArray(stateObj.dailyPhases) ? JSON.parse(JSON.stringify(stateObj.dailyPhases)) : [];
    bloodMeasurements = Array.isArray(stateObj.bloodMeasurements) ? JSON.parse(JSON.stringify(stateObj.bloodMeasurements)) : [];

    if (stateObj.theme) setTheme(stateObj.theme);
    setMode(stateObj.mode || "simulation");

    updateIndicators();
    renderBodyProfile();
    renderHydroferolDoses();
    renderBloodRows();
    renderCustomDoses();
    renderDailyPhases();
  } finally {
    isRestoringState = false;
  }

  calculate();
}

function autoSaveCurrentState() {
  if (isRestoringState) return;
  try {
    const snapshot = captureCurrentState();
    localStorage.setItem(STORAGE_KEY_AUTOSAVE, JSON.stringify(snapshot));

    const active = getActiveProfile();
    if (active) {
      active.state = snapshot;
      active.savedSimulations = JSON.parse(JSON.stringify(savedSimulations));
      active.weight = snapshot.inputs.weight;
      active.height = snapshot.inputs.height;
      active.fat = snapshot.inputs.fat === "" ? null : Number(snapshot.inputs.fat);
      saveProfilesStore();
    }

    const badge = document.getElementById("autosaveBadge");
    if (badge) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      badge.innerText = `Guardado ${hh}:${mm}`;
    }
  } catch (err) {
    console.warn("No se pudo guardar en localStorage:", err);
  }
}

function loadAutoSavedState() {
  try {
    const rawMemories = localStorage.getItem(STORAGE_KEY_MEMORIES);
    if (rawMemories) {
      const parsed = JSON.parse(rawMemories);
      if (Array.isArray(parsed)) savedSimulations = parsed;
    }

    const rawAuto = localStorage.getItem(STORAGE_KEY_AUTOSAVE);
    if (rawAuto) {
      const parsedAuto = JSON.parse(rawAuto);
      applyState(parsedAuto);
      return true;
    }
  } catch (err) {
    console.warn("Error leyendo memoria almacenada:", err);
  }
  return false;
}

function persistSavedSimulations() {
  try {
    localStorage.setItem(STORAGE_KEY_MEMORIES, JSON.stringify(savedSimulations));
    const active = getActiveProfile();
    if (active) {
      active.savedSimulations = JSON.parse(JSON.stringify(savedSimulations));
      saveProfilesStore();
    }
  } catch (err) {
    console.warn("No se pudo persistir el historial de simulaciones:", err);
  }
}

function saveSimulationMemory() {
  const nameInput = document.getElementById("memoryName");
  const rawName = nameInput ? nameInput.value.trim() : "";
  const defaultName = `Simulación #${savedSimulations.length + 1}`;
  const name = rawName || defaultName;

  if (!lastResult) calculate();

  const peak = lastResult && lastResult.levels.length ? Math.max(...lastResult.levels) : 0;
  const finalVal = lastResult && lastResult.levels.length ? lastResult.levels[lastResult.levels.length - 1] : 0;
  const curve = lastResult
    ? lastResult.weeks.map((w, idx) => ({ x: w, y: lastResult.levels[idx] }))
    : [];

  const now = new Date();
  const dateLabel =
    now.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) +
    " " +
    now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

  const entry = {
    id: "mem_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    name,
    savedAt: dateLabel,
    summary: {
      peak: Number(peak.toFixed(1)),
      final: Number(finalVal.toFixed(1)),
      mode: currentMode === "daily" ? "Diario" : "Simulación"
    },
    state: captureCurrentState(),
    curve
  };

  savedSimulations.unshift(entry);
  persistSavedSimulations();

  if (nameInput) nameInput.value = "";
  renderSavedSimulations();
}

function loadSimulationMemory(id) {
  const found = savedSimulations.find((m) => m.id === id);
  if (!found || !found.state) return;
  applyState(found.state);
}

function toggleCompareMemory(id) {
  if (comparedMemoryIds.has(id)) {
    comparedMemoryIds.delete(id);
  } else {
    comparedMemoryIds.add(id);
  }
  renderSavedSimulations();
  if (lastResult) renderCharts(lastResult);
}

function deleteSimulationMemory(id) {
  savedSimulations = savedSimulations.filter((m) => m.id !== id);
  comparedMemoryIds.delete(id);
  persistSavedSimulations();
  renderSavedSimulations();
  if (lastResult) renderCharts(lastResult);
}

function renderSavedSimulations() {
  const container = document.getElementById("savedMemoriesList");
  if (!container) return;

  if (savedSimulations.length === 0) {
    container.innerHTML = `<div class="memory-empty">Sin escenarios guardados en este perfil.</div>`;
    return;
  }

  container.innerHTML = savedSimulations
    .map((m) => {
      const isComparing = comparedMemoryIds.has(m.id);
      return `
      <div class="memory-item ${isComparing ? "comparing" : ""}">
        <div class="memory-info">
          <div class="memory-title" title="${m.name}">${m.name}</div>
          <div class="memory-meta">${m.savedAt} &bull; Pico ${m.summary.peak} &bull; Fin ${m.summary.final} ng/mL</div>
        </div>
        <div class="memory-actions">
          <button type="button" class="btn-mini" onclick="loadSimulationMemory('${m.id}')" title="Cargar parámetros">Cargar</button>
          <button type="button" class="btn-mini ${isComparing ? "active" : ""}" onclick="toggleCompareMemory('${m.id}')" title="Superponer curva">Comparar</button>
          <button type="button" class="btn-del" onclick="deleteSimulationMemory('${m.id}')" title="Eliminar">×</button>
        </div>
      </div>`;
    })
    .join("");
}

async function exportMemoriesJSON() {
  const payload = {
    app: "Vitamina D Simulator V7.0 PopPK + Perfiles",
    exportedAt: new Date().toISOString(),
    activeProfileId: profilesStore.activeProfileId,
    profiles: profilesStore.profiles,
    activeState: captureCurrentState(),
    savedSimulations
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const fileName = `vitd_simulator_v7_perfiles_${new Date().toISOString().slice(0, 10)}.json`;
  const isAndroid = /Android/i.test(navigator.userAgent || "");

  // 1. En Android WebView: hoja nativa de compartir/guardar archivo .json (Archivos, Drive, Quick Share, etc.)
  if (isAndroid && typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const file = new File([jsonStr], fileName, { type: "application/json" });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Respaldo Vitamina D Simulator",
          text: fileName
        });
        return;
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }

  // 2. Descarga estándar vía Blob (PC / Desktop)
  try {
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (!isAndroid) return;
  } catch (e) {
    // Continuar a respaldo por portapapeles
  }

  // 3. Respaldo universal si el WebView móvil bloquea blob: copiar JSON al portapapeles
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(jsonStr);
      alert(`El navegador móvil bloqueó la descarga directa, pero el respaldo JSON (${fileName}) se copió al portapapeles. Pégalo en un archivo .json para importarlo en tu PC.`);
      return;
    }
  } catch (clipErr) {
    // Continuar a copia manual
  }

  window.prompt(`Copia este respaldo JSON (${fileName}):`, jsonStr);
}

function importMemoriesJSON(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);

      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        const existingIds = new Set(profilesStore.profiles.map((p) => p.id));
        parsed.profiles.forEach((p) => {
          if (p && p.id && !existingIds.has(p.id)) {
            profilesStore.profiles.push(p);
          }
        });
        saveProfilesStore();
        renderProfileSelectors();
        if (parsed.activeProfileId && profilesStore.profiles.some((p) => p.id === parsed.activeProfileId)) {
          switchProfile(parsed.activeProfileId);
        }
        return;
      }

      if (Array.isArray(parsed.savedSimulations)) {
        const existingIds = new Set(savedSimulations.map((m) => m.id));
        parsed.savedSimulations.forEach((item) => {
          if (item && item.id && !existingIds.has(item.id)) {
            savedSimulations.push(item);
          }
        });
        persistSavedSimulations();
        renderSavedSimulations();
      }
      if (parsed.activeState) {
        applyState(parsed.activeState);
      }
    } catch (err) {
      alert("El archivo JSON seleccionado no tiene un formato válido del simulador.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function resetDefaultState() {
  localStorage.removeItem(STORAGE_KEY_AUTOSAVE);
  comparedMemoryIds.clear();

  const hydroPreset = document.getElementById("hydroPreset");
  const hydroMg = document.getElementById("hydroMg");
  if (hydroPreset) hydroPreset.value = "0";
  if (hydroMg) hydroMg.value = "";

  const active = getActiveProfile();
  const baseWeight = active ? active.weight || 0 : 0;
  const baseHeight = active ? active.height || 0 : 0;
  const baseFat = active && active.fat ? active.fat : "";
  const resolvedFat = resolveEffectiveFatPercent(baseWeight, baseHeight, baseFat).fat;

  applyState({
    theme: currentTheme,
    mode: "simulation",
    inputs: {
      weight: baseWeight,
      height: baseHeight,
      fat: baseFat,
      horizon: 0,
      baseline: 0,
      halfLife: 25,
      ka: 0.28,
      factorOverride: 1.0,
      repIU: 0,
      repInterval: 0,
      repCount: 0,
      repStartWeek: 0
    },
    bodyProfile: baseWeight > 0 ? [{ week: 0, weight: baseWeight, fat: resolvedFat }] : [],
    hydroferolDoses: [],
    customDoses: [],
    dailyPhases: [],
    bloodMeasurements: []
  });
  renderSavedSimulations();
}

/* ==========================================================================
   10. ADMINISTRADOR DE PERFILES, SEGUIMIENTO Y PLANIFICADOR DE OBJETIVOS
   ========================================================================== */

function getActiveProfile() {
  return profilesStore.profiles.find((p) => p.id === profilesStore.activeProfileId) || null;
}

function saveProfilesStore() {
  try {
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profilesStore));
  } catch (err) {
    console.warn("No se pudo guardar profilesStore:", err);
  }
}

function buildEmptyProfileState(weight = 0, height = 0, fat = null) {
  const effFat = resolveEffectiveFatPercent(weight, height, fat).fat;
  return {
    theme: currentTheme,
    mode: "simulation",
    inputs: {
      weight: weight || 0,
      height: height || 0,
      fat: fat !== null && fat !== undefined && fat > 0 ? fat : "",
      horizon: 0,
      baseline: 0,
      halfLife: 25,
      ka: 0.28,
      factorOverride: 1.0,
      repIU: 0,
      repInterval: 0,
      repCount: 0,
      repStartWeek: 0
    },
    bodyProfile: weight > 0 ? [{ week: 0, weight, fat: effFat }] : [],
    hydroferolDoses: [],
    customDoses: [],
    dailyPhases: [],
    bloodMeasurements: []
  };
}

function initProfilesStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        parsed.profiles.forEach((p) => {
          if (p && typeof p.name === "string" && p.name.toLowerCase().includes("ejemplo")) {
            p.name = "Perfil Principal";
          }
        });
        profilesStore = parsed;
        saveProfilesStore();
        renderProfileSelectors();
        switchProfile(profilesStore.activeProfileId || profilesStore.profiles[0].id, true);
        return true;
      }
    }
  } catch (err) {
    console.warn("Error cargando perfiles:", err);
  }

  const hadAuto = loadAutoSavedState();
  const initialSnapshot = captureCurrentState();
  const defaultProfile = {
    id: "prof_" + Date.now(),
    name: "Perfil Principal",
    height: initialSnapshot.inputs.height || 0,
    weight: initialSnapshot.inputs.weight || 0,
    fat: initialSnapshot.inputs.fat === "" ? null : Number(initialSnapshot.inputs.fat),
    targetPlan: {
      initialLevel: initialSnapshot.inputs.baseline || "",
      targetLevel: "",
      weeks: ""
    },
    state: hadAuto
      ? initialSnapshot
      : buildEmptyProfileState(0, 0, null),
    savedSimulations: JSON.parse(JSON.stringify(savedSimulations))
  };

  profilesStore = {
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile]
  };
  saveProfilesStore();
  renderProfileSelectors();
  switchProfile(defaultProfile.id, true);
  return true;
}

function renderProfileSelectors() {
  const headerSel = document.getElementById("activeProfileSelect");
  const modalSel = document.getElementById("profileModalSelect");
  const optionsHtml = profilesStore.profiles
    .map((p) => {
      const wLabel = p.weight > 0 ? ` (${p.weight} kg)` : "";
      return `<option value="${p.id}" ${p.id === profilesStore.activeProfileId ? "selected" : ""}>${p.name}${wLabel}</option>`;
    })
    .join("");

  if (headerSel) headerSel.innerHTML = optionsHtml;
  if (modalSel) modalSel.innerHTML = optionsHtml;
  updateHeaderProfilePill();
}

function getCurrentEstimatedBloodStatus() {
  const active = getActiveProfile();
  const baseline = parseFloat(document.getElementById("inputBaseline").value) || 0;

  if (lastResult && Array.isArray(lastResult.levels) && lastResult.levels.length > 0) {
    const finalLevel = lastResult.levels[lastResult.levels.length - 1];
    const finalWeek = lastResult.weeks[lastResult.weeks.length - 1];
    const hasDoses = lastResult.schedule && lastResult.schedule.doses && lastResult.schedule.doses.length > 0;
    if (hasDoses) {
      return {
        level: finalLevel,
        source: `Proyección PK al final del horizonte (Sem ${finalWeek.toFixed(0)})`
      };
    }
  }

  if (bloodMeasurements && bloodMeasurements.length > 0) {
    const latest = [...bloodMeasurements].sort((a, b) => b.week - a.week)[0];
    return {
      level: latest.level,
      source: `Última analítica registrada (Sem ${latest.week})`
    };
  }

  if (baseline > 0) {
    return {
      level: baseline,
      source: "Nivel basal configurado en el perfil"
    };
  }

  if (active && active.targetPlan && parseFloat(active.targetPlan.initialLevel) > 0) {
    return {
      level: parseFloat(active.targetPlan.initialLevel),
      source: "Nivel inicial ingresado en el planificador"
    };
  }

  return {
    level: null,
    source: "Sin analíticas ni nivel basal registrado aún"
  };
}

function getVitaminDClinicalClassification(ngMl) {
  if (ngMl === null || isNaN(ngMl)) return { label: "Sin medición registrada", tone: "neutral" };
  if (ngMl < 20) return { label: "Deficiencia (<20 ng/mL)", tone: "danger" };
  if (ngMl < 30) return { label: "Insuficiencia (20–29.9 ng/mL)", tone: "warning" };
  if (ngMl <= 60) return { label: "Rango Óptimo (30–60 ng/mL)", tone: "success" };
  if (ngMl <= 100) return { label: "Rango Alto (60.1–100 ng/mL)", tone: "info" };
  return { label: "Riesgo de Toxicidad (>100 ng/mL)", tone: "danger" };
}

function updateHeaderProfilePill() {
  const pill = document.getElementById("headerProfileSummary");
  if (!pill) return;
  const active = getActiveProfile();
  if (!active) {
    pill.innerText = "Sin perfil";
    return;
  }

  const bmi = calculateBMI(active.weight, active.height);
  const est = getCurrentEstimatedBloodStatus();
  const bmiTxt = bmi > 0 ? `IMC ${bmi.toFixed(1)}` : "Sin IMC";
  const levelTxt = est.level !== null ? `25(OH)D ~${est.level.toFixed(1)} ng/mL` : "Sin nivel 25(OH)D";
  pill.innerText = `${active.name} • ${bmiTxt} • ${levelTxt}`;
}

function switchProfile(profileId, skipSavePrevious = false) {
  if (!skipSavePrevious && profilesStore.activeProfileId) {
    const prev = getActiveProfile();
    if (prev) {
      prev.state = captureCurrentState();
      prev.savedSimulations = JSON.parse(JSON.stringify(savedSimulations));
    }
  }

  const target = profilesStore.profiles.find((p) => p.id === profileId);
  if (!target) return;

  profilesStore.activeProfileId = target.id;
  comparedMemoryIds.clear();
  savedSimulations = Array.isArray(target.savedSimulations)
    ? JSON.parse(JSON.stringify(target.savedSimulations))
    : [];

  saveProfilesStore();
  renderProfileSelectors();

  if (target.state) {
    applyState(target.state);
  } else {
    applyState(buildEmptyProfileState(target.weight, target.height, target.fat));
  }

  renderSavedSimulations();
  populateProfileModalFields();
}

function createNewProfile() {
  const nameEl = document.getElementById("newProfileName");
  const heightEl = document.getElementById("newProfileHeight");
  const weightEl = document.getElementById("newProfileWeight");
  const fatEl = document.getElementById("newProfileFat");

  const name = (nameEl.value || "").trim();
  if (!name) {
    alert("Ingresa un nombre para crear el nuevo perfil.");
    return;
  }

  const height = parseFloat(heightEl.value) || 0;
  const weight = parseFloat(weightEl.value) || 0;
  const rawFat = parseFloat(fatEl.value);
  const fat = !isNaN(rawFat) && rawFat > 0 ? Math.min(75, rawFat) : null;

  const newProf = {
    id: "prof_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5),
    name,
    height,
    weight,
    fat,
    targetPlan: {
      initialLevel: "",
      targetLevel: "",
      weeks: ""
    },
    state: buildEmptyProfileState(weight, height, fat),
    savedSimulations: []
  };

  profilesStore.profiles.push(newProf);
  nameEl.value = "";
  heightEl.value = "";
  weightEl.value = "";
  fatEl.value = "";

  switchProfile(newProf.id);
}

function deleteActiveProfile() {
  if (profilesStore.profiles.length <= 1) {
    alert("Debe existir al menos un perfil activo. Puedes editar su nombre y datos.");
    return;
  }
  const active = getActiveProfile();
  if (!active) return;

  profilesStore.profiles = profilesStore.profiles.filter((p) => p.id !== active.id);
  saveProfilesStore();
  switchProfile(profilesStore.profiles[0].id, true);
}

function openProfileManager(initialTab = "body") {
  const modal = document.getElementById("profileManagerModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  populateProfileModalFields();
  switchProfileTab(initialTab);
}

function closeProfileManager() {
  const modal = document.getElementById("profileManagerModal");
  if (modal) modal.classList.add("hidden");
}

function handleModalBackdropClick(event) {
  if (event.target && event.target.id === "profileManagerModal") {
    closeProfileManager();
  }
}

function switchProfileTab(tabName) {
  const tabs = ["body", "tracking", "planner"];
  tabs.forEach((t) => {
    const btn = document.getElementById("tabBtnProfile" + t.charAt(0).toUpperCase() + t.slice(1));
    const pane = document.getElementById("tabPaneProfile" + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle("active", t === tabName);
    if (pane) pane.classList.toggle("hidden", t !== tabName);
  });

  if (tabName === "body") {
    populateProfileModalFields();
  } else if (tabName === "tracking") {
    renderProfileTracking();
  } else if (tabName === "planner") {
    const active = getActiveProfile();
    if (active && active.targetPlan) {
      document.getElementById("plannerInitialLevel").value =
        active.targetPlan.initialLevel !== "" && active.targetPlan.initialLevel !== null ? active.targetPlan.initialLevel : "";
      document.getElementById("plannerTargetLevel").value =
        active.targetPlan.targetLevel !== "" && active.targetPlan.targetLevel !== null ? active.targetPlan.targetLevel : "";
      document.getElementById("plannerWeeks").value =
        active.targetPlan.weeks !== "" && active.targetPlan.weeks !== null ? active.targetPlan.weeks : "";
    }
    const hasPlannerValues =
      document.getElementById("plannerInitialLevel").value !== "" &&
      document.getElementById("plannerTargetLevel").value !== "" &&
      document.getElementById("plannerWeeks").value !== "";
    if (hasPlannerValues) {
      generateTargetPlans();
    } else {
      document.getElementById("plannerAlertsContainer").innerHTML = "";
      document.getElementById("plannerCardsContainer").innerHTML = "";
    }
  }
}

function populateProfileModalFields() {
  const active = getActiveProfile();
  if (!active) return;

  document.getElementById("editProfileName").value = active.name || "";
  document.getElementById("editProfileHeight").value = active.height > 0 ? active.height : "";
  document.getElementById("editProfileWeight").value = active.weight > 0 ? active.weight : "";
  document.getElementById("editProfileFat").value =
    active.fat !== null && active.fat !== undefined && active.fat > 0 ? active.fat : "";

  const resolvedFat = resolveEffectiveFatPercent(active.weight, active.height, active.fat);
  const bmi = calculateBMI(active.weight, active.height);
  const vols = computeAllometricVolumes(active.weight, resolvedFat.fat);

  const noteEl = document.getElementById("editProfileFatNote");
  if (noteEl) {
    if (active.weight <= 0) {
      noteEl.innerText = "Ingresa peso y altura para calcular IMC, masa magra/grasa y volumen de distribución.";
    } else if (resolvedFat.isEstimated) {
      noteEl.innerText = `Porcentaje de grasa opcional vacío: se utiliza estimación automática de ${resolvedFat.fat.toFixed(1)}%.`;
    } else {
      noteEl.innerText = `Usando porcentaje de grasa medido: ${resolvedFat.fat.toFixed(1)}%.`;
    }
  }

  const summaryEl = document.getElementById("profileCompSummary");
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="comp-stat"><span>IMC Actual</span><strong>${bmi > 0 ? bmi.toFixed(1) + " (" + getBMICategory(bmi) + ")" : "--"}</strong></div>
      <div class="comp-stat"><span>% Grasa Efectivo</span><strong>${active.weight > 0 ? resolvedFat.fat.toFixed(1) + "%" : "--"}</strong></div>
      <div class="comp-stat"><span>Masa Libre de Grasa (FFM)</span><strong>${active.weight > 0 ? vols.ffm.toFixed(1) + " kg" : "--"}</strong></div>
      <div class="comp-stat"><span>Masa Grasa (FM)</span><strong>${active.weight > 0 ? vols.fm.toFixed(1) + " kg" : "--"}</strong></div>
    `;
  }

  renderProfileBodyHistoryTable();
}

function saveActiveProfileDetails() {
  const active = getActiveProfile();
  if (!active) return;

  const newName = (document.getElementById("editProfileName").value || "").trim();
  const newHeight = parseFloat(document.getElementById("editProfileHeight").value) || 0;
  const newWeight = parseFloat(document.getElementById("editProfileWeight").value) || 0;
  const rawFat = parseFloat(document.getElementById("editProfileFat").value);
  const newFat = !isNaN(rawFat) && rawFat > 0 ? Math.min(75, rawFat) : null;

  if (newName) active.name = newName;
  active.height = newHeight;
  active.weight = newWeight;
  active.fat = newFat;

  document.getElementById("inputWeight").value = newWeight > 0 ? newWeight : "";
  document.getElementById("inputHeight").value = newHeight > 0 ? newHeight : "";
  document.getElementById("inputFat").value = newFat !== null ? newFat : "";

  syncInitialBodyPoint();
  updateIndicators();
  renderProfileSelectors();
  populateProfileModalFields();
  calculate();
}

function addProfileBodyModification() {
  const active = getActiveProfile();
  if (!active) return;

  const week = parseFloat(document.getElementById("profChangeWeek").value);
  const weight = parseFloat(document.getElementById("profChangeWeight").value);
  const rawFat = document.getElementById("profChangeFat").value;

  if (isNaN(week) || week < 0 || isNaN(weight) || weight <= 0) {
    alert("Ingresa una semana (>= 0) y un peso válido en kg.");
    return;
  }

  const { fat } = resolveEffectiveFatPercent(weight, active.height, rawFat);
  const existingIdx = bodyProfile.findIndex((p) => p.week === week);
  if (existingIdx >= 0) {
    bodyProfile[existingIdx] = { week, weight, fat };
  } else {
    bodyProfile.push({ week, weight, fat });
  }
  bodyProfile.sort((a, b) => a.week - b.week);

  const latestPoint = bodyProfile[bodyProfile.length - 1];
  active.weight = latestPoint.weight;
  if (rawFat !== "" && !isNaN(parseFloat(rawFat)) && parseFloat(rawFat) > 0) {
    active.fat = latestPoint.fat;
  }

  if (week === 0) {
    document.getElementById("inputWeight").value = weight;
    document.getElementById("inputFat").value = active.fat !== null ? active.fat : "";
  }

  document.getElementById("profChangeWeek").value = "";
  document.getElementById("profChangeWeight").value = "";
  document.getElementById("profChangeFat").value = "";

  renderBodyProfile();
  updateIndicators();
  renderProfileSelectors();
  populateProfileModalFields();
  calculate();
}

function removeProfileBodyModification(index) {
  bodyProfile.splice(index, 1);
  renderBodyProfile();
  populateProfileModalFields();
  calculate();
}

function renderProfileBodyHistoryTable() {
  const tbody = document.getElementById("profileBodyHistoryList");
  if (!tbody) return;

  if (!bodyProfile || bodyProfile.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Sin registros de composición corporal</td></tr>`;
    return;
  }

  tbody.innerHTML = bodyProfile
    .map((p, idx) => {
      const vols = computeAllometricVolumes(p.weight, p.fat);
      return `
      <tr>
        <td>Sem ${p.week}</td>
        <td>${p.weight.toFixed(1)} kg</td>
        <td>${p.fat.toFixed(1)}%</td>
        <td>${vols.ffm.toFixed(1)} / ${vols.fm.toFixed(1)} kg</td>
        <td><button type="button" class="btn-del" onclick="removeProfileBodyModification(${idx})" title="Eliminar">×</button></td>
      </tr>`;
    })
    .join("");
}

/* ==========================================================================
   11. SEGUIMIENTO SÉRICO Y RECOMENDACIONES PERSONALIZADAS
   ========================================================================== */

function renderProfileTracking() {
  const active = getActiveProfile();
  const est = getCurrentEstimatedBloodStatus();
  const cls = getVitaminDClinicalClassification(est.level);

  const bigEl = document.getElementById("trackingCurrentLevel");
  const badgeEl = document.getElementById("trackingClinicalBadge");
  const srcEl = document.getElementById("trackingCurrentSource");
  const recBox = document.getElementById("trackingRecommendationsBox");

  const profileName = active ? active.name : "Perfil";
  const currentLevelNum = est.level !== null ? est.level : 20;

  if (bigEl) {
    if (est.level !== null) {
      bigEl.innerHTML = `${profileName}, tus niveles actuales de Vitamina D en sangre deberían ser <span>${est.level.toFixed(1)} ng/mL</span>`;
    } else {
      bigEl.innerHTML = `${profileName}, aún no hay nivel basal ni analítica registrada (<span>-- ng/mL</span>)`;
    }
  }
  if (badgeEl) {
    badgeEl.innerText = cls.label;
  }
  if (srcEl) {
    srcEl.innerText = est.source;
  }

  const rawDesired = parseFloat(document.getElementById("trackingDesiredTarget").value);
  const desiredTarget = !isNaN(rawDesired) && rawDesired > 0 ? rawDesired : 50;
  const delta = desiredTarget - currentLevelNum;

  const weight = active && active.weight > 0 ? active.weight : 70;
  const height = active && active.height > 0 ? active.height : 170;
  const effFat = resolveEffectiveFatPercent(weight, height, active ? active.fat : null).fat;
  const vols = computeAllometricVolumes(weight, effFat);
  const factorScale = parseFloat(document.getElementById("inputFactorOverride").value) || 1.0;
  const effVolD3 = vols.vRelD3 * factorScale;

  const maintDailyIU = Math.round(((desiredTarget - 12) / 14.8) * 1000 * effVolD3 / 100) * 100;
  const safeMaint = Math.max(800, Math.min(5000, maintDailyIU || 2000));
  const repletion12w = delta > 0
    ? Math.round((safeMaint + (delta * effVolD3 * 95)) / 200) * 200
    : safeMaint;

  const cards = [];

  if (delta > 0) {
    cards.push({
      title: `Meta: Subir +${delta.toFixed(1)} ng/mL (hasta ${desiredTarget} ng/mL)`,
      body: `Dado el volumen de distribución relativo del perfil (x${effVolD3.toFixed(2)}), para alcanzar ${desiredTarget} ng/mL en un plazo estándar de 12 semanas se estima una pauta orientativa cercana a <b>${repletion12w.toLocaleString("es-CL")} UI/día</b> de Colecalciferol (D₃), seguida de ~<b>${safeMaint.toLocaleString("es-CL")} UI/día</b> de mantenimiento.`
    });
  } else {
    cards.push({
      title: `Meta alcanzada o superada (${currentLevelNum.toFixed(1)} vs ${desiredTarget} ng/mL)`,
      body: `El nivel estimado ya iguala o supera el objetivo de ${desiredTarget} ng/mL. Se sugiere ajustar a una dosis de mantenimiento cercana a <b>${safeMaint.toLocaleString("es-CL")} UI/día</b> y evitar cargas agresivas innecesarias.`
    });
  }

  cards.push({
    title: "Optimización de Absorción y Cofactores",
    body: `La Vitamina D₃ es liposoluble: tómala junto con la comida principal que contenga grasas saludables (mejora la absorción ~30–50%). Asegúrate de cubrir ingesta de <b>Magnesio</b> (cofactor enzimático de CYP2R1 y CYP27B1).`
  });

  if (desiredTarget >= 55 || currentLevelNum >= 55) {
    cards.push({
      title: "Prevención de Hipercalcemia: Vitamina K2 (MK-7)",
      body: `Al buscar concentraciones ≥ 55–60 ng/mL aumenta la absorción intestinal de calcio. Se recomienda acompañar con <b>Vitamina K2 (MK-7, 100–200 µg/día)</b> para activar la osteocalcina y la proteína Gla de la matriz (MGP), dirigiendo el calcio al hueso y protegiendo los vasos sanguíneos.`
    });
  } else {
    cards.push({
      title: "Control Analítico Recomendado",
      body: `Realiza un examen sérico de <b>25-hidroxivitamina D [25(OH)D]</b> tras 8 a 12 semanas de iniciar o modificar el esquema para calibrar la respuesta individual en la sección de Calibración MAP.`
    });
  }

  cards.push({
    title: "Impacto de Composición Corporal (FFM / FM)",
    body: active && active.weight > 0
      ? `Masa libre de grasa estimada: <b>${vols.ffm.toFixed(1)} kg</b> y masa grasa: <b>${vols.fm.toFixed(1)} kg</b> (${effFat.toFixed(1)}%). El colecalciferol (D₃) se secuestra más en tejido adiposo (x${vols.vRelD3.toFixed(2)}) que el Hidroferol/calcifediol (x${vols.vRel25D.toFixed(2)}).`
      : `Ingresa peso y altura en la pestaña de datos corporales para personalizar el volumen de distribución (FFM/FM) del perfil.`
  });

  if (recBox) {
    recBox.innerHTML = cards
      .map(
        (c) => `
        <div class="rec-card">
          <h4>${c.title}</h4>
          <p>${c.body}</p>
        </div>`
      )
      .join("");
  }
}

function sendTrackingTargetToPlanner() {
  const est = getCurrentEstimatedBloodStatus();
  const rawDesired = parseFloat(document.getElementById("trackingDesiredTarget").value);
  const desiredTarget = !isNaN(rawDesired) && rawDesired > 0 ? rawDesired : 50;

  if (est.level !== null) {
    document.getElementById("plannerInitialLevel").value = est.level.toFixed(1);
  }
  document.getElementById("plannerTargetLevel").value = desiredTarget;
  switchProfileTab("planner");
}

/* ==========================================================================
   12. PLANIFICADOR INVERSO POR OBJETIVO Y SEMANAS (RK4 + ALERTAS TOXICIDAD/K2)
   ========================================================================== */

function fillPlannerFromCurrent() {
  const est = getCurrentEstimatedBloodStatus();
  if (est.level === null) {
    alert("Este perfil aún no tiene un nivel basal ni analítica registrada. Ingrésalo manualmente en la casilla.");
    return;
  }
  document.getElementById("plannerInitialLevel").value = est.level.toFixed(1);
}

function solveDoseWithRK4(buildDosesFn, minDose, maxDose, totalDays, targetLevel, params, timeline) {
  let lo = minDose;
  let hi = maxDose;

  const evalAtEnd = (doseVal) => {
    const doses = buildDosesFn(doseVal);
    const traj = integrateTrajectory(totalDays, doses, params, timeline);
    return {
      endLevel: traj.levels[traj.levels.length - 1],
      peakLevel: Math.max(...traj.levels)
    };
  };

  const maxEval = evalAtEnd(hi);
  if (maxEval.endLevel < targetLevel - 0.3) {
    return {
      dose: hi,
      endLevel: maxEval.endLevel,
      peakLevel: maxEval.peakLevel,
      reachable: false
    };
  }

  for (let iter = 0; iter < 34; iter++) {
    const mid = 0.5 * (lo + hi);
    const res = evalAtEnd(mid);
    if (res.endLevel < targetLevel) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const finalRes = evalAtEnd(hi);
  return {
    dose: hi,
    endLevel: finalRes.endLevel,
    peakLevel: finalRes.peakLevel,
    reachable: true
  };
}

function generateTargetPlans() {
  const initialLevel = parseFloat(document.getElementById("plannerInitialLevel").value);
  const targetLevel = parseFloat(document.getElementById("plannerTargetLevel").value);
  const weeks = parseFloat(document.getElementById("plannerWeeks").value);

  const alertsEl = document.getElementById("plannerAlertsContainer");
  const cardsEl = document.getElementById("plannerCardsContainer");
  if (!alertsEl || !cardsEl) return;

  if (isNaN(initialLevel) || initialLevel < 0 || isNaN(targetLevel) || targetLevel <= 0 || isNaN(weeks) || weeks < 1) {
    alertsEl.innerHTML = `<div class="alert-banner alert-warning"><strong>Datos incompletos</strong>Completa el valor inicial (ng/mL), el valor objetivo (&gt; 0 ng/mL) y el plazo en semanas (&ge; 1).</div>`;
    cardsEl.innerHTML = "";
    return;
  }

  const active = getActiveProfile();
  if (active) {
    active.targetPlan = { initialLevel, targetLevel, weeks };
    saveProfilesStore();
  }

  const halfLife = parseFloat(document.getElementById("inputHalfLife").value) || 25;
  const ka = parseFloat(document.getElementById("inputKa").value) || 0.28;
  const factorScale = parseFloat(document.getElementById("inputFactorOverride").value) || 1.0;

  const totalDays = Math.round(weeks * 7);
  const params = { baseline: initialLevel, halfLife, ka, factorScale };
  const timeline = buildBodyTimeline(totalDays, 0.5);

  // 1) Plan D3 Diario
  const buildDaily = (dailyIU) => {
    const arr = [];
    for (let d = 0; d < totalDays; d++) {
      const item = { phase: "Plan Objetivo (D₃ Diaria)", type: "d3", week: d / 7, day: d, iu: dailyIU };
      item.efficiency = computeDoseEfficiency(item);
      arr.push(item);
    }
    return arr;
  };
  const solDaily = solveDoseWithRK4(buildDaily, 0, 120000, totalDays, targetLevel, params, timeline);
  const practicalDailyIU = Math.max(200, Math.round(solDaily.dose / 100) * 100);
  const trajDaily = integrateTrajectory(totalDays, buildDaily(practicalDailyIU), params, timeline);
  const endDaily = trajDaily.levels[trajDaily.levels.length - 1];
  const peakDaily = Math.max(...trajDaily.levels);

  // 2) Plan D3 Semanal (cada 7 días)
  const numWeeksInt = Math.max(1, Math.floor(weeks));
  const buildWeekly = (weeklyIU) => {
    const arr = [];
    for (let w = 0; w < numWeeksInt; w++) {
      const day = w * 7;
      if (day < totalDays) {
        const item = { phase: "Dosis Repetida (D₃)", type: "d3", week: w, day, iu: weeklyIU };
        item.efficiency = computeDoseEfficiency(item);
        arr.push(item);
      }
    }
    return arr;
  };
  const solWeekly = solveDoseWithRK4(buildWeekly, 0, 700000, totalDays, targetLevel, params, timeline);
  const practicalWeeklyIU = Math.max(1000, Math.round(solWeekly.dose / 500) * 500);
  const trajWeekly = integrateTrajectory(totalDays, buildWeekly(practicalWeeklyIU), params, timeline);
  const endWeekly = trajWeekly.levels[trajWeekly.levels.length - 1];
  const peakWeekly = Math.max(...trajWeekly.levels);

  // 3) Plan Hidroferol Quincenal (cada 14 días)
  const buildHydroBiweekly = (mgDose) => {
    const arr = [];
    const ug = mgDose * 1000;
    for (let d = 0; d < totalDays; d += 14) {
      const item = {
        phase: "Hidroferol (25-OH-D₃)",
        type: "calcifediol",
        week: d / 7,
        day: d,
        mg: mgDose,
        ug,
        iu: Math.round(ug * CALCIFEDIOL_D3_EQ_PER_UG)
      };
      item.efficiency = computeDoseEfficiency(item);
      arr.push(item);
    }
    return arr;
  };
  const solHydroBi = solveDoseWithRK4(buildHydroBiweekly, 0, 6.0, totalDays, targetLevel, params, timeline);
  const practicalHydroBiMg = Math.max(0.05, Number(solHydroBi.dose.toFixed(3)));
  const trajHydroBi = integrateTrajectory(totalDays, buildHydroBiweekly(practicalHydroBiMg), params, timeline);
  const endHydroBi = trajHydroBi.levels[trajHydroBi.levels.length - 1];
  const peakHydroBi = Math.max(...trajHydroBi.levels);

  // 4) Plan Hidroferol Mensual (cada 28 días)
  const buildHydroMonthly = (mgDose) => {
    const arr = [];
    const ug = mgDose * 1000;
    for (let d = 0; d < totalDays; d += 28) {
      const item = {
        phase: "Hidroferol (25-OH-D₃)",
        type: "calcifediol",
        week: d / 7,
        day: d,
        mg: mgDose,
        ug,
        iu: Math.round(ug * CALCIFEDIOL_D3_EQ_PER_UG)
      };
      item.efficiency = computeDoseEfficiency(item);
      arr.push(item);
    }
    return arr;
  };
  const solHydroMo = solveDoseWithRK4(buildHydroMonthly, 0, 10.0, totalDays, targetLevel, params, timeline);
  const practicalHydroMoMg = Math.max(0.1, Number(solHydroMo.dose.toFixed(3)));
  const trajHydroMo = integrateTrajectory(totalDays, buildHydroMonthly(practicalHydroMoMg), params, timeline);
  const endHydroMo = trajHydroMo.levels[trajHydroMo.levels.length - 1];
  const peakHydroMo = Math.max(...trajHydroMo.levels);

  const evalDailyRisk = () => {
    if (!solDaily.reachable || practicalDailyIU > 10000 || peakDaily > 100) return "danger";
    if (practicalDailyIU > 4000 || peakDaily > 80) return "warn";
    return "ok";
  };
  const evalWeeklyRisk = () => {
    if (!solWeekly.reachable || practicalWeeklyIU > 70000 || peakWeekly > 100) return "danger";
    if (practicalWeeklyIU > 28000 || peakWeekly > 80) return "warn";
    return "ok";
  };
  const evalHydroBiRisk = () => {
    if (!solHydroBi.reachable || practicalHydroBiMg > 0.532 || peakHydroBi > 100) return "danger";
    if (practicalHydroBiMg > 0.266 || peakHydroBi > 80) return "warn";
    return "ok";
  };
  const evalHydroMoRisk = () => {
    if (!solHydroMo.reachable || practicalHydroMoMg > 0.798 || peakHydroMo > 100) return "danger";
    if (practicalHydroMoMg > 0.532 || peakHydroMo > 80) return "warn";
    return "ok";
  };

  lastGeneratedPlans = [
    {
      id: "daily_d3",
      title: "Plan Colecalciferol (D₃) Diario",
      risk: evalDailyRisk(),
      doseMain: `${practicalDailyIU.toLocaleString("es-CL")} UI / día`,
      sub1: `Durante ${weeks} semanas (${totalDays} tomas diarias)`,
      sub2: `Nivel esperado Sem ${weeks}: ${endDaily.toFixed(1)} ng/mL (Pico: ${peakDaily.toFixed(1)} ng/mL)`,
      sub3: solDaily.reachable ? "Cinética hepática gradual y estable" : "Plazo insuficiente para D₃ diaria sin saturación",
      applyPayload: { type: "daily_d3", dailyIU: practicalDailyIU, weeks, initialLevel }
    },
    {
      id: "weekly_d3",
      title: "Plan Colecalciferol (D₃) Semanal",
      risk: evalWeeklyRisk(),
      doseMain: `${practicalWeeklyIU.toLocaleString("es-CL")} UI / semana`,
      sub1: `1 toma cada 7 días (${numWeeksInt} tomas en total)`,
      sub2: `Nivel esperado Sem ${weeks}: ${endWeekly.toFixed(1)} ng/mL (Pico: ${peakWeekly.toFixed(1)} ng/mL)`,
      sub3: `Equivalente a ~${Math.round(practicalWeeklyIU / 7).toLocaleString("es-CL")} UI/día promedio`,
      applyPayload: { type: "weekly_d3", weeklyIU: practicalWeeklyIU, count: numWeeksInt, weeks, initialLevel }
    },
    {
      id: "biweekly_hydro",
      title: "Plan Hidroferol Quincenal",
      risk: evalHydroBiRisk(),
      doseMain: `${practicalHydroBiMg.toFixed(3)} mg / 14 días`,
      sub1: `${Math.round(practicalHydroBiMg * 1000)} µg cada 2 semanas (~${(practicalHydroBiMg / 0.266).toFixed(1)} cáps. de 0.266 mg)`,
      sub2: `Nivel esperado Sem ${weeks}: ${endHydroBi.toFixed(1)} ng/mL (Pico: ${peakHydroBi.toFixed(1)} ng/mL)`,
      sub3: "Acción rápida directa (25-OH-D₃) sin paso hepático",
      applyPayload: { type: "hydro", intervalDays: 14, mg: practicalHydroBiMg, weeks, initialLevel }
    },
    {
      id: "monthly_hydro",
      title: "Plan Hidroferol Mensual",
      risk: evalHydroMoRisk(),
      doseMain: `${practicalHydroMoMg.toFixed(3)} mg / mes`,
      sub1: `${Math.round(practicalHydroMoMg * 1000)} µg cada 28 días (~${(practicalHydroMoMg / 0.266).toFixed(1)} cáps. de 0.266 mg)`,
      sub2: `Nivel esperado Sem ${weeks}: ${endHydroMo.toFixed(1)} ng/mL (Pico: ${peakHydroMo.toFixed(1)} ng/mL)`,
      sub3: `Total de ${Math.max(1, Math.ceil(totalDays / 28))} administraciones mensuales`,
      applyPayload: { type: "hydro", intervalDays: 28, mg: practicalHydroMoMg, weeks, initialLevel }
    }
  ];

  const alertBlocks = [];
  const deltaReq = targetLevel - initialLevel;

  const w = active && active.weight > 0 ? active.weight : 70;
  const h = active && active.height > 0 ? active.height : 170;
  const effF = resolveEffectiveFatPercent(w, h, active ? active.fat : null).fat;
  const effVol = computeAllometricVolumes(w, effF).vRelD3 * factorScale;
  const safeMinWeeks = deltaReq > 0
    ? Math.max(2, Math.ceil((deltaReq * effVol) / 3.8))
    : 1;

  const isTooShortOrToxic =
    !solDaily.reachable ||
    practicalDailyIU > 10000 ||
    practicalWeeklyIU > 70000 ||
    practicalHydroBiMg > 0.532 ||
    targetLevel > 100 ||
    peakDaily > 100 ||
    peakWeekly > 100 ||
    peakHydroBi > 100 ||
    peakHydroMo > 100;

  const isAboveUpperTolerable =
    !isTooShortOrToxic &&
    (practicalDailyIU > 4000 ||
      practicalWeeklyIU > 28000 ||
      practicalHydroBiMg > 0.266 ||
      targetLevel > 80);

  if (targetLevel <= initialLevel) {
    alertBlocks.push(`
      <div class="alert-banner alert-warning">
        <strong>Objetivo igual o inferior al valor inicial</strong>
        El valor objetivo (${targetLevel} ng/mL) no requiere fase de carga respecto al inicial (${initialLevel} ng/mL). Se muestran dosis mínimas de sostén; si deseas mantener estabilidad, extiende el horizonte y usa dosis bajas de mantenimiento.
      </div>
    `);
  }

  if (isTooShortOrToxic) {
    alertBlocks.push(`
      <div class="alert-banner alert-danger">
        <strong>ALERTA DE TOXICIDAD Y PLAZO DEMASIADO CORTO</strong>
        Intentar subir de <b>${initialLevel} ng/mL</b> a <b>${targetLevel} ng/mL</b> en solo <b>${weeks} semana(s)</b> exige dosis suprafisiológicas potencialmente tóxicas (superan el límite seguro de 10.000 UI/día eq. o generan picos séricos &gt; 100 ng/mL, con riesgo de intoxicación por Vitamina D).<br/>
        <b>Recomendación segura:</b> Amplía el plazo a al menos <b>${safeMinWeeks} semanas</b> para alcanzar ${targetLevel} ng/mL con dosis seguras (&le; 4.000 UI/día).
      </div>
    `);
  } else if (isAboveUpperTolerable) {
    alertBlocks.push(`
      <div class="alert-banner alert-warning">
        <strong>Aviso de Dosis Elevada (Supera el Límite Tolerable Diario de 4.000 UI)</strong>
        El plazo de <b>${weeks} semanas</b> requiere una pauta intensiva de carga (${practicalDailyIU.toLocaleString("es-CL")} UI/día eq.). Se recomienda supervisión médica y reducir a dosis de mantenimiento una vez alcanzado el objetivo.
      </div>
    `);
  }

  const hasHypercalcemiaRisk =
    targetLevel >= 55 ||
    practicalDailyIU >= 4000 ||
    practicalWeeklyIU >= 28000 ||
    practicalHydroBiMg >= 0.266 ||
    peakDaily >= 60 ||
    peakHydroBi >= 60;

  if (hasHypercalcemiaRisk) {
    alertBlocks.push(`
      <div class="alert-banner alert-k2">
        <strong>Riesgo de Hipercalcemia — Sugerencia de Vitamina K2 (MK-7)</strong>
        Dosis altas o niveles séricos elevados de 25(OH)D incrementan la absorción intestinal de calcio y pueden elevar el riesgo de <b>hipercalcemia</b> y calcificación vascular.<br/>
        <b>Sugerencia:</b> Considera suplementar <b>Vitamina K2 (Menaquinona-7 / MK-7: 100–200 µg/día)</b> junto con Magnesio y adecuada hidratación para activar las proteínas dependientes de vitamina K (osteocalcina y MGP) que fijan el calcio en la matriz ósea, además de monitorizar calcemia sérica.
      </div>
    `);
  }

  alertsEl.innerHTML = alertBlocks.join("");

  cardsEl.innerHTML = lastGeneratedPlans
    .map((p, idx) => {
      const cardClass = p.risk === "danger" ? "plan-risk" : p.risk === "warn" ? "plan-warn" : "";
      const badgeClass =
        p.risk === "danger" ? "plan-badge-danger" : p.risk === "warn" ? "plan-badge-warn" : "plan-badge-ok";
      const badgeText =
        p.risk === "danger" ? "Riesgo / Plazo corto" : p.risk === "warn" ? "Dosis alta" : "Rango seguro";

      return `
      <div class="plan-card ${cardClass}">
        <div>
          <div class="plan-header">
            <span class="plan-title">${p.title}</span>
            <span class="plan-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="plan-dose-main" style="margin:8px 0;">${p.doseMain}</div>
          <div class="plan-details">
            <span>&bull; ${p.sub1}</span>
            <span>&bull; ${p.sub2}</span>
            <span>&bull; ${p.sub3}</span>
          </div>
        </div>
        <button type="button" class="btn-primary" onclick="applyGeneratedPlan(${idx})">
          Aplicar este Plan al Simulador
        </button>
      </div>`;
    })
    .join("");
}

function applyGeneratedPlan(planIndex) {
  const plan = lastGeneratedPlans[planIndex];
  if (!plan || !plan.applyPayload) return;

  const p = plan.applyPayload;
  document.getElementById("inputBaseline").value = p.initialLevel;
  document.getElementById("inputHorizon").value = p.weeks;

  dailyPhases = [];
  customDoses = [];
  hydroferolDoses = [];
  document.getElementById("repIU").value = "";
  document.getElementById("repInterval").value = "";
  document.getElementById("repCount").value = "";
  document.getElementById("repStartWeek").value = "";

  if (p.type === "daily_d3") {
    dailyPhases.push({
      name: "Plan Objetivo (D₃ Diaria)",
      startWeek: 0,
      endWeek: p.weeks,
      dailyIU: p.dailyIU
    });
    setMode("daily");
  } else if (p.type === "weekly_d3") {
    document.getElementById("repIU").value = p.weeklyIU;
    document.getElementById("repInterval").value = 1;
    document.getElementById("repCount").value = p.count;
    document.getElementById("repStartWeek").value = 0;
    setMode("simulation");
  } else if (p.type === "hydro") {
    const totalDays = Math.round(p.weeks * 7);
    const label = p.intervalDays === 14 ? "Plan Quincenal" : "Plan Mensual";
    for (let d = 0; d < totalDays; d += p.intervalDays) {
      hydroferolDoses.push({
        day: d,
        mg: p.mg,
        note: label
      });
    }
    setMode("simulation");
  }

  renderDailyPhases();
  renderCustomDoses();
  renderHydroferolDoses();
  calculate();
  closeProfileManager();
}

/* ==========================================================================
   13. ALERTAS GLOBALES DE SEGURIDAD EN DASHBOARD PRINCIPAL
   ========================================================================== */

function renderGlobalSafetyBanner(result) {
  const banner = document.getElementById("globalSafetyBanner");
  if (!banner) return;

  if (!result || !result.levels || result.levels.length === 0) {
    banner.innerHTML = "";
    return;
  }

  const peakVal = Math.max(...result.levels);
  const totalDays = Math.max(1, (result.weeks[result.weeks.length - 1] || 0) * 7);
  const totalIU = result.schedule.doses.reduce((acc, d) => acc + d.iu, 0);
  const avgDailyIU = totalIU / totalDays;

  const alerts = [];

  if (peakVal > 100 || avgDailyIU > 10000) {
    alerts.push(`
      <div class="alert-banner alert-danger">
        <strong>Alerta de Toxicidad Potencial en Simulación Activa</strong>
        La trayectoria alcanza un pico de <b>${peakVal.toFixed(1)} ng/mL</b> (promedio ~<b>${Math.round(avgDailyIU).toLocaleString("es-CL")} UI/día eq.</b>). Concentraciones &gt; 100 ng/mL conllevan riesgo de hipervitaminosis D e intoxicación. Considera reducir la dosis o extender el intervalo entre tomas.
      </div>
    `);
  } else if (peakVal > 80 || avgDailyIU > 4000) {
    alerts.push(`
      <div class="alert-banner alert-warning">
        <strong>Dosis por encima del límite tolerable estándar (4.000 UI/día)</strong>
        Pico proyectado: <b>${peakVal.toFixed(1)} ng/mL</b> (promedio ~<b>${Math.round(avgDailyIU).toLocaleString("es-CL")} UI/día eq.</b>). Mantén seguimiento analítico periódico.
      </div>
    `);
  }

  if (peakVal >= 60 || avgDailyIU >= 4000) {
    alerts.push(`
      <div class="alert-banner alert-k2">
        <strong>Riesgo de Hipercalcemia — Sugerencia de Vitamina K2 (MK-7)</strong>
        Con niveles proyectados de <b>${peakVal.toFixed(1)} ng/mL</b> aumenta la absorción de calcio. Se sugiere acompañar con <b>Vitamina K2 (MK-7, 100–200 µg/día)</b> y Magnesio para favorecer la fijación ósea del calcio y prevenir calcificación vascular.
      </div>
    `);
  }

  banner.innerHTML = alerts.join("");
}

/* ==========================================================================
   14. GRÁFICOS CLÍNICOS (CON BANDA IC 95%), ESTADÍSTICAS Y TABLA
   ========================================================================== */

const clinicalZonesPlugin = {
  id: "clinicalZones",
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.y) return;

    const zones = [
      { min: 0, max: 20, color: "rgba(239, 68, 68, 0.12)" },
      { min: 20, max: 30, color: "rgba(245, 158, 11, 0.13)" },
      { min: 30, max: 60, color: "rgba(16, 185, 129, 0.15)" },
      { min: 60, max: 100, color: "rgba(59, 130, 246, 0.12)" },
      { min: 100, max: 250, color: "rgba(168, 85, 247, 0.12)" }
    ];

    ctx.save();
    zones.forEach((z) => {
      const yTop = scales.y.getPixelForValue(Math.min(z.max, scales.y.max));
      const yBottom = scales.y.getPixelForValue(Math.max(z.min, scales.y.min));
      if (yBottom > yTop) {
        ctx.fillStyle = z.color;
        ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBottom - yTop);
      }
    });
    ctx.restore();
  }
};

function renderCharts(result) {
  const styles = getComputedStyle(document.documentElement);
  const textColor = styles.getPropertyValue("--text-main").trim();
  const mutedColor = styles.getPropertyValue("--text-muted").trim();
  const gridColor = styles.getPropertyValue("--grid-line").trim();
  const accentColor = styles.getPropertyValue("--accent").trim();

  const bloodCtx = document.getElementById("bloodChart").getContext("2d");
  if (bloodChart) bloodChart.destroy();

  const curveData = result.weeks.map((w, idx) => ({ x: w, y: result.levels[idx] }));
  const ciHighData = result.weeks.map((w, idx) => ({ x: w, y: result.ciHigh[idx] }));
  const ciLowData = result.weeks.map((w, idx) => ({ x: w, y: result.ciLow[idx] }));
  const measuredData = bloodMeasurements.map((m) => ({ x: m.week, y: m.level }));

  const compareColors = ["#a855f7", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1"];
  const comparisonDatasets = [];
  let maxComparedY = 0;

  let colorIdx = 0;
  savedSimulations.forEach((mem) => {
    if (comparedMemoryIds.has(mem.id) && Array.isArray(mem.curve) && mem.curve.length > 0) {
      const cColor = compareColors[colorIdx % compareColors.length];
      colorIdx++;
      mem.curve.forEach((pt) => {
        if (pt.y > maxComparedY) maxComparedY = pt.y;
      });
      comparisonDatasets.push({
        label: `[Memoria] ${mem.name}`,
        data: mem.curve,
        borderColor: cColor,
        backgroundColor: cColor,
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.25
      });
    }
  });

  const maxCurve = Math.max(
    ...(result.ciHigh.length ? result.ciHigh : [0]),
    ...(bloodMeasurements.length ? bloodMeasurements.map((m) => m.level) : [0]),
    maxComparedY,
    65
  );
  const yMax = Math.min(250, Math.ceil(maxCurve / 10) * 10 + 10);
  const horizonVal = parseFloat(document.getElementById("inputHorizon").value) || 0;

  bloodChart = new Chart(bloodCtx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "IC 95% Superior",
          data: ciHighData,
          borderColor: "rgba(56, 189, 248, 0.25)",
          backgroundColor: "rgba(56, 189, 248, 0.12)",
          borderWidth: 1,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: "+1",
          tension: 0.25
        },
        {
          label: "IC 95% Inferior",
          data: ciLowData,
          borderColor: "rgba(56, 189, 248, 0.25)",
          backgroundColor: "transparent",
          borderWidth: 1,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false,
          tension: 0.25
        },
        {
          label: "25(OH)D Esperada (ng/mL)",
          data: curveData,
          borderColor: accentColor,
          backgroundColor: accentColor,
          borderWidth: 2.6,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.25
        },
        ...comparisonDatasets,
        {
          label: "Mediciones Séricas Reales",
          data: measuredData,
          type: "scatter",
          backgroundColor: "#f43f5e",
          borderColor: "#ffffff",
          borderWidth: 1.5,
          pointRadius: 5.5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: textColor,
            filter: (item) => item.text !== "IC 95% Inferior"
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const wk = ctx.parsed.x;
              const day = Math.round(wk * 7);
              return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} ng/mL (Día ${day} / Sem ${wk.toFixed(1)})`;
            }
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          ...(horizonVal <= 0 ? { max: 12 } : {}),
          title: { display: true, text: "Tiempo (Semanas)", color: mutedColor },
          ticks: { color: mutedColor },
          grid: { color: gridColor }
        },
        y: {
          min: 0,
          max: yMax,
          title: { display: true, text: "25(OH)D (ng/mL)", color: mutedColor },
          ticks: { color: mutedColor },
          grid: { color: gridColor }
        }
      }
    },
    plugins: [clinicalZonesPlugin]
  });

  const doseCtx = document.getElementById("doseChart").getContext("2d");
  if (doseChart) doseChart.destroy();

  const phaseColors = {
    "Dosis Repetida (D₃)": "#38bdf8",
    "Dosis Libre (D₃)": "#f59e0b",
    "Hidroferol (25-OH-D₃)": "#10b981"
  };

  let barItems = [];
  if (currentMode === "daily") {
    const weeklyMap = new Map();
    result.schedule.doses.forEach((d) => {
      if (d.type === "calcifediol") {
        barItems.push(d);
      } else {
        const wk = Math.floor(d.week);
        const key = `${wk}|${d.phase}`;
        if (!weeklyMap.has(key)) {
          weeklyMap.set(key, { week: wk, day: wk * 7, phase: d.phase, type: "d3", iu: 0 });
        }
        weeklyMap.get(key).iu += d.iu;
      }
    });
    barItems = [...barItems, ...Array.from(weeklyMap.values())];
  } else {
    barItems = result.schedule.doses;
  }

  const uniquePhases = [...new Set(barItems.map((d) => d.phase))];
  const fallbackPalette = ["#8b5cf6", "#ec4899", "#06b6d4", "#eab308"];

  const doseDatasets = uniquePhases.map((phaseName, idx) => {
    const color = phaseColors[phaseName] || fallbackPalette[idx % fallbackPalette.length];
    return {
      label: phaseName,
      data: barItems
        .filter((d) => d.phase === phaseName)
        .map((d) => ({
          x: d.week,
          y: d.iu,
          raw: d
        })),
      backgroundColor: color,
      borderRadius: 4,
      barThickness: 11
    };
  });

  doseChart = new Chart(doseCtx, {
    type: "bar",
    data: { datasets: doseDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: textColor } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = ctx.raw.raw;
              if (item && item.type === "calcifediol") {
                return `Hidroferol: ${item.mg.toFixed(3)} mg (${Math.round(item.ug)} µg • ~${item.iu.toLocaleString("es-CL")} UI eq.) — Día ${item.day}`;
              }
              return `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString("es-CL")} UI (Sem ${ctx.parsed.x})`;
            }
          }
        }
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: horizonVal > 0 ? horizonVal : 12,
          title: { display: true, text: "Tiempo de administración (Semanas)", color: mutedColor },
          ticks: { color: mutedColor, stepSize: 2 },
          grid: { color: gridColor }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Magnitud (UI / Eq. UI)", color: mutedColor },
          ticks: { color: mutedColor },
          grid: { color: gridColor }
        }
      }
    }
  });
}

function renderStats(result) {
  if (!result.levels || result.levels.length === 0) {
    document.getElementById("statPeak").innerText = "--";
    document.getElementById("statPeakWeek").innerText = "Semana --";

    document.getElementById("statFinal").innerText = "--";
    document.getElementById("statFinalWeek").innerText = "Fin de horizonte";

    document.getElementById("statTotalIU").innerText = "0 UI";
    document.getElementById("statAvgDaily").innerText = "Promedio diario 0 UI/día";

    document.getElementById("statWeek30").innerText = "--";
    return;
  }

  let peakIdx = 0;
  let week30 = null;

  for (let i = 0; i < result.levels.length; i++) {
    if (result.levels[i] > result.levels[peakIdx]) {
      peakIdx = i;
    }
    if (week30 === null && result.levels[i] >= 30) {
      week30 = result.weeks[i];
    }
  }

  const peakVal = result.levels[peakIdx] || 0;
  const peakWeek = result.weeks[peakIdx] || 0;
  const peakLow = result.ciLow[peakIdx] || peakVal;
  const peakHigh = result.ciHigh[peakIdx] || peakVal;

  const lastIdx = result.levels.length - 1;
  const finalVal = result.levels[lastIdx] || 0;
  const finalWeek = result.weeks[lastIdx] || 0;
  const finalLow = result.ciLow[lastIdx] || finalVal;
  const finalHigh = result.ciHigh[lastIdx] || finalVal;

  const totalIU = result.schedule.doses.reduce((acc, d) => acc + d.iu, 0);
  const totalDays = Math.max(1, finalWeek * 7);
  const avgDaily = totalIU / totalDays;

  document.getElementById("statPeak").innerText = `${peakVal.toFixed(1)} ng/mL`;
  document.getElementById("statPeakWeek").innerText = `Sem ${peakWeek.toFixed(1)} [${peakLow.toFixed(0)}–${peakHigh.toFixed(0)}]`;

  document.getElementById("statFinal").innerText = `${finalVal.toFixed(1)} ng/mL`;
  document.getElementById("statFinalWeek").innerText = `Sem ${finalWeek.toFixed(0)} [${finalLow.toFixed(0)}–${finalHigh.toFixed(0)}]`;

  document.getElementById("statTotalIU").innerText = `${totalIU.toLocaleString("es-CL")} UI`;
  document.getElementById("statAvgDaily").innerText = `~${Math.round(avgDaily).toLocaleString("es-CL")} UI/día eq.`;

  document.getElementById("statWeek30").innerText =
    week30 !== null ? `Sem ${week30.toFixed(1)} (Día ${Math.round(week30 * 7)})` : "No alcanzada";
}

function renderScheduleTable(schedule) {
  const tbody = document.getElementById("scheduleTableBody");
  if (!tbody) return;

  if (!schedule || !schedule.doses || schedule.doses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Sin dosis programadas</td></tr>`;
    return;
  }

  let rows = [];

  if (currentMode === "daily") {
    const map = new Map();
    schedule.doses.forEach((d) => {
      if (d.type === "calcifediol") {
        const effPct = Math.round((d.efficiency || 1) * 100);
        rows.push({
          daySort: d.day,
          phase: d.phase,
          moment: `Día ${d.day} (Sem ${d.week})`,
          doseText: `${d.mg.toFixed(3)} mg (${Math.round(d.ug)} µg • ef. ${effPct}%)${d.note ? " — " + d.note : ""}`
        });
      } else {
        const wk = Math.floor(d.week);
        const key = `${wk}-${d.phase}`;
        if (!map.has(key)) {
          const entry = {
            daySort: wk * 7,
            phase: d.phase,
            moment: `Semana ${wk}`,
            iu: 0
          };
          map.set(key, entry);
          rows.push(entry);
        }
        map.get(key).iu += d.iu;
      }
    });

    rows.sort((a, b) => a.daySort - b.daySort);
    tbody.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td>${r.phase}</td>
          <td>${r.moment}</td>
          <td>${r.doseText || r.iu.toLocaleString("es-CL") + " UI (sem)"}</td>
        </tr>`
      )
      .join("");
    return;
  }

  tbody.innerHTML = schedule.doses
    .map((d) => {
      const effPct = Math.round((d.efficiency || 1) * 100);
      const doseLabel =
        d.type === "calcifediol"
          ? `${d.mg.toFixed(3)} mg (${Math.round(d.ug)} µg • ef. ${effPct}%)${d.note ? " — " + d.note : ""}`
          : `${d.iu.toLocaleString("es-CL")} UI (ef. ${effPct}%)`;
      return `
      <tr>
        <td>${d.phase}</td>
        <td>Día ${Math.round(d.day)} (Sem ${d.week})</td>
        <td>${doseLabel}</td>
      </tr>`;
    })
    .join("");
}

/* ==========================================================================
   15. FLUJO PRINCIPAL E INICIALIZACIÓN AUTOMÁTICA
   ========================================================================== */

function calculate() {
  const result = runSimulation();
  lastResult = result;
  updateIndicators();
  renderCharts(result);
  renderStats(result);
  renderScheduleTable(result.schedule);
  renderGlobalSafetyBanner(result);
  updateHeaderProfilePill();
  autoSaveCurrentState();
}

/* ==========================================================================
   16. ACTUALIZACIÓN AUTOMÁTICA VÍA GITHUB RELEASES (PC + ANDROID)
   ========================================================================== */

const APP_CURRENT_VERSION = "0.3.1";
const GITHUB_REPO_SLUG = "JoTaC3/Vit-d-Project";

function compareSemver(a, b) {
  const pa = String(a || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function showAppUpdateBanner({ version, notes, isDesktop, releaseUrl }) {
  let banner = document.getElementById("appUpdateBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "appUpdateBanner";
    banner.className = "app-update-banner";
    const topbar = document.querySelector(".topbar");
    if (topbar && topbar.parentNode) {
      topbar.parentNode.insertBefore(banner, topbar.nextSibling);
    } else {
      document.body.prepend(banner);
    }
  }

  const safeNotes = notes ? ` — ${String(notes).slice(0, 110)}` : "";
  if (isDesktop) {
    banner.innerHTML = `
      <div>
        <strong>Nueva versión v${version} disponible</strong>${safeNotes}
      </div>
      <div class="app-update-actions">
        <button type="button" id="btnInstallDesktopUpdate" class="btn-primary">Actualizar y reiniciar</button>
        <button type="button" class="btn-secondary" onclick="document.getElementById('appUpdateBanner')?.remove()">Más tarde</button>
      </div>
    `;
    const btn = document.getElementById("btnInstallDesktopUpdate");
    if (btn) {
      btn.onclick = async () => {
        btn.disabled = true;
        btn.innerText = "Descargando actualización...";
        try {
          await window.__TAURI__.core.invoke("check_and_install_update", { install: true });
        } catch (err) {
          btn.disabled = false;
          btn.innerText = "Reintentar actualización";
          alert("No se pudo instalar la actualización: " + err);
        }
      };
    }
  } else {
    banner.innerHTML = `
      <div>
        <strong>Nueva versión v${version} disponible en GitHub</strong> (actual: v${APP_CURRENT_VERSION})${safeNotes}
      </div>
      <div class="app-update-actions">
        <a href="${releaseUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="text-decoration:none;">Descargar APK / Abrir Obtainium</a>
        <button type="button" class="btn-secondary" onclick="document.getElementById('appUpdateBanner')?.remove()">Cerrar</button>
      </div>
    `;
  }
}

async function checkAppUpdates() {
  const isAndroid = /Android/i.test(navigator.userAgent || "");
  const hasTauriInvoke =
    typeof window !== "undefined" &&
    window.__TAURI__ &&
    window.__TAURI__.core &&
    typeof window.__TAURI__.core.invoke === "function";

  // 1. Escritorio (Windows / macOS / Linux): verificador nativo firmado con tauri-plugin-updater
  if (!isAndroid && hasTauriInvoke) {
    try {
      const info = await window.__TAURI__.core.invoke("check_and_install_update", { install: false });
      if (info && info.available && info.version) {
        showAppUpdateBanner({
          version: info.version,
          notes: info.body,
          isDesktop: true,
          releaseUrl: ""
        });
        return;
      }
    } catch (_) {
      // Sin conexión o endpoint aún sin publicar: continuar en modo offline sin molestar
    }
  }

  // 2. Android (y respaldo web): consultar último Release publicado en GitHub
  if (GITHUB_REPO_SLUG && !GITHUB_REPO_SLUG.includes("TU_USUARIO")) {
    try {
      const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO_SLUG}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" }
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const latestTag = data && data.tag_name ? data.tag_name : "";
      if (latestTag && compareSemver(latestTag, APP_CURRENT_VERSION) > 0) {
        showAppUpdateBanner({
          version: latestTag.replace(/^v/i, ""),
          notes: data.name || "",
          isDesktop: false,
          releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO_SLUG}/releases/latest`
        });
      }
    } catch (_) {
      // Modo offline: ignorar silenciosamente
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initProfilesStore();
  setTimeout(checkAppUpdates, 2500);
});




// === CRONOBIOLOGIA NORDICA THEME CONTROLLER ===
function setAppTheme(mode) {
  const root = document.documentElement;
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  localStorage.setItem("app-theme-mode", mode);

  ["Light", "Dark", "Auto"].forEach((label) => {
    const btn = document.getElementById(`btnTheme${label}`);
    if (btn) btn.classList.toggle("active", label.toLowerCase() === mode);
  });

  const applyResolvedTheme = (resolved) => {
    root.setAttribute("data-theme", resolved);
    if (typeof Chart !== "undefined" && Chart.instances) {
      const textColor = resolved === "dark" ? "#8FA0B2" : "#52606D";
      const gridColor = resolved === "dark" ? "#26303D" : "#CFD7E0";
      const curveColor = resolved === "dark" ? "#5B9BD5" : "#255C99";

      Object.values(Chart.instances).forEach((chart) => {
        if (chart.options?.scales?.x) {
          chart.options.scales.x.ticks.color = textColor;
          chart.options.scales.x.grid.color = gridColor;
        }
        if (chart.options?.scales?.y) {
          chart.options.scales.y.ticks.color = textColor;
          chart.options.scales.y.grid.color = gridColor;
        }
        if (chart.options?.plugins?.legend?.labels) {
          chart.options.plugins.legend.labels.color = textColor;
        }
        if (chart.canvas?.id === "bloodChart" && chart.data?.datasets?.[0]) {
          chart.data.datasets[0].borderColor = curveColor;
        }
        chart.update("none");
      });
    }
  };

  if (mode === "auto") {
    applyResolvedTheme(darkQuery.matches ? "dark" : "light");
    darkQuery.onchange = (e) => {
      if (localStorage.getItem("app-theme-mode") === "auto") {
        applyResolvedTheme(e.matches ? "dark" : "light");
      }
    };
  } else {
    applyResolvedTheme(mode);
    darkQuery.onchange = null;
  }
}

window.setTheme = function (legacyTheme) {
  if (legacyTheme === "clinical") return setAppTheme("light");
  if (legacyTheme === "dark" || legacyTheme === "warm") return setAppTheme("dark");
  return setAppTheme("auto");
};

window.addEventListener("load", () => {
  const savedMode = localStorage.getItem("app-theme-mode") || "auto";
  setAppTheme(savedMode);
});