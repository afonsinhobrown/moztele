import { q, q1 } from "@/lib/db";

export async function obterRequisicao(id, s) {
  const r = await q1(
    `SELECT r.*, u.nome AS mestre, u.telefone, st.nome AS site
       FROM requisicoes r JOIN utilizadores u ON u.id=r.mestre_id JOIN sites st ON st.id=r.site_id WHERE r.id=$1`,
    [id]
  );
  if (!r || (s.perfil === "mestre" && String(r.mestre_id) !== String(s.id))) return null;

  const [itens, anexos, aprov, pags, compras, acerto, hist, coment, votou] = await Promise.all([
    q("SELECT i.*, c.nome AS categoria FROM requisicao_itens i LEFT JOIN categorias c ON c.id=i.categoria_id WHERE requisicao_id=$1 ORDER BY i.id", [id]),
    q("SELECT * FROM requisicao_anexos WHERE requisicao_id=$1 ORDER BY id", [id]),
    q("SELECT a.*, u.nome AS aprovador FROM aprovacoes a JOIN utilizadores u ON u.id=a.aprovador_id WHERE requisicao_id=$1 ORDER BY a.decidido_em", [id]),
    q(`SELECT p.*, u.nome AS financeiro,
              COALESCE((SELECT json_agg(ficheiro_url) FROM comprovativos_pagamento c WHERE c.pagamento_id=p.id),'[]') AS urls
         FROM pagamentos p JOIN utilizadores u ON u.id=p.financeiro_id WHERE requisicao_id=$1 ORDER BY p.enviado_em`, [id]),
    q(`SELECT c.*, COALESCE((SELECT json_agg(ficheiro_url) FROM comprovativos_compra x WHERE x.compra_id=c.id),'[]') AS urls
         FROM compras c WHERE requisicao_id=$1 ORDER BY c.criado_em`, [id]),
    q1("SELECT * FROM acertos WHERE requisicao_id=$1", [id]),
    q("SELECT h.*, u.nome FROM historico_estados h LEFT JOIN utilizadores u ON u.id=h.utilizador_id WHERE requisicao_id=$1 ORDER BY h.criado_em", [id]),
    q("SELECT c.*, u.nome FROM comentarios c JOIN utilizadores u ON u.id=c.utilizador_id WHERE requisicao_id=$1 ORDER BY c.criado_em", [id]),
    s.perfil === "aprovador"
      ? q(`SELECT 1 FROM aprovacoes WHERE requisicao_id=$1 AND aprovador_id=$2 AND decidido_em >
           COALESCE((SELECT max(criado_em) FROM historico_estados WHERE requisicao_id=$1 AND estado_novo='submetido'),'-infinity')`, [id, s.id])
      : Promise.resolve([]),
  ]);

  return { r, itens, anexos, aprov, pags, compras, acerto, hist, coment, votou };
}
