import { MichelsonMap } from "@taquito/taquito";
import { buf2hex } from "@taquito/utils";
import { IPFS_UPLOAD_API_KEY, IPFS_UPLOAD_URL } from "./config";

// Check if running in a Node.js environment
const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

let FormDataNode: new () => any;
let fetch:
  | (((
      input: RequestInfo | URL,
      init?: RequestInit | undefined
    ) => Promise<Response>) &
      ((
        input: RequestInfo | URL,
        init?: RequestInit | undefined
      ) => Promise<Response>))
  | ((arg0: string, arg1: { method: string; body: any; headers: {} }) => any);

if (isNode) {
  FormDataNode = require("form-data");
  fetch = require("node-fetch");
} else {
  fetch = window.fetch; // Use the browser's fetch
}

// TZIP16 metadata is stored inline in the contract's own %metadata big_map via
// the tezos-storage: scheme, requiring no third-party service at all.
function toOnChainMetadata(str: string): {
  metadata: MichelsonMap<any, unknown>;
} {
  return {
    metadata: MichelsonMap.fromLiteral({
      "": buf2hex(Buffer.from("tezos-storage:content")),
      content: buf2hex(Buffer.from(str, "utf-8")),
    }),
  };
}

async function uploadToIpfs(str: string): Promise<{
  metadata: MichelsonMap<any, unknown>;
}> {
  let formData;
  let headers: Record<string, string> = IPFS_UPLOAD_API_KEY
    ? { Authorization: `Bearer ${IPFS_UPLOAD_API_KEY}` }
    : {};

  if (isNode) {
    // Node.js environment
    formData = new FormDataNode();
    const buffer = Buffer.from(str, "utf-8");
    formData.append("file", buffer, "tzsafe-metadata.json");
    headers = { ...headers, ...formData.getHeaders() };
  } else {
    // Browser environment
    formData = new FormData();
    const blob = new Blob([str], { type: "application/json" });
    formData.append("file", blob, "tzsafe-metadata.json");
  }

  const response = await fetch(`${IPFS_UPLOAD_URL}/add`, {
    method: "POST",
    body: formData,
    headers,
  });

  const data = (await response.json()) as { cid: string };

  return {
    metadata: MichelsonMap.fromLiteral({
      "": buf2hex(Buffer.from(`ipfs://${data.cid}`)),
    }),
  };
}

export default async function fromIpfs(meta: any): Promise<{
  metadata: MichelsonMap<any, unknown>;
}> {
  const str = JSON.stringify(meta);

  // IPFS upload only kicks in when both the endpoint and API key are
  // configured; otherwise metadata is stored on-chain (see toOnChainMetadata).
  if (!IPFS_UPLOAD_URL || !IPFS_UPLOAD_API_KEY) {
    return toOnChainMetadata(str);
  }

  return uploadToIpfs(str);
}
