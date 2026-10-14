/** Read-only chain access plus the faucet wallet. */
import { createPublicClient, createWalletClient, hexToString, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { CONTRACT, FAUCET_DRIP_MON, FAUCET_PRIVATE_KEY, HAS_CONTRACT, HAS_FAUCET, RPC_URL } from "./env.js";

/** Only the piece of Pairwise this server needs. Full ABI: shared/abi/Pairwise.json. */
const duelAbi = [
  {
    type: "function",
    name: "getDuel",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "duel",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "commitEnd", type: "uint64" },
          { name: "revealEnd", type: "uint64" },
          { name: "outcome", type: "uint8" },
          { name: "room", type: "bytes32" },
          { name: "hashA", type: "bytes32" },
          { name: "hashB", type: "bytes32" },
          { name: "poolA", type: "uint128" },
          { name: "poolB", type: "uint128" },
          { name: "votesA", type: "uint32" },
          { name: "votesB", type: "uint32" },
          { name: "uriA", type: "string" },
          { name: "uriB", type: "string" },
          { name: "title", type: "string" },
        ],
      },
    ],
  },
] as const;

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http(RPC_URL) });

export const OUTCOMES = ["OPEN", "A", "B", "REFUND"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const decodeRoom = (room: `0x${string}`): string => hexToString(room, { size: 32 }).replace(/\0+$/, "");

export interface ChainDuel {
  id: string;
  creator: string;
  room: string;
  title: string;
  uriA: string;
  uriB: string;
  votesA: number;
  votesB: number;
  outcome: Outcome;
}

/** Reads one duel straight from the contract. Null when there is no contract or no such duel. */
export async function readDuelFromChain(id: string): Promise<ChainDuel | null> {
  if (!HAS_CONTRACT) return null;
  const raw = await publicClient.readContract({
    address: CONTRACT as `0x${string}`,
    abi: duelAbi,
    functionName: "getDuel",
    args: [BigInt(id)],
  });
  if (raw.creator === "0x0000000000000000000000000000000000000000") return null;
  return {
    id,
    creator: raw.creator.toLowerCase(),
    room: decodeRoom(raw.room),
    title: raw.title,
    uriA: raw.uriA,
    uriB: raw.uriB,
    votesA: Number(raw.votesA),
    votesB: Number(raw.votesB),
    outcome: OUTCOMES[Number(raw.outcome)] ?? "OPEN",
  };
}

// ---- faucet ----

export const faucetAccount = HAS_FAUCET ? privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`) : null;

const walletClient = faucetAccount
  ? createWalletClient({ account: faucetAccount, chain: monadTestnet, transport: http(RPC_URL) })
  : null;

export const DRIP_WEI = parseEther(FAUCET_DRIP_MON as `${number}`);

export const balanceOf = (address: `0x${string}`): Promise<bigint> => publicClient.getBalance({ address });

/**
 * Sends the drip. Monad bills the declared gas limit, and a plain transfer is exactly 21000, so the
 * limit is passed explicitly rather than left to a client default.
 */
export async function sendDrip(to: `0x${string}`): Promise<`0x${string}`> {
  if (!walletClient || !faucetAccount) throw new Error("No faucet key configured.");
  return walletClient.sendTransaction({
    account: faucetAccount,
    chain: monadTestnet,
    to,
    value: DRIP_WEI,
    gas: 21_000n,
  });
}
