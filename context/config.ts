import { NetworkType } from "@airgap/beacon-sdk";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://tezos-shadownet.octez.io/";
export const TZKT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.shadownet.tzkt.io";
// IPFS upload is optional: ipfs-proxy.gcp.marigold.dev (the previous default) has
// been decommissioned, and every well-known IPFS pinning provider now requires an
// API key/secret that can't be safely embedded in this statically-exported
// frontend. Rather than hardcode a default, IPFS upload is only enabled when both
// vars below are explicitly configured (e.g. a self-hosted Kubo-compatible "/add"
// proxy, secured with a bearer token). When unset, contract metadata is stored
// on-chain (tezos-storage:) instead - see context/fromIpfs.ts.
export const IPFS_UPLOAD_URL = process.env.NEXT_PUBLIC_IPFS_UPLOAD_URL;
export const IPFS_UPLOAD_API_KEY = process.env.NEXT_PUBLIC_IPFS_UPLOAD_API_KEY;
export const IPFS_NODE = "gateway.pinata.cloud";
export const PREFERED_NETWORK: NetworkType =
  process.env.NEXT_PUBLIC_NETWORK_TYPE === "mainnet"
    ? NetworkType.MAINNET
    : process.env.NEXT_PUBLIC_NETWORK_TYPE === "shadownet"
    ? NetworkType.SHADOWNET
    : NetworkType.CUSTOM;

// The network object actually sent to wallets during the permission handshake.
// @taquito/beacon-wallet bundles its own (older) copy of @airgap/beacon-types
// whose NetworkType enum predates newer networks like "shadownet" - passing
// that string through causes wallets (and/or our own bundled beacon-core) to
// silently fail to complete the handshake (request sent, no response ever
// arrives). NetworkType.CUSTOM + an explicit rpcUrl is the long-standing,
// version-agnostic escape hatch for exactly this case, and is understood by
// every Beacon wallet regardless of how new the named network is.
export const WALLET_NETWORK =
  PREFERED_NETWORK === NetworkType.MAINNET
    ? { type: NetworkType.MAINNET }
    : {
        type: NetworkType.CUSTOM,
        name: PREFERED_NETWORK,
        rpcUrl: RPC_URL,
      };

export const WERT_URL =
  PREFERED_NETWORK === NetworkType.MAINNET
    ? "https://widget.wert.io"
    : "https://sandbox.wert.io";
export const WERT_ID =
  PREFERED_NETWORK === NetworkType.MAINNET
    ? "01HHEV4BKRFT2BRPRMDH74HSQQ"
    : "01HBARVR2HGGY24WC52R4J89R8";

export const THUMBNAIL_URL = "https://display-thumbs.dipdup.net";

export const DEFAULT_TIMEOUT = 60000;
export const MODAL_TIMEOUT = 2000;
// 10 minutes -> Cotnract times are in seconds
export const PROPOSAL_DURATION_WARNING = 600;

export const MARIGOLD_LOGO_URL =
  "https://uploads-ssl.webflow.com/616ab4741d375d1642c19027/61793ee65c891c190fcaa1d0_Vector(1).png";
