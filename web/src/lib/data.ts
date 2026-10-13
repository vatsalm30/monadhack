/**
 * The only module that knows where data comes from. Everything above it sees plain types.
 *
 * Reads come from Envio HyperIndex when `VITE_ENVIO_URL` is set, otherwise from the in-memory mock
 * in `mock.ts`. A single-duel read falls back to the chain when the indexer has no row yet, which
 * happens for the few seconds after a duel is created.
 */
import { API_URL, CHAIN_READY, ENVIO_URL, USING_MOCK } from "./env";
import * as mock from "./mock";
import { readDuel, readMyState } from "./rpc";
import type {
  ActivityItem,
  ActivityKind,
  Duel,
  Insight,
  Leaderboard,
  LeaderboardRow,
  Outcome,
  Position,
  Side,
  UploadResult,
  UserStats,
} from "./types";

// ---------------------------------------------------------------- GraphQL

class GraphQLError extends Error {}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new GraphQLError(`Indexer returned ${response.status}.`);
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new GraphQLError(body.errors[0]?.message ?? "Indexer query failed.");
  if (!body.data) throw new GraphQLError("Indexer returned no data.");
  return body.data;
}

const DUEL_FIELDS = `
  id creator room title uriA uriB hashA hashB
  createdAt commitEnd revealEnd poolA poolB
  predictors committedVotes votesA votesB outcome
`;

const USER_FIELDS = `
  id tasteRep earned creatorEarned voterEarned
  duelsCreated predictions correctCalls votesRevealed
`;

// Raw rows arrive with numeric fields as strings, which is why nothing below trusts a type.
type RawDuel = Record<string, unknown>;

const big = (v: unknown): bigint => {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && v !== "") return BigInt(v);
  return 0n;
};
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const OUTCOMES: readonly Outcome[] = ["OPEN", "A", "B", "REFUND"];

function toOutcome(v: unknown): Outcome {
  if (typeof v === "number") return OUTCOMES[v] ?? "OPEN";
  const upper = str(v).toUpperCase();
  return (OUTCOMES as readonly string[]).includes(upper) ? (upper as Outcome) : "OPEN";
}

function toSide(v: unknown): Side | null {
  if (typeof v === "number") return v === 1 ? "A" : v === 2 ? "B" : null;
  const upper = str(v).toUpperCase();
  return upper === "A" ? "A" : upper === "B" ? "B" : null;
}

function mapDuel(raw: RawDuel): Duel {
  return {
    id: str(raw.id),
    creator: str(raw.creator).toLowerCase(),
    room: str(raw.room),
    title: str(raw.title),
    uriA: str(raw.uriA),
    uriB: str(raw.uriB),
    hashA: str(raw.hashA),
    hashB: str(raw.hashB),
    createdAt: num(raw.createdAt),
    commitEnd: num(raw.commitEnd),
    revealEnd: num(raw.revealEnd),
    poolA: big(raw.poolA),
    poolB: big(raw.poolB),
    predictors: num(raw.predictors),
    committedVotes: num(raw.committedVotes),
    votesA: num(raw.votesA),
    votesB: num(raw.votesB),
    outcome: toOutcome(raw.outcome),
  };
}

function mapPosition(raw: RawDuel): Position {
  return {
    id: str(raw.id),
    duelId: str(raw.duelId),
    user: str(raw.user).toLowerCase(),
    side: toSide(raw.side),
    stake: big(raw.stake),
    firstAt: num(raw.firstAt),
    claimed: raw.claimed === true,
    committed: raw.committed === true,
    revealed: toSide(raw.revealed),
    voterRewardClaimed: raw.voterRewardClaimed === true,
  };
}

function mapUser(raw: RawDuel): UserStats {
  return {
    id: str(raw.id).toLowerCase(),
    tasteRep: num(raw.tasteRep),
    earned: big(raw.earned),
    creatorEarned: big(raw.creatorEarned),
    voterEarned: big(raw.voterEarned),
    duelsCreated: num(raw.duelsCreated),
    predictions: num(raw.predictions),
    correctCalls: num(raw.correctCalls),
    votesRevealed: num(raw.votesRevealed),
  };
}

const ACTIVITY_KINDS: readonly ActivityKind[] = ["CREATED", "PREDICTED", "COMMITTED", "REVEALED", "SETTLED", "CLAIMED"];

