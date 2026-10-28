"use server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { q1, tx } from "@/lib/db";
import { criarSessao, terminarSessao, exigir } from "@/lib/auth";
import { guardar } from "@/lib/upload";

const num = (v) => Number(String(v || "0").replace(",", "."));
const arred = (n) => Math.round(n * 100) / 100;
const desdeSubmissao = `COALESCE((SELECT max(criado_em) FROM historico_estados WHERE requisicao_id=$1 AND estado_novo='submetido'),'-infinity')`;

async function idsPerfil(run, perfil) {
  const rows = await run(
    "SELECT u.id FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE p.nome=$1 AND u.activo",
    [perfil]
  );
  return rows.map((r) => r.id);
}
async function notificar(run, userIds, reqId, msg) {
  for (const u of userIds)
    await run(
      "INSERT INTO notificacoes (utilizador_id, requisicao_id, canal, mensagem) VALUES ($1,$2,'app',$3)",
      [u, reqId, msg]
    );
}

/* ---------- Sessão ---------- */
export async function login(formData) {
  const tel = String(formData.get("telefone") || "").trim();
  const senha = String(formData.get("senha") || "");
  let u = null;
  try {
    u = await q1(
      `SELECT u.id, u.nome, u.senha_hash, u.activo, p.nome AS perfil
         FROM utilizadores u JOIN perfis p ON p.id = u.perfil_id WHERE u.telefone = $1`,
      [tel]
    );
  } catch (e) {
    redirect("/login?erro=1");
  }
  if (!u || !u.activo || !(await bcrypt.compare(senha, u.senha_hash))) redirect("/login?erro=1");
  await criarSessao(u);
  redirect("/requisicoes");
}

export async function logout() {
  terminarSessao();
  redirect("/login");
}

/* ---------- Mestre ---------- */
export async function criarRequisicao(formData) {
  const s = await exigir("mestre");
  const site_id = Number(formData.get("site_id"));
  const justificacao = String(formData.get("justificacao") || "").trim();
  const urgencia = String(formData.get("urgencia") || "normal");
  const acao = formData.get("acao");
  const d = formData.getAll("descricao"), qt = formData.getAll("quantidade"), un = formData.getAll("unidade");
  const pr = formData.getAll("preco"), ct = formData.getAll("categoria_id");
  const itens = d
    .map((x, i) => ({ d: String(x).trim(), qtd: num(qt[i]), un: String(un[i] || "un"), pr: num(pr[i]), cat: ct[i] ? Number(ct[i]) : null }))
    .filter((i) => i.d && i.qtd > 0);
  if (!site_id || !justificacao || itens.length === 0) redirect("/requisicoes/nova?erro=1");

  const tipo = String(formData.get("tipo_anexo") || "cotacao");
  const anexos = [];
  for (const f of formData.getAll("anexos")) {
    const url = await guardar(f, "orcamentos");
    if (url) anexos.push({ url, nome: f.name });
  }
  const estado = acao === "submeter" ? "submetido" : "rascunho";
  if (estado === "submetido" && anexos.length === 0) redirect("/requisicoes/nova?erro=2");

  const total = itens.reduce((a, i) => a + i.qtd * i.pr, 0);
  const id = await tx(async (run) => {
    const [r] = await run(
      `INSERT INTO requisicoes (mestre_id, site_id, justificacao, urgencia, valor_estimado, estado)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [s.id, site_id, justificacao, urgencia, total, estado]
    );
    for (const i of itens)
      await run(
        `INSERT INTO requisicao_itens (requisicao_id, categoria_id, descricao, quantidade, unidade, preco_unitario)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [r.id, i.cat, i.d, i.qtd, i.un, i.pr]
      );
    for (const a of anexos)
      await run(
        `INSERT INTO requisicao_anexos (requisicao_id, tipo, ficheiro_url, nome_original, enviado_por)
         VALUES ($1,$2,$3,$4,$5)`,
        [r.id, tipo, a.url, a.nome, s.id]
      );
    if (estado === "submetido")
      await notificar(run, await idsPerfil(run, "aprovador"), r.id, "Nova requisição para aprovar");
    return r.id;
  });
  redirect(`/requisicoes/${id}`);
}

export async function adicionarAnexo(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const tipo = String(formData.get("tipo_anexo") || "cotacao");
  const r = await q1("SELECT estado FROM requisicoes WHERE id=$1 AND mestre_id=$2", [id, s.id]);
  if (r && ["rascunho", "correccao_pedida"].includes(r.estado)) {
    for (const f of formData.getAll("anexos")) {
      const url = await guardar(f, "orcamentos");
      if (url)
        await q1(
          "INSERT INTO requisicao_anexos (requisicao_id,tipo,ficheiro_url,nome_original,enviado_por) VALUES ($1,$2,$3,$4,$5)",
          [id, tipo, url, f.name, s.id]
        );
    }
  }
  redirect(`/requisicoes/${id}`);
}

