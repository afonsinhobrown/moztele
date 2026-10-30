import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { MT } from "@/lib/ui";
import { apagarModelo, apagarFavorito } from "@/app/actions";
import Btn from "@/components/Btn";

export const metadata = { title: "Modelos e favoritos · Moz Teles" };

export default async function Modelos({ searchParams }) {
  const s = await exigir("mestre");
  const [modelos, favoritos] = await Promise.all([
    q(
      `SELECT m.*, u.nome AS mestre
         FROM modelos_requisicao m JOIN utilizadores u ON u.id = m.mestre_id
        WHERE m.mestre_id = $1 OR m.partilhado
        ORDER BY m.criado_em DESC`,
      [s.id]
    ),
    q(
      `SELECT f.*, c.nome AS categoria
         FROM itens_favoritos f LEFT JOIN categorias c ON c.id = f.categoria_id
        WHERE f.mestre_id = $1
        ORDER BY f.descricao`,
      [s.id]
    ),
  ]);

  return (
    <>
      <div className="linha">
        <h1>Modelos e favoritos</h1>
        <Link href="/requisicoes/nova" className="btn pri">+ Nova requisição</Link>
      </div>

      {searchParams.ok && (
        <p className="aviso">
          {searchParams.ok === "modelo" ? "Modelo guardado." : "Registo apagado."}
        </p>
      )}

      <p className="mut">
        Os modelos guardam um orçamento completo (itens + justificação) para reutilizar. Os favoritos são materiais
        que usa muitas vezes e que pode adicionar a qualquer orçamento com um clique.
      </p>

      <h2>Modelos</h2>
      {modelos.length === 0 && (
        <p className="card mut">
          Ainda não tem modelos. Abra uma requisição e use <b>Guardar como modelo</b> para criar o primeiro.
        </p>
      )}
      <div className="modelos">
        {modelos.map((m) => {
          const itens = Array.isArray(m.itens) ? m.itens : [];
          const total = itens.reduce(
            (t, i) => t + Number(i.quantidade || 0) * Number(i.preco_unitario || 0),
            0
          );
          return (
            <article className="modelo-card" key={m.id}>
              <div className="linha">
                <h3>{m.nome}</h3>
                {String(m.mestre_id) === String(s.id) ? (
                  <span className="badge">meu</span>
                ) : (
                  <span className="badge b-aprovado">partilhado</span>
                )}
              </div>
              <p className="mut pequeno">
                {itens.length} item(ns) · {MT(total)}
                {String(m.mestre_id) !== String(s.id) ? ` · de ${m.mestre}` : ""}
              </p>
              <ul className="lista-modelo">
                {itens.slice(0, 3).map((i, k) => (
                  <li key={k}>{i.descricao} — {Number(i.quantidade)} {i.unidade}</li>
                ))}
                {itens.length > 3 && <li className="mut">e mais {itens.length - 3}…</li>}
              </ul>
              <div className="acoes">
                <Link href={`/requisicoes/nova?modelo=${m.id}`} className="btn pri">Usar modelo</Link>
                {String(m.mestre_id) === String(s.id) && (
                  <form action={apagarModelo}>
                    <input type="hidden" name="id" value={m.id} />
                    <Btn className="sec">Apagar</Btn>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <h2>Favoritos</h2>
      {favoritos.length === 0 && (
        <p className="card mut">
          Sem favoritos. Na requisição, toque na estrela ao lado de um item para o guardar aqui.
        </p>
      )}
      {favoritos.length > 0 && (
        <div className="card tabela">
          <table>
            <thead><tr><th>Material</th><th>Categoria</th><th>Unidade</th><th>Preço unit.</th><th></th></tr></thead>
            <tbody>
              {favoritos.map((f) => (
                <tr key={f.id}>
                  <td>{f.descricao}</td>
                  <td>{f.categoria || "—"}</td>
                  <td>{f.unidade}</td>
                  <td>{MT(f.preco_unitario)}</td>
                  <td>
                    <form action={apagarFavorito}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="link">Remover</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
