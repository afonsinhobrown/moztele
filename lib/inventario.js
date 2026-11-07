import { q } from "@/lib/db";

// Sites que o utilizador pode ver no inventário (mestre: só os seus, aprovador: a sua área).
export async function sitesPermitidosInventario(s) {
  if (s.perfil === "mestre")
    return q(
      `SELECT st.id, st.nome FROM sites st WHERE st.activo
        AND (EXISTS (SELECT 1 FROM mestre_sites ms WHERE ms.mestre_id=$1 AND ms.site_id=st.id)
             OR NOT EXISTS (SELECT 1 FROM mestre_sites WHERE mestre_id=$1))
        ORDER BY st.nome`,
      [s.id]
    );
  if (s.perfil === "aprovador" && s.area_id)
    return q("SELECT id, nome FROM sites WHERE activo AND area_id=$1 ORDER BY nome", [s.area_id]);
  return q("SELECT id, nome FROM sites WHERE activo ORDER BY nome");
}

// Lista de inventário com os mesmos filtros do ecrã e da exportação.
export async function dadosInventario(s, searchParams = {}) {
  const sites = await sitesPermitidosInventario(s);
  const siteIds = sites.map((x) => Number(x.id));
  const pedidoSite = Number(searchParams.site);
  const filtroSite = searchParams.site && siteIds.includes(pedidoSite) ? pedidoSite : null;
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
  if (soBaixo)
    where.push(
      "(i.quantidade <= 0 OR (i.quantidade_minima > 0 AND i.quantidade <= i.quantidade_minima))"
    );

  const itens = await q(
    `SELECT i.*, s.nome AS site, c.nome AS categoria,
            CASE
              WHEN i.quantidade <= 0 THEN 'sem'
              WHEN i.quantidade_minima > 0 AND i.quantidade <= i.quantidade_minima THEN 'baixo'
              ELSE 'ok'
            END AS estado
       FROM inventario i
       JOIN sites s ON s.id = i.site_id
       LEFT JOIN categorias c ON c.id = i.categoria_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.nome, i.descricao`,
    params
  );

  return { sites, siteIds, itens, filtroSite, procura, soBaixo };
}
