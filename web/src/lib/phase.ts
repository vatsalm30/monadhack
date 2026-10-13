import type { Duel, Phase } from "./types";

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function phaseOf(duel: Duel, now: number = nowSeconds()): Phase {
  if (duel.outcome !== "OPEN") return "SETTLED";
  if (now < duel.commitEnd) return "COMMIT";
  if (now < duel.revealEnd) return "REVEAL";
  return "ENDED";
}

/** Seconds until the next phase boundary, or null once the duel needs no clock. */
export function secondsLeft(duel: Duel, now: number = nowSeconds()): number | null {
  const phase = phaseOf(duel, now);
  if (phase === "COMMIT") return Math.max(0, duel.commitEnd - now);
  if (phase === "REVEAL") return Math.max(0, duel.revealEnd - now);
  return null;
}

export const PHASE_LABEL: Record<Phase, string> = {
  COMMIT: "Predicting open",
  REVEAL: "Revealing votes",
  ENDED: "Ready to settle",
  SETTLED: "Settled",
};

/** Share of the pool on side A, 0.5 when no money is in yet. Drives the seam position. */
export function poolSplit(duel: Duel): number {
  const total = duel.poolA + duel.poolB;
  if (total === 0n) return 0.5;
  // Two decimals of precision is plenty for a layout value.
  return Number((duel.poolA * 10_000n) / total) / 10_000;
}

export function voteSplit(duel: Duel): number {
  const total = duel.votesA + duel.votesB;
  if (total === 0) return 0.5;
  return duel.votesA / total;
}
