import Link from "next/link";
import { exigir } from "@/lib/auth";
import { MT } from "@/lib/ui";
import { dadosRelatorioProjetos } from "@/lib/relatorios";
import Btn from "@/components/Btn";

export default async function RelatorioProjetos({ searchParams }) {
  await exigir("admin", "financeiro", "aprovador");
  const { de, ate } = searchParams;
  const qs = new URLSearchParams();
  if (de) qs.set("de", de);
  if (ate) qs.set("ate", ate);

  const rows = await dadosRelatorioProjetos({ de, ate });

  const totalOrcamento = rows.reduce((a, r) => a + r.orcamento_total, 0);
  const totalSolicitado = rows.reduce((a, r) => a + r.solicitado, 0);
  const totalAprovado = rows.reduce((a, r) => a + r.aprovado, 0);
  const totalTransferido = rows.reduce((a, r) => a + r.transferido, 0);
  const totalComprovado = rows.reduce((a, r) => a + r.comprovado, 0);

  return (
    <>
      <h1>Relatório por projecto</h1>
      <div className="linha">
        <div className="acoes">
          <Link href={`/relatorios/projetos${qs.toString() ? `?${qs}` : ""}`} className="btn sec">Limpar</Link>
        </div>
      </div>

      <form method="get" className="card inline">
        <input type="date" name="de" defaultValue={de || ""} aria-label="De" />
        <input type="date" name="ate" defaultValue={ate || ""} aria-label="Até" />
        <Btn className="pri">Filtrar</Btn>
      </form>

      <div className="card">
        <b>Orçamento total:</b> {MT(totalOrcamento)} ·{" "}
        <b>Solicitado:</b> {MT(totalSolicitado)} · <b>Aprovado:</b> {MT(totalAprovado)} ·{" "}
        <b>Transferido:</b> {MT(totalTransferido)} · <b>Comprovado:</b> {MT(totalComprovado)} ·{" "}
        <b>Saldo:</b> {MT(totalTransferido - totalComprovado)}
      </div>

      <div className="card tabela">
        <table>
          <thead>
            <tr>
              <th>Projecto</th><th>Área</th><th>Orçamento</th><th>Solicitado</th><th>Aprovado</th>
              <th>Transferido</th><th>Comprovado</th><th>Saldo</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="9" className="mut">Sem projectos no período.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.codigo} — {r.nome}</td>
                <td>{r.area || "—"}</td>
                <td>{MT(r.orcamento_total)}</td>
                <td>{MT(r.solicitado)}</td>
                <td>{MT(r.aprovado)}</td>
                <td>{MT(r.transferido)}</td>
                <td>{MT(r.comprovado)}</td>
                <td className={r.saldo < 0 ? "erro" : ""}>{MT(r.saldo)}</td>
                <td>{r.activo ? "Activo" : "Inactivo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
