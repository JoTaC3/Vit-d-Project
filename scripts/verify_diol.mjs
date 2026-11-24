import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const CHECK_VERSION = process.argv.includes("--check-version");
const errors = [];

const CRITICAL_IDS = [
  "profileSelector", "openProfileModalBtn", "saveProfileBtn", "unitToggle",
  "themeToggle", "themeIcon", "themeText", "tab-simulador", "summaryProfile",
  "sex", "age", "height", "weight", "estimateBodyFatBtn", "bodyFat",
  "startDate", "simWeeks", "summaryExams", "examUnitLabel", "examWeek",
  "examValue", "examNote", "addExamBtn", "examsTableBody", "summaryAnthro",
  "anthroWeek", "anthroWeight", "anthroFat", "addAnthroBtn", "anthroTableBody",
  "summaryDoses", "doseType", "doseAmountLabel", "doseAmount", "doseHintText",
  "doseFreq", "doseStartWeek", "doseEndWeek", "addDoseBtn", "cancelDoseEditBtn",
  "clearDosesBtn", "dosesTableBody", "kpiStart", "kpiStartStatus", "kpiPeakCard",
  "kpiPeak", "kpiPeakWeek", "kpiEndCard", "kpiEndWeekNum", "kpiEnd",
  "kpiEndStatus", "gaugeTrail", "gaugeStartDot", "gaugeEndDot", "kpiDailyAvg",
  "kpiVdInfo", "safetyBanner", "toggleZonesBtn", "toggleBandBtn",
  "toggleDosesBtn", "zoomInBtn", "zoomOutBtn", "resetZoomBtn", "bloodChart",
  "inspectorStrip", "scrubberWeekLabel", "scrubberReadout", "scrubberConcVal",
  "scrubberAdipVal", "scrubberIntakeVal", "chartScrubber", "simTitleInput",
  "saveSimBtn", "adiposeChart", "intakeChart", "tab-planificador",
  "planCurrentLevel", "planTargetLevel", "planWeeks", "planMaintWeeks",
  "calculatePlanBtn", "plannerAlertBox", "plannerResultsGrid", "tab-memorias",
  "exportMemoriesBtn", "importMemoriesInput", "memoriesGrid", "tab-ciencia",
  "profileManagerModal", "profileModalTitle", "closeProfileModalBtn",
  "newProfileNameInput", "createProfileBtn", "profilesListContainer", "toastContainer"
];

const QUADA_IDS = [
  "quadaBodyWeightInput", "quadaSexSelect", "quadaCopyTxtBtn",
  "quadaDownloadTxtBtn", "quadaPrintBtn"
];

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

function checkEncoding(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    errors.push(`[BOM] ${rel(filePath)} tiene UTF-8 BOM`);
  }
  const text = buf.toString("utf8");
  const mojibake = text.match(/\uFFFD|Ã[\x80-\xBF]|Â[\x80-\xBF]|â€[\x80-\xBF]|ï¿½/);
  if (mojibake) {
    errors.push(`[MOJIBAKE] ${rel(filePath)} contiene secuencia sospechosa: ${JSON.stringify(mojibake[0])}`);
  }
  return text;
}

function checkHtmlBalance(label, html) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const tags = ["div", "section", "aside", "header", "nav", "main"];
  for (const tag of tags) {
    const openCount = (clean.match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
    const closeCount = (clean.match(new RegExp(`</${tag}\\s*>`, "gi")) || []).length;
    if (openCount !== closeCount) {
      errors.push(`[HTML] ${label}: <${tag}> desbalanceado (open=${openCount}, close=${closeCount})`);
    }
  }
}

// 1. Codificación (UTF-8 sin BOM y 0 mojibake)
const jsFiles = fs.readdirSync(path.join(ROOT, "ui/js"))
  .filter((f) => f.endsWith(".js"))
  .sort()
  .map((f) => path.join(ROOT, "ui/js", f));

const encodingTargets = [
  path.join(ROOT, "ui/index.html"),
  path.join(ROOT, "ui/styles.css"),
  ...jsFiles,
  path.join(ROOT, "PROMPT_ORQUESTADORA.md"),
  path.join(ROOT, "PROMPT_EJECUTORA.md"),
  path.join(ROOT, "BITACORA.md"),
  path.join(ROOT, "README.md")
];

const contents = new Map();
for (const file of encodingTargets) {
  if (!fs.existsSync(file)) {
    errors.push(`[MISSING] Falta archivo esperado: ${rel(file)}`);
    continue;
  }
  contents.set(rel(file), checkEncoding(file));
}

// 2. Balance HTML estricto + 3. Integridad DOM
const indexHtml = contents.get("ui/index.html") || "";
checkHtmlBalance("ui/index.html", indexHtml);

