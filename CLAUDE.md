# Pairwise — Monad Metropolis Hackathon (Social, Attention & Culture track)

Repo: https://github.com/vatsalm30/monadhack. Deadline: Oct 13, 2026, 23:59 EDT.

## Product
Creators post two artworks (A vs B) in a local room (e.g. `purdue`). Fans **predict** which one the crowd
will pick (parimutuel pool). A separate group **votes** blind (commit-reveal). Correct predictors earn the pool
and onchain "taste rep" (more for earlier calls); the creator earns 5%; every revealed voter shares 2%.
Target community: Purdue student artists. Instagram gives likes; Pairwise gives real A/B signal + income.

## Bounties targeted (each serves a real purpose)
- **Mera (Best UX)**: passkey is the entire account layer. No wallet, no seed phrase.
- **Mera (One Passkey, Many Keys)**: vote salts derived from the PRF output via HKDF/HMAC → secret ballots
  that can be revealed from any device with zero stored state.
- **Envio**: feed, leaderboards, taste rep, activity, all from HyperIndex GraphQL.
- **Hunyuan (Tencent)**: upload moderation + post-duel "why it won" insight for creators.
- Do NOT add Privy/Dynamic (conflict with Mera as the account layer).

## Repo layout & ownership
```
contracts/  indexer/  server/   → branch feat/chain (Person A)
web/                            → branch feat/app   (Person B)
shared/                         → frozen interface, created on main in step 0
```
Never edit the other branch's folders. Changes to `shared/` must be agreed first.

## Chain facts (verified)
- Monad testnet: chain id `10143`, viem export `monadTestnet` (needs a recent viem, use `viem@2.57.3`;
  old 2.21.x lacks it). Mainnet `143` / `monad`.
- **Monad bills the declared gas limit, not gas used.** Always pass explicit `gas`
  (estimate × 1.2 for contract calls, `21_000n` for transfers).
- RPC: `https://testnet-rpc.monad.xyz`. Faucet: faucet.monad.xyz.

## Contract spec: `Pairwise.sol` (Solidity ^0.8.24, Foundry)
Constructor `(uint64 revealWindow, uint32 minReveals)`; demo deploy uses 3 min / 1.
Constants: `CREATOR_BPS=500`, `VOTER_BPS=200`, `MIN_COMMIT=2 minutes`, `MAX_COMMIT=7 days`.
`enum Side {None, A, B}`, `enum Outcome {Open, A, B, Refund}`.

Duel struct: `creator, createdAt, commitEnd, revealEnd, outcome, room(bytes32), hashA, hashB,
poolA(uint128), poolB, votesA(uint32), votesB, uriA, uriB, title`.
`room` = slug encoded with `stringToHex(slug, {size: 32})` (≤31 chars) so the indexer can decode it.

Functions:
- `createDuel(room, title, uriA, uriB, hashA, hashB, commitDuration)`: hashes are sha256 of the files; revert if equal.
- `predict(id, side) payable`: commit phase only. One side per user (no hedging). Blocked for creator and for anyone who committed a vote.
- `commitVote(id, commitment)`: commit phase only. Blocked for creator and predictors. One per address.
- `revealVote(id, side, salt)`: reveal phase only (`commitEnd ≤ now < revealEnd`).
- `commitmentFor(id, side, salt, voter) pure = keccak256(abi.encode(id, side, salt, voter))`.
- `settle(id)`: permissionless after `revealEnd`. Refund if reveals < minReveals, tie, or the winning pool is empty while the total pool > 0.
- `claim(id)`: Refund → stake back. Winner → `stake * (pool - 7%) / winPool`, plus `tasteRep += 10 + 90*(commitEnd-firstAt)/(commitEnd-createdAt)`.
- `claimVoterReward(id)`: `pool*2%/totalReveals` to any revealed voter (either side). Only on A/B outcome.
- `claimCreator(id)`: `pool*5%` to creator, once. Only on A/B outcome.
- Views: `getDuel(id)`, `positions(id,user)`, `ballots(id,user)`, `tasteRep(user)`, `duelCount`.

Events: `DuelCreated(id idx, creator idx, room idx, title, uriA, uriB, hashA, hashB, commitEnd, revealEnd)`,
`Predicted(id idx, user idx, side, amount, poolA, poolB)`, `VoteCommitted(id idx, voter idx)`,
`VoteRevealed(id idx, voter idx, side)`, `DuelSettled(id idx, outcome, votesA, votesB, poolA, poolB)`,
`Claimed(id idx, user idx, amount, repGained)`, `VoterRewardClaimed(id idx, voter idx, amount)`,
`CreatorPaid(id idx, creator idx, amount)`.
Custom errors: `BadPhase, BadInput, Conflict, AlreadyDone, NothingOwed, TransferFailed`.

