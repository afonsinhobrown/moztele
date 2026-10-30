import pg from "pg";

const g = globalThis;
export const pool =
  g.__moztelePool ||
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 20000,
    keepAlive: true,
  });
if (process.env.NODE_ENV !== "production") g.__moztelePool = pool;

export const q = (text, params) => pool.query(text, params).then((r) => r.rows);
export const q1 = async (text, params) => (await q(text, params))[0];

// Transacção: fn recebe run(sql, params) que devolve as linhas.
// utilizadorId fica disponível para o trigger do histórico (current_setting).
export async function tx(fn, utilizadorId = null) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (utilizadorId != null)
      await c.query("SELECT set_config('app.utilizador_id', $1, true)", [String(utilizadorId)]);
    const out = await fn((t, p) => c.query(t, p).then((r) => r.rows));
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    c.release();
  }
}
