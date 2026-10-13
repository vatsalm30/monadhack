/**
 * Hunyuan vision, used for two different jobs.
 *
 * Moderation runs before a duel can exist: one call sees both images and judges each. Insight runs
 * once after settlement and explains why the winner won. The API key never leaves this process —
 * that is the entire reason this server exists.
 */
import { HUNYUAN_API_KEY, HUNYUAN_MODEL, HUNYUAN_URL } from "./env.js";
import { log } from "./log.js";

export const hunyuanEnabled = (): boolean => HUNYUAN_API_KEY !== "";

type Content =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function chat(content: Content[], maxTokens = 600): Promise<string> {
  const response = await fetch(HUNYUAN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${HUNYUAN_API_KEY}`,
    },
    body: JSON.stringify({
      model: HUNYUAN_MODEL,
      messages: [{ role: "user", content }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hunyuan returned ${response.status}: ${detail.slice(0, 200)}`);
  }

  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim() === "") throw new Error("Hunyuan returned no content.");
  return text;
}

/** Models like to wrap JSON in prose and code fences, so take the outermost object and parse that. */
export function parseJsonLoose<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in the model response.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export const dataUrl = (bytes: Uint8Array, mime: string): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

// ---------------------------------------------------------------- moderation

export interface SideVerdict {
  allowed: boolean;
  reason: string;
}

export interface Moderation {
  a: SideVerdict;
  b: SideVerdict;
}

const MODERATION_PROMPT = `You screen artwork uploaded to Pairwise, a site where artists post two versions of their own work and a crowd picks one.

Judge each image separately. Reject an image only when it clearly shows one of:
- sexual content or nudity,
- gore or graphic violence,
- hate symbols or harassment,
- work that is obviously not the uploader's own: a recognisable commercial poster, film still, screenshot of another site, celebrity photo, or a stock-photo watermark.

Allow ordinary artwork, including rough sketches, photographs of physical pieces, abstract work, and anything mundane.

Reply with JSON only, no prose:
{"a":{"allowed":true,"reason":""},"b":{"allowed":true,"reason":""}}

Each reason is one short sentence naming what you saw, written for the uploader, and is empty when allowed.`;

const asVerdict = (value: unknown): SideVerdict => {
  if (typeof value !== "object" || value === null) return { allowed: true, reason: "" };
  const record = value as { allowed?: unknown; reason?: unknown };
  return {
    allowed: record.allowed !== false,
    reason: typeof record.reason === "string" ? record.reason : "",
  };
};

export async function moderatePair(a: { bytes: Uint8Array; mime: string }, b: { bytes: Uint8Array; mime: string }): Promise<Moderation> {
  const text = await chat([
    { type: "text", text: MODERATION_PROMPT },
    { type: "text", text: "Image A:" },
    { type: "image_url", image_url: { url: dataUrl(a.bytes, a.mime) } },
    { type: "text", text: "Image B:" },
    { type: "image_url", image_url: { url: dataUrl(b.bytes, b.mime) } },
  ], 300);

  const parsed = parseJsonLoose<{ a?: unknown; b?: unknown }>(text);
  return { a: asVerdict(parsed.a), b: asVerdict(parsed.b) };
}

// ---------------------------------------------------------------- insight

export interface Insight {
  winner: "A" | "B";
  why: string;
  tips: string[];
}

export async function generateInsight(input: {
  title: string;
  winner: "A" | "B";
  votesA: number;
  votesB: number;
  a: { bytes: Uint8Array; mime: string };
  b: { bytes: Uint8Array; mime: string };
}): Promise<Insight> {
  const prompt = `Two versions of one piece were shown to a crowd, who voted blind.

Title: ${input.title}
Votes: A got ${input.votesA}, B got ${input.votesB}. Side ${input.winner} won.

You are talking to the artist who made both. Explain what in the winning image probably earned those votes, judging composition, palette and mood. Be specific about what you can actually see; never mention the vote counts as the reason.

Reply with JSON only, no prose:
{"winner":"${input.winner}","why":"one sentence","tips":["short tip","short tip"]}

"why" is a single sentence comparing the two images. "tips" is exactly two short, concrete suggestions for the artist's next piece.`;

  const text = await chat([
    { type: "text", text: prompt },
    { type: "text", text: "Image A:" },
    { type: "image_url", image_url: { url: dataUrl(input.a.bytes, input.a.mime) } },
    { type: "text", text: "Image B:" },
    { type: "image_url", image_url: { url: dataUrl(input.b.bytes, input.b.mime) } },
  ]);

  const parsed = parseJsonLoose<{ why?: unknown; tips?: unknown }>(text);
  const why = typeof parsed.why === "string" ? parsed.why.trim() : "";
  if (why === "") throw new Error("Hunyuan returned no explanation.");

  const tips = Array.isArray(parsed.tips)
    ? parsed.tips.filter((tip): tip is string => typeof tip === "string" && tip.trim() !== "").slice(0, 2)
    : [];

  log.info(`Insight generated for "${input.title}".`);
  // The winner is decided onchain, never by the model.
  return { winner: input.winner, why, tips };
}
