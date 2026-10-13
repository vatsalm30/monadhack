// Frozen interface between feat/chain (contracts, indexer, server) and feat/app (web).
// Changes here must be agreed by both owners before editing.

export type Outcome = "OPEN" | "A" | "B" | "REFUND";

export type Side = "A" | "B";

export interface Duel {
  /** Onchain duel id (uint256 as decimal string). */
  id: string;
  /** Creator address, lowercase hex. */
  creator: string;
  /** Room slug, decoded from the onchain bytes32. */
  room: string;
  title: string;
  /** Public URL of artwork A. */
  uriA: string;
  /** Public URL of artwork B. */
  uriB: string;
  /** sha256 of file A, 0x-prefixed. */
  hashA: string;
  /** sha256 of file B, 0x-prefixed. */
  hashB: string;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds: predictions and vote commits close here. */
  commitEnd: number;
  /** Unix seconds: reveals close here, settle becomes callable. */
  revealEnd: number;
  /** Wei staked on side A. */
  poolA: bigint;
  /** Wei staked on side B. */
  poolB: bigint;
  /** Distinct addresses that predicted. */
  predictors: number;
  /** Distinct addresses that committed a vote. */
  committedVotes: number;
  /** Revealed votes for A. */
  votesA: number;
  /** Revealed votes for B. */
  votesB: number;
  outcome: Outcome;
}

export interface Position {
  /** `${duelId}_${user}` with user lowercase. */
  id: string;
  duelId: string;
  /** Lowercase hex address. */
  user: string;
  /** Side predicted, or null if the user only voted. */
  side: Side | null;
  /** Wei staked by this user. */
  stake: bigint;
  /** Unix seconds of this user's first prediction, used for the rep bonus. */
  firstAt: number;
  /** True once the user's winnings or refund has been claimed. */
  claimed: boolean;
  /** True if the user committed a blind vote on this duel. */
  committed: boolean;
  /** Side revealed, or null if not revealed. */
  revealed: Side | null;
  /** True once the voter reward has been claimed. */
  voterRewardClaimed: boolean;
}

export interface UserStats {
  /** Lowercase hex address. */
  id: string;
  /** Onchain taste rep. */
  tasteRep: number;
  /** Wei of profit from winning predictions (payout minus stake). */
  earned: bigint;
  /** Wei earned as a creator (5% shares). */
  creatorEarned: bigint;
  /** Wei earned as a revealed voter (2% shares). */
  voterEarned: bigint;
  duelsCreated: number;
  predictions: number;
  correctCalls: number;
  votesRevealed: number;
}

export interface Insight {
  winner: Side;
  /** One sentence on composition, palette or mood explaining the likely reason. */
  why: string;
  /** Two short tips for the creator's next piece. */
  tips: string[];
}
