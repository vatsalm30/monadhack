/** Payout and rep arithmetic, mirrored from the contract so the UI can preview before a claim. */
import type { Duel, Position } from "./types";

export const CREATOR_BPS = 500n;
export const VOTER_BPS = 200n;
const FEE_BPS = CREATOR_BPS + VOTER_BPS;
const BPS = 10_000n;

/** What a winning stake is worth: `stake * (pool - 7%) / winPool`. */
export function payoutFor(duel: Duel, stake: bigint, side: "A" | "B"): bigint {
  const pool = duel.poolA + duel.poolB;
  const winPool = side === "A" ? duel.poolA : duel.poolB;
  if (winPool === 0n || stake === 0n) return 0n;
  const distributable = (pool * (BPS - FEE_BPS)) / BPS;
  return (stake * distributable) / winPool;
}

/** What this user can claim right now, and why. */
export function claimable(duel: Duel, position: Position | null): {
  winnings: bigint;
  isRefund: boolean;
  voterReward: bigint;
  creatorShare: bigint;
} {
  const pool = duel.poolA + duel.poolB;
  const stake = position?.stake ?? 0n;
  const isRefund = duel.outcome === "REFUND";
  const won = (duel.outcome === "A" || duel.outcome === "B") && position?.side === duel.outcome;
  const reveals = duel.votesA + duel.votesB;

  return {
    winnings: isRefund ? stake : won ? payoutFor(duel, stake, duel.outcome as "A" | "B") : 0n,
    isRefund,
    voterReward:
      position?.revealed && reveals > 0 && (duel.outcome === "A" || duel.outcome === "B")
        ? (pool * VOTER_BPS) / BPS / BigInt(reveals)
        : 0n,
    creatorShare: duel.outcome === "A" || duel.outcome === "B" ? (pool * CREATOR_BPS) / BPS : 0n,
  };
}

/**
 * Rep a winning claim adds: `10 + 90 * (commitEnd - firstAt) / (commitEnd - createdAt)`.
 * Calling early is worth up to 100; calling at the deadline is worth 10.
 */
export function repFor(duel: Duel, firstAt: number): number {
  const window = duel.commitEnd - duel.createdAt;
  if (window <= 0) return 100;
  const earliness = Math.max(0, Math.min(window, duel.commitEnd - firstAt));
  return 10 + Math.floor((90 * earliness) / window);
}

/** Rep a prediction placed right now would earn, used to nudge early calls. */
export const repIfPredictedNow = (duel: Duel, now: number): number => repFor(duel, now);
