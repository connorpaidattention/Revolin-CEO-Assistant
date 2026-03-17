import { Pool } from "pg";

let pool: Pool | null = null;

/**
 * Get the connection pool singleton.
 * Returns null if DATABASE_URL is not set (graceful degradation).
 */
export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected pool error:", err);
    });
  }
  return pool;
}

export async function checkDb(): Promise<boolean> {
  try {
    const p = getPool();
    if (!p) return false;
    const res = await p.query("SELECT 1");
    return res.rowCount === 1;
  } catch {
    return false;
  }
}
