import assert from "node:assert/strict";
import pg from "pg";

// Os testes de integração correm contra uma base real, sempre dentro de uma
// transacção que é revertida no fim — a base fica como estava.
export const url = process.env.DATABASE_URL || "";
export const temBaseDeDados = Boolean(url);
export const semBD = temBaseDeDados ? {} : { skip: "Sem DATABASE_URL configurado" };

// Uma só ligação para todos os testes do ficheiro: com o Neon, abrir uma
// ligação por teste tornava a suite lenta.
let __pool = null;
function pool() {
  if (!__pool)
    __pool = new pg.Pool({
      connectionString: url,
      ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
      max: 2,
    });
  return __pool;
}

export const fecharPool = () => (__pool ? __pool.end() : Promise.resolve());

export async function comTransacao(fn) {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    c.release();
  }
}

// Quem está a fazer a alteração (para a auditoria e o histórico).
export const comAutor = (c, id) =>
  c.query("SELECT set_config('app.utilizador_id', $1, true)", [String(id)]);

// Um erro esperado aborta a transacção: corre dentro de um savepoint para se
// poder continuar a testar depois.
export async function esperaErro(c, fn, regexOuCodigo) {
  await c.query("SAVEPOINT erro_esperado");
  try {
    await assert.rejects(fn, regexOuCodigo);
  } finally {
    await c.query("ROLLBACK TO SAVEPOINT erro_esperado");
  }
}

let contador = 0;
const telefone = () => `+25884${String(Date.now()).slice(-6)}${String(contador++).padStart(2, "0")}`;

export async function criarUtilizador(c, { perfil = "mestre", nome = "Utilizador Teste" } = {}) {
  const { rows } = await c.query(
    `INSERT INTO utilizadores (nome, telefone, perfil_id, senha_hash)
     VALUES ($1,$2,(SELECT id FROM perfis WHERE nome=$3),'hash-de-teste') RETURNING id`,
    [nome, telefone(), perfil]
  );
  return rows[0].id;
}

export async function criarSite(c, nome = "Site Teste") {
  const { rows } = await c.query(
    "INSERT INTO sites (nome, area_id) VALUES ($1, (SELECT id FROM areas ORDER BY id LIMIT 1)) RETURNING id",
    [nome]
  );
  return rows[0].id;
}

export async function criarRequisicao(c, { mestre, site, estado = "compra_comprovada", valor = 100 } = {}) {
  const { rows } = await c.query(
    `INSERT INTO requisicoes (mestre_id, site_id, justificacao, valor_estimado, estado)
     VALUES ($1,$2,'Teste de integração',$3,$4) RETURNING id`,
    [mestre, site, valor, estado]
  );
  return rows[0].id;
}

export async function comprovativoPagamento(c, requisicaoId, financeiroId, valor = 100) {
  const { rows } = await c.query(
    `INSERT INTO pagamentos (requisicao_id, financeiro_id, valor, metodo)
     VALUES ($1,$2,$3,'mpesa') RETURNING id`,
    [requisicaoId, financeiroId, valor]
  );
  await c.query("INSERT INTO comprovativos_pagamento (pagamento_id, ficheiro_url) VALUES ($1,'prova.pdf')", [
    rows[0].id,
  ]);
  return rows[0].id;
}

export async function comprovativoCompra(c, requisicaoId, valorGasto = 90) {
  const { rows } = await c.query(
    "INSERT INTO compras (requisicao_id, valor_gasto) VALUES ($1,$2) RETURNING id",
    [requisicaoId, valorGasto]
  );
  await c.query("INSERT INTO comprovativos_compra (compra_id, ficheiro_url) VALUES ($1,'factura.pdf')", [
    rows[0].id,
  ]);
  return rows[0].id;
}
