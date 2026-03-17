import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const schemaPath = join(__dirname, "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");

    console.log("Running migrations...");
    await pool.query(schema);
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
