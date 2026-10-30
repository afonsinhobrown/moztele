"use client";
import { useState } from "react";

const vazio = { d: "", qtd: 1, un: "un", pr: "", cat: "" };
const normalizar = (i) => ({
  d: i.descricao || "",
  qtd: i.quantidade ?? 1,
  un: i.unidade || "un",
  pr: i.preco_unitario ?? "",
  cat: i.categoria_id ? String(i.categoria_id) : "",
});

export default function ItensForm({ categorias, iniciais = [], favoritos = [] }) {
  const [rows, setRows] = useState(iniciais.length ? iniciais.map(normalizar) : [{ ...vazio }]);
  const [favSel, setFavSel] = useState("");
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = rows.reduce(
    (a, x) => a + (Number(x.qtd) || 0) * (Number(String(x.pr).replace(",", ".")) || 0),
    0
  );

  function adicionarFavorito() {
    const f = favoritos.find((x) => String(x.id) === String(favSel));
    if (!f) return;
    setRows((r) => [
      ...r,
      {
        d: f.descricao,
        qtd: 1,
        un: f.unidade || "un",
        pr: f.preco_unitario ?? "",
        cat: f.categoria_id ? String(f.categoria_id) : "",
      },
    ]);
    setFavSel("");
  }

  return (
    <div>
      {favoritos.length > 0 && (
        <div className="favoritos-form">
          <select value={favSel} onChange={(e) => setFavSel(e.target.value)} aria-label="Adicionar dos favoritos">
            <option value="">Adicionar dos favoritos…</option>
            {favoritos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.descricao}
                {f.preco_unitario ? ` · ${Number(f.preco_unitario)} MZN` : ""}
              </option>
            ))}
          </select>
          <button type="button" className="sec" disabled={!favSel} onClick={adicionarFavorito}>
            + Adicionar
          </button>
        </div>
      )}
      {rows.map((x, i) => (
        <div className="item" key={i}>
          <input name="descricao" placeholder="Equipamento / material" value={x.d} onChange={(e) => set(i, "d", e.target.value)} />
          <select name="categoria_id" value={x.cat} onChange={(e) => set(i, "cat", e.target.value)}>
            <option value="">Categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <input name="quantidade" type="number" step="0.01" min="0.01" placeholder="Qtd" value={x.qtd} onChange={(e) => set(i, "qtd", e.target.value)} />
          <input name="unidade" placeholder="Un." value={x.un} onChange={(e) => set(i, "un", e.target.value)} />
          <input name="preco" inputMode="decimal" placeholder="Preço unit. (MZN)" value={x.pr} onChange={(e) => set(i, "pr", e.target.value)} />
          <button type="button" className="link" disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="sec" onClick={() => setRows((r) => [...r, { ...vazio }])}>+ Adicionar item</button>
      <p className="total">
        Total estimado:{" "}
        <b>{new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN" }).format(total)}</b>
      </p>
    </div>
  );
}
