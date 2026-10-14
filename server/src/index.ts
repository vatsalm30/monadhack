import express from "express";
import cors from "cors";
import { ALLOWED_ORIGINS, ENVIO_URL, HAS_CONTRACT, HAS_FAUCET, MAX_UPLOAD_BYTES, PORT, PUBLIC_URL } from "./env.js";
import { hunyuanEnabled } from "./hunyuan.js";
import { log } from "./log.js";
import { dripRouter } from "./routes/drip.js";
import { insightRouter } from "./routes/insight.js";
import { uploadRouter } from "./routes/upload.js";
import { uploadsRouter } from "./routes/uploads.js";
import { ensureDirs, ROOT, UPLOADS_DIR } from "./store.js";

const app = express();

// Railway and Render sit behind a proxy, so req.ip must come from the forwarded header.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  cors({
    origin: (origin, done) => {
      // No Origin header: curl, health checks, server-to-server.
      if (!origin || ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ""))) {
        done(null, true);
        return;
      }
      done(new Error("Origin not allowed."));
    },
  }),
);

app.use(express.json({ limit: "1mb" }));

// Uploads are referenced by immutable onchain URLs, so they are served forever and cached hard.
app.use("/uploads", express.static(UPLOADS_DIR, { immutable: true, maxAge: "365d", fallthrough: true }));

// Falls through to here when the path carries no extension: /uploads/<sha256> from the onchain hash.
app.use(uploadsRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    moderation: hunyuanEnabled(),
    faucet: HAS_FAUCET,
    contract: HAS_CONTRACT,
    indexer: ENVIO_URL !== "",
  });
});

app.use(uploadRouter);
app.use(insightRouter);
app.use(dripRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "No such endpoint." });
});

// Multer and CORS throw rather than return, so turn their errors into the JSON shape the web app expects.
app.use((error: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    res.status(422).json({ error: `Each image must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB or smaller.` });
    return;
  }
  if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
    res.status(422).json({ error: "Send exactly two images, as fields a and b." });
    return;
  }
  if (error.message === "Origin not allowed.") {
    res.status(403).json({ error: "This origin is not allowed to call the API." });
    return;
  }
  log.error("Unhandled error.", error.message);
  res.status(500).json({ error: "Something went wrong on the server." });
});

await ensureDirs();

/**
 * Upload URLs are written into the contract and are immutable, so handing out an address that will
 * never resolve from another machine is permanent damage, not a config mistake you can undo.
 */
function warnAboutPublicUrl(): void {
  const unreachable = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(PUBLIC_URL);
  if (unreachable && HAS_CONTRACT) {
    log.warn("PUBLIC_URL points at localhost while a contract is configured.");
    log.warn("  Any duel posted now records an image URL nobody else can ever load, and it cannot be edited.");
    log.warn("  Set PUBLIC_URL to a public hostname you control before posting real duels.");
  }
}

/**
 * On Railway and Render the container filesystem is thrown away on every deploy. If DATA_DIR sits
 * inside the app directory, uploads survive until the next push and then vanish, leaving onchain
 * URLs pointing at files that no longer exist.
 */
function warnAboutDataDir(): void {
  const inAppDir = ROOT.startsWith(process.cwd());
  if (inAppDir && process.env.NODE_ENV === "production") {
    log.warn(`DATA_DIR resolves to ${ROOT}, inside the app directory.`);
    log.warn("  On a container host this disk is wiped on every deploy, taking every uploaded artwork with it.");
    log.warn("  Mount a volume and set DATA_DIR to it (the Dockerfile and render.yaml use /data).");
  }
}

warnAboutPublicUrl();
warnAboutDataDir();

app.listen(PORT, () => {
  log.info(`Pairwise server on :${PORT}`);
  log.info(`  public url   ${PUBLIC_URL}`);
  log.info(`  origins      ${ALLOWED_ORIGINS.join(", ") || "(none)"}`);
  log.info(`  moderation   ${hunyuanEnabled() ? "on" : "OFF (set HUNYUAN_API_KEY)"}`);
  log.info(`  faucet       ${HAS_FAUCET ? "on" : "OFF (set FAUCET_PRIVATE_KEY)"}`);
  log.info(`  duel reads   ${ENVIO_URL !== "" ? "indexer, RPC fallback" : HAS_CONTRACT ? "RPC only" : "OFF"}`);
});
