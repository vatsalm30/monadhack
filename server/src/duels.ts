/**
 * One duel, from whichever source can answer.
 *
 * The indexer is asked first: it is a single GraphQL round trip, it already decoded the room slug,
 * and it does not spend an RPC call. The contract is the fallback, so a lagging or offline indexer
 * never takes the insight endpoint down with it.
 */
import { readDuelFromChain, type ChainDuel } from "./chain.js";
import { ENVIO_URL } from "./env.js";
import { log } from "./log.js";

const QUERY = `query DuelForInsight($id: String!) {
  Duel(where: { id: { _eq: $id } }) {
    id creator room title uriA uriB votesA votesB outcome
  }
}`;

interface Row {
  id?: unknown;
  creator?: unknown;
  room?: unknown;
  title?: unknown;
  uriA?: unknown;
  uriB?: unknown;
  votesA?: unknown;
  votesB?: unknown;
  outcome?: unknown;
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const int = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

async function fromIndexer(id: string): Promise<ChainDuel | null> {
  if (ENVIO_URL === "") return null;
  const response = await fetch(ENVIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { id } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Indexer returned ${response.status}.`);
  const body = (await response.json()) as { data?: { Duel?: Row[] }; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors[0]?.message ?? "Indexer query failed.");
  const row = body.data?.Duel?.[0];
  if (!row) return null;

  const outcome = text(row.outcome).toUpperCase();
  return {
    id: text(row.id),
    creator: text(row.creator).toLowerCase(),
    room: text(row.room),
    title: text(row.title),
    uriA: text(row.uriA),
    uriB: text(row.uriB),
    votesA: int(row.votesA),
    votesB: int(row.votesB),
    outcome: outcome === "A" || outcome === "B" || outcome === "REFUND" ? outcome : "OPEN",
  };
}

/** Indexer first, contract second. Returns null only when neither source knows the duel. */
export async function getDuel(id: string): Promise<{ duel: ChainDuel | null; source: "indexer" | "chain" | "none" }> {
  try {
    const indexed = await fromIndexer(id);
    if (indexed) return { duel: indexed, source: "indexer" };
  } catch (error) {
    log.warn(`Indexer lookup failed for duel ${id}, falling back to RPC.`, error instanceof Error ? error.message : error);
  }
  try {
    const onchain = await readDuelFromChain(id);
    if (onchain) return { duel: onchain, source: "chain" };
  } catch (error) {
    log.warn(`RPC lookup failed for duel ${id}.`, error instanceof Error ? error.message : error);
  }
  return { duel: null, source: "none" };
}
