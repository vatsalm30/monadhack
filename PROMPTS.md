# Claude Code prompts

Put `CLAUDE.md` in the repo root first; every prompt below assumes Claude Code reads it.

---

## Prompt 0 — Scaffold on `main` (run once, by either person, before branching)

```
Read CLAUDE.md. The repo https://github.com/vatsalm30/monadhack is empty.
1. Clone it (or init and set origin), create the folder layout from CLAUDE.md:
   contracts/, indexer/, server/, web/, shared/ (each with a .gitkeep).
2. Create shared/types.ts, shared/api.md, shared/queries.graphql and shared/config.md exactly as specified
   under "Shared interface". Leave shared/abi/ with a .gitkeep (Branch A fills it).
3. Add a root .gitignore (node_modules, .env, out/, cache/, generated/, dist/, data/),
   a root .env.example listing every env var from shared/config.md, and a stub README.md
   ("Pairwise: taste markets for creators on Monad").
4. Commit "chore: scaffold + shared interface" to main and push.
5. Create and push empty branches feat/chain and feat/app from this commit.
Do not write any app code.
```

---

## Prompt A — `feat/chain` (Person A: contracts, indexer, server)

```
Read CLAUDE.md. Check out feat/chain and pull. Only touch contracts/, indexer/, server/, shared/abi/ and README.md.
Commit and push after each numbered step.

1. CONTRACT: Foundry project in contracts/. Implement Pairwise.sol exactly per the CLAUDE.md spec.
   Write tests covering: full lifecycle payout math (pool 4 MON, 7% fees), predictor can't vote,
   voter can't predict, creator conflict, no hedging, wrong reveal fails, tie refunds,
   earlier call earns more rep, voter reward split. In tests, compute commitmentFor BEFORE vm.prank.
   Add script/Deploy.s.sol reading REVEAL_WINDOW (default 180) and MIN_REVEALS (default 1).
   `forge test` must pass. Copy the ABI to shared/abi/Pairwise.json.

2. DEPLOY: Print the exact command for me to deploy to Monad testnet:
   forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --private-key $PK --broadcast
   Stop and ask me for the deployed address and block. Write them to contracts/DEPLOYMENT.md.

3. INDEXER: Envio v3 in indexer/ (envio@3.14.0). Entities: Duel, Position (id duelId_user), User,
   Room (id = decoded slug), Activity. Handle all 8 events. Decode bytes32 room to text.
   User.earned = profit only (payout − stake) on winning claims. Run `npx envio codegen` and
   `npx tsc --noEmit` until clean. Write deploy steps for Envio hosted service in indexer/README.md.

4. SERVER: Express in server/ (viem@2.57.3).
   - POST /api/upload: multer memory, 2 files, sha256 hashes, reject identical, Hunyuan moderation
     (block sexual/gore/hate/likely-stolen work, return 422 with a clear reason), store to data/uploads,
     return URIs under PUBLIC_URL. If HUNYUAN_API_KEY is missing, skip moderation with a warning.
   - GET /api/insight/:duelId: read the duel via RPC; only if settled A or B. Send both images + vote counts
     to hunyuan-vision and ask for JSON { winner, why (one sentence on composition/palette/mood
     explaining the likely reason), tips: [2 short tips for the creator's next piece] }. Cache to data/insights.
   - POST /api/drip: send FAUCET_DRIP_MON to new accounts, gas 21_000n, once per address and IP per day,
     skip if balance ≥ 0.1 MON.
   - CORS from ALLOWED_ORIGINS, GET /api/health. Smoke-test upload with two generated PNGs.
   Add a Dockerfile or Railway/Render notes with a persistent disk for data/.

5. README.md (root): one-paragraph pitch, architecture diagram (ASCII), how each bounty is used and why
   (Mera x2, Envio, Hunyuan), contract address + explorer link, local dev for all 4 packages,
   and a "For judges" section: live URL, use Safari/iCloud Keychain or Chrome with Google Password
   Manager (otherwise PRF_UNAVAILABLE), gas drips automatically on first login.

6. Open a PR feat/chain -> main with a summary. Do not merge until I say so.
```

