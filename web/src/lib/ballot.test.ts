import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { keccak256, numberToBytes, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { ballotFor, commitmentFor, deriveVoteKey, saltFor, saltMessage } from "./ballot";

const hexBytes = (hex: string): Uint8Array =>
  Uint8Array.from((hex.replace(/^0x/, "").match(/../g) ?? []).map((byte) => Number.parseInt(byte, 16)));

/** Fixed vector. Any change to the derivation or the encoding breaks every reveal, so it is pinned. */
const VECTOR = {
  prfOutput: new Uint8Array(32).fill(7),
  duelId: "42",
  side: "B" as const,
  voter: "0x1111111111111111111111111111111111111111" as const,
  contract: "0x2222222222222222222222222222222222222222" as const,
  chainId: 10143,
  voteKey: "0x70fa433b7b8a6ceb6d102268369e2f4e4eabf59d6d13f56dcdb6707b06d6eba3",
  salt: "0xeeaf40536dfd2ec471c7e6170c8d60b664625a7ee5587663827088b64f02944b" as const,
  commitment: "0xfb8910d2a554a409a0797528549731198ad05e1cf8078644981fe39cb1c44eec",
};

/**
 * `abi.encode(uint256,uint8,bytes32,address)` built by hand: four 32-byte words, the small types
 * left-padded. This is the contract's formula written out, so comparing against it checks the
 * encoder rather than restating it.
 */
function contractFormula(duelId: bigint, side: 1 | 2, salt: `0x${string}`, voter: `0x${string}`): `0x${string}` {
  const words = new Uint8Array(128);
  words.set(numberToBytes(duelId, { size: 32 }), 0);
  words.set(numberToBytes(BigInt(side), { size: 32 }), 32);
  words.set(hexBytes(salt), 64);
  words.set(hexBytes(voter), 108); // address is right-aligned in its word
  return keccak256(words);
}

describe("commitment", () => {
  it("matches keccak256(abi.encode(id, side, salt, voter))", () => {
    const ours = commitmentFor(VECTOR.duelId, VECTOR.side, VECTOR.salt, VECTOR.voter);
    expect(ours).toBe(contractFormula(42n, 2, VECTOR.salt, VECTOR.voter));
    expect(ours).toBe(VECTOR.commitment);
  });

  it("binds the side, so a wrong reveal cannot match", () => {
    const a = commitmentFor(VECTOR.duelId, "A", VECTOR.salt, VECTOR.voter);
    const b = commitmentFor(VECTOR.duelId, "B", VECTOR.salt, VECTOR.voter);
    expect(a).not.toBe(b);
  });

  it("binds the voter, so nobody can reveal someone else's ballot", () => {
    const other = "0x3333333333333333333333333333333333333333" as const;
    expect(commitmentFor(VECTOR.duelId, VECTOR.side, VECTOR.salt, other)).not.toBe(VECTOR.commitment);
  });

  it("binds the duel id", () => {
    expect(commitmentFor("43", VECTOR.side, VECTOR.salt, VECTOR.voter)).not.toBe(VECTOR.commitment);
  });
});

describe("vote key", () => {
  it("is 32 bytes and pinned to the PRF output", () => {
    const key = deriveVoteKey(VECTOR.prfOutput);
    expect(key).toHaveLength(32);
    expect(toHex(key)).toBe(VECTOR.voteKey);
  });

  it("is domain-separated from the wallet derivation", () => {
    const key = deriveVoteKey(VECTOR.prfOutput);
    // Same PRF output, different HKDF info: an unrelated key.
    const walletish = hkdf(
      sha256,
      VECTOR.prfOutput,
      new TextEncoder().encode("pairwise"),
      new TextEncoder().encode("pairwise/wallet-key/v1"),
      32,
    );
    expect(toHex(key)).not.toBe(toHex(walletish));
    expect(toHex(key)).not.toBe(toHex(VECTOR.prfOutput));
  });

  it("rejects a PRF output that is not 32 bytes", () => {
    expect(() => deriveVoteKey(new Uint8Array(16))).toThrow();
  });
});

describe("salt", () => {
  it("is pinned for the vector", () => {
    const key = deriveVoteKey(VECTOR.prfOutput);
    expect(saltFor(key, VECTOR.duelId, VECTOR.contract, VECTOR.chainId)).toBe(VECTOR.salt);
  });

  it("commits chainId, contract and duel id in that order", () => {
    const message = saltMessage(42n, VECTOR.contract, VECTOR.chainId);
    expect(message).toHaveLength(60);
    expect(toHex(message.slice(0, 8))).toBe("0x000000000000279f"); // 10143
    expect(toHex(message.slice(8, 28))).toBe(VECTOR.contract);
    expect(toHex(message.slice(28))).toBe(`0x${(42).toString(16).padStart(64, "0")}`);
  });

  it("differs per duel, per contract and per chain", () => {
    const key = deriveVoteKey(VECTOR.prfOutput);
    const base = saltFor(key, "42", VECTOR.contract, VECTOR.chainId);
    expect(saltFor(key, "43", VECTOR.contract, VECTOR.chainId)).not.toBe(base);
    expect(saltFor(key, "42", "0x4444444444444444444444444444444444444444", VECTOR.chainId)).not.toBe(base);
    expect(saltFor(key, "42", VECTOR.contract, 143)).not.toBe(base);
  });
});

describe("reveal from a fresh session", () => {
  it("reproduces the commitment with nothing stored", () => {
    // Commit on one device.
    const committed = ballotFor(
      deriveVoteKey(VECTOR.prfOutput),
      VECTOR.duelId,
      VECTOR.side,
      VECTOR.voter,
      VECTOR.contract,
      VECTOR.chainId,
    );

    // A different device, a new sign-in: same passkey, so the same PRF output and nothing else.
    const freshPrf = Uint8Array.from(VECTOR.prfOutput);
    const revealed = ballotFor(
      deriveVoteKey(freshPrf),
      VECTOR.duelId,
      VECTOR.side,
      VECTOR.voter,
      VECTOR.contract,
      VECTOR.chainId,
    );

    expect(revealed.salt).toBe(committed.salt);
    expect(revealed.commitment).toBe(committed.commitment);
    expect(revealed.commitment).toBe(VECTOR.commitment);
  });
});
