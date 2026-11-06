export * from "./client";
export * from "./queries";
export * as schema from "./schema";
export const migrationsFolder = new URL("../migrations", import.meta.url).pathname;
