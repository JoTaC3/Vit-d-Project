/**
 * Motor Farmacocinético PopPK (V6) Compartimental ODE (RK4) y Planificador Inverso
 */

import { store, getInitialBaselineNg } from "./state.js";

// Constantes PopPK validadas (V6)
// Referencia corporal: 70 kg, 20% grasa -> FFM_ref = 56 kg, FM_ref = 14 kg
const REF_FFM_KG = 56;
const REF_FM_KG = 14;

// Colecalciferol (D3)
const PK_D3_ALPHA = 0.00041;
const PK_D3_KA = 0.28;
const PK_D3_D50_IU = 180000;
const PK_D3_HILL = 0.85;
const THETA_FFM_D3 = 0.40;
const THETA_FM_D3 = 0.60;

// Calcifediol (Hidroferol, 25(OH)D3)
const PK_25D_ALPHA = 0.068;
const PK_25D_KA = 1.40;
const PK_25D_D50_MG = 2.50;
const THETA_FFM_25D = 0.78;
const THETA_FM_25D = 0.22;

// Aclaramiento y retroalimentación CYP24A1
const BASE_HALF_LIFE_DAYS = 25.0;
const PK_KE_BASE = Math.LN2 / BASE_HALF_LIFE_DAYS;
const CYP24A1_THRESHOLD = 30.0;
const CYP24A1_EMAX = 0.35;
const CYP24A1_EC50 = 50.0;

export function computeAllometricVolumes(weightKg, bodyFatPct) {
  const fatMass = weightKg * (bodyFatPct / 100);
  const leanMass = Math.max(25, weightKg - fatMass);
  const ffmRatio = Math.pow(leanMass / REF_FFM_KG, 0.75);
  const fmRatio = fatMass / REF_FM_KG;

  const vRelD3 = Math.max(0.55, THETA_FFM_D3 * ffmRatio + THETA_FM_D3 * fmRatio);
  const vRel25D = Math.max(0.65, THETA_FFM_25D * ffmRatio + THETA_FM_25D * fmRatio);

  return { vRelD3, vRel25D, leanMass, fatMass, ffmRatio, fmRatio };
}

export function computePhysiologicalParameters(profile, weight, bodyFatPct) {
  const hMeters = (profile.height || 175) / 100;
  const bmi = weight / (hMeters * hMeters);
  const { vRelD3, vRel25D, leanMass, fatMass, fmRatio } = computeAllometricVolumes(weight, bodyFatPct);
  const effectiveVolume = 13.8 * vRelD3;

  return {
    vRelD3,
    vRel25D,
    effectiveVolume,
    bmi,
    leanMass,
    fatMass,
    fmRatio
  };
}

export function computeDoseEfficiency(dose) {
  if (dose.type === "calcifediol") {
    const ug = dose.ug ?? dose.amount ?? 266;
    const mg = ug / 1000;
    return 1 / (1 + Math.pow(mg / PK_25D_D50_MG, PK_D3_HILL));
  }
  const iu = dose.iu ?? dose.amount ?? 2000;
  return 1 / (1 + Math.pow(iu / PK_D3_D50_IU, PK_D3_HILL));
}

export function expandDosesToTimeline(doses, totalDays) {
  const events = [];
  doses.forEach((d) => {
    const startDay = Math.max(0, Math.round(d.startWeek * 7));
    const endDay = Math.min(totalDays, Math.round(d.endWeek * 7));
    const isCalci = d.type === "calcifediol";

    let ug = 266;
    let iu = 2000;
    if (isCalci) {
      ug = d.amount ?? d.ug ?? (d.iu != null && d.iu > 1000 ? Math.round(d.iu / 60) : 266);
      iu = Math.round(ug * 60);
    } else {
      iu = d.amount ?? d.iu ?? 2000;
      ug = Math.round(iu / 40);
    }

    const eff = computeDoseEfficiency({ type: d.type, iu, ug });

    if (d.freq === "single") {
      if (startDay <= totalDays) {
        events.push({ day: startDay, type: d.type, iu, ug, efficiency: eff });
      }
      return;
    }

    const stepDays =
      d.freq === "daily" ? 1 :
      d.freq === "weekly" ? 7 :
      d.freq === "biweekly" ? 14 : 30;

    for (let day = startDay; day < endDay; day += stepDays) {
      events.push({ day, type: d.type, iu, ug, efficiency: eff });
    }
  });
  return events;
}

