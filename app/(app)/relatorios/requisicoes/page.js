import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { Badge, ESTADOS, MT, dt } from "@/lib/ui";
import Btn from "@/components/Btn";

const URGENCIAS = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };

export default async function RelatorioRequisicoes({ searchParams }) {
  const s = await exigir("admin", "financeiro", "aprovador");
  const { estado, de, ate, mestre, site, urgencia, texto } = searchParams;

  const params = [];
  const where = [];
  if (s.perfil === "mestre") { params.push(s.id); where.push(`r.mestre_id=$${params.length}`); }
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
         ${filtro} ORDER BY r.criado_em DESC LIMIT 500`,
      params
    ),
    q(
      `SELECT count(*)::int AS n, COALESCE(sum(r.valor_estimado),0) AS total
         FROM requisicoes r JOIN utilizadores u ON u.id=r.mestre_id JOIN sites st ON st.id=r.site_id ${filtro}`,
      params
    ),
    q("SELECT id, nome FROM sites ORDER BY nome"),
    q("SELECT u.id, u.nome FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE p.nome='mestre' ORDER BY u.nome"),
  ]);
  const { n, total } = resumo[0];

  return (
    <>
      <div className="linha">
        <h1>Relatório de requisições</h1>
        <Link href="/relatorios/financeiro" className="btn sec">Relatório financeiro</Link>
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
    </>
  );
}
