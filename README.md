# Pairwise

**Taste markets for creators on Monad.** A creator posts two versions of one piece. One crowd stakes
MON on which version the room will pick; a different crowd votes blind to decide it. Correct
predictors split the pool and earn onchain taste rep — more for calling it early — the creator takes
5%, and every voter who reveals shares 2%. Instagram tells an artist that 200 people scrolled past.
Pairwise tells them which direction their actual community prefers, how confidently, and pays the
people who read the room correctly.

Built for the Monad Metropolis hackathon, Social, Attention & Culture track.

## How it works

A **duel** is two artworks in a room (`purdue`, `lafayette`, `open`). Two crowds act on it, and the
contract keeps them strictly apart:

- **Predictors** stake on which side the room will choose. Parimutuel: all stakes on A form `poolA`,
  all on B form `poolB`. This is a bet on *other people's taste*, not your own.
- **Voters** cast the actual ballot, commit-reveal, so nobody can see which way the vote is going
  while the market is still open.

```
createDuel ──────── commit phase ────────┬──── reveal ────┬──── settle ──── claim
                                    commitEnd         revealEnd
 predict()  ✓                             ✗               settle() ✓   claim() ✓
 commitVote() ✓                    revealVote() ✓          (anyone)    claimVoterReward() ✓
                                                                       claimCreator() ✓
```

Four conflict rules are enforced onchain, and they are the heart of the design rather than
housekeeping — the market would be trivially gameable without them:

| Rule | Why |
| --- | --- |
| The creator can neither predict nor vote | no betting on your own work |
| A predictor cannot vote | can't write the resolution to your own bet |
| A voter cannot predict | can't bet on a ballot you control |
| One side per user, no hedging | can't farm rep risk-free from both sides |

**The money.** Of the total pool: 5% to the creator, 2% split among every voter who revealed (which
is what pays people to come back and reveal), and 93% to winning predictors pro-rata.

**The rep.** `tasteRep += 10 + 90 * (commitEnd - firstAt) / (commitEnd - createdAt)`. Calling it the
moment a duel opens is worth ~100; calling it at the buzzer is worth 10. Same money, very different
rep — so the leaderboard ranks conviction and timing, not bankroll.

**Degenerate outcomes refund.** A tie, fewer reveals than `minReveals`, or a winning side with an
empty pool all return every stake.

## Architecture

```
                     ┌───────────────────────────────┐
                     │   web/   React + Vite (SPA)   │
                     │  a passkey is the whole account│
                     └──┬─────────┬──────────┬───────┘
         writes (viem)  │         │ reads    │ uploads / insight / drip
                        │         │          │
            ┌───────────▼──┐   ┌──▼────────┐ │   ┌──────────────────┐
            │ Monad testnet│   │   Envio   │ │   │  server/ Express │
            │  Pairwise.sol│──▶│ HyperIndex│ │   │   + Hunyuan      │
            │   id 10143   │evt│  GraphQL  │ └──▶│  (keys stay here)│
            └──────────────┘   └───────────┘     └──────────────────┘
                   ▲                                      │
                   └──── reads duel state over RPC ───────┘
                              (insight + fallback)

                shared/ — frozen interface both halves compile against
                  abi/Pairwise.json · types.ts · api.md · queries.graphql
```

Three properties worth noting:

1. **Writes go straight from the browser to the chain.** No backend signer, no custody. The passkey
   derives the key in memory and viem sends the transaction.
2. **Reads never loop over RPC.** Feed, leaderboard, rep and activity are one GraphQL query each.
3. **The server holds no state the app depends on.** If it is down, people can still predict, vote,
   reveal, settle and claim. They just cannot post new artwork or read insights.

## Bounties, and why each one is load-bearing

### Mera — Best UX

The passkey *is* the account. No wallet to connect, no seed phrase, no connector library. The PRF
output becomes BIP-39 entropy, derived at `m/44'/60'/0'/0/0` into a viem account; only the credential
id is persisted, and keys live in memory and are zeroed on sign-out or a 15-minute idle timeout.

The onboarding screen has two buttons and explains nothing else. Gas arrives automatically on first
login via the server's drip, so a new user never sees a faucet. `PRF_UNAVAILABLE` maps to the actual
fix rather than an error code. Remove Mera and there is no product — this is the account layer, not a
login option.

### Mera — One Passkey, Many Keys

The same PRF output is used a second time, under a separate domain, for something that is not a
wallet: `voteKey = HKDF-SHA256(prfOutput, salt="pairwise", info="pairwise/vote-key/v1")`, and each
duel's ballot salt is `HMAC-SHA256(voteKey, chainId ‖ contract ‖ duelId)`.

