/**
 * Motor Farmacocinético Compartimental ODE (RK4) y Planificador Inverso
 */

import { store, getInitialBaselineNg } from "./state.js";

export function computePhysiologicalParameters(profile, weight, bodyFatPct) {
  const hMeters = (profile.height || 175) / 100;
  const bmi = weight / (hMeters * hMeters);
  const fatMass = weight * (bodyFatPct / 100);
  const leanMass = Math.max(25, weight - fatMass);

  const refFatPct = profile.sex === "female" ? 26 : 18;
  const excessFatFactor = Math.max(0, (bodyFatPct - refFatPct) / 100);
  const leanScaling = Math.pow(leanMass / 60, 0.75);
  const adipositySequestration = 1 + 1.45 * excessFatFactor + Math.max(0, (bmi - 25) * 0.012);

  const effectiveVolume = 13.8 * leanScaling * adipositySequestration;
  const ageFactor = 1 - Math.max(0, (profile.age - 30) * 0.0022);
  const kElim25 = (Math.LN2 / 21.5) * ageFactor;

  const k25Conversion = 0.24;
  const kAdiposeCapture = 0.08 * (1 + 1.8 * excessFatFactor);
  const kAdiposeRelease = 0.016;
  const kLossD3 = 0.045;
  const sunDailyIU = (profile.sunExposure || 0) * (profile.skinTone || 1.0) * ageFactor;

  return {
    effectiveVolume,
    kElim25,
    k25Conversion,
    kAdiposeCapture,
    kAdiposeRelease,
    kLossD3,
    sunDailyIU,
    bmi,
    leanMass,
    fatMass
  };
}

export function computeDoseEfficiency(dose) {
  if (dose.type === "calcifediol") return 3.15;
  const iu = dose.iu;
  if (iu <= 2000) return 1.0;
  if (iu <= 5000) return 0.96;
  if (iu <= 10000) return 0.91;
  if (iu <= 50000) return 0.82;
  if (iu <= 100000) return 0.74;
  return 0.65;
}

