import { indexer } from "envio";
import type { Activity, Duel, Position, Room, User } from "envio";
import { decodeRoom } from "../room";

type SideName = NonNullable<Position["side"]>;
type Kind = Activity["kind"];

// Contract enums: Side {None, A, B}, Outcome {Open, A, B, Refund}.
const SIDES: Record<string, SideName | undefined> = { "1": "A", "2": "B" };
const OUTCOMES: Record<string, Duel["outcome"] | undefined> = { "0": "OPEN", "1": "A", "2": "B", "3": "REFUND" };

function toSide(v: bigint): SideName | undefined {
  return SIDES[v.toString()];
}

const addr = (a: string) => a.toLowerCase();

type Ctx = {
  User: { get: (id: string) => Promise<User | undefined>; set: (e: User) => void };
  Position: { get: (id: string) => Promise<Position | undefined>; set: (e: Position) => void };
  Activity: { set: (e: Activity) => void };
};

async function loadUser(context: Ctx, id: string): Promise<User> {
  return (
    (await context.User.get(id)) ?? {
      id,
      tasteRep: 0,
      earned: 0n,
      creatorEarned: 0n,
      voterEarned: 0n,
      duelsCreated: 0,
      predictions: 0,
      correctCalls: 0,
      votesRevealed: 0,
    }
  );
}

async function loadPosition(context: Ctx, duelId: string, user: string, at: number): Promise<[Position, boolean]> {
  const id = `${duelId}_${user}`;
  const existing = await context.Position.get(id);
  if (existing) return [existing, false];
  return [
    {
      id,
      duelId,
      user,
      side: undefined,
      stake: 0n,
      firstAt: at,
      claimed: false,
      committed: false,
      revealed: undefined,
      voterRewardClaimed: false,
    },
    true,
  ];
}

type EventMeta = { chainId: number; block: { number: number; timestamp: number }; logIndex: number };

function logActivity(
  context: Ctx,
  event: EventMeta,
  duelId: string,
  user: string,
  kind: Kind,
  side?: SideName,
  amount?: bigint,
) {
  context.Activity.set({
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    duelId,
    user,
    kind,
    side,
    amount,
    timestamp: event.block.timestamp,
  });
}

indexer.onEvent({ contract: "Pairwise", event: "DuelCreated" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const creator = addr(event.params.creator);
  const room = decodeRoom(event.params.room);

  context.Duel.set({
    id,
    creator,
    room,
    title: event.params.title,
    uriA: event.params.uriA,
    uriB: event.params.uriB,
    hashA: event.params.hashA,
    hashB: event.params.hashB,
    createdAt: event.block.timestamp,
    commitEnd: Number(event.params.commitEnd),
    revealEnd: Number(event.params.revealEnd),
    poolA: 0n,
    poolB: 0n,
    predictors: 0,
    committedVotes: 0,
    votesA: 0,
    votesB: 0,
    outcome: "OPEN",
  });

  const r: Room = (await context.Room.get(room)) ?? { id: room, duelCount: 0, totalPool: 0n };
  context.Room.set({ ...r, duelCount: r.duelCount + 1 });

  const u = await loadUser(context, creator);
  context.User.set({ ...u, duelsCreated: u.duelsCreated + 1 });

  logActivity(context, event, id, creator, "CREATED");
});

indexer.onEvent({ contract: "Pairwise", event: "Predicted" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const user = addr(event.params.user);
  const side = toSide(event.params.side);
  const duel = await context.Duel.getOrThrow(id);

  const [p, isNew] = await loadPosition(context, id, user, event.block.timestamp);
  context.Position.set({ ...p, side, stake: p.stake + event.params.amount });

  context.Duel.set({
    ...duel,
    poolA: event.params.poolA,
    poolB: event.params.poolB,
    predictors: duel.predictors + (isNew ? 1 : 0),
  });

  const r = await context.Room.getOrThrow(duel.room);
  context.Room.set({ ...r, totalPool: r.totalPool + event.params.amount });

  if (isNew) {
    const u = await loadUser(context, user);
    context.User.set({ ...u, predictions: u.predictions + 1 });
  }

  logActivity(context, event, id, user, "PREDICTED", side, event.params.amount);
});

