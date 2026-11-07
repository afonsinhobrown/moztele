import { q, q1 } from "@/lib/db";
import { delegacoesAtivasPara, idsDelegadores } from "@/lib/delegacoes";
import { acoesDoAprovador, acoesDoFinanceiro, acoesDoMestre } from "@/lib/painelAcoes";

// O painel responde a uma pergunta: "o que precisa de mim agora?"
// As regras de classificação estão em lib/painelAcoes.js (puras e testáveis).

export async function painel(s) {
  if (s.perfil === "mestre") return painelMestre(s);
  if (s.perfil === "aprovador") return painelAprovador(s);
  if (s.perfil === "financeiro") return painelFinanceiro(s);
  return painelAdmin(s);
}

async function painelMestre(s) {
  const [linhas, resumo, acompanhar] = await Promise.all([
    q(
      `SELECT r.id, r.codigo, r.estado, r.valor_estimado, r.actualizado_em, st.nome AS site,
              EXISTS (SELECT 1 FROM movimentos_stock m
                       WHERE m.requisicao_id=r.id AND m.tipo='entrada') AS no_stock
         FROM requisicoes r JOIN sites st ON st.id=r.site_id
        WHERE r.mestre_id=$1
          AND r.estado IN ('rascunho','correccao_pedida','dinheiro_enviado','compra_comprovada','fechado')
        ORDER BY r.actualizado_em ASC`,
      [s.id]
    ),
    q1(
      `SELECT
         (SELECT count(*)::int FROM requisicoes WHERE mestre_id=$1
           AND estado NOT IN ('fechado','cancelado','reprovado')) AS em_curso,
         (SELECT COALESCE(sum(c.valor - c.valor_usado),0) FROM creditos_abatimento c
           WHERE c.mestre_id=$1) AS credito`,
      [s.id]
    ),
    q(
      `SELECT r.id, r.codigo, r.estado, r.valor_estimado, u.nome AS mestre, st.nome AS site, r.actualizado_em
         FROM requisicoes r
         JOIN utilizadores u ON u.id=r.mestre_id
         JOIN sites st ON st.id=r.site_id
        WHERE u.chefia_id=$1 AND r.estado IN ('submetido','aprovado','dinheiro_enviado','compra_comprovada')
        ORDER BY r.actualizado_em ASC LIMIT 5`,
      [s.id]
    ),
  ]);

  return {
    perfil: "mestre",
    acoes: acoesDoMestre(linhas),
    resumo: { emCurso: Number(resumo?.em_curso || 0), credito: Number(resumo?.credito || 0) },
    acompanhar,
  };
}

async function painelFinanceiro() {
  const [linhas, resumo] = await Promise.all([
    q(
      `SELECT r.id, r.codigo, r.estado, r.valor_estimado, r.actualizado_em,
              u.nome AS mestre, st.nome AS site, a.estado AS acerto_estado,
              COALESCE((SELECT sum(ca.valor) FROM creditos_aplicacoes ca
                         WHERE ca.requisicao_id=r.id),0) AS credito
         FROM requisicoes r
         JOIN utilizadores u ON u.id=r.mestre_id
         JOIN sites st ON st.id=r.site_id
         LEFT JOIN acertos a ON a.requisicao_id=r.id
        WHERE r.estado IN ('aprovado','compra_comprovada')
           OR (a.estado = 'excesso_a_reembolsar')
        ORDER BY r.actualizado_em ASC`
    ),
    q1(
      `SELECT
         (SELECT count(*)::int FROM requisicoes WHERE estado='aprovado') AS por_pagar,
         (SELECT count(*)::int FROM requisicoes WHERE estado='compra_comprovada') AS por_acertar,
         (SELECT COALESCE(sum(valor_estimado),0) FROM requisicoes WHERE estado='aprovado') AS valor_por_pagar`
    ),
  ]);

  return {
    perfil: "financeiro",
    acoes: acoesDoFinanceiro(linhas),
    resumo: {
      porPagar: Number(resumo?.por_pagar || 0),
      porAcertar: Number(resumo?.por_acertar || 0),
      valorPorPagar: Number(resumo?.valor_por_pagar || 0),
    },
    acompanhar: [],
  };
}

