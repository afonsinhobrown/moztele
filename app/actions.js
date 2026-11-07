"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { q, q1, tx } from "@/lib/db";
import { criarSessao, terminarSessao, exigir, sessaoActiva, criarSessaoPendente, sessaoPendente, terminarSessaoPendente } from "@/lib/auth";
import { guardar, apagarFicheiroGuardado } from "@/lib/upload";
import { ErroFicheiro, FINALIDADES_FINANCEIRAS } from "@/lib/ficheiros";
import { arred, num, quantidadeValida, valorPositivo, valorValido } from "@/lib/num";
import { distribuirCredito } from "@/lib/creditos";
import { TIPOS_MOVIMENTO, calcularMovimento } from "@/lib/stock";
import { errosSenha } from "@/lib/senha";
import { normalizarTelefone, telefoneValido } from "@/lib/telefone";
import { demasiadasTentativas, registarTentativa } from "@/lib/limite";
import { limitar } from "@/lib/acoes";
import { enviarAlerta, whatsappConfigurado } from "@/lib/whatsapp";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { enviarSms, smsConfigurado } from "@/lib/sms";
import { erroInesperado } from "@/lib/log";
import { VALIDADE_HORAS, codigoIgual, gerarCodigo, hashCodigo } from "@/lib/codigos";
import { gerarSegredo, verificarTotp } from "@/lib/totp";

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

async function chefiaDe(run, mestreId) {
  const [c] = await run("SELECT chefia_id FROM utilizadores WHERE id=$1", [mestreId]);
  return c?.chefia_id || null;
}

async function notificar(run, ids, reqId, msg) {
  const unicos = [...new Set((ids || []).filter(Boolean).map(Number).filter(Number.isFinite))];
  if (!unicos.length) return;
  const users = await run(
    `SELECT id, telefone, email, nome, notificar_email, notificar_sms
       FROM utilizadores WHERE id = ANY($1::bigint[]) AND activo`,
    [unicos]
  );
  for (const u of users)
    await run(
      "INSERT INTO notificacoes (utilizador_id, requisicao_id, canal, mensagem) VALUES ($1,$2,'app',$3)",
      [u.id, reqId, msg]
    );

  // Avisos fora da app são "best effort": nunca devem fazer falhar a acção principal.
  const envios = [];
  for (const u of users) {
    if (whatsappConfigurado() && u.telefone)
      envios.push(
        enviarAlerta(u.telefone, `Moz Teles: ${msg}`).catch((e) =>
          erroInesperado("Aviso WhatsApp", e, { utilizador: u.id })
        )
      );
    if (emailConfigurado() && u.email && u.notificar_email)
      envios.push(
        enviarEmail({ para: u.email, assunto: "Moz Teles", texto: msg }).catch((e) =>
          erroInesperado("Aviso email", e, { utilizador: u.id })
        )
      );
    if (smsConfigurado() && u.telefone && u.notificar_sms)
      envios.push(
        enviarSms(u.telefone, `Moz Teles: ${msg}`).catch((e) =>
          erroInesperado("Aviso SMS", e, { utilizador: u.id })
        )
      );
  }
  if (envios.length) await Promise.allSettled(envios);
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
  const forn = formData.getAll("fornecedor_id");
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
      fornecedor: forn[i] ? Number(forn[i]) : null,
    });
  }
  return { itens, total: arred(itens.reduce((a, i) => a + i.quantidade * i.preco, 0)) };
}

// Só deixa gerir stock em sites a que o utilizador tem acesso.
async function sitePermitido(s, siteId) {
  if (!siteId) return null;
  if (["admin", "financeiro"].includes(s.perfil))
    return q1("SELECT id FROM sites WHERE id=$1 AND activo", [siteId]);
  if (s.perfil === "mestre")
    return q1(
      `SELECT st.id FROM sites st
        WHERE st.id=$1 AND st.activo
          AND (EXISTS (SELECT 1 FROM mestre_sites ms WHERE ms.mestre_id=$2 AND ms.site_id=st.id)
               OR NOT EXISTS (SELECT 1 FROM mestre_sites WHERE mestre_id=$2))`,
      [siteId, s.id]
    );
  return null;
}

// Aplica o saldo abatido disponível (mesmo mestre + mesmo site) a uma requisição.
async function aplicarCreditos(run, { requisicaoId, mestreId, siteId, valorEstimado, utilizadorId }) {
  const [ja] = await run(
    "SELECT COALESCE(sum(valor),0) AS v FROM creditos_aplicacoes WHERE requisicao_id=$1",
    [requisicaoId]
  );
  const necessario = arred(Number(valorEstimado) - Number(ja.v));
  if (necessario <= 0) return 0;

  const disponiveis = await run(
    `SELECT id, (valor - valor_usado) AS disponivel
       FROM creditos_abatimento
      WHERE mestre_id=$1 AND site_id=$2 AND valor > valor_usado
      ORDER BY criado_em, id
      FOR UPDATE`,
    [mestreId, siteId]
  );
  const { aplicacoes } = distribuirCredito(disponiveis, necessario);
  for (const a of aplicacoes) {
    await run(
      "INSERT INTO creditos_aplicacoes (credito_id, requisicao_id, valor, aplicado_por) VALUES ($1,$2,$3,$4)",
      [a.id, requisicaoId, a.valor, utilizadorId]
    );
    await run("UPDATE creditos_abatimento SET valor_usado = valor_usado + $1 WHERE id=$2", [
      a.valor,
      a.id,
    ]);
  }
  return aplicacoes.reduce((t, a) => t + a.valor, 0);
}

// Devolve o crédito aplicado quando a requisição é cancelada.
async function libertarCreditos(run, requisicaoId) {
  const apps = await run(
    "SELECT id, credito_id, valor FROM creditos_aplicacoes WHERE requisicao_id=$1",
    [requisicaoId]
  );
  for (const a of apps) {
    await run(
      "UPDATE creditos_abatimento SET valor_usado = GREATEST(0, valor_usado - $1) WHERE id=$2",
      [a.valor, a.credito_id]
    );
    await run("DELETE FROM creditos_aplicacoes WHERE id=$1", [a.id]);
  }
}

