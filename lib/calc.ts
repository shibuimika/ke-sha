export type Role =
  | "intern"
  | "junior"
  | "mid"
  | "manager"
  | "director"
  | "exec";

export type Mode = "nearest" | "ceil" | "floor";
export type Granularity = 1 | 10 | 50 | 100;

export interface ParticipantInput {
  id: string;
  name: string;
  role?: Role;
  age?: number;
  treat?: boolean;
  customWeight?: number; // 0.1 - 2.0 preferred
}

export const ROLE_WEIGHT: Record<Role, number> = {
  intern: 0.6,
  junior: 0.8,
  mid: 1.0,
  manager: 1.2,
  director: 1.4,
  exec: 1.6,
};

export function ageAdjustment(age?: number): number {
  if (typeof age !== "number") return 0;
  if (age <= 24) return -0.1;
  if (age <= 29) return 0;
  if (age <= 39) return 0.1;
  if (age <= 49) return 0.2;
  return 0.3;
}

export function baseWeight(role?: Role, age?: number): number {
  const effectiveRole: Role = role ?? "mid";
  const roleWeight = ROLE_WEIGHT[effectiveRole] ?? 1.0;
  const adjusted = roleWeight * (1 + ageAdjustment(age));
  return Math.max(0.1, Number(adjusted.toFixed(3)));
}

export function effectiveWeight(p: ParticipantInput): number {
  if (p.treat) return 0;
  if (typeof p.customWeight === "number") {
    // Clamp to slider range for safety
    return clamp(p.customWeight, 0.1, 2.0);
  }
  return baseWeight(p.role, p.age);
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

export function roundToGranularity(
  value: number,
  granularity: Granularity,
  mode: Mode
): number {
  const g = granularity as number;
  if (g <= 1) {
    // Granularity of 1 means integer yen
    switch (mode) {
      case "nearest":
        return Math.round(value);
      case "ceil":
        return Math.ceil(value);
      case "floor":
        return Math.floor(value);
    }
  }
  const ratio = value / g;
  switch (mode) {
    case "nearest":
      return Math.round(ratio) * g;
    case "ceil":
      return Math.ceil(ratio) * g;
    case "floor":
      return Math.floor(ratio) * g;
  }
}

export interface ComputedShareResult {
  amountsById: Record<string, number>; // rounded & redistributed
  rawById: Record<string, number>;
  weightsById: Record<string, number>;
  sumRounded: number;
  sumRaw: number;
}

/**
 * Compute theoretical shares, then round to granularity, then redistribute delta so sum equals total.
 */
export function computeShares(
  participants: ParticipantInput[],
  total: number,
  granularity: Granularity,
  mode: Mode
): ComputedShareResult {
  const ids = participants.map((p) => p.id);
  const weights = participants.map((p) => effectiveWeight(p));
  const weightsById: Record<string, number> = {};
  ids.forEach((id, i) => (weightsById[id] = weights[i]));

  const sumWeight = weights.reduce((a, b) => a + b, 0);
  const raw: number[] =
    sumWeight <= 0
      ? participants.map(() => 0)
      : participants.map((_, i) => (total * weights[i]) / sumWeight);

  const rawById: Record<string, number> = {};
  ids.forEach((id, i) => (rawById[id] = raw[i]));

  // Initial rounding
  const rounded = raw.map((r) => roundToGranularity(r, granularity, mode));
  const amountsMutable = [...rounded];
  let sumRounded = amountsMutable.reduce((a, b) => a + b, 0);
  const step = granularity as number;

  // Redistribute delta using residual priority
  let delta = Math.round(total - sumRounded); // integer yen delta
  // When step > 1, we primarily adjust in multiples of step. For the new UX
  // requirement, if total is not reachable exactly, we ceil to the next step.
  const canStep = (d: number) => {
    return step === 1 ? d !== 0 : Math.abs(d) >= step;
  };

  // Precompute treat flags to avoid modifying treat=ON participants
  const isLockedZero = participants.map((p) => Boolean(p.treat));

  let guard = 0;
  while (canStep(delta) && guard < 100000) {
    guard++;
    const residuals = raw.map((r, i) => r - amountsMutable[i]);
    if (delta > 0) {
      // Need to add step to those who were rounded down the most: residual positive, largest first
      const order = residuals
        .map((res, i) => ({ i, res }))
        .filter(({ i }) => !isLockedZero[i])
        .sort((a, b) => b.res - a.res)
        .map((x) => x.i);
      let progressed = false;
      for (const idx of order) {
        amountsMutable[idx] += step;
        delta -= step;
        progressed = true;
        if (!canStep(delta)) break;
      }
      if (!progressed) break; // avoid infinite loop
    } else if (delta < 0) {
      // Need to subtract step from those who were rounded up the most: residual negative, most negative first
      const order = residuals
        .map((res, i) => ({ i, res }))
        .filter(({ i }) => !isLockedZero[i] && amountsMutable[i] - step >= 0)
        .sort((a, b) => a.res - b.res)
        .map((x) => x.i);
      let progressed = false;
      for (const idx of order) {
        amountsMutable[idx] -= step;
        delta += step;
        progressed = true;
        if (!canStep(delta)) break;
      }
      if (!progressed) break; // avoid infinite loop
    }
  }

  // New rule: ensure the final sum is never less than total.
  // If delta is still positive but smaller than step, add one more step to
  // the person who was rounded down the most (or the first non-locked).
  if (total - amountsMutable.reduce((a, b) => a + b, 0) > 0) {
    if (step > 1) {
      const residuals = raw.map((r, i) => r - amountsMutable[i]);
      const order = residuals
        .map((res, i) => ({ i, res }))
        .filter(({ i }) => !isLockedZero[i])
        .sort((a, b) => b.res - a.res)
        .map((x) => x.i);
      if (order.length > 0) {
        amountsMutable[order[0]] += step;
      }
    }
  }

  // If sum exceeds total by less than a step, keep as-is (ceil). Do not reduce below total.

  sumRounded = amountsMutable.reduce((a, b) => a + b, 0);
  const amountsById: Record<string, number> = {};
  ids.forEach(
    (id, i) => (amountsById[id] = Math.max(0, Math.round(amountsMutable[i])))
  );

  return {
    amountsById,
    rawById,
    weightsById,
    sumRounded,
    sumRaw: raw.reduce((a, b) => a + b, 0),
  };
}

export function formatYen(n: number): string {
  const v = Math.round(n);
  return `¥${v.toLocaleString("ja-JP")}`;
}