const navMatches = indexHtml.match(/<nav\s+class="tab-nav"/g) || [];
if (navMatches.length !== 1) {
  errors.push(`[DOM] Se esperaba 1 <nav class="tab-nav", encontrados: ${navMatches.length}`);
}

const presentIds = new Set([...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const missingIds = CRITICAL_IDS.filter((id) => !presentIds.has(id));
if (missingIds.length > 0) {
  errors.push(`[DOM] Faltan ${missingIds.length}/95 IDs críticos en ui/index.html: ${missingIds.join(", ")}`);
}

if (!presentIds.has("humaniaHub")) {
  errors.push("[DOM] Falta #humaniaHub en ui/index.html");
}
const quadaUiRaw = contents.get("ui/js/quadaUi.js") || "";
const quadaPresentIds = new Set([...presentIds, ...[...quadaUiRaw.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])]);
const missingQuadaIds = QUADA_IDS.filter((id) => !quadaPresentIds.has(id));
if (missingQuadaIds.length > 0) {
  errors.push(`[DOM] Faltan IDs clave de Quada (${missingQuadaIds.join(", ")}) en ui/index.html o ui/js/quadaUi.js`);
}

// Cargar CIENCIA_HTML desde ui/js/cienciaContent.js
let cienciaHtml = "";
const cienciaRaw = contents.get("ui/js/cienciaContent.js") || "";
try {
  const m = cienciaRaw.match(/export\s+const\s+CIENCIA_HTML\s*=\s*([\s\S]+?);?\s*$/);
  if (!m) throw new Error("Export CIENCIA_HTML no encontrado");
  cienciaHtml = JSON.parse(m[1]);
  if (!cienciaHtml) {
    errors.push("[CIENCIA] CIENCIA_HTML está vacío en ui/js/cienciaContent.js");
  } else {
    checkHtmlBalance("ui/js/cienciaContent.js (CIENCIA_HTML)", cienciaHtml);
  }
} catch (err) {
  errors.push(`[CIENCIA] No se pudo leer CIENCIA_HTML en ui/js/cienciaContent.js: ${err.message}`);
}

// 4. KaTeX y tipografía
const rawLatexRe = /\$\$[\s\S]*?\$\$|\$[^\s$][^$\n]*?\$/;
if (rawLatexRe.test(indexHtml)) {
  errors.push("[KATEX] Secuencia $...$ cruda detectada en ui/index.html");
}
if (rawLatexRe.test(cienciaHtml)) {
  errors.push("[KATEX] Secuencia $...$ cruda detectada en CIENCIA_HTML");
}

const boxChunks = cienciaHtml.split(/<div class="science-box">/).slice(1);
if (boxChunks.length !== 8) {
  errors.push(`[KATEX] Se esperaban 8 .science-box en CIENCIA_HTML, encontrados: ${boxChunks.length}`);
} else {
  boxChunks.forEach((chunk, idx) => {
    if (!chunk.includes('class="katex-display"')) {
      errors.push(`[KATEX] .science-box #${idx + 1} no contiene .katex-display`);
    }
  });
}

const stylesCss = contents.get("ui/styles.css") || "";
const forbiddenFonts = stylesCss.match(/\b(Inter|Roboto|Tahoma)\b/gi);
if (forbiddenFonts) {
  errors.push(`[CSS] Tipografía prohibida en ui/styles.css: ${[...new Set(forbiddenFonts)].join(", ")}`);
}

// 5. Sintaxis ESM
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ["--input-type=module", "--check"], {
      input: fs.readFileSync(file),
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString("utf8").trim() : err.message;
    errors.push(`[ESM] Error de sintaxis en ${rel(file)}: ${stderr}`);
  }
}

// 6. Identificadores intocables y ventana móvil BITACORA.md
const tauriConfRaw = fs.readFileSync(path.join(ROOT, "src-tauri/tauri.conf.json"), "utf8");
const cargoTomlRaw = fs.readFileSync(path.join(ROOT, "src-tauri/Cargo.toml"), "utf8");
const pkgRaw = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
const stateJsRaw = contents.get("ui/js/state.js") || "";

if (!/"identifier"\s*:\s*"com\.jc\.vitamindsim"/.test(tauriConfRaw)) {
  errors.push('[PROTECTED] Falta "identifier": "com.jc.vitamindsim" en src-tauri/tauri.conf.json');
}
if (!stateJsRaw.includes("vitd_sim_v7_profiles") || !stateJsRaw.includes("vitd_sim_v7_theme")) {
  errors.push("[PROTECTED] Faltan claves vitd_sim_v7_profiles / vitd_sim_v7_theme en ui/js/state.js");
}
if (!/^name\s*=\s*"app"/m.test(cargoTomlRaw) || !/^name\s*=\s*"app_lib"/m.test(cargoTomlRaw)) {
  errors.push('[PROTECTED] Faltan name = "app" / name = "app_lib" en src-tauri/Cargo.toml');
}
if (!/"name"\s*:\s*"vitd-tauri"/.test(pkgRaw)) {
  errors.push('[PROTECTED] Falta "name": "vitd-tauri" en package.json');
}

