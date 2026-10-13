/**
 * GET /api/insight/:duelId — why the winner won.
 *
 * Only for a duel that settled A or B, and the winner comes from the chain or the indexer, never
 * from the model. Generated once and cached forever: the inputs are immutable after settlement.
 */
import { readFile } from "node:fs/promises";
import { Router } from "express";
import { getDuel } from "../duels.js";
import { PUBLIC_URL } from "../env.js";
import { generateInsight, hunyuanEnabled, type Insight } from "../hunyuan.js";
import { log } from "../log.js";
import { readInsight, uploadPath, writeInsight } from "../store.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Loads an artwork for the model: from disk when we served it, over HTTP otherwise. */
async function loadImage(uri: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (uri.startsWith("data:")) {
    const [header = "", base64 = ""] = uri.slice(5).split(",", 2);
    return { bytes: new Uint8Array(Buffer.from(base64, "base64")), mime: header.split(";")[0] || "image/jpeg" };
  }

  const ours = `${PUBLIC_URL}/uploads/`;
  if (uri.startsWith(ours)) {
    const name = uri.slice(ours.length);
    if (!/^[0-9a-f]{64}\.(jpg|png|webp)$/.test(name)) throw new Error("Bad upload path.");
    const bytes = new Uint8Array(await readFile(uploadPath(name)));
    const ext = name.split(".").pop();
    return { bytes, mime: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" };
  }

  const response = await fetch(uri, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Could not fetch ${uri}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("That image is too large to analyse.");
  return { bytes: new Uint8Array(buffer), mime: response.headers.get("content-type") ?? "image/jpeg" };
}

export const insightRouter: Router = Router();

insightRouter.get("/api/insight/:duelId", async (req, res) => {
  const duelId = String(req.params.duelId ?? "");
  if (!/^\d+$/.test(duelId)) {
    res.status(404).json({ error: "No insight: unknown duel." });
    return;
  }

  const cached = await readInsight<Insight>(duelId);
  if (cached) {
    res.json(cached);
    return;
  }

  const { duel, source } = await getDuel(duelId);
  if (!duel) {
    res.status(404).json({ error: "No insight: unknown duel." });
    return;
  }
  if (duel.outcome !== "A" && duel.outcome !== "B") {
    res.status(404).json({ error: "No insight: duel is not settled." });
    return;
  }
  if (!hunyuanEnabled()) {
    res.status(404).json({ error: "No insight: analysis is not configured on this server." });
    return;
  }

  try {
    const [a, b] = await Promise.all([loadImage(duel.uriA), loadImage(duel.uriB)]);
    const insight = await generateInsight({
      title: duel.title,
      winner: duel.outcome,
      votesA: duel.votesA,
      votesB: duel.votesB,
      a,
      b,
    });
    await writeInsight(duelId, insight);
    log.info(`Insight cached for duel ${duelId} (duel read from ${source}).`);
    res.json(insight);
  } catch (error) {
    log.error(`Insight failed for duel ${duelId}.`, error instanceof Error ? error.message : error);
    res.status(503).json({ error: "Could not generate the insight right now. Try again shortly." });
  }
});
