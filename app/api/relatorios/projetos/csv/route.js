import { sessaoActiva } from "@/lib/auth";
import { dadosRelatorioProjetos } from "@/lib/relatorios";
import { nomeCsv, paraCsv, respostaCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export async function GET(req) {
  const s = await sessaoActiva();
  if (!s) return new Response("Não autorizado", { status: 401 });
  if (!["admin", "financeiro", "aprovador"].includes(s.perfil))
    return new Response("Sem permissão", { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const rows = await dadosRelatorioProjetos(sp);

  const total = (campo) => rows.reduce((a, r) => a + Number(r[campo] || 0), 0);
  const saldo = total("transferido") - total("comprovado");

  const linhas = [];
  linhas.push(["Resumo", "", "", ""]);
  linhas.push(["Orçamento total (MZN)", money(total("orcamento_total")), "", ""]);
  linhas.push(["Solicitado (MZN)", money(total("solicitado")), "", ""]);
  linhas.push(["Aprovado (MZN)", money(total("aprovado")), "", ""]);
  linhas.push(["Transferido (MZN)", money(total("transferido")), "", ""]);
  linhas.push(["Comprovado (MZN)", money(total("comprovado")), "", ""]);
  linhas.push(["Saldo (MZN)", money(saldo), "", ""]);
  linhas.push(["", "", "", ""]);
  linhas.push([
    "Código",
    "Projeto",
    "Área",
    "Orçamento (MZN)",
    "Solicitado (MZN)",
    "Aprovado (MZN)",
    "Transferido (MZN)",
    "Comprovado (MZN)",
    "Saldo (MZN)",
    "Estado",
  ]);
  for (const r of rows)
    linhas.push([
      r.codigo,
      r.nome,
      r.area || "",
      money(r.orcamento_total),
      money(r.solicitado),
      money(r.aprovado),
      money(r.transferido),
      money(r.comprovado),
      money(Number(r.transferido) - Number(r.comprovado)),
      r.activo ? "Activo" : "Inactivo",
    ]);

  const csv = paraCsv(
    [
      { titulo: "Secção" },
      { titulo: "Descrição" },
      { titulo: "Valor" },
      { titulo: "Extra" },
      { titulo: "Extra 2" },
      { titulo: "Extra 3" },
      { titulo: "Extra 4" },
      { titulo: "Extra 5" },
      { titulo: "Extra 6" },
      { titulo: "Extra 7" },
    ],
    linhas
  );

  return respostaCsv(csv, nomeCsv("projetos"));
}
