/**
 * In-memory fixture used whenever `VITE_ENVIO_URL` is unset. Six duels across the three rooms, one
 * in every phase, plus positions, users, activity and a cached insight. Mutable, so predicting or
 * voting in mock mode moves the seam exactly like it will onchain.
 */
import { parseEther } from "viem";
import { mockArt } from "./mockArt";
import { nowSeconds } from "./phase";
import type { ActivityItem, Duel, Insight, Position, UserStats } from "./types";

const T0 = nowSeconds();

/** Every signed-in address is aliased to this one in mock mode, so a fresh passkey still has history. */
export const MOCK_ME = "0x8a11c0ffee0000000000000000000000000000a1";

const OTHERS = [
  "0x3f0b2c5ad1e4f9b7c6d8e0a1b2c3d4e5f6071829",
  "0x9c7d1e0f5a4b3c2d1e0f9a8b7c6d5e4f30291827",
  "0x5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928",
  "0xd4c3b2a1908f7e6d5c4b3a29180f7e6d5c4b3a21",
] as const;

const duel = (
  id: number,
  room: string,
  title: string,
  creator: string,
  seedA: number,
  seedB: number,
  times: { createdAt: number; commitEnd: number; revealEnd: number },
  pools: { a: string; b: string },
  votes: { a: number; b: number },
  counts: { predictors: number; committedVotes: number },
  outcome: Duel["outcome"],
): Duel => ({
  id: String(id),
  creator,
  room,
  title,
  uriA: mockArt(seedA),
  uriB: mockArt(seedB),
  hashA: `0x${seedA.toString(16).padStart(64, "a")}`,
  hashB: `0x${seedB.toString(16).padStart(64, "b")}`,
  createdAt: times.createdAt,
  commitEnd: times.commitEnd,
  revealEnd: times.revealEnd,
  poolA: parseEther(pools.a),
  poolB: parseEther(pools.b),
  predictors: counts.predictors,
  committedVotes: counts.committedVotes,
  votesA: votes.a,
  votesB: votes.b,
  outcome,
});

const duels: Duel[] = [
  // Closing in two minutes, money piled on A.
  duel(6, "purdue", "Risograph or riso-adjacent", OTHERS[0], 11, 12,
    { createdAt: T0 - 620, commitEnd: T0 + 150, revealEnd: T0 + 330 },
    { a: "1.2", b: "0.35" }, { a: 0, b: 0 }, { predictors: 9, committedVotes: 7 }, "OPEN"),

  // Freshly posted, barely any money in: the seam sits near the middle.
  duel(5, "purdue", "Studio window, two crops", MOCK_ME, 23, 24,
    { createdAt: T0 - 240, commitEnd: T0 + 3000, revealEnd: T0 + 3180 },
    { a: "0.1", b: "0.15" }, { a: 0, b: 0 }, { predictors: 3, committedVotes: 2 }, "OPEN"),

  // Reveal window is open, some ballots already in.
  duel(4, "lafayette", "Mural study: warm vs cool", OTHERS[1], 35, 36,
    { createdAt: T0 - 1340, commitEnd: T0 - 100, revealEnd: T0 + 80 },
    { a: "0.9", b: "1.1" }, { a: 3, b: 2 }, { predictors: 12, committedVotes: 8 }, "OPEN"),

  // Reveal window has closed, nobody has called settle yet.
  duel(3, "open", "Type specimen, tight or loose", OTHERS[2], 47, 48,
    { createdAt: T0 - 4200, commitEnd: T0 - 800, revealEnd: T0 - 120 },
    { a: "2.0", b: "1.0" }, { a: 4, b: 6 }, { predictors: 15, committedVotes: 11 }, "OPEN"),

  // Settled on A, so it has an insight.
  duel(2, "purdue", "Ceramic glaze test", MOCK_ME, 59, 60,
    { createdAt: T0 - 90_000, commitEnd: T0 - 86_700, revealEnd: T0 - 86_400 },
    { a: "2.5", b: "1.5" }, { a: 9, b: 4 }, { predictors: 21, committedVotes: 14 }, "A"),

  // Dead tie, so everyone was refunded.
  duel(1, "lafayette", "Zine cover, draft two", OTHERS[3], 71, 72,
    { createdAt: T0 - 180_000, commitEnd: T0 - 176_400, revealEnd: T0 - 176_100 },
    { a: "0.5", b: "0.5" }, { a: 3, b: 3 }, { predictors: 6, committedVotes: 7 }, "REFUND"),
];

