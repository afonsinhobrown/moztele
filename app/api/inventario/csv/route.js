import { sessaoActiva } from "@/lib/auth";
import { dadosInventario } from "@/lib/inventario";
import { nomeCsv, paraCsv, respostaCsv } from "@/lib/csv";
import { rotuloStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export async function GET(req) {
  const s = await sessaoActiva();
  if (!s) return new Response("Não autorizado", { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { itens } = await dadosInventario(s, sp);

  const linhas = [
    ["Site", "Material", "Categoria", "Unidade", "Quantidade", "Mínimo", "Estado"],
    ...itens.map((i) => [
      i.site,
      i.descricao,
      i.categoria || "",
      i.unidade,
      num(i.quantidade),
      num(i.quantidade_minima),
      rotuloStock(i.estado),
    ]),
  ];

  const csv = paraCsv(
    [
      { titulo: "Site" },
      { titulo: "Material" },
      { titulo: "Categoria" },
      { titulo: "Unidade" },
      { titulo: "Quantidade" },
      { titulo: "Mínimo" },
      { titulo: "Estado" },
    ],
    linhas
  );

  return respostaCsv(csv, nomeCsv("inventario"));
}
