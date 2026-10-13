/**
 * POST /api/upload — the gate every duel passes through.
 *
 * Artwork cannot go onchain: the contract stores a URL and a sha256. So this holds the files, hashes
 * them, screens them with Hunyuan, and hands back the four values `createDuel` needs.
 */
import { Router } from "express";
import multer from "multer";
import { MAX_UPLOAD_BYTES, MODERATION_STRICT, PUBLIC_URL } from "../env.js";
import { hunyuanEnabled, moderatePair } from "../hunyuan.js";
import { log } from "../log.js";
import { saveUpload } from "../store.js";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 2, fields: 4 },
  fileFilter: (_req, file, done) => {
    if (!ALLOWED.has(file.mimetype)) {
      done(new Error("Use a JPEG, PNG or WebP."));
      return;
    }
    done(null, true);
  },
});

/** Trusts the bytes, not the declared mime type. */
function sniff(bytes: Uint8Array): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const header = Buffer.from(bytes.slice(0, 12)).toString("latin1");
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

export const uploadRouter: Router = Router();

uploadRouter.post("/api/upload", upload.fields([{ name: "a", maxCount: 1 }, { name: "b", maxCount: 1 }]), async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const a = files?.a?.[0];
  const b = files?.b?.[0];
  if (!a || !b) {
    res.status(422).json({ error: "Send both images, as fields a and b." });
    return;
  }

  const aMime = sniff(a.buffer);
  const bMime = sniff(b.buffer);
  if (!aMime || !bMime) {
    res.status(422).json({ error: "One of those files is not a JPEG, PNG or WebP." });
    return;
  }

  // The contract reverts when the hashes match, so catch it here with a better message.
  if (Buffer.compare(a.buffer, b.buffer) === 0) {
    res.status(422).json({ error: "Those two files are identical. Pick two different pieces." });
    return;
  }

  if (hunyuanEnabled()) {
    try {
      const verdict = await moderatePair({ bytes: a.buffer, mime: aMime }, { bytes: b.buffer, mime: bMime });
      const rejected = !verdict.a.allowed ? ("A" as const) : !verdict.b.allowed ? ("B" as const) : null;
      if (rejected) {
        const reason = (rejected === "A" ? verdict.a.reason : verdict.b.reason) || "it breaks the upload rules";
        log.info(`Upload rejected on side ${rejected}: ${reason}`);
        res.status(422).json({ error: `Side ${rejected} was rejected: ${reason} Upload your own artwork.` });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (MODERATION_STRICT) {
        log.error("Moderation failed, rejecting upload (MODERATION_STRICT).", message);
        res.status(503).json({ error: "Moderation is unavailable right now. Try again in a minute." });
        return;
      }
      log.warn("Moderation failed, allowing the upload through.", message);
    }
  } else {
    log.warn("HUNYUAN_API_KEY is not set: uploads are not being moderated.");
  }

  const [savedA, savedB] = await Promise.all([saveUpload(a.buffer, aMime), saveUpload(b.buffer, bMime)]);
  res.json({
    uriA: `${PUBLIC_URL}/uploads/${savedA.filename}`,
    uriB: `${PUBLIC_URL}/uploads/${savedB.filename}`,
    hashA: `0x${savedA.hash}`,
    hashB: `0x${savedB.hash}`,
  });
});
