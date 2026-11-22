import {
  QUADA_MUSCLES,
  QUADA_SPLIT_LABELS,
  QUADA_ENVS,
  QUADA_LEVELS,
  loadQuadaState,
  saveQuadaState,
  computeQuadaPlan,
  formatQuadaPlainText
} from "./quadaEngine.js";

let initialized = false;
let quadaState = null;
let activeDayFilter = "all";

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

export function initQuadaModule() {
  const root = document.getElementById("quadaRoot");
  if (!root || initialized) return;
  initialized = true;
  quadaState = loadQuadaState();

  root.innerHTML = `
    <div class="quada-workbench">
      <aside class="quada-rail" aria-label="Parámetros y volumen Quada">
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
  `;

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

  // Notebook-style day ledger
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

    const table = document.createElement("table");
    table.className = "quada-ex-table";
    table.innerHTML = `
      <thead>
        <tr><th>Ejercicio</th><th>Ser×Rep</th><th>RIR</th><th>Desc</th><th>Tempo</th><th>Carga (kg)</th></tr>
      </thead>
    `;
    const tbody = document.createElement("tbody");

    d.rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <span class="quada-ex-name">${r.ssTag ? `<span class="quada-ss-badge">SS ${r.ssTag}</span>` : ""}${r.exName}</span>
          <span class="quada-ex-note">${r.muscle}${r.isFocus ? " (Foco)" : ""} · ${r.note}</span>
        </td>
        <td class="quada-mono">${r.sets}×${r.reps}</td>
        <td class="quada-mono">${r.rir}</td>
        <td class="quada-mono">${r.restSec}s</td>
        <td class="quada-mono">${r.tempo}</td>
      `;

      const loadTd = document.createElement("td");
      loadTd.className = "quada-load-cell";
      const wrap = document.createElement("div");
      wrap.className = "quada-series-wrap";

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
        wrap.appendChild(chip);
      });

      const metaRow = document.createElement("div");
      metaRow.className = "quada-load-meta";
      const badge = document.createElement("span");
      badge.className = `quada-load-tag ${r.isCustom ? "is-custom" : "is-est"}`;
      badge.textContent = r.isBodyweight ? (r.isCustom ? "fijado (+kg)" : "corp. (+kg)") : (r.isCustom ? "fijado" : "est.");
      metaRow.appendChild(badge);

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
        metaRow.appendChild(resetBtn);
      }

      loadTd.appendChild(wrap);
      loadTd.appendChild(metaRow);
      tr.appendChild(loadTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    card.appendChild(table);
    daysGrid.appendChild(card);
  });
}
