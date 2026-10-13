/**
 * Secret ballots from one passkey, with nothing stored anywhere.
 *
 * A commit-reveal vote needs a salt at commit time and the same salt at reveal time. Most apps keep
 * it in localStorage and lose the vote when the browser is cleared or the user moves to a phone.
 * Here the salt is *derived*: the passkey's PRF output is run through HKDF into a vote key, and each
 * duel's salt is an HMAC over that key. The same passkey therefore reproduces the same salt on any
 * device, so a vote committed on a laptop can be revealed from a phone with zero synced state.
 *
 * The vote key is domain-separated from the wallet key: the wallet uses the PRF output as BIP-39
 * entropy, this uses it as HKDF input keying material with its own salt and info string. Neither
 * derivation can be used to recover the other, and the vote key lives only in memory.
 */
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { encodeAbiParameters, keccak256, numberToBytes, toHex } from "viem";
import { CONTRACT, MONAD_TESTNET_ID } from "./env";
import { SIDE } from "./abi";
import type { Side } from "./types";

const HKDF_SALT = new TextEncoder().encode("pairwise");
const HKDF_INFO = new TextEncoder().encode("pairwise/vote-key/v1");

/** HKDF-SHA256(prfOutput, salt="pairwise", info="pairwise/vote-key/v1") → 32 bytes. */
export function deriveVoteKey(prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes.");
  return hkdf(sha256, prfOutput, HKDF_SALT, HKDF_INFO, 32);
}

const hexToBytes20 = (address: string): Uint8Array => {
  const clean = address.replace(/^0x/, "").toLowerCase();
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2) || "0", 16);
  return out;
};

/**
 * Message HMACed to produce a duel's salt: chainId ‖ contract ‖ duelId, as
 * uint64 big-endian (8 bytes) ‖ address (20 bytes) ‖ uint256 big-endian (32 bytes) = 60 bytes.
 * Binding the chain and the contract means the same passkey produces unrelated salts on a redeploy.
 */
export function saltMessage(duelId: bigint, contract: string, chainId: number): Uint8Array {
  const message = new Uint8Array(60);
  message.set(numberToBytes(BigInt(chainId), { size: 8 }), 0);
  message.set(hexToBytes20(contract), 8);
  message.set(numberToBytes(duelId, { size: 32 }), 28);
  return message;
}

/** HMAC-SHA256(voteKey, chainId ‖ contract ‖ duelId) as bytes32. */
export function saltFor(
  voteKey: Uint8Array,
  duelId: string | bigint,
  contract: string = CONTRACT,
  chainId: number = MONAD_TESTNET_ID,
): `0x${string}` {
  const message = saltMessage(BigInt(duelId), contract, chainId);
  return toHex(hmac(sha256, voteKey, message));
}

/** Matches `Pairwise.commitmentFor`: keccak256(abi.encode(id, side, salt, voter)). */
export function commitmentFor(
  duelId: string | bigint,
  side: Side,
  salt: `0x${string}`,
  voter: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint8" }, { type: "bytes32" }, { type: "address" }],
      [BigInt(duelId), SIDE[side], salt, voter],
    ),
  );
}

/** Everything needed to commit a vote, and later to reveal it. */
export function ballotFor(
  voteKey: Uint8Array,
  duelId: string,
  side: Side,
  voter: `0x${string}`,
  contract: string = CONTRACT,
  chainId: number = MONAD_TESTNET_ID,
): { salt: `0x${string}`; commitment: `0x${string}` } {
  const salt = saltFor(voteKey, duelId, contract, chainId);
  return { salt, commitment: commitmentFor(duelId, side, salt, voter) };
}
