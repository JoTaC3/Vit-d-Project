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

export function integrateTrajectory(totalDays, doseEvents, opts, bodyTimeline) {
  const dt = 0.25;
  const steps = Math.round(totalDays / dt);
  const baseline = opts.baseline;

  const dosesByDay = new Map();
  doseEvents.forEach((ev) => {
    const arr = dosesByDay.get(ev.day) || [];
    arr.push(ev);
    dosesByDay.set(ev.day, arr);
  });

  let gutD3 = 0;
  let gut25D = 0;
  let poolD3 = 0;
  let pool25D = 0;

  const weeks = [];
  const levels = [];
  const adiposeReserve = [];
  const freeD3 = [];
  const dailyEquivIU = [];

  const keEff = (conc) => {
    const excess = Math.max(0, conc - CYP24A1_THRESHOLD);
    return PK_KE_BASE * (1 + (CYP24A1_EMAX * excess) / (CYP24A1_EC50 + excess));
  };

  for (let s = 0; s <= steps; s++) {
    const tDays = s * dt;
    const dayInt = Math.floor(tDays);
    const p0 = bodyTimeline[Math.min(dayInt, bodyTimeline.length - 1)];
    const p1 = bodyTimeline[Math.min(dayInt + 1, bodyTimeline.length - 1)];

    if (Math.abs(tDays - dayInt) < 1e-6) {
      const todaysEvents = dosesByDay.get(dayInt) || [];
      todaysEvents.forEach((ev) => {
        if (ev.type === "d3") {
          gutD3 += ev.iu * ev.efficiency * PK_D3_ALPHA;
        } else {
          gut25D += ev.ug * ev.efficiency * PK_25D_ALPHA;
        }
      });
    }

    if (s % 4 === 0) {
      const conc = Math.max(1, baseline + poolD3 / p0.vRelD3 + pool25D / p0.vRel25D);
      const adipShare = Math.min(1, Math.max(0, (THETA_FM_D3 * p0.fmRatio) / p0.vRelD3));
      const poolD3kUI = poolD3 / (PK_D3_ALPHA * 1000);
      const gutD3kUI = gutD3 / (PK_D3_ALPHA * 1000);

      weeks.push(Number((tDays / 7).toFixed(2)));
      levels.push(conc);
      adiposeReserve.push(Math.max(0, poolD3kUI * adipShare));
      freeD3.push(Math.max(0, gutD3kUI + poolD3kUI * (1 - adipShare)));

      const todaysEvents = dosesByDay.get(dayInt) || [];
      const exogIU = todaysEvents.reduce((acc, ev) => {
        if (ev.type === "d3") return acc + ev.iu * ev.efficiency;
        return acc + (ev.iu || ev.ug * 60);
      }, 0);
      dailyEquivIU.push(Math.round(exogIU));
    }

    if (s === steps) break;

    const frac0 = tDays - dayInt;
    const fracMid = frac0 + 0.5 * dt;
    const frac1 = frac0 + dt;

    const vD3_0 = p0.vRelD3 + frac0 * (p1.vRelD3 - p0.vRelD3);
    const v25_0 = p0.vRel25D + frac0 * (p1.vRel25D - p0.vRel25D);
    const vD3_M = p0.vRelD3 + fracMid * (p1.vRelD3 - p0.vRelD3);
    const v25_M = p0.vRel25D + fracMid * (p1.vRel25D - p0.vRel25D);
    const vD3_1 = p0.vRelD3 + frac1 * (p1.vRelD3 - p0.vRelD3);
    const v25_1 = p0.vRel25D + frac1 * (p1.vRel25D - p0.vRel25D);

    const derivatives = (gD3, g25D, pD3, p25D, vD3, v25D) => {
      const conc = Math.max(1, baseline + pD3 / vD3 + p25D / v25D);
      const ke = keEff(conc);
      const dgutD3 = -PK_D3_KA * gD3;
      const dgut25D = -PK_25D_KA * g25D;
      const dpoolD3 = PK_D3_KA * gD3 - ke * pD3;
      const dpool25D = PK_25D_KA * g25D - ke * p25D;
      return [dgutD3, dgut25D, dpoolD3, dpool25D];
    };

    const [k1g3, k1g25, k1p3, k1p25] = derivatives(gutD3, gut25D, poolD3, pool25D, vD3_0, v25_0);
    const [k2g3, k2g25, k2p3, k2p25] = derivatives(
      gutD3 + 0.5 * dt * k1g3,
      gut25D + 0.5 * dt * k1g25,
      poolD3 + 0.5 * dt * k1p3,
      pool25D + 0.5 * dt * k1p25,
      vD3_M,
      v25_M
    );
    const [k3g3, k3g25, k3p3, k3p25] = derivatives(
      gutD3 + 0.5 * dt * k2g3,
      gut25D + 0.5 * dt * k2g25,
      poolD3 + 0.5 * dt * k2p3,
      pool25D + 0.5 * dt * k2p25,
      vD3_M,
      v25_M
    );
    const [k4g3, k4g25, k4p3, k4p25] = derivatives(
      gutD3 + dt * k3g3,
      gut25D + dt * k3g25,
      poolD3 + dt * k3p3,
      pool25D + dt * k3p25,
      vD3_1,
      v25_1
    );

    gutD3 = Math.max(0, gutD3 + (dt / 6) * (k1g3 + 2 * k2g3 + 2 * k3g3 + k4g3));
    gut25D = Math.max(0, gut25D + (dt / 6) * (k1g25 + 2 * k2g25 + 2 * k3g25 + k4g25));
    poolD3 = Math.max(0, poolD3 + (dt / 6) * (k1p3 + 2 * k2p3 + 2 * k3p3 + k4p3));
    pool25D = Math.max(0, pool25D + (dt / 6) * (k1p25 + 2 * k2p25 + 2 * k3p25 + k4p25));
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
    const traj = integrateTrajectory(loadDays, events, { baseline: baselineNg }, timeline);
    const endLevel = traj.levels[traj.levels.length - 1];

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

  let bestMaintIU = 2000;
  if (maintDays > 0) {
    let mLow = 200;
    let mHigh = 20000;
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

    for (let iter = 0; iter < 20; iter++) {
      const mMid = (mLow + mHigh) / 2;
      const mEff = computeDoseEfficiency({ type: "d3", iu: mMid });
      const events = [...loadEvents];
      for (let d = loadDays; d < totalDays; d += 1) {
        events.push({ day: d, type: "d3", iu: mMid, ug: Math.round(mMid / 40), efficiency: mEff });
      }
      const traj = integrateTrajectory(totalDays, events, { baseline: baselineNg }, timeline);
      const finalLevel = traj.levels[traj.levels.length - 1];

      if (finalLevel < targetNg) {
        mLow = mMid;
      } else {
        mHigh = mMid;
      }
      bestMaintIU = mMid;
    }
    bestMaintIU = Math.max(200, Math.round(bestMaintIU / 100) * 100);
  }

  const finalEvents = [];
  const lEff = computeDoseEfficiency({
    type: doseType,
    iu: isCalci ? Math.round(bestLoad * 60) : bestLoad,
    ug: isCalci ? bestLoad : Math.round(bestLoad / 40)
  });
  for (let d = 0; d < loadDays; d += stepDays) {
    if (isCalci) {
      finalEvents.push({ day: d, type: "calcifediol", ug: bestLoad, iu: Math.round(bestLoad * 60), efficiency: lEff });
    } else {
      finalEvents.push({ day: d, type: "d3", iu: bestLoad, ug: Math.round(bestLoad / 40), efficiency: lEff });
    }
  }
  const mEff = computeDoseEfficiency({ type: "d3", iu: bestMaintIU });
  for (let d = loadDays; d < totalDays; d += 1) {
    finalEvents.push({ day: d, type: "d3", iu: bestMaintIU, ug: Math.round(bestMaintIU / 40), efficiency: mEff });
  }

  const fullTraj = integrateTrajectory(totalDays, finalEvents, { baseline: baselineNg }, timeline);
  const peakNg = Math.max(...fullTraj.levels);
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