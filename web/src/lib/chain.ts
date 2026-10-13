/**
 * Writes to Monad. Two things matter here:
 *
 * 1. Monad charges the *declared* gas limit, not the gas used, so every call estimates and passes an
 *    explicit limit (estimate × 1.2) instead of letting a client default stand.
 * 2. The signer is the passkey session from account.ts, so nothing here prompts the user again.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  http,
  type Abi,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { monadTestnet } from "viem/chains";
import { pairwiseAbi } from "./abi";
import { currentAccount, requireAddress, touch } from "./account";
import { CHAIN_READY, CONTRACT, RPC_URL } from "./env";
import { publicClient } from "./rpc";

type WriteName = "createDuel" | "predict" | "commitVote" | "revealVote" | "settle" | "claim" | "claimVoterReward" | "claimCreator";

export interface WriteRequest {
  functionName: WriteName;
  args: readonly unknown[];
  /** Wei to send with the call. */
  value?: bigint;
}

/** Gas buffer over the estimate. Monad bills the limit, so this is real money: keep it tight. */
const GAS_BUFFER_NUMERATOR = 12n;
const GAS_BUFFER_DENOMINATOR = 10n;

const CONTRACT_ERRORS: Record<string, string> = {
  BadPhase: "That phase has closed. Reload the duel to see where it is now.",
  BadInput: "The contract rejected those inputs. Check the amount and try again.",
  Conflict:
    "You cannot do both on one duel: predictors cannot vote, voters cannot predict, and the creator can do neither.",
  AlreadyDone: "That is already done for this duel.",
  NothingOwed: "There is nothing to claim here.",
  TransferFailed: "The payout transfer failed. Try again in a moment.",
};

/** Turns a viem revert into one sentence a person can act on. */
export function describeTxError(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
      if (reverted.reason) return reverted.reason;
    }
    if (/insufficient funds/i.test(error.message)) {
      return "Not enough MON for this transaction and its gas. Ask for a drip or top up from faucet.monad.xyz.";
    }
    if (/User rejected|denied/i.test(error.message)) return "Transaction cancelled.";
    return error.shortMessage || error.message;
  }
  if (error instanceof Error) return error.message;
  return "The transaction failed. Try again.";
}

function requireContract(): `0x${string}` {
  if (!CHAIN_READY) throw new Error("No contract configured yet. Set VITE_CONTRACT to the deployed address.");
  return CONTRACT as `0x${string}`;
}

/**
 * Estimates gas, sends with an explicit limit, then waits for the receipt.
 *
 * The ABI is widened to `Abi` here because `functionName` is dynamic; callers get their type
 * checking from the thin wrappers in actions.ts. Custom errors still decode at runtime.
 */
const abi = pairwiseAbi as unknown as Abi;

export async function write(request: WriteRequest): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  const account = currentAccount();
  if (!account) throw new Error("Sign in with your passkey first.");
  touch();

  const address = requireContract();
  const value = request.value ?? 0n;

  const estimate = await publicClient.estimateContractGas({
    address,
    abi,
    functionName: request.functionName,
    args: request.args,
    account,
    value,
  });
  const gas = (estimate * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;

  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(RPC_URL) });
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: request.functionName,
    args: request.args,
    chain: monadTestnet,
    account,
    gas,
    value,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error("The transaction reverted onchain.");
  return { hash, receipt };
}

/** Native balance of the signed-in account. */
export async function myBalance(): Promise<bigint> {
  return publicClient.getBalance({ address: requireAddress() });
}