indexer.onEvent({ contract: "Pairwise", event: "VoteCommitted" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const voter = addr(event.params.voter);
  const duel = await context.Duel.getOrThrow(id);

  const [p] = await loadPosition(context, id, voter, event.block.timestamp);
  context.Position.set({ ...p, committed: true });
  context.Duel.set({ ...duel, committedVotes: duel.committedVotes + 1 });

  // Make sure voters appear in User even before they reveal.
  context.User.set(await loadUser(context, voter));

  logActivity(context, event, id, voter, "VOTE_COMMITTED");
});

indexer.onEvent({ contract: "Pairwise", event: "VoteRevealed" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const voter = addr(event.params.voter);
  const side = toSide(event.params.side);
  const duel = await context.Duel.getOrThrow(id);

  const [p] = await loadPosition(context, id, voter, event.block.timestamp);
  context.Position.set({ ...p, revealed: side });
  context.Duel.set({
    ...duel,
    votesA: duel.votesA + (side === "A" ? 1 : 0),
    votesB: duel.votesB + (side === "B" ? 1 : 0),
  });

  const u = await loadUser(context, voter);
  context.User.set({ ...u, votesRevealed: u.votesRevealed + 1 });

  logActivity(context, event, id, voter, "VOTE_REVEALED", side);
});

indexer.onEvent({ contract: "Pairwise", event: "DuelSettled" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const duel = await context.Duel.getOrThrow(id);
  const outcome = OUTCOMES[event.params.outcome.toString()] ?? "OPEN";

  context.Duel.set({
    ...duel,
    outcome,
    votesA: Number(event.params.votesA),
    votesB: Number(event.params.votesB),
    poolA: event.params.poolA,
    poolB: event.params.poolB,
  });

  const winner = outcome === "A" || outcome === "B" ? outcome : undefined;
  logActivity(context, event, id, addr(event.transaction.from ?? duel.creator), "SETTLED", winner);
});

indexer.onEvent({ contract: "Pairwise", event: "Claimed" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const user = addr(event.params.user);
  const duel = await context.Duel.getOrThrow(id);
  const [p] = await loadPosition(context, id, user, event.block.timestamp);
  context.Position.set({ ...p, claimed: true });

  // Refund claims return the stake and earn nothing; only winning claims count.
  if (duel.outcome === "A" || duel.outcome === "B") {
    const u = await loadUser(context, user);
    context.User.set({
      ...u,
      tasteRep: u.tasteRep + Number(event.params.repGained),
      earned: u.earned + (event.params.amount - p.stake),
      correctCalls: u.correctCalls + 1,
    });
  }

  logActivity(context, event, id, user, "CLAIMED", p.side, event.params.amount);
});

indexer.onEvent({ contract: "Pairwise", event: "VoterRewardClaimed" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const voter = addr(event.params.voter);
  const [p] = await loadPosition(context, id, voter, event.block.timestamp);
  context.Position.set({ ...p, voterRewardClaimed: true });

  const u = await loadUser(context, voter);
  context.User.set({ ...u, voterEarned: u.voterEarned + event.params.amount });

  logActivity(context, event, id, voter, "VOTER_REWARD", p.revealed, event.params.amount);
});

indexer.onEvent({ contract: "Pairwise", event: "CreatorPaid" }, async ({ event, context }) => {
  const id = event.params.id.toString();
  const creator = addr(event.params.creator);
  const u = await loadUser(context, creator);
  context.User.set({ ...u, creatorEarned: u.creatorEarned + event.params.amount });

  logActivity(context, event, id, creator, "CREATOR_PAID", undefined, event.params.amount);
});