export function buildBodyTimeline(totalDays, weightScale = 1.0) {
  const baseWeight = store.appState.bodyProfile.weight * weightScale;
  const baseFat = store.appState.bodyProfile.bodyFat;

  const sortedLogs = [...store.appState.anthropometryLogs]
    .map((l) => ({
      day: l.week * 7,
      weight: l.weight * weightScale,
      bodyFat: l.bodyFat
    }))
    .sort((a, b) => a.day - b.day);

  const points = [{ day: 0, weight: baseWeight, bodyFat: baseFat }];
  sortedLogs.forEach((l) => {
    if (l.day > 0) points.push(l);
  });

  const timeline = new Array(totalDays + 2);
  let idx = 0;

  for (let d = 0; d <= totalDays + 1; d++) {
    while (idx < points.length - 1 && points[idx + 1].day <= d) {
      idx++;
    }
    const p0 = points[idx];
    const p1 = points[Math.min(idx + 1, points.length - 1)];

    let w = p0.weight;
    let f = p0.bodyFat;

    if (p1.day > p0.day && d > p0.day) {
      const alpha = Math.min(1, (d - p0.day) / (p1.day - p0.day));
      w = p0.weight + alpha * (p1.weight - p0.weight);
      f = p0.bodyFat + alpha * (p1.bodyFat - p0.bodyFat);
    }

    timeline[d] = computePhysiologicalParameters(store.appState.bodyProfile, w, f);
  }
  return timeline;
}

function keEff(conc) {
  const excess = Math.max(0, conc - CYP24A1_THRESHOLD);
  return PK_KE_BASE * (1 + (CYP24A1_EMAX * excess) / (CYP24A1_EC50 + excess));
}