Commit-reveal normally forces an app to store a salt, which means votes are lost when a browser is
cleared or the user switches device. Here the salt is **derived, never stored**, so:

- a vote committed on a laptop reveals from a phone with zero synced state;
- the voter does not even need to remember which side they chose — reveal re-derives the salt and
  tests both candidates against the stored commitment to recover it.

`web/src/lib/ballot.test.ts` pins the derivation and proves the TypeScript commitment equals
`keccak256(abi.encode(id, side, salt, voter))` on a fixed vector, and `npm run verify:commitment`
checks that same vector against the deployed bytecode.

### Envio — HyperIndex

A contract settles things well and answers questions badly. `tasteRep` is a mapping, so a leaderboard
is not answerable onchain at any price; rooms are a `bytes32` field with no index; distinct
participant counts are never stored. The indexer folds all 8 events into `Duel`, `Position`, `User`,
`Room` and `Activity`, so every screen is one query.

It also derives what the chain deliberately does not: `User.earned` is **profit only** (payout minus
stake), so the leaderboard ranks being right rather than staking most, and `room` is decoded from
padded `bytes32` back into a slug that can be a URL.

### Hunyuan (Tencent)

Two jobs, both server-side so the key is never in the bundle:

- **Moderation** gates uploads — sexual content, gore, hate, and work that is obviously not the
  uploader's — before a duel can exist.
- **Insight** is the post-duel payoff for the creator: both artworks and the vote counts go to
  `hunyuan-vision`, which returns one sentence on *why* the winner won and two concrete tips for the
  next piece. The winner is read from the chain and handed to the model; the model never decides it.
  Generated once and cached, since the inputs are immutable after settlement.

## Deployment

| | |
| --- | --- |
| Network | Monad testnet, chain id `10143` |
| Contract | [`0xe4F3962C903a7e1bC45A2D0bD8A7F5b6379a3353`](https://testnet.monadexplorer.com/address/0xe4F3962C903a7e1bC45A2D0bD8A7F5b6379a3353) |
| Deploy block | `70808463` |
| Constructor | `revealWindow = 180`, `minReveals = 1` |
| Server | https://pairwise-server.onrender.com ([health](https://pairwise-server.onrender.com/api/health)) |
| Indexer | _pending — Envio hosted_ |
| Web | _pending — Vercel_ |

Remaining URLs land here as they go live. `DEPLOY.md` has the full checklist, including
the one ordering rule: **`PUBLIC_URL` must be final before the first real duel**, because upload URLs
are written into the contract and have no setter.

## Local development

```bash
# contracts — 16 tests
cd contracts && forge test

# indexer — Envio HyperIndex v3
cd indexer && npx envio codegen && npx envio dev

# server — :8787
cd server && npm install && cp .env.example .env && npm run dev
npm run smoke          # posts two generated PNGs through the whole upload path

# web — :5173, runs on mock data with no env at all
cd web && npm install && npm run dev
npm test               # ballot derivation and commitment vectors
```

The web app needs no backend to run: with `VITE_ENVIO_URL` unset it serves six mock duels across all
three rooms, one in every phase, and predicting moves the pools so the seam animates exactly as it
will onchain.

## For judges

**Live URL:** _to be added once Vercel is live._

**Use Safari with iCloud Keychain, or Chrome with the passkey saved to Google Password Manager.**
On desktop Chrome, a passkey saved to the device alone does not support the PRF extension and sign-in
fails with `PRF_UNAVAILABLE`. The app says so in plain language if it happens.

**Gas arrives automatically.** Create an account and the server drips testnet MON before your first
transaction — there is no faucet step and no wallet to install.

**What to try, in order:**

1. Create an account with a passkey. That is the entire signup.
2. Open a duel in `purdue` and predict a side. Watch the seam slide to the new pool split — the
   market *is* the layout, there is no chart to read.
3. Vote on a different duel. Nothing is stored locally. Sign in from another browser or device with
   the same passkey and reveal it there — it works, which is the point of the PRF ballot key.
4. Settle a finished duel (anyone can) and claim. Check the leaderboard: early correct calls
   outrank large ones.
5. Open a settled duel for the Hunyuan read on why that side won.

## Repository

```
contracts/   Pairwise.sol, Foundry tests, deploy script
indexer/     Envio HyperIndex v3 — 5 entities, 8 event handlers
server/      Express — upload moderation, duel insight, gas drip
web/         React + Vite — passkey accounts, PRF ballots, the seam
shared/      frozen interface: ABI, types, API contract, GraphQL queries
DEPLOY.md    ordered deployment checklist for all four packages
```