## Mera (verified API, `@category-labs/mera@0.2.0`)
```ts
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession, isMeraError } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
// deps: viem @scure/bip32 @scure/bip39
const created = await createPasskeyWithPrfOutput({ rp: { id: location.hostname, name: "Pairwise" }, user: { name, displayName } });
// created.prfOutput: Uint8Array(32); store { credentialId, transports } in localStorage (no key material)
const { prfOutput, credentialId } = await getPasskeyPrfOutput({ rpId: location.hostname, credential: known });
// EVM key: entropyToMnemonic(prfOutput) → mnemonicToSeedSync → HDKey.derive("m/44'/60'/0'/0/0")
const session = createSecp256k1SigningSession({ privateKey }); const account = toViemAccount(session); session.end();
// Errors: PRF_UNAVAILABLE, PASSKEY_OPERATION_FAILED, CRYPTO_UNAVAILABLE, SESSION_ENDED
```
Requires HTTPS or localhost. Desktop Chrome: passkey must save to Google Password Manager or PRF fails.
Passkeys are bound to `rpId`, so lock the production domain before creating real accounts.

**Ballot key (PRF non-wallet use):** `voteKey = HKDF-SHA256(prfOutput, salt="pairwise", info="pairwise/vote-key/v1")`
(domain-separated from the wallet key; memory only). `salt(id) = HMAC-SHA256(voteKey, chainId‖contract‖id)` as bytes32.
Deterministic, so reveal works on any device with the same passkey. Use `@noble/hashes`.

## Envio HyperIndex v3 (verified, `envio@3.14.0`)
- Config uses `chains:` (not `networks:`), top-level `contracts:` with `abi_file_path`, `handler`, `events: - event: Name`.
- Addresses in config must be quoted strings.
- Handlers: `import { indexer } from "envio"; indexer.onEvent({ contract: "Pairwise", event: "Predicted" }, async ({ event, context }) => {...})`.
- Entities: `context.X.get/getOrThrow/set`; entities are read-only, so spread then set. `event.block.timestamp` is a number.
- Run `npx envio codegen`; include `envio-env.d.ts` in tsconfig.

## Hunyuan (OpenAI-compatible)
`POST https://api.hunyuan.cloud.tencent.com/v1/chat/completions`, `Authorization: Bearer $HUNYUAN_API_KEY`,
model `hunyuan-vision`, images as `{type:"image_url", image_url:{url:"data:image/...;base64,..."}}`.
Server-side only (never expose the key). Parse JSON defensively (strip ``` fences).

## Shared interface (`shared/`)
- `shared/abi/Pairwise.json`: copied from `contracts/out` after A compiles (A updates it; B only reads).
- `shared/types.ts`: `Duel { id, creator, room, title, uriA, uriB, hashA, hashB, createdAt, commitEnd, revealEnd,
  poolA: bigint, poolB: bigint, predictors, committedVotes, votesA, votesB, outcome: "OPEN"|"A"|"B"|"REFUND" }`,
  `Position`, `UserStats { id, tasteRep, earned, creatorEarned, voterEarned, duelsCreated, predictions, correctCalls, votesRevealed }`,
  `Insight { winner: "A"|"B", why: string, tips: string[] }`.
- `shared/api.md`:
  - `POST /api/upload` multipart `a`,`b` (jpeg/png/webp, ≤4MB) → `{ uriA, uriB, hashA, hashB }` | 422 `{error}` if moderation fails.
  - `GET /api/insight/:duelId` → `Insight` (generated once after settlement, cached) | 404.
  - `POST /api/drip {address}` → `{hash}` | `{skipped}` | 429/503 `{error}`.
- `shared/queries.graphql`: feed by room (order by createdAt desc), duel by id, positions by user, leaderboard (User order by tasteRep desc), activity by duel.
- `shared/config.md`: env names. Web: `VITE_CONTRACT`, `VITE_START_BLOCK`, `VITE_ENVIO_URL`, `VITE_API_URL`.
  Server: `PORT, PUBLIC_URL, ALLOWED_ORIGINS, HUNYUAN_API_KEY, FAUCET_PRIVATE_KEY, FAUCET_DRIP_MON`.

## Conventions
- Pin exact dependency versions. TypeScript strict. Never commit `.env` or keys.
- Small commits with clear messages; push the feature branch often.
- Copy: sentence case, plain verbs, errors say what happened and how to fix it.
