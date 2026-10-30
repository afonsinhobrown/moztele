// Remove as contas de teste. Se alguma já tiver histórico (requisições,
// aprovações, pagamentos), é desactivada em vez de apagada.
// Uso: npm run remover-testes
import pg from "pg";
import { CREDENCIAIS_TESTE } from "../lib/credenciais-teste.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
});

const contas = CREDENCIAIS_TESTE.filter((c) => c.perfilSistema !== "admin");

try {
  for (const c of contas) {
    const { rows } = await pool.query("SELECT id, nome FROM utilizadores WHERE telefone=$1", [c.telefone]);
    if (!rows.length) {
      console.log(`– ${c.telefone}: não existe`);
      continue;
    }
    const u = rows[0];
    try {
      await pool.query("DELETE FROM utilizadores WHERE id=$1", [u.id]);
      console.log(`✔ ${c.telefone} (${u.nome}) apagado`);
    } catch (e) {
      if (e.code === "23503") {
        await pool.query(
          "UPDATE utilizadores SET activo=FALSE, sessao_versao=sessao_versao+1 WHERE id=$1",
          [u.id]
        );
        console.log(`⚠ ${c.telefone} (${u.nome}) tem histórico: foi desactivado em vez de apagado`);
      } else {
        throw e;
      }
    }
  }
  console.log("\nPara esconder as credenciais do login, defina MOSTRAR_CREDENCIAIS_TESTE=false.");
  console.log("O admin 840000000 não é apagado por este script — mude a senha antes de produção.");
} finally {
  await pool.end();
}