const position = (over: Partial<Position> & { duelId: string; user: string }): Position => ({
  id: `${over.duelId}_${over.user}`,
  side: null,
  stake: 0n,
  firstAt: T0,
  claimed: false,
  committed: false,
  revealed: null,
  voterRewardClaimed: false,
  ...over,
});

const positions = new Map<string, Position>();
const addPosition = (p: Position): void => void positions.set(p.id, p);

// My history: a win waiting to be claimed, a refund, a committed vote to reveal.
addPosition(position({ duelId: "6", user: MOCK_ME, side: "A", stake: parseEther("0.4"), firstAt: T0 - 540 }));
addPosition(position({ duelId: "4", user: MOCK_ME, committed: true, firstAt: T0 - 900 }));
addPosition(position({ duelId: "3", user: MOCK_ME, side: "B", stake: parseEther("0.5"), firstAt: T0 - 3900 }));
addPosition(position({ duelId: "2", user: MOCK_ME, side: "A", stake: parseEther("0.75"), firstAt: T0 - 89_400 }));
addPosition(position({ duelId: "1", user: MOCK_ME, side: "A", stake: parseEther("0.2"), firstAt: T0 - 179_000 }));
addPosition(position({ duelId: "6", user: OTHERS[1], side: "A", stake: parseEther("0.5"), firstAt: T0 - 300 }));
addPosition(position({ duelId: "6", user: OTHERS[2], side: "B", stake: parseEther("0.35"), firstAt: T0 - 120 }));

const user = (id: string, over: Partial<UserStats>): UserStats => ({
  id,
  tasteRep: 0,
  earned: 0n,
  creatorEarned: 0n,
  voterEarned: 0n,
  duelsCreated: 0,
  predictions: 0,
  correctCalls: 0,
  votesRevealed: 0,
  ...over,
});

const users = new Map<string, UserStats>([
  [MOCK_ME, user(MOCK_ME, { tasteRep: 312, earned: parseEther("1.86"), creatorEarned: parseEther("0.2"), voterEarned: parseEther("0.04"), duelsCreated: 2, predictions: 9, correctCalls: 6, votesRevealed: 4 })],
  [OTHERS[0], user(OTHERS[0], { tasteRep: 884, earned: parseEther("4.21"), creatorEarned: parseEther("0.55"), voterEarned: parseEther("0.12"), duelsCreated: 5, predictions: 24, correctCalls: 17, votesRevealed: 11 })],
  [OTHERS[1], user(OTHERS[1], { tasteRep: 596, earned: parseEther("2.74"), creatorEarned: parseEther("0.31"), voterEarned: parseEther("0.09"), duelsCreated: 3, predictions: 18, correctCalls: 11, votesRevealed: 14 })],
  [OTHERS[2], user(OTHERS[2], { tasteRep: 441, earned: parseEther("1.12"), creatorEarned: parseEther("0.74"), voterEarned: parseEther("0.06"), duelsCreated: 7, predictions: 12, correctCalls: 7, votesRevealed: 5 })],
  [OTHERS[3], user(OTHERS[3], { tasteRep: 158, earned: parseEther("0.33"), creatorEarned: parseEther("0.11"), voterEarned: parseEther("0.03"), duelsCreated: 1, predictions: 6, correctCalls: 3, votesRevealed: 9 })],
]);

