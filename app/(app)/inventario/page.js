import { exigir } from "@/lib/auth";
import { q } from "@/lib/db";
import { estadoStock, rotuloStock } from "@/lib/stock";
import { criarItemStock, registarMovimentoStock } from "@/app/actions";
import Btn from "@/components/Btn";

export const metadata = { title: "Inventário · Moz Teles" };

const ERROS = {
  permissao: "Não tem permissão para gerir stock neste site.",
  site: "Escolha um site a que tenha acesso.",
  dados: "Preencha os dados do item corretamente.",
  duplicado: "Já existe um item com esse nome neste site.",
  quantidade: "A quantidade tem de ser maior do que zero.",
  insuficiente: "Não há stock suficiente para essa saída.",
  tipo: "Tipo de movimento inválido.",
  item: "O item já não existe.",
  upload: "Não foi possível guardar. Tente novamente.",
};

const OK = {
  item: "Item criado no inventário.",
  movimento: "Movimento registado.",
};

const podeGerir = (perfil) => ["mestre", "financeiro", "admin"].includes(perfil);

export default async function Inventario({ searchParams }) {
  const s = await exigir();

  let sites;
  if (s.perfil === "mestre")
    sites = await q(
      `SELECT st.id, st.nome FROM sites st WHERE st.activo
        AND (EXISTS (SELECT 1 FROM mestre_sites ms WHERE ms.mestre_id=$1 AND ms.site_id=st.id)
             OR NOT EXISTS (SELECT 1 FROM mestre_sites WHERE mestre_id=$1))
        ORDER BY st.nome`,
      [s.id]
    );
  else if (s.perfil === "aprovador" && s.area_id)
    sites = await q("SELECT id, nome FROM sites WHERE activo AND area_id=$1 ORDER BY nome", [s.area_id]);
  else sites = await q("SELECT id, nome FROM sites WHERE activo ORDER BY nome");

  const siteIds = sites.map((x) => Number(x.id));
  const categorias = await q("SELECT id, nome FROM categorias ORDER BY nome");
  const filtroSite = searchParams.site && siteIds.includes(Number(searchParams.site)) ? Number(searchParams.site) : null;
  const procura = String(searchParams.q || "").trim().slice(0, 100);
  const soBaixo = searchParams.baixo === "1";

  const params = [siteIds];
  const where = ["i.activo", "i.site_id = ANY($1::bigint[])"];
  if (filtroSite) {
    params.push(filtroSite);
    where.push(`i.site_id = $${params.length}`);
  }
  if (procura) {
    params.push(`%${procura}%`);
    where.push(`i.descricao ILIKE $${params.length}`);
  }
  if (soBaixo) where.push("i.quantidade <= i.quantidade_minima AND i.quantidade_minima > 0");

  const itens = await q(
    `SELECT i.*, s.nome AS site, c.nome AS categoria
       FROM inventario i
       JOIN sites s ON s.id = i.site_id
       LEFT JOIN categorias c ON c.id = i.categoria_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.nome, i.descricao`,
    params
  );

  const movimentos = await q(
    `SELECT m.*, i.descricao, s.nome AS site, u.nome AS utilizador, r.codigo
       FROM movimentos_stock m
       JOIN inventario i ON i.id = m.inventario_id
       JOIN sites s ON s.id = i.site_id
       LEFT JOIN utilizadores u ON u.id = m.utilizador_id
       LEFT JOIN requisicoes r ON r.id = m.requisicao_id
      WHERE i.site_id = ANY($1::bigint[])
      ORDER BY m.criado_em DESC
      LIMIT 40`,
    [siteIds]
  );

  const baixos = itens.filter((i) => estadoStock(i.quantidade, i.quantidade_minima) !== "ok").length;
  const gerir = podeGerir(s.perfil);
  const linkFiltro = (mudancas) => {
    const sp = new URLSearchParams();
    const valores = { site: filtroSite || "", q: procura, baixo: soBaixo ? "1" : "", ...mudancas };
    for (const [k, v] of Object.entries(valores)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return `/inventario${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <div className="linha">
        <h1>Inventário</h1>
        <div className="acoes">
          <a href={linkFiltro({ baixo: soBaixo ? "" : "1" })} className={`btn ${soBaixo ? "pri" : "sec"}`}>
            {soBaixo ? "Ver todos" : `Abaixo do mínimo${baixos ? ` (${baixos})` : ""}`}
          </a>
        </div>
      </div>

      {searchParams.erro && <p className="erro">{ERROS[searchParams.erro] || "Não foi possível concluir."}</p>}
      {searchParams.ok && <p className="aviso">{OK[searchParams.ok] || "Guardado."}</p>}

      <form method="get" className="card filtros">
        <input name="q" defaultValue={procura} placeholder="Procurar material…" aria-label="Procurar material" />
        <select name="site" defaultValue={filtroSite || ""} aria-label="Site">
          <option value="">Todos os sites</option>
          {sites.map((x) => (
            <option key={x.id} value={x.id}>{x.nome}</option>
          ))}
        </select>
        {soBaixo && <input type="hidden" name="baixo" value="1" />}
        <button className="pri">Filtrar</button>
        <a href="/inventario" className="btn sec">Limpar</a>
      </form>

      <div className="card tabela">
        <table>
          <thead>
            <tr><th>Material</th><th>Site</th><th>Categoria</th><th>Quantidade</th><th>Mínimo</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {itens.length === 0 && <tr><td colSpan="6" className="mut">Ainda sem material registado.</td></tr>}
            {itens.map((i) => {
              const estado = estadoStock(i.quantidade, i.quantidade_minima);
              return (
                <tr key={i.id}>
                  <td>{i.descricao}</td>
                  <td>{i.site}</td>
                  <td>{i.categoria || "—"}</td>
                  <td><b>{Number(i.quantidade)}</b> {i.unidade}</td>
                  <td>{Number(i.quantidade_minima)}</td>
                  <td><span className={`stock ${estado}`}>{rotuloStock(estado)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {gerir && (
        <>
          <h2>Novo item</h2>
          <form action={criarItemStock} className="card">
            <label>Site</label>
            <select name="site_id" required>
              <option value="">Escolha…</option>
              {sites.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            <label>Descrição do material</label>
            <input name="descricao" placeholder="Ex.: Cabo de fibra 12 fibras" required />
            <div className="item">
              <input name="unidade" placeholder="Unidade (un, m, kg)" defaultValue="un" />
              <input name="quantidade" inputMode="decimal" placeholder="Quantidade inicial" />
              <input name="quantidade_minima" inputMode="decimal" placeholder="Mínimo" />
              <select name="categoria_id">
                <option value="">Categoria</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <Btn className="pri">Criar item</Btn>
          </form>

          <h2>Registar movimento</h2>
          <form action={registarMovimentoStock} className="card">
            <label>Item</label>
            <select name="item_id" required>
              <option value="">Escolha…</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.site} · {i.descricao} ({Number(i.quantidade)} {i.unidade})
                </option>
              ))}
            </select>
            <label>Tipo</label>
            <select name="tipo" defaultValue="entrada">
              <option value="entrada">Entrada (compra)</option>
              <option value="saida">Saída (consumo)</option>
              <option value="ajuste">Ajuste (contagem física)</option>
            </select>
            <label>Quantidade</label>
            <input name="quantidade" inputMode="decimal" required />
            <p className="mut pequeno">No ajuste, indique a quantidade contada (pode ser zero).</p>
            <label>Motivo (opcional)</label>
            <input name="motivo" placeholder="Ex.: material usado na obra X" />
            <Btn className="pri">Registar movimento</Btn>
          </form>
        </>
      )}

      <h2>Últimos movimentos</h2>
      <div className="card tabela">
        <table>
          <thead>
            <tr><th>Data</th><th>Material</th><th>Site</th><th>Tipo</th><th>Quantidade</th><th>Saldo</th><th>Quem</th><th>Requisição</th></tr>
          </thead>
          <tbody>
            {movimentos.length === 0 && <tr><td colSpan="8" className="mut">Sem movimentos.</td></tr>}
            {movimentos.map((m) => (
              <tr key={m.id}>
                <td>{new Date(m.criado_em).toLocaleString("pt-MZ", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>{m.descricao}</td>
                <td>{m.site}</td>
                <td>{m.tipo}</td>
                <td>{m.tipo === "ajuste" ? `contagem ${Number(m.quantidade)}` : `${m.tipo === "saida" ? "−" : "+"}${Number(m.quantidade)}`}</td>
                <td>{Number(m.saldo_apos)}</td>
                <td>{m.utilizador || "—"}</td>
                <td>{m.codigo || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
