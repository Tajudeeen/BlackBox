import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const databaseUrl = process.argv[2] || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Usage: node runMigration.js <DATABASE_URL>");
  console.error("Or set DATABASE_URL in your environment first.");
  process.exit(1);
}

const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const pool = new Pool({ connectionString: databaseUrl });

console.log("Running schema.sql...");
await pool.query(sql);
console.log("Done. Verifying tables...");

const result = await pool.query(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
);
console.log("Tables now in this database:");
for (const row of result.rows) {
  console.log(" -", row.tablename);
}

await pool.end();