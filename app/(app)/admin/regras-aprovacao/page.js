import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { criarRegraAprovacao, actualizarRegraAprovacao, removerRegraAprovacao } from "@/app/actions";
import { MT } from "@/lib/ui";
import Btn from "@/components/Btn";

const ERROS = { dados: "Preencha os valores corretamente (máximo deve ser maior que o mínimo)." };
const OK = { regra: "Regra guardada.", removido: "Regra removida." };

export default async function RegrasAprovacao({ searchParams }) {
  await exigir("admin");
  const [regras] = await Promise.all([
    q("SELECT * FROM regras_aprovacao ORDER BY valor_min"),
  ]);

  const editarId = searchParams.editar ? Number(searchParams.editar) : null;
  const regra = editarId ? await q1("SELECT * FROM regras_aprovacao WHERE id=$1", [editarId]) : null;

  return (
    <>
      <h1>Regras de aprovação por valor</h1>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}
      {searchParams.ok && <p className="aviso">{OK[searchParams.ok] || "Guardado."}</p>}

      <div className="card inline">
        <h2>{regra ? "Editar regra" : "Nova regra"}</h2>
        <form action={regra ? actualizarRegraAprovacao : criarRegraAprovacao} className="card">
          {regra && <input type="hidden" name="id" value={regra.id} />}
          <div className="item">
            <div>
              <label>Valor mínimo (MZN)</label>
              <input name="valor_min" type="number" step="0.01" min="0" required defaultValue={regra?.valor_min ?? ""} />
            </div>
            <div>
              <label>Valor máximo (MZN)</label>
              <input name="valor_max" type="number" step="0.01" min="0" defaultValue={regra?.valor_max ?? ""} />
              <p className="mut pequeno">Deixe vazio para não haver limite superior.</p>
            </div>
            <div>
              <label>Aprovadores necessários</label>
              <input name="aprovadores_necessarios" type="number" min="1" required defaultValue={regra?.aprovadores_necessarios ?? 1} />
            </div>
          </div>
          <Btn className="pri">{regra ? "Actualizar" : "Criar"}</Btn>
          {regra && <Link href="/admin/regras-aprovacao" className="btn sec">Cancelar</Link>}
        </form>
      </div>

      <h2>Regras</h2>
      <div className="card tabela">
        <table>
          <thead>
            <tr><th>De</th><th>Até</th><th>Aprovadores necessários</th><th></th></tr>
          </thead>
          <tbody>
            {regras.length === 0 && <tr><td colSpan="4" className="mut">Sem regras.</td></tr>}
            {regras.map((r) => (
              <tr key={r.id}>
                <td>{MT(r.valor_min)}</td>
                <td>{r.valor_max === null ? "Sem limite" : MT(r.valor_max)}</td>
                <td>{r.aprovadores_necessarios}</td>
                <td>
                  <Link href={`/admin/regras-aprovacao?editar=${r.id}`} className="link">Editar</Link>
                  {" · "}
                  <form action={removerRegraAprovacao} style={{ display: "inline" }} onSubmit={(e) => { if (!confirm("Remover esta regra?")) e.preventDefault(); }}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="link">Remover</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mut pequeno">
        Exemplo: 0–50.000 MZN = 1 aprovador; acima de 50.000 MZN = 2 aprovadores. A regra com o maior
        valor_min que se aplique ao orçamento da requisição é usada.
      </p>
    </>
  );
}
