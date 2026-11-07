import Link from "next/link";
import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import {
  criarArea,
  renomearArea,
  apagarArea,
  criarCategoria,
  renomearCategoria,
  apagarCategoria,
} from "@/app/actions";
import Btn from "@/components/Btn";

const ERROS = {
  dados: "Preencha o nome.",
  dup: "Já existe uma linha com esse nome.",
  uso: "Não é possível apagar: está a ser usado por sites, utilizadores ou requisições.",
  upload: "Não foi possível guardar. Tente outra vez.",
};

const OK = {
  area: "Área guardada.",
  categoria: "Categoria guardada.",
};

export default async function Catalogos({ searchParams }) {
  await exigir("admin");
  const [areas, categorias] = await Promise.all([
    q(
      `SELECT a.*, (SELECT count(*)::int FROM sites s WHERE s.area_id=a.id) AS sites,
              (SELECT count(*)::int FROM utilizadores u WHERE u.area_id=a.id) AS utilizadores
         FROM areas a ORDER BY a.nome`
    ),
    q(
      `SELECT c.*,
              (SELECT count(*)::int FROM requisicao_itens i WHERE i.categoria_id=c.id) AS itens,
              (SELECT count(*)::int FROM inventario v WHERE v.categoria_id=c.id) AS stock
         FROM categorias c ORDER BY c.nome`
    ),
  ]);

  return (
    <>
      <div className="linha">
        <h1>Áreas e categorias</h1>
        <Link href="/admin" className="btn sec">Voltar à administração</Link>
      </div>
      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível guardar."}</p>}
      {searchParams.ok && <p className="aviso">{OK[searchParams.ok] || "Guardado."}</p>}

      <h2>Áreas</h2>
      <p className="mut pequeno">
        A área decide quem aprova: um aprovador com área definida só vê requisições dessa área.
      </p>
      <form action={criarArea} className="card inline">
        <input name="nome" placeholder="Nome da área" maxLength="80" required />
        <Btn className="pri">Criar área</Btn>
      </form>
      <div className="card tabela">
        <table>
          <thead>
            <tr><th>Nome</th><th>Sites</th><th>Utilizadores</th><th></th></tr>
          </thead>
          <tbody>
            {areas.map((a) => (
              <tr key={a.id}>
                <td>
                  <form action={renomearArea} className="inline">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="nome" defaultValue={a.nome} maxLength="80" required aria-label="Nome da área" />
                    <button className="link">Guardar</button>
                  </form>
                </td>
                <td>{a.sites}</td>
                <td>{a.utilizadores}</td>
                <td>
                  {a.sites === 0 && a.utilizadores === 0 ? (
                    <form action={apagarArea} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="link">Apagar</button>
                    </form>
                  ) : (
                    <span className="mut pequeno">em uso</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Categorias</h2>
      <p className="mut pequeno">
        Usadas nos itens da requisição, no inventário e nos favoritos. Apagar uma categoria não apaga histórico.
      </p>
      <form action={criarCategoria} className="card inline">
        <input name="nome" placeholder="Nome da categoria" maxLength="100" required />
        <Btn className="pri">Criar categoria</Btn>
      </form>
      <div className="card tabela">
        <table>
          <thead>
            <tr><th>Nome</th><th>Itens em requisições</th><th>Itens em stock</th><th></th></tr>
          </thead>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id}>
                <td>
                  <form action={renomearCategoria} className="inline">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="nome" defaultValue={c.nome} maxLength="100" required aria-label="Nome da categoria" />
                    <button className="link">Guardar</button>
                  </form>
                </td>
                <td>{c.itens}</td>
                <td>{c.stock}</td>
                <td>
                  {c.itens === 0 && c.stock === 0 ? (
                    <form action={apagarCategoria} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="link">Apagar</button>
                    </form>
                  ) : (
                    <span className="mut pequeno">em uso</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
