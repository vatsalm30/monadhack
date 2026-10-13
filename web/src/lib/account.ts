/**
 * The account layer is a passkey. There is no wallet to connect, no seed phrase to write down, and
 * nothing secret in localStorage — only the credential id, which is public.
 *
 * Sign-in runs one WebAuthn PRF ceremony. The 32-byte PRF output is used twice, under separate
 * domains: once as BIP-39 entropy for the EVM key, and once (in ballot.ts) as HKDF input keying
 * material for the vote key. Both live in memory and are dropped on sign-out or idle timeout.
 */
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { useSyncExternalStore } from "react";
import type { LocalAccount } from "viem";
import { deriveVoteKey } from "./ballot";
import { drip } from "./data";

const STORAGE_KEY = "pairwise.credential.v1";
const IDLE_MS = 15 * 60 * 1000;
/** Below this, a returning account gets another drip so it can still transact. */
const LOW_BALANCE_WEI = 10_000_000_000_000_000n; // 0.01 MON

export interface StoredCredential {
  credentialId: string;
  transports?: readonly string[];
  label: string;
  createdAt: number;
}

export type AccountStatus = "signed-out" | "working" | "signed-in";

export interface AccountState {
  status: AccountStatus;
  /** Set while signed in. */
  address: `0x${string}` | null;
  /** Credential metadata for the passkey last used here, if any. */
  known: StoredCredential | null;
  error: string | null;
  /** Human-readable note about the gas drip, shown once after sign-in. */
  notice: string | null;
}

// ---- persisted credential metadata (public values only) ----

function loadKnown(): StoredCredential | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCredential>;
    if (typeof parsed.credentialId !== "string" || parsed.credentialId === "") return null;
    return {
      credentialId: parsed.credentialId,
      ...(Array.isArray(parsed.transports) ? { transports: parsed.transports as readonly string[] } : {}),
      label: typeof parsed.label === "string" ? parsed.label : "My passkey",
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
    };
  } catch {
    return null;
  }
}

function saveKnown(credential: StoredCredential): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credential));
  } catch {
    // Private mode or blocked storage: sign-in still works, the passkey is just not pre-selected.
  }
}

export function forgetKnown(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to do
  }
  state = { ...state, known: null };
  emit();
}

// ---- in-memory session ----

interface LiveSession {
  session: Secp256k1SigningSession;
  account: LocalAccount;
  /** HKDF output used to derive per-duel ballot salts. Never persisted. */
  voteKey: Uint8Array;
  idleTimer: ReturnType<typeof setTimeout>;
}

let live: LiveSession | null = null;

let state: AccountState = {
  status: "signed-out",
  address: null,
  known: typeof localStorage === "undefined" ? null : loadKnown(),
  error: null,
  notice: null,
};

const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getState = (): AccountState => state;

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The live viem account, or null when signed out. Writes go through lib/chain.ts. */
export const currentAccount = (): LocalAccount | null => live?.account ?? null;

/** The ballot key for this session, or null when signed out. */
export const currentVoteKey = (): Uint8Array | null => live?.voteKey ?? null;

/** Pushes the idle timeout back. Called on user interaction and before every write. */
export function touch(): void {
  if (!live) return;
  clearTimeout(live.idleTimer);
  live.idleTimer = setTimeout(() => signOut("Signed out after 15 minutes idle. Sign in again to continue."), IDLE_MS);
}

export function signOut(reason: string | null = null): void {
  if (live) {
    clearTimeout(live.idleTimer);
    try {
      live.session.end();
    } catch {
      // already ended
    }
    live.voteKey.fill(0);
  }
  live = null;
  state = { status: "signed-out", address: null, known: state.known, error: reason, notice: null };
  emit();
}

export function clearError(): void {
  if (state.error === null && state.notice === null) return;
  state = { ...state, error: null, notice: null };
  emit();
}

// ---- key derivation ----

/**
 * PRF output → BIP-39 entropy → seed → `m/44'/60'/0'/0/0`. Deterministic, so the same passkey
 * always yields the same address on any device.
 */
function evmPrivateKey(prfOutput: Uint8Array): Uint8Array {
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new Error("Could not derive a key from this passkey.");
  return node.privateKey;
}