async function somaCreditos(run, requisicaoId) {
  const [c] = await run(
    "SELECT COALESCE(sum(valor),0) AS v FROM creditos_aplicacoes WHERE requisicao_id=$1",
    [requisicaoId]
  );
  return Number(c.v);
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
      `SELECT u.id, u.nome, u.telefone, u.senha_hash, u.activo, u.deve_mudar_senha, u.sessao_versao,
              u.totp_ativo, p.nome AS perfil
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

  // Com dois factores ligados, a senha sozinha não abre a sessão.
  if (u.totp_ativo) {
    await criarSessaoPendente({ id: u.id, telefone: u.telefone });
    redirect("/login/2fa");
  }

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

// Segundo passo do login: código do autenticador.
export async function verificar2fa(formData) {
  const codigo = String(formData.get("codigo") || "");
  const p = await sessaoPendente();
  if (!p?.id) redirect("/login?erro=1");

  const ip = ipPedido();
  const telefone = String(p.telefone || "");
  if (await demasiadasTentativas(telefone, ip)) redirect("/login/2fa?erro=limite");

  const u = await q1(
    `SELECT u.id, u.nome, u.activo, u.deve_mudar_senha, u.sessao_versao,
            u.totp_secret, u.totp_ativo, p.nome AS perfil
       FROM utilizadores u JOIN perfis p ON p.id = u.perfil_id
      WHERE u.id = $1`,
    [p.id]
  );
  const ok = Boolean(u && u.activo && u.totp_ativo && verificarTotp(u.totp_secret, codigo));
  await registarTentativa(telefone, ip, ok);
  if (!ok) redirect("/login/2fa?erro=1");

  terminarSessaoPendente();
  await q1("UPDATE utilizadores SET ultimo_acesso = now(), falhas_login = 0 WHERE id = $1", [u.id]);
  await criarSessao(u);
  if (u.deve_mudar_senha) redirect("/conta/senha");
  redirect("/requisicoes");
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

/* ---------- Segundo factor ---------- */

export async function iniciar2fa() {
  const s = await exigir();
  const u = await q1("SELECT totp_secret, totp_ativo FROM utilizadores WHERE id=$1", [s.id]);
  if (!u || u.totp_ativo) redirect("/conta/seguranca");
  const segredo = u.totp_secret || gerarSegredo();
  await tx(
    (run) => run("UPDATE utilizadores SET totp_secret=$1, totp_ativo=FALSE WHERE id=$2", [segredo, s.id]),
    s.id
  );
  redirect("/conta/seguranca");
}

export async function confirmar2fa(formData) {
  const s = await exigir();
  const u = await q1("SELECT totp_secret, totp_ativo FROM utilizadores WHERE id=$1", [s.id]);
  if (!u?.totp_secret || u.totp_ativo) redirect("/conta/seguranca?erro=estado");
  if (!verificarTotp(u.totp_secret, formData.get("codigo"))) redirect("/conta/seguranca?erro=codigo");
  await tx(
    (run) => run("UPDATE utilizadores SET totp_ativo=TRUE, totp_criado_em=now() WHERE id=$1", [s.id]),
    s.id
  );
  redirect("/conta/seguranca?ok=activo");
}

export async function desactivar2fa(formData) {
  const s = await exigir();
  const u = await q1("SELECT senha_hash, totp_secret, totp_ativo FROM utilizadores WHERE id=$1", [s.id]);
  if (!u?.totp_ativo) redirect("/conta/seguranca?erro=estado");

  const senha = String(formData.get("senha") || "");
  const senhaOk = senha ? await bcrypt.compare(senha, u.senha_hash) : false;
  const codigoOk = verificarTotp(u.totp_secret, formData.get("codigo"));
  if (!senhaOk && !codigoOk) redirect("/conta/seguranca?erro=autenticacao");

  await tx(
    (run) => run("UPDATE utilizadores SET totp_ativo=FALSE, totp_secret=NULL WHERE id=$1", [s.id]),
    s.id
  );
  redirect("/conta/seguranca?ok=desactivado");
}

export async function actualizarPreferenciasAvisos(formData) {
  const s = await exigir();
  const email = formData.get("notificar_email") === "on";
  const sms = formData.get("notificar_sms") === "on";
  await tx(
    (run) =>
      run("UPDATE utilizadores SET notificar_email=$1, notificar_sms=$2 WHERE id=$3", [email, sms, s.id]),
    s.id
  );
  redirect("/conta/seguranca?ok=avisos");
}

/* ---------- Recuperação de senha ---------- */

const ipPedido = () =>
  headers().get("x-forwarded-for")?.split(",")[0]?.trim() ||
  headers().get("x-real-ip") ||
  "desconhecido";

// Sem sessão: telefone + código emitido pelo administrador + senha nova.
export async function redefinirComCodigo(formData) {
  const telefone = normalizarTelefone(formData.get("telefone"));
  const codigo = String(formData.get("codigo") || "");
  const nova = String(formData.get("nova") || "");
  const confirmar = String(formData.get("confirmar") || "");
  const ip = ipPedido();

  if (!telefoneValido(telefone) || !codigo) redirect("/recuperar?erro=dados");
  if (nova !== confirmar) redirect("/recuperar?erro=confirma");
  if (errosSenha(nova).length) redirect("/recuperar?erro=fraca");
  if (await demasiadasTentativas(telefone, ip)) redirect("/recuperar?erro=limite");

  const u = await q1("SELECT id, activo FROM utilizadores WHERE telefone=$1", [telefone]);
  const c = u
    ? await q1(
        `SELECT id, codigo_hash FROM codigos_recuperacao
          WHERE utilizador_id=$1 AND usado_em IS NULL AND expira_em > now()
          ORDER BY id DESC LIMIT 1`,
        [u.id]
      )
    : null;

  if (!u || !u.activo || !c || !codigoIgual(codigo, c.codigo_hash)) {
    await registarTentativa(telefone, ip, false);
    redirect("/recuperar?erro=1");
  }

  const hash = await bcrypt.hash(nova, 12);
  await tx(async (run) => {
    await run(
      `UPDATE utilizadores
          SET senha_hash=$1, deve_mudar_senha=FALSE, sessao_versao = sessao_versao + 1, falhas_login=0
        WHERE id=$2`,
      [hash, u.id]
    );
    await run("UPDATE codigos_recuperacao SET usado_em = now() WHERE utilizador_id=$1 AND usado_em IS NULL", [u.id]);
  }, u.id);
  await registarTentativa(telefone, ip, true);
  redirect("/login?ok=senha");
}

/* ---------- Mestre ---------- */

export async function criarRequisicao(formData) {
  const s = await exigir("mestre");
  if (!(await limitar(s, "criar-requisicao", 20, 60))) redirect("/requisicoes/nova?erro=limite");
  const site_id = Number(formData.get("site_id"));
  const projeto_id = formData.get("projeto_id") ? Number(formData.get("projeto_id")) : null;
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

  if (projeto_id) {
    const p = await q1("SELECT id, orcamento_total, activo FROM projetos WHERE id=$1", [projeto_id]);
    if (!p || !p.activo) redirect("/requisicoes/nova?erro=projeto");
    const orcamento = Number(p.orcamento_total || 0);
    if (orcamento > 0) {
      const [consumido] = await q(
        `SELECT COALESCE(sum(valor_estimado),0) AS v FROM requisicoes
          WHERE projeto_id=$1 AND estado NOT IN ('rascunho','reprovado','cancelado')`,
        [projeto_id]
      );
      if (Number(consumido.v) + total > orcamento) redirect("/requisicoes/nova?erro=orcamento");
    }
  }

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
        `INSERT INTO requisicoes (mestre_id, site_id, projeto_id, justificacao, urgencia, valor_estimado, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [s.id, site_id, projeto_id, justificacao, urgencia, total, estado]
      );
      for (const i of itens)
        await run(
          `INSERT INTO requisicao_itens (requisicao_id, categoria_id, descricao, quantidade, unidade, preco_unitario, fornecedor_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [r.id, i.categoria, i.descricao, i.quantidade, i.unidade, i.preco, i.fornecedor]
        );
      for (const f of ficheiros) {
        await registarFicheiro(run, f, { requisicaoId: r.id, finalidade: "orcamento", utilizadorId: s.id });
        await run(
          `INSERT INTO requisicao_anexos (requisicao_id, tipo, ficheiro_url, nome_original, enviado_por)
           VALUES ($1,$2,$3,$4,$5)`,
          [r.id, tipo, f.url, f.nome, s.id]
        );
      }
      if (estado === "submetido") {
        await aplicarCreditos(run, {
          requisicaoId: r.id,
          mestreId: s.id,
          siteId: site_id,
          valorEstimado: total,
          utilizadorId: s.id,
        });
        await notificar(run, await idsPerfil(run, "aprovador"), r.id, "Nova requisição para aprovar");
        const chefia = await chefiaDe(run, s.id);
        if (chefia)
          await notificar(run, [chefia], r.id, `${s.nome} submeteu uma requisição (${total} MZN).`);
      }
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
  if (!(await limitar(s, "anexar", 60, 60))) redirect(`/requisicoes/${id}?erro=limite`);
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
        `INSERT INTO requisicao_itens (requisicao_id, categoria_id, descricao, quantidade, unidade, preco_unitario, fornecedor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, i.categoria, i.descricao, i.quantidade, i.unidade, i.preco, i.fornecedor]
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
      `INSERT INTO requisicoes (mestre_id, site_id, projeto_id, justificacao, urgencia, valor_estimado, estado)
       SELECT $1, site_id, projeto_id, justificacao, urgencia, valor_estimado, 'rascunho'
         FROM requisicoes WHERE id = $2 RETURNING id`,
      [s.id, id]
    );
    await run(
      `INSERT INTO requisicao_itens (requisicao_id, categoria_id, descricao, quantidade, unidade, preco_unitario, fornecedor_id)
       SELECT $1, categoria_id, descricao, quantidade, unidade, preco_unitario, fornecedor_id
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
  if (!(await limitar(s, "submeter", 30, 60))) redirect(`/requisicoes/${id}?erro=limite`);
  const resultado = await tx(async (run) => {
    const [r] = await run(
      `SELECT estado, site_id, projeto_id, valor_estimado,
              (SELECT count(*) FROM requisicao_anexos WHERE requisicao_id=$1)::int AS n
         FROM requisicoes WHERE id=$1 AND mestre_id=$2 FOR UPDATE`,
      [id, s.id]
    );
    if (!r || !["rascunho", "correccao_pedida"].includes(r.estado)) return "estado";
    if (r.n === 0) return "sem-anexo";
    if (r.projeto_id) {
      const p = await run("SELECT orcamento_total, activo FROM projetos WHERE id=$1", [r.projeto_id]);
      if (p[0] && p[0].activo) {
        const orcamento = Number(p[0].orcamento_total || 0);
        if (orcamento > 0) {
          const [consumido] = await run(
            `SELECT COALESCE(sum(valor_estimado),0) AS v FROM requisicoes
              WHERE projeto_id=$1 AND id <> $2 AND estado NOT IN ('rascunho','reprovado','cancelado')`,
            [r.projeto_id, id]
          );
          if (Number(consumido.v) + Number(r.valor_estimado) > orcamento) return "orcamento";
        }
      }
    }
    await run("UPDATE requisicoes SET estado='submetido' WHERE id=$1", [id]);
    await aplicarCreditos(run, {
      requisicaoId: id,
      mestreId: s.id,
      siteId: r.site_id,
      valorEstimado: r.valor_estimado,
      utilizadorId: s.id,
    });
    await notificar(run, await idsPerfil(run, "aprovador"), id, "Requisição submetida para aprovação");
    const chefia = await chefiaDe(run, s.id);
    if (chefia)
      await notificar(run, [chefia], id, `${s.nome} submeteu uma requisição (${r.valor_estimado} MZN).`);
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
    await libertarCreditos(run, id);
    await run("UPDATE requisicoes SET estado='cancelado' WHERE id=$1", [id]);
  }, s.id);
  redirect(`/requisicoes/${id}`);
}

export async function registarCompra(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  if (!(await limitar(s, "compra", 60, 60))) redirect(`/requisicoes/${id}?erro=limite`);
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
  if (!texto) redirect(`/requisicoes/${id}`);
  if (!(await limitar(s, "comentar", 30, 10))) redirect(`/requisicoes/${id}?erro=limite`);

  await tx(async (run) => {
    const [r] = await run("SELECT mestre_id, codigo FROM requisicoes WHERE id=$1", [id]);
    if (!r) return;
    await run("INSERT INTO comentarios (requisicao_id, utilizador_id, texto) VALUES ($1,$2,$3)", [
      id,
      s.id,
      texto,
    ]);
    const decisores = await run("SELECT DISTINCT aprovador_id FROM aprovacoes WHERE requisicao_id=$1", [id]);
    const chefia = await chefiaDe(run, r.mestre_id);
    const destinatarios = [r.mestre_id, ...decisores.map((d) => d.aprovador_id), chefia].filter(
      (x) => x && String(x) !== String(s.id)
    );
    await notificar(run, destinatarios, id, `Novo comentário de ${s.nome}: ${texto.slice(0, 160)}`);
  }, s.id);
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
      // Delegação activa: decide em nome do aprovador ausente.
      const [delega] = await run(
        `SELECT d.de_id FROM delegacoes_aprovacao d
           JOIN utilizadores u ON u.id=d.de_id
           JOIN perfis p ON p.id=u.perfil_id
          WHERE d.para_id=$1 AND d.cancelada_em IS NULL
            AND now() BETWEEN d.inicio AND d.fim
            AND p.nome='aprovador' AND u.activo
          ORDER BY d.fim DESC LIMIT 1`,
        [s.id]
      );
      const emNomeDe = delega ? delega.de_id : s.id;
      const [ja] = await run(
        `SELECT 1 FROM aprovacoes
          WHERE requisicao_id=$1 AND aprovador_id=$2 AND decidido_em > ${desdeSubmissao}`,
        [id, emNomeDe]
      );
      if (ja) return "ja";

      await run(
        "INSERT INTO aprovacoes (requisicao_id, aprovador_id, delegado_id, decisao, motivo) VALUES ($1,$2,$3,$4,$5)",
        [id, emNomeDe, delega ? s.id : null, decisao, motivo || null]
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
      if (novo === "reprovado") await libertarCreditos(run, id);
      const msg = {
        aprovado: "A sua requisição foi aprovada. Aguarde o envio do dinheiro.",
        reprovado: `A sua requisição foi reprovada: ${motivo}`,
        correccao_pedida: `Correcção pedida: ${motivo}`,
      }[novo];
      await notificar(run, [r.mestre_id], id, msg);
      if (delega)
        await notificar(run, [delega.de_id], id, `${s.nome} decidiu em seu nome (${decisao}).`);
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

/* ---------- Delegação de aprovação ---------- */

export async function delegarAprovacao(formData) {
  const s = await exigir("aprovador", "admin");
  const paraId = Number(formData.get("para_id"));
  const fimRaw = String(formData.get("fim") || "").trim();

  if (!paraId || paraId === Number(s.id)) redirect("/delegacoes?erro=dados");
  const alvo = await q1(
    `SELECT u.id FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id
      WHERE u.id=$1 AND u.activo AND p.nome='aprovador'`,
    [paraId]
  );
  if (!alvo) redirect("/delegacoes?erro=perfil");

  let fim;
  if (fimRaw) {
    const d = new Date(`${fimRaw}T23:59:59`);
    if (Number.isNaN(d.getTime()) || d <= new Date()) redirect("/delegacoes?erro=data");
    fim = d.toISOString();
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    fim = d.toISOString();
  }

  await tx(async (run) => {
    await run(
      `INSERT INTO delegacoes_aprovacao (de_id, para_id, inicio, fim, criado_por)
       VALUES ($1,$2, now(), $3, $1)`,
      [s.id, paraId, fim]
    );
    await run(
      "INSERT INTO notificacoes (utilizador_id, canal, mensagem) VALUES ($1,'app',$2)",
      [paraId, `${s.nome} delegou-lhe a aprovação de requisições até ${new Date(fim).toLocaleDateString("pt-MZ")}.`]
    );
  }, s.id);
  redirect("/delegacoes?ok=delegado");
}

export async function cancelarDelegacao(formData) {
  const s = await exigir("aprovador", "admin");
  const id = Number(formData.get("id"));
  const d = await q1("SELECT de_id FROM delegacoes_aprovacao WHERE id=$1", [id]);
  if (!d || (String(d.de_id) !== String(s.id) && s.perfil !== "admin")) redirect("/delegacoes");
  await tx(
    (run) =>
      run("UPDATE delegacoes_aprovacao SET cancelada_em = now() WHERE id=$1 AND cancelada_em IS NULL", [id]),
    s.id
  );
  redirect("/delegacoes?ok=cancelada");
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
            COALESCE((SELECT sum(valor) FROM creditos_aplicacoes WHERE requisicao_id=$1),0) AS credito,
            COALESCE((SELECT sum(valor_gasto) FROM compras WHERE requisicao_id=$1),0) AS gasto`,
    [id]
  );
  const saldo = arred(Number(resumo.enviado) + Number(resumo.credito) - Number(resumo.gasto));

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
      const [r] = await run("SELECT estado, mestre_id, site_id FROM requisicoes WHERE id=$1 FOR UPDATE", [id]);
      if (!r || r.estado !== "compra_comprovada") return "estado";
      const [e] = await run("SELECT COALESCE(sum(valor),0) AS v FROM pagamentos WHERE requisicao_id=$1", [id]);
      const credito = await somaCreditos(run, id);
      const [g] = await run("SELECT COALESCE(sum(valor_gasto),0) AS v FROM compras WHERE requisicao_id=$1", [id]);
      const s2 = arred(Number(e.v) + credito - Number(g.v));
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
        [id, arred(Number(e.v) + credito), g.v, estado, s.id, ficheiro?.url || null, ficheiro?.hash || null]
      );
      if (ficheiro) {
        await registarFicheiro(run, ficheiro, { requisicaoId: id, finalidade: "acerto", utilizadorId: s.id });
      }
      await run("UPDATE requisicoes SET estado='fechado' WHERE id=$1", [id]);
      // O saldo abatido fica como crédito para a próxima requisição do mesmo mestre/site.
      if (estado === "saldo_abatido") {
        await run(
          `INSERT INTO creditos_abatimento (requisicao_origem_id, mestre_id, site_id, valor)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (requisicao_origem_id) DO NOTHING`,
          [id, r.mestre_id, r.site_id, s2]
        );
        await notificar(run, [r.mestre_id], id, `Requisição fechada. ${s2} MZN ficam abatidos à próxima requisição.`);
      } else {
        await notificar(run, [r.mestre_id], id, "Requisição fechada.");
      }
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
  const chefia = formData.get("chefia_id") ? Number(formData.get("chefia_id")) : null;
  const activo = formData.get("activo") === "on";
  const senha = String(formData.get("senha") || "");

  if (!id || !nome || !telefoneValido(telefone)) redirect(`/admin/utilizadores/${id}?erro=dados`);
  if (senha && errosSenha(senha).length) redirect(`/admin/utilizadores/${id}?erro=senha`);
  if (chefia === id) redirect(`/admin/utilizadores/${id}?erro=proprio`);

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
                senha_hash=COALESCE($7, senha_hash), chefia_id=$9,
                deve_mudar_senha = CASE WHEN $7::text IS NOT NULL THEN TRUE ELSE deve_mudar_senha END,
                sessao_versao = sessao_versao + CASE WHEN $7::text IS NOT NULL OR $6 = FALSE THEN 1 ELSE 0 END
          WHERE id=$8`,
        [nome, telefone, email, perfil, area, activo, hash, id, chefia]
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

// Emite um código de uso único para o utilizador repor a senha sozinho.
// O código só aparece uma vez: o administrador tem de o passar por telefone.
export async function gerarCodigoRecuperacao(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  const alvo = await q1("SELECT id, activo FROM utilizadores WHERE id=$1", [id]);
  if (!alvo || !alvo.activo) redirect(`/admin/utilizadores/${id}?erro=dados`);

  const codigo = gerarCodigo();
  await tx(async (run) => {
    await run("UPDATE codigos_recuperacao SET usado_em = now() WHERE utilizador_id=$1 AND usado_em IS NULL", [id]);
    await run(
      `INSERT INTO codigos_recuperacao (utilizador_id, codigo_hash, expira_em, criado_por)
       VALUES ($1,$2, now() + ($3 || ' hours')::interval, $4)`,
      [id, hashCodigo(codigo), String(VALIDADE_HORAS), s.id]
    );
  }, s.id);
  redirect(`/admin/utilizadores/${id}?codigo=${encodeURIComponent(codigo)}`);
}

// Repõe o segundo factor de alguém que perdeu o telemóvel.
export async function reporDoisFactores(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  if (!id) redirect("/admin");
  await tx(
    (run) => run("UPDATE utilizadores SET totp_ativo=FALSE, totp_secret=NULL WHERE id=$1", [id]),
    s.id
  );
  redirect(`/admin/utilizadores/${id}?ok=2fa`);
}

export async function criarSite(formData) {
  const s = await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const area = Number(formData.get("area_id"));
  if (nome && area)
    await tx(
      (run) =>
        run("INSERT INTO sites (nome, provincia, cidade, area_id) VALUES ($1,$2,$3,$4)", [
          nome,
          String(formData.get("provincia") || "").slice(0, 80) || null,
          String(formData.get("cidade") || "").slice(0, 80) || null,
          area,
        ]),
      s.id
    );
  redirect("/admin?ok=site");
}

export async function actualizarSite(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const area = Number(formData.get("area_id"));
  const activo = formData.get("activo") === "on";
  if (!id || !nome || !area) redirect("/admin?erro=dados");
  await tx(
    (run) =>
      run(
        "UPDATE sites SET nome=$1, provincia=$2, cidade=$3, area_id=$4, activo=$5 WHERE id=$6",
        [
          nome,
          String(formData.get("provincia") || "").trim().slice(0, 80) || null,
          String(formData.get("cidade") || "").trim().slice(0, 80) || null,
          area,
          activo,
          id,
        ]
      ),
    s.id
  );
  redirect("/admin?ok=site");
}

export async function criarFornecedor(formData) {
  const s = await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  if (!nome) redirect("/admin?erro=dados");
  await tx(
    (run) =>
      run("INSERT INTO fornecedores (nome, contacto, nuit) VALUES ($1,$2,$3)", [
        nome,
        String(formData.get("contacto") || "").trim().slice(0, 80) || null,
        String(formData.get("nuit") || "").trim().slice(0, 20) || null,
      ]),
    s.id
  );
  redirect("/admin?ok=fornecedor");
}

export async function actualizarFornecedor(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const activo = formData.get("activo") === "on";
  if (!id || !nome) redirect("/admin?erro=dados");
  await tx(
    (run) =>
      run(
        "UPDATE fornecedores SET nome=$1, contacto=$2, nuit=$3, activo=$4 WHERE id=$5",
        [
          nome,
          String(formData.get("contacto") || "").trim().slice(0, 80) || null,
          String(formData.get("nuit") || "").trim().slice(0, 20) || null,
          activo,
          id,
        ]
      ),
    s.id
  );
  redirect("/admin?ok=fornecedor");
}

/* ---------- Admin: áreas e categorias ---------- */

export async function criarArea(formData) {
  const s = await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 80);
  if (!nome) redirect("/admin/catalogos?erro=dados");
  try {
    await tx((run) => run("INSERT INTO areas (nome) VALUES ($1)", [nome]), s.id);
  } catch (e) {
    if (e?.code === "23505") redirect("/admin/catalogos?erro=dup");
    erroInesperado("Criar área", e);
    redirect("/admin/catalogos?erro=upload");
  }
  redirect("/admin/catalogos?ok=area");
}

export async function renomearArea(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  const nome = String(formData.get("nome") || "").trim().slice(0, 80);
  if (!id || !nome) redirect("/admin/catalogos?erro=dados");
  try {
    await tx((run) => run("UPDATE areas SET nome=$1 WHERE id=$2", [nome, id]), s.id);
  } catch (e) {
    if (e?.code === "23505") redirect("/admin/catalogos?erro=dup");
    erroInesperado("Renomear área", e, { area: id });
    redirect("/admin/catalogos?erro=upload");
  }
  redirect("/admin/catalogos?ok=area");
}

export async function apagarArea(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/catalogos?erro=dados");
  try {
    await tx((run) => run("DELETE FROM areas WHERE id=$1", [id]), s.id);
  } catch (e) {
    if (e?.code === "23503") redirect("/admin/catalogos?erro=uso");
    erroInesperado("Apagar área", e, { area: id });
    redirect("/admin/catalogos?erro=upload");
  }
  redirect("/admin/catalogos?ok=area");
}

export async function criarCategoria(formData) {
  const s = await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 100);
  if (!nome) redirect("/admin/catalogos?erro=dados");
  try {
    await tx((run) => run("INSERT INTO categorias (nome) VALUES ($1)", [nome]), s.id);
  } catch (e) {
    if (e?.code === "23505") redirect("/admin/catalogos?erro=dup");
    erroInesperado("Criar categoria", e);
    redirect("/admin/catalogos?erro=upload");
  }
  redirect("/admin/catalogos?ok=categoria");
}

export async function renomearCategoria(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  const nome = String(formData.get("nome") || "").trim().slice(0, 100);
  if (!id || !nome) redirect("/admin/catalogos?erro=dados");
  try {
    await tx((run) => run("UPDATE categorias SET nome=$1 WHERE id=$2", [nome, id]), s.id);
  } catch (e) {
    if (e?.code === "23505") redirect("/admin/catalogos?erro=dup");
    erroInesperado("Renomear categoria", e, { categoria: id });
    redirect("/admin/catalogos?erro=upload");
  }
  redirect("/admin/catalogos?ok=categoria");
}

export async function apagarCategoria(formData) {
  const s = await exigir("admin");
  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/catalogos?erro=dados");
  try {
    await tx((run) => run("DELETE FROM categorias WHERE id=$1", [id]), s.id);
  } catch (e) {
    if (e?.code === "23503") redirect("/admin/catalogos?erro=uso");
    erroInesperado("Apagar categoria", e, { categoria: id });
    redirect("/admin/catalogos?erro=upload");
  }
  redirect("/admin/catalogos?ok=categoria");
}

export async function marcarNotificacoesLidas() {
  const s = await exigir();
  await q1("UPDATE notificacoes SET lida = TRUE WHERE utilizador_id=$1 AND NOT lida", [s.id]);
  redirect("/notificacoes");
}

/* ---------- Inventário ---------- */

export async function criarItemStock(formData) {
  const s = await exigir();
  if (!["mestre", "financeiro", "admin"].includes(s.perfil)) redirect("/inventario?erro=permissao");
  const siteId = Number(formData.get("site_id"));
  const site = await sitePermitido(s, siteId);
  if (!site) redirect("/inventario?erro=site");

  const descricao = String(formData.get("descricao") || "").trim().slice(0, 255);
  const unidade = String(formData.get("unidade") || "un").trim().slice(0, 20) || "un";
  const quantidade = valorValido(formData.get("quantidade")) ?? 0;
  const minima = valorValido(formData.get("quantidade_minima")) ?? 0;
  const categoria = formData.get("categoria_id") ? Number(formData.get("categoria_id")) : null;
  if (!descricao) redirect("/inventario?erro=dados");

  try {
    await tx(async (run) => {
      const [item] = await run(
        `INSERT INTO inventario (site_id, categoria_id, descricao, unidade, quantidade, quantidade_minima)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [siteId, categoria, descricao, unidade, quantidade, minima]
      );
      if (quantidade > 0)
        await run(
          `INSERT INTO movimentos_stock
             (inventario_id, tipo, quantidade, saldo_anterior, saldo_apos, motivo, utilizador_id)
           VALUES ($1,'entrada',$2,0,$2,'Stock inicial',$3)`,
          [item.id, quantidade, s.id]
        );
    }, s.id);
  } catch (e) {
    if (e?.code === "23505") redirect("/inventario?erro=duplicado");
    erroInesperado("Criar item de stock", e);
    redirect("/inventario?erro=upload");
  }
  redirect("/inventario?ok=item");
}

