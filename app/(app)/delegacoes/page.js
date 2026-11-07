import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { dt } from "@/lib/ui";
import { delegarAprovacao, cancelarDelegacao } from "@/app/actions";
import Btn from "@/components/Btn";

const ERROS = {
  dados: "Escolha um colega diferente de si.",
  perfil: "Só é possível delegar a outro aprovador activo.",
  data: "O fim da delegação tem de ser no futuro.",
};

const OK = {
  delegado: "Delegação criada. O colega foi avisado.",
  cancelada: "Delegação cancelada.",
};

const ativa = (d) =>
  !d.cancelada_em && new Date(d.inicio) <= new Date() && new Date(d.fim) >= new Date();

export default async function Delegacoes({ searchParams }) {
  const s = await exigir("aprovador", "admin");

  const [colegas, dadas, recebidas] = await Promise.all([
    q(
      `SELECT u.id, u.nome FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id
        WHERE p.nome='aprovador' AND u.activo AND u.id <> $1 ORDER BY u.nome`,
      [s.id]
    ),
    q(
      `SELECT d.*, u.nome AS para_nome FROM delegacoes_aprovacao d
         JOIN utilizadores u ON u.id=d.para_id
        WHERE d.de_id=$1 ORDER BY d.criado_em DESC LIMIT 30`,
      [s.id]
    ),
    q(
      `SELECT d.*, u.nome AS de_nome FROM delegacoes_aprovacao d
         JOIN utilizadores u ON u.id=d.de_id
        WHERE d.para_id=$1 ORDER BY d.criado_em DESC LIMIT 30`,
      [s.id]
    ),
  ]);

  const emUmaSemana = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  return (
    <>
      <div className="linha">
        <h1>Delegação de aprovação</h1>
        <Link href="/requisicoes" className="btn sec">Fila de aprovação</Link>
      </div>
      <p className="mut">
        Enquanto estiver ausente, outro aprovador pode decidir em seu nome. A decisão fica registada como sua,
        com o nome de quem a tomou.
      </p>

      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}
      {searchParams.ok && <p className="aviso">{OK[searchParams.ok] || "Guardado."}</p>}

      {s.perfil === "aprovador" && (
        <>
          <h2>Delegar a um colega</h2>
          <form action={delegarAprovacao} className="card inline">
            <select name="para_id" required aria-label="Delegar a">
              <option value="">Escolha o aprovador…</option>
              {colegas.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <label className="chek">
              até <input type="date" name="fim" defaultValue={emUmaSemana} aria-label="Até" />
            </label>
            <Btn className="pri">Delegar</Btn>
          </form>
        </>
      )}

      <h2>Delegações que dei</h2>
      <div className="card tabela">
        <table>
          <thead>
            <tr><th>Para</th><th>De</th><th>Até</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {dadas.length === 0 && <tr><td colSpan="5" className="mut">Ainda não delegou a ninguém.</td></tr>}
            {dadas.map((d) => (
              <tr key={d.id}>
                <td>{d.para_nome}</td>
                <td>{dt(d.inicio)}</td>
                <td>{dt(d.fim)}</td>
                <td>{d.cancelada_em ? "Cancelada" : ativa(d) ? "Activa" : new Date(d.fim) < new Date() ? "Terminada" : "Agendada"}</td>
                <td>
                  {!d.cancelada_em && new Date(d.fim) >= new Date() ? (
                    <form action={cancelarDelegacao} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="link">Cancelar</button>
                    </form>
                  ) : (
                    <span className="mut pequeno">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Delegações que recebi</h2>
      <div className="card tabela">
        <table>
          <thead>
            <tr><th>De</th><th>De</th><th>Até</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {recebidas.length === 0 && <tr><td colSpan="4" className="mut">Ninguém lhe delegou aprovações.</td></tr>}
            {recebidas.map((d) => (
              <tr key={d.id}>
                <td>{d.de_nome}</td>
                <td>{dt(d.inicio)}</td>
                <td>{dt(d.fim)}</td>
                <td>{d.cancelada_em ? "Cancelada" : ativa(d) ? "Activa" : new Date(d.fim) < new Date() ? "Terminada" : "Agendada"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
