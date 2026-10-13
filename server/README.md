# server — Pairwise API

Express + TypeScript. Three endpoints, and they exist for exactly two reasons: **secrets cannot live
in a public web bundle**, and **binaries cannot live onchain**.

The server holds no state the app depends on. Writes never touch it — the passkey signs and sends
straight to Monad — so if this is down, people can still predict, vote, reveal, settle and claim.
They just cannot post new artwork or read insights.

## Endpoints

| Route | What it does |
| --- | --- |
| `POST /api/upload` | Takes two images (`a`, `b`), sha256s them, screens both with Hunyuan, stores them, returns `{ uriA, uriB, hashA, hashB }` for `createDuel`. |
| `GET /api/insight/:duelId` | For a duel settled A or B: sends both artworks and the vote counts to `hunyuan-vision` and returns `{ winner, why, tips }`. Generated once, cached forever. |
| `POST /api/drip` | Sends `FAUCET_DRIP_MON` to a new passkey account so its first transaction does not fail on gas. |
| `GET /api/health` | `{ ok, moderation, faucet, contract, indexer }` — which capabilities are actually configured. |

Full request and response shapes, including every error, are in `shared/api.md`.

### Why each one cannot live elsewhere

- **Upload.** The contract stores a URL and a sha256, not pixels. Moderation needs `HUNYUAN_API_KEY`,
  and a key in a Vite bundle is a key on the public internet. The endpoint also rejects two identical
  files, because `createDuel` reverts when `hashA == hashB` and a revert is a worse error message.
- **Insight.** Same key problem, plus it is generated once and cached: otherwise every viewer re-bills
  you for the same answer. The winner is read from the chain or the indexer and passed to the model —
  the model never decides who won.
- **Drip.** A passkey mints an address with zero MON. Funding it needs a key with real funds, and the
  once-per-address-and-IP-per-day limit needs somewhere to keep a ledger.

## Integration with the indexer

`/api/insight/:duelId` resolves a duel through `src/duels.ts`, which tries two sources in order:

1. **Envio GraphQL** (`ENVIO_URL`) — one round trip, the room slug is already decoded, no RPC spend.
2. **The contract** (`CONTRACT_ADDRESS` over `RPC_URL`) — used when `ENVIO_URL` is unset, the indexer
   is unreachable, or the duel is too new to be indexed.

So a lagging or offline indexer degrades the endpoint's latency, never its correctness, and the
server works today with no indexer at all. `GET /api/health` reports which source is live.

## Run it

```bash
npm install
cp .env.example .env     # fill in HUNYUAN_API_KEY and FAUCET_PRIVATE_KEY when you have them
npm run dev              # http://localhost:8787
npm run smoke            # posts two generated PNGs and checks the whole upload path
```

Missing config degrades rather than crashes: with no `HUNYUAN_API_KEY` uploads are stored unmoderated
with a warning and insights 404; with no `FAUCET_PRIVATE_KEY` the drip returns 503.

`MODERATION_STRICT=true` rejects uploads when the moderation call itself fails. The default is
fail-open, so a Hunyuan outage during judging cannot block the demo. A clear rejection from the model
is always a 422 regardless.

## Deploy

**Upload URLs are written into the contract and are immutable.** Set the final `PUBLIC_URL` and
attach a persistent disk *before* anyone posts a real duel, or the artwork for every duel ever posted
is lost and the indexer will keep serving dead links forever.

### Railway

1. New project → deploy from this repo, root directory `server`.
2. Add a **Volume** mounted at `/data`, then set `DATA_DIR=/data`.
3. Variables: `PUBLIC_URL` (the generated domain), `ALLOWED_ORIGINS` (the Vercel URL),
   `HUNYUAN_API_KEY`, `FAUCET_PRIVATE_KEY`, `FAUCET_DRIP_MON`, `CONTRACT_ADDRESS`, `ENVIO_URL`.
4. Railway builds the `Dockerfile` automatically. Health check path `/api/health`.

### Render

Same shape: Docker runtime, root directory `server`, a Disk mounted at `/data` with `DATA_DIR=/data`,
and health check `/api/health`.

### Docker directly

```bash
docker build -t pairwise-server .
docker run -p 8787:8787 --env-file .env -v pairwise-data:/data -e DATA_DIR=/data pairwise-server
```

## Layout

```
src/index.ts    app wiring, CORS, static /uploads, error shapes
src/env.ts      config with sane fallbacks
src/chain.ts    viem public client, getDuel, faucet wallet (explicit 21000 gas)
src/duels.ts    indexer-first duel lookup with RPC fallback
src/hunyuan.ts  moderation and insight calls, defensive JSON parsing
src/store.ts    content-addressed uploads, insight cache, drip ledger
src/routes/     upload.ts · insight.ts · drip.ts
```
