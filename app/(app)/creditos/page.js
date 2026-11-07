import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { MT, dt } from "@/lib/ui";

const limpar = (v) => String(v ?? "").trim().slice(0, 120);

export default async function Creditos({ searchParams }) {
  const s = await exigir();
  const deMestre = s.perfil === "mestre";
  const filtroMestre = deMestre ? String(s.id) : limpar(searchParams.mestre);
  const filtroSite = limpar(searchParams.site);

  const params = [];
  const where = [];
  const add = (sql, valor) => {
    params.push(valor);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (deMestre) add("c.mestre_id=?", s.id);
  else if (filtroMestre) add("u.nome ILIKE ?", `%${filtroMestre}%`);
  if (filtroSite) add("c.site_id=?", Number(filtroSite));

  const [rows, sites, resumo] = await Promise.all([
    q(
      `SELECT c.*, r.codigo AS origem, u.nome AS mestre, st.nome AS site,
              (c.valor - c.valor_usado) AS disponivel,
              (SELECT count(*)::int FROM creditos_aplicacoes ca WHERE ca.credito_id=c.id) AS usos
         FROM creditos_abatimento c
         JOIN requisicoes r ON r.id=c.requisicao_origem_id
         JOIN utilizadores u ON u.id=c.mestre_id
         JOIN sites st ON st.id=c.site_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY (c.valor - c.valor_usado) DESC, c.criado_em DESC`,
      params
    ),
    q("SELECT id, nome FROM sites WHERE activo ORDER BY nome"),
    q(
      `SELECT COALESCE(sum(valor),0) AS total,
              COALESCE(sum(valor_usado),0) AS usado,
              COALESCE(sum(valor - valor_usado),0) AS disponivel
         FROM creditos_abatimento c
         JOIN utilizadores u ON u.id=c.mestre_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}`,
      params
    ),
  ]);

  const totais = resumo[0] || { total: 0, usado: 0, disponivel: 0 };

  return (
    <>
      <div className="linha">
        <h1>{deMestre ? "O meu saldo abatido" : "Saldo abatido"}</h1>
        <Link href="/requisicoes" className="btn sec">Ver requisições</Link>
      </div>
      <p className="mut">
        Saldo devolvido pelo financeiro fica como crédito para a próxima requisição do mesmo mestre e site. É
        aplicado automaticamente quando submete uma requisição, até ao valor estimado.
      </p>

      <div className="card">
        <b>Disponível:</b> {MT(totais.disponivel)} · <b>Já aplicado:</b> {MT(totais.usado)} ·{" "}
        <b>Total recebido:</b> {MT(totais.total)}
      </div>

      {!deMestre && (
        <form method="get" className="card filtros">
          <input name="mestre" defaultValue={filtroMestre} placeholder="Mestre" aria-label="Mestre" />
          <select name="site" defaultValue={filtroSite} aria-label="Site">
            <option value="">Todos os sites</option>
            {sites.map((x) => (
              <option key={x.id} value={x.id}>{x.nome}</option>
            ))}
          </select>
          <button className="pri">Filtrar</button>
          <Link href="/creditos" className="btn sec">Limpar</Link>
        </form>
      )}

      <div className="card tabela">
        <table>
          <thead>
            <tr>
              <th>Origem</th>
              <th>Mestre</th>
              <th>Site</th>
              <th>Valor</th>
              <th>Aplicado</th>
              <th>Disponível</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan="7" className="mut">
                  Sem saldo abatido. Quando o financeiro fechar uma requisição com saldo a abater, aparece aqui.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const disponivel = Number(c.disponivel);
              return (
                <tr key={c.id}>
                  <td><Link href={`/requisicoes/${c.requisicao_origem_id}`}>{c.origem}</Link></td>
                  <td>{c.mestre}</td>
                  <td>{c.site}</td>
                  <td>{MT(c.valor)}</td>
                  <td>
                    {MT(c.valor_usado)}
                    {c.usos > 0 ? <span className="mut pequeno"> · {c.usos} uso(s)</span> : null}
                  </td>
                  <td className={disponivel > 0 ? "" : "mut"}>{MT(disponivel)}</td>
                  <td>{dt(c.criado_em)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mut pequeno">
        O crédito aplicado a uma requisição cancelada ou reprovada volta automaticamente a ficar disponível.
      </p>
    </>
  );
}
