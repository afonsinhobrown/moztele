import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { criarUtilizador, criarSite, alternarUtilizador, criarFornecedor } from "@/app/actions";
import Btn from "@/components/Btn";

const ERROS = {
  dup: "Esse telefone ou email já existe.",
  dados: "Preencha nome, telefone e senha válidos.",
  senha: "A senha tem de ter pelo menos 8 caracteres, com letras e números.",
  proprio: "Não pode desactivar-se nem retirar o seu próprio perfil de administrador.",
  ultimo: "Tem de existir pelo menos um administrador activo.",
};

const OK = {
  utilizador: "Utilizador guardado.",
  site: "Site criado.",
  fornecedor: "Fornecedor criado.",
};

export default async function Admin({ searchParams }) {
  await exigir("admin");
  const [users, sites, areas, perfis, fornecedores] = await Promise.all([
    q("SELECT u.id,u.nome,u.telefone,u.activo,p.nome AS perfil FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id ORDER BY u.nome"),
    q("SELECT st.*, a.nome AS area FROM sites st JOIN areas a ON a.id=st.area_id ORDER BY st.nome"),
    q("SELECT * FROM areas ORDER BY nome"),
    q("SELECT * FROM perfis ORDER BY id"),
    q("SELECT * FROM fornecedores ORDER BY nome"),
  ]);
  return (
    <>
      <h1>Administração</h1>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}
      {searchParams.ok && <p className="aviso">{OK[searchParams.ok] || "Guardado."}</p>}

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
        <label>Telefone (usado para entrar)</label><input name="telefone" inputMode="tel" placeholder="84 000 0000" required />
        <label>Senha inicial</label><input name="senha" type="password" minLength="8" autoComplete="new-password" required />
        <p className="mut pequeno">A pessoa terá de mudar esta senha no primeiro acesso.</p>
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

      <h2>Fornecedores</h2>
      <form action={criarFornecedor} className="card inline">
        <input name="nome" placeholder="Nome do fornecedor" required />
        <input name="contacto" placeholder="Contacto" />
        <input name="nuit" placeholder="NUIT" />
        <Btn className="pri">Adicionar fornecedor</Btn>
      </form>
      <div className="card tabela">
        <table>
          <thead><tr><th>Fornecedor</th><th>Contacto</th><th>NUIT</th></tr></thead>
          <tbody>
            {fornecedores.length === 0 && <tr><td colSpan="3" className="mut">Ainda sem fornecedores (opcional).</td></tr>}
            {fornecedores.map((f) => (
              <tr key={f.id}><td>{f.nome}</td><td>{f.contacto || "—"}</td><td>{f.nuit || "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
