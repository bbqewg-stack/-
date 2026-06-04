import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      area_m2 REAL NOT NULL,
      coordinates TEXT NOT NULL,
      coverage_ratio REAL NOT NULL,
      panel_efficiency REAL NOT NULL,
      capacity_kw REAL NOT NULL,
      annual_generation_kwh REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    ALTER TABLE analyses ADD COLUMN IF NOT EXISTS polygons_data TEXT
  `);
}