export function expandDosesToTimeline(doses, totalDays) {
  const events = [];
  doses.forEach((d) => {
    const startDay = Math.max(0, Math.round(d.startWeek * 7));
    const endDay = Math.min(totalDays, Math.round(d.endWeek * 7));
    const eff = computeDoseEfficiency(d);

    if (d.freq === "single") {
      if (startDay <= totalDays) {
        events.push({ day: startDay, type: d.type, iu: d.iu, efficiency: eff });
      }
      return;
    }

    const stepDays =
      d.freq === "daily" ? 1 :
      d.freq === "weekly" ? 7 :
      d.freq === "biweekly" ? 14 : 30;

    for (let day = startDay; day < endDay; day += stepDays) {
      events.push({ day, type: d.type, iu: d.iu, efficiency: eff });
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

  const dosesByDay = new Map();
  doseEvents.forEach((ev) => {
    const arr = dosesByDay.get(ev.day) || [];
    arr.push(ev);
    dosesByDay.set(ev.day, arr);
  });

  const p0 = bodyTimeline[0];
  let C2 = opts.baseline;
  let A1 = (C2 * p0.effectiveVolume * p0.kElim25) / (p0.k25Conversion || 0.24);
  let A_adip = A1 * (p0.kAdiposeCapture / (p0.kAdiposeRelease || 0.016));

  const weeks = [];
  const levels = [];
  const adiposeReserve = [];
  const freeD3 = [];
  const dailyEquivIU = [];

  for (let s = 0; s <= steps; s++) {
    const tDays = s * dt;
    const dayInt = Math.floor(tDays);
    const params = bodyTimeline[Math.min(dayInt, bodyTimeline.length - 1)];

    if (Math.abs(tDays - dayInt) < 1e-6) {
      const todaysEvents = dosesByDay.get(dayInt) || [];
      todaysEvents.forEach((ev) => {
        if (ev.type === "d3") {
          A1 += (ev.iu / 1000) * ev.efficiency;
        } else {
          const deltaC = ((ev.iu / 1000) * ev.efficiency * 0.28) / params.effectiveVolume;
          C2 += deltaC;
        }
      });
    }

    if (s % 4 === 0) {
      weeks.push(Number((tDays / 7).toFixed(2)));
      levels.push(Math.max(1, C2));
      adiposeReserve.push(Math.max(0, A_adip));
      freeD3.push(Math.max(0, A1));

      const todaysEvents = dosesByDay.get(dayInt) || [];
      const exogIU = todaysEvents.reduce((acc, ev) => acc + ev.iu * ev.efficiency, 0);
      dailyEquivIU.push(Math.round(exogIU + params.sunDailyIU));
    }

    if (s === steps) break;

    const sunKiloIU = params.sunDailyIU / 1000;
    const Vd = params.effectiveVolume;

    const derivatives = (a1, aAdip, c2) => {
      const satConversion = (params.k25Conversion * a1) / (1 + a1 / 65);
      const da1 =
        sunKiloIU +
        params.kAdiposeRelease * aAdip -
        (satConversion + params.kAdiposeCapture + params.kLossD3) * a1;

      const daAdip = params.kAdiposeCapture * a1 - params.kAdiposeRelease * aAdip;
      const dc2 = (satConversion * 0.30) / Vd - params.kElim25 * c2;
      return [da1, daAdip, dc2];
    };

    const [k1a, k1ad, k1c] = derivatives(A1, A_adip, C2);
    const [k2a, k2ad, k2c] = derivatives(
      A1 + 0.5 * dt * k1a,
      A_adip + 0.5 * dt * k1ad,
      C2 + 0.5 * dt * k1c
    );
    const [k3a, k3ad, k3c] = derivatives(
      A1 + 0.5 * dt * k2a,
      A_adip + 0.5 * dt * k2ad,
      C2 + 0.5 * dt * k2c
    );
    const [k4a, k4ad, k4c] = derivatives(
      A1 + dt * k3a,
      A_adip + dt * k3ad,
      C2 + dt * k3c
    );

    A1 = Math.max(0, A1 + (dt / 6) * (k1a + 2 * k2a + 2 * k3a + k4a));
    A_adip = Math.max(0, A_adip + (dt / 6) * (k1ad + 2 * k2ad + 2 * k3ad + k4ad));
    C2 = Math.max(1, C2 + (dt / 6) * (k1c + 2 * k2c + 2 * k3c + k4c));
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

  let low = 100;
  let high = doseType === "calcifediol" ? 150000 : 300000;
  let bestLoadIU = 2000;

  for (let iter = 0; iter < 24; iter++) {
    const mid = (low + high) / 2;
    const eff = computeDoseEfficiency({ type: doseType, iu: mid });
    const events = [];
    for (let d = 0; d < loadDays; d += stepDays) {
      events.push({ day: d, type: doseType, iu: mid, efficiency: eff });
    }
    const traj = integrateTrajectory(loadDays, events, { baseline: baselineNg }, timeline);
    const endLevel = traj.levels[traj.levels.length - 1];

    if (endLevel < targetNg) {
      low = mid;
    } else {
      high = mid;
    }
    bestLoadIU = mid;
  }

  const roundStep = freq === "daily" ? 100 : 500;
  bestLoadIU = Math.max(roundStep, Math.round(bestLoadIU / roundStep) * roundStep);

  let bestMaintIU = 2000;
  if (maintDays > 0) {
    let mLow = 200;
    let mHigh = 20000;
    const loadEff = computeDoseEfficiency({ type: doseType, iu: bestLoadIU });
    const loadEvents = [];
    for (let d = 0; d < loadDays; d += stepDays) {
      loadEvents.push({ day: d, type: doseType, iu: bestLoadIU, efficiency: loadEff });
    }

    for (let iter = 0; iter < 20; iter++) {
      const mMid = (mLow + mHigh) / 2;
      const mEff = computeDoseEfficiency({ type: "d3", iu: mMid });
      const events = [...loadEvents];
      for (let d = loadDays; d < totalDays; d += 1) {
        events.push({ day: d, type: "d3", iu: mMid, efficiency: mEff });
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
  const lEff = computeDoseEfficiency({ type: doseType, iu: bestLoadIU });
  for (let d = 0; d < loadDays; d += stepDays) {
    finalEvents.push({ day: d, type: doseType, iu: bestLoadIU, efficiency: lEff });
  }
  const mEff = computeDoseEfficiency({ type: "d3", iu: bestMaintIU });
  for (let d = loadDays; d < totalDays; d += 1) {
    finalEvents.push({ day: d, type: "d3", iu: bestMaintIU, efficiency: mEff });
  }

  const fullTraj = integrateTrajectory(totalDays, finalEvents, { baseline: baselineNg }, timeline);
  const peakNg = Math.max(...fullTraj.levels);
  const endNg = fullTraj.levels[fullTraj.levels.length - 1];

  return {
    loadIU: bestLoadIU,
    maintIU: bestMaintIU,
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
    events.push({ day: d, type: "d3", iu: 4000, efficiency: eff });
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