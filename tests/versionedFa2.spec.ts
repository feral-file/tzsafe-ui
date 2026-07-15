// Regression tests for the crash reported when creating an FA2/FA1.2
// proposal for a token whose id/amount exceeds `Number.MAX_SAFE_INTEGER`
// (e.g. hash-derived FA2 token ids used by contracts such as objkt.com
// collections). Each versioned wallet contract implementation builds its
// own raw Michelson string and parses it with `@taquito/michel-codec`
// inside `mapTransfer`, so this exercises the full "build a proposal"
// pipeline end to end, not just the Michelson-generating helpers.
import { WalletContract } from "@taquito/taquito";
import { bytesToString } from "@taquito/utils";
import { describe, expect, it } from "vitest";
import { LambdaType, parseLambda } from "../context/parseLambda";
import { transfer } from "../versioned/interface";
import Version0_0_10 from "../versioned/version0_0_10";
import Version0_0_11 from "../versioned/version0_0_11";
import Version0_3_3 from "../versioned/version0_3_3";

const cc = { address: "walletAddress" } as unknown as WalletContract;

// Same value used in tests/generateLambda.spec.ts: larger than
// `Number.MAX_SAFE_INTEGER`, the shape of a hash-derived FA2 token id.
const HUGE_TOKEN_ID =
  "87284127967429943799359267359317190322060012651182306893343757589584080531268";

const fa2TokenFixture = (decimals: string) =>
  ({
    token: {
      metadata: { decimals },
    },
  } as any);

const fa1_2TokenFixture = (decimals: string) =>
  ({
    token: {
      metadata: { decimals },
    },
  } as any);

// `mapTransfer`'s return type is a union across every `transfer.type` case,
// so TS can't narrow it from a runtime-only literal produced via
// `as unknown as transfer`. All the fixtures below always hit an
// `execute_lambda`-returning branch, so this just gives that a concrete type.
const getLambda = (result: any) => result.execute_lambda.lambda;

describe("Version0_0_10 (no decimals-adjustment fa2 path)", () => {
  const versioned = new Version0_0_10("0.0.10", "contractAddress");

  it("still builds a valid proposal for an ordinary small token id (no regression)", () => {
    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: "1",
            amount: "11",
            fa2Address: "fa2address",
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [type, lambda] = parseLambda("0.0.10", getLambda(result));
    expect(type).toBe(LambdaType.FA2);
    expect(lambda?.data).toMatchObject([
      {
        from_: "walletAddress",
        txs: [{ to_: "targetAddress1", token_id: "1", amount: "11" }],
      },
    ]);
  });

  it("no longer crashes when the token id exceeds Number.MAX_SAFE_INTEGER", () => {
    expect(() =>
      versioned.mapTransfer(
        {
          type: "fa2",
          values: [
            {
              targetAddress: "targetAddress1",
              tokenId: HUGE_TOKEN_ID,
              amount: "1",
              fa2Address: "fa2address",
            },
          ],
          fields: [],
        } as unknown as transfer,
        cc
      )
    ).not.toThrow();

    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: HUGE_TOKEN_ID,
            amount: "1",
            fa2Address: "fa2address",
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [type, lambda] = parseLambda("0.0.10", getLambda(result));
    expect(type).toBe(LambdaType.FA2);
    expect(lambda?.data).toMatchObject([
      {
        from_: "walletAddress",
        txs: [{ to_: "targetAddress1", token_id: HUGE_TOKEN_ID, amount: "1" }],
      },
    ]);
  });

  it("also keeps the huge token id exact in the informational metadata blob (separate from the Michelson lambda)", () => {
    // Regression test: `mapTransfer` builds a second, purely informational
    // JSON blob (`execute_lambda.metadata`) alongside the Michelson lambda,
    // used only for display purposes. It used to run `Number(value.tokenId)`
    // independently of the Michelson-generating code path, so fixing the
    // Michelson generator alone didn't fix this: the metadata blob could
    // still silently store a rounded/exponential-notation token id.
    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: HUGE_TOKEN_ID,
            amount: "1",
            fa2Address: "fa2address",
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const metadata = JSON.parse(
      bytesToString((result as any).execute_lambda.metadata)
    );
    expect(metadata.payload[0].token_id).toBe(HUGE_TOKEN_ID);
  });
});

