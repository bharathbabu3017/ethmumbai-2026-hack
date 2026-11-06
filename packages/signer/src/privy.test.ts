import assert from "node:assert/strict";
import { test } from "node:test";
import { base } from "viem/chains";
import { createPrivySigner } from "./privy";

function fakeApi() {
  const calls: { method: string; walletId: string; input: any }[] = [];
  const record = (method: string, result: object) => async (walletId: string, input: unknown) => {
    calls.push({ method, walletId, input });
    return result;
  };
  return { calls, api: { signTypedData: record("signTypedData", { signature: "0xtyped" }), signMessage: record("signMessage", { signature: "0xmsg" }) } as never };
}

const typed = JSON.stringify({ domain: { name: "Flash", chainId: 8453 }, types: { Order: [{ name: "a", type: "uint256" }] }, primaryType: "Order", message: { a: "1" } });

test("typed data is converted to Privy's field names and signed by the signer key", async () => {
  const { api, calls } = fakeApi();
  const signer = createPrivySigner(api, "wallet-1", "0xabc", "wallet-auth:KEY", base);
  assert.equal(await signer.signTypedData(typed), "0xtyped");
  const { walletId, input } = calls[0]!;
  assert.equal(walletId, "wallet-1");
  assert.equal(input.params.typed_data.primary_type, "Order");
  assert.equal(input.params.typed_data.primaryType, undefined);
  assert.deepEqual(input.params.typed_data.domain, { name: "Flash", chainId: 8453 });
  assert.deepEqual(input.authorization_context, { authorization_private_keys: ["KEY"] });
});

test("messages are signed through Privy, never locally", async () => {
  const { api, calls } = fakeApi();
  assert.equal(await createPrivySigner(api, "w", "0xabc", "KEY", base).signMessage("hello"), "0xmsg");
  assert.deepEqual([calls[0]!.method, calls[0]!.input.message], ["signMessage", "hello"]);
});