function mapActivity(raw: RawDuel): ActivityItem {
  const kind = str(raw.kind).toUpperCase();
  return {
    id: str(raw.id),
    duelId: str(raw.duelId),
    user: str(raw.user).toLowerCase(),
    kind: (ACTIVITY_KINDS as readonly string[]).includes(kind) ? (kind as ActivityKind) : "CREATED",
    side: toSide(raw.side),
    amount: big(raw.amount),
    timestamp: num(raw.timestamp),
  };
}

// ---------------------------------------------------------------- reads

export async function getFeed(room: string, limit = 24): Promise<Duel[]> {
  if (USING_MOCK) return mock.mockFeed(room);
  const data = await gql<{ Duel: RawDuel[] }>(
    `query Feed($room: String!, $limit: Int!) {
      Duel(where: { room: { _eq: $room } }, order_by: { createdAt: desc }, limit: $limit) { ${DUEL_FIELDS} }
    }`,
    { room, limit },
  );
  return data.Duel.map(mapDuel);
}

export async function getDuel(id: string): Promise<Duel | null> {
  if (USING_MOCK) return mock.mockDuel(id);
  try {
    const data = await gql<{ Duel: RawDuel[] }>(
      `query DuelById($id: String!) { Duel(where: { id: { _eq: $id } }) { ${DUEL_FIELDS} } }`,
      { id },
    );
    const row = data.Duel[0];
    if (row) return mapDuel(row);
  } catch {
    // Indexer unreachable: the chain is still the source of truth.
  }
  return CHAIN_READY ? readDuel(id).catch(() => null) : null;
}

export async function getPositions(user: string, limit = 100): Promise<Position[]> {
  if (USING_MOCK) return mock.mockPositions();
  const data = await gql<{ Position: RawDuel[] }>(
    `query PositionsByUser($user: String!, $limit: Int!) {
      Position(where: { user: { _eq: $user } }, order_by: { firstAt: desc }, limit: $limit) {
        id duelId user side stake firstAt claimed committed revealed voterRewardClaimed
      }
    }`,
    { user: user.toLowerCase(), limit },
  );
  return data.Position.map(mapPosition);
}

/** My stake and ballot on one duel. Falls back to the chain so a fresh transaction shows up at once. */
export async function getMyPosition(duelId: string, user: string): Promise<Position | null> {
  if (USING_MOCK) return mock.mockPosition(duelId);
  const empty: Position = {
    id: `${duelId}_${user.toLowerCase()}`,
    duelId,
    user: user.toLowerCase(),
    side: null,
    stake: 0n,
    firstAt: 0,
    claimed: false,
    committed: false,
    revealed: null,
    voterRewardClaimed: false,
  };
  try {
    const data = await gql<{ Position: RawDuel[] }>(
      `query MyPosition($id: String!) {
        Position(where: { id: { _eq: $id } }) {
          id duelId user side stake firstAt claimed committed revealed voterRewardClaimed
        }
      }`,
      { id: `${duelId}_${user.toLowerCase()}` },
    );
    const row = data.Position[0];
    if (row) return mapPosition(row);
  } catch {
    // fall through to the chain
  }
  if (!CHAIN_READY) return empty;
  const onchain = await readMyState(duelId, user as `0x${string}`);
  return onchain ? { ...empty, ...onchain } : empty;
}

export async function getUser(address: string): Promise<UserStats> {
  const id = address.toLowerCase();
  if (USING_MOCK) return mock.mockUser(id);
  const blank: UserStats = {
    id,
    tasteRep: 0,
    earned: 0n,
    creatorEarned: 0n,
    voterEarned: 0n,
    duelsCreated: 0,
    predictions: 0,
    correctCalls: 0,
    votesRevealed: 0,
  };
  try {
    const data = await gql<{ User: RawDuel[] }>(
      `query UserById($id: String!) { User(where: { id: { _eq: $id } }) { ${USER_FIELDS} } }`,
      { id },
    );
    const row = data.User[0];
    return row ? mapUser(row) : blank;
  } catch {
    return blank;
  }
}

const rank = (rows: UserStats[], by: (u: UserStats) => bigint | number): LeaderboardRow[] =>
  [...rows]
    .sort((a, b) => {
      const left = by(a);
      const right = by(b);
      if (typeof left === "bigint" && typeof right === "bigint") return left === right ? 0 : left > right ? -1 : 1;
      return Number(right) - Number(left);
    })
    .map((u, index) => ({ ...u, rank: index + 1 }))
    .filter((u) => Number(by(u)) > 0 || u.tasteRep > 0);