describe("Version0_0_11 (decimals-adjustment fa2/fa1.2 path, pre-list-operation)", () => {
  const versioned = new Version0_0_11("0.0.11", "contractAddress");

  it("no longer crashes when the token id exceeds Number.MAX_SAFE_INTEGER", () => {
    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: HUGE_TOKEN_ID,
            amount: "1",
            fa2Address: "fa2address",
            token: fa2TokenFixture("0"),
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [type, lambda] = parseLambda("0.0.11", getLambda(result));
    expect(type).toBe(LambdaType.FA2);
    expect(lambda?.data).toMatchObject([
      {
        from_: "walletAddress",
        txs: [{ to_: "targetAddress1", token_id: HUGE_TOKEN_ID, amount: "1" }],
      },
    ]);
  });

  it("fa1.2 approve keeps full precision for a huge amount", () => {
    const hugeAmount = "123456789012345678901234567890";

    const result = versioned.mapTransfer(
      {
        type: "fa1.2-approve",
        values: {
          spenderAddress: "spenderAddress",
          amount: hugeAmount,
          fa1_2Address: "fa1_2Address",
          token: fa1_2TokenFixture("0"),
        },
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [type, lambda] = parseLambda("0.0.11", getLambda(result));
    expect(type).toBe(LambdaType.FA1_2_APPROVE);
    expect(lambda?.data).toMatchObject({
      spender: "spenderAddress",
      value: hugeAmount,
    });
  });

  it("also keeps the huge token id exact in the informational metadata blob", () => {
    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: HUGE_TOKEN_ID,
            amount: "1",
            fa2Address: "fa2address",
            token: fa2TokenFixture("0"),
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const metadata = JSON.parse(
      bytesToString((result as any).execute_lambda.metadata)
    );
    expect(metadata.payload[0].token_id).toBe(HUGE_TOKEN_ID);
  });

  it("fa1.2-transfer keeps full precision for a huge amount in the metadata blob too", () => {
    const hugeAmount = "123456789012345678901234567890";

    const result = versioned.mapTransfer(
      {
        type: "fa1.2-transfer",
        values: {
          targetAddress: "targetAddress",
          amount: hugeAmount,
          fa1_2Address: "fa1_2Address",
          token: fa1_2TokenFixture("0"),
        },
        fields: [],
      } as unknown as transfer,
      cc
    );

    const metadata = JSON.parse(
      bytesToString((result as any).execute_lambda.metadata)
    );
    expect(metadata.payload.amount).toBe(hugeAmount);
  });
});

describe("Version0_3_3 (decimals-adjustment fa2/fa1.2 path, list-operation)", () => {
  const versioned = new Version0_3_3("0.3.3", "contractAddress");

  it("still builds a valid proposal for an ordinary small token id (no regression)", () => {
    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: "1",
            amount: "11",
            fa2Address: "fa2address",
            token: fa2TokenFixture("0"),
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [type, lambda] = parseLambda("0.3.3", getLambda(result));
    expect(type).toBe(LambdaType.FA2);
    expect(lambda?.data).toMatchObject([
      {
        from_: "walletAddress",
        txs: [{ to_: "targetAddress1", token_id: "1", amount: "11" }],
      },
    ]);
  });

  it("no longer crashes when the token id exceeds Number.MAX_SAFE_INTEGER (this is the reported bug)", () => {
    expect(() =>
      versioned.mapTransfer(
        {
          type: "fa2",
          values: [
            {
              targetAddress: "targetAddress1",
              tokenId: HUGE_TOKEN_ID,
              amount: "1",
              fa2Address: "fa2address",
              token: fa2TokenFixture("0"),
            },
          ],
          fields: [],
        } as unknown as transfer,
        cc
      )
    ).not.toThrow();

    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: HUGE_TOKEN_ID,
            amount: "1",
            fa2Address: "fa2address",
            token: fa2TokenFixture("0"),
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [type, lambda] = parseLambda("0.3.3", getLambda(result));
    expect(type).toBe(LambdaType.FA2);
    expect(lambda?.data).toMatchObject([
      {
        from_: "walletAddress",
        txs: [{ to_: "targetAddress1", token_id: HUGE_TOKEN_ID, amount: "1" }],
      },
    ]);
  });

  it("applies decimals adjustment correctly for a whole-number result", () => {
    const result = versioned.mapTransfer(
      {
        type: "fa2",
        values: [
          {
            targetAddress: "targetAddress1",
            tokenId: "1",
            amount: "1.5",
            fa2Address: "fa2address",
            token: fa2TokenFixture("2"), // 1.5 * 10^2 = 150
          },
        ],
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [, lambda] = parseLambda("0.3.3", getLambda(result));
    expect(lambda?.data).toMatchObject([
      {
        from_: "walletAddress",
        txs: [{ to_: "targetAddress1", token_id: "1", amount: "150" }],
      },
    ]);
  });

  it("throws a clear error instead of generating invalid Michelson when the decimals-adjusted amount isn't a whole number", () => {
    expect(() =>
      versioned.mapTransfer(
        {
          type: "fa2",
          values: [
            {
              targetAddress: "targetAddress1",
              tokenId: "1",
              // 3 decimal places typed in, but the token only supports 2:
              // 1.005 * 10^2 = 100.5, not a whole number.
              amount: "1.005",
              fa2Address: "fa2address",
              token: fa2TokenFixture("2"),
            },
          ],
          fields: [],
        } as unknown as transfer,
        cc
      )
    ).toThrow(/whole number/);
  });

  it("fa1.2-transfer keeps full precision for a huge decimals-adjusted amount", () => {
    const result = versioned.mapTransfer(
      {
        type: "fa1.2-transfer",
        values: {
          targetAddress: "targetAddress",
          amount: "123456789012345.6789",
          fa1_2Address: "fa1_2Address",
          token: fa1_2TokenFixture("4"), // -> 1234567890123456789 (integer)
        },
        fields: [],
      } as unknown as transfer,
      cc
    );

    const [type, lambda] = parseLambda("0.3.3", getLambda(result));
    expect(type).toBe(LambdaType.FA1_2_TRANSFER);
    expect(lambda?.data).toMatchObject({
      from: "walletAddress",
      to: "targetAddress",
      amount: "1234567890123456789",
    });
  });
});
