import { sessaoActiva } from "@/lib/auth";
import { dadosRelatorioFinanceiro } from "@/lib/relatorios";
import { nomeCsv, paraCsv, respostaCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (v) => Number(v || 0).toFixed(2).replace(".", ",");

export async function GET(req) {
  const s = await sessaoActiva();
  if (!s) return new Response("Não autorizado", { status: 401 });
  if (!["admin", "financeiro"].includes(s.perfil)) return new Response("Sem permissão", { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const d = await dadosRelatorioFinanceiro(sp);
  const nomeMes = (ym) => {
    const [ano, mes] = String(ym).split("-");
    return `${String(mes).padStart(2, "0")}/${ano}`;
  };

  const linhas = [];
  linhas.push(["Resumo", "", "", ""]);
  linhas.push(["Total financiado (MZN)", money(d.totalEnviado), "", ""]);
  linhas.push(["Total gasto em compras (MZN)", money(d.totalGasto), "", ""]);
  linhas.push(["Saldo (MZN)", money(d.totalEnviado - d.totalGasto), "", ""]);
  linhas.push(["", "", "", ""]);
  linhas.push(["Mestres", "Financiado (MZN)", "Gasto (MZN)", "Saldo (MZN)", "Nº envios"]);
  for (const m of d.mestres) linhas.push([m.nome, money(m.financiado), money(m.gasto), money(m.financiado - m.gasto), ""]);
  linhas.push(["", "", "", "", ""]);
  linhas.push(["Itens", "Categoria", "Quantidade", "Valor (MZN)", ""]);
  for (const i of d.itens) linhas.push([i.descricao, i.categoria, Number(i.quantidade), money(i.total), ""]);
  linhas.push(["", "", "", "", ""]);
  linhas.push(["Mês", "Envios", "Valor financiado (MZN)", "", ""]);
  for (const m of d.meses) linhas.push([nomeMes(m.mes), m.envios, money(m.total), "", ""]);

  const csv = paraCsv(
    [
      { titulo: "Secção" },
      { titulo: "Descrição" },
      { titulo: "Valor" },
      { titulo: "Extra" },
      { titulo: "Extra 2" },
    ],
    linhas
  );

  return respostaCsv(csv, nomeCsv("financeiro"));
}
