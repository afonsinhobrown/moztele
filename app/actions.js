"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { q, q1, tx } from "@/lib/db";
import { criarSessao, terminarSessao, exigir, sessaoActiva } from "@/lib/auth";
import { guardar, apagarFicheiroGuardado } from "@/lib/upload";
import { ErroFicheiro, FINALIDADES_FINANCEIRAS } from "@/lib/ficheiros";
import { arred, quantidadeValida, valorPositivo, valorValido } from "@/lib/num";
import { errosSenha } from "@/lib/senha";
import { normalizarTelefone, telefoneValido } from "@/lib/telefone";
import { demasiadasTentativas, registarTentativa } from "@/lib/limite";
import { whatsappConfigurado, enviarWhatsapp } from "@/lib/whatsapp";
import { erroInesperado } from "@/lib/log";

const desdeSubmissao = `COALESCE((SELECT max(criado_em) FROM historico_estados WHERE requisicao_id=$1 AND estado_novo='submetido'),'-infinity')`;
const ESTADOS_VALIDOS = ["rascunho", "submetido", "correccao_pedida", "aprovado", "reprovado", "dinheiro_enviado", "compra_comprovada", "fechado", "cancelado"];
const URGENCIAS = ["baixa", "normal", "alta", "urgente"];

/* ---------- Utilitários ---------- */

async function idsPerfil(run, perfil) {
  const rows = await run(
    "SELECT u.id FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE p.nome=$1 AND u.activo",
    [perfil]
  );
  return rows.map((r) => r.id);
}

async function notificar(run, ids, reqId, msg) {
  const unicos = [...new Set((ids || []).filter(Boolean).map(Number).filter(Number.isFinite))];
  if (!unicos.length) return;
  const users = await run(
    "SELECT id, telefone, nome FROM utilizadores WHERE id = ANY($1::bigint[]) AND activo",
    [unicos]
  );
  for (const u of users)
    await run(
      "INSERT INTO notificacoes (utilizador_id, requisicao_id, canal, mensagem) VALUES ($1,$2,'app',$3)",
      [u.id, reqId, msg]
    );
  if (!whatsappConfigurado()) return;
  // Aviso fora da app é "best effort": nunca deve fazer falhar a acção principal.
  await Promise.allSettled(
    users.map((u) =>
      enviarWhatsapp(u.telefone, `Moz Teles: ${msg}`).catch((e) =>
        erroInesperado("Aviso WhatsApp", e, { utilizador: u.id })
      )
    )
  );
}

