import {
  QUADA_MUSCLES,
  QUADA_SPLIT_LABELS,
  QUADA_ENVS,
  QUADA_LEVELS,
  loadQuadaState,
  saveQuadaState,
  computeQuadaPlan
} from "./quadaEngine.js";

let initialized = false;
let quadaState = null;

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

      <div class="quada-cfg-block quada-cfg-full">
        <div class="quada-cfg-label">
          <span>04 · Foco muscular prioritario (hasta 3 entre 10)</span>
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
          <span class="telemetry-label">FOCO MECÁNICO</span>
          <span class="telemetry-val" id="quadaKpiSpec">--</span>
          <span class="telemetry-sub">Estiramiento + cabezas biarticulares</span>
        </div>
      </div>
    </section>

    <section class="panel-card">
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

    <section class="panel-card">
      <div class="quada-panel-head">
        <h2>Planificador Semanal Día por Día</h2>
        <span class="hint" id="quadaPlanSummarySub">--</span>
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
  document.getElementById("quadaKpiSpec").textContent = quadaState.focus.length ? quadaState.focus.join(" · ") : "Equilibrado";
  const envLabel = QUADA_ENVS.find((e) => e.id === quadaState.env)?.label || "";
  document.getElementById("quadaPlanSummarySub").textContent = `${QUADA_SPLIT_LABELS[quadaState.days]} · ${envLabel}`;

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
    const trs = d.rows.map((r) => `
      <tr>
        <td>
          <span class="quada-ex-name">${r.ssTag ? `<span class="quada-ss-badge">SS ${r.ssTag}</span>` : ""}${r.exName}</span>
          <span class="quada-ex-note">${r.muscle}${r.isFocus ? " (Foco)" : ""} · ${r.note}</span>
        </td>
        <td class="quada-mono">${r.sets}×${r.reps}</td>
        <td class="quada-mono">${r.rir}</td>
        <td class="quada-mono">${r.restSec}s</td>
        <td class="quada-mono">${r.tempo}</td>
      </tr>
    `).join("");
    card.innerHTML = `
      <div class="quada-day-head">
        <h3>${d.title}</h3>
        <span class="quada-day-meta">${d.daySets} series · ~${d.mins} min</span>
      </div>
      <table class="quada-ex-table">
        <thead>
          <tr><th>Ejercicio</th><th>Ser×Rep</th><th>RIR</th><th>Desc</th><th>Tempo</th></tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    `;
    daysGrid.appendChild(card);
  });
}