---

## Prompt B — `feat/app` (Person B: web)

```
Read CLAUDE.md. Check out feat/app and pull. Only touch web/. Commit and push after each numbered step.
Stack: Vite + React + TypeScript (strict), viem@2.57.3, @category-labs/mera@0.2.0, @scure/bip32,
@scure/bip39, @noble/hashes. No component libraries; hand-written CSS.

1. DATA LAYER FIRST: web/src/lib/data.ts exposing getFeed(room), getDuel(id), getPositions(user),
   getLeaderboard(room?), getUser(addr), getActivity(id), getInsight(id), uploadPair(a,b), drip(addr).
   If VITE_ENVIO_URL is unset, use a realistic in-memory MOCK (6 duels across rooms purdue,
   lafayette, open, in every phase) so all UI can be built now. Types from shared/types.ts,
   queries from shared/queries.graphql. Reads of a single duel fall back to RPC getDuel.

2. AUTH (Mera Best UX): lib/account.ts. Create passkey / sign in per CLAUDE.md; hold the session
   with a 15-min idle timeout; store only credential metadata in localStorage. On first login call
   drip(address). Map MeraError codes to plain messages (PRF_UNAVAILABLE explains the Chrome +
   Google Password Manager fix). lib/chain.ts: public + wallet clients on monadTestnet; a write()
   helper that estimates gas x1.2 and passes it explicitly, then waits for the receipt.

3. BALLOT (Mera PRF bounty): lib/ballot.ts. Derive voteKey via HKDF from prfOutput at sign-in
   (memory only, separate from the wallet key). saltFor(duelId) = HMAC(voteKey, chainId||contract||id).
   commitment = keccak256(encodeAbiParameters([uint256,uint8,bytes32,address], ...)) matching
   commitmentFor. Reveal needs no local storage, so verify by recomputing on a fresh session.
   Add a unit test proving the TS commitment equals the contract formula for a fixed vector.

4. SCREENS (hash router):
   - Onboard: one button "Create account with passkey", one "Sign in". Explain nothing else.
   - Feed: room tabs (purdue, lafayette, open), duel cards with both thumbnails, phase + countdown.
   - Duel page (the signature visual): A and B side by side; the vertical seam between them sits at
     the pool split (poolA / total), animated when a prediction lands. Phase-aware action panel:
     commit phase -> "Predict A/B" (amount input) OR "Vote" (blind) with the conflict rules explained in one line;
     reveal phase -> "Reveal my vote"; ended -> "Settle"; settled -> "Claim winnings" / "Claim voter reward" /
     "Claim creator share" as applicable; settled A/B -> Hunyuan insight panel.
   - Create: two drop zones (compress client-side to <=1600px JPEG), title, room, duration
     (5 min demo / 1 hour / 1 day), "Post duel" -> uploadPair -> createDuel.
   - Leaderboard: top tastemakers (taste rep) and top creators per room.
   - Profile: my rep, earnings, positions, duels, and insights on my settled duels.

5. DESIGN: Not a generic dark crypto UI. Palette: paper #FAFAFB, ink #1A1A2E, side A cobalt #2747D6,
   side B marigold #F2A900, muted #6B7080, plus a dark-mode set. Type: Bricolage Grotesque (display)
   + Atkinson Hyperlegible (body). Mobile-first (judges may test on phones), visible focus states,
   prefers-reduced-motion respected. The seam is the one bold element; keep everything else quiet.

6. Wire real endpoints from .env when Branch A posts them; run `npm run build` clean.
   Add web/vercel.json for SPA routing and print Vercel deploy steps (HTTPS needed for passkeys).

7. Open a PR feat/app -> main. Do not merge until feat/chain is merged; then merge main into
   feat/app, rebuild, and verify one full duel lifecycle end to end on testnet.
```

---

## Merge order
1. Merge `feat/chain` → `main`.
2. In `feat/app`: `git merge main`, set real env vars, rebuild, run one full duel.
3. Merge `feat/app` → `main`. No conflicts are expected, because the folders don't overlap.
