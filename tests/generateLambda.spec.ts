import { Parser } from "@taquito/michel-codec";
import BigNumber from "bignumber.js";
import { describe, expect, it } from "vitest";
import {
  generateFA1_2ApproveMichelson,
  generateFA1_2TransferMichelson,
  generateFA2Michelson,
  toMichelsonNat,
} from "../context/generateLambda";
import { LambdaType, parseLambda } from "../context/parseLambda";
import { version } from "../types/display";

const parser = new Parser();

// One version that predates the "list operation" lambda shape (0.0.x/0.1.1)
// and one that uses it (>= 0.3.1), so every code path in the generators
// below gets exercised.
const OLD_VERSION: version = "0.0.10";
const NEW_VERSION: version = "0.3.3";
const VERSIONS: version[] = [OLD_VERSION, NEW_VERSION];

// A token id larger than `Number.MAX_SAFE_INTEGER`, the same shape as the
// hash-derived FA2 token ids used by contracts such as objkt.com
// collections. This is the exact value that used to crash proposal
// creation: `Number(HUGE_TOKEN_ID)` turns into exponential notation, which
// isn't valid Michelson and breaks `parser.parseMichelineExpression`.
const HUGE_TOKEN_ID =
  "87284127967429943799359267359317190322060012651182306893343757589584080531268";

