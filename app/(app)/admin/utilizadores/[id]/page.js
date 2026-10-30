import Link from "next/link";
import { notFound } from "next/navigation";
import { exigir } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { actualizarUtilizador } from "@/app/actions";
import Btn from "@/components/Btn";

const ERROS = {
  dup: "Esse telefone ou email já está em uso.",
  dados: "Preencha nome e telefone válidos.",
  senha: "A nova senha deve ter pelo menos 8 caracteres, com letras e números.",
  proprio: "Não pode retirar o seu próprio perfil de administrador nem desactivar a sua conta.",
  ultimo: "Tem de existir pelo menos um administrador activo.",
};

export default async function EditarUtilizador({ params, searchParams }) {
  await exigir("admin");
  const id = Number(params.id);
  const [u, sites, areas, perfis, mestreSites] = await Promise.all([
    q1("SELECT u.*, p.nome AS perfil FROM utilizadores u JOIN perfis p ON p.id=u.perfil_id WHERE u.id=$1", [id]),
    q("SELECT id, nome FROM sites ORDER BY nome"),
    q("SELECT * FROM areas ORDER BY nome"),
    q("SELECT * FROM perfis ORDER BY id"),
    q("SELECT site_id FROM mestre_sites WHERE mestre_id=$1", [id]),
  ]);
  if (!u) notFound();
  const marcados = new Set(mestreSites.map((x) => String(x.site_id)));

  return (
    <>
      <div className="linha">
        <h1>Editar utilizador</h1>
        <Link href="/admin" className="btn sec">Voltar</Link>
      </div>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}

      <form action={actualizarUtilizador} className="card">
        <input type="hidden" name="id" value={u.id} />
        <label>Nome</label><input name="nome" defaultValue={u.nome} required />
        <label>Telefone (usado para entrar)</label><input name="telefone" inputMode="tel" defaultValue={u.telefone} required />
        <label>Email</label><input name="email" type="email" defaultValue={u.email || ""} />
        <label>Perfil</label>
        <select name="perfil" defaultValue={u.perfil}>{perfis.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}</select>
        <label>Área (mestres)</label>
        <select name="area_id" defaultValue={u.area_id || ""}><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
        <label>Sites do mestre (se nenhum, vê todos)</label>
        <div className="checks">
          {sites.map((x) => (
            <label key={x.id}>
              <input type="checkbox" name="sites" value={x.id} defaultChecked={marcados.has(String(x.id))} /> {x.nome}
            </label>
          ))}
        </div>
        <label>Nova senha (deixe em branco para manter)</label>
        <input name="senha" type="password" minLength="8" autoComplete="new-password" />
        <p className="mut pequeno">
          Ao definir uma senha nova, o utilizador é obrigado a mudá-la no próximo acesso e as sessões abertas são
          terminadas.
        </p>
        <label>
          <input type="checkbox" name="activo" defaultChecked={u.activo} /> Activo
        </label>
        <Btn className="pri">Guardar alterações</Btn>
      </form>
    </>
  );
}