async function registarFicheiro(run, f, { requisicaoId, finalidade, utilizadorId }) {
  // Sem chave (ex.: fallback Vercel Blob) não há registo central de ficheiros.
  if (!f.chave) return;
  await run(
    `INSERT INTO ficheiros (chave, hash_sha256, tipo_mime, tamanho, nome_original, requisicao_id, finalidade, enviado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [f.chave, f.hash, f.mime, f.tamanho, f.nome, requisicaoId, finalidade, utilizadorId]
  );
}

async function verificarDuplicado(run, f, finalidade) {
  if (!FINALIDADES_FINANCEIRAS.includes(finalidade)) return;
  const [d] = await run(
    `SELECT r.codigo
       FROM ficheiros x LEFT JOIN requisicoes r ON r.id = x.requisicao_id
      WHERE x.hash_sha256 = $1
        AND x.finalidade IN ('pagamento','compra','acerto','reembolso')
      LIMIT 1`,
    [f.hash]
  );
  if (d)
    throw new ErroFicheiro(
      d.codigo
        ? `Este comprovativo já foi usado na requisição ${d.codigo}.`
        : "Este comprovativo já foi usado noutra requisição.",
      "duplicado"
    );
}

async function limpar(ficheiros) {
  await Promise.all((ficheiros || []).map((f) => apagarFicheiroGuardado(f)));
}

const codigoErro = (e) => (e instanceof ErroFicheiro ? e.codigo : "upload");

function lerItens(formData) {
  const d = formData.getAll("descricao");
  const qtd = formData.getAll("quantidade");
  const un = formData.getAll("unidade");
  const pr = formData.getAll("preco");
  const cat = formData.getAll("categoria_id");
  const itens = [];
  for (let i = 0; i < d.length; i++) {
    const descricao = String(d[i] || "").trim().slice(0, 255);
    if (!descricao) continue;
    const quantidade = quantidadeValida(qtd[i]);
    const preco = valorValido(pr[i]);
    if (quantidade === null || preco === null) return { erro: "dados" };
    itens.push({
      descricao,
      quantidade,
      unidade: String(un[i] || "un").trim().slice(0, 20) || "un",
      preco,
      categoria: cat[i] ? Number(cat[i]) : null,
    });
  }
  return { itens, total: arred(itens.reduce((a, i) => a + i.quantidade * i.preco, 0)) };
}

/* ---------- Sessão ---------- */

export async function login(formData) {
  const telefone = normalizarTelefone(formData.get("telefone"));
  const senha = String(formData.get("senha") || "");
  const ip =
    headers().get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers().get("x-real-ip") ||
    "desconhecido";

  if (!telefone || !senha) redirect("/login?erro=1");
  if (await demasiadasTentativas(telefone, ip)) redirect("/login?erro=limite");

  let u = null;
  try {
    u = await q1(
      `SELECT u.id, u.nome, u.senha_hash, u.activo, u.deve_mudar_senha, u.sessao_versao, p.nome AS perfil
         FROM utilizadores u JOIN perfis p ON p.id = u.perfil_id
        WHERE u.telefone = $1`,
      [telefone]
    );
  } catch (e) {
    erroInesperado("Login: base de dados inacessível", e);
    redirect("/login?erro=config");
  }

  const senhaOk = Boolean(u && u.activo && (await bcrypt.compare(senha, u.senha_hash)));
  await registarTentativa(telefone, ip, senhaOk);
  if (!senhaOk) redirect("/login?erro=1");

  await q1("UPDATE utilizadores SET ultimo_acesso = now(), falhas_login = 0 WHERE id = $1", [u.id]);
  await criarSessao(u);
  if (u.deve_mudar_senha) redirect("/conta/senha");
  const destino = String(formData.get("de") || "");
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/requisicoes");
}

export async function logout() {
  terminarSessao();
  redirect("/login");
}

export async function mudarSenha(formData) {
  const s = await sessaoActiva();
  if (!s) redirect("/login");

  const atual = String(formData.get("atual") || "");
  const nova = String(formData.get("nova") || "");
  const confirmar = String(formData.get("confirmar") || "");
  if (nova !== confirmar) redirect("/conta/senha?erro=confirma");
  if (errosSenha(nova).length) redirect("/conta/senha?erro=fraca");

  const u = await q1("SELECT senha_hash FROM utilizadores WHERE id = $1", [s.id]);
  if (!u || !(await bcrypt.compare(atual, u.senha_hash))) redirect("/conta/senha?erro=atual");
  if (await bcrypt.compare(nova, u.senha_hash)) redirect("/conta/senha?erro=igual");

  const hash = await bcrypt.hash(nova, 12);
  await tx(async (run) => {
    await run(
      `UPDATE utilizadores
          SET senha_hash = $1, deve_mudar_senha = FALSE, sessao_versao = sessao_versao + 1
        WHERE id = $2`,
      [hash, s.id]
    );
  }, s.id);

  const novo = await q1(
    `SELECT u.id, u.nome, u.deve_mudar_senha, u.sessao_versao, p.nome AS perfil
       FROM utilizadores u JOIN perfis p ON p.id = u.perfil_id WHERE u.id = $1`,
    [s.id]
  );
  await criarSessao(novo);
  redirect("/requisicoes?ok=senha");
}

/* ---------- Mestre ---------- */

export async function criarRequisicao(formData) {
  const s = await exigir("mestre");
  const site_id = Number(formData.get("site_id"));
  const justificacao = String(formData.get("justificacao") || "").trim().slice(0, 2000);
  const urgencia = URGENCIAS.includes(String(formData.get("urgencia"))) ? String(formData.get("urgencia")) : "normal";
  const acao = formData.get("acao");
  const { itens, total, erro } = lerItens(formData);
  if (erro) redirect("/requisicoes/nova?erro=dados");
  if (!site_id || !justificacao || itens.length === 0) redirect("/requisicoes/nova?erro=1");

  const site = await q1(
    `SELECT st.id FROM sites st
      WHERE st.id = $1 AND st.activo
        AND (EXISTS (SELECT 1 FROM mestre_sites ms WHERE ms.mestre_id = $2 AND ms.site_id = st.id)
             OR NOT EXISTS (SELECT 1 FROM mestre_sites WHERE mestre_id = $2))`,
    [site_id, s.id]
  );
  if (!site) redirect("/requisicoes/nova?erro=site");

  const tipo = String(formData.get("tipo_anexo") || "cotacao");
  const ficheiros = [];
  try {
    for (const f of formData.getAll("anexos")) {
      const g = await guardar(f, "orcamentos");
      if (g) ficheiros.push(g);
    }
  } catch (e) {
    await limpar(ficheiros);
    redirect(`/requisicoes/nova?erro=${codigoErro(e)}`);
  }

  const estado = acao === "submeter" ? "submetido" : "rascunho";
  if (estado === "submetido" && ficheiros.length === 0) {
    await limpar(ficheiros);
    redirect("/requisicoes/nova?erro=2");
  }

  let id;
  try {
    id = await tx(async (run) => {
      const [r] = await run(
        `INSERT INTO requisicoes (mestre_id, site_id, justificacao, urgencia, valor_estimado, estado)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [s.id, site_id, justificacao, urgencia, total, estado]
      );
      for (const i of itens)
        await run(
          `INSERT INTO requisicao_itens (requisicao_id, categoria_id, descricao, quantidade, unidade, preco_unitario)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [r.id, i.categoria, i.descricao, i.quantidade, i.unidade, i.preco]
        );
      for (const f of ficheiros) {
        await registarFicheiro(run, f, { requisicaoId: r.id, finalidade: "orcamento", utilizadorId: s.id });
        await run(
          `INSERT INTO requisicao_anexos (requisicao_id, tipo, ficheiro_url, nome_original, enviado_por)
           VALUES ($1,$2,$3,$4,$5)`,
          [r.id, tipo, f.url, f.nome, s.id]
        );
      }
      if (estado === "submetido")
        await notificar(run, await idsPerfil(run, "aprovador"), r.id, "Nova requisição para aprovar");
      return r.id;
    }, s.id);
  } catch (e) {
    await limpar(ficheiros);
    erroInesperado("Criar requisição", e);
    redirect("/requisicoes/nova?erro=upload");
  }
  redirect(`/requisicoes/${id}`);
}

export async function adicionarAnexo(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const tipo = String(formData.get("tipo_anexo") || "cotacao");
  const r = await q1("SELECT estado FROM requisicoes WHERE id=$1 AND mestre_id=$2", [id, s.id]);
  if (!r || !["rascunho", "correccao_pedida"].includes(r.estado)) redirect(`/requisicoes/${id}`);

  const ficheiros = [];
  try {
    for (const f of formData.getAll("anexos")) {
      const g = await guardar(f, "orcamentos");
      if (g) ficheiros.push(g);
    }
  } catch (e) {
    await limpar(ficheiros);
    redirect(`/requisicoes/${id}?erro=${codigoErro(e)}`);
  }

  try {
    await tx(async (run) => {
      for (const f of ficheiros) {
        await registarFicheiro(run, f, { requisicaoId: id, finalidade: "orcamento", utilizadorId: s.id });
        await run(
          `INSERT INTO requisicao_anexos (requisicao_id, tipo, ficheiro_url, nome_original, enviado_por)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, tipo, f.url, f.nome, s.id]
        );
      }
    }, s.id);
  } catch (e) {
    await limpar(ficheiros);
    erroInesperado("Adicionar anexo", e);
    redirect(`/requisicoes/${id}?erro=upload`);
  }
  redirect(`/requisicoes/${id}`);
}

