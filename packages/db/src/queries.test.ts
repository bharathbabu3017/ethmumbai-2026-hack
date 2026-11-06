import assert from "node:assert/strict";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { claimAction, createAction, getOrCreateTelegramUser, type Db } from "./queries";
import * as schema from "./schema";

let db: Db;
let n = 0;
const makeWallet = () => ({ address: `0xwallet${++n}`, encryptedKey: "v1:x:y:z" });

before(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  db = pg as unknown as Db;
});

test("a user gets one wallet, even when /start races", async () => {
  const results = await Promise.all([1, 2, 3, 4].map(() => getOrCreateTelegramUser(db, { id: 100, username: "a" }, makeWallet)));
  assert.equal(new Set(results.map((r) => r.user.id)).size, 1);
  assert.equal(new Set(results.map((r) => r.wallet.id)).size, 1);
  assert.equal(results.filter((r) => r.created).length, 1);
});

test("a confirm action only runs once, even when tapped repeatedly", async () => {
  const { user } = await getOrCreateTelegramUser(db, { id: 101 }, makeWallet);
  const id = await createAction(db, user.id, "buy", { qty: "5" });
  const claims = await Promise.all([1, 2, 3, 4, 5].map(() => claimAction(db, id, user.id)));
  assert.equal(claims.filter(Boolean).length, 1);
});

test("another user cannot claim an action", async () => {
  const a = await getOrCreateTelegramUser(db, { id: 102 }, makeWallet);
  const b = await getOrCreateTelegramUser(db, { id: 103 }, makeWallet);
  const id = await createAction(db, a.user.id, "buy", {});
  assert.equal(await claimAction(db, id, b.user.id), undefined);
  assert.ok(await claimAction(db, id, a.user.id));
});

test("an expired action cannot be claimed", async () => {
  const { user } = await getOrCreateTelegramUser(db, { id: 104 }, makeWallet);
  const id = await createAction(db, user.id, "buy", {}, -1);
  assert.equal(await claimAction(db, id, user.id), undefined);
});