export function integrateTrajectory(totalDays, doseEvents, opts, bodyTimeline) {
  const dt = 0.25;
  const dtHalf = 0.5 * dt;
  const dtSixth = dt / 6;
  const invD3Alpha1000 = 1 / (PK_D3_ALPHA * 1000);
  const steps = Math.round(totalDays / dt);
  const baseline = opts.baseline;
  const endOnly = Boolean(opts && opts.endOnly);

  const dayGutD3Add = new Float64Array(totalDays + 1);
  const dayGut25DAdd = new Float64Array(totalDays + 1);
  const dayEquivIU = endOnly ? null : new Float64Array(totalDays + 1);

  for (let i = 0; i < doseEvents.length; i++) {
    const ev = doseEvents[i];
    const d = ev.day;
    if (d >= 0 && d <= totalDays) {
      if (ev.type === "d3") {
        dayGutD3Add[d] += ev.iu * ev.efficiency * PK_D3_ALPHA;
        if (!endOnly) dayEquivIU[d] += ev.iu * ev.efficiency;
      } else {
        dayGut25DAdd[d] += ev.ug * ev.efficiency * PK_25D_ALPHA;
        if (!endOnly) dayEquivIU[d] += ev.iu || ev.ug * 60;
      }
    }
  }

  let gutD3 = 0;
  let gut25D = 0;
  let poolD3 = 0;
  let pool25D = 0;

  const weeks = endOnly ? null : [];
  const levels = endOnly ? null : [];
  const adiposeReserve = endOnly ? null : [];
  const freeD3 = endOnly ? null : [];
  const dailyEquivIU = endOnly ? null : [];
  const tlLen = bodyTimeline.length;

  for (let s = 0; s <= steps; s++) {
    const tDays = s * dt;
    const dayInt = Math.floor(tDays);
    const p0 = bodyTimeline[dayInt < tlLen ? dayInt : tlLen - 1];
    const p1 = bodyTimeline[dayInt + 1 < tlLen ? dayInt + 1 : tlLen - 1];

    if (s % 4 === 0) {
      if (dayInt <= totalDays) {
        gutD3 += dayGutD3Add[dayInt];
        gut25D += dayGut25DAdd[dayInt];
      }

      if (!endOnly) {
        const conc = Math.max(1, baseline + poolD3 / p0.vRelD3 + pool25D / p0.vRel25D);
        const adipShare = Math.min(1, Math.max(0, (THETA_FM_D3 * p0.fmRatio) / p0.vRelD3));
        const poolD3kUI = poolD3 * invD3Alpha1000;
        const gutD3kUI = gutD3 * invD3Alpha1000;

        weeks.push(Math.round((tDays / 7) * 100) / 100);
        levels.push(conc);
        adiposeReserve.push(Math.max(0, poolD3kUI * adipShare));
        freeD3.push(Math.max(0, gutD3kUI + poolD3kUI * (1 - adipShare)));
        dailyEquivIU.push(dayInt <= totalDays ? Math.round(dayEquivIU[dayInt]) : 0);
      }
    }

    if (s === steps) break;

    const frac0 = tDays - dayInt;
    const fracMid = frac0 + dtHalf;
    const frac1 = frac0 + dt;

    const dvD3 = p1.vRelD3 - p0.vRelD3;
    const dv25 = p1.vRel25D - p0.vRel25D;
    const vD3_0 = p0.vRelD3 + frac0 * dvD3;
    const v25_0 = p0.vRel25D + frac0 * dv25;
    const vD3_M = p0.vRelD3 + fracMid * dvD3;
    const v25_M = p0.vRel25D + fracMid * dv25;
    const vD3_1 = p0.vRelD3 + frac1 * dvD3;
    const v25_1 = p0.vRel25D + frac1 * dv25;

    // Etapa 1
    const c1 = Math.max(1, baseline + poolD3 / vD3_0 + pool25D / v25_0);
    const ke1 = keEff(c1);
    const k1g3 = -PK_D3_KA * gutD3;
    const k1g25 = -PK_25D_KA * gut25D;
    const k1p3 = PK_D3_KA * gutD3 - ke1 * poolD3;
    const k1p25 = PK_25D_KA * gut25D - ke1 * pool25D;

    // Etapa 2
    const g3_2 = gutD3 + dtHalf * k1g3;
    const g25_2 = gut25D + dtHalf * k1g25;
    const p3_2 = poolD3 + dtHalf * k1p3;
    const p25_2 = pool25D + dtHalf * k1p25;
    const c2 = Math.max(1, baseline + p3_2 / vD3_M + p25_2 / v25_M);
    const ke2 = keEff(c2);
    const k2g3 = -PK_D3_KA * g3_2;
    const k2g25 = -PK_25D_KA * g25_2;
    const k2p3 = PK_D3_KA * g3_2 - ke2 * p3_2;
    const k2p25 = PK_25D_KA * g25_2 - ke2 * p25_2;

    // Etapa 3
    const g3_3 = gutD3 + dtHalf * k2g3;
    const g25_3 = gut25D + dtHalf * k2g25;
    const p3_3 = poolD3 + dtHalf * k2p3;
    const p25_3 = pool25D + dtHalf * k2p25;
    const c3 = Math.max(1, baseline + p3_3 / vD3_M + p25_3 / v25_M);
    const ke3 = keEff(c3);
    const k3g3 = -PK_D3_KA * g3_3;
    const k3g25 = -PK_25D_KA * g25_3;
    const k3p3 = PK_D3_KA * g3_3 - ke3 * p3_3;
    const k3p25 = PK_25D_KA * g25_3 - ke3 * p25_3;

    // Etapa 4
    const g3_4 = gutD3 + dt * k3g3;
    const g25_4 = gut25D + dt * k3g25;
    const p3_4 = poolD3 + dt * k3p3;
    const p25_4 = pool25D + dt * k3p25;
    const c4 = Math.max(1, baseline + p3_4 / vD3_1 + p25_4 / v25_1);
    const ke4 = keEff(c4);
    const k4g3 = -PK_D3_KA * g3_4;
    const k4g25 = -PK_25D_KA * g25_4;
    const k4p3 = PK_D3_KA * g3_4 - ke4 * p3_4;
    const k4p25 = PK_25D_KA * g25_4 - ke4 * p25_4;

    gutD3 = Math.max(0, gutD3 + dtSixth * (k1g3 + 2 * k2g3 + 2 * k3g3 + k4g3));
    gut25D = Math.max(0, gut25D + dtSixth * (k1g25 + 2 * k2g25 + 2 * k3g25 + k4g25));
    poolD3 = Math.max(0, poolD3 + dtSixth * (k1p3 + 2 * k2p3 + 2 * k3p3 + k4p3));
    pool25D = Math.max(0, pool25D + dtSixth * (k1p25 + 2 * k2p25 + 2 * k3p25 + k4p25));
  }

  if (endOnly) {
    const lastP = bodyTimeline[Math.min(totalDays, tlLen - 1)];
    return {
      endLevel: Math.max(1, baseline + poolD3 / lastP.vRelD3 + pool25D / lastP.vRel25D)
    };
  }

  return { weeks, levels, adiposeReserve, freeD3, dailyEquivIU };
}

