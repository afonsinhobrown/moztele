import { q } from "@/lib/db";
import { ESTADOS } from "@/lib/ui";

export const URGENCIAS = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };

export async function dadosRelatorioRequisicoes(searchParams = {}, perfil, { limite = 50, offset = 0 } = {}) {
  const { estado, de, ate, mestre, site, urgencia, texto } = searchParams;
  const params = [];
  const where = [];
  if (estado && ESTADOS[estado]) { params.push(estado); where.push(`r.estado=$${params.length}`); }
  if (urgencia && URGENCIAS[urgencia]) { params.push(urgencia); where.push(`r.urgencia=$${params.length}`); }
  if (de) { params.push(de); where.push(`r.criado_em >= $${params.length}::date`); }
  if (ate) { params.push(ate); where.push(`r.criado_em < ($${params.length}::date + interval '1 day')`); }
  if (mestre) { params.push(`%${mestre}%`); where.push(`u.nome ILIKE $${params.length}`); }
  if (site) { params.push(Number(site)); where.push(`r.site_id=$${params.length}`); }
  if (texto) { params.push(`%${texto}%`); where.push(`(r.codigo ILIKE $${params.length} OR r.justificacao ILIKE $${params.length})`); }
  const filtro = where.length ? "WHERE " + where.join(" AND ") : "";

  const [rows, resumo, sites, mestres] = await Promise.all([
    q(
      `SELECT r.id, r.codigo, r.valor_estimado, r.urgencia, r.estado, r.criado_em, u.nome AS mestre, st.nome AS site
         FROM requisicoes r JOIN utilizadores u ON u.id=r.mestre_id JOIN sites st ON st.id=r.site_id
         ${filtro} ORDER BY r.criado_em DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limite, offset]
    ),
    q(
      `SELECT count(*)::int AS n, COALESCE(sum(r.valor_estimado),0) AS total
         FROM requisicoes r JOIN utilizadores u ON u.id=r.mestre_id JOIN sites st ON st.id=r.site_id ${filtro}`,
      params
    ),
    q("SELECT id, nome FROM sites ORDER BY nome"),
    q("SELECT u.id, u.nome FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE p.nome='mestre' ORDER BY u.nome"),
  ]);

  const n = Number(resumo[0].n);
  return {
    rows,
    n,
    total: resumo[0].total,
    sites,
    mestres,
    pagina: Math.floor(offset / limite) + 1,
    paginas: Math.max(1, Math.ceil(n / limite)),
    filtros: { estado, de, ate, mestre, site, urgencia, texto },
  };
}

export async function dadosRelatorioFinanceiro(searchParams = {}) {
  const { de, ate } = searchParams;
  const periodo = (col) => {
    const params = [];
    const where = [];
    if (de) { params.push(de); where.push(`${col} >= $${params.length}::date`); }
    if (ate) { params.push(ate); where.push(`${col} < ($${params.length}::date + interval '1 day')`); }
    return { params, where: where.length ? "WHERE " + where.join(" AND ") : "" };
  };
  const reqP = periodo("r.criado_em");
  const gastoP = periodo("c.data_compra");
  const finP = periodo("p.enviado_em");
  const credP = periodo("ca.criado_em");

  const [itens, gastoMestres, finMestres, creditosMestres, meses, creditosMes, totalGasto, totalFin, totalCred] =
    await Promise.all([
    q(
      `SELECT i.descricao, COALESCE(cat.nome,'Sem categoria') AS categoria,
              sum(i.quantidade) AS quantidade, sum(i.subtotal) AS total
         FROM requisicao_itens i
         JOIN requisicoes r ON r.id=i.requisicao_id
         LEFT JOIN categorias cat ON cat.id=i.categoria_id
         ${reqP.where}
         GROUP BY i.descricao, cat.nome
         ORDER BY total DESC LIMIT 25`,
      reqP.params
    ),
    q(
      `SELECT r.mestre_id, u.nome, sum(c.valor_gasto) AS total, count(*)::int AS compras
         FROM compras c JOIN requisicoes r ON r.id=c.requisicao_id JOIN utilizadores u ON u.id=r.mestre_id
         ${gastoP.where}
         GROUP BY r.mestre_id, u.nome
         ORDER BY total DESC LIMIT 25`,
      gastoP.params
    ),
    q(
      `SELECT r.mestre_id, u.nome, sum(p.valor) AS total, count(*)::int AS envios
         FROM pagamentos p JOIN requisicoes r ON r.id=p.requisicao_id JOIN utilizadores u ON u.id=r.mestre_id
         ${finP.where}
         GROUP BY r.mestre_id, u.nome
         ORDER BY total DESC LIMIT 25`,
      finP.params
    ),
    q(
      `SELECT r.mestre_id, u.nome, sum(ca.valor) AS total, count(*)::int AS envios
         FROM creditos_aplicacoes ca
         JOIN requisicoes r ON r.id=ca.requisicao_id JOIN utilizadores u ON u.id=r.mestre_id
         ${credP.where}
         GROUP BY r.mestre_id, u.nome`,
      credP.params
    ),
    q(
      `SELECT to_char(p.enviado_em,'YYYY-MM') AS mes, sum(p.valor) AS total, count(*)::int AS envios
         FROM pagamentos p
         ${finP.where}
         GROUP BY mes ORDER BY mes`,
      finP.params
    ),
    q(
      `SELECT to_char(ca.criado_em,'YYYY-MM') AS mes, sum(ca.valor) AS total, count(*)::int AS envios
         FROM creditos_aplicacoes ca
         ${credP.where}
         GROUP BY mes ORDER BY mes`,
      credP.params
    ),
    q(`SELECT COALESCE(sum(c.valor_gasto),0) AS total FROM compras c ${gastoP.where}`, gastoP.params),
    q(`SELECT COALESCE(sum(p.valor),0) AS total FROM pagamentos p ${finP.where}`, finP.params),
    q(`SELECT COALESCE(sum(ca.valor),0) AS total FROM creditos_aplicacoes ca ${credP.where}`, credP.params),
  ]);

  const porMestre = {};
  for (const x of finMestres) porMestre[x.mestre_id] = { nome: x.nome, financiado: Number(x.total), gasto: 0 };
  for (const x of creditosMestres) {
    porMestre[x.mestre_id] = porMestre[x.mestre_id] || { nome: x.nome, financiado: 0, gasto: 0 };
    porMestre[x.mestre_id].financiado += Number(x.total);
  }
  for (const x of gastoMestres) {
    porMestre[x.mestre_id] = porMestre[x.mestre_id] || { nome: x.nome, financiado: 0, gasto: 0 };
    porMestre[x.mestre_id].gasto = Number(x.total);
  }
  const mestres = Object.values(porMestre).sort((a, b) => b.gasto - a.gasto);

  const mapaMeses = new Map();
  for (const m of meses) mapaMeses.set(m.mes, { mes: m.mes, total: Number(m.total), envios: m.envios });
  for (const m of creditosMes) {
    const atual = mapaMeses.get(m.mes) || { mes: m.mes, total: 0, envios: 0 };
    atual.total += Number(m.total);
    atual.envios += m.envios;
    mapaMeses.set(m.mes, atual);
  }
  const mesesCombinados = [...mapaMeses.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));

  return {
    itens,
    mestres,
    meses: mesesCombinados,
    totalEnviado: Number(totalFin[0].total) + Number(totalCred[0].total),
    totalGasto: Number(totalGasto[0].total),
    filtros: { de, ate },
  };
}
