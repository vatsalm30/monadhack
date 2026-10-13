# Pairwise indexer (Envio HyperIndex v3)

Indexes the `Pairwise` contract on Monad testnet (`10143`) into the entities the web app queries
(`shared/queries.graphql`): `Duel`, `Position`, `User`, `Room`, `Activity`.

| | |
| --- | --- |
| Contract | `0xe4F3962C903a7e1bC45A2D0bD8A7F5b6379a3353` |
| Start block | `70808463` |
| Data source | HyperSync (Monad testnet is supported, no RPC needed) |

## Layout

- `config.yaml`: chain, address, start block and the 8 event signatures.
- `schema.graphql`: entities. Field names match `shared/types.ts`.
- `src/handlers/Pairwise.ts`: one handler per event.
- `src/room.ts`: decodes the bytes32 room back to its slug.
- `test/lifecycle.test.ts`: simulated full duel lifecycle (no network).

Notes on the data:

- Addresses are stored lowercase. `Position.id` is `${duelId}_${user}`.
- `User.earned` is profit only: payout minus stake on winning claims. Refunds add nothing.
- `Position` covers predictors and voters. `side` is null for voters; `firstAt` is the vote commit time for them.
- `Activity.kind` is one of `CREATED, PREDICTED, VOTE_COMMITTED, VOTE_REVEALED, SETTLED, CLAIMED, VOTER_REWARD, CREATOR_PAID`.

## Local dev

Requires Node ≥ 22.15 and Docker (Envio runs Postgres + Hasura locally).

```bash
cd indexer
npm install
cp .env.example .env        # add ENVIO_API_TOKEN from https://envio.dev/app/api-tokens
npx envio codegen
npx tsc --noEmit
npm test                    # simulated lifecycle, no network or Docker
npm run dev                 # GraphQL at http://localhost:8080/v1/graphql (Hasura password: testing)
```

If you change `config.yaml` or `schema.graphql`, run `npx envio codegen` again.

## Deploy to Envio hosted service

1. Sign in at https://envio.dev/app with GitHub and install the Envio GitHub app on `vatsalm30/monadhack`.
2. Add an indexer:
   - Repository: `vatsalm30/monadhack`
   - Branch: `feat/chain` (switch to `main` after the PR merges)
   - Root directory: `indexer`
   - Config file: `config.yaml`
3. Push to the branch. Each commit triggers a deployment; wait until it shows as synced.
4. Copy the GraphQL endpoint (`https://indexer.dev.hyperindex.xyz/<id>/v1/graphql`) and set it as
   `VITE_ENVIO_URL` for the web app.

Same thing from the terminal with the Envio Cloud CLI:

```bash
npx envio-cloud login
npx envio-cloud indexer add --name pairwise --repo vatsalm30/monadhack --branch feat/chain
npx envio-cloud indexer settings set pairwise   # root dir: indexer, config: config.yaml
git push origin feat/chain
npx envio-cloud deployment status pairwise $(git rev-parse --short HEAD) --watch-till-synced
npx envio-cloud deployment endpoint pairwise $(git rev-parse --short HEAD)
```

Smoke test once it's synced:

```bash
curl -s "$VITE_ENVIO_URL" -H 'content-type: application/json' \
  -d '{"query":"{ Duel(limit: 5, order_by: {createdAt: desc}) { id room title outcome } }"}'
```
