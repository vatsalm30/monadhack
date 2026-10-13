# web — Pairwise front end

Vite + React + TypeScript (strict). No component library, no wallet connector: the account layer is
a passkey, and the data layer is one module.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # ballot derivation and commitment vectors
npm run build   # tsc -b && vite build
```

With no `.env.local`, the app runs on mock data: six duels across `purdue`, `lafayette` and `open`,
one in every phase. Predicting and voting mutate the mock, so the whole flow is clickable before the
contract exists.

Passkeys need `localhost` or HTTPS. On desktop Chrome the passkey must be saved to Google Password
Manager or the PRF extension is unavailable; Safari with iCloud Keychain works as is.

## Going live

Copy `.env.example` to `.env.local` and fill in the four values from Branch A:

| Variable | Comes from |
| --- | --- |
| `VITE_CONTRACT` | `contracts/DEPLOYMENT.md` |
| `VITE_START_BLOCK` | `contracts/DEPLOYMENT.md` |
| `VITE_ENVIO_URL` | Envio hosted service, `indexer/README.md` |
| `VITE_API_URL` | the deployed server |

Then confirm the ballot formula matches the deployed bytecode, which is what every reveal depends on:

```bash
VITE_CONTRACT=0x… npm run verify:commitment
```

`src/lib/abi.ts` is transcribed from the CLAUDE.md spec. Once `shared/abi/Pairwise.json` exists,
diff the two and prefer the generated one.

## Deploy to Vercel

HTTPS is required for passkeys, so a deployed URL is the only way judges can test it.

```bash
npm i -g vercel
cd web
vercel link            # new project, scope: your account
vercel env add VITE_CONTRACT production      # repeat for the other three
vercel --prod
```

Or in the dashboard: import the repo, set **Root directory** to `web`, framework **Vite**, build
`npm run build`, output `dist`, then add the four variables under Settings → Environment Variables
and redeploy. `vercel.json` already rewrites every path to `index.html` for the hash router and
pins immutable caching on hashed assets.

A passkey is bound to the domain that created it, so pick the production domain before anyone
creates a real account. A passkey made on a `*.vercel.app` preview URL will not work on the final
domain.

## Layout

```
src/lib/      data.ts (Envio + mock + RPC fallback) · account.ts (passkey) · ballot.ts (PRF ballots)
              chain.ts (gas-explicit writes) · actions.ts · rpc.ts · abi.ts · payout.ts
src/components/  Seam · ActionPanel · DuelCard · InsightPanel · ActivityList · Countdown
src/screens/     Onboard · Feed · DuelScreen · Create · LeaderboardScreen · Profile
```
