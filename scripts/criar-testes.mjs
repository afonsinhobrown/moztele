// Cria/repõe as contas de teste (admin existente + mestre, aprovador, financeiro).
// Uso: npm run criar-testes
import pg from "pg";
import bcrypt from "bcryptjs";
import { CREDENCIAIS_TESTE } from "../lib/credenciais-teste.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

try {
  for (const c of CREDENCIAIS_TESTE) {
    const hash = await bcrypt.hash(c.senha, 12);
    await pool.query(
      `INSERT INTO utilizadores (nome, telefone, perfil_id, senha_hash, activo, deve_mudar_senha)
       VALUES ($1,$2,(SELECT id FROM perfis WHERE nome=$3),$4,TRUE,FALSE)
       ON CONFLICT (telefone) DO UPDATE
         SET nome = EXCLUDED.nome,
             perfil_id = EXCLUDED.perfil_id,
             senha_hash = EXCLUDED.senha_hash,
             activo = TRUE,
             deve_mudar_senha = FALSE,
             sessao_versao = utilizadores.sessao_versao + 1`,
      [c.nome, c.telefone, c.perfilSistema, hash]
    );
    console.log(`✔ ${c.perfil.padEnd(14)} ${c.telefone} / ${c.senha}`);
  }
  console.log("\nContas de teste prontas (senhas ficam visíveis na página de login).");
} finally {
  await pool.end();
}