async function painelAprovador(s) {
  const votantes = [Number(s.id), ...(await idsDelegadores(s.id)).map(Number)];
  const area = s.area_id ? Number(s.area_id) : null;
  const [linhas, resumo, delegacoes] = await Promise.all([
    q(
      `SELECT r.id, r.codigo, r.estado, r.valor_estimado, r.actualizado_em,
              u.nome AS mestre, st.nome AS site
         FROM requisicoes r
         JOIN utilizadores u ON u.id=r.mestre_id
         JOIN sites st ON st.id=r.site_id
        WHERE r.estado='submetido'
          AND ($1::int IS NULL OR st.area_id=$1)
          AND NOT EXISTS (
                SELECT 1 FROM aprovacoes a
                 WHERE a.requisicao_id=r.id AND a.aprovador_id = ANY($2::bigint[])
                   AND a.decidido_em > COALESCE(
                         (SELECT max(h.criado_em) FROM historico_estados h
                           WHERE h.requisicao_id=r.id AND h.estado_novo='submetido'),'-infinity'))
        ORDER BY r.actualizado_em ASC`,
      [area, votantes]
    ),
    q1(
      `SELECT count(*)::int AS fila FROM requisicoes r
         JOIN sites st ON st.id=r.site_id
        WHERE r.estado='submetido' AND ($1::int IS NULL OR st.area_id=$1)`,
      [area]
    ),
    delegacoesAtivasPara(s.id),
  ]);

  return {
    perfil: "aprovador",
    acoes: acoesDoAprovador(linhas),
    resumo: { fila: Number(resumo?.fila || 0) },
    delegacoes,
    acompanhar: [],
  };
}

async function painelAdmin() {
  const [resumo, atrasadas, recentes] = await Promise.all([
    q1(
      `SELECT
         (SELECT count(*)::int FROM requisicoes WHERE estado='submetido') AS submetidas,
         (SELECT count(*)::int FROM requisicoes WHERE estado='compra_comprovada') AS por_acertar,
         (SELECT count(*)::int FROM requisicoes WHERE estado IN ('dinheiro_enviado','compra_comprovada')) AS em_prestacao,
         (SELECT count(*)::int FROM utilizadores WHERE activo) AS utilizadores,
         (SELECT count(*)::int FROM utilizadores WHERE activo
            AND telefone IN ('840000000','841111111','842222222','843333333')) AS contas_teste`
    ),
    q(
      `SELECT r.id, r.codigo, r.estado, r.valor_estimado, u.nome AS mestre, st.nome AS site, r.actualizado_em
         FROM requisicoes r JOIN utilizadores u ON u.id=r.mestre_id JOIN sites st ON st.id=r.site_id
        WHERE r.estado NOT IN ('fechado','cancelado','reprovado')
        ORDER BY r.actualizado_em ASC LIMIT 6`
    ),
    q(
      `SELECT a.id, a.tabela, a.operacao, a.criado_em, u.nome AS utilizador
         FROM auditoria a LEFT JOIN utilizadores u ON u.id=a.utilizador_id
        ORDER BY a.id DESC LIMIT 5`
    ),
  ]);

  return {
    perfil: "admin",
    acoes: [],
    resumo: {
      submetidas: Number(resumo?.submetidas || 0),
      porAcertar: Number(resumo?.por_acertar || 0),
      emPrestacao: Number(resumo?.em_prestacao || 0),
      utilizadores: Number(resumo?.utilizadores || 0),
      contasTeste: Number(resumo?.contas_teste || 0),
    },
    atrasadas,
    recentes,
    acompanhar: [],
  };
}