const bitacoraRaw = contents.get("BITACORA.md") || "";
const bitacoraEntries = bitacoraRaw.match(/^## Encargo/gm) || [];
if (bitacoraEntries.length > 5) {
  errors.push(`[BITACORA] Ventana móvil excedida: ${bitacoraEntries.length}/5 encabezados "^## Encargo"`);
}

// 7. Smoke tests Capa 1 (ESM en Node sin DOM)
let quadaSmoke = "fail";
let pkSmoke = "fail";
try {
  const qCode = contents.get("ui/js/quadaEngine.js") || "";
  const qMod = await import(`data:text/javascript;base64,${Buffer.from(qCode, "utf8").toString("base64")}`);
  const st = qMod.createDefaultQuadaState();
  const plan = qMod.computeQuadaPlan(st);
  const txt = qMod.formatQuadaPlainText(st, plan);
  if (!Array.isArray(plan?.daysOut) || plan.daysOut.length !== 4 || !(plan.totalVolumeKg > 0)) {
    throw new Error(`Rutina inválida (daysOut=${plan?.daysOut?.length}, vol=${plan?.totalVolumeKg})`);
  }
  if (typeof txt !== "string" || txt.trim().length === 0) {
    throw new Error("formatQuadaPlainText devolvió texto vacío");
  }
  quadaSmoke = `${plan.daysOut.length}d/${plan.totalVolumeKg}kg`;
} catch (err) {
  errors.push(`[SMOKE:QUADA] ${err.message}`);
}

try {
  const sUrl = `data:text/javascript;base64,${Buffer.from(stateJsRaw, "utf8").toString("base64")}`;
  const pkCode = (contents.get("ui/js/pkEngine.js") || "").replace("./state.js", sUrl);
  const pkMod = await import(`data:text/javascript;base64,${Buffer.from(pkCode, "utf8").toString("base64")}`);
  if (typeof pkMod.estimateBodyFatCUNBAE !== "function" || typeof pkMod.integrateTrajectory !== "function") {
    throw new Error("Faltan exports clave en pkEngine.js");
  }
  const bf = pkMod.estimateBodyFatCUNBAE("male", 30, 75, 175);
  if (!Number.isFinite(bf) || bf <= 0) {
    throw new Error(`estimateBodyFatCUNBAE inválido: ${bf}`);
  }
  pkSmoke = "ok";
} catch (err) {
  errors.push(`[SMOKE:PK] ${err.message}`);
}

// 8. --check-version (5 puntos obligatorios)
let detectedVersion = null;
if (CHECK_VERSION) {
  const pkg = JSON.parse(pkgRaw);
  const tauriConf = JSON.parse(tauriConfRaw);
  const cargoToml = cargoTomlRaw;
  const stateJs = stateJsRaw;

  const cargoMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
  const htmlVerMatch = indexHtml.match(/v(\d+\.\d+\.\d+)/);
  const stateVerMatch = stateJs.match(/APP_VERSION\s*=\s*["']v?(\d+\.\d+\.\d+)["']/) || stateJs.match(/v(\d+\.\d+\.\d+)/);

  const versions = {
    "package.json": pkg.version || null,
    "src-tauri/tauri.conf.json": tauriConf.version || null,
    "src-tauri/Cargo.toml": cargoMatch ? cargoMatch[1] : null,
    "ui/index.html": htmlVerMatch ? htmlVerMatch[1] : null,
    "ui/js/state.js": stateVerMatch ? stateVerMatch[1] : null
  };

  const unique = new Set(Object.values(versions));
  if (unique.has(null) || unique.size !== 1) {
    errors.push(`[VERSION] Desincronización de versiones: ${JSON.stringify(versions)}`);
  } else {
    detectedVersion = [...unique][0];
  }
}

if (errors.length > 0) {
  console.error(`verify_diol.mjs FALLÓ (${errors.length} errores):`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}

const summary = [
  `encoding=${encodingTargets.length}ok`,
  `ids=${CRITICAL_IDS.length}/95`,
  `quadaIds=${QUADA_IDS.length}/${QUADA_IDS.length}`,
  `nav=${navMatches.length}`,
  `scienceBox=${boxChunks.length}`,
  `esm=${jsFiles.length}ok`,
  `bitacora=${bitacoraEntries.length}/5`,
  `smoke=${quadaSmoke}+pk:${pkSmoke}`
];
if (CHECK_VERSION && detectedVersion) summary.push(`version=v${detectedVersion}`);
console.log(`verify_diol.mjs OK (${summary.join(", ")})`);
