import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  comAutor,
  comTransacao,
  comprovativoCompra,
  comprovativoPagamento,
  criarRequisicao,
  criarSite,
  criarUtilizador,
  esperaErro,
  fecharPool,
  semBD,
} from "./helpers.mjs";

after(() => fecharPool());

// Invariantes que protegem dinheiro e prova. Se algum destes falhar, o sistema
// está a aceitar algo que o negócio não permite.

test("a auditoria guarda o autor e o que mudou, sem senhas", semBD, async () => {
  await comTransacao(async (c) => {
    const admin = await criarUtilizador(c, { perfil: "admin", nome: "Admin Auditoria" });
    await comAutor(c, admin);
    const mestre = await criarUtilizador(c, { nome: "Mestre Um" });

    await c.query("UPDATE utilizadores SET nome='Mestre Dois', senha_hash='outra' WHERE id=$1", [mestre]);

    const { rows } = await c.query(
      `SELECT operacao, utilizador_id, detalhes FROM auditoria
        WHERE tabela='utilizadores' AND registro_id=$1
        ORDER BY id DESC LIMIT 1`,
      [mestre]
    );
    assert.equal(rows[0].operacao, "update");
    assert.equal(String(rows[0].utilizador_id), String(admin));
    assert.equal(rows[0].detalhes.nome, "Mestre Dois");
    assert.ok(!("senha_hash" in rows[0].detalhes), "a senha nunca deve entrar na auditoria");
  });
});

test("fechar exige comprovativo de envio e de compra", semBD, async () => {
  await comTransacao(async (c) => {
    const admin = await criarUtilizador(c, { perfil: "admin" });
    await comAutor(c, admin);
    const mestre = await criarUtilizador(c);
    const site = await criarSite(c);
    const req = await criarRequisicao(c, { mestre, site });

    await esperaErro(
      c,
      () => c.query("UPDATE requisicoes SET estado='fechado' WHERE id=$1", [req]),
      /comprovativo de envio de dinheiro/i
    );

    await comprovativoPagamento(c, req, admin, 100);
    await esperaErro(
      c,
      () => c.query("UPDATE requisicoes SET estado='fechado' WHERE id=$1", [req]),
      /comprovativo de compra/i
    );

    await comprovativoCompra(c, req, 90);
    await c.query("UPDATE requisicoes SET estado='fechado' WHERE id=$1", [req]);
    const { rows } = await c.query("SELECT estado FROM requisicoes WHERE id=$1", [req]);
    assert.equal(rows[0].estado, "fechado");
  });
});

test("o saldo abatido conta como financiamento para fechar", semBD, async () => {
  await comTransacao(async (c) => {
    const admin = await criarUtilizador(c, { perfil: "admin" });
    await comAutor(c, admin);
    const mestre = await criarUtilizador(c);
    const site = await criarSite(c);
    const origem = await criarRequisicao(c, { mestre, site, estado: "fechado", valor: 100 });
    const alvo = await criarRequisicao(c, { mestre, site, estado: "compra_comprovada", valor: 50 });

    const credito = await c.query(
      `INSERT INTO creditos_abatimento (requisicao_origem_id, mestre_id, site_id, valor)
       VALUES ($1,$2,$3,50) RETURNING id`,
      [origem, mestre, site]
    );
    await c.query(
      `INSERT INTO creditos_aplicacoes (credito_id, requisicao_id, valor) VALUES ($1,$2,50)`,
      [credito.rows[0].id, alvo]
    );
    await c.query("UPDATE creditos_abatimento SET valor_usado=50 WHERE id=$1", [credito.rows[0].id]);

    await comprovativoCompra(c, alvo, 45);
    await c.query("UPDATE requisicoes SET estado='fechado' WHERE id=$1", [alvo]);
    const { rows } = await c.query("SELECT estado FROM requisicoes WHERE id=$1", [alvo]);
    assert.equal(rows[0].estado, "fechado");
  });
});

