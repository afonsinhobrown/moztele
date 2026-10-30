import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { Badge, ESTADOS, MT, dt } from "@/lib/ui";
import { prazo, rotuloPrazo } from "@/lib/prazos";

const POR_PAGINA = 20;

const limpar = (v) => String(v ?? "").trim().slice(0, 120);

export default async function Lista({ searchParams }) {
  const s = await exigir();
  const pedido = {
    estado: limpar(searchParams.estado),
    q: limpar(searchParams.q),
    site: limpar(searchParams.site),
    mestre: limpar(searchParams.mestre),
    de: limpar(searchParams.de),
    ate: limpar(searchParams.ate),
  };
  let filtro = pedido.estado;
  if (!filtro && s.perfil === "aprovador") filtro = "submetido";
  if (filtro === "todos" || !ESTADOS[filtro]) filtro = "";

  const params = [];
  const where = [];
  const add = (sql, valor) => {
    params.push(valor);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };

  if (s.perfil === "mestre") add("r.mestre_id=?", s.id);
  if (s.perfil === "aprovador" && s.area_id) add("st.area_id=?", s.area_id);
  if (filtro) add("r.estado=?", filtro);
  if (pedido.q) add("(r.codigo ILIKE ? OR r.justificacao ILIKE ? OR u.nome ILIKE ?)", `%${pedido.q}%`);
  if (pedido.site) add("r.site_id=?", Number(pedido.site));
  if (pedido.mestre) add("u.nome ILIKE ?", `%${pedido.mestre}%`);
  if (pedido.de) add("r.criado_em >= ?::date", pedido.de);
  if (pedido.ate) add("r.criado_em < (?::date + interval '1 day')", pedido.ate);

  // Fila do aprovador: não mostrar o que ele já votou nesta submissão.
  if (s.perfil === "aprovador" && filtro === "submetido") {
    params.push(s.id);
    where.push(`NOT EXISTS (
      SELECT 1 FROM aprovacoes a
       WHERE a.requisicao_id = r.id AND a.aprovador_id = $${params.length}
         AND a.decidido_em > COALESCE((SELECT max(h.criado_em) FROM historico_estados h
                                        WHERE h.requisicao_id = r.id AND h.estado_novo='submetido'),'-infinity'))`);
  }

  const pagina = Math.max(1, Number(searchParams.pagina) || 1);
  params.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);
  const rows = await q(
    `SELECT r.id, r.codigo, r.valor_estimado, r.urgencia, r.estado, r.criado_em, r.actualizado_em,
            u.nome AS mestre, st.nome AS site, count(*) OVER()::int AS total
       FROM requisicoes r
       JOIN utilizadores u ON u.id=r.mestre_id
       JOIN sites st ON st.id=r.site_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY r.criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const total = rows[0]?.total || 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const sites = await q("SELECT id, nome FROM sites WHERE activo ORDER BY nome");

  const link = (mudancas = {}) => {
    const sp = new URLSearchParams();
    const valores = { ...pedido, estado: filtro, pagina, ...mudancas };
    for (const [k, v] of Object.entries(valores)) if (v) sp.set(k, v);
    return `/requisicoes?${sp.toString()}`;
  };

  return (
    <>
      <div className="linha">
        <h1>Requisições</h1>
        <div className="acoes">
          {s.perfil === "mestre" && (
            <Link href="/requisicoes/nova" className="btn pri">
              + Nova requisição
            </Link>
          )}
          {["admin", "financeiro", "aprovador"].includes(s.perfil) && (
            <a
              href={`/api/relatorios/requisicoes/csv?${new URLSearchParams(
                Object.fromEntries(Object.entries({ ...pedido, estado: filtro }).filter(([, v]) => v))
              )}`}
              className="btn sec"
            >
              Exportar CSV
            </a>
          )}
        </div>
      </div>

      <div className="chips">
        <Link href={link({ estado: "", pagina: 1 })} className={!filtro ? "on" : ""}>
          Todas
        </Link>
        {Object.entries(ESTADOS).map(([k, v]) => (
          <Link key={k} href={link({ estado: k, pagina: 1 })} className={filtro === k ? "on" : ""}>
            {v}
          </Link>
        ))}
      </div>

      <form method="get" className="card filtros">
        <input name="q" defaultValue={pedido.q} placeholder="Código, justificação ou mestre" aria-label="Pesquisar" />
        <select name="site" defaultValue={pedido.site} aria-label="Site">
          <option value="">Todos os sites</option>
          {sites.map((x) => (
            <option key={x.id} value={x.id}>{x.nome}</option>
          ))}
        </select>
        {s.perfil !== "mestre" && <input name="mestre" defaultValue={pedido.mestre} placeholder="Mestre" aria-label="Mestre" />}
        <input type="date" name="de" defaultValue={pedido.de} aria-label="De" />
        <input type="date" name="ate" defaultValue={pedido.ate} aria-label="Até" />
        {filtro && <input type="hidden" name="estado" value={filtro} />}
        <button className="pri">Filtrar</button>
        <Link href="/requisicoes" className="btn sec">Limpar</Link>
      </form>

      <p className="mut">
        {total} requisição(ões){paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}
      </p>

      <div className="card tabela">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Mestre</th><th>Site</th><th>Valor</th><th>Urgência</th><th>Estado</th><th>Parada</th><th>Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="8" className="mut">Nada por aqui.</td></tr>
            )}
            {rows.map((r) => {
              const p = prazo(r.estado, r.actualizado_em);
              return (
                <tr key={r.id}>
                  <td><Link href={`/requisicoes/${r.id}`}>{r.codigo}</Link></td>
                  <td>{r.mestre}</td>
                  <td>{r.site}</td>
                  <td>{MT(r.valor_estimado)}</td>
                  <td>{r.urgencia}</td>
                  <td><Badge estado={r.estado} /></td>
                  <td>{p ? <span className={`prazo ${p.nivel}`} title={`${rotuloPrazo(p.nivel)} · ${p.acao}`}>{p.dias}d</span> : <span className="mut">—</span>}</td>
                  <td>{dt(r.criado_em)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="paginacao">
          {pagina > 1 && <Link href={link({ pagina: pagina - 1 })} className="btn sec">← Anterior</Link>}
          <span className="mut">Página {pagina} de {paginas}</span>
          {pagina < paginas && <Link href={link({ pagina: pagina + 1 })} className="btn sec">Seguinte →</Link>}
        </div>
      )}
    </>
  );
}
