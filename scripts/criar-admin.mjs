// Uso: npm run criar-admin -- "Nome" 840000000 UmaSenhaForte
import pg from "pg";
import bcrypt from "bcryptjs";

const [nome, telefone, senha] = process.argv.slice(2);
if (!nome || !telefone || !senha) {
  console.log('Uso: npm run criar-admin -- "Nome" 840000000 senha');
  process.exit(1);
}
if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
  console.error("A senha deve ter pelo menos 8 caracteres, com letras e números.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});
const hash = await bcrypt.hash(senha, 12);
await pool.query(
  `INSERT INTO utilizadores (nome, telefone, perfil_id, senha_hash, deve_mudar_senha)
   VALUES ($1, $2, (SELECT id FROM perfis WHERE nome = 'admin'), $3, TRUE)
   ON CONFLICT (telefone) DO UPDATE
     SET senha_hash = EXCLUDED.senha_hash, activo = TRUE, deve_mudar_senha = TRUE,
         sessao_versao = utilizadores.sessao_versao + 1`,
  [nome, telefone, hash]
);
console.log("Admin criado/actualizado:", telefone);
console.log("No primeiro acesso será pedido para definir uma nova senha.");
await pool.end();