test("o mesmo comprovativo financeiro não entra duas vezes", semBD, async () => {
  await comTransacao(async (c) => {
    const hash = "a".repeat(64);
    await c.query(
      `INSERT INTO ficheiros (chave, hash_sha256, tipo_mime, tamanho, finalidade)
       VALUES ('pagamento/1.pdf',$1,'application/pdf',100,'pagamento')`,
      [hash]
    );
    await esperaErro(
      c,
      () =>
        c.query(
          `INSERT INTO ficheiros (chave, hash_sha256, tipo_mime, tamanho, finalidade)
           VALUES ('pagamento/2.pdf',$1,'application/pdf',100,'pagamento')`,
          [hash]
        ),
      (e) => e?.code === "23505"
    );
    // Um orçamento repetido não é comprovativo financeiro: pode entrar.
    await c.query(
      `INSERT INTO ficheiros (chave, hash_sha256, tipo_mime, tamanho, finalidade)
       VALUES ('orcamento/1.pdf',$1,'application/pdf',100,'orcamento')`,
      [hash]
    );
  });
});

test("o inventário não aceita o mesmo material duas vezes no mesmo site", semBD, async () => {
  await comTransacao(async (c) => {
    const site = await criarSite(c);
    await c.query("INSERT INTO inventario (site_id, descricao) VALUES ($1,'Cabo de fibra')", [site]);
    await esperaErro(
      c,
      () => c.query("INSERT INTO inventario (site_id, descricao) VALUES ($1,'cabo de FIBRA')", [site]),
      (e) => e?.code === "23505"
    );
  });
});

test("os movimentos de stock nunca deixam saldo negativo", semBD, async () => {
  await comTransacao(async (c) => {
    const site = await criarSite(c);
    const item = await c.query(
      "INSERT INTO inventario (site_id, descricao, quantidade) VALUES ($1,'Bateria',3) RETURNING id",
      [site]
    );
    await esperaErro(
      c,
      () =>
        c.query(
          `INSERT INTO movimentos_stock (inventario_id, tipo, quantidade, saldo_anterior, saldo_apos)
           VALUES ($1,'saida',5,3,-2)`,
          [item.rows[0].id]
        ),
      (e) => e?.code === "23514"
    );
  });
});

test("um crédito não pode ser usado acima do valor recebido", semBD, async () => {
  await comTransacao(async (c) => {
    const mestre = await criarUtilizador(c);
    const site = await criarSite(c);
    const origem = await criarRequisicao(c, { mestre, site, estado: "fechado", valor: 100 });
    await esperaErro(
      c,
      () =>
        c.query(
          `INSERT INTO creditos_abatimento (requisicao_origem_id, mestre_id, site_id, valor, valor_usado)
           VALUES ($1,$2,$3,100,150)`,
          [origem, mestre, site]
        ),
      (e) => e?.code === "23514"
    );
  });
});

test("ninguém se pode delegar a si próprio", semBD, async () => {
  await comTransacao(async (c) => {
    const aprovador = await criarUtilizador(c, { perfil: "aprovador" });
    await esperaErro(
      c,
      () =>
        c.query(
          `INSERT INTO delegacoes_aprovacao (de_id, para_id, fim)
           VALUES ($1,$1, now() + interval '1 day')`,
          [aprovador]
        ),
      (e) => e?.code === "23514"
    );
  });
});

test("o histórico de estados regista quem fez a mudança", semBD, async () => {
  await comTransacao(async (c) => {
    const admin = await criarUtilizador(c, { perfil: "admin" });
    await comAutor(c, admin);
    const mestre = await criarUtilizador(c);
    const site = await criarSite(c);
    const req = await criarRequisicao(c, { mestre, site, estado: "rascunho", valor: 10 });

    await c.query("UPDATE requisicoes SET estado='submetido' WHERE id=$1", [req]);

    const { rows } = await c.query(
      `SELECT estado_novo, utilizador_id FROM historico_estados
        WHERE requisicao_id=$1 ORDER BY id DESC LIMIT 1`,
      [req]
    );
    assert.equal(rows[0].estado_novo, "submetido");
    assert.equal(String(rows[0].utilizador_id), String(admin));
  });
});
