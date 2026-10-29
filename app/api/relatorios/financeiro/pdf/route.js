import { NextResponse } from "next/server";
import { sessao } from "@/lib/auth";
import { dadosRelatorioFinanceiro } from "@/lib/relatorios";
import {
  criarDocumento, texto, resumo, secao, tabela, finalizar, money,
} from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const nomeMes = (ym) => {
  const [ano, mes] = String(ym).split("-");
  return `${MESES[Number(mes) - 1]}/${ano}`;
};

export async function GET(req) {
  const s = await sessao();
  if (!s) return new NextResponse("Não autorizado", { status: 401 });
  if (!["admin", "financeiro"].includes(s.perfil))
    return new NextResponse("Sem permissão", { status: 403 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const d = await dadosRelatorioFinanceiro(sp);
  const f = d.filtros;
  const sub = f.de || f.ate ? `Período: ${f.de || "início"} a ${f.ate || "hoje"}` : "Todo o período";

  const st = await criarDocumento({ titulo: "Relatório financeiro", subtitulo: sub });

  resumo(st, [
    { rotulo: "Total financiado (enviado)", valor: money(d.totalEnviado) },
    { rotulo: "Total gasto em compras", valor: money(d.totalGasto) },
    { rotulo: "Saldo", valor: money(d.totalEnviado - d.totalGasto) },
  ]);

  secao(st, "Itens que mais consumiram dinheiro");
  if (d.itens.length === 0) texto(st, "Sem dados no período.");
  else
    tabela(st, {
      colunas: [
        { titulo: "Item", peso: 3 },
        { titulo: "Categoria", peso: 2 },
        { titulo: "Quantidade", peso: 1.1, align: "right" },
        { titulo: "Valor", peso: 1.5, align: "right" },
      ],
      linhas: d.itens.map((i) => [i.descricao, i.categoria, Number(i.quantidade), money(i.total)]),
    });

  secao(st, "Mestres que mais consumiram");
  if (d.mestres.length === 0) texto(st, "Sem dados no período.");
  else
    tabela(st, {
      colunas: [
        { titulo: "Mestre", peso: 3 },
        { titulo: "Financiado", peso: 1.6, align: "right" },
        { titulo: "Gasto", peso: 1.6, align: "right" },
        { titulo: "Saldo", peso: 1.6, align: "right" },
      ],
      linhas: d.mestres.map((m) => [m.nome, money(m.financiado), money(m.gasto), money(m.financiado - m.gasto)]),
    });

  secao(st, "Variação dos financiamentos por mês");
  if (d.meses.length === 0) texto(st, "Sem envios no período.");
  else
    tabela(st, {
      colunas: [
        { titulo: "Mês", peso: 1.5 },
        { titulo: "Nº de envios", peso: 1, align: "right" },
        { titulo: "Valor financiado", peso: 2, align: "right" },
      ],
      linhas: d.meses.map((m) => [nomeMes(m.mes), m.envios, money(m.total)]),
    });

  const pdf = await finalizar(st);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-financeiro.pdf"`,
    },
  });
}
