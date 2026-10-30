import Link from "next/link";
import { exigir } from "@/lib/auth";
import { Badge, ESTADOS, MT, dt } from "@/lib/ui";
import { dadosRelatorioRequisicoes, URGENCIAS } from "@/lib/relatorios";
import Btn from "@/components/Btn";

const POR_PAGINA = 50;

const queryString = (obj) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v) qs.set(k, Array.isArray(v) ? v[0] : v);
  const s = qs.toString();
  return s ? `?${s}` : "";
};

export default async function RelatorioRequisicoes({ searchParams }) {
  const s = await exigir("admin", "financeiro", "aprovador");
  const pagina = Math.max(1, Number(searchParams.pagina) || 1);
  const { rows, n, total, sites, filtros, paginas } = await dadosRelatorioRequisicoes(searchParams, s.perfil, {
    limite: POR_PAGINA,
    offset: (pagina - 1) * POR_PAGINA,
  });
  const { estado, de, ate, mestre, site, urgencia, texto } = filtros;
  const pdf = `/api/relatorios/requisicoes/pdf${queryString(filtros)}`;
  const csv = `/api/relatorios/requisicoes/csv${queryString(filtros)}`;
  const linkPagina = (p) => `/relatorios/requisicoes${queryString({ ...filtros, pagina: p })}`;

  return (
    <>
      <div className="linha">
        <h1>Relatório de requisições</h1>
        <div className="acoes">
          <a href={pdf} className="btn pri" target="_blank" rel="noreferrer">Gerar PDF</a>
          <a href={csv} className="btn sec">Exportar CSV</a>
          <Link href="/relatorios/financeiro" className="btn sec">Relatório financeiro</Link>
        </div>
      </div>

      <form method="get" className="card">
        <div className="item">
          <div><label>Estado</label>
            <select name="estado" defaultValue={estado || ""}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label>Urgência</label>
            <select name="urgencia" defaultValue={urgencia || ""}>
              <option value="">Todas</option>
              {Object.entries(URGENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label>De</label><input type="date" name="de" defaultValue={de || ""} /></div>
          <div><label>Até</label><input type="date" name="ate" defaultValue={ate || ""} /></div>
        </div>
        <div className="item">
          <div><label>Mestre</label><input name="mestre" defaultValue={mestre || ""} placeholder="Nome do mestre" /></div>
          <div><label>Site</label>
            <select name="site" defaultValue={site || ""}>
              <option value="">Todos</option>
              {sites.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </div>
          <div><label>Código / justificação</label><input name="texto" defaultValue={texto || ""} placeholder="REQ-… ou texto" /></div>
        </div>
        <Btn className="pri">Pesquisar</Btn>
        <Link href="/relatorios/requisicoes" className="btn sec">Limpar</Link>
      </form>

      <div className="card">
        <b>Resultados:</b> {n} requisição(ões) · <b>Valor estimado total:</b> {MT(total)}
        {paginas > 1 && <span className="mut"> · página {pagina} de {paginas}</span>}
      </div>

      <div className="card tabela">
        <table>
          <thead>
            <tr><th>Código</th><th>Mestre</th><th>Site</th><th>Valor</th><th>Urgência</th><th>Estado</th><th>Data</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="mut">Nenhuma requisição corresponde aos critérios.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/requisicoes/${r.id}`}>{r.codigo}</Link></td>
                <td>{r.mestre}</td>
                <td>{r.site}</td>
                <td>{MT(r.valor_estimado)}</td>
                <td>{URGENCIAS[r.urgencia] || r.urgencia}</td>
                <td><Badge estado={r.estado} /></td>
                <td>{dt(r.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="paginacao">
          {pagina > 1 && <Link href={linkPagina(pagina - 1)} className="btn sec">← Anterior</Link>}
          <span className="mut">Página {pagina} de {paginas}</span>
          {pagina < paginas && <Link href={linkPagina(pagina + 1)} className="btn sec">Seguinte →</Link>}
        </div>
      )}
    </>
  );
}
