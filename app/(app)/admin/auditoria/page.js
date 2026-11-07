import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { dt } from "@/lib/ui";

const POR_PAGINA = 50;

const limpar = (v) => String(v ?? "").trim().slice(0, 80);

// Só se mostram as primeiras chaves de cada detalhe; o resto fica em <details>.
const resumo = (det) => {
  if (!det || typeof det !== "object") return "—";
  return Object.keys(det).slice(0, 6).join(", ");
};

export default async function Auditoria({ searchParams }) {
  await exigir("admin");

  const filtro = {
    tabela: limpar(searchParams.tabela),
    operacao: limpar(searchParams.operacao),
    utilizador: limpar(searchParams.utilizador),
    de: limpar(searchParams.de),
    ate: limpar(searchParams.ate),
  };

  const params = [];
  const where = [];
  const add = (sql, valor) => {
    params.push(valor);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filtro.tabela) add("a.tabela=?", filtro.tabela);
  if (["insert", "update", "delete"].includes(filtro.operacao)) add("a.operacao=?", filtro.operacao);
  if (filtro.utilizador) add("u.nome ILIKE ?", `%${filtro.utilizador}%`);
  if (filtro.de) add("a.criado_em >= ?::date", filtro.de);
  if (filtro.ate) add("a.criado_em < (?::date + interval '1 day')", filtro.ate);

  const pagina = Math.max(1, Number(searchParams.pagina) || 1);
  params.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);

  const [rows, tabelas] = await Promise.all([
    q(
      `SELECT a.id, a.tabela, a.operacao, a.registro_id, a.detalhes, a.criado_em,
              u.nome AS utilizador, count(*) OVER()::int AS total
         FROM auditoria a LEFT JOIN utilizadores u ON u.id=a.utilizador_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY a.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    q("SELECT DISTINCT tabela FROM auditoria ORDER BY tabela"),
  ]);

  const total = rows[0]?.total || 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (mudancas = {}) => {
    const sp = new URLSearchParams();
    const valores = { ...filtro, pagina, ...mudancas };
    for (const [k, v] of Object.entries(valores)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return `/admin/auditoria${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <div className="linha">
        <h1>Auditoria</h1>
        <Link href="/admin" className="btn sec">Voltar à administração</Link>
      </div>
      <p className="mut">
        Cada inserção, alteração e remoção nas tabelas de negócio fica registada com o autor e a hora. Os
        registos não podem ser alterados pela aplicação.
      </p>

      <form method="get" className="card filtros">
        <select name="tabela" defaultValue={filtro.tabela} aria-label="Tabela">
          <option value="">Todas as tabelas</option>
          {tabelas.map((t) => (
            <option key={t.tabela} value={t.tabela}>{t.tabela}</option>
          ))}
        </select>
        <select name="operacao" defaultValue={filtro.operacao} aria-label="Operação">
          <option value="">Todas as operações</option>
          <option value="insert">Criação</option>
          <option value="update">Alteração</option>
          <option value="delete">Remoção</option>
        </select>
        <input name="utilizador" defaultValue={filtro.utilizador} placeholder="Quem fez" aria-label="Utilizador" />
        <input type="date" name="de" defaultValue={filtro.de} aria-label="De" />
        <input type="date" name="ate" defaultValue={filtro.ate} aria-label="Até" />
        <button className="pri">Filtrar</button>
        <Link href="/admin/auditoria" className="btn sec">Limpar</Link>
      </form>

      <p className="mut">
        {total} registo(s){paginas > 1 ? ` · página ${pagina} de ${paginas}` : ""}
      </p>

      <div className="card tabela">
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Quem</th><th>Tabela</th><th>Operação</th><th>Registo</th><th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="6" className="mut">Sem registos de auditoria no período.</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{dt(a.criado_em)}</td>
                <td>{a.utilizador || <span className="mut">sistema</span>}</td>
                <td>{a.tabela}</td>
                <td>{a.operacao}</td>
                <td>{a.registro_id ?? "—"}</td>
                <td className="pequeno">
                  {a.detalhes ? (
                    <details>
                      <summary>{resumo(a.detalhes)}</summary>
                      <pre className="json">{JSON.stringify(a.detalhes, null, 2)}</pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
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