const activity: ActivityItem[] = [
  { id: "6-c", duelId: "6", user: OTHERS[0], kind: "CREATED", side: null, amount: 0n, timestamp: T0 - 620 },
  { id: "6-p1", duelId: "6", user: MOCK_ME, kind: "PREDICTED", side: "A", amount: parseEther("0.4"), timestamp: T0 - 540 },
  { id: "6-v1", duelId: "6", user: OTHERS[3], kind: "VOTE_COMMITTED", side: null, amount: 0n, timestamp: T0 - 420 },
  { id: "6-p2", duelId: "6", user: OTHERS[1], kind: "PREDICTED", side: "A", amount: parseEther("0.5"), timestamp: T0 - 300 },
  { id: "6-p3", duelId: "6", user: OTHERS[2], kind: "PREDICTED", side: "B", amount: parseEther("0.35"), timestamp: T0 - 120 },
  { id: "4-c", duelId: "4", user: OTHERS[1], kind: "CREATED", side: null, amount: 0n, timestamp: T0 - 1340 },
  { id: "4-v1", duelId: "4", user: MOCK_ME, kind: "VOTE_COMMITTED", side: null, amount: 0n, timestamp: T0 - 900 },
  { id: "4-r1", duelId: "4", user: OTHERS[2], kind: "VOTE_REVEALED", side: "A", amount: 0n, timestamp: T0 - 60 },
  { id: "2-s", duelId: "2", user: MOCK_ME, kind: "SETTLED", side: "A", amount: 0n, timestamp: T0 - 86_300 },
  { id: "2-cl", duelId: "2", user: OTHERS[0], kind: "CLAIMED", side: "A", amount: parseEther("1.24"), timestamp: T0 - 86_000 },
];

const insights = new Map<string, Insight>([
  [
    "2",
    {
      winner: "A",
      why: "A reads instantly at thumbnail size: the warm glaze pools in one bright diagonal, while B spreads the same palette evenly and loses its focal point.",
      tips: ["Keep one dominant value cluster per piece.", "Shoot the next test on a neutral ground so the glaze colour carries the frame."],
    },
  ],
]);

const clone = <T,>(v: T): T => v;

export const mockFeed = (room: string): Duel[] =>
  duels.filter((d) => d.room === room).sort((a, b) => b.createdAt - a.createdAt).map(clone);

export const mockDuel = (id: string): Duel | null => duels.find((d) => d.id === id) ?? null;

export const mockPositions = (): Position[] =>
  [...positions.values()].filter((p) => p.user === MOCK_ME).sort((a, b) => b.firstAt - a.firstAt);

export const mockPosition = (duelId: string): Position | null => positions.get(`${duelId}_${MOCK_ME}`) ?? null;

export const mockUsers = (): UserStats[] => [...users.values()];

export const mockUser = (address: string): UserStats =>
  users.get(address.toLowerCase()) ?? users.get(MOCK_ME) ?? user(address, {});

export const mockActivity = (duelId: string): ActivityItem[] =>
  activity.filter((a) => a.duelId === duelId).sort((a, b) => b.timestamp - a.timestamp);

export const mockInsight = (duelId: string): Insight | null => insights.get(duelId) ?? null;

// ---- mutations, so the mock behaves like a live market ----

function patch(duelId: string, change: (d: Duel) => Duel): void {
  const index = duels.findIndex((d) => d.id === duelId);
  if (index >= 0) duels[index] = change(duels[index]!);
}

function upsert(duelId: string, change: (p: Position) => Position): void {
  const id = `${duelId}_${MOCK_ME}`;
  const current = positions.get(id) ?? position({ duelId, user: MOCK_ME });
  positions.set(id, change(current));
}

function log(item: Omit<ActivityItem, "id" | "timestamp">): void {
  activity.push({ ...item, id: `${item.duelId}-${item.kind}-${activity.length}`, timestamp: nowSeconds() });
}

