// Aplica as migrações de db/migrations ainda não aplicadas.
// Uso: npm run migrar   (lê DATABASE_URL do .env.local)
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não está definido. Configure o .env.local.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

try {
  const t = await pool.query("SELECT to_regclass('public.requisicoes') AS t");
  if (!t.rows[0].t) {
    console.error("A base de dados ainda não tem o esquema. Aplique primeiro db/schema.sql.");
    process.exit(1);
  }

  await pool.query(
    "CREATE TABLE IF NOT EXISTS migracoes (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now())"
  );

  const dir = path.join(process.cwd(), "db", "migrations");
  const ficheiros = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await pool.query("SELECT nome FROM migracoes");
  const feitas = new Set(rows.map((r) => r.nome));

  for (const f of ficheiros) {
    if (feitas.has(f)) {
      console.log("já aplicada:", f);
      continue;
    }
    const sql = await fs.readFile(path.join(dir, f), "utf8");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(sql);
      await c.query("INSERT INTO migracoes (nome) VALUES ($1)", [f]);
      await c.query("COMMIT");
      console.log("aplicada:  ", f);
    } catch (e) {
      try {
        await c.query("ROLLBACK");
      } catch {}
      console.error(`falhou:    ${f}\n  ${e.message}`);
      process.exitCode = 1;
      break;
    } finally {
      c.release();
    }
  }
} finally {
  await pool.end();
}
