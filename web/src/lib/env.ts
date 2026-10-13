/** Every value here is public: Vite inlines it into the bundle. */

const trim = (v: string | undefined): string => (v ?? "").trim();

export const ENVIO_URL = trim(import.meta.env.VITE_ENVIO_URL);
export const API_URL = trim(import.meta.env.VITE_API_URL).replace(/\/$/, "");
export const CONTRACT = trim(import.meta.env.VITE_CONTRACT) as `0x${string}` | "";
export const START_BLOCK = BigInt(trim(import.meta.env.VITE_START_BLOCK) || "0");

export const MONAD_TESTNET_ID = 10143;
export const RPC_URL = "https://testnet-rpc.monad.xyz";
export const EXPLORER = "https://testnet.monadexplorer.com";

/** No indexer configured yet, so reads come from the in-memory mock. */
export const USING_MOCK = ENVIO_URL === "";
/** No contract configured yet, so writes are disabled. */
export const CHAIN_READY = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT) && CONTRACT !== `0x${"0".repeat(40)}`;

export const ROOMS = ["purdue", "lafayette", "open"] as const;
export type Room = (typeof ROOMS)[number];

export const isRoom = (v: string): v is Room => (ROOMS as readonly string[]).includes(v);
