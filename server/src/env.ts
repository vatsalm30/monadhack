import "dotenv/config";

const str = (name: string, fallback = ""): string => (process.env[name] ?? fallback).trim();

const required = (name: string, fallback: string): string => {
  const value = str(name, fallback);
  if (value === "") throw new Error(`Missing required env var ${name}.`);
  return value;
};

export const PORT = Number(str("PORT", "8787"));

/** Prefix for the upload URLs handed back to the client. */
export const PUBLIC_URL = required("PUBLIC_URL", "http://localhost:8787").replace(/\/$/, "");

/** Comma separated CORS allowlist. */
export const ALLOWED_ORIGINS = str("ALLOWED_ORIGINS", "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

// ---- Hunyuan (moderation + insight) ----
export const HUNYUAN_API_KEY = str("HUNYUAN_API_KEY");
export const HUNYUAN_URL = str("HUNYUAN_URL", "https://api.hunyuan.cloud.tencent.com/v1/chat/completions");
export const HUNYUAN_MODEL = str("HUNYUAN_MODEL", "hunyuan-vision");
/** When the moderation call itself fails: true blocks the upload, false lets it through with a warning. */
export const MODERATION_STRICT = str("MODERATION_STRICT", "false") === "true";

// ---- chain ----
export const RPC_URL = str("RPC_URL", "https://testnet-rpc.monad.xyz");
export const CHAIN_ID = 10143;
export const CONTRACT = str("CONTRACT_ADDRESS") as `0x${string}` | "";
export const HAS_CONTRACT = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT);

/** Envio GraphQL endpoint. Preferred source for insight lookups; RPC is the fallback. */
export const ENVIO_URL = str("ENVIO_URL");

// ---- faucet ----
export const FAUCET_PRIVATE_KEY = str("FAUCET_PRIVATE_KEY") as `0x${string}` | "";
export const HAS_FAUCET = /^0x[0-9a-fA-F]{64}$/.test(FAUCET_PRIVATE_KEY);
export const FAUCET_DRIP_MON = str("FAUCET_DRIP_MON", "0.05");

// ---- limits ----
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const DATA_DIR = str("DATA_DIR", "data");