export async function editarItens(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const { itens, total, erro } = lerItens(formData);
  if (erro || itens.length === 0) redirect(`/requisicoes/${id}?erro=dados`);

  const r = await q1("SELECT estado FROM requisicoes WHERE id=$1 AND mestre_id=$2", [id, s.id]);
  if (!r || !["rascunho", "correccao_pedida"].includes(r.estado)) redirect(`/requisicoes/${id}?erro=estado`);

  await tx(async (run) => {
    await run("DELETE FROM requisicao_itens WHERE requisicao_id=$1", [id]);
    for (const i of itens)
      await run(
        `INSERT INTO requisicao_itens (requisicao_id, categoria_id, descricao, quantidade, unidade, preco_unitario)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, i.categoria, i.descricao, i.quantidade, i.unidade, i.preco]
      );
    await run("UPDATE requisicoes SET valor_estimado=$2 WHERE id=$1", [id, total]);
  }, s.id);
  redirect(`/requisicoes/${id}`);
}

export async function duplicarRequisicao(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const orig = await q1(
    "SELECT site_id, justificacao, urgencia FROM requisicoes WHERE id=$1 AND mestre_id=$2",
    [id, s.id]
  );
  if (!orig) redirect(`/requisicoes/${id}`);
  const novo = await tx(async (run) => {
    const [r] = await run(
      `INSERT INTO requisicoes (mestre_id, site_id, justificacao, urgencia, valor_estimado, estado)
       SELECT $1, site_id, justificacao, urgencia, valor_estimado, 'rascunho'
         FROM requisicoes WHERE id = $2 RETURNING id`,
      [s.id, id]
    );
    await run(
      `INSERT INTO requisicao_itens (requisicao_id, categoria_id, descricao, quantidade, unidade, preco_unitario)
       SELECT $1, categoria_id, descricao, quantidade, unidade, preco_unitario
         FROM requisicao_itens WHERE requisicao_id = $2 ORDER BY id`,
      [r.id, id]
    );
    return r.id;
  }, s.id);
  redirect(`/requisicoes/${novo}`);
}

export async function submeter(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const resultado = await tx(async (run) => {
    const [r] = await run(
      `SELECT estado, (SELECT count(*) FROM requisicao_anexos WHERE requisicao_id=$1)::int AS n
         FROM requisicoes WHERE id=$1 AND mestre_id=$2 FOR UPDATE`,
      [id, s.id]
    );
    if (!r || !["rascunho", "correccao_pedida"].includes(r.estado)) return "estado";
    if (r.n === 0) return "sem-anexo";
    await run("UPDATE requisicoes SET estado='submetido' WHERE id=$1", [id]);
    await notificar(run, await idsPerfil(run, "aprovador"), id, "Requisição submetida para aprovação");
    return "ok";
  }, s.id);
  redirect(resultado === "ok" ? `/requisicoes/${id}` : `/requisicoes/${id}?erro=${resultado}`);
}

export async function cancelar(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  await tx(async (run) => {
    const [r] = await run(
      "SELECT estado FROM requisicoes WHERE id=$1 AND mestre_id=$2 FOR UPDATE",
      [id, s.id]
    );
    if (!r || !["rascunho", "submetido", "correccao_pedida"].includes(r.estado)) return;
    await run("UPDATE requisicoes SET estado='cancelado' WHERE id=$1", [id]);
  }, s.id);
  redirect(`/requisicoes/${id}`);
}

export async function registarCompra(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const valor = valorPositivo(formData.get("valor_gasto"));
  const data = String(formData.get("data_compra") || "");
  const tipo = String(formData.get("tipo") || "factura");
  let fornecedor = formData.get("fornecedor_id") ? Number(formData.get("fornecedor_id")) : null;
  if (fornecedor) {
    const existe = await q1("SELECT 1 FROM fornecedores WHERE id=$1 AND activo", [fornecedor]);
    if (!existe) fornecedor = null;
  }

  if (valor === null) redirect(`/requisicoes/${id}?erro=compra`);
  if (data) {
    const d = new Date(`${data}T00:00:00`);
    if (Number.isNaN(d.getTime()) || d > new Date()) redirect(`/requisicoes/${id}?erro=data`);
  }

  const ficheiros = [];
  try {
    for (const f of formData.getAll("comprovativos")) {
      const g = await guardar(f, "compras");
      if (g) ficheiros.push(g);
    }
  } catch (e) {
    await limpar(ficheiros);
    redirect(`/requisicoes/${id}?erro=${codigoErro(e)}`);
  }
  if (!ficheiros.length) redirect(`/requisicoes/${id}?erro=compra`);

  let resultado = "ok";
  try {
    resultado = await tx(async (run) => {
      const [r] = await run(
        "SELECT estado FROM requisicoes WHERE id=$1 AND mestre_id=$2 FOR UPDATE",
        [id, s.id]
      );
      if (!r || !["dinheiro_enviado", "compra_comprovada"].includes(r.estado)) return "estado";
      const [c] = await run(
        `INSERT INTO compras (requisicao_id, valor_gasto, data_compra, fornecedor_id)
         VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4) RETURNING id`,
        [id, valor, data || null, fornecedor]
      );
      for (const f of ficheiros) {
        await verificarDuplicado(run, f, "compra");
        await registarFicheiro(run, f, { requisicaoId: id, finalidade: "compra", utilizadorId: s.id });
        await run(
          "INSERT INTO comprovativos_compra (compra_id, tipo, ficheiro_url) VALUES ($1,$2,$3)",
          [c.id, tipo, f.url]
        );
      }
      if (r.estado === "dinheiro_enviado")
        await run("UPDATE requisicoes SET estado='compra_comprovada' WHERE id=$1", [id]);
      await notificar(run, await idsPerfil(run, "financeiro"), id, "Compra comprovada: falta fazer o acerto");
      return "ok";
    }, s.id);
  } catch (e) {
    await limpar(ficheiros);
    if (e instanceof ErroFicheiro) redirect(`/requisicoes/${id}?erro=${e.codigo}`);
    if (e?.code === "23505") redirect(`/requisicoes/${id}?erro=duplicado`);
    erroInesperado("Registar compra", e, { requisicao: id });
    redirect(`/requisicoes/${id}?erro=upload`);
  }
  if (resultado === "estado") {
    await limpar(ficheiros);
    redirect(`/requisicoes/${id}?erro=estado`);
  }
  redirect(`/requisicoes/${id}`);
}

export async function comentar(formData) {
  const s = await exigir();
  const id = Number(formData.get("id"));
  const texto = String(formData.get("texto") || "").trim().slice(0, 2000);
  if (texto)
    await q1("INSERT INTO comentarios (requisicao_id, utilizador_id, texto) VALUES ($1,$2,$3)", [id, s.id, texto]);
  redirect(`/requisicoes/${id}`);
}

/* ---------- Aprovador ---------- */

export async function decidir(formData) {
  const s = await exigir("aprovador");
  const id = Number(formData.get("id"));
  const decisao = String(formData.get("decisao"));
  const motivo = String(formData.get("motivo") || "").trim().slice(0, 1000);
  if (!["aprovado", "reprovado", "correccao"].includes(decisao)) redirect(`/requisicoes/${id}`);
  if (decisao !== "aprovado" && !motivo) redirect(`/requisicoes/${id}?erro=motivo`);

  let resultado = "ok";
  try {
    resultado = await tx(async (run) => {
      const [r] = await run(
        "SELECT estado, valor_estimado, mestre_id FROM requisicoes WHERE id=$1 FOR UPDATE",
        [id]
      );
      if (!r || r.estado !== "submetido") return "estado";
      const [ja] = await run(
        `SELECT 1 FROM aprovacoes
          WHERE requisicao_id=$1 AND aprovador_id=$2 AND decidido_em > ${desdeSubmissao}`,
        [id, s.id]
      );
      if (ja) return "ja";

      await run(
        "INSERT INTO aprovacoes (requisicao_id, aprovador_id, decisao, motivo) VALUES ($1,$2,$3,$4)",
        [id, s.id, decisao, motivo || null]
      );

      let novo = null;
      if (decisao === "reprovado") novo = "reprovado";
      else if (decisao === "correccao") novo = "correccao_pedida";
      else {
        const [reg] = await run(
          `SELECT aprovadores_necessarios AS n FROM regras_aprovacao
            WHERE valor_min <= $1 AND (valor_max IS NULL OR $1 < valor_max)
            ORDER BY valor_min DESC LIMIT 1`,
          [r.valor_estimado]
        );
        const [c] = await run(
          `SELECT count(DISTINCT aprovador_id)::int AS n FROM aprovacoes
            WHERE requisicao_id=$1 AND decisao='aprovado' AND decidido_em > ${desdeSubmissao}`,
          [id]
        );
        if (c.n >= Number(reg?.n || 1)) novo = "aprovado";
      }
      if (!novo) return "ok";

      await run("UPDATE requisicoes SET estado=$2 WHERE id=$1", [id, novo]);
      const msg = {
        aprovado: "A sua requisição foi aprovada. Aguarde o envio do dinheiro.",
        reprovado: `A sua requisição foi reprovada: ${motivo}`,
        correccao_pedida: `Correcção pedida: ${motivo}`,
      }[novo];
      await notificar(run, [r.mestre_id], id, msg);
      if (novo === "aprovado")
        await notificar(run, await idsPerfil(run, "financeiro"), id, "Requisição aprovada: enviar dinheiro");
      return "ok";
    }, s.id);
  } catch (e) {
    erroInesperado("Decidir", e, { requisicao: id });
    redirect(`/requisicoes/${id}?erro=upload`);
  }

  if (resultado === "estado") redirect(`/requisicoes/${id}?erro=estado`);
  if (resultado === "ja") redirect(`/requisicoes/${id}?erro=ja`);
  redirect(`/requisicoes/${id}`);
}

/* ---------- Financeiro ---------- */

export async function enviarDinheiro(formData) {
  const s = await exigir("financeiro");
  const id = Number(formData.get("id"));
  const valor = valorPositivo(formData.get("valor"));
  const metodo = String(formData.get("metodo") || "");
  if (!["mpesa", "emola", "mkesh", "banco", "numerario"].includes(metodo)) redirect(`/requisicoes/${id}?erro=dados`);
  const referencia = String(formData.get("referencia") || "").trim().slice(0, 100) || null;
  const f = formData.get("comprovativo");
  if (valor === null || !f || !f.size) redirect(`/requisicoes/${id}?erro=comprovativo`);

  let ficheiro;
  try {
    ficheiro = await guardar(f, "transferencias");
  } catch (e) {
    redirect(`/requisicoes/${id}?erro=${codigoErro(e)}`);
  }
  if (!ficheiro) redirect(`/requisicoes/${id}?erro=comprovativo`);

  let resultado = "ok";
  try {
    resultado = await tx(async (run) => {
      const [r] = await run(
        "SELECT estado, mestre_id, codigo FROM requisicoes WHERE id=$1 FOR UPDATE",
        [id]
      );
      if (!r || !["aprovado", "dinheiro_enviado"].includes(r.estado)) return "estado";

      await verificarDuplicado(run, ficheiro, "pagamento");
      const [p] = await run(
        "INSERT INTO pagamentos (requisicao_id, financeiro_id, valor, metodo, referencia) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [id, s.id, valor, metodo, referencia]
      );
      await registarFicheiro(run, ficheiro, { requisicaoId: id, finalidade: "pagamento", utilizadorId: s.id });
      await run("INSERT INTO comprovativos_pagamento (pagamento_id, ficheiro_url) VALUES ($1,$2)", [p.id, ficheiro.url]);

      if (r.estado === "aprovado") {
        await run("UPDATE requisicoes SET estado='dinheiro_enviado' WHERE id=$1", [id]);
        await notificar(run, [r.mestre_id], id, `Dinheiro enviado (${valor} MZN). Faça a compra e anexe o comprovativo.`);
      } else {
        await notificar(run, [r.mestre_id], id, `Enviado mais ${valor} MZN para a requisição ${r.codigo}.`);
      }
      return "ok";
    }, s.id);
  } catch (e) {
    await apagarFicheiroGuardado(ficheiro);
    if (e instanceof ErroFicheiro) redirect(`/requisicoes/${id}?erro=${e.codigo}`);
    if (e?.code === "23505") redirect(`/requisicoes/${id}?erro=duplicado`);
    erroInesperado("Enviar dinheiro", e, { requisicao: id });
    redirect(`/requisicoes/${id}?erro=upload`);
  }
  if (resultado === "estado") {
    await apagarFicheiroGuardado(ficheiro);
    redirect(`/requisicoes/${id}?erro=estado`);
  }
  redirect(`/requisicoes/${id}`);
}

export async function fecharRequisicao(formData) {
  const s = await exigir("financeiro");
  const id = Number(formData.get("id"));
  const destino = String(formData.get("destino") || "devolvido");

  const resumo = await q1(
    `SELECT COALESCE((SELECT sum(valor) FROM pagamentos WHERE requisicao_id=$1),0) AS enviado,
            COALESCE((SELECT sum(valor_gasto) FROM compras WHERE requisicao_id=$1),0) AS gasto`,
    [id]
  );
  const saldo = arred(Number(resumo.enviado) - Number(resumo.gasto));

  let ficheiro = null;
  if (saldo > 0 && destino === "devolvido") {
    const f = formData.get("comprovativo");
    if (!f || !f.size) redirect(`/requisicoes/${id}?erro=comprovativo`);
    try {
      ficheiro = await guardar(f, "acertos");
    } catch (e) {
      redirect(`/requisicoes/${id}?erro=${codigoErro(e)}`);
    }
  }

  let resultado = "ok";
  try {
    resultado = await tx(async (run) => {
      const [r] = await run("SELECT estado, mestre_id FROM requisicoes WHERE id=$1 FOR UPDATE", [id]);
      if (!r || r.estado !== "compra_comprovada") return "estado";
      const [e] = await run("SELECT COALESCE(sum(valor),0) AS v FROM pagamentos WHERE requisicao_id=$1", [id]);
      const [g] = await run("SELECT COALESCE(sum(valor_gasto),0) AS v FROM compras WHERE requisicao_id=$1", [id]);
      const s2 = arred(Number(e.v) - Number(g.v));
      const estado =
        s2 === 0
          ? "sem_saldo"
          : s2 < 0
            ? "excesso_a_reembolsar"
            : destino === "abatido"
              ? "saldo_abatido"
              : "saldo_devolvido";

      if (ficheiro) await verificarDuplicado(run, ficheiro, "acerto");
      await run(
        `INSERT INTO acertos
           (requisicao_id, valor_enviado, valor_gasto, estado, fechado_por, fechado_em, comprovativo_url, comprovativo_hash)
         VALUES ($1,$2,$3,$4,$5,now(),$6,$7)`,
        [id, e.v, g.v, estado, s.id, ficheiro?.url || null, ficheiro?.hash || null]
      );
      if (ficheiro) {
        await registarFicheiro(run, ficheiro, { requisicaoId: id, finalidade: "acerto", utilizadorId: s.id });
      }
      await run("UPDATE requisicoes SET estado='fechado' WHERE id=$1", [id]);
      await notificar(run, [r.mestre_id], id, "Requisição fechada.");
      return estado;
    }, s.id);
  } catch (e) {
    if (ficheiro) await apagarFicheiroGuardado(ficheiro);
    if (e instanceof ErroFicheiro) redirect(`/requisicoes/${id}?erro=${e.codigo}`);
    if (e?.code === "23505") redirect(`/requisicoes/${id}?erro=duplicado`);
    erroInesperado("Fechar requisição", e, { requisicao: id });
    redirect(`/requisicoes/${id}?erro=upload`);
  }
  if (resultado === "estado") {
    if (ficheiro) await apagarFicheiroGuardado(ficheiro);
    redirect(`/requisicoes/${id}?erro=estado`);
  }
  redirect(`/requisicoes/${id}`);
}

export async function registarReembolso(formData) {
  const s = await exigir("financeiro");
  const id = Number(formData.get("id"));
  const f = formData.get("comprovativo");
  if (!f || !f.size) redirect(`/requisicoes/${id}?erro=comprovativo`);

  let ficheiro;
  try {
    ficheiro = await guardar(f, "reembolsos");
  } catch (e) {
    redirect(`/requisicoes/${id}?erro=${codigoErro(e)}`);
  }

  let resultado = "ok";
  try {
    resultado = await tx(async (run) => {
      const [a] = await run(
        "SELECT * FROM acertos WHERE requisicao_id=$1 FOR UPDATE",
        [id]
      );
      if (!a || a.estado !== "excesso_a_reembolsar") return "estado";
      const valor = arred(-Number(a.saldo));
      if (!(valor > 0)) return "estado";

      await verificarDuplicado(run, ficheiro, "reembolso");
      await registarFicheiro(run, ficheiro, { requisicaoId: id, finalidade: "reembolso", utilizadorId: s.id });
      await run(
        "INSERT INTO reembolsos (requisicao_id, valor, comprovativo_url, comprovativo_hash, registado_por) VALUES ($1,$2,$3,$4,$5)",
        [id, valor, ficheiro.url, ficheiro.hash, s.id]
      );
      await run("UPDATE acertos SET estado='excesso_reembolsado' WHERE requisicao_id=$1", [id]);
      const [r] = await run("SELECT mestre_id FROM requisicoes WHERE id=$1", [id]);
      await notificar(run, [r.mestre_id], id, `O excesso de ${valor} MZN foi reembolsado.`);
      return "ok";
    }, s.id);
  } catch (e) {
    await apagarFicheiroGuardado(ficheiro);
    if (e instanceof ErroFicheiro) redirect(`/requisicoes/${id}?erro=${e.codigo}`);
    if (e?.code === "23505") redirect(`/requisicoes/${id}?erro=duplicado`);
    erroInesperado("Registar reembolso", e, { requisicao: id });
    redirect(`/requisicoes/${id}?erro=upload`);
  }
  if (resultado === "estado") {
    await apagarFicheiroGuardado(ficheiro);
    redirect(`/requisicoes/${id}?erro=estado`);
  }
  redirect(`/requisicoes/${id}`);
}

/* ---------- Admin ---------- */

export async function criarUtilizador(formData) {
  await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const telefone = normalizarTelefone(formData.get("telefone"));
  const senha = String(formData.get("senha") || "");
  const perfil = String(formData.get("perfil"));
  const area = formData.get("area_id") ? Number(formData.get("area_id")) : null;
  const sites = formData.getAll("sites").map(Number).filter(Boolean);

  if (!nome || !telefoneValido(telefone)) redirect("/admin?erro=dados");
  if (errosSenha(senha).length) redirect("/admin?erro=senha");

  let ok = true;
  try {
    const hash = await bcrypt.hash(senha, 12);
    await tx(async (run) => {
      const [u] = await run(
        `INSERT INTO utilizadores (nome, telefone, perfil_id, area_id, senha_hash, deve_mudar_senha)
         VALUES ($1,$2,(SELECT id FROM perfis WHERE nome=$3),$4,$5,TRUE) RETURNING id`,
        [nome, telefone, perfil, area, hash]
      );
      for (const sid of sites) await run("INSERT INTO mestre_sites (mestre_id, site_id) VALUES ($1,$2)", [u.id, sid]);
    });
  } catch {
    ok = false;
  }
  redirect(ok ? "/admin?ok=utilizador" : "/admin?erro=dup");
}

export async function actualizarUtilizador(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const telefone = normalizarTelefone(formData.get("telefone"));
  const email = String(formData.get("email") || "").trim().slice(0, 150) || null;
  const perfil = String(formData.get("perfil"));
  const area = formData.get("area_id") ? Number(formData.get("area_id")) : null;
  const sites = formData.getAll("sites").map(Number).filter(Boolean);
  const activo = formData.get("activo") === "on";
  const senha = String(formData.get("senha") || "");

  if (!id || !nome || !telefoneValido(telefone)) redirect(`/admin/utilizadores/${id}?erro=dados`);
  if (senha && errosSenha(senha).length) redirect(`/admin/utilizadores/${id}?erro=senha`);

  const alvo = await q1(
    `SELECT u.id, u.activo, p.nome AS perfil FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE u.id=$1`,
    [id]
  );
  if (!alvo) redirect("/admin");
  if (id === Number(s.id) && (perfil !== "admin" || !activo))
    redirect(`/admin/utilizadores/${id}?erro=proprio`);
  if (alvo.perfil === "admin" && (perfil !== "admin" || !activo)) {
    const restantes = await q1(
      `SELECT count(*)::int AS n FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id
        WHERE p.nome='admin' AND u.activo AND u.id <> $1`,
      [id]
    );
    if (Number(restantes.n) === 0) redirect(`/admin/utilizadores/${id}?erro=ultimo`);
  }

  try {
    const hash = senha ? await bcrypt.hash(senha, 12) : null;
    await tx(async (run) => {
      await run(
        `UPDATE utilizadores
            SET nome=$1, telefone=$2, email=$3,
                perfil_id=(SELECT id FROM perfis WHERE nome=$4), area_id=$5, activo=$6,
                senha_hash=COALESCE($7, senha_hash),
                deve_mudar_senha = CASE WHEN $7::text IS NOT NULL THEN TRUE ELSE deve_mudar_senha END,
                sessao_versao = sessao_versao + CASE WHEN $7::text IS NOT NULL OR $6 = FALSE THEN 1 ELSE 0 END
          WHERE id=$8`,
        [nome, telefone, email, perfil, area, activo, hash, id]
      );
      await run("DELETE FROM mestre_sites WHERE mestre_id=$1", [id]);
      for (const sid of sites) await run("INSERT INTO mestre_sites (mestre_id, site_id) VALUES ($1,$2)", [id, sid]);
    }, s.id);
  } catch {
    redirect(`/admin/utilizadores/${id}?erro=dup`);
  }
  if (id === Number(s.id)) {
    const u = await q1(
      `SELECT u.id, u.nome, u.sessao_versao, u.deve_mudar_senha, p.nome AS perfil
         FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE u.id=$1`,
      [id]
    );
    await criarSessao(u);
  }
  redirect("/admin?ok=utilizador");
}

export async function alternarUtilizador(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  if (id === Number(s.id)) redirect("/admin?erro=proprio");

  const alvo = await q1(
    `SELECT u.activo, p.nome AS perfil FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE u.id=$1`,
    [id]
  );
  if (!alvo) redirect("/admin");
  if (alvo.activo && alvo.perfil === "admin") {
    const restantes = await q1(
      `SELECT count(*)::int AS n FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id
        WHERE p.nome='admin' AND u.activo AND u.id <> $1`,
      [id]
    );
    if (Number(restantes.n) === 0) redirect("/admin?erro=ultimo");
  }
  await q1(
    `UPDATE utilizadores
        SET activo = NOT activo,
            sessao_versao = sessao_versao + CASE WHEN activo THEN 1 ELSE 0 END
      WHERE id=$1`,
    [id]
  );
  redirect("/admin?ok=utilizador");
}

export async function criarSite(formData) {
  await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const area = Number(formData.get("area_id"));
  if (nome && area)
    await q1("INSERT INTO sites (nome, provincia, cidade, area_id) VALUES ($1,$2,$3,$4)", [
      nome,
      String(formData.get("provincia") || "").slice(0, 80) || null,
      String(formData.get("cidade") || "").slice(0, 80) || null,
      area,
    ]);
  redirect("/admin?ok=site");
}

export async function criarFornecedor(formData) {
  await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  if (!nome) redirect("/admin?erro=dados");
  await q1("INSERT INTO fornecedores (nome, contacto, nuit) VALUES ($1,$2,$3)", [
    nome,
    String(formData.get("contacto") || "").trim().slice(0, 80) || null,
    String(formData.get("nuit") || "").trim().slice(0, 20) || null,
  ]);
  redirect("/admin?ok=fornecedor");
}

export async function marcarNotificacoesLidas() {
  const s = await exigir();
  await q1("UPDATE notificacoes SET lida = TRUE WHERE utilizador_id=$1 AND NOT lida", [s.id]);
  redirect("/notificacoes");
}
