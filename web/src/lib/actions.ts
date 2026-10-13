/**
 * Every write the UI can perform, in one place.
 *
 * With a contract configured these are real transactions; without one they drive the mock so the
 * whole flow stays clickable before deployment. Vote commitments are derived from the passkey here,
 * never stored.
 */
import { stringToHex } from "viem";
import { requireAddress, currentVoteKey } from "./account";
import { ballotFor, commitmentFor, saltFor } from "./ballot";
import { write } from "./chain";
import { CHAIN_READY, CONTRACT, MONAD_TESTNET_ID } from "./env";
import * as mock from "./mock";
import { readCommitment } from "./rpc";
import { SIDE } from "./abi";
import type { Side } from "./types";

export interface CreateDuelInput {
  room: string;
  title: string;
  uriA: string;
  uriB: string;
  hashA: `0x${string}`;
  hashB: `0x${string}`;
  /** Seconds of commit phase. */
  commitDuration: number;
}

function voteKeyOrThrow(): Uint8Array {
  const key = currentVoteKey();
  if (!key) throw new Error("Sign in with your passkey first.");
  return key;
}

/** Rooms are stored as bytes32 so the indexer can decode them back to a slug. */
export const encodeRoom = (room: string): `0x${string}` => {
  if (room.length > 31) throw new Error("Room names are 31 characters at most.");
  return stringToHex(room, { size: 32 });
};

export async function createDuel(input: CreateDuelInput): Promise<string> {
  if (!CHAIN_READY) return mock.mockCreateDuel(input);
  const { receipt } = await write({
    functionName: "createDuel",
    args: [
      encodeRoom(input.room),
      input.title,
      input.uriA,
      input.uriB,
      input.hashA,
      input.hashB,
      BigInt(input.commitDuration),
    ],
  });
  // DuelCreated puts the id in the first indexed topic.
  const log = receipt.logs.find((entry) => entry.address.toLowerCase() === CONTRACT.toLowerCase() && entry.topics[1]);
  return log?.topics[1] ? BigInt(log.topics[1]).toString() : "";
}

export async function predict(duelId: string, side: Side, amountWei: bigint): Promise<void> {
  if (amountWei <= 0n) throw new Error("Enter an amount above zero.");
  if (!CHAIN_READY) {
    mock.mockPredict(duelId, side, amountWei);
    return;
  }
  await write({ functionName: "predict", args: [BigInt(duelId), SIDE[side]], value: amountWei });
}

/** Commits a blind vote. The salt comes from the passkey, so nothing needs saving for the reveal. */
export async function commitVote(duelId: string, side: Side): Promise<void> {
  const voter = requireAddress();
  if (!CHAIN_READY) {
    mock.mockCommitVote(duelId, side);
    return;
  }
  const { commitment } = ballotFor(voteKeyOrThrow(), duelId, side, voter, CONTRACT, MONAD_TESTNET_ID);
  await write({ functionName: "commitVote", args: [BigInt(duelId), commitment] });
}

/**
 * Recovers which side this passkey committed to, by re-deriving the salt and testing both sides
 * against the stored commitment. This is why reveal needs no local state and no memory from the
 * voter: the only input is the passkey itself.
 */
export async function recoverCommittedSide(duelId: string): Promise<Side | null> {
  if (!CHAIN_READY) return mock.mockCommittedSide(duelId);
  const voter = requireAddress();
  const stored = await readCommitment(duelId, voter);
  if (!stored || /^0x0+$/.test(stored)) return null;
  const salt = saltFor(voteKeyOrThrow(), duelId, CONTRACT, MONAD_TESTNET_ID);
  for (const side of ["A", "B"] as const) {
    if (commitmentFor(duelId, side, salt, voter) === stored) return side;
  }
  return null;
}

export async function revealVote(duelId: string, side: Side): Promise<void> {
  requireAddress();
  if (!CHAIN_READY) {
    mock.mockRevealVote(duelId, side);
    return;
  }
  const salt = saltFor(voteKeyOrThrow(), duelId, CONTRACT, MONAD_TESTNET_ID);
  await write({ functionName: "revealVote", args: [BigInt(duelId), SIDE[side], salt] });
}

export async function settle(duelId: string): Promise<void> {
  if (!CHAIN_READY) {
    mock.mockSettle(duelId);
    return;
  }
  await write({ functionName: "settle", args: [BigInt(duelId)] });
}

export async function claim(duelId: string): Promise<void> {
  if (!CHAIN_READY) {
    mock.mockClaim(duelId, "WINNINGS");
    return;
  }
  await write({ functionName: "claim", args: [BigInt(duelId)] });
}

export async function claimVoterReward(duelId: string): Promise<void> {
  if (!CHAIN_READY) {
    mock.mockClaim(duelId, "VOTER");
    return;
  }
  await write({ functionName: "claimVoterReward", args: [BigInt(duelId)] });
}

export async function claimCreator(duelId: string): Promise<void> {
  if (!CHAIN_READY) {
    mock.mockClaim(duelId, "CREATOR");
    return;
  }
  await write({ functionName: "claimCreator", args: [BigInt(duelId)] });
}
