import type { Duel, Insight, Outcome, Position, Side, UserStats } from "@shared/types";

export type { Duel, Insight, Outcome, Position, Side, UserStats };

/**
 * Mirrors the `ActivityKind` enum in indexer/schema.graphql exactly. Not in shared/types.ts, which
 * Branch A owns. A claim is split three ways because the money comes from three different places.
 */
export type ActivityKind =
  | "CREATED"
  | "PREDICTED"
  | "VOTE_COMMITTED"
  | "VOTE_REVEALED"
  | "SETTLED"
  | "CLAIMED"
  | "VOTER_REWARD"
  | "CREATOR_PAID";

export interface ActivityItem {
  id: string;
  duelId: string;
  user: string;
  kind: ActivityKind;
  side: Side | null;
  /** Wei, when the activity moved money. */
  amount: bigint;
  timestamp: number;
}

/** What the duel is accepting right now. Derived from the clock plus the settled outcome. */
export type Phase = "COMMIT" | "REVEAL" | "ENDED" | "SETTLED";

export interface LeaderboardRow extends UserStats {
  rank: number;
}

export interface Leaderboard {
  tastemakers: LeaderboardRow[];
  creators: LeaderboardRow[];
}

export interface UploadResult {
  uriA: string;
  uriB: string;
  hashA: `0x${string}`;
  hashB: `0x${string}`;
}