/**
 * Tastemakers by taste rep, creators by what they have earned as a creator. With a room, both lists
 * are narrowed to addresses that showed up in that room.
 */
export async function getLeaderboard(room?: string, limit = 20): Promise<Leaderboard> {
  if (USING_MOCK) {
    const all = mock.mockUsers();
    const inRoom = room
      ? new Set(
          mock
            .mockFeed(room)
            .flatMap((d) => [d.creator, ...mock.mockActivity(d.id).map((a) => a.user)]),
        )
      : null;
    const scoped = inRoom ? all.filter((u) => inRoom.has(u.id)) : all;
    return {
      tastemakers: rank(scoped, (u) => u.tasteRep).slice(0, limit),
      creators: rank(scoped, (u) => u.creatorEarned).slice(0, limit),
    };
  }

  const global = await gql<{ User: RawDuel[] }>(
    `query Leaderboard($limit: Int!) { User(order_by: { tasteRep: desc }, limit: $limit) { ${USER_FIELDS} } }`,
    { limit: limit * 4 },
  );
  let rows = global.User.map(mapUser);

  if (room) {
    try {
      const scoped = await gql<{ Duel: RawDuel[]; Position: RawDuel[] }>(
        `query RoomPeople($room: String!) {
          Duel(where: { room: { _eq: $room } }) { id creator }
          Position(where: { duel: { room: { _eq: $room } } }, limit: 500) { user }
        }`,
        { room },
      );
      const people = new Set<string>([
        ...scoped.Duel.map((d) => str(d.creator).toLowerCase()),
        ...scoped.Position.map((p) => str(p.user).toLowerCase()),
      ]);
      if (people.size > 0) rows = rows.filter((u) => people.has(u.id));
    } catch {
      // No room scoping available: the global list is still useful.
    }
  }

  return {
    tastemakers: rank(rows, (u) => u.tasteRep).slice(0, limit),
    creators: rank(rows, (u) => u.creatorEarned).slice(0, limit),
  };
}

export async function getActivity(duelId: string, limit = 50): Promise<ActivityItem[]> {
  if (USING_MOCK) return mock.mockActivity(duelId);
  try {
    const data = await gql<{ Activity: RawDuel[] }>(
      `query ActivityByDuel($duelId: String!, $limit: Int!) {
        Activity(where: { duelId: { _eq: $duelId } }, order_by: { timestamp: desc }, limit: $limit) {
          id duelId user kind side amount timestamp
        }
      }`,
      { duelId, limit },
    );
    return data.Activity.map(mapActivity);
  } catch {
    return [];
  }
}

/** My duels, newest first. Reads the room feeds in mock mode, one query otherwise. */
export async function getDuelsByCreator(creator: string, limit = 50): Promise<Duel[]> {
  const id = creator.toLowerCase();
  if (USING_MOCK) {
    return (["purdue", "lafayette", "open"] as const)
      .flatMap((room) => mock.mockFeed(room))
      .filter((d) => d.creator === id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  const data = await gql<{ Duel: RawDuel[] }>(
    `query DuelsByCreator($creator: String!, $limit: Int!) {
      Duel(where: { creator: { _eq: $creator } }, order_by: { createdAt: desc }, limit: $limit) { ${DUEL_FIELDS} }
    }`,
    { creator: id, limit },
  );
  return data.Duel.map(mapDuel);
}

// ---------------------------------------------------------------- server API

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (API_URL === "") throw new Error("No API configured. Set VITE_API_URL.");
  const response = await fetch(`${API_URL}${path}`, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed with ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

/** `null` when the duel has no insight yet: not settled, refunded, or the model declined. */
export async function getInsight(duelId: string): Promise<Insight | null> {
  if (USING_MOCK) return mock.mockInsight(duelId);
  try {
    return await api<Insight>(`/api/insight/${duelId}`);
  } catch {
    return null;
  }
}

export async function uploadPair(a: File, b: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("a", a);
  form.append("b", b);
  return api<UploadResult>("/api/upload", { method: "POST", body: form });
}

/** Gas for a brand-new passkey account. Never throws: a dry faucet must not block sign-in. */
export async function drip(address: string): Promise<{ hash?: string; skipped?: string }> {
  try {
    return await api<{ hash?: string; skipped?: string }>("/api/drip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch (error) {
    return { skipped: error instanceof Error ? error.message : "Faucet unavailable." };
  }
}

export { USING_MOCK };