export function mockPredict(duelId: string, side: "A" | "B", amount: bigint): void {
  patch(duelId, (d) => ({
    ...d,
    poolA: side === "A" ? d.poolA + amount : d.poolA,
    poolB: side === "B" ? d.poolB + amount : d.poolB,
    predictors: mockPosition(duelId)?.stake ? d.predictors : d.predictors + 1,
  }));
  upsert(duelId, (p) => ({ ...p, side, stake: p.stake + amount, firstAt: p.stake === 0n ? nowSeconds() : p.firstAt }));
  log({ duelId, user: MOCK_ME, kind: "PREDICTED", side, amount });
}

/** Stands in for the onchain commitment: what the mock can test a reveal against. */
const committedSides = new Map<string, "A" | "B">();

// The seeded ballot on duel 4, so "reveal my vote" has something to recover.
committedSides.set("4", "B");

export const mockCommittedSide = (duelId: string): "A" | "B" | null => committedSides.get(duelId) ?? null;

export function mockCommitVote(duelId: string, side: "A" | "B"): void {
  committedSides.set(duelId, side);
  patch(duelId, (d) => ({ ...d, committedVotes: d.committedVotes + 1 }));
  upsert(duelId, (p) => ({ ...p, committed: true }));
  log({ duelId, user: MOCK_ME, kind: "VOTE_COMMITTED", side: null, amount: 0n });
}

export function mockRevealVote(duelId: string, side: "A" | "B"): void {
  patch(duelId, (d) => ({
    ...d,
    votesA: side === "A" ? d.votesA + 1 : d.votesA,
    votesB: side === "B" ? d.votesB + 1 : d.votesB,
  }));
  upsert(duelId, (p) => ({ ...p, revealed: side }));
  log({ duelId, user: MOCK_ME, kind: "VOTE_REVEALED", side, amount: 0n });
}

export function mockSettle(duelId: string): void {
  patch(duelId, (d) => {
    const total = d.votesA + d.votesB;
    const outcome: Duel["outcome"] =
      total === 0 || d.votesA === d.votesB ? "REFUND" : d.votesA > d.votesB ? "A" : "B";
    const winPool = outcome === "A" ? d.poolA : outcome === "B" ? d.poolB : 1n;
    return { ...d, outcome: winPool === 0n && d.poolA + d.poolB > 0n ? "REFUND" : outcome };
  });
  log({ duelId, user: MOCK_ME, kind: "SETTLED", side: null, amount: 0n });
}

export function mockClaim(duelId: string, kind: "WINNINGS" | "VOTER" | "CREATOR"): void {
  if (kind === "WINNINGS") upsert(duelId, (p) => ({ ...p, claimed: true }));
  if (kind === "VOTER") upsert(duelId, (p) => ({ ...p, voterRewardClaimed: true }));
  const activityKind = kind === "VOTER" ? "VOTER_REWARD" : kind === "CREATOR" ? "CREATOR_PAID" : "CLAIMED";
  log({ duelId, user: MOCK_ME, kind: activityKind, side: null, amount: 0n });
}

export function mockCreateDuel(input: {
  room: string;
  title: string;
  uriA: string;
  uriB: string;
  hashA: `0x${string}`;
  hashB: `0x${string}`;
  commitDuration: number;
}): string {
  const now = nowSeconds();
  const id = String(Math.max(...duels.map((d) => Number(d.id))) + 1);
  duels.push({
    id,
    creator: MOCK_ME,
    room: input.room,
    title: input.title,
    uriA: input.uriA,
    uriB: input.uriB,
    hashA: input.hashA,
    hashB: input.hashB,
    createdAt: now,
    commitEnd: now + input.commitDuration,
    revealEnd: now + input.commitDuration + 180,
    poolA: 0n,
    poolB: 0n,
    predictors: 0,
    committedVotes: 0,
    votesA: 0,
    votesB: 0,
    outcome: "OPEN",
  });
  log({ duelId: id, user: MOCK_ME, kind: "CREATED", side: null, amount: 0n });
  return id;
}
