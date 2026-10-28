// Uso: npm run criar-admin -- "Nome" 840000000 senha
import pg from "pg";
import bcrypt from "bcryptjs";

const [nome, telefone, senha] = process.argv.slice(2);
if (!nome || !telefone || !senha) {
  console.log('Uso: npm run criar-admin -- "Nome" 840000000 senha');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const hash = await bcrypt.hash(senha, 10);
await pool.query(
  `INSERT INTO utilizadores (nome, telefone, perfil_id, senha_hash)
   VALUES ($1, $2, (SELECT id FROM perfis WHERE nome = 'admin'), $3)
   ON CONFLICT (telefone) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, activo = TRUE`,
  [nome, telefone, hash]
);
console.log("Admin criado/actualizado:", telefone);
await pool.end();
