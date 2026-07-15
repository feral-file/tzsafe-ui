import BigNumber from "bignumber.js";
import { version } from "../types/display";
import { isListOperation } from "../versioned/util";

// Tezos `nat`/`int` values (token ids, token amounts, ...) are arbitrary
// precision and can exceed `Number.MAX_SAFE_INTEGER` (e.g. hash-derived FA2
// token ids). Accepting a plain `number` and interpolating it into a
// Michelson literal via a template string is lossy and, for large enough
// values, produces JS's exponential notation (e.g. `8.7e+76`) which isn't
// valid Michelson and breaks the Micheline parser. `michelsonNat` keeps the
// value as a `BigNumber`/digit-string for as long as possible so precision
// is never lost before it's turned into Michelson source.
export type michelsonNat = BigNumber | string | number;

/**
 * Converts a value meant to be embedded as a Michelson `nat`/`int` literal
 * into a plain decimal digit string, without ever going through a lossy
 * `Number` conversion.
 *
 * Throws if the value isn't a finite, non-negative integer, since that's
 * the only kind of literal a Michelson `nat` (and our unsigned `int` use
 * cases below) can represent.
 */
export function toMichelsonNat(
  value: michelsonNat,
  fieldName: string = "value"
): string {
  let bn: BigNumber;
  try {
    bn = BigNumber.isBigNumber(value) ? value : new BigNumber(value);
  } catch {
    throw new Error(`Invalid ${fieldName}: "${value}" is not a valid number`);
  }

  if (bn.isNaN() || !bn.isFinite()) {
    throw new Error(`Invalid ${fieldName}: "${value}" is not a valid number`);
  }

  if (bn.isNegative()) {
    throw new Error(
      `Invalid ${fieldName}: "${bn.toFixed()}" can't be negative`
    );
  }

  if (!bn.isInteger()) {
    throw new Error(
      `Invalid ${fieldName}: "${bn.toFixed()}" must be a whole number`
    );
  }

  // `toFixed()` always yields plain decimal digits (never exponential
  // notation), regardless of magnitude, unlike `toNumber()`/`toString()`.
  return bn.toFixed();
}

export type makeFa2MichelsonParam = {
  walletAddress: string;
  targetAddress: string;
  tokenId: michelsonNat;
  amount: michelsonNat;
  fa2Address: string;
};

export type makeFa1_2MichelsonParam = {
  amount: michelsonNat;
  fa1_2Address: string;
};

export type approve = makeFa1_2MichelsonParam & {
  spenderAddress: string;
};

export type transfer = makeFa1_2MichelsonParam & {
  walletAddress: string;
  targetAddress: string;
};

export type makeContractExecutionParam = {
  address: string;
  entrypoint: string;
  type: string;
  amount: number;
  param: string;
};

export function generateFA2Michelson(
  version: version,
  params: makeFa2MichelsonParam[]
) {
  if (params.length === 0) throw new Error("Empty fa2 params");

  const txs = params.map(({ targetAddress, tokenId, amount, fa2Address }) => ({
    targetAddress,
    fa2Address,
    tokenId: toMichelsonNat(tokenId, "tokenId"),
    amount: toMichelsonNat(amount, "amount"),
  }));
  const walletAddress = params[0].walletAddress;

  if (isListOperation(version)) {
    return `{
        DROP;
        NIL operation ;
        PUSH address "${txs[0].fa2Address}";
        CONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));
        IF_NONE { PUSH string "contract dosen't exist" ; FAILWITH } { } ;
        PUSH mutez 0 ;
        PUSH (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount)))))) {Pair "${walletAddress}" {
          ${txs
            .map(
              ({ targetAddress, tokenId, amount }) =>
                `Pair "${targetAddress}" (Pair ${tokenId} ${amount}) ;`
            )
            .join("\n")}
          
        } };
        TRANSFER_TOKENS ;
        CONS ;
      }`;
  } else if (version !== "unknown version") {
    return `{
        DROP;
        PUSH address "${txs[0].fa2Address}";
        CONTRACT %transfer (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount))))));
        IF_NONE { PUSH string "contract dosen't exist" ; FAILWITH } { } ;
        PUSH mutez 0 ;
        PUSH (list (pair (address %from_) (list %txs (pair (address %to_) (pair (nat %token_id) (nat %amount)))))) {Pair "${walletAddress}" {
          ${txs
            .map(
              ({ targetAddress, tokenId, amount }) =>
                `Pair "${targetAddress}" (Pair ${tokenId} ${amount}) ;`
            )
            .join("\n")}
          
        } };
        TRANSFER_TOKENS ;
      }`;
  }

  throw new Error("Can't generate for an unknow version");
}

