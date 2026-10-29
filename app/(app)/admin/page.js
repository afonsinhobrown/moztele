import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { criarUtilizador, criarSite, alternarUtilizador } from "@/app/actions";
import Btn from "@/components/Btn";

export default async function Admin({ searchParams }) {
  await exigir("admin");
  const [users, sites, areas, perfis] = await Promise.all([
    q("SELECT u.id,u.nome,u.telefone,u.activo,p.nome AS perfil FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id ORDER BY u.nome"),
    q("SELECT st.*, a.nome AS area FROM sites st JOIN areas a ON a.id=st.area_id ORDER BY st.nome"),
    q("SELECT * FROM areas ORDER BY nome"),
    q("SELECT * FROM perfis ORDER BY id"),
  ]);
  return (
    <>
      <h1>Administração</h1>
      {searchParams.erro === "dup" && <p className="erro">Esse telefone já existe.</p>}
      {searchParams.erro === "dados" && <p className="erro">Preencha nome, telefone e senha (mínimo 6 caracteres).</p>}

      <h2>Sites</h2>
      <form action={criarSite} className="card inline">
        <input name="nome" placeholder="Nome do site / obra" required />
        <input name="provincia" placeholder="Província" />
        <input name="cidade" placeholder="Cidade" />
        <select name="area_id">{areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
        <Btn className="pri">Adicionar site</Btn>
      </form>
      <div className="card"><ul>{sites.map((x) => <li key={x.id}>{x.nome} · {x.area} {x.cidade ? `· ${x.cidade}` : ""}</li>)}</ul></div>

      <h2>Utilizadores</h2>
      <form action={criarUtilizador} className="card">
        <label>Nome</label><input name="nome" required />
        <label>Telefone (usado para entrar)</label><input name="telefone" inputMode="tel" required />
        <label>Senha inicial</label><input name="senha" type="text" minLength="6" required />
        <label>Perfil</label>
        <select name="perfil">{perfis.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}</select>
        <label>Área (mestres)</label>
        <select name="area_id"><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
        <label>Sites do mestre (se nenhum, vê todos)</label>
        <div className="checks">{sites.map((x) => <label key={x.id}><input type="checkbox" name="sites" value={x.id} /> {x.nome}</label>)}</div>
        <Btn className="pri">Criar utilizador</Btn>
      </form>
      <div className="card tabela">
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th>Perfil</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td><td>{u.telefone}</td><td>{u.perfil}</td><td>{u.activo ? "sim" : "não"}</td>
                <td>
                  <Link href={`/admin/utilizadores/${u.id}`} className="link">Editar</Link>
                  {" · "}
                  <form action={alternarUtilizador} style={{ display: "inline" }}><input type="hidden" name="id" value={u.id} /><button className="link">{u.activo ? "Desactivar" : "Activar"}</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
