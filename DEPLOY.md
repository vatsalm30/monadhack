# Deploying Pairwise

Four packages. The order matters in exactly one place, marked below.

| | Where | Needs |
| --- | --- | --- |
| Contract | Monad testnet | already deployed: `0xe4F3962C903a7e1bC45A2D0bD8A7F5b6379a3353` |
| Indexer | Envio hosted service | the contract address and start block |
| Server | Railway or Render, with a disk | a public hostname and a persistent volume |
| Web | Vercel | HTTPS, or passkeys do not work |

## The one rule

**`PUBLIC_URL` must be final before the first real duel is posted.**

The server hands back `uriA`/`uriB`; `createDuel` writes them into the contract; there is no setter.
A duel posted while `PUBLIC_URL` is `http://localhost:8787`, or a hostname you later abandon, records
an image URL that can never be edited. The creator still sees their own images from cache, so nothing
looks wrong until someone else opens it.

This is survivable, not free: uploads are content-addressed as `<sha256>.<ext>` and that hash is
onchain, so `GET /uploads/<hash>` recovers the artwork from any server holding the files, and the web
app falls back to it automatically. Treat that as the safety net, not the plan.

## 1. Indexer (Envio)

```bash
cd indexer
npx envio codegen
npx envio dev          # local check against Monad testnet
```

Deploy to the hosted service per `indexer/README.md`, then keep the GraphQL URL: it becomes
`VITE_ENVIO_URL` for the web app and `ENVIO_URL` for the server.

## 2. Server

Pick a host. Both are configured in-repo.

**Render** — `server/render.yaml` is a blueprint that already declares the disk:

1. New → Blueprint → point at this repo. It reads `render.yaml`, creates the service, mounts a 1 GB
   disk at `/data`, and sets `DATA_DIR=/data` and the health check.
2. Fill the five secrets it leaves blank: `PUBLIC_URL`, `ALLOWED_ORIGINS`, `ENVIO_URL`,
   `HUNYUAN_API_KEY`, `FAUCET_PRIVATE_KEY`.
3. The starter plan or above — the free plan has no persistent disk, which defeats the point.

**Railway** — `server/railway.json` sets the Dockerfile build and health check:

1. New project → deploy from this repo → root directory `server`.
2. **Add a Volume mounted at `/data`, then set `DATA_DIR=/data`.** Railway volumes are not declarative,
   so this step is manual and it is the one people forget.
3. Variables: `PUBLIC_URL`, `ALLOWED_ORIGINS`, `ENVIO_URL`, `HUNYUAN_API_KEY`, `FAUCET_PRIVATE_KEY`,
   `FAUCET_DRIP_MON=0.05`, `CONTRACT_ADDRESS`, `RPC_URL`.

**Your own domain, recommended.** Point `api.yourdomain.xyz` at the service and set `PUBLIC_URL` to it,
rather than the generated `*.up.railway.app` or `*.onrender.com` hostname. Then the string frozen
onchain belongs to you, and changing hosts later is a DNS edit instead of data loss.

If `PUBLIC_URL` is still blank when the service first boots, the server uses the host's own address
(`RENDER_EXTERNAL_URL` on Render, `RAILWAY_PUBLIC_DOMAIN` on Railway) rather than localhost, so a duel
posted in that window is still reachable and still recoverable by hash. It warns when it does this.

It also warns if `PUBLIC_URL` is a localhost address while a contract is set, and if `DATA_DIR` sits
inside the app directory in production. Check the deploy logs for both.

Then confirm:

```bash
curl https://your-server/api/health
# { "ok": true, "moderation": true, "faucet": true, "contract": true, "indexer": true }
```

Four `true`s is the goal. `moderation: false` means `HUNYUAN_API_KEY` is missing, `faucet: false`
means new users will not get gas, `indexer: false` means insight falls back to RPC.

## 3. Fund the faucet

Send MON to the address of `FAUCET_PRIVATE_KEY` from faucet.monad.xyz. At `FAUCET_DRIP_MON=0.05`,
1 MON covers 20 new accounts. The drip 503s rather than half-working when it runs dry.

## 4. Web (Vercel)

Root directory `web`, framework Vite, build `npm run build`, output `dist`. `web/vercel.json` already
handles SPA rewrites and asset caching. Set:

```
VITE_CONTRACT=0xe4F3962C903a7e1bC45A2D0bD8A7F5b6379a3353
VITE_START_BLOCK=70808463
VITE_ENVIO_URL=<from step 1>
VITE_API_URL=<from step 2, no trailing slash>
```

Add the deployed web origin to the server's `ALLOWED_ORIGINS` and redeploy the server.

**Passkeys are bound to the domain that created them.** Pick the production domain before anyone
creates a real account: a passkey made on a `*.vercel.app` preview URL will not work on the final one.

## 5. Verify the whole loop

```bash
cd web && VITE_CONTRACT=0xe4F3962C903a7e1bC45A2D0bD8A7F5b6379a3353 npm run verify:commitment
```

That proves the browser's vote commitment matches the deployed bytecode. If it mismatches, every
reveal on the platform fails, so run it before anyone votes.

Then post one duel with a 5 minute commit window and walk it end to end: predict, vote, reveal,
settle, claim, and check the insight panel appears on the settled duel.

## For judges

Live URL, then: Safari with iCloud Keychain, or Chrome with the passkey saved to Google Password
Manager — otherwise the PRF extension is unavailable and sign-in fails with `PRF_UNAVAILABLE`.
Gas arrives automatically on first login.
