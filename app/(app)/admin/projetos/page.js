import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { criarProjeto, actualizarProjeto, alternarProjeto } from "@/app/actions";
import { MT, dt } from "@/lib/ui";
import Btn from "@/components/Btn";

const ERROS = { dados: "Preencha nome e orçamento válidos." };
const OK = { projeto: "Projecto guardado.", toggle: "Estado actualizado." };

export default async function Projetos({ searchParams }) {
  await exigir("admin");
  const [areas, projetos] = await Promise.all([
    q("SELECT * FROM areas ORDER BY nome"),
    q(
      `SELECT p.*, a.nome AS area
         FROM projetos p LEFT JOIN areas a ON a.id=p.area_id
         ORDER BY p.nome`
    ),
  ]);

  const editarId = searchParams.editar ? Number(searchParams.editar) : null;
  const projeto = editarId
    ? await q1("SELECT * FROM projetos WHERE id=$1", [editarId])
    : null;

  return (
    <>
      <h1>Projectos e orçamentos</h1>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}
      {searchParams.ok && <p className="aviso">{OK[searchParams.ok] || "Guardado."}</p>}

      <div className="card">
        <h2>{projeto ? "Editar projecto" : "Novo projecto"}</h2>
        <form action={projeto ? actualizarProjeto : criarProjeto} className="card inline">
          {projeto && <input type="hidden" name="id" value={projeto.id} />}
          <label>Nome</label>
          <input name="nome" required defaultValue={projeto?.nome || ""} />
          <div className="item">
            <div>
              <label>Área</label>
              <select name="area_id">
                <option value="">—</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
            <div>
              <label>Orçamento total (MZN)</label>
              <input name="orcamento_total" type="number" step="0.01" min="0" required defaultValue={projeto?.orcamento_total || ""} />
            </div>
            <label>
              <input name="activo" type="checkbox" defaultChecked={projeto?.activo !== false} /> Activo
            </label>
            <Btn className="pri">{projeto ? "Actualizar" : "Criar"}</Btn>
            {projeto && (
              <Link href="/admin/projetos" className="btn sec">Cancelar</Link>
            )}
          </div>
        </form>
      </div>

      <h2>Projectos</h2>
      <div className="card tabela">
        <table>
          <thead>
            <tr>
              <th>Código</th><th>Nome</th><th>Área</th><th>Orçamento</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {projetos.length === 0 && <tr><td colSpan="6" className="mut">Sem projectos.</td></tr>}
            {projetos.map((p) => (
              <tr key={p.id}>
                <td>{p.codigo}</td>
                <td>{p.nome}</td>
                <td>{p.area || "—"}</td>
                <td>{MT(p.orcamento_total)}</td>
                <td>{p.activo ? "Activo" : "Inactivo"}</td>
                <td>
                  <Link href={`/admin/projetos?editar=${p.id}`} className="link">Editar</Link>
                  {" · "}
                  <form action={alternarProjeto} style={{ display: "inline" }}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="link">{p.activo ? "Desactivar" : "Activar"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