export function solveDoseWithRK4(targetNg, baselineNg, loadWeeks, maintWeeks, freq, doseType) {
  const loadDays = Math.max(7, Math.round(loadWeeks * 7));
  const maintDays = Math.max(0, Math.round(maintWeeks * 7));
  const totalDays = loadDays + maintDays;

  const stepDays =
    freq === "daily" ? 1 :
    freq === "weekly" ? 7 :
    freq === "biweekly" ? 14 : 30;

  const timeline = buildBodyTimeline(totalDays, 1.0);

  const isCalci = doseType === "calcifediol";
  let low = isCalci ? 50 : 100;
  let high = isCalci ? 4000 : 300000;
  let bestLoad = isCalci ? 266 : 2000;

  for (let iter = 0; iter < 24; iter++) {
    const mid = (low + high) / 2;
    const eff = computeDoseEfficiency({
      type: doseType,
      iu: isCalci ? Math.round(mid * 60) : mid,
      ug: isCalci ? mid : Math.round(mid / 40)
    });
    const events = [];
    for (let d = 0; d < loadDays; d += stepDays) {
      if (isCalci) {
        events.push({ day: d, type: "calcifediol", ug: mid, iu: Math.round(mid * 60), efficiency: eff });
      } else {
        events.push({ day: d, type: "d3", iu: mid, ug: Math.round(mid / 40), efficiency: eff });
      }
    }
    const traj = integrateTrajectory(loadDays, events, { baseline: baselineNg, endOnly: true }, timeline);
    const endLevel = traj.endLevel;

    if (endLevel < targetNg) {
      low = mid;
    } else {
      high = mid;
    }
    bestLoad = mid;
  }

  if (isCalci) {
    // Cápsula estándar de Hidroferol = 266 ug
    const caps = Math.max(1, Math.round(bestLoad / 266));
    bestLoad = caps * 266;
  } else {
    const roundStep = freq === "daily" ? 100 : 500;
    bestLoad = Math.max(roundStep, Math.round(bestLoad / roundStep) * roundStep);
  }

  const loadEff = computeDoseEfficiency({
    type: doseType,
    iu: isCalci ? Math.round(bestLoad * 60) : bestLoad,
    ug: isCalci ? bestLoad : Math.round(bestLoad / 40)
  });
  const loadEvents = [];
  for (let d = 0; d < loadDays; d += stepDays) {
    if (isCalci) {
      loadEvents.push({ day: d, type: "calcifediol", ug: bestLoad, iu: Math.round(bestLoad * 60), efficiency: loadEff });
    } else {
      loadEvents.push({ day: d, type: "d3", iu: bestLoad, ug: Math.round(bestLoad / 40), efficiency: loadEff });
    }
  }

  let bestMaintIU = 2000;
  if (maintDays > 0) {
    let mLow = 200;
    let mHigh = 20000;

    for (let iter = 0; iter < 20; iter++) {
      const mMid = (mLow + mHigh) / 2;
      const mEff = computeDoseEfficiency({ type: "d3", iu: mMid });
      const events = loadEvents.slice();
      for (let d = loadDays; d < totalDays; d += 1) {
        events.push({ day: d, type: "d3", iu: mMid, ug: Math.round(mMid / 40), efficiency: mEff });
      }
      const traj = integrateTrajectory(totalDays, events, { baseline: baselineNg, endOnly: true }, timeline);
      const finalLevel = traj.endLevel;

      if (finalLevel < targetNg) {
        mLow = mMid;
      } else {
        mHigh = mMid;
      }
      bestMaintIU = mMid;
    }
    bestMaintIU = Math.max(200, Math.round(bestMaintIU / 100) * 100);
  }

  const finalEvents = loadEvents.slice();
  const mEff = computeDoseEfficiency({ type: "d3", iu: bestMaintIU });
  for (let d = loadDays; d < totalDays; d += 1) {
    finalEvents.push({ day: d, type: "d3", iu: bestMaintIU, ug: Math.round(bestMaintIU / 40), efficiency: mEff });
  }

  const fullTraj = integrateTrajectory(totalDays, finalEvents, { baseline: baselineNg }, timeline);
  let peakNg = fullTraj.levels[0] ?? baselineNg;
  for (let i = 1; i < fullTraj.levels.length; i++) {
    if (fullTraj.levels[i] > peakNg) peakNg = fullTraj.levels[i];
  }
  const endNg = fullTraj.levels[fullTraj.levels.length - 1];

  return {
    loadAmount: bestLoad,
    loadIU: isCalci ? Math.round(bestLoad * 60) : bestLoad,
    loadUg: isCalci ? bestLoad : Math.round(bestLoad / 40),
    maintIU: bestMaintIU,
    maintUg: Math.round(bestMaintIU / 40),
    peakNg,
    endNg
  };
}

