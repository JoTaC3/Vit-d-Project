import {
  QUADA_MUSCLES,
  QUADA_SPLIT_LABELS,
  QUADA_ENVS,
  QUADA_LEVELS,
  QUADA_EXERCISES,
  loadQuadaState,
  saveQuadaState,
  computeQuadaPlan,
  formatQuadaPlainText
} from "./quadaEngine.js";

let initialized = false;
let quadaState = null;
let activeDayFilter = "all";
let activeQuadaTab = "rutina";
let atlasMuscleFilter = "Todos";
let atlasEnvFilter = "all";

function copyTextWithFallback(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function getMuscleFill(muscle, primary, syns) {
  if (muscle === primary) return "var(--q-accent)";
  if (syns.includes(muscle)) return "var(--q-accent-2)";
  return "var(--q-surface-alt)";
}

function buildAnatomicalSvg(primary, syns = []) {
  const isPost = ["Espalda", "Isquiotibiales", "Glúteos", "Pantorrillas"].includes(primary);
  const cPec = getMuscleFill("Pectoral", primary, syns);
  const cEsp = getMuscleFill("Espalda", primary, syns);
  const cDel = getMuscleFill("Deltoides", primary, syns);
  const cBic = getMuscleFill("Bíceps", primary, syns);
  const cTri = getMuscleFill("Tríceps", primary, syns);
  const cQuad = getMuscleFill("Cuádriceps", primary, syns);
  const cIsq = getMuscleFill("Isquiotibiales", primary, syns);
  const cGlu = getMuscleFill("Glúteos", primary, syns);
  const cPan = getMuscleFill("Pantorrillas", primary, syns);
  const cCore = getMuscleFill("Abdomen/Core", primary, syns);

  return `
    <svg width="78" height="104" viewBox="0 0 80 108" role="img" aria-label="Mapa anatómico ${primary}">
      <circle cx="40" cy="11" r="7" fill="var(--q-surface-alt)" stroke="var(--q-border)" stroke-width="1.4"/>
      ${isPost ? `
        <path d="M25 22 L55 22 L49 52 L31 52 Z" fill="${cEsp}" stroke="var(--q-border)" stroke-width="1.2"/>
        <ellipse cx="22" cy="26" rx="5" ry="5" fill="${cDel}" stroke="var(--q-border)" stroke-width="1"/>
        <ellipse cx="58" cy="26" rx="5" ry="5" fill="${cDel}" stroke="var(--q-border)" stroke-width="1"/>
        <rect x="16" y="31" width="6" height="18" rx="3" fill="${cTri}" stroke="var(--q-border)" stroke-width="1"/>
        <rect x="58" y="31" width="6" height="18" rx="3" fill="${cTri}" stroke="var(--q-border)" stroke-width="1"/>
        <path d="M29 52 Q40 49 51 52 L53 63 Q40 66 27 63 Z" fill="${cGlu}" stroke="var(--q-border)" stroke-width="1.2"/>
        <rect x="28" y="63" width="10" height="20" rx="4" fill="${cIsq}" stroke="var(--q-border)" stroke-width="1.1"/>
        <rect x="42" y="63" width="10" height="20" rx="4" fill="${cIsq}" stroke="var(--q-border)" stroke-width="1.1"/>
        <rect x="29" y="84" width="8" height="17" rx="3.5" fill="${cPan}" stroke="var(--q-border)" stroke-width="1.1"/>
        <rect x="43" y="84" width="8" height="17" rx="3.5" fill="${cPan}" stroke="var(--q-border)" stroke-width="1.1"/>
        <text x="40" y="106" text-anchor="middle" font-size="6.5" fill="var(--q-muted)" font-family="var(--font-mono)">POSTERIOR</text>
      ` : `
        <path d="M27 22 Q40 20 53 22 L51 35 Q40 37 29 35 Z" fill="${cPec}" stroke="var(--q-border)" stroke-width="1.2"/>
        <rect x="31" y="36" width="18" height="17" rx="3" fill="${cCore}" stroke="var(--q-border)" stroke-width="1.1"/>
        <ellipse cx="22" cy="25" rx="5" ry="5" fill="${cDel}" stroke="var(--q-border)" stroke-width="1"/>
        <ellipse cx="58" cy="25" rx="5" ry="5" fill="${cDel}" stroke="var(--q-border)" stroke-width="1"/>
        <rect x="16" y="30" width="6" height="18" rx="3" fill="${cBic}" stroke="var(--q-border)" stroke-width="1"/>
        <rect x="58" y="30" width="6" height="18" rx="3" fill="${cBic}" stroke="var(--q-border)" stroke-width="1"/>
        <rect x="28" y="55" width="10" height="25" rx="4.5" fill="${cQuad}" stroke="var(--q-border)" stroke-width="1.2"/>
        <rect x="42" y="55" width="10" height="25" rx="4.5" fill="${cQuad}" stroke="var(--q-border)" stroke-width="1.2"/>
        <rect x="30" y="82" width="7" height="18" rx="3" fill="${cPan}" stroke="var(--q-border)" stroke-width="1"/>
        <rect x="43" y="82" width="7" height="18" rx="3" fill="${cPan}" stroke="var(--q-border)" stroke-width="1"/>
        <text x="40" y="106" text-anchor="middle" font-size="6.5" fill="var(--q-muted)" font-family="var(--font-mono)">FRONTAL</text>
      `}
    </svg>
  `;
}

export function initQuadaModule() {
  const root = document.getElementById("quadaRoot");
  if (!root || initialized) return;
  initialized = true;
  quadaState = loadQuadaState();

  root.innerHTML = `
    <div class="quada-subnav-bar">
      <nav class="quada-mode-tabs" aria-label="Vistas de Quada">
        <button type="button" class="quada-mode-tab active" data-qtab="rutina">1. Rutina</button>
        <button type="button" class="quada-mode-tab" data-qtab="atlas">2. Atlas de Ejercicios</button>
      </nav>
    </div>

    <div id="quadaTabRutina" class="quada-tab-panel active">
      <button type="button" id="quadaMobileRailToggle" class="quada-mobile-rail-toggle">
        <span>Ajustar parámetros y volumen</span>
        <span id="quadaMobileRailState">Ocultar ▴</span>
      </button>

      <div class="quada-workbench">
        <aside class="quada-rail" id="quadaRail" aria-label="Parámetros y volumen Quada">
          <div class="quada-rail-group">
            <div class="quada-cfg-label"><span>01 · Días por semana</span><span id="quadaSplitTag"></span></div>
            <div class="quada-seg-row" id="quadaDaysRow"></div>
          </div>

          <div class="quada-rail-group">
            <div class="quada-cfg-label"><span>02 · Recursos / Entorno</span></div>
            <div class="quada-seg-row" id="quadaEnvRow"></div>
          </div>

          <div class="quada-rail-group">
            <div class="quada-cfg-label"><span>03 · Nivel y Tiempo</span></div>
            <div class="quada-seg-row" id="quadaLevelRow"></div>
            <label class="quada-toggle-row">
              <span><strong>Superseries antagonistas</strong> (<code>-36%</code>)</span>
              <input type="checkbox" id="quadaSupersetToggle" />
            </label>
          </div>

          <div class="quada-rail-group">
            <div class="quada-cfg-label"><span>04 · Referencia Corporal (kg)</span></div>
            <div class="quada-ref-row">
              <label class="quada-ref-field">
                <span>Peso (kg)</span>
                <input type="number" id="quadaBodyWeightInput" min="35" max="250" step="0.5" inputmode="decimal" />
              </label>
              <label class="quada-ref-field">
                <span>Sexo</span>
                <select id="quadaSexSelect">
                  <option value="male">Hombre</option>
                  <option value="female">Mujer</option>
                </select>
              </label>
            </div>
          </div>

          <div class="quada-rail-group">
            <div class="quada-cfg-label">
              <span>05 · Foco Muscular (máx. 3/10)</span>
              <span id="quadaFocusCount"></span>
            </div>
            <div class="quada-focus-grid" id="quadaFocusGrid"></div>
          </div>

          <div class="quada-rail-group quada-vol-section">
            <div class="quada-cfg-label">
              <span>Volumen Fraccional Semanal</span>
              <span>Okabe–Ito</span>
            </div>
            <div class="quada-legend-row">
              <span class="oi-dot oi-low">&lt;4</span>
              <span class="oi-dot oi-eff">4–10</span>
              <span class="oi-dot oi-opt">11–18</span>
              <span class="oi-dot oi-over">&gt;18 / PUOS</span>
            </div>
            <div class="quada-vol-grid" id="quadaVolGrid"></div>
          </div>
        </aside>

        <section class="quada-ledger quada-print-sheet" aria-label="Bitácora semanal y cargas">
          <header class="quada-ledger-head">
            <div class="quada-ledger-title-block">
              <span class="quada-eyebrow" id="quadaPlanSummarySub">--</span>
              <h2 class="quada-split-heading" id="quadaSplitHeading">4d Upper/Lower</h2>
              <div class="quada-inline-metrics">
                <div class="quada-metric-inline">
                  <span class="quada-m-lbl">Volumen</span>
                  <strong class="quada-m-val" id="quadaKpiVol">--</strong>
                </div>
                <div class="quada-metric-inline">
                  <span class="quada-m-lbl">Sesión</span>
                  <strong class="quada-m-val" id="quadaKpiTime">--</strong>
                </div>
                <div class="quada-metric-inline">
                  <span class="quada-m-lbl">Tonelaje est.</span>
                  <strong class="quada-m-val" id="quadaKpiLoad">--</strong>
                </div>
                <div class="quada-metric-inline">
                  <span class="quada-m-lbl">PUOS &le; 11</span>
                  <strong class="quada-m-val" id="quadaKpiPuos">--</strong>
                </div>
              </div>
            </div>

            <div class="quada-export-actions">
              <button type="button" id="quadaCopyTxtBtn" class="quada-btn-sec">Copiar rutina</button>
              <button type="button" id="quadaDownloadTxtBtn" class="quada-btn-sec">Descargar .txt</button>
              <button type="button" id="quadaPrintBtn" class="quada-btn-pri">Imprimir / PDF</button>
            </div>
          </header>

          <nav class="quada-day-tabs" id="quadaDayTabs" aria-label="Filtrar por día"></nav>
          <div class="quada-days-list" id="quadaDaysGrid"></div>
        </section>
      </div>
    </div>

    <div id="quadaTabAtlas" class="quada-tab-panel">
      <div class="quada-atlas-filters">
        <div class="quada-atlas-filter-row" id="quadaAtlasMuscleRow"></div>
        <div class="quada-atlas-filter-row" id="quadaAtlasEnvRow"></div>
      </div>
      <div class="quada-atlas-grid" id="quadaAtlasGrid"></div>
    </div>
  `;

  root.querySelectorAll(".quada-mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeQuadaTab = btn.dataset.qtab;
      root.querySelectorAll(".quada-mode-tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.getElementById("quadaTabRutina").classList.toggle("active", activeQuadaTab === "rutina");
      document.getElementById("quadaTabAtlas").classList.toggle("active", activeQuadaTab === "atlas");
      if (activeQuadaTab === "atlas") renderQuadaAtlas();
    });
  });

  const railToggleBtn = document.getElementById("quadaMobileRailToggle");
  railToggleBtn.addEventListener("click", () => {
    const rail = document.getElementById("quadaRail");
    const isCollapsed = rail.classList.toggle("is-collapsed-mobile");
    document.getElementById("quadaMobileRailState").textContent = isCollapsed ? "Mostrar ▾" : "Ocultar ▴";
  });

  const daysRow = document.getElementById("quadaDaysRow");
  [1, 2, 3, 4, 5, 6].forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quada-seg-btn";
    b.textContent = `${d}d`;
    b.addEventListener("click", () => {
      quadaState.days = d;
      if (activeDayFilter !== "all" && Number(activeDayFilter) >= d) activeDayFilter = "all";
      saveQuadaState(quadaState);
      renderQuada();
    });
    daysRow.appendChild(b);
  });

  const envRow = document.getElementById("quadaEnvRow");
  QUADA_ENVS.forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quada-seg-btn";
    b.textContent = e.label;
    b.addEventListener("click", () => {
      quadaState.env = e.id;
      saveQuadaState(quadaState);
      renderQuada();
    });
    envRow.appendChild(b);
  });

  const levelRow = document.getElementById("quadaLevelRow");
  QUADA_LEVELS.forEach((lv) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quada-seg-btn";
    b.textContent = lv.label;
    b.addEventListener("click", () => {
      quadaState.level = lv.id;
      saveQuadaState(quadaState);
      renderQuada();
    });
    levelRow.appendChild(b);
  });

  const focusGrid = document.getElementById("quadaFocusGrid");
  QUADA_MUSCLES.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quada-focus-chip";
    b.textContent = m;
    b.addEventListener("click", () => {
      if (quadaState.focus.includes(m)) {
        quadaState.focus = quadaState.focus.filter((x) => x !== m);
      } else if (quadaState.focus.length < 3) {
        quadaState.focus.push(m);
      }
      saveQuadaState(quadaState);
      renderQuada();
    });
    focusGrid.appendChild(b);
  });

  const ssToggle = document.getElementById("quadaSupersetToggle");
  ssToggle.checked = quadaState.supersets;
  ssToggle.addEventListener("change", (e) => {
    quadaState.supersets = e.target.checked;
    saveQuadaState(quadaState);
    renderQuada();
  });

  const bwInput = document.getElementById("quadaBodyWeightInput");
  bwInput.value = String(quadaState.bodyWeightKg);
  bwInput.addEventListener("change", () => {
    const val = parseFloat(bwInput.value);
    quadaState.bodyWeightKg = Number.isFinite(val) ? Math.max(35, Math.min(250, Math.round(val * 2) / 2)) : 75;
    bwInput.value = String(quadaState.bodyWeightKg);
    saveQuadaState(quadaState);
    renderQuada();
  });

  const sexSelect = document.getElementById("quadaSexSelect");
  sexSelect.value = quadaState.sex;
  sexSelect.addEventListener("change", () => {
    quadaState.sex = sexSelect.value === "female" ? "female" : "male";
    saveQuadaState(quadaState);
    renderQuada();
  });

  const copyBtn = document.getElementById("quadaCopyTxtBtn");
  copyBtn.addEventListener("click", async () => {
    const plan = computeQuadaPlan(quadaState);
    const txt = formatQuadaPlainText(quadaState, plan);
    await copyTextWithFallback(txt);
    const prev = copyBtn.textContent;
    copyBtn.textContent = "¡Copiado!";
    setTimeout(() => { copyBtn.textContent = prev; }, 1800);
  });

  document.getElementById("quadaDownloadTxtBtn").addEventListener("click", () => {
    const plan = computeQuadaPlan(quadaState);
    const txt = formatQuadaPlainText(quadaState, plan);
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quada_rutina_${quadaState.days}d.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById("quadaPrintBtn").addEventListener("click", () => {
    window.print();
  });

  renderQuada();
}

function renderQuada() {
  document.querySelectorAll("#quadaDaysRow .quada-seg-btn").forEach((b, i) => b.classList.toggle("active", i + 1 === quadaState.days));
  document.querySelectorAll("#quadaEnvRow .quada-seg-btn").forEach((b, i) => b.classList.toggle("active", QUADA_ENVS[i].id === quadaState.env));
  document.querySelectorAll("#quadaLevelRow .quada-seg-btn").forEach((b, i) => b.classList.toggle("active", QUADA_LEVELS[i].id === quadaState.level));
  document.querySelectorAll("#quadaFocusGrid .quada-focus-chip").forEach((b) => b.classList.toggle("active", quadaState.focus.includes(b.textContent)));

  document.getElementById("quadaSplitTag").textContent = QUADA_SPLIT_LABELS[quadaState.days];
  document.getElementById("quadaFocusCount").textContent = `${quadaState.focus.length}/3`;

  const plan = computeQuadaPlan(quadaState);
  const envLabel = QUADA_ENVS.find((e) => e.id === quadaState.env)?.label || "";
  const focusTxt = quadaState.focus.length ? `Foco: ${quadaState.focus.join(", ")}` : "Equilibrado";

  document.getElementById("quadaSplitHeading").textContent = QUADA_SPLIT_LABELS[quadaState.days];
  document.getElementById("quadaPlanSummarySub").textContent = `${envLabel} · Ref. ${quadaState.bodyWeightKg} kg · ${focusTxt}`;
  document.getElementById("quadaKpiVol").textContent = `${plan.totalWeeklySets.toFixed(1)} s/sem`;
  document.getElementById("quadaKpiTime").textContent = `~${plan.avgMins} min${quadaState.supersets ? " (SS)" : ""}`;
  document.getElementById("quadaKpiLoad").textContent = `${Math.round(plan.totalVolumeKg).toLocaleString("es-CL")} kg`;
  document.getElementById("quadaKpiPuos").textContent = `${plan.maxSessionDirect}/11 ${plan.maxSessionDirect <= 11 ? "OK" : "ALTO"}`;

  // Okabe-Ito colorblind-safe fractional volume bars
  const volGrid = document.getElementById("quadaVolGrid");
  volGrid.innerHTML = "";
  QUADA_MUSCLES.forEach((m) => {
    const v = plan.fracVol[m];
    const pct = Math.min(100, (v / 24) * 100);
    const cls = (v > 18 || plan.maxSessionDirect > 11) ? "oi-over" : v >= 11 ? "oi-opt" : v >= 4 ? "oi-eff" : "oi-low";
    const row = document.createElement("div");
    row.className = "quada-vol-row";
    row.innerHTML = `
      <div class="quada-vol-head">
        <span>${m}${quadaState.focus.includes(m) ? " ★" : ""}</span>
        <span class="quada-vol-nums">${v.toFixed(1)} s</span>
      </div>
      <div class="quada-vol-track">
        <div class="quada-vol-zone-opt"></div>
        <div class="quada-vol-fill ${cls}" style="width:${pct}%"></div>
      </div>
    `;
    volGrid.appendChild(row);
  });

  // Day filter tabs
  const tabsEl = document.getElementById("quadaDayTabs");
  tabsEl.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `quada-day-tab ${activeDayFilter === "all" ? "active" : ""}`;
  allBtn.textContent = `Todos (${plan.daysOut.length})`;
  allBtn.addEventListener("click", () => {
    activeDayFilter = "all";
    renderQuada();
  });
  tabsEl.appendChild(allBtn);

  plan.daysOut.forEach((_, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `quada-day-tab ${activeDayFilter === String(idx) ? "active" : ""}`;
    btn.textContent = `Día ${idx + 1}`;
    btn.addEventListener("click", () => {
      activeDayFilter = String(idx);
      renderQuada();
    });
    tabsEl.appendChild(btn);
  });

  // Scannable exercise cards per day
  const daysGrid = document.getElementById("quadaDaysGrid");
  daysGrid.innerHTML = "";
  plan.daysOut.forEach((d, dIdx) => {
    const isHiddenOnScreen = activeDayFilter !== "all" && activeDayFilter !== String(dIdx);
    const card = document.createElement("article");
    card.className = `quada-day-sheet${isHiddenOnScreen ? " quada-day-filtered-out" : ""}`;

    const head = document.createElement("div");
    head.className = "quada-day-head";
    head.innerHTML = `
      <h3>${d.title}</h3>
      <span class="quada-day-meta">${d.daySets} series · ~${d.mins} min · ${Math.round(d.dayVolumeKg).toLocaleString("es-CL")} kg</span>
    `;
    card.appendChild(head);

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "quada-ex-cards";

    d.rows.forEach((r, rIdx) => {
      const exCard = document.createElement("div");
      exCard.className = "quada-ex-card";

      const exObj = (QUADA_EXERCISES[r.muscle]?.[quadaState.env] || []).find((x) => x.name === r.exName);
      const syns = exObj?.syn || [];
      const synHtml = syns.length
        ? `<span class="quada-syn-list">Sinergistas: ${syns.map((s) => `<span class="quada-syn-pill">${s}</span>`).join("")}</span>`
        : `<span class="quada-syn-list">Aislamiento directo</span>`;

      exCard.innerHTML = `
        <div class="quada-ex-card-top">
          <div class="quada-ex-title-group">
            <span class="quada-ex-num">${String(rIdx + 1).padStart(2, "0")}</span>
            <span class="quada-ex-name">${r.ssTag ? `<span class="quada-ss-badge">SS ${r.ssTag}</span>` : ""}${r.exName}</span>
          </div>
          <span class="quada-ex-muscle-pill">${r.muscle}${r.isFocus ? " ★" : ""}</span>
        </div>
        <div class="quada-rx-bar">
          <span class="quada-rx-chip"><strong>${r.sets}×${r.reps}</strong></span>
          <span class="quada-rx-chip">RIR <strong>${r.rir}</strong></span>
          <span class="quada-rx-chip">Desc <strong>${r.restSec}s</strong></span>
          <span class="quada-rx-chip">Tempo <strong>${r.tempo}</strong></span>
        </div>
      `;

      const loadRow = document.createElement("div");
      loadRow.className = "quada-series-wrap";

      r.seriesKg.forEach((kg, sIdx) => {
        const chip = document.createElement("label");
        chip.className = `quada-set-chip ${r.isCustom ? "is-custom" : "is-est"}`;
        chip.title = r.isBodyweight
          ? `Serie ${sIdx + 1}: lastre extra en kg (0 = peso corporal)`
          : `Serie ${sIdx + 1} (${r.isCustom ? "fijado" : "est."})`;

        const tag = document.createElement("span");
        tag.textContent = `S${sIdx + 1}`;
        const inp = document.createElement("input");
        inp.type = "number";
        inp.min = "0";
        inp.max = "500";
        inp.step = "0.5";
        inp.inputMode = "decimal";
        inp.value = String(kg);
        inp.setAttribute("aria-label", `${r.exName} serie ${sIdx + 1} kg`);
        inp.addEventListener("change", () => {
          const val = parseFloat(inp.value);
          const clean = Number.isFinite(val) && val >= 0 ? Math.min(500, val) : r.estimatedSets[sIdx];
          const baseArr = Array.isArray(quadaState.customWeights[r.rowKey])
            ? [...quadaState.customWeights[r.rowKey]]
            : [...r.estimatedSets];
          while (baseArr.length < r.sets) baseArr.push(r.estimatedSets[baseArr.length] ?? 0);
          baseArr[sIdx] = clean;
          quadaState.customWeights[r.rowKey] = baseArr;
          saveQuadaState(quadaState);
          renderQuada();
        });

        chip.appendChild(tag);
        chip.appendChild(inp);
        loadRow.appendChild(chip);
      });

      const badge = document.createElement("span");
      badge.className = `quada-load-tag ${r.isCustom ? "is-custom" : "is-est"}`;
      badge.textContent = r.isBodyweight ? (r.isCustom ? "fijado (+kg)" : "corp. (+kg)") : (r.isCustom ? "fijado" : "est.");
      loadRow.appendChild(badge);

      if (r.isCustom) {
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "quada-reset-btn";
        resetBtn.title = "Restaurar estimación automática";
        resetBtn.textContent = "↺";
        resetBtn.addEventListener("click", () => {
          delete quadaState.customWeights[r.rowKey];
          saveQuadaState(quadaState);
          renderQuada();
        });
        loadRow.appendChild(resetBtn);
      }

      const foot = document.createElement("div");
      foot.className = "quada-ex-card-foot";
      foot.innerHTML = `<span class="quada-ex-note">${r.note}</span>${synHtml}`;

      exCard.appendChild(loadRow);
      exCard.appendChild(foot);
      cardsWrap.appendChild(exCard);
    });

    card.appendChild(cardsWrap);
    daysGrid.appendChild(card);
  });
}

function renderQuadaAtlas() {
  const mRow = document.getElementById("quadaAtlasMuscleRow");
  const eRow = document.getElementById("quadaAtlasEnvRow");
  const grid = document.getElementById("quadaAtlasGrid");
  if (!mRow || !eRow || !grid) return;

  mRow.innerHTML = `<strong class="quada-atlas-filter-lbl">Músculo:</strong>`;
  ["Todos", ...QUADA_MUSCLES].forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `quada-atlas-chip${atlasMuscleFilter === m ? " active" : ""}`;
    b.textContent = m;
    b.addEventListener("click", () => {
      atlasMuscleFilter = m;
      renderQuadaAtlas();
    });
    mRow.appendChild(b);
  });

  eRow.innerHTML = `<strong class="quada-atlas-filter-lbl">Entorno:</strong>`;
  [{ id: "all", label: "Todos" }, ...QUADA_ENVS].forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `quada-atlas-chip${atlasEnvFilter === e.id ? " active" : ""}`;
    b.textContent = e.label;
    b.addEventListener("click", () => {
      atlasEnvFilter = e.id;
      renderQuadaAtlas();
    });
    eRow.appendChild(b);
  });

  const legend = document.createElement("div");
  legend.className = "quada-atlas-legend";
  legend.innerHTML = `
    <span><span class="quada-dot-pri"></span>Primario</span>
    <span><span class="quada-dot-syn"></span>Sinergista</span>
  `;
  eRow.appendChild(legend);

  grid.innerHTML = "";
  QUADA_MUSCLES.forEach((m) => {
    if (atlasMuscleFilter !== "Todos" && atlasMuscleFilter !== m) return;
    QUADA_ENVS.forEach((e) => {
      if (atlasEnvFilter !== "all" && atlasEnvFilter !== e.id) return;
      (QUADA_EXERCISES[m]?.[e.id] || []).forEach((ex) => {
        const card = document.createElement("article");
        card.className = "quada-atlas-card";
        const synBadges = (ex.syn || []).map((s) => `<span class="quada-badge-syn">+ ${s}</span>`).join("");
        card.innerHTML = `
          <div class="quada-atlas-svg-box">${buildAnatomicalSvg(m, ex.syn || [])}</div>
          <div class="quada-atlas-info">
            <h3>${ex.name}</h3>
            <div class="quada-atlas-env">${e.label}</div>
            <div class="quada-atlas-badges">
              <span class="quada-badge-pri">${m}</span>
              ${synBadges}
            </div>
            <div class="quada-atlas-meta">${ex.reps} reps · RIR ${ex.rir} · Desc ${ex.rest}s · Tempo ${ex.tempo}</div>
            <p class="quada-atlas-note">${ex.note}</p>
          </div>
        `;
        grid.appendChild(card);
      });
    });
  });
}