export async function submeter(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const r = await q1(
    `SELECT estado, (SELECT count(*) FROM requisicao_anexos WHERE requisicao_id=$1)::int AS n
       FROM requisicoes WHERE id=$1 AND mestre_id=$2`,
    [id, s.id]
  );
  if (!r || !["rascunho", "correccao_pedida"].includes(r.estado)) redirect(`/requisicoes/${id}`);
  if (r.n === 0) redirect(`/requisicoes/${id}?erro=sem-anexo`);
  await tx(async (run) => {
    await run("UPDATE requisicoes SET estado='submetido' WHERE id=$1", [id]);
    await notificar(run, await idsPerfil(run, "aprovador"), id, "Requisição submetida para aprovação");
  });
  redirect(`/requisicoes/${id}`);
}

export async function cancelar(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  await q1(
    `UPDATE requisicoes SET estado='cancelado'
      WHERE id=$1 AND mestre_id=$2 AND estado IN ('rascunho','submetido','correccao_pedida')`,
    [id, s.id]
  );
  redirect(`/requisicoes/${id}`);
}

export async function registarCompra(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const valor = num(formData.get("valor_gasto"));
  const data = String(formData.get("data_compra") || "") || null;
  const tipo = String(formData.get("tipo") || "factura");
  const docs = [];
  for (const f of formData.getAll("comprovativos")) {
    const url = await guardar(f, "compras");
    if (url) docs.push(url);
  }
  if (!(valor >= 0) || docs.length === 0) redirect(`/requisicoes/${id}?erro=compra`);
  await tx(async (run) => {
    const [r] = await run("SELECT estado FROM requisicoes WHERE id=$1 AND mestre_id=$2 FOR UPDATE", [id, s.id]);
    if (!r || r.estado !== "dinheiro_enviado") return;
    const [c] = await run(
      "INSERT INTO compras (requisicao_id, valor_gasto, data_compra) VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE)) RETURNING id",
      [id, valor, data]
    );
    for (const url of docs)
      await run("INSERT INTO comprovativos_compra (compra_id, tipo, ficheiro_url) VALUES ($1,$2,$3)", [c.id, tipo, url]);
    await run("UPDATE requisicoes SET estado='compra_comprovada' WHERE id=$1", [id]);
    await notificar(run, await idsPerfil(run, "financeiro"), id, "Compra comprovada: falta fazer o acerto");
  });
  redirect(`/requisicoes/${id}`);
}

export async function comentar(formData) {
  const s = await exigir();
  const id = Number(formData.get("id"));
  const texto = String(formData.get("texto") || "").trim();
  if (texto) await q1("INSERT INTO comentarios (requisicao_id, utilizador_id, texto) VALUES ($1,$2,$3)", [id, s.id, texto]);
  redirect(`/requisicoes/${id}`);
}

/* ---------- Aprovador ---------- */
export async function decidir(formData) {
  const s = await exigir("aprovador");
  const id = Number(formData.get("id"));
  const decisao = String(formData.get("decisao"));
  const motivo = String(formData.get("motivo") || "").trim();
  if (!["aprovado", "reprovado", "correccao"].includes(decisao)) redirect(`/requisicoes/${id}`);
  if (decisao !== "aprovado" && !motivo) redirect(`/requisicoes/${id}?erro=motivo`);

  await tx(async (run) => {
    const [r] = await run("SELECT estado, valor_estimado, mestre_id FROM requisicoes WHERE id=$1 FOR UPDATE", [id]);
    if (!r || r.estado !== "submetido") return;
    const ja = await run(
      `SELECT 1 FROM aprovacoes WHERE requisicao_id=$1 AND aprovador_id=$2 AND decidido_em > ${desdeSubmissao}`,
      [id, s.id]
    );
    if (ja.length) return;
    await run("INSERT INTO aprovacoes (requisicao_id, aprovador_id, decisao, motivo) VALUES ($1,$2,$3,$4)", [
      id, s.id, decisao, motivo || null,
    ]);
    let novo = null;
    if (decisao === "reprovado") novo = "reprovado";
    else if (decisao === "correccao") novo = "correccao_pedida";
    else {
      const [reg] = await run(
        `SELECT aprovadores_necessarios AS n FROM regras_aprovacao
          WHERE valor_min <= $1 AND (valor_max IS NULL OR $1 < valor_max) ORDER BY valor_min DESC LIMIT 1`,
        [r.valor_estimado]
      );
      const [c] = await run(
        `SELECT count(DISTINCT aprovador_id)::int AS n FROM aprovacoes
          WHERE requisicao_id=$1 AND decisao='aprovado' AND decidido_em > ${desdeSubmissao}`,
        [id]
      );
      if (c.n >= (reg?.n || 1)) novo = "aprovado";
    }
    if (!novo) return;
    await run("UPDATE requisicoes SET estado=$2 WHERE id=$1", [id, novo]);
    const msg = {
      aprovado: "A sua requisição foi aprovada. Aguarde o envio do dinheiro.",
      reprovado: `A sua requisição foi reprovada: ${motivo}`,
      correccao_pedida: `Correcção pedida: ${motivo}`,
    }[novo];
    await notificar(run, [r.mestre_id], id, msg);
    if (novo === "aprovado") await notificar(run, await idsPerfil(run, "financeiro"), id, "Requisição aprovada: enviar dinheiro");
  });
  redirect(`/requisicoes/${id}`);
}