export function estimateSafeWeeksRK4(initialLevelNg, targetLevelNg) {
  if (targetLevelNg <= initialLevelNg) return 1;
  const maxTestWeeks = 104;
  const maxTestDays = maxTestWeeks * 7;
  const timeline = buildBodyTimeline(maxTestDays, 1.0);
  const eff = computeDoseEfficiency({ type: "d3", iu: 4000 });
  const events = [];
  for (let d = 0; d < maxTestDays; d++) {
    events.push({ day: d, type: "d3", iu: 4000, ug: 100, efficiency: eff });
  }
  const traj = integrateTrajectory(maxTestDays, events, { baseline: initialLevelNg }, timeline);
  for (let i = 0; i < traj.levels.length; i++) {
    if (traj.levels[i] >= targetLevelNg) {
      return Math.max(1, Math.ceil(traj.weeks[i]));
    }
  }
  return maxTestWeeks;
}

export function simulateCurrentState() {
  const totalWeeks = store.appState.bodyProfile.simWeeks || 24;
  const totalDays = Math.round(totalWeeks * 7);
  const baselineNg = getInitialBaselineNg();

  const bodyTimeline = buildBodyTimeline(totalDays, 1.0);
  const bodyTimelineLow = buildBodyTimeline(totalDays, 0.92);
  const bodyTimelineHigh = buildBodyTimeline(totalDays, 1.08);
  const doseEvents = expandDosesToTimeline(store.appState.doses, totalDays);

  return {
    totalWeeks,
    initialParams: bodyTimeline[0],
    mainTraj: integrateTrajectory(totalDays, doseEvents, { baseline: baselineNg }, bodyTimeline),
    lowerTraj: integrateTrajectory(totalDays, doseEvents, { baseline: baselineNg * 0.94 }, bodyTimelineHigh),
    upperTraj: integrateTrajectory(totalDays, doseEvents, { baseline: baselineNg * 1.06 }, bodyTimelineLow)
  };
}