import { ParameterSchema } from "@taquito/michelson-encoder";
import {
  ContractAbstraction,
  ContractMethodObject,
  ContractProvider,
  Wallet,
} from "@taquito/taquito";

// Taquito v25 dropped the flattened/positional `ContractAbstraction.methods`
// accessor, leaving only `.methodsObject` which requires an object keyed by
// the entrypoint's Michelson field annotations. Several legacy, no-longer
// deployable TzSafe contract versions (<=0.3.2) predate consistent field
// annotations, so their exact annotation names can't be reconstructed with
// confidence. This helper reproduces the old flattened encoding path
// (`ParameterSchema.Encode(...args)`, the same call the removed `.methods`
// wrapper used internally) so those legacy code paths keep sending the
// exact same operation bytes as before the upgrade.
export function callFlatMethod<T extends ContractProvider | Wallet>(
  cc: ContractAbstraction<T>,
  entrypoint: string,
  ...args: unknown[]
): ContractMethodObject<T> {
  const isMultipleEntrypoint = cc.parameterSchema.isMultipleEntryPoint;
  const schema = isMultipleEntrypoint
    ? new ParameterSchema(cc.entrypoints.entrypoints[entrypoint])
    : cc.parameterSchema;

  const value = schema.Encode(...args);

  return {
    toTransferParams: ({
      fee,
      gasLimit,
      storageLimit,
      source,
      amount = 0,
      mutez = false,
    }: {
      fee?: number;
      gasLimit?: number;
      storageLimit?: number;
      source?: string;
      amount?: number;
      mutez?: boolean;
    } = {}) => ({
      to: cc.address,
      amount,
      fee,
      mutez,
      source,
      gasLimit,
      storageLimit,
      parameter: {
        entrypoint: isMultipleEntrypoint ? entrypoint : "default",
        value,
      },
    }),
  } as unknown as ContractMethodObject<T>;
}
