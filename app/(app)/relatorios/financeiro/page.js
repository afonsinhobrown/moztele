import Link from "next/link";
import { exigir } from "@/lib/auth";
import { MT } from "@/lib/ui";
import { dadosRelatorioFinanceiro } from "@/lib/relatorios";
import Btn from "@/components/Btn";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const nomeMes = (ym) => {
  const [ano, mes] = String(ym).split("-");
  return `${MESES[Number(mes) - 1]} ${ano}`;
};

export default async function RelatorioFinanceiro({ searchParams }) {
  await exigir("admin", "financeiro");
  const { de, ate } = searchParams;
  const { itens, mestres, meses, totalEnviado, totalGasto } = await dadosRelatorioFinanceiro(searchParams);

  const qs = new URLSearchParams();
  if (de) qs.set("de", de);
  if (ate) qs.set("ate", ate);
  const pdf = `/api/relatorios/financeiro/pdf${qs.toString() ? `?${qs}` : ""}`;
  const csv = `/api/relatorios/financeiro/csv${qs.toString() ? `?${qs}` : ""}`;
  const maxMes = Math.max(1, ...meses.map((m) => Number(m.total)));

  return (
    <>
      <div className="linha">
        <h1>Relatório financeiro</h1>
        <div className="acoes">
          <a href={pdf} className="btn pri" target="_blank" rel="noreferrer">Gerar PDF</a>
          <a href={csv} className="btn sec">Exportar CSV</a>
          <Link href="/relatorios/requisicoes" className="btn sec">Relatório de requisições</Link>
        </div>
      </div>

      <form method="get" className="card inline">
        <input type="date" name="de" defaultValue={de || ""} aria-label="De" />
        <input type="date" name="ate" defaultValue={ate || ""} aria-label="Até" />
        <Btn className="pri">Filtrar</Btn>
        <Link href="/relatorios/financeiro" className="btn sec">Limpar</Link>
      </form>

      <div className="card">
        <b>Financiado (enviado):</b> {MT(totalEnviado)} · <b>Gasto em compras:</b> {MT(totalGasto)} ·{" "}
        <b>Saldo:</b> {MT(totalEnviado - totalGasto)}
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
