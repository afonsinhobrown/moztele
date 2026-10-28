import pg from "pg";

const g = globalThis;
export const pool =
  g.__moztelePool ||
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
if (process.env.NODE_ENV !== "production") g.__moztelePool = pool;

export const q = (text, params) => pool.query(text, params).then((r) => r.rows);
export const q1 = async (text, params) => (await q(text, params))[0];

// Transacção: fn recebe uma função run(sql, params) que devolve as linhas.
export async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn((t, p) => c.query(t, p).then((r) => r.rows));
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
