import { q, q1 } from "@/lib/db";

const desdeSubmissao = (alias = "h") =>
  `COALESCE((SELECT max(${alias}.criado_em) FROM historico_estados ${alias}
              WHERE ${alias}.requisicao_id=$1 AND ${alias}.estado_novo='submetido'),'-infinity')`;

export async function obterRequisicao(id, s) {
  const r = await q1(
    `SELECT r.*, u.nome AS mestre, u.telefone, st.nome AS site, st.area_id AS site_area
       FROM requisicoes r JOIN utilizadores u ON u.id=r.mestre_id JOIN sites st ON st.id=r.site_id
      WHERE r.id=$1`,
    [id]
  );
  if (!r || (s.perfil === "mestre" && String(r.mestre_id) !== String(s.id))) return null;
  // Aprovadores com área definida só vêem requisições dessa área.
  if (s.perfil === "aprovador" && s.area_id && Number(r.site_area) !== Number(s.area_id)) return null;

  const [itens, anexos, aprov, pags, compras, acerto, hist, coment, votou, regra, aprovados, reembolsos] =
    await Promise.all([
      q("SELECT i.*, c.nome AS categoria FROM requisicao_itens i LEFT JOIN categorias c ON c.id=i.categoria_id WHERE requisicao_id=$1 ORDER BY i.id", [id]),
      q("SELECT * FROM requisicao_anexos WHERE requisicao_id=$1 ORDER BY id", [id]),
      q("SELECT a.*, u.nome AS aprovador FROM aprovacoes a JOIN utilizadores u ON u.id=a.aprovador_id WHERE requisicao_id=$1 ORDER BY a.decidido_em", [id]),
      q(`SELECT p.*, u.nome AS financeiro,
                COALESCE((SELECT json_agg(ficheiro_url) FROM comprovativos_pagamento c WHERE c.pagamento_id=p.id),'[]') AS urls
           FROM pagamentos p JOIN utilizadores u ON u.id=p.financeiro_id WHERE requisicao_id=$1 ORDER BY p.enviado_em`, [id]),
      q(`SELECT c.*, f.nome AS fornecedor,
                COALESCE((SELECT json_agg(ficheiro_url) FROM comprovativos_compra x WHERE x.compra_id=c.id),'[]') AS urls
           FROM compras c LEFT JOIN fornecedores f ON f.id=c.fornecedor_id WHERE c.requisicao_id=$1 ORDER BY c.criado_em`, [id]),
      q1("SELECT * FROM acertos WHERE requisicao_id=$1", [id]),
      q("SELECT h.*, u.nome FROM historico_estados h LEFT JOIN utilizadores u ON u.id=h.utilizador_id WHERE requisicao_id=$1 ORDER BY h.criado_em", [id]),
      q("SELECT c.*, u.nome FROM comentarios c JOIN utilizadores u ON u.id=c.utilizador_id WHERE requisicao_id=$1 ORDER BY c.criado_em", [id]),
      s.perfil === "aprovador"
        ? q(`SELECT 1 FROM aprovacoes WHERE requisicao_id=$1 AND aprovador_id=$2 AND decidido_em > ${desdeSubmissao()}`, [id, s.id])
        : Promise.resolve([]),
      q1(
        `SELECT aprovadores_necessarios AS n FROM regras_aprovacao
          WHERE valor_min <= $1 AND (valor_max IS NULL OR $1 < valor_max)
          ORDER BY valor_min DESC LIMIT 1`,
        [r.valor_estimado]
      ),
      q(
        `SELECT count(DISTINCT aprovador_id)::int AS n FROM aprovacoes
          WHERE requisicao_id=$1 AND decisao='aprovado' AND decidido_em > ${desdeSubmissao()}`,
        [id]
      ),
      q("SELECT * FROM reembolsos WHERE requisicao_id=$1 ORDER BY criado_em", [id]),
    ]);

  const necessarios = Number(regra?.n || 1);
  const aprovadosAgora = Number(aprovados[0]?.n || 0);
  return {
    r,
    itens,
    anexos,
    aprov,
    pags,
    compras,
    acerto,
    hist,
    coment,
    votou,
    reembolsos,
    aprovacao: {
      necessarios,
      obtidos: aprovadosAgora,
      faltam: Math.max(0, necessarios - aprovadosAgora),
      totalDecisoes: aprov.length,
    },
  };
}
