# TzSafe

TzSafe is a website to interact with multi-signatures wallets. The goal is to have a UI layer above the LIGO contracts that you can find [here](https://github.com/marigold-dev/tzsafe).

- Documentation can be found [here](https://docs.tzsafe.marigold.dev/).
- Mainnet version of this frontend UI can be found on [tzsafe.marigold.dev](https://tzsafe.marigold.dev/).

## How to develop

First, clone the repository:

```bash
git clone https://github.com/marigold-dev/tzsafe-ui/
```

Then install the dependencies:

```bash
npm i
```

Finally you can develop with:

```bash
npm run dev
```

`npm run dev` uses the Shadownet configuration in `config/.env.dev` (RPC: `https://tezos-shadownet.octez.io/`, TzKT: `https://api.shadownet.tzkt.io`).

### Environment configuration

Environment files live in `config/`:

| File           | Network       | RPC                                 | TzKT API                        |
| -------------- | ------------- | ----------------------------------- | ------------------------------- |
| `.env.dev`     | Shadownet     | `https://tezos-shadownet.octez.io/` | `https://api.shadownet.tzkt.io` |
| `.env.mainnet` | Mainnet       | `https://tezos-mainnet.octez.io/`   | `https://api.tzkt.io`           |
| `.env.sandbox` | Local sandbox | `http://127.0.0.1:8732/`            | `http://127.0.0.1:5010`         |

Each file sets:

- `NEXT_PUBLIC_RPC_URL` — Tezos RPC endpoint
- `NEXT_PUBLIC_API_URL` — TzKT API endpoint
- `NEXT_PUBLIC_NETWORK_TYPE` — `mainnet`, `shadownet`, or `custom`

Optional IPFS upload (only used when creating new wallets):

- `NEXT_PUBLIC_IPFS_UPLOAD_URL` — Kubo-compatible `/add` endpoint
- `NEXT_PUBLIC_IPFS_UPLOAD_API_KEY` — Bearer token for that endpoint

When both IPFS variables are unset, contract metadata is stored on-chain via the `tezos-storage:` scheme instead.

### How to run

There are two ways to run TzSafe, with or without docker.

#### Docker

```bash
docker build -t tzsafe .
docker run -p 8080:80 tzsafe
```

When building the application you can specify which node and which network you want to use:

```bash
docker build --build-arg="PUBLIC_RPC_URL=https://tezos-mainnet.octez.io/" -t tzsafe .
```

You can override:

- `PUBLIC_RPC_URL`: the URL of the node you want to use (default: `https://rpc.tzkt.io/mainnet/`)
- `PUBLIC_API_URL`: the URL of a TzKT instance (default: `https://api.tzkt.io`)
- `PUBLIC_NETWORK_TYPE`: the type of the network (default: `mainnet`)

#### With NPM

```bash
npm i
npm run start:mainnet   # mainnet dev server
npm run dev             # shadownet dev server
npm run sandbox         # local sandbox dev server (port 4000)
```

You can override variables by editing the files in `config/`.

### Build and deploy

Static export builds:

```bash
npm run build:dev       # shadownet
npm run build:mainnet   # mainnet
npm run build:livenet   # alias for mainnet build
npm run build:testnet   # alias for shadownet build
```

Cloudflare Pages deployment (requires `wrangler`):

```bash
npm run deploy:livenet  # deploy mainnet build
npm run deploy:testnet  # deploy shadownet build to the shadownet branch
```

### Testing

```bash
npm run check           # TypeScript typecheck
npm test                # unit tests (vitest)
npx vitest run tests/e2eTest   # e2e tests against shadownet (requires funded test account)
```

Fund the e2e test account on Shadownet:

```bash
npm run get_tez
```

## Sandbox

Sandbox enables us to locally run Tezos-node and Tzkt. There are two modes: stateful and stateless. In stateful mode, the data of Tezos-node and the database of Tzkt are preserved when docker compose stops, while in stateless mode, both start from the genesis block.

```bash
# To start stateless node
docker-compose -f docker-compose.stateless.yml up --abort-on-container-exit

# To start stateful node
docker-compose -f docker-compose.stateful.yml up --abort-on-container-exit
```

## Dependencies

- **Taquito v25** — required for Shadownet's PsUshuai (`025`) protocol support
- **@ecadlabs/beacon-sdk** — aligned with `@taquito/beacon-wallet` (includes relay-hardening fixes for wallet connectivity)
