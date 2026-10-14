# Pairwise server API

Base URL: `VITE_API_URL` (web) / `PUBLIC_URL` (server). All responses are JSON unless noted.
CORS is restricted to `ALLOWED_ORIGINS`.

## `POST /api/upload`

Multipart form with exactly two files.

| Field | Type | Rules |
| --- | --- | --- |
| `a` | file | `image/jpeg`, `image/png` or `image/webp`, max 4 MB |
| `b` | file | same |

Both files are hashed with sha256 and screened by Hunyuan moderation (sexual content, gore, hate,
likely-stolen work). Identical files are rejected: the contract reverts when `hashA == hashB`.

**200**

```json
{
  "uriA": "https://host/uploads/<sha256>.png",
  "uriB": "https://host/uploads/<sha256>.png",
  "hashA": "0x…32 bytes",
  "hashB": "0x…32 bytes"
}
```

**422** `{ "error": "Side B looks like gore. Upload your own artwork." }` — moderation rejected a file,
the two files are identical, or a file is the wrong type or too large.

## `GET /uploads/:hash`

Resolves an artwork by its onchain sha256, with no extension. Uploads are stored content-addressed
as `<sha256>.<ext>`, and the same hash is in the contract as `hashA`/`hashB`, so this endpoint can
serve any historical duel even when its recorded `uriA`/`uriB` no longer resolves — a dead hostname,
a moved host, or a volume that was attached too late.

`hash` may be given with or without the `0x` prefix.

**200** the image bytes, `cache-control: public, max-age=31536000, immutable`.
**404** `{ "error": "This server does not have that artwork." }` — valid hash, file not held here.
**404** `{ "error": "Not an artwork hash." }` — not 64 hex characters.

Clients should try the recorded URI first and fall back to this.

## `GET /api/insight/:duelId`

Only available once the duel has settled with outcome `A` or `B`. The duel is read over RPC, both
images and the vote counts go to `hunyuan-vision`, and the result is cached on disk forever.

**200** — `Insight` from `shared/types.ts`

```json
{ "winner": "A", "why": "…one sentence…", "tips": ["…", "…"] }
```

**404** `{ "error": "No insight: duel is not settled." }` — unknown duel, still open, or refunded.

## `POST /api/drip`

Sends `FAUCET_DRIP_MON` to a brand-new account so a passkey user can transact on first login.
Rate limited to once per address and once per IP per day. Gas limit is always `21_000n`.

**Request** `{ "address": "0x…" }`

**200** `{ "hash": "0x…" }` — drip sent.
**200** `{ "skipped": "Balance is already above 0.1 MON." }` — nothing sent, not an error.
**429** `{ "error": "Already dripped today. Try again tomorrow." }`
**503** `{ "error": "Faucet is empty. Ask the team to top it up." }`

## `GET /api/health`

**200**

```json
{
  "ok": true,
  "moderation": true,
  "faucet": true,
  "faucetAddress": "0x…",
  "publicUrl": "https://…",
  "contract": true,
  "indexer": false
}
```

`faucet` only says a key parsed. `faucetAddress` is what you fund, and checking its balance onchain is
how you confirm the account you funded is the account the server will drip from. `publicUrl` is the
prefix that gets written permanently into the contract on the next upload, so it is worth reading
after any config change.