describe("toMichelsonNat", () => {
  it("keeps small values unchanged as plain digit strings", () => {
    expect(toMichelsonNat(1)).toBe("1");
    expect(toMichelsonNat("42")).toBe("42");
    expect(toMichelsonNat(0)).toBe("0");
    expect(toMichelsonNat(BigNumber(7))).toBe("7");
  });

  it("preserves full precision for integers beyond Number.MAX_SAFE_INTEGER", () => {
    expect(toMichelsonNat(HUGE_TOKEN_ID)).toBe(HUGE_TOKEN_ID);
  });

  it("never produces exponential notation, unlike a plain Number() conversion", () => {
    // Sanity check that this test actually exercises the historical bug:
    // converting the huge id through `Number` does produce exponential
    // notation, which is exactly what broke the Micheline parser.
    expect(Number(HUGE_TOKEN_ID).toString()).toContain("e+");
    expect(toMichelsonNat(HUGE_TOKEN_ID)).not.toContain("e");
    expect(toMichelsonNat(HUGE_TOKEN_ID)).not.toContain(".");
  });

  it("accepts a BigNumber instance directly", () => {
    const bn = BigNumber(HUGE_TOKEN_ID).plus(1);
    expect(toMichelsonNat(bn)).toBe(bn.toFixed());
  });

  it("rejects non-integer (fractional) values", () => {
    expect(() => toMichelsonNat("1.5")).toThrow(/whole number/);
    expect(() => toMichelsonNat(1.5)).toThrow(/whole number/);
    expect(() => toMichelsonNat(BigNumber("100.0001"))).toThrow(/whole number/);
  });

  it("rejects negative values", () => {
    expect(() => toMichelsonNat(-1)).toThrow(/can't be negative/);
    expect(() => toMichelsonNat("-1")).toThrow(/can't be negative/);
  });

  it("rejects NaN / non-numeric input", () => {
    expect(() => toMichelsonNat("not-a-number")).toThrow(/not a valid number/);
    expect(() => toMichelsonNat(NaN)).toThrow(/not a valid number/);
  });

  it("rejects non-finite input", () => {
    expect(() => toMichelsonNat(Infinity)).toThrow(/not a valid number/);
  });

  it("includes the provided field name in the error message", () => {
    expect(() => toMichelsonNat(-1, "tokenId")).toThrow(/tokenId/);
  });
});

describe("generateFA2Michelson", () => {
  it("throws for empty params", () => {
    expect(() => generateFA2Michelson(NEW_VERSION, [])).toThrow(
      "Empty fa2 params"
    );
  });

  describe.each(VERSIONS)("on version %s", version => {
    it("still generates valid, parseable Michelson for ordinary small ids/amounts (no regression)", () => {
      const michelson = generateFA2Michelson(version, [
        {
          walletAddress: "walletAddress",
          targetAddress: "targetAddress1",
          tokenId: 1,
          amount: 11,
          fa2Address: "fa2address",
        },
      ]);

      const expr = parser.parseMichelineExpression(michelson);
      expect(expr).not.toBeNull();

      const [type, lambda] = parseLambda(version, expr);
      expect(type).toBe(LambdaType.FA2);
      expect(lambda?.data).toMatchObject([
        {
          from_: "walletAddress",
          txs: [{ to_: "targetAddress1", token_id: "1", amount: "11" }],
        },
      ]);
    });

    it("generates parseable Michelson for a huge, hash-derived token id (regression test for the reported crash)", () => {
      const michelson = generateFA2Michelson(version, [
        {
          walletAddress: "walletAddress",
          targetAddress: "targetAddress1",
          tokenId: HUGE_TOKEN_ID,
          amount: 1,
          fa2Address: "fa2address",
        },
      ]);

      // This must not throw. It used to throw a MichelineParseError because
      // `Number(HUGE_TOKEN_ID)` produced exponential notation.
      const expr = parser.parseMichelineExpression(michelson);
      expect(expr).not.toBeNull();

      const [type, lambda] = parseLambda(version, expr);
      expect(type).toBe(LambdaType.FA2);
      expect(lambda?.data).toMatchObject([
        {
          from_: "walletAddress",
          txs: [
            {
              to_: "targetAddress1",
              token_id: HUGE_TOKEN_ID,
              amount: "1",
            },
          ],
        },
      ]);
    });

    it("supports several transfers in a single lambda, each with independent ids/amounts", () => {
      const michelson = generateFA2Michelson(version, [
        {
          walletAddress: "walletAddress",
          targetAddress: "targetAddress1",
          tokenId: 1,
          amount: 11,
          fa2Address: "fa2address",
        },
        {
          walletAddress: "walletAddress",
          targetAddress: "targetAddress2",
          tokenId: HUGE_TOKEN_ID,
          amount: 12,
          fa2Address: "fa2address",
        },
      ]);

      const expr = parser.parseMichelineExpression(michelson);
      const [, lambda] = parseLambda(version, expr);

      expect(lambda?.data).toMatchObject([
        {
          from_: "walletAddress",
          txs: [
            { to_: "targetAddress1", token_id: "1", amount: "11" },
            {
              to_: "targetAddress2",
              token_id: HUGE_TOKEN_ID,
              amount: "12",
            },
          ],
        },
      ]);
    });

    it("accepts a BigNumber amount produced by decimals-adjustment and keeps it exact", () => {
      // Mirrors what versioned/*.ts does: multiply the human amount by
      // 10^decimals before handing it to the generator.
      const amount = BigNumber("1.23").multipliedBy(BigNumber(10).pow(6));

      const michelson = generateFA2Michelson(version, [
        {
          walletAddress: "walletAddress",
          targetAddress: "targetAddress1",
          tokenId: 1,
          amount,
          fa2Address: "fa2address",
        },
      ]);

      const expr = parser.parseMichelineExpression(michelson);
      const [, lambda] = parseLambda(version, expr);
      expect(lambda?.data).toMatchObject([
        {
          from_: "walletAddress",
          txs: [{ to_: "targetAddress1", token_id: "1", amount: "1230000" }],
        },
      ]);
    });

    it("rejects a fractional amount instead of emitting invalid Michelson", () => {
      expect(() =>
        generateFA2Michelson(version, [
          {
            walletAddress: "walletAddress",
            targetAddress: "targetAddress1",
            tokenId: 1,
            // e.g. a token with 2 decimals and a user-entered amount with
            // 3 decimal places, producing a non-integer raw amount.
            amount: BigNumber("100.5"),
            fa2Address: "fa2address",
          },
        ])
      ).toThrow(/whole number/);
    });

    it("rejects a negative token id instead of emitting invalid Michelson", () => {
      expect(() =>
        generateFA2Michelson(version, [
          {
            walletAddress: "walletAddress",
            targetAddress: "targetAddress1",
            tokenId: -1,
            amount: 1,
            fa2Address: "fa2address",
          },
        ])
      ).toThrow(/can't be negative/);
    });
  });
});

describe("generateFA1_2ApproveMichelson", () => {
  describe.each(VERSIONS)("on version %s", version => {
    it("still generates valid, parseable Michelson for an ordinary amount (no regression)", () => {
      const michelson = generateFA1_2ApproveMichelson(version, {
        spenderAddress: "spenderAddress",
        amount: 1,
        fa1_2Address: "fa1_2Address",
      });

      const expr = parser.parseMichelineExpression(michelson);
      expect(expr).not.toBeNull();

      const [type, lambda] = parseLambda(version, expr);
      expect(type).toBe(LambdaType.FA1_2_APPROVE);
      expect(lambda?.data).toMatchObject({
        spender: "spenderAddress",
        value: "1",
      });
    });

    it("supports huge amounts (e.g. very high-decimals fungible tokens) without precision loss", () => {
      const hugeAmount = "123456789012345678901234567890";

      const michelson = generateFA1_2ApproveMichelson(version, {
        spenderAddress: "spenderAddress",
        amount: hugeAmount,
        fa1_2Address: "fa1_2Address",
      });

      const expr = parser.parseMichelineExpression(michelson);
      const [, lambda] = parseLambda(version, expr);
      expect(lambda?.data).toMatchObject({
        spender: "spenderAddress",
        value: hugeAmount,
      });
    });

    it("rejects a fractional amount", () => {
      expect(() =>
        generateFA1_2ApproveMichelson(version, {
          spenderAddress: "spenderAddress",
          amount: "1.5",
          fa1_2Address: "fa1_2Address",
        })
      ).toThrow(/whole number/);
    });
  });
});

describe("generateFA1_2TransferMichelson", () => {
  describe.each(VERSIONS)("on version %s", version => {
    it("still generates valid, parseable Michelson for an ordinary amount (no regression)", () => {
      const michelson = generateFA1_2TransferMichelson(version, {
        walletAddress: "walletAddress",
        targetAddress: "targetAddress",
        amount: 1,
        fa1_2Address: "fa1_2Address",
      });

      const expr = parser.parseMichelineExpression(michelson);
      expect(expr).not.toBeNull();

      const [type, lambda] = parseLambda(version, expr);
      expect(type).toBe(LambdaType.FA1_2_TRANSFER);
      expect(lambda?.data).toMatchObject({
        from: "walletAddress",
        to: "targetAddress",
        amount: "1",
      });
    });

    it("supports huge amounts without precision loss", () => {
      const hugeAmount = "999999999999999999999999999999";

      const michelson = generateFA1_2TransferMichelson(version, {
        walletAddress: "walletAddress",
        targetAddress: "targetAddress",
        amount: hugeAmount,
        fa1_2Address: "fa1_2Address",
      });

      const expr = parser.parseMichelineExpression(michelson);
      const [, lambda] = parseLambda(version, expr);
      expect(lambda?.data).toMatchObject({
        from: "walletAddress",
        to: "targetAddress",
        amount: hugeAmount,
      });
    });

    it("rejects a negative amount", () => {
      expect(() =>
        generateFA1_2TransferMichelson(version, {
          walletAddress: "walletAddress",
          targetAddress: "targetAddress",
          amount: -5,
          fa1_2Address: "fa1_2Address",
        })
      ).toThrow(/can't be negative/);
    });
  });
});