export async function registarMovimentoStock(formData) {
  const s = await exigir();
  if (!["mestre", "financeiro", "admin"].includes(s.perfil)) redirect("/inventario?erro=permissao");

  const itemId = Number(formData.get("item_id"));
  const tipo = String(formData.get("tipo"));
  const quantidade = num(formData.get("quantidade"));
  const motivo = String(formData.get("motivo") || "").trim().slice(0, 500) || null;
  if (!itemId || !TIPOS_MOVIMENTO.includes(tipo) || !Number.isFinite(quantidade))
    redirect("/inventario?erro=dados");

  const item = await q1("SELECT id, site_id, descricao FROM inventario WHERE id=$1", [itemId]);
  if (!item) redirect("/inventario?erro=item");
  const site = await sitePermitido(s, item.site_id);
  if (!site) redirect("/inventario?erro=permissao");

  let resultado = "ok";
  try {
    resultado = await tx(async (run) => {
      const [atual] = await run("SELECT * FROM inventario WHERE id=$1 FOR UPDATE", [itemId]);
      if (!atual) return "item";
      const calc = calcularMovimento({ tipo, quantidade, saldoAtual: atual.quantidade });
      if (calc.erro) return calc.erro;
      await run("UPDATE inventario SET quantidade=$1, actualizado_em=now() WHERE id=$2", [
        calc.saldoApos,
        itemId,
      ]);
      await run(
        `INSERT INTO movimentos_stock
           (inventario_id, tipo, quantidade, saldo_anterior, saldo_apos, motivo, utilizador_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [itemId, tipo, tipo === "ajuste" ? quantidade : calc.delta ? Math.abs(calc.delta) : quantidade, calc.saldoAnterior, calc.saldoApos, motivo, s.id]
      );
      return "ok";
    }, s.id);
  } catch (e) {
    erroInesperado("Movimento de stock", e, { item: itemId });
    redirect("/inventario?erro=upload");
  }
  redirect(`/inventario?${resultado === "ok" ? "ok=movimento" : `erro=${resultado}`}`);
}

export async function entradaStockRequisicao(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const r = await q1("SELECT id, codigo, site_id, mestre_id, estado FROM requisicoes WHERE id=$1 AND mestre_id=$2", [id, s.id]);
  if (!r) redirect(`/requisicoes/${id}`);
  if (!["compra_comprovada", "fechado"].includes(r.estado)) redirect(`/requisicoes/${id}?erro=estado`);

  const ja = await q1("SELECT 1 FROM movimentos_stock WHERE requisicao_id=$1 AND tipo='entrada' LIMIT 1", [id]);
  if (ja) redirect(`/requisicoes/${id}?erro=stock`);

  const itens = await q("SELECT descricao, unidade, categoria_id, quantidade FROM requisicao_itens WHERE requisicao_id=$1 ORDER BY id", [id]);
  if (!itens.length) redirect(`/requisicoes/${id}?erro=stock`);

  // Junta linhas repetidas (mesma descrição) para não duplicar movimentos.
  const mapa = new Map();
  for (const i of itens) {
    const chave = String(i.descricao).trim().toLowerCase();
    const atual = mapa.get(chave) || {
      descricao: String(i.descricao).trim().slice(0, 255),
      unidade: i.unidade,
      categoria_id: i.categoria_id,
      quantidade: 0,
    };
    atual.quantidade = arred(atual.quantidade + Number(i.quantidade));
    mapa.set(chave, atual);
  }

  try {
    await tx(async (run) => {
      for (const item of mapa.values()) {
        const [existente] = await run(
          "SELECT id, quantidade FROM inventario WHERE site_id=$1 AND lower(descricao)=lower($2) FOR UPDATE",
          [r.site_id, item.descricao]
        );
        let inventarioId;
        let anterior;
        if (existente) {
          inventarioId = existente.id;
          anterior = Number(existente.quantidade);
          await run("UPDATE inventario SET quantidade=$1, actualizado_em=now() WHERE id=$2", [
            arred(anterior + item.quantidade),
            inventarioId,
          ]);
        } else {
          const [novo] = await run(
            `INSERT INTO inventario (site_id, categoria_id, descricao, unidade, quantidade, quantidade_minima)
             VALUES ($1,$2,$3,$4,$5,0) RETURNING id`,
            [r.site_id, item.categoria_id, item.descricao, item.unidade, item.quantidade]
          );
          inventarioId = novo.id;
          anterior = 0;
        }
        await run(
          `INSERT INTO movimentos_stock
             (inventario_id, tipo, quantidade, saldo_anterior, saldo_apos, motivo, requisicao_id, utilizador_id)
           VALUES ($1,'entrada',$2,$3,$4,$5,$6,$7)`,
          [
            inventarioId,
            item.quantidade,
            anterior,
            arred(anterior + item.quantidade),
            `Compra da requisição ${r.codigo}`,
            id,
            s.id,
          ]
        );
      }
    }, s.id);
  } catch (e) {
    if (e?.code === "23505") redirect(`/requisicoes/${id}?erro=stock`);
    erroInesperado("Entrada no stock a partir da requisição", e, { requisicao: id });
    redirect(`/requisicoes/${id}?erro=stock`);
  }
  redirect(`/requisicoes/${id}?ok=stock`);
}

/* ---------- Modelos e favoritos ---------- */

export async function guardarModelo(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  const nome = String(formData.get("nome") || "").trim().slice(0, 120);
  const partilhado = formData.get("partilhado") === "on";
  if (!nome) redirect(`/requisicoes/${id}?erro=modelo`);

  const r = await q1("SELECT id, justificacao FROM requisicoes WHERE id=$1 AND mestre_id=$2", [id, s.id]);
  if (!r) redirect(`/requisicoes/${id}`);
  const itens = await q(
    `SELECT descricao, quantidade, unidade, preco_unitario, categoria_id
       FROM requisicao_itens WHERE requisicao_id=$1 ORDER BY id`,
    [id]
  );
  if (!itens.length) redirect(`/requisicoes/${id}?erro=modelo`);

  await q1(
    `INSERT INTO modelos_requisicao (mestre_id, nome, justificacao, itens, partilhado)
     VALUES ($1,$2,$3,$4,$5)`,
    [s.id, nome, r.justificacao, JSON.stringify(itens), partilhado]
  );
  redirect("/modelos?ok=modelo");
}

export async function apagarModelo(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  await q1("DELETE FROM modelos_requisicao WHERE id=$1 AND mestre_id=$2", [id, s.id]);
  redirect("/modelos?ok=apagado");
}

export async function guardarFavorito(formData) {
  const s = await exigir("mestre");
  const itemId = Number(formData.get("item_id"));
  const item = await q1(
    `SELECT i.*, r.id AS requisicao_id
       FROM requisicao_itens i JOIN requisicoes r ON r.id=i.requisicao_id
      WHERE i.id=$1 AND r.mestre_id=$2`,
    [itemId, s.id]
  );
  if (!item) redirect("/requisicoes");
  await q1(
    `INSERT INTO itens_favoritos (mestre_id, descricao, unidade, preco_unitario, categoria_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (mestre_id, lower(descricao)) DO UPDATE
       SET unidade = EXCLUDED.unidade,
           preco_unitario = EXCLUDED.preco_unitario,
           categoria_id = EXCLUDED.categoria_id`,
    [s.id, item.descricao, item.unidade, item.preco_unitario, item.categoria_id]
  );
  redirect(`/requisicoes/${item.requisicao_id}?ok=favorito`);
}

export async function apagarFavorito(formData) {
  const s = await exigir("mestre");
  const id = Number(formData.get("id"));
  await q1("DELETE FROM itens_favoritos WHERE id=$1 AND mestre_id=$2", [id, s.id]);
  redirect("/modelos?ok=apagado");
}

/* ---------- Saldo abatido ---------- */

export async function confirmarCobertura(formData) {
  const s = await exigir("financeiro");
  const id = Number(formData.get("id"));
  let resultado = "ok";
  try {
    resultado = await tx(async (run) => {
      const [r] = await run(
        "SELECT estado, mestre_id, valor_estimado FROM requisicoes WHERE id=$1 FOR UPDATE",
        [id]
      );
      if (!r || r.estado !== "aprovado") return "estado";
      const credito = await somaCreditos(run, id);
      const [p] = await run("SELECT COALESCE(sum(valor),0) AS v FROM pagamentos WHERE requisicao_id=$1", [id]);
      if (arred(credito + Number(p.v)) < Number(r.valor_estimado)) return "credito";
      await run("UPDATE requisicoes SET estado='dinheiro_enviado' WHERE id=$1", [id]);
      await notificar(
        run,
        [r.mestre_id],
        id,
        "Requisição coberta pelo saldo abatido. Faça a compra e anexe o comprovativo."
      );
      return "ok";
    }, s.id);
  } catch (e) {
    erroInesperado("Confirmar cobertura por crédito", e, { requisicao: id });
    redirect(`/requisicoes/${id}?erro=upload`);
  }
  redirect(`/requisicoes/${id}${resultado === "ok" ? "?ok=credito" : `?erro=${resultado}`}`);
}

/* ---------- Admin: projetos ---------- */

export async function criarProjeto(formData) {
  await exigir("admin");
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const area = formData.get("area_id") ? Number(formData.get("area_id")) : null;
  const orcamento = valorValido(formData.get("orcamento_total")) ?? 0;
  if (!nome) redirect("/admin/projetos?erro=dados");
  await q1(
    `INSERT INTO projetos (nome, area_id, orcamento_total) VALUES ($1,$2,$3)`,
    [nome, area, orcamento]
  );
  redirect("/admin/projetos?ok=projeto");
}

export async function actualizarProjeto(formData) {
  await exigir("admin");
  const id = Number(formData.get("id"));
  const nome = String(formData.get("nome") || "").trim().slice(0, 150);
  const area = formData.get("area_id") ? Number(formData.get("area_id")) : null;
  const orcamento = valorValido(formData.get("orcamento_total")) ?? 0;
  const activo = formData.get("activo") === "on";
  if (!id || !nome) redirect(`/admin/projetos/${id}?erro=dados`);
  await q1(
    `UPDATE projetos SET nome=$1, area_id=$2, orcamento_total=$3, activo=$4, actualizado_em=now() WHERE id=$5`,
    [nome, area, orcamento, activo, id]
  );
  redirect("/admin/projetos?ok=projeto");
}

export async function alternarProjeto(formData) {
  await exigir("admin");
  const id = Number(formData.get("id"));
  await q1("UPDATE projetos SET activo = NOT activo, actualizado_em=now() WHERE id=$1", [id]);
  redirect("/admin/projetos?ok=projeto");
}

/* ---------- Admin: regras de aprovação ---------- */

export async function criarRegraAprovacao(formData) {
  await exigir("admin");
  const valorMin = valorValido(formData.get("valor_min")) ?? 0;
  const valorMaxRaw = String(formData.get("valor_max") || "").trim();
  const valorMax = valorMaxRaw === "" ? null : valorValido(valorMaxRaw);
  const n = Number(formData.get("aprovadores_necessarios") || 1);
  if (!Number.isFinite(n) || n < 1) redirect("/admin/regras-aprovacao?erro=dados");
  if (valorMax != null && valorMax <= valorMin) redirect("/admin/regras-aprovacao?erro=dados");
  await q1(
    `INSERT INTO regras_aprovacao (valor_min, valor_max, aprovadores_necessarios) VALUES ($1,$2,$3)`,
    [valorMin, valorMax, n]
  );
  redirect("/admin/regras-aprovacao?ok=regra");
}

export async function actualizarRegraAprovacao(formData) {
  await exigir("admin");
  const id = Number(formData.get("id"));
  const valorMin = valorValido(formData.get("valor_min")) ?? 0;
  const valorMaxRaw = String(formData.get("valor_max") || "").trim();
  const valorMax = valorMaxRaw === "" ? null : valorValido(valorMaxRaw);
  const n = Number(formData.get("aprovadores_necessarios") || 1);
  if (!id || !Number.isFinite(n) || n < 1) redirect(`/admin/regras-aprovacao/${id}?erro=dados`);
  if (valorMax != null && valorMax <= valorMin) redirect(`/admin/regras-aprovacao/${id}?erro=dados`);
  await q1(
    `UPDATE regras_aprovacao SET valor_min=$1, valor_max=$2, aprovadores_necessarios=$3 WHERE id=$4`,
    [valorMin, valorMax, n, id]
  );
  redirect("/admin/regras-aprovacao?ok=regra");
}

export async function removerRegraAprovacao(formData) {
  await exigir("admin");
  const id = Number(formData.get("id"));
  if (id) await q1("DELETE FROM regras_aprovacao WHERE id=$1", [id]);
  redirect("/admin/regras-aprovacao?ok=regra");
}