export function generateFA1_2ApproveMichelson(
  version: version,
  { spenderAddress, amount, fa1_2Address }: approve
) {
  const value = toMichelsonNat(amount, "amount");

  if (isListOperation(version)) {
    return `{ 
        DROP ;
        NIL operation ;
        PUSH address "${fa1_2Address}" ;
        CONTRACT %approve (pair (address :spender) (nat :value)) ;
        IF_NONE { PUSH string "contract dosen't exist" ; FAILWITH } { } ;
        PUSH mutez 0 ;
        PUSH (pair (address :spender) (nat :value)) (Pair "${spenderAddress}" ${value}) ;
        TRANSFER_TOKENS ;
        CONS ;
    }`;
  } else if (version !== "unknown version") {
    return `{ 
        DROP ;
        PUSH address "${fa1_2Address}" ;
        CONTRACT %approve (pair (address :spender) (nat :value)) ;
        IF_NONE { PUSH string "contract dosen't exist" ; FAILWITH } { } ;
        PUSH mutez 0 ;
        PUSH (pair (address :spender) (nat :value)) (Pair "${spenderAddress}" ${value}) ;
        TRANSFER_TOKENS ;
    }`;
  }

  throw new Error("Can't generate for an unknow version");
}

export function generateFA1_2TransferMichelson(
  version: version,
  { walletAddress, targetAddress, amount, fa1_2Address }: transfer
) {
  const value = toMichelsonNat(amount, "amount");

  if (isListOperation(version)) {
    return `{ 
          DROP ;
          NIL operation ;
          PUSH address "${fa1_2Address}" ;
          CONTRACT %transfer (pair (address :from) (pair (address :to) (nat :amount))) ;
          IF_NONE { PUSH string "contract dosen't exist" ; FAILWITH } { } ;
          PUSH mutez 0 ;
          PUSH  (pair (address :from) (pair (address :to) (nat :amount))) (Pair "${walletAddress}" (Pair "${targetAddress}" ${value})) ;
          TRANSFER_TOKENS ;
          CONS ;
      }`;
  } else if (version !== "unknown version") {
    return `{ 
          DROP ;
          PUSH address "${fa1_2Address}" ;
          CONTRACT %transfer (pair (address :from) (pair (address :to) (nat :amount))) ;
          IF_NONE { PUSH string "contract dosen't exist" ; FAILWITH } { } ;
          PUSH mutez 0 ;
          PUSH  (pair (address :from) (pair (address :to) (nat :amount))) (Pair "${walletAddress}" (Pair "${targetAddress}" ${value})) ;
          TRANSFER_TOKENS ;
      }`;
  }

  throw new Error("Can't generate for an unknow version");
}

export function generateExecuteContractMichelson(
  version: version,
  { address, entrypoint, type, amount, param }: makeContractExecutionParam
) {
  let michelsonEntrypoint = "";
  if (entrypoint !== "default") {
    michelsonEntrypoint = `%${entrypoint}`;
  }

  if (isListOperation(version)) {
    return `{
          DROP;
          NIL operation ;
          PUSH address "${address}";
          CONTRACT ${michelsonEntrypoint} ${type};
          IF_NONE { PUSH string "contract dosen't exist"; FAILWITH } { };
          PUSH mutez ${amount};
          PUSH ${type} ${param} ;
          TRANSFER_TOKENS ;
          CONS ;
      }`;
  } else if (version !== "unknown version") {
    return `{
          DROP;
          PUSH address "${address}";
          CONTRACT ${michelsonEntrypoint} ${type};
          IF_NONE { PUSH string "contract dosen't exist"; FAILWITH } { };
          PUSH mutez ${amount};
          PUSH ${type} ${param} ;
          TRANSFER_TOKENS ;
      }`;
  }

  throw new Error("Can't generate for an unknow version");
}

export function generateDelegateMichelson(
  version: version,
  { bakerAddress }: { bakerAddress: string }
) {
  if (isListOperation(version)) {
    return `{
        DROP ;
        NIL operation ;
        PUSH key_hash "${bakerAddress}" ;
        SOME ;
        SET_DELEGATE ;
        CONS ;
      }`;
  } else if (version !== "unknown version") {
    return `{
        DROP ;
        PUSH key_hash "${bakerAddress}" ;
        SOME ;
        SET_DELEGATE ;
      }`;
  }

  throw new Error("Can't generate for an unknow version");
}

export function generateUndelegateMichelson(version: version) {
  if (isListOperation(version)) {
    return `{
        DROP ;
        NIL operation ;
        NONE key_hash ;
        SET_DELEGATE ;
        CONS ;
      }`;
  } else if (version !== "unknown version") {
    return `{
        DROP ;
        NONE key_hash ;
        SET_DELEGATE ;
      }`;
  }

  throw new Error("Can't generate for an unknown version");
}
