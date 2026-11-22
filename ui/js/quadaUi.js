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
    <section class="quada-config-deck" aria-label="Configuración rápida del microciclo Quada">
      <div class="quada-cfg-block">
        <div class="quada-cfg-label"><span>01 · Días por semana</span><span id="quadaSplitTag"></span></div>
        <div class="quada-seg-row" id="quadaDaysRow"></div>
      </div>

      <div class="quada-cfg-block">
        <div class="quada-cfg-label"><span>02 · Recursos / Entorno</span></div>
        <div class="quada-seg-row" id="quadaEnvRow"></div>
      </div>

      <div class="quada-cfg-block">
        <div class="quada-cfg-label"><span>03 · Nivel y Tiempo</span></div>
        <div class="quada-seg-row" id="quadaLevelRow"></div>
        <label class="quada-toggle-row">
          <span><strong>Superseries antagonistas</strong> (<code>-36%</code> duración)</span>
          <input type="checkbox" id="quadaSupersetToggle" />
        </label>
      </div>

      <div class="quada-cfg-block">
        <div class="quada-cfg-label"><span>04 · Referencia Corporal (kg)</span></div>
        <div class="quada-ref-row">
          <label class="quada-ref-field">
            <span>Peso corporal (kg)</span>
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

      <div class="quada-cfg-block quada-cfg-full">
        <div class="quada-cfg-label">
          <span>05 · Foco muscular prioritario (hasta 3 entre 10)</span>
          <span id="quadaFocusCount"></span>
        </div>
        <div class="quada-focus-grid" id="quadaFocusGrid"></div>
      </div>
    </section>

    <section class="telemetry-deck">
      <div class="telemetry-grid">
        <div class="telemetry-card">
          <span class="telemetry-label">VOLUMEN FRACCIONAL TOTAL</span>
          <span class="telemetry-val" id="quadaKpiVol">--</span>
          <span class="telemetry-sub">Suma semanal (1.0 directa + 0.5 sinergista)</span>
        </div>
        <div class="telemetry-card">
          <span class="telemetry-label">DURACIÓN MEDIA / SESIÓN</span>
          <span class="telemetry-val" id="quadaKpiTime">--</span>
          <span class="telemetry-sub" id="quadaKpiTimeSub">--</span>
        </div>
        <div class="telemetry-card highlight-card">
          <span class="telemetry-label">TECHO POR SESIÓN (PUOS &le; 11)</span>
          <span class="telemetry-val" id="quadaKpiPuos">--</span>
          <span class="telemetry-sub" id="quadaKpiPuosSub">--</span>
        </div>
        <div class="telemetry-card">
          <span class="telemetry-label">TONELAJE SEMANAL EST.</span>
          <span class="telemetry-val" id="quadaKpiLoad">--</span>
          <span class="telemetry-sub" id="quadaKpiSpec">--</span>
        </div>
      </div>
    </section>

    <section class="panel-card quada-vol-section">
      <div class="quada-panel-head">
        <h2>Medidor de Volumen Fraccional Semanal</h2>
        <div class="quada-legend-row">
          <span>MEV: 4</span>
          <span>Máx. Eficiencia: 5–10</span>
          <span>Óptimo: 11–18</span>
          <span>PUOS/sesión: &le; 11</span>
        </div>
      </div>
      <div class="quada-vol-grid" id="quadaVolGrid"></div>
    </section>

    <section class="panel-card quada-print-sheet">
      <div class="quada-panel-head">
        <div>
          <h2>Planificador Semanal Día por Día</h2>
          <span class="hint" id="quadaPlanSummarySub">--</span>
        </div>
        <div class="quada-export-actions">
          <button type="button" id="quadaCopyTxtBtn" class="btn-instrument btn-sm">Copiar rutina</button>
          <button type="button" id="quadaDownloadTxtBtn" class="btn-instrument btn-sm">Descargar .txt</button>
          <button type="button" id="quadaPrintBtn" class="btn-helio btn-sm">Imprimir / PDF</button>
        </div>
      </div>
      <div class="quada-days-grid" id="quadaDaysGrid"></div>
    </section>
  `;

  const daysRow = document.getElementById("quadaDaysRow");
  [1, 2, 3, 4, 5, 6].forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "quada-seg-btn";
    b.textContent = `${d}d`;
    b.addEventListener("click", () => {
      quadaState.days = d;
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
  document.getElementById("quadaFocusCount").textContent = `${quadaState.focus.length} / 3 seleccionados`;

  const plan = computeQuadaPlan(quadaState);
  document.getElementById("quadaKpiVol").textContent = `${plan.totalWeeklySets.toFixed(1)} s/sem`;
  document.getElementById("quadaKpiTime").textContent = `${plan.avgMins} min`;
  document.getElementById("quadaKpiTimeSub").textContent = quadaState.supersets ? "Superseries activas (-36%)" : "Series tradicionales";
  document.getElementById("quadaKpiPuos").textContent = `${plan.maxSessionDirect} / 11`;
  document.getElementById("quadaKpiPuosSub").textContent = plan.maxSessionDirect <= 11 ? "Dentro del techo PUOS" : "Excede techo PUOS";
  document.getElementById("quadaKpiLoad").textContent = `${Math.round(plan.totalVolumeKg).toLocaleString("es-CL")} kg`;
  document.getElementById("quadaKpiSpec").textContent = quadaState.focus.length ? `Foco: ${quadaState.focus.join(" · ")}` : "Foco equilibrado";
  const envLabel = QUADA_ENVS.find((e) => e.id === quadaState.env)?.label || "";
  document.getElementById("quadaPlanSummarySub").textContent = `${QUADA_SPLIT_LABELS[quadaState.days]} · ${envLabel} · Ref. ${quadaState.bodyWeightKg} kg`;

  const volGrid = document.getElementById("quadaVolGrid");
  volGrid.innerHTML = "";
  QUADA_MUSCLES.forEach((m) => {
    const v = plan.fracVol[m];
    const pct = Math.min(100, (v / 24) * 100);
    const cls = v >= 11 ? "opt" : v >= 5 ? "eff" : "low";
    const band = v >= 11 ? "Óptimo (11–18)" : v >= 5 ? "Máx. Eficiencia (5–10)" : v >= 4 ? "MEV (4)" : "Bajo MEV";
    const row = document.createElement("div");
    row.className = "quada-vol-row";
    row.innerHTML = `
      <div class="quada-vol-head">
        <span>${m}${quadaState.focus.includes(m) ? " ★" : ""}</span>
        <span class="quada-vol-nums">${v.toFixed(1)} s · ${band}</span>
      </div>
      <div class="quada-vol-track">
        <div class="quada-vol-zone-opt"></div>
        <div class="quada-vol-fill ${cls}" style="width:${pct}%"></div>
      </div>
    `;
    volGrid.appendChild(row);
  });

  const daysGrid = document.getElementById("quadaDaysGrid");
  daysGrid.innerHTML = "";
  plan.daysOut.forEach((d) => {
    const card = document.createElement("article");
    card.className = "quada-day-card";

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
