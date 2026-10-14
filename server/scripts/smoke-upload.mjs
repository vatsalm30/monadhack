/**
 * End-to-end check against a running server: generates two different PNGs, posts them to
 * /api/upload, and verifies the returned URLs actually serve the bytes back.
 *
 *   npm run dev          # in one terminal
 *   npm run smoke        # in another
 */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

const BASE = (process.env.SMOKE_URL ?? "http://localhost:8787").replace(/\/$/, "");

/** Minimal valid PNG: a solid 64x64 square, no dependencies. */
function png(r, g, b) {
  const size = 64;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let at = 0;
  for (let y = 0; y < size; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < size; x += 1) {
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      at += 3;
    }
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crcTable = chunk.table ?? (chunk.table = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    }));
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fail = (message) => {
  console.error(`FAIL  ${message}`);
  process.exit(1);
};

const health = await fetch(`${BASE}/api/health`).catch(() => null);
if (!health?.ok) fail(`no server at ${BASE}. Start it with npm run dev.`);
console.log("health:", JSON.stringify(await health.json()));

const a = png(39, 71, 214); // cobalt
const b = png(242, 169, 0); // marigold

// 1. the happy path
const form = new FormData();
form.append("a", new Blob([a], { type: "image/png" }), "a.png");
form.append("b", new Blob([b], { type: "image/png" }), "b.png");
const response = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
const body = await response.json();
if (!response.ok) fail(`upload rejected: ${body.error}`);

if (body.hashA !== `0x${sha256(a)}`) fail("hashA does not match sha256 of the file");
if (body.hashB !== `0x${sha256(b)}`) fail("hashB does not match sha256 of the file");
if (body.hashA === body.hashB) fail("hashes are identical, createDuel would revert");
console.log("upload:", body.uriA, body.uriB);

// 2. the files are really served back
for (const uri of [body.uriA, body.uriB]) {
  const file = await fetch(uri);
  if (!file.ok) fail(`${uri} returned ${file.status}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const expected = uri === body.uriA ? sha256(a) : sha256(b);
  if (sha256(bytes) !== expected) fail(`${uri} served different bytes`);
}
console.log("served back: both files match their hashes");

// 3. identical files are refused, because the contract would revert
const dupe = new FormData();
dupe.append("a", new Blob([a], { type: "image/png" }), "a.png");
dupe.append("b", new Blob([a], { type: "image/png" }), "b.png");
const dupeResponse = await fetch(`${BASE}/api/upload`, { method: "POST", body: dupe });
if (dupeResponse.status !== 422) fail(`identical files should be 422, got ${dupeResponse.status}`);
console.log("duplicate rejected:", (await dupeResponse.json()).error);

// 4. a non-image is refused
const bad = new FormData();
bad.append("a", new Blob([Buffer.from("not an image")], { type: "image/png" }), "a.png");
bad.append("b", new Blob([b], { type: "image/png" }), "b.png");
const badResponse = await fetch(`${BASE}/api/upload`, { method: "POST", body: bad });
if (badResponse.status !== 422) fail(`a fake PNG should be 422, got ${badResponse.status}`);
console.log("fake image rejected:", (await badResponse.json()).error);

console.log("\nPASS  upload, static serving, duplicate and content-type checks");
