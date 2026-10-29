import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { MT } from "@/lib/ui";
import Btn from "@/components/Btn";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const nomeMes = (ym) => {
  const [ano, mes] = String(ym).split("-");
  return `${MESES[Number(mes) - 1]} ${ano}`;
};

export default async function RelatorioFinanceiro({ searchParams }) {
  await exigir("admin", "financeiro");
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

  const [itens, gastoMestres, finMestres, meses, totalGasto, totalFin] = await Promise.all([
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
      `SELECT to_char(p.enviado_em,'YYYY-MM') AS mes, sum(p.valor) AS total, count(*)::int AS envios
         FROM pagamentos p
         ${finP.where}
         GROUP BY mes ORDER BY mes`,
      finP.params
    ),
    q(`SELECT COALESCE(sum(c.valor_gasto),0) AS total FROM compras c ${gastoP.where}`, gastoP.params),
    q(`SELECT COALESCE(sum(p.valor),0) AS total FROM pagamentos p ${finP.where}`, finP.params),
  ]);

  const porMestre = {};
  for (const x of finMestres) porMestre[x.mestre_id] = { nome: x.nome, financiado: Number(x.total), gasto: 0 };
  for (const x of gastoMestres) {
    porMestre[x.mestre_id] = porMestre[x.mestre_id] || { nome: x.nome, financiado: 0, gasto: 0 };
    porMestre[x.mestre_id].gasto = Number(x.total);
  }
  const mestres = Object.values(porMestre).sort((a, b) => b.gasto - a.gasto);
  const maxMes = Math.max(1, ...meses.map((m) => Number(m.total)));
  const totalEnviado = Number(totalFin[0].total);
  const totalGastoV = Number(totalGasto[0].total);

  return (
    <>
      <div className="linha">
        <h1>Relatório financeiro</h1>
        <Link href="/relatorios/requisicoes" className="btn sec">Relatório de requisições</Link>
      </div>

      <form method="get" className="card inline">
        <input type="date" name="de" defaultValue={de || ""} aria-label="De" />
        <input type="date" name="ate" defaultValue={ate || ""} aria-label="Até" />
        <Btn className="pri">Filtrar</Btn>
        <Link href="/relatorios/financeiro" className="btn sec">Limpar</Link>
      </form>

      <div className="card">
        <b>Financiado (enviado):</b> {MT(totalEnviado)} · <b>Gasto em compras:</b> {MT(totalGastoV)} ·{" "}
        <b>Saldo:</b> {MT(totalEnviado - totalGastoV)}
      </div>

      <h2>Itens que mais consumiram dinheiro</h2>
      <div className="card tabela">
        <table>
          <thead><tr><th>Item</th><th>Categoria</th><th>Quantidade</th><th>Valor</th></tr></thead>
          <tbody>
            {itens.length === 0 && <tr><td colSpan="4" className="mut">Sem dados no período.</td></tr>}
            {itens.map((i, k) => (
              <tr key={k}><td>{i.descricao}</td><td>{i.categoria}</td><td>{Number(i.quantidade)}</td><td>{MT(i.total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Mestres que mais consumiram</h2>
      <div className="card tabela">
        <table>
          <thead><tr><th>Mestre</th><th>Financiado</th><th>Gasto</th><th>Saldo</th></tr></thead>
          <tbody>
            {mestres.length === 0 && <tr><td colSpan="4" className="mut">Sem dados no período.</td></tr>}
            {mestres.map((m, k) => (
              <tr key={k}><td>{m.nome}</td><td>{MT(m.financiado)}</td><td>{MT(m.gasto)}</td><td>{MT(m.financiado - m.gasto)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Variação dos financiamentos por mês</h2>
      <div className="card">
        {meses.length === 0 && <p className="mut">Sem envios no período.</p>}
        {meses.map((m) => (
          <div key={m.mes} className="barra-linha">
            <span className="barra-mes">{nomeMes(m.mes)}</span>
            <span className="barra">
              <span className="barra-fill" style={{ width: `${(Number(m.total) / maxMes) * 100}%` }} />
            </span>
            <span className="barra-valor">{MT(m.total)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
