import { TezosToolkit } from "@taquito/taquito";
import { tzip12 } from "@taquito/tzip12";
import BigNumber from "bignumber.js";

export function getTokenMetadata(
  contract: string,
  tokenId: number,
  Tezos: TezosToolkit
) {
  return Tezos.contract
    .at(contract, tzip12)
    .then(contract => contract.tzip12().getTokenMetadata(BigNumber(tokenId)));
}
