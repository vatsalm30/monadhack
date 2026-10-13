# Environment variables

Never commit `.env`. The root `.env.example` lists every name below.

## `web/` (Vite — all values are public, baked into the bundle)

| Name | Example | Notes |
| --- | --- | --- |
| `VITE_CONTRACT` | `0x…` | Deployed `Pairwise` address on Monad testnet. |
| `VITE_START_BLOCK` | `12345678` | Deploy block, used for log range hints. |
| `VITE_ENVIO_URL` | `https://indexer.dev.hyperindex.xyz/…/v1/graphql` | If unset, the web app uses mock data. |
| `VITE_API_URL` | `https://pairwise-api.up.railway.app` | Upload, insight and drip endpoints. |

## `server/`

| Name | Example | Notes |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port. |
| `PUBLIC_URL` | `https://pairwise-api.up.railway.app` | Prefix for returned upload URIs. |
| `ALLOWED_ORIGINS` | `http://localhost:5173,https://pairwise.vercel.app` | Comma separated CORS allowlist. |
| `HUNYUAN_API_KEY` | `sk-…` | Server only. If missing, moderation is skipped with a warning. |
| `FAUCET_PRIVATE_KEY` | `0x…` | Funds the drip endpoint. Keep out of git. |
| `FAUCET_DRIP_MON` | `0.05` | MON sent per new account. |

## `contracts/`

| Name | Example | Notes |
| --- | --- | --- |
| `PK` | `0x…` | Deployer private key, passed on the command line only. |
| `REVEAL_WINDOW` | `180` | Seconds between `commitEnd` and `revealEnd`. Demo uses 3 min. |
| `MIN_REVEALS` | `1` | Below this, `settle` refunds. Demo uses 1. |

## `indexer/`

| Name | Example | Notes |
| --- | --- | --- |
| `ENVIO_PAIRWISE_ADDRESS` | `0x…` | Mirrors `VITE_CONTRACT`; also written into `config.yaml`. |
| `ENVIO_START_BLOCK` | `12345678` | Deploy block. |

## Shared chain facts

Monad testnet: chain id `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`.
Monad bills the declared gas limit, so every transaction passes an explicit `gas`.
