/**
 * Disk persistence. Everything lives under DATA_DIR, which must be a mounted volume in production:
 * upload URLs are written into the contract and are therefore permanent, so losing the files means
 * losing the artwork for every duel ever posted.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DATA_DIR } from "./env.js";

export const ROOT = resolve(DATA_DIR);
export const UPLOADS_DIR = join(ROOT, "uploads");
export const INSIGHTS_DIR = join(ROOT, "insights");
const DRIPS_FILE = join(ROOT, "drips.json");

export async function ensureDirs(): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await mkdir(INSIGHTS_DIR, { recursive: true });
}

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Content-addressed, so re-uploading the same file is idempotent. */
export async function saveUpload(bytes: Uint8Array, mime: string): Promise<{ hash: string; filename: string }> {
  const hash = sha256(bytes);
  const filename = `${hash}.${EXT[mime] ?? "bin"}`;
  const path = join(UPLOADS_DIR, filename);
  if (!existsSync(path)) await writeFile(path, bytes);
  return { hash, filename };
}

export const uploadPath = (filename: string): string => join(UPLOADS_DIR, filename);

// ---- insight cache ----

export async function readInsight<T>(duelId: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(INSIGHTS_DIR, `${duelId}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeInsight(duelId: string, value: unknown): Promise<void> {
  await writeFile(join(INSIGHTS_DIR, `${duelId}.json`), JSON.stringify(value, null, 2));
}

// ---- drip ledger ----

type Ledger = Record<string, number>;

async function readLedger(): Promise<Ledger> {
  try {
    return JSON.parse(await readFile(DRIPS_FILE, "utf8")) as Ledger;
  } catch {
    return {};
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when this key was served inside the last 24 hours. */
export async function wasDrippedToday(keys: string[]): Promise<boolean> {
  const ledger = await readLedger();
  const cutoff = Date.now() - DAY_MS;
  return keys.some((key) => (ledger[key] ?? 0) > cutoff);
}

export async function recordDrip(keys: string[]): Promise<void> {
  const ledger = await readLedger();
  const now = Date.now();
  for (const key of keys) ledger[key] = now;
  // Keep the file from growing forever.
  const cutoff = now - DAY_MS * 7;
  for (const [key, at] of Object.entries(ledger)) if (at < cutoff) delete ledger[key];
  await writeFile(DRIPS_FILE, JSON.stringify(ledger));
}