function startSession(prfOutput: Uint8Array): LocalAccount {
  const privateKey = evmPrivateKey(prfOutput);
  const session = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  const account = toViemAccount(session);
  const voteKey = deriveVoteKey(prfOutput);
  prfOutput.fill(0);
  live = {
    session,
    account,
    voteKey,
    idleTimer: setTimeout(() => signOut("Signed out after 15 minutes idle. Sign in again to continue."), IDLE_MS),
  };
  return account;
}

// ---- errors ----

const MERA_MESSAGES: Record<string, string> = {
  PRF_UNAVAILABLE:
    "This passkey cannot derive keys. In Chrome on desktop the passkey must be saved to Google Password Manager, not to the device alone — delete it in chrome://settings/passkeys and create it again. Safari with iCloud Keychain works as is.",
  PASSKEY_OPERATION_FAILED: "The passkey prompt was cancelled or unavailable. Try again.",
  CRYPTO_UNAVAILABLE: "This browser has no secure crypto. Open Pairwise over https, or use a different browser.",
  SESSION_ENDED: "The session expired. Sign in again.",
  INPUT_INVALID: "That passkey is not usable here. Create a new one.",
  DECRYPT_FAILED: "Could not unlock this passkey. Try again.",
  VAULT_FORMAT_INVALID: "Stored passkey data is unreadable. Sign in again to replace it.",
};

export function describeError(error: unknown): string {
  if (isMeraError(error)) return MERA_MESSAGES[error.code] ?? error.message;
  if (error instanceof Error) {
    if (/not allowed|NotAllowedError|aborted/i.test(error.message)) {
      return "The passkey prompt was dismissed. Try again.";
    }
    return error.message;
  }
  return "Something went wrong. Try again.";
}

// ---- gas drip ----

async function dripIfNeeded(address: `0x${string}`, force: boolean): Promise<string | null> {
  try {
    if (!force) {
      const { publicClient } = await import("./rpc");
      const balance = await publicClient.getBalance({ address });
      if (balance > LOW_BALANCE_WEI) return null;
    }
    const result = await drip(address);
    if (result.hash) return "Gas sent to your new account. You are ready to predict.";
    return null;
  } catch {
    return null;
  }
}

// ---- public actions ----

const rpId = (): string => (typeof location === "undefined" ? "localhost" : location.hostname);

export async function createAccount(label: string): Promise<void> {
  if (state.status === "working") return;
  state = { ...state, status: "working", error: null, notice: null };
  emit();
  try {
    const name = label.trim() === "" ? "pairwise user" : label.trim();
    const created = await createPasskeyWithPrfOutput({
      rp: { id: rpId(), name: "Pairwise" },
      user: { name, displayName: name },
    });
    const account = startSession(created.prfOutput);
    const stored: StoredCredential = {
      credentialId: created.credentialId,
      ...(created.transports ? { transports: created.transports } : {}),
      label: name,
      createdAt: Math.floor(Date.now() / 1000),
    };
    saveKnown(stored);
    state = { status: "signed-in", address: account.address, known: stored, error: null, notice: null };
    emit();
    const notice = await dripIfNeeded(account.address, true);
    if (notice && live) {
      state = { ...state, notice };
      emit();
    }
  } catch (error) {
    signOut(describeError(error));
  }
}

export async function signIn(): Promise<void> {
  if (state.status === "working") return;
  state = { ...state, status: "working", error: null, notice: null };
  emit();
  try {
    const known = state.known;
    const credential: PasskeyCredentialMetadata | undefined = known
      ? {
          credentialId: known.credentialId,
          ...(known.transports ? { transports: known.transports } : {}),
        }
      : undefined;
    const result = await getPasskeyPrfOutput({
      rpId: rpId(),
      ...(credential ? { credential } : {}),
    });
    const account = startSession(result.prfOutput);
    const stored: StoredCredential = {
      credentialId: result.credentialId,
      ...(known?.transports ? { transports: known.transports } : {}),
      label: known?.label ?? "My passkey",
      createdAt: known?.createdAt ?? Math.floor(Date.now() / 1000),
    };
    saveKnown(stored);
    state = { status: "signed-in", address: account.address, known: stored, error: null, notice: null };
    emit();
    const notice = await dripIfNeeded(account.address, false);
    if (notice && live) {
      state = { ...state, notice };
      emit();
    }
  } catch (error) {
    signOut(describeError(error));
  }
}

/** Resolves the signed-in address, or throws a message worth showing. */
export function requireAddress(): `0x${string}` {
  const account = currentAccount();
  if (!account) throw new Error("Sign in with your passkey first.");
  return account.address;
}
