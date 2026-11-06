import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
await sql.end();
console.log("Migrations applied");
