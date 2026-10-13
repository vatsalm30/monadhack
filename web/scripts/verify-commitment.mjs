/**
 * Checks the TypeScript commitment against the deployed contract's own `commitmentFor` view.
 *
 * The unit test pins the formula locally; this proves the deployed bytecode agrees. Run it once the
 * contract address is known:
 *
 *   VITE_CONTRACT=0x… node scripts/verify-commitment.mjs
 */
import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { encodeAbiParameters, keccak256, numberToBytes, toHex } from "viem";

const contract = (process.env.VITE_CONTRACT ?? "").trim();
if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) {
  console.error("Set VITE_CONTRACT to the deployed Pairwise address.");
  process.exit(1);
}

const chainId = 10143;
const duelId = 1n;
const side = 1; // Side.A
const voter = "0x1111111111111111111111111111111111111111";

const prfOutput = new Uint8Array(32).fill(7);
const enc = new TextEncoder();
const voteKey = hkdf(sha256, prfOutput, enc.encode("pairwise"), enc.encode("pairwise/vote-key/v1"), 32);

const message = new Uint8Array(60);
message.set(numberToBytes(BigInt(chainId), { size: 8 }), 0);
message.set(Uint8Array.from((contract.slice(2).match(/../g) ?? []).map((b) => Number.parseInt(b, 16))), 8);
message.set(numberToBytes(duelId, { size: 32 }), 28);
const salt = toHex(hmac(sha256, voteKey, message));

const local = keccak256(
  encodeAbiParameters(
    [{ type: "uint256" }, { type: "uint8" }, { type: "bytes32" }, { type: "address" }],
    [duelId, side, salt, voter],
  ),
);

const client = createPublicClient({ chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz") });
const onchain = await client.readContract({
  address: contract,
  abi: [
    {
      type: "function",
      name: "commitmentFor",
      stateMutability: "pure",
      inputs: [
        { name: "id", type: "uint256" },
        { name: "side", type: "uint8" },
        { name: "salt", type: "bytes32" },
        { name: "voter", type: "address" },
      ],
      outputs: [{ type: "bytes32" }],
    },
  ],
  functionName: "commitmentFor",
  args: [duelId, side, salt, voter],
});

console.log("salt      ", salt);
console.log("typescript", local);
console.log("contract  ", onchain);
if (local !== onchain) {
  console.error("MISMATCH: reveals would fail. Fix lib/ballot.ts before shipping.");
  process.exit(1);
}
console.log("match: reveals will verify onchain.");
