/**
 * GET /uploads/:hash — resolve an artwork by its onchain hash.
 *
 * `uriA`/`uriB` are written into the contract and can never be edited, so a duel posted against the
 * wrong hostname, or before a volume was attached, would otherwise lose its artwork permanently.
 *
 * The escape hatch is that uploads are content-addressed: the file is stored as `<sha256>.<ext>`,
 * and that same sha256 is already onchain as `hashA`/`hashB` next to the dead URL. So any server
 * holding the files can serve any historical duel, with no database and no migration — the client
 * derives this URL from the hash when the stored one fails.
 */
import { existsSync } from "node:fs";
import { Router } from "express";
import { uploadPath } from "../store.js";

const EXTENSIONS = ["jpg", "png", "webp"] as const;

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const uploadsRouter: Router = Router();

uploadsRouter.get("/uploads/:hash", (req, res) => {
  const hash = String(req.params.hash ?? "").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    res.status(404).json({ error: "Not an artwork hash." });
    return;
  }

  // The extension is not onchain, so try the three we accept.
  for (const ext of EXTENSIONS) {
    const path = uploadPath(`${hash}.${ext}`);
    if (!existsSync(path)) continue;
    res.type(MIME[ext] ?? "application/octet-stream");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.sendFile(path);
    return;
  }

  res.status(404).json({ error: "This server does not have that artwork." });
});