/* ---------- Financeiro ---------- */
export async function enviarDinheiro(formData) {
  const s = await exigir("financeiro");
  const id = Number(formData.get("id"));
  const valor = num(formData.get("valor"));
  const metodo = String(formData.get("metodo"));
  const referencia = String(formData.get("referencia") || "").trim() || null;
  const f = formData.get("comprovativo");
  if (!(valor > 0) || !f || !f.size) redirect(`/requisicoes/${id}?erro=comprovativo`);
  const url = await guardar(f, "transferencias");
  await tx(async (run) => {
    const [r] = await run("SELECT estado, mestre_id FROM requisicoes WHERE id=$1 FOR UPDATE", [id]);
    if (!r || r.estado !== "aprovado") return;
    const [p] = await run(
      "INSERT INTO pagamentos (requisicao_id, financeiro_id, valor, metodo, referencia) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [id, s.id, valor, metodo, referencia]
    );
    await run("INSERT INTO comprovativos_pagamento (pagamento_id, ficheiro_url) VALUES ($1,$2)", [p.id, url]);
    await run("UPDATE requisicoes SET estado='dinheiro_enviado' WHERE id=$1", [id]);
    await notificar(run, [r.mestre_id], id, `Dinheiro enviado (${valor} MZN). Faça a compra e anexe o comprovativo.`);
  });
  redirect(`/requisicoes/${id}`);
}

export async function fecharRequisicao(formData) {
  const s = await exigir("financeiro");
  const id = Number(formData.get("id"));
  const destino = String(formData.get("destino") || "devolvido");
  await tx(async (run) => {
    const [r] = await run("SELECT estado, mestre_id FROM requisicoes WHERE id=$1 FOR UPDATE", [id]);
    if (!r || r.estado !== "compra_comprovada") return;
    const [e] = await run("SELECT COALESCE(sum(valor),0) AS v FROM pagamentos WHERE requisicao_id=$1", [id]);
    const [g] = await run("SELECT COALESCE(sum(valor_gasto),0) AS v FROM compras WHERE requisicao_id=$1", [id]);
    const saldo = arred(Number(e.v) - Number(g.v));
    const estado =
      saldo === 0 ? "sem_saldo" : saldo < 0 ? "excesso_a_reembolsar" : destino === "abatido" ? "saldo_abatido" : "saldo_devolvido";
    await run(
      "INSERT INTO acertos (requisicao_id, valor_enviado, valor_gasto, estado, fechado_por, fechado_em) VALUES ($1,$2,$3,$4,$5,now())",
      [id, e.v, g.v, estado, s.id]
    );
    await run("UPDATE requisicoes SET estado='fechado' WHERE id=$1", [id]); // o banco valida os 2 comprovativos
    await notificar(run, [r.mestre_id], id, "Requisição fechada.");
  });
  redirect(`/requisicoes/${id}`);
}

/* ---------- Admin ---------- */
export async function criarUtilizador(formData) {
  await exigir("admin");
  const nome = String(formData.get("nome") || "").trim();
  const telefone = String(formData.get("telefone") || "").trim();
  const senha = String(formData.get("senha") || "");
  const perfil = String(formData.get("perfil"));
  const area = formData.get("area_id") ? Number(formData.get("area_id")) : null;
  const sites = formData.getAll("sites").map(Number);
  if (!nome || !telefone || senha.length < 6) redirect("/admin?erro=dados");
  let ok = true;
  try {
    const hash = await bcrypt.hash(senha, 10);
    await tx(async (run) => {
      const [u] = await run(
        `INSERT INTO utilizadores (nome, telefone, perfil_id, area_id, senha_hash)
         VALUES ($1,$2,(SELECT id FROM perfis WHERE nome=$3),$4,$5) RETURNING id`,
        [nome, telefone, perfil, area, hash]
      );
      for (const sid of sites) await run("INSERT INTO mestre_sites (mestre_id, site_id) VALUES ($1,$2)", [u.id, sid]);
    });
  } catch {
    ok = false;
  }
  redirect(ok ? "/admin" : "/admin?erro=dup");
}

export async function criarSite(formData) {
  await exigir("admin");
  const nome = String(formData.get("nome") || "").trim();
  if (nome)
    await q1("INSERT INTO sites (nome, provincia, cidade, area_id) VALUES ($1,$2,$3,$4)", [
      nome,
      String(formData.get("provincia") || "") || null,
      String(formData.get("cidade") || "") || null,
      Number(formData.get("area_id")),
    ]);
  redirect("/admin");
}

export async function alternarUtilizador(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  if (String(id) !== String(s.id)) await q1("UPDATE utilizadores SET activo = NOT activo WHERE id=$1", [id]);
  redirect("/admin");
}
