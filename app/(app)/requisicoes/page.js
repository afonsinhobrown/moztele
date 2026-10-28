import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { Badge, ESTADOS, MT, dt } from "@/lib/ui";

export default async function Lista({ searchParams }) {
  const s = await exigir();
  let filtro = searchParams.estado;
  if (filtro === undefined && s.perfil === "aprovador") filtro = "submetido";
  if (!ESTADOS[filtro]) filtro = "";

  const params = [];
  const where = [];
  if (s.perfil === "mestre") { params.push(s.id); where.push(`r.mestre_id=$${params.length}`); }
  if (filtro) { params.push(filtro); where.push(`r.estado=$${params.length}`); }

  const rows = await q(
    `SELECT r.id, r.codigo, r.valor_estimado, r.urgencia, r.estado, r.criado_em, u.nome AS mestre, st.nome AS site
       FROM requisicoes r JOIN utilizadores u ON u.id=r.mestre_id JOIN sites st ON st.id=r.site_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY r.criado_em DESC LIMIT 200`,
    params
  );

  return (
    <>
      <div className="linha">
        <h1>Requisições</h1>
        {s.perfil === "mestre" && <Link href="/requisicoes/nova" className="btn pri">+ Nova requisição</Link>}
      </div>
      <div className="chips">
        <Link href="/requisicoes?estado=todos" className={!filtro ? "on" : ""}>Todas</Link>
        {Object.entries(ESTADOS).map(([k, v]) => (
          <Link key={k} href={`/requisicoes?estado=${k}`} className={filtro === k ? "on" : ""}>{v}</Link>
        ))}
      </div>
      <div className="card tabela">
        <table>
          <thead>
            <tr><th>Código</th><th>Mestre</th><th>Site</th><th>Valor</th><th>Urgência</th><th>Estado</th><th>Data</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="mut">Nada por aqui.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/requisicoes/${r.id}`}>{r.codigo}</Link></td>
                <td>{r.mestre}</td>
                <td>{r.site}</td>
                <td>{MT(r.valor_estimado)}</td>
                <td>{r.urgencia}</td>
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
