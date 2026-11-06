import { createDb } from "@flashmob/db";

const globals = globalThis as unknown as { db?: ReturnType<typeof createDb> };

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");
  return (globals.db ??= createDb(process.env.DATABASE_URL)) as unknown as import("@flashmob/db").Db;
}
