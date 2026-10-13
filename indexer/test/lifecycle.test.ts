import { describe, it } from "vitest";
import { createTestIndexer } from "envio";
import { decodeRoom } from "../src/room";

const CREATOR = "0x00000000000000000000000000000000000000C0";
const ALICE = "0x00000000000000000000000000000000000000A1";
const CAROL = "0x00000000000000000000000000000000000000C2";
const VOTER = "0x00000000000000000000000000000000000000B0";
// "purdue" right-padded to 32 bytes, as viem stringToHex(slug, { size: 32 }) does.
const PURDUE = "0x" + Buffer.from("purdue").toString("hex").padEnd(64, "0");
const E = 10n ** 18n;

const at = (n: number) => ({ number: 70808500 + n, timestamp: 1_760_000_000 + n * 10 });

describe("Pairwise lifecycle", () => {
  it("decodes room slugs", (t) => {
    t.expect(decodeRoom(PURDUE)).toBe("purdue");
  });

  it("tracks a duel from creation to claims", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            {
              contract: "Pairwise",
              event: "DuelCreated",
              block: at(0),
              params: {
                id: 0n, creator: CREATOR, room: PURDUE, title: "Sunset study",
                uriA: "https://x/a.png", uriB: "https://x/b.png",
                hashA: "0x" + "aa".repeat(32), hashB: "0x" + "bb".repeat(32),
                commitEnd: 1_760_000_600n, revealEnd: 1_760_000_780n,
              },
            },
            { contract: "Pairwise", event: "Predicted", block: at(1), params: { id: 0n, user: ALICE, side: 1n, amount: 1n * E, poolA: 1n * E, poolB: 0n } },
            { contract: "Pairwise", event: "Predicted", block: at(2), params: { id: 0n, user: ALICE, side: 1n, amount: 1n * E, poolA: 2n * E, poolB: 0n } },
            { contract: "Pairwise", event: "Predicted", block: at(3), params: { id: 0n, user: CAROL, side: 2n, amount: 2n * E, poolA: 2n * E, poolB: 2n * E } },
            { contract: "Pairwise", event: "VoteCommitted", block: at(4), params: { id: 0n, voter: VOTER } },
            { contract: "Pairwise", event: "VoteRevealed", block: at(5), params: { id: 0n, voter: VOTER, side: 1n } },
            {
              contract: "Pairwise", event: "DuelSettled", block: at(6), transaction: { from: CAROL },
              params: { id: 0n, outcome: 1n, votesA: 1n, votesB: 0n, poolA: 2n * E, poolB: 2n * E },
            },
            { contract: "Pairwise", event: "Claimed", block: at(7), params: { id: 0n, user: ALICE, amount: 372n * E / 100n, repGained: 99n } },
            { contract: "Pairwise", event: "VoterRewardClaimed", block: at(8), params: { id: 0n, voter: VOTER, amount: 8n * E / 100n } },
            { contract: "Pairwise", event: "CreatorPaid", block: at(9), params: { id: 0n, creator: CREATOR, amount: 2n * E / 10n } },
          ],
        },
      },
    });

    const duel = await indexer.Duel.getOrThrow("0");
    t.expect(duel.room).toBe("purdue");
    t.expect(duel.creator).toBe(CREATOR.toLowerCase());
    t.expect(duel.outcome).toBe("A");
    t.expect(duel.predictors).toBe(2);
    t.expect(duel.committedVotes).toBe(1);
    t.expect(duel.votesA).toBe(1);
    t.expect(duel.poolA + duel.poolB).toBe(4n * E);

    const room = await indexer.Room.getOrThrow("purdue");
    t.expect(room.duelCount).toBe(1);
    t.expect(room.totalPool).toBe(4n * E);

    const pos = await indexer.Position.getOrThrow(`0_${ALICE.toLowerCase()}`);
    t.expect(pos.side).toBe("A");
    t.expect(pos.stake).toBe(2n * E);
    t.expect(pos.firstAt).toBe(at(1).timestamp);
    t.expect(pos.claimed).toBe(true);

    const alice = await indexer.User.getOrThrow(ALICE.toLowerCase());
    t.expect(alice.earned).toBe(172n * E / 100n); // 3.72 payout - 2 stake
    t.expect(alice.tasteRep).toBe(99);
    t.expect(alice.correctCalls).toBe(1);
    t.expect(alice.predictions).toBe(1);

    const voter = await indexer.User.getOrThrow(VOTER.toLowerCase());
    t.expect(voter.votesRevealed).toBe(1);
    t.expect(voter.voterEarned).toBe(8n * E / 100n);

    const creator = await indexer.User.getOrThrow(CREATOR.toLowerCase());
    t.expect(creator.duelsCreated).toBe(1);
    t.expect(creator.creatorEarned).toBe(2n * E / 10n);

    const vpos = await indexer.Position.getOrThrow(`0_${VOTER.toLowerCase()}`);
    t.expect(vpos.committed).toBe(true);
    t.expect(vpos.revealed).toBe("A");
    t.expect(vpos.voterRewardClaimed).toBe(true);
    t.expect(vpos.side).toBeUndefined();
  });

  it("refund claims do not count as earnings", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            {
              contract: "Pairwise", event: "DuelCreated", block: at(0),
              params: {
                id: 0n, creator: CREATOR, room: PURDUE, title: "t", uriA: "a", uriB: "b",
                hashA: "0x" + "aa".repeat(32), hashB: "0x" + "bb".repeat(32),
                commitEnd: 1_760_000_600n, revealEnd: 1_760_000_780n,
              },
            },
            { contract: "Pairwise", event: "Predicted", block: at(1), params: { id: 0n, user: ALICE, side: 1n, amount: E, poolA: E, poolB: 0n } },
            {
              contract: "Pairwise", event: "DuelSettled", block: at(2), transaction: { from: ALICE },
              params: { id: 0n, outcome: 3n, votesA: 0n, votesB: 0n, poolA: E, poolB: 0n },
            },
            { contract: "Pairwise", event: "Claimed", block: at(3), params: { id: 0n, user: ALICE, amount: E, repGained: 0n } },
          ],
        },
      },
    });

    t.expect((await indexer.Duel.getOrThrow("0")).outcome).toBe("REFUND");
    const alice = await indexer.User.getOrThrow(ALICE.toLowerCase());
    t.expect(alice.earned).toBe(0n);
    t.expect(alice.correctCalls).toBe(0);
  });
});
